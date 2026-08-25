import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const CARD = { background:"#fff", borderRadius:12, padding:16, marginBottom:12,
  boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:"1px solid #eee" };
const I = { width:"100%", padding:"9px 10px", borderRadius:8, border:"1px solid #e2e8f0",
  fontSize:14, boxSizing:"border-box" };
const Btn = { border:"1px solid #e2e8f0", background:"#fff", color:"#0f172a",
  padding:"7px 12px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 };
const BtnD = { border:"none", background:"#059669", color:"#fff",
  padding:"7px 14px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 };

const EMPTY_FORM = { name:"", phone:"", email:"", company_name:"", client_company_id:null, address:"" };

// Searchable "client's company" field. Typing filters existing companies;
// picking one links to the SAME real company record (so two clients at the
// same company, like Randy and Vinny, both point to one row instead of each
// having their own typed-out, possibly-inconsistent company_name string).
// If nothing matches, offers to create a brand new company on the spot.
function CompanyPicker({ value, companies, onPick, onCreateNew }){
  const [query, setQuery] = useState(value||"");
  const [open, setOpen] = useState(false);
  useEffect(()=>{ setQuery(value||""); },[value]);
  const q = query.trim().toLowerCase();
  const matches = q ? companies.filter(c=>c.name.toLowerCase().includes(q)) : companies;
  const exactMatch = companies.find(c=>c.name.toLowerCase()===q);
  return (
    <div style={{position:"relative"}}>
      <input placeholder="Client's company (optional)" value={query}
        onChange={e=>{ setQuery(e.target.value); setOpen(true); onPick(null,e.target.value); }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>setTimeout(()=>setOpen(false),150)}
        style={I} />
      {open && (matches.length>0 || q) && (
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:20,background:"#fff",
            border:"1px solid #e2e8f0",borderRadius:8,marginTop:4,maxHeight:180,overflowY:"auto",
            boxShadow:"0 6px 18px rgba(0,0,0,.1)"}}>
          {matches.map(c=>(
            <div key={c.id} onMouseDown={()=>{ onPick(c.id,c.name); setQuery(c.name); setOpen(false); }}
              style={{padding:"8px 10px",cursor:"pointer",fontSize:13,borderBottom:"1px solid #f1f5f9"}}>
              {c.name}
            </div>
          ))}
          {q && !exactMatch && (
            <div onMouseDown={()=>{ onCreateNew(query.trim()); setOpen(false); }}
              style={{padding:"8px 10px",cursor:"pointer",fontSize:13,color:"#2563eb",fontWeight:600}}>
              + Add "{query.trim()}" as a new company
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [clientCompanies, setClientCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null); // which client row is expanded
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);

  const offersInsulation   = company?.offers_insulation !== false;
  const offersHers         = company?.offers_hers       !== false;
  const offersBoardPlaster = company?.offers_board_plaster === true;
  const offersGc           = company?.offers_gc === true;

  async function fetchCustomers(){
    setLoading(true);
    const { data, error } = await supabase.from("customers").select("*").order("name");
    if(!error) setCustomers(data||[]);
    setLoading(false);
  }
  async function fetchClientCompanies(){
    const { data, error } = await supabase.from("client_companies").select("*").order("name");
    if(!error) setClientCompanies(data||[]);
  }
  useEffect(()=>{ fetchCustomers(); fetchClientCompanies(); },[]);

  // Creates a brand new client_companies row and returns it - used by both
  // the add form and the edit form when the typed company name doesn't
  // match anything that already exists.
  async function createNewCompany(name, setFormFn){
    const { data, error } = await supabase.from("client_companies")
      .insert([{ name, company_id: company?.id }])
      .select().maybeSingle();
    if(error){ alert("Could not create company: "+error.message); return; }
    setClientCompanies(p=>[...p, data]);
    setFormFn(p=>({ ...p, client_company_id:data.id, company_name:data.name }));
  }

  // Other clients already linked to the same company - shown so picking
  // "Curragh Dobbin Inc" for Vinny surfaces that Randy is already there,
  // confirming it's the same real company rather than a coincidence.
  function colleaguesAt(clientCompanyId, excludeId){
    if(!clientCompanyId) return [];
    return customers.filter(c=>c.client_company_id===clientCompanyId && c.id!==excludeId);
  }

  const filtered = customers.filter(c=>{
    const s = search.trim().toLowerCase();
    if(!s) return true;
    return c.name?.toLowerCase().includes(s)
      || c.phone?.toLowerCase().includes(s)
      || c.email?.toLowerCase().includes(s)
      || c.company_name?.toLowerCase().includes(s)
      || c.address?.toLowerCase().includes(s);
  });

  async function addClient(){
    if(!addForm.name.trim() || !addForm.phone.trim()){
      alert("Name and phone are required.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from("customers")
      .insert([{ ...addForm, company_id: company?.id }])
      .select().maybeSingle();
    setSaving(false);
    if(error){ alert("Could not add client: "+error.message); return; }
    setAddForm(EMPTY_FORM);
    setShowAddForm(false);
    setCustomers(p=>[data, ...p]);
    setOpenId(data.id); // jump straight into it so a trade can be picked immediately
    setEditForm({name:data.name||"",phone:data.phone||"",email:data.email||"",company_name:data.company_name||"",client_company_id:data.client_company_id||null,address:data.address||""});
  }

  function openClient(c){
    if(openId===c.id){ setOpenId(null); return; }
    setOpenId(c.id);
    setEditForm({name:c.name||"",phone:c.phone||"",email:c.email||"",company_name:c.company_name||"",client_company_id:c.client_company_id||null,address:c.address||""});
  }

  async function saveEdit(id){
    if(!editForm.name.trim() || !editForm.phone.trim()){
      alert("Name and phone are required.");
      return;
    }
    setEditSaving(true);
    const { error } = await supabase.from("customers").update(editForm).eq("id", id);
    setEditSaving(false);
    if(error){ alert("Could not save changes: "+error.message); return; }
    setCustomers(p=>p.map(c=>c.id===id?{...c,...editForm}:c));
  }

  const trades = [
    offersInsulation   && { label:"🧰 Insulation",       path:(id)=>`/project/new?leadId=${id}` },
    offersHers         && { label:"📋 HERS Rating",       path:(id)=>`/hers/new?leadId=${id}` },
    offersBoardPlaster && { label:"🧱 Board & Plaster",   path:(id)=>`/board-plaster/new?leadId=${id}` },
    offersGc           && { label:"🏗️ General Contractor", path:(id)=>`/gc/new?leadId=${id}` },
  ].filter(Boolean);

  return (
    <div style={{padding:"20px 16px",maxWidth:800,margin:"0 auto",fontFamily:"system-ui,sans-serif"}}>
      <div style={{fontSize:20,fontWeight:800,color:"#0f172a",marginBottom:14}}>Clients</div>

      <input placeholder="Search by name, phone, email, or address…"
        value={search} onChange={e=>setSearch(e.target.value)}
        style={{...I,padding:12,fontSize:15,marginBottom:12}} />

      <button onClick={()=>setShowAddForm(p=>!p)} style={{...Btn,marginBottom:12}}>
        {showAddForm ? "✕ Cancel" : "+ Add Client"}
      </button>

      {showAddForm && (
        <div style={CARD}>
          <div style={{display:"grid",gap:8,marginBottom:10}}>
            <input placeholder="Name *" value={addForm.name} onChange={e=>setAddForm(p=>({...p,name:e.target.value}))} style={I} />
            <input placeholder="Phone *" value={addForm.phone} onChange={e=>setAddForm(p=>({...p,phone:e.target.value}))} style={I} />
            <input placeholder="Email" value={addForm.email} onChange={e=>setAddForm(p=>({...p,email:e.target.value}))} style={I} />
            <CompanyPicker value={addForm.company_name} companies={clientCompanies}
              onPick={(id,name)=>setAddForm(p=>({...p,client_company_id:id,company_name:name}))}
              onCreateNew={(name)=>createNewCompany(name,setAddForm)} />
            {addForm.client_company_id && colleaguesAt(addForm.client_company_id).length>0 && (
              <div style={{fontSize:11,color:"#64748b",marginTop:-4}}>
                Also at this company: {colleaguesAt(addForm.client_company_id).map(c=>c.name).join(", ")}
              </div>
            )}
            <input placeholder="Address" value={addForm.address} onChange={e=>setAddForm(p=>({...p,address:e.target.value}))} style={I} />
          </div>
          <button onClick={addClient} disabled={saving} style={BtnD}>
            {saving ? "Saving…" : "Save Client"}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:"center",color:"#94a3b8",padding:30}}>Loading…</div>
      ) : filtered.length===0 ? (
        <div style={{textAlign:"center",color:"#94a3b8",padding:30}}>
          {search.trim() ? "No clients match that search." : "No clients yet — add one above."}
        </div>
      ) : filtered.map(c=>(
        <div key={c.id} style={CARD}>
          <div onClick={()=>openClient(c)}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{c.name}</div>
              <div style={{fontSize:12,color:"#64748b",lineHeight:1.6}}>
                {c.phone && <span>{c.phone}</span>}
                {c.company_name && <span> · {c.company_name}</span>}
              </div>
              {c.email && <div style={{fontSize:12,color:"#94a3b8"}}>{c.email}</div>}
            </div>
            <span style={{color:"#94a3b8",fontSize:14}}>{openId===c.id ? "▲" : "▼"}</span>
          </div>

          {openId===c.id && (
            <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #f1f5f9"}}>
              <div style={{display:"grid",gap:8,marginBottom:10}}>
                <input placeholder="Name *" value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} style={I} />
                <input placeholder="Phone *" value={editForm.phone} onChange={e=>setEditForm(p=>({...p,phone:e.target.value}))} style={I} />
                <input placeholder="Email" value={editForm.email} onChange={e=>setEditForm(p=>({...p,email:e.target.value}))} style={I} />
                <CompanyPicker value={editForm.company_name} companies={clientCompanies}
                  onPick={(id,name)=>setEditForm(p=>({...p,client_company_id:id,company_name:name}))}
                  onCreateNew={(name)=>createNewCompany(name,setEditForm)} />
                {editForm.client_company_id && colleaguesAt(editForm.client_company_id, c.id).length>0 && (
                  <div style={{fontSize:11,color:"#64748b",marginTop:-4}}>
                    Also at this company: {colleaguesAt(editForm.client_company_id, c.id).map(cc=>cc.name).join(", ")}
                  </div>
                )}
                <input placeholder="Address" value={editForm.address} onChange={e=>setEditForm(p=>({...p,address:e.target.value}))} style={I} />
              </div>
              <button onClick={()=>saveEdit(c.id)} disabled={editSaving} style={{...Btn,marginBottom:14}}>
                {editSaving ? "Saving…" : "💾 Save changes"}
              </button>

              <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                Start an estimate for {c.name}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {trades.map(t=>(
                  <button key={t.label} onClick={()=>navigate(t.path(c.id))} style={BtnD}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
