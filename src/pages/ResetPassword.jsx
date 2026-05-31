import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleReset(e) {
    e.preventDefault();
    if(password !== confirm){ setError("Passwords don't match"); return; }
    if(password.length < 6){ setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    if(error){ setError(error.message); setLoading(false); return; }
    setDone(true);
    setTimeout(()=>navigate("/"), 2000);
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
          <div style={{ fontSize:32, marginBottom:8 }}>🔑</div>
          <div style={{ fontSize:22, fontWeight:900, color:"#0f172a" }}>
            Reset Password
          </div>
        </div>
        <div style={{ background:"white", borderRadius:16, padding:"28px 24px",
            boxShadow:"0 4px 24px rgba(0,0,0,.08)", border:"1px solid #e2e8f0" }}>
          {done ? (
            <div style={{ textAlign:"center", color:"#059669", fontWeight:700, fontSize:15 }}>
              ✅ Password updated! Redirecting…
            </div>
          ) : (
            <form onSubmit={handleReset}>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color:"#374151",
                    display:"block", marginBottom:5 }}>New Password</label>
                <input type="password" value={password}
                  onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••••" required style={IS} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:600, color:"#374151",
                    display:"block", marginBottom:5 }}>Confirm Password</label>
                <input type="password" value={confirm}
                  onChange={e=>setConfirm(e.target.value)}
                  placeholder="••••••••" required style={IS} />
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
                  background: loading?"#64748b":"#059669", color:"white",
                  fontWeight:700, fontSize:15, cursor: loading?"not-allowed":"pointer" }}>
                {loading ? "Saving…" : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}