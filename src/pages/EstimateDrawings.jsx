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

const PITCH_FACTORS = {
  "Flat":1,"2:12":1.014,"3:12":1.031,"4:12":1.054,"5:12":1.083,
  "6:12":1.118,"7:12":1.158,"8:12":1.202,"9:12":1.250,"10:12":1.302,"12:12":1.414,
};

const DEFAULT_FLOORS = ["Floor","3rd","2nd","1st","Basement","Crawlspace","Garage"];

const C = {
  ink:"#0f172a",white:"#fff",muted:"#64748b",faint:"#94a3b8",
  border:"#e2e8f0",green:"#059669",bg:"#f4f5f7",blue:"#3b82f6",
};

function fmt(n){ return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:1}); }

// Shoelace formula — returns area in pixel²
function shoelace(pts){
  let area=0;
  for(let i=0;i<pts.length;i++){
    const j=(i+1)%pts.length;
    area+=pts[i].x*pts[j].y - pts[j].x*pts[i].y;
  }
  return Math.abs(area)/2;
}

const POLY_COLORS = [
  "#3b82f6","#059669","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16"
];

// ── Main Component ─────────────────────────────────────────────────────────────
export default function EstimateDrawings(){
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { company } = useAuth();

  // PDF
  const [pdfDoc, setPdfDoc]         = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Per-page state
  const [pageNames, setPageNames]     = useState({});       // {1:"Attic"}
  const [calibrations, setCalibrations] = useState({});     // {1:{pixPerFoot,p1,p2}}
  const [polygons, setPolygons]       = useState({});       // {1:[{id,points,areaType,floor,sqft,pitch}]}

  // Calibration flow
  const [calibMode, setCalibMode]     = useState(false);
  const [calibClicks, setCalibClicks] = useState([]);       // [{x,y}] 0-2 clicks
  const [calibDistInput, setCalibDistInput] = useState("");
  const [showCalibInput, setShowCalibInput] = useState(false);

  // Polygon tracing
  const [traceMode, setTraceMode]     = useState(false);
  const [currentPoly, setCurrentPoly] = useState([]);       // [{x,y}] in progress
  const [hoverPt, setHoverPt]         = useState(null);
  const [selAreaType, setSelAreaType] = useState(AREA_TYPES[0]);
  const [selFloor, setSelFloor]       = useState(DEFAULT_FLOORS[0]);
  const [selPitch, setSelPitch]       = useState("Flat");

  // Project floors (loaded from DB)
  const [projectFloors, setProjectFloors] = useState(DEFAULT_FLOORS);

  // Canvas refs
  const pdfCanvasRef  = useRef(null);
  const drawCanvasRef = useRef(null);

  // Save
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // Load project floors + existing drawing data
  useEffect(()=>{
    if(!projectId||!company?.id) return;
    (async()=>{
      const [{data:floors},{data:pages},{data:areas}] = await Promise.all([
        supabase.from("floors").select("name").eq("project_id",projectId).order("order_index"),
        supabase.from("drawing_pages").select("*").eq("project_id",projectId).order("page_number"),
        supabase.from("drawing_areas").select("*").eq("project_id",projectId),
      ]);
      if(floors?.length) setProjectFloors(floors.map(f=>f.name));
      if(pages?.length){
        const names={}, cals={};
        pages.forEach(p=>{
          if(p.page_name) names[p.page_number]=p.page_name;
          if(p.scale_pixels_per_foot) cals[p.page_number]={
            pixPerFoot:p.scale_pixels_per_foot,
            p1:p.calibration_points?.[0],
            p2:p.calibration_points?.[1],
          };
        });
        setPageNames(names);
        setCalibrations(cals);
      }
      if(areas?.length){
        const pm={};
        areas.forEach(a=>{
          const pg=a.page_number||1;
          if(!pm[pg]) pm[pg]=[];
          pm[pg].push({id:a.id,points:a.polygon_points||[],areaType:a.area_type,
            floor:a.floor_name,sqft:a.sqft,pitch:a.pitch_factor||1});
        });
        setPolygons(pm);
      }
    })();
  },[projectId,company?.id]);

  // Load PDF.js from CDN
  async function getPdfjsLib(){
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
      const lib=await getPdfjsLib();
      const buf=await file.arrayBuffer();
      const doc=await lib.getDocument({data:buf}).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
    }catch(err){ alert("Could not load PDF: "+err.message); }
    setPdfLoading(false);
    e.target.value="";
  }

  // Render PDF page into the pdf canvas, then sync draw canvas size
  useEffect(()=>{
    if(!pdfDoc) return;
    renderPdfPage(currentPage);
    setCurrentPoly([]);
    setCalibClicks([]);
    setShowCalibInput(false);
    setCalibMode(false);
    setTraceMode(false);
  },[pdfDoc,currentPage]);

  async function renderPdfPage(n){
    if(!pdfDoc||!pdfCanvasRef.current) return;
    const page=await pdfDoc.getPage(n);
    const container=pdfCanvasRef.current.parentElement;
    const w=container.clientWidth-2;
    const vp=page.getViewport({scale:w/page.getViewport({scale:1}).width});
    const canvas=pdfCanvasRef.current;
    canvas.width=vp.width; canvas.height=vp.height;
    await page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;
    // Sync overlay canvas
    if(drawCanvasRef.current){
      drawCanvasRef.current.width=vp.width;
      drawCanvasRef.current.height=vp.height;
    }
    drawOverlay();
  }

  // Re-draw overlay whenever any drawing state changes
  useEffect(()=>{ drawOverlay(); },[polygons,currentPoly,hoverPt,calibClicks,calibrations,currentPage]);

  function drawOverlay(){
    const cv=drawCanvasRef.current;
    if(!cv) return;
    const ctx=cv.getContext("2d");
    ctx.clearRect(0,0,cv.width,cv.height);

    // Draw completed polygons for this page
    (polygons[currentPage]||[]).forEach((poly,i)=>{
      if(!poly.points?.length) return;
      const col=POLY_COLORS[i%POLY_COLORS.length];
      ctx.beginPath();
      ctx.moveTo(poly.points[0].x,poly.points[0].y);
      poly.points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.fillStyle=col+"33"; ctx.fill();
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.stroke();
      // Centroid label
      const cx=poly.points.reduce((s,p)=>s+p.x,0)/poly.points.length;
      const cy=poly.points.reduce((s,p)=>s+p.y,0)/poly.points.length;
      ctx.font="bold 11px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillStyle="#fff";
      ctx.fillText(`${poly.areaType}`,cx,cy-7);
      ctx.fillStyle=col;
      ctx.fillText(`${fmt(poly.sqft)} ft²`,cx,cy+7);
    });

    // Calibration line
    const calib=calibrations[currentPage];
    if(calib?.p1&&calib?.p2){
      ctx.beginPath(); ctx.moveTo(calib.p1.x,calib.p1.y); ctx.lineTo(calib.p2.x,calib.p2.y);
      ctx.strokeStyle="#ef4444"; ctx.lineWidth=2; ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);
      dot(ctx,calib.p1,"#ef4444"); dot(ctx,calib.p2,"#ef4444");
    }

    // Calibration clicks in progress
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
      ctx.strokeStyle="#7c3aed"; ctx.lineWidth=2; ctx.stroke();
      currentPoly.forEach(p=>dot(ctx,p,"#7c3aed"));
      // Highlight snap-to-close zone
      if(currentPoly.length>=3&&hoverPt){
        const d=Math.hypot(hoverPt.x-currentPoly[0].x,hoverPt.y-currentPoly[0].y);
        if(d<18){
          ctx.beginPath(); ctx.arc(currentPoly[0].x,currentPoly[0].y,14,0,Math.PI*2);
          ctx.fillStyle="#7c3aed33"; ctx.fill();
        }
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

  function handleCanvasClick(e){
    const pt=getCanvasPt(e);

    // ── CALIBRATION ──
    if(calibMode){
      const next=[...calibClicks,pt];
      setCalibClicks(next);
      if(next.length===2) setShowCalibInput(true);
      return;
    }

    // ── TRACING ──
    if(traceMode){
      if(currentPoly.length>=3){
        const d=Math.hypot(pt.x-currentPoly[0].x,pt.y-currentPoly[0].y);
        if(d<18){ finishPolygon(); return; }
      }
      setCurrentPoly(prev=>[...prev,pt]);
    }
  }

  function handleMouseMove(e){
    if(!traceMode||currentPoly.length===0) return;
    setHoverPt(getCanvasPt(e));
  }

  function applyCalibration(){
    const dist=parseFloat(calibDistInput);
    if(!dist||dist<=0){ alert("Enter a valid distance in feet."); return; }
    const px=Math.hypot(calibClicks[1].x-calibClicks[0].x, calibClicks[1].y-calibClicks[0].y);
    const ppf=px/dist;
    setCalibrations(prev=>({...prev,[currentPage]:{pixPerFoot:ppf,p1:calibClicks[0],p2:calibClicks[1]}}));
    setCalibClicks([]); setCalibDistInput(""); setShowCalibInput(false); setCalibMode(false);
  }

  function cancelCalib(){
    setCalibClicks([]); setCalibDistInput(""); setShowCalibInput(false); setCalibMode(false);
  }

  function finishPolygon(){
    const calib=calibrations[currentPage];
    if(!calib?.pixPerFoot){ alert("Calibrate the scale first before tracing areas."); return; }
    if(currentPoly.length<3){ alert("Need at least 3 points to close a shape."); return; }
    const pixArea=shoelace(currentPoly);
    const pitchFactor=PITCH_FACTORS[selPitch]||1;
    const sqft=Math.round(pixArea/(calib.pixPerFoot**2)*pitchFactor*10)/10;
    setPolygons(prev=>({
      ...prev,
      [currentPage]:[...(prev[currentPage]||[]),{
        id:Date.now(), points:[...currentPoly],
        areaType:selAreaType, floor:selFloor, sqft, pitch:pitchFactor,
      }],
    }));
    setCurrentPoly([]); setHoverPt(null);
  }

  function deletePoly(pg,id){
    setPolygons(prev=>({...prev,[pg]:(prev[pg]||[]).filter(p=>p.id!==id)}));
  }

  async function saveAll(){
    if(!projectId||!company?.id) return;
    setSaving(true);
    try{
      await supabase.from("drawing_areas").delete().eq("project_id",projectId);
      await supabase.from("drawing_pages").delete().eq("project_id",projectId);
      // Pages
      const pageRows=[];
      const allPageNums=new Set([...Object.keys(pageNames).map(Number),...Object.keys(calibrations).map(Number),...Object.keys(polygons).map(Number)]);
      allPageNums.forEach(n=>{
        const c=calibrations[n];
        pageRows.push({project_id:projectId,company_id:company.id,page_number:n,
          page_name:pageNames[n]||`Page ${n}`,
          scale_pixels_per_foot:c?.pixPerFoot||null,
          calibration_points:c?[c.p1,c.p2]:null,
        });
      });
      if(pageRows.length) await supabase.from("drawing_pages").insert(pageRows);
      // Areas
      const areaRows=[];
      Object.entries(polygons).forEach(([pg,polys])=>polys.forEach(p=>{
        areaRows.push({project_id:projectId,company_id:company.id,page_number:Number(pg),
          area_type:p.areaType,floor_name:p.floor,polygon_points:p.points,
          sqft:p.sqft,pitch_factor:p.pitch});
      }));
      if(areaRows.length) await supabase.from("drawing_areas").insert(areaRows);
      setSaved(true); setTimeout(()=>setSaved(false),2500);
    }catch(err){ alert("Error saving: "+err.message); }
    setSaving(false);
  }

  const allPolys=Object.values(polygons).flat();
  const calib=calibrations[currentPage];
  const pageName=pageNames[currentPage]||`Page ${currentPage}`;

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>

      {/* ── HEADER ── */}
      <div style={{background:C.ink,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={()=>navigate(projectId?`/project/${projectId}`:"/estimates/search")}
          style={{border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← Back
        </button>
        <span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1}}>📐 Drawing Measurements</span>
        <label style={{background:C.blue,color:"#fff",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600}}>
          📄 Upload PDF
          <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
        </label>
        <button onClick={saveAll} disabled={saving||allPolys.length===0}
          style={{border:"none",background:saved?"#059669":allPolys.length===0?"#334155":"#059669",
            color:"#fff",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600,
            opacity:allPolys.length===0?0.5:1}}>
          {saving?"Saving…":saved?"✓ Saved":"💾 Save"}
        </button>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>

        {/* ── CANVAS COLUMN ── */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Page tabs */}
          {pdfDoc&&(
            <div style={{display:"flex",gap:4,padding:"6px 10px",background:C.white,borderBottom:`1px solid ${C.border}`,overflowX:"auto",flexShrink:0}}>
              {Array.from({length:totalPages},(_,i)=>i+1).map(pg=>(
                <button key={pg} onClick={()=>setCurrentPage(pg)}
                  style={{border:`1px solid ${currentPage===pg?"#3b82f6":C.border}`,
                    background:currentPage===pg?"#eff6ff":C.white,
                    color:currentPage===pg?"#1d4ed8":C.muted,
                    padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:currentPage===pg?700:400,
                    whiteSpace:"nowrap",flexShrink:0}}>
                  <div>{pageNames[pg]||`Page ${pg}`}</div>
                  <div style={{fontSize:9,color:calibrations[pg]?"#059669":"#f59e0b"}}>
                    {calibrations[pg]?"✓ calibrated":"⚠ no scale"}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Page controls */}
          {pdfDoc&&(
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#f8fafc",borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap"}}>
              <input value={pageName} onChange={e=>setPageNames(p=>({...p,[currentPage]:e.target.value}))}
                placeholder={`Page ${currentPage} name (e.g. Attic)`}
                style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 8px",fontSize:12,width:160}}/>
              <span style={{fontSize:11,color:calib?"#059669":"#ef4444",fontWeight:600}}>
                {calib?`Scale: 1 ft = ${calib.pixPerFoot.toFixed(1)}px ✓`:"Not calibrated — click Calibrate Scale"}
              </span>
            </div>
          )}

          {/* Toolbar */}
          {pdfDoc&&(
            <div style={{display:"flex",gap:6,padding:"6px 10px",background:C.white,borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap",alignItems:"center"}}>
              {/* Calibrate */}
              <button onClick={()=>{
                  if(calibMode){cancelCalib();}
                  else{setCalibMode(true);setTraceMode(false);setCurrentPoly([]);setCalibClicks([]);setShowCalibInput(false);}
                }}
                style={{border:`1px solid ${calibMode?"#ef4444":C.border}`,
                  background:calibMode?"#fef2f2":C.white,color:calibMode?"#ef4444":C.muted,
                  padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:calibMode?700:400}}>
                📏 {calibMode?"Cancel Calibration":"Calibrate Scale"}
              </button>

              {/* Trace */}
              {!calibMode&&(
                <button onClick={()=>{setTraceMode(p=>!p);setCurrentPoly([]);setHoverPt(null);}}
                  style={{border:`1px solid ${traceMode?"#7c3aed":C.border}`,
                    background:traceMode?"#f5f3ff":C.white,color:traceMode?"#7c3aed":C.muted,
                    padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:traceMode?700:400}}>
                  ✏️ {traceMode?"Stop Tracing":"Trace Area"}
                </button>
              )}

              {/* Undo / Close while tracing */}
              {traceMode&&currentPoly.length>0&&(
                <>
                  <button onClick={()=>setCurrentPoly(p=>p.slice(0,-1))}
                    style={{border:`1px solid ${C.border}`,background:"#fffbeb",color:"#92400e",padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>
                    ↩ Undo
                  </button>
                  {currentPoly.length>=3&&(
                    <button onClick={finishPolygon}
                      style={{border:"none",background:"#7c3aed",color:"#fff",padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>
                      ✓ Close Shape
                    </button>
                  )}
                </>
              )}

              {/* Area type / floor / pitch — shown while tracing */}
              {traceMode&&(
                <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                  <select value={selAreaType} onChange={e=>setSelAreaType(e.target.value)}
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    {AREA_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                  <select value={selFloor} onChange={e=>setSelFloor(e.target.value)}
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    {projectFloors.map(f=><option key={f}>{f}</option>)}
                  </select>
                  <select value={selPitch} onChange={e=>setSelPitch(e.target.value)}
                    title="Roof pitch multiplier — only needed for roof rafter areas"
                    style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 5px",fontSize:11}}>
                    {Object.keys(PITCH_FACTORS).map(k=><option key={k}>{k}</option>)}
                  </select>
                  <span style={{fontSize:10,color:C.faint}}>pitch</span>
                </div>
              )}
            </div>
          )}

          {/* Calibration distance input */}
          {showCalibInput&&(
            <div style={{background:"#fef2f2",borderBottom:`1px solid #fecaca`,padding:"8px 14px",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#991b1b",fontWeight:600}}>📏 Two points selected. Enter the real distance between them:</span>
              <input type="number" value={calibDistInput} onChange={e=>setCalibDistInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&applyCalibration()}
                placeholder="e.g. 24" autoFocus
                style={{height:30,width:80,border:"1px solid #fca5a5",borderRadius:5,padding:"0 8px",fontSize:13,fontWeight:700}}/>
              <span style={{fontSize:12,color:"#991b1b"}}>feet</span>
              <button onClick={applyCalibration}
                style={{border:"none",background:"#ef4444",color:"#fff",padding:"5px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>
                Set Scale
              </button>
              <button onClick={cancelCalib}
                style={{border:`1px solid ${C.border}`,background:C.white,color:C.muted,padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>
                Cancel
              </button>
            </div>
          )}

          {/* PDF canvas area */}
          <div style={{flex:1,overflow:"auto",padding:10,position:"relative"}}>
            {!pdfDoc&&!pdfLoading&&(
              <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                height:"100%",minHeight:360,border:"2px dashed #cbd5e1",borderRadius:12,cursor:"pointer",
                color:C.faint,gap:10}}>
                <div style={{fontSize:52}}>📄</div>
                <div style={{fontSize:16,fontWeight:600,color:C.muted}}>Upload a PDF floor plan</div>
                <div style={{fontSize:12}}>Multi-page PDFs supported</div>
                <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
              </label>
            )}
            {pdfLoading&&<div style={{textAlign:"center",padding:60,color:C.muted,fontSize:14}}>⏳ Loading PDF…</div>}
            {pdfDoc&&(
              <div style={{position:"relative",display:"inline-block",maxWidth:"100%",userSelect:"none"}}>
                <canvas ref={pdfCanvasRef} style={{display:"block",maxWidth:"100%"}}/>
                <canvas ref={drawCanvasRef}
                  onClick={handleCanvasClick}
                  onMouseMove={handleMouseMove}
                  onTouchEnd={e=>{e.preventDefault();handleCanvasClick(e);}}
                  style={{
                    position:"absolute",top:0,left:0,width:"100%",height:"100%",
                    cursor:calibMode||traceMode?"crosshair":"default",
                    touchAction:"none",
                  }}/>
              </div>
            )}
          </div>

          {/* Instructions bar */}
          {pdfDoc&&(
            <div style={{background:"#f0f9ff",borderTop:`1px solid #bae6fd`,padding:"6px 14px",fontSize:11,color:"#0369a1",flexShrink:0}}>
              {calibMode&&calibClicks.length===0&&"📏 Click the first point of a known measurement line on the drawing."}
              {calibMode&&calibClicks.length===1&&"📏 Click the second point — then enter the real distance in feet."}
              {!calibMode&&!traceMode&&calib&&"✓ Scale calibrated. Click ✏️ Trace Area, then click vertices around a space. Click near the first point (or ✓ Close) to finish."}
              {!calibMode&&!traceMode&&!calib&&"Start by clicking 📏 Calibrate Scale — click two points on a known line, then enter its real length in feet."}
              {traceMode&&currentPoly.length===0&&"Click to place the first vertex of the area."}
              {traceMode&&currentPoly.length>0&&currentPoly.length<3&&`${currentPoly.length} point${currentPoly.length>1?"s":""} — keep clicking to add vertices.`}
              {traceMode&&currentPoly.length>=3&&"Click near the first point (blue dot) or ✓ Close Shape to finish the polygon."}
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{width:260,background:C.white,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontWeight:700,fontSize:13,flex:1}}>Traced Areas</span>
            {allPolys.length>0&&(
              <span style={{background:C.blue,color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11,fontWeight:700}}>
                {allPolys.length}
              </span>
            )}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
            {allPolys.length===0&&(
              <div style={{color:C.faint,fontSize:11,textAlign:"center",padding:"24px 8px",lineHeight:1.7}}>
                No areas yet.<br/>
                Upload a PDF → calibrate the scale → trace areas.
              </div>
            )}
            {Object.entries(polygons).map(([pg,polys])=>polys.map((poly,i)=>(
              <div key={poly.id} style={{background:"#f8fafc",borderRadius:8,border:`1px solid ${C.border}`,
                padding:"8px 10px",marginBottom:6,borderLeft:`3px solid ${POLY_COLORS[i%POLY_COLORS.length]}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:1}}>{poly.areaType}</div>
                    <div style={{fontSize:10,color:C.muted}}>
                      {poly.floor} · Page {pg}
                      {poly.pitch>1&&<span style={{color:"#7c3aed"}}> · ×{poly.pitch} pitch</span>}
                    </div>
                    <div style={{fontSize:14,fontWeight:800,color:"#059669",marginTop:2}}>{fmt(poly.sqft)} ft²</div>
                  </div>
                  <button onClick={()=>deletePoly(Number(pg),poly.id)}
                    style={{border:"none",background:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 0 0 6px",lineHeight:1,flexShrink:0}}>✕</button>
                </div>
              </div>
            )))}
          </div>
          {allPolys.length>0&&(
            <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:11,color:C.muted}}>Total sqft</span>
                <span style={{fontSize:13,fontWeight:800,color:C.ink}}>
                  {fmt(allPolys.reduce((s,p)=>s+(p.sqft||0),0))} ft²
                </span>
              </div>
              <button onClick={saveAll} disabled={saving}
                style={{width:"100%",background:saved?"#059669":"#0f172a",color:"#fff",border:"none",
                  padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,marginBottom:6}}>
                {saving?"Saving…":saved?"✓ Saved to Database":"💾 Save Measurements"}
              </button>
              <div style={{fontSize:10,color:C.faint,textAlign:"center",lineHeight:1.5}}>
                Saved measurements will be available to import on the Estimate page
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
