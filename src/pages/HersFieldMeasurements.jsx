import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const C = {
  bg:"#f4f5f7", white:"#fff", ink:"#0f172a",
  muted:"#64748b", faint:"#94a3b8",
  border:"#e2e8f0", green:"#059669",
};
const I = {
  height:32, fontSize:13, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 8px", boxSizing:"border-box",
  color:C.ink, outline:"none", width:"100%",
};
const Btn = {
  height:32, fontSize:12, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 12px", cursor:"pointer", color:C.ink,
  whiteSpace:"nowrap", fontWeight:600,
};
const BtnD = {
  height:32, fontSize:12, borderRadius:6, border:"none",
  background:C.ink, padding:"0 14px", cursor:"pointer", color:"#fff",
  whiteSpace:"nowrap", fontWeight:700, display:"inline-flex", alignItems:"center",
};
const CARD = {
  background:C.white, borderRadius:10, border:`1px solid ${C.border}`,
  padding:"14px 16px", marginBottom:12,
};
const lbl = { fontSize:9, color:C.faint, fontWeight:700, textTransform:"uppercase", marginBottom:2 };

const ORIENTATIONS = ["N","NE","E","SE","S","SW","W","NW"];

const HERS_AREA_TYPES = [
  "Slab","Basement Floor","Basement Walls","Garage Ceiling",
  "Crawl Space Floor","Crawl Space Walls","Attic Floor","Cathedral Ceiling",
  "Knee Walls","Bonus Room Ceiling","Bonus Room Walls","Other",
];

// Map insulation area_type → HERS area type
const INSULATION_TO_HERS = {
  "Roof Rafter w/ Strapping": "Cathedral Ceiling",
  "Roof Rafter behind knee walls": "Knee Walls",
  "Attic Floor": "Attic Floor",
  "Exterior Wall": null, // goes to wall segments
  "Demising Wall": null,
  "Rim Joist": null, // goes to rim joist segments
  "Concrete Wall": "Basement Walls",
  "Ceiling": "Attic Floor",
  "Interior Walls": null,
  "Fire Blocking": null,
  "Other": "Other",
};

function fmt(n, dec=1) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function parseArr(v) {
  return Array.isArray(v) ? v : (typeof v==="string" ? JSON.parse(v||"[]") : []);
}
function uid() { return Date.now() + Math.random(); }
function withId(x) { return { ...x, id: x.id||uid() }; }

