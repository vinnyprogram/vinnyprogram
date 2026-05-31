import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const COMPANY = {
  name:         "Bright Choice Insulation",
  address:      "69 Watson Street | Brockton, Massachusetts 02301",
  phone:        "(781) 507-3199",
  email:        "info@brightchoiceinsulation.com",
  office_email: "estimates@brightchoiceinsulation.com",
  website:      "https://brightchoiceinsulation.com/",
};

function fmtDate(d) {
  return new Date(d||Date.now()).toLocaleDateString("en-US",
    { month:"short", day:"numeric", year:"numeric" });
}
function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0});
}

export default function FieldReport() {
  const { projectId } = useParams();
  const navigate      = useNavigate();

  const [project,  setProject]  = useState(null);
  const [lead,     setLead]     = useState(null);
  const [areas,    setAreas]    = useState([]);
  const [floors,   setFloors]   = useState([]);
  const [segments, setSegments] = useState([]);
  const [user,     setUser]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [options,  setOptions]  = useState([]);  // optional items

  useEffect(()=>{
    if(!projectId) return;
    async function load() {
      console.log("Loading field report for project:", projectId);
      try {
        const { data:{ user } } = await supabase.auth.getUser();
        setUser(user);

        const { data:proj, error:pe } = await supabase.from("projects")
          .select("*").eq("id", projectId).single();
        console.log("Project:", proj, "Error:", pe);
        if(!proj){ setLoading(false); return; }
        setProject(proj);

        if(proj.lead_id){
          const { data:l, error:le } = await supabase.from("customers")
            .select("*").eq("id", proj.lead_id).single();
          console.log("Lead:", l, "Error:", le);
          setLead(l);
        }

        const { data:fl, error:fe } = await supabase.from("floors")
          .select("*").eq("project_id", projectId).order("order_index");
        console.log("Floors:", fl, "Error:", fe);
        setFloors(fl||[]);

        const { data:ar, error:ae } = await supabase.from("areas")
          .select("*").eq("project_id", projectId).order("order_index");
        console.log("Areas:", ar, "Error:", ae);
        setAreas(ar||[]);

        if(ar&&ar.length>0){
          const areaIds = ar.map(a=>a.id);
          const { data:segs } = await supabase.from("segments")
            .select("*").in("area_id", areaIds);
          setSegments(segs||[]);
        }
      } catch(err) {
        console.error("Load error:", err);
      }
      setLoading(false);
    }
    load();
  },[projectId]);

  function sendEmail() {
    const subject = encodeURIComponent(
      `Field Estimate - ${project?.address||project?.name||"New Project"}`
    );
    const lines = [];
    lines.push(`${project?.address||""}`);
    lines.push(`${lead?.name||""}`);
    lines.push(`${lead?.phone||""}`);
    if(lead?.company_name) lines.push(`${lead.company_name}`);
    if(lead?.email) lines.push(`${lead.email}`);
    lines.push("");

    areas.forEach(a=>{
      const fl = floors.find(f=>f.id===a.floor_id);
      const segs = segments.filter(s=>s.area_id===a.id);
      const spec = [a.thickness_in, a.r_value].filter(Boolean).join(" ");
      const measStr = segs.length>0
        ? segs.map(s=>`${s.height}x${s.length}`).join("  ")
        : "";
      lines.push(`${fl?fl.name+": ":""}${a.area_type} ${a.material||""} ${spec} - ${fmt(a.sqft)}ft²`);
      if(measStr) lines.push(`  ${measStr}`);
    });

    if(options.length){
      lines.push("");
      lines.push("Optional:");
      options.forEach(o=>{
        lines.push(`${o.label}: ${o.description}`);
      });
    }

    lines.push("");
    lines.push(`${salesRep}`);

    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:${COMPANY.office_email}?subject=${subject}&body=${body}`;
  }

  const salesRep = user?.user_metadata?.full_name || user?.email || "Field Rep";

  // crew_notes not stored in DB yet — show empty
  let crewNotes = {};

  if(loading) return (
    <div style={{padding:40,textAlign:"center",fontFamily:"system-ui",color:"#64748b"}}>
      Loading…
    </div>
  );
  if(!project) return (
    <div style={{padding:40,textAlign:"center",fontFamily:"system-ui",color:"#ef4444"}}>
      <div>Project not found.</div>
      <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>ID: {projectId}</div>
      <button onClick={()=>navigate(-1)}
        style={{marginTop:12,color:"#0f172a",cursor:"pointer",
          border:"1px solid #e2e8f0",padding:"6px 14px",borderRadius:6}}>
        ← Go back
      </button>
    </div>
  );

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:"#f4f5f7",minHeight:"100vh"}}>

      {/* action bar */}
      <div className="no-print" style={{
        background:"#0f172a",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        position:"sticky",top:0,zIndex:100,gap:8,
      }}>
        <button onClick={()=>navigate(-1)}
          style={{background:"none",border:"1px solid #475569",color:"#94a3b8",
            padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← Back
        </button>
        <span style={{color:"white",fontWeight:700,fontSize:14,flex:1,textAlign:"center"}}>
          Field Report
        </span>
        <div style={{display:"flex",gap:8}}>
          <button onClick={sendEmail}
            style={{background:"#3b82f6",border:"none",color:"white",
              padding:"8px 14px",borderRadius:6,cursor:"pointer",
              fontSize:12,fontWeight:700}}>
            📧 Email Office
          </button>
          <button onClick={()=>window.print()}
            style={{background:"#f97316",border:"none",color:"white",
              padding:"8px 14px",borderRadius:6,cursor:"pointer",
              fontSize:12,fontWeight:700}}>
            🖨 Print
          </button>
        </div>
      </div>

      {/* optional items editor */}
      <div className="no-print" style={{maxWidth:700,margin:"10px auto",padding:"0 12px"}}>
        <div style={{background:"white",borderRadius:10,padding:"10px 14px",
            border:"1px solid #e2e8f0",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>
              Optional items
            </span>
            <button onClick={()=>setOptions(p=>[...p,{id:Date.now(),label:"",description:""}])}
              style={{background:"#0f172a",border:"none",color:"white",
                padding:"4px 10px",borderRadius:5,cursor:"pointer",fontSize:11}}>
              + Add
            </button>
          </div>
          {options.length===0 && (
            <div style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:"4px 0"}}>
              No optional items — tap "+ Add" to include alternatives
            </div>
          )}
          {options.map((o,i)=>(
            <div key={o.id} style={{display:"flex",gap:6,marginBottom:5,alignItems:"center"}}>
              <input placeholder="Label (e.g. Optional - Roof edge)"
                value={o.label} onChange={e=>setOptions(p=>p.map((x,j)=>j===i?{...x,label:e.target.value}:x))}
                style={{flex:1,height:26,fontSize:11,border:"1px solid #e2e8f0",
                  borderRadius:5,padding:"0 8px"}} />
              <input placeholder="Description"
                value={o.description} onChange={e=>setOptions(p=>p.map((x,j)=>j===i?{...x,description:e.target.value}:x))}
                style={{flex:2,height:26,fontSize:11,border:"1px solid #e2e8f0",
                  borderRadius:5,padding:"0 8px"}} />
              <button onClick={()=>setOptions(p=>p.filter((_,j)=>j!==i))}
                style={{border:"none",background:"none",color:"#94a3b8",
                  cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* PRINTABLE REPORT */}
      <div className="print-page" style={{maxWidth:700,margin:"0 auto",padding:"0 12px 40px"}}>
        <div style={{background:"white",padding:"28px 32px",boxSizing:"border-box"}}>

          {/* header */}
          <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",marginBottom:20,
              paddingBottom:16,borderBottom:"2px solid #0f172a"}}>
            <div>
              <div style={{fontWeight:900,fontSize:18,color:"#0f172a",marginBottom:2}}>
                {COMPANY.name}
              </div>
              <div style={{fontSize:10,color:"#64748b",lineHeight:1.6}}>
                {COMPANY.address}<br/>
                {COMPANY.phone} · {COMPANY.email}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>Field Estimate</div>
              <div style={{fontSize:16,fontWeight:800,color:"#0f172a"}}>
                #{String(projectId||"").slice(-6).toUpperCase()||projectId}
              </div>
              <div style={{fontSize:10,color:"#64748b",marginTop:2}}>
                {fmtDate()}
              </div>
              <div style={{fontSize:10,color:"#64748b"}}>
                Rep: {salesRep}
              </div>
            </div>
          </div>

          {/* job info — 2 columns */}
          <div style={{display:"flex",gap:24,marginBottom:20}}>
            {/* customer */}
            <div style={{flex:1,background:"#f8fafc",borderRadius:8,
                padding:"12px 14px",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:9,fontWeight:800,color:"#94a3b8",
                  textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                Customer
              </div>
              <div style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:2}}>
                {lead?.name||"—"}
              </div>
              {lead?.phone && (
                <div style={{fontSize:12,color:"#374151",marginBottom:1}}>{lead.phone}</div>
              )}
              {lead?.company_name && (
                <div style={{fontSize:11,color:"#64748b",marginBottom:1}}>{lead.company_name}</div>
              )}
              {lead?.email && (
                <div style={{fontSize:10,color:"#94a3b8"}}>{lead.email}</div>
              )}
            </div>
            {/* job address + crew */}
            <div style={{flex:1,background:"#f8fafc",borderRadius:8,
                padding:"12px 14px",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:9,fontWeight:800,color:"#94a3b8",
                  textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                Job Info
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:4}}>
                {project.address||"—"}
              </div>
              <div style={{fontSize:10,color:"#64748b",lineHeight:1.8}}>
                {crewNotes.const_type && <div><b>Type:</b> {crewNotes.const_type}</div>}
                {crewNotes.fire_blocking && <div><b>Fire Blocking:</b> {crewNotes.fire_blocking}</div>}
                {crewNotes.ladder && <div><b>Ladder:</b> {crewNotes.ladder}</div>}
                {crewNotes.parking && <div><b>Parking:</b> {crewNotes.parking}</div>}
                {crewNotes.units && <div><b>Units:</b> {crewNotes.units}</div>}
                {crewNotes.extra_notes && <div style={{marginTop:2,fontStyle:"italic"}}>{crewNotes.extra_notes}</div>}
              </div>
            </div>
          </div>

          {/* scope — flat list, no floor separation, like field notes */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:9,fontWeight:800,color:"#94a3b8",
                textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
              Scope of Work
            </div>
            {areas.length===0 ? (
              <div style={{fontSize:12,color:"#94a3b8",fontStyle:"italic"}}>No areas recorded.</div>
            ) : (()=>{
              // group by area_type + material specs (merge same specs across ALL floors)
              const groupMap = {};
              areas.forEach(a=>{
                const fl = floors.find(f=>f.id===a.floor_id);
                const floorIdx = floors.findIndex(f=>f.id===a.floor_id);
                // key = area_type + all material specs (NOT floor — so same specs across floors merge)
                const matKey = (a.material||"")+"||"+(a.thickness_in||"")+"||"+(a.r_value||"");
                const key = a.area_type+"||||"+matKey;
                if(!groupMap[key]) groupMap[key]={
                  area_type: a.area_type,
                  floors: [],
                  floorOrder: floorIdx,
                  sqft: 0,
                  materials: [],
                  segs: [],
                };
                const g = groupMap[key];
                // track floors in order
                if(!g.floors.find(f=>f.id===fl?.id)) {
                  g.floors.push(fl);
                  if(floorIdx < g.floorOrder) g.floorOrder = floorIdx;
                }
                g.sqft += a.sqft||0;
                g.segs = [...g.segs, ...segments.filter(s=>s.area_id===a.id)];
                const exists = g.materials.find(m=>m.material===a.material&&m.r_value===a.r_value&&m.thickness_in===a.thickness_in);
                if(!exists) g.materials.push({
                  material: a.material,
                  thickness_in: a.thickness_in,
                  r_value: a.r_value,
                });
              });

              // sort by floor order (top floor first)
              const groups = Object.values(groupMap).sort((a,b)=>a.floorOrder-b.floorOrder);

              return groups.map((g,i)=>{
                const thick = g.materials[0]?.thickness_in||"";
                const isCombo = g.materials.length > 1;
                // floor label: "Attic, 3rd Floor" → "Attic, 3rd"
                const floorLabel = g.floors
                  .sort((a,b)=>floors.findIndex(f=>f.id===a?.id)-floors.findIndex(f=>f.id===b?.id))
                  .map(f=>f?.name?.replace(" Floor",""))
                  .filter(Boolean).join(", ");
                // material label
                const matLabel = isCombo
                  ? g.materials.map(m=>((m.material||"")+" "+(m.r_value||"")).trim()).join(" · ")
                  : ((g.materials[0]?.material||"")+" "+(g.materials[0]?.r_value||"")).trim();

                const measStr = g.segs.length>0
                  ? g.segs.map(s=>s.height+"×"+s.length).join("  ")
                  : "";

                return (
                  <div key={i} style={{
                    padding:"10px 12px",
                    background:i%2===0?"white":"#f8fafc",
                    border:"1px solid #e2e8f0",
                    borderTop: i===0?"1px solid #e2e8f0":"none",
                    borderRadius: i===0?"6px 6px 0 0" : i===groups.length-1?"0 0 6px 6px":"0",
                  }}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                      <div style={{flex:1,lineHeight:1.6}}>
                        {/* floor tags */}
                        <div style={{marginBottom:2}}>
                          {floorLabel.split(", ").map((f,j)=>(
                            <span key={j} style={{fontSize:9,color:"#94a3b8",fontWeight:600,
                                background:"#f1f5f9",padding:"1px 5px",borderRadius:3,
                                marginRight:3,whiteSpace:"nowrap"}}>
                              {f}
                            </span>
                          ))}
                        </div>
                        {/* area type bold */}
                        <span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>
                          {g.area_type}
                        </span>
                        {/* material specs */}
                        <div style={{fontSize:11,color:"#374151",marginTop:1}}>
                          {thick && <span style={{fontWeight:600}}>{thick} </span>}
                          {matLabel}
                        </div>
                        {/* measurements */}
                        {measStr && (
                          <div style={{fontSize:10,color:"#64748b",marginTop:2,letterSpacing:0.2}}>
                            {measStr}
                          </div>
                        )}
                      </div>
                      {g.sqft>0 && (
                        <span style={{fontSize:12,fontWeight:700,color:"#0f172a",
                            flexShrink:0,paddingTop:18}}>
                          {fmt(g.sqft)} ft²
                        </span>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* optional items */}
          {options.length>0 && (
            <div style={{marginBottom:20}}>
              <div style={{fontSize:9,fontWeight:800,color:"#94a3b8",
                  textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                Optional / Alternatives
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",
                  border:"1px solid #e2e8f0",borderRadius:6}}>
                <tbody>
                  {options.map((o,i)=>(
                    <tr key={o.id} style={{
                      background:i%2===0?"#fffbeb":"#fefce8",
                      borderBottom:i<options.length-1?"1px solid #fde68a":"none"}}>
                      <td style={{padding:"8px 12px",fontSize:11,fontWeight:700,
                          color:"#92400e",width:"35%",verticalAlign:"top"}}>
                        {o.label||"Optional"}
                      </td>
                      <td style={{padding:"8px 12px",fontSize:11,
                          color:"#78350f",verticalAlign:"top"}}>
                        {o.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* notes box */}
          <div style={{border:"1px solid #e2e8f0",borderRadius:6,
              padding:"10px 14px",marginBottom:20,minHeight:60}}>
            <div style={{fontSize:9,fontWeight:800,color:"#94a3b8",
                textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>
              Office Notes / Pricing
            </div>
            <div style={{fontSize:10,color:"#cbd5e1",fontStyle:"italic"}}>
              (to be completed by office)
            </div>
          </div>

          {/* footer */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:10,
              display:"flex",justifyContent:"space-between",
              fontSize:9,color:"#94a3b8"}}>
            <span>{COMPANY.address} · {COMPANY.phone}</span>
            <span>Field estimate prepared by {salesRep} · {fmtDate()}</span>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; }
          .print-page { max-width:100%!important; padding:0!important; margin:0!important; }
          .print-page > div { padding: 16px 20px !important; }
        }
      `}</style>
    </div>
  );
}
