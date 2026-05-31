import { useNavigate } from "react-router-dom";

export default function EstimateStart() {
  const navigate = useNavigate();

  return (
    <div style={{
      maxWidth: 480,
      margin: "60px auto",
      padding: "0 20px",
      fontFamily: "system-ui, sans-serif",
    }}>
     <div style={{ marginBottom: 32 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin:0 }}>
            New Estimate
          </h2>
          <button onClick={()=>navigate("/estimates/search")}
            style={{ border:"1px solid #e2e8f0", background:"white",
              padding:"8px 14px", borderRadius:8, cursor:"pointer",
              fontSize:13, fontWeight:600, color:"#0f172a" }}>
            🔍 Search
          </button>
        </div>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          Choose how you're taking measurements
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* On Site */}
        <button
          onClick={() => navigate("/project/new?type=onsite")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "18px 20px",
            borderRadius: 12,
            border: "1.5px solid #e2e8f0",
            background: "#fff",
            cursor: "pointer",
            textAlign: "left",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#0f172a"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: "#0f172a", display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>
            🏠
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 3 }}>
              On Site
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
              Measure at the job location. Enter H × L for each area as you walk the house.
            </div>
          </div>
          <div style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 18 }}>›</div>
        </button>

        {/* By Drawings — disabled for now */}
        <button
          disabled
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "18px 20px",
            borderRadius: 12,
            border: "1.5px solid #e2e8f0",
            background: "#f8fafc",
            cursor: "not-allowed",
            textAlign: "left",
            opacity: 0.6,
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: "#e2e8f0", display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>
            📐
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 3 }}>
              By Drawings
              <span style={{
                marginLeft: 8, fontSize: 9, fontWeight: 700,
                background: "#e2e8f0", color: "#94a3b8",
                padding: "2px 6px", borderRadius: 4,
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>
                Coming soon
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
              Upload or sketch floor plans and calculate from drawings.
            </div>
          </div>
          <div style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 18 }}>›</div>
        </button>

      </div>
    </div>
  );
}
