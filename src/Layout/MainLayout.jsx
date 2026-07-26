import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import OfflineBanner from "../components/OfflineBanner";

export default function MainLayout() {
  const location = useLocation();
  const { company, signOut } = useAuth();
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [hersOpen, setHersOpen] = useState(false);
  const [boardPlasterOpen, setBoardPlasterOpen] = useState(false);
  const [gcOpen, setGcOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const offersInsulation = company?.offers_insulation !== false;
  const offersHers       = company?.offers_hers       !== false;
  const offersBoardPlaster = company?.offers_board_plaster === true;

  const isActive = (path) =>
    location.pathname === path ||
    (path === "/estimates" && (
      (location.pathname.includes("estimate") || location.pathname.includes("project"))
      && !location.pathname.includes("hers") && !location.pathname.startsWith("/projects")
    )) ||
    (path === "/projects" && location.pathname.startsWith("/projects")) ||
    (path === "/hers" && location.pathname.includes("hers"));

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

  const subLink = {
    display:"flex", alignItems:"center", gap:10,
    padding:"10px 12px", color:"#e2e8f0",
    textDecoration:"none", fontSize:14, borderRadius:8,
  };

  return (
    <div style={{ display:"block", height:"100vh", fontFamily:"system-ui,sans-serif",
        position:"relative", overflow:"hidden", boxSizing:"border-box" }}>

      {menuOpen && (
        <div onClick={()=>setMenuOpen(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)",
            zIndex:150, WebkitTapHighlightColor:"transparent" }} />
      )}

      {/* Sidebar */}
      <div style={{
        width:220, background:"#111827", color:"white",
        padding:"16px 12px", display:"flex", flexDirection:"column",
        flexShrink:0, position:"fixed", top:0, bottom:0, left:0,
        zIndex:200,
        transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
        transition:"transform 0.25s ease",
        boxShadow: menuOpen ? "4px 0 20px rgba(0,0,0,.3)" : "none",
        visibility: menuOpen ? "visible" : "hidden",
      }}>
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
          <Link to="/" style={linkStyle("/")} onClick={()=>setMenuOpen(false)}>
            Dashboard
          </Link>

          {/* Unified New Job — top level entry point */}
          <Link to="/job/new"
            style={{
              ...linkStyle("/job/new"),
              background:"#059669",
              color:"#fff",
              fontWeight:700,
              borderRadius:8,
              marginBottom:6,
            }}
            onClick={()=>setMenuOpen(false)}>
            ＋ New Job
          </Link>

          <Link to="/schedule" style={linkStyle("/schedule")} onClick={()=>setMenuOpen(false)}>
            📅 Schedule
          </Link>
          <Link to="/crm" style={linkStyle("/crm")} onClick={()=>setMenuOpen(false)}>
            CRM
          </Link>
          <Link to="/projects" style={linkStyle("/projects")} onClick={()=>setMenuOpen(false)}>
            🏠 Projects
          </Link>
          <Link to="/jobs" style={linkStyle("/jobs")} onClick={()=>setMenuOpen(false)}>
            Jobs
          </Link>

          {/* Insulation module — only shown when offers_insulation is enabled */}
          {offersInsulation && <div>
            <button
              onClick={()=>setEstimateOpen(p=>!p)}
              style={{
                background: estimateOpen||isActive("/estimates") ? "#1f2937" : "none",
                border:"none", cursor:"pointer",
                color: isActive("/estimates") ? "#fff" : "#94a3b8",
                fontSize:15,
                fontWeight: isActive("/estimates") ? 700 : 400,
                padding:"10px 12px", width:"100%", textAlign:"left", borderRadius:8,
                display:"flex", justifyContent:"space-between", alignItems:"center",
              }}>
              <span>🧰 Insulation</span>
              <span style={{ fontSize:10, opacity:0.5 }}>{estimateOpen?"▲":"▼"}</span>
            </button>

            {estimateOpen && (
              <div style={{ marginLeft:12, marginTop:2,
                  display:"flex", flexDirection:"column", gap:1 }}>

                <Link to="/how-to-use"
                  onClick={()=>{ setEstimateOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>📖</span> How to Use
                </Link>

                <Link to="/estimates/search"
                  onClick={()=>{ setEstimateOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>🔍</span> Search Estimates
                </Link>

                <Link to="/job/new"
                  onClick={()=>{ setEstimateOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>+</span> New Estimate
                </Link>

                <Link to="/project/new?type=onsite"
                  onClick={()=>{ setEstimateOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>🏠</span> On Site
                </Link>

                <Link to="/project/drawings/new"
                  onClick={()=>{ setEstimateOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>📐</span> By Drawings
                </Link>

              </div>
            )}
          </div>}

          {/* HERS Rating module — only shown when offers_hers is enabled */}
          {offersHers && <div>
            <button
              onClick={()=>setHersOpen(p=>!p)}
              style={{
                background: hersOpen||isActive("/hers") ? "#1f2937" : "none",
                border:"none", cursor:"pointer",
                color: isActive("/hers") ? "#fff" : "#94a3b8",
                fontSize:15,
                fontWeight: isActive("/hers") ? 700 : 400,
                padding:"10px 12px", width:"100%", textAlign:"left", borderRadius:8,
                display:"flex", justifyContent:"space-between", alignItems:"center",
              }}>
              <span>📋 HERS Rating</span>
              <span style={{ fontSize:10, opacity:0.5 }}>{hersOpen?"▲":"▼"}</span>
            </button>

            {hersOpen && (
              <div style={{ marginLeft:12, marginTop:2,
                  display:"flex", flexDirection:"column", gap:1 }}>

                <Link to="/hers/search"
                  onClick={()=>{ setHersOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>🔍</span> Search Estimates
                </Link>

                <Link to="/job/new"
                  onClick={()=>{ setHersOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>+</span> New Estimate
                </Link>

                <Link to="/hers/invoices"
                  onClick={()=>{ setHersOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>🧾</span> Search Invoices
                </Link>

              </div>
            )}
          </div>}

          {/* Board & Plaster module — only shown when offers_board_plaster is enabled */}
          {offersBoardPlaster && <div>
            <button
              onClick={()=>setBoardPlasterOpen(p=>!p)}
              style={{
                background: boardPlasterOpen||isActive("/board-plaster") ? "#1f2937" : "none",
                border:"none", cursor:"pointer",
                color: isActive("/board-plaster") ? "#fff" : "#94a3b8",
                fontSize:15,
                fontWeight: isActive("/board-plaster") ? 700 : 400,
                padding:"10px 12px", width:"100%", textAlign:"left", borderRadius:8,
                display:"flex", justifyContent:"space-between", alignItems:"center",
              }}>
              <span>🧱 Board &amp; Plaster</span>
              <span style={{ fontSize:10, opacity:0.5 }}>{boardPlasterOpen?"▲":"▼"}</span>
            </button>

            {boardPlasterOpen && (
              <div style={{ marginLeft:12, marginTop:2,
                  display:"flex", flexDirection:"column", gap:1 }}>

                <Link to="/board-plaster/new"
                  onClick={()=>{ setBoardPlasterOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>+</span> New Estimate
                </Link>

          <Link to="/board-plaster/search"
                  onClick={()=>{ setBoardPlasterOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>🔍</span> Search Estimates
                </Link>

              </div>
            )}
          </div>}

          {/* General Contractor module */}
          <div>
            <button
              onClick={()=>setGcOpen(p=>!p)}
              style={{
                background: gcOpen||isActive("/gc") ? "#1f2937" : "none",
                border:"none", cursor:"pointer",
                color: isActive("/gc") ? "#fff" : "#94a3b8",
                fontSize:15,
                fontWeight: isActive("/gc") ? 700 : 400,
                padding:"10px 12px", width:"100%", textAlign:"left", borderRadius:8,
                display:"flex", justifyContent:"space-between", alignItems:"center",
              }}>
              <span>🏗️ General Contractor</span>
              <span style={{ fontSize:10, opacity:0.5 }}>{gcOpen?"▲":"▼"}</span>
            </button>

            {gcOpen && (
              <div style={{ marginLeft:12, marginTop:2,
                  display:"flex", flexDirection:"column", gap:1 }}>

                <Link to="/gc/new"
                  onClick={()=>{ setGcOpen(false); setMenuOpen(false); }}
                  style={subLink}
                  onMouseEnter={e=>e.currentTarget.style.background="#374151"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>+</span> New Estimate
                </Link>

              </div>
            )}
          </div>
        </nav>

        {/* settings link */}
        <Link to="/settings" onClick={()=>setMenuOpen(false)}
          style={{ display:"flex", alignItems:"center", gap:10,
            padding:"10px 12px", color:"#94a3b8", fontSize:13,
            borderRadius:8, textDecoration:"none", marginBottom:4 }}
          onMouseEnter={e=>e.currentTarget.style.background="#374151"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          ⚙️ Settings
        </Link>

        {/* company info + sign out */}
        <div style={{ marginTop:"auto", paddingTop:16, borderTop:"1px solid #1e293b" }}>
          {company && (
            <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              🏢 {company.name}
            </div>
          )}
          <button onClick={signOut}
            style={{ width:"100%", padding:"8px", borderRadius:8, border:"none",
              background:"#1e293b", color:"#94a3b8", cursor:"pointer",
              fontSize:12, fontWeight:600, textAlign:"left" }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ display:"flex", flexDirection:"column",
          height:"100vh", width:"100%", overflow:"hidden" }}>

        {/* mobile top bar */}
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

        {/* Page content */}
        <div style={{ flex:1, overflowY:"auto", overflowX:"hidden",
            background:"#f4f5f7", WebkitOverflowScrolling:"touch" }}>
          <Outlet />
        </div>
      </div>
      <OfflineBanner />
    </div>
  );
}
