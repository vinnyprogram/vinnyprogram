import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#f4f5f7", white: "#fff", ink: "#0f172a",
  muted: "#64748b", faint: "#94a3b8",
  border: "#e2e8f0", green: "#059669",
  greenBg: "#f0fdf4", chip: "#f1f5f9",
};
const I = {
  height: 22, fontSize: 11, borderRadius: 4, border: `1px solid ${C.border}`,
  background: C.white, padding: "0 5px", width: "100%",
  boxSizing: "border-box", color: C.ink, outline: "none",
  MozAppearance: "textfield",
};
const noArrow = { WebkitAppearance:"none", MozAppearance:"textfield" };
const S = {
  height: 22, fontSize: 11, borderRadius: 4, border: `1px solid ${C.border}`,
  background: C.white, padding: "0 3px", width: "100%",
  boxSizing: "border-box", color: C.ink,
};
const Btn = {
  height: 22, fontSize: 11, borderRadius: 4, border: `1px solid ${C.border}`,
  background: C.white, padding: "0 7px", cursor: "pointer", color: C.ink,
  whiteSpace: "nowrap", display: "inline-flex", alignItems: "center",
};
const BtnD = {
  height: 22, fontSize: 11, borderRadius: 4, border: "none",
  background: C.ink, padding: "0 7px", cursor: "pointer", color: "#fff",
  whiteSpace: "nowrap", fontWeight: 600, display: "inline-flex", alignItems: "center",
};
const CARD = {
  background: C.white, borderRadius: 8, padding: "7px 9px",
  border: `1px solid ${C.border}`, marginBottom: 5,
};
const CARD_BLUE = {
  background: "#eff6ff", borderRadius: 8, padding: "7px 9px",
  border: `1.5px solid #93c5fd`, marginBottom: 5,
};
const CARD_ORANGE = {
  background: "#fff7ed", borderRadius: 8, padding: "7px 9px",
  border: `1.5px solid #fed7aa`, marginBottom: 5,
};
const LBL = {
  fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase",
  letterSpacing: 0.4, display: "block", marginBottom: 1,
};

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const DEFAULT_FLOORS = ["Attic","3rd","2nd","1st","Basement","Crawlspace"];
const AREA_TYPES = [
  "Roof Rafter w/ Strapping","Roof Rafter behind knee walls","Attic Floor",
  "Exterior Wall","Demising Wall","Rim Joist","Concrete Wall",
  "Ceiling","Interior Walls","Fire Blocking","Other",
];
const THICK_OPTS = ["2x3","2x4","2x6","2x8","2x10","2x12","I-joist","14in","16in"];
const THICK_MAP  = { "2x4":3.5,"2x6":5.5,"2x8":7.25,"2x10":9.25,"2x12":11.25,"I-joist":11.875 };
const R_VALS     = ["R-11","R-13","R-14","R-15","R-19","R-21","R-25","R-30","R-38","R-49","R-60"];
const OC_OPTS    = ['3"cc','7"oc','8"oc','12"oc','16"oc','24"oc','open cell'];
const CONST_TYPES = ["New Construction","Remodeling","Addition","Existing Construction","Renovation","Commercial","Other"];
const LADDER_OPTS = ["5ft","6ft","7ft","10ft","12ft","16ft","20ft","Lift","No ladder needed"];

function calcArea(sqft, thick, mat) {
  if (!sqft || !mat) return { qty:0, unit:"-", line_total:0, unit_price:0 };
  const t = THICK_MAP[thick] || 0;
  const u = mat.unit, p = mat.price_per_unit || 0;
  let q = u==="board_ft" ? sqft*t : u==="bag" ? Math.ceil((sqft*t)/(mat.coverage_factor||1)) : sqft;
  q = Math.round(q);
  return { qty:q, unit:u, unit_price:p, line_total:Math.round(q*p*100)/100 };
}

