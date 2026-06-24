import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const AREA_TYPES = [
  "Roof Rafter w/ Strapping","Roof Rafter behind knee walls","Floor",
  "Exterior Wall","Demising Wall","Rim Joist","Concrete Wall",
  "Ceiling","Interior Walls","Fire Blocking","Other",
];
const THICK_OPTS = ["2x4","2x6","2x8","2x10","2x12","I-joist 14in","I-joist 16in","I-joist 18in"];
const PITCH_FACTORS = {
  "Flat":1,"2:12":1.014,"3:12":1.031,"4:12":1.054,"5:12":1.083,
  "6:12":1.118,"7:12":1.158,"8:12":1.202,"9:12":1.250,"10:12":1.302,"12:12":1.414,
};
const DEFAULT_FLOORS = ["Floor","1st","2nd","3rd","Basement","Crawlspace","Garage"];
const COLORS = ["#3b82f6","#059669","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16"];

const C = {
  ink:"#0f172a",white:"#fff",muted:"#64748b",faint:"#94a3b8",
  border:"#e2e8f0",green:"#059669",bg:"#f4f5f7",purple:"#7c3aed",
};
const I = {height:32,fontSize:12,borderRadius:6,border:`1px solid ${C.border}`,
  background:C.white,padding:"0 8px",boxSizing:"border-box",color:C.ink,outline:"none"};

function fmt(n){ return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:1}); }
function shoelace(pts){
  let a=0;
  for(let i=0;i<pts.length;i++){
    const j=(i+1)%pts.length;
    a+=pts[i].x*pts[j].y - pts[j].x*pts[i].y;
  }
  return Math.abs(a)/2;
}

