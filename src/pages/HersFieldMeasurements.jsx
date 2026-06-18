import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const C = {
  bg:"#f4f5f7", white:"#fff", ink:"#0f172a",
  muted:"#64748b", faint:"#94a3b8",
  border:"#e2e8f0", green:"#059669",
  greenBg:"#f0fdf4", greenBorder:"#86efac",
};
const I = {
  height:34, fontSize:13, borderRadius:6, border:`1px solid ${C.border}`,
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

// Same area types as the insulation estimate — exact match so data maps 1:1
const AREA_TYPES = [
  "Roof Rafter w/ Strapping",
  "Roof Rafter behind knee walls",
  "Attic Floor",
  "Exterior Wall",
  "Demising Wall",
  "Rim Joist",
  "Concrete Wall",
  "Ceiling",
  "Interior Walls",
  "Fire Blocking",
  "Other",
];

// Types to auto-label dim1 as "Height" vs "Width"
const HEIGHT_TYPES = new Set(["Exterior Wall","Demising Wall","Rim Joist","Concrete Wall","Interior Walls","Fire Blocking"]);

const ORIENTATIONS = ["N","NE","E","SE","S","SW","W","NW"];

function fmt(n, d=1) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
}
function parseArr(v) {
  return Array.isArray(v) ? v : (typeof v==="string" ? JSON.parse(v||"[]") : []);
}
function uid() { return Date.now() + Math.random(); }
function withId(x) { return {...x, id: x.id||uid()}; }

