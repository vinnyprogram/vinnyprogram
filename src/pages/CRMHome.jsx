import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// CRM home: every customer in one list, across all trades. A customer's stage
// is worked out from their real jobs (estimates, quotes, invoices), so it never
// needs to be dragged by hand. The old drag-and-drop board is still available
// at /crm/board.

const TRADES = {
  ins:  { label: "Insulation",          bg: "#fff1de", fg: "#8a4300" },
  hers: { label: "HERS",                bg: "#dff5e9", fg: "#0a6240" },
  bp:   { label: "Board & Plaster",     bg: "#e3edfd", fg: "#1b479c" },
  gc:   { label: "General Contracting", bg: "#f0eafd", fg: "#5b34b0" },
};
const STAGES = ["New", "Estimating", "Quote sent", "Accepted", "Paid", "Lost"];
const STAGE_STYLE = {
  "New":        ["#e2e8f0", "#334155"],
  "Estimating": ["#fef3c7", "#854d0e"],
  "Quote sent": ["#dbeafe", "#1e40af"],
  "Accepted":   ["#dcfce7", "#166534"],
  "Paid":       ["#bbf7d0", "#14532d"],
  "Lost":       ["#fee2e2", "#991b1b"],
};

// How a job's status text counts toward the customer's stage.
// -1 = ignore (declined / void), 0 new, 1 estimating, 2 quote sent, 3 accepted, 4 paid.
function rankOf(status) {
  const s = (status || "").toLowerCase();
  if (!s) return 1;
  if (s.includes("void") || s.includes("declin") || s.includes("lost") || s.includes("cancel")) return -1;
  if (s.includes("paid")) return 4;
  if (s.includes("accept") || s.includes("won") || s.includes("approved") || s.includes("signed")) return 3;
  if (s.includes("office")) return 1;
  if (s.includes("sent") || s.includes("emailed") || s.includes("proposal") || s.includes("negotiat")) return 2;
  return 1;
}
// The old board's hand-set status, used as a starting point only.
const MANUAL_RANK = { "New": 0, "Contacted": 0, "Inspection Scheduled": 1, "Estimate Sent": 2, "Follow-Up": 2, "Won": 3 };

