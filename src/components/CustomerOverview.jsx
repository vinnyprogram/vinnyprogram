import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// "All work for this customer": one place that shows every trade's jobs for a
// customer, plus notes, in a single timeline. Each company only sees the trades
// it uses (Settings), plus any trade this customer already has records in.

const TRADES = {
  ins:  { label: "Insulation",      bg: "#fff1de", fg: "#8a4300" },
  hers: { label: "HERS",            bg: "#dff5e9", fg: "#0a6240" },
  bp:   { label: "Board & Plaster", bg: "#e3edfd", fg: "#1b479c" },
  gc:   { label: "General Contracting", bg: "#f0eafd", fg: "#5b34b0" },
  note: { label: "Note",            bg: "#e2e8f0", fg: "#334155" },
};

const money = n => (n || n === 0) && Number(n) > 0
  ? "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "";
const when = d => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  const days = Math.floor((Date.now() - dt.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function CustomerOverview({ customerId, onNoteAdded }) {
  const navigate = useNavigate();
  const { company } = useAuth();
  const [data, setData] = useState({ ins: [], hers: [], invoices: [], bp: [], gc: [], notes: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function load() {
    const id = Number(customerId);
    const safe = async q => { try { const r = await q; return r.data || []; } catch (e) { return []; } };
    const [insProjects, hers, invoices, bp, gc, notes] = await Promise.all([
      safe(supabase.from("projects").select("id,name,address,pipeline_status,created_at").eq("lead_id", id).order("created_at", { ascending: false })),
      safe(supabase.from("hers_estimates").select("id,address,status,created_at").eq("customer_id", id).order("created_at", { ascending: false })),
      safe(supabase.from("hers_invoices").select("id,address,status,grand_total,created_at").eq("customer_id", id).order("created_at", { ascending: false })),
      safe(supabase.from("board_plaster_estimates").select("id,address,status,created_at").eq("customer_id", id).order("created_at", { ascending: false })),
      safe(supabase.from("gc_estimates").select("id,address,job_type,status,created_at").eq("customer_id", id).order("created_at", { ascending: false })),
      safe(supabase.from("activities").select("id,body,type,created_at").eq("lead_id", id).order("created_at", { ascending: false })),
    ]);
    // latest quote amount for each insulation job
    let quoteBy = {};
    if (insProjects.length) {
      const qs = await safe(supabase.from("quotes").select("project_id,final_price,grand_total,created_at")
        .in("project_id", insProjects.map(p => p.id)).order("created_at", { ascending: false }));
      qs.forEach(q => { if (!quoteBy[q.project_id]) quoteBy[q.project_id] = q; });
    }
    const ins = insProjects.map(p => ({ ...p, quotes: quoteBy[p.id] ? [quoteBy[p.id]] : [] }));
    setData({ ins, hers, invoices, bp, gc, notes });
    setLoading(false);
  }
  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [customerId]);

  const insJobs = data.ins;

  // Which trades to show: what the company offers, plus anything this customer already has.
  const offers = {
    ins:  company?.offers_insulation !== false,
    hers: company?.offers_hers !== false,
    bp:   company?.offers_board_plaster === true,
    gc:   company?.offers_gc === true,
  };
  const has = {
    ins:  insJobs.length > 0,
    hers: data.hers.length + data.invoices.length > 0,
    bp:   data.bp.length > 0,
    gc:   data.gc.length > 0,
  };
  const shown = ["ins", "hers", "bp", "gc"].filter(k => offers[k] || has[k]);

  const items = useMemo(() => {
    const out = [];
    insJobs.forEach(j => {
      const q = (j.quotes || [])[0];
      out.push({ k: "ins", date: j.created_at, title: j.name || "Insulation estimate",
        detail: j.address || "", status: j.pipeline_status || "Draft",
        amount: money(q?.final_price ?? q?.grand_total), href: `/project/${j.id}` });
    });
    data.hers.forEach(e => out.push({ k: "hers", date: e.created_at, title: "HERS estimate",
      detail: e.address || "", status: e.status || "", amount: "", href: `/hers/${e.id}` }));
    data.invoices.forEach(e => out.push({ k: "hers", date: e.created_at, title: "HERS invoice",
      detail: e.address || "", status: e.status || "", amount: money(e.grand_total), href: `/hers/invoice/${e.id}` }));
    data.bp.forEach(e => out.push({ k: "bp", date: e.created_at, title: "Board & Plaster estimate",
      detail: e.address || "", status: e.status || "", amount: "", href: `/board-plaster/${e.id}` }));
    data.gc.forEach(e => out.push({ k: "gc", date: e.created_at, title: e.job_type || "GC estimate",
      detail: e.address || "", status: e.status || "", amount: "", href: `/gc/${e.id}` }));
    data.notes.forEach(n => out.push({ k: "note", date: n.created_at, title: n.body || "",
      detail: "", status: "", amount: "", href: null }));
    return out.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [insJobs, data]);

  const visible = items.filter(i => tab === "all" || i.k === tab);

  const START = {
    ins:  () => navigate(`/project/new?type=onsite&leadId=${customerId}`),
    hers: () => navigate(`/hers/new?leadId=${customerId}`),
    bp:   () => navigate(`/board-plaster/new?leadId=${customerId}`),
    gc:   () => navigate(`/gc/new?leadId=${customerId}`),
  };
  const countOf = k => k === "ins" ? insJobs.length : k === "hers" ? data.hers.length + data.invoices.length
    : k === "bp" ? data.bp.length : data.gc.length;
  const latestOf = k => items.find(i => i.k === k);

  async function addNote() {
    const body = note.trim();
    if (!body || savingNote) return;
    setSavingNote(true);
    const { error } = await supabase.from("activities").insert([{ lead_id: Number(customerId), body, type: "note" }]);
    setSavingNote(false);
    if (error) { alert("Could not save the note: " + error.message); return; }
    setNote("");
    await load();
    onNoteAdded && onNoteAdded();
  }

  const card = { background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>All work for this customer</div>

      {/* one card per trade */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {shown.map(k => {
          const n = countOf(k), latest = latestOf(k), t = TRADES[k];
          return (
            <div key={k} style={{ ...card, flex: "1 1 200px", borderStyle: n ? "solid" : "dashed" }}>
              <span style={{ padding: "3px 9px", borderRadius: 6, background: t.bg, color: t.fg, fontSize: 12, fontWeight: 700 }}>{t.label}</span>
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                {n ? `${n} ${n === 1 ? "record" : "records"}` : "Not used yet"}
              </div>
              <div style={{ marginTop: 2, fontSize: 12, color: "#475569", minHeight: 16 }}>
                {n && latest ? `Latest: ${latest.status || "—"}${latest.amount ? " · " + latest.amount : ""}` : "Offer this trade to this customer"}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                {n > 0 && latest?.href && (
                  <button onClick={() => navigate(latest.href)}
                    style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "#1d4ed8", fontSize: 12, fontWeight: 700 }}>Open latest →</button>
                )}
                {offers[k] && (
                  <button onClick={START[k]}
                    style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "#1d4ed8", fontSize: 12, fontWeight: 700 }}>
                    {n ? "+ New" : "Start an estimate →"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* combined timeline */}
      <div style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {[["all", "All"], ...shown.map(k => [k, TRADES[k].label]), ["note", "Notes"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
              style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid " + (tab === k ? "#0f172a" : "#cbd5e1"),
                background: tab === k ? "#0f172a" : "white", color: tab === k ? "white" : "#334155",
                fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{l}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "14px 0 6px", color: "#475569", fontSize: 13 }}>Nothing here yet.</div>
        ) : visible.map((i, idx) => {
          const t = TRADES[i.k];
          const Row = i.href ? "button" : "div";
          return (
            <Row key={idx} onClick={i.href ? () => navigate(i.href) : undefined}
              style={{ display: "grid", gridTemplateColumns: "64px minmax(0,1fr) auto", gap: 12, width: "100%", textAlign: "left",
                padding: "12px 0", border: "none", borderTop: "1px solid #f1f5f9", background: "none",
                cursor: i.href ? "pointer" : "default", font: "inherit", color: "inherit" }}>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{when(i.date)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 6, background: t.bg, color: t.fg, fontSize: 11, fontWeight: 700 }}>{t.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflowWrap: "anywhere" }}>{i.title}</span>
                </div>
                {i.detail && <div style={{ marginTop: 3, fontSize: 12, color: "#475569" }}>{i.detail}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{i.amount}</div>
                {i.status && <div style={{ marginTop: 3, fontSize: 11, color: "#475569" }}>{i.status}</div>}
              </div>
            </Row>
          );
        })}

        {/* add a note */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note (call, visit, reminder)…"
            aria-label="Add a note"
            onKeyDown={e => { if (e.key === "Enter") addNote(); }}
            style={{ flex: 1, minWidth: 0, padding: "0 12px", height: 40, border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13 }} />
          <button onClick={addNote} disabled={!note.trim() || savingNote}
            style={{ height: 40, padding: "0 16px", border: "none", borderRadius: 8, background: "#0f172a", color: "white",
              fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !note.trim() || savingNote ? 0.5 : 1 }}>
            {savingNote ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
