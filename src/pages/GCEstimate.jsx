import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AddressInput from "./AddressInput";
import { AdjustmentRow, PaymentScheduleEditor } from "./PricingOptions";

const C = {
  bg: "#f4f5f7", white: "#fff", ink: "#0f172a",
  muted: "#64748b", faint: "#94a3b8",
  border: "#e2e8f0", green: "#059669", amber: "#b45309",
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

function fmt(n){ return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmt$(n){ return "$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }

const FLOOR_ORDER = ["Attic","3rd","2nd","1st","Basement","Crawlspace"];
function sortFloors(list){
  return [...new Set(list)].sort((a,b)=>{
    const ai=FLOOR_ORDER.indexOf(a), bi=FLOOR_ORDER.indexOf(b);
    if(ai===-1&&bi===-1) return 0;
    if(ai===-1) return 1;
    if(bi===-1) return -1;
    return ai-bi;
  });
}

function materialsTotal(materials){
  return (materials||[]).reduce((s,m)=>s+(Number(m.qty)||0)*(Number(m.unit_price)||0),0);
}
const DEFAULT_TRADES = ["Framing","Plumbing","Electrical","HVAC","Roofing","Windows & Doors",
  "Painting","Flooring","Drywall","Insulation","Concrete","Demolition","Other"];
function scopeTotal(scopes){
  return (scopes||[]).reduce((s,sc)=>s+(Number(sc.material_cost)||0)+(Number(sc.labor_cost)||0),0);
}

export default function GCEstimate(){
  const navigate = useNavigate();
  const { id: estimateId } = useParams();
  const [searchParams] = useSearchParams();
  const paramLeadId = searchParams.get("leadId")||"";
  const paramAddress = searchParams.get("address")||"";
  const isEditing = !!estimateId;

  const [loading, setLoading] = useState(isEditing);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [companyId, setCompanyId] = useState(null);
  const [companyTrades, setCompanyTrades] = useState([]); // Settings-configured trade list (list_gc_trade)
  const [companyMaterials, setCompanyMaterials] = useState([]); // Settings-configured material catalog (list_gc_material)
  const [scopes, setScopes] = useState([]); // subcontractor / trade scopes, priced independently of the area takeoff

  const [leads, setLeads] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(paramLeadId);
  const [address, setAddress] = useState(paramAddress);
  const [custQuery, setCustQuery] = useState("");
  const [custMode, setCustMode] = useState(paramLeadId ? "selected" : "search");
  const [newForm, setNewForm] = useState({ name:"", phone:"", email:"", company_name:"" });
  const selectedLead = leads.find(l=>String(l.id)===String(selectedLeadId));

  const [jobType, setJobType] = useState("Remodel"); // New Construction / Remodel / Addition
  const [status, setStatus] = useState("Draft");
  const [floorNames, setFloorNames] = useState(["1st"]);
  const [activeFloor, setActiveFloor] = useState("1st");
  const [areas, setAreas] = useState([]);
  const [notes, setNotes] = useState("");

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
    (async()=>{
      const { data:{user} } = await supabase.auth.getUser();
      if(!user) return;
      const { data:cd } = await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      setCompanyId(cd?.id||null);
      if(cd?.id){
        const { data:listRows } = await supabase.from("cost_settings").select("name,sort_order")
          .eq("company_id",cd.id).eq("period","list_gc_trade").order("sort_order");
        if(listRows?.length) setCompanyTrades(listRows.map(r=>r.name));
        const { data:matRows } = await supabase.from("cost_settings").select("name,category,unit_price,notes,qty_per_job")
          .eq("company_id",cd.id).eq("period","list_gc_material").order("sort_order");
        if(matRows?.length) setCompanyMaterials(matRows);
      }
      const { data:ls } = await supabase.from("customers").select("id,name,phone,company_name,address,email").order("name").limit(1000);
      setLeads(ls||[]);

      if(isEditing){
        const { data:est } = await supabase.from("gc_estimates").select("*").eq("id",estimateId).maybeSingle();
        if(est){
          setSelectedLeadId(String(est.customer_id||""));
          setCustMode("selected");
          setAddress(est.address||"");
          setJobType(est.job_type||"Remodel");
          setAreas(est.areas||[]);
          setScopes(est.scopes||[]);
          setNotes(est.notes||"");
          setStatus(est.status||"Draft");
          setTaxRate(String(est.tax_rate||"0"));
          if(Number(est.markup_value)>0){ setMarkupOpen(true); setMarkupType(est.markup_type||"percent"); setMarkupValue(String(est.markup_value)); }
          if(Number(est.discount_value)>0){ setDiscountOpen(true); setDiscountType(est.discount_type||"percent"); setDiscountValue(String(est.discount_value)); }
          if(Number(est.deposit_value)>0){ setDepositOpen(true); setDepositType(est.deposit_type||"percent"); setDepositValue(String(est.deposit_value)); }
          if((est.payment_schedule||[]).length){ setScheduleOpen(true); setPaymentSchedule(est.payment_schedule); }
          const fls = sortFloors([...new Set((est.areas||[]).map(a=>a.floor).filter(Boolean))]);
          if(fls.length){ setFloorNames(fls); setActiveFloor(fls[0]); }
        }
        setLoading(false);
      }
    })();
  },[estimateId]);

  function selectLead(l){
    setSelectedLeadId(String(l.id));
    setCustMode("selected");
    if(l.address && !address) setAddress(l.address);
  }

  async function saveNewCustomer(){
    if(!newForm.name.trim()){ alert("Name is required."); return; }
    const { data, error } = await supabase.from("customers").insert([{...newForm, company_id:companyId}]).select().single();
    if(error){ alert("Could not save customer: "+error.message); return; }
    setLeads(p=>[...p, data]);
    selectLead(data);
  }

  function addArea(){
    const a = {
      id: uid(), floor: activeFloor, name: "", spec: "",
      measurements: [], mh:"", ml:"", mq:"1", sqft: 0,
      materials: [], notes: "", _expanded: true,
      fr_len:"", fr_spacing:"16", fr_openings:"0", // framing/stud calculator inputs
    };
    setAreas(prev=>[...prev, a]);
  }
  function updateArea(id, field, value){
    setAreas(prev=>prev.map(a=>a.id===id?{...a,[field]:value}:a));
  }
  function deleteArea(id){
    setAreas(prev=>prev.filter(a=>a.id!==id));
  }
  function commitMeasurement(areaId){
    setAreas(prev=>prev.map(a=>{
      if(a.id!==areaId) return a;
      const h = parseFloat(a.mh)||0, l = parseFloat(a.ml)||0, q = parseFloat(a.mq)||1;
      if(!h||!l) return a;
      const sqft = Math.round(h*l*q*100)/100;
      const meas = [...(a.measurements||[]), {h,l,q,sqft}];
      const total = Math.round(meas.reduce((s,m)=>s+m.sqft,0)*100)/100;
      return {...a, measurements:meas, sqft:total, mh:"", ml:"", mq:"1", materials:recalcAutoQty(a.materials, total)};
    }));
  }
  function deleteMeasurement(areaId, idx){
    setAreas(prev=>prev.map(a=>{
      if(a.id!==areaId) return a;
      const meas = (a.measurements||[]).filter((_,i)=>i!==idx);
      const total = Math.round(meas.reduce((s,m)=>s+m.sqft,0)*100)/100;
      return {...a, measurements:meas, sqft:total, materials:recalcAutoQty(a.materials, total)};
    }));
  }
  // Re-run the coverage calculation for any material row still flagged
  // auto-qty (i.e. the user hasn't hand-edited its quantity), so adding
  // more measurements after picking a material keeps the qty in sync.
  function recalcAutoQty(materials, sqft){
    return (materials||[]).map(m=>{
      if(!m._auto_qty) return m;
      const known = companyMaterials.find(cm=>cm.name===m.material);
      const coverage = Number(known?.qty_per_job)||0;
      if(coverage>0 && sqft>0) return {...m, qty:String(Math.ceil(sqft/coverage))};
      return m;
    });
  }

  function addMaterial(areaId){
    setAreas(prev=>prev.map(a=>a.id===areaId
      ? {...a, materials:[...(a.materials||[]), {id:uid(), category:"", material:"", qty:"", unit:"ea", unit_price:""}]}
      : a));
  }
  // Standard rule-of-thumb framing formula: studs = (wall length in inches / spacing) + 1
  // for the run itself, plus 2 extra studs per opening (a jack + king stud on each
  // side of a window/door) - a reasonable estimate, not a substitute for checking
  // against the actual plan when openings are close together or doubled up.
  function studCount(a){
    const lenFt = parseFloat(a.fr_len)||0;
    const spacing = parseFloat(a.fr_spacing)||16;
    const openings = parseFloat(a.fr_openings)||0;
    if(!lenFt||!spacing) return 0;
    const base = Math.ceil((lenFt*12)/spacing) + 1;
    return base + openings*4;
  }
  function insertStudCountAsMaterial(areaId){
    const a = areas.find(x=>x.id===areaId);
    const count = studCount(a);
    if(!count) return;
    setAreas(prev=>prev.map(x=>x.id!==areaId ? x : {
      ...x, materials:[...(x.materials||[]), {id:uid(), material:"", qty:String(count), unit:"each", unit_price:""}]
    }));
  }
  function updateMaterial(areaId, matId, field, value){
    setAreas(prev=>prev.map(a=>a.id!==areaId ? a : {
      ...a, materials:(a.materials||[]).map(m=>{
        if(m.id!==matId) return m;
        if(field==="category"){
          return {...m, category:value, material:"", unit_price:"", _auto_qty:false};
        }
        if(field==="material"){
          const known = companyMaterials.find(cm=>cm.name===value);
          if(known){
            const coverage = Number(known.qty_per_job)||0; // sqft one unit covers, e.g. one OSB sheet = 32 sqft
            const autoQty = coverage>0 && Number(a.sqft)>0 ? Math.ceil(Number(a.sqft)/coverage) : m.qty;
            return {...m, material:value, category:known.category||m.category, unit:known.notes||m.unit, unit_price:String(known.unit_price??m.unit_price),
              qty:String(autoQty||""), _auto_qty: coverage>0 && Number(a.sqft)>0};
          }
        }
        // Manually editing qty turns off auto-calc for this row so it stops overriding a hand-typed value
        if(field==="qty") return {...m, qty:value, _auto_qty:false};
        return {...m,[field]:value};
      })
    }));
  }
  function deleteMaterial(areaId, matId){
    setAreas(prev=>prev.map(a=>a.id!==areaId ? a : {...a, materials:(a.materials||[]).filter(m=>m.id!==matId)}));
  }

  function addScope(){
    setScopes(prev=>[...prev, {
      id: uid(), trade: (companyTrades.length?companyTrades:DEFAULT_TRADES)[0]||"",
      title: "", description: "",
      performed_by: "Subcontractor", subcontractor_name: "",
      material_cost: "", labor_cost: "", notes: "",
    }]);
  }
  function updateScope(id, field, value){
    setScopes(prev=>prev.map(sc=>sc.id===id?{...sc,[field]:value}:sc));
  }
  function deleteScope(id){
    setScopes(prev=>prev.filter(sc=>sc.id!==id));
  }

  const subtotal = areas.reduce((s,a)=>s+materialsTotal(a.materials),0) + scopeTotal(scopes);
  const markupAmount = markupOpen ? (markupType==="percent" ? subtotal*(Number(markupValue)||0)/100 : Number(markupValue)||0) : 0;
  const discountAmount = discountOpen ? (discountType==="percent" ? subtotal*(Number(discountValue)||0)/100 : Number(discountValue)||0) : 0;
  const afterAdjustments = Math.max(0, subtotal + markupAmount - discountAmount);
  const taxTotal = afterAdjustments * (Number(taxRate)||0)/100;
  const grandTotal = afterAdjustments + taxTotal;
  const depositAmount = depositOpen ? (depositType==="percent" ? grandTotal*(Number(depositValue)||0)/100 : Number(depositValue)||0) : 0;
  function installmentAmount(s){ return s.type==="percent" ? grandTotal*(Number(s.value)||0)/100 : Number(s.value)||0; }
  const scheduledTotal = paymentSchedule.reduce((s,it)=>s+installmentAmount(it),0);

  function emailQuote(){
    if(!selectedLead){ alert("Select a customer first."); return; }
    const lines = [];
    lines.push(`Estimate for ${address||"your project"}`);
    lines.push(`Job type: ${jobType}`);
    lines.push("");
    areas.forEach(a=>{
      if(!a.name && !(a.materials||[]).length) return;
      lines.push(`${a.floor} — ${a.name||"(area)"}${a.spec?` (${a.spec})`:""}`);
      (a.materials||[]).forEach(m=>{
        if(!m.material) return;
        lines.push(`  ${m.material}: ${m.qty||0} ${m.unit||""} × $${m.unit_price||0} = $${fmt((Number(m.qty)||0)*(Number(m.unit_price)||0))}`);
      });
    });
    if(scopes.length){
      lines.push("");
      lines.push("Scopes of work:");
      scopes.forEach(sc=>{
        const lt = (Number(sc.material_cost)||0)+(Number(sc.labor_cost)||0);
        lines.push(`  ${sc.title||sc.trade}: $${fmt(lt)}`);
      });
    }
    lines.push("");
    lines.push(`Subtotal: $${fmt(subtotal)}`);
    if(markupOpen && Number(markupValue)>0) lines.push(`Markup: +$${fmt(markupAmount)}`);
    if(discountOpen && Number(discountValue)>0) lines.push(`Discount: -$${fmt(discountAmount)}`);
    if(Number(taxRate)>0) lines.push(`Tax (${taxRate}%): $${fmt(taxTotal)}`);
    lines.push(`Total: $${fmt(grandTotal)}`);
    if(depositOpen && Number(depositValue)>0) lines.push(`Deposit required: $${fmt(depositAmount)}`);

    const subject = encodeURIComponent(`Estimate for ${address||"your project"}`);
    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:${selectedLead.email||""}?subject=${subject}&body=${body}`;
  }

  async function saveEstimate(){
    if(saving) return;
    if(!selectedLeadId){ alert("Please select a customer first."); return; }
    if(!areas.length){ alert("Add at least one measured area."); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        customer_id: Number(selectedLeadId),
        address, job_type: jobType, areas, scopes, notes, status,
        tax_rate: Number(taxRate)||0,
        markup_type: markupType, markup_value: markupOpen ? Number(markupValue)||0 : 0,
        discount_type: discountType, discount_value: discountOpen ? Number(discountValue)||0 : 0,
        deposit_type: depositType, deposit_value: depositOpen ? Number(depositValue)||0 : 0,
        payment_schedule: scheduleOpen ? paymentSchedule.map(s=>({...s})) : [],
        updated_at: new Date().toISOString(),
      };
      if(isEditing){
        const { error } = await supabase.from("gc_estimates").update(payload).eq("id", estimateId);
        if(error) throw error;
      } else {
        const { data, error } = await supabase.from("gc_estimates").insert([payload]).select().single();
        if(error) throw error;
        navigate(`/gc/${data.id}`, { replace:true });
      }
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    } catch(e){
      alert("Save failed: "+e.message);
    } finally {
      setSaving(false);
    }
  }

  if(loading) return <div style={{padding:40,textAlign:"center",color:C.muted}}>Loading…</div>;

  const floorAreas = areas.filter(a=>a.floor===activeFloor);
  const gcMaterialCategories = [...new Set(companyMaterials.map(m=>m.category||"Other"))].sort();
  if(!gcMaterialCategories.length) gcMaterialCategories.push("Framing","Board & Plaster","Roofing","Windows & Doors","Siding","Flooring","Other");
  const floorTotal = floorAreas.reduce((s,a)=>s+materialsTotal(a.materials),0);

  const estimateTotalsPanel = (
    <div style={{fontSize:11,lineHeight:1.55}}>
      {selectedLead && (
        <div style={{marginBottom:7,paddingBottom:6,borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontWeight:700,fontSize:12,color:C.ink}}>{selectedLead.name}</div>
          {selectedLead.phone && <div style={{color:C.muted}}>{selectedLead.phone}</div>}
          {selectedLead.company_name && <div style={{color:C.muted}}>{selectedLead.company_name}</div>}
          {selectedLead.email && <div style={{color:C.faint,fontSize:10}}>{selectedLead.email}</div>}
        </div>
      )}
      {address && (
        <div style={{marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${C.border}`,color:C.muted}}>
          <span style={{fontWeight:600,color:C.ink}}>{jobType} </span>{address}
        </div>
      )}

      <div style={{marginBottom:8}}>
        {areas.filter(a=>a.name || (a.materials||[]).some(m=>m.material)).map(a=>(
          <div key={a.id} style={{marginBottom:8}}>
            <div style={{fontWeight:700,color:C.ink,fontSize:11}}>{a.floor} — {a.name}{a.spec?` (${a.spec})`:""}</div>
            {(a.materials||[]).filter(m=>m.material).map(m=>(
              <div key={m.id} style={{display:"flex",justifyContent:"space-between",paddingLeft:6,color:C.muted,fontSize:10.5}}>
                <span>{m.material} ({m.qty||0} {m.unit||""})</span>
                <span style={{color:C.ink,flexShrink:0,marginLeft:6}}>${fmt((Number(m.qty)||0)*(Number(m.unit_price)||0))}</span>
              </div>
            ))}
          </div>
        ))}
        {scopes.filter(sc=>sc.title||sc.trade).map(sc=>(
          <div key={sc.id} style={{marginBottom:8}}>
            <div style={{fontWeight:700,color:C.ink,fontSize:11}}>{sc.trade}{sc.title?` — ${sc.title}`:""}</div>
            {sc.performed_by==="Subcontractor" && sc.subcontractor_name && (
              <div style={{paddingLeft:6,color:C.faint,fontSize:10}}>Sub: {sc.subcontractor_name}</div>
            )}
            {Number(sc.material_cost)>0 && (
              <div style={{display:"flex",justifyContent:"space-between",paddingLeft:6,color:C.muted,fontSize:10.5}}>
                <span>Material</span><span style={{color:C.ink}}>${fmt(Number(sc.material_cost))}</span>
              </div>
            )}
            {Number(sc.labor_cost)>0 && (
              <div style={{display:"flex",justifyContent:"space-between",paddingLeft:6,color:C.muted,fontSize:10.5}}>
                <span>Labor</span><span style={{color:C.ink}}>${fmt(Number(sc.labor_cost))}</span>
              </div>
            )}
          </div>
        ))}
        {areas.length===0 && scopes.length===0 && (
          <div style={{color:C.faint,fontSize:10,textAlign:"center",padding:"10px 0"}}>Nothing entered yet</div>
        )}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
        <span style={{color:C.muted}}>Subtotal</span>
        <span style={{color:C.ink}}>${fmt(subtotal)}</span>
      </div>
      {markupOpen && Number(markupValue)>0 && (
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{color:C.muted}}>Markup</span>
          <span style={{color:C.ink}}>+${fmt(markupAmount)}</span>
        </div>
      )}
      {discountOpen && Number(discountValue)>0 && (
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{color:C.muted}}>Discount</span>
          <span style={{color:C.ink}}>-${fmt(discountAmount)}</span>
        </div>
      )}
      {Number(taxRate)>0 && (
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{color:C.muted}}>Tax ({taxRate}%)</span>
          <span style={{color:C.ink}}>${fmt(taxTotal)}</span>
        </div>
      )}
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <span style={{color:C.muted}}>Total</span>
        <span style={{color:C.green,fontWeight:800,fontSize:18}}>${fmt(grandTotal)}</span>
      </div>
      {depositOpen && Number(depositValue)>0 && (
        <div style={{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
          <span style={{color:C.muted}}>Deposit</span>
          <span style={{color:C.ink,fontWeight:700}}>${fmt(depositAmount)}</span>
        </div>
      )}
      {scheduleOpen && paymentSchedule.length>0 && (
        <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
          <div style={{color:C.muted,marginBottom:4}}>Payment Schedule</div>
          {paymentSchedule.map(s=>(
            <div key={s.id} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{color:C.muted,fontSize:11}}>{s.label||"Payment"}</span>
              <span style={{color:C.ink,fontSize:11}}>${fmt(installmentAmount(s))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"Inter,system-ui,sans-serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"12px 16px",background:C.white,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:10}}>
        <button onClick={()=>navigate(-1)} style={Btn}>← Back</button>
        <div style={{fontWeight:800,fontSize:15}}>✏️ GC Estimate</div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>window.print()} title="Print / Save as PDF" style={Btn}>🖨️ Office</button>
          <button onClick={emailQuote} title="Email this quote to the customer" style={Btn}>✉️ Email</button>
          <button onClick={saveEstimate} disabled={saving} style={{...BtnD,background:saving?"#64748b":C.ink}}>
            {saving?"…":saved?"✓ Saved":"Save"}
          </button>
        </div>
      </div>

      <div style={{display:"flex",flex:1}}>
      <div style={{flex:1,maxWidth:720,margin:"0 auto",padding:"14px 12px",minWidth:0}}>

        {/* Customer */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Customer</div>
          {custMode==="selected" && selectedLead ? (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{selectedLead.name}</div>
                {selectedLead.phone && <div style={{fontSize:12,color:C.muted}}>{selectedLead.phone}</div>}
              </div>
              <button onClick={()=>{setSelectedLeadId("");setCustMode("search");}} style={Btn}>Change</button>
            </div>
          ) : custMode==="new" ? (
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              <input placeholder="Full Name *" value={newForm.name} onChange={e=>setNewForm(p=>({...p,name:e.target.value}))} style={I} />
              <input placeholder="Phone" value={newForm.phone} onChange={e=>setNewForm(p=>({...p,phone:e.target.value}))} style={I} />
              <input placeholder="Email" value={newForm.email} onChange={e=>setNewForm(p=>({...p,email:e.target.value}))} style={I} />
              <div style={{display:"flex",gap:8}}>
                <button onClick={saveNewCustomer} style={BtnD}>Save Customer</button>
                <button onClick={()=>setCustMode("search")} style={Btn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{position:"relative"}}>
              <input value={custQuery} onChange={e=>setCustQuery(e.target.value)}
                placeholder="Search customer by name or phone…" style={{...I,width:"100%",paddingRight:70}} />
              <button onClick={()=>{setCustMode("new");setNewForm({name:custQuery,phone:"",email:"",company_name:""});}}
                style={{position:"absolute",right:4,top:4,height:24,padding:"0 10px",borderRadius:6,
                  border:"none",background:C.ink,color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>
                + New
              </button>
              {custQuery.trim().length>=1 && (()=>{
                const q = custQuery.toLowerCase();
                const results = leads.filter(l=>(l.name||"").toLowerCase().includes(q)).slice(0,8);
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

        {/* Address + job type */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Job</div>
          <AddressInput value={address} onChange={setAddress} placeholder="Job site address…" style={{...I,width:"100%",marginBottom:8}} />
          <select value={jobType} onChange={e=>setJobType(e.target.value)} style={{...I,width:"100%"}}>
            <option>New Construction</option>
            <option>Remodel</option>
            <option>Addition</option>
          </select>
        </div>

        {/* Measurements */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
            Measurements
          </div>

          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
            {floorNames.map(fn=>{
              const hasAreas = areas.some(a=>a.floor===fn);
              return (
                <button key={fn} onClick={()=>setActiveFloor(fn)}
                  style={{border:`1.5px solid ${activeFloor===fn?C.amber:hasAreas?"#fcd34d":C.border}`,
                    background:activeFloor===fn?C.amber:hasAreas?"#fffbeb":C.white,
                    color:activeFloor===fn?"#fff":hasAreas?C.amber:C.muted,
                    borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  {fn}{hasAreas && activeFloor!==fn ? " ✓" : ""}
                </button>
              );
            })}
            <button onClick={()=>{
                const name = window.prompt("New floor name (e.g. 2nd, Garage, Attic):");
                if(!name || !name.trim()) return;
                const trimmed = name.trim();
                if(floorNames.includes(trimmed)){ setActiveFloor(trimmed); return; }
                setFloorNames(prev=>sortFloors([...prev, trimmed]));
                setActiveFloor(trimmed);
              }}
              style={{border:`1.5px dashed ${C.border}`,background:"transparent",color:C.muted,
                borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              + Floor
            </button>
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <button onClick={addArea} style={{border:"none",background:"none",color:C.amber,fontWeight:700,fontSize:13,cursor:"pointer",padding:0}}>
              + Add area to {activeFloor}
            </button>
            <span style={{fontSize:12,color:C.muted}}>{fmt$(floorTotal)} total</span>
          </div>

          {floorAreas.length===0 && (
            <div style={{fontSize:12,color:C.faint,textAlign:"center",padding:"10px 0"}}>
              No areas on {activeFloor} yet — add one above.
            </div>
          )}

          {floorAreas.map(a=>{
            const expanded = a._expanded===true;
            const areaMatTotal = materialsTotal(a.materials);
            return (
              <div key={a.id} style={{border:"1.5px solid #cbd5e1",borderRadius:10,marginBottom:14,
                  background:C.white,boxShadow:"0 1px 4px rgba(0,0,0,.06)",overflow:"hidden"}}>
                <div onClick={()=>updateArea(a.id,"_expanded",!expanded)}
                  style={{padding:"10px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13,color:C.ink}}>{a.name||"(unnamed area)"}</div>
                    <div style={{fontSize:11,color:C.muted}}>
                      {a.spec ? a.spec+" · " : ""}{fmt(a.sqft)} ft²{areaMatTotal>0?` · ${fmt$(areaMatTotal)}`:""}
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    <button onClick={e=>{e.stopPropagation();deleteArea(a.id);}}
                      style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,padding:"0 2px"}}>✕</button>
                    <span style={{fontSize:12,color:C.faint}}>{expanded?"▲":"▼"}</span>
                  </div>
                </div>

                {expanded && (
                  <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",gap:8,marginTop:10,marginBottom:8}}>
                      <input placeholder="Area name (e.g. Exterior Wall, Floor, Roof)" value={a.name}
                        onChange={e=>updateArea(a.id,"name",e.target.value)} style={{...I,flex:2}} />
                      <input placeholder="Spec (e.g. 2x6 fur out)" value={a.spec}
                        onChange={e=>updateArea(a.id,"spec",e.target.value)} style={{...I,flex:1}} />
                    </div>

                    {/* Measurement entry */}
                    <div style={{display:"flex",gap:6,marginBottom:6}}>
                      <input placeholder="Qty" inputMode="decimal" value={a.mq}
                        onChange={e=>updateArea(a.id,"mq",e.target.value)} style={{...I,width:52}} />
                      <input placeholder="H" inputMode="decimal" value={a.mh}
                        onChange={e=>updateArea(a.id,"mh",e.target.value)} style={{...I,flex:1}} />
                      <input placeholder="L" inputMode="decimal" value={a.ml}
                        onChange={e=>updateArea(a.id,"ml",e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter") commitMeasurement(a.id);}} style={{...I,flex:1}} />
                      <button onClick={()=>commitMeasurement(a.id)} style={{...Btn,color:C.amber,borderColor:C.amber}}>+ Add</button>
                    </div>
                    {(a.measurements||[]).length>0 && (
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                        {a.measurements.map((m,i)=>(
                          <div key={i} style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:6,
                              padding:"3px 8px",fontSize:11,color:"#92400e",display:"flex",alignItems:"center",gap:6}}>
                            {m.h}×{m.l}{m.q>1?`×${m.q}`:""} <b>{fmt(m.sqft)}</b>
                            <span onClick={()=>deleteMeasurement(a.id,i)} style={{cursor:"pointer",color:"#b45309"}}>✕</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Framing / stud calculator — separate from sqft coverage,
                        since stud count depends on linear footage and spacing,
                        not area. */}
                    <div style={{background:"#f8fafc",border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>
                        🧮 Framing calculator
                      </div>
                      <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                        <div style={{flex:1,minWidth:80}}>
                          <div style={{fontSize:9,color:C.faint,marginBottom:2}}>WALL LENGTH (FT)</div>
                          <input placeholder="0" inputMode="decimal" value={a.fr_len}
                            onChange={e=>updateArea(a.id,"fr_len",e.target.value)} style={{...I,width:"100%"}} />
                        </div>
                        <div style={{width:100}}>
                          <div style={{fontSize:9,color:C.faint,marginBottom:2}}>SPACING</div>
                          <select value={a.fr_spacing} onChange={e=>updateArea(a.id,"fr_spacing",e.target.value)} style={{...I,width:"100%"}}>
                            <option value="16">16" o.c.</option>
                            <option value="24">24" o.c.</option>
                          </select>
                        </div>
                        <div style={{width:90}}>
                          <div style={{fontSize:9,color:C.faint,marginBottom:2}}>OPENINGS</div>
                          <input placeholder="0" inputMode="decimal" value={a.fr_openings}
                            onChange={e=>updateArea(a.id,"fr_openings",e.target.value)} style={{...I,width:"100%"}} />
                        </div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:11,color:C.muted}}>
                          = <b style={{color:C.ink,fontSize:14}}>{studCount(a)}</b> studs (start/end stud + 1 per opening for jack/king studs)
                        </span>
                        <button onClick={()=>insertStudCountAsMaterial(a.id)} disabled={!studCount(a)}
                          style={{...Btn,fontSize:11,padding:"4px 10px",height:26,opacity:studCount(a)?1:0.4}}>
                          + Add as material
                        </button>
                      </div>
                    </div>

                    {/* Materials for this section */}
                    <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>
                      Materials for this section
                    </div>
                    {(a.materials||[]).map(m=>{
                      const catFiltered = m.category
                        ? companyMaterials.filter(cm=>(cm.category||"Other")===m.category)
                        : companyMaterials; // no category picked yet - search everything by name
                      const datalistId = `gc-materials-${(m.category||"all").replace(/[^a-zA-Z0-9]/g,"_")}`;
                      return (
                      <div key={m.id} style={{marginBottom:8}}>
                        <div style={{display:"flex",gap:6,marginBottom:4}}>
                          <select value={m.category||""} onChange={e=>updateMaterial(a.id,m.id,"category",e.target.value)} style={{...I,width:130}}>
                            <option value="">Category…</option>
                            {gcMaterialCategories.map(c=><option key={c} value={c}>{c}</option>)}
                          </select>
                          <input placeholder={m.category?`${m.category} material…`:"Type to search all materials…"}
                            value={m.material} list={datalistId}
                            onChange={e=>updateMaterial(a.id,m.id,"material",e.target.value)} style={{...I,flex:1}} />
                        </div>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <input placeholder="Qty" inputMode="decimal" value={m.qty}
                            onChange={e=>updateMaterial(a.id,m.id,"qty",e.target.value)} style={{...I,width:56}} />
                          <input placeholder="Unit" value={m.unit}
                            onChange={e=>updateMaterial(a.id,m.id,"unit",e.target.value)} style={{...I,width:56}} />
                          <input placeholder="$/unit" inputMode="decimal" value={m.unit_price}
                            onChange={e=>updateMaterial(a.id,m.id,"unit_price",e.target.value)} style={{...I,width:70}} />
                          <span style={{fontSize:12,fontWeight:700,color:C.green,width:64,textAlign:"right"}}>
                            {fmt$((Number(m.qty)||0)*(Number(m.unit_price)||0))}
                          </span>
                          <button onClick={()=>deleteMaterial(a.id,m.id)}
                            style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:14}}>✕</button>
                        </div>
                        <datalist id={datalistId}>
                          {catFiltered.map(cm=><option key={cm.name} value={cm.name} />)}
                        </datalist>
                      </div>
                      );
                    })}
                    <button onClick={()=>addMaterial(a.id)} style={{...Btn,fontSize:11,padding:"4px 10px",height:26}}>
                      + Add material
                    </button>

                    <textarea placeholder="Notes for this area…" value={a.notes||""}
                      onChange={e=>updateArea(a.id,"notes",e.target.value)}
                      style={{...I,width:"100%",height:50,marginTop:10,padding:8,resize:"vertical"}} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Scopes & Subcontractors */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5}}>
              Scopes &amp; Subcontractors
            </div>
            <span style={{fontSize:12,color:C.muted}}>{fmt$(scopeTotal(scopes))} total</span>
          </div>
          <div style={{fontSize:11,color:C.faint,marginBottom:10}}>
            Add a scope as soon as you know it's needed — leave the price blank until the subcontractor gets back to you, then fill it in and it flows into the total below.
          </div>

          {scopes.length===0 && (
            <div style={{fontSize:12,color:C.faint,textAlign:"center",padding:"6px 0 12px"}}>
              No scopes added yet.
            </div>
          )}

          {scopes.map((sc, i)=>{
            const priced = (Number(sc.material_cost)||0) + (Number(sc.labor_cost)||0) > 0;
            const lineTotal = (Number(sc.material_cost)||0) + (Number(sc.labor_cost)||0);
            return (
              <div key={sc.id} style={{border:"1.5px solid #cbd5e1",borderRadius:10,padding:12,marginBottom:10,background:C.white}}>
                <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                  <span style={{fontWeight:800,color:C.amber,fontSize:13,width:18}}>{i+1}</span>
                  <select value={sc.trade} onChange={e=>updateScope(sc.id,"trade",e.target.value)} style={{...I,flex:1}}>
                    {(companyTrades.length?companyTrades:DEFAULT_TRADES).map(t=><option key={t}>{t}</option>)}
                  </select>
                  <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:10,whiteSpace:"nowrap",
                      background:priced?"#dcfce7":"#fef3c7",color:priced?"#059669":"#b45309"}}>
                    {priced?"✓ Priced":"⏳ Pending price"}
                  </span>
                  <button onClick={()=>deleteScope(sc.id)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16}}>✕</button>
                </div>
                <input placeholder="Work item title (e.g. Exterior Wall Framing & Sheathing Installation)"
                  value={sc.title} onChange={e=>updateScope(sc.id,"title",e.target.value)}
                  style={{...I,width:"100%",marginBottom:6,fontWeight:600}} />
                <textarea placeholder="Description (e.g. Includes framing of 3 walls, rough openings for 6 windows and 1 door)"
                  value={sc.description} onChange={e=>updateScope(sc.id,"description",e.target.value)}
                  style={{...I,width:"100%",height:44,padding:8,resize:"vertical",fontStyle:"italic",marginBottom:8}} />
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  <select value={sc.performed_by} onChange={e=>updateScope(sc.id,"performed_by",e.target.value)} style={{...I,width:130}}>
                    <option>Self</option>
                    <option>Subcontractor</option>
                  </select>
                  {sc.performed_by==="Subcontractor" && (
                    <input placeholder="Subcontractor name" value={sc.subcontractor_name}
                      onChange={e=>updateScope(sc.id,"subcontractor_name",e.target.value)} style={{...I,flex:1}} />
                  )}
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:C.faint,marginBottom:2}}>MATERIAL</div>
                    <input placeholder="$0.00" inputMode="decimal" value={sc.material_cost}
                      onChange={e=>updateScope(sc.id,"material_cost",e.target.value)} style={{...I,width:"100%"}} />
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:C.faint,marginBottom:2}}>LABOR</div>
                    <input placeholder="$0.00" inputMode="decimal" value={sc.labor_cost}
                      onChange={e=>updateScope(sc.id,"labor_cost",e.target.value)} style={{...I,width:"100%"}} />
                  </div>
                  <div style={{width:100,textAlign:"right"}}>
                    <div style={{fontSize:9,color:C.faint,marginBottom:2}}>LINE TOTAL</div>
                    <div style={{fontSize:15,fontWeight:800,color:C.green}}>{fmt$(lineTotal)}</div>
                  </div>
                </div>
              </div>
            );
          })}

          <button onClick={addScope} style={{...Btn,color:C.amber,borderColor:C.amber}}>+ Add scope</button>
        </div>

        {/* Notes */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Job Notes</div>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="General notes for the crew or office…"
            style={{...I,width:"100%",height:60,padding:8,resize:"vertical"}} />
        </div>

        {/* Pricing & Terms */}
        <div style={{...CARD,padding:0,overflow:"hidden"}}>
          <AdjustmentRow label="Add markup" open={markupOpen} type={markupType} value={markupValue} amount={markupAmount}
            onAdd={()=>setMarkupOpen(true)} onTypeChange={setMarkupType} onValueChange={setMarkupValue}
            onRemove={()=>{setMarkupOpen(false);setMarkupValue("");setMarkupType("percent");}} />
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <AdjustmentRow label="Apply discount" open={discountOpen} type={discountType} value={discountValue} amount={discountAmount}
              onAdd={()=>setDiscountOpen(true)} onTypeChange={setDiscountType} onValueChange={setDiscountValue}
              onRemove={()=>{setDiscountOpen(false);setDiscountValue("");setDiscountType("percent");}} />
          </div>
          <div style={{borderTop:`1px solid ${C.border}`,padding:"7px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13}}>Tax rate</span>
            <input inputMode="decimal" value={taxRate} onChange={e=>setTaxRate(e.target.value)}
              style={{...I,width:70,textAlign:"right"}} />
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

      </div>

      <div className="gc-side-panel" style={{width:260,flexShrink:0,borderLeft:`1px solid ${C.border}`,background:C.white,overflowY:"auto",padding:"10px 10px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:10,fontWeight:800,color:C.faint,textTransform:"uppercase",letterSpacing:0.5}}>Estimate Summary</div>
          <button onClick={()=>window.print()} title="Print / Save as PDF" style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:14}}>🖨️</button>
        </div>
        {estimateTotalsPanel}
      </div>
      </div>

      <div className="gc-bottom-panel" style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:C.white,borderTop:`2px solid ${C.border}`,boxShadow:"0 -2px 12px rgba(0,0,0,.08)"}}>
        <div onClick={()=>setBottomPanelOpen(p=>!p)} style={{padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
          <span style={{fontSize:10,fontWeight:800,color:C.faint,textTransform:"uppercase",letterSpacing:0.5}}>Estimate Summary — ${fmt(grandTotal)}</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={(e)=>{e.stopPropagation();window.print();}} title="Print / Save as PDF"
              style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:14,padding:0}}>🖨️</button>
            <span style={{fontSize:9,color:C.faint}}>{bottomPanelOpen?"▼":"▲"}</span>
          </div>
        </div>
        {bottomPanelOpen && (<div style={{maxHeight:"45vh",overflowY:"auto",padding:"8px 14px 24px"}}>{estimateTotalsPanel}</div>)}
      </div>

      {/* Dedicated print-only view for the Office button */}
      <div className="print-only-gc">
        <div style={{fontWeight:800,fontSize:18,marginBottom:4}}>Estimate — {address}</div>
        <div style={{fontSize:13,marginBottom:12}}>{selectedLead?.name} · {jobType}</div>
        {areas.map(a=>(a.name || (a.materials||[]).length>0) && (
          <div key={a.id} style={{marginBottom:10}}>
            <b>{a.floor} — {a.name}{a.spec?` (${a.spec})`:""}</b>
            {(a.materials||[]).filter(m=>m.material).map(m=>(
              <div key={m.id} style={{fontSize:12,paddingLeft:12}}>
                {m.material}: {m.qty} {m.unit} × ${m.unit_price} = ${fmt((Number(m.qty)||0)*(Number(m.unit_price)||0))}
              </div>
            ))}
          </div>
        ))}
        {scopes.length>0 && (
          <div style={{marginBottom:10}}>
            <b>Scopes of work</b>
            {scopes.map(sc=>(
              <div key={sc.id} style={{fontSize:12,paddingLeft:12}}>
                {sc.title||sc.trade}: ${fmt((Number(sc.material_cost)||0)+(Number(sc.labor_cost)||0))}
              </div>
            ))}
          </div>
        )}
        <div style={{fontWeight:800,fontSize:16,marginTop:10}}>Total: ${fmt(grandTotal)}</div>
      </div>
      <style>{`
        .print-only-gc { display: none; }
        @media print {
          body * { visibility: hidden; }
          .print-only-gc, .print-only-gc * { visibility: visible; display: block; }
          .print-only-gc { position: absolute; top: 0; left: 0; width: 100%; font-size: 14px; padding: 20px; }
        }
        @media (min-width: 900px) { .gc-bottom-panel { display: none !important; } }
        @media (max-width: 899px) { .gc-side-panel { display: none !important; } }
      `}</style>
    </div>
  );
}
