import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { logEvent as sharedLogEvent } from "../utils/debugLog";
import DebugLogButton from "../components/DebugLogButton";
import AddressInput from "./AddressInput";
import { AdjustmentRow, PaymentScheduleEditor } from "./PricingOptions";

function bpLog(msg){ sharedLogEvent(msg, "Board & Plaster"); }

const C = {
  bg: "#f4f5f7", white: "#fff", ink: "#0f172a",
  muted: "#64748b", faint: "#94a3b8",
  border: "#e2e8f0", green: "#059669",
};
const I = {
  height: 32, fontSize: 13, borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.white, padding: "0 8px", boxSizing: "border-box",
  color: C.ink, outline: "none",
};
const Btn = {
  height: 32, fontSize: 12, borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.white, padding: "0 12px", cursor: "pointer", color: C.ink,
  whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", fontWeight: 600,
};
const BtnD = {
  height: 32, fontSize: 12, borderRadius: 6, border: "none",
  background: C.ink, padding: "0 14px", cursor: "pointer", color: "#fff",
  whiteSpace: "nowrap", fontWeight: 700, display: "inline-flex", alignItems: "center",
};
const CARD = {
  background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
  padding: "14px 16px", marginBottom: 12,
};

const THICKNESS_OPTIONS = ['1/2"', '3/8"', '5/8"', "Other"];
const FINISH_OPTIONS = ["Smooth skim coat", "Level 4 finish", "Texture/orange peel", "Knockdown texture"];
// Which insulation area types are relevant to board & plaster (skip
// Attic/Roof Rafter/Rim Joist/Concrete Wall - those are insulation-only).
const RELEVANT_AREA_TYPES = ["Exterior Wall", "Interior Walls", "Demising Wall", "Ceiling", "Fire Blocking"];
// Demising walls (the wall between two units) commonly need fire-rated
// 5/8" board (often two layers per code) rather than the standard 1/2"
// used for exterior/interior walls and ceilings - default accordingly,
// though it's still just a starting point the user can change per area.
function defaultThickness(areaType){
  return areaType==="Demising Wall" ? '5/8"' : '1/2"';
}

function fmt(n){ return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }

