import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const STATUS_COLORS = {
  "Draft":    { bg:"#f1f5f9", text:"#64748b" },
  "Sent":     { bg:"#eff6ff", text:"#3b82f6" },
  "Accepted": { bg:"#dcfce7", text:"#059669" },
  "Declined": { bg:"#fee2e2", text:"#dc2626" },
};

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function materialsTotal(materials){
  return (materials||[]).reduce((s,m)=>s+(Number(m.qty)||0)*(Number(m.unit_price)||0),0);
}
function scopeTotal(scopes){
  return (scopes||[]).reduce((s,sc)=>s+(Number(sc.price)||0),0);
}
function estimateTotal(e){
  const areaTotal = (e.areas||[]).reduce((s,a)=>s+materialsTotal(a.materials),0);
  return areaTotal + scopeTotal(e.scopes);
}

export default function GCSearch() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const [search, setSearch]   = useState("");
  const [groups, setGroups]   = useState([]);
  const [employeeMap, setEmployeeMap] = useState({}); // user_id -> name
  const [loading, setLoading] = useState(true);

  function creatorName(createdBy){
    if(!createdBy) return null;
    if(company && createdBy===company.user_id) return "Owner";
    return employeeMap[createdBy] || "Team member";
  }

  useEffect(()=>{
    async function load() {
      const { data:ests } = await supabase
        .from("gc_estimates")
        .select("id, customer_id, address, job_type, status, areas, scopes, created_at, created_by")
        .order("created_at", { ascending:false });

      if(!ests){ setLoading(false); return; }

      if(company?.id){
        const { data:emps } = await supabase.from("company_employees")
          .select("user_id, employee_name").eq("company_id", company.id);
        const map = {};
        (emps||[]).forEach(e=>{ map[e.user_id] = e.employee_name || "Team member"; });
        setEmployeeMap(map);
      }

      const custIds = [...new Set(ests.map(e=>e.customer_id).filter(Boolean))];
      const { data:customers } = await supabase
        .from("customers")
        .select("id, name, phone, company_name")
        .in("id", custIds.length ? custIds : [-1]);

      const custMap = {};
      (customers||[]).forEach(c=>{ custMap[c.id]=c; });

      const custGroups = {};
      ests.forEach(e=>{
        const cid = e.customer_id||"unknown";
        if(!custGroups[cid]) custGroups[cid] = {
          customer: custMap[e.customer_id]||null,
          estimates: [],
        };
        custGroups[cid].estimates.push(e);
      });

      const sortedGroups = Object.values(custGroups).sort((a,b)=>
        new Date(b.estimates[0]?.created_at||0) - new Date(a.estimates[0]?.created_at||0)
      );
      setGroups(sortedGroups);
      setLoading(false);
    }
    load();
  },[company?.id]);

  async function updateStatus(estimateId, newStatus) {
    await supabase.from("gc_estimates").update({status:newStatus}).eq("id",estimateId);
    setGroups(prev=>prev.map(g=>({
      ...g,
      estimates: g.estimates.map(e=>e.id===estimateId?{...e,status:newStatus}:e),
    })));
  }

  const filtered = groups.filter(g=>{
    if(!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (g.customer?.name||"").toLowerCase().includes(s) ||
      (g.customer?.phone||"").includes(s) ||
      (g.customer?.company_name||"").toLowerCase().includes(s) ||
      g.estimates.some(e=>(e.address||"").toLowerCase().includes(s))
    );
  });

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"system-ui",color:"#64748b"}}>
      Loading…
    </div>
  );

  return (
    <div style={{padding:"16px 14px",background:"#f6f7fb",minHeight:"100vh",
        fontFamily:"Inter,system-ui,sans-serif",maxWidth:700,margin:"0 auto"}}>

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button onClick={()=>navigate(-1)}
          style={{border:"1px solid #e2e8f0",background:"white",color:"#64748b",
            padding:"7px 12px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>
          ← Back
        </button>
        <h2 style={{margin:0,fontSize:18,fontWeight:700}}>🏗️ General Contractor Estimates</h2>
        <button onClick={()=>navigate("/gc/new")}
          style={{marginLeft:"auto",border:"none",background:"#0f172a",
            color:"white",padding:"8px 16px",borderRadius:8,
            cursor:"pointer",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
          + New
        </button>
      </div>

      <input placeholder="Search by customer, phone, company, or address…"
        value={search} onChange={e=>setSearch(e.target.value)}
        style={{width:"100%",height:38,borderRadius:8,border:"1px solid #e2e8f0",
          padding:"0 12px",fontSize:13,marginBottom:16,boxSizing:"border-box"}} />

      {filtered.length===0 && (
        <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"40px 0"}}>
          {groups.length===0 ? "No General Contractor estimates yet." : "No matches."}
        </div>
      )}

      {filtered.map((g,gi)=>(
        <div key={gi} style={{background:"white",borderRadius:10,marginBottom:14,
            boxShadow:"0 2px 8px rgba(0,0,0,.04)",overflow:"hidden"}}>

          <div style={{padding:"12px 14px",background:"#f8fafc",borderBottom:"1px solid #f1f5f9",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{g.customer?.name||"Unknown"}</div>
              {g.customer?.company_name && (
                <div style={{fontSize:12,color:"#64748b"}}>{g.customer.company_name}</div>
              )}
              {g.customer?.phone && (
                <a href={`tel:${g.customer.phone.replace(/\D/g,"")}`}
                  style={{fontSize:12,color:"#3b82f6",textDecoration:"none"}}>
                  📞 {g.customer.phone}
                </a>
              )}
            </div>
          </div>

          {g.estimates.map((e,ei)=>(
            <div key={e.id} style={{padding:"10px 14px",
                borderBottom:ei<g.estimates.length-1?"1px solid #f1f5f9":"none",
                background:ei===0?"#fffbeb":"white"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <select value={e.status||"Draft"} onChange={ev=>updateStatus(e.id, ev.target.value)}
                    style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:700,
                      border:"none",cursor:"pointer",
                      background:(STATUS_COLORS[e.status]||STATUS_COLORS.Draft).bg,
                      color:(STATUS_COLORS[e.status]||STATUS_COLORS.Draft).text}}>
                    <option value="Draft">Draft</option>
                    <option value="Sent">Sent</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Declined">Declined</option>
                  </select>
                  {e.job_type && (
                    <span style={{fontSize:10,color:"#b45309",marginLeft:6,fontWeight:700}}>{e.job_type}</span>
                  )}
                  {e.address && (
                    <div style={{fontSize:14,fontWeight:700,color:"#0f172a",marginTop:4}}>
                      📍 {e.address}
                    </div>
                  )}
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
                    {new Date(e.created_at).toLocaleDateString("en-US",
                      {month:"short",day:"numeric",year:"numeric"})}
                    {creatorName(e.created_by) && ` · 👤 ${creatorName(e.created_by)}`}
                  </div>
                </div>
                <div style={{fontSize:14,fontWeight:700,color:"#059669",whiteSpace:"nowrap"}}>
                  ${fmt(estimateTotal(e))}
                </div>
              </div>
              <button onClick={()=>navigate(`/gc/${e.id}`)}
                style={{width:"100%",border:"1px solid #e2e8f0",background:"white",
                  color:"#0f172a",padding:"7px 0",borderRadius:7,
                  cursor:"pointer",fontSize:12,fontWeight:700}}>
                ✏️ Open
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