// ── Single area card, mirrors insulation estimate layout ──
function AreaCard({ area, onChange, onRemove }) {
  const isHeight = HEIGHT_TYPES.has(area.type);
  const d1Label = isHeight ? "Height (ft)" : "Width (ft)";
  const meas = area.measurements||[];
  const totalSqft = meas.reduce((s,m)=>s+(m.sqft||0),0);

  const dh = parseFloat(area.dh)||0;
  const dl = parseFloat(area.dl)||0;
  const dq = parseFloat(area.dq)||1;
  const preview = dh>0&&dl>0 ? Math.round(dh*dl*dq*100)/100 : 0;

  function commit() {
    if(!dh||!dl) return;
    const sqft = Math.round(dh*dl*dq*100)/100;
    onChange("measurements", [...meas, {id:uid(), h:dh, l:dl, q:dq, sqft}]);
    onChange("dh",""); onChange("dl",""); onChange("dq","1");
  }
  function delMeas(idx) {
    onChange("measurements", meas.filter((_,i)=>i!==idx));
  }

  return (
    <div style={{background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderLeft:`3px solid ${C.green}`,
        borderRadius:8, padding:"10px 12px", marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontWeight:700,fontSize:13,color:C.ink}}>{area.type}</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontWeight:700,fontSize:13,color:C.green}}>{fmt(totalSqft,1)} ft²</span>
          <button onClick={onRemove} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:13}}>✕</button>
        </div>
      </div>

      {/* existing measurements as chips */}
      {meas.length>0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
          {meas.map((m,i)=>(
            <span key={m.id} style={{background:"#dcfce7",color:"#166534",borderRadius:6,
                padding:"2px 8px",fontSize:11,fontWeight:600,display:"inline-flex",alignItems:"center",gap:4}}>
              {m.h}×{m.l}{m.q>1?`×${m.q}`:""} <span style={{color:C.faint,fontSize:10}}>={fmt(m.sqft,0)}ft²</span>
              <button onClick={()=>delMeas(i)} style={{border:"none",background:"none",color:"#4ade80",cursor:"pointer",fontSize:12,padding:0,lineHeight:1}}>✕</button>
            </span>
          ))}
        </div>
      )}

      {/* input row */}
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{d1Label}</div>
          <input type="number" value={area.dh||""} onChange={e=>onChange("dh",e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&commit()} placeholder="0"
            style={{...I,height:30,textAlign:"right",fontSize:12}} />
        </div>
        <span style={{color:C.faint,fontSize:14,flexShrink:0,paddingTop:14}}>×</span>
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Length (ft)</div>
          <input type="number" value={area.dl||""} onChange={e=>onChange("dl",e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&commit()} placeholder="0"
            style={{...I,height:30,textAlign:"right",fontSize:12}} />
        </div>
        <div style={{width:52,flexShrink:0}}>
          <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Qty</div>
          <input type="number" value={area.dq||""} onChange={e=>onChange("dq",e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&commit()} placeholder="1"
            style={{...I,height:30,textAlign:"center",fontSize:12}} />
        </div>
        <div style={{flexShrink:0,paddingTop:14}}>
          <button onClick={commit} disabled={!dh||!dl}
            style={{...Btn,background:dh&&dl?C.green:"#f1f5f9",color:dh&&dl?"#fff":C.faint,
              borderColor:dh&&dl?C.green:C.border,height:30,fontSize:11}}>
            {preview>0?`+${fmt(preview,0)}ft²`:"Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ekotrope Summary ── read-only totals for entering into Ekotrope
function EkotropeSummary({ floors, areas, windows, bedrooms }) {
  const [open, setOpen] = useState(true);
  const totalCFA    = floors.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0),0);
  const totalVolume = floors.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0)*(Number(f.height)||0),0);

  // Group area totals
  const areaTotals = {};
  areas.forEach(a=>{
    const sqft = (a.measurements||[]).reduce((s,m)=>s+(m.sqft||0),0);
    if(sqft>0) areaTotals[a.type] = (areaTotals[a.type]||0) + sqft;
  });

  return (
    <div style={{...CARD, background:"#0f172a", border:"none", marginBottom:12}}>
      <button onClick={()=>setOpen(p=>!p)}
        style={{background:"none",border:"none",cursor:"pointer",width:"100%",
          display:"flex",justifyContent:"space-between",alignItems:"center",padding:0}}>
        <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.6}}>
          📊 Ekotrope Summary
        </div>
        <span style={{color:"#64748b",fontSize:12}}>{open?"▲ Hide":"▼ Show"}</span>
      </button>

      {open && (
        <div style={{marginTop:12}}>
          {/* Key figures */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
            <div style={{background:"#1e293b",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:9,color:"#64748b",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>CFA</div>
              <div style={{fontSize:18,fontWeight:800,color:"#34d399"}}>{Math.round(totalCFA).toLocaleString()}</div>
              <div style={{fontSize:10,color:"#475569"}}>ft²</div>
            </div>
            <div style={{background:"#1e293b",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:9,color:"#64748b",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Volume</div>
              <div style={{fontSize:18,fontWeight:800,color:"#34d399"}}>{Math.round(totalVolume).toLocaleString()}</div>
              <div style={{fontSize:10,color:"#475569"}}>ft³</div>
            </div>
            <div style={{background:"#1e293b",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:9,color:"#64748b",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Bedrooms</div>
              <div style={{fontSize:18,fontWeight:800,color:"#34d399"}}>{bedrooms||0}</div>
              <div style={{fontSize:10,color:"#475569"}}>rooms</div>
            </div>
          </div>

          {/* Area totals table */}
          {Object.keys(areaTotals).length>0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Areas</div>
              {Object.entries(areaTotals).map(([type, sqft])=>(
                <div key={type} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:"6px 10px",borderRadius:6,marginBottom:3,background:"#1e293b"}}>
                  <span style={{fontSize:12,color:"#cbd5e1"}}>{type}</span>
                  <span style={{fontSize:13,fontWeight:700,color:"#34d399"}}>{Math.round(sqft).toLocaleString()} ft²</span>
                </div>
              ))}
            </div>
          )}

          {/* Windows table */}
          {windows.length>0 && (
            <div>
              <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Windows</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{color:"#64748b"}}>
                      {["Label","Facing","W","H","Top→OH","Bot→OH","Depth"].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"4px 6px",fontWeight:700,
                            textTransform:"uppercase",fontSize:9,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {windows.map(w=>(
                      <tr key={w.id} style={{borderTop:"1px solid #1e293b"}}>
                        <td style={{padding:"5px 6px",color:"#cbd5e1"}}>{w.label||"—"}</td>
                        <td style={{padding:"5px 6px",color:"#34d399",fontWeight:700}}>{w.orientation||"—"}</td>
                        <td style={{padding:"5px 6px",color:"#cbd5e1"}}>{w.width||"—"}</td>
                        <td style={{padding:"5px 6px",color:"#cbd5e1"}}>{w.height||"—"}</td>
                        <td style={{padding:"5px 6px",color:w.top_to_overhang?"#fbbf24":"#475569"}}>{w.top_to_overhang||"—"}</td>
                        <td style={{padding:"5px 6px",color:w.bottom_to_overhang?"#fbbf24":"#475569"}}>{w.bottom_to_overhang||"—"}</td>
                        <td style={{padding:"5px 6px",color:w.overhang_depth?"#fbbf24":"#475569"}}>{w.overhang_depth||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Floors editor ──
function FloorsEditor({ floors, onChange }) {
  function add(){ onChange([...floors, {id:uid(), label:`Floor ${floors.length+1}`, width:"", length:"", height:""}]); }
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
              <input value={f.label} onChange={e=>upd(idx,"label",e.target.value)} placeholder="e.g. 1st Floor"
                style={{...I,flex:1,fontSize:12,height:30}} />
              <button onClick={()=>rem(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:4}}>
              <div>
                <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Width (ft)</div>
                <input type="number" value={f.width} onChange={e=>upd(idx,"width",e.target.value)} style={{...I,fontSize:12,textAlign:"right",height:30}} />
              </div>
              <div>
                <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Length (ft)</div>
                <input type="number" value={f.length} onChange={e=>upd(idx,"length",e.target.value)} style={{...I,fontSize:12,textAlign:"right",height:30}} />
              </div>
              <div>
                <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Height (ft)</div>
                <input type="number" value={f.height} onChange={e=>upd(idx,"height",e.target.value)} style={{...I,fontSize:12,textAlign:"right",height:30}} />
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted}}>
              <span>CFA: <b style={{color:C.green}}>{fmt(cfa)} ft²</b></span>
              <span>Volume: <b style={{color:C.green}}>{fmt(vol)} ft³</b></span>
            </div>
          </div>
        );
      })}
      <button onClick={add} style={Btn}>+ Add Floor/Level</button>
      {floors.length>0 && (
        <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,
            borderTop:`1px solid ${C.border}`,fontSize:13,fontWeight:700}}>
          <span>Total CFA: <span style={{color:C.green}}>{fmt(totalCFA)} ft²</span></span>
          <span>Total Volume: <span style={{color:C.green}}>{fmt(totalVol)} ft³</span></span>
        </div>
      )}
    </div>
  );
}

// ── Windows editor ──
function WindowsEditor({ windows, onChange }) {
  function add(){ onChange([...windows, {id:uid(), label:`Window ${windows.length+1}`, orientation:"N", width:"", height:"", top_to_overhang:"", bottom_to_overhang:"", overhang_depth:""}]); }
  function upd(idx,f,v){ onChange(windows.map((w,i)=>i===idx?{...w,[f]:v}:w)); }
  function rem(idx){ onChange(windows.filter((_,i)=>i!==idx)); }
  return (
    <div style={CARD}>
      <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>Windows</div>
      {windows.map((w,idx)=>(
        <div key={w.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
          <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
            <input value={w.label} onChange={e=>upd(idx,"label",e.target.value)} placeholder="e.g. Living room"
              style={{...I,flex:1,fontSize:12,height:30}} />
            <select value={w.orientation} onChange={e=>upd(idx,"orientation",e.target.value)}
              style={{...I,width:60,fontSize:12,height:30,flexShrink:0}}>
              {ORIENTATIONS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
            <button onClick={()=>rem(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            <div>
              <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Width (ft)</div>
              <input type="number" value={w.width} onChange={e=>upd(idx,"width",e.target.value)} style={{...I,fontSize:12,textAlign:"right",height:30}} />
            </div>
            <div>
              <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Height (ft)</div>
              <input type="number" value={w.height} onChange={e=>upd(idx,"height",e.target.value)} style={{...I,fontSize:12,textAlign:"right",height:30}} />
            </div>
          </div>
          <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Overhang shading (optional, for Ekotrope)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div>
              <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Top→overhang</div>
              <input type="number" value={w.top_to_overhang} onChange={e=>upd(idx,"top_to_overhang",e.target.value)} style={{...I,fontSize:12,textAlign:"right",height:30}} />
            </div>
            <div>
              <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Bottom→overhang</div>
              <input type="number" value={w.bottom_to_overhang} onChange={e=>upd(idx,"bottom_to_overhang",e.target.value)} style={{...I,fontSize:12,textAlign:"right",height:30}} />
            </div>
            <div>
              <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Overhang depth</div>
              <input type="number" value={w.overhang_depth} onChange={e=>upd(idx,"overhang_depth",e.target.value)} style={{...I,fontSize:12,textAlign:"right",height:30}} />
            </div>
          </div>
        </div>
      ))}
      <button onClick={add} style={Btn}>+ Add Window</button>
    </div>
  );
}

// ══════════════════════════════════════════════
export default function HersFieldMeasurements() {
  const navigate  = useNavigate();
  const { invoiceId } = useParams();

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [importing, setImporting] = useState(false);
  const [pushing, setPushing]     = useState(false);

  const [invoice, setInvoice]     = useState(null);
  const [customer, setCustomer]   = useState(null);

  const [floors, setFloors]     = useState([]);
  const [areas, setAreas]       = useState([]);  // [{id, type, measurements:[{id,h,l,q,sqft}], dh, dl, dq}]
  const [windows, setWindows]   = useState([]);
  const [bedrooms, setBedrooms] = useState("0");
  const [notes, setNotes]       = useState("");

  const [photos, setPhotos]         = useState([]);
  const [docs, setDocs]             = useState([]);
  const [uploading, setUploading]   = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [showAddArea, setShowAddArea]   = useState(false);
  const [newAreaType, setNewAreaType]   = useState("");
  const [customArea, setCustomArea]     = useState("");
  const [showCustomArea, setShowCustomArea] = useState(false);

  useEffect(()=>{ load(); },[]);

  async function load() {
    const { data:inv } = await supabase.from("hers_invoices").select("*").eq("id",invoiceId).maybeSingle();
    if(!inv){ setLoading(false); return; }
    setInvoice(inv);
    if(inv.customer_id){
      const { data:cust } = await supabase.from("customers").select("id,name,phone,company_name").eq("id",inv.customer_id).maybeSingle();
      if(cust) setCustomer(cust);
    }
    const { data:fm } = await supabase.from("hers_field_measurements").select("*").eq("hers_invoice_id",invoiceId).maybeSingle();
    if(fm){
      setFloors(parseArr(fm.floors).map(withId));
      // Support both old segment format and new unified areas
      const savedAreas = parseArr(fm.areas);
      if(savedAreas.length){
        setAreas(savedAreas.map(a=>({...withId(a), measurements:(a.measurements||[]).map(withId), dh:"",dl:"",dq:"1"})));
      } else {
        // Migrate from old segment columns if areas is empty
        const migrated = [];
        parseArr(fm.roof_segments).forEach(s=>{
          migrated.push({id:uid(),type:"Roof Rafter w/ Strapping",measurements:s.length?[{id:uid(),h:s.height||0,l:s.length||0,q:1,sqft:(s.height||0)*(s.length||0)}]:[],dh:"",dl:"",dq:"1"});
        });
        parseArr(fm.wall_segments).forEach(s=>{
          migrated.push({id:uid(),type:"Exterior Wall",measurements:s.length?[{id:uid(),h:s.height||0,l:s.length||0,q:1,sqft:(s.height||0)*(s.length||0)}]:[],dh:"",dl:"",dq:"1"});
        });
        parseArr(fm.rim_joist_segments).forEach(s=>{
          migrated.push({id:uid(),type:"Rim Joist",measurements:s.length?[{id:uid(),h:s.height||0,l:s.length||0,q:1,sqft:(s.height||0)*(s.length||0)}]:[],dh:"",dl:"",dq:"1"});
        });
        if(migrated.length) setAreas(migrated);
      }
      setBedrooms(String(fm.bedrooms||0));
      setWindows(parseArr(fm.windows).map(withId));
      setNotes(fm.notes||"");
    }
    const { data:phData } = await supabase.from("job_photos").select("*").eq("hers_invoice_id",invoiceId).is("doc_type",null).order("created_at",{ascending:false});
    setPhotos(phData||[]);
    const { data:docData } = await supabase.from("job_photos").select("*").eq("hers_invoice_id",invoiceId).eq("doc_type","document").order("created_at",{ascending:false});
    setDocs(docData||[]);
    setLoading(false);
  }

  // Area helpers
  function addArea(){
    const t = showCustomArea ? customArea.trim() : newAreaType;
    if(!t) return;
    setAreas(p=>[...p, {id:uid(),type:t,measurements:[],dh:"",dl:"",dq:"1"}]);
    setNewAreaType(""); setCustomArea(""); setShowCustomArea(false); setShowAddArea(false);
  }
  function removeArea(idx){ setAreas(p=>p.filter((_,i)=>i!==idx)); }
  function changeArea(idx, field, val){ setAreas(p=>p.map((a,i)=>i===idx?{...a,[field]:val}:a)); }

  // Summary stats
  const totalSqft = areas.reduce((s,a)=>s+(a.measurements||[]).reduce((ss,m)=>ss+(m.sqft||0),0),0);

  // ── Import from insulation project ──
  async function importFromInsulation() {
    if(!invoice?.customer_id) return;
    if(!window.confirm("Import measurements from the insulation project for this customer? New areas will be added without overwriting existing ones.")) return;
    setImporting(true);
    try {
      const { data:projs } = await supabase.from("projects").select("id,name,address").eq("lead_id",invoice.customer_id).order("created_at",{ascending:false}).limit(5);
      if(!projs?.length){ alert("No insulation project found for this customer."); setImporting(false); return; }
      const proj = projs.find(p=>(p.address||"").toLowerCase().includes((invoice.address||"").split(",")[0].toLowerCase()))||projs[0];

      const { data:projFloors } = await supabase.from("floors").select("*").eq("project_id",proj.id).order("order_index");
      const { data:projAreas }  = await supabase.from("areas").select("*").eq("project_id",proj.id).order("order_index");
      const areaIds = (projAreas||[]).map(a=>a.id);
      let segs = [];
      if(areaIds.length){ const { data:s } = await supabase.from("segments").select("*").in("area_id",areaIds); segs=s||[]; }

      const floorMap = {};
      (projFloors||[]).forEach(f=>{ floorMap[f.id]=f.name; });

      const newAreas = [];
      for(const a of (projAreas||[])){
        if(!a.area_type) continue;
        const areaSegs = segs.filter(s=>s.area_id===a.id);
        const stored = parseArr(a.measurements)||[];

        let meas = [];
        if(areaSegs.length){
          meas = areaSegs.map(s=>({ id:uid(), h:Number(s.height)||0, l:Number(s.length)||0, q:1, sqft:Math.round((Number(s.height)||0)*(Number(s.length)||0)*100)/100 }));
        } else if(stored.length){
          meas = stored.map(m=>({...m,id:uid()}));
        } else if(a.sqft>0){
          meas = [{id:uid(), h:Math.round(Math.sqrt(a.sqft)*10)/10, l:Math.round(Math.sqrt(a.sqft)*10)/10, q:1, sqft:a.sqft}];
        }
        if(meas.length){
          newAreas.push({id:uid(), type:a.area_type, measurements:meas, dh:"",dl:"",dq:"1"});
        }
      }
      setAreas(p=>[...p,...newAreas]);
      alert(`✅ Imported ${newAreas.length} area(s) from "${proj.name||proj.address||"insulation project"}".\nReview values — wall/rim joist segments import as height×length.`);
    } catch(err){ alert("Import error: "+(err.message||JSON.stringify(err))); }
    setImporting(false);
  }

  // ── Push to insulation project ──
  async function pushToInsulation() {
    if(!invoice?.customer_id) return;
    if(!areas.length){ alert("No areas to push. Add some measurements first."); return; }
    if(!window.confirm("Push HERS measurements to the insulation project for this customer? This will add/update area sqft values in the insulation estimate.")) return;
    setPushing(true);
    try {
      const { data:projs } = await supabase.from("projects").select("id,name,address").eq("lead_id",invoice.customer_id).order("created_at",{ascending:false}).limit(5);
      if(!projs?.length){ alert("No insulation project found for this customer."); setPushing(false); return; }
      const proj = projs.find(p=>(p.address||"").toLowerCase().includes((invoice.address||"").split(",")[0].toLowerCase()))||projs[0];

      const { data:projFloors } = await supabase.from("floors").select("*").eq("project_id",proj.id).order("order_index").limit(1);
      if(!projFloors?.length){ alert("Insulation project has no floors set up yet — open the estimate first to create floors."); setPushing(false); return; }
      const targetFloor = projFloors[0];

      // Copy address from HERS invoice to insulation project if it's missing or different
      if(invoice.address && (!proj.address || proj.address !== invoice.address)){
        await supabase.from("projects").update({ address: invoice.address }).eq("id", proj.id);
      }

      const { data:existing } = await supabase.from("areas").select("id,area_type,sqft,floor_id").eq("project_id",proj.id);
      const existingMap = {};
      (existing||[]).forEach(a=>{ existingMap[a.area_type]=a; });

      let updated=0, created=0;
      for(const area of areas){
        const totalSqftArea = (area.measurements||[]).reduce((s,m)=>s+(m.sqft||0),0);
        if(totalSqftArea<=0) continue;
        const meas = (area.measurements||[]).map(m=>({h:m.h,l:m.l,q:m.q||1,sqft:m.sqft}));
        if(existingMap[area.type]){
          await supabase.from("areas").update({sqft:Math.round(totalSqftArea*100)/100,measurements:meas}).eq("id",existingMap[area.type].id);
          updated++;
        } else {
          const orderIdx = (existing||[]).length*10+created*10;
          await supabase.from("areas").insert([{project_id:proj.id,floor_id:targetFloor.id,area_type:area.type,sqft:Math.round(totalSqftArea*100)/100,measurements:meas,material:"",thickness_in:"",r_value:"",oc:"",qty:1,unit:"sqft",unit_price:0,line_total:0,order_index:orderIdx,company_id:invoice.company_id}]);
          created++;
        }
      }
      alert(`✅ Pushed to "${proj.name||proj.address}".\n${updated} updated, ${created} created.\nOpen the insulation estimate to fill in materials and pricing.`);
    } catch(err){ alert("Push error: "+(err.message||JSON.stringify(err))); }
    setPushing(false);
  }

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.muted}}>Loading…</div>
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
        areas: areas.map(a=>({id:a.id,type:a.type,measurements:(a.measurements||[]).map(m=>({id:m.id,h:m.h,l:m.l,q:m.q||1,sqft:m.sqft}))})),
        // Keep segment columns empty (migrated to areas)
        roof_segments:[], wall_segments:[], rim_joist_segments:[],
        bedrooms: Number(bedrooms)||0,
        windows: windows.map(w=>({id:w.id,label:w.label||"",orientation:w.orientation||"N",width:Number(w.width)||0,height:Number(w.height)||0,top_to_overhang:w.top_to_overhang!==""?Number(w.top_to_overhang):null,bottom_to_overhang:w.bottom_to_overhang!==""?Number(w.bottom_to_overhang):null,overhang_depth:w.overhang_depth!==""?Number(w.overhang_depth):null})),
        notes,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("hers_field_measurements").upsert(payload,{onConflict:"hers_invoice_id"});
      if(error) throw error;
      setSaved(true); setTimeout(()=>setSaved(false),2500);
    } catch(err){ alert("Error saving: "+(err.message||JSON.stringify(err))); }
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
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
          <button onClick={importFromInsulation} disabled={importing}
            style={{...Btn,color:"#7c3aed",borderColor:"#7c3aed",opacity:importing?0.6:1,fontSize:11}}>
            {importing?"Importing…":"⬇ From Insulation"}
          </button>
          <button onClick={pushToInsulation} disabled={pushing}
            style={{...Btn,color:"#0369a1",borderColor:"#0369a1",opacity:pushing?0.6:1,fontSize:11}}>
            {pushing?"Pushing…":"⬆ To Insulation"}
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

        {/* Ekotrope Summary */}
        {(areas.length>0 || floors.length>0 || windows.length>0 || Number(bedrooms)>0) && (
          <EkotropeSummary floors={floors} areas={areas} windows={windows} bedrooms={bedrooms} />
        )}

        <FloorsEditor floors={floors} onChange={setFloors} />

        {/* measurement areas */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>
              Measurements
            </div>
            <span style={{fontSize:12,fontWeight:700,color:C.green}}>{fmt(totalSqft)} ft² total</span>
          </div>

          {areas.map((a,idx)=>(
            <AreaCard key={a.id} area={a}
              onChange={(f,v)=>changeArea(idx,f,v)}
              onRemove={()=>removeArea(idx)} />
          ))}

          {/* add area section */}
          {!showAddArea ? (
            <button onClick={()=>setShowAddArea(true)}
              style={{...Btn,width:"100%",justifyContent:"center",borderStyle:"dashed",color:C.muted}}>
              + Add Area
            </button>
          ) : (
            <div style={{border:`1px dashed ${C.border}`,borderRadius:8,padding:"10px 12px",background:"#f8fafc"}}>
              <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",marginBottom:8}}>Select Area Type</div>
              {!showCustomArea ? (
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <select value={newAreaType} onChange={e=>{
                    if(e.target.value==="__custom__"){ setShowCustomArea(true); setNewAreaType(""); }
                    else setNewAreaType(e.target.value);
                  }} style={{...I,flex:1,fontSize:12,height:32}}>
                    <option value="">Select type…</option>
                    {AREA_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    <option value="__custom__">✏️ Custom…</option>
                  </select>
                  <button onClick={addArea} disabled={!newAreaType} style={{...BtnD,opacity:!newAreaType?0.4:1}}>Add</button>
                  <button onClick={()=>{setShowAddArea(false);setNewAreaType("");}} style={Btn}>Cancel</button>
                </div>
              ) : (
                <div style={{display:"flex",gap:8}}>
                  <input value={customArea} onChange={e=>setCustomArea(e.target.value)} placeholder="Custom area name…"
                    style={{...I,flex:1,height:32,fontSize:12}} />
                  <button onClick={addArea} disabled={!customArea.trim()} style={{...BtnD,opacity:!customArea.trim()?0.4:1}}>Add</button>
                  <button onClick={()=>setShowCustomArea(false)} style={Btn}>Back</button>
                </div>
              )}
            </div>
          )}
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
            ? <div style={{textAlign:"center",padding:"20px 0",color:C.faint,fontSize:12}}>No photos yet</div>
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
            ? <div style={{textAlign:"center",padding:"16px 0",color:C.faint,fontSize:12}}>No documents yet</div>
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
