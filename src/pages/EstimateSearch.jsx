import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function EstimateSearch() {
  const navigate = useNavigate();
  const [search, setSearch]     = useState("");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(()=>{
    async function load() {
      const { data:projs } = await supabase
        .from("projects")
        .select("id, name, address, created_at, lead_id, status")
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
        .select("project_id, grand_total, status, created_at")
        .order("created_at", { ascending:false });

      const quoteMap = {};
      (quotes||[]).forEach(q=>{ if(!quoteMap[q.project_id]) quoteMap[q.project_id]=q; });

      setProjects(projs.map(p=>({
        ...p,
        customer: custMap[p.lead_id]||null,
        quote: quoteMap[p.id]||null,
      })));
      setLoading(false);
    }
    load();
  },[]);

  const filtered = projects.filter(p=>{
    if(!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (p.name||"").toLowerCase().includes(s) ||
      (p.address||"").toLowerCase().includes(s) ||
      (p.customer?.name||"").toLowerCase().includes(s) ||
      (p.customer?.phone||"").includes(s) ||
      (p.customer?.company_name||"").toLowerCase().includes(s)
    );
  });

  return (
    <div style={{padding:20,background:"#f6f7fb",minHeight:"100vh",
        fontFamily:"Inter,system-ui,sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>navigate("/crm")}
          style={{border:"1px solid #e2e8f0",background:"white",
            padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:13}}>
          ← CRM
        </button>
        <h2 style={{margin:0,fontSize:18,fontWeight:700}}>Estimates</h2>
        <button onClick={()=>navigate("/project/new?type=onsite")}
          style={{marginLeft:"auto",border:"none",background:"#0f172a",
            color:"white",padding:"8px 16px",borderRadius:8,
            cursor:"pointer",fontSize:13,fontWeight:700}}>
          + New Estimate
        </button>
      </div>

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
      ) : filtered.map(p=>(
        <div key={p.id} style={{background:"white",borderRadius:12,
            padding:"14px 16px",marginBottom:10,
            border:"1px solid #e2e8f0",
            boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",marginBottom:6}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>
                {p.customer?.name||p.name||"Unknown"}
              </div>
              {p.customer?.company_name && (
                <div style={{fontSize:12,color:"#64748b"}}>{p.customer.company_name}</div>
              )}
              {p.address && (
                <div style={{fontSize:12,color:"#64748b",marginTop:1}}>📍 {p.address}</div>
              )}
              <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
                {new Date(p.created_at).toLocaleDateString("en-US",
                  {month:"short",day:"numeric",year:"numeric"})}
              </div>
            </div>
            {p.quote && (
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#059669"}}>
                  ${Number(p.quote.grand_total||0).toLocaleString("en-US",
                    {maximumFractionDigits:0})}
                </div>
                <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,
                  background:p.quote.status==="Accepted"?"#dcfce7":"#f1f5f9",
                  color:p.quote.status==="Accepted"?"#059669":"#64748b",
                  fontWeight:700}}>
                  {p.quote.status||"Draft"}
                </span>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={()=>navigate(`/field-report/${p.id}`)}
              style={{flex:1,border:"none",background:"#3b82f6",color:"white",
                padding:"8px 0",borderRadius:8,cursor:"pointer",
                fontSize:12,fontWeight:700}}>
              📋 Office Report
            </button>
            <button onClick={()=>navigate(`/quote/${p.id}`)}
              style={{flex:1,border:"none",background:"#f97316",color:"white",
                padding:"8px 0",borderRadius:8,cursor:"pointer",
                fontSize:12,fontWeight:700}}>
              📄 Quote PDF
            </button>
            <button onClick={()=>navigate(`/project/new?leadId=${p.lead_id}`)}
              style={{flex:1,border:"1px solid #e2e8f0",background:"white",
                color:"#3b82f6",padding:"8px 0",borderRadius:8,
                cursor:"pointer",fontSize:12,fontWeight:700}}>
              + New Version
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}