import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

// ── Constants ─────────────────────────────────────────────────────────────────
const SCALES = [
  { label:'1/8" = 1ft',  pxPerFt: null, ratio: 1/8  },
  { label:'3/16" = 1ft', pxPerFt: null, ratio: 3/16 },
  { label:'1/4" = 1ft',  pxPerFt: null, ratio: 1/4  },
  { label:'3/8" = 1ft',  pxPerFt: null, ratio: 3/8  },
  { label:'1/2" = 1ft',  pxPerFt: null, ratio: 1/2  },
  { label:'1" = 1ft',    pxPerFt: null, ratio: 1    },
];

const AREA_TYPES = [
  "Roof Rafter w/ Strapping","Roof Rafter behind knee walls","Attic Floor",
  "Exterior Wall","Demising Wall","Rim Joist","Concrete Wall",
  "Ceiling","Interior Walls","Fire Blocking","Other",
];
const THICK_OPTS = ["2x3","2x4","2x6","2x8","2x10","2x12","I-joist","14in","16in"];
const R_VALS     = ["R-11","R-13","R-14","R-15","R-19","R-21","R-25","R-30","R-38","R-49","R-60"];
const OC_OPTS    = ['3"cc','7"oc','8"oc','12"oc','16"oc','24"oc','open cell'];
const FLOORS_DEFAULT = ["Attic","3rd Floor","2nd Floor","1st Floor","Basement","Crawlspace"];

const C = {
  ink:"#0f172a", white:"#fff", muted:"#64748b", faint:"#94a3b8",
  border:"#e2e8f0", green:"#059669", bg:"#f4f5f7",
};
const I = { height:32, fontSize:12, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 8px", boxSizing:"border-box", color:C.ink, outline:"none" };
const S = { ...I, padding:"0 4px" };
const Btn = { height:32, fontSize:12, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 10px", cursor:"pointer", color:C.ink,
  display:"inline-flex", alignItems:"center" };
const BtnD = { ...Btn, border:"none", background:C.ink, color:"#fff", fontWeight:600 };

function fmt(n){ return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0}); }

