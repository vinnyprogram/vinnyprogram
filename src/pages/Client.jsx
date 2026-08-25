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

const EMPTY_FORM = { name:"", phone:"", email:"", company_name:"", address:"" };

export default function Clients() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const [customers, setCustomers] = useState([]);
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
  useEffect(()=>{ fetchCustomers(); },[]);

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
    setEditForm({name:data.name||"",phone:data.phone||"",email:data.email||"",company_name:data.company_name||"",address:data.address||""});
  }

  function openClient(c){
    if(openId===c.id){ setOpenId(null); return; }
    setOpenId(c.id);
    setEditForm({name:c.name||"",phone:c.phone||"",email:c.email||"",company_name:c.company_name||"",address:c.address||""});
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
            <input placeholder="Company" value={addForm.company_name} onChange={e=>setAddForm(p=>({...p,company_name:e.target.value}))} style={I} />
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
                <input placeholder="Company" value={editForm.company_name} onChange={e=>setEditForm(p=>({...p,company_name:e.target.value}))} style={I} />
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
