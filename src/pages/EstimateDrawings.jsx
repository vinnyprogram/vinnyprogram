import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// ── Constants ─────────────────────────────────────────────────────────────────
const AREA_TYPES = [
  "Roof Rafter w/ Strapping","Roof Rafter behind knee walls","Floor",
  "Exterior Wall","Demising Wall","Rim Joist","Concrete Wall",
  "Ceiling","Interior Walls","Fire Blocking","Other",
];

// Roof pitch multipliers (horizontal sqft → actual rafter sqft)
const PITCH_FACTORS = {
  "Flat":1,"2:12":1.014,"3:12":1.031,"4:12":1.054,"5:12":1.083,
  "6:12":1.118,"7:12":1.158,"8:12":1.202,"9:12":1.250,"10:12":1.302,"12:12":1.414,
};

const C = {
  ink:"#0f172a",white:"#fff",muted:"#64748b",faint:"#94a3b8",
  border:"#e2e8f0",green:"#059669",bg:"#f4f5f7",blue:"#3b82f6",purple:"#7c3aed",
};

function fmt(n){ return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:1}); }

// Shoelace formula → pixel²
function shoelace(pts){
  let a=0;
  for(let i=0;i<pts.length;i++){
    const j=(i+1)%pts.length;
    a+=pts[i].x*pts[j].y - pts[j].x*pts[i].y;
  }
  return Math.abs(a)/2;
}

const COLORS=["#3b82f6","#059669","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16"];

