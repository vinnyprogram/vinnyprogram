import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const C = { ink:"#0f172a", muted:"#64748b", faint:"#94a3b8", border:"#e2e8f0", green:"#059669" };
const CARD = { background:"#fff", borderRadius:12, padding:14, marginBottom:10,
  boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}`, cursor:"pointer" };
const BtnD = { border:"none", background:C.green, color:"#fff",
  padding:"9px 16px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 };

export default function LoadCalcSearch(){
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(()=>{
    (async()=>{
      const { data:jobData } = await supabase.from("load_calc_jobs").select("*").order("updated_at",{ascending:false});
      setJobs(jobData||[]);
      const ids = [...new Set((jobData||[]).map(j=>j.customer_id).filter(Boolean))];
      if(ids.length){
        const { data:custData } = await supabase.from("customers").select("id,name").in("id",ids);
        const map = {};
        (custData||[]).forEach(c=>{ map[c.id]=c.name; });
        setCustomers(map);
      }
      setLoading(false);
    })();
  },[]);

  const filtered = jobs.filter(j=>{
    const s = search.trim().toLowerCase();
    if(!s) return true;
    return (j.address||"").toLowerCase().includes(s) || (customers[j.customer_id]||"").toLowerCase().includes(s);
  });

  return (
    <div style={{padding:"20px 16px",maxWidth:800,margin:"0 auto",fontFamily:"system-ui,sans-serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:800,color:C.ink}}>🌡️ Load Calc</div>
        <button onClick={()=>navigate("/load-calc/new")} style={BtnD}>+ New Load Calc</button>
      </div>
      <input placeholder="Search by customer or address…" value={search} onChange={e=>setSearch(e.target.value)}
        style={{width:"100%",padding:12,borderRadius:10,border:`1px solid ${C.border}`,fontSize:14,marginBottom:14,boxSizing:"border-box"}} />

      {loading ? (
        <div style={{textAlign:"center",color:C.faint,padding:30}}>Loading…</div>
      ) : filtered.length===0 ? (
        <div style={{textAlign:"center",color:C.faint,padding:30}}>
          {search.trim() ? "No jobs match that search." : "No Load Calc jobs yet — click + New Load Calc to start one."}
        </div>
      ) : filtered.map(j=>(
        <div key={j.id} style={CARD} onClick={()=>navigate(`/load-calc/${j.id}`)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:C.ink}}>{customers[j.customer_id]||"(no customer)"}</div>
              <div style={{fontSize:12,color:C.muted}}>{j.address||"(no address)"}</div>
              {j.hvac_contractor_name && <div style={{fontSize:11,color:C.faint}}>For: {j.hvac_contractor_name}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              {j.results?.tons>0 && <div style={{fontSize:13,fontWeight:700,color:C.green}}>{j.results.tons} tons</div>}
              <div style={{fontSize:11,color:C.faint}}>{j.status}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
