import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const C = {
  bg:"#f4f5f7", white:"#fff", ink:"#0f172a",
  muted:"#64748b", faint:"#94a3b8", border:"#e2e8f0", green:"#059669",
};
const Btn = {
  height:32, fontSize:12, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 12px", cursor:"pointer", color:C.ink,
  whiteSpace:"nowrap", fontWeight:600, display:"inline-flex", alignItems:"center", gap:4,
};

const INS_STATUS_COLORS = {
  "Proposal":   { bg:"#fff7ed", text:"#f97316" },
  "Measured":   { bg:"#eff6ff", text:"#3b82f6" },
  "Scheduled":  { bg:"#fef3c7", text:"#b45309" },
  "Completed":  { bg:"#dcfce7", text:"#059669" },
  "Cancelled":  { bg:"#f1f5f9", text:"#64748b" },
};
const HERS_STATUS_COLORS = {
  "Draft":     { bg:"#f1f5f9", text:"#64748b" },
  "Sent":      { bg:"#eff6ff", text:"#3b82f6" },
  "Accepted":  { bg:"#dcfce7", text:"#059669" },
  "Declined":  { bg:"#fee2e2", text:"#dc2626" },
};

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}

// ── Customer search / list ──
function CustomerSearch({ onSelect }) {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    supabase.from("customers").select("id,name,phone,company_name,email")
      .order("name").limit(200).then(({data})=>{ setCustomers(data||[]); setLoading(false); });
  },[]);

  const filtered = q.trim().length<1 ? customers
    : customers.filter(c=>(c.name||"").toLowerCase().includes(q.toLowerCase())||(c.phone||"").includes(q)||(c.company_name||"").toLowerCase().includes(q.toLowerCase()));

  if(loading) return <div style={{padding:40,textAlign:"center",color:C.muted,fontFamily:"system-ui"}}>Loading…</div>;

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"12px 16px"}}>
        <h2 style={{margin:"0 0 10px",fontSize:17,fontWeight:700}}>🏠 Projects</h2>
        <input placeholder="Search by name, phone, or company…"
          value={q} onChange={e=>setQ(e.target.value)}
          style={{width:"100%",height:36,borderRadius:8,border:`1px solid ${C.border}`,
            padding:"0 12px",fontSize:13,boxSizing:"border-box"}} />
      </div>
      <div style={{maxWidth:700,margin:"0 auto",padding:"12px 14px"}}>
        {filtered.map(c=>(
          <div key={c.id} onClick={()=>onSelect(c)}
            style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,
              padding:"12px 14px",marginBottom:8,cursor:"pointer",
              boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#94a3b8"}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            <div style={{fontWeight:700,fontSize:14,color:C.ink}}>{c.name}</div>
            {c.company_name && <div style={{fontSize:12,color:C.muted}}>{c.company_name}</div>}
            {c.phone && <div style={{fontSize:12,color:"#3b82f6"}}>📞 {c.phone}</div>}
          </div>
        ))}
        {filtered.length===0 && (
          <div style={{textAlign:"center",padding:"40px 0",color:C.faint,fontSize:13}}>No customers found.</div>
        )}
      </div>
    </div>
  );
}

