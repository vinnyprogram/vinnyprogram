import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AddressInput from "./AddressInput";

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0});
}

const PIPELINE_COLORS = {
  "Draft":          { bg:"#f1f5f9", text:"#64748b" },
  "Measured":       { bg:"#eff6ff", text:"#3b82f6" },
  "Sent to Office": { bg:"#fff7ed", text:"#f97316" },
  "Quote Ready":    { bg:"#f5f3ff", text:"#7c3aed" },
  "Proposal":       { bg:"#fef3c7", text:"#d97706" },
  "Negotiation":    { bg:"#ffedd5", text:"#ea580c" },
  "Accepted":       { bg:"#dcfce7", text:"#059669" },
  "Job Scheduled":  { bg:"#ccfbf1", text:"#0d9488" },
  "Completed":      { bg:"#f0fdf4", text:"#15803d" },
};
function fmtDate(d) {
  return new Date(d||Date.now()).toLocaleDateString("en-US",
    {month:"short",day:"numeric",year:"numeric"});
}

function ActualLaborInput({ jobId, quote, onSave }) {
  const [roles, setRoles] = useState([
    { role:"Lead Installer", hours:"8", days:"1", people:1, rate:55 },
    { role:"Helper",         hours:"8", days:"1", people:1, rate:35 },
    { role:"",               hours:"8", days:"1", people:1, rate:0 },
    { role:"",               hours:"8", days:"1", people:1, rate:0 },
  ]);
  const total = roles.reduce((s,r)=>
    s+Number(r.hours||0)*Number(r.days||1)*Number(r.people||1)*Number(r.rate||0),0);
  const IS = {height:28,borderRadius:4,border:"1px solid #e2e8f0",
    fontSize:11,textAlign:"center",width:"100%",boxSizing:"border-box"};
  return (
    <div style={{marginBottom:10,padding:"10px",background:"white",
        borderRadius:6,border:"1px solid #86efac"}}>
      <div style={{fontSize:10,color:"#64748b",marginBottom:6,fontWeight:600}}>
        ✏️ Actual Hours (after job)
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr",
          gap:3,marginBottom:4}}>
        {["Role","Hrs/day","Days","People","$/hr","Cost"].map(h=>(
          <div key={h} style={{fontSize:9,color:"#94a3b8",fontWeight:700,
              textTransform:"uppercase"}}>{h}</div>
        ))}
      </div>
      {roles.map((r,i)=>{
        const cost = Number(r.hours||0)*Number(r.days||1)*Number(r.people||1)*Number(r.rate||0);
        return (
          <div key={i} style={{display:"grid",
              gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr",
              gap:3,marginBottom:4,alignItems:"center"}}>
            <input placeholder={i===0?"Lead":i===1?"Helper":"Role"}
              value={r.role}
              onChange={e=>setRoles(p=>p.map((x,j)=>j===i?{...x,role:e.target.value}:x))}
              style={{...IS,textAlign:"left",padding:"0 6px"}} />
            <input type="number" value={r.hours}
              onChange={e=>setRoles(p=>p.map((x,j)=>j===i?{...x,hours:e.target.value}:x))}
              style={IS} />
            <input type="number" value={r.days}
              onChange={e=>setRoles(p=>p.map((x,j)=>j===i?{...x,days:e.target.value}:x))}
              style={IS} />
            <input type="number" value={r.people}
              onChange={e=>setRoles(p=>p.map((x,j)=>j===i?{...x,people:e.target.value}:x))}
              style={IS} />
            <input type="number" value={r.rate||""}
              onChange={e=>setRoles(p=>p.map((x,j)=>j===i?{...x,rate:e.target.value}:x))}
              style={IS} />
            <div style={{fontSize:11,fontWeight:700,
                color:cost>0?"#059669":"#94a3b8",textAlign:"right"}}>
              {cost>0?`$${cost.toLocaleString("en-US",{maximumFractionDigits:0})}`:"—"}
            </div>
          </div>
        );
      })}
      <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",paddingTop:6,borderTop:"1px solid #d1fae5",marginTop:2}}>
        <span style={{fontSize:11,fontWeight:700,color:"#1e40af"}}>
          Total Labor: ${total.toLocaleString("en-US",{maximumFractionDigits:0})}
        </span>
        <button onClick={()=>onSave(jobId, roles)}
          style={{border:"none",background:"#059669",color:"white",
            padding:"6px 14px",borderRadius:6,cursor:"pointer",
            fontSize:11,fontWeight:700}}>
          ✓ Save
        </button>
      </div>
    </div>
  );
}

