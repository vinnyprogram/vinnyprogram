import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ackhjqsiwbxupldwjcvj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja2hqcXNpd2J4dXBsZHdqY3ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQzMDEzMCwiZXhwIjoyMDk1MDA2MTMwfQ.2eGZt9FMF8TW-Q5NfSaNxZ2434t0yhzTn-tn-JvZXmM"
);

const KEEP_RULES = [
  { name: "thiago ribeiro", addr: "24 renee" },
  { name: "pesse",          addr: "45 joshua" },
  { name: "hearn",          addr: "790 watertown" },
];

function shouldKeep(lead) {
  const n = (lead.name || "").toLowerCase();
  const a = (lead.address || "").toLowerCase();
  return KEEP_RULES.some(r => n.includes(r.name) || a.includes(r.addr));
}

export default function AdminCleanup() {
  const [leads, setLeads] = useState(null);
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg, type = "info") => setLogs(p => [...p, { msg, type }]);

  async function loadPreview() {
    const { data, error } = await supabase.from("customers").select("id,name,address").order("name");
    if (error) { alert("Error: " + error.message); return; }
    setLeads(data);
  }

  async function runDelete() {
    if (!leads) return;
    const toDelete = leads.filter(l => !shouldKeep(l));
    if (!toDelete.length) { addLog("Nothing to delete.", "ok"); return; }
    setRunning(true);
    setLogs([]);

    for (const lead of toDelete) {
      addLog(`── ${lead.name} | ${lead.address}`, "info");
      const { data: projects } = await supabase.from("projects").select("id,name").eq("lead_id", lead.id);
      addLog(`   ${(projects||[]).length} project(s)`);

      for (const proj of (projects || [])) {
        addLog(`   Project: ${proj.name || proj.id}`);
        const { data: areaRows } = await supabase.from("areas").select("id").eq("project_id", proj.id);
        const areaIds = (areaRows || []).map(a => a.id);

        if (areaIds.length) {
          const { error: e1 } = await supabase.from("segments").delete().in("area_id", areaIds);
          addLog(`     segments: ${e1 ? "✗ "+e1.message : "✓"}`, e1 ? "err" : "ok");
        }

        for (const t of ["areas","floors","quotes","drawing_areas","hers_measurements","project_documents","project_photos"]) {
          const { error: e } = await supabase.from(t).delete().eq("project_id", proj.id);
          addLog(`     ${t}: ${e ? "✗ "+e.message : "✓"}`, e ? "err" : "ok");
        }

        const { error: ep } = await supabase.from("projects").delete().eq("id", proj.id);
        addLog(`     project: ${ep ? "✗ "+ep.message : "✓"}`, ep ? "err" : "ok");
      }

      // delete activities tied to this customer
      const { error: ea } = await supabase.from("activities").delete().eq("customer_id", lead.id);
      addLog(`   activities: ${ea ? "✗ "+ea.message : "✓"}`, ea ? "err" : "ok");
      const { error: el } = await supabase.from("customers").delete().eq("id", lead.id);
      addLog(`   lead: ${el ? "✗ "+el.message : "✓"}`, el ? "err" : "ok");
    }

    addLog("✅ CLEANUP COMPLETE", "ok");
    setRunning(false);
    setDone(true);
  }

  const toKeep   = leads ? leads.filter(shouldKeep) : [];
  const toDelete = leads ? leads.filter(l => !shouldKeep(l)) : [];

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🧹 Database Cleanup</h1>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Keeps Thiago Ribeiro, Pesse, William A. Hearn — deletes everything else.</p>

      {!leads && (
        <button onClick={loadPreview} style={{ padding: "12px 28px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          🔍 Load Preview
        </button>
      )}

      {leads && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "#dcfce7", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#059669" }}>{toKeep.length}</div>
              <div style={{ fontSize: 12, color: "#059669" }}>KEEPING</div>
            </div>
            <div style={{ background: "#fee2e2", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#ef4444" }}>{toDelete.length}</div>
              <div style={{ fontSize: 12, color: "#ef4444" }}>DELETING</div>
            </div>
          </div>

          <div style={{ background: "#fff", border: "2px solid #86efac", borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: "#059669", marginBottom: 8 }}>✅ KEEPING</div>
            {toKeep.map(l => (
              <div key={l.id} style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                <strong>{l.name}</strong> — <span style={{ color: "#64748b" }}>{l.address}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "#fff", border: "2px solid #fca5a5", borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "#ef4444", marginBottom: 8 }}>🗑️ DELETING</div>
            {toDelete.length === 0
              ? <div style={{ fontSize: 13, color: "#64748b" }}>Nothing to delete</div>
              : toDelete.map(l => (
                <div key={l.id} style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                  <strong>{l.name}</strong> — <span style={{ color: "#64748b" }}>{l.address}</span>
                </div>
              ))
            }
          </div>

          {!done && (
            <button onClick={runDelete} disabled={running || toDelete.length === 0}
              style={{ padding: "12px 28px", background: running ? "#94a3b8" : "#ef4444", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: running ? "not-allowed" : "pointer", marginBottom: 16 }}>
              {running ? "⏳ Deleting..." : "🗑️ Delete Everything Listed Above"}
            </button>
          )}

          {logs.length > 0 && (
            <div style={{ background: "#0f172a", borderRadius: 8, padding: 16, fontFamily: "monospace", fontSize: 12, maxHeight: 350, overflowY: "auto" }}>
              {logs.map((l, i) => (
                <div key={i} style={{ color: l.type === "ok" ? "#4ade80" : l.type === "err" ? "#f87171" : "#94a3b8", marginBottom: 2 }}>
                  {l.msg}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