// ── Project Hub for one customer ──
function CustomerHub({ customer, onBack, navigate }) {
  const [loading, setLoading] = useState(true);
  const [insProjects, setInsProjects] = useState([]);
  const [hersEstimates, setHersEstimates] = useState([]);
  const [hersInvoices, setHersInvoices] = useState([]);
  const [fieldMeas, setFieldMeas] = useState({});

  useEffect(()=>{ loadAll(); },[customer.id]);

  async function loadAll(){
    setLoading(true);
    const [projRes, estRes, invRes] = await Promise.all([
      supabase.from("projects").select("id,name,address,pipeline_status,created_at").eq("lead_id",customer.id).order("created_at",{ascending:false}),
      supabase.from("hers_estimates").select("id,address,status,grand_total,created_at").eq("customer_id",customer.id).order("created_at",{ascending:false}),
      supabase.from("hers_invoices").select("id,address,status,grand_total,amount_paid,hers_estimate_id,created_at").eq("customer_id",customer.id).order("created_at",{ascending:false}),
    ]);
    setInsProjects(projRes.data||[]);
    setHersEstimates(estRes.data||[]);
    setHersInvoices(invRes.data||[]);

    // Check which invoices have field measurements
    const invIds = (invRes.data||[]).map(i=>i.id);
    if(invIds.length){
      const { data:fms } = await supabase.from("hers_field_measurements")
        .select("hers_invoice_id,updated_at").in("hers_invoice_id",invIds);
      const map = {};
      (fms||[]).forEach(f=>{ map[f.hers_invoice_id]=f.updated_at; });
      setFieldMeas(map);
    }
    setLoading(false);
  }

  if(loading) return <div style={{padding:40,textAlign:"center",color:C.muted}}>Loading…</div>;

  // Group estimates + invoices by address
  const addresses = [...new Set([
    ...insProjects.map(p=>p.address),
    ...hersEstimates.map(e=>e.address),
    ...hersInvoices.map(i=>i.address),
  ].filter(Boolean))];

  // Also group any without address
  const allAddresses = addresses.length ? addresses : ["No address"];

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",paddingBottom:40}}>
      {/* header */}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"10px 16px",
          display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={Btn}>← Back</button>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:C.ink}}>{customer.name}</div>
          {customer.company_name && <div style={{fontSize:12,color:C.muted}}>{customer.company_name}</div>}
        </div>
        {customer.phone && (
          <a href={`tel:${customer.phone.replace(/\D/g,"")}`}
            style={{fontSize:12,color:"#3b82f6",textDecoration:"none"}}>📞 {customer.phone}</a>
        )}
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"14px 14px"}}>

        {/* Start new work */}
        <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,
            padding:"12px 16px",marginBottom:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:12,color:C.muted,marginRight:4}}>Start new:</span>
          <button onClick={()=>navigate("/estimates/new")} style={{...Btn,color:C.green,borderColor:C.green}}>
            🏗 Insulation Estimate
          </button>
          <button onClick={()=>navigate("/hers/new")} style={{...Btn,color:"#7c3aed",borderColor:"#7c3aed"}}>
            📋 HERS Estimate
          </button>
        </div>

        {/* Per-address project cards */}
        {allAddresses.map(addr=>{
          const addrProjs  = insProjects.filter(p=>p.address===addr || (addr==="No address"&&!p.address));
          const addrEsts   = hersEstimates.filter(e=>e.address===addr || (addr==="No address"&&!e.address));
          const addrInvs   = hersInvoices.filter(i=>i.address===addr || (addr==="No address"&&!i.address));
          if(!addrProjs.length && !addrEsts.length && !addrInvs.length) return null;

          return (
            <div key={addr} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,
                marginBottom:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>

              {/* address header */}
              <div style={{background:"#f8fafc",padding:"10px 16px",borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:13,fontWeight:700,color:C.ink}}>📍 {addr}</div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>

                {/* INSULATION column */}
                <div style={{padding:"12px 14px",borderRight:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",
                      letterSpacing:0.4,marginBottom:8}}>🏗 Insulation</div>
                  {addrProjs.length===0 ? (
                    <div style={{fontSize:12,color:C.faint,padding:"8px 0"}}>No estimate yet</div>
                  ) : addrProjs.map(p=>{
                    const sc = INS_STATUS_COLORS[p.pipeline_status]||INS_STATUS_COLORS.Proposal;
                    return (
                      <div key={p.id} style={{marginBottom:8}}>
                        <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:700,
                            background:sc.bg,color:sc.text,marginBottom:4,display:"inline-block"}}>
                          {p.pipeline_status||"Draft"}
                        </span>
                        <div style={{fontSize:11,color:C.muted,marginBottom:6}}>
                          {new Date(p.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                        </div>
                        <button onClick={()=>navigate(`/project/${p.id}`)} style={{...Btn,width:"100%",justifyContent:"center",marginBottom:4}}>
                          ✏️ Open Estimate
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* HERS column */}
                <div style={{padding:"12px 14px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",
                      letterSpacing:0.4,marginBottom:8}}>📋 HERS Rating</div>
                  {addrEsts.length===0 && addrInvs.length===0 ? (
                    <div style={{fontSize:12,color:C.faint,padding:"8px 0"}}>No estimate yet</div>
                  ) : (
                    <>
                      {addrEsts.map(e=>{
                        const sc = HERS_STATUS_COLORS[e.status]||HERS_STATUS_COLORS.Draft;
                        const inv = addrInvs.find(i=>i.hers_estimate_id===e.id);
                        const hasFM = inv && fieldMeas[inv.id];
                        return (
                          <div key={e.id} style={{marginBottom:10}}>
                            <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:700,
                                background:sc.bg,color:sc.text,marginBottom:4,display:"inline-block"}}>
                              {e.status||"Draft"}
                            </span>
                            <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:2}}>
                              ${fmt(e.grand_total)}
                            </div>
                            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>
                              {new Date(e.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                            </div>
                            <div style={{display:"flex",flexDirection:"column",gap:4}}>
                              <button onClick={()=>navigate(`/hers/${e.id}`)} style={{...Btn,justifyContent:"center",width:"100%"}}>
                                ✏️ Open Estimate
                              </button>
                              {inv && (
                                <button onClick={()=>navigate(`/hers/invoice/${inv.id}`)}
                                  style={{...Btn,justifyContent:"center",width:"100%",color:"#7c3aed",borderColor:"#7c3aed"}}>
                                  🧾 Invoice {inv.status && `· ${inv.status}`}
                                </button>
                              )}
                              {inv && (
                                <button onClick={()=>navigate(`/hers/measurements/${inv.id}`)}
                                  style={{...Btn,justifyContent:"center",width:"100%",
                                    color:hasFM?"#059669":"#64748b",
                                    borderColor:hasFM?"#86efac":C.border,
                                    background:hasFM?"#f0fdf4":C.white}}>
                                  📐 {hasFM?"Field Measurements ✓":"Field Measurements"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {allAddresses.length===0 && (
          <div style={{textAlign:"center",padding:"40px 0",color:C.faint,fontSize:13}}>
            No projects yet for this customer. Use the buttons above to start one.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main export ──
export default function Projects() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loadingCustomer, setLoadingCustomer] = useState(!!customerId);

  useEffect(()=>{
    if(customerId){
      supabase.from("customers").select("id,name,phone,company_name,email")
        .eq("id",customerId).maybeSingle()
        .then(({data})=>{ if(data) setSelectedCustomer(data); setLoadingCustomer(false); });
    }
  },[customerId]);

  if(loadingCustomer) return <div style={{padding:40,textAlign:"center",color:"#64748b",fontFamily:"system-ui"}}>Loading…</div>;

  if(selectedCustomer){
    return (
      <CustomerHub
        customer={selectedCustomer}
        navigate={navigate}
        onBack={()=>{ setSelectedCustomer(null); navigate("/projects"); }}
      />
    );
  }

  return (
    <CustomerSearch onSelect={c=>{ setSelectedCustomer(c); navigate(`/projects/${c.id}`); }} />
  );
}
