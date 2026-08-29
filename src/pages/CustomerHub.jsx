import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const C = { bg:"#f4f5f7", white:"#fff", ink:"#0f172a", muted:"#64748b",
  faint:"#94a3b8", border:"#e2e8f0", green:"#059669" };
const CARD = { background:C.white, borderRadius:12, padding:16, marginBottom:14,
  boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}` };
const I = { width:"100%", padding:"9px 10px", borderRadius:8, border:`1px solid ${C.border}`,
  fontSize:14, boxSizing:"border-box" };
const Btn = { border:`1px solid ${C.border}`, background:"#fff", color:C.ink,
  padding:"7px 12px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 };
const BtnD = { border:"none", background:C.green, color:"#fff",
  padding:"7px 14px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 };

const SOURCE_META = {
  gmail:     { icon:"📧", label:"Gmail" },
  outlook:   { icon:"📨", label:"Outlook" },
  whatsapp:  { icon:"💬", label:"WhatsApp" },
  sms:       { icon:"💬", label:"SMS" },
  facebook:  { icon:"📘", label:"Facebook" },
  instagram: { icon:"📷", label:"Instagram" },
  call:      { icon:"📞", label:"Call" },
  manual:    { icon:"📝", label:"Note" },
};

const EMPTY_LOG = { source:"manual", direction:"outbound", contact_id:"", subject:"", body:"", occurred_at:"" };

export default function CustomerHub() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { company } = useAuth();

  const [customer, setCustomer] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [hubProjects, setHubProjects] = useState([]);
  const [comms, setComms] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("all"); // "all" | "unassigned" | a hub_project id

  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name:"", role:"", phone:"", email:"" });

  const [showAddProject, setShowAddProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name:"", address:"" });

  const [showLog, setShowLog] = useState(false);
  const [logForm, setLogForm] = useState(EMPTY_LOG);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const idNum = Number(customerId);
    const { data: cust } = await supabase.from("customers").select("*").eq("id", idNum).maybeSingle();
    setCustomer(cust);

    const { data: cts } = await supabase.from("contacts").select("*, contact_identities(*)")
      .eq("customer_id", idNum).order("created_at");
    setContacts(cts || []);

    const { data: projs } = await supabase.from("hub_projects").select("*")
      .eq("customer_id", idNum).order("created_at", { ascending:false });
    setHubProjects(projs || []);

    const { data: cs } = await supabase.from("communications").select("*")
      .eq("customer_id", idNum).order("occurred_at", { ascending:false });
    setComms(cs || []);

    setLoading(false);
  }
  useEffect(() => { load(); }, [customerId]);

  const filteredComms = comms.filter(c => {
    if (activeTab === "all") return true;
    if (activeTab === "unassigned") return !c.project_id;
    return c.project_id === activeTab;
  });

  function contactName(id) {
    return contacts.find(c => c.id === id)?.name || "";
  }

  async function addContact() {
    if (!contactForm.name.trim()) { alert("Name is required."); return; }
    const { data: contact, error } = await supabase.from("contacts")
      .insert([{ company_id: company?.id, customer_id: Number(customerId), name: contactForm.name, role: contactForm.role }])
      .select().maybeSingle();
    if (error) { alert("Could not add contact: " + error.message); return; }
    const identities = [];
    if (contactForm.phone.trim()) identities.push({ contact_id: contact.id, type:"phone", value: contactForm.phone.trim(), label:"Phone" });
    if (contactForm.email.trim()) identities.push({ contact_id: contact.id, type:"email", value: contactForm.email.trim(), label:"Email" });
    if (identities.length) await supabase.from("contact_identities").insert(identities);
    setContactForm({ name:"", role:"", phone:"", email:"" });
    setShowAddContact(false);
    load();
  }

  async function addProject() {
    if (!projectForm.name.trim()) { alert("Project name is required."); return; }
    const { error } = await supabase.from("hub_projects")
      .insert([{ company_id: company?.id, customer_id: Number(customerId), name: projectForm.name, address: projectForm.address }]);
    if (error) { alert("Could not add project: " + error.message); return; }
    setProjectForm({ name:"", address:"" });
    setShowAddProject(false);
    load();
  }

  async function logCommunication() {
    if (!logForm.body.trim() && !logForm.subject.trim()) { alert("Add a subject or a note."); return; }
    setSaving(true);
    const { error } = await supabase.from("communications").insert([{
      company_id: company?.id,
      customer_id: Number(customerId),
      project_id: (activeTab !== "all" && activeTab !== "unassigned") ? activeTab : null,
      contact_id: logForm.contact_id || null,
      source: logForm.source,
      direction: logForm.direction,
      subject: logForm.subject,
      body: logForm.body,
      occurred_at: logForm.occurred_at ? new Date(logForm.occurred_at).toISOString() : new Date().toISOString(),
    }]);
    setSaving(false);
    if (error) { alert("Could not log communication: " + error.message); return; }
    setLogForm(EMPTY_LOG);
    setShowLog(false);
    load();
  }

  if (loading) return <div style={{ textAlign:"center", color:C.faint, padding:40 }}>Loading…</div>;
  if (!customer) return <div style={{ textAlign:"center", color:C.faint, padding:40 }}>Customer not found.</div>;

  return (
    <div style={{ padding:"20px 16px", maxWidth:820, margin:"0 auto", fontFamily:"system-ui,sans-serif" }}>
      <button onClick={() => navigate(-1)} style={{ ...Btn, marginBottom:12 }}>← Back</button>

      <div style={CARD}>
        <div style={{ fontSize:20, fontWeight:800, color:C.ink }}>{customer.name}</div>
        <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>
          {customer.phone && <span>{customer.phone}</span>}
          {customer.company_name && <span> · {customer.company_name}</span>}
        </div>
        {customer.email && <div style={{ fontSize:13, color:C.faint }}>{customer.email}</div>}
        {customer.address && <div style={{ fontSize:13, color:C.faint }}>{customer.address}</div>}
      </div>

      {/* Contacts */}
      <div style={CARD}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize:14, fontWeight:800, color:C.ink }}>Contacts</div>
          <button onClick={() => setShowAddContact(p => !p)} style={Btn}>
            {showAddContact ? "✕ Cancel" : "+ Add Contact"}
          </button>
        </div>
        {showAddContact && (
          <div style={{ background:"#f8fafc", borderRadius:8, padding:12, marginBottom:10, display:"grid", gap:8 }}>
            <input placeholder="Name *" value={contactForm.name} onChange={e => setContactForm(p => ({ ...p, name:e.target.value }))} style={I} />
            <input placeholder="Role (e.g. Owner, Project Manager)" value={contactForm.role} onChange={e => setContactForm(p => ({ ...p, role:e.target.value }))} style={I} />
            <input placeholder="Phone" value={contactForm.phone} onChange={e => setContactForm(p => ({ ...p, phone:e.target.value }))} style={I} />
            <input placeholder="Email" value={contactForm.email} onChange={e => setContactForm(p => ({ ...p, email:e.target.value }))} style={I} />
            <button onClick={addContact} style={BtnD}>Save Contact</button>
          </div>
        )}
        {contacts.length === 0 ? (
          <div style={{ fontSize:12, color:C.faint }}>No contacts yet — the customer record itself still works fine without one.</div>
        ) : contacts.map(c => (
          <div key={c.id} style={{ padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontWeight:700, fontSize:13, color:C.ink }}>
              {c.name} {c.role && <span style={{ fontWeight:500, color:C.muted }}>— {c.role}</span>}
            </div>
            <div style={{ fontSize:12, color:C.muted }}>
              {(c.contact_identities || []).map(i => `${i.label || i.type}: ${i.value}`).join("  ·  ")}
            </div>
          </div>
        ))}
      </div>

      {/* Project tabs + Log button */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12, alignItems:"center" }}>
        <button onClick={() => setActiveTab("all")} style={{ ...Btn, background: activeTab==="all"?C.green:"#fff", color: activeTab==="all"?"#fff":C.ink, borderColor: activeTab==="all"?C.green:C.border }}>
          All
        </button>
        <button onClick={() => setActiveTab("unassigned")} style={{ ...Btn, background: activeTab==="unassigned"?C.green:"#fff", color: activeTab==="unassigned"?"#fff":C.ink, borderColor: activeTab==="unassigned"?C.green:C.border }}>
          Unassigned
        </button>
        {hubProjects.map(p => (
          <button key={p.id} onClick={() => setActiveTab(p.id)} style={{ ...Btn, background: activeTab===p.id?C.green:"#fff", color: activeTab===p.id?"#fff":C.ink, borderColor: activeTab===p.id?C.green:C.border }}>
            {p.name}
          </button>
        ))}
        <button onClick={() => setShowAddProject(p => !p)} style={{ ...Btn, borderStyle:"dashed" }}>+ Project</button>
      </div>

      {showAddProject && (
        <div style={{ ...CARD, background:"#f8fafc" }}>
          <div style={{ display:"grid", gap:8, marginBottom:10 }}>
            <input placeholder="Project name *" value={projectForm.name} onChange={e => setProjectForm(p => ({ ...p, name:e.target.value }))} style={I} />
            <input placeholder="Address" value={projectForm.address} onChange={e => setProjectForm(p => ({ ...p, address:e.target.value }))} style={I} />
          </div>
          <button onClick={addProject} style={BtnD}>Save Project</button>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontSize:14, fontWeight:800, color:C.ink }}>Timeline</div>
        <button onClick={() => setShowLog(p => !p)} style={BtnD}>
          {showLog ? "✕ Cancel" : "+ Log Communication"}
        </button>
      </div>

      {showLog && (
        <div style={{ ...CARD, background:"#f8fafc" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            <select value={logForm.source} onChange={e => setLogForm(p => ({ ...p, source:e.target.value }))} style={I}>
              {Object.entries(SOURCE_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={logForm.direction} onChange={e => setLogForm(p => ({ ...p, direction:e.target.value }))} style={I}>
              <option value="outbound">Outbound (I sent this)</option>
              <option value="inbound">Inbound (they sent this)</option>
            </select>
          </div>
          <select value={logForm.contact_id} onChange={e => setLogForm(p => ({ ...p, contact_id:e.target.value }))} style={{ ...I, marginBottom:8 }}>
            <option value="">No specific contact</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Subject (optional)" value={logForm.subject} onChange={e => setLogForm(p => ({ ...p, subject:e.target.value }))} style={{ ...I, marginBottom:8 }} />
          <textarea placeholder="What happened / message content…" value={logForm.body} onChange={e => setLogForm(p => ({ ...p, body:e.target.value }))} rows={3} style={{ ...I, marginBottom:8, resize:"vertical" }} />
          <input type="datetime-local" value={logForm.occurred_at} onChange={e => setLogForm(p => ({ ...p, occurred_at:e.target.value }))} style={{ ...I, marginBottom:10 }} />
          {activeTab !== "all" && activeTab !== "unassigned" && (
            <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>Will be logged under "{hubProjects.find(p => p.id === activeTab)?.name}".</div>
          )}
          <button onClick={logCommunication} disabled={saving} style={BtnD}>{saving ? "Saving…" : "Save"}</button>
        </div>
      )}

      {filteredComms.length === 0 ? (
        <div style={{ textAlign:"center", color:C.faint, padding:30 }}>
          Nothing logged here yet.
        </div>
      ) : filteredComms.map(c => {
        const meta = SOURCE_META[c.source] || SOURCE_META.manual;
        const proj = hubProjects.find(p => p.id === c.project_id);
        return (
          <div key={c.id} style={CARD}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
              <div>
                <span style={{ fontSize:13, fontWeight:700, color:C.ink }}>{meta.icon} {meta.label}</span>
                <span style={{ fontSize:11, color:C.faint, marginLeft:6 }}>{c.direction === "inbound" ? "← received" : "→ sent"}</span>
                {c.contact_id && <span style={{ fontSize:12, color:C.muted, marginLeft:6 }}>— {contactName(c.contact_id)}</span>}
                {activeTab === "all" && (
                  <div style={{ fontSize:11, color:C.faint }}>{proj ? proj.name : "Unassigned"}</div>
                )}
              </div>
              <span style={{ fontSize:11, color:C.faint, whiteSpace:"nowrap" }}>
                {new Date(c.occurred_at).toLocaleString()}
              </span>
            </div>
            {c.subject && <div style={{ fontSize:13, fontWeight:600, color:C.ink, marginTop:6 }}>{c.subject}</div>}
            {c.body && <div style={{ fontSize:13, color:C.muted, marginTop:2, whiteSpace:"pre-wrap" }}>{c.body}</div>}
          </div>
        );
      })}
    </div>
  );
}
