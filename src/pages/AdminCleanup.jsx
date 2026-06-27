import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ackhjqsiwbxupldwjcvj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja2hqcXNpd2J4dXBsZHdqY3ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQzMDEzMCwiZXhwIjoyMDk1MDA2MTMwfQ.2eGZt9FMF8TW-Q5NfSaNxZ2434t0yhzTn-tn-JvZXmM"
);

const DELETE_ADDRESSES = ["19 arlington", "23 middle"];

export default function AdminCleanup2() {
  const [logs, setLogs] = useState([]);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);

  const addLog = (msg, type = "info") => setLogs(p => [...p, { msg, type }]);

  async function run() {
    setRunning(true);
    setLogs([]);

    const { data: customers } = await supabase.from("customers").select("id,name,address");
    const toDelete = (customers||[]).filter(c =>
      DELETE_ADDRESSES.some(a => (c.address||"").toLowerCase().includes(a))
    );

    addLog(`Found ${toDelete.length} customer(s) to delete`, "info");

    for (const c of toDelete) {
      addLog(`── ${c.name} | ${c.address}`, "info");
      const { data: projects } = await supabase.from("projects").select("id").eq("lead_id", c.id);
      for (const proj of (projects||[])) {
        const { data: areaRows } = await supabase.from("areas").select("id").eq("project_id", proj.id);
        const areaIds = (areaRows||[]).map(a => a.id);
        if (areaIds.length) {
          await supabase.from("segments").delete().in("area_id", areaIds);
          addLog(`     segments ✓`, "ok");
        }
        for (const t of ["areas","floors","quotes"]) {
          await supabase.from(t).delete().eq("project_id", proj.id);
          addLog(`     ${t} ✓`, "ok");
        }
        await supabase.from("projects").delete().eq("id", proj.id);
        addLog(`     project ✓`, "ok");
      }
      await supabase.from("customers").delete().eq("id", c.id);
      addLog(`   customer deleted ✓`, "ok");
    }

    addLog("✅ DONE", "ok");
    setRunning(false);
    setDone(true);
  }

  return (
    <div style={{ maxWidth: 500, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>🧹 Delete Pesse duplicates</h1>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        Deletes: <strong>19 Arlington Road, Woburn</strong> and <strong>23 Middle Road, Southborough</strong><br/>
        Keeps: 45 Joshua Rd, Wrentham
      </p>
      {!done && <button onClick={run} disabled={running}
        style={{ padding: "12px 28px", background: running?"#94a3b8":"#ef4444", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:700, cursor: running?"not-allowed":"pointer" }}>
        {running ? "⏳ Deleting..." : "🗑️ Delete Both Now"}
      </button>}
      {logs.length > 0 && (
        <div style={{ background:"#0f172a", borderRadius:8, padding:16, fontFamily:"monospace", fontSize:12, maxHeight:300, overflowY:"auto", marginTop:16 }}>
          {logs.map((l,i) => <div key={i} style={{ color: l.type==="ok"?"#4ade80":l.type==="err"?"#f87171":"#94a3b8", marginBottom:2 }}>{l.msg}</div>)}
        </div>
      )}
    </div>
  );
}
