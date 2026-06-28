import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// 12 distinct job colors
const JOB_COLORS = [
  "#059669","#3b82f6","#f97316","#8b5cf6","#ef4444","#06b6d4",
  "#d97706","#0284c7","#e11d48","#7c3aed","#65a30d","#db2777"
];

function startOfWeek(date) {
  const d = new Date(date);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
function fmtDate(d) { return new Date(d).toISOString().slice(0,10); }
function fmtDisplay(d) { return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"}); }

function getWeekDays(weekStart, includeSat) {
  return [0,1,2,3,4,...(includeSat?[5]:[])].map(i => addDays(weekStart,i));
}

function getDaysFromQuote(quotes) {
  if (!quotes?.length) return 1;
  const q = quotes.find(q=>q.status==="Accepted") || quotes[0];
  if (!q?.labor_roles_json) return 1;
  try {
    const roles = JSON.parse(q.labor_roles_json);
    return Math.max(1, Math.max(...roles.map(r=>Number(r.days||1))));
  } catch { return 1; }
}

function getTotal(quotes) {
  const q = quotes?.find(q=>q.status==="Accepted") || quotes?.[0];
  return Number(q?.grand_total||0);
}

export default function Schedule() {
  const { company } = useAuth();
  const companyId = company?.id;

  const [weekStart, setWeekStart] = useState(()=>startOfWeek(new Date()));
  const [includeSat, setIncludeSat] = useState(false);
  const [trucks, setTrucks] = useState([]);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // {type, job, truckId, date}
  const [dragItem, setDragItem] = useState(null); // {jobId}

  useEffect(() => { if (companyId) load(); }, [companyId]);

  async function load() {
    setLoading(true);
    try {
      const { data: truckData, error: te } = await supabase.from("trucks").select("*").eq("company_id", companyId).order("name");
      if (te) console.error("trucks:", te.message);

      const { data: sjData, error: se } = await supabase.from("scheduled_jobs").select("*").eq("company_id", companyId);
      if (se) console.error("scheduled_jobs:", se.message);

      const { data: projData, error: pe } = await supabase
        .from("projects")
        .select("id,name,address,pipeline_status,customers(name),quotes(grand_total,labor_roles_json,status)")
        .eq("company_id", companyId);
      if (pe) console.error("projects:", pe.message);

      const scheduled = sjData || [];
      const scheduledProjectIds = new Set(scheduled.map(j=>j.project_id));

      // Show all projects that have a quote and are not yet scheduled
      const unscheduledList = (projData||[]).filter(p =>
        p.quotes?.length > 0 && !scheduledProjectIds.has(p.id)
      );

      console.log("trucks:", (truckData||[]).length, "projects:", (projData||[]).length, "unscheduled:", unscheduledList.length);

      setTrucks(truckData||[]);
      setScheduledJobs(scheduled);
      setUnscheduled(unscheduledList);
    } catch(e) {
      console.error("load error:", e);
    }
    setLoading(false);
  }

  // Assign a color per project (stable by index in scheduledJobs)
  const jobColorMap = {};
  scheduledJobs.forEach((j,i) => { jobColorMap[j.project_id] = JOB_COLORS[i % JOB_COLORS.length]; });

  const weekDays = getWeekDays(weekStart, includeSat);

  // Build grid: truckId → date → [scheduledJob]
  const grid = {};
  scheduledJobs.forEach(j => {
    if (!grid[j.truck_id]) grid[j.truck_id] = {};
    for (let d=0; d<(j.duration_days||1); d++) {
      const dt = fmtDate(addDays(new Date(j.start_date+"T12:00:00"), d));
      if (!grid[j.truck_id][dt]) grid[j.truck_id][dt] = [];
      if (d===0) grid[j.truck_id][dt].push(j);
      else {
        // continuation block
        if (!grid[j.truck_id][dt].find(x=>x.id===j.id))
          grid[j.truck_id][dt].push({...j, _continuation:true});
      }
    }
  });

  // Schedule a job: click on unscheduled → pick truck+date in modal
  async function scheduleJob(project, truckId, startDate) {
    const days = getDaysFromQuote(project.quotes);
    const { data, error } = await supabase.from("scheduled_jobs").insert({
      company_id: companyId,
      project_id: project.id,
      truck_id: truckId,
      start_date: fmtDate(startDate),
      duration_days: days,
      status: "Scheduled",
      customer_name: project.customers?.name || project.name || "",
      project_address: project.address || "",
    }).select().single();
    if (error) { alert("Error: "+error.message); return; }
    setModal(null);
    load();
  }

  // Unschedule: remove from scheduled_jobs → back to list
  async function unscheduleJob(jobId) {
    await supabase.from("scheduled_jobs").delete().eq("id", jobId);
    setModal(null);
    load();
  }

  // Edit scheduled job (truck, date, days)
  async function updateJob(jobId, truckId, startDate, days) {
    await supabase.from("scheduled_jobs").update({
      truck_id: truckId,
      start_date: fmtDate(startDate),
      duration_days: days,
    }).eq("id", jobId);
    setModal(null);
    load();
  }

  // Get project for a scheduled job
  function getProject(job) {
    return unscheduled.find(p=>p.id===job.project_id) ||
           { id:job.project_id, name:job.project_name||"Job", address:job.project_address||"", customers:{name:job.customer_name||""}, quotes:[] };
  }

  const filteredUnscheduled = unscheduled.filter(p => {
    const q = search.toLowerCase();
    return !q ||
      (p.customers?.name||"").toLowerCase().includes(q) ||
      (p.address||"").toLowerCase().includes(q) ||
      (p.name||"").toLowerCase().includes(q);
  });

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:"#f1f5f9",minHeight:"100vh",display:"flex",flexDirection:"column"}}>

      {/* Top bar */}
      <div style={{background:"#0f172a",padding:"10px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",flexShrink:0}}>
        <h1 style={{fontSize:16,fontWeight:800,color:"#fff",margin:0}}>📅 Schedule</h1>
        <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto",flexWrap:"wrap"}}>
          <button onClick={()=>setWeekStart(w=>addDays(w,-7))}
            style={{padding:"5px 12px",border:"1px solid #334155",borderRadius:6,background:"#1e293b",color:"#fff",cursor:"pointer",fontWeight:700}}>‹</button>
          <span style={{fontSize:13,fontWeight:600,color:"#e2e8f0",minWidth:160,textAlign:"center"}}>
            {fmtDisplay(weekStart)} – {fmtDisplay(addDays(weekStart,includeSat?5:4))}
          </span>
          <button onClick={()=>setWeekStart(w=>addDays(w,7))}
            style={{padding:"5px 12px",border:"1px solid #334155",borderRadius:6,background:"#1e293b",color:"#fff",cursor:"pointer",fontWeight:700}}>›</button>
          <button onClick={()=>setWeekStart(startOfWeek(new Date()))}
            style={{padding:"5px 12px",border:"1px solid #334155",borderRadius:6,background:"#1e293b",color:"#94a3b8",cursor:"pointer",fontSize:12}}>Today</button>
          <label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#94a3b8",cursor:"pointer"}}>
            <input type="checkbox" checked={includeSat} onChange={e=>setIncludeSat(e.target.checked)}/>Sat
          </label>
        </div>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* LEFT SIDEBAR — unscheduled jobs */}
        <div style={{width:220,minWidth:220,background:"#1e293b",display:"flex",flexDirection:"column",borderRight:"1px solid #334155"}}>
          <div style={{padding:"10px 12px",borderBottom:"1px solid #334155"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
              Jobs to Schedule ({filteredUnscheduled.length})
            </div>
            <input
              value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search..."
              style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid #334155",background:"#0f172a",color:"#e2e8f0",fontSize:12,boxSizing:"border-box"}}
            />
          </div>
          <div style={{flex:1,overflowY:"auto",padding:8}}>
            {loading && <div style={{color:"#475569",fontSize:12,textAlign:"center",padding:16}}>Loading...</div>}
            {!loading && filteredUnscheduled.length===0 && (
              <div style={{color:"#475569",fontSize:12,textAlign:"center",padding:16}}>
                {search ? "No matches" : "All jobs scheduled ✓"}
              </div>
            )}
            {filteredUnscheduled.map((p,i) => {
              const days = getDaysFromQuote(p.quotes);
              const total = getTotal(p.quotes);
              const color = JOB_COLORS[scheduledJobs.length+i % JOB_COLORS.length];
              return (
                <div key={p.id}
                  onClick={()=>setModal({type:"assign",project:p})}
                  style={{background:"#334155",borderRadius:8,padding:"8px 10px",marginBottom:6,cursor:"pointer",borderLeft:`3px solid ${color}`,transition:"background 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#3f5068"}
                  onMouseLeave={e=>e.currentTarget.style.background="#334155"}>
                  <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {p.customers?.name||p.name}
                  </div>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.address}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,background:"#1e293b",color:"#94a3b8",borderRadius:4,padding:"1px 6px"}}>{days}d</span>
                    <span style={{fontSize:11,color:"#10b981",fontWeight:700}}>${total.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CALENDAR GRID */}
        <div style={{flex:1,overflowX:"auto",overflowY:"auto"}}>
          {trucks.length===0 && !loading ? (
            <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>
              No trucks configured. <a href="/settings" style={{color:"#059669"}}>Add trucks in Settings →</a>
            </div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
              <thead style={{position:"sticky",top:0,zIndex:10}}>
                <tr>
                  <th style={{width:90,padding:"8px 10px",background:"#fff",borderBottom:"2px solid #e2e8f0",borderRight:"1px solid #e2e8f0",fontSize:11,color:"#64748b",textAlign:"left",position:"sticky",left:0,zIndex:11}}>
                    TRUCK
                  </th>
                  {weekDays.map((d,i)=>{
                    const isToday = fmtDate(d)===fmtDate(new Date());
                    return (
                      <th key={i} style={{padding:"6px 8px",background:isToday?"#f0fdf4":"#fff",borderBottom:"2px solid #e2e8f0",borderRight:"1px solid #f1f5f9",fontSize:11,color:isToday?"#059669":"#374151",fontWeight:isToday?800:600,textAlign:"center",minWidth:110}}>
                        <div>{DAY_NAMES[d.getDay()]}</div>
                        <div style={{fontSize:12}}>{fmtDisplay(d)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {trucks.map(truck=>(
                  <tr key={truck.id}>
                    <td style={{padding:"8px 10px",background:"#fff",borderBottom:"1px solid #f1f5f9",borderRight:"1px solid #e2e8f0",position:"sticky",left:0,zIndex:2,fontSize:12,fontWeight:700,color:"#1e293b",whiteSpace:"nowrap"}}>
                      {truck.name}
                    </td>
                    {weekDays.map((d,di)=>{
                      const dt = fmtDate(d);
                      const cellJobs = grid[truck.id]?.[dt] || [];
                      const isToday = dt===fmtDate(new Date());
                      return (
                        <td key={di}
                          onClick={()=>{ if(cellJobs.length===0) setModal({type:"assign",project:null,truckId:truck.id,date:d}); }}
                          style={{padding:3,verticalAlign:"top",minHeight:70,background:isToday?"#f0fdf4":"#fff",borderBottom:"1px solid #f1f5f9",borderRight:"1px solid #f1f5f9",cursor:cellJobs.length===0?"pointer":"default"}}
                          onMouseEnter={e=>{if(cellJobs.length===0)e.currentTarget.style.background=isToday?"#dcfce7":"#f0fdf4";}}
                          onMouseLeave={e=>{e.currentTarget.style.background=isToday?"#f0fdf4":"#fff";}}>
                          {cellJobs.map(j=>{
                            const color = jobColorMap[j.project_id]||"#059669";
                            if (j._continuation) return (
                              <div key={j.id+dt} style={{height:24,background:color+"40",borderRadius:3,margin:2,borderLeft:`2px solid ${color}`}}/>
                            );
                            // Find project info from all loaded data
                            const allProjects = [...unscheduled];
                            const proj = allProjects.find(p=>p.id===j.project_id);
                            return (
                              <div key={j.id}
                                onClick={e=>{e.stopPropagation();setModal({type:"detail",job:j,truck});}}
                                style={{background:color,color:"#fff",borderRadius:5,padding:"3px 6px",margin:2,cursor:"pointer",fontSize:11,fontWeight:600,boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}
                                onMouseEnter={e=>{e.currentTarget.style.opacity="0.85";}}
                                onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>
                                <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:100}}>
                                  {j.customer_name||proj?.customers?.name||"Job"}
                                </div>
                                <div style={{fontSize:10,opacity:0.85}}>{j.duration_days}d</div>
                              </div>
                            );
                          })}
                          {cellJobs.length===0 && (
                            <div style={{height:60,display:"flex",alignItems:"center",justifyContent:"center",opacity:0}}>
                              <span style={{fontSize:18,color:"#059669"}}>+</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL: Assign job to truck+date */}
      {modal?.type==="assign" && (
        <AssignModal
          project={modal.project}
          presetTruckId={modal.truckId}
          presetDate={modal.date}
          trucks={trucks}
          unscheduled={modal.project ? null : filteredUnscheduled}
          onAssign={scheduleJob}
          onClose={()=>setModal(null)}
        />
      )}

      {/* MODAL: Job detail — edit, move, unschedule */}
      {modal?.type==="detail" && (
        <DetailModal
          job={modal.job}
          truck={modal.truck}
          trucks={trucks}
          color={jobColorMap[modal.job.project_id]||"#059669"}
          onUpdate={updateJob}
          onUnschedule={()=>unscheduleJob(modal.job.id)}
          onClose={()=>setModal(null)}
        />
      )}
    </div>
  );
}

// ── ASSIGN MODAL ──────────────────────────────────────────────────
function AssignModal({ project, presetTruckId, presetDate, trucks, unscheduled, onAssign, onClose }) {
  const [selectedProject, setSelectedProject] = useState(project||null);
  const [truckId, setTruckId] = useState(presetTruckId||"");
  const [date, setDate] = useState(presetDate ? fmtDate(presetDate) : "");
  const [search, setSearch] = useState("");

  const days = selectedProject ? getDaysFromQuote(selectedProject.quotes) : 1;
  const total = selectedProject ? getTotal(selectedProject.quotes) : 0;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div style={{background:"#fff",borderRadius:12,padding:24,maxWidth:460,width:"100%",maxHeight:"85vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:800}}>Schedule Job</h2>
          <button onClick={onClose} style={{border:"none",background:"none",fontSize:20,cursor:"pointer",color:"#94a3b8"}}>✕</button>
        </div>

        {/* If no project pre-selected, show picker */}
        {!selectedProject && unscheduled && (
          <div style={{marginBottom:16}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job..."
              style={{width:"100%",padding:"8px 12px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:13,marginBottom:8,boxSizing:"border-box"}}/>
            <div style={{maxHeight:200,overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:8}}>
              {unscheduled.filter(p=>{
                const q=search.toLowerCase();
                return !q||(p.customers?.name||"").toLowerCase().includes(q)||(p.address||"").toLowerCase().includes(q);
              }).map(p=>(
                <div key={p.id} onClick={()=>setSelectedProject(p)}
                  style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",cursor:"pointer",fontSize:13}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0fdf4"}
                  onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                  <strong>{p.customers?.name||p.name}</strong>
                  <div style={{fontSize:11,color:"#64748b"}}>{p.address}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedProject && (
          <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"10px 12px",marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:14}}>{selectedProject.customers?.name||selectedProject.name}</div>
            <div style={{fontSize:12,color:"#64748b"}}>{selectedProject.address}</div>
            <div style={{fontSize:12,color:"#059669",marginTop:4}}>{days} day(s) · ${total.toLocaleString()}</div>
            {!project && <button onClick={()=>setSelectedProject(null)} style={{marginTop:6,fontSize:11,color:"#ef4444",background:"none",border:"none",cursor:"pointer",padding:0}}>✕ Change</button>}
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
          <div>
            <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:5}}>Truck</label>
            <select value={truckId} onChange={e=>setTruckId(e.target.value)}
              style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13}}>
              <option value="">Select...</option>
              {trucks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:5}}>Start Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13}}/>
          </div>
        </div>

        <button
          onClick={()=>{ if(selectedProject&&truckId&&date) onAssign(selectedProject,truckId,new Date(date+"T12:00:00")); }}
          disabled={!selectedProject||!truckId||!date}
          style={{width:"100%",padding:"12px",background:selectedProject&&truckId&&date?"#059669":"#94a3b8",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:selectedProject&&truckId&&date?"pointer":"not-allowed"}}>
          ✓ Add to Schedule
        </button>
      </div>
    </div>
  );
}

// ── DETAIL MODAL ──────────────────────────────────────────────────
function DetailModal({ job, truck, trucks, color, onUpdate, onUnschedule, onClose }) {
  const [truckId, setTruckId] = useState(job.truck_id);
  const [date, setDate] = useState(job.start_date?.slice(0,10)||"");
  const [days, setDays] = useState(job.duration_days||1);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div style={{background:"#fff",borderRadius:12,padding:24,maxWidth:420,width:"100%"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:800}}>Edit Scheduled Job</h2>
          <button onClick={onClose} style={{border:"none",background:"none",fontSize:20,cursor:"pointer",color:"#94a3b8"}}>✕</button>
        </div>

        <div style={{background:color+"18",borderLeft:`3px solid ${color}`,borderRadius:8,padding:"10px 12px",marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:14}}>{job.customer_name||"Job"}</div>
          <div style={{fontSize:12,color:"#64748b"}}>{job.project_address||""}</div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:5}}>Truck</label>
            <select value={truckId} onChange={e=>setTruckId(e.target.value)}
              style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13}}>
              {trucks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:5}}>Start Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13}}/>
          </div>
        </div>

        <div style={{marginBottom:20}}>
          <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:5}}>Duration (days)</label>
          <input type="number" min={1} value={days} onChange={e=>setDays(Number(e.target.value))}
            style={{width:80,padding:"8px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13}}/>
        </div>

        <div style={{display:"flex",gap:10,marginBottom:10}}>
          <button onClick={()=>onUpdate(job.id,truckId,date,days)}
            style={{flex:1,padding:"11px",background:"#059669",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>
            ✓ Save Changes
          </button>
          {!confirmDel
            ? <button onClick={()=>setConfirmDel(true)}
                style={{padding:"11px 16px",background:"#fff",color:"#ef4444",border:"1px solid #fca5a5",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                🗑
              </button>
            : <button onClick={onUnschedule}
                style={{padding:"11px 16px",background:"#ef4444",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                Confirm
              </button>
          }
        </div>

        <button onClick={onUnschedule}
          style={{width:"100%",padding:"10px",background:"#fff",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer"}}>
          ↩ Remove from Schedule (return to list)
        </button>
      </div>
    </div>
  );
}
