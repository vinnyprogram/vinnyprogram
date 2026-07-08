import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AddressInput from "./AddressInput";
import { AdjustmentRow, PaymentScheduleEditor } from "./PricingOptions";

const C = {
  bg: "#f4f5f7", white: "#fff", ink: "#0f172a",
  muted: "#64748b", faint: "#94a3b8",
  border: "#e2e8f0", green: "#059669",
  greenBg: "#f0fdf4", chip: "#f1f5f9",
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

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function CustomerSection({ leads, selectedLead, selectedLeadId, jobAddress,
    onSelect, onClear, onSaveNew, onAddressChange }) {
  const [query, setQuery]     = useState("");
  const [mode, setMode]       = useState(selectedLead ? "selected" : "search");
  const [editForm, setEditForm] = useState({ name:"", phone:"", email:"", company_name:"", address:"" });
  const [editSaving, setEditSaving] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [newForm, setNewForm] = useState({ name:"", phone:"", company_name:"", email:"", address:"" });

  useEffect(()=>{
    if(selectedLead && mode==="search") setMode("selected");
  },[selectedLead]);

  function openNew() {
    setNewForm({ name:query||"", phone:"", company_name:"", email:"", address:"" });
    setMode("new");
  }
  function clear() {
    onClear(); setQuery("");
    setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
    setMode("search");
  }
  const results = query.trim().length >= 1
    ? leads.filter(l=>
        (l.name||"").toLowerCase().includes(query.toLowerCase())||
        (l.phone||"").includes(query)
      ).sort((a,b)=>{
        const q=query.toLowerCase();
        const aS=(a.name||"").toLowerCase().startsWith(q);
        const bS=(b.name||"").toLowerCase().startsWith(q);
        if(aS&&!bS) return -1; if(!aS&&bS) return 1;
        return (a.name||"").localeCompare(b.name||"");
      }).slice(0,8)
    : [];

  function selectLead(lead) { onSelect(lead); setQuery(""); setMode("selected"); }

  async function saveNew() {
    if (!newForm.name && !newForm.phone) return;

    const phone = (newForm.phone||"").replace(/\D/g,"");
    const email = (newForm.email||"").toLowerCase().trim();
    const name = (newForm.name||"").toLowerCase().trim();

    const phoneMatch = phone.length >= 7 && leads.find(l=>
      (l.phone||"").replace(/\D/g,"").includes(phone) ||
      phone.includes((l.phone||"").replace(/\D/g,"").slice(-7))
    );
    const emailMatch = email && leads.find(l=>
      (l.email||"").toLowerCase().trim() === email
    );
    const nameMatch = name && leads.find(l=>
      (l.name||"").toLowerCase().trim() === name
    );

    if(phoneMatch){
      const useExisting = window.confirm(`"${phoneMatch.name}" already exists with this phone.\n\nOK = Use existing customer\nCancel = Register as new anyway`);
      if(useExisting){
        setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
        setMode("selected");
        onSelect(phoneMatch);
        return;
      }
      // Fall through — allow registering new customer with same phone
    }
    if(emailMatch){
      alert(`⚠️ "${emailMatch.name}" already exists with this email. Loading their profile.`);
      setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
      setMode("selected");
      onSelect(emailMatch);
      return;
    }
    if(nameMatch){
      const proceed = window.confirm(`⚠️ A customer named "${nameMatch.name}" already exists.\n\nAre you sure this is a different person?`);
      if(!proceed) return;
    }

    setSaving(true);
    await onSaveNew(newForm);
    setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
    setMode("selected");
    setSaving(false);
  }

  const nf = (k,v) => setNewForm(p=>({...p,[k]:v}));

  return (
    <div style={CARD}>
      <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>
        Customer
      </div>

      {/* SELECTED */}
      {mode==="selected" && selectedLead && (
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ fontSize:13, lineHeight:1.5 }}>
              <span style={{ fontWeight:700 }}>{selectedLead.name}</span>
              {selectedLead.phone && <span style={{ color:C.muted, fontSize:11, marginLeft:6 }}>{selectedLead.phone}</span>}
              {selectedLead.company_name && <span style={{ color:C.muted, fontSize:11, marginLeft:6 }}>· {selectedLead.company_name}</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{ setEditForm({name:selectedLead.name||"",phone:selectedLead.phone||"",email:selectedLead.email||"",company_name:selectedLead.company_name||"",address:selectedLead.address||""}); setMode("edit"); }}
                style={{ border:"none", background:"none", color:"#3b82f6", fontSize:13, cursor:"pointer", padding:"0 4px", fontWeight:600 }}>✏️ Edit</button>
              <button onClick={clear} style={{ border:"none", background:"none", color:C.faint, fontSize:13, cursor:"pointer", padding:"0 4px" }}>Change</button>
            </div>
          </div>
          <div style={{fontSize:10,color:C.faint,marginBottom:4}}>Job address</div>
          <AddressInput style={{...I,width:"100%"}}
            placeholder="Job address for this estimate…" value={jobAddress}
            onChange={onAddressChange} />
        </div>
      )}

      {/* EDIT CUSTOMER */}
      {mode==="edit" && selectedLead && (
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"#3b82f6",marginBottom:8}}>Edit Customer</div>
          {[
            {label:"Name",     field:"name",         placeholder:"Full name"},
            {label:"Phone",    field:"phone",         placeholder:"Phone number"},
            {label:"Email",    field:"email",         placeholder:"Email address"},
            {label:"Company",  field:"company_name",  placeholder:"Company (optional)"},
          ].map(({label,field,placeholder})=>(
            <div key={field} style={{marginBottom:6}}>
              <div style={{fontSize:10,color:C.faint,marginBottom:2}}>{label}</div>
              <input value={editForm[field]||""} onChange={e=>setEditForm(p=>({...p,[field]:e.target.value}))}
                placeholder={placeholder}
                style={{...I,width:"100%",boxSizing:"border-box"}}/>
            </div>
          ))}
          <div style={{display:"flex",gap:6,marginTop:8}}>
            <button disabled={editSaving} onClick={async()=>{
                if(!editForm.name.trim()){ alert("Name is required"); return; }
                setEditSaving(true);
                try{
                  const {error}=await supabase.from("customers").update({
                    name:editForm.name.trim(),
                    phone:editForm.phone.trim(),
                    email:editForm.email.trim(),
                    company_name:editForm.company_name.trim(),
                  }).eq("id",selectedLead.id);
                  if(error) throw error;
                  onSelect({...selectedLead,...editForm});
                  setMode("selected");
                }catch(e){ alert("Error saving: "+e.message); }
                setEditSaving(false);
              }}
              style={{flex:1,border:"none",background:"#059669",color:"#fff",padding:"8px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>
              {editSaving?"Saving…":"Save Changes"}
            </button>
            <button onClick={()=>setMode("selected")}
              style={{border:`1px solid ${C.border}`,background:"#fff",color:C.muted,padding:"8px 14px",borderRadius:6,cursor:"pointer",fontSize:13}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SEARCH */}
      {mode==="search" && (
        <div>
          <div style={{ display:"flex", gap:6, marginBottom:results.length||query?6:0 }}>
            <input style={{...I,flex:1}} placeholder="Search customer by name or phone…"
              value={query} onChange={e=>setQuery(e.target.value)} />
            <button onClick={openNew} style={{...BtnD,flexShrink:0}}>+ New</button>
          </div>
          {results.length>0 && (
            <div style={{ border:`1px solid ${C.border}`, borderRadius:6, overflow:"hidden", marginBottom:4 }}>
              {results.map((l,i)=>(
                <div key={l.id} onClick={()=>selectLead(l)}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"8px 10px", cursor:"pointer", fontSize:13,
                    background:i%2===0?C.white:"#fafbfc",
                    borderBottom:i<results.length-1?`1px solid ${C.border}`:"none" }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{l.name}</div>
                    {l.company_name && <div style={{ color:C.muted, fontSize:11 }}>{l.company_name}</div>}
                  </div>
                  <span style={{ color:C.faint, fontSize:12 }}>{l.phone}</span>
                </div>
              ))}
            </div>
          )}
          {query.trim().length>=2 && results.length===0 && (
            <div style={{ fontSize:12, color:C.faint, marginBottom:4, padding:"6px 0", textAlign:"center" }}>
              No match — <button onClick={openNew} style={{ border:"none", background:"none", color:C.green, cursor:"pointer", fontSize:12, padding:0, fontWeight:700 }}>Register new</button>
            </div>
          )}
        </div>
      )}

      {/* NEW CUSTOMER */}
      {mode==="new" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:0.4 }}>New customer</span>
            <button onClick={()=>setMode("search")} style={{ border:"none", background:"none", color:C.faint, fontSize:16, cursor:"pointer", padding:0 }}>✕</button>
          </div>

          <textarea
              placeholder="📋 Paste customer info here to auto-fill (name, phone, email, company, address)…"
              rows={2}
              style={{...I,width:"100%",marginBottom:8,height:"auto",padding:"6px 8px",resize:"none",fontFamily:"inherit"}}
              onChange={e=>{
                const text = e.target.value;
                if(!text.trim()) return;
                const parts = text.split(/[\n\-,;|]+/).map(s=>s.trim()).filter(Boolean);
                const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
                const phoneMatch = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
                const addrMatch = text.match(/\d+\s+\w[\w\s]+(?:st|ave|rd|blvd|dr|ln|ct|way|pl|street|avenue|road|drive|lane|court|boulevard)\b[^]*/i);
                const extracted = {};
                if(emailMatch) extracted.email = emailMatch[0];
                if(phoneMatch) extracted.phone = phoneMatch[0];
                if(addrMatch) extracted.address = addrMatch[0].split(/[\n\-]/)[0].trim();
                const remaining = parts.filter(l=>
                  !l.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i) &&
                  !l.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) &&
                  !(addrMatch && l.includes(addrMatch[0].split(" ")[0]))
                );
                if(remaining[0]) extracted.name = remaining[0];
                if(remaining[1]) extracted.company_name = remaining[1];
                setNewForm(p=>({...p,...extracted}));
                e.target.value="";
              }}
            />

          <input style={{...I,width:"100%",marginBottom:6}} placeholder="Full name *" value={newForm.name} onChange={e=>nf("name",e.target.value)} />
          <input style={{...I,width:"100%",marginBottom:6}} placeholder="Phone number" value={newForm.phone} onChange={e=>nf("phone",e.target.value)} />
          <input style={{...I,width:"100%",marginBottom:6}} placeholder="Email" value={newForm.email} onChange={e=>nf("email",e.target.value)} />
          <input style={{...I,width:"100%",marginBottom:6}} placeholder="Company name" value={newForm.company_name} onChange={e=>nf("company_name",e.target.value)} />
          <div style={{fontSize:10,color:C.faint,marginBottom:4}}>Customer's address (home/business — not necessarily the job site)</div>
          <AddressInput style={{...I,width:"100%",marginBottom:10}}
            placeholder="Customer address" value={newForm.address}
            onChange={v=>nf("address",v)} />

          <button onClick={saveNew} disabled={saving||(!newForm.name&&!newForm.phone)}
            style={{ ...BtnD, width:"100%", justifyContent:"center", height:36, fontSize:13,
              opacity:(saving||(!newForm.name&&!newForm.phone))?0.4:1 }}>
            {saving?"Saving…":"Save customer"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function HersEstimate() {
  const navigate = useNavigate();
  const { id: estimateId } = useParams();
  const [searchParams] = useSearchParams();
  const isEditing = !!estimateId;

  const paramLeadId  = searchParams.get("leadId")||"";
  const paramAddress = searchParams.get("address")||"";

  const [loading, setLoading]   = useState(isEditing);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [companyId, setCompanyId] = useState(null);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [existingInvoiceId, setExistingInvoiceId] = useState(null);

  const locked = !!existingInvoiceId;

  // customer
  const [leads, setLeads]       = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(paramLeadId);
  const [address, setAddress]   = useState(paramAddress);

  // services price list
  const [services, setServices] = useState([]);
  const [showServiceManager, setShowServiceManager] = useState(false);

  // line items
  const [lineItems, setLineItems] = useState([
    { id: Date.now(), service_name: "", price: "", qty: "1", tax: "0" }
  ]);

  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes]     = useState("");
  const [status, setStatus]   = useState("Draft");
  const [unitCount, setUnitCount] = useState("1"); // multifamily: number of units in this building
  const [unitStatus, setUnitStatus] = useState({}); // { "Unit 1": true } - which units have measurements started
  const [duplicating, setDuplicating] = useState(false);

  // pricing options: markup, discount, deposit, payment schedule
  const [markupOpen, setMarkupOpen]     = useState(false);
  const [markupType, setMarkupType]     = useState("percent");
  const [markupValue, setMarkupValue]   = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [depositOpen, setDepositOpen]   = useState(false);
  const [depositType, setDepositType]   = useState("percent");
  const [depositValue, setDepositValue] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [paymentSchedule, setPaymentSchedule] = useState([]);

  useEffect(()=>{ load(); },[]);

  async function load() {
    const { data:{ user } } = await supabase.auth.getUser();
    if(!user) return;
    setOwnerEmail(user.email||"");
    const { data:cd } = await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
    if(!cd) return;
    setCompanyId(cd.id);

    const { data:custData } = await supabase.from("customers")
      .select("id,name,phone,address,email,company_name").order("name").limit(1000);
    if(custData) setLeads(custData);

    const { data:svc } = await supabase.from("hers_services")
      .select("*").eq("company_id",cd.id).order("sort_order");
    if(svc) setServices(svc);

    if(estimateId){
      const { data:est } = await supabase.from("hers_estimates").select("*").eq("id",estimateId).maybeSingle();
      if(est){
        setSelectedLeadId(String(est.customer_id||""));
        setAddress(est.address||"");
        setTaxRate(String(est.tax_rate||0));
        setNotes(est.notes||"");
        setStatus(est.status||"Draft");
        setUnitCount(String(est.unit_count||1));
        const items = Array.isArray(est.line_items) ? est.line_items
          : (typeof est.line_items === "string" ? JSON.parse(est.line_items||"[]") : []);
        if(items.length) setLineItems(items.map(it=>({...it, id: it.id||Date.now()+Math.random()})));

        if(est.markup_value){ setMarkupOpen(true); setMarkupType(est.markup_type||"percent"); setMarkupValue(String(est.markup_value)); }
        if(est.discount_value){ setDiscountOpen(true); setDiscountType(est.discount_type||"percent"); setDiscountValue(String(est.discount_value)); }
        if(est.deposit_value){ setDepositOpen(true); setDepositType(est.deposit_type||"percent"); setDepositValue(String(est.deposit_value)); }
        const sched = Array.isArray(est.payment_schedule) ? est.payment_schedule
          : (typeof est.payment_schedule === "string" ? JSON.parse(est.payment_schedule||"[]") : []);
        if(sched.length){ setScheduleOpen(true); setPaymentSchedule(sched.map(s=>({...s, id: s.id||Date.now()+Math.random()}))); }

        const { data:existingInv } = await supabase.from("hers_invoices")
          .select("id").eq("hers_estimate_id", estimateId)
          .order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(existingInv) setExistingInvoiceId(existingInv.id);

        // Which units already have measurements started, so the Units
        // list can show a checkmark instead of everything looking empty.
        const { data:fms } = await supabase.from("hers_field_measurements")
          .select("unit_label").eq("hers_estimate_id", estimateId);
        const statusMap = {};
        (fms||[]).forEach(f=>{ statusMap[f.unit_label||""] = true; });
        setUnitStatus(statusMap);
      }
      setLoading(false);
    }
  }

  async function duplicateUnit(fromLabel, toLabel){
    if(!estimateId) return;
    setDuplicating(true);
    try {
      const { data:src } = await supabase.from("hers_field_measurements")
        .select("*").eq("hers_estimate_id",estimateId).eq("unit_label",fromLabel).maybeSingle();
      if(!src){ alert(`${fromLabel} doesn't have any measurements yet - nothing to copy.`); return; }
      const { id, unit_label, created_at, ...rest } = src;
      await supabase.from("hers_field_measurements").upsert(
        { ...rest, hers_estimate_id: estimateId, unit_label: toLabel },
        { onConflict: "hers_estimate_id,unit_label" }
      );
      setUnitStatus(p=>({ ...p, [toLabel]: true }));
      alert(`Copied ${fromLabel} into ${toLabel}. Open ${toLabel} to adjust anything that's different.`);
    } catch(err){
      alert("Error duplicating unit: "+(err.message||JSON.stringify(err)));
    }
    setDuplicating(false);
  }

  const selectedLead = leads.find(l=>String(l.id)===String(selectedLeadId));

  function selectLead(lead){
    // Only clear job address when switching to a DIFFERENT customer
    if(String(lead.id) !== String(selectedLeadId)){
      setAddress("");
    }
    setSelectedLeadId(String(lead.id));
    // Refresh leads list so any edited name/phone shows immediately
    loadLeads();
  }

  function loadLeads(){
    supabase.from("customers").select("id,name,phone,address,email,company_name").order("name").limit(1000)
      .then(({data})=>{ if(data) setLeads(data); });
  }

  async function saveNewCustomer(form){
    const { data, error } = await supabase.from("customers").insert([{
      name: form.name||"", phone: form.phone||"", company_name: form.company_name||"",
      email: form.email||"", address: form.address||"", status:"New", estimate_amount:0,
      company_id: companyId,
    }]).select().single();
    if(error){ alert("Could not save customer: "+(error.message||JSON.stringify(error))); return; }
    if(data){
      loadLeads();
      setSelectedLeadId(String(data.id));
      // Don't clear job address — user may have already typed it
    }
  }

  function addLine(serviceName){
    const svc = services.find(s=>s.name===serviceName);
    setLineItems(p=>[...p, {
      id: Date.now()+Math.random(),
      service_name: serviceName||"",
      price: svc ? String(svc.default_price||0) : "",
      qty: "1", tax: "0",
    }]);
  }

  function updateLine(idx, field, value){
    setLineItems(p=>p.map((it,i)=>{
      if(i!==idx) return it;
      const upd = {...it, [field]: value};
      if(field==="service_name"){
        const svc = services.find(s=>s.name===value);
        if(svc) upd.price = String(svc.default_price||0);
      }
      return upd;
    }));
  }

  function removeLine(idx){
    setLineItems(p=>p.filter((_,i)=>i!==idx));
  }

  function lineTotal(it){
    return (Number(it.price)||0) * (Number(it.qty)||1);
  }

  const subtotal = lineItems.reduce((s,it)=>s+lineTotal(it),0);
  const markupAmount = markupOpen ? (markupType==="percent" ? subtotal*(Number(markupValue)||0)/100 : (Number(markupValue)||0)) : 0;
  const discountAmount = discountOpen ? (discountType==="percent" ? subtotal*(Number(discountValue)||0)/100 : (Number(discountValue)||0)) : 0;
  const adjustedSubtotal = subtotal + markupAmount - discountAmount;
  const taxTotal = adjustedSubtotal * (Number(taxRate)||0)/100;
  const grandTotal = adjustedSubtotal + taxTotal;
  const depositAmount = depositOpen ? (depositType==="percent" ? grandTotal*(Number(depositValue)||0)/100 : (Number(depositValue)||0)) : 0;
  function installmentAmount(s){
    return s.type==="percent" ? grandTotal*(Number(s.value)||0)/100 : (Number(s.value)||0);
  }
  const scheduledTotal = paymentSchedule.reduce((s,it)=>s+installmentAmount(it),0);

  async function saveEstimate(){
    if(saving) return;
    if(!selectedLeadId){ alert("Please select a customer first."); return; }
    const validItems = lineItems.filter(it=>it.service_name && Number(it.price)>=0);
    if(!validItems.length){ alert("Add at least one line item."); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        customer_id: Number(selectedLeadId),
        address,
        status,
        line_items: validItems,
        subtotal: Math.round(subtotal*100)/100,
        tax_rate: Number(taxRate)||0,
        tax_total: Math.round(taxTotal*100)/100,
        grand_total: Math.round(grandTotal*100)/100,
        markup_type: markupOpen ? markupType : null,
        markup_value: markupOpen ? (Number(markupValue)||0) : 0,
        discount_type: discountOpen ? discountType : null,
        discount_value: discountOpen ? (Number(discountValue)||0) : 0,
        deposit_type: depositOpen ? depositType : null,
        deposit_value: depositOpen ? (Number(depositValue)||0) : 0,
        payment_schedule: scheduleOpen ? paymentSchedule.map(s=>({
          id: s.id, label: s.label||"", type: s.type, value: Number(s.value)||0,
        })) : [],
        notes,
        unit_count: Number(unitCount)||1,
        updated_at: new Date().toISOString(),
      };
      if(isEditing){
        await supabase.from("hers_estimates").update(payload).eq("id", estimateId);
      } else {
        const { data, error } = await supabase.from("hers_estimates").insert([payload]).select().single();
        if(error) throw error;
        navigate(`/hers/${data.id}`, { replace:true });
      }
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    } catch(err){
      alert("Error saving: "+(err.message||JSON.stringify(err)));
    }
    setSaving(false);
  }

  function emailToCustomer(){
    if(!selectedLead){ alert("Please select a customer first."); return; }
    if(!selectedLead.email){ alert(`${selectedLead.name} doesn't have an email on file. Add one to their customer profile first.`); return; }
    const validItems = lineItems.filter(it=>it.service_name && Number(it.price)>=0);
    if(!validItems.length){ alert("Add at least one line item first."); return; }

    const lines = [];
    lines.push(`Hi ${selectedLead.name},`);
    lines.push("");
    lines.push("Here is your HERS Rating estimate:");
    lines.push("");
    validItems.forEach(it=>{
      lines.push(`- ${it.service_name} (x${it.qty||1}): $${fmt(lineTotal(it))}`);
    });
    lines.push("");
    lines.push(`Subtotal: $${fmt(subtotal)}`);
    if(markupOpen && Number(markupValue)>0) lines.push(`Markup${markupType==="percent"?` (${markupValue}%)`:""}: +$${fmt(markupAmount)}`);
    if(discountOpen && Number(discountValue)>0) lines.push(`Discount${discountType==="percent"?` (${discountValue}%)`:""}: -$${fmt(discountAmount)}`);
    if(Number(taxRate)>0) lines.push(`Tax (${taxRate}%): $${fmt(taxTotal)}`);
    lines.push(`Total: $${fmt(grandTotal)}`);
    if(depositOpen && Number(depositValue)>0){
      lines.push("");
      lines.push(`Deposit required${depositType==="percent"?` (${depositValue}%)`:""}: $${fmt(depositAmount)}`);
    }
    if(scheduleOpen && paymentSchedule.length>0){
      lines.push("");
      lines.push("Payment Schedule:");
      paymentSchedule.forEach(s=>lines.push(`  - ${s.label||"Payment"}: $${fmt(installmentAmount(s))}`));
    }
    if(address){ lines.push(""); lines.push(`Job address: ${address}`); }
    if(notes){ lines.push(""); lines.push(notes); }
    lines.push("");
    lines.push("Please let us know if you have any questions or would like to proceed.");

    const subject = `Your HERS Rating Estimate${address?` — ${address}`:""}`;
    const body = lines.join("\n");
    const parts = [];
    if(ownerEmail) parts.push(`cc=${encodeURIComponent(ownerEmail)}`);
    parts.push(`subject=${encodeURIComponent(subject)}`);
    parts.push(`body=${encodeURIComponent(body)}`);
    window.location.href = `mailto:${selectedLead.email}?${parts.join("&")}`;
  }


  async function convertToInvoice(){
    if(!isEditing) return;
    if(existingInvoiceId){ navigate(`/hers/invoice/${existingInvoiceId}`); return; }
    if(!window.confirm("Create an invoice from this estimate?")) return;
    try {
      // defensive re-check in case state is stale or this ran twice in a race
      const { data:existingInv } = await supabase.from("hers_invoices")
        .select("id").eq("hers_estimate_id", estimateId)
        .order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(existingInv){ navigate(`/hers/invoice/${existingInv.id}`); return; }

      const validItems = lineItems.filter(it=>it.service_name && Number(it.price)>=0);
      const { data, error } = await supabase.from("hers_invoices").insert([{
        company_id: companyId,
        customer_id: Number(selectedLeadId),
        hers_estimate_id: estimateId,
        address,
        line_items: validItems,
        subtotal: Math.round(subtotal*100)/100,
        tax_rate: Number(taxRate)||0,
        tax_total: Math.round(taxTotal*100)/100,
        grand_total: Math.round(grandTotal*100)/100,
        markup_type: markupOpen ? markupType : null,
        markup_value: markupOpen ? (Number(markupValue)||0) : 0,
        discount_type: discountOpen ? discountType : null,
        discount_value: discountOpen ? (Number(discountValue)||0) : 0,
        deposit_type: depositOpen ? depositType : null,
        deposit_value: depositOpen ? (Number(depositValue)||0) : 0,
        payment_schedule: scheduleOpen ? paymentSchedule.map(s=>({
          id: s.id, label: s.label||"", type: s.type, value: Number(s.value)||0,
        })) : [],
        notes,
        status: "Unpaid",
      }]).select().single();
      if(error) throw error;
      navigate(`/hers/invoice/${data.id}`);
    } catch(err){
      alert("Error creating invoice: "+(err.message||JSON.stringify(err)));
    }
  }

  async function addService(name, price){
    if(!name.trim()) return;
    const { data, error } = await supabase.from("hers_services")
      .insert([{ company_id: companyId, name: name.trim(), default_price: Number(price)||0, sort_order: services.length }])
      .select().single();
    if(!error && data) setServices(p=>[...p, data]);
  }

  async function deleteService(id){
    await supabase.from("hers_services").delete().eq("id", id);
    setServices(p=>p.filter(s=>s.id!==id));
  }

  async function updateService(id, field, value){
    const patch = field==="default_price" ? { default_price: Number(value)||0 } : { name: value };
    setServices(p=>p.map(s=>s.id===id?{...s,...patch}:s)); // optimistic
    await supabase.from("hers_services").update(patch).eq("id", id);
  }

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.muted}}>
      Loading…
    </div>
  );

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:C.bg,minHeight:"100vh",paddingBottom:60}}>

      {saved && (
        <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:300,
            background:"#059669",color:"#fff",padding:"8px 16px",borderRadius:20,fontSize:12,fontWeight:700,
            boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>
          ✅ Saved!
        </div>
      )}

      {/* header */}
      <div style={{position:"sticky",top:0,zIndex:100,background:C.white,borderBottom:`1px solid ${C.border}`,
          padding:"10px 16px",display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:8,rowGap:6}}>
        <button onClick={()=>navigate(-1)} style={Btn}>← Back</button>
        <span style={{fontWeight:700,fontSize:14,flex:"1 1 auto",textAlign:"center",minWidth:140}}>
          🏠 HERS Rating {isEditing?"Estimate":"— New Estimate"}
        </span>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end",flex:"1 1 auto"}}>
          {selectedLead && (
            <button onClick={emailToCustomer} style={{...Btn,color:"#2563eb",borderColor:"#2563eb"}}>
              📧 Email
            </button>
          )}
          {isEditing && Number(unitCount)<=1 && (
            <button onClick={()=>navigate(`/hers/measurements/estimate/${estimateId}`)}
              style={{...Btn,color:"#059669",borderColor:"#059669"}}>
              📐 Measurements
            </button>
          )}
          {isEditing && (
            <button onClick={convertToInvoice} style={{...Btn,color:"#7c3aed",borderColor:"#7c3aed"}}>
              {existingInvoiceId ? "📄 View Invoice" : "💵 Invoice"}
            </button>
          )}
          {!locked && (
            <button onClick={saveEstimate} disabled={saving} style={{...BtnD,opacity:saving?0.6:1}}>
              {saving?"Saving…":"Save"}
            </button>
          )}
        </div>
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"16px 14px"}}>

        {locked && (
          <div style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:10,
              padding:"12px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",
              alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:13,color:"#92400e"}}>
              🔒 This estimate is locked — an invoice has already been created from it. Make further changes on the invoice instead.
            </span>
            <button onClick={()=>navigate(`/hers/invoice/${existingInvoiceId}`)}
              style={{...Btn,whiteSpace:"nowrap",borderColor:"#92400e",color:"#92400e"}}>
              📄 Go to Invoice
            </button>
          </div>
        )}

        <div style={{pointerEvents:locked?"none":"auto", opacity:locked?0.6:1}}>

        {/* customer */}
        <CustomerSection
          leads={leads}
          selectedLead={selectedLead}
          selectedLeadId={selectedLeadId}
          jobAddress={address}
          onSelect={selectLead}
          onClear={()=>{setSelectedLeadId("");setAddress("");}}
          onSaveNew={saveNewCustomer}
          onAddressChange={setAddress}
        />

        {/* multifamily units */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
            Multifamily — Units
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:isEditing&&Number(unitCount)>1?12:0}}>
            <span style={{fontSize:13,color:"#374151"}}>Number of units</span>
            <input type="number" min="1" value={unitCount} onChange={e=>setUnitCount(e.target.value)}
              style={{...I,width:70,height:32,fontSize:13,textAlign:"center"}} />
            <span style={{fontSize:11,color:C.faint}}>(leave at 1 for a single-family job)</span>
          </div>

          {isEditing && Number(unitCount)>1 && (
            <div>
              {Array.from({length:Number(unitCount)||0}).map((_,i)=>{
                const label = `Unit ${i+1}`;
                const started = !!unitStatus[label];
                return (
                  <div key={label} style={{display:"flex",alignItems:"center",gap:8,
                      padding:"8px 0",borderTop:i>0?`1px solid ${C.border}`:"none"}}>
                    <span style={{fontSize:13,fontWeight:600,color:"#0f172a",flex:1}}>
                      {started?"✅":"⬜"} {label}
                    </span>
                    <button onClick={()=>navigate(`/hers/measurements/estimate/${estimateId}?unit=${encodeURIComponent(label)}`)}
                      style={{...Btn,color:"#059669",borderColor:"#059669",fontSize:11,padding:"5px 10px"}}>
                      📐 Measure
                    </button>
                    {started && (
                      <button onClick={()=>navigate(`/hers/ekotrope/estimate/${estimateId}?unit=${encodeURIComponent(label)}`)}
                        style={{...Btn,color:"#2563eb",borderColor:"#2563eb",fontSize:11,padding:"5px 10px"}}>
                        📊 Report
                      </button>
                    )}
                    <button disabled={duplicating}
                      onClick={()=>{
                        const from = prompt(`Copy measurements from which unit into ${label}? (e.g. Unit 1)`);
                        if(from && from.trim()) duplicateUnit(from.trim(), label);
                      }}
                      style={{...Btn,fontSize:11,padding:"5px 10px",opacity:duplicating?0.5:1}}>
                      ⧉ Duplicate from…
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {!isEditing && Number(unitCount)>1 && (
            <div style={{fontSize:11,color:C.faint,marginTop:8}}>
              Save the estimate first to unlock per-unit measurements.
            </div>
          )}
        </div>

        {/* line items */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>
              Line Items
            </div>
            <button onClick={()=>setShowServiceManager(p=>!p)}
              style={{border:"none",background:"none",color:"#3b82f6",cursor:"pointer",fontSize:11,fontWeight:700}}>
              {showServiceManager?"Done":"⚙ Manage Price List"}
            </button>
          </div>

          {showServiceManager && (
            <ServiceManager services={services} onAdd={addService} onDelete={deleteService} onUpdate={updateService} />
          )}

          {lineItems.map((it,idx)=>(
            <div key={it.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:8,boxSizing:"border-box"}}>
              <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                <select value={services.find(s=>s.name===it.service_name)?it.service_name:(it.service_name?"__custom__":"")}
                  onChange={e=>{
                    if(e.target.value==="__custom__") updateLine(idx,"service_name","");
                    else updateLine(idx,"service_name",e.target.value);
                  }}
                  style={{...I,fontSize:12,flex:1,minWidth:0,textOverflow:"ellipsis"}}>
                  <option value="">Select service…</option>
                  {services.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                  <option value="__custom__">✏️ Custom item</option>
                </select>
                <button onClick={()=>removeLine(idx)}
                  style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,padding:"0 4px",flexShrink:0}}>✕</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                <div>
                  <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Price</div>
                  <input type="number" placeholder="0.00" value={it.price}
                    onChange={e=>updateLine(idx,"price",e.target.value)}
                    style={{...I,fontSize:12,textAlign:"right",width:"100%",boxSizing:"border-box"}} />
                </div>
                <div>
                  <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Qty</div>
                  <input type="number" placeholder="1" value={it.qty}
                    onChange={e=>updateLine(idx,"qty",e.target.value)}
                    style={{...I,fontSize:12,textAlign:"center",width:"100%",boxSizing:"border-box"}} />
                </div>
                <div>
                  <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Total</div>
                  <div style={{...I,display:"flex",alignItems:"center",justifyContent:"flex-end",
                      fontSize:13,fontWeight:700,color:C.green,background:"#f8fafc",boxSizing:"border-box"}}>
                    ${fmt(lineTotal(it))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div style={{display:"flex",gap:8,marginTop:8}}>
            <select onChange={e=>{ if(e.target.value){ addLine(e.target.value); e.target.value=""; } }}
              style={{...I,flex:1,fontSize:12}}>
              <option value="">+ Add from price list…</option>
              {services.map(s=><option key={s.id} value={s.name}>{s.name} — ${fmt(s.default_price)}</option>)}
            </select>
            <button onClick={()=>addLine("")} style={{...Btn,whiteSpace:"nowrap"}}>+ Custom Line</button>
          </div>
        </div>

        {/* custom item names — inline editable when not matching price list */}
        {lineItems.some(it=>it.service_name && !services.find(s=>s.name===it.service_name)) && (
          <div style={{...CARD, background:"#fffbeb", borderColor:"#fde68a"}}>
            <div style={{fontSize:11,color:"#92400e",marginBottom:6}}>
              Custom item name(s) — type below to edit:
            </div>
            {lineItems.map((it,idx)=> it.service_name && !services.find(s=>s.name===it.service_name) ? (
              <input key={it.id} value={it.service_name}
                onChange={e=>updateLine(idx,"service_name",e.target.value)}
                placeholder="Custom service name…"
                style={{...I,width:"100%",marginBottom:4}} />
            ) : null)}
          </div>
        )}

        {/* tax + notes */}
        <div style={CARD}>
          <div style={{display:"flex",gap:12,marginBottom:10,alignItems:"center"}}>
            <span style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>Status</span>
            <select value={status} onChange={e=>setStatus(e.target.value)} style={{...I,width:130}}>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Declined">Declined</option>
            </select>
          </div>
          <div style={{display:"flex",gap:12,marginBottom:10,alignItems:"center"}}>
            <span style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>Tax rate</span>
            <input type="number" value={taxRate} onChange={e=>setTaxRate(e.target.value)}
              style={{...I,width:80}} />
            <span style={{fontSize:12,color:C.muted}}>%</span>
          </div>
          <textarea placeholder="Notes for this estimate…" value={notes} onChange={e=>setNotes(e.target.value)}
            rows={2} style={{...I,width:"100%",height:"auto",padding:"8px",resize:"none",fontFamily:"inherit"}} />
        </div>

        {/* pricing options: markup, discount, deposit, payment schedule */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:4}}>
            Pricing Options
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <AdjustmentRow label="Markup" open={markupOpen} type={markupType} value={markupValue} amount={markupAmount}
              onAdd={()=>setMarkupOpen(true)}
              onTypeChange={setMarkupType} onValueChange={setMarkupValue}
              onRemove={()=>{setMarkupOpen(false); setMarkupValue(""); setMarkupType("percent");}} />
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <AdjustmentRow label="Discount" open={discountOpen} type={discountType} value={discountValue} amount={discountAmount}
              onAdd={()=>setDiscountOpen(true)}
              onTypeChange={setDiscountType} onValueChange={setDiscountValue}
              onRemove={()=>{setDiscountOpen(false); setDiscountValue(""); setDiscountType("percent");}} />
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <AdjustmentRow label="Request a deposit" open={depositOpen} type={depositType} value={depositValue} amount={depositAmount}
              onAdd={()=>setDepositOpen(true)}
              onTypeChange={setDepositType} onValueChange={setDepositValue}
              onRemove={()=>{setDepositOpen(false); setDepositValue(""); setDepositType("percent");}} />
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <PaymentScheduleEditor open={scheduleOpen} schedule={paymentSchedule} grandTotal={grandTotal}
              scheduledTotal={scheduledTotal} installmentAmount={installmentAmount}
              onAdd={()=>setScheduleOpen(true)}
              onChange={setPaymentSchedule}
              onRemoveAll={()=>{setScheduleOpen(false); setPaymentSchedule([]);}} />
          </div>
        </div>

        {/* totals */}
        <div style={{background:C.ink,borderRadius:12,padding:"16px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Subtotal</span>
            <span style={{color:"#fff",fontSize:12}}>${fmt(subtotal)}</span>
          </div>
          {markupOpen && Number(markupValue)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Markup {markupType==="percent"?`(${markupValue}%)`:""}</span>
              <span style={{color:"#fff",fontSize:12}}>+${fmt(markupAmount)}</span>
            </div>
          )}
          {discountOpen && Number(discountValue)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Discount {discountType==="percent"?`(${discountValue}%)`:""}</span>
              <span style={{color:"#fff",fontSize:12}}>-${fmt(discountAmount)}</span>
            </div>
          )}
          {Number(taxRate)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Tax ({taxRate}%)</span>
              <span style={{color:"#fff",fontSize:12}}>${fmt(taxTotal)}</span>
            </div>
          )}
          <div style={{borderTop:"1px solid #374151",paddingTop:10,marginTop:4,
              display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Total</span>
            <span style={{color:"#059669",fontWeight:800,fontSize:24}}>${fmt(grandTotal)}</span>
          </div>
          {depositOpen && Number(depositValue)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,
                borderTop:"1px solid #374151"}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Deposit required {depositType==="percent"?`(${depositValue}%)`:""}</span>
              <span style={{color:"#fff",fontSize:13,fontWeight:700}}>${fmt(depositAmount)}</span>
            </div>
          )}
          {scheduleOpen && paymentSchedule.length>0 && (
            <div style={{marginTop:depositOpen&&Number(depositValue)>0?8:10,
                paddingTop:depositOpen&&Number(depositValue)>0?0:10,
                borderTop:depositOpen&&Number(depositValue)>0?"none":"1px solid #374151"}}>
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

      </div>
    </div>
  );
}

function ServiceManager({ services, onAdd, onDelete, onUpdate }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <div style={{background:"#f8fafc",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>Saved Services — click to edit</div>
      {services.map(s=>(
        <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,
            padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
          <input value={s.name}
            onChange={e=>onUpdate(s.id,"name",e.target.value)}
            style={{...I,flex:1,fontSize:12,border:"1px solid transparent",background:"transparent"}}
            onFocus={e=>e.target.style.border=`1px solid ${C.border}`}
            onBlur={e=>e.target.style.border="1px solid transparent"} />
          <span style={{fontSize:12,color:C.green,fontWeight:700,flexShrink:0}}>$</span>
          <input type="number" value={s.default_price}
            onChange={e=>onUpdate(s.id,"default_price",e.target.value)}
            style={{...I,width:70,fontSize:12,textAlign:"right",flexShrink:0,
              border:"1px solid transparent",background:"transparent",color:C.green,fontWeight:700}}
            onFocus={e=>e.target.style.border=`1px solid ${C.border}`}
            onBlur={e=>e.target.style.border="1px solid transparent"} />
          <button onClick={()=>onDelete(s.id)}
            style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:13,flexShrink:0}}>✕</button>
        </div>
      ))}
      <div style={{display:"flex",gap:6,marginTop:8}}>
        <input placeholder="New service name" value={name} onChange={e=>setName(e.target.value)}
          style={{...I,flex:2,fontSize:12}} />
        <input type="number" placeholder="Price" value={price} onChange={e=>setPrice(e.target.value)}
          style={{...I,flex:1,fontSize:12}} />
        <button onClick={()=>{ onAdd(name,price); setName(""); setPrice(""); }}
          style={{...BtnD,fontSize:11}}>+ Add</button>
      </div>
    </div>
  );
}
