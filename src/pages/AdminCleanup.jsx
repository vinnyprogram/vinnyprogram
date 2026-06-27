import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ackhjqsiwbxupldwjcvj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja2hqcXNpd2J4dXBsZHdqY3ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQzMDEzMCwiZXhwIjoyMDk1MDA2MTMwfQ.2eGZt9FMF8TW-Q5NfSaNxZ2434t0yhzTn-tn-JvZXmM"
);

export default function AdminCleanup() {
  const [customers, setCustomers] = useState(null);

  async function load() {
    const { data, error } = await supabase.from("customers").select("id,name,address,phone").order("name");
    if (error) { alert(error.message); return; }
    setCustomers(data);
  }

  return (
    <div style={{maxWidth:600,margin:"40px auto",padding:24,fontFamily:"system-ui"}}>
      <h1 style={{fontSize:18,fontWeight:800,marginBottom:16}}>All Customers in DB</h1>
      <button onClick={load} style={{padding:"10px 24px",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:16}}>Load All</button>
      {customers && customers.map(c => (
        <div key={c.id} style={{padding:"10px 0",borderBottom:"1px solid #e2e8f0",fontSize:13}}>
          <strong>{c.name}</strong> — {c.address} — {c.phone}<br/>
          <span style={{fontSize:11,color:"#94a3b8"}}>id: {c.id}</span>
        </div>
      ))}
      {customers && customers.length === 0 && <div>No customers found</div>}
    </div>
  );
}