// --- Segment list with height (area = height × length per segment) ---
function SegmentList({ title, segments, onChange }) {
  function add(){ onChange([...segments, { id:uid(), label:`Segment ${segments.length+1}`, height:"", length:"" }]); }
  function upd(idx,f,v){ onChange(segments.map((s,i)=>i===idx?{...s,[f]:v}:s)); }
  function rem(idx){ onChange(segments.filter((_,i)=>i!==idx)); }
  const totalArea = segments.reduce((s,x)=>(s+(Number(x.height)||0)*(Number(x.length)||0)),0);
  const totalLen  = segments.reduce((s,x)=>s+(Number(x.length)||0),0);
  return (
    <div style={CARD}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>{title}</div>
        <div style={{textAlign:"right",fontSize:12}}>
          <span style={{color:C.green,fontWeight:700}}>{fmt(totalArea)} ft²</span>
          <span style={{color:C.faint,marginLeft:8}}>{fmt(totalLen)} ft</span>
        </div>
      </div>
      {segments.map((s,idx)=>{
        const area = (Number(s.height)||0)*(Number(s.length)||0);
        return (
          <div key={s.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:6}}>
            <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
              <input value={s.label} onChange={e=>upd(idx,"label",e.target.value)} placeholder="Label" style={{...I,flex:1,fontSize:12}} />
              <button onClick={()=>rem(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:6,alignItems:"end"}}>
              <div><div style={lbl}>Height (ft)</div><input type="number" value={s.height} onChange={e=>upd(idx,"height",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
              <div><div style={lbl}>Length (ft)</div><input type="number" value={s.length} onChange={e=>upd(idx,"length",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
              <div style={{fontSize:11,color:C.green,fontWeight:700,paddingBottom:6,textAlign:"right"}}>{fmt(area)} ft²</div>
            </div>
          </div>
        );
      })}
      <button onClick={add} style={{...Btn,marginTop:4}}>+ Add Segment</button>
    </div>
  );
}

// --- Floors editor (CFA + Volume) ---
function FloorsEditor({ floors, onChange }) {
  function add(){ onChange([...floors, { id:uid(), label:`Floor ${floors.length+1}`, width:"", length:"", height:"" }]); }
  function upd(idx,f,v){ onChange(floors.map((fl,i)=>i===idx?{...fl,[f]:v}:fl)); }
  function rem(idx){ onChange(floors.filter((_,i)=>i!==idx)); }
  const totalCFA = floors.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0),0);
  const totalVol = floors.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0)*(Number(f.height)||0),0);
  return (
    <div style={CARD}>
      <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
        Floors / Levels — CFA &amp; Volume
      </div>
      {floors.map((f,idx)=>{
        const cfa=(Number(f.width)||0)*(Number(f.length)||0);
        const vol=cfa*(Number(f.height)||0);
        return (
          <div key={f.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
            <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
              <input value={f.label} onChange={e=>upd(idx,"label",e.target.value)} placeholder="e.g. 1st Floor" style={{...I,flex:1,fontSize:12}} />
              <button onClick={()=>rem(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:4}}>
              <div><div style={lbl}>Width (ft)</div><input type="number" value={f.width} onChange={e=>upd(idx,"width",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
              <div><div style={lbl}>Length (ft)</div><input type="number" value={f.length} onChange={e=>upd(idx,"length",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
              <div><div style={lbl}>Height (ft)</div><input type="number" value={f.height} onChange={e=>upd(idx,"height",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted}}>
              <span>CFA: <b style={{color:C.green}}>{fmt(cfa)} ft²</b></span>
              <span>Volume: <b style={{color:C.green}}>{fmt(vol)} ft³</b></span>
            </div>
          </div>
        );
      })}
      <button onClick={add} style={Btn}>+ Add Floor/Level</button>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,
          borderTop:`1px solid ${C.border}`,fontSize:13,fontWeight:700}}>
        <span>Total CFA: <span style={{color:C.green}}>{fmt(totalCFA)} ft²</span></span>
        <span>Total Volume: <span style={{color:C.green}}>{fmt(totalVol)} ft³</span></span>
      </div>
    </div>
  );
}

// --- Flexible areas editor (slab, basement, etc.) with width × length pairs ---
function AreasEditor({ areas, onChange }) {
  const [newType, setNewType] = useState("");
  const [customType, setCustomType] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  function addArea(){
    const t = showCustom ? customType.trim() : newType;
    if(!t) return;
    onChange([...areas, { id:uid(), type:t, dims:[] }]);
    setNewType(""); setCustomType(""); setShowCustom(false);
  }
  function removeArea(idx){ onChange(areas.filter((_,i)=>i!==idx)); }
  function addDim(aIdx){
    onChange(areas.map((a,i)=>i===aIdx?{...a,dims:[...a.dims,{id:uid(),width:"",length:"",qty:"1"}]}:a));
  }
  function updDim(aIdx,dIdx,f,v){
    onChange(areas.map((a,i)=>i===aIdx?{...a,dims:a.dims.map((d,j)=>j===dIdx?{...d,[f]:v}:d)}:a));
  }
  function remDim(aIdx,dIdx){
    onChange(areas.map((a,i)=>i===aIdx?{...a,dims:a.dims.filter((_,j)=>j!==dIdx)}:a));
  }

  return (
    <div>
      {areas.map((a,aIdx)=>{
        const totalSqft = a.dims.reduce((s,d)=>(s+(Number(d.width)||0)*(Number(d.length)||0)*(Number(d.qty)||1)),0);
        return (
          <div key={a.id} style={CARD}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>{a.type}</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:13,fontWeight:700,color:C.green}}>{fmt(totalSqft)} ft²</span>
                <button onClick={()=>removeArea(aIdx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:13}}>✕ Remove</button>
              </div>
            </div>
            {a.dims.map((d,dIdx)=>{
              const area=(Number(d.width)||0)*(Number(d.length)||0)*(Number(d.qty)||1);
              return (
                <div key={d.id} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                  <input type="number" value={d.width} onChange={e=>updDim(aIdx,dIdx,"width",e.target.value)}
                    placeholder="Width" style={{...I,textAlign:"right",fontSize:12}} />
                  <span style={{color:C.faint,flexShrink:0,fontSize:13}}>×</span>
                  <input type="number" value={d.length} onChange={e=>updDim(aIdx,dIdx,"length",e.target.value)}
                    placeholder="Length" style={{...I,textAlign:"right",fontSize:12}} />
                  <span style={{color:C.faint,flexShrink:0,fontSize:11}}>ft</span>
                  <input type="number" value={d.qty} onChange={e=>updDim(aIdx,dIdx,"qty",e.target.value)}
                    placeholder="×1" style={{...I,width:52,textAlign:"center",fontSize:12,flexShrink:0}} title="Quantity (how many of this size)" />
                  <span style={{fontSize:11,color:C.green,fontWeight:700,flexShrink:0,minWidth:54,textAlign:"right"}}>{fmt(area)} ft²</span>
                  <button onClick={()=>remDim(aIdx,dIdx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
                </div>
              );
            })}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
              <button onClick={()=>addDim(aIdx)} style={{...Btn,fontSize:11}}>+ Add measurement</button>
              <span style={{fontSize:11,color:C.faint}}>width × length × qty</span>
            </div>
          </div>
        );
      })}

      {/* Add a new area */}
      <div style={{...CARD,borderStyle:"dashed",background:"#f8fafc"}}>
        <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>Add Area</div>
        {!showCustom ? (
          <div style={{display:"flex",gap:8}}>
            <select value={newType} onChange={e=>{
              if(e.target.value==="__custom__"){ setShowCustom(true); setNewType(""); }
              else setNewType(e.target.value);
            }} style={{...I,flex:1,fontSize:12}}>
              <option value="">Select area type…</option>
              {HERS_AREA_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              <option value="__custom__">✏️ Custom type…</option>
            </select>
            <button onClick={addArea} disabled={!newType} style={{...BtnD,opacity:!newType?0.4:1}}>+ Add</button>
          </div>
        ) : (
          <div style={{display:"flex",gap:8}}>
            <input value={customType} onChange={e=>setCustomType(e.target.value)}
              placeholder="Custom area name…" style={{...I,flex:1,fontSize:12}} />
            <button onClick={addArea} disabled={!customType.trim()} style={{...BtnD,opacity:!customType.trim()?0.4:1}}>+ Add</button>
            <button onClick={()=>setShowCustom(false)} style={Btn}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Windows editor ---
function WindowsEditor({ windows, onChange }) {
  function add(){ onChange([...windows, { id:uid(), label:`Window ${windows.length+1}`,
    orientation:"N", width:"", height:"", top_to_overhang:"", bottom_to_overhang:"", overhang_depth:"" }]); }
  function upd(idx,f,v){ onChange(windows.map((w,i)=>i===idx?{...w,[f]:v}:w)); }
  function rem(idx){ onChange(windows.filter((_,i)=>i!==idx)); }
  return (
    <div style={CARD}>
      <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>Windows</div>
      {windows.map((w,idx)=>(
        <div key={w.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
          <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
            <input value={w.label} onChange={e=>upd(idx,"label",e.target.value)} placeholder="e.g. Living room" style={{...I,flex:1,fontSize:12}} />
            <select value={w.orientation} onChange={e=>upd(idx,"orientation",e.target.value)} style={{...I,width:60,fontSize:12,flexShrink:0}}>
              {ORIENTATIONS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
            <button onClick={()=>rem(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            <div><div style={lbl}>Width (ft)</div><input type="number" value={w.width} onChange={e=>upd(idx,"width",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
            <div><div style={lbl}>Height (ft)</div><input type="number" value={w.height} onChange={e=>upd(idx,"height",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
          </div>
          <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>
            Overhang shading (optional, for Ekotrope)
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div><div style={lbl}>Top→overhang</div><input type="number" value={w.top_to_overhang} onChange={e=>upd(idx,"top_to_overhang",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
            <div><div style={lbl}>Bottom→overhang</div><input type="number" value={w.bottom_to_overhang} onChange={e=>upd(idx,"bottom_to_overhang",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
            <div><div style={lbl}>Overhang depth</div><input type="number" value={w.overhang_depth} onChange={e=>upd(idx,"overhang_depth",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
          </div>
        </div>
      ))}
      <button onClick={add} style={Btn}>+ Add Window</button>
    </div>
  );
}

// ============================================================
export default function HersFieldMeasurements() {
  const navigate  = useNavigate();
  const { invoiceId } = useParams();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [importing, setImporting] = useState(false);

  const [invoice, setInvoice]   = useState(null);
  const [customer, setCustomer] = useState(null);

  const [floors, setFloors]           = useState([]);
  const [roofSegs, setRoofSegs]       = useState([]);
  const [wallSegs, setWallSegs]       = useState([]);
  const [rimSegs, setRimSegs]         = useState([]);
  const [areas, setAreas]             = useState([]);
  const [bedrooms, setBedrooms]       = useState("0");
  const [windows, setWindows]         = useState([]);
  const [notes, setNotes]             = useState("");

  const [photos, setPhotos]       = useState([]);
  const [docs, setDocs]           = useState([]);
  const [uploading, setUploading]       = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  useEffect(()=>{ load(); },[]);

  async function load() {
    const { data:inv } = await supabase.from("hers_invoices").select("*").eq("id",invoiceId).maybeSingle();
    if(!inv){ setLoading(false); return; }
    setInvoice(inv);
    if(inv.customer_id){
      const { data:cust } = await supabase.from("customers")
        .select("id,name,phone,company_name").eq("id",inv.customer_id).maybeSingle();
      if(cust) setCustomer(cust);
    }
    const { data:fm } = await supabase.from("hers_field_measurements")
      .select("*").eq("hers_invoice_id",invoiceId).maybeSingle();
    if(fm){
      setFloors(parseArr(fm.floors).map(withId));
      setRoofSegs(parseArr(fm.roof_segments).map(withId));
      setWallSegs(parseArr(fm.wall_segments).map(withId));
      setRimSegs(parseArr(fm.rim_joist_segments).map(withId));
      setAreas(parseArr(fm.areas).map(a=>({...withId(a),dims:(a.dims||[]).map(withId)})));
      setBedrooms(String(fm.bedrooms||0));
      setWindows(parseArr(fm.windows).map(withId));
      setNotes(fm.notes||"");
    }
    const { data:phData } = await supabase.from("job_photos")
      .select("*").eq("hers_invoice_id",invoiceId).is("doc_type",null)
      .order("created_at",{ascending:false});
    setPhotos(phData||[]);
    const { data:docData } = await supabase.from("job_photos")
      .select("*").eq("hers_invoice_id",invoiceId).eq("doc_type","document")
      .order("created_at",{ascending:false});
    setDocs(docData||[]);
    setLoading(false);
  }

  // --- Import from insulation project ---
  async function importFromInsulation() {
    if(!invoice?.customer_id) return;
    if(!window.confirm("Import measurements from the insulation project for this customer? This will merge with existing data.")) return;
    setImporting(true);
    try {
      // Find the most recent insulation project for this customer
      const { data:projs } = await supabase.from("projects")
        .select("id,name,address").eq("lead_id",invoice.customer_id)
        .order("created_at",{ascending:false}).limit(5);

      if(!projs?.length){
        alert("No insulation project found for this customer.");
        setImporting(false); return;
      }

      // Prefer project with matching address, else most recent
      const proj = projs.find(p=>(p.address||"").toLowerCase().includes((invoice.address||"").split(",")[0].toLowerCase())) || projs[0];

      // Load floors, areas, segments
      const { data:projFloors } = await supabase.from("floors")
        .select("*").eq("project_id",proj.id).order("order_index");
      const { data:projAreas } = await supabase.from("areas")
        .select("*").eq("project_id",proj.id).order("order_index");
      const areaIds = (projAreas||[]).map(a=>a.id);
      let projSegs = [];
      if(areaIds.length){
        const { data:s } = await supabase.from("segments").select("*").in("area_id",areaIds);
        projSegs = s||[];
      }

      const floorMap = {};
      (projFloors||[]).forEach(f=>{ floorMap[f.id]=f.name; });

      // Build floor entries for CFA/Volume
      const newFloors = (projFloors||[]).map(f=>({
        id:uid(), label:f.name,
        width:"", length:"", height:"",
      }));

      // Separate areas → HERS segment categories vs HERS areas
      const newWallSegs = [];
      const newRimSegs  = [];
      const newHersAreas = [];

      for(const a of (projAreas||[])){
        const segsForArea = projSegs.filter(s=>s.area_id===a.id);
        const hersType = INSULATION_TO_HERS[a.area_type];

        if(a.area_type==="Exterior Wall" || a.area_type==="Demising Wall"){
          // Pull segments as wall segments
          segsForArea.forEach(s=>{
            newWallSegs.push({ id:uid(), label:`${a.area_type} (${floorMap[a.floor_id]||""})`, height:String(s.height||""), length:String(s.length||"") });
          });
          if(!segsForArea.length && a.sqft){
            // No segments but has sqft — add as area
            newHersAreas.push({ id:uid(), type:"Exterior Wall", dims:[{id:uid(),width:String(a.sqft||""),length:"1",qty:"1"}] });
          }
        } else if(a.area_type==="Rim Joist"){
          segsForArea.forEach(s=>{
            newRimSegs.push({ id:uid(), label:`Rim Joist (${floorMap[a.floor_id]||""})`, height:String(s.height||""), length:String(s.length||"") });
          });
        } else if(hersType){
          // Map to a HERS area with measurements from insulation segments or area sqft
          const dims = segsForArea.length
            ? segsForArea.map(s=>({ id:uid(), width:String(s.height||""), length:String(s.length||""), qty:"1" }))
            : (a.measurements||[]).map(m=>({ id:uid(), width:String(m.h||""), length:String(m.l||""), qty:String(m.q||"1") }));

          if(dims.length || a.sqft>0){
            const finalDims = dims.length ? dims
              : [{ id:uid(), width:String(Math.round(Math.sqrt(a.sqft)*10)/10), length:String(Math.round(Math.sqrt(a.sqft)*10)/10), qty:"1" }];
            newHersAreas.push({ id:uid(), type:hersType||a.area_type, dims:finalDims });
          }
        }
      }

      // Merge: add to existing, don't overwrite
      if(newFloors.length) setFloors(p=>[...p, ...newFloors]);
      if(newWallSegs.length) setWallSegs(p=>[...p, ...newWallSegs]);
      if(newRimSegs.length) setRimSegs(p=>[...p, ...newRimSegs]);
      if(newHersAreas.length) setAreas(p=>[...p, ...newHersAreas]);

      alert(`✅ Imported from "${proj.name||proj.address||"insulation project"}".\n\nReview and adjust the values — insulation segments use height×length which maps directly to wall/rim joist segments here.`);
    } catch(err){
      alert("Import error: "+(err.message||JSON.stringify(err)));
    }
    setImporting(false);
  }

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.muted}}>
      Loading…
    </div>
  );
  if(!invoice) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.muted,gap:10}}>
      <div>Invoice not found.</div>
      <button onClick={()=>navigate("/hers/invoices")} style={Btn}>← Back</button>
    </div>
  );

  async function save(){
    if(saving) return;
    setSaving(true);
    try {
      const payload = {
        hers_invoice_id: invoiceId,
        company_id: invoice.company_id,
        floors: floors.map(f=>({id:f.id,label:f.label||"",width:Number(f.width)||0,length:Number(f.length)||0,height:Number(f.height)||0})),
        roof_segments: roofSegs.map(s=>({id:s.id,label:s.label||"",height:Number(s.height)||0,length:Number(s.length)||0})),
        wall_segments: wallSegs.map(s=>({id:s.id,label:s.label||"",height:Number(s.height)||0,length:Number(s.length)||0})),
        rim_joist_segments: rimSegs.map(s=>({id:s.id,label:s.label||"",height:Number(s.height)||0,length:Number(s.length)||0})),
        areas: areas.map(a=>({
          id:a.id, type:a.type,
          dims:a.dims.map(d=>({id:d.id,width:Number(d.width)||0,length:Number(d.length)||0,qty:Number(d.qty)||1})),
        })),
        bedrooms: Number(bedrooms)||0,
        windows: windows.map(w=>({
          id:w.id, label:w.label||"", orientation:w.orientation||"N",
          width:Number(w.width)||0, height:Number(w.height)||0,
          top_to_overhang:w.top_to_overhang!==""?Number(w.top_to_overhang):null,
          bottom_to_overhang:w.bottom_to_overhang!==""?Number(w.bottom_to_overhang):null,
          overhang_depth:w.overhang_depth!==""?Number(w.overhang_depth):null,
        })),
        notes,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("hers_field_measurements")
        .upsert(payload,{onConflict:"hers_invoice_id"});
      if(error) throw error;
      setSaved(true); setTimeout(()=>setSaved(false),2500);
    } catch(err){
      alert("Error saving: "+(err.message||JSON.stringify(err)));
    }
    setSaving(false);
  }

  async function uploadPhotos(files){
    if(!files?.length) return;
    setUploading(true);
    let errors=[];
    for(const file of Array.from(files)){
      const ext=file.name.split('.').pop();
      const path=`${invoice.company_id}/hers/${invoiceId}/${Date.now()}.${ext}`;
      const { error:upErr } = await supabase.storage.from("job-photos").upload(path,file);
      if(upErr){ errors.push(upErr.message); continue; }
      const { data:urlData } = supabase.storage.from("job-photos").getPublicUrl(path);
      await supabase.from("job_photos").insert([{hers_invoice_id:invoiceId,url:urlData.publicUrl,company_id:invoice.company_id}]);
    }
    if(errors.length) alert("Upload failed:\n"+errors.join("\n"));
    await load(); setUploading(false);
  }

  async function uploadDocs(files){
    if(!files?.length) return;
    setUploadingDoc(true);
    for(const file of Array.from(files)){
      const path=`${invoice.company_id}/hers/${invoiceId}/docs/${Date.now()}_${file.name}`;
      const { error:upErr } = await supabase.storage.from("job-photos").upload(path,file);
      if(upErr){ console.error(upErr); continue; }
      const { data:urlData } = supabase.storage.from("job-photos").getPublicUrl(path);
      await supabase.from("job_photos").insert([{hers_invoice_id:invoiceId,url:urlData.publicUrl,caption:file.name,company_id:invoice.company_id,doc_type:"document"}]);
    }
    await load(); setUploadingDoc(false);
  }

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:C.bg,minHeight:"100vh",paddingBottom:60}}>

      {saved && (
        <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:300,
            background:"#059669",color:"#fff",padding:"8px 16px",borderRadius:20,fontSize:12,fontWeight:700,
            boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>✅ Saved!</div>
      )}

      {/* header */}
      <div style={{position:"sticky",top:0,zIndex:100,background:C.white,borderBottom:`1px solid ${C.border}`,
          padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>navigate(-1)} style={Btn}>← Back</button>
        <span style={{fontWeight:700,fontSize:14,flex:1,textAlign:"center"}}>📐 Field Measurements</span>
        <div style={{display:"flex",gap:8}}>
          <button onClick={importFromInsulation} disabled={importing}
            style={{...Btn,color:"#7c3aed",borderColor:"#7c3aed",opacity:importing?0.6:1}}>
            {importing?"Importing…":"⬇ Import Insulation"}
          </button>
          <button onClick={save} disabled={saving} style={{...BtnD,opacity:saving?0.6:1}}>
            {saving?"Saving…":"Save"}
          </button>
        </div>
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"16px 14px"}}>

        {/* reference */}
        <div style={{...CARD,background:"#f8fafc"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.ink}}>{customer?.name||"Unknown"}</div>
          {invoice.address && <div style={{fontSize:12,color:C.muted,marginTop:2}}>📍 {invoice.address}</div>}
        </div>

        {/* bedrooms */}
        <div style={CARD}>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <span style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>Bedrooms</span>
            <input type="number" value={bedrooms} onChange={e=>setBedrooms(e.target.value)} style={{...I,width:80}} />
          </div>
        </div>

        <FloorsEditor floors={floors} onChange={setFloors} />
        <SegmentList title="Roof Line" segments={roofSegs} onChange={setRoofSegs} unit="ft" />
        <SegmentList title="Exterior Walls" segments={wallSegs} onChange={setWallSegs} unit="ft" />
        <SegmentList title="Rim Joist" segments={rimSegs} onChange={setRimSegs} unit="ft" />

        {/* flexible areas */}
        <div style={{marginBottom:4}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8,paddingLeft:2}}>
            Additional Areas
          </div>
          <AreasEditor areas={areas} onChange={setAreas} />
        </div>

        <WindowsEditor windows={windows} onChange={setWindows} />

        {/* notes */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>Notes</div>
          <textarea placeholder="Notes from the field…" value={notes} onChange={e=>setNotes(e.target.value)}
            rows={2} style={{...I,height:"auto",padding:"8px",resize:"none",fontFamily:"inherit"}} />
        </div>

        {/* photos */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>📷 Photos</div>
            <div style={{display:"flex",gap:6}}>
              <label style={{border:"none",background:C.ink,color:"white",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700}}>
                📷 Camera<input type="file" accept="image/*" capture="environment" multiple style={{display:"none"}} onChange={e=>uploadPhotos(e.target.files)} />
              </label>
              <label style={{border:`1px solid ${C.border}`,background:"white",color:"#374151",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700}}>
                🖼 Gallery<input type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>uploadPhotos(e.target.files)} />
              </label>
            </div>
          </div>
          {uploading && <div style={{textAlign:"center",padding:"12px 0",fontSize:12,color:C.muted}}>Uploading…</div>}
          {photos.length===0
            ? <div style={{textAlign:"center",padding:"20px 0",color:C.faint,fontSize:12}}>No photos yet — tap Camera or Gallery to add</div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                {photos.map(ph=>(
                  <div key={ph.id} style={{position:"relative",paddingBottom:"100%",borderRadius:8,overflow:"hidden",background:"#f1f5f9"}}>
                    <img src={ph.url} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",cursor:"pointer"}} onClick={()=>window.open(ph.url,"_blank")} />
                  </div>
                ))}
              </div>
          }
        </div>

        {/* documents */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>📁 Documents &amp; Drawings</div>
            <label style={{border:"none",background:C.ink,color:"white",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700,display:"inline-block"}}>
              + Upload<input type="file" accept="application/pdf,image/*,.dwg,.dxf,.doc,.docx" multiple style={{display:"none"}} onChange={e=>uploadDocs(e.target.files)} />
            </label>
          </div>
          {uploadingDoc && <div style={{fontSize:12,color:C.muted,textAlign:"center",padding:"8px 0"}}>Uploading…</div>}
          {docs.length===0
            ? <div style={{textAlign:"center",padding:"16px 0",color:C.faint,fontSize:12}}>No documents yet — tap Upload to add PDFs or drawings</div>
            : <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {docs.map(d=>(
                  <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:"#f8fafc",borderRadius:8,border:`1px solid ${C.border}`}}>
                    <span style={{fontSize:18}}>{(d.caption||"").toLowerCase().endsWith(".pdf")?"📄":"📎"}</span>
                    <span style={{flex:1,fontSize:12,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.caption||"Document"}</span>
                    <button onClick={()=>window.open(d.url,"_blank")} style={{border:"none",background:"#eff6ff",color:"#3b82f6",padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Open</button>
                  </div>
                ))}
              </div>
          }
        </div>

      </div>
    </div>
  );
}
