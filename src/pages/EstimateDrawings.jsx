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
const FLOORS     = ["Floor","1st","2nd","3rd","Basement","Crawlspace","Garage"];

const C = {
  ink:"#0f172a",white:"#fff",muted:"#64748b",faint:"#94a3b8",
  border:"#e2e8f0",green:"#059669",bg:"#f4f5f7",blue:"#3b82f6",purple:"#7c3aed",
};
const I = {height:32,fontSize:12,borderRadius:6,border:`1px solid ${C.border}`,
  background:C.white,padding:"0 8px",boxSizing:"border-box",color:C.ink,outline:"none"};

function fmt(n){ return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:1}); }

export default function EstimateDrawings(){
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { company } = useAuth();

  const isNewProject = !projectId || projectId === "new";

  // PDF state
  const [pdfDoc, setPdfDoc]           = useState(null);
  const [totalPages, setTotalPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfLoading, setPdfLoading]   = useState(false);
  const [pageNames, setPageNames]     = useState({});
  const pdfCanvasRef = useRef(null);

  // AI analysis state — per page
  const [analyzing, setAnalyzing]     = useState(false);
  const [pageResults, setPageResults] = useState({}); // {pageNum: [{area_type,thickness_in,floor,sqft,...}]}
  const [analyzeError, setAnalyzeError] = useState("");

  // All confirmed areas across all pages
  const [confirmedAreas, setConfirmedAreas] = useState([]);
  const [adding, setAdding] = useState(false);

  // Project floors (for existing project mode)
  const [floorMap, setFloorMap] = useState({});
  const [projectFloors, setProjectFloors] = useState(FLOORS);

  const DRAFT_KEY = "drawing_draft";

  useEffect(()=>{
    if(isNewProject) return;
    supabase.from("floors").select("id,name").eq("project_id",projectId).order("order_index")
      .then(({data})=>{
        if(data?.length){
          const map={}; data.forEach(f=>map[f.name]=f.id);
          setFloorMap(map);
          setProjectFloors(data.map(f=>f.name));
        }
      });
  },[projectId]);

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
      s.onerror=rej;
      document.head.appendChild(s);
    });
  }

  async function handleUpload(e){
    const file=e.target.files?.[0];
    if(!file) return;
    setPdfLoading(true);
    setPageResults({}); setConfirmedAreas([]);
    try{
      const lib=await getPdfjs();
      const buf=await file.arrayBuffer();
      const doc=await lib.getDocument({data:buf}).promise;
      setPdfDoc(doc); setTotalPages(doc.numPages); setCurrentPage(1);
    }catch(err){ alert("Could not load PDF: "+err.message); }
    setPdfLoading(false);
    e.target.value="";
  }

  // Render page to canvas whenever page changes
  useEffect(()=>{ if(pdfDoc) renderPage(currentPage); },[pdfDoc,currentPage]);

  async function renderPage(n){
    if(!pdfDoc||!pdfCanvasRef.current) return;
    const page=await pdfDoc.getPage(n);
    const container=pdfCanvasRef.current.parentElement;
    const w=Math.min((container?.clientWidth||800)-24, 1200);
    const baseVp=page.getViewport({scale:1});
    const scale=w/baseVp.width;
    const vp=page.getViewport({scale});
    const cv=pdfCanvasRef.current;
    cv.width=vp.width; cv.height=vp.height;
    await page.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise;
  }

  // Export current canvas page to base64 PNG (at AI-friendly resolution)
  async function getPageBase64(n){
    if(!pdfDoc) throw new Error("No PDF loaded");
    const page=await pdfDoc.getPage(n);
    // Render at 150 DPI equivalent — good enough for Claude to read text/dimensions
    const baseVp=page.getViewport({scale:1});
    const scale=Math.min(1800/baseVp.width, 2); // max 1800px wide
    const vp=page.getViewport({scale});
    const offscreen=document.createElement("canvas");
    offscreen.width=vp.width; offscreen.height=vp.height;
    await page.render({canvasContext:offscreen.getContext("2d"),viewport:vp}).promise;
    // toDataURL returns "data:image/png;base64,XXXX" — strip the prefix
    return offscreen.toDataURL("image/jpeg",0.92).replace(/^data:image\/jpeg;base64,/,"");
  }

  async function analyzePage(pageNum){
    setAnalyzing(true); setAnalyzeError("");
    try{
      const imageBase64=await getPageBase64(pageNum);
      const resp=await fetch("/api/analyze-drawing",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({imageBase64, mediaType:"image/jpeg"}),
      });
      const json=await resp.json();
      if(json.error) throw new Error(json.error);
      const areas=(json.areas||[]).map((a,i)=>({
        ...a, id:Date.now()+i,
        // Map floor to a project floor if it exists
        floor: projectFloors.includes(a.floor)?a.floor:(projectFloors[0]||"Floor"),
        confirmed: false,
      }));
      setPageResults(prev=>({...prev,[pageNum]:areas}));
    }catch(err){
      setAnalyzeError(err.message||"Analysis failed");
    }
    setAnalyzing(false);
  }

  function updateResult(pageNum, id, field, value){
    setPageResults(prev=>({
      ...prev,
      [pageNum]:(prev[pageNum]||[]).map(a=>a.id===id?{...a,[field]:value}:a),
    }));
  }

  function removeResult(pageNum, id){
    setPageResults(prev=>({
      ...prev,
      [pageNum]:(prev[pageNum]||[]).filter(a=>a.id!==id),
    }));
  }

  // Collect all areas from all pages with sqft
  const allResults = Object.entries(pageResults).flatMap(([pg,areas])=>
    areas.map(a=>({...a,page:Number(pg)}))
  );
  const readyAreas = allResults.filter(a=>a.sqft>0);

  async function addToEstimate(){
    if(!readyAreas.length) return;
    setAdding(true);
    try{
      if(isNewProject){
        // Save to localStorage draft — will be imported when estimate is saved
        const existing=JSON.parse(localStorage.getItem(DRAFT_KEY)||"[]");
        const draft=readyAreas.map(a=>({
          areaType:a.area_type, floor:a.floor,
          sqft:a.sqft, thickness_in:a.thickness_in||"", page:a.page,
        }));
        localStorage.setItem(DRAFT_KEY,JSON.stringify([...existing,...draft]));
        setConfirmedAreas(prev=>[...prev,...draft]);
        setPageResults({});
      } else {
        // Insert directly into areas table
        const {data:{user}}=await supabase.auth.getUser();
        const {data:cd}=await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
        const inserts=readyAreas.map((a,i)=>({
          project_id:projectId,
          floor_id:floorMap[a.floor]||Object.values(floorMap)[0],
          company_id:cd?.id,
          area_type:a.area_type,
          thickness_in:a.thickness_in||null,
          sqft:a.sqft,
          order_index:Date.now()+i,
          material:null, r_value:null,
          options:[], paint_sqft:0, deduct_sqft:0,
        })).filter(a=>a.floor_id);
        if(inserts.length) await supabase.from("areas").insert(inserts);
        setConfirmedAreas(prev=>[...prev,...readyAreas.map(a=>({areaType:a.area_type,floor:a.floor,sqft:a.sqft,thickness_in:a.thickness_in||"",page:a.page}))]);
        setPageResults({});
      }
    }catch(err){ alert("Error: "+err.message); }
    setAdding(false);
  }

  const currResults = pageResults[currentPage]||[];

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>

      {/* HEADER */}
      <div style={{background:C.ink,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        <button onClick={()=>navigate(isNewProject?"/estimates":projectId?`/project/${projectId}`:"/estimates/search")}
          style={{border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← Back
        </button>
        <span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1}}>📐 Read Drawing Measurements</span>
        <label style={{background:C.blue,color:"#fff",padding:"7px 16px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>
          📄 Upload PDF
          <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
        </label>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>

        {/* LEFT — PDF viewer */}
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
                  {pageResults[pg]?.length>0&&(
                    <div style={{fontSize:9,color:"#059669"}}>✓ {pageResults[pg].length} areas</div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Page name + Analyze button */}
          {pdfDoc&&(
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#f8fafc",borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap"}}>
              <input value={pageNames[currentPage]||""} onChange={e=>setPageNames(p=>({...p,[currentPage]:e.target.value}))}
                placeholder={`Name this page (e.g. Attic, 1st Floor…)`}
                style={{height:28,border:`1px solid ${C.border}`,borderRadius:5,padding:"0 8px",fontSize:12,flex:1,minWidth:120}}/>
              <button onClick={()=>analyzePage(currentPage)} disabled={analyzing}
                style={{border:"none",background:analyzing?"#94a3b8":C.purple,color:"#fff",
                  padding:"6px 18px",borderRadius:6,cursor:analyzing?"default":"pointer",
                  fontSize:13,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>
                {analyzing?"🤖 Reading drawing…":"🤖 Read This Page"}
              </button>
            </div>
          )}

          {/* Error */}
          {analyzeError&&(
            <div style={{background:"#fef2f2",border:"1px solid #fecaca",padding:"8px 14px",fontSize:12,color:"#991b1b",flexShrink:0}}>
              ⚠️ {analyzeError}
              {analyzeError.includes("ANTHROPIC_API_KEY")&&(
                <span> — Add <b>ANTHROPIC_API_KEY</b> to your Vercel environment variables and redeploy.</span>
              )}
            </div>
          )}

          {/* PDF Canvas */}
          <div style={{flex:1,overflow:"auto",padding:12}}>
            {!pdfDoc&&!pdfLoading&&(
              <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                height:"100%",minHeight:360,border:"2px dashed #cbd5e1",borderRadius:12,cursor:"pointer",
                color:C.faint,gap:12}}>
                <div style={{fontSize:56}}>📄</div>
                <div style={{fontSize:18,fontWeight:700,color:C.muted}}>Upload a PDF floor plan</div>
                <div style={{fontSize:13,color:C.faint,textAlign:"center",lineHeight:1.6}}>
                  The AI reads the drawing and extracts area types,<br/>
                  stud sizes, and dimensions automatically.
                </div>
                <input type="file" accept="application/pdf" style={{display:"none"}} onChange={handleUpload}/>
              </label>
            )}
            {pdfLoading&&<div style={{textAlign:"center",padding:60,color:C.muted,fontSize:14}}>⏳ Loading PDF…</div>}
            {pdfDoc&&<canvas ref={pdfCanvasRef} style={{display:"block",maxWidth:"100%",borderRadius:6,border:`1px solid ${C.border}`}}/>}
          </div>

          {/* Instruction bar */}
          {pdfDoc&&!currResults.length&&!analyzing&&(
            <div style={{background:"#f0f9ff",borderTop:`1px solid #bae6fd`,padding:"7px 14px",fontSize:11,color:"#0369a1",flexShrink:0}}>
              Click <b>🤖 Read This Page</b> — the AI reads the dimensions, stud sizes, and area labels printed on the drawing and extracts them automatically.
            </div>
          )}
        </div>

        {/* RIGHT — Results panel */}
        <div style={{width:320,background:C.white,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
            {currResults.length>0?"Detected Areas — Review & Edit":"Waiting for Analysis"}
            {currResults.length>0&&(
              <span style={{background:C.blue,color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11}}>{currResults.length}</span>
            )}
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>

            {/* Confirmed areas (already added) */}
            {confirmedAreas.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,color:"#059669",textTransform:"uppercase",marginBottom:6}}>
                  ✓ Added to estimate ({confirmedAreas.length})
                </div>
                {confirmedAreas.map((a,i)=>(
                  <div key={i} style={{background:"#f0fdf4",borderRadius:6,border:"1px solid #86efac",padding:"6px 8px",marginBottom:4}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.ink}}>{a.areaType}</div>
                    <div style={{fontSize:10,color:C.muted}}>{a.floor}{a.thickness_in?` · ${a.thickness_in}`:""}</div>
                    <div style={{fontSize:12,fontWeight:800,color:"#059669"}}>{fmt(a.sqft)} ft²</div>
                  </div>
                ))}
              </div>
            )}

            {/* Analyzing spinner */}
            {analyzing&&(
              <div style={{textAlign:"center",padding:"30px 0",color:C.muted}}>
                <div style={{fontSize:32,marginBottom:8}}>🤖</div>
                <div style={{fontSize:13,fontWeight:600}}>Reading the drawing…</div>
                <div style={{fontSize:11,color:C.faint,marginTop:4}}>Claude is identifying areas, stud sizes, and dimensions</div>
              </div>
            )}

            {/* Current page results — editable */}
            {!analyzing&&currResults.length>0&&(
              <>
                <div style={{fontSize:10,color:C.faint,marginBottom:8,lineHeight:1.5}}>
                  Review each area. Edit anything the AI got wrong. Areas without sqft need manual entry.
                </div>
                {currResults.map(a=>(
                  <div key={a.id} style={{background:"#f8fafc",borderRadius:8,border:`1px solid ${a.sqft>0?"#86efac":C.border}`,
                    padding:"8px 10px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div style={{fontSize:11,fontWeight:700,color:a.sqft>0?"#059669":"#f59e0b"}}>
                        {a.sqft>0?`✓ ${fmt(a.sqft)} ft²`:"⚠ No dimensions found"}
                      </div>
                      <button onClick={()=>removeResult(currentPage,a.id)}
                        style={{border:"none",background:"none",color:"#ef4444",cursor:"pointer",fontSize:16,padding:0}}>✕</button>
                    </div>
                    {/* Area type */}
                    <select value={a.area_type||""} onChange={e=>updateResult(currentPage,a.id,"area_type",e.target.value)}
                      style={{...I,width:"100%",marginBottom:5}}>
                      {AREA_TYPES.map(t=><option key={t}>{t}</option>)}
                    </select>
                    {/* Row: thickness + floor */}
                    <div style={{display:"flex",gap:5,marginBottom:5}}>
                      <select value={a.thickness_in||""} onChange={e=>updateResult(currentPage,a.id,"thickness_in",e.target.value)}
                        style={{...I,flex:1}}>
                        <option value="">Thickness</option>
                        {THICK_OPTS.map(t=><option key={t}>{t}</option>)}
                      </select>
                      <select value={a.floor||""} onChange={e=>updateResult(currentPage,a.id,"floor",e.target.value)}
                        style={{...I,flex:1}}>
                        {(projectFloors.length>0?projectFloors:FLOORS).map(f=><option key={f}>{f}</option>)}
                      </select>
                    </div>
                    {/* sqft — editable */}
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <input type="number" placeholder="Enter sqft if not detected"
                        value={a.sqft||""} onChange={e=>updateResult(currentPage,a.id,"sqft",Number(e.target.value))}
                        style={{...I,flex:1}}/>
                      <span style={{fontSize:11,color:C.muted}}>ft²</span>
                    </div>
                    {/* Notes from AI */}
                    {a.notes&&(
                      <div style={{fontSize:9,color:C.faint,marginTop:4,lineHeight:1.4}}>
                        💬 {a.notes}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {!analyzing&&!currResults.length&&confirmedAreas.length===0&&(
              <div style={{color:C.faint,fontSize:11,textAlign:"center",padding:"24px 8px",lineHeight:1.8}}>
                Upload a PDF floor plan, then click<br/>
                <b>🤖 Read This Page</b> above the drawing.
              </div>
            )}
          </div>

          {/* Bottom action */}
          <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`}}>
            {readyAreas.length>0&&(
              <>
                <div style={{fontSize:11,color:C.muted,marginBottom:8}}>
                  <b>{readyAreas.length}</b> area{readyAreas.length>1?"s":""} ready ·{" "}
                  <b>{fmt(readyAreas.reduce((s,a)=>s+(a.sqft||0),0))} ft²</b> total
                </div>
                <button onClick={addToEstimate} disabled={adding}
                  style={{width:"100%",background:adding?"#94a3b8":C.purple,color:"#fff",border:"none",
                    padding:"11px",borderRadius:8,cursor:adding?"default":"pointer",
                    fontSize:14,fontWeight:800,marginBottom:6}}>
                  {adding?"Adding…":"✓ Add to Estimate"}
                </button>
                {isNewProject&&(
                  <button onClick={()=>navigate("/job/new?from_drawing=1")}
                    style={{width:"100%",background:C.ink,color:"#fff",border:"none",
                      padding:"9px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700}}>
                    Start Estimate →
                  </button>
                )}
                {!isNewProject&&confirmedAreas.length>0&&(
                  <button onClick={()=>navigate(`/project/${projectId}`)}
                    style={{width:"100%",background:C.ink,color:"#fff",border:"none",
                      padding:"9px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700}}>
                    ← Back to Estimate
                  </button>
                )}
              </>
            )}
            {readyAreas.length===0&&confirmedAreas.length>0&&(
              <button onClick={()=>navigate(isNewProject?"/job/new?from_drawing=1":`/project/${projectId}`)}
                style={{width:"100%",background:C.ink,color:"#fff",border:"none",
                  padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700}}>
                {isNewProject?"Start Estimate →":"← Back to Estimate"}
              </button>
            )}
            <div style={{fontSize:10,color:C.faint,marginTop:6,textAlign:"center",lineHeight:1.4}}>
              After adding, open each area card to set material + R-value
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
