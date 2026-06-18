import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const TABS = [
  { key: "active",  label: "Active",   emoji: "🔴" },
  { key: "partial", label: "Partial",  emoji: "🟡" },
  { key: "overdue", label: "Overdue",  emoji: "⚠️" },
  { key: "paid",    label: "Paid",     emoji: "✅" },
];

const STATUS_COLORS = {
  "Unpaid":  { bg:"#fee2e2", text:"#dc2626" },
  "Partial": { bg:"#fff7ed", text:"#f97316" },
  "Paid":    { bg:"#dcfce7", text:"#059669" },
  "Void":    { bg:"#f1f5f9", text:"#64748b" },
  "Overdue": { bg:"#fef3c7", text:"#b45309" },
};

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function isOverdue(inv) {
  if(!inv.due_date) return false;
  if(inv.status === "Paid" || inv.status === "Void") return false;
  return new Date(inv.due_date + "T00:00:00") < new Date();
}

function tabForInvoice(inv) {
  if(inv.status === "Paid") return "paid";
  if(inv.status === "Partial") return "partial";
  if(isOverdue(inv)) return "overdue";
  return "active"; // Unpaid, not overdue
}

export default function HersInvoiceSearch() {
  const navigate = useNavigate();
  const [search, setSearch]   = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [groups, setGroups]   = useState([]);
  const [counts, setCounts]   = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load() {
      const { data:invs } = await supabase
        .from("hers_invoices")
        .select("id,customer_id,address,status,grand_total,amount_paid,due_date,created_at,payments")
        .neq("status", "Void")
        .order("created_at", { ascending:false });

      if(!invs){ setLoading(false); return; }

      const custIds = [...new Set(invs.map(i=>i.customer_id).filter(Boolean))];
      const { data:customers } = await supabase
        .from("customers")
        .select("id,name,phone,company_name")
        .in("id", custIds.length ? custIds : ["00000000-0000-0000-0000-000000000000"]);

      const custMap = {};
      (customers||[]).forEach(c=>{ custMap[c.id]=c; });

      // Compute balance from payments ledger if available
      function balance(inv) {
        const pmts = Array.isArray(inv.payments) ? inv.payments
          : (typeof inv.payments === "string" ? JSON.parse(inv.payments||"[]") : []);
        const paid = pmts.reduce((s,p)=>s+(Number(p.amount)||0), 0) || Number(inv.amount_paid||0);
        return Math.max(0, Math.round((Number(inv.grand_total||0)-paid)*100)/100);
      }

      // Attach computed tab and balance
      const enriched = invs.map(inv=>({ ...inv, _tab: tabForInvoice(inv), _balance: balance(inv) }));

      // Count per tab
      const c = { active:0, partial:0, overdue:0, paid:0 };
      enriched.forEach(inv=>{ if(c[inv._tab]!==undefined) c[inv._tab]++; });
      setCounts(c);

      // Group by customer
      const custGroups = {};
      enriched.forEach(inv=>{
        const cid = inv.customer_id||"unknown";
        if(!custGroups[cid]) custGroups[cid] = { customer: custMap[inv.customer_id]||null, invoices:[] };
        custGroups[cid].invoices.push(inv);
      });

      setGroups(Object.values(custGroups).sort((a,b)=>
        new Date(b.invoices[0]?.created_at||0)-new Date(a.invoices[0]?.created_at||0)
      ));
      setLoading(false);
    }
    load();
  },[]);

  // Filter by active tab then search
  const visibleGroups = groups
    .map(g=>({
      ...g,
      invoices: g.invoices.filter(inv=>inv._tab===activeTab),
    }))
    .filter(g=>{
      if(!g.invoices.length) return false;
      if(!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        (g.customer?.name||"").toLowerCase().includes(s) ||
        (g.customer?.phone||"").includes(s) ||
        (g.customer?.company_name||"").toLowerCase().includes(s) ||
        g.invoices.some(inv=>(inv.address||"").toLowerCase().includes(s))
      );
    });

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"system-ui",color:"#64748b"}}>Loading…</div>
  );

  return (
    <div style={{background:"#f6f7fb",minHeight:"100vh",fontFamily:"Inter,system-ui,sans-serif"}}>

      {/* sticky header + tabs */}
      <div style={{position:"sticky",top:0,zIndex:100,background:"white",
          borderBottom:"1px solid #e2e8f0",boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
        <div style={{maxWidth:700,margin:"0 auto",padding:"12px 14px 0"}}>
          <h2 style={{margin:"0 0 10px",fontSize:17,fontWeight:700}}>🧾 HERS Invoices</h2>
          <input placeholder="Search by customer, phone, company, or address…"
            value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:"100%",height:36,borderRadius:8,border:"1px solid #e2e8f0",
              padding:"0 12px",fontSize:13,marginBottom:10,boxSizing:"border-box"}} />

          {/* tabs */}
          <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:0}}>
            {TABS.map(tab=>{
              const active = activeTab===tab.key;
              const count = counts[tab.key]||0;
              const colors = {
                active:  { sel:"#dc2626", bg:"#fee2e2" },
                partial: { sel:"#f97316", bg:"#fff7ed" },
                overdue: { sel:"#b45309", bg:"#fef3c7" },
                paid:    { sel:"#059669", bg:"#dcfce7" },
              }[tab.key];
              return (
                <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
                  style={{
                    border: active ? `2px solid ${colors.sel}` : "2px solid transparent",
                    background: active ? colors.bg : "#f8fafc",
                    color: active ? colors.sel : "#64748b",
                    borderRadius:"8px 8px 0 0",
                    padding:"6px 14px",
                    fontSize:12,fontWeight:700,cursor:"pointer",
                    whiteSpace:"nowrap",flexShrink:0,
                    borderBottom: active ? `2px solid white` : "2px solid transparent",
                    marginBottom:-2,
                  }}>
                  {tab.emoji} {tab.label}
                  {count>0 && (
                    <span style={{
                      marginLeft:6,background:active?colors.sel:"#cbd5e1",color:active?"white":"#475569",
                      borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:800,
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* content */}
      <div style={{maxWidth:700,margin:"0 auto",padding:"14px 14px"}}>

        {visibleGroups.length===0 && (
          <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"48px 0"}}>
            {groups.length===0
              ? "No invoices yet."
              : `No ${TABS.find(t=>t.key===activeTab)?.label.toLowerCase()} invoices${search?" matching your search":""}.`}
          </div>
        )}

        {visibleGroups.map((g,gi)=>(
          <div key={gi} style={{background:"white",borderRadius:10,marginBottom:14,
              boxShadow:"0 2px 8px rgba(0,0,0,.04)",overflow:"hidden"}}>

            {/* customer header */}
            <div style={{padding:"10px 14px",background:"#f8fafc",borderBottom:"1px solid #f1f5f9"}}>
              <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{g.customer?.name||"Unknown"}</div>
              {g.customer?.company_name && <div style={{fontSize:12,color:"#64748b"}}>{g.customer.company_name}</div>}
              {g.customer?.phone && (
                <a href={`tel:${(g.customer.phone||"").replace(/\D/g,"")}`}
                  style={{fontSize:12,color:"#3b82f6",textDecoration:"none"}}>
                  📞 {g.customer.phone}
                </a>
              )}
            </div>

            {/* invoices in this tab */}
            {g.invoices.map((inv,ii)=>{
              const overdue = isOverdue(inv);
              const displayStatus = overdue && inv.status!=="Paid" ? "Overdue" : (inv.status||"Unpaid");
              const sc = STATUS_COLORS[displayStatus]||STATUS_COLORS.Unpaid;
              return (
                <div key={inv.id} style={{padding:"10px 14px",
                    borderBottom:ii<g.invoices.length-1?"1px solid #f1f5f9":"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,fontWeight:700,
                          background:sc.bg,color:sc.text}}>
                        {displayStatus}
                      </span>
                      {overdue && inv.due_date && (
                        <span style={{fontSize:10,color:"#b45309",marginLeft:6}}>
                          Due {new Date(inv.due_date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                        </span>
                      )}
                      {inv.address && (
                        <div style={{fontSize:13,fontWeight:700,color:"#0f172a",marginTop:4}}>
                          📍 {inv.address}
                        </div>
                      )}
                      <div style={{fontSize:11,color:"#94a3b8",marginTop:2,display:"flex",gap:8}}>
                        <span>{new Date(inv.created_at).toLocaleDateString("en-US",
                          {month:"short",day:"numeric",year:"numeric"})}</span>
                        {inv.due_date && !overdue && (
                          <span>· Due {new Date(inv.due_date+"T00:00:00").toLocaleDateString("en-US",
                            {month:"short",day:"numeric"})}</span>
                        )}
                      </div>
                    </div>
                    <div style={{textAlign:"right",whiteSpace:"nowrap"}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#0f172a"}}>${fmt(inv.grand_total)}</div>
                      {inv._balance>0 && inv.status!=="Paid" && (
                        <div style={{fontSize:11,color:"#dc2626",fontWeight:700}}>${fmt(inv._balance)} due</div>
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
    </div>
  );
}
