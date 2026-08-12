import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const COMPANY = {
  name:         "Bright Choice Insulation",
  address:      "69 Watson Street | Brockton, Massachusetts 02301",
  phone:        "(781) 507-3199",
  email:        "info@brightchoiceinsulation.com",
  office_email: "gvvini.carvalho@gmail.com",
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
  // Compute optional group map at component level so it's accessible in render
  const optGroupMapComputed = useMemo(()=>{
    const ogm = {};
    (areas||[]).forEach(a=>{
      if(!a.is_optional||!a.area_type||!a.sqft) return;
      const key = (a.floor_id||"")+"||||"+(a.area_type||"")+"||||"+(a.sqft||0);
      if(!ogm[key]) ogm[key]={area_type:a.area_type,floor:null,floorOrder:0,sqft:a.sqft||0,materials:[],optional_note:a.optional_note||""};
      const og=ogm[key];
      const exists=og.materials.find(m=>m.material===a.material&&m.r_value===a.r_value);
      if(!exists) og.materials.push({material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||""});
      if(a.optional_note) og.optional_note=a.optional_note;
    });
    return ogm;
  },[areas]);
  const [floors,   setFloors]   = useState([]);
  const [segments, setSegments] = useState([]);
  const [user,     setUser]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [options,  setOptions]  = useState([]);  // optional items

  useEffect(()=>{
    if(!projectId) return;
    async function load() {
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

    async function sendEmail() {
      if((project?.pipeline_status||"Draft")==="Measured"){
        await supabase.from("projects").update({pipeline_status:"Sent to Office"}).eq("id",projectId);
        setProject(p=>({...p, pipeline_status:"Sent to Office"}));
      }
      const subject = encodeURIComponent(
        `Field Estimate - ${project?.address||project?.name||"New Project"}`
      );
    const lines = [];
    // Avoids ever pushing two blank lines back-to-back - the SCOPE OF WORK
    // loop below adds a spacer after every area, and the section right
    // after it (OPTIONS / Additional Notes / sign-off) also wants a spacer
    // before it, so without this guard those would stack into a double gap.
    function pushBlank(){ if(lines.length && lines[lines.length-1]!=="") lines.push(""); }
    lines.push(`${project?.address||""}`);
    lines.push("");
    lines.push("CUSTOMER");
    lines.push(`${lead?.name||""}`);
    lines.push(`${lead?.phone||""}`);
    if(lead?.company_name) lines.push(`${lead.company_name}`);
    if(lead?.email) lines.push(`${lead.email}`);
    lines.push("");

    // Job Info — was missing from the email entirely before
    const jobInfoLines = [];
    if(crewNotes.const_type) jobInfoLines.push(`Type: ${crewNotes.const_type}`);
    if(crewNotes.fire_blocking) jobInfoLines.push(`Fire Blocking: ${crewNotes.fire_blocking}`);
    if(crewNotes.ladder) jobInfoLines.push(`Ladder: ${crewNotes.ladder}`);
    if(crewNotes.parking) jobInfoLines.push(`Parking: ${crewNotes.parking}`);
    if(crewNotes.units) jobInfoLines.push(`Units: ${crewNotes.units}`);
    if(jobInfoLines.length){
      lines.push("JOB INFO");
      lines.push(jobInfoLines.join("  ·  "));
      if(crewNotes.extra_notes) lines.push(crewNotes.extra_notes);
      lines.push("");
    }

   // Group by floor + area_type + material/thick/r_value, ordered by floor sequence
   // Group by area_type + material + thickness + R-value ONLY (merge across floors)
   // Optional areas (⭐) are excluded here - they get their own section below,
   // same as the printed report. Mixing them in was the bug: sqft totals were
   // silently combining regular scope with customer-choice options.
    lines.push("SCOPE OF WORK");
    const sortedAreas = [...areas].filter(a=>!a.is_optional).sort((a,b)=>a.order_index-b.order_index);
    const primaryAreas = sortedAreas.filter(a=>a.order_index%10===0);
    const physicalAreas = primaryAreas.map(p=>{
      const combos = sortedAreas.filter(s=>s.floor_id===p.floor_id && s.order_index>p.order_index && s.order_index<p.order_index+10);
      const mls = [{material:p.material,thickness_in:p.thickness_in,r_value:p.r_value}, ...combos.map(c=>({material:c.material,thickness_in:c.thickness_in,r_value:c.r_value}))];
      return { area_type:p.area_type, floor_id:p.floor_id, sqft:p.sqft||0, id:p.id, mat_lines:mls };
    });
    const groupMap = {};
    physicalAreas.forEach(a=>{
      const fl = floors.find(f=>f.id===a.floor_id);
      const floorIdx = floors.findIndex(f=>f.id===a.floor_id);
      const specKey = a.mat_lines.map(ml=>`${ml.material}|${ml.thickness_in}|${ml.r_value}`).join("~");
      const key = (a.area_type||"")+"||||"+specKey;
      if(!groupMap[key]) groupMap[key]={
        floors: [], floorOrder: floorIdx, area_type:a.area_type, mat_lines:a.mat_lines,
        sqft:0, segs:[],
      };
      const g = groupMap[key];
      if(fl && !g.floors.find(f=>f.id===fl.id)) g.floors.push(fl);
      if(floorIdx < g.floorOrder) g.floorOrder = floorIdx;
      g.sqft += a.sqft||0;
      g.segs.push(...segments.filter(s=>s.area_id===a.id));
    });
    const groups = Object.values(groupMap).sort((a,b)=>a.floorOrder-b.floorOrder);
    groups.forEach(g=>{
      const thick = g.mat_lines[0]?.thickness_in || "";
      const specs = g.mat_lines.map(ml=>[ml.material,ml.r_value].filter(Boolean).join(" ")).filter(Boolean);
      const spec = g.mat_lines.length>1
        ? [thick,"Combo:",specs.join(" + ")].filter(Boolean).join(" ")
        : [thick,specs[0]].filter(Boolean).join(" ");
      const floorLabel = g.floors
        .sort((a,b)=>floors.findIndex(f=>f.id===a.id)-floors.findIndex(f=>f.id===b.id))
        .map(f=>f.name).join(", ");
      const measStr = g.segs.length>0
        ? g.segs.map(s=>`${s.height}x${s.length}${s.qty>1?`x${s.qty}`:""}`).join("  ")
        : "";
      lines.push(`${floorLabel?floorLabel+": ":""}${g.area_type} ${spec} - ${fmt(g.sqft)}ft²`);
      if(measStr) lines.push(`  ${measStr}`);
      lines.push("");
    });

    // ⭐ Options (Customer Choice) — the areas marked "optional", same section
    // the printed report shows separately with its own sqft/materials.
    if(Object.keys(optGroupMapComputed).length>0){
      const optMerged = {};
      Object.values(optGroupMapComputed).forEach(g=>{
        const matKey = g.materials.map(m=>m.material+(m.thickness_in||"")+(m.r_value||"")).sort().join("+");
        const key = g.area_type+"||||"+matKey;
        if(!optMerged[key]) optMerged[key]={...g,floors:[g.floor],sqft:g.sqft};
        else {
          if(!optMerged[key].floors.find(f=>f?.id===g.floor?.id)) optMerged[key].floors.push(g.floor);
          optMerged[key].sqft+=g.sqft;
          if(g.optional_note) optMerged[key].optional_note=g.optional_note;
        }
      });
      pushBlank();
      lines.push("OPTIONS (CUSTOMER CHOICE)");
      Object.values(optMerged).forEach(g=>{
        const matLabel = (g.materials.length>1?[g.materials[0]?.thickness_in,"Combo:",g.materials.map(ml=>[ml.material,ml.r_value].filter(Boolean).join(" ")).join(" + ")].filter(Boolean).join(" "):[g.materials[0]?.thickness_in,g.materials[0]?.material,g.materials[0]?.r_value].filter(Boolean).join(" "));
        lines.push(`- ${g.area_type} ${matLabel} - ${fmt(g.sqft)}ft²`);
        if(g.optional_note) lines.push(`  ${g.optional_note}`);
      });
    }

    // ⚡ Sub-options (per-area alternatives from "+ Add Option") — this was
    // missing from the email entirely before, even though the on-screen
    // print view already showed it correctly.
    const emailSubOpts = areas.filter(a=>a.area_type&&a.sqft>0).flatMap(a=>{
      try{
        const opts = Array.isArray(a.options)?a.options:(typeof a.options==="string"?JSON.parse(a.options||"[]"):[]);
        return (opts||[]).filter(o=>o.material||o.label).map((o,oi)=>({...o,_area:a,_oi:oi}));
      }catch(e){ return []; }
    });
    if(emailSubOpts.length){
      pushBlank();
      lines.push("SUB-OPTIONS (PRICE SEPARATELY)");
      emailSubOpts.forEach(o=>{
        const fl = floors.find(f=>f.id===o._area.floor_id);
        const optMls=(o.mat_lines||[]).length>0?o.mat_lines:[{material:o.material||"",thickness_in:o.thickness_in||o._area?.thickness_in||"",r_value:o.r_value||o._area?.r_value||""}];
        const matLabel=(optMls.length>1?[optMls[0]?.thickness_in,"Combo:",optMls.map(ml=>[ml.material,ml.r_value].filter(Boolean).join(" ")).join(" + ")].filter(Boolean).join(" "):[optMls[0]?.thickness_in,optMls[0]?.material,optMls[0]?.r_value].filter(Boolean).join(" "));
        const optTotalR = optMls.reduce((sum,ml)=>{
          const r = parseInt((ml.r_value||"").replace(/\D/g,""))||0;
          return sum+r;
        },0);
        lines.push(`- *${(o.label||"").toUpperCase()}* — ${fl?.name?fl.name+" — ":""}${o._area.area_type}`);
        lines.push(`  ${matLabel}${optTotalR>0?` (Total R-${optTotalR})`:""} - ${o._area.sqft}ft²`);
        if(o.note) lines.push(`  📝 ${o.note}`);
      });
    }

    // Manually-typed optional items (separate free-text list, if used)
    if(options.length){
      pushBlank();
      lines.push("Additional Notes:");
      options.forEach(o=>{
        lines.push(`${o.label}: ${o.description}`);
      });
    }

    pushBlank();
    lines.push(`${salesRep}`);

    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:${COMPANY.office_email}?subject=${subject}&body=${body}`;
  }

  const salesRep = user?.user_metadata?.full_name || user?.email || "Field Rep";

  // crew_notes not stored in DB yet — show empty
  const crewNotes = project?.crew_notes
  ? (typeof project.crew_notes === "string"
      ? JSON.parse(project.crew_notes)
      : project.crew_notes)
  : {};

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
              // group by floor + area_type + sqft
              // same floor+type+sqft = same area (combo = multiple rows with same sqft)
              const groupMap = {};
              areas.forEach(a=>{
                const fl = floors.find(f=>f.id===a.floor_id);
                const floorIdx = floors.findIndex(f=>f.id===a.floor_id);
                // key = floor + area_type + sqft (combos share same sqft)
                const key = (a.floor_id||"")+"||||"+(a.area_type||"")+"||||"+(a.sqft||0);
                // Skip optional areas - handled separately
                if(a.is_optional) return;
                if(!groupMap[key]) groupMap[key]={
                  area_type: a.area_type,
                  floor: fl,
                  floorOrder: floorIdx,
                  sqft: a.sqft||0,
                  paint_sqft: a.paint_sqft||0,
                  materials: [],
                  segs: segments.filter(s=>s.area_id===a.id),
                };
                const g = groupMap[key];
                // add material if not duplicate
                const exists = g.materials.find(m=>
                  m.material===a.material&&m.r_value===a.r_value&&m.thickness_in===a.thickness_in);
                if(!exists) g.materials.push({
                  material: a.material||"",
                  thickness_in: a.thickness_in||"",
                  r_value: a.r_value||"",
                });
              });

              // now merge same area_type+materials across floors
              const mergedMap = {};
              Object.values(groupMap).forEach(g=>{
                const matKey = g.materials.map(m=>m.material+m.thickness_in+m.r_value).sort().join("+");
                const key = g.area_type+"||||"+matKey;
               if(!mergedMap[key]) mergedMap[key]={
                  area_type: g.area_type,
                  floors: [],
                  floorOrder: g.floorOrder,
                  sqft: 0,
                  paint_sqft: 0,
                  materials: g.materials,
                  segs: [],
                };
                const mg = mergedMap[key];
                if(!mg.floors.find(f=>f?.id===g.floor?.id)) mg.floors.push(g.floor);
                if(g.floorOrder < mg.floorOrder) mg.floorOrder = g.floorOrder;
                mg.sqft += g.sqft;
                mg.paint_sqft += g.paint_sqft||0;
                mg.segs = [...mg.segs, ...g.segs];
              });

              const groups = Object.values(mergedMap).sort((a,b)=>a.floorOrder-b.floorOrder);

              return groups.map((g,i)=>{
                const thick = g.materials[0]?.thickness_in||"";
                const isCombo = g.materials.length > 1;
                const floorLabel = g.floors
                  .sort((a,b)=>floors.findIndex(f=>f.id===a?.id)-floors.findIndex(f=>f.id===b?.id))
                  .map(f=>f?.name?.replace(" Floor",""))
                  .filter(Boolean).join(", ");

                // combo: "2x6 Combo: Closed Cell R-15 + Open Cell R-21"
                // single: "2x6 Open Cell R-21"
                const matLabel = isCombo
                  ? [g.materials[0]?.thickness_in, "Combo:", g.materials.map(m=>
                      [m.material, m.r_value].filter(Boolean).join(" ")
                    ).join(" + ")].filter(Boolean).join(" ")
                  : [g.materials[0]?.thickness_in, g.materials[0]?.material, g.materials[0]?.r_value]
                      .filter(Boolean).join(" ");
                const measStr = g.segs.length>0
                  ? g.segs.map(s=>`${s.height}×${s.length}${s.qty>1?`×${s.qty}`:""}`).join("  ")
                  : "";

                return (
                  <div key={i} style={{
                    padding:"10px 12px",
                    background:i%2===0?"white":"#f8fafc",
                    border:"1px solid #e2e8f0",
                    borderTop: i===0?"1px solid #e2e8f0":"none",
                    borderRadius: i===0?"6px 6px 0 0" : i===groups.length-1?"0 0 6px 6px":"0",
                  }}>
                    <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>
                          {floorLabel} {g.area_type}
                        </span>
                        <span style={{fontSize:11,color:"#374151",marginLeft:6}}>
                          {matLabel}
                        </span>
                      </div>
                      {g.sqft>0 && (
                        <span style={{fontSize:12,fontWeight:700,color:"#0f172a",flexShrink:0}}>
                          {fmt(g.sqft)} ft²
                        </span>
                      )}
                    </div>
                    {measStr && (
                      <div style={{fontSize:10,color:"#64748b",marginTop:3,
                          paddingLeft:4,letterSpacing:0.2}}>
                        {measStr}
                      </div>
                    )}
                    {g.paint_sqft>0 && (
                      <div style={{fontSize:10,color:"#c2410c",marginTop:3,
                          paddingLeft:4,fontWeight:600}}>
                        🎨 Intumescent paint: {fmt(g.paint_sqft)} ft²
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>

          {/* ⭐ Optional areas as options */}
          {Object.keys(optGroupMapComputed).length>0 && (()=>{
            // Merge optional groups across floors same as main areas
            const optMerged = {};
            Object.values(optGroupMapComputed).forEach(g=>{
              const matKey = g.materials.map(m=>m.material+(m.thickness_in||"")+(m.r_value||"")).sort().join("+");
              const key = g.area_type+"||||"+matKey;
              if(!optMerged[key]) optMerged[key]={...g,floors:[g.floor],sqft:g.sqft};
              else {
                if(!optMerged[key].floors.find(f=>f?.id===g.floor?.id)) optMerged[key].floors.push(g.floor);
                optMerged[key].sqft+=g.sqft;
                if(g.optional_note) optMerged[key].optional_note=g.optional_note;
              }
            });
            const optGroups = Object.values(optMerged);
            return (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:9,fontWeight:800,color:"#92400e",textTransform:"uppercase",
                    letterSpacing:0.5,marginBottom:8,background:"#fff7ed",
                    padding:"6px 12px",borderRadius:6,border:"1px solid #fed7aa"}}>
                  ⭐ Options (Customer Choice)
                </div>
                {optGroups.map((g,i)=>{
                  const floorLabel = g.floors
                    .sort((a,b)=>floors.findIndex(f=>f.id===a?.id)-floors.findIndex(f=>f.id===b?.id))
                    .map(f=>f?.name?.replace(" Floor","")).filter(Boolean).join(", ");
                  const matLabel = (g.materials.length>1?[g.materials[0]?.thickness_in,"Combo:",g.materials.map(ml=>[ml.material,ml.r_value].filter(Boolean).join(" ")).join(" + ")].filter(Boolean).join(" "):[g.materials[0]?.thickness_in,g.materials[0]?.material,g.materials[0]?.r_value].filter(Boolean).join(" "));
                  return (
                    <div key={i} style={{padding:"8px 12px",background:i%2===0?"#fffbeb":"white",
                        border:"1px solid #fde68a",borderTop:i===0?"1px solid #fde68a":"none",
                        borderRadius:i===0?"6px 6px 0 0":i===optGroups.length-1?"0 0 6px 6px":"0"}}>
                      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
                        <div>
                          <span style={{fontSize:12,fontWeight:700,color:"#92400e"}}>{floorLabel} — {g.area_type}</span>
                          <span style={{fontSize:11,color:"#374151",marginLeft:6}}>{matLabel}</span>
                          {g.optional_note&&<div style={{fontSize:10,color:"#b45309",fontStyle:"italic",marginTop:2}}>📝 {g.optional_note}</div>}
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:"#92400e"}}>{fmt(g.sqft)} ft²</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* sub-options from areas */}
          {(()=>{
            const subOpts = areas.filter(a=>a.area_type&&a.sqft>0).flatMap(a=>{
              try{
                const opts = Array.isArray(a.options)?a.options:(typeof a.options==="string"?JSON.parse(a.options||"[]"):[]);
                return (opts||[]).filter(o=>o.material||o.label).map((o,oi)=>({...o,_area:a,_oi:oi}));
              }catch(e){ return []; }
            });
            if(!subOpts.length) return null;
            return (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:9,fontWeight:800,color:"#92400e",textTransform:"uppercase",
                    letterSpacing:0.5,marginBottom:8,background:"#fff7ed",
                    padding:"6px 12px",borderRadius:6,border:"1px solid #fed7aa"}}>
                  ⚡ Sub-Options (Price Separately)
                </div>
                {subOpts.map((o,i)=>{
                  const fl = floors.find(f=>f.id===o._area.floor_id);
                  const optMls=(o.mat_lines||[]).length>0?o.mat_lines:[{material:o.material||"",thickness_in:o.thickness_in||o._area?.thickness_in||"",r_value:o.r_value||o._area?.r_value||""}];
                  const matLabel=(optMls.length>1?[optMls[0]?.thickness_in,"Combo:",optMls.map(ml=>[ml.material,ml.r_value].filter(Boolean).join(" ")).join(" + ")].filter(Boolean).join(" "):[optMls[0]?.thickness_in,optMls[0]?.material,optMls[0]?.r_value].filter(Boolean).join(" "));
                  const optTotalR = optMls.reduce((sum,ml)=>{
                    const r = parseInt((ml.r_value||"").replace(/\D/g,""))||0;
                    return sum+r;
                  },0);
                  return (
                    <div key={i} style={{padding:"8px 12px",background:i%2===0?"#fffbeb":"white",
                        border:"1px solid #fde68a",borderTop:i===0?"1px solid #fde68a":"none",
                        borderRadius:i===0?"6px 6px 0 0":i===subOpts.length-1?"0 0 6px 6px":"0"}}>
                      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
                        <div>
                          <span style={{fontSize:13,fontWeight:800,color:"#92400e"}}>{o.label}</span>
                          <span style={{fontSize:11,color:"#374151",marginLeft:6}}>— {fl?.name} — {o._area.area_type}</span>
                          <div style={{fontSize:10,color:"#64748b"}}>{matLabel}{optTotalR>0&&<span style={{color:"#059669",fontWeight:700,marginLeft:6}}>Total R-{optTotalR}</span>}</div>
                          {o.note&&<div style={{fontSize:10,color:"#b45309",fontStyle:"italic"}}>📝 {o.note}</div>}
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:"#92400e"}}>{o._area.sqft} ft²</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

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

