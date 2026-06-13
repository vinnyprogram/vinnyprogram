import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(()=>{
    // Supabase sends token in URL hash: #access_token=...&type=recovery
    // We need to manually parse and set the session
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace("#",""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if(accessToken && type === "recovery"){
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken||"" })
        .then(({error})=>{
          if(error){ setError("Invalid or expired reset link. Please request a new one."); }
          else { setReady(true); }
          setChecking(false);
        });
    } else {
      // Also listen for auth state change as fallback
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event)=>{
        if(event === "PASSWORD_RECOVERY"){ setReady(true); setChecking(false); }
      });
      // If no token in hash, show error after short delay
      setTimeout(()=>{
        setChecking(false);
        subscription.unsubscribe();
      }, 2000);
    }
  },[]);

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    if(password !== confirm){ setError("Passwords don't match"); return; }
    if(password.length < 6){ setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if(error){ setError(error.message); setLoading(false); return; }
    await supabase.auth.signOut();
    alert("Password updated! Please sign in with your new password.");
    navigate("/login");
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

        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🏠</div>
          <div style={{ fontSize:24, fontWeight:900, color:"#0f172a" }}>Insulation Pro</div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>Set a new password</div>
        </div>

        <div style={{ background:"white", borderRadius:16, padding:"28px 24px",
            boxShadow:"0 4px 24px rgba(0,0,0,.08)", border:"1px solid #e2e8f0" }}>

          {checking ? (
            <div style={{ textAlign:"center", padding:"20px 0", color:"#64748b", fontSize:13 }}>
              Verifying reset link…
            </div>
          ) : !ready ? (
            <div style={{ textAlign:"center", padding:"20px 0" }}>
              <div style={{ fontSize:13, color:"#ef4444", marginBottom:16 }}>
                {error || "This reset link is invalid or has expired."}
              </div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:16 }}>
                Please go back and request a new password reset email.
              </div>
              <button onClick={()=>navigate("/login")}
                style={{ border:"none", background:"#0f172a", color:"white",
                  padding:"10px 24px", borderRadius:8, cursor:"pointer",
                  fontSize:13, fontWeight:700 }}>
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset}>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color:"#374151",
                    display:"block", marginBottom:5 }}>New Password</label>
                <input type="password" value={password}
                  onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6} style={IS}
                  autoFocus />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:600, color:"#374151",
                    display:"block", marginBottom:5 }}>Confirm Password</label>
                <input type="password" value={confirm}
                  onChange={e=>setConfirm(e.target.value)}
                  placeholder="••••••••" required minLength={6} style={IS} />
              </div>

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
                {loading ? "Updating…" : "Set New Password"}
              </button>
            </form>
          )}
        </div>

        <div style={{ textAlign:"center", marginTop:16, fontSize:12, color:"#94a3b8" }}>
          Insulation Pro © 2026
        </div>
      </div>
    </div>
  );
}
