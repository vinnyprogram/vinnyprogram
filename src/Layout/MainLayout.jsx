import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function MainLayout() {
  const location = useLocation();
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) =>
    location.pathname === path ||
    (path === "/estimates" && (
      location.pathname.includes("estimate") ||
      location.pathname.includes("project")
    ));

  const linkStyle = (path) => ({
    color: isActive(path) ? "#fff" : "#94a3b8",
    textDecoration: "none",
    fontSize: 15,
    fontWeight: isActive(path) ? 700 : 400,
    padding: "10px 12px",
    borderRadius: 8,
    display: "block",
    background: isActive(path) ? "#1f2937" : "none",
  });

  return (
   <div style={{ display:"block", height:"100vh", fontFamily:"system-ui,sans-serif",
        position:"relative", overflow:"hidden", boxSizing:"border-box" }}>

      {/* ── mobile overlay ── */}
      {menuOpen && (
        <div onClick={()=>setMenuOpen(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)",
            zIndex:150 }} />
      )}

      {/* ── Sidebar ── */}
      <div style={{
        width: 220,
        background: "#111827",
        color: "white",
        padding: "16px 12px",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "fixed",
        top: 0, bottom: 0, left: 0,
        zIndex: 200,
        transform: menuOpen ? "translateX(0)" : "translateX(-220px)",
        transition: "transform 0.25s ease",
      }}>
        {/* close button on mobile */}
        <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:24 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"white" }}>
            Insulation Pro
          </div>
          <button onClick={()=>setMenuOpen(false)}
            style={{ border:"none", background:"none", color:"#94a3b8",
              fontSize:20, cursor:"pointer", lineHeight:1, padding:"2px 4px" }}>
            ✕
          </button>
        </div>

        <nav style={{ display:"flex", flexDirection:"column", gap:2 }}>
          <Link to="/" style={linkStyle("/")}
            onClick={()=>setMenuOpen(false)}>Dashboard</Link>
          <Link to="/crm" style={linkStyle("/crm")}
            onClick={()=>setMenuOpen(false)}>CRM</Link>
          <Link to="/jobs" style={linkStyle("/jobs")}
            onClick={()=>setMenuOpen(false)}>Jobs</Link>

          {/* Estimates dropdown */}
          <div>
            <button
              onClick={() => setEstimateOpen(p => !p)}
              style={{
                background: estimateOpen||isActive("/estimates") ? "#1f2937" : "none",
                border: "none", cursor:"pointer",
                color: isActive("/estimates") ? "#fff" : "#94a3b8",
                fontSize: 15,
                fontWeight: isActive("/estimates") ? 700 : 400,
                padding: "10px 12px", width:"100%", textAlign:"left", borderRadius:8,
                display:"flex", justifyContent:"space-between", alignItems:"center",
              }}
            >
              <span>Estimates</span>
              <span style={{ fontSize:10, opacity:0.5 }}>{estimateOpen?"▲":"▼"}</span>
            </button>

            {estimateOpen && (
              <div style={{ marginLeft:12, marginTop:2,
                  display:"flex", flexDirection:"column", gap:1 }}>
                <Link
                  to="/project/new?type=onsite"
                  onClick={()=>{ setEstimateOpen(false); setMenuOpen(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    padding:"10px 12px", color:"#e2e8f0",
                    textDecoration:"none", fontSize:14, borderRadius:8,
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                >
                  <span>🏠</span> On Site
                </Link>
                <div style={{
                  display:"flex", alignItems:"center", gap:10,
                  padding:"10px 12px", color:"#4b5563",
                  fontSize:14, borderRadius:8, cursor:"not-allowed",
                }}>
                  <span style={{opacity:0.4}}>📐</span>
                  <span style={{opacity:0.4}}>By Drawings</span>
                  <span style={{
                    marginLeft:"auto", fontSize:9, fontWeight:700,
                    background:"#1f2937", color:"#4b5563",
                    padding:"2px 6px", borderRadius:4, textTransform:"uppercase",
                  }}>Soon</span>
                </div>
              </div>
            )}
          </div>
        </nav>
      </div>

     {/* ── Main area ── */}
      <div style={{ display:"flex", flexDirection:"column",
          height:"100vh", width:"100%", overflow:"hidden" }}>

        {/* ── mobile top bar ── */}
        <div style={{
          background:"#111827", padding:"10px 14px",
          display:"flex", alignItems:"center", gap:12, flexShrink:0,
        }}>
          <button onClick={()=>setMenuOpen(true)}
            style={{ border:"none", background:"none", color:"white",
              fontSize:22, cursor:"pointer", lineHeight:1, padding:"2px 4px",
              display:"flex", flexDirection:"column", gap:4 }}>
            <span style={{display:"block",width:22,height:2,background:"white",borderRadius:1}} />
            <span style={{display:"block",width:22,height:2,background:"white",borderRadius:1}} />
            <span style={{display:"block",width:22,height:2,background:"white",borderRadius:1}} />
          </button>
          <span style={{ color:"white", fontWeight:700, fontSize:15 }}>
            Insulation Pro
          </span>
        </div>

        {/* ── Page content ── */}
        <div style={{ flex:1, overflowY:"auto", overflowX:"hidden",
            background:"#f4f5f7", WebkitOverflowScrolling:"touch" }}>
          <Outlet />
        </div>
      </div>

    </div>
  );
}
