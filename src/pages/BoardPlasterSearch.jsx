import { useState, useEffect } from "react";
import { BP_STATUSES, BP_STATUS_COLORS, normalizeBPStatus } from "../lib/bpStatus";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const STATUS_COLORS = BP_STATUS_COLORS;

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function estimateTotal(e){
  const items = Array.isArray(e.line_items) ? e.line_items : [];
  return items.reduce((s,it)=>s+(Number(it.price)||0)*(Number(it.qty)||1),0);
}

export default function BoardPlasterSearch() {
  const navigate = useNavigate();
  const [search, setSearch]   = useState("");
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load() {
      const { data:ests } = await supabase
        .from("board_plaster_estimates")
        .select("id, customer_id, address, status, line_items, created_at")
        .order("created_at", { ascending:false });

      if(!ests){ setLoading(false); return; }

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
  },[]);

  async function updateStatus(estimateId, newStatus) {
    await supabase.from("board_plaster_estimates").update({status:newStatus}).eq("id",estimateId);
    setGroups(prev=>prev.map(g=>({
      ...g,
      estimates: g.estimates.map(e=>e.id===estimateId?{...e,status:newStatus}:e),
    })));
  }

  // New version of an estimate: same customer, address, measurements and line
  // items, saved as a separate estimate (and so a separate document). The
  // original stays exactly as it is. The copy starts at "In Progress".
  const [copying, setCopying] = useState(false);
  async function newVersion(estimateId){
    if(copying) return;
    // Not while the current one is still being worked on: a new version only
    // makes sense once this one has gone out (to the office or the customer).
    const shown = groups.flatMap(g=>g.estimates).find(x=>x.id===estimateId);
    if(shown && normalizeBPStatus(shown.status)==="In Progress"){
      alert("This estimate is still In Progress. Send it to the office or the customer first, then you can create a new version.");
      return;
    }
    if(!window.confirm("Create a new version of this estimate?\n\nIt starts with the same measurements and line items so you can change what is needed. The current version stays as it is.")) return;
    setCopying(true);
    try{
      const { data:orig, error:oe } = await supabase.from("board_plaster_estimates").select("*").eq("id",estimateId).single();
      if(oe||!orig) throw new Error(oe?.message||"Could not load the estimate.");
      // Re-check against the saved status, in case the list on screen is stale.
      if(normalizeBPStatus(orig.status)==="In Progress"){
        alert("This estimate is still In Progress. Send it to the office or the customer first, then you can create a new version.");
        setCopying(false); return;
      }
      const copy = { ...orig, status:"In Progress" };
      delete copy.id; delete copy.created_at; delete copy.updated_at;
      const { data:created, error:ce } = await supabase.from("board_plaster_estimates").insert([copy]).select().single();
      if(ce||!created) throw new Error(ce?.message||"Could not create the new version.");
      navigate(`/board-plaster/${created.id}`);
    }catch(err){
      alert("Error creating new version: "+(err.message||err));
    }finally{ setCopying(false); }
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
        <h2 style={{margin:0,fontSize:18,fontWeight:700}}>🧱 Board &amp; Plaster Estimates</h2>
        <button onClick={()=>navigate("/board-plaster/new")}
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
          {groups.length===0 ? "No Board & Plaster estimates yet." : "No matches."}
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
                background:ei===0?"#f0fdf4":"white"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <select value={normalizeBPStatus(e.status)} onChange={ev=>updateStatus(e.id, ev.target.value)}
                    style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:700,
                      border:"none",cursor:"pointer",
                      background:(STATUS_COLORS[normalizeBPStatus(e.status)]||STATUS_COLORS["In Progress"]).bg,
                      color:(STATUS_COLORS[normalizeBPStatus(e.status)]||STATUS_COLORS["In Progress"]).text}}>
                    {BP_STATUSES.map(st=><option key={st} value={st}>{st}</option>)}
                  </select>
                  {e.address && (
                    <div style={{fontSize:14,fontWeight:700,color:"#0f172a",marginTop:4}}>
                      📍 {e.address}
                    </div>
                  )}
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
                    {new Date(e.created_at).toLocaleDateString("en-US",
                      {month:"short",day:"numeric",year:"numeric"})}
                  </div>
                </div>
                <div style={{fontSize:14,fontWeight:700,color:"#059669",whiteSpace:"nowrap"}}>
                  ${fmt(estimateTotal(e))}
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>navigate(`/board-plaster/${e.id}`)}
                  style={{flex:1,border:"1px solid #e2e8f0",background:"white",
                    color:"#0f172a",padding:"7px 0",borderRadius:7,
                    cursor:"pointer",fontSize:12,fontWeight:700}}>
                  ✏️ Open
                </button>
                {(()=>{ const inProg = normalizeBPStatus(e.status)==="In Progress"; return (
                <button onClick={()=>newVersion(e.id)} disabled={copying}
                  title={inProg?"Send it to the office or the customer first":"Create a new version"}
                  style={{flex:1,border:"1px solid "+(inProg?"#e2e8f0":"#bfdbfe"),background:inProg?"#f8fafc":"#eff6ff",
                    color:inProg?"#94a3b8":"#1d4ed8",padding:"7px 0",borderRadius:7,
                    cursor:inProg?"not-allowed":"pointer",fontSize:12,fontWeight:700}}>
                  ＋ New version
                </button>); })()}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
