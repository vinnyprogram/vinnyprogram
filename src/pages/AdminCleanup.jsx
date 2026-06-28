import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ackhjqsiwbxupldwjcvj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja2hqcXNpd2J4dXBsZHdqY3ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQzMDEzMCwiZXhwIjoyMDk1MDA2MTMwfQ.2eGZt9FMF8TW-Q5NfSaNxZ2434t0yhzTn-tn-JvZXmM"
);

const COMPANY_ID = "ad856d98-d41d-4915-94a9-d1853b65f350";
const TRUCKS = ["Truck01","Truck02","Truck03","Truck04","Truck05","Truck06"];

export default function AdminCleanup() {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState("");

  async function insert() {
    setStatus("running");
    const { data, error } = await supabase.from("trucks").insert(
      TRUCKS.map(name => ({ name, company_id: COMPANY_ID }))
    ).select();
    if (error) { setResult("Error: " + error.message); setStatus("error"); }
    else { setResult("✅ Inserted: " + data.map(t=>t.name).join(", ")); setStatus("done"); }
  }

  return (
    <div style={{maxWidth:400,margin:"60px auto",padding:24,fontFamily:"system-ui",textAlign:"center"}}>
      <h2 style={{marginBottom:16}}>Insert Trucks</h2>
      <p style={{fontSize:13,color:"#64748b",marginBottom:20}}>Will insert Truck01–Truck06 for your company.</p>
      <button onClick={insert} disabled={status!=="idle"}
        style={{padding:"12px 28px",background:status==="done"?"#059669":status==="error"?"#ef4444":"#1d4ed8",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>
        {status==="idle"?"Insert Trucks":status==="running"?"Inserting...":status==="done"?"✅ Done":"❌ Error"}
      </button>
      {result && <p style={{marginTop:16,fontSize:13,color:"#334155"}}>{result}</p>}
    </div>
  );
}