const money = n => Number(n) > 0 ? "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
function ago(d) {
  if (!d) return "";
  const t = new Date(d).getTime();
  if (isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CRMHome() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState(null);
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState("all");
  const [stage, setStage] = useState("all");

  useEffect(() => {
    let alive = true;
    const safe = async p => { try { const r = await p; return r.data || []; } catch (e) { return []; } };
    (async () => {
      const [customers, projects, hersE, hersI, bp, gc, acts] = await Promise.all([
        safe(supabase.from("customers").select("id,name,phone,email,company_name,address,status,estimate_amount,created_at").order("name").limit(5000)),
        safe(supabase.from("projects").select("lead_id,pipeline_status,created_at").limit(5000)),
        safe(supabase.from("hers_estimates").select("customer_id,status,created_at").limit(5000)),
        safe(supabase.from("hers_invoices").select("customer_id,status,created_at").limit(5000)),
        safe(supabase.from("board_plaster_estimates").select("customer_id,status,created_at").limit(5000)),
        safe(supabase.from("gc_estimates").select("customer_id,status,created_at").limit(5000)),
        safe(supabase.from("activities").select("lead_id,created_at").order("created_at", { ascending: false }).limit(5000)),
      ]);
      if (alive) { setRaw({ customers, projects, hersE, hersI, bp, gc, acts }); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const offers = {
    ins:  company?.offers_insulation !== false,
    hers: company?.offers_hers !== false,
    bp:   company?.offers_board_plaster === true,
    gc:   company?.offers_gc === true,
  };

  const rows = useMemo(() => {
    if (!raw) return [];
    const by = {};
    const get = id => (by[id] = by[id] || { trades: new Set(), rank: -1, last: 0 });
    const touch = (e, d) => { const t = new Date(d).getTime(); if (t && t > e.last) e.last = t; };
    const add = (id, key, status, d) => {
      if (id == null) return;
      const e = get(Number(id));
      e.trades.add(key);
      const r = rankOf(status);
      if (r > e.rank) e.rank = r;
      touch(e, d);
    };
    raw.projects.forEach(p => add(p.lead_id, "ins", p.pipeline_status, p.created_at));
    raw.hersE.forEach(p => add(p.customer_id, "hers", p.status, p.created_at));
    raw.hersI.forEach(p => add(p.customer_id, "hers", p.status, p.created_at));
    raw.bp.forEach(p => add(p.customer_id, "bp", p.status, p.created_at));
    raw.gc.forEach(p => add(p.customer_id, "gc", p.status, p.created_at));
    raw.acts.forEach(a => { if (a.lead_id != null) touch(get(Number(a.lead_id)), a.created_at); });

    return raw.customers.map(c => {
      const e = by[Number(c.id)] || { trades: new Set(), rank: -1, last: 0 };
      const base = MANUAL_RANK[c.status] ?? 0;
      const rank = Math.max(base, e.rank);
      let st = ["New", "Estimating", "Quote sent", "Accepted", "Paid"][Math.max(0, Math.min(4, rank))];
      if (c.status === "Lost" && rank < 3) st = "Lost";
      const created = new Date(c.created_at).getTime() || 0;
      return { ...c, trades: [...e.trades], stage: st, value: Number(c.estimate_amount) || 0, last: Math.max(e.last, created) };
    }).sort((a, b) => b.last - a.last);
  }, [raw]);

  const stats = useMemo(() => {
    const sum = names => rows.filter(r => names.includes(r.stage)).reduce((s, r) => s + r.value, 0);
    const won = rows.filter(r => r.stage === "Accepted" || r.stage === "Paid").length;
    const out = rows.filter(r => r.stage === "Quote sent").length;
    const lost = rows.filter(r => r.stage === "Lost").length;
    const decided = won + out + lost;
    return {
      customers: rows.length,
      open: rows.filter(r => r.stage === "New" || r.stage === "Estimating").length,
      quotesOut: sum(["Quote sent"]),
      wonValue: sum(["Accepted", "Paid"]),
      closeRate: decided ? Math.round(won / decided * 100) + "%" : "—",
    };
  }, [rows]);

  const shownTrades = ["ins", "hers", "bp", "gc"].filter(k => offers[k] || rows.some(r => r.trades.includes(k)));

  const visible = rows.filter(r => {
    if (trade !== "all" && !r.trades.includes(trade)) return false;
    if (stage !== "all" && r.stage !== stage) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [r.name, r.phone, r.email, r.company_name, r.address].some(v => (v || "").toLowerCase().includes(s))
      || (s.replace(/\D/g, "").length >= 3 && (r.phone || "").replace(/\D/g, "").includes(s.replace(/\D/g, "")));
  });

  const chip = on => ({
    height: 40, padding: "0 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
    border: "1px solid " + (on ? "#0f172a" : "#cbd5e1"), background: on ? "#0f172a" : "white", color: on ? "white" : "#334155",
  });
  const tile = { flex: "1 1 150px", background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" };
  const tileL = { fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 };

  return (
    <div style={{ fontFamily: "Inter,system-ui,sans-serif", background: "#f6f7fb", minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <div style={{ flex: "1 1 200px" }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>CRM</h1>
            <div style={{ marginTop: 2, fontSize: 13, color: "#475569" }}>Every customer, every trade, one list</div>
          </div>
          <button onClick={() => navigate("/crm/board")}
            style={{ height: 40, padding: "0 14px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white", color: "#0f172a", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Board view
          </button>
          <button onClick={() => navigate("/job/new")}
            style={{ height: 40, padding: "0 16px", border: "none", borderRadius: 8, background: "#0f172a", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            + New customer
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <div style={tile}><div style={tileL}>Customers</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{stats.customers}</div></div>
          <div style={tile}><div style={tileL}>Open leads</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{stats.open}</div></div>
          <div style={tile}><div style={tileL}>Quotes out</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{money(stats.quotesOut)}</div></div>
          <div style={tile}><div style={tileL}>Won</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color: "#166534" }}>{money(stats.wonValue)}</div></div>
          <div style={tile}><div style={tileL}>Close rate</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{stats.closeRate}</div></div>
        </div>

        <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search customers"
          placeholder="Search name, phone, email, address, company…"
          style={{ boxSizing: "border-box", width: "100%", height: 44, padding: "0 14px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 14, background: "white" }} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-label="Filter by trade">
          <button onClick={() => setTrade("all")} style={chip(trade === "all")}>All trades</button>
          {shownTrades.map(k => <button key={k} onClick={() => setTrade(k)} style={chip(trade === k)}>{TRADES[k].label}</button>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-label="Filter by stage">
          <button onClick={() => setStage("all")} style={chip(stage === "all")}>Any stage</button>
          {STAGES.map(s => <button key={s} onClick={() => setStage(s)} style={chip(stage === s)}>{s}</button>)}
        </div>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#475569", fontSize: 14 }}>No customers match.</div>
          ) : visible.map((r, i) => (
            <button key={r.id} onClick={() => navigate(`/crm/customer/${r.id}`)}
              style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", width: "100%", textAlign: "left",
                padding: "14px 16px", border: "none", borderTop: i ? "1px solid #f1f5f9" : "none", background: "white", cursor: "pointer", font: "inherit", color: "inherit" }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", overflowWrap: "anywhere" }}>{r.name || "Unnamed"}</div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#475569", overflowWrap: "anywhere" }}>
                  {[r.phone, r.address].filter(Boolean).join(" · ") || "No contact info"}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: "1 1 140px" }}>
                {r.trades.filter(k => TRADES[k]).map(k => (
                  <span key={k} style={{ padding: "3px 8px", borderRadius: 6, background: TRADES[k].bg, color: TRADES[k].fg, fontSize: 11, fontWeight: 700 }}>{TRADES[k].label}</span>
                ))}
              </div>
              <span style={{ padding: "4px 10px", borderRadius: 12, background: STAGE_STYLE[r.stage][0], color: STAGE_STYLE[r.stage][1], fontSize: 12, fontWeight: 700 }}>{r.stage}</span>
              <div style={{ flex: "0 0 80px", fontSize: 14, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{money(r.value)}</div>
              <div style={{ flex: "0 0 96px", fontSize: 12, color: "#475569", textAlign: "right" }}>{ago(r.last ? new Date(r.last) : null)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