// ── Main ──────────────────────────────────────────────────────────────────────
export default function EstimateDrawings(){
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { company } = useAuth();

  // PDF state
  const [pdfDoc, setPdfDoc]             = useState(null);
  const [totalPages, setTotalPages]     = useState(0);
  const [currentPage, setCurrentPage]   = useState(1);
  const [pdfLoading, setPdfLoading]     = useState(false);
  const [pageNames, setPageNames]       = useState({});       // {1:"Attic"}

  // Calibration — stored in localStorage per project, loaded on mount
  const [calibrations, setCalibrations] = useState({});       // {pageNum:{pixPerFoot,p1,p2}}
  const [calibMode, setCalibMode]       = useState(false);
  const [calibClicks, setCalibClicks]   = useState([]);
  const [showCalibInput, setShowCalibInput] = useState(false);
  const [calibDistInput, setCalibDistInput] = useState("");

  // Tracing
  const [traceMode, setTraceMode]       = useState(false);
  const [currentPoly, setCurrentPoly]   = useState([]);
  const [hoverPt, setHoverPt]           = useState(null);
  const [selAreaType, setSelAreaType]   = useState(AREA_TYPES[0]);
  const [selFloor, setSelFloor]         = useState("");
  const [selPitch, setSelPitch]         = useState("Flat");

  // Project floors (name → id map, loaded from DB)
  const [floorMap, setFloorMap]         = useState({});       // {name: floor_id}
  const [floorNames, setFloorNames]     = useState([]);

  // Areas already added this session (just for on-screen feedback)
  const [addedAreas, setAddedAreas]     = useState([]);       // [{areaType,floor,sqft}]
  const [adding, setAdding]             = useState(false);

  // Canvas
  const pdfCanvasRef  = useRef(null);
  const drawCanvasRef = useRef(null);

  const isNewProject = !projectId || projectId === "new";
  const DRAFT_KEY = "drawing_draft";
  const CALIB_KEY = `drawing_calib_${projectId||"new"}`;

  // Load floors from DB + calibration from localStorage
  useEffect(()=>{
    if(!projectId || projectId === "new") {
      // New project mode — use default floor names, no DB needed
      setFloorNames(DEFAULT_FLOORS);
      setSelFloor(DEFAULT_FLOORS[0]);
    } else {
      supabase.from("floors").select("id,name").eq("project_id",projectId).order("order_index")
        .then(({data})=>{
          if(data?.length){
            const map={};
            data.forEach(f=>map[f.name]=f.id);
            setFloorMap(map);
            setFloorNames(data.map(f=>f.name));
            setSelFloor(data[0].name);
          }
        });
    }
    // Calibration from localStorage (always)
    try{
      const saved=JSON.parse(localStorage.getItem(CALIB_KEY)||"{}");
      setCalibrations(saved);
    }catch(e){}
  },[projectId]);

  // Persist calibrations to localStorage whenever they change
  useEffect(()=>{
    if(!projectId||!Object.keys(calibrations).length) return;
    localStorage.setItem(CALIB_KEY, JSON.stringify(calibrations));
  },[calibrations]);

  // Load PDF.js from CDN
  async function getPdfjs(){
    if(window.pdfjsLib) return window.pdfjsLib;
    return new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload=()=>{
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        res(window.pdfjsLib);
      };
      s.onerror=rej;
      document.head.appendChild(s);
    });
  }

  async function handleUpload(e){
    const file=e.target.files?.[0];
    if(!file) return;
    setPdfLoading(true);
    try{
      const lib=await getPdfjs();
      const buf=await file.arrayBuffer();
      const doc=await lib.getDocument({data:buf}).promise;
      setPdfDoc(doc); setTotalPages(doc.numPages); setCurrentPage(1);
    }catch(err){ alert("Could not load PDF: "+err.message); }
    setPdfLoading(false);
    e.target.value="";
  }

  // Render PDF page
  useEffect(()=>{
    if(!pdfDoc) return;
    renderPage(currentPage);
    setCurrentPoly([]); setCalibClicks([]); setShowCalibInput(false);
    setCalibMode(false); setTraceMode(false);
  },[pdfDoc,currentPage]);

  async function renderPage(n){
    if(!pdfDoc||!pdfCanvasRef.current) return;
    const page=await pdfDoc.getPage(n);
    const w=(pdfCanvasRef.current.parentElement?.clientWidth||800)-2;
    const vp=page.getViewport({scale:w/page.getViewport({scale:1}).width});
    const cv=pdfCanvasRef.current;
    cv.width=vp.width; cv.height=vp.height;
    await page.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise;
    if(drawCanvasRef.current){
      drawCanvasRef.current.width=vp.width;
      drawCanvasRef.current.height=vp.height;
    }
    redraw();
  }

  // Redraw overlay whenever state changes
  useEffect(()=>{ redraw(); },[addedAreas,currentPoly,hoverPt,calibClicks,calibrations,currentPage]);

  function redraw(){
    const cv=drawCanvasRef.current;
    if(!cv) return;
    const ctx=cv.getContext("2d");
    ctx.clearRect(0,0,cv.width,cv.height);
    // Completed polygons for this page (from addedAreas that track their points)
    addedAreas.filter(a=>a.page===currentPage&&a.points).forEach((a,i)=>{
      const col=COLORS[i%COLORS.length];
      ctx.beginPath();
      ctx.moveTo(a.points[0].x,a.points[0].y);
      a.points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.fillStyle=col+"33"; ctx.fill();
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.stroke();
      const cx=a.points.reduce((s,p)=>s+p.x,0)/a.points.length;
      const cy=a.points.reduce((s,p)=>s+p.y,0)/a.points.length;
      ctx.font="bold 11px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillStyle="#fff"; ctx.fillText(a.areaType,cx,cy-7);
      ctx.fillStyle=col; ctx.fillText(fmt(a.sqft)+" ft²",cx,cy+7);
    });
    // Calibration
    const calib=calibrations[currentPage];
    if(calib?.p1&&calib?.p2){
      ctx.beginPath(); ctx.moveTo(calib.p1.x,calib.p1.y); ctx.lineTo(calib.p2.x,calib.p2.y);
      ctx.strokeStyle="#ef4444"; ctx.lineWidth=2; ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);
      dot(ctx,calib.p1,"#ef4444"); dot(ctx,calib.p2,"#ef4444");
    }
    calibClicks.forEach(p=>dot(ctx,p,"#ef4444"));
    if(calibClicks.length===2){
      ctx.beginPath(); ctx.moveTo(calibClicks[0].x,calibClicks[0].y); ctx.lineTo(calibClicks[1].x,calibClicks[1].y);
      ctx.strokeStyle="#ef4444"; ctx.lineWidth=2; ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);
    }
    // Polygon in progress
    if(currentPoly.length>0){
      ctx.beginPath(); ctx.moveTo(currentPoly[0].x,currentPoly[0].y);
      currentPoly.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      if(hoverPt) ctx.lineTo(hoverPt.x,hoverPt.y);
      ctx.strokeStyle=C.purple; ctx.lineWidth=2; ctx.stroke();
      currentPoly.forEach(p=>dot(ctx,p,C.purple));
      if(currentPoly.length>=3&&hoverPt){
        const d=Math.hypot(hoverPt.x-currentPoly[0].x,hoverPt.y-currentPoly[0].y);
        if(d<18){ ctx.beginPath(); ctx.arc(currentPoly[0].x,currentPoly[0].y,14,0,Math.PI*2); ctx.fillStyle="#7c3aed33"; ctx.fill(); }
      }
    }
  }

  function dot(ctx,p,col){
    ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2);
    ctx.fillStyle=col; ctx.fill();
    ctx.strokeStyle="#fff"; ctx.lineWidth=1.5; ctx.stroke();
  }

  function getCanvasPt(e){
    const cv=drawCanvasRef.current;
    const rect=cv.getBoundingClientRect();
    const sx=cv.width/rect.width, sy=cv.height/rect.height;
    const cl=e.touches?.[0]||e;
    return {x:(cl.clientX-rect.left)*sx, y:(cl.clientY-rect.top)*sy};
  }

  function handleClick(e){
    const pt=getCanvasPt(e);
    if(calibMode){
      const next=[...calibClicks,pt];
      setCalibClicks(next);
      if(next.length===2) setShowCalibInput(true);
      return;
    }
    if(traceMode){
      if(currentPoly.length>=3){
        const d=Math.hypot(pt.x-currentPoly[0].x,pt.y-currentPoly[0].y);
        if(d<18){ finishPolygon(); return; }
      }
      setCurrentPoly(prev=>[...prev,pt]);
    }
  }

  function applyCalibration(){
    const dist=parseFloat(calibDistInput);
    if(!dist||dist<=0){ alert("Enter a valid distance in feet."); return; }
    const px=Math.hypot(calibClicks[1].x-calibClicks[0].x,calibClicks[1].y-calibClicks[0].y);
    setCalibrations(prev=>({...prev,[currentPage]:{pixPerFoot:px/dist,p1:calibClicks[0],p2:calibClicks[1]}}));
    setCalibClicks([]); setCalibDistInput(""); setShowCalibInput(false); setCalibMode(false);
  }

  async function finishPolygon(){
    const calib=calibrations[currentPage];
    if(!calib?.pixPerFoot){ alert("Calibrate the scale first."); return; }
    if(currentPoly.length<3){ alert("Need at least 3 points to close a shape."); return; }
    const pitchFactor=PITCH_FACTORS[selPitch]||1;
    const sqft=Math.round(shoelace(currentPoly)/(calib.pixPerFoot**2)*pitchFactor*10)/10;
    const newArea = {
      page:currentPage, areaType:selAreaType, floor:selFloor,
      sqft, points:[...currentPoly], pitch:pitchFactor,
    };

    if(isNewProject){
      // No project yet — save to localStorage draft, carry into estimate later
      const existing = JSON.parse(localStorage.getItem(DRAFT_KEY)||"[]");
      localStorage.setItem(DRAFT_KEY, JSON.stringify([...existing, newArea]));
      setAddedAreas(prev=>[...prev, newArea]);
      setCurrentPoly([]); setHoverPt(null);
      return;
    }

    // Existing project — save directly to areas table
    const floorId=floorMap[selFloor];
    if(!floorId){ alert(`Floor "${selFloor}" not found. Save the estimate first with at least one floor.`); return; }
    setAdding(true);
    try{
      const {data:{user}}=await supabase.auth.getUser();
      const {data:cd}=await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      await supabase.from("areas").insert([{
        project_id:projectId, floor_id:floorId, company_id:cd?.id,
        area_type:selAreaType, sqft, order_index:Date.now(),
        material:null, r_value:null, thickness_in:null,
        options:[], paint_sqft:0, deduct_sqft:0,
      }]);
      setAddedAreas(prev=>[...prev, newArea]);
      setCurrentPoly([]); setHoverPt(null);
    }catch(err){ alert("Error saving area: "+err.message); }
    setAdding(false);
  }

  const calib=calibrations[currentPage];
  const pageName=pageNames[currentPage]||`Page ${currentPage}`;

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>

      {/* HEADER */}
      <div style={{background:C.ink,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        <button onClick={()=>navigate(projectId?`/project/${projectId}`:"/estimates/search")}
          style={{border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← Back to Estimate
        </button>
        <span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1}}>📐 Measure from Drawing</span>
        <label style={{background:C.blue,color:"#fff",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600}}>
          📄 Upload PDF
          <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
        </label>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>

        {/* CANVAS AREA */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Page tabs */}
          {pdfDoc&&(
            <div style={{display:"flex",gap:4,padding:"6px 10px",background:C.white,borderBottom:`1px solid ${C.border}`,overflowX:"auto",flexShrink:0}}>
              {Array.from({length:totalPages},(_,i)=>i+1).map(pg=>(
                <button key={pg} onClick={()=>setCurrentPage(pg)}
                  style={{border:`1px solid ${currentPage===pg?"#3b82f6":C.border}`,
                    background:currentPage===pg?"#eff6ff":C.white,
                    color:currentPage===pg?"#1d4ed8":C.muted,
                    padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,
                    fontWeight:currentPage===pg?700:400,whiteSpace:"nowrap",flexShrink:0}}>
                  <div>{pageNames[pg]||`Page ${pg}`}</div>
                  <div style={{fontSize:9,color:calibrations[pg]?"#059669":"#f59e0b"}}>
                    {calibrations[pg]?"✓ calibrated":"needs scale"}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Page name + scale status bar */}
          {pdfDoc&&(
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",background:"#f8fafc",borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap"}}>
              <input value={pageName} onChange={e=>setPageNames(p=>({...p,[currentPage]:e.target.value}))}
                placeholder="Name this page (e.g. Attic)" style={{height:26,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 8px",fontSize:12,width:160}}/>
              <span style={{fontSize:11,fontWeight:600,color:calib?"#059669":"#ef4444"}}>
                {calib?`✓ Scale: 1 ft = ${calib.pixPerFoot.toFixed(1)}px`:"⚠ No scale — calibrate first"}
              </span>
            </div>
          )}

          {/* Toolbar */}
          {pdfDoc&&(
            <div style={{display:"flex",gap:6,padding:"6px 10px",background:C.white,borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap",alignItems:"center"}}>
              {/* Calibrate button */}
              <button onClick={()=>{
                  if(calibMode){setCalibMode(false);setCalibClicks([]);setShowCalibInput(false);}
                  else{setCalibMode(true);setTraceMode(false);setCurrentPoly([]);setCalibClicks([]);setShowCalibInput(false);}
                }}
                style={{border:`1px solid ${calibMode?"#ef4444":C.border}`,
                  background:calibMode?"#fef2f2":C.white,color:calibMode?"#ef4444":C.muted,
                  padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:calibMode?700:400}}>
                📏 {calibMode?"Cancel":"Calibrate Scale"}
              </button>

              {/* Trace button */}
              {!calibMode&&(
                <button onClick={()=>{setTraceMode(p=>!p);setCurrentPoly([]);setHoverPt(null);}}
                  style={{border:`1px solid ${traceMode?"#7c3aed":C.border}`,
                    background:traceMode?"#f5f3ff":C.white,color:traceMode?"#7c3aed":C.muted,
                    padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:traceMode?700:400}}>
                  ✏️ {traceMode?"Stop Tracing":"Trace Area"}
                </button>
              )}

              {/* Undo / close while tracing */}
              {traceMode&&currentPoly.length>0&&(<>
                <button onClick={()=>setCurrentPoly(p=>p.slice(0,-1))}
                  style={{border:`1px solid ${C.border}`,background:"#fffbeb",color:"#92400e",padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>
                  ↩ Undo
                </button>
                {currentPoly.length>=3&&(
                  <button onClick={finishPolygon} disabled={adding}
                    style={{border:"none",background:C.purple,color:"#fff",padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>
                    {adding?"Saving…":"✓ Close & Add to Estimate"}
                  </button>
                )}
              </>)}

              {/* Area type / floor / pitch selectors — visible while tracing */}
              {traceMode&&(
                <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                  <select value={selAreaType} onChange={e=>setSelAreaType(e.target.value)}
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    {AREA_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                  <select value={selFloor} onChange={e=>setSelFloor(e.target.value)}
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    {floorNames.map(f=><option key={f}>{f}</option>)}
                  </select>
                  <select value={selPitch} onChange={e=>setSelPitch(e.target.value)}
                    title="Roof pitch multiplier (only for rafter areas)"
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    {Object.keys(PITCH_FACTORS).map(k=><option key={k}>{k}</option>)}
                  </select>
                  <span style={{fontSize:10,color:C.faint}}>pitch</span>
                </div>
              )}
            </div>
          )}

          {/* Calibration distance input — appears after 2 clicks */}
          {showCalibInput&&(
            <div style={{background:"#fef2f2",borderBottom:`1px solid #fecaca`,padding:"8px 14px",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#991b1b",fontWeight:600}}>Two points selected. Real distance between them:</span>
              <input type="number" value={calibDistInput} onChange={e=>setCalibDistInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&applyCalibration()}
                placeholder="e.g. 24" autoFocus
                style={{height:30,width:80,border:"1px solid #fca5a5",borderRadius:5,padding:"0 8px",fontSize:13,fontWeight:700}}/>
              <span style={{fontSize:12,color:"#991b1b"}}>feet</span>
              <button onClick={applyCalibration}
                style={{border:"none",background:"#ef4444",color:"#fff",padding:"5px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>
                Set Scale
              </button>
              <button onClick={()=>{setCalibClicks([]);setCalibDistInput("");setShowCalibInput(false);setCalibMode(false);}}
                style={{border:`1px solid ${C.border}`,background:C.white,color:C.muted,padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>
                Cancel
              </button>
            </div>
          )}

          {/* Canvas */}
          <div style={{flex:1,overflow:"auto",padding:10}}>
            {!pdfDoc&&!pdfLoading&&(
              <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                height:"100%",minHeight:360,border:"2px dashed #cbd5e1",borderRadius:12,cursor:"pointer",color:C.faint,gap:10}}>
                <div style={{fontSize:52}}>📄</div>
                <div style={{fontSize:16,fontWeight:600,color:C.muted}}>Upload a PDF floor plan</div>
                <div style={{fontSize:12}}>Multi-page PDFs supported · Calibrate scale · Trace areas · Saves directly to estimate</div>
                <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
              </label>
            )}
            {pdfLoading&&<div style={{textAlign:"center",padding:60,color:C.muted,fontSize:14}}>⏳ Loading PDF…</div>}
            {pdfDoc&&(
              <div style={{position:"relative",display:"inline-block",maxWidth:"100%",userSelect:"none"}}>
                <canvas ref={pdfCanvasRef} style={{display:"block",maxWidth:"100%"}}/>
                <canvas ref={drawCanvasRef}
                  onClick={handleClick}
                  onMouseMove={e=>{ if(traceMode&&currentPoly.length>0) setHoverPt(getCanvasPt(e)); }}
                  onTouchEnd={e=>{e.preventDefault();handleClick(e);}}
                  style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",
                    cursor:calibMode||traceMode?"crosshair":"default",touchAction:"none"}}/>
              </div>
            )}
          </div>

          {/* Instruction bar */}
          {pdfDoc&&(
            <div style={{background:"#f0f9ff",borderTop:`1px solid #bae6fd`,padding:"6px 14px",fontSize:11,color:"#0369a1",flexShrink:0}}>
              {calibMode&&!showCalibInput&&calibClicks.length===0&&"📏 Click the FIRST point of a known line on the drawing (e.g. one end of a dimension line)."}
              {calibMode&&!showCalibInput&&calibClicks.length===1&&"📏 Click the SECOND point, then enter the real distance in feet."}
              {!calibMode&&!traceMode&&calib&&"✓ Scale set. Click ✏️ Trace Area — then click vertices around a space. Click near the first point to close and add to estimate."}
              {!calibMode&&!traceMode&&!calib&&"Start with 📏 Calibrate Scale — click two points on a known measurement on the drawing and enter the real distance."}
              {traceMode&&currentPoly.length===0&&"Click the first corner of the area to start tracing."}
              {traceMode&&currentPoly.length>0&&currentPoly.length<3&&`${currentPoly.length} point${currentPoly.length>1?"s":""}. Keep clicking corners.`}
              {traceMode&&currentPoly.length>=3&&"Click near the first point (blue dot snaps) or ✓ Close to finish. Area saves directly to the estimate."}
            </div>
          )}
        </div>

        {/* RIGHT PANEL — added areas */}
        <div style={{width:240,background:C.white,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
            Added to Estimate
            {addedAreas.length>0&&(
              <span style={{background:"#059669",color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11}}>{addedAreas.length}</span>
            )}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
            {addedAreas.length===0&&(
              <div style={{color:C.faint,fontSize:11,textAlign:"center",padding:"24px 8px",lineHeight:1.8}}>
                No areas added yet.<br/>
                <span style={{fontSize:10}}>
                  1. Upload PDF<br/>
                  2. Calibrate scale<br/>
                  3. Trace areas<br/>
                  4. Goes straight to estimate
                </span>
              </div>
            )}
            {addedAreas.map((a,i)=>(
              <div key={i} style={{background:"#f0fdf4",borderRadius:8,border:"1px solid #86efac",
                borderLeft:`3px solid ${COLORS[i%COLORS.length]}`,padding:"8px 10px",marginBottom:6}}>
                <div style={{fontSize:12,fontWeight:700,color:C.ink}}>{a.areaType}</div>
                <div style={{fontSize:10,color:C.muted}}>{a.floor} · Page {a.page}{a.pitch>1?` · ×${a.pitch} pitch`:""}</div>
                <div style={{fontSize:14,fontWeight:800,color:"#059669",marginTop:2}}>{fmt(a.sqft)} ft²</div>
                <div style={{fontSize:10,color:"#059669",marginTop:2}}>✓ Saved to estimate</div>
              </div>
            ))}
          </div>
          {addedAreas.length>0&&(
            <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:8}}>
                Total: <b>{fmt(addedAreas.reduce((s,a)=>s+(a.sqft||0),0))} ft²</b> across {addedAreas.length} area{addedAreas.length>1?"s":""}
              </div>
              {isNewProject ? (
                <>
                  <button onClick={()=>navigate("/job/new?from_drawing=1")}
                    style={{width:"100%",background:"#7c3aed",color:"#fff",border:"none",
                      padding:"11px",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:800,marginBottom:6}}>
                    Start Estimate →
                  </button>
                  <div style={{fontSize:10,color:C.faint,textAlign:"center"}}>
                    Select the customer, then your measurements will auto-fill the estimate
                  </div>
                </>
              ) : (
                <>
                  <button onClick={()=>navigate(`/project/${projectId}`)}
                    style={{width:"100%",background:C.ink,color:"#fff",border:"none",
                      padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700}}>
                    ← Back to Estimate
                  </button>
                  <div style={{fontSize:10,color:C.faint,marginTop:6,textAlign:"center"}}>
                    Open each area card and set material + R-value
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
