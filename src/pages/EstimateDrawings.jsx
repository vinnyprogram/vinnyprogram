import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// ── Constants ──────────────────────────────────────────────────────────────────
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
  border:"#e2e8f0",green:"#059669",purple:"#7c3aed",blue:"#3b82f6",bg:"#f4f5f7",
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

// ── Main ───────────────────────────────────────────────────────────────────────
export default function EstimateDrawings(){
  const { projectId } = useParams();
  const navigate      = useNavigate();
  const { company }   = useAuth();
  const isNew         = !projectId || projectId==="new";
  const DRAFT         = "drawing_draft";
  const CALIB_KEY     = `cal_${projectId||"new"}`;

  // Mode: "measure" = manual polygon trace | "ai" = Claude reads the page
  const [mode, setMode]       = useState("ai");

  // PDF state
  const [pdfDoc, setPdfDoc]           = useState(null);
  const [totalPages, setTotalPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfLoading, setPdfLoading]   = useState(false);
  const [pageNames, setPageNames]     = useState({});
  const [storagePath, setStoragePath] = useState(null);  // path in Supabase Storage
  const pdfRef = useRef(null);
  const overRef= useRef(null);

  // Calibration (manual mode) — persisted in localStorage
  const [calibs, setGalibs] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem(CALIB_KEY)||"{}"); }catch(e){return {};}
  });
  const [calibMode, setCalibMode]   = useState(false);
  const [calibClicks, setCalibClicks] = useState([]);
  const [showDist, setShowDist]     = useState(false);
  const [distVal, setDistVal]       = useState("");

  // Polygon trace (manual mode)
  const [traceMode, setTraceMode]   = useState(false);
  const [poly, setPoly]             = useState([]);
  const [hover, setHover]           = useState(null);
  const [selType, setSelType]       = useState(AREA_TYPES[0]);
  const [selFloor, setSelFloor]     = useState(DEFAULT_FLOORS[0]);
  const [selThick, setSelThick]     = useState("");
  const [selPitch, setSelPitch]     = useState("Flat");

  // AI analysis state
  const [analyzing, setAnalyzing]   = useState(false);
  const [aiError, setAiError]       = useState("");
  const [pageAreas, setPageAreas]   = useState({}); // {pageNum:[{id,area_type,...}]}

  // Project floors
  const [floorMap, setFloorMap]     = useState({});
  const [floors, setFloors]         = useState(DEFAULT_FLOORS);

  // All saved areas this session
  const [saved, setSaved]           = useState([]);
  const [saving, setSavingArea]     = useState(false);

  useEffect(()=>{
    if(isNew) return;
    supabase.from("floors").select("id,name").eq("project_id",projectId).order("order_index")
      .then(({data})=>{
        if(data?.length){
          const m={}; data.forEach(f=>m[f.name]=f.id);
          setFloorMap(m); setFloors(data.map(f=>f.name)); setSelFloor(data[0].name);
        }
      });
  },[projectId]);

  useEffect(()=>{
    if(Object.keys(calibs).length) localStorage.setItem(CALIB_KEY,JSON.stringify(calibs));
  },[calibs]);

  // ── PDF.js ──────────────────────────────────────────────────────────────────
  async function getPdfjs(){
    if(window.pdfjsLib) return window.pdfjsLib;
    return new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload=()=>{ window.pdfjsLib.GlobalWorkerOptions.workerSrc=
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); };
      s.onerror=rej; document.head.appendChild(s);
    });
  }

  async function handleUpload(e){
    const file=e.target.files?.[0]; if(!file) return;
    setPdfLoading(true); setPageAreas({}); setSaved([]);
    try{
      // 1. Store PDF in Supabase Storage
      const path=`${projectId||"draft"}/${Date.now()}_${file.name}`;
      const {error:upErr}=await supabase.storage.from("drawings").upload(path,file,{upsert:true});
      if(upErr) console.warn("Storage upload error (non-fatal):",upErr.message);
      else setStoragePath(path);

      // 2. Load PDF.js and render
      const lib=await getPdfjs();
      const doc=await lib.getDocument({data:await file.arrayBuffer()}).promise;
      setPdfDoc(doc); setTotalPages(doc.numPages); setCurrentPage(1);
    }catch(err){ alert("Could not load PDF: "+err.message); }
    setPdfLoading(false); e.target.value="";
  }

  useEffect(()=>{ if(pdfDoc) renderPage(currentPage); },[pdfDoc,currentPage,zoom]);

  const [zoom, setZoom] = useState(1);

  async function renderPage(n){
    if(!pdfDoc||!pdfRef.current) return;
    const page=await pdfDoc.getPage(n);
    const container=pdfRef.current.parentElement;
    const w=Math.min((container?.clientWidth||1200)-4, 2400) * zoom;
    const vp=page.getViewport({scale:w/page.getViewport({scale:1}).width});
    pdfRef.current.width=vp.width; pdfRef.current.height=vp.height;
    await page.render({canvasContext:pdfRef.current.getContext("2d"),viewport:vp}).promise;
    if(overRef.current){ overRef.current.width=vp.width; overRef.current.height=vp.height; }
    redraw();
  }

  // Export current page as JPEG base64 (for AI)
  async function getPageJpeg(n){
    if(!pdfDoc) throw new Error("No PDF");
    const page=await pdfDoc.getPage(n);
    const scale=Math.min(1800/page.getViewport({scale:1}).width,2);
    const vp=page.getViewport({scale});
    const cv=document.createElement("canvas"); cv.width=vp.width; cv.height=vp.height;
    await page.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise;
    return cv.toDataURL("image/jpeg",0.92).replace(/^data:image\/jpeg;base64,/,"");
  }

  // ── AI analysis ─────────────────────────────────────────────────────────────
  async function analyzePage(n){
    setAnalyzing(true); setAiError("");
    try{
      const jpeg=await getPageJpeg(n);
      const {data,error}=await supabase.functions.invoke("analyze-drawing",{
        body:{ imageBase64:jpeg, mediaType:"image/jpeg" },
      });
      if(error) throw new Error(error.message);
      if(data?.error) throw new Error(data.error);
      const areas=(data.areas||[]).map((a,i)=>({
        ...a, id:Date.now()+i,
        floor: floors.includes(a.floor)?a.floor:floors[0]||DEFAULT_FLOORS[0],
      }));
      setPageAreas(prev=>({...prev,[n]:areas}));
    }catch(err){ setAiError(err.message||"Analysis failed"); }
    setAnalyzing(false);
  }

  function updateArea(pageNum,id,field,val){
    setPageAreas(prev=>({...prev,[pageNum]:(prev[pageNum]||[]).map(a=>a.id===id?{...a,[field]:val}:a)}));
  }
  function removeArea(pageNum,id){
    setPageAreas(prev=>({...prev,[pageNum]:(prev[pageNum]||[]).filter(a=>a.id!==id)}));
  }

  const readyAreas=Object.entries(pageAreas).flatMap(([pg,arr])=>arr.filter(a=>a.sqft>0).map(a=>({...a,page:Number(pg)})));

  async function addAiAreas(){
    if(!readyAreas.length) return;
    setSavingArea(true);
    try{
      if(isNew){
        const draft=JSON.parse(localStorage.getItem(DRAFT)||"[]");
        localStorage.setItem(DRAFT,JSON.stringify([...draft,...readyAreas.map(a=>({areaType:a.area_type,thickness_in:a.thickness_in||"",floor:a.floor,sqft:a.sqft}))]));
      } else {
        const {data:{user}}=await supabase.auth.getUser();
        const {data:cd}=await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
        const inserts=readyAreas.map((a,i)=>({
          project_id:projectId, floor_id:floorMap[a.floor]||Object.values(floorMap)[0],
          company_id:cd?.id, area_type:a.area_type, thickness_in:a.thickness_in||null,
          sqft:a.sqft, order_index:Date.now()+i, material:null, r_value:null,
          options:[], paint_sqft:0, deduct_sqft:0,
        })).filter(x=>x.floor_id);
        if(inserts.length) await supabase.from("areas").insert(inserts);
      }
      setSaved(prev=>[...prev,...readyAreas.map(a=>({areaType:a.area_type,floor:a.floor,thickness_in:a.thickness_in||"",sqft:a.sqft}))]);
      setPageAreas({});
    }catch(err){ alert("Error: "+err.message); }
    setSavingArea(false);
  }

  // ── Manual polygon trace ─────────────────────────────────────────────────────
  useEffect(()=>redraw(),[saved,poly,hover,calibClicks,calibs,currentPage,pageAreas]);

  function redraw(){
    const cv=overRef.current; if(!cv) return;
    const ctx=cv.getContext("2d"); ctx.clearRect(0,0,cv.width,cv.height);
    // Saved areas for this page
    saved.filter(a=>a.page===currentPage&&a.pts).forEach((a,i)=>{
      const col=COLORS[i%COLORS.length];
      ctx.beginPath(); ctx.moveTo(a.pts[0].x,a.pts[0].y);
      a.pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.closePath();
      ctx.fillStyle=col+"30"; ctx.fill(); ctx.strokeStyle=col; ctx.lineWidth=2; ctx.stroke();
      const cx=a.pts.reduce((s,p)=>s+p.x,0)/a.pts.length;
      const cy=a.pts.reduce((s,p)=>s+p.y,0)/a.pts.length;
      ctx.font="bold 12px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillStyle="#fff"; ctx.fillText(a.areaType,cx,cy-8);
      ctx.fillStyle=col; ctx.fillText(fmt(a.sqft)+" ft²",cx,cy+8);
    });
    // AI result areas (for this page, just show count overlay)
    const cal=calibs[currentPage];
    if(cal?.p1&&cal?.p2){
      ctx.beginPath(); ctx.moveTo(cal.p1.x,cal.p1.y); ctx.lineTo(cal.p2.x,cal.p2.y);
      ctx.strokeStyle="#ef4444"; ctx.lineWidth=2; ctx.setLineDash([6,3]); ctx.stroke(); ctx.setLineDash([]);
      dot(ctx,cal.p1,"#ef4444"); dot(ctx,cal.p2,"#ef4444");
    }
    calibClicks.forEach(p=>dot(ctx,p,"#ef4444"));
    if(poly.length){
      ctx.beginPath(); ctx.moveTo(poly[0].x,poly[0].y); poly.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
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
    return {x:(cl.clientX-r.left)*sx,y:(cl.clientY-r.top)*sy};
  }

  function handleClick(e){
    const p=pt(e);
    if(calibMode){
      const next=[...calibClicks,p]; setCalibClicks(next);
      if(next.length===2) setShowDist(true);
      return;
    }
    if(traceMode){
      if(poly.length>=3){ const d=Math.hypot(p.x-poly[0].x,p.y-poly[0].y); if(d<18){closeTrace();return;} }
      setPoly(prev=>[...prev,p]);
    }
  }

  function applyCalib(){
    const d=parseFloat(distVal); if(!d||d<=0){ alert("Enter feet."); return; }
    const px=Math.hypot(calibClicks[1].x-calibClicks[0].x,calibClicks[1].y-calibClicks[0].y);
    setGalibs(prev=>({...prev,[currentPage]:{pixPerFoot:px/d,p1:calibClicks[0],p2:calibClicks[1]}}));
    setCalibClicks([]); setDistVal(""); setShowDist(false); setCalibMode(false);
  }

  async function closeTrace(){
    const cal=calibs[currentPage];
    if(!cal?.pixPerFoot){ alert("Set scale first."); return; }
    if(poly.length<3){ alert("Need 3+ points."); return; }
    const sqft=Math.round(shoelace(poly)/(cal.pixPerFoot**2)*(PITCH_FACTORS[selPitch]||1)*10)/10;
    const area={page:currentPage,areaType:selType,thickness_in:selThick,floor:selFloor,sqft,pts:[...poly]};
    if(isNew){
      const draft=JSON.parse(localStorage.getItem(DRAFT)||"[]");
      localStorage.setItem(DRAFT,JSON.stringify([...draft,{areaType:selType,thickness_in:selThick,floor:selFloor,sqft}]));
    } else {
      const fid=floorMap[selFloor]||Object.values(floorMap)[0];
      if(!fid){ alert("Save the estimate first to create floors."); return; }
      setSavingArea(true);
      const {data:{user}}=await supabase.auth.getUser();
      const {data:cd}=await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      await supabase.from("areas").insert([{
        project_id:projectId,floor_id:fid,company_id:cd?.id,
        area_type:selType,thickness_in:selThick||null,sqft,order_index:Date.now(),
        material:null,r_value:null,options:[],paint_sqft:0,deduct_sqft:0,
      }]);
      setSavingArea(false);
    }
    setSaved(prev=>[...prev,area]); setPoly([]); setHover(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const cal=calibs[currentPage];
  const currAiAreas=pageAreas[currentPage]||[];
  const allSaved=[...saved,...(isNew?[]:Object.values(pageAreas).flat().filter(a=>a.sqft>0))];

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>

      {/* HEADER */}
      <div style={{background:C.ink,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        <button onClick={()=>navigate(isNew?"/estimates":projectId?`/project/${projectId}`:"/estimates/search")}
          style={{border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← Back
        </button>
        <span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1}}>📐 Drawing Measurements</span>

        {/* Mode toggle */}
        <div style={{display:"flex",background:"rgba(255,255,255,0.1)",borderRadius:6,padding:2,gap:2}}>
          <button onClick={()=>setMode("ai")}
            style={{border:"none",background:mode==="ai"?C.purple:"transparent",color:"#fff",
              padding:"4px 10px",borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:mode==="ai"?700:400}}>
            🤖 AI Read
          </button>
          <button onClick={()=>setMode("measure")}
            style={{border:"none",background:mode==="measure"?"#374151":"transparent",color:"#fff",
              padding:"4px 10px",borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:mode==="measure"?700:400}}>
            ✏️ Manual
          </button>
        </div>

        <label style={{background:C.blue,color:"#fff",padding:"7px 16px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>
          📄 Upload PDF
          <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
        </label>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>

        {/* ── LEFT: Canvas ── */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Page tabs */}
          {pdfDoc&&(
            <div style={{display:"flex",gap:4,padding:"6px 10px",background:C.white,borderBottom:`1px solid ${C.border}`,overflowX:"auto",flexShrink:0}}>
              {Array.from({length:totalPages},(_,i)=>i+1).map(pg=>(
                <button key={pg} onClick={()=>{setCurrentPage(pg);setPoly([]);setCalibClicks([]);setShowDist(false);setCalibMode(false);setTraceMode(false);}}
                  style={{border:`1px solid ${currentPage===pg?"#3b82f6":C.border}`,
                    background:currentPage===pg?"#eff6ff":C.white,color:currentPage===pg?"#1d4ed8":C.muted,
                    padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:currentPage===pg?700:400,whiteSpace:"nowrap"}}>
                  <div>{pageNames[pg]||`Page ${pg}`}</div>
                  <div style={{fontSize:9,color:pageAreas[pg]?.length?"#059669":calibs[pg]?"#059669":"#f59e0b"}}>
                    {pageAreas[pg]?.length?`✓ ${pageAreas[pg].length} areas`:calibs[pg]?"✓ calibrated":"set scale"}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Page name bar */}
          {pdfDoc&&(
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",background:"#f8fafc",borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap"}}>
              <input value={pageNames[currentPage]||""} onChange={e=>setPageNames(p=>({...p,[currentPage]:e.target.value}))}
                placeholder="Page name (e.g. Attic, 1st Floor)"
                style={{height:26,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 8px",fontSize:12,flex:1,minWidth:120}}/>

              {/* Zoom controls */}
              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                <button onClick={()=>setZoom(p=>Math.max(0.5,p-0.25))}
                  style={{border:`1px solid ${C.border}`,background:C.white,color:C.ink,width:28,height:28,borderRadius:5,cursor:"pointer",fontSize:16,fontWeight:700}}>−</button>
                <span style={{fontSize:11,color:C.muted,minWidth:36,textAlign:"center"}}>{Math.round(zoom*100)}%</span>
                <button onClick={()=>setZoom(p=>Math.min(3,p+0.25))}
                  style={{border:`1px solid ${C.border}`,background:C.white,color:C.ink,width:28,height:28,borderRadius:5,cursor:"pointer",fontSize:16,fontWeight:700}}>+</button>
                <button onClick={()=>setZoom(1)}
                  style={{border:`1px solid ${C.border}`,background:C.white,color:C.muted,height:28,padding:"0 8px",borderRadius:5,cursor:"pointer",fontSize:11}}>fit</button>
              </div>

              {/* AI mode: Analyze button */}
              {mode==="ai"&&(
                <button onClick={()=>analyzePage(currentPage)} disabled={analyzing}
                  style={{border:"none",background:analyzing?"#94a3b8":C.purple,color:"#fff",
                    padding:"5px 16px",borderRadius:6,cursor:analyzing?"default":"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
                  {analyzing?"🤖 Reading…":"🤖 Read This Page"}
                </button>
              )}

              {/* Manual mode: scale status */}
              {mode==="measure"&&(
                <span style={{fontSize:11,fontWeight:600,color:cal?"#059669":"#ef4444",whiteSpace:"nowrap"}}>
                  {cal?`✓ 1 ft = ${cal.pixPerFoot.toFixed(1)}px`:"⚠ Set scale first"}
                </span>
              )}
            </div>
          )}

          {/* Manual mode toolbar */}
          {pdfDoc&&mode==="measure"&&(
            <div style={{display:"flex",gap:6,padding:"6px 10px",background:C.white,borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap",alignItems:"center"}}>
              <button onClick={()=>{if(calibMode){setCalibMode(false);setCalibClicks([]);setShowDist(false);}else{setCalibMode(true);setTraceMode(false);setPoly([]);setCalibClicks([]);setShowDist(false);}}}
                style={{border:`1px solid ${calibMode?"#ef4444":C.border}`,background:calibMode?"#fef2f2":C.white,color:calibMode?"#ef4444":C.muted,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:calibMode?700:400}}>
                📏 {calibMode?"Cancel":"Set Scale"}
              </button>
              {!calibMode&&(
                <button onClick={()=>{setTraceMode(p=>!p);setPoly([]);setHover(null);}}
                  style={{border:`1px solid ${traceMode?"#7c3aed":C.border}`,background:traceMode?"#f5f3ff":C.white,color:traceMode?"#7c3aed":C.muted,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:traceMode?700:400}}>
                  ✏️ {traceMode?"Stop":"Trace Area"}
                </button>
              )}
              {traceMode&&poly.length>0&&(
                <>
                  <button onClick={()=>setPoly(p=>p.slice(0,-1))} style={{border:`1px solid ${C.border}`,background:"#fffbeb",color:"#92400e",padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>↩ Undo</button>
                  {poly.length>=3&&<button onClick={closeTrace} disabled={saving} style={{border:"none",background:C.purple,color:"#fff",padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>{saving?"Saving…":"✓ Close Shape"}</button>}
                </>
              )}
              {traceMode&&(
                <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  <select value={selType} onChange={e=>setSelType(e.target.value)} style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 4px",fontSize:11}}>{AREA_TYPES.map(t=><option key={t}>{t}</option>)}</select>
                  <select value={selFloor} onChange={e=>setSelFloor(e.target.value)} style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 4px",fontSize:11}}>{floors.map(f=><option key={f}>{f}</option>)}</select>
                  <select value={selThick} onChange={e=>setSelThick(e.target.value)} style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 4px",fontSize:11}}><option value="">Thickness</option>{THICK_OPTS.map(t=><option key={t}>{t}</option>)}</select>
                  <select value={selPitch} onChange={e=>setSelPitch(e.target.value)} style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 4px",fontSize:11}}>{Object.keys(PITCH_FACTORS).map(k=><option key={k}>{k}</option>)}</select>
                </div>
              )}
            </div>
          )}

          {/* Calibration distance input */}
          {showDist&&(
            <div style={{background:"#fef2f2",borderBottom:`1px solid #fecaca`,padding:"8px 14px",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#991b1b",fontWeight:600}}>Two points selected. Real distance:</span>
              <input type="number" value={distVal} onChange={e=>setDistVal(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&applyCalib()} placeholder="e.g. 24" autoFocus
                style={{height:30,width:80,border:"1px solid #fca5a5",borderRadius:5,padding:"0 8px",fontSize:13,fontWeight:700}}/>
              <span style={{fontSize:12,color:"#991b1b"}}>feet</span>
              <button onClick={applyCalib} style={{border:"none",background:"#ef4444",color:"#fff",padding:"5px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>Set Scale</button>
              <button onClick={()=>{setCalibClicks([]);setDistVal("");setShowDist(false);setCalibMode(false);}} style={{border:`1px solid ${C.border}`,background:C.white,color:C.muted,padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>Cancel</button>
            </div>
          )}

          {/* AI error */}
          {aiError&&(
            <div style={{background:"#fef2f2",borderBottom:"1px solid #fecaca",padding:"8px 14px",fontSize:12,color:"#991b1b",flexShrink:0}}>
              ⚠️ {aiError}
              {aiError.includes("ANTHROPIC_API_KEY")&&<span> — Run: <code>supabase secrets set ANTHROPIC_API_KEY=sk-ant-...</code></span>}
            </div>
          )}

          {/* PDF Canvas */}
          <div style={{flex:1,overflow:"auto",padding:10}}>
            {!pdfDoc&&!pdfLoading&&(
              <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                height:"100%",minHeight:380,border:"2px dashed #cbd5e1",borderRadius:12,cursor:"pointer",color:C.faint,gap:12}}>
                <div style={{fontSize:56}}>📄</div>
                <div style={{fontSize:18,fontWeight:700,color:C.muted}}>Upload a PDF floor plan</div>
                <div style={{fontSize:12,textAlign:"center",lineHeight:1.7,maxWidth:320}}>
                  <b>🤖 AI mode:</b> Claude reads the drawing and extracts areas, stud sizes, and dimensions automatically.<br/>
                  <b>✏️ Manual mode:</b> Set scale, trace areas with clicks.
                </div>
                <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
              </label>
            )}
            {pdfLoading&&<div style={{textAlign:"center",padding:60,color:C.muted,fontSize:14}}>⏳ Loading PDF…</div>}
            {pdfDoc&&(
              <div style={{position:"relative",display:"inline-block",maxWidth:"100%",userSelect:"none"}}>
                <canvas ref={pdfRef} style={{display:"block",maxWidth:"100%"}}/>
                <canvas ref={overRef}
                  onClick={mode==="measure"?handleClick:undefined}
                  onMouseMove={e=>{ if(mode==="measure"&&traceMode&&poly.length>0) setHover(pt(e)); }}
                  onTouchEnd={e=>{ if(mode==="measure"){e.preventDefault();handleClick(e);} }}
                  style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",
                    cursor:mode==="measure"&&(calibMode||traceMode)?"crosshair":"default",touchAction:"none"}}/>
              </div>
            )}
          </div>

          {/* Instruction bar */}
          {pdfDoc&&(
            <div style={{background:"#f0f9ff",borderTop:"1px solid #bae6fd",padding:"6px 14px",fontSize:11,color:"#0369a1",flexShrink:0}}>
              {mode==="ai"&&!analyzing&&!currAiAreas.length&&"Click 🤖 Read This Page — Claude will identify areas, stud sizes, and dimensions from the drawing."}
              {mode==="ai"&&analyzing&&"Reading drawing… Claude is extracting areas and dimensions."}
              {mode==="ai"&&!analyzing&&currAiAreas.length>0&&`Found ${currAiAreas.length} areas. Review and edit in the panel, then click Add to Estimate.`}
              {mode==="measure"&&!calibMode&&!traceMode&&(cal?"✓ Scale set. Click Trace Area to start measuring.":"Click Set Scale first — click 2 points on a known dimension line.")}
              {mode==="measure"&&calibMode&&!showDist&&calibClicks.length===0&&"Click the first end of a known measurement line."}
              {mode==="measure"&&calibMode&&!showDist&&calibClicks.length===1&&"Click the second end, then type the real distance in feet."}
              {mode==="measure"&&traceMode&&poly.length===0&&"Click the first corner of the area."}
              {mode==="measure"&&traceMode&&poly.length>0&&poly.length<3&&`${poly.length} point${poly.length>1?"s":""}. Keep clicking corners.`}
              {mode==="measure"&&traceMode&&poly.length>=3&&"Click the first point to close the shape."}
            </div>
          )}
        </div>

        {/* ── RIGHT: Results panel ── */}
        <div style={{width:260,background:C.white,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0,transition:"width 0.2s"}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
            {mode==="ai"&&currAiAreas.length>0?"Detected Areas":"Measured Areas"}
            {(currAiAreas.length>0||saved.length>0)&&(
              <span style={{background:"#059669",color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11}}>
                {mode==="ai"?currAiAreas.length:saved.length}
              </span>
            )}
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>

            {/* AI mode — detected areas for current page */}
            {mode==="ai"&&(
              <>
                {analyzing&&(
                  <div style={{textAlign:"center",padding:"30px 0",color:C.muted}}>
                    <div style={{fontSize:32}}>🤖</div>
                    <div style={{fontSize:13,fontWeight:600,marginTop:8}}>Reading drawing…</div>
                    <div style={{fontSize:11,color:C.faint,marginTop:4}}>Identifying areas, stud sizes, and dimensions</div>
                  </div>
                )}
                {!analyzing&&currAiAreas.length===0&&saved.length===0&&(
                  <div style={{color:C.faint,fontSize:11,textAlign:"center",padding:"20px 8px",lineHeight:1.8}}>
                    Upload PDF then click<br/><b>🤖 Read This Page</b>
                  </div>
                )}
                {/* Already saved areas */}
                {saved.length>0&&(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#059669",textTransform:"uppercase",marginBottom:6}}>✓ Added to estimate</div>
                    {saved.map((a,i)=>(
                      <div key={i} style={{background:"#f0fdf4",borderRadius:6,border:"1px solid #86efac",padding:"6px 8px",marginBottom:4}}>
                        <div style={{fontSize:11,fontWeight:700}}>{a.areaType}{a.thickness_in?` · ${a.thickness_in}`:""}</div>
                        <div style={{fontSize:10,color:C.muted}}>{a.floor}</div>
                        <div style={{fontSize:13,fontWeight:800,color:"#059669"}}>{fmt(a.sqft)} ft²</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Detected areas to review */}
                {currAiAreas.map(a=>(
                  <div key={a.id} style={{background:"#f8fafc",borderRadius:8,border:`1px solid ${a.sqft>0?"#86efac":C.border}`,padding:"8px 10px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:11,fontWeight:700,color:a.sqft>0?"#059669":"#f59e0b"}}>
                        {a.sqft>0?`${fmt(a.sqft)} ft²`:"⚠ No dimensions"}
                      </span>
                      <button onClick={()=>removeArea(currentPage,a.id)} style={{border:"none",background:"none",color:"#ef4444",cursor:"pointer",fontSize:16,padding:0}}>✕</button>
                    </div>
                    <select value={a.area_type||""} onChange={e=>updateArea(currentPage,a.id,"area_type",e.target.value)}
                      style={{...I,width:"100%",marginBottom:4,fontSize:11}}>
                      {AREA_TYPES.map(t=><option key={t}>{t}</option>)}
                    </select>
                    <div style={{display:"flex",gap:4,marginBottom:4}}>
                      <select value={a.thickness_in||""} onChange={e=>updateArea(currentPage,a.id,"thickness_in",e.target.value)}
                        style={{...I,flex:1,fontSize:11}}>
                        <option value="">Thickness</option>{THICK_OPTS.map(t=><option key={t}>{t}</option>)}
                      </select>
                      <select value={a.floor||""} onChange={e=>updateArea(currentPage,a.id,"floor",e.target.value)}
                        style={{...I,flex:1,fontSize:11}}>
                        {floors.map(f=><option key={f}>{f}</option>)}
                      </select>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <input type="number" value={a.sqft||""} onChange={e=>updateArea(currentPage,a.id,"sqft",Number(e.target.value))}
                        placeholder="sqft" style={{...I,flex:1,fontSize:12}}/>
                      <span style={{fontSize:11,color:C.muted}}>ft²</span>
                    </div>
                    {a.notes&&<div style={{fontSize:9,color:C.faint,marginTop:4,lineHeight:1.4}}>💬 {a.notes}</div>}
                  </div>
                ))}
              </>
            )}

            {/* Manual mode — saved traced areas */}
            {mode==="measure"&&(
              <>
                {saved.length===0&&<div style={{color:C.faint,fontSize:11,textAlign:"center",padding:"20px 8px",lineHeight:1.8}}>Set scale → trace areas → sqft calculates automatically</div>}
                {saved.map((a,i)=>(
                  <div key={i} style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",borderLeft:`3px solid ${COLORS[i%COLORS.length]}`,padding:"8px 10px",marginBottom:6}}>
                    <div style={{fontSize:12,fontWeight:700}}>{a.areaType}{a.thickness_in?` · ${a.thickness_in}`:""}</div>
                    <div style={{fontSize:10,color:C.muted}}>{a.floor} · p.{a.page}</div>
                    <div style={{fontSize:14,fontWeight:800,color:"#059669"}}>{fmt(a.sqft)} ft²</div>
                    <div style={{fontSize:9,color:"#059669"}}>✓ saved</div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Bottom actions */}
          <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`}}>
            {/* AI: add all to estimate */}
            {mode==="ai"&&readyAreas.length>0&&(
              <>
                <div style={{fontSize:11,color:C.muted,marginBottom:8}}>
                  <b>{readyAreas.length}</b> area{readyAreas.length>1?"s":""} ready · <b>{fmt(readyAreas.reduce((s,a)=>s+(a.sqft||0),0))} ft²</b>
                </div>
                <button onClick={addAiAreas} disabled={saving}
                  style={{width:"100%",background:saving?"#94a3b8":C.purple,color:"#fff",border:"none",padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,marginBottom:6}}>
                  {saving?"Saving…":"✓ Add to Estimate"}
                </button>
              </>
            )}
            {/* Start/back buttons */}
            {(saved.length>0||(mode==="ai"&&readyAreas.length===0&&Object.keys(pageAreas).length>0))&&(
              isNew?(
                <button onClick={()=>navigate("/job/new?from_drawing=1")}
                  style={{width:"100%",background:C.ink,color:"#fff",border:"none",padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:800}}>
                  Start Estimate →
                </button>
              ):(
                <button onClick={()=>navigate(`/project/${projectId}`)}
                  style={{width:"100%",background:C.ink,color:"#fff",border:"none",padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700}}>
                  ← Back to Estimate
                </button>
              )
            )}
            <div style={{fontSize:10,color:C.faint,marginTop:6,textAlign:"center"}}>
              Set material + R-value on the estimate screen
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
