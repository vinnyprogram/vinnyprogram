import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WORK_DAYS = [1,2,3,4,5,6]; // Mon–Sat (Sun=0 excluded by default)

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(d) {
  return d.toISOString().slice(0,10);
}

function fmtDisplay(d) {
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

// Get work days in a week (Mon–Fri always, Sat optional)
function getWeekDays(weekStart, includeSat) {
  return [0,1,2,3,4,...(includeSat?[5]:[])].map(i => addDays(weekStart, i));
}

// Color palette for trucks
const TRUCK_COLORS = [
  "#059669","#3b82f6","#f97316","#8b5cf6","#ef4444","#06b6d4",
  "#d97706","#10b981","#e11d48","#7c3aed","#0284c7","#65a30d"
];

export default function Schedule() {
  const { company } = useAuth();
  const companyId = company?.id;

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [includeSat, setIncludeSat] = useState(false);
  const [trucks, setTrucks] = useState([]);
  const [jobs, setJobs] = useState([]); // scheduled_jobs rows
  const [unscheduled, setUnscheduled] = useState([]); // won projects not yet scheduled
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState(null); // {type:"assign"|"edit"|"detail", job?, date?, truck?}

  useEffect(() => { if (companyId) load(); }, [companyId, weekStart]);

  async function load() {
    setLoading(true);
    try {
      // Load trucks
      const { data: truckData, error: truckErr } = await supabase
        .from("trucks").select("*").eq("company_id", companyId).order("name");
      if (truckErr) console.error("trucks error:", truckErr.message);

      // Load scheduled jobs in view range
      const from = fmtDate(addDays(weekStart, -7));
      const to   = fmtDate(addDays(weekStart, 21));
      const { data: jobData, error: jobErr } = await supabase
        .from("scheduled_jobs")
        .select("*, projects(id,name,address,lead_id,customers(name),quotes(grand_total,labor_roles_json,status))")
        .eq("company_id", companyId)
        .gte("start_date", from)
        .lte("start_date", to);
      if (jobErr) console.error("scheduled_jobs error:", jobErr.message);

      // Load projects with accepted quotes not yet scheduled
      const { data: wonProjects, error: wpErr } = await supabase
        .from("projects")
        .select("id,name,address,lead_id,customers(name),quotes(grand_total,labor_roles_json,status)")
        .eq("company_id", companyId)
        .is("scheduled_job_id", null);
      if (wpErr) console.error("wonProjects error:", wpErr.message);

      setTrucks(truckData || []);
      setJobs(jobData || []);
      setUnscheduled((wonProjects || []).filter(p =>
        p.quotes?.some(q => q.status === "Accepted")
      ));
    } catch(e) {
      console.error("Schedule load error:", e);
    }
    setLoading(false);
  }

  // Parse days from labor_roles_json
  function getDays(quote) {
    if (!quote?.labor_roles_json) return 1;
    try {
      const roles = JSON.parse(quote.labor_roles_json);
      return Math.max(1, Math.max(...roles.map(r => Number(r.days||1))));
    } catch { return 1; }
  }

  const weekDays = getWeekDays(weekStart, includeSat);

  // Build a map: truck_id → date → [jobs]
  const jobMap = {};
  jobs.forEach(j => {
    if (!jobMap[j.truck_id]) jobMap[j.truck_id] = {};
    const days = j.duration_days || 1;
    for (let d = 0; d < days; d++) {
      const dt = fmtDate(addDays(new Date(j.start_date), d));
      if (!jobMap[j.truck_id][dt]) jobMap[j.truck_id][dt] = [];
      if (d === 0) jobMap[j.truck_id][dt].push(j);
    }
  });

  async function scheduleJob(project, truckId, date, durationDays) {
    const { data: sj, error } = await supabase.from("scheduled_jobs").insert({
      company_id: companyId,
      project_id: project.id,
      truck_id: truckId,
      start_date: fmtDate(date),
      duration_days: durationDays,
      status: "Scheduled",
    }).select().single();
    if (error) { alert("Error: " + error.message); return; }
    // Mark project as scheduled
    await supabase.from("projects").update({ scheduled_job_id: sj.id }).eq("id", project.id);
    setModal(null);
    load();
  }

  async function moveJob(jobId, newTruckId, newDate) {
    await supabase.from("scheduled_jobs").update({
      truck_id: newTruckId,
      start_date: fmtDate(newDate),
    }).eq("id", jobId);
    load();
  }

  async function deleteScheduledJob(jobId, projectId) {
    await supabase.from("scheduled_jobs").delete().eq("id", jobId);
    await supabase.from("projects").update({ scheduled_job_id: null }).eq("id", projectId);
    setModal(null);
    load();
  }

  const truckColor = (i) => TRUCK_COLORS[i % TRUCK_COLORS.length];

  return (
    <div style={{ fontFamily:"system-ui,sans-serif", background:"#f8fafc", minHeight:"100vh", padding:0 }}>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"12px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        <h1 style={{ fontSize:18, fontWeight:800, margin:0, color:"#0f172a" }}>📅 Schedule</h1>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto", flexWrap:"wrap" }}>
          <button onClick={() => setWeekStart(w => addDays(w,-7))}
            style={{ padding:"6px 12px", border:"1px solid #e2e8f0", borderRadius:6, background:"#fff", cursor:"pointer", fontWeight:700 }}>‹</button>
          <span style={{ fontSize:14, fontWeight:600, color:"#334155", minWidth:180, textAlign:"center" }}>
            {fmtDisplay(weekStart)} – {fmtDisplay(addDays(weekStart, includeSat?5:4))}
          </span>
          <button onClick={() => setWeekStart(w => addDays(w,7))}
            style={{ padding:"6px 12px", border:"1px solid #e2e8f0", borderRadius:6, background:"#fff", cursor:"pointer", fontWeight:700 }}>›</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            style={{ padding:"6px 12px", border:"1px solid #e2e8f0", borderRadius:6, background:"#f1f5f9", cursor:"pointer", fontSize:13 }}>Today</button>
          <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:"#64748b", cursor:"pointer" }}>
            <input type="checkbox" checked={includeSat} onChange={e=>setIncludeSat(e.target.checked)} />
            Saturday
          </label>
        </div>
      </div>

      <div style={{ display:"flex", gap:0 }}>

        {/* Unscheduled sidebar */}
        <div style={{ width:200, minWidth:200, background:"#1e293b", padding:12, minHeight:"calc(100vh - 57px)", overflowY:"auto" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#94a3b8", marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>
            Unscheduled ({unscheduled.length})
          </div>
          {unscheduled.length === 0 && (
            <div style={{ fontSize:12, color:"#475569", textAlign:"center", marginTop:24 }}>All jobs scheduled ✓</div>
          )}
          {unscheduled.map(p => {
            const quote = p.quotes?.find(q => q.status === "Accepted") || p.quotes?.[0];
            const days = getDays(quote);
            return (
              <div key={p.id}
                onClick={() => setModal({ type:"assign", project:p, days })}
                style={{ background:"#334155", borderRadius:8, padding:"8px 10px", marginBottom:8, cursor:"pointer", border:"1px solid #475569" }}
                onMouseEnter={e=>e.currentTarget.style.background="#3f4f63"}
                onMouseLeave={e=>e.currentTarget.style.background="#334155"}>
                <div style={{ fontSize:12, fontWeight:700, color:"#f1f5f9", marginBottom:2 }}>
                  {p.customers?.name || p.name}
                </div>
                <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>{p.address}</div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:11, background:"#059669", color:"#fff", borderRadius:4, padding:"1px 6px" }}>
                    {days}d
                  </span>
                  <span style={{ fontSize:11, color:"#10b981" }}>
                    ${Number(quote?.grand_total||0).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Calendar grid */}
        <div style={{ flex:1, overflowX:"auto" }}>
          {loading ? (
            <div style={{ padding:40, textAlign:"center", color:"#94a3b8" }}>Loading...</div>
          ) : trucks.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:"#94a3b8" }}>
              No trucks configured. <a href="/settings" style={{ color:"#059669" }}>Add trucks in Settings →</a>
            </div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:600 }}>
              <thead>
                <tr>
                  <th style={{ width:100, padding:"10px 12px", background:"#fff", borderBottom:"2px solid #e2e8f0", borderRight:"1px solid #e2e8f0", fontSize:12, color:"#64748b", textAlign:"left", position:"sticky", left:0, zIndex:3 }}>
                    Truck
                  </th>
                  {weekDays.map((d, i) => {
                    const isToday = fmtDate(d) === fmtDate(new Date());
                    const isSat = d.getDay() === 6;
                    return (
                      <th key={i} style={{
                        padding:"8px 10px", background: isToday?"#f0fdf4":"#fff",
                        borderBottom:"2px solid #e2e8f0", borderRight:"1px solid #f1f5f9",
                        fontSize:12, color: isToday?"#059669":isSat?"#94a3b8":"#374151",
                        fontWeight: isToday?800:600, textAlign:"center", minWidth:120
                      }}>
                        <div>{DAY_NAMES[d.getDay()]}</div>
                        <div style={{ fontSize:13, fontWeight:isToday?800:500 }}>{fmtDisplay(d)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {trucks.map((truck, ti) => (
                  <tr key={truck.id}>
                    <td style={{
                      padding:"10px 12px", background:"#fff", borderBottom:"1px solid #f1f5f9",
                      borderRight:"1px solid #e2e8f0", position:"sticky", left:0, zIndex:2
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:10, height:10, borderRadius:"50%", background:truckColor(ti), flexShrink:0 }}/>
                        <span style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>{truck.name}</span>
                      </div>
                    </td>
                    {weekDays.map((d, di) => {
                      const dt = fmtDate(d);
                      const dayJobs = (jobMap[truck.id]?.[dt] || []);
                      const isToday = dt === fmtDate(new Date());
                      const isSat = d.getDay() === 6;
                      return (
                        <td key={di}
                          onClick={() => {
                            // Click empty cell to assign from unscheduled
                            if (dayJobs.length === 0 && unscheduled.length > 0) {
                              setModal({ type:"pick", truckId:truck.id, date:d });
                            }
                          }}
                          style={{
                            padding:4, verticalAlign:"top", minHeight:80, height:80,
                            background: isToday?"#f0fdf4":isSat?"#f8fafc":"#fff",
                            borderBottom:"1px solid #f1f5f9", borderRight:"1px solid #f1f5f9",
                            cursor: dayJobs.length===0 && unscheduled.length>0 ? "pointer":"default",
                          }}
                          onMouseEnter={e=>{ if(dayJobs.length===0) e.currentTarget.style.background=isToday?"#dcfce7":"#f0fdf4"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.background=isToday?"#f0fdf4":isSat?"#f8fafc":"#fff"; }}
                        >
                          {dayJobs.map(j => {
                            const isStart = fmtDate(new Date(j.start_date)) === dt;
                            if (!isStart) return (
                              <div key={j.id} style={{ height:28, background:truckColor(ti)+"33", borderRadius:4, margin:2 }}/>
                            );
                            return (
                              <div key={j.id}
                                onClick={e => { e.stopPropagation(); setModal({type:"detail", job:j, truckIdx:ti}); }}
                                style={{
                                  background:truckColor(ti), color:"#fff", borderRadius:6,
                                  padding:"4px 7px", margin:2, cursor:"pointer", fontSize:11, fontWeight:600,
                                  boxShadow:"0 1px 4px rgba(0,0,0,0.15)"
                                }}
                                onMouseEnter={e=>{ e.currentTarget.style.opacity="0.85"; e.stopPropagation(); }}
                                onMouseLeave={e=>{ e.currentTarget.style.opacity="1"; }}>
                                <div style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                                  {j.projects?.customers?.name || j.projects?.name || "Job"}
                                </div>
                                <div style={{ fontSize:10, opacity:0.85 }}>
                                  {j.duration_days}d · ${Number(j.projects?.quotes?.[0]?.grand_total||0).toLocaleString()}
                                </div>
                              </div>
                            );
                          })}
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

      {/* MODAL: Assign from unscheduled panel to specific truck/date */}
      {modal?.type === "pick" && (
        <Modal title={`Schedule for ${fmtDisplay(modal.date)}`} onClose={() => setModal(null)}>
          <p style={{ fontSize:13, color:"#64748b", marginBottom:12 }}>Pick a job to assign to this day:</p>
          {unscheduled.map(p => {
            const quote = p.quotes?.find(q=>q.status==="Accepted")||p.quotes?.[0];
            const days = getDays(quote);
            return (
              <div key={p.id} onClick={() => scheduleJob(p, modal.truckId, modal.date, days)}
                style={{ padding:"10px 12px", border:"1px solid #e2e8f0", borderRadius:8, marginBottom:8, cursor:"pointer", background:"#f8fafc" }}
                onMouseEnter={e=>e.currentTarget.style.background="#f0fdf4"}
                onMouseLeave={e=>e.currentTarget.style.background="#f8fafc"}>
                <div style={{ fontWeight:700, fontSize:14 }}>{p.customers?.name || p.name}</div>
                <div style={{ fontSize:12, color:"#64748b" }}>{p.address}</div>
                <div style={{ fontSize:12, color:"#059669", marginTop:4 }}>{days} day(s) · ${Number(quote?.grand_total||0).toLocaleString()}</div>
              </div>
            );
          })}
        </Modal>
      )}

      {/* MODAL: Assign job from sidebar — pick truck + date */}
      {modal?.type === "assign" && (
        <AssignModal
          project={modal.project}
          days={modal.days}
          trucks={trucks}
          weekDays={weekDays}
          truckColor={truckColor}
          jobMap={jobMap}
          onAssign={(truckId, date) => scheduleJob(modal.project, truckId, date, modal.days)}
          onClose={() => setModal(null)}
        />
      )}

      {/* MODAL: Job detail / edit / delete */}
      {modal?.type === "detail" && (
        <JobDetailModal
          job={modal.job}
          trucks={trucks}
          truckColor={truckColor}
          truckIdx={modal.truckIdx}
          onMove={(newTruckId, newDate) => { moveJob(modal.job.id, newTruckId, newDate); setModal(null); }}
          onDelete={() => deleteScheduledJob(modal.job.id, modal.job.project_id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:12, padding:24, maxWidth:480, width:"100%", maxHeight:"80vh", overflowY:"auto" }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800 }}>{title}</h2>
          <button onClick={onClose} style={{ border:"none", background:"none", fontSize:20, cursor:"pointer", color:"#94a3b8" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AssignModal({ project, days, trucks, weekDays, truckColor, jobMap, onAssign, onClose }) {
  const [selectedTruck, setSelectedTruck] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const quote = project.quotes?.find(q=>q.status==="Accepted")||project.quotes?.[0];

  return (
    <Modal title="Schedule Job" onClose={onClose}>
      <div style={{ marginBottom:12 }}>
        <div style={{ fontWeight:700, fontSize:15 }}>{project.customers?.name || project.name}</div>
        <div style={{ fontSize:13, color:"#64748b" }}>{project.address}</div>
        <div style={{ fontSize:13, color:"#059669", marginTop:4 }}>
          {days} day(s) · ${Number(quote?.grand_total||0).toLocaleString()}
        </div>
      </div>

      <div style={{ marginBottom:14 }}>
        <label style={{ fontSize:13, fontWeight:600, display:"block", marginBottom:6 }}>Truck</label>
        <select value={selectedTruck} onChange={e=>setSelectedTruck(e.target.value)}
          style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:14 }}>
          <option value="">Select truck...</option>
          {trucks.map((t,i) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom:20 }}>
        <label style={{ fontSize:13, fontWeight:600, display:"block", marginBottom:6 }}>Start Date</label>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
          style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:14 }} />
      </div>

      <button onClick={() => { if(selectedTruck && selectedDate) onAssign(selectedTruck, new Date(selectedDate+"T12:00:00")); }}
        disabled={!selectedTruck || !selectedDate}
        style={{ width:"100%", padding:"12px", background: selectedTruck&&selectedDate?"#059669":"#94a3b8", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:700, cursor:selectedTruck&&selectedDate?"pointer":"not-allowed" }}>
        ✓ Schedule Job
      </button>
    </Modal>
  );
}

function JobDetailModal({ job, trucks, truckColor, truckIdx, onMove, onDelete, onClose }) {
  const [editTruck, setEditTruck] = useState(job.truck_id);
  const [editDate, setEditDate] = useState(job.start_date?.slice(0,10));
  const [editDays, setEditDays] = useState(job.duration_days || 1);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <Modal title="Job Details" onClose={onClose}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:15 }}>{job.projects?.customers?.name || job.projects?.name}</div>
        <div style={{ fontSize:13, color:"#64748b" }}>{job.projects?.address}</div>
        <div style={{ fontSize:13, color:"#059669", marginTop:4 }}>
          ${Number(job.projects?.quotes?.[0]?.grand_total||0).toLocaleString()}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <div>
          <label style={{ fontSize:12, fontWeight:600, display:"block", marginBottom:4 }}>Truck</label>
          <select value={editTruck} onChange={e=>setEditTruck(e.target.value)}
            style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:13 }}>
            {trucks.map((t,i) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize:12, fontWeight:600, display:"block", marginBottom:4 }}>Start Date</label>
          <input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)}
            style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:13 }} />
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <label style={{ fontSize:12, fontWeight:600, display:"block", marginBottom:4 }}>Duration (days)</label>
        <input type="number" min={1} value={editDays} onChange={e=>setEditDays(Number(e.target.value))}
          style={{ width:80, padding:"7px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:13 }} />
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={() => onMove(editTruck, new Date(editDate+"T12:00:00"))}
          style={{ flex:1, padding:"10px", background:"#059669", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          ✓ Save Changes
        </button>
        {!confirmDel
          ? <button onClick={()=>setConfirmDel(true)}
              style={{ padding:"10px 14px", background:"#fff", color:"#ef4444", border:"1px solid #fca5a5", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              🗑
            </button>
          : <button onClick={onDelete}
              style={{ padding:"10px 14px", background:"#ef4444", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              Confirm Delete
            </button>
        }
      </div>
    </Modal>
  );
}