export default function BoardPlasterEstimate(){
  const navigate = useNavigate();
  const { id: estimateId } = useParams();
  const [searchParams] = useSearchParams();
  const paramLeadId = searchParams.get("leadId")||"";
  const paramAddress = searchParams.get("address")||"";
  const isEditing = !!estimateId;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [companyId, setCompanyId] = useState(null);

  // customer
  const [leads, setLeads] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(paramLeadId);
  const [address, setAddress] = useState(paramAddress);
  const [custQuery, setCustQuery] = useState("");
  const [custMode, setCustMode] = useState(paramLeadId ? "selected" : "search"); // search | selected | new
  const [newForm, setNewForm] = useState({ name:"", phone:"", email:"", company_name:"", address:"" });

  const selectedLead = leads.find(l=>String(l.id)===String(selectedLeadId));

  // measurements
  const [areas, setAreas] = useState([]); // [{id, floor, area_type, sqft, thickness, finish}]
  const [importing, setImporting] = useState(false);
  const [importCandidates, setImportCandidates] = useState(null); // null = not showing picker; array = showing it

  // line items
  const [lineItems, setLineItems] = useState([{ id: uid(), service_name:"", price:"", qty:"1" }]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Draft");
  const [taxRate, setTaxRate] = useState("0");

  const [markupOpen, setMarkupOpen] = useState(false);
  const [markupType, setMarkupType] = useState("percent");
  const [markupValue, setMarkupValue] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositType, setDepositType] = useState("percent");
  const [depositValue, setDepositValue] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [paymentSchedule, setPaymentSchedule] = useState([]);

  useEffect(()=>{
    async function init(){
      const { data:{user} } = await supabase.auth.getUser();
      const { data:cd } = await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      setCompanyId(cd?.id||null);
      const { data:ls } = await supabase.from("customers").select("id,name,phone,company_name,address,email").order("name").limit(1000);
      setLeads(ls||[]);

      if(isEditing){
        bpLog(`Page loaded (estimate: ${estimateId})`);
        const { data:est } = await supabase.from("board_plaster_estimates").select("*").eq("id",estimateId).maybeSingle();
        if(est){
          setSelectedLeadId(String(est.customer_id||""));
          setAddress(est.address||"");
          setAreas(est.areas||[]);
          setLineItems(est.line_items?.length?est.line_items:[{ id: uid(), service_name:"", price:"", qty:"1" }]);
          setNotes(est.notes||"");
          setStatus(est.status||"Draft");
          setTaxRate(String(est.tax_rate||0));
          if(est.payment_schedule?.length){ setScheduleOpen(true); setPaymentSchedule(est.payment_schedule); }
          if(est.customer_id) setCustMode("selected");
        }
      }
      setLoading(false);
    }
    init();
  },[estimateId]);

  function selectLead(l){ setSelectedLeadId(String(l.id)); setCustMode("selected"); }

  async function saveNewCustomer(){
    if(!newForm.name.trim()){ alert("Name is required."); return; }
    const { data, error } = await supabase.from("customers").insert([{
      name: newForm.name.trim(), phone: newForm.phone||"", email: newForm.email||"",
      company_name: newForm.company_name||"", address: newForm.address||"",
    }]).select().single();
    if(error){ alert("Error creating customer: "+error.message); return; }
    setLeads(p=>[...p,data]);
    setSelectedLeadId(String(data.id));
    setCustMode("selected");
  }

  // ── Import Measurements (from Insulation OR HERS Rater) ──
  // Whichever trade visits the site first usually takes the real wall/
  // ceiling measurements - could be Insulation, could be HERS. Check both
  // sources and let the user pick from whatever actually exists, rather
  // than assuming Insulation is always the source.
  async function importFromInsulation(){
    if(!selectedLeadId){ alert("Select a customer first."); return; }
    setImporting(true);
    bpLog("Import Measurements requested - checking Insulation and HERS");
    try {
      const [projRes, hersRes] = await Promise.all([
        supabase.from("projects")
          .select("id,name,address,pipeline_status,created_at")
          .eq("lead_id", Number(selectedLeadId)).order("created_at",{ascending:false}).limit(20),
        supabase.from("hers_estimates")
          .select("id,address,status,created_at")
          .eq("customer_id", Number(selectedLeadId)).order("created_at",{ascending:false}).limit(20),
      ]);
      const candidates = [
        ...(projRes.data||[]).map(p=>({ source:"insulation", id:p.id, address:p.address, name:p.name, status:p.pipeline_status||"Draft", created_at:p.created_at })),
        ...(hersRes.data||[]).map(h=>({ source:"hers", id:h.id, address:h.address, name:h.address, status:h.status||"Draft", created_at:h.created_at })),
      ];
      if(!candidates.length){ alert("No insulation or HERS project found for this customer."); setImporting(false); return; }
      if(candidates.length===1){
        await doImportFrom(candidates[0]);
      } else {
        setImportCandidates(candidates);
      }
    } catch(err){
      bpLog(`❌ Import failed: ${err.message}`);
      alert("Import error: "+(err.message||JSON.stringify(err)));
    }
    setImporting(false);
  }

  async function doImportFrom(cand){
    setImporting(true);
    bpLog(`Importing from ${cand.source==="hers"?"HERS":"Insulation"}: ${cand.address||cand.name} (${cand.status}, id: ${cand.id})`);
    try {
      let imported = [];
      let sourceLabel = "";

      if(cand.source==="insulation"){
        const { data:projFloors } = await supabase.from("floors").select("*").eq("project_id",cand.id).order("order_index");
        const { data:projAreas } = await supabase.from("areas").select("*").eq("project_id",cand.id).order("order_index");
        const floorMap = {};
        (projFloors||[]).forEach(f=>{ floorMap[f.id]=f.name; });

        const rawAreas = (projAreas||[])
          .filter(a=>a.area_type && RELEVANT_AREA_TYPES.includes(a.area_type) && a.sqft>0);
        // Combo materials (e.g. Open Cell + another layer on the same wall)
        // are stored as multiple rows sharing the SAME floor, area_type, and
        // full sqft. Dedupe down to one entry per unique combination so the
        // same wall doesn't get imported once per material line it has.
        const seen = new Set();
        imported = rawAreas.filter(a=>{
            const key = `${a.floor_id}||${a.area_type}||${a.sqft}`;
            if(seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map(a=>({
            id: uid(), floor: floorMap[a.floor_id]||"Other", area_type: a.area_type, sqft: a.sqft,
            thickness: defaultThickness(a.area_type), thicknessOther: "", layers: 1, measurements: [], mh:"", ml:"", mq:"1", finish: FINISH_OPTIONS[0],
          }));
        sourceLabel = cand.name||cand.address;
      } else {
        // HERS - areas live as JSON on hers_field_measurements, one object
        // per area (not split into multiple rows), so no dedup needed here.
        // Multifamily HERS estimates have measurements split per unit
        // (Unit 1, Unit 2, ...), never under the empty "single unit" label.
        // Insulation and Board & Plaster don't care about individual units -
        // they need the BUILDING'S total per floor+area_type. Check if this
        // estimate has multiple units and, if so, pull every unit's data and
        // sum matching floor+area_type combinations together.
        const { data:estRow } = await supabase.from("hers_estimates").select("unit_labels").eq("id",cand.id).maybeSingle();
        const unitLabels = estRow?.unit_labels?.length ? estRow.unit_labels : [""];

        const fmRows = await Promise.all(unitLabels.map(ul=>
          supabase.from("hers_field_measurements").select("areas").eq("hers_estimate_id",cand.id).eq("unit_label",ul).maybeSingle()
        ));

        const totals = {}; // key: floor||area_type -> summed sqft
        fmRows.forEach(({data:fm})=>{
          const savedAreas = Array.isArray(fm?.areas) ? fm.areas : (typeof fm?.areas==="string" ? JSON.parse(fm.areas||"[]") : []);
          let flatAreas = [];
          if(savedAreas.length && savedAreas[0]?.floor_name){
            flatAreas = savedAreas.flatMap(f=>(f.areas||[]).map(a=>({...a,floor:f.floor_name})));
          } else {
            flatAreas = savedAreas.map(a=>({...a,floor:a.floor||"Other"}));
          }
          flatAreas.filter(a=>a.area_type && RELEVANT_AREA_TYPES.includes(a.area_type) && a.sqft>0)
            .forEach(a=>{
              const key = `${a.floor||"Other"}||${a.area_type}`;
              totals[key] = (totals[key]||0) + Number(a.sqft);
            });
        });

        imported = Object.entries(totals).map(([key,sqft])=>{
          const [floor,area_type] = key.split("||");
          return {
            id: uid(), floor, area_type, sqft: Math.round(sqft*100)/100,
            thickness: defaultThickness(area_type), thicknessOther: "", layers: 1, measurements: [], mh:"", ml:"", mq:"1", finish: FINISH_OPTIONS[0],
          };
        });
        sourceLabel = cand.address||"HERS estimate";
      }

      if(!imported.length){ alert(`No wall/ceiling areas found on "${sourceLabel}" to import.`); setImporting(false); setImportCandidates(null); return; }
      setAreas(prev=>[...prev, ...imported]);
      if(!address) setAddress(cand.address||"");
      setImportCandidates(null);
      alert(`✅ Imported ${imported.length} area(s) from ${cand.source==="hers"?"HERS":"Insulation"} — "${sourceLabel}" (${cand.status}). Review board thickness/finish for each below.`);
    } catch(err){
      bpLog(`❌ Import failed: ${err.message}`);
      alert("Import error: "+(err.message||JSON.stringify(err)));
    }
    setImporting(false);
  }

  function addArea(){
    setAreas(p=>[...p,{ id: uid(), floor:"", area_type:"Exterior Wall", sqft:"", thickness:'1/2"', thicknessOther:"", layers:1, measurements:[], mh:"", ml:"", mq:"1", finish: FINISH_OPTIONS[0] }]);
  }
  function updateArea(id, field, value){
    setAreas(p=>p.map(a=>{
      if(a.id!==id) return a;
      const updated = {...a,[field]:value};
      // Nudge the thickness toward the sensible default when the area type
      // changes (e.g. switching to Demising Wall suggests 5/8") - but only
      // if they haven't already picked something different themselves.
      if(field==="area_type" && a.thickness===defaultThickness(a.area_type)){
        updated.thickness = defaultThickness(value);
      }
      return updated;
    }));
  }
  function removeArea(id){
    if(!window.confirm("Remove this area?")) return;
    setAreas(p=>p.filter(a=>a.id!==id));
  }

  // On-site measuring: an area can be built up from multiple H×L segments
  // (same workflow as Insulation) rather than typing one combined sqft.
  function commitMeasurement(id){
    setAreas(p=>p.map(a=>{
      if(a.id!==id) return a;
      const h=parseFloat(a.mh)||0, l=parseFloat(a.ml)||0, q=parseFloat(a.mq)||1;
      if(!h||!l) return a; // nothing to commit
      const rowSqft = Math.round(h*l*q*100)/100;
      // If this area already has a total sqft (e.g. from an import) but no
      // measurement breakdown yet, preserve that as a baseline segment
      // first - otherwise adding a new on-site measurement would silently
      // discard the imported total instead of adding to it.
      const existingMeas = (a.measurements||[]).length===0 && Number(a.sqft)>0
        ? [{h:"imported",l:"",q:1,sqft:Number(a.sqft)}]
        : (a.measurements||[]);
      const meas = [...existingMeas, {h,l,q,sqft:rowSqft}];
      const total = Math.round(meas.reduce((s,m)=>s+m.sqft,0)*100)/100;
      return {...a, measurements:meas, sqft:total, mh:"", ml:"", mq:"1"};
    }));
  }
  function delMeasurement(id, idx){
    setAreas(p=>p.map(a=>{
      if(a.id!==id) return a;
      const meas = (a.measurements||[]).filter((_,i)=>i!==idx);
      const total = Math.round(meas.reduce((s,m)=>s+m.sqft,0)*100)/100;
      return {...a, measurements:meas, sqft:total};
    }));
  }

  // group areas by floor for display
  const floorGroups = [];
  { const gm={}; areas.forEach(a=>{ const key=a.floor||"(no floor)"; if(!gm[key]){ gm[key]={floor:key,rows:[]}; floorGroups.push(gm[key]); } gm[key].rows.push(a); }); }

  function addLine(){ setLineItems(p=>[...p,{ id: uid(), service_name:"", price:"", qty:"1" }]); }
  function updateLine(idx, field, value){ setLineItems(p=>p.map((it,i)=>i===idx?{...it,[field]:value}:it)); }
  function removeLine(idx){ setLineItems(p=>p.filter((_,i)=>i!==idx)); }

  const subtotal = lineItems.reduce((s,it)=>s+(Number(it.price)||0)*(Number(it.qty)||1),0);
  const markupAmount = markupOpen ? (markupType==="percent" ? subtotal*(Number(markupValue)||0)/100 : Number(markupValue)||0) : 0;
  const discountAmount = discountOpen ? (discountType==="percent" ? subtotal*(Number(discountValue)||0)/100 : Number(discountValue)||0) : 0;
  const afterAdjustments = Math.max(0, subtotal + markupAmount - discountAmount);
  const taxTotal = afterAdjustments * (Number(taxRate)||0)/100;
  const grandTotal = afterAdjustments + taxTotal;
  const depositAmount = depositOpen ? (depositType==="percent" ? grandTotal*(Number(depositValue)||0)/100 : Number(depositValue)||0) : 0;
  function installmentAmount(s){ return s.type==="percent" ? grandTotal*(Number(s.value)||0)/100 : Number(s.value)||0; }
  const scheduledTotal = paymentSchedule.reduce((s,it)=>s+installmentAmount(it),0);

  async function saveEstimate(){
    if(saving) return;
    bpLog(`Save requested (${isEditing?"update":"new estimate"})`);
    if(!selectedLeadId){ bpLog("Save blocked: no customer selected"); alert("Please select a customer first."); return; }
    const validItems = lineItems.filter(it=>it.service_name && Number(it.price)>=0);
    if(!validItems.length && !areas.length){ bpLog("Save blocked: nothing entered"); alert("Add at least one area or line item."); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        customer_id: Number(selectedLeadId),
        address,
        status,
        areas,
        line_items: lineItems,
        payment_schedule: scheduleOpen ? paymentSchedule.map(s=>({...s})) : [],
        notes,
        tax_rate: Number(taxRate)||0,
        updated_at: new Date().toISOString(),
      };
      if(isEditing){
        const { error } = await supabase.from("board_plaster_estimates").update(payload).eq("id", estimateId);
        if(error) throw error;
      } else {
        const { data, error } = await supabase.from("board_plaster_estimates").insert([payload]).select().single();
        if(error) throw error;
        navigate(`/board-plaster/${data.id}`, { replace:true });
      }
      bpLog("✅ Save completed successfully");
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    } catch(err){
      bpLog(`❌ SAVE FAILED: ${err.message}`);
      alert("Error saving: "+(err.message||JSON.stringify(err)));
    }
    setSaving(false);
  }

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.muted}}>
      Loading…
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui",paddingBottom:40}}>
      <div style={{position:"sticky",top:0,zIndex:100,background:C.white,borderBottom:`1px solid ${C.border}`,
          padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <button onClick={()=>navigate(-1)} style={Btn}>← Back</button>
        <span style={{fontWeight:700,fontSize:14,flex:1,textAlign:"center"}}>🧱 Board &amp; Plaster {isEditing?"Estimate":"— New"}</span>
        <div style={{display:"flex",gap:6}}>
          <DebugLogButton />
          <button onClick={saveEstimate} disabled={saving} style={{...BtnD,background:saving?"#64748b":C.ink}}>
            {saving?"…":saved?"✓ Saved":"Save"}
          </button>
        </div>
      </div>

      <div style={{maxWidth:720,margin:"0 auto",padding:"14px 12px"}}>

        {/* Customer */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Customer</div>
          {custMode==="selected" && selectedLead ? (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{selectedLead.name}</div>
                {selectedLead.phone && <div style={{fontSize:12,color:C.muted}}>{selectedLead.phone}</div>}
                {selectedLead.company_name && <div style={{fontSize:12,color:C.muted}}>{selectedLead.company_name}</div>}
              </div>
              <button onClick={()=>{setSelectedLeadId("");setCustMode("search");}} style={Btn}>Change</button>
            </div>
          ) : custMode==="new" ? (
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              <input placeholder="Full Name *" value={newForm.name} onChange={e=>setNewForm(p=>({...p,name:e.target.value}))} style={I} />
              <input placeholder="Phone" value={newForm.phone} onChange={e=>setNewForm(p=>({...p,phone:e.target.value}))} style={I} />
              <input placeholder="Email" value={newForm.email} onChange={e=>setNewForm(p=>({...p,email:e.target.value}))} style={I} />
              <input placeholder="Company" value={newForm.company_name} onChange={e=>setNewForm(p=>({...p,company_name:e.target.value}))} style={I} />
              <div style={{display:"flex",gap:8}}>
                <button onClick={saveNewCustomer} style={BtnD}>Save Customer</button>
                <button onClick={()=>setCustMode("search")} style={Btn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{position:"relative"}}>
              <input value={custQuery} onChange={e=>setCustQuery(e.target.value)}
                placeholder="Search customer by name or phone…" style={{...I,width:"100%",paddingRight:70}} />
              <button onClick={()=>{setCustMode("new");setNewForm({name:custQuery,phone:"",email:"",company_name:"",address:""});}}
                style={{position:"absolute",right:4,top:4,height:24,padding:"0 10px",borderRadius:6,
                  border:"none",background:C.ink,color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>
                + New
              </button>
              {custQuery.trim().length>=1 && (()=>{
                const q = custQuery.toLowerCase();
                const qDigits = q.replace(/\D/g,"");
                const results = leads.filter(l=>
                  (l.name||"").toLowerCase().includes(q) ||
                  (qDigits.length>0 && (l.phone||"").replace(/\D/g,"").includes(qDigits))
                ).slice(0,8);
                return results.length>0 && (
                  <div style={{marginTop:6,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                    {results.map(l=>(
                      <button key={l.id} onClick={()=>selectLead(l)}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"8px 12px",
                          border:"none",borderBottom:`1px solid ${C.border}`,background:C.white,cursor:"pointer"}}>
                        <div style={{fontWeight:600,fontSize:13}}>{l.name}</div>
                        {l.phone && <div style={{fontSize:11,color:C.muted}}>{l.phone}</div>}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Address */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Job Address</div>
          <AddressInput value={address} onChange={setAddress} placeholder="Job site address…" style={{...I,width:"100%"}} />
        </div>

        {/* Measurements */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5}}>
              Measurements — Board &amp; Finish
            </div>
            <button onClick={importFromInsulation} disabled={importing || !selectedLeadId}
              style={{...Btn,color:"#7c3aed",borderColor:"#7c3aed",fontSize:11,opacity:(!selectedLeadId||importing)?0.5:1}}>
              {importing?"Checking…":"📥 Import Measurements"}
            </button>
          </div>

          {floorGroups.length===0 && (
            <div style={{fontSize:12,color:C.faint,textAlign:"center",padding:"10px 0"}}>
              No areas yet — import from an existing insulation estimate, or add one manually below.
            </div>
          )}

          {floorGroups.map((g,gi)=>{
            const groupSqft = g.rows.reduce((s,a)=>s+(Number(a.sqft)||0),0);
            return (
              <div key={g.floor} style={{marginBottom:gi<floorGroups.length-1?14:0,paddingBottom:gi<floorGroups.length-1?12:0,
                  borderBottom:gi<floorGroups.length-1?`1px solid ${C.border}`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontWeight:700,fontSize:13}}>{g.floor}</span>
                  <span style={{fontSize:12,color:C.muted}}>{fmt(groupSqft)} ft² total</span>
                </div>
                {g.rows.map(a=>(
                  <div key={a.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                    <div style={{display:"flex",gap:6,marginBottom:6}}>
                      <input placeholder="Floor" value={a.floor} onChange={e=>updateArea(a.id,"floor",e.target.value)}
                        style={{...I,flex:1,height:28,fontSize:11}} />
                      <select value={a.area_type} onChange={e=>updateArea(a.id,"area_type",e.target.value)}
                        style={{...I,flex:1,height:28,fontSize:11}}>
                        {RELEVANT_AREA_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={()=>removeArea(a.id)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:15}}>✕</button>
                    </div>

                    {/* On-site measuring: add one or more H×L segments; total sqft is computed automatically */}
                    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6}}>
                      <input placeholder="H" inputMode="decimal" value={a.mh||""}
                        onChange={e=>updateArea(a.id,"mh",e.target.value)}
                        onBlur={()=>commitMeasurement(a.id)} onKeyDown={e=>e.key==="Enter"&&commitMeasurement(a.id)}
                        style={{...I,flex:1,height:28,fontSize:11,textAlign:"center"}} />
                      <span style={{fontSize:10,color:C.faint}}>×</span>
                      <input placeholder="L" inputMode="decimal" value={a.ml||""}
                        onChange={e=>updateArea(a.id,"ml",e.target.value)}
                        onBlur={()=>commitMeasurement(a.id)} onKeyDown={e=>e.key==="Enter"&&commitMeasurement(a.id)}
                        style={{...I,flex:1,height:28,fontSize:11,textAlign:"center"}} />
                      <span style={{fontSize:10,color:C.faint}}>×</span>
                      <input placeholder="Qty" inputMode="decimal" value={a.mq||"1"}
                        onChange={e=>updateArea(a.id,"mq",e.target.value)}
                        onBlur={()=>commitMeasurement(a.id)} onKeyDown={e=>e.key==="Enter"&&commitMeasurement(a.id)}
                        style={{...I,width:44,flexShrink:0,height:28,fontSize:11,textAlign:"center"}} />
                      <span style={{fontSize:11,fontWeight:700,color:C.green,whiteSpace:"nowrap",marginLeft:2}}>
                        {fmt(a.sqft||0)} ft²
                      </span>
                    </div>
                    {(a.measurements||[]).length>0 && (
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:6}}>
                        {a.measurements.map((m,mi)=>(
                          <span key={mi} style={{display:"inline-flex",alignItems:"center",gap:2,
                              background:"#f0fdf4",borderRadius:4,padding:"2px 6px",fontSize:10,color:C.muted}}>
                            {m.h==="imported" ? "Imported total" : `${m.h}×${m.l}${m.q>1?`×${m.q}`:""}`}&nbsp;<b style={{color:C.ink}}>{fmt(m.sqft)}</b>
                            <button onClick={()=>delMeasurement(a.id,mi)}
                              style={{border:"none",background:"none",cursor:"pointer",color:C.faint,fontSize:11,padding:0,lineHeight:1}}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{display:"flex",gap:6}}>
                      <select value={a.thickness} onChange={e=>updateArea(a.id,"thickness",e.target.value)}
                        style={{...I,flex:1,height:28,fontSize:11}}>
                        {THICKNESS_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                      {a.thickness==="Other" && (
                        <input placeholder="Custom size" value={a.thicknessOther||""} onChange={e=>updateArea(a.id,"thicknessOther",e.target.value)}
                          style={{...I,flex:1,height:28,fontSize:11}} />
                      )}
                      <select value={a.layers||1} onChange={e=>updateArea(a.id,"layers",Number(e.target.value))}
                        title="Number of board layers" style={{...I,width:80,flexShrink:0,height:28,fontSize:11}}>
                        <option value={1}>1 layer</option>
                        <option value={2}>2 layers</option>
                        <option value={3}>3 layers</option>
                      </select>
                      <select value={a.finish} onChange={e=>updateArea(a.id,"finish",e.target.value)}
                        style={{...I,flex:2,height:28,fontSize:11}}>
                        {FINISH_OPTIONS.map(f=><option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          <button onClick={addArea} style={{...Btn,width:"100%",justifyContent:"center"}}>+ Add Area</button>
        </div>

        {/* Line Items */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Line Items</div>
          {lineItems.map((it,idx)=>(
            <div key={it.id} style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
              <input placeholder="Description (e.g. 1st Floor - Board & Plaster)" value={it.service_name}
                onChange={e=>updateLine(idx,"service_name",e.target.value)} style={{...I,flex:2}} />
              <input type="number" placeholder="Price" value={it.price} onChange={e=>updateLine(idx,"price",e.target.value)} style={{...I,width:90,textAlign:"right"}} />
              <input type="number" placeholder="Qty" value={it.qty} onChange={e=>updateLine(idx,"qty",e.target.value)} style={{...I,width:60,textAlign:"right"}} />
              <button onClick={()=>removeLine(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
          ))}
          <button onClick={addLine} style={Btn}>+ Add Line</button>
        </div>

        {/* Pricing options */}
        <div style={{...CARD,padding:0,overflow:"hidden"}}>
          <AdjustmentRow label="Add markup" open={markupOpen} type={markupType} value={markupValue} amount={markupAmount}
            onAdd={()=>setMarkupOpen(true)} onTypeChange={setMarkupType} onValueChange={setMarkupValue}
            onRemove={()=>{setMarkupOpen(false);setMarkupValue("");setMarkupType("percent");}} />
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <AdjustmentRow label="Apply discount" open={discountOpen} type={discountType} value={discountValue} amount={discountAmount}
              onAdd={()=>setDiscountOpen(true)} onTypeChange={setDiscountType} onValueChange={setDiscountValue}
              onRemove={()=>{setDiscountOpen(false);setDiscountValue("");setDiscountType("percent");}} />
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <AdjustmentRow label="Request a deposit" open={depositOpen} type={depositType} value={depositValue} amount={depositAmount}
              onAdd={()=>setDepositOpen(true)} onTypeChange={setDepositType} onValueChange={setDepositValue}
              onRemove={()=>{setDepositOpen(false);setDepositValue("");setDepositType("percent");}} />
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <PaymentScheduleEditor open={scheduleOpen} schedule={paymentSchedule} grandTotal={grandTotal}
              scheduledTotal={scheduledTotal} installmentAmount={installmentAmount}
              onAdd={()=>setScheduleOpen(true)} onChange={setPaymentSchedule}
              onRemoveAll={()=>{setScheduleOpen(false);setPaymentSchedule([]);}} />
          </div>
        </div>

        {/* Notes */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Notes</div>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
            placeholder="Terms, payment methods, trash removal policy, etc." style={{...I,width:"100%",height:"auto",padding:8,resize:"vertical"}} />
        </div>

        {/* Totals */}
        <div style={{background:C.ink,borderRadius:12,padding:"16px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Subtotal</span>
            <span style={{color:"#fff",fontSize:12}}>${fmt(subtotal)}</span>
          </div>
          {markupOpen && Number(markupValue)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Markup</span>
              <span style={{color:"#fff",fontSize:12}}>+${fmt(markupAmount)}</span>
            </div>
          )}
          {discountOpen && Number(discountValue)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Discount</span>
              <span style={{color:"#fff",fontSize:12}}>-${fmt(discountAmount)}</span>
            </div>
          )}
          {Number(taxRate)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Tax ({taxRate}%)</span>
              <span style={{color:"#fff",fontSize:12}}>${fmt(taxTotal)}</span>
            </div>
          )}
          <div style={{borderTop:"1px solid #374151",paddingTop:10,marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Total</span>
            <span style={{color:"#059669",fontWeight:800,fontSize:24}}>${fmt(grandTotal)}</span>
          </div>
          {depositOpen && Number(depositValue)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTop:"1px solid #374151"}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Deposit required</span>
              <span style={{color:"#fff",fontSize:13,fontWeight:700}}>${fmt(depositAmount)}</span>
            </div>
          )}
          {scheduleOpen && paymentSchedule.length>0 && (
            <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #374151"}}>
              <div style={{color:"#94a3b8",fontSize:12,marginBottom:4}}>Payment Schedule</div>
              {paymentSchedule.map(s=>(
                <div key={s.id} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{color:"#cbd5e1",fontSize:11}}>{s.label||"Payment"}</span>
                  <span style={{color:"#fff",fontSize:11}}>${fmt(installmentAmount(s))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {importCandidates && (
        <div onClick={()=>setImportCandidates(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,
            display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.white,borderRadius:12,padding:"18px 20px",width:"100%",maxWidth:420,
              maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Which job to import from?</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14}}>
              Found {importCandidates.length} measured job(s) for this customer, across Insulation and HERS. Pick the one to import from.
            </div>
            {importCandidates.map((p,i)=>(
              <button key={p.source+p.id} onClick={()=>doImportFrom(p)}
                style={{display:"block",width:"100%",textAlign:"left",padding:"10px 12px",marginBottom:6,
                  border:`1px solid ${C.border}`,borderRadius:8,background:C.white,cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:4,
                      background:p.source==="hers"?"#fef3c7":"#f0fdf4",
                      color:p.source==="hers"?"#92400e":"#166534"}}>
                    {p.source==="hers"?"⭐ HERS":"🏠 INSULATION"}
                  </span>
                  <span style={{fontWeight:600,fontSize:13}}>{p.address||p.name||"Untitled"}</span>
                </div>
                <div style={{fontSize:11,color:C.muted}}>
                  {p.status} · {new Date(p.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                </div>
              </button>
            ))}
            <button onClick={()=>setImportCandidates(null)} style={{...Btn,width:"100%",justifyContent:"center",marginTop:4}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
