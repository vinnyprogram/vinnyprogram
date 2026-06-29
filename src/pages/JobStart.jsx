import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import AddressInput from "./AddressInput";

const C = {
  bg:"#f4f5f7", white:"#fff", ink:"#0f172a",
  muted:"#64748b", faint:"#94a3b8", border:"#e2e8f0",
  green:"#059669",
};
const I = {
  height:38, fontSize:14, borderRadius:8, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 12px", boxSizing:"border-box",
  color:C.ink, outline:"none", width:"100%",
};

export default function JobStart() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromDrawing = searchParams.get("from_drawing")==="1";
  const { company } = useAuth();

  // Trade prefs: use company settings if column exists, otherwise detect from data loaded later
  const [offersInsulation, setOffersInsulation] = useState(null); // null = loading
  const [offersHers, setOffersHers] = useState(null);

  const [query, setQuery]       = useState("");
  const [leads, setLeads]       = useState([]);
  const [results, setResults]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [address, setAddress]   = useState("");
  const [creating, setCreating] = useState(false);
  const [editingSelected, setEditingSelected] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [newName, setNewName]   = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [loadingLinks, setLoadingLinks] = useState(false);

  const [insulationJobs, setInsulationJobs] = useState([]);
  const [hersEstimates, setHersEstimates]   = useState([]);
  const [hersInvoices, setHersInvoices]     = useState([]);

  useEffect(()=>{
    supabase.from("customers").select("id,name,phone,company_name,address")
      .order("name").limit(1000)
      .then(({data})=>{ if(data) setLeads(data); });
  },[]);

  // Detect which trades this company actually uses
  useEffect(()=>{
    if(!company) return;
    async function detectTrades(){
      // If the migration has been run, use the explicit settings
      if(company.offers_insulation !== undefined && company.offers_insulation !== null){
        setOffersInsulation(company.offers_insulation !== false);
        setOffersHers(company.offers_hers !== false);
        return;
      }
      // Migration not yet run — detect from actual data in the database
      const [r1, r2] = await Promise.all([
        supabase.from("projects").select("id",{count:"exact",head:true}).eq("company_id", company.id),
        supabase.from("hers_estimates").select("id",{count:"exact",head:true}).eq("company_id", company.id),
      ]);
      const hasInsulation = (r1.count||0) > 0;
      const hasHers       = (r2.count||0) > 0;
      // If the company has neither yet (brand new), show both so they can pick
      setOffersInsulation(hasInsulation || (!hasInsulation && !hasHers));
      setOffersHers(hasHers || (!hasInsulation && !hasHers));
    }
    detectTrades();
  },[company]);

  useEffect(()=>{
    if(!query.trim()){ setResults([]); return; }
    const q = query.toLowerCase();
    setResults(
      leads.filter(l=>
        (l.name||"").toLowerCase().includes(q)||
        (l.phone||"").replace(/\D/g,"").includes(q.replace(/\D/g,""))
      ).slice(0,8)
    );
  },[query, leads]);

  const loadLinks = useCallback(async(cust)=>{
    setLoadingLinks(true);
    const [r1,r2,r3] = await Promise.all([
      supabase.from("projects").select("id,name,address,pipeline_status,created_at")
        .eq("lead_id",cust.id).order("created_at",{ascending:false}).limit(10),
      supabase.from("hers_estimates").select("id,address,status,created_at")
        .eq("customer_id",cust.id).order("created_at",{ascending:false}).limit(10),
      supabase.from("hers_invoices").select("id,address,status,grand_total,created_at")
        .eq("customer_id",cust.id).order("created_at",{ascending:false}).limit(10),
    ]);
    setInsulationJobs(r1.data||[]);
    setHersEstimates(r2.data||[]);
    setHersInvoices(r3.data||[]);
    setLoadingLinks(false);
  },[]);

  useEffect(()=>{
    if(selected) loadLinks(selected);
  },[selected, loadLinks]);

  function pick(lead){
    setSelected(lead);
    setEditForm({name:lead.name||'',phone:lead.phone||'',email:lead.email||'',company_name:lead.company_name||'',address:lead.address||''});
    setEditingSelected(false);
    setQuery("");
    setResults([]);
    setAddress(""); // keep blank — job address is different from customer's home address
  }

  function clear(){
    setSelected(null);
    setAddress("");
    setInsulationJobs([]);
    setHersEstimates([]);
    setHersInvoices([]);
  }

  async function createCustomer(){
    if(!newName.trim()) return;
    // Duplicate check
    const phone = newPhone.replace(/\D/g,"");
    const phoneMatch = phone.length>=7 && leads.find(l=>(l.phone||"").replace(/\D/g,"").includes(phone));
    const nameMatch = leads.find(l=>(l.name||"").toLowerCase().trim()===newName.toLowerCase().trim());
    if(phoneMatch){
      alert(`"${phoneMatch.name}" already exists with this phone. Selecting them instead.`);
      setCreating(false); setNewName(""); setNewPhone(""); setNewEmail(""); setNewCompany(""); setNewAddress("");
      pick(phoneMatch); return;
    }
    if(nameMatch){
      if(!window.confirm(`A customer named "${nameMatch.name}" already exists.\nAre you sure this is a different person?`)) return;
    }
    const { data, error } = await supabase.from("customers").insert([{
      name:newName.trim(), phone:newPhone.trim(), email:newEmail.trim(),
      company_name:newCompany.trim(), address:newAddress.trim(),
      status:"New", estimate_amount:0, company_id: company?.id || null,
    }]).select().single();
    if(error){ alert("Could not create customer: "+(error.message)); return; }
    const freshLeads = [...leads, data];
    setLeads(freshLeads);
    setCreating(false);
    setNewName(""); setNewPhone(""); setNewEmail(""); setNewCompany(""); setNewAddress("");
    pick(data);
  }

  function launchInsulation(projectId){
    if(projectId){ navigate(`/project/${projectId}`); return; }
    const p = new URLSearchParams();
    if(selected) p.set("leadId", String(selected.id));
    if(address) p.set("address", address);
    navigate(`/project/new?type=onsite${fromDrawing?"&from_drawing=1":""}&${p.toString()}`);
  }

  function launchHersEstimate(estimateId){
    if(estimateId){ navigate(`/hers/${estimateId}`); return; }
    const p = new URLSearchParams();
    if(selected) p.set("leadId", String(selected.id));
    if(address) p.set("address", address);
    navigate(`/hers/new?${p.toString()}`);
  }

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:C.bg,minHeight:"100vh",paddingBottom:60}}>

      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"14px 20px",
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <h2 style={{margin:0,fontSize:18,fontWeight:800,color:C.ink}}>🏗 New Job</h2>
        <button onClick={()=>navigate(-1)}
          style={{border:`1px solid ${C.border}`,background:C.white,padding:"6px 14px",
            borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,color:C.ink}}>
          ← Back
        </button>
      </div>

      <div style={{maxWidth:680,margin:"0 auto",padding:"20px 16px"}}>

        {/* Step 1: Customer */}
        <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
            padding:"16px 18px",marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
            1 — Customer
          </div>

          {selected ? (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:C.ink}}>{selected.name}</div>
                  {selected.phone && <div style={{fontSize:12,color:C.muted}}>{selected.phone}</div>}
                  {selected.email && <div style={{fontSize:12,color:C.muted}}>{selected.email}</div>}
                  {selected.company_name && <div style={{fontSize:12,color:C.muted}}>{selected.company_name}</div>}
                  {selected.address && <div style={{fontSize:12,color:C.muted}}>{selected.address}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>setEditingSelected(true)}
                    style={{border:`1px solid ${C.border}`,background:"#f8fafc",padding:"5px 12px",
                      borderRadius:6,cursor:"pointer",fontSize:12,color:C.ink}}>
                    ✏️ Edit
                  </button>
                  <button onClick={clear}
                    style={{border:`1px solid ${C.border}`,background:"#f8fafc",padding:"5px 12px",
                      borderRadius:6,cursor:"pointer",fontSize:12,color:C.muted}}>
                    Change
                  </button>
                </div>
              </div>
              {editingSelected && (
                <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:7,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                  {[["name","Full Name *","editName","setEditName"],["phone","Phone","editPhone","setEditPhone"],
                    ["email","Email","editEmail","setEditEmail"],["company_name","Company","editCompany","setEditCompany"],
                    ["address","Address","editAddress","setEditAddress"]].map(([f,ph])=>(
                    <input key={f} placeholder={ph}
                      value={editForm[f]||""}
                      onChange={e=>setEditForm(p=>({...p,[f]:e.target.value}))}
                      style={{...I,fontSize:13}}/>
                  ))}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={async()=>{
                      if(!editForm.name?.trim()){alert("Name required");return;}
                      const {data,error} = await supabase.from("customers").update({
                        name:editForm.name.trim(), phone:editForm.phone||"",
                        email:editForm.email||"", company_name:editForm.company_name||"",
                        address:editForm.address||""
                      }).eq("id",selected.id).select().single();
                      if(error){alert("Error: "+error.message);return;}
                      setSelected(data);
                      setLeads(p=>p.map(l=>l.id===data.id?data:l));
                      setEditingSelected(false);
                    }} style={{flex:1,height:36,borderRadius:8,border:"none",background:C.ink,
                      color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>
                      ✓ Save
                    </button>
                    <button onClick={()=>setEditingSelected(false)}
                      style={{height:36,padding:"0 14px",borderRadius:8,border:`1px solid ${C.border}`,
                        background:"white",cursor:"pointer",fontSize:13,color:C.muted}}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : creating ? (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* Smart paste box */}
              <textarea
                placeholder="📋 Paste customer info here (name, phone, email, address) and we'll fill the fields automatically..."
                rows={2}
                style={{...I, fontSize:12, color:"#64748b", resize:"none"}}
                onPaste={e=>{
                  const text = e.clipboardData.getData("text");
                  if(!text) return;
                  e.preventDefault();
                  const lines = text.split(/[\n,|]+/).map(s=>s.trim()).filter(Boolean);
                  const extracted = {};
                  for(const l of lines){
                    if(!extracted.email && l.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)) { extracted.email=l; continue; }
                    if(!extracted.phone && l.match(/[\d]{7,}/)) { extracted.phone=l.replace(/[^\d+\-().\s]/g,"").trim(); continue; }
                    if(!extracted.address && l.match(/\d+\s+\w/)) { extracted.address=l; continue; }
                    if(!extracted.name) { extracted.name=l; continue; }
                    if(!extracted.company) { extracted.company=l; }
                  }
                  if(extracted.name) setNewName(extracted.name);
                  if(extracted.phone) setNewPhone(extracted.phone);
                  if(extracted.email) setNewEmail(extracted.email);
                  if(extracted.company) setNewCompany(extracted.company);
                  if(extracted.address) setNewAddress(extracted.address);
                }}
              />
              <input value={newName} onChange={e=>setNewName(e.target.value)}
                placeholder="Full name *" style={I} autoFocus />
              <input value={newPhone} onChange={e=>setNewPhone(e.target.value)}
                placeholder="Phone" style={I} />
              <input value={newEmail} onChange={e=>setNewEmail(e.target.value)}
                placeholder="Email" style={I} />
              <input value={newCompany} onChange={e=>setNewCompany(e.target.value)}
                placeholder="Company name" style={I} />
              <input value={newAddress} onChange={e=>setNewAddress(e.target.value)}
                placeholder="Address" style={I} />
              <div style={{display:"flex",gap:8}}>
                <button onClick={createCustomer} disabled={!newName.trim()}
                  style={{flex:1,height:38,borderRadius:8,border:"none",
                    background:newName.trim()?C.ink:"#e2e8f0",color:newName.trim()?"#fff":C.faint,
                    cursor:newName.trim()?"pointer":"default",fontWeight:700,fontSize:13}}>
                  Create Customer
                </button>
                <button onClick={()=>{setCreating(false);setNewName("");setNewPhone("");setNewEmail("");setNewCompany("");setNewAddress("");}}
                  style={{height:38,padding:"0 16px",borderRadius:8,border:`1px solid ${C.border}`,
                    background:"white",cursor:"pointer",fontSize:13,color:C.muted}}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{position:"relative"}}>
              <input value={query} onChange={e=>setQuery(e.target.value)}
                placeholder="Search customer by name or phone…" style={{...I,paddingRight:80}} autoFocus />
              <button onClick={()=>{ setCreating(true); setNewName(query.trim()); }}
                style={{position:"absolute",right:4,top:4,height:30,padding:"0 10px",
                  borderRadius:6,border:"none",background:C.ink,color:"#fff",
                  cursor:"pointer",fontSize:12,fontWeight:700}}>
                + New
              </button>
              {results.length>0 && (
                <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:9999,
                    background:C.white,border:`1px solid ${C.border}`,borderRadius:8,
                    boxShadow:"0 8px 24px rgba(0,0,0,.15)",marginTop:2,overflow:"hidden"}}>
                  {results.map(l=>(
                    <button key={l.id} onMouseDown={()=>pick(l)}
                      style={{display:"flex",flexDirection:"column",gap:1,width:"100%",
                        padding:"10px 14px",border:"none",background:"transparent",
                        cursor:"pointer",textAlign:"left",borderBottom:`1px solid ${C.border}`}}
                      onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontWeight:600,fontSize:13,color:C.ink}}>{l.name}</span>
                      {l.phone && <span style={{fontSize:11,color:C.muted}}>{l.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Address */}
        {selected && (
          <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
              padding:"16px 18px",marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
              2 — Job Address
            </div>
            <AddressInput value={address} onChange={setAddress}
              placeholder="Search job site address…" />
          </div>
        )}

        {/* Step 3: Trades */}
        {selected && (
          <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
              padding:"16px 18px",marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:14}}>
              3 — Estimates
            </div>

            <div style={{display:"grid",
                gridTemplateColumns: offersInsulation && offersHers ? "1fr 1fr" : "1fr",
                gap:12}}>

              {/* Insulation — only if enabled */}
              {offersInsulation && (
                <div style={{border:`2px solid ${C.border}`,borderRadius:10,padding:"14px",
                    display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:22}}>🏠</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:C.ink}}>Insulation</div>
                      <div style={{fontSize:11,color:C.muted}}>Estimate + proposal</div>
                    </div>
                  </div>
                  {loadingLinks ? <div style={{fontSize:11,color:C.faint}}>Loading…</div>
                    : insulationJobs.map(j=>(
                      <button key={j.id} onClick={()=>launchInsulation(j.id)}
                        style={{border:`1px solid ${C.border}`,background:"#f8fafc",
                          borderRadius:6,padding:"6px 10px",cursor:"pointer",textAlign:"left",fontSize:11}}>
                        <span style={{fontWeight:600,color:C.ink,display:"block",
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {j.address||j.name||"Estimate"}
                        </span>
                        <span style={{color:C.muted}}>{j.pipeline_status||"Active"} · {new Date(j.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                      </button>
                    ))
                  }
                  <button onClick={()=>launchInsulation(null)}
                    style={{border:"1.5px dashed #e2e8f0",background:"transparent",
                      borderRadius:8,padding:"8px",cursor:"pointer",
                      fontSize:12,fontWeight:700,color:C.muted}}>
                    + New Estimate
                  </button>
                </div>
              )}

              {/* HERS — only if enabled */}
              {offersHers && (
                <div style={{border:`2px solid ${C.border}`,borderRadius:10,padding:"14px",
                    display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:22}}>⭐</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:C.ink}}>HERS Rating</div>
                      <div style={{fontSize:11,color:C.muted}}>Estimate + Ekotrope data</div>
                    </div>
                  </div>
                  {loadingLinks ? <div style={{fontSize:11,color:C.faint}}>Loading…</div>
                    : hersEstimates.map(e=>(
                      <button key={e.id} onClick={()=>launchHersEstimate(e.id)}
                        style={{border:`1px solid ${C.border}`,background:"#f8fafc",
                          borderRadius:6,padding:"6px 10px",cursor:"pointer",textAlign:"left",fontSize:11}}>
                        <span style={{fontWeight:600,color:C.ink,display:"block",
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {e.address||"HERS Estimate"}
                        </span>
                        <span style={{color:C.muted}}>{e.status||"Draft"} · {new Date(e.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                      </button>
                    ))
                  }
                  <button onClick={()=>launchHersEstimate(null)}
                    style={{border:"1.5px dashed #e2e8f0",background:"transparent",
                      borderRadius:8,padding:"8px",cursor:"pointer",
                      fontSize:12,fontWeight:700,color:C.muted}}>
                    + New Estimate
                  </button>
                </div>
              )}
            </div>

            {/* Field Measurements — only for HERS users */}
            {offersHers && hersInvoices.length>0 && (
              <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                  Field Measurements — Ekotrope data
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {hersInvoices.map(inv=>(
                    <button key={inv.id} onClick={()=>navigate(`/hers/measurements/${inv.id}`)}
                      style={{border:`1px solid ${C.border}`,background:"#f0fdf4",
                        borderRadius:6,padding:"8px 12px",cursor:"pointer",textAlign:"left",
                        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <span style={{fontSize:12,fontWeight:600,color:C.ink}}>📐 {inv.address||"Job site"}</span>
                        <div style={{fontSize:11,color:C.muted,marginTop:1}}>
                          {inv.status} · ${Number(inv.grand_total||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                        </div>
                      </div>
                      <span style={{fontSize:12,color:C.green,fontWeight:700}}>Open →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!selected && !creating && (
          <div style={{textAlign:"center",color:C.faint,fontSize:13,padding:"40px 0"}}>
            Search for a customer above to start
          </div>
        )}
      </div>
    </div>
  );
}
