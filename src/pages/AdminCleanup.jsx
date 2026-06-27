import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ackhjqsiwbxupldwjcvj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja2hqcXNpd2J4dXBsZHdqY3ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQzMDEzMCwiZXhwIjoyMDk1MDA2MTMwfQ.2eGZt9FMF8TW-Q5NfSaNxZ2434t0yhzTn-tn-JvZXmM"
);

export default function AdminCleanup() {
  const [logs, setLogs] = useState([]);
  const [preview, setPreview] = useState(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg, type="info") => setLogs(p => [...p, {msg, type}]);

  async function loadPreview() {
    // Find projects by address
    const { data: projects, error } = await supabase
      .from("projects")
      .select("id,name,address,lead_id")
      .or("address.ilike.%arlington%,address.ilike.%middle road%,address.ilike.%southborough%,address.ilike.%woburn%");
    if (error) { alert(error.message); return; }
    setPreview(projects || []);
  }

  async function runDelete() {
    if (!preview?.length) return;
    setRunning(true);
    setLogs([]);

    for (const proj of preview) {
      addLog(`── Project: ${proj.name || proj.id} | ${proj.address}`, "info");

      // segments via areas
      const { data: areaRows } = await supabase.from("areas").select("id").eq("project_id", proj.id);
      const areaIds = (areaRows||[]).map(a => a.id);
      if (areaIds.length) {
        const {error:e} = await supabase.from("segments").delete().in("area_id", areaIds);
        addLog(`  segments: ${e?"✗ "+e.message:"✓"}`, e?"err":"ok");
      }

      for (const t of ["areas","floors","quotes"]) {
        const {error:e} = await supabase.from(t).delete().eq("project_id", proj.id);
        addLog(`  ${t}: ${e?"✗ "+e.message:"✓"}`, e?"err":"ok");
      }

      const {error:ep} = await supabase.from("projects").delete().eq("id", proj.id);
      addLog(`  project: ${ep?"✗ "+ep.message:"✓"}`, ep?"err":"ok");

      // delete customer only if they have no more projects
      const {data:remaining} = await supabase.from("projects").select("id").eq("lead_id", proj.lead_id);
      if (!remaining?.length) {
        const {error:ec} = await supabase.from("customers").delete().eq("id", proj.lead_id);
        addLog(`  customer: ${ec?"✗ "+ec.message:"✓"}`, ec?"err":"ok");
      } else {
        addLog(`  customer kept (has ${remaining.length} other project(s))`, "info");
      }
    }

    addLog("✅ DONE", "ok");
    setRunning(false);
    setDone(true);
  }

  return (
    <div style={{maxWidth:500,margin:"40px auto",padding:24,fontFamily:"system-ui"}}>
      <h1 style={{fontSize:18,fontWeight:800,marginBottom:8}}>🧹 Delete Pesse Duplicates</h1>
      <p style={{fontSize:13,color:"#64748b",marginBottom:20}}>Finds and deletes projects at Arlington Rd (Woburn) and Middle Rd (Southborough).</p>

      {!preview && <button onClick={loadPreview} style={{padding:"12px 24px",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>🔍 Find Projects</button>}

      {preview && !done && (
        <>
          <div style={{background:"#fee2e2",border:"2px solid #fca5a5",borderRadius:10,padding:16,marginBottom:16}}>
            <div style={{fontWeight:700,color:"#ef4444",marginBottom:8}}>🗑️ Will delete {preview.length} project(s):</div>
            {preview.map(p=><div key={p.id} style={{fontSize:13,padding:"4px 0",borderBottom:"1px solid #f1f5f9"}}><strong>{p.name||"(no name)"}</strong> — {p.address}</div>)}
            {preview.length===0 && <div style={{fontSize:13,color:"#64748b"}}>Nothing found — may already be deleted!</div>}
          </div>
          <button onClick={runDelete} disabled={running||preview.length===0}
            style={{padding:"12px 24px",background:running?"#94a3b8":"#ef4444",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:running?"not-allowed":"pointer"}}>
            {running?"⏳ Deleting...":"🗑️ Delete These Projects"}
          </button>
        </>
      )}

      {logs.length>0 && (
        <div style={{background:"#0f172a",borderRadius:8,padding:16,fontFamily:"monospace",fontSize:12,maxHeight:300,overflowY:"auto",marginTop:16}}>
          {logs.map((l,i)=><div key={i} style={{color:l.type==="ok"?"#4ade80":l.type==="err"?"#f87171":"#94a3b8",marginBottom:2}}>{l.msg}</div>)}
        </div>
      )}
    </div>
  );
}
