import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AddressInput from "./AddressInput";

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
      alert(`⚠️ "${phoneMatch.name}" already exists with this phone. Loading their profile.`);
      setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
      setMode("selected");
      onSelect(phoneMatch);
      return;
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
            <button onClick={clear} style={{ border:"none", background:"none", color:C.faint, fontSize:13, cursor:"pointer", padding:"0 4px" }}>Change</button>
          </div>
          <div style={{fontSize:10,color:C.faint,marginBottom:4}}>Job address</div>
          <AddressInput style={{...I,width:"100%"}}
            placeholder="Job address for this estimate…" value={jobAddress}
            onChange={onAddressChange} />
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
  const isEditing = !!estimateId;

  const [loading, setLoading]   = useState(isEditing);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [companyId, setCompanyId] = useState(null);

  // customer
  const [leads, setLeads]       = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [address, setAddress]   = useState("");

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

  useEffect(()=>{ load(); },[]);

  async function load() {
    const { data:{ user } } = await supabase.auth.getUser();
    if(!user) return;
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
        const items = Array.isArray(est.line_items) ? est.line_items
          : (typeof est.line_items === "string" ? JSON.parse(est.line_items||"[]") : []);
        if(items.length) setLineItems(items.map(it=>({...it, id: it.id||Date.now()+Math.random()})));
      }
      setLoading(false);
    }
  }

  const selectedLead = leads.find(l=>String(l.id)===String(selectedLeadId));

  function selectLead(lead){
    setSelectedLeadId(String(lead.id));
    setAddress(""); // job address stays separate from customer's own address
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
      setAddress(""); // job address entered separately
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
  const taxTotal = subtotal * (Number(taxRate)||0)/100;
  const grandTotal = subtotal + taxTotal;

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
        notes,
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

  async function convertToInvoice(){
    if(!isEditing) return;
    if(!window.confirm("Create an invoice from this estimate?")) return;
    try {
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
        status: "Unpaid",
      }]).select().single();
      if(error) throw error;
      await supabase.from("hers_estimates").update({status:"Accepted"}).eq("id",estimateId);
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
          padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <button onClick={()=>navigate(-1)} style={Btn}>← Back</button>
        <span style={{fontWeight:700,fontSize:14,flex:1,textAlign:"center"}}>
          🏠 HERS Rating {isEditing?"Estimate":"— New Estimate"}
        </span>
        <div style={{display:"flex",gap:6}}>
          {isEditing && (
            <button onClick={convertToInvoice} style={{...Btn,color:"#7c3aed",borderColor:"#7c3aed"}}>
              💵 Invoice
            </button>
          )}
          <button onClick={saveEstimate} disabled={saving} style={{...BtnD,opacity:saving?0.6:1}}>
            {saving?"Saving…":"Save"}
          </button>
        </div>
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"16px 14px"}}>

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
            <span style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>Tax rate</span>
            <input type="number" value={taxRate} onChange={e=>setTaxRate(e.target.value)}
              style={{...I,width:80}} />
            <span style={{fontSize:12,color:C.muted}}>%</span>
          </div>
          <textarea placeholder="Notes for this estimate…" value={notes} onChange={e=>setNotes(e.target.value)}
            rows={2} style={{...I,width:"100%",height:"auto",padding:"8px",resize:"none",fontFamily:"inherit"}} />
        </div>

        {/* totals */}
        <div style={{background:C.ink,borderRadius:12,padding:"16px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Subtotal</span>
            <span style={{color:"#fff",fontSize:12}}>${fmt(subtotal)}</span>
          </div>
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
