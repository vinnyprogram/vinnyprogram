import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const allStatuses = [
  "New", "Contacted", "Inspection Scheduled",
  "Estimate Sent", "Follow-Up", "Won", "Lost"
];

const statuses = [
  "Contacted", "Inspection Scheduled",
  "Estimate Sent", "Follow-Up", "Won", "Lost"
];

const statusColor = {
  New: "#3b82f6",
  Contacted: "#f59e0b",
  "Inspection Scheduled": "#06b6d4",
  "Estimate Sent": "#8b5cf6",
  "Follow-Up": "#f97316",
  Won: "#10b981",
  Lost: "#ef4444"
};

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid #e0e5ef",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  marginTop: 4,
  fontFamily: "inherit"
};

// ── Quote History ─────────────────────────────────────────────────────────────
function QuoteHistory({ customerId, navigate }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(()=>{
    if(!customerId) return;
    async function load() {
      setLoading(true);
      const { data:projs } = await supabase
        .from("projects")
        .select("id, name, address, created_at, status")
        .eq("lead_id", customerId)
        .order("created_at", { ascending:false });

      if(!projs || !projs.length){ setProjects([]); setLoading(false); return; }

      const ids = projs.map(p=>p.id);
      const { data:quotes } = await supabase
        .from("quotes")
        .select("project_id, grand_total, status, created_at, version, label")
        .in("project_id", ids)
        .order("created_at", { ascending:false });

      // group all quotes by project
      const quotesByProject = {};
      (quotes||[]).forEach(q=>{
        if(!quotesByProject[q.project_id]) quotesByProject[q.project_id]=[];
        quotesByProject[q.project_id].push(q);
      });

      setProjects(projs.map(p=>({...p, quotes: quotesByProject[p.id]||[]})));
      setLoading(false);
    }
    load();
  },[customerId]);

  if(loading) return (
    <div style={{marginTop:24,fontSize:12,color:"#94a3b8"}}>Loading quotes…</div>
  );

  return (
    <div style={{marginTop:24,marginBottom:4}}>
      <div style={{fontSize:12,fontWeight:700,color:"#666",
          textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
        Quotes & Projects ({projects.length})
      </div>

      {projects.length===0 ? (
        <div style={{fontSize:13,color:"#aaa",marginBottom:12}}>No projects yet.</div>
      ) : projects.map(p=>(
        <div key={p.id} style={{
          background:"#f8f9fb", border:"1px solid #eee",
          borderRadius:10, padding:"10px 12px", marginBottom:8,
        }}>
          {/* project header */}
          <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom: p.quotes.length ? 8 : 0}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {p.name||p.address||"Project #"+p.id}
              </div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>
                {new Date(p.created_at).toLocaleDateString("en-US",
                  {month:"short",day:"numeric",year:"numeric"})}
              </div>
            </div>
            <button
              onClick={()=>navigate(`/project/new?leadId=${customerId}`)}
              style={{border:"1px solid #e2e8f0",background:"white",color:"#3b82f6",
                padding:"4px 9px",borderRadius:6,cursor:"pointer",
                fontSize:11,fontWeight:700,flexShrink:0,marginLeft:8}}>
              + New Estimate
            </button>
          </div>

          {/* quote versions */}
          {p.quotes.map((q,i)=>(
            <div key={i} style={{
              display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"6px 8px",borderRadius:7,marginBottom:4,
              background: p.pipeline_status==="Accepted" ? "#f0fdf4" : "white",
              border: p.pipeline_status==="Accepted" ? "1px solid #86efac" : "1px solid #e2e8f0",
            }}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#059669"}}>
                  ${Number(q.grand_total||0).toLocaleString("en-US",
                    {minimumFractionDigits:0,maximumFractionDigits:0})}
                </div>
              </div>
              <button
                onClick={()=>navigate(`/quote/${p.id}`)}
                style={{border:"none",
                  background: p.pipeline_status==="Accepted"?"#059669":"#f97316",
                  color:"white",padding:"5px 10px",borderRadius:6,
                  cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>
                {"View PDF"}
              </button>
            </div>
          ))}

          {p.quotes.length===0 && (
            <div style={{fontSize:11,color:"#94a3b8",padding:"4px 0"}}>
              No quote generated yet
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main CRM ──────────────────────────────────────────────────────────────────
export default function CRM() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState([]);
  const [activityInput, setActivityInput] = useState("");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", email: "",
    address: "", scope: "", estimate_amount: "", notes: ""
  });

  // metrics
  const totalValue = customers.reduce((s,c)=>s+(Number(c.estimate_amount)||0),0);
  const wonValue   = customers.filter(c=>c.status==="Won").reduce((s,c)=>s+(Number(c.estimate_amount)||0),0);
  const wonCount   = customers.filter(c=>c.status==="Won").length;
  const winRate    = customers.length===0 ? 0 : Math.round((wonCount/customers.length)*100);

  const filtered = customers.filter(c=>{
    const s=search.toLowerCase();
    return c.name?.toLowerCase().includes(s) ||
           c.phone?.toLowerCase().includes(s) ||
           c.email?.toLowerCase().includes(s) ||
           c.address?.toLowerCase().includes(s);
  });

  // fetch
  async function fetchCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("id", { ascending:false });
    if(!error) setCustomers(data||[]);
  }

  useEffect(()=>{
    fetchCustomers();
    const channel = supabase
      .channel("realtime-customers")
      .on("postgres_changes",{ event:"*", schema:"public", table:"customers" }, fetchCustomers)
      .subscribe();
    return ()=>supabase.removeChannel(channel);
  },[]);

  async function loadActivities(customerId) {
    const { data } = await supabase.from("activities")
      .select("*").eq("lead_id", customerId)
      .order("created_at",{ ascending:false });
    setActivities(data||[]);
  }

  async function addActivity(customerId, message) {
    if(!message.trim()) return;
    await supabase.from("activities").insert([{
      lead_id: customerId, body: message, type:"note"
    }]);
    loadActivities(customerId);
    setActivityInput("");
  }

  function updateForm(field,value){ setForm(p=>({...p,[field]:value})); }

  async function addCustomer() {
    if(!form.name||!form.phone) return;
    const temp = {...form, id:`temp-${Date.now()}`, status:"New",
      estimate_amount:Number(form.estimate_amount)||0};
    setCustomers(p=>[temp,...p]);
    setForm({name:"",phone:"",email:"",address:"",scope:"",estimate_amount:"",notes:""});
    let companyId = null;
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      const { data:cd } = await supabase.from("companies")
        .select("id").eq("user_id", user.id).maybeSingle();
      companyId = cd?.id || null;
    } catch(e) {}
    await supabase.from("customers").insert([{
      ...form, status:"New",
      estimate_amount:Number(form.estimate_amount)||0,
      company_id:companyId,
    }]);
  }

  async function saveChanges() {
    if(!selectedCustomer) return;
    setLoading(true);
    setCustomers(p=>p.map(c=>c.id===selectedCustomer.id?{...selectedCustomer}:c));
    const { error } = await supabase.from("customers").update({
      name:            selectedCustomer.name,
      phone:           selectedCustomer.phone,
      email:           selectedCustomer.email,
      address:         selectedCustomer.address,
      scope:           selectedCustomer.scope,
      estimate_amount: Number(selectedCustomer.estimate_amount)||0,
      notes:           selectedCustomer.notes,
      status:          selectedCustomer.status,
      company_name:    selectedCustomer.company_name,
    }).eq("id", selectedCustomer.id);
    setLoading(false);
    if(error){ console.error(error); return; }
    setSelectedCustomer(null);
  }

  async function onDragEnd(result) {
    if(!result.destination) return;
    const id = result.draggableId;
    const newStatus = result.destination.droppableId;
    setCustomers(p=>p.map(c=>String(c.id)===id?{...c,status:newStatus}:c));
    await supabase.from("customers").update({status:newStatus}).eq("id",id);
  }

  return (
    <div style={{padding:20,background:"#f6f7fb",minHeight:"100vh",
        fontFamily:"Inter,system-ui,sans-serif",color:"#111",
        overflowX:"hidden"}}>

      <h1 style={{marginBottom:20}}>🏠 Insulation CRM</h1>

      {/* search */}
      <div style={{marginBottom:16}}>
        <input placeholder="Search customer, phone, email…"
          value={search} onChange={e=>setSearch(e.target.value)}
          style={{...inputStyle,padding:14,fontSize:15,marginTop:0}} />
      </div>

      {/* metrics */}
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        {[
          {label:"Total Pipeline", value:`$${fmt(totalValue)}`, color:"#111"},
          {label:"Won Revenue",    value:`$${fmt(wonValue)}`,   color:"#10b981"},
          {label:"Win Rate",       value:`${winRate}%`,         color:"#111"},
          {label:"Total Customers",value:customers.length,      color:"#111"},
        ].map(({label,value,color})=>(
          <div key={label} style={{flex:1,minWidth:130,background:"white",borderRadius:14,
              padding:18,boxShadow:"0 6px 18px rgba(0,0,0,.06)",border:"1px solid #eee"}}>
            <div style={{fontSize:13,color:"#666",marginBottom:5}}>{label}</div>
            <div style={{fontSize:22,fontWeight:700,color}}>{value}</div>
          </div>
        ))}
      </div>

      {/* pipeline bars */}
      <div style={{display:"flex",gap:10,marginBottom:20}}>
        {allStatuses.map(status=>{
          const count=customers.filter(c=>c.status===status).length;
          const pct=customers.length===0?0:(count/customers.length)*100;
          return (
            <div key={status} style={{flex:1}}>
              <div style={{fontSize:12,marginBottom:4}}>{status}</div>
              <div style={{height:8,background:"#e5e7eb",borderRadius:20,overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",background:statusColor[status]}} />
              </div>
              <div style={{fontSize:12,marginTop:4}}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* add customer form */}
      <div style={{marginBottom:16,maxWidth:600}}>
        <button onClick={()=>setShowAddForm(p=>!p)}
          style={{border:"1px solid #e2e8f0",background:"white",
            padding:"8px 16px",borderRadius:8,cursor:"pointer",
            fontSize:13,fontWeight:600,color:"#0f172a",
            display:"flex",alignItems:"center",gap:8}}>
          {showAddForm ? "✕ Cancel" : "+ Add Customer"}
        </button>
      </div>
      {showAddForm && <div style={{marginBottom:30,display:"grid",gap:10,maxWidth:600}}>
        {[
          {placeholder:"Customer Name *",   field:"name"},
          {placeholder:"Phone *",           field:"phone"},
          {placeholder:"Email",             field:"email"},
          {placeholder:"Address",           field:"address"},
          {placeholder:"Company",           field:"company_name"},
          {placeholder:"Estimate Amount ($)",field:"estimate_amount"},
        ].map(({placeholder,field})=>(
          <input key={field} placeholder={placeholder} value={form[field]||""}
            onChange={e=>updateForm(field,e.target.value)}
            style={{...inputStyle,marginTop:0}} />
        ))}
        <select value={form.scope} onChange={e=>updateForm("scope",e.target.value)}
          style={{...inputStyle,marginTop:0}}>
          <option value="">Select Scope</option>
          <option>Attic</option><option>Walls</option>
          <option>Basement</option><option>Crawlspace</option>
        </select>
        <textarea placeholder="Notes" rows={3} value={form.notes}
          onChange={e=>updateForm("notes",e.target.value)}
          style={{...inputStyle,marginTop:0,resize:"vertical"}} />
        <button onClick={addCustomer}
          style={{padding:"12px 20px",borderRadius:10,border:"none",
            background:"#3b82f6",color:"white",fontWeight:700,fontSize:15,cursor:"pointer"}}>
          Add Customer
        </button>
      </div>}

      {/* new customers — show all when no search, show matches when searching */}
      {search.trim() ? (
        filtered.filter(c=>c.status==="New").length>0 && (
          <div style={{marginBottom:12,background:"white",borderRadius:10,
              border:"1px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{padding:"8px 14px",background:"#eff6ff",
                borderBottom:"1px solid #bfdbfe",fontSize:12,fontWeight:700,color:"#1e40af"}}>
              🔵 New customers matching "{search}"
            </div>
            {filtered.filter(c=>c.status==="New").map(c=>(
              <div key={c.id} style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  cursor:"pointer"}}
                onClick={()=>navigate(`/customer/${c.id}`)}>
                <div>
                  <div style={{fontWeight:600,fontSize:13}}>{c.name}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{c.phone}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();navigate(`/customer/${c.id}`);}}
                  style={{border:"none",background:"#eff6ff",color:"#3b82f6",
                    padding:"4px 10px",borderRadius:6,cursor:"pointer",
                    fontSize:11,fontWeight:700}}>
                  👤 View
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div style={{marginBottom:12,padding:"8px 14px",background:"#eff6ff",
            borderRadius:8,border:"1px solid #bfdbfe",
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"#1e40af",fontWeight:600}}>
            🔵 New: {customers.filter(c=>c.status==="New").length} customers
          </span>
          <span style={{fontSize:11,color:"#3b82f6"}}>
            Search above to find them
          </span>
        </div>
      )}

      {/* kanban */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{display:"flex",gap:4,overflowX:"auto",
            WebkitOverflowScrolling:"touch",paddingBottom:8}}>
          {statuses.map(status=>(
            <Droppable droppableId={status} key={status}>
              {(provided,snapshot)=>(
                <div ref={provided.innerRef} {...provided.droppableProps}
                  style={{flex:"1 1 160px",minWidth:"160px",background:snapshot.isDraggingOver?"#e8f0fe":"#f1f3f9",
                    borderRadius:10,padding:8,minHeight:500,
                    border:`1.5px solid ${snapshot.isDraggingOver?"#93c5fd":"#e5e7eb"}`,
                    transition:"background .15s,border-color .15s"}}>

                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <div style={{width:9,height:9,borderRadius:"50%",background:statusColor[status]}} />
                        <h3 style={{fontSize:13,color:"#444",textTransform:"uppercase",
                            margin:0,fontWeight:700}}>{status}</h3>
                      </div>
                      <span style={{background:"#e5e7eb",borderRadius:20,
                          padding:"3px 10px",fontSize:12,fontWeight:600}}>
                        {filtered.filter(c=>c.status===status).length}
                      </span>
                    </div>
                    <div style={{fontSize:13,color:"#888",marginTop:5,fontWeight:600}}>
                      ${fmt(filtered.filter(c=>c.status===status)
                        .reduce((s,c)=>s+(Number(c.estimate_amount)||0),0))}
                    </div>
                  </div>

                  {filtered.filter(c=>c.status===status).map((customer,index)=>(
                    <Draggable key={customer.id} draggableId={String(customer.id)} index={index}>
                      {(provided,snapshot)=>(
                        <div ref={provided.innerRef}
                          {...provided.draggableProps} {...provided.dragHandleProps}
                          onClick={()=>{ setTimeout(()=>navigate(`/customer/${customer.id}`),50); }}
                          style={{background:"white",padding:12,borderRadius:12,marginBottom:10,
                            border:"1px solid #eaeaea",
                            borderLeft:`4px solid ${statusColor[customer.status]}`,
                            boxShadow:snapshot.isDragging?"0 8px 24px rgba(0,0,0,.15)":"0 2px 8px rgba(0,0,0,.04)",
                            cursor:"grab",opacity:snapshot.isDragging?.9:1,
                            width:"100%",boxSizing:"border-box",
                            ...provided.draggableProps.style}}>
                          <div style={{display:"flex",justifyContent:"space-between",
                              alignItems:"flex-start",marginBottom:8,gap:4}}>
                            <strong style={{fontSize:13,flex:1,minWidth:0,
                                wordBreak:"break-word",lineHeight:1.3}}>{customer.name}</strong>
                            <span style={{fontSize:8,padding:"2px 4px",borderRadius:6,
                                background:statusColor[customer.status],color:"white",
                                fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>
                              {customer.status==="Inspection Scheduled"?"Insp"
                                :customer.status==="Estimate Sent"?"Sent"
                                :customer.status==="Follow-Up"?"F-Up"
                                :customer.status}
                            </span>
                          </div>
                          <div style={{fontSize:12,color:"#666",lineHeight:1.8}}>
                            {customer.phone   && <div>📞 {customer.phone}</div>}
                            {customer.email   && <div>✉️ {customer.email}</div>}
                            {customer.address && <div>📍 {customer.address}</div>}
                            {customer.company_name && <div>🏢 {customer.company_name}</div>}
                            {customer.scope   && <div>🏗 {customer.scope}</div>}
                          </div>
                          <div style={{marginTop:10,display:"flex",
                              justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontWeight:700,fontSize:14,color:"#10b981"}}>
                              ${fmt(customer.estimate_amount)}
                            </span>
                            <div style={{display:"flex",gap:6}}>
                              <button
                                onClick={e=>{ e.stopPropagation();
                                  navigate(`/customer/${customer.id}`); }}
                                style={{border:"none",background:"#eff6ff",color:"#3b82f6",
                                  cursor:"pointer",fontSize:11,fontWeight:700,
                                  padding:"4px 8px",borderRadius:6}}>
                                👤 View
                              </button>
                              <button
                                onClick={e=>{ e.stopPropagation();
                                  void(0); }}
                                style={{border:"none",background:"none",cursor:"pointer",
                                  fontSize:16,color:"#ccc",padding:"2px 4px",borderRadius:6}}
                                onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
                                onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>
                                🗑
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      {/* drawer */}
      {selectedCustomer && (
        <>
          <div onClick={()=>setSelectedCustomer(null)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",zIndex:998}} />
          <div style={{position:"fixed",top:0,right:0,width:420,height:"100vh",
              background:"white",boxShadow:"-8px 0 30px rgba(0,0,0,.12)",
              zIndex:999,display:"flex",flexDirection:"column",overflowY:"auto"}}>

            {/* drawer header */}
            <div style={{padding:16,borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <h3 style={{margin:0}}>Customer Details</h3>
                <button onClick={()=>setSelectedCustomer(null)}
                  style={{border:"none",background:"none",fontSize:22,
                    cursor:"pointer",color:"#999"}}>×</button>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginTop:8}}>
                <div>
                  <h2 style={{margin:"0 0 4px"}}>{selectedCustomer.name}</h2>
                  {selectedCustomer.company_name && (
                    <div style={{fontSize:12,color:"#666"}}>{selectedCustomer.company_name}</div>
                  )}
                </div>
                <button onClick={()=>navigate(`/project/new?leadId=${selectedCustomer.id}`)}
                  style={{padding:"8px 14px",borderRadius:10,border:"none",
                    background:"#3b82f6",color:"white",fontWeight:700,
                    fontSize:13,cursor:"pointer"}}>
                  + Estimate
                </button>
              </div>
            </div>

            <div style={{padding:20,flex:1}}>
              {[
                {label:"Name",         field:"name"},
                {label:"Phone",        field:"phone"},
                {label:"Email",        field:"email"},
                {label:"Address",      field:"address"},
                {label:"Company",      field:"company_name"},
                {label:"Estimate ($)", field:"estimate_amount"},
              ].map(({label,field})=>(
                <div key={field} style={{marginBottom:14}}>
                  <label style={{fontSize:12,color:"#666",display:"block",
                      marginBottom:4,fontWeight:600}}>{label}</label>
                  <input value={selectedCustomer[field]||""}
                    onChange={e=>setSelectedCustomer({...selectedCustomer,[field]:e.target.value})}
                    style={inputStyle} />
                </div>
              ))}

              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,color:"#666",display:"block",
                    marginBottom:4,fontWeight:600}}>Scope</label>
                <select value={selectedCustomer.scope||""}
                  onChange={e=>setSelectedCustomer({...selectedCustomer,scope:e.target.value})}
                  style={inputStyle}>
                  <option value="">Select Scope</option>
                  <option>Attic</option><option>Walls</option>
                  <option>Basement</option><option>Crawlspace</option>
                </select>
              </div>

              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,color:"#666",display:"block",
                    marginBottom:4,fontWeight:600}}>Status</label>
                <select value={selectedCustomer.status||"New"}
                  onChange={e=>setSelectedCustomer({...selectedCustomer,status:e.target.value})}
                  style={inputStyle}>
                  {statuses.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>

              <div style={{marginBottom:20}}>
                <label style={{fontSize:12,color:"#666",display:"block",
                    marginBottom:4,fontWeight:600}}>Notes</label>
                <textarea rows={3} value={selectedCustomer.notes||""}
                  onChange={e=>setSelectedCustomer({...selectedCustomer,notes:e.target.value})}
                  style={{...inputStyle,resize:"vertical"}} />
              </div>

              <button onClick={saveChanges}
                style={{width:"100%",padding:14,border:"none",borderRadius:12,
                  background:"#111827",color:"white",cursor:"pointer",
                  fontWeight:700,fontSize:15}}>
                {loading?"Saving…":"Save Changes"}
              </button>

              {/* quote history */}
              <QuoteHistory customerId={selectedCustomer.id} navigate={navigate} />

              {/* activity log */}
              <div style={{marginTop:28}}>
                <h4 style={{fontSize:13,color:"#666",textTransform:"uppercase",marginBottom:12}}>
                  Activity Log
                </h4>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  <input value={activityInput}
                    onChange={e=>setActivityInput(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&addActivity(selectedCustomer.id,activityInput)}
                    placeholder="Log a call, note, follow-up…"
                    style={{...inputStyle,flex:1,marginTop:0}} />
                  <button onClick={()=>addActivity(selectedCustomer.id,activityInput)}
                    style={{padding:"10px 16px",borderRadius:10,border:"none",
                      background:"#3b82f6",color:"white",fontWeight:600,
                      cursor:"pointer",whiteSpace:"nowrap"}}>
                    Add
                  </button>
                </div>
                {activities.length===0 ? (
                  <p style={{color:"#aaa",fontSize:13}}>No activity yet.</p>
                ) : activities.map(a=>(
                  <div key={a.id} style={{padding:"8px 12px",background:"#f8f9fb",
                      borderRadius:8,border:"1px solid #eee",marginBottom:8,fontSize:13}}>
                    <div style={{color:"#333"}}>{a.body}</div>
                    <div style={{color:"#aaa",fontSize:11,marginTop:4}}>
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
