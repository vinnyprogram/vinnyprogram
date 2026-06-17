import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

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
  const [query, setQuery]       = useState("");
  const [showResults, setShowResults] = useState(false);
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
  const results = query.trim().length>=1
    ? leads.filter(l=>
        (l.name||"").toLowerCase().includes(query.toLowerCase())||
        (l.phone||"").includes(query)
      ).slice(0,8)
    : [];

  function selectLead(lead){
    setSelectedLeadId(String(lead.id));
    setAddress(lead.address||"");
    setQuery(""); setShowResults(false);
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
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>
            Customer
          </div>
          {selectedLead ? (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:C.ink}}>{selectedLead.name}</div>
                {selectedLead.phone && <div style={{fontSize:12,color:C.muted}}>{selectedLead.phone}</div>}
                {selectedLead.company_name && <div style={{fontSize:12,color:C.muted}}>{selectedLead.company_name}</div>}
              </div>
              <button onClick={()=>{setSelectedLeadId("");setAddress("");}}
                style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:13}}>
                Change
              </button>
            </div>
          ) : (
            <div>
              <input placeholder="Search customer by name or phone…" value={query}
                onChange={e=>{setQuery(e.target.value);setShowResults(true);}}
                style={{...I,width:"100%",marginBottom:results.length?6:0}} />
              {showResults && results.length>0 && (
                <div style={{border:`1px solid ${C.border}`,borderRadius:6,overflow:"hidden"}}>
                  {results.map((l,i)=>(
                    <div key={l.id} onClick={()=>selectLead(l)}
                      style={{padding:"8px 10px",cursor:"pointer",fontSize:13,
                        background:i%2===0?C.white:"#fafbfc",
                        borderBottom:i<results.length-1?`1px solid ${C.border}`:"none"}}>
                      <div style={{fontWeight:600}}>{l.name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{l.phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {selectedLead && (
            <input placeholder="Job address…" value={address} onChange={e=>setAddress(e.target.value)}
              style={{...I,width:"100%",marginTop:8}} />
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
            <ServiceManager services={services} onAdd={addService} onDelete={deleteService} />
          )}

          <div style={{display:"grid",gridTemplateColumns:"3fr 1fr 1fr 1fr auto",gap:6,marginBottom:6}}>
            {["Service","Price","Qty","Total",""].map(h=>(
              <div key={h} style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase"}}>{h}</div>
            ))}
          </div>

          {lineItems.map((it,idx)=>(
            <div key={it.id} style={{display:"grid",gridTemplateColumns:"3fr 1fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"center"}}>
              <select value={services.find(s=>s.name===it.service_name)?it.service_name:(it.service_name?"__custom__":"")}
                onChange={e=>{
                  if(e.target.value==="__custom__") updateLine(idx,"service_name","");
                  else updateLine(idx,"service_name",e.target.value);
                }}
                style={{...I,fontSize:12}}>
                <option value="">Select service…</option>
                {services.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                <option value="__custom__">✏️ Custom item</option>
              </select>
              <input type="number" placeholder="0.00" value={it.price}
                onChange={e=>updateLine(idx,"price",e.target.value)}
                style={{...I,fontSize:12,textAlign:"right"}} />
              <input type="number" placeholder="1" value={it.qty}
                onChange={e=>updateLine(idx,"qty",e.target.value)}
                style={{...I,fontSize:12,textAlign:"center"}} />
              <div style={{fontSize:13,fontWeight:700,color:C.green,textAlign:"right"}}>
                ${fmt(lineTotal(it))}
              </div>
              <button onClick={()=>removeLine(idx)}
                style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
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

function ServiceManager({ services, onAdd, onDelete }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <div style={{background:"#f8fafc",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>Saved Services</div>
      {services.map(s=>(
        <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:12,color:C.ink}}>{s.name}</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:C.green,fontWeight:700}}>${fmt(s.default_price)}</span>
            <button onClick={()=>onDelete(s.id)}
              style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:13}}>✕</button>
          </div>
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