// ── CustomerSection ───────────────────────────────────────────────────────────
function CustomerSection({ leads, selectedLead, selectedLeadId, projectAddress,
    projectName, onSelect, onClear, onSaveNew, onAddressChange, onNameChange }) {
  const [query, setQuery]     = useState("");
  const [mode, setMode]       = useState("search");
  const [saving, setSaving]   = useState(false);
  const [newStep, setNewStep] = useState(1); // 1=name+phone, 2=company+email+addr
  const emptyForm = { name:"", phone:"", company_name:"", email:"", address:"" };
  const [newForm, setNewForm] = useState(emptyForm);

  function openNew() {
    setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
    setNewStep(1);
    setMode("new");
  }
  function clear() {
    onClear(); setQuery("");
    setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
    setMode("search");
  }
  const results = query.trim().length >= 1
    ? leads.filter(l =>
        (l.name||"").toLowerCase().includes(query.toLowerCase()) ||
        (l.phone||"").includes(query)
      ).slice(0, 5)
    : [];
  function selectLead(lead) { onSelect(lead); setQuery(""); setMode("selected"); }
  async function saveNew() {
    if (!newForm.name && !newForm.phone) return;
    setSaving(true);
    await onSaveNew(newForm);
    setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
    setMode("selected"); setSaving(false);
  }
  const nf = (k,v) => setNewForm(p=>({...p,[k]:v}));
  const TI = { ...I, fontSize:12, height:26 };

  return (
    <div style={{...CARD_BLUE, marginBottom:5}}>

      {/* ── SELECTED: one compact line + address ── */}
      {mode==="selected" && selectedLead && (
        <div>
          {/* customer summary — single row */}
          <div style={{ display:"flex", alignItems:"center",
              justifyContent:"space-between", marginBottom:4 }}>
            <div style={{ fontSize:11, lineHeight:1.5, flex:1, minWidth:0 }}>
              <span style={{ fontWeight:700 }}>{selectedLead.name}</span>
              {selectedLead.phone && (
                <span style={{ color:C.muted, fontSize:10, marginLeft:6 }}>
                  {selectedLead.phone}
                </span>
              )}
              {selectedLead.company_name && (
                <span style={{ color:C.muted, fontSize:10, marginLeft:6 }}>
                  · {selectedLead.company_name}
                </span>
              )}
            </div>
            <button onClick={clear}
              style={{ border:"none", background:"none", color:C.faint,
                fontSize:13, cursor:"pointer", padding:"0 4px", flexShrink:0 }}>✕</button>
          </div>
          {/* job address */}
          <input style={{...TI, width:"100%"}}
            placeholder="Job address for this project…"
            value={projectAddress}
            onChange={e=>onAddressChange(e.target.value)} />
        </div>
      )}

      {/* ── SEARCH ── */}
      {mode==="search" && (
        <div>
          <div style={{ display:"flex", gap:4, marginBottom: results.length||query ? 4 : 0 }}>
            <input style={{ ...TI, flex:1 }}
              placeholder="Search customer by name or phone…"
              value={query} onChange={e=>setQuery(e.target.value)} />
            <button onClick={openNew}
              style={{ ...BtnD, fontSize:11, height:26, padding:"0 10px", flexShrink:0 }}>
              + New
            </button>
          </div>

          {/* results */}
          {results.length > 0 && (
            <div style={{ border:`1px solid ${C.border}`, borderRadius:6,
                overflow:"hidden", marginBottom:4 }}>
              {results.map((l,i)=>(
                <div key={l.id} onClick={()=>selectLead(l)}
                  style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"center", padding:"8px 10px", cursor:"pointer",
                    fontSize:12, background: i%2===0?C.white:"#fafbfc",
                    borderBottom: i<results.length-1?`1px solid ${C.border}`:"none",
                    minHeight:40 }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{l.name}</div>
                    {l.company_name && (
                      <div style={{ color:C.muted, fontSize:10 }}>{l.company_name}</div>
                    )}
                  </div>
                  <span style={{ color:C.faint, fontSize:11 }}>{l.phone}</span>
                </div>
              ))}
            </div>
          )}

          {query.trim().length >= 2 && results.length === 0 && (
            <div style={{ fontSize:11, color:C.faint, marginBottom:4,
                padding:"6px 0", textAlign:"center" }}>
              No match —{" "}
              <button onClick={openNew}
                style={{ border:"none", background:"none", color:C.green,
                  cursor:"pointer", fontSize:11, padding:0, fontWeight:700 }}>
                Register new
              </button>
            </div>
          )}

          {/* standalone project name + address (no customer) */}
          {!query && (
            <div style={{ display:"flex", gap:4, marginTop:2 }}>
              <input style={{...TI, flex:1}} placeholder="Project name"
                value={projectName} onChange={e=>onNameChange(e.target.value)} />
              <input style={{...TI, flex:2}} placeholder="Job address"
                value={projectAddress} onChange={e=>onAddressChange(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {/* ── NEW CUSTOMER: 2-step to keep it compact ── */}
      {mode==="new" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:6 }}>
            <span style={{ fontSize:10, fontWeight:700, color:C.muted,
                textTransform:"uppercase", letterSpacing:0.4 }}>
              New customer {newStep}/2
            </span>
            <button onClick={()=>setMode("search")}
              style={{ border:"none", background:"none", color:C.faint,
                fontSize:16, cursor:"pointer", padding:0, lineHeight:1 }}>✕</button>
          </div>

          {newStep===1 && (
            <>
              <input style={{...TI, width:"100%", marginBottom:6}}
                placeholder="Full name" value={newForm.name}
                onChange={e=>nf("name",e.target.value)} />
              <input style={{...TI, width:"100%", marginBottom:8}}
                placeholder="Phone number" value={newForm.phone}
                onChange={e=>nf("phone",e.target.value)} />
              <button
                onClick={()=>setNewStep(2)}
                disabled={!newForm.name&&!newForm.phone}
                style={{ ...BtnD, width:"100%", justifyContent:"center",
                  height:32, fontSize:12,
                  opacity:(!newForm.name&&!newForm.phone)?0.4:1 }}>
                Next →
              </button>
            </>
          )}

          {newStep===2 && (
            <>
              <input style={{...TI, width:"100%", marginBottom:6}}
                placeholder="Company name" value={newForm.company_name}
                onChange={e=>nf("company_name",e.target.value)} />
              <input style={{...TI, width:"100%", marginBottom:6}}
                placeholder="Email" value={newForm.email}
                onChange={e=>nf("email",e.target.value)} />
              <input style={{...TI, width:"100%", marginBottom:8}}
                placeholder="Company address" value={newForm.address}
                onChange={e=>nf("address",e.target.value)} />
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={()=>setNewStep(1)}
                  style={{ ...Btn, flex:1, justifyContent:"center", height:32 }}>
                  ← Back
                </button>
                <button onClick={saveNew} disabled={saving}
                  style={{ ...BtnD, flex:2, justifyContent:"center",
                    height:32, fontSize:12, opacity:saving?0.5:1 }}>
                  {saving?"Saving…":"Save customer"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── AreaRow ───────────────────────────────────────────────────────────────────
function AreaRow({ area, materials, onChange, onDelete, saveOptionsOnly }) {
  const [expanded, setExpanded] = useState(!area._collapsed);

  useEffect(()=>{
    if(area._collapsed) setExpanded(false);
  },[area._collapsed]);

  // options always read from parent prop
  const areaOptions = area.options||[];

  // ensure options always come from parent area prop

  const XS = { height:30, fontSize:12, borderRadius:5, border:`1px solid ${C.border}`,
    background:C.white, padding:"0 4px", boxSizing:"border-box", color:C.ink,
    minWidth:0, width:"100%" };

// ghost select — no box, looks like a label
const GS = {
  height:28, fontSize:12, border:"none", background:"transparent",
  padding:"0 2px", boxSizing:"border-box", color:C.ink,
  minWidth:0, width:"100%", fontWeight:600,
  WebkitAppearance:"none", MozAppearance:"none",
  appearance:"none",
  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E")`,
  backgroundRepeat:"no-repeat",
  backgroundPosition:"right 2px center",
  paddingRight:14,
  cursor:"pointer",
};

  // material lines — always at least one
  const matLines = (area.mat_lines && area.mat_lines.length > 0)
    ? area.mat_lines
    : [{ id:1, material: area.material||"", thickness_in: area.thickness_in||"",
         r_value: area.r_value||"", oc: area.oc||"" }];

  function updateMatLine(idx, field, value) {
    const lines = matLines.map((l,i)=> i===idx ? {...l,[field]:value} : l);
    onChange("mat_lines", lines);
    // keep legacy fields in sync with first line
    if(idx===0){
      onChange(field, value);
    }
  }

  function addMatLine() {
    const last = matLines[matLines.length-1];
    const lines = [...matLines, { id:Date.now(),
      material:last.material||"", thickness_in:last.thickness_in||"",
      r_value:last.r_value||"", oc:"" }];
    onChange("mat_lines", lines);
  }

  function removeMatLine(idx) {
    if(matLines.length===1) return;
    const lines = matLines.filter((_,i)=>i!==idx);
    onChange("mat_lines", lines);
    onChange("material", lines[0].material||"");
    onChange("thickness_in", lines[0].thickness_in||"");
    onChange("r_value", lines[0].r_value||"");
    onChange("oc", lines[0].oc||"");
  }

  // total cost = sum of all material lines × shared sqft
  const totalCost = matLines.reduce((sum, ml) => {
    const mat = materials.find(m=>m.name===ml.material);
    return sum + calcArea(area.sqft, ml.thickness_in, mat).line_total;
  }, 0);

  const isComplete = !!(area.area_type && matLines[0].material && area.sqft > 0);

  function commitMeasurement() {
    const h = parseFloat(area.mh) || 0;
    const l = parseFloat(area.ml) || 0;
    const q = parseFloat(area.mq) || 1;
    if (!h || !l) return;
    const sqft = Math.round(h * l * q * 100) / 100;
    const meas = [...(area.measurements||[]), { h, l, q, sqft }];
    const d = parseFloat(area.deduct_sqft) || 0;
    const total = Math.max(0, Math.round(meas.reduce((s,m)=>s+m.sqft,0) - d));
    onChange("measurements", meas);
    onChange("sqft", total);
    onChange("mh", ""); onChange("ml", ""); onChange("mq", "1");
  }

  function delMeas(i) {
    const meas = (area.measurements||[]).filter((_,j)=>j!==i);
    const d = parseFloat(area.deduct_sqft)||0;
    onChange("measurements", meas);
    onChange("sqft", Math.max(0, Math.round(meas.reduce((s,m)=>s+m.sqft,0)-d)));
  }

  const liveH = parseFloat(area.mh)||0;
  const liveL = parseFloat(area.ml)||0;
  const liveQ = parseFloat(area.mq)||1;
  const livePreview = (liveH>0&&liveL>0) ? Math.round(liveH*liveL*liveQ*100)/100 : 0;

  // ── COLLAPSED ──
  if (isComplete && !expanded) return (
    <div style={{ background:"#f0fdf4", border:"1px solid #86efac",
        borderLeft:"3px solid #059669", borderRadius:7, padding:"4px 8px", marginBottom:3 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:2 }}>
        <span style={{ fontSize:11, fontWeight:700, color:C.ink }}>{area.area_type||"—"}</span>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:11, fontWeight:700, color:"#059669" }}>${fmt(totalCost)}</span>
          <button onClick={()=>setExpanded(true)}
            style={{ border:"none", background:"none", color:"#059669",
              cursor:"pointer", fontSize:14, padding:"0 2px", lineHeight:1 }}>✏️</button>
        </div>
      </div>
      {/* one line per material */}
      {matLines.map((ml,i)=>(
        <div key={i} style={{ fontSize:10, color:C.muted, lineHeight:1.6 }}>
          {[ml.material, ml.thickness_in, ml.r_value, ml.oc].filter(Boolean).join(" · ")}
          {i===0 && (
            <span style={{ marginLeft:6, color:C.faint }}>
              {fmt(area.sqft)} ft²
              {(area.measurements||[]).length>0 && (
                <span style={{ marginLeft:4 }}>
                  ({area.measurements.map(m=>`${m.h}×${m.l}${m.q>1?`×${m.q}`:""}`).join("  ")})
                </span>
              )}
              {area.deduct_sqft>0 && <span style={{color:"#ef4444"}}> −{area.deduct_sqft}</span>}
            </span>
          )}
        </div>
      ))}
      {/* options preview */}
      {(areaOptions).map((opt,i)=>(
        <div key={i} style={{fontSize:10,color:"#f97316",marginTop:2}}>
          ⚡ Option {i+1}: {[opt.material,opt.thickness_in||area.thickness_in,opt.r_value].filter(Boolean).join(" · ")}
        </div>
      ))}
    </div>
  );

  // ── EXPANDED ──
  return (
    <div style={{ background: isComplete ? "#f0fdf4" : "#fafbfc",
        border:`1px solid ${isComplete?"#86efac":C.border}`,
        borderLeft: isComplete?"3px solid #059669":`1px solid ${C.border}`,
        borderRadius:7, padding:"6px 8px", marginBottom:4 }}>

      {/* collapse bar when complete */}
      {isComplete && (
        <div onClick={()=>setExpanded(false)}
          style={{ margin:"-6px -8px 8px -8px", padding:"10px 12px",
            background:"#059669", borderRadius:"7px 7px 0 0",
            display:"flex", justifyContent:"space-between", alignItems:"center",
            cursor:"pointer" }}>
          <span style={{fontSize:13, fontWeight:700, color:"#fff"}}>✓ Done editing</span>
          <span style={{fontSize:15, color:"#fff"}}>▼</span>
        </div>
      )}

      {/* ROW 1: area type alone + delete */}
      <div style={{ display:"flex", gap:4, marginBottom:2, alignItems:"center",
          borderBottom:`1px solid ${C.border}`, paddingBottom:3 }}>
        <select className="area-select" style={{...GS, flex:1}} value={
            area._show_custom_area ? "__other__" : (area.area_type||"")
          }
          onChange={e=>{
            if(e.target.value==="__other__"){
              onChange("area_type","");
              onChange("_show_custom_area", true);
            } else {
              onChange("area_type",e.target.value);
              onChange("_show_custom_area", false);
            }
          }}>
          <option value="">Area type</option>
          {AREA_TYPES.map(a=><option key={a}>{a}</option>)}
          <option value="__other__">✏️ Other</option>
        </select>
        <button onClick={onDelete}
          style={{ border:"none", background:"none", color:C.faint,
            cursor:"pointer", fontSize:16, padding:"0 2px", lineHeight:1, flexShrink:0 }}>✕</button>
      </div>
      {(area._show_custom_area || (area.area_type && !AREA_TYPES.includes(area.area_type))) && (
        <input placeholder="Type area type…"
          style={{...XS, width:"100%", marginBottom:3}}
          value={area.area_type||""}
          onChange={e=>onChange("area_type",e.target.value)} />
      )}

      {/* material selector — single or combo */}
      <div style={{marginBottom:4}}>
        {(matLines[0].material !== "__combo__" && matLines.length===1 && matLines[0].material !== "__combo__") && (
          <>
            {/* ROW 2: material + thick */}
            <div style={{ display:"flex", gap:4, marginBottom:2,
                borderBottom:`1px solid ${C.border}`, paddingBottom:3 }}>
              <select className="area-select" style={{...GS, flex:2}} value={matLines[0].material||""}
                onChange={e=>{
                  const val = e.target.value;
                  if(val==="__combo__"){
                    onChange("mat_lines",[
                      {id:1,material:"",thickness_in:"",r_value:"",oc:""},
                      {id:2,material:"",thickness_in:"",r_value:"",oc:""},
                    ]);
                    onChange("material","__combo__");
                  } else {
                    onChange("mat_lines",[{id:1,material:val,
                      thickness_in:matLines[0].thickness_in||"",
                      r_value:matLines[0].r_value||"",
                      oc:matLines[0].oc||""}]);
                    onChange("material",val);
                  }
                }}>
                <option value="">Material</option>
                {materials.map(m=><option key={m.id}>{m.name}</option>)}
                <option value="__combo__">⚡ Combo</option>
                <option value="__custom_mat__">✏️ Other</option>
              </select>
              <select className="area-select" style={{...GS, flex:"0 0 52px"}} value={
                  area._custom_thick ? "__other__" : (matLines[0].thickness_in||"")
                }
                onChange={e=>{
                  if(e.target.value==="__other__"){
                    updateMatLine(0,"thickness_in","");
                    onChange("_custom_thick",true);
                  } else {
                    updateMatLine(0,"thickness_in",e.target.value);
                    onChange("_custom_thick",false);
                  }
                }}>
                <option value="">Thick</option>
                {THICK_OPTS.map(t=><option key={t}>{t}</option>)}
                <option value="__other__">✏️</option>
              </select>
            </div>
            {/* custom inputs */}
            {matLines[0].material==="__custom_mat__" && (
              <input autoFocus placeholder="Type material name…"
                style={{...XS, width:"100%", marginBottom:3}}
                value={area.custom_material||""}
                onChange={e=>onChange("custom_material",e.target.value)}
                onBlur={()=>{
                  const val=(area.custom_material||"").trim();
                  if(val){
                    onChange("mat_lines",[{id:1,material:val,
                      thickness_in:matLines[0].thickness_in||"",
                      r_value:matLines[0].r_value||"",oc:matLines[0].oc||""}]);
                    onChange("material",val);
                  }
                }}
                onKeyDown={e=>{
                  if(e.key==="Enter"){
                    const val=(area.custom_material||"").trim();
                    if(val){
                      onChange("mat_lines",[{id:1,material:val,
                        thickness_in:matLines[0].thickness_in||"",
                        r_value:matLines[0].r_value||"",oc:matLines[0].oc||""}]);
                      onChange("material",val);
                    }
                    e.target.blur();
                  }
                }} />
            )}
            {area._custom_thick && (
              <input placeholder="Thickness e.g. 3in"
                style={{...XS, width:"100%", marginBottom:3}}
                value={matLines[0].thickness_in||""}
                onChange={e=>updateMatLine(0,"thickness_in",e.target.value)} />
            )}
            {area._custom_rval && (
              <input placeholder="R-Value e.g. R-22"
                style={{...XS, width:"100%", marginBottom:3}}
                value={matLines[0].r_value||""}
                onChange={e=>updateMatLine(0,"r_value",e.target.value)} />
            )}
            {/* ROW 3: spacing + H x L — merged with measurements below */}
            {(area._custom_thick || area._custom_rval) && (
              <div style={{display:"flex",gap:4,marginBottom:3}}>
                {area._custom_thick && (
                  <input placeholder="e.g. 3in"
                    style={{...XS,flex:1}}
                    value={matLines[0].thickness_in||""}
                    onChange={e=>updateMatLine(0,"thickness_in",e.target.value)} />
                )}
                {area._custom_rval && (
                  <input placeholder="e.g. R-22, R-45"
                    style={{...XS,flex:1}}
                    value={matLines[0].r_value||""}
                    onChange={e=>updateMatLine(0,"r_value",e.target.value)} />
                )}
              </div>
            )}
            {(()=>{
              const mat=materials.find(m=>m.name===matLines[0].material);
              const {qty,unit,unit_price,line_total}=calcArea(area.sqft,matLines[0].thickness_in,mat);
              return line_total>0 ? (
                <div style={{display:"flex",justifyContent:"flex-end",gap:6,
                    fontSize:10,color:C.muted,marginBottom:2}}>
                  <span>{fmt(qty)} {unit?.replace("_"," ")} × ${unit_price}</span>
                  <span style={{fontWeight:700,color:C.green,fontSize:11}}>${fmt(line_total)}</span>
                </div>
              ) : null;
            })()}
          </>
        )}

        {/* COMBO mode — multiple material lines */}
        {(matLines.length > 1 || matLines[0].material==="__combo__") && (
          <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",
              borderRadius:8,padding:"8px 10px",marginTop:2}}>
            <div style={{fontSize:10,fontWeight:700,color:"#0369a1",
                marginBottom:6,textTransform:"uppercase",letterSpacing:0.4}}>
              ⚡ Combo
              <button onClick={()=>{
                  onChange("mat_lines",[{id:1,material:"",thickness_in:"",r_value:"",oc:""}]);
                  onChange("material","");
                }}
                style={{border:"none",background:"none",color:"#94a3b8",
                  cursor:"pointer",fontSize:11,marginLeft:8,padding:0}}>
                × remove combo
              </button>
            </div>
            {matLines.map((ml,idx)=>(
              <div key={ml.id||idx} style={{marginBottom:8,
                  paddingBottom:8,borderBottom:idx<matLines.length-1?`1px solid #e0f2fe`:"none"}}>
                <div style={{display:"flex",gap:4,marginBottom:4,alignItems:"center"}}>
                  <select className="area-select" style={{...XS,flex:1}} value={ml.material||""}
                    onChange={e=>updateMatLine(idx,"material",e.target.value)}>
                    <option value="">Material {idx+1}</option>
                    {materials.map(m=><option key={m.id}>{m.name}</option>)}
                  </select>
                  {matLines.length>2 && (
                    <button onClick={()=>removeMatLine(idx)}
                      style={{border:"none",background:"none",color:C.faint,
                        cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1,flexShrink:0}}>✕</button>
                  )}
                </div>
                <div style={{display:"flex",gap:4,marginBottom:2}}>
                  <select className="area-select" style={{...XS,flex:1}} value={
                      ml._custom_thick ? "__other__" : (ml.thickness_in||"")
                    }
                    onChange={e=>{
                      if(e.target.value==="__other__"){
                        updateMatLine(idx,"thickness_in","");
                        updateMatLine(idx,"_custom_thick",true);
                      } else {
                        updateMatLine(idx,"thickness_in",e.target.value);
                        updateMatLine(idx,"_custom_thick",false);
                      }
                    }}>
                    <option value="">Thick</option>
                    {THICK_OPTS.map(t=><option key={t}>{t}</option>)}
                    <option value="__other__">✏️ Other</option>
                  </select>
                  <select className="area-select" style={{...XS,flex:1}} value={
                      ml._custom_rval ? "__other__" : (ml.r_value||"")
                    }
                    onChange={e=>{
                      if(e.target.value==="__other__"){
                        updateMatLine(idx,"r_value","");
                        updateMatLine(idx,"_custom_rval",true);
                      } else {
                        updateMatLine(idx,"r_value",e.target.value);
                        updateMatLine(idx,"_custom_rval",false);
                      }
                    }}>
                    <option value="">R-Val</option>
                    {R_VALS.map(r=><option key={r}>{r}</option>)}
                    <option value="__other__">✏️ Other</option>
                  </select>
                  <select className="area-select" style={{...XS,flex:1}} value={ml.oc||""}
                    onChange={e=>updateMatLine(idx,"oc",e.target.value)}>
                    <option value="">Spacing</option>{OC_OPTS.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                {(ml._custom_thick || ml._custom_rval) && (
                  <div style={{display:"flex",gap:4,marginBottom:2}}>
                    {ml._custom_thick && (
                      <input placeholder="e.g. 3in" style={{...XS,flex:1}}
                        value={ml.thickness_in||""}
                        onChange={e=>updateMatLine(idx,"thickness_in",e.target.value)} />
                    )}
                    {ml._custom_rval && (
                      <input placeholder="e.g. R-22" style={{...XS,flex:1}}
                        value={ml.r_value||""}
                        onChange={e=>updateMatLine(idx,"r_value",e.target.value)} />
                    )}
                  </div>
                )}
                {(()=>{
                  const mat=materials.find(m=>m.name===ml.material);
                  const {qty,unit,unit_price,line_total}=calcArea(area.sqft,ml.thickness_in,mat);
                  return line_total>0?(
                    <div style={{display:"flex",justifyContent:"flex-end",gap:6,
                        fontSize:10,color:"#0369a1"}}>
                      <span>{fmt(qty)} {unit?.replace("_"," ")} × ${unit_price}</span>
                      <span style={{fontWeight:700}}>${fmt(line_total)}</span>
                    </div>
                  ):null;
                })()}
              </div>
            ))}
            <button onClick={addMatLine}
              style={{width:"100%",padding:"7px",borderRadius:6,
                border:"1px dashed #7dd3fc",background:"none",color:"#0369a1",
                cursor:"pointer",fontSize:11,fontWeight:600,height:"auto"}}>
              + Add material to combo
            </button>
          </div>
        )}
      </div>

      {/* OPTIONS */}
      <div style={{marginBottom:6}}>
        {(areaOptions).map((opt,oi)=>{
          const isOptCombo = opt.material==="__combo__" || (opt.mat_lines||[]).length>1;
          const optLines = (opt.mat_lines||[]).length>0 ? opt.mat_lines
            : [{id:1,material:opt.material||"",thickness_in:opt.thickness_in||matLines[0].thickness_in||"",r_value:opt.r_value||matLines[0].r_value||"",oc:""}];
          function updateOpt(field,val){
            const opts=[...(areaOptions)];
            opts[oi]={...opts[oi],[field]:val};
            onChange("options",opts);
          }
          function updateOptLine(li,field,val){
            const opts=[...(areaOptions)];
            const lines=[...optLines];
            lines[li]={...lines[li],[field]:val};
            opts[oi]={...opts[oi],mat_lines:lines,material:lines[0].material||"__combo__"};
            onChange("options",opts);
          }
          return (
            <div key={oi} style={{background:"#fff7ed",border:"1px solid #fed7aa",
                borderRadius:6,padding:"6px 8px",marginBottom:4}}>
              <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:10,fontWeight:700,color:"#92400e"}}>
                  ⚡ Option {oi+1}
                </span>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <button onClick={()=>saveOptionsOnly()}
                    style={{border:"1px solid #f97316",background:"#fff7ed",
                      color:"#f97316",cursor:"pointer",fontSize:9,
                      padding:"2px 5px",borderRadius:4,fontWeight:700}}>
                    💾 Save
                  </button>
                  <button onClick={()=>onChange("options",(areaOptions).filter((_,j)=>j!==oi))}
                    style={{border:"none",background:"none",color:C.faint,
                      cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                </div>
              </div>

              {/* material selector — single or combo */}
              {!isOptCombo ? (
                <>
                  <div style={{display:"flex",gap:4,marginBottom:4}}>
                    <select style={{...XS,flex:3}} value={opt.material||""}
                      onChange={e=>{
                        if(e.target.value==="__combo__"){
                          updateOpt("mat_lines",[
                            {id:1,material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:""},
                            {id:2,material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:""},
                          ]);
                          updateOpt("material","__combo__");
                        } else {
                          updateOpt("material",e.target.value);
                        }
                      }}>
                      <option value="">Material</option>
                      {materials.map(m=><option key={m.id}>{m.name}</option>)}
                      <option value="__combo__">⚡ Combo</option>
                    </select>
                    <select style={{...XS,flex:1}} value={opt.thickness_in||matLines[0].thickness_in||""}
                      onChange={e=>updateOpt("thickness_in",e.target.value)}>
                      <option value="">Thick</option>
                      {THICK_OPTS.map(t=><option key={t}>{t}</option>)}
                    </select>
                    <select style={{...XS,flex:1}} value={opt.r_value||matLines[0].r_value||""}
                      onChange={e=>updateOpt("r_value",e.target.value)}>
                      <option value="">R-Val</option>
                      {R_VALS.map(r=><option key={r}>{r}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <div style={{background:"#fff7ed",borderRadius:6,padding:"6px 8px",marginBottom:4}}>
                  <div style={{fontSize:9,fontWeight:700,color:"#92400e",marginBottom:6,
                      display:"flex",justifyContent:"space-between"}}>
                    ⚡ Combo
                    <button onClick={()=>{
                        updateOpt("mat_lines",[{id:1,material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:""}]);
                        updateOpt("material","");
                      }}
                      style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:10,padding:0}}>
                      × remove combo
                    </button>
                  </div>
                  {optLines.map((ol,li)=>(
                    <div key={li} style={{marginBottom:6,paddingBottom:6,
                        borderBottom:li<optLines.length-1?"1px dashed #fde68a":"none"}}>
                      <div style={{display:"flex",gap:4,marginBottom:3,alignItems:"center"}}>
                        <select style={{...XS,flex:1}} value={ol.material||""}
                          onChange={e=>updateOptLine(li,"material",e.target.value)}>
                          <option value="">Material {li+1}</option>
                          {materials.map(m=><option key={m.id}>{m.name}</option>)}
                        </select>
                        {optLines.length>2 && (
                          <button onClick={()=>{
                              const lines=optLines.filter((_,j)=>j!==li);
                              const opts=[...(areaOptions)];
                              opts[oi]={...opts[oi],mat_lines:lines};
                              onChange("options",opts);
                            }}
                            style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:13,padding:0}}>✕</button>
                        )}
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        <select style={{...XS,flex:1}} value={ol.thickness_in||""}
                          onChange={e=>updateOptLine(li,"thickness_in",e.target.value)}>
                          <option value="">Thick</option>{THICK_OPTS.map(t=><option key={t}>{t}</option>)}
                        </select>
                        <select style={{...XS,flex:1}} value={ol.r_value||""}
                          onChange={e=>updateOptLine(li,"r_value",e.target.value)}>
                          <option value="">R-Val</option>{R_VALS.map(r=><option key={r}>{r}</option>)}
                        </select>
                        <select style={{...XS,flex:1}} value={ol.oc||""}
                          onChange={e=>updateOptLine(li,"oc",e.target.value)}>
                          <option value="">OC</option>{OC_OPTS.map(o=><option key={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>{
                      const lines=[...optLines,{id:Date.now(),material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:""}];
                      const opts=[...(areaOptions)];
                      opts[oi]={...opts[oi],mat_lines:lines};
                      onChange("options",opts);
                    }}
                    style={{width:"100%",padding:"5px",borderRadius:5,
                      border:"1px dashed #fde68a",background:"none",color:"#92400e",
                      cursor:"pointer",fontSize:10,fontWeight:600,height:"auto"}}>
                    + Add material to combo
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {(areaOptions).length < 3 && (
          <button onClick={()=>{
              const opts=[...(areaOptions)];
              opts.push({material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",mat_lines:[]});
              onChange("options",opts);
            }}
            style={{width:"100%",padding:"5px",borderRadius:6,
              border:"1px dashed #fed7aa",background:"#fff7ed",
              color:"#92400e",cursor:"pointer",fontSize:11,fontWeight:600,
              marginBottom:4,height:"auto"}}>
            + Add Option
          </button>
        )}
      </div>

      {/* measurements — ROW 3: rval + H x L */}
      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:4, marginTop:2 }}>
        <div style={{ display:"flex", gap:3, alignItems:"center", marginBottom:4 }}>
          <select className="area-select" style={{...GS, flex:"0 0 60px"}} value={
              area._custom_rval ? "__other__" : (matLines[0].r_value||"")
            }
            onChange={e=>{
              if(e.target.value==="__other__"){
                updateMatLine(0,"r_value","");
                onChange("_custom_rval",true);
              } else {
                updateMatLine(0,"r_value",e.target.value);
                onChange("_custom_rval",false);
              }
            }}>
            <option value="">R-Val</option>
            {R_VALS.map(r=><option key={r}>{r}</option>)}
            <option value="__other__">✏️</option>
          </select>
          <input placeholder="H" inputMode="decimal" value={area.mh||""}
            onChange={e=>onChange("mh",e.target.value)}
            onBlur={commitMeasurement}
            onKeyDown={e=>e.key==="Enter"&&commitMeasurement()}
            className="area-hl-input" style={{...I,...noArrow, flex:1, padding:"0 4px", textAlign:"center", height:30, fontSize:13}} />
          <span style={{fontSize:11,color:C.faint}}>×</span>
          <input placeholder="L" inputMode="decimal" value={area.ml||""}
            onChange={e=>onChange("ml",e.target.value)}
            onBlur={commitMeasurement}
            onKeyDown={e=>e.key==="Enter"&&commitMeasurement()}
            className="area-hl-input" style={{...I,...noArrow, flex:1, padding:"0 4px", textAlign:"center", height:30, fontSize:13}} />
          <span style={{fontSize:11,color:C.faint}}>×</span>
          <input placeholder="1" inputMode="decimal" value={area.mq||""}
            onChange={e=>onChange("mq",e.target.value)}
            onBlur={commitMeasurement}
            onKeyDown={e=>e.key==="Enter"&&commitMeasurement()}
            className="area-mq-input" style={{...I,...noArrow, width:36, padding:"0 3px", textAlign:"center", height:30, fontSize:13}} />
          <span style={{fontSize:11, fontWeight:700,
            color:livePreview>0?C.green:C.ink, whiteSpace:"nowrap"}}>
            {livePreview>0?`${fmt(livePreview)}→`:""}
            {fmt(area.sqft)}ft²
          </span>
        </div>

        {/* chips */}
        {(area.measurements||[]).length>0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginBottom:4 }}>
            {area.measurements.map((m,i)=>(
              <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:2,
                  background:isComplete?"#dcfce7":C.chip,
                  borderRadius:4, padding:"2px 6px", fontSize:10, color:C.muted }}>
                {m.h}×{m.l}{m.q>1?`×${m.q}`:""}&nbsp;<b style={{color:C.ink}}>{fmt(m.sqft)}</b>
                <button onClick={()=>delMeas(i)}
                  style={{border:"none",background:"none",cursor:"pointer",
                    color:C.faint,fontSize:11,padding:0,lineHeight:1}}>✕</button>
              </span>
            ))}
          </div>
        )}

        {/* deduct + total */}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{fontSize:10,color:C.faint,whiteSpace:"nowrap"}}>− deduct</span>
          <input placeholder="ft²" inputMode="decimal" value={area.deduct_sqft||""}
            onChange={e=>{
              const d=parseFloat(e.target.value)||0;
              onChange("deduct_sqft",e.target.value);
              const raw=(area.measurements||[]).reduce((s,m)=>s+m.sqft,0);
              onChange("sqft",Math.max(0,Math.round(raw-d)));
            }}
            className="area-deduct" style={{...I,...noArrow, width:70, padding:"0 6px", height:30, fontSize:12}} />
          {totalCost>0 && (
            <div style={{ marginLeft:"auto", fontWeight:700, color:C.green, fontSize:13 }}>
              Total ${fmt(totalCost)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── EstimatePanel ─────────────────────────────────────────────────────────────
function EstimatePanel({ floors, areas, materialMap, crewNotes, projectName, projectAddress, customer }) {
  function floorTotal(floor) {
    return (areas[floor]||[]).reduce((s,a)=>s+getAreaTotalCost(a,materialMap),0);
  }
  const total = floors.reduce((s,f)=>s+floorTotal(f),0);

  return (
    <div style={{ fontSize:11, lineHeight:1.55 }}>
      {customer && (
        <div style={{ marginBottom:7, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
          <div style={{fontWeight:700,fontSize:12,color:C.ink}}>{customer.name}</div>
          {customer.phone        && <div style={{color:C.muted}}>{customer.phone}</div>}
          {customer.company_name && <div style={{color:C.muted}}>{customer.company_name}</div>}
          {customer.email        && <div style={{color:C.faint,fontSize:10}}>{customer.email}</div>}
        </div>
      )}
      {(projectName||projectAddress) && (
        <div style={{ marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}`,
            fontSize:11, color:C.muted }}>
          {projectName && <span style={{fontWeight:600,color:C.ink}}>{projectName} </span>}
          {projectAddress}
        </div>
      )}
      {(crewNotes.const_type||crewNotes.fire_blocking||crewNotes.ladder||
        crewNotes.parking||crewNotes.units||crewNotes.extra_notes) && (
        <div style={{ marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}`,
            fontSize:10, color:C.muted, lineHeight:1.6 }}>
          {crewNotes.const_type   && <div style={{fontWeight:700,color:C.ink}}>{crewNotes.const_type}</div>}
          {crewNotes.fire_blocking && <span>Fire Blocking: <b style={{color:C.ink}}>{crewNotes.fire_blocking}</b> · </span>}
          {crewNotes.ladder        && <span>Ladder: <b style={{color:C.ink}}>{crewNotes.ladder}</b> · </span>}
          {crewNotes.parking       && <span>Parking: <b style={{color:C.ink}}>{crewNotes.parking}</b></span>}
          {crewNotes.units         && <div>{crewNotes.units} units</div>}
          {crewNotes.extra_notes   && <div style={{marginTop:1,fontStyle:"italic"}}>{crewNotes.extra_notes}</div>}
        </div>
      )}

      {(()=>{
        const allAreas = floors.flatMap(floor=>
          (areas[floor]||[]).filter(a=>a.area_type&&a.sqft).map(a=>({...a,floor}))
        );
        if(!allAreas.length) return (
          <div style={{color:C.faint,fontSize:10,textAlign:"center",padding:"10px 0"}}>No areas yet</div>
        );

        // group by area_type + material specs — same specs across ALL floors merge into one line
        const groupMap = {};
        allAreas.forEach(a=>{
          const mls = (a.mat_lines&&a.mat_lines.length>0)
            ? a.mat_lines
            : [{material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||"",oc:a.oc||""}];
          const matKey = mls.map(ml=>[ml.material,ml.thickness_in,ml.r_value,ml.oc].join(":")).join("+");
          const key = a.area_type + "||||" + matKey;
          if(!groupMap[key]) groupMap[key]={
            area_type:a.area_type, floors:[], mat_lines:mls,
            totalSqft:0, totalCost:0,
            floorOrder: floors.indexOf(a.floor),
          };
          const g = groupMap[key];
          if(!g.floors.includes(a.floor)) g.floors.push(a.floor);
          if(floors.indexOf(a.floor) < g.floorOrder) g.floorOrder = floors.indexOf(a.floor);
          g.totalSqft += a.sqft||0;
          g.totalCost += getAreaTotalCost(a, materialMap);
        });

        // sort by top floor first
        const groups = Object.values(groupMap).sort((a,b)=>a.floorOrder-b.floorOrder);

        return groups.map((g,i)=>{
          const isCombo = g.mat_lines.length > 1;
          const thick = g.mat_lines[0]?.thickness_in||"";
          // floor label sorted by floor order
          const floorLabel = g.floors
            .sort((a,b)=>floors.indexOf(a)-floors.indexOf(b))
            .map(f=>f.replace(" Floor","")).join(", ");
          // material label
          const matLabel = isCombo
            ? g.mat_lines.map(ml=>((ml.material||"")+" "+(ml.r_value||"")).trim()).join(" · ")
            : ((g.mat_lines[0]?.material||"")+" "+(g.mat_lines[0]?.r_value||"")+" "+(g.mat_lines[0]?.oc||"")).trim();
          const {qty,unit} = calcArea(g.totalSqft, thick, materialMap[g.mat_lines[0]?.material]);

          return (
            <div key={i} style={{paddingBottom:5,marginBottom:5,borderBottom:`1px solid ${C.chip}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1,paddingRight:4,lineHeight:1.5}}>
                  {/* bold full line */}
                  <div style={{fontWeight:700,fontSize:12,color:C.ink}}>
                    {floorLabel} — {g.area_type}
                  </div>
                  <div style={{fontSize:10,color:C.muted,lineHeight:1.5}}>
                    {thick && <span>{thick} </span>}
                    {matLabel}
                    {" · "}{fmt(g.totalSqft)} ft²
                    {qty>0&&` → ${fmt(qty)} ${unit?.replace("_"," ")}`}
                  </div>
                </div>
                {g.totalCost>0 && (
                  <span style={{fontWeight:700,color:C.green,fontSize:12,flexShrink:0,paddingTop:2}}>
                    ${fmt(g.totalCost)}
                  </span>
                )}
              </div>
            </div>
          );
        });
      })()}

      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:6,
          borderTop:`2px solid ${C.ink}`, fontWeight:700 }}>
        <span style={{fontSize:12}}>Total</span>
        <span style={{fontSize:17,color:C.green}}>${fmt(total)}</span>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function isAreaComplete(area) {
  const lines = area.mat_lines && area.mat_lines.length > 0
    ? area.mat_lines : [{ material: area.material||"" }];
  return !!(area.area_type && lines[0].material && area.sqft > 0);
}

function getAreaTotalCost(area, materialMap) {
  const lines = area.mat_lines && area.mat_lines.length > 0
    ? area.mat_lines
    : [{ material:area.material||"", thickness_in:area.thickness_in||"",
         r_value:area.r_value||"", oc:area.oc||"" }];
  return lines.reduce((sum,ml)=>{
    const mat = materialMap[ml.material];
    return sum + calcArea(area.sqft, ml.thickness_in, mat).line_total;
  }, 0);
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProjectEstimate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { id: projectId } = useParams(); // set when editing existing project
  const leadId = searchParams.get("leadId");
  const resumeMode = searchParams.get("resume")==="1";
  const isEditing = !!projectId;

  const [floors, setFloors]           = useState(["Attic","3rd","2nd","1st","Basement"]);
  const [activeFloor, setActiveFloor] = useState("Attic");
  const [areas, setAreas]             = useState(()=>{ const i={}; DEFAULT_FLOORS.forEach(f=>{i[f]=[];}); return i; });
  const [materials, setMaterials]     = useState([]);
  const [leads, setLeads]             = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(leadId||"");
  const [projectName, setProjectName]       = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [crewNotes, setCrewNotes] = useState({
    const_type:"", fire_blocking:"", parking:"", ladder:"", units:"", extra_notes:"",
  });
  const [saving, setSaving]       = useState(false);
  const [draftKey, setDraftKey]   = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [saved, setSaved]         = useState(false);
  const [savedProjectId, setSavedProjectId] = useState(projectId||null);
  const [laborRoles, setLaborRoles] = useState([
    { role:"Lead Installer", hours:"8", days:"1", people:1, rate:55 },
    { role:"Helper",         hours:"8", days:"1", people:1, rate:35 },
    { role:"",               hours:"8", days:"1", people:1, rate:0  },
    { role:"",               hours:"8", days:"1", people:1, rate:0  },
  ]);
  const [laborLoaded, setLaborLoaded] = useState(false);
  const [jobMiles, setJobMiles]     = useState("");
  const [fuelRate, setFuelRate]     = useState(0.67);
  const [salesReps, setSalesReps]   = useState([]);
  const [selectedRep, setSelectedRep] = useState("");
  const [newFloorName, setNewFloorName] = useState("");
  const [addingFloor, setAddingFloor]   = useState(false);
  const [panelOpen, setPanelOpen]       = useState(false);
  const [loadingProject, setLoadingProject] = useState(isEditing);

  // ── Draft helpers ───────────────────────────────────────────
  function getDraftKey(leadId) {
    return `draft_estimate_${leadId||"new"}`;
  }

  function saveDraft() {
    if(!draftKey) return;
    const draft = {
      savedAt: new Date().toISOString(),
      selectedLeadId, projectName, projectAddress,
      crewNotes, floors, areas,
    };
    try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch(e) {}
  }

  function clearDraft() {
    if(draftKey) { try { localStorage.removeItem(draftKey); } catch(e) {} }
  }

  function loadDraft(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // Auto-save every 30 seconds
  useEffect(()=>{
    const interval = setInterval(()=>{
      if(selectedLeadId) saveDraftNow();
    }, 30000);
    return ()=>clearInterval(interval);
  },[selectedLeadId, projectName, projectAddress, crewNotes, floors, areas]);

  // Set draft key as soon as we have a lead
  useEffect(()=>{
    if(selectedLeadId){
      const key = getDraftKey(selectedLeadId);
      setDraftKey(key);
    }
  },[selectedLeadId, projectAddress]);

  // Restore draft immediately on mount if resume=1
  useEffect(()=>{
    if(resumeMode && leadId){
      const key = getDraftKey(leadId);
      const draft = loadDraft(key);
      if(draft){
        if(draft.crewNotes) setCrewNotes(draft.crewNotes);
        if(draft.floors?.length) setFloors(draft.floors);
        if(draft.areas) setAreas(draft.areas);
        if(draft.projectName) setProjectName(draft.projectName);
        if(draft.projectAddress) setProjectAddress(draft.projectAddress);
        setDraftRestored(true);
      }
    }
  },[]);

  useEffect(()=>{
    supabase.from("materials").select("*").then(({data,error})=>{
      if(error) console.error("materials error:",error);
      if(data) setMaterials(data);
    });
    loadLeads();
    // load settings (labor, fuel, sales reps)
    supabase.auth.getUser().then(async({data:{user}})=>{
      if(!user) return;
      const {data:cd} = await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      if(!cd) return;

      // labor roles
      const {data:roles} = await supabase.from("cost_settings").select("*")
        .eq("company_id",cd.id).eq("period","labor_role").order("sort_order");
      if(roles?.length){
        const filled = roles.map(r=>({role:r.name,hours:"8",days:"1",people:1,rate:Number(r.amount||0)}));
        while(filled.length<4) filled.push({role:"",hours:"8",days:"1",people:1,rate:0});
        setLaborRoles(filled);
      }

      // fuel rate
      const {data:fuel} = await supabase.from("cost_settings").select("*")
        .eq("company_id",cd.id).eq("period","fuel").maybeSingle();
      if(fuel) setFuelRate(Number(fuel.amount||0.67));

      // sales reps
      const {data:reps} = await supabase.from("sales_reps").select("*")
        .eq("company_id",cd.id).eq("active",true).order("created_at");
      if(reps?.length) setSalesReps(reps);

      setLaborLoaded(true);
    });

  },[]);

  function loadLeads() {
    supabase.from("customers").select("id,name,phone,address,email,company_name")
      .order("name").then(({data,error})=>{
        if(error){ console.error("leads error:", JSON.stringify(error)); return; }
        if(data) setLeads(data);
      });
  }

  // load existing project when editing
  useEffect(()=>{
    if(!projectId || !leads.length) return;
    async function loadProject() {
      setLoadingProject(true);
      const { data:proj } = await supabase.from("projects")
        .select("*").eq("id", projectId).single();
      if(!proj){ setLoadingProject(false); return; }

      setProjectName(proj.name||"");
      setProjectAddress(proj.address||"");
      if(proj.lead_id) setSelectedLeadId(String(proj.lead_id));

      // load floors
      const { data:floorRows } = await supabase.from("floors")
        .select("*").eq("project_id", projectId).order("order_index");
      if(!floorRows?.length){ setLoadingProject(false); return; }

      const floorNames = floorRows.map(f=>f.name);
      setFloors(floorNames);
      setActiveFloor(floorNames[0]);

      // load areas
      const { data:areaRows } = await supabase.from("areas")
        .select("*").eq("project_id", projectId).order("order_index");

      // load segments
      const areaIds = (areaRows||[]).map(a=>a.id);
      let segRows = [];
      if(areaIds.length){
        const { data:segs } = await supabase.from("segments")
          .select("*").in("area_id", areaIds);
        segRows = segs||[];
      }

      // build areas state grouped by floor
      const newAreas = {};
      floorNames.forEach(f=>{ newAreas[f]=[]; });

      // group area rows by floor, handle combos (same floor+area_type+sqft = combo)
      const comboMap = {};
      (areaRows||[]).forEach(a=>{
        const fl = floorRows.find(f=>f.id===a.floor_id);
        if(!fl) return;
        const comboKey = `${a.floor_id}|${a.area_type}|${a.sqft}`;
        if(!comboMap[comboKey]){
          const measurements = segRows
            .filter(s=>s.area_id===a.id)
            .map(s=>({ h:s.height, l:s.length, q:1, sqft:s.sqft }));
          comboMap[comboKey] = {
            temp_id: a.id,
            floor: fl.name,
            area_type: a.area_type,
            material: a.material||"",
            thickness_in: a.thickness_in||"",
            r_value: a.r_value||"",
            oc: a.oc||"",
            sqft: a.sqft||0,
            measurements,
            mh:"", ml:"", mq:"1",
            deduct_sqft:"",
            _collapsed: true,
            options: Array.isArray(a.options) ? a.options :
              (typeof a.options === 'string' ? JSON.parse(a.options||'[]') : []),
            mat_lines: [{
              id:1, material:a.material||"",
              thickness_in:a.thickness_in||"",
              r_value:a.r_value||"", oc:a.oc||""
            }]
          };
        } else {
          // add to combo
          comboMap[comboKey].mat_lines.push({
            id: comboMap[comboKey].mat_lines.length+1,
            material:a.material||"",
            thickness_in:a.thickness_in||"",
            r_value:a.r_value||"", oc:a.oc||""
          });
          comboMap[comboKey].material = "__combo__";
        }
      });

      Object.values(comboMap).forEach(area=>{
        if(newAreas[area.floor]) newAreas[area.floor].push(area);
      });

      setAreas(newAreas);
      setLoadingProject(false);
    }
    loadProject();
  },[projectId, leads]);

  // Check for existing draft when lead changes
  useEffect(()=>{
    if(!isEditing && selectedLeadId){
      const key = getDraftKey(selectedLeadId);
      const draft = loadDraft(key);
      if(draft && !draftRestored){
        const age = Math.round((Date.now()-new Date(draft.savedAt).getTime())/60000);
        const areaCount = Object.values(draft.areas||{}).flat().filter(a=>a.area_type).length;
        // auto-restore if came from resume button, otherwise ask
        const shouldRestore = resumeMode || (areaCount>0 && window.confirm(
          `You have a draft from ${age} min ago with ${areaCount} area(s). Resume it?`
        ));
        if(shouldRestore){
          if(draft.crewNotes) setCrewNotes(draft.crewNotes);
          if(draft.floors) setFloors(draft.floors);
          if(draft.areas) setAreas(draft.areas);
          if(draft.projectName) setProjectName(draft.projectName);
          if(draft.projectAddress && !projectAddress) setProjectAddress(draft.projectAddress);
          setDraftRestored(true);
        }
      }
    }
  },[selectedLeadId, projectAddress]);

  // Save draft when customer changes (debounced for address)
  useEffect(()=>{
    if(!isEditing && selectedLeadId){
      const t = setTimeout(()=>saveDraftNow(), 1500);
      return ()=>clearTimeout(t);
    }
  },[selectedLeadId, projectAddress, projectName]);

  useEffect(()=>{
    if(!isEditing && leadId&&leads.length>0){
      const l=leads.find(l=>String(l.id)===String(leadId));
      if(l){
        setSelectedLeadId(String(l.id));
        setProjectName(l.name||"");
        setProjectAddress(l.address||"");
      }
    }
  },[leadId,leads]);

  const materialMap  = useMemo(()=>Object.fromEntries(materials.map(m=>[m.name,m])),[materials]);
  const selectedLead = leads.find(l=>String(l.id)===String(selectedLeadId));

  function floorTotal(floor) {
    return (areas[floor]||[]).reduce((s,a)=>s+getAreaTotalCost(a,materialMap),0);
  }
  const projectTotal = floors.reduce((s,f)=>s+floorTotal(f),0);

  function addFloor() {
    const name=newFloorName.trim(); if(!name) return;
    setFloors(p=>[...p,name]);
    setAreas(p=>({...p,[name]:[]}));
    setActiveFloor(name); setNewFloorName(""); setAddingFloor(false);
  }

  function addArea(floor) {
    setAreas(prev=>{
      const ex = prev[floor]||[];
      // collapse all complete areas
      const collapsed = ex.map(a=>
        isAreaComplete(a) ? {...a,_collapsed:true} : a
      );
      const last = collapsed[collapsed.length-1];
      const n = last
        ? {...last, temp_id:Date.now(), sqft:0, measurements:[], mh:"", ml:"", mq:"1", deduct_sqft:"", _collapsed:false, options:[]}
        : { temp_id:Date.now(), floor, area_type:"", material:"", thickness_in:"", r_value:"",
            oc:"", sqft:0, measurements:[], mh:"", ml:"", mq:"1", deduct_sqft:"", _collapsed:false, options:[] };
      return {...prev, [floor]:[...collapsed, n]};
    });
  }

  // Save draft immediately — called on any meaningful change
  function saveDraftNow(overrideAreas, overrideFloors) {
    if(!selectedLeadId) return;
    const key = getDraftKey(selectedLeadId);
    try {
      const draft = {
        savedAt: new Date().toISOString(),
        selectedLeadId, projectName, projectAddress,
        crewNotes,
        floors: overrideFloors || floors,
        areas: overrideAreas || areas,
      };
      localStorage.setItem(key, JSON.stringify(draft));
      if(!draftKey) setDraftKey(key);
    } catch(e) {}
  }

  function updateArea(floor,idx,field,value) {
    setAreas(prev=>{
      const upd=[...(prev[floor]||[])];
      const existing = prev[floor][idx]||{};
      upd[idx]={...existing,[field]:value};
      // save draft immediately
      if(selectedLeadId) saveDraftNow({...prev,[floor]:upd});
      // always preserve options unless explicitly updating them
      if(field!=="options") upd[idx].options = existing.options||[];
      if(field==="area_type"){
        const match=Object.values(prev).flat().reverse().find(a=>a.area_type===value&&a.material);
        if(match){
          upd[idx]={...upd[idx],
            material:match.material,
            thickness_in:match.thickness_in,
            r_value:match.r_value,
            oc:match.oc,
            mat_lines: match.mat_lines ? match.mat_lines.map(ml=>({...ml})) : undefined,
            options: existing.options||[],
          };
        }
      }
      return {...prev,[floor]:upd};
    });
  }

  function deleteArea(floor,idx) {
    setAreas(prev=>({...prev,[floor]:prev[floor].filter((_,i)=>i!==idx)}));
  }

  async function saveNewCustomer(form) {
    // get company_id so new customer is visible with RLS
    let companyId = null;
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      const { data:companyData } = await supabase.from("companies")
        .select("id").eq("user_id", user.id).maybeSingle();
      companyId = companyData?.id || null;
    } catch(e) { console.error("company lookup error:", e); }

    const payload = {
      name:form.name||"", phone:form.phone||"", company_name:form.company_name||"",
      email:form.email||"", address:form.address||"", status:"New",
      estimate_amount:0, company_id:companyId,
    };
    const {data,error}=await supabase.from("customers").insert([payload]).select().single();
    if(error){
      console.error("saveNewCustomer error:",JSON.stringify(error));
      alert("Could not save customer: "+(error.message||JSON.stringify(error)));
      return;
    }
    if(data){
      loadLeads();
      setSelectedLeadId(String(data.id));
      setProjectName(data.name||"");
      setProjectAddress(data.address||"");
    }
  }

  // ── Pricing Engine ──────────────────────────────────────────────────────────
  async function calculateJobPrice(companyId, allAreas, totalSqft) {
    // 1. Load cost settings
    const [
      { data:matCosts },
      { data:overheadCosts },
      { data:consumables },
    ] = await Promise.all([
      supabase.from("material_costs").select("*").eq("company_id", companyId),
      supabase.from("cost_settings").select("*").eq("company_id", companyId)
        .not("period","eq","job_consumable"),
      supabase.from("cost_settings").select("*").eq("company_id", companyId)
        .eq("period","job_consumable"),
    ]);

    const matCostMap = {};
    (matCosts||[]).forEach(m=>{ matCostMap[m.material_name]=m; });

    // 2. Calculate material cost
    let materialCost = 0;
    const THICK_MAP_LOCAL = {"2x4":3.5,"2x6":5.5,"2x8":7.25,"2x10":9.25,"2x12":11.25,"I-joist":11.875};
    allAreas.forEach(a=>{
      const mc = matCostMap[a.material];
      if(!mc) return;
      const thick = THICK_MAP_LOCAL[a.thickness_in]||0;
      let qty = mc.unit==="board_ft" ? (a.sqft||0)*thick
              : mc.unit==="bag" ? Math.ceil(((a.sqft||0)*thick)/(mc.coverage_factor||1))
              : (a.sqft||0);
      const cost = qty * Number(mc.cost_per_unit||0);
      const sell = cost * (1 + Number(mc.markup_pct||0)/100);
      materialCost += sell;
    });

    // 3. Calculate overhead per job
    const totalMonthly = (overheadCosts||[]).reduce((s,c)=>s+Number(c.amount||0),0);
    // estimate jobs per month from company settings or default 20
    const jobsPerMonth = 20;
    const overheadCost = totalMonthly / jobsPerMonth;

    // 4. Calculate consumables scaled by sqft
    // average job sqft = 1000 (default until we have history)
    const avgJobSqft = 1000;
    const consumableCost = (consumables||[]).reduce((s,c)=>{
      const baseAmount = Number(c.amount||0);
      const scaled = totalSqft > 0 ? baseAmount * (totalSqft / avgJobSqft) : baseAmount;
      return s + scaled;
    }, 0);

    // 5. Labor — use defaults from settings (for now use crew notes or defaults)
    const laborHours = 0; // will be entered manually for now
    const laborCost = 0;

    // 6. Total cost and final price
    const totalCost = materialCost + overheadCost + consumableCost + laborCost;
    const margin = 30; // default — will come from settings later
    const finalPrice = totalCost * (1 + margin/100);

    return {
      material_cost: Math.round(materialCost * 100)/100,
      overhead_cost: Math.round(overheadCost * 100)/100,
      labor_cost: laborCost,
      final_price: Math.round(finalPrice * 100)/100,
      profit_margin_pct: margin,
      grand_total: Math.round(finalPrice * 100)/100,
    };
  }

  // Save options only — updates existing areas without creating new version
  async function saveOptionsOnly() {
    if(saving) return;
    setSaving(true);
    try {
      // get all area rows for this project
      const { data:existingAreas } = await supabase.from("areas")
        .select("id,area_type,sqft,floor_id,order_index")
        .eq("project_id", savedProjectId||projectId)
        .order("order_index");
      if(!existingAreas?.length){ setSaving(false); return; }

      // match areas by area_type and sqft, update options
      for(const floor of floors){
        for(const a of (areas[floor]||[])){
          if(!isAreaComplete(a)) continue;
          const match = existingAreas.find(ea=>
            ea.area_type===a.area_type && Math.abs(ea.sqft - a.sqft)<0.01
          );
          if(match && (a.options||[]).length>0){
            await supabase.from("areas").update({
              options: a.options||[]
            }).eq("id", match.id);
          }
        }
      }
      setSaved(true);
      setTimeout(()=>setSaved(false),2000);
    } catch(err){ alert("Error saving options: "+err.message); }
    setSaving(false);
  }

  async function saveProject() {
    if(saving) return;  // prevent double-tap
    if(!selectedLeadId){
      alert("Please select or register a customer before saving.");
      return;
    }
    const hasAreas = floors.some(f=>(areas[f]||[]).some(a=>isAreaComplete(a)));
    if(!hasAreas){
      alert("Add at least one area before saving.");
      return;
    }
    setSaving(true);
    try {
      // get company_id
      const { data:{ user } } = await supabase.auth.getUser();
      const { data:companyData } = await supabase.from("companies")
        .select("id").eq("user_id", user.id).maybeSingle();
      const companyId = companyData?.id || null;

      const {data:proj,error:pe}=await supabase.from("projects").insert([{
        lead_id:selectedLeadId?Number(selectedLeadId):null,
        name:projectName||"New Project", address:projectAddress||"",
        status:"Active", source:"field", company_id:companyId,
      }]).select().single();
      if(pe) throw pe;

      const {data:floorRows}=await supabase.from("floors")
        .insert(floors.map((name,i)=>({
          project_id:proj.id, name, order_index:i+1, company_id:companyId,
        }))).select();
      const floorMap={};
      (floorRows||[]).forEach(f=>{floorMap[f.name]=f.id;});

      const allAreas=floors.flatMap(floor=>
        (areas[floor]||[]).filter(a=>a.area_type&&a.sqft).flatMap((a,i)=>{
          const mls = (a.mat_lines&&a.mat_lines.length>0)
            ? a.mat_lines
            : [{material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||"",oc:a.oc||""}];
          return mls.map((ml,mi)=>{
            const mat=materialMap[ml.material];
            const {qty,unit,unit_price,line_total}=calcArea(a.sqft,ml.thickness_in,mat);
            return { project_id:proj.id, floor_id:floorMap[floor],
              area_type:a.area_type, material:ml.material, thickness_in:ml.thickness_in||null,
              r_value:ml.r_value, sqft:a.sqft, qty, unit, unit_price, line_total,
              order_index:i*10+mi, company_id:companyId,
              options: mi===0 ? (a.options||[]) : [] };
          });
        })
      );
      if(allAreas.length>0){
        const {data:areaRows,error:ae}=await supabase.from("areas").insert(allAreas).select();
        if(ae) throw ae;
        const segs=[];
        let ai=0;
        floors.forEach(floor=>{
          (areas[floor]||[]).filter(a=>a.area_type&&a.sqft).forEach(a=>{
            const sv=areaRows?.[ai++]; if(!sv) return;
            (a.measurements||[]).forEach(m=>segs.push({
              area_id:sv.id, height:m.h, length:m.l,
              sqft:m.sqft, source:"field", company_id:companyId,
            }));
          });
        });
        if(segs.length>0) await supabase.from("segments").insert(segs);
      }
      // calculate final price from cost settings
      const allAreasList = floors.flatMap(floor=>
        (areas[floor]||[]).filter(a=>a.area_type&&a.sqft).flatMap(a=>{
          const mls = (a.mat_lines&&a.mat_lines.length>0)
            ? a.mat_lines
            : [{material:a.material||"",thickness_in:a.thickness_in||""}];
          return mls.map(ml=>({...a, material:ml.material, thickness_in:ml.thickness_in}));
        })
      );
      // calculate labor cost from all roles
      const finalLaborCost = laborRoles.reduce((s,r)=>
        s + Number(r.hours||0)*Number(r.days||1)*Number(r.people||1)*Number(r.rate||0), 0);
      const pricing = await calculateJobPrice(companyId, allAreasList, projectTotal>0?projectTotal:0);

      // fuel cost (round trip)
      const fuelCostCalc = Number(jobMiles||0) * 2 * fuelRate;

      // depreciation per job
      const {data:assetList} = await supabase.from("assets").select("*").eq("company_id",companyId);
      const monthlyDepr = (assetList||[]).reduce((s,a)=>{
        const annual=(Number(a.purchase_price||0)-Number(a.salvage_value||0))/Number(a.useful_life_years||5);
        return s+annual/12;
      },0);
      const depreciationCost = monthlyDepr/20;

      // commission
      const repData = selectedRep ? salesReps.find(r=>r.id===selectedRep) : null;
      const commissionPct = repData ? Number(repData.commission_pct||0) : 0;
      const totalCostWithLabor = pricing.material_cost + pricing.overhead_cost + finalLaborCost + fuelCostCalc + depreciationCost;
      const basePriceWithMargin = totalCostWithLabor * (1 + (pricing.profit_margin_pct||30)/100);
      const commissionCost = basePriceWithMargin * commissionPct/100;
      const finalPriceWithLabor = basePriceWithMargin + commissionCost;

      if(selectedLeadId) await supabase.from("customers")
        .update({estimate_amount:Math.round(finalPriceWithLabor*100)/100}).eq("id",selectedLeadId);
      // collect all area options for storage
      const allOptions = floors.flatMap(floor=>
        (areas[floor]||[]).filter(a=>a.area_type&&a.sqft&&(a.options||[]).length>0)
          .map(a=>({ area_type:a.area_type, floor, sqft:a.sqft,
            options:a.options, mat_lines:a.mat_lines }))
      );

      await supabase.from("quotes").insert([{
        project_id:proj.id,
        subtotal: pricing.material_cost,
        tax_rate:0, tax_total:0,
        grand_total: Math.round(finalPriceWithLabor*100)/100,
        final_price: Math.round(finalPriceWithLabor*100)/100,
        material_cost: pricing.material_cost,
        overhead_cost: pricing.overhead_cost,
        labor_cost: Math.round(finalLaborCost*100)/100,
        labor_hours: laborRoles.reduce((s,r)=>s+Number(r.hours||0)*Number(r.days||1)*Number(r.people||1),0),
        crew_size: laborRoles.filter(r=>Number(r.hours||0)>0).length,
        labor_rate: laborRoles.find(r=>Number(r.hours||0)>0)?.rate||45,
        profit_margin_pct: pricing.profit_margin_pct,
        fuel_cost: Math.round(fuelCostCalc*100)/100,
        commission_cost: Math.round(commissionCost*100)/100,
        commission_pct: commissionPct,
        job_miles: Number(jobMiles||0),
        sales_rep_id: selectedRep||null,
        notes: allOptions.length>0 ? JSON.stringify(allOptions) : null,
        status:"Draft", company_id:companyId,
      }]);
      setSaved(true);
      setSavedProjectId(proj.id);
      clearDraft(); // draft saved successfully
    } catch(err) {
      console.error(err); alert("Error: "+(err.message||JSON.stringify(err)));
    } finally { setSaving(false); }
  }

  const currentAreas = areas[activeFloor]||[];
  const panelProps = { floors, areas, materialMap, crewNotes, projectName, projectAddress, customer:selectedLead };

  useEffect(()=>{
    if(saved){ const t=setTimeout(()=>setSaved(false),3000); return ()=>clearTimeout(t); }
  },[saved]);

  if(loadingProject) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",
        justifyContent:"center",fontFamily:"system-ui",color:"#64748b"}}>
      Loading estimate…
    </div>
  );

  return (
    <div style={{fontFamily:"system-ui,sans-serif",color:C.ink,background:C.bg,
        minHeight:"100%",display:"flex",flexDirection:"column",
        WebkitOverflowScrolling:"touch"}}>

      {saved && (
        <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",
            zIndex:300,display:"flex",alignItems:"center",gap:10,
            background:"#059669",color:"#fff",padding:"8px 16px",
            borderRadius:20,fontSize:12,fontWeight:700,
            boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>
          <span>✅ Saved!</span>
          {savedProjectId && (
            <>
              <button onClick={()=>navigate(`/field-report/${savedProjectId}`)}
                style={{background:"#3b82f6",color:"white",border:"none",
                  borderRadius:12,padding:"3px 10px",fontSize:11,
                  fontWeight:700,cursor:"pointer"}}>
                📋 Office Report
              </button>
              <button onClick={()=>navigate(`/quote/${savedProjectId}`)}
                style={{background:"white",color:"#059669",border:"none",
                  borderRadius:12,padding:"3px 10px",fontSize:11,
                  fontWeight:700,cursor:"pointer"}}>
                📄 Quote
              </button>
            </>
          )}
        </div>
      )}

      {/* top bar */}
      <div style={{position:"sticky",top:0,zIndex:100,background:C.white,
          borderBottom:`1px solid ${C.border}`,padding:"8px 12px",
          display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <span style={{fontWeight:700,fontSize:14,flex:1,
            overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
          {isEditing ? "✏️ Edit Estimate" : (projectName||"New Project")}
        </span>
        <div style={{display:"flex",gap:6}}>
          {savedProjectId && (
            <>
              <button onClick={()=>navigate(`/field-report/${savedProjectId}`)}
                style={{...BtnD,background:"#3b82f6",height:32,fontSize:12,padding:"0 10px",borderRadius:8}}>
                📋 Office
              </button>
              <button onClick={()=>navigate(`/quote-pricing/${savedProjectId}`)}
                style={{...BtnD,background:"#f97316",height:32,fontSize:12,padding:"0 10px",borderRadius:8}}>
                📄 Quote
              </button>
            </>
          )}

          <button onClick={saveProject} disabled={saving}
            style={{...BtnD, fontSize:13, height:32, padding:"0 14px",
              background:saving?"#64748b":C.ink, borderRadius:8,
              opacity:!selectedLeadId?0.4:1}}>
            {saving?"…":"Save"}
          </button>
        </div>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* entry form */}
        <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"8px 12px 200px 12px",minWidth:0,boxSizing:"border-box",width:"100%"}}>

          <CustomerSection
            key={selectedLeadId||"none"}
            leads={leads}
            selectedLead={selectedLead}
            selectedLeadId={selectedLeadId}
            projectAddress={projectAddress}
            projectName={projectName}
            onSelect={(lead)=>{ setSelectedLeadId(String(lead.id)); setProjectName(lead.name||""); setProjectAddress(""); }}
            onClear={()=>{ setSelectedLeadId(""); setProjectName(""); setProjectAddress(""); }}
            onSaveNew={saveNewCustomer}
            onAddressChange={setProjectAddress}
            onNameChange={setProjectName}
          />

          {/* crew notes */}
          <div style={CARD_ORANGE}>
            {/* row 1: job type + ladder */}
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <select style={{...S,flex:1,height:32,fontSize:12}} value={crewNotes.const_type}
                onChange={e=>setCrewNotes(p=>({...p,const_type:e.target.value}))}>
                <option value="">Job type…</option>
                {CONST_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
              <select style={{...S,flex:1,height:32,fontSize:12}} value={crewNotes.ladder}
                onChange={e=>setCrewNotes(p=>({...p,ladder:e.target.value}))}>
                <option value="">Ladder…</option>
                {LADDER_OPTS.map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
            {/* row 2: fire block + parking + units */}
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>FireBlock</span>
              {["Yes","No"].map(v=>(
                <button key={v} onClick={()=>setCrewNotes(p=>({...p,fire_blocking:v}))}
                  style={{...Btn,height:30,fontSize:12,padding:"0 10px",
                    background:crewNotes.fire_blocking===v?C.ink:C.white,
                    color:crewNotes.fire_blocking===v?"#fff":C.muted,
                    borderColor:crewNotes.fire_blocking===v?C.ink:C.border}}>
                  {v}
                </button>
              ))}
              <span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",marginLeft:4}}>Park</span>
              {["Yes","No"].map(v=>(
                <button key={v} onClick={()=>setCrewNotes(p=>({...p,parking:v}))}
                  style={{...Btn,height:30,fontSize:12,padding:"0 10px",
                    background:crewNotes.parking===v?C.ink:C.white,
                    color:crewNotes.parking===v?"#fff":C.muted,
                    borderColor:crewNotes.parking===v?C.ink:C.border}}>
                  {v}
                </button>
              ))}
              <input placeholder="Units" value={crewNotes.units}
                onChange={e=>setCrewNotes(p=>({...p,units:e.target.value}))}
                style={{...I,flex:1,height:30,fontSize:12}} />
            </div>
            {/* row 3: notes */}
            <input placeholder="Other info for crew…" value={crewNotes.extra_notes}
              onChange={e=>setCrewNotes(p=>({...p,extra_notes:e.target.value}))}
              style={{...I,width:"100%",height:30,fontSize:12}} />
          </div>

          {/* floor tabs */}
          <div style={{display:"flex",gap:3,overflowX:"auto",paddingBottom:3,
              marginBottom:5,WebkitOverflowScrolling:"touch",alignItems:"center",
              maxWidth:"100%"}}>
            {floors.map(floor=>{
              const cnt=(areas[floor]||[]).length;
              const tot=floorTotal(floor);
              const act=activeFloor===floor;
              return (
                <button key={floor} onClick={()=>setActiveFloor(floor)}
                  className="floor-btn"
                  style={{flexShrink:0,padding:"8px 14px",borderRadius:8,height:"auto",
                    border:act?"2px solid #059669":"2px solid #86efac",
                    background:act?"#059669":C.white,color:act?"#fff":"#059669",
                    cursor:"pointer",fontSize:14,fontWeight:700,whiteSpace:"nowrap",
                    boxShadow:act?"0 2px 8px rgba(5,150,105,.3)":"none"}}>
                  {floor}
                </button>
              );
            })}
            {addingFloor ? (
              <div style={{display:"flex",gap:3,flexShrink:0}}>
                <input autoFocus placeholder="Name" value={newFloorName}
                  onChange={e=>setNewFloorName(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter")addFloor();if(e.key==="Escape")setAddingFloor(false);}}
                  style={{...I,width:75}} />
                <button onClick={addFloor} style={{...BtnD,padding:"0 6px"}}>✓</button>
                <button onClick={()=>setAddingFloor(false)} style={{...Btn,padding:"0 5px"}}>✕</button>
              </div>
            ) : (
              <button onClick={()=>setAddingFloor(true)}
                className="floor-btn"
                style={{flexShrink:0,padding:"8px 14px",borderRadius:8,height:"auto",
                  border:"2px dashed #86efac",background:"none",color:"#059669",
                  cursor:"pointer",fontSize:14,fontWeight:700,whiteSpace:"nowrap"}}>
                + Floor
              </button>
            )}
          </div>

          {/* add area — TOP */}
          <button onClick={()=>addArea(activeFloor)}
            style={{width:"100%",padding:"7px",borderRadius:7,
              border:`1px dashed ${C.border}`,background:C.white,color:C.muted,
              cursor:"pointer",fontSize:11,fontWeight:600,marginBottom:6,height:"auto"}}>
            + Add area to {activeFloor}
          </button>

          {currentAreas.length===0 ? (
            <div style={{textAlign:"center",padding:"14px",color:C.faint,fontSize:11,
                background:C.white,borderRadius:7,border:`1px solid ${C.border}`,marginBottom:5}}>
              No areas for {activeFloor} — tap above to add one
            </div>
          ) : (
            <>
              {/* incomplete first */}
              {currentAreas.map((area,idx)=>({area,idx}))
                .filter(({area})=>!isAreaComplete(area))
                .map(({area,idx})=>(
                  <AreaRow key={area.id||area.temp_id} area={area} materials={materials}
                    onChange={(field,value)=>updateArea(activeFloor,idx,field,value)}
                    onDelete={()=>deleteArea(activeFloor,idx)}
                    saveOptionsOnly={saveOptionsOnly} />
                ))}
              {/* completed label */}
              {currentAreas.some(a=>isAreaComplete(a)) && (
                <div style={{fontSize:9,fontWeight:700,color:"#059669",
                    textTransform:"uppercase",letterSpacing:0.5,
                    marginBottom:4,marginTop:2,paddingLeft:2}}>
                  ✓ Completed areas
                </div>
              )}
              {/* complete last */}
              {currentAreas.map((area,idx)=>({area,idx}))
                .filter(({area})=>isAreaComplete(area))
                .map(({area,idx})=>(
                  <AreaRow key={area.id||area.temp_id} area={area} materials={materials}
                    onChange={(field,value)=>updateArea(activeFloor,idx,field,value)}
                    onDelete={()=>deleteArea(activeFloor,idx)}
                    saveOptionsOnly={saveOptionsOnly} />
                ))}
            </>
          )}

          {currentAreas.length>0 && (
            <div style={{display:"flex",justifyContent:"space-between",
                padding:"4px 8px",background:C.white,borderRadius:6,
                border:`1px solid ${C.border}`,marginBottom:5,fontSize:11}}>
              <span style={{color:C.muted,fontWeight:600}}>{activeFloor} subtotal</span>
              <span style={{fontWeight:700}}>${fmt(floorTotal(activeFloor))}</span>
            </div>
          )}
        </div>

        {/* side panel — desktop only */}
        <div className="estimate-side-panel" style={{
          width:220, flexShrink:0, borderLeft:`1px solid ${C.border}`,
          background:C.white, overflowY:"auto", padding:"10px 10px 20px",
        }}>
          <div style={{fontSize:10,fontWeight:800,color:C.faint,textTransform:"uppercase",
              letterSpacing:0.5,marginBottom:8}}>Estimate</div>
          <EstimatePanel {...panelProps} />
        </div>
      </div>

      {/* bottom panel — mobile only, always visible */}
      <div className="estimate-bottom-panel" style={{
        position:"fixed", bottom:0, left:0, right:0, zIndex:200,
        background:C.white, borderTop:`2px solid ${C.border}`,
        boxShadow:"0 -2px 12px rgba(0,0,0,.08)",
      }}>
        <div onClick={()=>setPanelOpen(p=>!p)}
          style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"5px 12px", cursor:"pointer",
            borderBottom: panelOpen?`1px solid ${C.border}`:"none" }}>
          <span style={{fontSize:10,fontWeight:800,color:C.faint,textTransform:"uppercase",letterSpacing:0.5}}>
            Estimate
          </span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:13,fontWeight:800,color:C.green}}>${fmt(projectTotal)}</span>
            <span style={{fontSize:9,color:C.faint}}>{panelOpen?"▼":"▲"}</span>
          </div>
        </div>
        {panelOpen && (
          <div style={{maxHeight:"45vh",overflowY:"auto",padding:"8px 12px 24px"}}>
            <EstimatePanel {...panelProps} />
          </div>
        )}
      </div>

      <style>{`
        @media (min-width: 900px) { .estimate-bottom-panel { display: none !important; } }
        @media (max-width: 899px) { .estimate-side-panel   { display: none !important; } }
        @media (max-width: 899px) {
          .floor-btn { padding: 5px 10px !important; font-size: 12px !important; }
        }
        @media (min-width: 900px) {
          .area-hl-input { height: 22px !important; font-size: 11px !important; }
          .area-mq-input { height: 22px !important; font-size: 11px !important; width: 30px !important; }
          .area-deduct   { height: 22px !important; font-size: 11px !important; width: 52px !important; }
          .area-select   { height: 22px !important; font-size: 11px !important; }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        @media (max-width: 899px) {
          input, select, textarea {
            font-size: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
