import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const STATUS_COLORS = {
  "Unpaid":  { bg:"#fee2e2", text:"#dc2626" },
  "Partial": { bg:"#fff7ed", text:"#f97316" },
  "Paid":    { bg:"#dcfce7", text:"#059669" },
  "Void":    { bg:"#f1f5f9", text:"#64748b" },
};

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}

export default function HersInvoiceSearch() {
  const navigate = useNavigate();
  const [search, setSearch]   = useState("");
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load() {
      const { data:invs } = await supabase
        .from("hers_invoices")
        .select("id, customer_id, address, status, grand_total, amount_paid, due_date, created_at")
        .order("created_at", { ascending:false });

      if(!invs){ setLoading(false); return; }

      const custIds = [...new Set(invs.map(i=>i.customer_id).filter(Boolean))];
      const { data:customers } = await supabase
        .from("customers")
        .select("id, name, phone, company_name")
        .in("id", custIds.length ? custIds : [-1]);

      const custMap = {};
      (customers||[]).forEach(c=>{ custMap[c.id]=c; });

      // group by customer
      const custGroups = {};
      invs.forEach(i=>{
        const cid = i.customer_id||"unknown";
        if(!custGroups[cid]) custGroups[cid] = {
          customer: custMap[i.customer_id]||null,
          invoices: [],
        };
        custGroups[cid].invoices.push(i);
      });

      const sortedGroups = Object.values(custGroups).sort((a,b)=>
        new Date(b.invoices[0]?.created_at||0) - new Date(a.invoices[0]?.created_at||0)
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
      g.invoices.some(i=>(i.address||"").toLowerCase().includes(s))
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

      {/* header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <h2 style={{margin:0,fontSize:18,fontWeight:700}}>🧾 HERS Invoices</h2>
      </div>

      <input placeholder="Search by customer, phone, company, or address…"
        value={search} onChange={e=>setSearch(e.target.value)}
        style={{width:"100%",height:38,borderRadius:8,border:"1px solid #e2e8f0",
          padding:"0 12px",fontSize:13,marginBottom:16,boxSizing:"border-box"}} />

      {filtered.length===0 && (
        <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"40px 0"}}>
          {groups.length===0
            ? "No invoices yet — invoices are created from the \"💵 Invoice\" button on an existing estimate."
            : "No matches."}
        </div>
      )}

      {filtered.map((g,gi)=>(
        <div key={gi} style={{background:"white",borderRadius:10,marginBottom:14,
            boxShadow:"0 2px 8px rgba(0,0,0,.04)",overflow:"hidden"}}>

          {/* customer header */}
          <div style={{padding:"12px 14px",background:"#f8fafc",borderBottom:"1px solid #f1f5f9"}}>
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

          {/* invoices */}
          {g.invoices.map((inv,ii)=>{
            const balance = Math.max(0, Math.round((Number(inv.grand_total||0)-Number(inv.amount_paid||0))*100)/100);
            const status = inv.status||"Unpaid";
            return (
              <div key={inv.id} style={{padding:"10px 14px",
                  borderBottom:ii<g.invoices.length-1?"1px solid #f1f5f9":"none",
                  background:ii===0?"#f0fdf4":"white"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:700,
                        background:(STATUS_COLORS[status]||STATUS_COLORS.Unpaid).bg,
                        color:(STATUS_COLORS[status]||STATUS_COLORS.Unpaid).text}}>
                      {status}
                    </span>
                    {inv.address && (
                      <div style={{fontSize:14,fontWeight:700,color:"#0f172a",marginTop:4}}>
                        📍 {inv.address}
                      </div>
                    )}
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:2,display:"flex",gap:8}}>
                      <span>{new Date(inv.created_at).toLocaleDateString("en-US",
                        {month:"short",day:"numeric",year:"numeric"})}</span>
                      {inv.due_date && (
                        <span>· Due {new Date(inv.due_date+"T00:00:00").toLocaleDateString("en-US",
                          {month:"short",day:"numeric"})}</span>
                      )}
                    </div>
                  </div>
                  <div style={{textAlign:"right",whiteSpace:"nowrap"}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#0f172a"}}>${fmt(inv.grand_total)}</div>
                    {status!=="Paid" && status!=="Void" && balance>0 && (
                      <div style={{fontSize:11,color:"#dc2626",fontWeight:700}}>${fmt(balance)} due</div>
                    )}
                  </div>
                </div>
                <button onClick={()=>navigate(`/hers/invoice/${inv.id}`)}
                  style={{width:"100%",border:"1px solid #e2e8f0",background:"white",
                    color:"#0f172a",padding:"7px 0",borderRadius:7,
                    cursor:"pointer",fontSize:12,fontWeight:700}}>
                  ✏️ Open
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