// ── Drawing Canvas ─────────────────────────────────────────────────────────────
function DrawingCanvas({ imageUrl, scaleRatio, onMeasure, screenDpi=96 }) {
  const canvasRef   = useRef(null);
  const imgRef      = useRef(null);
  const [points, setPoints]   = useState([]); // [{x,y}]
  const [measuring, setMeasuring] = useState(false);
  const [result, setResult]   = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // draw image + points + line
  useEffect(()=>{
    const canvas = canvasRef.current;
    if(!canvas || !imgLoaded) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);

    points.forEach((p,i)=>{
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
      ctx.fillStyle = i===0 ? "#3b82f6" : "#ef4444";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    if(points.length===2){
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 2;
      ctx.setLineDash([6,3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  },[points, imgLoaded]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touch = e.touches?.[0] || e;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top)  * scaleY,
    };
  }

  function handleTap(e) {
    if(!measuring) return;
    e.preventDefault();
    const pos = getPos(e);
    const newPoints = [...points, pos].slice(-2);
    setPoints(newPoints);

    if(newPoints.length===2){
      const dx = newPoints[1].x - newPoints[0].x;
      const dy = newPoints[1].y - newPoints[0].y;
      const pixelDist = Math.sqrt(dx*dx + dy*dy);
      // convert pixels to inches on screen, then to feet using scale
      const screenInches = pixelDist / screenDpi;
      const feet = screenInches / scaleRatio;
      const rounded = Math.round(feet * 10) / 10;
      setResult(rounded);
      setMeasuring(false);
    }
  }

  function startMeasure() {
    setPoints([]); setResult(null); setMeasuring(true);
  }

  function useMeasurement() {
    if(result) onMeasure(result);
    setPoints([]); setResult(null);
  }

  return (
    <div style={{position:"relative"}}>
      <img ref={imgRef} src={imageUrl} style={{display:"none"}}
        onLoad={()=>{
          const canvas = canvasRef.current;
          const img = imgRef.current;
          canvas.width  = img.naturalWidth;
          canvas.height = img.naturalHeight;
          setImgLoaded(true);
        }} />

      <canvas ref={canvasRef}
        style={{ width:"100%", borderRadius:8, border:`1px solid ${C.border}`,
          cursor: measuring ? "crosshair" : "default",
          touchAction: measuring ? "none" : "auto" }}
        onClick={handleTap}
        onTouchEnd={handleTap}
      />

      <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center",
          flexWrap:"wrap" }}>
        <button onClick={startMeasure}
          style={{...BtnD, background: measuring?"#ef4444":"#3b82f6", height:34}}>
          {measuring ? "🔴 Tap 2 points…" : "📏 Measure"}
        </button>
        {result!==null && (
          <>
            <span style={{fontSize:13,fontWeight:700,color:C.ink}}>
              = {result} ft
            </span>
            <button onClick={useMeasurement}
              style={{...BtnD, background:"#059669", height:34}}>
              Use {result} ft
            </button>
            <button onClick={()=>{setPoints([]);setResult(null);}}
              style={{...Btn, height:34}}>
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Area Row ──────────────────────────────────────────────────────────────────
function AreaRowDrawing({ area, onChange, onDelete }) {
  const [open, setOpen] = useState(true);

  const isComplete = !!(area.area_type && area.material && area.sqft > 0);

  if(isComplete && !open) return (
    <div style={{ background:"#f0fdf4", border:"1px solid #86efac",
        borderLeft:"3px solid #059669", borderRadius:7,
        padding:"6px 10px", marginBottom:4,
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div>
        <div style={{ fontSize:12, fontWeight:700 }}>{area.area_type}</div>
        <div style={{ fontSize:10, color:C.muted }}>
          {[area.material,area.thickness_in,area.r_value,area.oc].filter(Boolean).join(" · ")}
          {" · "}{fmt(area.sqft)} ft²
        </div>
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <button onClick={()=>setOpen(true)}
          style={{...Btn, fontSize:11}}>✏️</button>
        <button onClick={onDelete}
          style={{...Btn, color:C.faint, fontSize:13}}>✕</button>
      </div>
    </div>
  );

  return (
    <div style={{ background: isComplete?"#f0fdf4":"#fafbfc",
        border:`1px solid ${isComplete?"#86efac":C.border}`,
        borderLeft: isComplete?"3px solid #059669":`1px solid ${C.border}`,
        borderRadius:7, padding:"8px 10px", marginBottom:6 }}>

      {isComplete && (
        <div onClick={()=>setOpen(false)}
          style={{ margin:"-8px -10px 8px", padding:"8px 12px",
            background:"#059669", borderRadius:"7px 7px 0 0",
            display:"flex", justifyContent:"space-between",
            cursor:"pointer", color:"white", fontSize:12, fontWeight:700 }}>
          <span>✓ Done editing</span><span>▼</span>
        </div>
      )}

      <div style={{ display:"flex", gap:4, marginBottom:4 }}>
        <select style={{...S, flex:2}} value={area.area_type||""}
          onChange={e=>onChange("area_type",e.target.value)}>
          <option value="">Area type</option>
          {AREA_TYPES.map(a=><option key={a}>{a}</option>)}
        </select>
        <button onClick={onDelete}
          style={{...Btn, color:C.faint, fontSize:14, padding:"0 6px"}}>✕</button>
      </div>

      <select style={{...S, width:"100%", marginBottom:4}} value={area.material||""}
        onChange={e=>onChange("material",e.target.value)}>
        <option value="">Material</option>
        {["Open Cell","Closed Cell","Blown Fiberglass","Blown Cellulose",
          "Batt Fiberglass","Rigid Foam","Other"].map(m=>(
          <option key={m}>{m}</option>
        ))}
      </select>

      <div style={{ display:"flex", gap:4, marginBottom:4 }}>
        <select style={{...S, flex:1}} value={area.thickness_in||""}
          onChange={e=>onChange("thickness_in",e.target.value)}>
          <option value="">Thick</option>
          {THICK_OPTS.map(t=><option key={t}>{t}</option>)}
        </select>
        <select style={{...S, flex:1}} value={area.r_value||""}
          onChange={e=>onChange("r_value",e.target.value)}>
          <option value="">R-Val</option>
          {R_VALS.map(r=><option key={r}>{r}</option>)}
        </select>
        <select style={{...S, flex:1}} value={area.oc||""}
          onChange={e=>onChange("oc",e.target.value)}>
          <option value="">OC</option>
          {OC_OPTS.map(o=><option key={o}>{o}</option>)}
        </select>
      </div>

      {/* measurements */}
      <div style={{ display:"flex", gap:4, marginBottom:4, alignItems:"center" }}>
        <input placeholder="H (ft)" inputMode="decimal" value={area.mh||""}
          onChange={e=>onChange("mh",e.target.value)}
          style={{...I, flex:1, textAlign:"center"}} />
        <span style={{color:C.faint}}>×</span>
        <input placeholder="L (ft)" inputMode="decimal" value={area.ml||""}
          onChange={e=>onChange("ml",e.target.value)}
          style={{...I, flex:1, textAlign:"center"}} />
        <span style={{color:C.faint}}>×</span>
        <input placeholder="1" inputMode="decimal" value={area.mq||""}
          onChange={e=>onChange("mq",e.target.value)}
          style={{...I, width:40, textAlign:"center"}} />
        <button onClick={()=>{
            const h=parseFloat(area.mh)||0, l=parseFloat(area.ml)||0, q=parseFloat(area.mq)||1;
            if(!h||!l) return;
            const sqft = Math.round(h*l*q);
            const meas = [...(area.measurements||[]),{h,l,q,sqft}];
            const total = meas.reduce((s,m)=>s+m.sqft,0);
            onChange("measurements",meas); onChange("sqft",total);
            onChange("mh",""); onChange("ml",""); onChange("mq","1");
          }}
          style={{...BtnD, padding:"0 8px", height:32}}>+</button>
      </div>

      {/* chips */}
      {(area.measurements||[]).length>0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginBottom:4 }}>
          {area.measurements.map((m,i)=>(
            <span key={i} style={{ background:"#dcfce7", borderRadius:4,
                padding:"2px 6px", fontSize:10, color:C.muted,
                display:"inline-flex", alignItems:"center", gap:3 }}>
              {m.h}×{m.l}{m.q>1?`×${m.q}`:""} = <b>{m.sqft}</b>ft²
              <button onClick={()=>{
                  const meas=(area.measurements||[]).filter((_,j)=>j!==i);
                  onChange("measurements",meas);
                  onChange("sqft",meas.reduce((s,x)=>s+x.sqft,0));
                }}
                style={{border:"none",background:"none",cursor:"pointer",
                  color:C.faint,fontSize:11,padding:0}}>✕</button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"flex-end", fontSize:11,
          fontWeight:700, color:C.green }}>
        {area.sqft>0 && `${fmt(area.sqft)} ft²`}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EstimateDrawings() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const leadId         = searchParams.get("leadId");

  const [step, setStep]         = useState(1); // 1=upload, 2=measure
  const [imageUrl, setImageUrl] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [scaleIdx, setScaleIdx] = useState(2); // default 1/4"=1ft
  const [lastMeasure, setLastMeasure] = useState(null);

  const [activeFloor, setActiveFloor] = useState("1st Floor");
  const [floors, setFloors]   = useState(FLOORS_DEFAULT);
  const [areas, setAreas]     = useState(()=>{
    const o={}; FLOORS_DEFAULT.forEach(f=>{o[f]=[]}); return o;
  });
  const [newFloorName, setNewFloorName] = useState("");
  const [addingFloor, setAddingFloor]   = useState(false);

  // customer
  const [leads, setLeads]           = useState([]);
  const [query, setQuery]           = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedLeadId, setSelectedLeadId] = useState(leadId||"");
  const [projectAddress, setProjectAddress] = useState("");
  const [saving, setSaving]         = useState(false);
  const [savedId, setSavedId]       = useState(null);

  useEffect(()=>{
    supabase.from("customers").select("id,name,phone,address,company_name")
      .order("name").then(({data})=>{ if(data) setLeads(data); });
  },[]);

  useEffect(()=>{
    if(leadId && leads.length>0){
      const l = leads.find(l=>String(l.id)===String(leadId));
      if(l){ setSelectedLead(l); setSelectedLeadId(String(l.id));
        setProjectAddress(l.address||""); }
    }
  },[leadId,leads]);

  const results = query.trim().length>=1
    ? leads.filter(l=>(l.name||"").toLowerCase().includes(query.toLowerCase())||
        (l.phone||"").includes(query)).slice(0,5)
    : [];

  function handleFile(e) {
    const file = e.target.files[0];
    if(!file) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setStep(2);
  }

  function addArea() {
    setAreas(p=>({...p,[activeFloor]:[
      ...( p[activeFloor]||[]),
      { temp_id:Date.now(), area_type:"", material:"", thickness_in:"",
        r_value:"", oc:"", sqft:0, measurements:[], mh:"", ml:"", mq:"1" }
    ]}));
  }

  function updateArea(floor,idx,field,value) {
    setAreas(p=>{
      const upd=[...(p[floor]||[])];
      upd[idx]={...upd[idx],[field]:value};
      return {...p,[floor]:upd};
    });
  }

  function deleteArea(floor,idx) {
    setAreas(p=>({...p,[floor]:p[floor].filter((_,i)=>i!==idx)}));
  }

  // when measure tool returns a value, pre-fill last empty L or H
  function onMeasure(feet) {
    setLastMeasure(feet);
    // try to fill the last area's H or L
    const currentAreas = areas[activeFloor]||[];
    if(!currentAreas.length) return;
    const last = currentAreas[currentAreas.length-1];
    const idx  = currentAreas.length-1;
    if(!last.mh){ updateArea(activeFloor,idx,"mh",String(feet)); }
    else if(!last.ml){ updateArea(activeFloor,idx,"ml",String(feet)); }
  }

  const floorTotal = (floor) =>
    (areas[floor]||[]).reduce((s,a)=>s+(a.sqft||0),0);
  const projectTotal = floors.reduce((s,f)=>s+floorTotal(f),0);

  async function saveProject() {
    if(saving) return;  // prevent double-tap
    if(!selectedLeadId){ alert("Please select a customer"); return; }
    const hasAreas = floors.some(f=>(areas[f]||[]).some(a=>a.area_type&&a.sqft>0));
    if(!hasAreas){ alert("Add at least one area"); return; }
    setSaving(true);
    try {
      // get company_id
      const { data:{ user } } = await supabase.auth.getUser();
      const { data:companyData } = await supabase.from("companies")
        .select("id").eq("user_id", user.id).maybeSingle();
      const companyId = companyData?.id || null;

      const {data:proj,error:pe} = await supabase.from("projects").insert([{
        lead_id: Number(selectedLeadId),
        name: selectedLead?.name||"Drawing Estimate",
        address: projectAddress||"",
        status:"Active", source:"drawings", company_id:companyId,
      }]).select().single();
      if(pe) throw pe;

      const {data:floorRows} = await supabase.from("floors")
        .insert(floors.map((name,i)=>({project_id:proj.id,name,order_index:i+1}))).select();
      const floorMap={};
      (floorRows||[]).forEach(f=>{floorMap[f.name]=f.id;});

      const allAreas = floors.flatMap(floor=>
        (areas[floor]||[]).filter(a=>a.area_type&&a.sqft>0).map((a,i)=>({
          project_id:proj.id, floor_id:floorMap[floor],
          area_type:a.area_type, material:a.material,
          thickness_in:a.thickness_in||null, r_value:a.r_value,
          sqft:a.sqft, qty:a.sqft, unit:"sqft",
          unit_price:0, line_total:0, order_index:i,
        }))
      );
      if(allAreas.length>0) await supabase.from("areas").insert(allAreas);

      await supabase.from("quotes").insert([{
        project_id:proj.id, subtotal:0,
        tax_rate:0, tax_total:0, grand_total:0, status:"Draft",
      }]);

      setSavedId(proj.id);
    } catch(err){
      alert("Error: "+(err.message||JSON.stringify(err)));
    }
    setSaving(false);
  }

  const scaleRatio = SCALES[scaleIdx].ratio;

  return (
    <div style={{ fontFamily:"system-ui,sans-serif", background:C.bg,
        minHeight:"100%", display:"flex", flexDirection:"column" }}>

      {/* top bar */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:C.white,
          borderBottom:`1px solid ${C.border}`, padding:"8px 12px",
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontWeight:700, fontSize:14 }}>
          {selectedLead?.name||"Estimate by Drawings"}
        </span>
        <div style={{ display:"flex", gap:6 }}>
          {savedId && (
            <>
              <button onClick={()=>navigate(`/field-report/${savedId}`)}
                style={{...BtnD, background:"#3b82f6", height:32, fontSize:12}}>
                📋 Office
              </button>
              <button onClick={()=>navigate(`/quote/${savedId}`)}
                style={{...BtnD, background:"#f97316", height:32, fontSize:12}}>
                📄 Quote
              </button>
            </>
          )}
          <button onClick={saveProject} disabled={saving}
            style={{...BtnD, height:32, fontSize:13, padding:"0 14px",
              background:saving?"#64748b":C.ink}}>
            {saving?"…":"Save"}
          </button>
        </div>
      </div>

      <div style={{ padding:"10px 12px", overflowY:"auto", flex:1,
          paddingBottom:40 }}>

        {/* customer */}
        <div style={{ background:"#eff6ff", border:"1.5px solid #93c5fd",
            borderRadius:8, padding:"8px 10px", marginBottom:8 }}>
          {selectedLead ? (
            <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:13 }}>{selectedLead.name}</div>
                <div style={{ fontSize:11, color:C.muted }}>{selectedLead.phone}</div>
              </div>
              <button onClick={()=>{ setSelectedLead(null); setSelectedLeadId(""); setQuery(""); }}
                style={{...Btn, fontSize:12}}>✕</button>
            </div>
          ) : (
            <div>
              <div style={{ display:"flex", gap:6, marginBottom: results.length?6:0 }}>
                <input placeholder="Search customer…" value={query}
                  onChange={e=>setQuery(e.target.value)}
                  style={{...I, flex:1}} />
              </div>
              {results.map(l=>(
                <div key={l.id} onClick={()=>{ setSelectedLead(l);
                    setSelectedLeadId(String(l.id)); setQuery("");
                    setProjectAddress(l.address||""); }}
                  style={{ padding:"8px 10px", background:C.white,
                    borderRadius:6, marginBottom:3, cursor:"pointer",
                    border:`1px solid ${C.border}` }}>
                  <div style={{ fontWeight:600, fontSize:12 }}>{l.name}</div>
                  <div style={{ fontSize:11, color:C.faint }}>{l.phone}</div>
                </div>
              ))}
            </div>
          )}
          {selectedLead && (
            <input placeholder="Job address" value={projectAddress}
              onChange={e=>setProjectAddress(e.target.value)}
              style={{...I, width:"100%", marginTop:6}} />
          )}
        </div>

        {/* drawing upload */}
        <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa",
            borderRadius:8, padding:"8px 10px", marginBottom:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:imageUrl?8:0 }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#92400e" }}>
              📐 Drawing / Blueprint
            </span>
            <label style={{ ...BtnD, background:"#f97316",
                height:28, fontSize:11, cursor:"pointer" }}>
              {imageUrl?"Change":"Upload"}
              <input type="file" accept="image/*,application/pdf"
                onChange={handleFile} style={{ display:"none" }} />
            </label>
          </div>

          {imageUrl && (
            <>
              {/* scale selector */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:600, color:C.muted }}>Scale:</span>
                <select value={scaleIdx} onChange={e=>setScaleIdx(Number(e.target.value))}
                  style={{...S, flex:1}}>
                  {SCALES.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
                </select>
                {lastMeasure && (
                  <span style={{ fontSize:11, color:"#059669", fontWeight:700 }}>
                    Last: {lastMeasure}ft
                  </span>
                )}
              </div>

              <DrawingCanvas
                imageUrl={imageUrl}
                scaleRatio={scaleRatio}
                onMeasure={onMeasure}
              />
            </>
          )}

          {!imageUrl && (
            <div style={{ textAlign:"center", padding:"12px 0",
                fontSize:12, color:C.faint }}>
              Upload a PDF or photo of the floor plan
            </div>
          )}
        </div>

        {/* floor tabs */}
        <div style={{ display:"flex", gap:4, overflowX:"auto", paddingBottom:4,
            marginBottom:6, WebkitOverflowScrolling:"touch", alignItems:"center" }}>
          {floors.map(floor=>{
            const act = activeFloor===floor;
            const tot = floorTotal(floor);
            return (
              <button key={floor} onClick={()=>setActiveFloor(floor)}
                style={{ flexShrink:0, padding:"6px 12px", borderRadius:6, height:"auto",
                  border: act?"2px solid #059669":"1.5px solid #86efac",
                  background: act?"#059669":C.white, color: act?"#fff":"#059669",
                  cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>
                {floor}
                {tot>0 && <span style={{ marginLeft:3, fontSize:9, opacity:0.8 }}>
                  {fmt(tot)}ft²</span>}
              </button>
            );
          })}
          {addingFloor ? (
            <div style={{ display:"flex", gap:3, flexShrink:0 }}>
              <input autoFocus placeholder="Name" value={newFloorName}
                onChange={e=>setNewFloorName(e.target.value)}
                onKeyDown={e=>{
                  if(e.key==="Enter"){
                    const n=newFloorName.trim(); if(!n) return;
                    setFloors(p=>[...p,n]); setAreas(p=>({...p,[n]:[]}));
                    setActiveFloor(n); setNewFloorName(""); setAddingFloor(false);
                  }
                  if(e.key==="Escape") setAddingFloor(false);
                }}
                style={{...I, width:80}} />
              <button onClick={()=>{
                  const n=newFloorName.trim(); if(!n) return;
                  setFloors(p=>[...p,n]); setAreas(p=>({...p,[n]:[]}));
                  setActiveFloor(n); setNewFloorName(""); setAddingFloor(false);
                }}
                style={{...BtnD, padding:"0 8px"}}>✓</button>
              <button onClick={()=>setAddingFloor(false)}
                style={{...Btn, padding:"0 6px"}}>✕</button>
            </div>
          ) : (
            <button onClick={()=>setAddingFloor(true)}
              style={{ flexShrink:0, padding:"6px 10px", borderRadius:6, height:"auto",
                border:"1px dashed #86efac", background:"none", color:"#059669",
                cursor:"pointer", fontSize:12, fontWeight:700 }}>
              + Floor
            </button>
          )}
        </div>

        {/* add area button */}
        <button onClick={addArea}
          style={{ width:"100%", padding:"8px", borderRadius:7,
            border:`1px dashed ${C.border}`, background:C.white, color:C.muted,
            cursor:"pointer", fontSize:12, fontWeight:600, marginBottom:6, height:"auto" }}>
          + Add area to {activeFloor}
        </button>

        {/* area list */}
        {(areas[activeFloor]||[]).length===0 ? (
          <div style={{ textAlign:"center", padding:14, color:C.faint, fontSize:12,
              background:C.white, borderRadius:7, border:`1px solid ${C.border}` }}>
            No areas for {activeFloor} — tap above to add
          </div>
        ) : (areas[activeFloor]||[]).map((area,idx)=>(
          <AreaRowDrawing key={area.temp_id||idx} area={area}
            onChange={(field,value)=>updateArea(activeFloor,idx,field,value)}
            onDelete={()=>deleteArea(activeFloor,idx)} />
        ))}

        {/* floor subtotal */}
        {floorTotal(activeFloor)>0 && (
          <div style={{ display:"flex", justifyContent:"space-between",
              padding:"6px 10px", background:C.white, borderRadius:6,
              border:`1px solid ${C.border}`, marginTop:4, fontSize:12 }}>
            <span style={{ color:C.muted, fontWeight:600 }}>{activeFloor} total</span>
            <span style={{ fontWeight:700 }}>{fmt(floorTotal(activeFloor))} ft²</span>
          </div>
        )}

        {/* project total */}
        {projectTotal>0 && (
          <div style={{ display:"flex", justifyContent:"space-between",
              padding:"8px 12px", background:C.ink, borderRadius:8,
              marginTop:6, fontSize:13 }}>
            <span style={{ color:"#94a3b8", fontWeight:600 }}>Total</span>
            <span style={{ fontWeight:800, color:"#fff" }}>
              {fmt(projectTotal)} ft²
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
