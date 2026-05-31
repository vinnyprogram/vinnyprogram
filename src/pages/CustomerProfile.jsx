import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0});
}
function fmtDate(d) {
  return new Date(d||Date.now()).toLocaleDateString("en-US",
    {month:"short",day:"numeric",year:"numeric"});
}

export default function CustomerProfile() {
  const { customerId } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer]   = useState(null);
  const [projects, setProjects]   = useState([]);
  const [photos, setPhotos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const fileInputRef = useRef();

  useEffect(()=>{ load(); },[customerId]);

  async function load() {
    setLoading(true);

    // customer
    const { data:cust } = await supabase.from("customers")
      .select("*").eq("id", Number(customerId)).single();
    setCustomer(cust);

    // projects with quotes
    const { data:projs } = await supabase.from("projects")
      .select("*").eq("lead_id", Number(customerId))
      .order("created_at", { ascending:false });

    if(projs?.length) {
      const ids = projs.map(p=>p.id);
      const { data:quotes } = await supabase.from("quotes")
        .select("*").in("project_id", ids)
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
      if(Object.keys(addrMap).length>0 && !activeJob){
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

    setLoading(false);
  }

  async function uploadPhotos(files, projectId) {
    if(!files?.length) return;
    setUploading(true);
    const { data:{ user } } = await supabase.auth.getUser();
    const { data:cd } = await supabase.from("companies")
      .select("id").eq("user_id", user.id).maybeSingle();
    const companyId = cd?.id||null;

    for(const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const path = `${companyId}/${projectId}/${Date.now()}.${ext}`;
      const { error:upErr } = await supabase.storage
        .from("job-photos").upload(path, file);
      if(upErr){ console.error(upErr); continue; }
      const { data:urlData } = supabase.storage
        .from("job-photos").getPublicUrl(path);
      await supabase.from("job_photos").insert([{
        project_id: projectId,
        url: urlData.publicUrl,
        company_id: companyId,
      }]);
    }
    await load();
    setUploading(false);
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
        <div style={{flex:1}}>
          <div style={{color:"white",fontWeight:800,fontSize:16}}>{customer.name}</div>
          <div style={{color:"#94a3b8",fontSize:11,marginTop:1}}>
            {customer.phone}
            {customer.company_name && ` · ${customer.company_name}`}
            {customer.email && ` · ${customer.email}`}
          </div>
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
                        <div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>
                          {ji===0 && <span style={{color:"#059669",marginRight:6}}>★ Latest</span>}
                          Estimate {activeGroup.jobs.length - ji}
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
                          <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,
                            background:job.quotes[0].status==="Accepted"?"#dcfce7":"#f1f5f9",
                            color:job.quotes[0].status==="Accepted"?"#059669":"#64748b",
                            fontWeight:700}}>
                            {job.quotes[0].status||"Draft"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* actions */}
                    <div style={{display:"flex",gap:6,padding:"10px 14px",flexWrap:"wrap"}}>
                      <button onClick={()=>navigate(`/field-report/${job.id}`)}
                        style={{flex:1,minWidth:80,border:"none",background:"#3b82f6",
                          color:"white",padding:"8px 0",borderRadius:8,
                          cursor:"pointer",fontSize:12,fontWeight:700}}>
                        📋 Office
                      </button>
                      <button onClick={()=>navigate(`/quote/${job.id}`)}
                        style={{flex:1,minWidth:80,border:"none",background:"#f97316",
                          color:"white",padding:"8px 0",borderRadius:8,
                          cursor:"pointer",fontSize:12,fontWeight:700}}>
                        📄 Quote
                      </button>
                      <button onClick={()=>navigate(`/project/${job.id}`)}
                        style={{flex:1,minWidth:80,border:"1px solid #e2e8f0",
                          background:"white",color:"#0f172a",padding:"8px 0",
                          borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>
                        ✏️ Edit
                      </button>
                    </div>
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
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
