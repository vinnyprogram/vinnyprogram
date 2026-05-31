import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error){ setError(error.message); setLoading(false); return; }
    navigate("/");
  }

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true); setError("");
    const { error } = await supabase.auth.signUp({ email, password });
    if(error){ setError(error.message); setLoading(false); return; }
    navigate("/onboarding");
  }

  const IS = {
    width:"100%", padding:"12px 14px", borderRadius:10,
    border:"1.5px solid #e0e5ef", fontSize:14, outline:"none",
    boxSizing:"border-box", fontFamily:"inherit",
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f6f7fb",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"Inter,system-ui,sans-serif", padding:20 }}>
      <div style={{ width:"100%", maxWidth:400 }}>

        {/* logo / brand */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🏠</div>
          <div style={{ fontSize:24, fontWeight:900, color:"#0f172a" }}>
            Insulation Pro
          </div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>
            Field Estimate App
          </div>
        </div>

        <div style={{ background:"white", borderRadius:16, padding:"28px 24px",
            boxShadow:"0 4px 24px rgba(0,0,0,.08)", border:"1px solid #e2e8f0" }}>

          {/* tabs */}
          <div style={{ display:"flex", marginBottom:24,
              background:"#f1f5f9", borderRadius:10, padding:3 }}>
            {[["login","Sign In"],["signup","Sign Up"]].map(([m,label])=>(
              <button key={m} onClick={()=>{ setMode(m); setError(""); }}
                style={{ flex:1, padding:"8px", borderRadius:8, border:"none",
                  cursor:"pointer", fontSize:13, fontWeight:700,
                  background: mode===m ? "white" : "transparent",
                  color: mode===m ? "#0f172a" : "#64748b",
                  boxShadow: mode===m ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                  transition:"all .15s" }}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={mode==="login" ? handleLogin : handleSignup}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#374151",
                  display:"block", marginBottom:5 }}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="you@company.com" required style={IS} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#374151",
                  display:"block", marginBottom:5 }}>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6} style={IS} />
            </div>

            {mode==="login" && (
              <div style={{ textAlign:"right", marginTop:-10, marginBottom:14 }}>
                <button type="button"
                  onClick={async()=>{
                    if(!email){ alert("Enter your email first"); return; }
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: window.location.origin + "/reset-password",
                    });
                    if(error) alert(error.message);
                    else alert("Password reset email sent! Check your inbox.");
                  }}
                  style={{ border:"none", background:"none", color:"#3b82f6",
                    cursor:"pointer", fontSize:12, padding:0 }}>
                  Forgot password?
                </button>
              </div>
            )}

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
                cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Please wait…" : mode==="login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {mode==="signup" && (
            <div style={{ fontSize:11, color:"#94a3b8", textAlign:"center", marginTop:12 }}>
              After signing up you'll set up your company profile
            </div>
          )}
        </div>

        <div style={{ textAlign:"center", marginTop:16, fontSize:12, color:"#94a3b8" }}>
          Insulation Pro © 2026
        </div>
      </div>
    </div>
  );
}