export default function EstimateDrawings(){
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { company } = useAuth();
  const isNew = !projectId || projectId==="new";

  // PDF
  const [pdfDoc, setPdfDoc]           = useState(null);
  const [totalPages, setTotalPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfLoading, setPdfLoading]   = useState(false);
  const [pageNames, setPageNames]     = useState({});
  const pdfRef  = useRef(null);
  const overRef = useRef(null);

  // Calibration stored in localStorage per project
  const calibKey = `cal_${projectId||"new"}`;
  const [calibrations, setCalibrations] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem(`cal_${projectId||"new"}`)||"{}"); }catch(e){ return {}; }
  });
  const [calibMode, setCalibMode]     = useState(false);
  const [calibClicks, setCalibClicks] = useState([]);
  const [showDistInput, setShowDistInput] = useState(false);
  const [distInput, setDistInput]     = useState("");

  // Tracing
  const [traceMode, setTraceMode]     = useState(false);
  const [poly, setPoly]               = useState([]);
  const [hover, setHover]             = useState(null);
  const [selType, setSelType]         = useState(AREA_TYPES[0]);
  const [selFloor, setSelFloor]       = useState(DEFAULT_FLOORS[0]);
  const [selThick, setSelThick]       = useState("");
  const [selPitch, setSelPitch]       = useState("Flat");

  // Floors from DB (existing project)
  const [floorMap, setFloorMap]       = useState({});
  const [floors, setFloors]           = useState(DEFAULT_FLOORS);

  // Completed areas this session
  const [areas, setAreas]             = useState([]);
  const [saving, setSaving]           = useState(false);

  const DRAFT = "drawing_draft";

  // Load floors for existing project
  useEffect(()=>{
    if(isNew) return;
    supabase.from("floors").select("id,name").eq("project_id",projectId).order("order_index")
      .then(({data})=>{
        if(data?.length){
          const m={}; data.forEach(f=>m[f.name]=f.id);
          setFloorMap(m);
          setFloors(data.map(f=>f.name));
          setSelFloor(data[0].name);
        }
      });
  },[projectId]);

  // Persist calibrations
  useEffect(()=>{
    if(Object.keys(calibrations).length)
      localStorage.setItem(calibKey, JSON.stringify(calibrations));
  },[calibrations]);

  // Load PDF.js
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
      s.onerror=rej; document.head.appendChild(s);
    });
  }

  async function handleUpload(e){
    const file=e.target.files?.[0]; if(!file) return;
    setPdfLoading(true);
    try{
      const lib=await getPdfjs();
      const doc=await lib.getDocument({data:await file.arrayBuffer()}).promise;
      setPdfDoc(doc); setTotalPages(doc.numPages); setCurrentPage(1);
    }catch(err){ alert("Could not load PDF: "+err.message); }
    setPdfLoading(false); e.target.value="";
  }

  useEffect(()=>{ if(pdfDoc) renderPage(currentPage); },[pdfDoc,currentPage]);

  async function renderPage(n){
    if(!pdfDoc||!pdfRef.current) return;
    const page=await pdfDoc.getPage(n);
    const w=Math.min((pdfRef.current.parentElement?.clientWidth||800)-4,1400);
    const base=page.getViewport({scale:1});
    const vp=page.getViewport({scale:w/base.width});
    pdfRef.current.width=vp.width; pdfRef.current.height=vp.height;
    await page.render({canvasContext:pdfRef.current.getContext("2d"),viewport:vp}).promise;
    if(overRef.current){ overRef.current.width=vp.width; overRef.current.height=vp.height; }
    redraw();
  }

  useEffect(()=>redraw(),[areas,poly,hover,calibClicks,calibrations,currentPage]);

  function redraw(){
    const cv=overRef.current; if(!cv) return;
    const ctx=cv.getContext("2d"); ctx.clearRect(0,0,cv.width,cv.height);

    // Completed areas for this page
    areas.filter(a=>a.page===currentPage).forEach((a,i)=>{
      if(!a.pts?.length) return;
      const col=COLORS[i%COLORS.length];
      ctx.beginPath(); ctx.moveTo(a.pts[0].x,a.pts[0].y);
      a.pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.closePath();
      ctx.fillStyle=col+"30"; ctx.fill();
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.stroke();
      const cx=a.pts.reduce((s,p)=>s+p.x,0)/a.pts.length;
      const cy=a.pts.reduce((s,p)=>s+p.y,0)/a.pts.length;
      ctx.font="bold 12px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillStyle="#fff"; ctx.fillText(a.areaType,cx,cy-8);
      ctx.fillStyle=col; ctx.fillText(fmt(a.sqft)+" ft²",cx,cy+8);
    });

    // Calibration line
    const cal=calibrations[currentPage];
    if(cal?.p1&&cal?.p2){
      ctx.beginPath(); ctx.moveTo(cal.p1.x,cal.p1.y); ctx.lineTo(cal.p2.x,cal.p2.y);
      ctx.strokeStyle="#ef4444"; ctx.lineWidth=2; ctx.setLineDash([6,3]); ctx.stroke(); ctx.setLineDash([]);
      dot(ctx,cal.p1,"#ef4444"); dot(ctx,cal.p2,"#ef4444");
    }
    calibClicks.forEach(p=>dot(ctx,p,"#ef4444"));

    // Polygon in progress
    if(poly.length){
      ctx.beginPath(); ctx.moveTo(poly[0].x,poly[0].y);
      poly.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      if(hover) ctx.lineTo(hover.x,hover.y);
      ctx.strokeStyle=C.purple; ctx.lineWidth=2; ctx.stroke();
      poly.forEach(p=>dot(ctx,p,C.purple));
      if(poly.length>=3&&hover){
        const d=Math.hypot(hover.x-poly[0].x,hover.y-poly[0].y);
        if(d<18){ ctx.beginPath(); ctx.arc(poly[0].x,poly[0].y,14,0,Math.PI*2); ctx.fillStyle="#7c3aed30"; ctx.fill(); }
      }
    }
  }

  function dot(ctx,p,col){
    ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2);
    ctx.fillStyle=col; ctx.fill(); ctx.strokeStyle="#fff"; ctx.lineWidth=1.5; ctx.stroke();
  }

  function pt(e){
    const cv=overRef.current; const r=cv.getBoundingClientRect();
    const sx=cv.width/r.width, sy=cv.height/r.height;
    const cl=e.touches?.[0]||e;
    return {x:(cl.clientX-r.left)*sx, y:(cl.clientY-r.top)*sy};
  }

  function handleClick(e){
    const p=pt(e);
    if(calibMode){
      const next=[...calibClicks,p]; setCalibClicks(next);
      if(next.length===2) setShowDistInput(true);
      return;
    }
    if(traceMode){
      if(poly.length>=3){
        const d=Math.hypot(p.x-poly[0].x,p.y-poly[0].y);
        if(d<18){ closeShape(); return; }
      }
      setPoly(prev=>[...prev,p]);
    }
  }

  function applyCalib(){
    const d=parseFloat(distInput); if(!d||d<=0){ alert("Enter a valid distance in feet."); return; }
    const px=Math.hypot(calibClicks[1].x-calibClicks[0].x,calibClicks[1].y-calibClicks[0].y);
    setCalibrations(prev=>({...prev,[currentPage]:{pixPerFoot:px/d,p1:calibClicks[0],p2:calibClicks[1]}}));
    setCalibClicks([]); setDistInput(""); setShowDistInput(false); setCalibMode(false);
  }

  async function closeShape(){
    const cal=calibrations[currentPage];
    if(!cal?.pixPerFoot){ alert("Calibrate the scale first."); return; }
    if(poly.length<3){ alert("Need at least 3 points."); return; }
    const sqft=Math.round(shoelace(poly)/(cal.pixPerFoot**2)*(PITCH_FACTORS[selPitch]||1)*10)/10;
    const area={ page:currentPage, areaType:selType, thickness_in:selThick, floor:selFloor, sqft, pts:[...poly] };

    if(isNew){
      const draft=JSON.parse(localStorage.getItem(DRAFT)||"[]");
      localStorage.setItem(DRAFT, JSON.stringify([...draft,{areaType:selType,thickness_in:selThick,floor:selFloor,sqft}]));
    } else {
      const fid=floorMap[selFloor]||Object.values(floorMap)[0];
      if(!fid){ alert("Floor not found — save the estimate first."); return; }
      setSaving(true);
      const {data:{user}}=await supabase.auth.getUser();
      const {data:cd}=await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      await supabase.from("areas").insert([{
        project_id:projectId, floor_id:fid, company_id:cd?.id,
        area_type:selType, thickness_in:selThick||null, sqft, order_index:Date.now(),
        material:null, r_value:null, options:[], paint_sqft:0, deduct_sqft:0,
      }]);
      setSaving(false);
    }
    setAreas(prev=>[...prev,area]); setPoly([]); setHover(null);
  }

  const cal=calibrations[currentPage];

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>

      {/* Header */}
      <div style={{background:C.ink,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        <button onClick={()=>navigate(isNew?"/estimates":projectId?`/project/${projectId}`:"/estimates/search")}
          style={{border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← Back
        </button>
        <span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1}}>📐 Measure from Drawing</span>
        <label style={{background:"#3b82f6",color:"#fff",padding:"7px 16px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>
          📄 Upload PDF
          <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
        </label>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>

        {/* Canvas column */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Page tabs */}
          {pdfDoc&&(
            <div style={{display:"flex",gap:4,padding:"6px 10px",background:C.white,borderBottom:`1px solid ${C.border}`,overflowX:"auto",flexShrink:0}}>
              {Array.from({length:totalPages},(_,i)=>i+1).map(pg=>(
                <button key={pg} onClick={()=>{setCurrentPage(pg);setPoly([]);setCalibClicks([]);setShowDistInput(false);setCalibMode(false);setTraceMode(false);}}
                  style={{border:`1px solid ${currentPage===pg?"#3b82f6":C.border}`,
                    background:currentPage===pg?"#eff6ff":C.white,color:currentPage===pg?"#1d4ed8":C.muted,
                    padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:currentPage===pg?700:400,whiteSpace:"nowrap"}}>
                  <div>{pageNames[pg]||`Page ${pg}`}</div>
                  <div style={{fontSize:9,color:calibrations[pg]?"#059669":"#f59e0b"}}>{calibrations[pg]?"✓ calibrated":"needs scale"}</div>
                </button>
              ))}
            </div>
          )}

          {/* Page name + scale bar */}
          {pdfDoc&&(
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",background:"#f8fafc",borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap"}}>
              <input value={pageNames[currentPage]||""} onChange={e=>setPageNames(p=>({...p,[currentPage]:e.target.value}))}
                placeholder="Name this page (e.g. Attic, 1st Floor)"
                style={{height:26,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 8px",fontSize:12,flex:1,minWidth:120}}/>
              <span style={{fontSize:11,fontWeight:600,color:cal?"#059669":"#ef4444",whiteSpace:"nowrap"}}>
                {cal?`✓ Scale set: 1 ft = ${cal.pixPerFoot.toFixed(1)}px`:"⚠ No scale — calibrate first"}
              </span>
            </div>
          )}

          {/* Toolbar */}
          {pdfDoc&&(
            <div style={{display:"flex",gap:6,padding:"6px 10px",background:C.white,borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap",alignItems:"center"}}>
              <button onClick={()=>{
                  if(calibMode){setCalibMode(false);setCalibClicks([]);setShowDistInput(false);}
                  else{setCalibMode(true);setTraceMode(false);setPoly([]);setCalibClicks([]);setShowDistInput(false);}
                }}
                style={{border:`1px solid ${calibMode?"#ef4444":C.border}`,background:calibMode?"#fef2f2":C.white,
                  color:calibMode?"#ef4444":C.muted,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:calibMode?700:400}}>
                📏 {calibMode?"Cancel":"Set Scale"}
              </button>

              {!calibMode&&(
                <button onClick={()=>{setTraceMode(p=>!p);setPoly([]);setHover(null);}}
                  style={{border:`1px solid ${traceMode?"#7c3aed":C.border}`,background:traceMode?"#f5f3ff":C.white,
                    color:traceMode?"#7c3aed":C.muted,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:traceMode?700:400}}>
                  ✏️ {traceMode?"Stop":"Trace Area"}
                </button>
              )}

              {traceMode&&poly.length>0&&(
                <>
                  <button onClick={()=>setPoly(p=>p.slice(0,-1))}
                    style={{border:`1px solid ${C.border}`,background:"#fffbeb",color:"#92400e",padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>↩ Undo</button>
                  {poly.length>=3&&(
                    <button onClick={closeShape} disabled={saving}
                      style={{border:"none",background:C.purple,color:"#fff",padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>
                      {saving?"Saving…":"✓ Close Shape"}
                    </button>
                  )}
                </>
              )}

              {traceMode&&(
                <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                  <select value={selType} onChange={e=>setSelType(e.target.value)}
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    {AREA_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                  <select value={selFloor} onChange={e=>setSelFloor(e.target.value)}
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    {floors.map(f=><option key={f}>{f}</option>)}
                  </select>
                  <select value={selThick} onChange={e=>setSelThick(e.target.value)}
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    <option value="">Thickness</option>
                    {THICK_OPTS.map(t=><option key={t}>{t}</option>)}
                  </select>
                  <select value={selPitch} onChange={e=>setSelPitch(e.target.value)}
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    {Object.keys(PITCH_FACTORS).map(k=><option key={k}>{k}</option>)}
                  </select>
                  <span style={{fontSize:10,color:C.faint}}>pitch</span>
                </div>
              )}
            </div>
          )}

          {/* Distance input after 2 calibration clicks */}
          {showDistInput&&(
            <div style={{background:"#fef2f2",borderBottom:`1px solid #fecaca`,padding:"8px 14px",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#991b1b",fontWeight:600}}>Two points selected. Real distance between them:</span>
              <input type="number" value={distInput} onChange={e=>setDistInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&applyCalib()} placeholder="e.g. 24" autoFocus
                style={{height:30,width:80,border:"1px solid #fca5a5",borderRadius:5,padding:"0 8px",fontSize:13,fontWeight:700}}/>
              <span style={{fontSize:12,color:"#991b1b"}}>feet</span>
              <button onClick={applyCalib}
                style={{border:"none",background:"#ef4444",color:"#fff",padding:"5px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>Set Scale</button>
              <button onClick={()=>{setCalibClicks([]);setDistInput("");setShowDistInput(false);setCalibMode(false);}}
                style={{border:`1px solid ${C.border}`,background:C.white,color:C.muted,padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>Cancel</button>
            </div>
          )}

          {/* PDF Canvas */}
          <div style={{flex:1,overflow:"auto",padding:10}}>
            {!pdfDoc&&!pdfLoading&&(
              <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                height:"100%",minHeight:360,border:"2px dashed #cbd5e1",borderRadius:12,cursor:"pointer",color:C.faint,gap:12}}>
                <div style={{fontSize:56}}>📄</div>
                <div style={{fontSize:18,fontWeight:700,color:C.muted}}>Upload a PDF floor plan</div>
                <div style={{fontSize:12,textAlign:"center",lineHeight:1.6}}>
                  Set scale → trace areas → sqft calculates automatically
                </div>
                <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
              </label>
            )}
            {pdfLoading&&<div style={{textAlign:"center",padding:60,color:C.muted}}>⏳ Loading PDF…</div>}
            {pdfDoc&&(
              <div style={{position:"relative",display:"inline-block",maxWidth:"100%",userSelect:"none"}}>
                <canvas ref={pdfRef} style={{display:"block",maxWidth:"100%"}}/>
                <canvas ref={overRef}
                  onClick={handleClick}
                  onMouseMove={e=>{ if(traceMode&&poly.length>0) setHover(pt(e)); }}
                  onTouchEnd={e=>{e.preventDefault();handleClick(e);}}
                  style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",
                    cursor:calibMode||traceMode?"crosshair":"default",touchAction:"none"}}/>
              </div>
            )}
          </div>

          {/* Instruction bar */}
          {pdfDoc&&(
            <div style={{background:"#f0f9ff",borderTop:`1px solid #bae6fd`,padding:"6px 14px",fontSize:11,color:"#0369a1",flexShrink:0}}>
              {calibMode&&!showDistInput&&calibClicks.length===0&&"📏 Click the first end of a known dimension line on the drawing."}
              {calibMode&&!showDistInput&&calibClicks.length===1&&"📏 Click the second end, then type the real distance in feet."}
              {!calibMode&&!traceMode&&cal&&"✓ Scale set. Click ✏️ Trace Area, pick area type + floor + thickness, then click vertices. Click the first point again to close."}
              {!calibMode&&!traceMode&&!cal&&"Start with 📏 Set Scale — click two ends of a dimension line, enter the real length."}
              {traceMode&&poly.length===0&&"Click the first corner of the area to start tracing."}
              {traceMode&&poly.length>0&&poly.length<3&&`${poly.length} point${poly.length>1?"s":""}. Keep clicking corners.`}
              {traceMode&&poly.length>=3&&"Click the first corner again to close the shape — or press ✓ Close Shape."}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{width:240,background:C.white,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
            Measured Areas
            {areas.length>0&&<span style={{background:"#059669",color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11}}>{areas.length}</span>}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
            {areas.length===0&&(
              <div style={{color:C.faint,fontSize:11,textAlign:"center",padding:"24px 8px",lineHeight:1.8}}>
                No areas yet.<br/>
                <b>1.</b> Upload PDF<br/>
                <b>2.</b> Set Scale<br/>
                <b>3.</b> Trace Area<br/>
                <b>4.</b> Click first point to close
              </div>
            )}
            {areas.map((a,i)=>(
              <div key={i} style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",
                borderLeft:`3px solid ${COLORS[i%COLORS.length]}`,padding:"8px 10px",marginBottom:6}}>
                <div style={{fontSize:12,fontWeight:700,color:C.ink}}>{a.areaType}</div>
                <div style={{fontSize:10,color:C.muted}}>
                  {a.floor}{a.thickness_in?` · ${a.thickness_in}`:""} · p.{a.page}
                </div>
                <div style={{fontSize:14,fontWeight:800,color:"#059669"}}>{fmt(a.sqft)} ft²</div>
                {isNew&&<div style={{fontSize:9,color:"#059669"}}>✓ saved to draft</div>}
                {!isNew&&<div style={{fontSize:9,color:"#059669"}}>✓ saved to estimate</div>}
              </div>
            ))}
          </div>
          {areas.length>0&&(
            <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:8}}>
                {areas.length} area{areas.length>1?"s":""} · <b>{fmt(areas.reduce((s,a)=>s+(a.sqft||0),0))} ft²</b>
              </div>
              {isNew?(
                <button onClick={()=>navigate("/job/new?from_drawing=1")}
                  style={{width:"100%",background:C.purple,color:"#fff",border:"none",padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:800}}>
                  Start Estimate →
                </button>
              ):(
                <button onClick={()=>navigate(`/project/${projectId}`)}
                  style={{width:"100%",background:C.ink,color:"#fff",border:"none",padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700}}>
                  ← Back to Estimate
                </button>
              )}
              <div style={{fontSize:10,color:C.faint,marginTop:6,textAlign:"center"}}>
                Set material + R-value on the estimate
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
