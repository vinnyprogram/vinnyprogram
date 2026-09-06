import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

// Same starting defaults as the Insulation estimate's built-in fallback
// consts (and what Settings.jsx also uses) - seeded into a brand-new
// company's Settings so they start with a real, working, fully-editable
// list instead of an empty one. About 90% of this is the same across
// insulation companies; new customers can rename/reorder/remove anything.
const DEFAULT_AREA_TYPES = ["Roof Rafter w/ Strapping","Roof Rafter behind knee walls","Floor","Exterior Wall","Demising Wall","Rim Joist","Concrete Wall","Ceiling","Interior Walls","Fire Blocking"];
const DEFAULT_THICK_OPTS = ["2x3","2x4","2x6","2x8","2x10","2x12","I-joist 14in","I-joist 16in","I-joist 18in"];
const DEFAULT_R_VALS     = ["R-11","R-13","R-15","R-19","R-21","R-28","R-30","R-38","R-49","R-60"];
const DEFAULT_CONST_TYPES = ["New Construction","Remodeling","Addition","Existing Construction","Renovation","Commercial","Other"];
const DEFAULT_LADDER_OPTS = ["5ft","7ft","10ft","12ft","16ft","20ft","Lift","No ladder needed"];

async function seedDefaultSettings(companyId){
  const rows = [
    ...DEFAULT_AREA_TYPES.map((name,i)=>({company_id:companyId,category:"Lists",name,period:"list_area_type",amount:0,sort_order:i})),
    ...DEFAULT_THICK_OPTS.map((name,i)=>({company_id:companyId,category:"Lists",name,period:"list_thick_opt",amount:0,sort_order:i})),
    ...DEFAULT_R_VALS.map((name,i)=>({company_id:companyId,category:"Lists",name,period:"list_r_val",amount:0,sort_order:i})),
    ...DEFAULT_CONST_TYPES.map((name,i)=>({company_id:companyId,category:"Lists",name,period:"list_const_type",amount:0,sort_order:i})),
    ...DEFAULT_LADDER_OPTS.map((name,i)=>({company_id:companyId,category:"Lists",name,period:"list_ladder_opt",amount:0,sort_order:i})),
  ];
  try{
    await supabase.from("cost_settings").insert(rows);
  }catch(e){
    // Non-fatal - the hardcoded fallback consts in the estimate pages
    // still work fine if this seed insert ever fails for some reason.
  }
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { loadCompany } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [mode, setMode] = useState("create"); // "create" | "join"
  const [joinCode, setJoinCode] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [form, setForm] = useState({
    name: "", address: "", phone: "", email: "", office_email: "", website: ""
  });

  async function joinTeam(e) {
    e.preventDefault();
    if (!employeeName.trim()) { setError("Enter your name"); return; }
    if (!joinCode.trim()) { setError("Enter the invite code your employer gave you"); return; }
    setLoading(true); setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: targetCompany, error: fe } = await supabase.from("companies")
        .select("id").eq("invite_code", joinCode.trim()).maybeSingle();
      if (fe) throw new Error(fe.message);
      if (!targetCompany) { setError("That invite code doesn't match any company"); setLoading(false); return; }
      const { error: ie } = await supabase.from("company_employees").insert([{
        company_id: targetCompany.id, user_id: user.id, role: "employee", status: "active",
        employee_name: employeeName.trim(),
      }]);
      if (ie) throw new Error(ie.message);
      await loadCompany(user.id);
      navigate("/");
    } catch (err) {
      setError(err.message || "Could not join with that code");
    } finally {
      setLoading(false);
    }
  }

  function f(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function handleLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name) { setError("Company name is required"); return; }
    setLoading(true); setError("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      let logo_url = null;

      // upload logo if provided
      if (logoFile) {
        const ext = logoFile.name.split('.').pop();
        const path = `logos/${user.id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("company-assets")
          .upload(path, logoFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from("company-assets")
            .getPublicUrl(path);
          logo_url = urlData.publicUrl;
        }
      }

      // check if company already exists for this user
      const { data: existing } = await supabase.from("companies")
        .select("id").eq("user_id", user.id).maybeSingle();

      if (existing) {
        // update existing company
        await supabase.from("companies").update({
          name: form.name,
          address: form.address || null,
          phone: form.phone || null,
          email: form.email || null,
          office_email: form.office_email || null,
          website: form.website || null,
          logo_url: logo_url || existing.logo_url,
        }).eq("id", existing.id);
      } else {
        // insert new company
        const { data: newCompany, error: ce } = await supabase.from("companies").insert([{
          user_id: user.id,
          name: form.name,
          address: form.address || null,
          phone: form.phone || null,
          email: form.email || null,
          office_email: form.office_email || null,
          website: form.website || null,
          logo_url,
          status: "trial",
        }]).select().single();
        if (ce) throw new Error(ce.message || "Could not save company");
        // Seed sensible starting defaults into Settings (Area Types,
        // Thickness, R-Values, Job Type, Ladder Size) so a brand-new
        // company isn't staring at empty dropdowns before they've had a
        // chance to configure anything - about 90% of these are the same
        // across insulation companies anyway. Everything here is fully
        // editable in Settings right away; this just gives them a real,
        // working starting point instead of a blank list.
        if (newCompany?.id) await seedDefaultSettings(newCompany.id);
      }

      // reload company in context then navigate
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) await loadCompany(u.id);
      navigate("/");
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
    setLoading(false);
  }

  const IS = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1.5px solid #e0e5ef", fontSize: 13, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit", marginTop: 4,
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f6f7fb",
      fontFamily: "Inter,system-ui,sans-serif", padding: 20
    }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: 24, paddingTop: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🏢</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Set Up Your Company
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            This info appears on your estimates and reports
          </div>
        </div>

        <div style={{
          background: "white", borderRadius: 16, padding: "24px 20px",
          boxShadow: "0 4px 24px rgba(0,0,0,.08)", border: "1px solid #e2e8f0"
        }}>

          <div style={{ display:"flex", marginBottom:20, background:"#f1f5f9", borderRadius:10, padding:3 }}>
            {[["create","Create Company"],["join","Join a Team"]].map(([m,label])=>(
              <button key={m} type="button" onClick={()=>{ setMode(m); setError(""); }}
                style={{ flex:1, padding:"8px", borderRadius:8, border:"none", cursor:"pointer",
                  fontSize:13, fontWeight:700, background: mode===m?"white":"transparent",
                  color: mode===m?"#0f172a":"#64748b", boxShadow: mode===m?"0 1px 4px rgba(0,0,0,.1)":"none" }}>
                {label}
              </button>
            ))}
          </div>

          {mode==="join" ? (
            <form onSubmit={joinTeam}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>
                  Your Name
                </label>
                <input value={employeeName} onChange={e=>setEmployeeName(e.target.value)}
                  placeholder="So the owner knows who's who on the team" required
                  style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1.5px solid #e0e5ef",
                    fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>
                  Invite Code
                </label>
                <input value={joinCode} onChange={e=>setJoinCode(e.target.value)}
                  placeholder="Ask your employer for this code" required
                  style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1.5px solid #e0e5ef",
                    fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
              </div>
              {error && (
                <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8,
                    padding:"10px 12px", marginBottom:14, fontSize:12, color:"#ef4444" }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading}
                style={{ width:"100%", padding:"13px", borderRadius:10, border:"none",
                  background: loading?"#64748b":"#059669", color:"white", fontWeight:700,
                  fontSize:15, cursor: loading?"not-allowed":"pointer" }}>
                {loading ? "Joining…" : "Join Team"}
              </button>
            </form>
          ) : (
          <form onSubmit={save}>

            {/* logo upload */}
            <div style={{ marginBottom: 20, textAlign: "center" }}>
              <div style={{
                width: 90, height: 90, borderRadius: 12, margin: "0 auto 10px",
                background: "#f1f5f9", border: "2px dashed #cbd5e1",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden", cursor: "pointer"
              }}
                onClick={() => document.getElementById("logo-input").click()}>
                {logoPreview
                  ? <img src={logoPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 28 }}>🏠</span>
                }
              </div>
              <input id="logo-input" type="file" accept="image/*"
                onChange={handleLogo} style={{ display: "none" }} />
              <button type="button"
                onClick={() => document.getElementById("logo-input").click()}
                style={{
                  border: "1px solid #e2e8f0", background: "white",
                  padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                  fontSize: 12, color: "#64748b"
                }}>
                {logoPreview ? "Change Logo" : "Upload Logo"}
              </button>
            </div>

            {/* fields */}
            {[
              { label: "Company Name *", key: "name", placeholder: "Bright Choice Insulation" },
              { label: "Address", key: "address", placeholder: "69 Watson St, Brockton MA" },
              { label: "Phone", key: "phone", placeholder: "(781) 507-3199" },
              { label: "Company Email", key: "email", placeholder: "info@company.com" },
              { label: "Office Email (for estimates)", key: "office_email", placeholder: "office@company.com" },
              { label: "Website", key: "website", placeholder: "https://company.com" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{
                  fontSize: 12, fontWeight: 600, color: "#374151",
                  display: "block"
                }}>{label}</label>
                <input value={form[key]} onChange={e => f(key, e.target.value)}
                  placeholder={placeholder} style={IS} />
              </div>
            ))}

            {error && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca",
                borderRadius: 8, padding: "10px 12px", marginBottom: 14,
                fontSize: 12, color: "#ef4444"
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{
                width: "100%", padding: "13px", borderRadius: 10, border: "none",
                background: loading ? "#64748b" : "#059669",
                color: "white", fontWeight: 700, fontSize: 15,
                cursor: loading ? "not-allowed" : "pointer", marginTop: 4
              }}>
              {loading ? "Saving…" : "Save & Continue →"}
            </button>
          </form>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#94a3b8" }}>
          You can update this anytime in Settings
        </div>
      </div>
    </div>
  );
}