export default function CustomerProfile() {
  const { customerId } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer]   = useState(null);
  const [projects, setProjects]   = useState([]);
  const [photos, setPhotos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [openCost, setOpenCost]   = useState(null);
  const [docs, setDocs]           = useState([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const fileInputRef = useRef();

  useEffect(()=>{ load(); },[customerId]);

  async function load() {
    setLoading(true);

    // customer
    const { data:cust } = await supabase.from("customers")
      .select("*").eq("id", Number(customerId)).maybeSingle();
    setCustomer(cust);

    // projects with quotes
    const { data:projs } = await supabase.from("projects")
      .select("*").eq("lead_id", Number(customerId))
      .order("created_at", { ascending:false });

    if(projs?.length) {
      const ids = projs.map(p=>p.id);
      const { data:quotes } = await supabase.from("quotes")
        .select("id,project_id,grand_total,final_price,material_cost,overhead_cost,labor_cost,profit_margin_pct,status,created_at")
        .in("project_id", ids)
        .order("created_at", { ascending:false });

      // group quotes by project
      const qMap = {};
      (quotes||[]).forEach(q=>{
        if(!qMap[q.project_id]) qMap[q.project_id]=[];
        qMap[q.project_id].push(q);
      });

      // group projects by address
      const addrMap = {};
      projs.forEach(p=>{
        const addr = p.address||"No address";
        if(!addrMap[addr]) addrMap[addr]={ address:addr, jobs:[] };
        addrMap[addr].jobs.push({ ...p, quotes: qMap[p.id]||[] });
      });

      setProjects(Object.values(addrMap));

      // set first address as active
      if(Object.keys(addrMap).length>0){
        setActiveJob(Object.keys(addrMap)[0]);
      }
    }

    // photos
    // load photos for all projects of this customer
    let ph = [];
    if(projs?.length) {
      const projIds = projs.map(p=>p.id);
      const { data:phData } = await supabase.from("job_photos")
        .select("*").in("project_id", projIds)
        .order("created_at", { ascending:false });
      ph = phData||[];
    }
    setPhotos(ph);

    // load documents
    if(projs?.length) {
      const projIds = projs.map(p=>p.id);
      const { data:docData } = await supabase.from("job_photos")
        .select("*").in("project_id", projIds)
        .eq("doc_type", "document")
        .order("created_at", { ascending:false });
      setDocs(docData||[]);
    }

    setLoading(false);
  }

  async function duplicateProject(projectId) {
  // Fetch original project + floors + areas + segments
  const { data:proj } = await supabase.from("projects").select("*").eq("id",projectId).single();
  if(!proj) return;
  const { data:floors } = await supabase.from("floors").select("*").eq("project_id",projectId).order("order_index");
  const { data:areas } = await supabase.from("areas").select("*").eq("project_id",projectId).order("order_index");
  const areaIds = (areas||[]).map(a=>a.id);
  let segs = [];
  if(areaIds.length){
    const { data:s } = await supabase.from("segments").select("*").in("area_id",areaIds);
    segs = s||[];
  }

  // Create new project (copy, reset pipeline status)
 const { data:newProj, error:pe } = await supabase.from("projects").insert([{
    lead_id: proj.lead_id, name: proj.name, address: proj.address,
    status:"Active", source: proj.source, company_id: proj.company_id,
    crew_notes: proj.crew_notes, pipeline_status: "Measured",
  }]).select().single();
  if(pe||!newProj){ alert("Error creating new version: "+(pe?.message||"")); return; }

  // Copy floors
  const floorMap = {};
  if(floors?.length){
    const { data:newFloors } = await supabase.from("floors").insert(
      floors.map(f=>({project_id:newProj.id,name:f.name,order_index:f.order_index,company_id:f.company_id}))
    ).select();
    floors.forEach((f,i)=>{ floorMap[f.id]=newFloors[i].id; });
  }

  // Copy areas
  const areaMap = {};
  if(areas?.length){
    const { data:newAreas } = await supabase.from("areas").insert(
      areas.map(a=>({
        project_id:newProj.id, floor_id:floorMap[a.floor_id], area_type:a.area_type,
        material:a.material, thickness_in:a.thickness_in, r_value:a.r_value,
        sqft:a.sqft, qty:a.qty, unit:a.unit, unit_price:a.unit_price, line_total:a.line_total,
        order_index:a.order_index, company_id:a.company_id, options:a.options,
      }))
    ).select();
    areas.forEach((a,i)=>{ areaMap[a.id]=newAreas[i].id; });
  }

  // Copy segments
  if(segs.length){
    await supabase.from("segments").insert(
      segs.map(s=>({
        area_id:areaMap[s.area_id], height:s.height, length:s.length,
        sqft:s.sqft, source:s.source, company_id:s.company_id,
      }))
    );
  }

  navigate(`/project/${newProj.id}`);
}

  async function updateActualHours(projectId, roles) {
    const laborCost = roles.reduce((s,r)=>
      s+Number(r.hours||0)*Number(r.days||1)*Number(r.people||1)*Number(r.rate||0),0);
    const totalHours = roles.reduce((s,r)=>
      s+Number(r.hours||0)*Number(r.days||1)*Number(r.people||1),0);
    const { data:q } = await supabase.from("quotes")
      .select("*").eq("project_id", projectId).maybeSingle();
    if(!q) return;
    const totalCost = Number(q.material_cost||0) + Number(q.overhead_cost||0) + laborCost;
    const finalPrice = totalCost * (1 + Number(q.profit_margin_pct||30)/100);
    await supabase.from("quotes").update({
      labor_cost: Math.round(laborCost*100)/100,
      labor_hours: totalHours,
      crew_size: roles.filter(r=>Number(r.hours||0)>0).length,
      labor_rate: roles.find(r=>Number(r.hours||0)>0)?.rate||45,
      final_price: Math.round(finalPrice*100)/100,
      grand_total: Math.round(finalPrice*100)/100,
    }).eq("project_id", projectId);
    await load();
  }

  async function uploadPhotos(files, projectId) {
    if(!files?.length) return;
    setUploading(true);
    const { data:{ user } } = await supabase.auth.getUser();
    const { data:cd } = await supabase.from("companies")
      .select("id").eq("user_id", user.id).maybeSingle();
    const companyId = cd?.id||null;

    let successCount = 0;
    let errorMsgs = [];

    for(const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const path = `${companyId}/${projectId}/${Date.now()}.${ext}`;
      const { error:upErr } = await supabase.storage
        .from("job-photos").upload(path, file);
      if(upErr){
        console.error("Upload error:", upErr);
        errorMsgs.push(upErr.message||JSON.stringify(upErr));
        continue;
      }
      const { data:urlData } = supabase.storage
        .from("job-photos").getPublicUrl(path);
      const { error:insErr } = await supabase.from("job_photos").insert([{
        project_id: projectId,
        url: urlData.publicUrl,
        company_id: companyId,
      }]);
      if(insErr){
        console.error("Insert error:", insErr);
        errorMsgs.push(insErr.message||JSON.stringify(insErr));
        continue;
      }
      successCount++;
    }
    if(errorMsgs.length>0){
      alert(`Upload failed:\n${errorMsgs.join("\n")}`);
    }
    await load();
    setUploading(false);
  }

  async function uploadDocs(files, projectId) {
    if(!files?.length) return;
    setUploadingDoc(true);
    const { data:{ user } } = await supabase.auth.getUser();
    const { data:cd } = await supabase.from("companies")
      .select("id").eq("user_id", user.id).maybeSingle();
    const companyId = cd?.id||null;

    for(const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const path = `${companyId}/${projectId}/docs/${Date.now()}_${file.name}`;
      const { error:upErr } = await supabase.storage
        .from("job-photos").upload(path, file);
      if(upErr){ console.error(upErr); continue; }
      const { data:urlData } = supabase.storage
        .from("job-photos").getPublicUrl(path);
      await supabase.from("job_photos").insert([{
        project_id: projectId,
        url: urlData.publicUrl,
        caption: file.name,
        company_id: companyId,
        doc_type: "document",
      }]);
    }
    await load();
    setUploadingDoc(false);
  }

  if(loading) return (
    <div style={{padding:40,textAlign:"center",color:"#64748b",fontFamily:"system-ui"}}>
      Loading…
    </div>
  );

  if(!customer) return (
    <div style={{padding:40,textAlign:"center",color:"#ef4444",fontFamily:"system-ui"}}>
      Customer not found.
      <button onClick={()=>navigate("/crm")}
        style={{marginLeft:12,cursor:"pointer"}}>← CRM</button>
    </div>
  );

  const activeGroup = projects.find(p=>p.address===activeJob);

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:"#f6f7fb",
        minHeight:"100vh",paddingBottom:40}}>

      {/* header */}
      <div style={{background:"#0f172a",padding:"14px 20px",
          display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>navigate("/crm")}
          style={{border:"1px solid #475569",background:"none",color:"#94a3b8",
            padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← CRM
        </button>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
          <div style={{color:"white",fontWeight:800,fontSize:16}}>{customer.name}</div>
          {customer.phone && (
            <a href={`tel:${customer.phone.replace(/\D/g,"")}`}
              style={{color:"#60a5fa",fontWeight:700,fontSize:13,textDecoration:"none"}}>
              📞 {customer.phone}
            </a>
          )}
          {customer.company_name && (
            <span style={{color:"white",fontWeight:700,fontSize:13}}>{customer.company_name}</span>
          )}
          {customer.email && (
            <a href={`mailto:${customer.email}`}
              style={{color:"#94a3b8",fontSize:12,textDecoration:"none"}}>
              ✉️ {customer.email}
            </a>
          )}
        </div>
        <button onClick={()=>navigate(`/project/new?leadId=${customerId}`)}
          style={{border:"none",background:"#059669",color:"white",
            padding:"8px 14px",borderRadius:8,cursor:"pointer",
            fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
          + New Estimate
        </button>
      </div>

      <div style={{maxWidth:800,margin:"0 auto",padding:"16px 14px"}}>

        {projects.length===0 ? (
          <div style={{textAlign:"center",padding:40,color:"#94a3b8",
              background:"white",borderRadius:12,border:"1px solid #e2e8f0"}}>
            <div style={{fontSize:32,marginBottom:8}}>📋</div>
            <div style={{fontSize:14,fontWeight:600}}>No estimates yet</div>
            <div style={{fontSize:12,marginTop:4}}>Tap "+ New Estimate" to get started</div>
          </div>
        ) : (
          <>
            {/* address tabs */}
            {projects.length>1 && (
              <div style={{display:"flex",gap:6,overflowX:"auto",
                  paddingBottom:4,marginBottom:12,WebkitOverflowScrolling:"touch"}}>
                {projects.map(pg=>(
                  <button key={pg.address}
                    onClick={()=>setActiveJob(pg.address)}
                    style={{flexShrink:0,padding:"6px 14px",borderRadius:20,
                      border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                      background:activeJob===pg.address?"#0f172a":"#e2e8f0",
                      color:activeJob===pg.address?"white":"#374151",
                      whiteSpace:"nowrap"}}>
                    📍 {pg.address}
                  </button>
                ))}
              </div>
            )}

            {activeGroup && (
              <>
                {/* address header */}
                <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>
                    📍 {activeGroup.address}
                  </div>
                  <button onClick={()=>navigate(`/project/new?leadId=${customerId}`)}
                    style={{border:"1px solid #e2e8f0",background:"white",
                      color:"#3b82f6",padding:"5px 12px",borderRadius:6,
                      cursor:"pointer",fontSize:11,fontWeight:700}}>
                    + New Estimate
                  </button>
                </div>

                {/* estimate versions */}
                {activeGroup.jobs.map((job,ji)=>(
                  <div key={job.id} style={{background:"white",borderRadius:12,
                      border:"1px solid #e2e8f0",marginBottom:10,
                      boxShadow:"0 2px 8px rgba(0,0,0,.04)",overflow:"hidden"}}>

                   {/* job header */}
                  <div style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      background: ji===0?"#f0fdf4":"white"}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:"#0f172a",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        {ji===0 && <span style={{color:"#059669"}}>★ Latest</span>}
                        {(job.pipeline_status||"Draft")==="Proposal" ? `Proposal ${activeGroup.jobs.length - ji}` : `Estimate ${activeGroup.jobs.length - ji}`}
                        <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,
                            background: PIPELINE_COLORS[job.pipeline_status||"Draft"]?.bg,
                            color: PIPELINE_COLORS[job.pipeline_status||"Draft"]?.text}}>
                          {job.pipeline_status||"Draft"}
                        </span>
                      </div>
                        <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>
                          {fmtDate(job.created_at)}
                          {job.source==="drawings" && (
                            <span style={{marginLeft:6,background:"#eff6ff",
                                color:"#3b82f6",padding:"1px 5px",borderRadius:3,
                                fontSize:10}}>📐 Drawings</span>
                          )}
                        </div>
                      </div>
                      {job.quotes[0] && (
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:14,fontWeight:800,color:"#059669"}}>
                            ${fmt(job.quotes[0].grand_total)}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end",marginTop:4}}>
                            <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,
                              background:job.quotes[0].status==="Accepted"?"#dcfce7":job.quotes[0].status==="Superseded"?"#f1f5f9":"#fef3c7",
                              color:job.quotes[0].status==="Accepted"?"#059669":job.quotes[0].status==="Superseded"?"#94a3b8":"#d97706",
                              fontWeight:700}}>
                              {job.quotes[0].status||"Draft"}
                            </span>
                            {job.quotes[0].status!=="Accepted" && job.quotes[0].status!=="Superseded" && (
                              <button onClick={async(e)=>{
                                e.stopPropagation();
                                if(!window.confirm("Mark this quote as Accepted? This will mark all other versions as Superseded.")) return;
                                // Mark all other quotes for this customer as Superseded
                                const allProjectIds = activeGroup.jobs.map(j=>j.id);
                                for(const pid of allProjectIds){
                                  if(pid!==job.id){
                                    const otherQ = activeGroup.jobs.find(j=>j.id===pid)?.quotes[0];
                                    if(otherQ) await supabase.from("quotes").update({status:"Superseded"}).eq("id",otherQ.id);
                                    await supabase.from("projects").update({pipeline_status:"Superseded"}).eq("id",pid);
                                  }
                                }
                                // Accept this quote
                                await supabase.from("quotes").update({status:"Accepted"}).eq("id",job.quotes[0].id);
                                await supabase.from("projects").update({pipeline_status:"Accepted"}).eq("id",job.id);
                                load();
                              }} style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#059669",color:"#fff",border:"none",cursor:"pointer",fontWeight:700}}>
                                ✓ Accept
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* actions */}
                  <div style={{display:"flex",gap:6,padding:"10px 14px",flexWrap:"wrap"}}>
                    <button onClick={()=>navigate(`/field-report/${job.id}`)}
                      style={{flex:1,minWidth:70,border:"none",background:"#3b82f6",
                        color:"white",padding:"8px 0",borderRadius:8,
                        cursor:"pointer",fontSize:12,fontWeight:700}}>
                      📋 Office
                    </button>
                    <button onClick={()=>navigate(`/quote-pricing/${job.id}`)}
                      style={{flex:1,minWidth:70,border:"none",background:"#f97316",
                        color:"white",padding:"8px 0",borderRadius:8,
                        cursor:"pointer",fontSize:12,fontWeight:700}}>
                      📄 Quote
                    </button>
                    <button onClick={()=>{
                      const status = job.pipeline_status||"Draft";
                      if(["Sent to Office","Quote Ready","Proposal","Negotiation","Accepted","Job Scheduled","Completed"].includes(status)){
                        if(window.confirm(`This estimate is already "${status}".\n\nClick OK to create a NEW version (recommended) with the current scope copied over, so you can edit the new one.\n\nClick Cancel to abort.`)){
                          duplicateProject(job.id);
                        }
                        // Cancel = do nothing
                      } else {
                        navigate(`/project/${job.id}`);
                      }
                    }}
                      style={{flex:1,minWidth:70,border:"1px solid #e2e8f0",
                        background:"white",color:"#0f172a",padding:"8px 0",
                        borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>
                      ✏️ Edit
                    </button>
                    <button onClick={()=>setOpenCost(openCost===job.id?null:job.id)}
                      style={{flex:1,minWidth:70,border:"1px solid #e2e8f0",
                        background:openCost===job.id?"#f0fdf4":"white",
                        color:"#059669",padding:"8px 0",borderRadius:8,
                        cursor:"pointer",fontSize:12,fontWeight:700}}>
                      💰 Cost
                    </button>
                    <label style={{flex:1,minWidth:70,border:"1px solid #e2e8f0",
                        background:"white",color:"#7c3aed",padding:"8px 0",
                        borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,
                        textAlign:"center",display:"inline-block"}}>
                      📎 PDF
                      <input type="file" accept="application/pdf" style={{display:"none"}}
                        onChange={async e=>{
                          await uploadDocs(e.target.files, job.id);
                          if(["Sent to Office","Quote Ready"].includes(job.pipeline_status||"Draft")){
                            await supabase.from("projects").update({pipeline_status:"Proposal"}).eq("id",job.id);
                            await load();
                          }
                        }} />
                    </label>
                  </div>

                  {/* attached PDFs for this job */}
                  {docs.filter(d=>d.project_id===job.id).length>0 && (
                    <div style={{padding:"0 14px 10px",display:"flex",flexDirection:"column",gap:4}}>
                      {docs.filter(d=>d.project_id===job.id).map(d=>(
                        <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,
                            padding:"6px 10px",background:"#faf5ff",borderRadius:6,
                            border:"1px solid #e9d5ff",fontSize:11}}>
                          <span>📄</span>
                          <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#374151"}}>
                            {d.caption||"Proposal.pdf"}
                          </span>
                          <button onClick={()=>window.open(d.url,"_blank")}
                            style={{border:"none",background:"#7c3aed",color:"white",
                              padding:"3px 10px",borderRadius:5,cursor:"pointer",fontSize:10,fontWeight:700}}>
                            Open
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                    {/* cost breakdown */}
                    {openCost===job.id && job.quotes[0] && (
                      <div style={{margin:"0 14px 10px",padding:"12px",
                          background:"#f0fdf4",borderRadius:8,border:"1px solid #86efac"}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#059669",
                            marginBottom:8,textTransform:"uppercase",letterSpacing:0.4}}>
                          💰 Cost Breakdown (Internal)
                        </div>
                        {/* actual hours — multi role */}
                        <ActualLaborInput
                          jobId={job.id}
                          quote={job.quotes[0]}
                          onSave={updateActualHours}
                        />

                        {[
                          ["Materials",   job.quotes[0].material_cost],
                          ["Overhead",    job.quotes[0].overhead_cost],
                          ["Labor",       job.quotes[0].labor_cost],
                          ["Fuel",        job.quotes[0].fuel_cost],
                          ["Commission",  job.quotes[0].commission_cost],
                        ].map(([label,val],i)=>(
                          <div key={i} style={{display:"flex",justifyContent:"space-between",
                              fontSize:12,color:"#374151",paddingBottom:4,marginBottom:4,
                              borderBottom:"1px dashed #86efac"}}>
                            <span>{label}</span>
                            <span>${Number(val||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                          </div>
                        ))}
                        {(()=>{
                          const q = job.quotes[0];
                          const totalCost = Number(q.material_cost||0)+Number(q.overhead_cost||0)+Number(q.labor_cost||0);
                          const finalPrice = Number(q.final_price||q.grand_total||0);
                          const profit = finalPrice - totalCost;
                          const margin = finalPrice>0?(profit/finalPrice*100).toFixed(1):0;
                          return (
                            <>
                              <div style={{display:"flex",justifyContent:"space-between",
                                  fontSize:12,fontWeight:700,color:"#0f172a",
                                  paddingBottom:4,marginBottom:4,borderBottom:"1px solid #059669"}}>
                                <span>Total Cost</span>
                                <span>${totalCost.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",
                                  fontSize:12,color:"#374151",marginBottom:4}}>
                                <span>Profit ({margin}%)</span>
                                <span style={{color:"#059669"}}>${profit.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",
                                  fontSize:14,fontWeight:800,color:"#0f172a",
                                  paddingTop:4,borderTop:"2px solid #059669"}}>
                                <span>Final Price</span>
                                <span style={{color:"#059669"}}>${finalPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}

                {/* photos section */}
                <div style={{background:"white",borderRadius:12,
                    border:"1px solid #e2e8f0",padding:"14px",
                    boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>
                      📷 Job Photos
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {/* camera */}
                      <label style={{border:"none",background:"#0f172a",color:"white",
                          padding:"6px 12px",borderRadius:8,cursor:"pointer",
                          fontSize:11,fontWeight:700}}>
                        📷 Camera
                        <input type="file" accept="image/*" capture="environment"
                          multiple style={{display:"none"}}
                          onChange={e=>uploadPhotos(e.target.files,
                            activeGroup.jobs[0]?.id)} />
                      </label>
                      {/* gallery */}
                      <label style={{border:"1px solid #e2e8f0",background:"white",
                          color:"#374151",padding:"6px 12px",borderRadius:8,
                          cursor:"pointer",fontSize:11,fontWeight:700}}>
                        🖼 Gallery
                        <input type="file" accept="image/*" multiple
                          style={{display:"none"}}
                          onChange={e=>uploadPhotos(e.target.files,
                            activeGroup.jobs[0]?.id)} />
                      </label>
                    </div>
                  </div>

                  {uploading && (
                    <div style={{textAlign:"center",padding:"12px 0",
                        fontSize:12,color:"#64748b"}}>
                      Uploading photos…
                    </div>
                  )}

                  {/* photo grid */}
                  {photos.filter(p=>
                    activeGroup.jobs.some(j=>j.id===p.project_id)
                  ).length===0 ? (
                    <div style={{textAlign:"center",padding:"20px 0",
                        color:"#94a3b8",fontSize:12}}>
                      No photos yet — tap Camera or Gallery to add
                    </div>
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",
                        gap:6}}>
                      {photos
                        .filter(p=>activeGroup.jobs.some(j=>j.id===p.project_id))
                        .map((ph,i)=>(
                          <div key={ph.id} style={{position:"relative",
                              paddingBottom:"100%",borderRadius:8,overflow:"hidden",
                              background:"#f1f5f9"}}>
                            <img src={ph.url} alt=""
                              style={{position:"absolute",inset:0,width:"100%",
                                height:"100%",objectFit:"cover",cursor:"pointer"}}
                              onClick={()=>window.open(ph.url,"_blank")} />
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* documents section */}
                <div style={{background:"white",borderRadius:12,
                    border:"1px solid #e2e8f0",padding:"14px",marginTop:10,
                    boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>
                      📁 Documents & Drawings
                    </div>
                    <label style={{border:"none",background:"#0f172a",color:"white",
                        padding:"6px 12px",borderRadius:8,cursor:"pointer",
                        fontSize:11,fontWeight:700,display:"inline-block"}}>
                      + Upload
                      <input type="file"
                        accept="application/pdf,image/*,.dwg,.dxf,.doc,.docx"
                        multiple style={{display:"none"}}
                        onChange={e=>uploadDocs(e.target.files, activeGroup.jobs[0]?.id)} />
                    </label>
                  </div>
                  {uploadingDoc && (
                    <div style={{fontSize:12,color:"#64748b",textAlign:"center",padding:"8px 0"}}>
                      Uploading…
                    </div>
                  )}
                  {docs.filter(d=>activeGroup.jobs.some(j=>j.id===d.project_id)).length===0 ? (
                    <div style={{textAlign:"center",padding:"16px 0",
                        color:"#94a3b8",fontSize:12}}>
                      No documents yet — tap Upload to add PDFs or drawings
                    </div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {docs
                        .filter(d=>activeGroup.jobs.some(j=>j.id===d.project_id))
                        .map((d,i)=>(
                          <div key={d.id} style={{display:"flex",alignItems:"center",
                              gap:10,padding:"8px 10px",background:"#f8fafc",
                              borderRadius:8,border:"1px solid #e2e8f0"}}>
                            <span style={{fontSize:18}}>
                              {(d.caption||"").endsWith(".pdf")?"📄":"📎"}
                            </span>
                            <span style={{flex:1,fontSize:12,color:"#374151",
                                overflow:"hidden",textOverflow:"ellipsis",
                                whiteSpace:"nowrap"}}>
                              {d.caption||"Document"}
                            </span>
                            <button onClick={()=>window.open(d.url,"_blank")}
                              style={{border:"none",background:"#eff6ff",color:"#3b82f6",
                                padding:"4px 10px",borderRadius:6,cursor:"pointer",
                                fontSize:11,fontWeight:700,flexShrink:0}}>
                              Open
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
