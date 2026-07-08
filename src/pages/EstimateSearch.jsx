import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const PIPELINE_STAGES = ["Draft","Measured","Sent to Office","Quote Ready","Proposal","Negotiation","Accepted","Job Scheduled","Completed"];
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
const CHECKLIST_ITEMS = [
  { key:"materials_ordered", label:"Materials ordered" },
  { key:"rough_in_complete", label:"Rough-in complete" },
  { key:"inspection_passed", label:"Inspection passed" },
  { key:"finish_complete",   label:"Final/finish complete" },
  { key:"walkthrough_done",  label:"Customer walkthrough done" },
];

export default function EstimateSearch() {
  const navigate = useNavigate();
  const [search, setSearch]     = useState("");
  const [openCost, setOpenCost] = useState(null);
  const [drafts, setDrafts]     = useState([]);

  // Load all drafts from localStorage, clean up duplicates and edit-mode leftovers
  useEffect(()=>{
    const found = [];
    const keysToDelete = [];
    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key?.startsWith("draft_estimate_")||key?.startsWith("insulation_draft_")){
        try {
          const d = JSON.parse(localStorage.getItem(key));
          // Edit-mode drafts (editingProjectId set) are just unsaved edits to
          // existing projects — they're not new jobs and shouldn't show as
          // separate draft entries alongside the real saved project.
          if(d && d.editingProjectId){ keysToDelete.push(key); continue; }
          if(d) found.push({...d, key});
        } catch(e) { keysToDelete.push(key); }
      }
    }
    // delete bad/corrupt drafts and edit-mode leftovers
    keysToDelete.forEach(k=>localStorage.removeItem(k));
    // deduplicate by leadId — keep newest per customer
    const seen = {};
    const deduped = [];
    found.sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt));
    found.forEach(d=>{
      const id = d.selectedLeadId||"anon";
      if(!seen[id]){ seen[id]=true; deduped.push(d); }
      else { localStorage.removeItem(d.key); } // remove older duplicate
    });
    setDrafts(deduped);
  },[]);

  async function updatePipelineStatus(projectId, status) {
    await supabase.from("projects").update({pipeline_status:status}).eq("id",projectId);
    setGroups(prev=>prev.map(g=>({
      ...g,
      projects: g.projects.map(p=>p.id===projectId?{...p,pipeline_status:status}:p)
    })));
  }

  function discardDraft(key) {
    localStorage.removeItem(key);
    setDrafts(p=>p.filter(d=>d.key!==key));
  }

  function resumeDraft(draft) {
    if(draft.editingProjectId){
      navigate(`/project/${draft.editingProjectId}?resume=1`);
    } else if(draft.selectedLeadId){
      navigate(`/project/new?leadId=${draft.selectedLeadId}&address=${encodeURIComponent(draft.projectAddress||"")}&resume=1`);
    } else {
      navigate("/project/new");
    }
  }
  // project id with cost panel open
  const [groups, setGroups]     = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(()=>{
    async function load() {
      const { data:projs } = await supabase
        .from("projects")
        .select("id, name, address, created_at, lead_id, status, source, pipeline_status, job_checklist")
        .order("created_at", { ascending:false });

      if(!projs){ setLoading(false); return; }

      const leadIds = [...new Set(projs.map(p=>p.lead_id).filter(Boolean))];
      const { data:customers } = await supabase
        .from("customers")
        .select("id, name, phone, company_name")
        .in("id", leadIds);

      const custMap = {};
      (customers||[]).forEach(c=>{ custMap[c.id]=c; });

      const { data:quotes } = await supabase
        .from("quotes")
        .select("project_id, grand_total, status, created_at, final_price, material_cost, overhead_cost, labor_cost, fuel_cost, commission_cost, commission_pct, profit_margin_pct, job_miles")
        .order("created_at", { ascending:false });

      const quoteMap = {};
      (quotes||[]).forEach(q=>{ if(!quoteMap[q.project_id]) quoteMap[q.project_id]=q; });

      // group by customer
      const custGroups = {};
      projs.forEach(p=>{
        const cid = p.lead_id||"unknown";
        if(!custGroups[cid]) custGroups[cid]={
          customer: custMap[p.lead_id]||null,
          projects: [],
        };
        custGroups[cid].projects.push({...p, quote: quoteMap[p.id]||null});
      });

      // keep only the latest project per address within each customer group
      Object.values(custGroups).forEach(g=>{
        const seenAddr = {};
        g.projects = g.projects.filter(p=>{
          const addr = p.address||"No address";
          if(seenAddr[addr]) return false;
          seenAddr[addr] = true;
          return true; // first occurrence = newest, since projs is already sorted desc
        });
      });

      const sortedGroups = Object.values(custGroups).sort((a,b)=>
        new Date(b.projects[0]?.created_at||0) - new Date(a.projects[0]?.created_at||0)
      );
      setGroups(sortedGroups);
      setLoading(false);
    }
    load();
  },[]);

  const filtered = groups.filter(g=>{
    if(!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (g.customer?.name||"").toLowerCase().includes(s) ||
      (g.customer?.phone||"").includes(s) ||
      (g.customer?.company_name||"").toLowerCase().includes(s) ||
      g.projects.some(p=>(p.address||"").toLowerCase().includes(s))
    );
  });

  return (
    <div style={{padding:"16px 14px",background:"#f6f7fb",minHeight:"100vh",
        fontFamily:"Inter,system-ui,sans-serif",maxWidth:700,margin:"0 auto"}}>

      {/* header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <h2 style={{margin:0,fontSize:18,fontWeight:700}}>Estimates</h2>
        <button onClick={()=>navigate("/project/new?type=onsite")}
          style={{marginLeft:"auto",border:"none",background:"#0f172a",
            color:"white",padding:"8px 16px",borderRadius:8,
            cursor:"pointer",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
          + New
        </button>
      </div>

      {/* drafts section */}
      {drafts.length>0 && (
        <div style={{margin:"12px 14px 0"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#f97316",
              textTransform:"uppercase",letterSpacing:0.4,marginBottom:8,
              display:"flex",alignItems:"center",gap:6}}>
            ⚠️ Drafts on this device
          </div>
          {drafts.map(d=>{
            const age = Math.round((Date.now()-new Date(d.savedAt).getTime())/60000);
            const areaCount = Object.values(d.areas||{}).flat().filter(a=>a.area_type).length;
            const floorList = Object.keys(d.areas||{})
              .filter(f=>(d.areas[f]||[]).some(a=>a.area_type)).join(", ");
            return (
              <div key={d.key} style={{background:"#fff7ed",border:"1px solid #fed7aa",
                  borderLeft:"3px solid #f97316",borderRadius:8,
                  padding:"8px 12px",marginBottom:6,
                  display:"flex",alignItems:"center",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#0f172a",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {d.projectName||"Unnamed"}
                  </div>
                  <div style={{fontSize:11,color:"#64748b",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {d.projectAddress||"No address"} · {age}min ago
                  </div>
                </div>
                <button onClick={()=>resumeDraft(d)}
                  style={{border:"none",background:"#f97316",color:"white",
                    padding:"6px 12px",borderRadius:6,cursor:"pointer",
                    fontSize:12,fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>
                  ▶ Resume
                </button>
                <button onClick={()=>discardDraft(d.key)}
                  style={{border:"none",background:"none",color:"#94a3b8",
                    cursor:"pointer",fontSize:16,padding:"0 2px",flexShrink:0}}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* search */}
      <input
        placeholder="Search by customer, address, company…"
        value={search} onChange={e=>setSearch(e.target.value)}
        style={{width:"100%",padding:"12px 14px",borderRadius:10,
          border:"1.5px solid #e0e5ef",fontSize:14,outline:"none",
          boxSizing:"border-box",marginBottom:16}} />

      {loading ? (
        <div style={{textAlign:"center",color:"#94a3b8",padding:40}}>Loading…</div>
      ) : filtered.length===0 ? (
        <div style={{textAlign:"center",color:"#94a3b8",padding:40}}>No estimates found</div>
      ) : filtered.map((g,gi)=>(
        <div key={gi} style={{background:"white",borderRadius:12,
            marginBottom:12,border:"1px solid #e2e8f0",
            boxShadow:"0 2px 8px rgba(0,0,0,.04)",overflow:"hidden"}}>

          {/* customer header */}
          <div style={{padding:"12px 14px",background:"#f8fafc",
              borderBottom:"1px solid #f1f5f9",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>
                {g.customer?.name||"Unknown"}
              </div>
              {g.customer?.company_name && (
                <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{g.customer.company_name}</div>
              )}
              {g.customer?.phone && (
                <a href={`tel:${g.customer.phone.replace(/\D/g,"")}`}
                  style={{fontWeight:700,fontSize:14,color:"#3b82f6",textDecoration:"none"}}>
                  📞 {g.customer.phone}
                </a>
              )}
            </div>
            <button onClick={()=>navigate(`/customer/${g.customer?.id}`)}
              style={{border:"none",background:"#0f172a",color:"white",
                padding:"6px 12px",borderRadius:6,cursor:"pointer",
                fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
              👤 Profile
            </button>
          </div>

          {/* estimates */}
          {g.projects.map((p,pi)=>(
            <div key={p.id} style={{padding:"10px 14px",
                borderBottom:pi<g.projects.length-1?"1px solid #f1f5f9":"none",
                background:pi===0?"#f0fdf4":"white"}}>
              <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:8}}>
                <div>
                  {pi===0 && (
                    <span style={{fontSize:10,fontWeight:700,color:"#059669",
                        marginRight:6}}>★ Latest</span>
                  )}
                  <span style={{fontSize:11,fontWeight:600,color:"#94a3b8",fontFamily:"monospace"}}>
                    #{p.id.toString().slice(-6).toUpperCase()}
                  </span>
                  <span style={{marginLeft:6,fontSize:10,fontWeight:700,padding:"2px 8px",
                      borderRadius:5,
                      background: PIPELINE_COLORS[p.pipeline_status||"Draft"]?.bg||"#f1f5f9",
                      color: PIPELINE_COLORS[p.pipeline_status||"Draft"]?.text||"#64748b"}}>
                    {p.pipeline_status||"Draft"}
                  </span>
                 {p.address && (
                  <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginTop:2}}>
                    📍 {p.address}
                  </div>
)}
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:1,display:"flex",gap:6}}>
                    {new Date(p.created_at).toLocaleDateString("en-US",
                      {month:"short",day:"numeric",year:"numeric"})}
                    {p.source==="drawings" && (
                      <span style={{background:"#eff6ff",color:"#3b82f6",
                          padding:"1px 5px",borderRadius:3,fontSize:10}}>
                        📐 Drawings
                      </span>
                    )}
                  </div>
                </div>
                {p.quote && (
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#059669"}}>
                      ${Number(p.quote.grand_total||0).toLocaleString("en-US",
                        {maximumFractionDigits:0})}
                    </div>

                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>navigate(`/project/${p.id}`)}
                  style={{flex:1,border:"none",background:"#0f172a",color:"white",
                    padding:"7px 0",borderRadius:6,cursor:"pointer",
                    fontSize:11,fontWeight:700}}>
                  👤 Go to Profile
                </button>
              </div>

              {/* cost breakdown panel */}
              {openCost===p.id && p.quote && (
                <div style={{marginTop:8,padding:"12px 14px",
                    background:"#f0fdf4",borderRadius:8,
                    border:"1px solid #86efac"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#059669",
                      marginBottom:8,textTransform:"uppercase",letterSpacing:0.4}}>
                    💰 Cost Breakdown (Internal)
                  </div>
                  {[
                    ["Materials",  p.quote.material_cost],
                    ["Overhead",   p.quote.overhead_cost],
                    ["Labor",      p.quote.labor_cost],
                    ["Fuel",       p.quote.fuel_cost],
                    ["Commission", p.quote.commission_cost],
                  ].map(([label,val],i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",
                        fontSize:12,color:"#374151",paddingBottom:4,marginBottom:4,
                        borderBottom:"1px dashed #86efac"}}>
                      <span>{label}</span>
                      <span>${Number(val||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                    </div>
                  ))}
                  {(()=>{
                    const totalCost = (Number(p.quote.material_cost||0)+Number(p.quote.overhead_cost||0)+Number(p.quote.labor_cost||0));
                    const finalPrice = Number(p.quote.final_price||p.quote.grand_total||0);
                    const profit = finalPrice - totalCost;
                    const margin = totalCost>0 ? (profit/finalPrice*100).toFixed(1) : 0;
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
                          <span style={{color:"#059669"}}>
                            ${profit.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                          </span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",
                            fontSize:14,fontWeight:800,color:"#0f172a",
                            paddingTop:4,borderTop:"2px solid #059669"}}>
                          <span>Final Price</span>
                          <span style={{color:"#059669"}}>
                            ${finalPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
