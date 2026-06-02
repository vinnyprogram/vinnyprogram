import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Onboarding() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [form, setForm] = useState({
    name:"", address:"", phone:"", email:"", office_email:"", website:""
  });

  function f(k,v){ setForm(p=>({...p,[k]:v})); }

  function handleLogo(e) {
    const file = e.target.files[0];
    if(!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function save(e) {
    e.preventDefault();
    if(!form.name){ setError("Company name is required"); return; }
    setLoading(true); setError("");

    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if(!user) { navigate("/login"); return; }

      let logo_url = null;

      // upload logo if provided
      if(logoFile) {
        const ext = logoFile.name.split('.').pop();
        const path = `logos/${user.id}.${ext}`;
        const { error:upErr } = await supabase.storage
          .from("company-assets")
          .upload(path, logoFile, { upsert:true });
        if(!upErr){
          const { data:urlData } = supabase.storage
            .from("company-assets")
            .getPublicUrl(path);
          logo_url = urlData.publicUrl;
        }
      }

      const { error:ce } = await supabase.from("companies").insert([{
        user_id: user.id,
        name: form.name,
        address: form.address||null,
        phone: form.phone||null,
        email: form.email||null,
        office_email: form.office_email||null,
        website: form.website||null,
        logo_url,
        status: "trial",
      }]);

      if(ce) throw ce;

      // force a hard reload so AuthContext picks up the new company
      window.location.href = "/";
    } catch(err) {
      setError(err.message||"Something went wrong");
    }
    setLoading(false);
  }

  const IS = {
    width:"100%", padding:"10px 12px", borderRadius:8,
    border:"1.5px solid #e0e5ef", fontSize:13, outline:"none",
    boxSizing:"border-box", fontFamily:"inherit", marginTop:4,
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f6f7fb",
        fontFamily:"Inter,system-ui,sans-serif", padding:20 }}>
      <div style={{ maxWidth:480, margin:"0 auto" }}>

        <div style={{ textAlign:"center", marginBottom:24, paddingTop:20 }}>
          <div style={{ fontSize:28, marginBottom:6 }}>🏢</div>
          <div style={{ fontSize:20, fontWeight:900, color:"#0f172a" }}>
            Set Up Your Company
          </div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>
            This info appears on your estimates and reports
          </div>
        </div>

        <div style={{ background:"white", borderRadius:16, padding:"24px 20px",
            boxShadow:"0 4px 24px rgba(0,0,0,.08)", border:"1px solid #e2e8f0" }}>

          <form onSubmit={save}>

            {/* logo upload */}
            <div style={{ marginBottom:20, textAlign:"center" }}>
              <div style={{ width:90, height:90, borderRadius:12, margin:"0 auto 10px",
                  background:"#f1f5f9", border:"2px dashed #cbd5e1",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  overflow:"hidden", cursor:"pointer" }}
                onClick={()=>document.getElementById("logo-input").click()}>
                {logoPreview
                  ? <img src={logoPreview} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : <span style={{ fontSize:28 }}>🏠</span>
                }
              </div>
              <input id="logo-input" type="file" accept="image/*"
                onChange={handleLogo} style={{ display:"none" }} />
              <button type="button"
                onClick={()=>document.getElementById("logo-input").click()}
                style={{ border:"1px solid #e2e8f0", background:"white",
                  padding:"6px 14px", borderRadius:8, cursor:"pointer",
                  fontSize:12, color:"#64748b" }}>
                {logoPreview ? "Change Logo" : "Upload Logo"}
              </button>
            </div>

            {/* fields */}
            {[
              { label:"Company Name *", key:"name", placeholder:"Bright Choice Insulation" },
              { label:"Address", key:"address", placeholder:"69 Watson St, Brockton MA" },
              { label:"Phone", key:"phone", placeholder:"(781) 507-3199" },
              { label:"Company Email", key:"email", placeholder:"info@company.com" },
              { label:"Office Email (for estimates)", key:"office_email", placeholder:"office@company.com" },
              { label:"Website", key:"website", placeholder:"https://company.com" },
            ].map(({label,key,placeholder})=>(
              <div key={key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color:"#374151",
                    display:"block" }}>{label}</label>
                <input value={form[key]} onChange={e=>f(key,e.target.value)}
                  placeholder={placeholder} style={IS} />
              </div>
            ))}

            {error && (
              <div style={{ background:"#fef2f2", border:"1px solid #fecaca",
                  borderRadius:8, padding:"10px 12px", marginBottom:14,
                  fontSize:12, color:"#ef4444" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width:"100%", padding:"13px", borderRadius:10, border:"none",
                background: loading ? "#64748b" : "#059669",
                color:"white", fontWeight:700, fontSize:15,
                cursor: loading ? "not-allowed" : "pointer", marginTop:4 }}>
              {loading ? "Saving…" : "Save & Continue →"}
            </button>
          </form>
        </div>

        <div style={{ textAlign:"center", marginTop:12, fontSize:11, color:"#94a3b8" }}>
          You can update this anytime in Settings
        </div>
      </div>
    </div>
  );
}
