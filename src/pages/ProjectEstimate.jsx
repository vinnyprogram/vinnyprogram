import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { enqueue, flushQueue } from "../utils/offlineQueue";
import AddressInput from "./AddressInput";

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
const CARD_BLUE = {
  background: "#eff6ff", borderRadius: 8, padding: "7px 9px",
  border: `1.5px solid #93c5fd`, marginBottom: 5,
};
const CARD_ORANGE = {
  background: "#fff7ed", borderRadius: 8, padding: "7px 9px",
  border: `1.5px solid #fed7aa`, marginBottom: 5,
};

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const DEFAULT_FLOORS = ["Attic","3rd","2nd","1st","Basement","Crawlspace"];
const AREA_TYPES = [
  "Roof Rafter w/ Strapping","Roof Rafter behind knee walls","Floor",
  "Exterior Wall","Demising Wall","Rim Joist","Concrete Wall",
  "Ceiling","Interior Walls","Fire Blocking","Other",
];
const THICK_OPTS = ["2x3","2x4","2x6","2x8","2x10","2x12","I-joist 14in","I-joist 16in","I-joist 18in"];
const THICK_MAP  = { "2x4":3.5,"2x6":5.5,"2x8":7.25,"2x10":9.25,"2x12":11.25,"I-joist":11.875 };
const R_VALS     = ["R-11","R-13","R-15","R-19","R-21","R-28","R-30","R-38","R-49","R-60"];
function loadCustomList(key, defaults) {
  try {
    const stored = JSON.parse(localStorage.getItem(key)||"[]");
    return [...new Set([...defaults, ...stored])];
  } catch(e){ return defaults; }
}
function saveCustomListItem(key, value) {
  try {
    const stored = JSON.parse(localStorage.getItem(key)||"[]");
    if(!stored.includes(value)){
      stored.push(value);
      localStorage.setItem(key, JSON.stringify(stored));
    }
  } catch(e){}
}
const OC_OPTS    = ['3"cc','7"oc','8"oc','12"oc','16"oc','24"oc','open cell'];
const CONST_TYPES = ["New Construction","Remodeling","Addition","Existing Construction","Renovation","Commercial","Other"];
const LADDER_OPTS = ["5ft","7ft","10ft","12ft","16ft","20ft","Lift","No ladder needed"];

function parseRValueNumber(rValue){
  if(!rValue) return 0;
  const m = String(rValue).match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function calcArea(sqft, thick, mat, rValue, variantMap) {
  if (!sqft || !mat) return { qty:0, unit:"-", line_total:0, unit_price:0 };
  // Per-R-value product lookup (new system) — find the best product for this R-value
  if(mat.allProducts?.length>0 && rValue){
    const rStr = String(rValue).toLowerCase().replace(/[^0-9.]/g,"");
    const rMatch = mat.allProducts.find(p=>p.is_active && p.r_value &&
      String(p.r_value).toLowerCase().replace(/[^0-9.]/g,"")===rStr);
    const prod = rMatch || mat.allProducts.find(p=>p.is_active&&!p.r_value) || mat.allProducts.find(p=>p.is_active);
    if(prod){
      const cost = Number(prod.cost_per_unit||0);
      const rpi = mat.r_per_inch||0;
      const t = (mat.unit==="board_ft"||mat.unit==="bag") && rpi>0
        ? parseRValueNumber(rValue)/rpi
        : (THICK_MAP[thick]||0);
      const u = mat.unit;
      const cov = Number(prod.coverage_factor||1);
      let q = u==="board_ft"?sqft*t : u==="bag"?Math.ceil((sqft*t)/cov) : sqft;
      q = Math.round(q);
      return { qty:q, unit:u, unit_price:cost, line_total:Math.round(q*cost*100)/100 };
    }
  }
  // Variant pricing (existing batt/rigid flat $/sqft per R-value)
  if(variantMap && mat.name){
    const variant = variantMap[`${mat.name}|${rValue||""}`.toLowerCase()];
    if(variant){
      const sellPrice = Number(variant.cost_per_sqft||0)*(1+Number(variant.markup_pct||0)/100);
      const q = Math.round(sqft);
      return { qty:q, unit:"sqft", unit_price:sellPrice, line_total:Math.round(sqft*sellPrice*100)/100 };
    }
  }
  const u = mat.unit, p = mat.price_per_unit || 0;
  const useRCalc = (mat.r_per_inch>0 && rValue);
  const t = useRCalc ? parseRValueNumber(rValue)/Number(mat.r_per_inch) : (THICK_MAP[thick] || 0);
  let q = u==="board_ft" ? sqft*t : u==="bag" ? Math.ceil((sqft*t)/(mat.coverage_factor||1)) : sqft;
  q = Math.round(q);
  return { qty:q, unit:u, unit_price:p, line_total:Math.round(q*p*100)/100 };
}


function CustomerSection({ leads, selectedLead, selectedLeadId, projectAddress,
    projectName, onSelect, onClear, onSaveNew, onAddressChange, onNameChange, isEditing }) {
  const [query, setQuery]     = useState("");
  const [mode, setMode]       = useState(selectedLead ? "selected" : "search");
  const [saving, setSaving]   = useState(false);
  const [newStep, setNewStep] = useState(1);
  const [newForm, setNewForm] = useState({ name:"", phone:"", company_name:"", email:"", address:"" });

  useEffect(()=>{
    if(selectedLead && mode==="search") setMode("selected");
  },[selectedLead]);

  function openNew() {
    setNewForm({ name:query||"", phone:"", company_name:"", email:"", address:"" });
    setNewStep(1); setMode("new");
  }
  function clear() {
    onClear(); setQuery("");
    setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
    setMode("search");
  }
  const results = query.trim().length >= 1
    ? leads.filter(l=>
        (l.name||"").toLowerCase().includes(query.toLowerCase())||
        (l.phone||"").includes(query)
      ).sort((a,b)=>{
        const q=query.toLowerCase();
        const aS=(a.name||"").toLowerCase().startsWith(q);
        const bS=(b.name||"").toLowerCase().startsWith(q);
        if(aS&&!bS) return -1; if(!aS&&bS) return 1;
        return (a.name||"").localeCompare(b.name||"");
      }).slice(0,8)
    : [];

  function selectLead(lead) { onSelect(lead); setQuery(""); setMode("selected"); }

async function saveNew() {
  if (!newForm.name && !newForm.phone) return;

  // Duplicate check
  const phone = (newForm.phone||"").replace(/\D/g,"");
  const email = (newForm.email||"").toLowerCase().trim();
  const name = (newForm.name||"").toLowerCase().trim();

  const phoneMatch = phone.length >= 7 && leads.find(l=>
    (l.phone||"").replace(/\D/g,"").includes(phone) ||
    phone.includes((l.phone||"").replace(/\D/g,"").slice(-7))
  );
  const emailMatch = email && leads.find(l=>
    (l.email||"").toLowerCase().trim() === email
  );
  const nameMatch = name && leads.find(l=>
    (l.name||"").toLowerCase().trim() === name
  );

  if(phoneMatch){
    alert(`⚠️ "${phoneMatch.name}" already exists with this phone. Loading their profile.`);
    setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
    setMode("selected");
    onSelect(phoneMatch);
    return;
  }
  if(emailMatch){
    alert(`⚠️ "${emailMatch.name}" already exists with this email. Loading their profile.`);
    setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
    setMode("selected");
    onSelect(emailMatch);
    return;
  }
  if(nameMatch){
    const proceed = window.confirm(`⚠️ A customer named "${nameMatch.name}" already exists.\n\nAre you sure this is a different person?`);
    if(!proceed) return;
  }

  setSaving(true);
  await onSaveNew(newForm);
  setNewForm({ name:"", phone:"", company_name:"", email:"", address:"" });
  setMode("selected");
  setSaving(false);
}

  const nf = (k,v) => setNewForm(p=>({...p,[k]:v}));
  const TI = { ...I, fontSize:12, height:26 };

  return (
    <div style={{...CARD_BLUE, marginBottom:5}}>
      {/* SELECTED */}
      {mode==="selected" && selectedLead && (
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
            <div style={{ fontSize:11, lineHeight:1.5, flex:1, minWidth:0 }}>
              <span style={{ fontWeight:700 }}>{selectedLead.name}</span>
              {selectedLead.phone && <span style={{ color:C.muted, fontSize:10, marginLeft:6 }}>{selectedLead.phone}</span>}
              {selectedLead.company_name && <span style={{ color:C.muted, fontSize:10, marginLeft:6 }}>· {selectedLead.company_name}</span>}
            </div>
            <button onClick={clear} style={{ border:"none", background:"none", color:C.faint, fontSize:13, cursor:"pointer", padding:"0 4px", flexShrink:0 }}>✕</button>
          </div>
          {isEditing ? (
            <div style={{...TI, width:"100%", background:"#f1f5f9", color:"#64748b", cursor:"not-allowed", padding:"5px 8px", borderRadius:6, fontSize:12}}>
              📍 {projectAddress}
            </div>
          ) : (
            <AddressInput style={{...TI, width:"100%"}}
              placeholder="Job address for this project…"
              value={projectAddress} onChange={onAddressChange} />
          )}
        </div>
      )}

      {/* SEARCH */}
      {mode==="search" && (
        <div>
          <div style={{ display:"flex", gap:4, marginBottom:results.length||query?4:0 }}>
            <input style={{ ...TI, flex:1 }} placeholder="Search customer by name or phone…"
              value={query} onChange={e=>setQuery(e.target.value)} />
            <button onClick={openNew} style={{ ...BtnD, fontSize:11, height:26, padding:"0 10px", flexShrink:0 }}>+ New</button>
          </div>
          {results.length>0 && (
            <div style={{ border:`1px solid ${C.border}`, borderRadius:6, overflow:"hidden", marginBottom:4 }}>
              {results.map((l,i)=>(
                <div key={l.id} onClick={()=>selectLead(l)}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"8px 10px", cursor:"pointer", fontSize:12,
                    background:i%2===0?C.white:"#fafbfc",
                    borderBottom:i<results.length-1?`1px solid ${C.border}`:"none", minHeight:40 }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{l.name}</div>
                    {l.company_name && <div style={{ color:C.muted, fontSize:10 }}>{l.company_name}</div>}
                  </div>
                  <span style={{ color:C.faint, fontSize:11 }}>{l.phone}</span>
                </div>
              ))}
            </div>
          )}
          {query.trim().length>=2 && results.length===0 && (
            <div style={{ fontSize:11, color:C.faint, marginBottom:4, padding:"6px 0", textAlign:"center" }}>
              No match — <button onClick={openNew} style={{ border:"none", background:"none", color:C.green, cursor:"pointer", fontSize:11, padding:0, fontWeight:700 }}>Register new</button>
            </div>
          )}
          {!query && (
            <div style={{ display:"flex", gap:4, marginTop:2 }}>
              <input style={{...TI, flex:1}} placeholder="Customer"
                value={projectName} onChange={e=>onNameChange(e.target.value)} />
              {!isEditing && <AddressInput style={{...TI, flex:2}}
                placeholder="Job address" value={projectAddress} onChange={onAddressChange} />}
            </div>
          )}
        </div>
      )}

      {/* NEW CUSTOMER */}
      {mode==="new" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:0.4 }}>New customer</span>
            <button onClick={()=>setMode("search")} style={{ border:"none", background:"none", color:C.faint, fontSize:16, cursor:"pointer", padding:0, lineHeight:1 }}>✕</button>
          </div>

          {/* Paste & Parse */}
          <textarea
              placeholder="📋 Paste customer info here to auto-fill (name, phone, email, company, address)…"
              rows={2}
              style={{...TI, width:"100%", marginBottom:6, height:"auto", padding:"6px 8px", resize:"none", fontFamily:"inherit"}}
              onChange={e=>{
                const text = e.target.value;
                if(!text.trim()) return;
                const parts = text.split(/[\n\-,;|]+/).map(s=>s.trim()).filter(Boolean);
                const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
                const phoneMatch = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
                const addrMatch = text.match(/\d+\s+\w[\w\s]+(?:st|ave|rd|blvd|dr|ln|ct|way|pl|street|avenue|road|drive|lane|court|boulevard)\b[^]*/i);
                const extracted = {};
                if(emailMatch) extracted.email = emailMatch[0];
                if(phoneMatch) extracted.phone = phoneMatch[0];
                if(addrMatch) extracted.address = addrMatch[0].split(/[\n\-]/)[0].trim();
                const remaining = parts.filter(l=>
                  !l.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i) &&
                  !l.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) &&
                  !(addrMatch && l.includes(addrMatch[0].split(" ")[0]))
                );
                if(remaining[0]) extracted.name = remaining[0];
                if(remaining[1]) extracted.company_name = remaining[1];
                setNewForm(p=>({...p,...extracted}));
                e.target.value="";
              }}
            />

          {/* All fields */}
          <input style={{...TI, width:"100%", marginBottom:5}} placeholder="Full name *" value={newForm.name} onChange={e=>nf("name",e.target.value)} />
          <input style={{...TI, width:"100%", marginBottom:5}} placeholder="Phone number" value={newForm.phone} onChange={e=>nf("phone",e.target.value)} />
          <input style={{...TI, width:"100%", marginBottom:5}} placeholder="Email" value={newForm.email} onChange={e=>nf("email",e.target.value)} />
          <input style={{...TI, width:"100%", marginBottom:5}} placeholder="Company name" value={newForm.company_name} onChange={e=>nf("company_name",e.target.value)} />
          <AddressInput style={{...TI, width:"100%", marginBottom:8}}
            placeholder="Address" value={newForm.address} onChange={v=>nf("address",v)} />

          <button onClick={saveNew} disabled={saving||(!newForm.name&&!newForm.phone)}
            style={{ ...BtnD, width:"100%", justifyContent:"center", height:34, fontSize:13,
              opacity:(saving||(!newForm.name&&!newForm.phone))?0.4:1 }}>
            {saving?"Saving…":"Save customer"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── AreaRow ───────────────────────────────────────────────────────────────────
function AreaRow({ area, matTypesLive, materials, materialMap, variantMap, onChange, onDelete, onMove, floors, activeFloor, saveOptionsOnly, onMaterialAdded, customAreaTypes, onSaveCustomAreaType, dbThickOpts, dbRVals }) {
  const effectiveThickOpts = (dbThickOpts&&dbThickOpts.length>0) ? dbThickOpts : THICK_OPTS;
  const effectiveRVals     = (dbRVals&&dbRVals.length>0) ? dbRVals : R_VALS;
  const [expanded, setExpanded] = useState(!area._collapsed);

  const [thickOpts, setThickOpts] = useState(()=>loadCustomList("custom_thick_opts", THICK_OPTS));
  const [rValOpts, setRValOpts] = useState(()=>loadCustomList("custom_rval_opts", R_VALS));

  const [calcOpen, setCalcOpen] = useState(false);
  const [calcExpr, setCalcExpr] = useState(""); 
  const [overrideOpen, setOverrideOpen] = useState(!!area.price_override);
  const [movingTo, setMovingTo] = useState(false);

  useEffect(()=>{
    if(area._collapsed) setExpanded(false);
  },[area._collapsed]);

  const areaOptions = area.options||[];

  const XS = {
    height:30, fontSize:12, borderRadius:5, border:`1px solid ${C.border}`,
    background:C.white, padding:"0 4px", boxSizing:"border-box", color:C.ink,
    minWidth:0, width:"100%",
  };
  const GS = {
    height:28, fontSize:12, border:"none", background:"transparent",
    padding:"0 2px", boxSizing:"border-box", color:C.ink,
    minWidth:0, width:"100%", fontWeight:600,
    WebkitAppearance:"none", MozAppearance:"none", appearance:"none",
    backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E")`,
    backgroundRepeat:"no-repeat", backgroundPosition:"right 2px center", paddingRight:14, cursor:"pointer",
  };

  const matLines = (area.mat_lines && area.mat_lines.length > 0)
    ? area.mat_lines
    : [{ id:1, material:area.material||"", thickness_in:area.thickness_in||"", r_value:area.r_value||"", oc:area.oc||"" }];
  
  const computedSqft = (()=>{
  const raw=(area.measurements||[]).reduce((s,m)=>s+(m.sqft||0),0);
  const d=parseFloat(area.deduct_sqft)||0;
  return Math.max(0,Math.round(raw-d));
})();

  function updateMatLine(idx, field, value) {
    const lines = matLines.map((l,i)=> i===idx ? {...l,[field]:value} : l);
    onChange("mat_lines", lines);
    if(idx===0 && !isComboMode) onChange(field, value);
  }

  function addMatLine() {
    const last = matLines[matLines.length-1];
    const lines = [...matLines, { id:Date.now(), material:last.material||"", thickness_in:last.thickness_in||"", r_value:last.r_value||"", oc:"" }];
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

  const isOverridden = area.price_override && Number(area.price_override)>0;
  const totalCost = isOverridden
    ? Math.round(computedSqft*Number(area.price_override)*100)/100
    : matLines.reduce((sum, ml) => {
        const mat = materialMap ? materialMap[ml.material] : materials.find(m=>m.name===ml.material);
        return sum + calcArea(computedSqft, ml.thickness_in, mat, ml.r_value, variantMap).line_total;
      }, 0);

  const firstMat = matLines[0].material;
  const isComplete = !!(area.area_type && firstMat && firstMat !== "__custom_mat__" && area.sqft > 0);

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

  function calcPress(val) {
  if(val==="C") { setCalcExpr(""); return; }
  if(val==="⌫") { setCalcExpr(p=>p.slice(0,-1)); return; }
  if(val==="="){
    try {
      const safe = calcExpr.replace(/[^0-9+\-*/.()]/g,"");
      const result = Function(`"use strict";return (${safe||0})`)();
      setCalcExpr(String(Math.round(result*100)/100));
    } catch(e){ setCalcExpr("Error"); }
    return;
  }
  setCalcExpr(p=>p+val);
}
function useCalcResult(field) {
  const n = parseFloat(calcExpr);
  if(!isNaN(n)) onChange(field, String(n));
  setCalcOpen(false);
  setCalcExpr("");
}

  function delMeas(i) {
    const meas = (area.measurements||[]).filter((_,j)=>j!==i);
    const d = parseFloat(area.deduct_sqft)||0;
    onChange("measurements", meas);
    onChange("sqft", Math.max(0, Math.round(meas.reduce((s,m)=>s+m.sqft,0)-d)));
  }

  async function saveCustomMaterial(val) {
    if(!val) return;
    onChange("mat_lines",[{id:1,material:val,thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:matLines[0].oc||""}]);
    onChange("material",val);
    try {
      const {data:{user}} = await supabase.auth.getUser();
      if(!user) return;
      const {data:cd} = await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      if(!cd) return;
      const {data:existing} = await supabase.from("materials").select("id").eq("company_id",cd.id).eq("name",val).maybeSingle();
      if(!existing){
        const {data:newMat} = await supabase.from("materials").insert([{company_id:cd.id,name:val,unit:"board_ft",price_per_unit:0}]).select().single();
        onMaterialAdded?.(newMat);
      } else { onMaterialAdded?.(); }
    } catch(e){ console.error("saveCustomMaterial error:",e); }
  }

  const liveH = parseFloat(area.mh)||0;
  const liveL = parseFloat(area.ml)||0;
  const liveQ = parseFloat(area.mq)||1;
  const livePreview = (liveH>0&&liveL>0) ? Math.round(liveH*liveL*liveQ*100)/100 : 0;
  const isComboMode = matLines.length > 1 || matLines[0].material === "__combo__";

  // ── COLLAPSED ──
  if (isComplete && !expanded) return (
  <div
    style={{ background:area.is_optional?"#fffbeb":"#f8fffe", border:`1px solid ${area.is_optional?"#fde68a":"#bbf7d0"}`, borderLeft:`3px solid ${area.is_optional?"#f59e0b":"#86efac"}`, borderRadius:7, padding:"4px 8px", marginBottom:3, opacity:0.85 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:2, gap:6 }}>
        {/* Phase toggle — always visible, no need to open the card */}
        <button
          onClick={e=>{
            e.stopPropagation();
            if(area.phase===1){
              // Clear ALL phases from the entire job — customer changed mind
              onChange("phase","__clear_all__");
            } else {
              // Set this as Phase 1 — rest auto-become Phase 2
              onChange("phase",1);
            }
          }}
          title={area.phase===1?"Tap to remove all phases (customer changed mind)":area.phase===2?"Tap to move 1st phase here":"Tap to mark as 1st phase"}
          style={{
            border:"none", borderRadius:4, padding:"2px 6px", fontSize:9, fontWeight:800,
            cursor:"pointer", flexShrink:0, whiteSpace:"nowrap",
            background: area.phase===1?"#3b82f6":area.phase===2?"#8b5cf6":"#e5e7eb",
            color: area.phase?"#fff":"#94a3b8",
          }}>
          {area.phase===1?"🔵 Ph.1 ✕":area.phase===2?"🟣 Ph.2":"◯ Ph."}
        </button>
        <span onClick={()=>{ setExpanded(true); onChange("_collapsed",false); }}
          style={{ fontSize:11, fontWeight:700, color:C.ink, flex:1, cursor:"pointer" }}>
          {area.is_optional&&<span style={{color:"#f59e0b",marginRight:4}}>⭐</span>}
          {area.area_type||"—"}
        </span>
        <div onClick={()=>{ setExpanded(true); onChange("_collapsed",false); }}
          style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
          {isOverridden && <span style={{fontSize:9,color:"#7c3aed",fontWeight:700}}>✏️ custom</span>}
          <span style={{ fontSize:11, fontWeight:700, color:"#059669" }}>${fmt(totalCost)}</span>
          <span style={{ color:"#059669", fontSize:14, padding:"0 2px" }}>✏️</span>
        </div>
      </div>
      <div onClick={()=>{ setExpanded(true); onChange("_collapsed",false); }} style={{cursor:"pointer"}}>
      {matLines.map((ml,i)=>(
        <div key={i} style={{ fontSize:10, color:C.muted, lineHeight:1.6 }}>
          {[ml.material, ml.thickness_in, ml.r_value, ml.oc].filter(Boolean).join(" · ")}
          {i===0 && (
            <span style={{ marginLeft:6, color:C.faint }}>
              {fmt(computedSqft)} ft²
              {(area.measurements||[]).length>0 && <span style={{ marginLeft:4 }}>({area.measurements.map(m=>`${m.h}×${m.l}${m.q>1?`×${m.q}`:""}`).join("  ")})</span>}
              {area.deduct_sqft>0 && <span style={{color:"#ef4444"}}> −{area.deduct_sqft}</span>}
              {Number(area.paint_sqft)>0 && (()=>{
                const mls=(area.mat_lines&&area.mat_lines.length>0)?area.mat_lines:[{material:area.material||""}];
                const hasFoam=mls.some(ml=>{const m=(ml.material||"").toLowerCase();return m.includes("closed")||m.includes("open cell")||m.includes("open-cell");});
                return hasFoam?<span style={{color:"#c2410c",marginLeft:4}}>🎨 {area.paint_sqft} ft²</span>:null;
              })()}
            </span>
          )}
        </div>
      ))}
      {areaOptions.map((opt,i)=>{
        const optLines=(opt.mat_lines||[]).length>0?opt.mat_lines:[{material:opt.material||"",thickness_in:opt.thickness_in||area.thickness_in||"",r_value:opt.r_value||"",oc:opt.oc||""}];
        return (
          <div key={i} style={{fontSize:10,color:"#f97316",marginTop:2}}>
            ⚡ Option {i+1}: {optLines.map(ol=>[ol.material,ol.thickness_in,ol.r_value,ol.oc].filter(Boolean).join(" ")).join(" + ")}
          </div>
        );
      })}
      </div>
    </div>
  );

  // ── EXPANDED ──
  return (
    <div style={{ background:"#fff",
        border:"2px solid #059669",
        borderRadius:9, padding:"6px 8px", marginBottom:4,
        boxShadow:"0 4px 16px rgba(5,150,105,0.18), 0 1px 4px rgba(0,0,0,0.08)",
        position:"relative", zIndex:2 }}>

     {isComplete && (
    <div style={{ margin:"-6px -8px 8px -8px", background:"#059669", borderRadius:"7px 7px 0 0" }}>
      {/* Row 1: primary actions */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px 4px", gap:5 }}>
        <button onClick={()=>setExpanded(false)}
          style={{border:"none",background:"rgba(255,255,255,0.25)",color:"#fff",
            padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700,flex:1}}>
          ✓ Done
        </button>
        <button onClick={onDelete}
          style={{border:"none",background:"rgba(255,0,0,0.35)",color:"#fff",
            padding:"7px 14px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>
          🗑 Delete
        </button>
      </div>
      {/* Row 2: secondary actions */}
      <div style={{ display:"flex", alignItems:"center", padding:"0 10px 8px", gap:5, flexWrap:"wrap" }}>
        <button onClick={()=>onChange("is_optional",!area.is_optional)}
          title="Mark as optional item"
          style={{border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,padding:"5px 10px",flex:1,
            background:area.is_optional?"#fbbf24":"rgba(255,255,255,0.2)",
            color:area.is_optional?"#78350f":"#fff"}}>
          {area.is_optional?"⭐ Optional":"☆ Optional"}
        </button>
        <button onClick={()=>{ if(overrideOpen){ onChange("price_override",""); } setOverrideOpen(p=>!p); }}
          title="Override price per sqft for this area"
          style={{border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,padding:"5px 10px",flex:1,
            background:overrideOpen?"#7c3aed":"rgba(255,255,255,0.2)",color:"#fff"}}>
          💲 {overrideOpen?"✕ Price":"Price"}
        </button>
        <button
          onClick={()=>onChange("phase", area.phase===1 ? 2 : area.phase===2 ? null : 1)}
          title="Set phase (1st before inspection, 2nd after)"
          style={{border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:800,padding:"5px 10px",flex:1,
            background:area.phase===1?"#3b82f6":area.phase===2?"#8b5cf6":"rgba(255,255,255,0.2)",
            color:"#fff"}}>
          {area.phase===1?"🔵 Ph.1":area.phase===2?"🟣 Ph.2":"◯ Phase"}
        </button>
        {onMove && floors && floors.length>1 && (
          movingTo
            ? <select autoFocus
                style={{height:30,borderRadius:6,border:"none",background:"#1d4ed8",color:"#fff",padding:"0 6px",fontSize:11,fontWeight:700,cursor:"pointer",flex:1}}
                onChange={e=>{ if(e.target.value){ onMove(e.target.value); setMovingTo(false); } }}
                onBlur={()=>setMovingTo(false)}>
                <option value="">Move to…</option>
                {floors.filter(f=>f!==activeFloor).map(f=>(
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            : <button onClick={()=>setMovingTo(true)}
                title="Move this area to another floor"
                style={{border:"none",background:"rgba(255,255,255,0.2)",color:"#fff",
                  padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,flex:1}}>
                ↗ Move
              </button>
        )}
      </div>
    </div>
    )}

    {overrideOpen && (
      <div style={{background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:7,padding:"8px 10px",marginBottom:6}}>
        <div style={{fontSize:10,color:"#6d28d9",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>
          Custom price for this job (overrides catalog pricing)
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:12,color:"#6d28d9"}}>$</span>
          <input type="number" placeholder="0.00" value={area.price_override||""}
            onChange={e=>onChange("price_override",e.target.value)}
            style={{...XS,width:90}} />
          <span style={{fontSize:11,color:"#6d28d9"}}>/ sqft × {fmt(computedSqft)} ft²</span>
        </div>
      </div>
    )}

      {/* area type */}
      <div style={{ display:"flex", gap:4, marginBottom:2, alignItems:"center", borderBottom:`1px solid ${C.border}`, paddingBottom:3 }}>
        <select className="area-select" style={{...GS, flex:1}}
          value={area._show_custom_area ? "__other__" : (area.area_type||"")}
          onChange={e=>{
            if(e.target.value==="__other__"){ onChange("area_type",""); onChange("_show_custom_area",true); }
            else { onChange("area_type",e.target.value); onChange("_show_custom_area",false); }
          }}>
          <option value="">Area type</option>
          {AREA_TYPES.map(a=><option key={a}>{a}</option>)}
          {(customAreaTypes||[]).filter(t=>!AREA_TYPES.includes(t)).map(t=>(
            <option key={t}>{t}</option>
          ))}
          <option value="__other__">✏️ Other (custom)</option>
        </select>
        {!isComplete && (
        <button onClick={onDelete} style={{ border:"none", background:"none", color:C.faint, cursor:"pointer", fontSize:16, padding:"0 2px", lineHeight:1, flexShrink:0 }}>✕</button>
      )}
      </div>
      {(area._show_custom_area || (area.area_type && !AREA_TYPES.includes(area.area_type) && !(customAreaTypes||[]).includes(area.area_type))) && (
        <input placeholder="Type area name… (saved for reuse)" style={{...XS, width:"100%", marginBottom:3}}
          value={area.area_type||""}
          onChange={e=>onChange("area_type",e.target.value)}
          onBlur={e=>{ if(e.target.value.trim()) onSaveCustomAreaType?.(e.target.value.trim()); }} />
      )}

      {/* MATERIAL — single */}
      {!isComboMode && (
        <div style={{marginBottom:4}}>
          <div style={{ display:"flex", gap:4, marginBottom:2, borderBottom:`1px solid ${C.border}`, paddingBottom:3 }}>
            <select className="area-select" style={{...GS, flex:1.7}}
              value={matLines[0].material==="__custom_mat__"?"__custom_mat__":(matLines[0].material||"")}
              onChange={e=>{
                const val=e.target.value;
                if(val==="__combo__"){
                  onChange("mat_lines",[{id:1,material:"",thickness_in:"",r_value:"",oc:""},{id:2,material:"",thickness_in:"",r_value:"",oc:""}]);
                  onChange("material","__combo__");
                } else if(val==="__custom_mat__"){
                  onChange("mat_lines",[{id:1,material:"__custom_mat__",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:matLines[0].oc||""}]);
                  onChange("material","__custom_mat__"); onChange("custom_material","");
                } else {
                  onChange("mat_lines",[{id:1,material:val,thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:matLines[0].oc||""}]);
                  onChange("material",val);
                }
              }}>
              <option value="">Material</option>
              {(matTypesLive&&matTypesLive.length>0?matTypesLive:materials).map(m=><option key={m.id||m.name}>{m.name}</option>)}
              <option value="__combo__">⚡ Combo</option>
              <option value="__custom_mat__">✏️ Other</option>
            </select>
            <select className="area-select" style={{...GS, flex:"0 0 62px"}}
              value={area._custom_thick?"__other__":(matLines[0].thickness_in||"")}
              onChange={e=>{
                if(e.target.value==="__other__"){ updateMatLine(0,"thickness_in",""); onChange("_custom_thick",true); }
                else { updateMatLine(0,"thickness_in",e.target.value); onChange("_custom_thick",false); }
              }}>
              <option value="">Thick</option>
              {effectiveThickOpts.map(t=><option key={t}>{t}</option>)}
              <option value="__other__">✏️</option>
            </select>
          </div>
          {matLines[0].material==="__custom_mat__" && (
            <input autoFocus placeholder="Type material name, press Enter…"
              style={{...XS,width:"100%",marginBottom:3,border:"2px solid #059669",borderRadius:6,padding:"0 8px",height:34,fontSize:13}}
              value={area.custom_material||""}
              onChange={e=>onChange("custom_material",e.target.value)}
              onBlur={()=>{ const v=(area.custom_material||"").trim(); if(v) saveCustomMaterial(v); }}
              onKeyDown={e=>{ if(e.key==="Enter"){ const v=(area.custom_material||"").trim(); if(v) saveCustomMaterial(v); e.target.blur(); }}} />
          )}
          {area._custom_thick && (
            <input placeholder="Thickness e.g. 3in" style={{...XS,width:"100%",marginBottom:3}}
              value={matLines[0].thickness_in||""} onChange={e=>updateMatLine(0,"thickness_in",e.target.value)} />
          )}
        </div>
      )}

      {/* MATERIAL — combo */}
      {isComboMode && (
        <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,padding:"8px 10px",marginBottom:4,marginTop:2}}>
          <div style={{fontSize:10,fontWeight:700,color:"#0369a1",marginBottom:6,textTransform:"uppercase",letterSpacing:0.4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>⚡ Combo</span>
            {(()=>{
              const totalR = matLines.reduce((sum,ml)=>{
                const r = parseInt((ml.r_value||"").replace(/\D/g,""))||0;
                return sum+r;
              },0);
              return totalR>0 ? <span style={{color:"#059669",fontWeight:800}}>Total R-{totalR}</span> : null;
            })()}
            <button onClick={()=>{ onChange("mat_lines",[{id:1,material:"",thickness_in:"",r_value:"",oc:""}]); onChange("material",""); }}
              style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:11,marginLeft:8,padding:0}}>× remove combo</button>
          </div>
          {matLines.map((ml,idx)=>(
            <div key={ml.id||idx} style={{marginBottom:8,paddingBottom:8,borderBottom:idx<matLines.length-1?`1px solid #e0f2fe`:"none"}}>
              <div style={{display:"flex",gap:4,marginBottom:4,alignItems:"center"}}>
                <select style={{...XS,flex:1}} value={ml.material==="__custom__"?"__custom__":(ml.material||"")}
                  onChange={e=>{
                    console.log("Material onChange fired, idx:",idx,"value:",e.target.value);
                    if(e.target.value==="__custom__") updateMatLine(idx,"material","__custom__");
                    else updateMatLine(idx,"material",e.target.value);
                  }}>
                  <option value="">Material {idx+1}</option>
                  {(matTypesLive&&matTypesLive.length>0?matTypesLive:materials).map(m=><option key={m.id||m.name}>{m.name}</option>)}
                  <option value="__custom__">✏️ Other</option>
                </select>
                {ml.material==="__custom__" && (
                  <input placeholder="Type material…" style={{...XS,flex:1}}
                    value={ml.custom_material||""}
                    onChange={e=>updateMatLine(idx,"custom_material",e.target.value)}
                    onBlur={()=>{ if(ml.custom_material) updateMatLine(idx,"material",ml.custom_material); }} />
                )}
                {matLines.length>2 && <button onClick={()=>removeMatLine(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1,flexShrink:0}}>✕</button>}
              </div>
              <div style={{display:"flex",gap:4,marginBottom:2,flexWrap:"wrap"}}>
                <select style={{...XS,flex:1}}
                  value={(ml._custom_thick || (ml.thickness_in && !THICK_OPTS.includes(ml.thickness_in)))?"__other__":(ml.thickness_in||"")}
                 onChange={e=>{
                    if(e.target.value==="__other__"){
                      const lines = matLines.map((l,i)=> i===idx ? {...l,_custom_thick:true} : l);
                      onChange("mat_lines", lines);
                    } else {
                      const lines = matLines.map((l,i)=> i===idx ? {...l,thickness_in:e.target.value,_custom_thick:false} : l);
                      onChange("mat_lines", lines);
                    }
                  }}>
                  <option value="">Thick</option>{effectiveThickOpts.map(t=><option key={t}>{t}</option>)}
                  <option value="__other__">✏️ Other</option>
                </select>
                <select style={{...XS,flex:1}}
                  value={(ml._custom_rval || (ml.r_value && !R_VALS.includes(ml.r_value)))?"__other__":(ml.r_value||"")}
                  onChange={e=>{
                    if(e.target.value==="__other__"){
                      const lines = matLines.map((l,i)=> i===idx ? {...l,_custom_rval:true} : l);
                      onChange("mat_lines", lines);
                    } else {
                      const lines = matLines.map((l,i)=> i===idx ? {...l,r_value:e.target.value,_custom_rval:false} : l);
                      onChange("mat_lines", lines);
                    }
                  }}>
                  <option value="">R-Val</option>{effectiveRVals.map(r=><option key={r}>{r}</option>)}
                  <option value="__other__">✏️ Other</option>
                </select>
                <select style={{...XS,flex:1}} value={ml.oc||""} onChange={e=>updateMatLine(idx,"oc",e.target.value)}>
                  <option value="">Spacing</option>{OC_OPTS.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              {(ml._custom_thick || (ml.thickness_in && !THICK_OPTS.includes(ml.thickness_in))) && (
              <input placeholder="Custom thickness e.g. 3in" style={{...XS,width:"100%",marginBottom:2}}
                value={ml.thickness_in||""} onChange={e=>updateMatLine(idx,"thickness_in",e.target.value)} />
            )}
             {(ml._custom_rval || (ml.r_value && !R_VALS.includes(ml.r_value))) && (
                <input placeholder="Custom R-Val e.g. R-22" style={{...XS,width:"100%",marginBottom:2}}
                  value={ml.r_value||""} onChange={e=>updateMatLine(idx,"r_value",e.target.value)} />
              )}
            </div>
          ))}
          <button onClick={addMatLine} style={{width:"100%",padding:"7px",borderRadius:6,border:"1px dashed #7dd3fc",background:"none",color:"#0369a1",cursor:"pointer",fontSize:11,fontWeight:600,height:"auto"}}>+ Add material to combo</button>
        </div>
      )}

      {/* OPTIONS */}
      <div style={{marginBottom:6}}>
        {areaOptions.map((opt,oi)=>{
          const isOptCombo=opt.material==="__combo__"||(opt.mat_lines||[]).length>1;
          const optLines=(opt.mat_lines||[]).length>0?opt.mat_lines:[{id:1,material:opt.material||"",thickness_in:opt.thickness_in||matLines[0].thickness_in||"",r_value:opt.r_value||matLines[0].r_value||"",oc:""}];
          function updateOpt(field,val){const opts=[...areaOptions];opts[oi]={...opts[oi],[field]:val};onChange("options",opts);}
          function updateOptLine(li,field,val){const opts=[...areaOptions];const lines=[...optLines];lines[li]={...lines[li],[field]:val};opts[oi]={...opts[oi],mat_lines:lines,material:lines[0].material||"__combo__"};onChange("options",opts);}
          return (
            <div key={oi} style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:6,padding:"6px 8px",marginBottom:4}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:10,fontWeight:700,color:"#92400e"}}>⚡ Option {oi+1}</span>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <button onClick={()=>saveOptionsOnly()} style={{border:"1px solid #f97316",background:"#fff7ed",color:"#f97316",cursor:"pointer",fontSize:9,padding:"2px 5px",borderRadius:4,fontWeight:700}}>💾 Save</button>
                  <button onClick={()=>onChange("options",areaOptions.filter((_,j)=>j!==oi))} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                </div>
              </div>
              {/* Option label and crew note */}
              <input placeholder="Option label (e.g. Spray roofline instead of exterior wall)"
                value={opt.label||""} onChange={e=>updateOpt("label",e.target.value)}
                style={{...XS,width:"100%",fontSize:11,marginBottom:4,fontWeight:600}}/>
              <input placeholder="📝 Crew note (optional — e.g. use 2lb foam, access from attic)"
                value={opt.note||""} onChange={e=>updateOpt("note",e.target.value)}
                style={{...XS,width:"100%",fontSize:11,marginBottom:4,color:"#64748b"}}/>
              {!isOptCombo?(
                <div style={{display:"flex",gap:4,marginBottom:4}}>
                  <select style={{...XS,flex:3}} value={opt.material||""} onChange={e=>{
                    if(e.target.value==="__combo__"){
                      const opts=[...areaOptions];
                      opts[oi]={...opts[oi],material:"__combo__",mat_lines:[
                        {id:1,material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:""},
                        {id:2,material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:""}
                      ]};
                      onChange("options",opts);
                    } else { updateOpt("material",e.target.value); }
                  }}>
                    <option value="">Material</option>{(matTypesLive&&matTypesLive.length>0?matTypesLive:materials).map(m=><option key={m.id||m.name}>{m.name}</option>)}<option value="__combo__">⚡ Combo</option>
                  </select>
                  <select style={{...XS,flex:1}} value={opt.thickness_in||matLines[0].thickness_in||""} onChange={e=>updateOpt("thickness_in",e.target.value)}><option value="">Thick</option>{effectiveThickOpts.map(t=><option key={t}>{t}</option>)}</select>
                  <select style={{...XS,flex:1}} value={opt.r_value||matLines[0].r_value||""} onChange={e=>updateOpt("r_value",e.target.value)}><option value="">R-Val</option>{effectiveRVals.map(r=><option key={r}>{r}</option>)}</select>
                </div>
              ):(
                <div style={{background:"#fff7ed",borderRadius:6,padding:"6px 8px",marginBottom:4}}>
                  <div style={{fontSize:9,fontWeight:700,color:"#92400e",marginBottom:6,display:"flex",justifyContent:"space-between"}}>⚡ Combo<button onClick={()=>{updateOpt("mat_lines",[{id:1,material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:""}]);updateOpt("material","");}} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:10,padding:0}}>× remove combo</button></div>
                  {optLines.map((ol,li)=>(
                    <div key={li} style={{marginBottom:6,paddingBottom:6,borderBottom:li<optLines.length-1?"1px dashed #fde68a":"none"}}>
                      <div style={{display:"flex",gap:4,marginBottom:3,alignItems:"center"}}>
                        <select style={{...XS,flex:1}} value={ol.material||""} onChange={e=>updateOptLine(li,"material",e.target.value)}><option value="">Material {li+1}</option>{(matTypesLive&&matTypesLive.length>0?matTypesLive:materials).map(m=><option key={m.id||m.name}>{m.name}</option>)}</select>
                        {optLines.length>2&&<button onClick={()=>{const lines=optLines.filter((_,j)=>j!==li);const opts=[...areaOptions];opts[oi]={...opts[oi],mat_lines:lines};onChange("options",opts);}} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:13,padding:0}}>✕</button>}
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        <select style={{...XS,flex:1}} value={ol.thickness_in||""} onChange={e=>updateOptLine(li,"thickness_in",e.target.value)}><option value="">Thick</option>{effectiveThickOpts.map(t=><option key={t}>{t}</option>)}</select>
                        <select style={{...XS,flex:1}} value={ol.r_value||""} onChange={e=>updateOptLine(li,"r_value",e.target.value)}><option value="">R-Val</option>{effectiveRVals.map(r=><option key={r}>{r}</option>)}</select>
                        <select style={{...XS,flex:1}} value={ol.oc||""} onChange={e=>updateOptLine(li,"oc",e.target.value)}><option value="">OC</option>{OC_OPTS.map(o=><option key={o}>{o}</option>)}</select>
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>{const lines=[...optLines,{id:Date.now(),material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",oc:""}];const opts=[...areaOptions];opts[oi]={...opts[oi],mat_lines:lines};onChange("options",opts);}} style={{width:"100%",padding:"5px",borderRadius:5,border:"1px dashed #fde68a",background:"none",color:"#92400e",cursor:"pointer",fontSize:10,fontWeight:600,height:"auto"}}>+ Add material to combo</button>
                </div>
              )}

            </div>
          );
        })}
        {areaOptions.length<3&&(
          <button onClick={()=>{const opts=[...areaOptions];opts.push({material:"",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||"",mat_lines:[],label:"",note:"",extra_amount:""});onChange("options",opts);}}
            style={{width:"100%",padding:"5px",borderRadius:6,border:"1px dashed #fed7aa",background:"#fff7ed",color:"#92400e",cursor:"pointer",fontSize:11,fontWeight:600,marginBottom:4,height:"auto"}}>
            + Add Option
          </button>
        )}
      </div>

      {/* Optional note — only shown when area is marked optional */}
      {area.is_optional && (
        <div style={{padding:"0 10px 8px"}}>
          <input
            value={area.optional_note||""}
            onChange={e=>onChange("optional_note",e.target.value)}
            placeholder="📝 Note for this option (e.g. instead of spray roofline, do below)"
            style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #fde68a",
              background:"#fffbeb",color:"#92400e",fontSize:11,boxSizing:"border-box"}}
          />
        </div>
      )}

      {/* measurements */}
      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:4, marginTop:2, position:"relative" }}>
  {calcOpen && (
    <div style={{position:"absolute",bottom:"100%",left:0,right:0,zIndex:50,
        background:"#fff",border:`2px solid ${C.ink}`,borderRadius:10,
        padding:8,boxShadow:"0 -4px 16px rgba(0,0,0,.2)",marginBottom:4}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:10,fontWeight:700,color:C.muted}}>🧮 Calculator</span>
        <button onClick={()=>{setCalcOpen(false);setCalcExpr("");}}
          style={{border:"none",background:"none",color:C.faint,fontSize:16,cursor:"pointer",padding:0}}>✕</button>
      </div>
      <input readOnly value={calcExpr||"0"}
        style={{...XS,width:"100%",marginBottom:6,textAlign:"right",fontSize:18,fontWeight:700,height:36}} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:6}}>
        {["7","8","9","÷","4","5","6","×","1","2","3","−","C","0",".","+"].map(k=>(
          <button key={k} onClick={()=>calcPress(k==="÷"?"/":k==="×"?"*":k==="−"?"-":k)}
            style={{height:32,borderRadius:6,border:`1px solid ${C.border}`,background:"#f8fafc",
              fontSize:14,fontWeight:600,cursor:"pointer",color:C.ink}}>{k}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:4,marginBottom:6}}>
        <button onClick={()=>calcPress("⌫")} style={{flex:1,height:32,borderRadius:6,border:`1px solid ${C.border}`,background:"#f8fafc",fontSize:13,fontWeight:600,cursor:"pointer"}}>⌫</button>
        <button onClick={()=>calcPress("=")} style={{flex:1,height:32,borderRadius:6,border:"none",background:C.ink,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>=</button>
      </div>
      <div style={{display:"flex",gap:4}}>
        <button onClick={()=>useCalcResult("mh")} style={{flex:1,height:30,borderRadius:6,border:"none",background:"#059669",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>→ Use as H</button>
        <button onClick={()=>useCalcResult("ml")} style={{flex:1,height:30,borderRadius:6,border:"none",background:"#059669",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>→ Use as L</button>
      </div>
    </div>
  )}
  <div style={{ display:"flex", gap:3, alignItems:"center", marginBottom:4 }}>
    <button onClick={()=>setCalcOpen(p=>!p)} type="button"
      style={{border:`1px solid ${C.border}`,background:calcOpen?C.ink:"#f8fafc",
        color:calcOpen?"#fff":C.muted,borderRadius:5,width:28,height:30,
        cursor:"pointer",fontSize:14,flexShrink:0,padding:0}}>🧮</button>
         {isComboMode ? (
              (()=>{
                const totalR = matLines.reduce((sum,ml)=>{
                  const r = parseInt((ml.r_value||"").replace(/\D/g,""))||0;
                  return sum+r;
                },0);
                return (
                  <div style={{...GS, flex:"0 0 60px", display:"flex",alignItems:"center",justifyContent:"center",
                      background:"#f0fdf4",borderRadius:5,fontWeight:800,color:"#059669",fontSize:12,cursor:"default"}}>
                    {totalR>0?`R-${totalR}`:"R-Val"}
                  </div>
                );
              })()
            ) : (
              <>
                <select className="area-select" style={{...GS, flex:"0 0 60px"}}
                  value={area._custom_rval?"__other__":(matLines[0].r_value||"")}
                  onChange={e=>{
                    if(e.target.value==="__other__"){ updateMatLine(0,"r_value",""); onChange("_custom_rval",true); }
                    else { updateMatLine(0,"r_value",e.target.value); onChange("_custom_rval",false); }
                  }}>
                  <option value="">R-Val</option>
                  {effectiveRVals.map(r=><option key={r}>{r}</option>)}
                  <option value="__other__">✏️</option>
                </select>
               {area._custom_rval && (
                <input placeholder="e.g. R-22" style={{...XS, width:70}}
                  value={matLines[0].r_value||""} onChange={e=>updateMatLine(0,"r_value",e.target.value)}
                  onBlur={e=>{ if(e.target.value){ saveCustomListItem("custom_rval_opts",e.target.value); setRValOpts(loadCustomList("custom_rval_opts",R_VALS)); }}} />
              )}
              </>
            )}
          <input placeholder="1" inputMode="decimal" value={area.mq||""}
            onChange={e=>onChange("mq",e.target.value)}
            onBlur={commitMeasurement} onKeyDown={e=>e.key==="Enter"&&commitMeasurement()}
            className="area-mq-input" style={{...I,...noArrow,width:36,padding:"0 3px",textAlign:"center",height:30,fontSize:13}} />
          <span style={{fontSize:11,color:C.faint}}>×</span>
          <input placeholder="H" inputMode="decimal" value={area.mh||""}
            onChange={e=>onChange("mh",e.target.value)}
            onBlur={commitMeasurement} onKeyDown={e=>e.key==="Enter"&&commitMeasurement()}
            className="area-hl-input" style={{...I,...noArrow,flex:1,padding:"0 4px",textAlign:"center",height:30,fontSize:13}} />
          <span style={{fontSize:11,color:C.faint}}>×</span>
          <input placeholder="L" inputMode="decimal" value={area.ml||""}
            onChange={e=>onChange("ml",e.target.value)}
            onBlur={commitMeasurement} onKeyDown={e=>e.key==="Enter"&&commitMeasurement()}
            className="area-hl-input" style={{...I,...noArrow,flex:1,padding:"0 4px",textAlign:"center",height:30,fontSize:13}} />
          <span style={{fontSize:11,fontWeight:700,color:livePreview>0?C.green:C.ink,whiteSpace:"nowrap"}}>
            {livePreview>0?`${fmt(livePreview)}→`:""}{fmt(computedSqft)}ft²
          </span>
        </div>
        {(area.measurements||[]).length>0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginBottom:4 }}>
            {area.measurements.map((m,i)=>(
              <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:2,
                  background:isComplete?"#dcfce7":C.chip, borderRadius:4, padding:"2px 6px", fontSize:10, color:C.muted }}>
                {m.h}×{m.l}{m.q>1?`×${m.q}`:""}&nbsp;<b style={{color:C.ink}}>{fmt(m.sqft)}</b>
                <button onClick={()=>delMeas(i)} style={{border:"none",background:"none",cursor:"pointer",color:C.faint,fontSize:11,padding:0,lineHeight:1}}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{fontSize:10,color:C.faint,whiteSpace:"nowrap"}}>− deduct</span>
          <input placeholder="ft²" inputMode="decimal" value={area.deduct_sqft||""}
            onChange={e=>{
              const d=parseFloat(e.target.value)||0;
              onChange("deduct_sqft",e.target.value);
              const raw=(area.measurements||[]).reduce((s,m)=>s+m.sqft,0);
              onChange("sqft",Math.max(0,Math.round(raw-d)));
            }}
            className="area-deduct" style={{...I,...noArrow,width:70,padding:"0 6px",height:30,fontSize:12}} />
          {totalCost>0&&<div style={{marginLeft:"auto",fontWeight:700,color:C.green,fontSize:13}}>Total ${fmt(totalCost)}</div>}
        </div>

        {/* Intumescent paint — shown only for spray foam (open/closed cell) when
            the foam isn't covered for fire rating and needs painting.
            In combo mode, area.material is '__combo__' so we check mat_lines. */}
        {(()=>{
          const allMats = isComboMode
            ? matLines.map(ml=>(ml.material||"").toLowerCase())
            : [(area.material||"").toLowerCase()];
          const isSprayFoam = allMats.some(m=>m.includes("closed")||m.includes("open cell")||m.includes("open-cell"));
          if(!isSprayFoam) return null;
          return (
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4,
                background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:6,padding:"4px 8px"}}>
              <span style={{fontSize:10,color:"#c2410c",whiteSpace:"nowrap",fontWeight:600}}>🎨 Intumescent paint</span>
              <input type="number" placeholder="0" inputMode="decimal" value={area.paint_sqft||""}
                onChange={e=>onChange("paint_sqft",e.target.value)}
                style={{...I,...noArrow,width:70,padding:"0 6px",height:26,fontSize:12}} />
              <span style={{fontSize:10,color:"#c2410c"}}>ft²</span>
              {Number(area.paint_sqft)>0 && (()=>{
                const paintMat=materialMap&&Object.values(materialMap).find(m=>m.name?.toLowerCase().includes("intumescent"));
                return paintMat
                  ? <span style={{marginLeft:"auto",fontSize:11,color:"#c2410c",fontWeight:600}}>${fmt(Number(area.paint_sqft)*Number(paintMat.price_per_unit||0))}</span>
                  : <span style={{marginLeft:"auto",fontSize:10,color:"#9a3412"}}>⚠️ Set price: Settings → Materials → "Intumescent Paint"</span>;
              })()}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── EstimatePanel ─────────────────────────────────────────────────────────────
function EstimatePanel({ floors, areas, materialMap, variantMap, crewNotes, projectName, projectAddress, customer }) {
  function floorTotal(floor) {
    return (areas[floor]||[]).filter(a=>!a.is_optional).reduce((s,a)=>s+getAreaTotalCost(a,materialMap,variantMap),0);
  }
  const total = floors.reduce((s,f)=>s+floorTotal(f),0);
  return (
    <div style={{ fontSize:11, lineHeight:1.55 }}>
      {customer && (
        <div style={{ marginBottom:7, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
          <div style={{fontWeight:700,fontSize:12,color:C.ink}}>{customer.name}</div>
          {customer.phone&&<div style={{color:C.muted}}>{customer.phone}</div>}
          {customer.company_name&&<div style={{color:C.muted}}>{customer.company_name}</div>}
          {customer.email&&<div style={{color:C.faint,fontSize:10}}>{customer.email}</div>}
        </div>
      )}
      {(projectName||projectAddress)&&(
        <div style={{ marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}`, fontSize:11, color:C.muted }}>
          {projectName&&<span style={{fontWeight:600,color:C.ink}}>{projectName} </span>}
          {projectAddress}
        </div>
      )}
      {(crewNotes.const_type||crewNotes.fire_blocking||crewNotes.ladder||crewNotes.parking||crewNotes.units||crewNotes.extra_notes)&&(
        <div style={{ marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}`, fontSize:10, color:C.muted, lineHeight:1.6 }}>
          {crewNotes.const_type&&<div style={{fontWeight:700,color:C.ink}}>{crewNotes.const_type}</div>}
          {crewNotes.fire_blocking&&<span>Fire Blocking: <b style={{color:C.ink}}>{crewNotes.fire_blocking}</b> · </span>}
          {crewNotes.ladder&&<span>Ladder: <b style={{color:C.ink}}>{crewNotes.ladder}</b> · </span>}
          {crewNotes.parking&&<span>Parking: <b style={{color:C.ink}}>{crewNotes.parking}</b></span>}
          {crewNotes.units&&<div>{crewNotes.units} units</div>}
          {crewNotes.extra_notes&&<div style={{marginTop:1,fontStyle:"italic"}}>{crewNotes.extra_notes}</div>}
        </div>
      )}
      {(()=>{
       const allAreas=floors.flatMap(floor=>(areas[floor]||[]).filter(a=>a.area_type&&a.sqft&&a.material!=="__custom_mat__"&&!a.is_optional).map(a=>({...a,floor})));
        if(!allAreas.length) return <div style={{color:C.faint,fontSize:10,textAlign:"center",padding:"10px 0"}}>No areas yet</div>;
        const hasPhases=allAreas.some(a=>a.phase===1||a.phase===2);
        function buildGroups(list){
          const gm={};
          list.forEach(a=>{
            const mls=(a.mat_lines&&a.mat_lines.length>0)?a.mat_lines:[{material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||"",oc:a.oc||""}];
            const key=a.area_type+"||||"+mls.map(ml=>ml.material).join("+");
            if(!gm[key]) gm[key]={area_type:a.area_type,floors:[],mat_lines:mls,totalSqft:0,totalCost:0,totalPaintSqft:0,floorOrder:floors.indexOf(a.floor)};
            const g=gm[key];
            if(!g.floors.includes(a.floor)) g.floors.push(a.floor);
            if(floors.indexOf(a.floor)<g.floorOrder) g.floorOrder=floors.indexOf(a.floor);
            g.totalSqft+=a.sqft||0; g.totalCost+=getAreaTotalCost(a,materialMap,variantMap); g.totalPaintSqft+=Number(a.paint_sqft||0);
          });
          return Object.values(gm).sort((a,b)=>a.floorOrder-b.floorOrder);
        }
        function renderGroups(groups){
          return groups.map((g,i)=>{
            const thick=g.mat_lines[0]?.thickness_in||"";
            const floorLabel=g.floors.sort((a,b)=>floors.indexOf(a)-floors.indexOf(b)).map(f=>f.replace(" Floor","")).join(", ");
            const matLabel=g.mat_lines.length>1?g.mat_lines.map(ml=>((ml.material||"")+" "+(ml.r_value||"")).trim()).join(" · "):((g.mat_lines[0]?.material||"")+" "+(g.mat_lines[0]?.r_value||"")+" "+(g.mat_lines[0]?.oc||"")).trim();
            const {qty,unit}=calcArea(g.totalSqft,thick,materialMap[g.mat_lines[0]?.material],g.mat_lines[0]?.r_value,variantMap);
            return (
              <div key={i} style={{paddingBottom:5,marginBottom:5,borderBottom:`1px solid ${C.chip}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,paddingRight:4,lineHeight:1.5}}>
                    <div style={{fontWeight:700,fontSize:12,color:C.ink}}>{floorLabel} — {g.area_type}</div>
                    <div style={{fontSize:10,color:C.muted,lineHeight:1.5}}>
                      {thick&&<span>{thick} </span>}{matLabel}{" · "}{fmt(g.totalSqft)} ft²
                      {qty>0&&` → ${fmt(qty)} ${unit?.replace("_"," ")}`}
                    </div>
                    {g.totalPaintSqft>0&&<div style={{fontSize:10,color:"#c2410c"}}>🎨 Paint {fmt(g.totalPaintSqft)} ft²</div>}
                  </div>
                  {g.totalCost>0&&<span style={{fontWeight:700,color:C.green,fontSize:12,flexShrink:0,paddingTop:2}}>${fmt(g.totalCost)}</span>}
                </div>
              </div>
            );
          });
        }
        const PH={borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:800,marginBottom:4,marginTop:6,display:"inline-block"};
        if(!hasPhases) return renderGroups(buildGroups(allAreas));
        return (<>
          {allAreas.some(a=>a.phase===1)&&<><div style={{...PH,background:"#eff6ff",color:"#1d4ed8"}}>🔵 1st Phase</div>{renderGroups(buildGroups(allAreas.filter(a=>a.phase===1)))}</>}
          {allAreas.some(a=>a.phase===2)&&<><div style={{...PH,background:"#f5f3ff",color:"#6d28d9"}}>🟣 2nd Phase</div>{renderGroups(buildGroups(allAreas.filter(a=>a.phase===2)))}</>}
          {allAreas.some(a=>!a.phase)&&<><div style={{...PH,background:"#f9fafb",color:C.faint}}>Unassigned</div>{renderGroups(buildGroups(allAreas.filter(a=>!a.phase)))}</>}
        </>);
      })()}
      {(()=>{
        // Collect all options from all areas
        const allOptionsWithArea = [];// unused - options shown via is_optional areas
        const optionalAreas=floors.flatMap(floor=>(areas[floor]||[]).filter(a=>a.area_type&&a.sqft&&a.material!=="__custom_mat__"&&a.is_optional).map(a=>({...a,floor})));
        if(!optionalAreas.length && !allOptionsWithArea.length) return null;
        return (
          <div style={{marginTop:4,marginBottom:8,paddingTop:8,borderTop:`1px dashed ${C.border}`}}>
            <div style={{fontSize:10,fontWeight:800,color:"#f59e0b",textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>
              ⭐ Options
            </div>
            {optionalAreas.map((a,i)=>{
              const cost=getAreaTotalCost(a,materialMap,variantMap);
              const mls=(a.mat_lines&&a.mat_lines.length>0)?a.mat_lines:[{material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||""}];
              const matLabel=mls.map(ml=>[ml.thickness_in,ml.material,ml.r_value].filter(Boolean).join(" ")).join(" + ");
              return (
                <div key={i} style={{paddingBottom:5,marginBottom:5,borderBottom:`1px solid ${C.chip}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,paddingRight:4,lineHeight:1.5}}>
                      <div style={{fontWeight:700,fontSize:12,color:C.ink}}>{a.floor.replace(" Floor","")} — {a.area_type}</div>
                      <div style={{fontSize:10,color:C.muted,lineHeight:1.5}}>{matLabel}{" · "}{fmt(a.sqft)} ft²</div>
                  {a.optional_note&&<div style={{fontSize:10,color:"#92400e",fontStyle:"italic",marginTop:1}}>📝 {a.optional_note}</div>}
                    </div>
                    {cost>0&&<span style={{fontWeight:700,color:"#f59e0b",fontSize:12,flexShrink:0,paddingTop:2}}>+${fmt(cost)}</span>}
                  </div>
                  {/* Show area options */}
                  {(a.options||[]).filter(o=>o.material||o.label).map((o,oi)=>{
                    const optMls=(o.mat_lines||[]).length>0?o.mat_lines:[{material:o.material||"",thickness_in:o.thickness_in||"",r_value:o.r_value||""}];
                    const optMatLabel=optMls.map(ml=>[ml.thickness_in,ml.material,ml.r_value].filter(Boolean).join(" ")).join(" + ");
                    const isSwap=o.type==="swap";
                    const extraAmt=Number(o.extra_amount||0);
                    return (
                      <div key={oi} style={{marginTop:4,paddingTop:4,paddingLeft:8,borderLeft:"2px solid #fed7aa"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                          <div style={{flex:1,paddingRight:4}}>
                            <div style={{fontSize:11,fontWeight:700,color:isSwap?"#dc2626":"#059669"}}>
                              {isSwap?"⇄":"+"} Option {oi+1}{o.label?`: ${o.label}`:""}
                            </div>
                            {optMatLabel&&<div style={{fontSize:10,color:C.muted}}>{optMatLabel}</div>}
                            {o.description&&<div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{o.description}</div>}
                          </div>
                          {extraAmt>0&&<span style={{fontWeight:700,fontSize:11,color:isSwap?"#dc2626":"#059669",flexShrink:0}}>
                            {isSwap?"-":"+"}${fmt(extraAmt)}
                          </span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}
      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:6, borderTop:`2px solid ${C.ink}`, fontWeight:700 }}>
        <span style={{fontSize:12}}>Total</span>
        <span style={{fontSize:17,color:C.green}}>${fmt(total)}</span>
      </div>

    </div>
  );
}

// For combo areas, an override applies once to the whole area — only the
// first mat_line carries the overridden price, the rest are zeroed out so
// the total isn't multiplied by the number of combo layers.
function calcAreaForSave(area, ml, mi, mat, variantMap) {
  if(area.price_override && Number(area.price_override)>0){
    if(mi===0){
      const sellPrice = Number(area.price_override);
      const q = Math.round(area.sqft||0);
      return { qty:q, unit:"sqft", unit_price:sellPrice, line_total:Math.round((area.sqft||0)*sellPrice*100)/100 };
    }
    return { qty:0, unit:"sqft", unit_price:0, line_total:0 };
  }
  return calcArea(area.sqft, ml.thickness_in, mat, ml.r_value, variantMap);
}
function isAreaComplete(area) {
  const lines=area.mat_lines&&area.mat_lines.length>0?area.mat_lines:[{material:area.material||""}];
  const mat=lines[0].material;
  return !!(area.area_type&&mat&&mat!=="__custom_mat__"&&area.sqft>0);
}

function getAreaTotalCost(area, materialMap, variantMap) {
  const raw=(area.measurements||[]).reduce((s,m)=>s+(m.sqft||0),0);
  const d=parseFloat(area.deduct_sqft)||0;
  const safeSqft=raw>0?Math.max(0,Math.round(raw-d)):(area.sqft||0);
  // Per-job manual price override — bypasses the catalog/variant pricing
  // entirely for this one area on this one estimate.
  if(area.price_override && Number(area.price_override)>0){
    return Math.round(safeSqft*Number(area.price_override)*100)/100;
  }
  const lines=area.mat_lines&&area.mat_lines.length>0?area.mat_lines:[{material:area.material||"",thickness_in:area.thickness_in||"",r_value:area.r_value||"",oc:area.oc||""}];
  let matCost = lines.reduce((sum,ml)=>{
    const mat=materialMap[ml.material];
    return sum+calcArea(safeSqft,ml.thickness_in,mat,ml.r_value,variantMap).line_total;
  },0);

  // Intumescent paint cost — looks up "Intumescent Paint" (or any material
  // with "intumescent" in the name) in Settings → Materials and prices it
  // at the paint_sqft area input.
  const paintSqft = Number(area.paint_sqft||0);
  if(paintSqft>0 && materialMap){
    const paintMat = Object.values(materialMap).find(m=>
      m.name?.toLowerCase().includes("intumescent")
    );
    if(paintMat) matCost += paintSqft * Number(paintMat.price_per_unit||0);
  }
  return Math.round(matCost*100)/100;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProjectEstimate() {
  const [searchParams]=useSearchParams();
  const navigate=useNavigate();
  const {id:projectId}=useParams();
  const leadId=searchParams.get("leadId");
  const resumeMode=searchParams.get("resume")==="1";
  const fromDrawing=searchParams.get("from_drawing")==="1";
  const addressParam=searchParams.get("address")||"";
  const isEditing=!!projectId;
  const [isLocked, setIsLocked] = useState(false); // true when pipeline_status is sent

  const [floors,setFloors]=useState(["Attic","3rd","2nd","1st","Basement"]);
  const [activeFloor,setActiveFloor]=useState("Attic");
  const [pendingFloor,setPendingFloor]=useState(null);
  const [areas,setAreas]=useState(()=>{const i={};DEFAULT_FLOORS.forEach(f=>{i[f]=[];});return i;});
  const [materials,setMaterials]=useState([]);
  const [customAreaTypes,setCustomAreaTypes]=useState([]);  // extra area types saved to DB
  const [dbThickOpts,setDbThickOpts]=useState([]);  // DB-driven thickness options
  const [dbRVals,setDbRVals]=useState([]);           // DB-driven R-value options
  const [matCostsLive,setMatCostsLive]=useState([]);
  const [variantsLive,setVariantsLive]=useState([]);
  const [matTypesLive,setMatTypesLive]=useState([]);      // Layer 1
  const [matProductsLive,setMatProductsLive]=useState([]); // Layer 2
  const [leads,setLeads]=useState([]);
  const [selectedLeadId,setSelectedLeadId]=useState(leadId||"");
  const [projectName,setProjectName]=useState("");
  const [projectAddress,setProjectAddress]=useState(addressParam||"");
  const [crewNotes,setCrewNotes]=useState({const_type:"",fire_blocking:"",parking:"",ladder:"",units:"",extra_notes:""});
  const [saving,setSaving]=useState(false);
  const [draftKey,setDraftKey]=useState(null);
  const [draftRestored,setDraftRestored]=useState(false);
  const [saved,setSaved]=useState(false);
  const [savedProjectId,setSavedProjectId]=useState(projectId||null);
  const [laborRoles,setLaborRoles]=useState([
    {role:"Lead Installer",hours:"8",days:"1",people:1,rate:55},
    {role:"Helper",hours:"8",days:"1",people:1,rate:35},
    {role:"",hours:"8",days:"1",people:1,rate:0},
    {role:"",hours:"8",days:"1",people:1,rate:0},
  ]);
  const [jobMiles,setJobMiles]=useState("");
  const [fuelRate,setFuelRate]=useState(0.67);
  const [salesReps,setSalesReps]=useState([]);
  const [selectedRep,setSelectedRep]=useState("");
  const [newFloorName,setNewFloorName]=useState("");
  const [addingFloor,setAddingFloor]=useState(false);
  const [panelOpen,setPanelOpen]=useState(false);
  const [loadingProject,setLoadingProject]=useState(isEditing);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialLoadDone = useRef(false);
  const wasSaved = useRef(false);
  const autoSaveTimer = useRef(null);
  const areaListRef = useRef(null);

  // Auto-save to localStorage immediately on every area change,
  // and to the DB 3 seconds after changes stop — so no data is lost
  // even if the user navigates away without clicking Save.
  useEffect(()=>{
    if(!initialLoadDone.current) return;
    saveDraftNow();
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(()=>{
      // In edit mode: always auto-save directly to DB (project ID already exists).
      // In new-project mode: only auto-save once a project ID exists (after first manual save).
      const targetId = projectId || savedProjectId;
      if(selectedLeadId && targetId){
        if(!navigator.onLine){ enqueue({ type:"pending_save", table:"projects", data:{ id:targetId }, opts:{} }); } else { saveProject({silent:true}); }
      }
    }, 3000);
    return ()=>clearTimeout(autoSaveTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[areas, crewNotes]);

  function getDraftKey(id, address){
    const addrSlug = (address||"").trim().toLowerCase().replace(/[^a-z0-9]/g,"_").slice(0,40);
    return `draft_estimate_${id||"new"}${addrSlug?"_"+addrSlug:""}`;
  }
  function clearDraft(){
    try {
      const key = getDraftKey(selectedLeadId, projectAddress);
      localStorage.removeItem(key);
      // Also sweep any other drafts for this same lead (orphaned from address changes)
      const prefix = `draft_estimate_${selectedLeadId}`;
      for(let i=localStorage.length-1; i>=0; i--){
        const k = localStorage.key(i);
        if(k && k.startsWith(prefix)) localStorage.removeItem(k);
      }
    } catch(e){}
  }
  function loadDraft(key){try{const r=localStorage.getItem(key);return r?JSON.parse(r):null;}catch(e){return null;}}

  function saveDraftNow(overrideAreas,overrideFloors){
    // In edit mode, changes are auto-saved directly to the DB — no need
    // for a localStorage draft, and creating one causes a duplicate entry
    // in the Estimates list that looks like a second copy of the project.
    if(isEditing) return;
    if(!selectedLeadId) return;
    const key=getDraftKey(selectedLeadId, projectAddress);
    try{
      localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),selectedLeadId,projectName,projectAddress,crewNotes,floors:overrideFloors||floors,areas:overrideAreas||areas,editingProjectId:null}));
      if(!draftKey) setDraftKey(key);
    }catch(e){}
  }

  useEffect(()=>{
    const interval=setInterval(()=>{if(selectedLeadId&&!wasSaved.current)saveDraftNow();},30000);
    return ()=>clearInterval(interval);
  },[selectedLeadId,projectName,projectAddress,crewNotes,floors,areas]);

  useEffect(()=>{ if(selectedLeadId) setDraftKey(getDraftKey(selectedLeadId, projectAddress)); },[selectedLeadId, projectAddress]);

  useEffect(()=>{
    if(resumeMode&&leadId&&leads.length>0&&!draftRestored){
      const key=getDraftKey(leadId, addressParam);
      const draft=loadDraft(key);
      if(draft){
        if(draft.crewNotes) setCrewNotes(draft.crewNotes);
        if(draft.floors?.length) setFloors([...new Set(draft.floors.filter(f=>f!=="Floor"))]);
        if(draft.areas){
          const merged={};
          const allFloors=[...new Set([...DEFAULT_FLOORS,...(draft.floors||[])])];
          allFloors.forEach(f=>{merged[f]=draft.areas[f]||[];});
          setAreas(merged);
        }
        if(draft.projectName) setProjectName(draft.projectName);
        if(draft.projectAddress) setProjectAddress(draft.projectAddress);
        setDraftRestored(true);
        const first=(draft.floors||[]).find(f=>(draft.areas?.[f]||[]).some(a=>a.area_type||a.sqft>0));
        if(first) setPendingFloor(first);
      }
    }
  },[leads,resumeMode,leadId]);

  useEffect(()=>{ if(pendingFloor){setActiveFloor(pendingFloor);setPendingFloor(null);} },[pendingFloor]);

  useEffect(()=>{
    if(!initialLoadDone.current){
      initialLoadDone.current = true;
      return;
    }
    setHasUnsavedChanges(true);
  },[areas, projectName, projectAddress, crewNotes, floors]); 

  useEffect(()=>{
  function handler(e){
    if(hasUnsavedChanges){
      e.preventDefault();
      e.returnValue = "";
    }
  }
  window.addEventListener("beforeunload", handler);
  return ()=>window.removeEventListener("beforeunload", handler);
},[hasUnsavedChanges]);

  useEffect(()=>{
    supabase.auth.onAuthStateChange((event,session)=>{
      if(session){
        loadMaterials();
        supabase.from("customers").select("id,name,phone,address,email,company_name").order("name").limit(1000).then(({data})=>{if(data) setLeads(data);});
      }
    });
    supabase.auth.getUser().then(async({data:{user}})=>{
      if(!user) return;
      const {data:cd}=await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      if(!cd) return;
      loadPricing(cd.id);
      const {data:roles}=await supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","labor_role").order("sort_order");
      if(roles?.length){
        const filled=roles.map(r=>({role:r.name,hours:"8",days:"1",people:1,rate:Number(r.amount||0)}));
        while(filled.length<4) filled.push({role:"",hours:"8",days:"1",people:1,rate:0});
        setLaborRoles(filled);
      }
      const {data:fuel}=await supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","fuel").maybeSingle();
      if(fuel) setFuelRate(Number(fuel.amount||0.67));
      const {data:reps}=await supabase.from("sales_reps").select("*").eq("company_id",cd.id).eq("active",true).order("created_at");
      if(reps?.length) setSalesReps(reps);
      // Load custom area types saved by this company (via the "Other" path)
      const {data:cats}=await supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","custom_area_type").order("sort_order");
      if(cats?.length) setCustomAreaTypes(cats.map(c=>c.name).filter(Boolean));
      const {data:listRows}=await supabase.from("cost_settings").select("name,period").eq("company_id",cd.id)
        .in("period",["list_area_type","list_thick_opt","list_r_val"]).order("sort_order");
      if(listRows?.length){
        const th=listRows.filter(r=>r.period==="list_thick_opt").map(r=>r.name);
        const rv=listRows.filter(r=>r.period==="list_r_val").map(r=>r.name);
        if(th.length) setDbThickOpts(th);
        if(rv.length) setDbRVals(rv);
        const at=listRows.filter(r=>r.period==="list_area_type").map(r=>r.name);
        if(at.length) setCustomAreaTypes(prev=>[...new Set([...at,...prev])]);
      }
    });
  },[]);

  function loadMaterials(newMaterial){
    if(newMaterial) setMaterials(prev=>[...prev,newMaterial]);
    supabase.from("materials").select("*").then(({data})=>{if(data) setMaterials(data);});
  }

  async function saveCustomAreaType(name){
    if(!name||AREA_TYPES.includes(name)||customAreaTypes.includes(name)) return;
    setCustomAreaTypes(prev=>[...prev,name]);
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user) return;
      const {data:cd}=await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      if(!cd) return;
      await supabase.from("cost_settings").insert([{
        company_id:cd.id, category:"Custom Area Types", name, period:"custom_area_type",
        amount:0, sort_order:Date.now(),
      }]);
    }catch(e){ console.warn("Could not save custom area type:",e.message); }
  }

  // Import areas from saved drawing measurements
  async function importFromDrawings(){
    const targetId = projectId || savedProjectId;
    if(!targetId){ alert("Save the estimate first, then import drawings."); return; }
    const {data:drawingAreas,error} = await supabase
      .from("drawing_areas").select("*").eq("project_id",targetId);
    if(error||!drawingAreas?.length){
      alert("No drawing measurements found for this project.\nGo to 📐 Drawings, trace the areas, and save them first.");
      return;
    }
    // Group by floor_name and merge into current areas state
    const imported = {};
    drawingAreas.forEach(da=>{
      const floor = da.floor_name||"Floor";
      if(!imported[floor]) imported[floor]=[];
      imported[floor].push({
        temp_id:Date.now()+Math.random(),
        floor, area_type:da.area_type||"", material:"", thickness_in:"", r_value:"", oc:"",
        sqft:Number(da.sqft||0), measurements:[], mh:"",ml:"",mq:"1",
        deduct_sqft:"",paint_sqft:"",price_override:"",phase:null,
        _collapsed:false, options:[], is_optional:false,
        _from_drawing:true,
      });
    });
    // Add floors that don't exist yet
    const newFloors=[...floors];
    Object.keys(imported).forEach(f=>{ if(!newFloors.includes(f)) newFloors.push(f); });
    setFloors(newFloors);
    // Prepend imported areas (collapse existing)
    setAreas(prev=>{
      const next={...prev};
      Object.entries(imported).forEach(([floor,newAreas])=>{
        const existing=(next[floor]||[]).map(a=>isAreaComplete(a)?{...a,_collapsed:true}:a);
        next[floor]=[...newAreas,...existing];
      });
      return next;
    });
    // Switch to the first imported floor
    const firstFloor=Object.keys(imported)[0];
    if(firstFloor) setActiveFloor(firstFloor);
    alert(`Imported ${drawingAreas.length} area${drawingAreas.length>1?"s":""} from drawings.\nNow assign material and R-value to each area.`);
  }

  function loadPricing(companyId){
    if(!companyId) return;
    supabase.from("material_costs").select("*").eq("company_id",companyId)
      .then(({data})=>{if(data) setMatCostsLive(data);});
    supabase.from("material_variants").select("*").eq("company_id",companyId)
      .then(({data})=>{if(data) setVariantsLive(data);});
    supabase.from("material_types").select("*").eq("company_id",companyId).order("sort_order")
      .then(({data})=>{if(data) setMatTypesLive(data);});
    supabase.from("material_products").select("*").eq("company_id",companyId).order("sort_order")
      .then(({data})=>{if(data) setMatProductsLive(data);});
  }

  function loadLeads(){
    supabase.from("customers").select("id,name,phone,address,email,company_name").order("name").limit(1000).then(({data,error})=>{
      if(error){console.error("leads error:",JSON.stringify(error));return;}
      if(data) setLeads(data);
    });
  }

    useEffect(()=>{
      if(!projectId) return;
      async function loadProject(){
      setLoadingProject(true);
      const {data:proj}=await supabase.from("projects").select("*").eq("id",projectId).single();
      if(!proj){setLoadingProject(false);return;}
      setProjectName(proj.name||""); setProjectAddress(proj.address||"");
      if(proj.lead_id) setSelectedLeadId(String(proj.lead_id));
      // Lock estimate if quote already sent
      const sentStatuses = ["Quote Ready","Proposal","Negotiation","Accepted","Job Scheduled","Completed","Sent to Office"];
      if(sentStatuses.includes(proj.pipeline_status)) setIsLocked(true);
      // Load crew notes / job info
      if(proj.crew_notes){
        try{
          const cn = typeof proj.crew_notes==="string" ? JSON.parse(proj.crew_notes) : proj.crew_notes;
          if(cn && typeof cn==="object") setCrewNotes(prev=>({...prev,...cn}));
        }catch(e){ console.error("crew_notes parse error",e); }
      }
      const {data:floorRows}=await supabase.from("floors").select("*").eq("project_id",projectId).order("order_index");
      if(!floorRows?.length){setLoadingProject(false);return;}
      const floorNames=[...new Set(floorRows.map(f=>f.name).filter(f=>f!=="Floor"))];
      setFloors(floorNames); setActiveFloor(floorNames[0]);
      const {data:areaRows}=await supabase.from("areas").select("*").eq("project_id",projectId).order("order_index");
      const areaIds=(areaRows||[]).map(a=>a.id);
      let segRows=[];
      if(areaIds.length){const {data:segs}=await supabase.from("segments").select("*").in("area_id",areaIds);segRows=segs||[];}
      const newAreas={};
      floorNames.forEach(f=>{newAreas[f]=[];});
      const sortedAreaRows=[...(areaRows||[])].sort((a,b)=>a.order_index-b.order_index);
      const primaryRows=sortedAreaRows.filter(a=>a.order_index%10===0||a.order_index===0);
      const secondaryRows=sortedAreaRows.filter(a=>a.order_index%10!==0&&a.order_index!==0);
      primaryRows.forEach(a=>{
        const fl=floorRows.find(f=>f.id===a.floor_id);
        if(!fl) return;
        const combos=secondaryRows.filter(s=>s.floor_id===a.floor_id&&s.order_index>a.order_index&&s.order_index<a.order_index+10);
        const rawSegs=segRows.filter(s=>s.area_id===a.id).map(s=>({h:s.height,l:s.length,q:1,sqft:s.sqft}));
        // If no segments saved (legacy bug), synthesize one so sqft/chips display
        const measurements=rawSegs.length>0?rawSegs:(a.sqft>0?[{h:a.sqft,l:1,q:1,sqft:a.sqft}]:[]);
        const mat_lines=[{id:1,material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||"",oc:a.oc||""},...combos.map((s,i)=>({id:i+2,material:s.material||"",thickness_in:s.thickness_in||"",r_value:s.r_value||"",oc:s.oc||""}))];
        const areaCard={temp_id:a.id,floor:fl.name,area_type:a.area_type,material:combos.length>0?"__combo__":(a.material||""),thickness_in:a.thickness_in||"",r_value:a.r_value||"",oc:a.oc||"",sqft:a.sqft||0,measurements,mh:"",ml:"",mq:"1",deduct_sqft:a.deduct_sqft||"",paint_sqft:a.paint_sqft||"",price_override:a.price_override||"",phase:a.phase||null,_collapsed:true,options:Array.isArray(a.options)?a.options:(typeof a.options==="string"?JSON.parse(a.options||"[]"):[]),mat_lines,is_optional:a.is_optional||false,optional_note:a.optional_note||""};
        if(newAreas[fl.name]) newAreas[fl.name].push(areaCard);
      });
      setAreas(newAreas);
        // Force leads reload if empty
        if(!leads.length) loadLeads();
        setAreas(newAreas);
        if(!leads.length) loadLeads();

        // Check for a pending draft for THIS existing project (resume mid-edit)
        if(resumeMode){
          const dKey=getDraftKey(String(proj.lead_id), proj.address||"");
          const draft=loadDraft(dKey);
          if(draft && draft.editingProjectId===projectId){
            if(draft.crewNotes) setCrewNotes(draft.crewNotes);
            if(draft.floors?.length) setFloors([...new Set(draft.floors.filter(f=>f!=="Floor"))]);
            if(draft.areas) setAreas(draft.areas);
            if(draft.projectName) setProjectName(draft.projectName);
            if(draft.projectAddress) setProjectAddress(draft.projectAddress);
            setDraftRestored(true);
          }
        }
        setLoadingProject(false);
    }
    loadProject();
  },[projectId]);

  useEffect(()=>{
    if(!isEditing&&selectedLeadId&&!draftRestored&&!resumeMode&&!savedProjectId){
      const key=getDraftKey(selectedLeadId, projectAddress);
      const draft=loadDraft(key);
      if(draft){
        const age=Math.round((Date.now()-new Date(draft.savedAt).getTime())/60000);
        const areaCount=Object.values(draft.areas||{}).flat().filter(a=>a.area_type).length;
        if(areaCount>0&&window.confirm(`You have a draft from ${age} min ago with ${areaCount} area(s). Resume it?`)){
          if(draft.crewNotes) setCrewNotes(draft.crewNotes);
          if(draft.floors) setFloors([...new Set(draft.floors.filter(f=>f!=="Floor"))]);
          if(draft.areas) setAreas(draft.areas);
          if(draft.projectName) setProjectName(draft.projectName);
          if(draft.projectAddress) setProjectAddress(draft.projectAddress);
          setDraftRestored(true);
          const first=(draft.floors||[]).find(f=>(draft.areas?.[f]||[]).some(a=>a.area_type||a.sqft>0));
          if(first) setPendingFloor(first);
        }
      }
    }
  },[selectedLeadId]);

  useEffect(()=>{
    if(!isEditing&&selectedLeadId){const t=setTimeout(()=>saveDraftNow(),1500);return()=>clearTimeout(t);}
  },[selectedLeadId,projectAddress,projectName]);

  useEffect(()=>{
    if(!isEditing&&leadId&&leads.length>0){
      const l=leads.find(l=>String(l.id)===String(leadId));
      if(l){
        setSelectedLeadId(String(l.id)); setProjectName(l.name||"");
        // Never copy customer address to job address — job site is different
      }
    }
  },[leadId,leads]);

  // materialMap now sources actual pricing from material_costs (Settings),
  // not materials.price_per_unit which is never populated by Settings and
  // always defaulted to 0 — that disconnect meant the live on-screen total
  // while editing could differ from the final saved quote total.
  const materialMap=useMemo(()=>{
    // ── Two-layer system (new): material_types + material_products ────────────
    if(matTypesLive.length>0){
      return Object.fromEntries(matTypesLive.map(t=>{
        const allProds = matProductsLive.filter(p=>p.material_type_id===t.id);
        // R-value lookup happens per-area at calc time; for the map we use the generic active product
        const prod = allProds.find(p=>p.is_active&&!p.r_value) || allProds.find(p=>p.is_active) || allProds[0];
        const nameL = t.name.toLowerCase();
        const rpi = t.r_per_inch ? Number(t.r_per_inch)
          : t.unit==="board_ft" ? (nameL.includes("closed")?6.8:nameL.includes("open")?3.75:null)
          : t.unit==="bag" ? (nameL.includes("cellulose")||nameL.includes("blown")?3.5:null)
          : null;
        const sellPrice = prod ? Number(prod.cost_per_unit||0) : 0;
        return [t.name, {
          name:t.name, unit:t.unit||"sqft",
          price_per_unit:sellPrice,
          coverage_factor:prod?Number(prod.coverage_factor||1):1,
          r_per_inch:rpi,
          // Store all products so per-area R-value lookup works
          allProducts: allProds,
        }];
      }));
    }
    // ── Legacy system (fallback): material_costs ───────────────────────────────
    const costMap=Object.fromEntries(matCostsLive.map(m=>[m.material_name,m]));
    return Object.fromEntries(materials.map(m=>{
      const mc=costMap[m.name];
      const sellPrice=mc ? Number(mc.cost_per_unit||0) : Number(m.price_per_unit||0);
      return [m.name, { name:m.name, unit: mc?mc.unit:m.unit, price_per_unit: sellPrice, coverage_factor: mc?Number(mc.coverage_factor||1):1,
        r_per_inch: mc&&mc.r_per_inch ? Number(mc.r_per_inch)
          : mc?.unit==="board_ft" ? (
              m.name.toLowerCase().includes("closed") ? 6.8
            : m.name.toLowerCase().includes("open")   ? 3.75
            : null)
          : null }];
    }));
  },[matTypesLive, matProductsLive, materials, matCostsLive]);
  const variantMap=useMemo(()=>Object.fromEntries(
    variantsLive.map(v=>[`${v.material_name}|${v.r_value}`.toLowerCase(), v])
  ),[variantsLive]);
  const selectedLead=leads.find(l=>String(l.id)===String(selectedLeadId));

  function floorTotal(floor){return(areas[floor]||[]).filter(a=>!a.is_optional).reduce((s,a)=>s+getAreaTotalCost(a,materialMap,variantMap),0);}
  const projectTotal=floors.reduce((s,f)=>s+floorTotal(f),0);

  function addFloor(){
    const name=newFloorName.trim();if(!name)return;
    setFloors(p=>[...p,name]);setAreas(p=>({...p,[name]:[]}));
    setActiveFloor(name);setNewFloorName("");setAddingFloor(false);
  }

  // When connection returns, save any pending changes to the DB
  useEffect(()=>{
    const handleOnline = ()=>{
      flushQueue();
      const targetId = projectId || savedProjectId;
      if(selectedLeadId && targetId) saveProject({silent:true});
    };
    window.addEventListener("online", handleOnline);
    return ()=>window.removeEventListener("online", handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[projectId, savedProjectId, selectedLeadId]);

  function addArea(floor){
    setAreas(prev=>{
      const ex=prev[floor]||[];
      const hasIncomplete=ex.some(a=>!isAreaComplete(a));
      if(hasIncomplete) return prev;
      // Collapse all existing areas first
      const collapsed=ex.map(a=>isAreaComplete(a)?{...a,_collapsed:true}:a);
      // Copy defaults from the most recent area but start fresh for measurements
      const last=collapsed[0]; // take from first (top) since that's most recent
      const n=last
        ?{...last,temp_id:Date.now(),sqft:0,measurements:[],mh:"",ml:"",mq:"1",deduct_sqft:"",paint_sqft:"",price_override:"",phase:null,_collapsed:false,options:[],is_optional:false}
        :{temp_id:Date.now(),floor,area_type:"",material:"",thickness_in:"",r_value:"",oc:"",sqft:0,measurements:[],mh:"",ml:"",mq:"1",deduct_sqft:"",paint_sqft:"",price_override:"",phase:null,_collapsed:false,options:[],is_optional:false};
      // Prepend — new area appears at the top of the list
      return {...prev,[floor]:[n,...collapsed]};
    });
    // Scroll area list to top so new card is immediately visible
    setTimeout(()=>{ areaListRef.current?.scrollTo({top:0,behavior:"smooth"}); }, 60);
  }

  function updateArea(floor,idx,field,value){
    setAreas(prev=>{
      const upd=[...(prev[floor]||[])];
      const existing=prev[floor][idx]||{};
      upd[idx]={...existing,[field]:value};
      if(field!=="options") upd[idx].options=existing.options||[];
      if(selectedLeadId) saveDraftNow({...prev,[floor]:upd});
      if(field==="area_type"){
        const match=Object.values(prev).flat().reverse().find(a=>a.area_type===value&&a.material&&a.material!=="__custom_mat__");
        if(match) upd[idx]={...upd[idx],material:match.material,thickness_in:match.thickness_in,r_value:match.r_value,oc:match.oc,mat_lines:match.mat_lines?match.mat_lines.map(ml=>({...ml})):undefined,options:existing.options||[]};
      }
      // Phase logic
      if(field==="phase"){
        if(value==="__clear_all__"){
          // Customer changed mind — remove ALL phases from entire job
          const cleared = {};
          Object.keys(prev).forEach(f=>{
            cleared[f]=(prev[f]||[]).map(a=>({...a,phase:null}));
          });
          return cleared;
        }
        if(value===1){
          // Set this area as Phase 1; all unphased areas become Phase 2
          const newState = {...prev,[floor]:upd};
          Object.keys(newState).forEach(f=>{
            newState[f]=(newState[f]||[]).map((a,i)=>
              (f===floor&&i===idx) ? a : (a.phase?a:{...a,phase:2})
            );
          });
          return newState;
        }
      }
      // When an area is expanded (un-collapsed), move it to position 0
      // so it's always at the top — important for mobile where the screen
      // is small and you need to see the active area without scrolling.
      if(field==="_collapsed" && value===false){
        const area=upd.splice(idx,1)[0];
        upd.unshift(area);
        setTimeout(()=>{ areaListRef.current?.scrollTo({top:0,behavior:"smooth"}); }, 60);
      }
      return {...prev,[floor]:upd};
    });
  }

  function deleteArea(floor,idx){setAreas(prev=>({...prev,[floor]:prev[floor].filter((_,i)=>i!==idx)}));}
  function moveArea(fromFloor, idx, toFloor){
    if(fromFloor===toFloor) return;
    setAreas(prev=>{
      const area = prev[fromFloor]?.[idx];
      if(!area) return prev;
      return {
        ...prev,
        [fromFloor]: prev[fromFloor].filter((_,i)=>i!==idx),
        [toFloor]: [...(prev[toFloor]||[]), {...area, temp_id:area.temp_id||Date.now()}],
      };
    });
  }

  async function saveNewCustomer(form){
    let companyId=null;
    try{const {data:{user}}=await supabase.auth.getUser();const {data:cd}=await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();companyId=cd?.id||null;}catch(e){}
    const {data,error}=await supabase.from("customers").insert([{name:form.name||"",phone:form.phone||"",company_name:form.company_name||"",email:form.email||"",address:form.address||"",status:"New",estimate_amount:0,company_id:companyId}]).select().single();
    if(error){alert("Could not save customer: "+(error.message||JSON.stringify(error)));return;}
    if(data){loadLeads();setSelectedLeadId(String(data.id));setProjectName(data.name||"");/* keep existing address — only blank if nothing entered yet */}
  }

  async function calculateJobPrice(companyId,allAreas,totalSqft){
    const [{data:matCosts},{data:variants},{data:overheadCosts},{data:consumables}]=await Promise.all([
      supabase.from("material_costs").select("*").eq("company_id",companyId),
      supabase.from("material_variants").select("*").eq("company_id",companyId),
      supabase.from("cost_settings").select("*").eq("company_id",companyId).not("period","eq","job_consumable"),
      supabase.from("cost_settings").select("*").eq("company_id",companyId).eq("period","job_consumable"),
    ]);
    const matCostMap={};(matCosts||[]).forEach(m=>{matCostMap[m.material_name]=m;});
    // variant key ignores facing (areas don't currently track it) — matches on material+thickness+R-value
    const variantMap={};(variants||[]).forEach(v=>{variantMap[`${v.material_name}|${v.r_value}`.toLowerCase()]=v;});
    const TM={"2x4":3.5,"2x6":5.5,"2x8":7.25,"2x10":9.25,"2x12":11.25,"I-joist":11.875};
    let materialCost=0;
    const overriddenAreaIds=new Set();
    allAreas.forEach(a=>{
      // Per-job manual price override — counted once per area even though
      // combo areas appear here once per mat_line.
      if(a.price_override && Number(a.price_override)>0){
        const areaKey=a.id||a.temp_id;
        if(areaKey && overriddenAreaIds.has(areaKey)) return;
        if(areaKey) overriddenAreaIds.add(areaKey);
        materialCost+=(a.sqft||0)*Number(a.price_override);
        return;
      }
      const variantKey=`${a.material}|${a.r_value}`.toLowerCase();
      const variant=variantMap[variantKey];
      if(variant){
        // discrete per-thickness/R-value product (batt, rigid foam sheet) — priced flat per sqft
        materialCost+=(a.sqft||0)*Number(variant.cost_per_sqft||0)*(1+Number(variant.markup_pct||0)/100);
        return;
      }
      const mc=matCostMap[a.material];if(!mc)return;
      const matNameL=(a.material||"").toLowerCase();
      const rpi = mc.r_per_inch>0 ? Number(mc.r_per_inch)
        : mc.unit==="board_ft" ? (matNameL.includes("closed")?6.8:matNameL.includes("open")?3.75:0)
        : mc.unit==="bag" ? (matNameL.includes("cellulose")||matNameL.includes("blown")?3.5:0)
        : 0;
      const thick = (rpi>0 && a.r_value)
        ? parseRValueNumber(a.r_value)/rpi
        : (TM[a.thickness_in]||0);
      let qty=mc.unit==="board_ft"?(a.sqft||0)*thick:mc.unit==="bag"?Math.ceil(((a.sqft||0)*thick)/(mc.coverage_factor||1)):(a.sqft||0);
      materialCost+=qty*Number(mc.cost_per_unit||0);
    });
    const overheadCost=(overheadCosts||[]).reduce((s,c)=>s+Number(c.amount||0),0)/20;
    const consumableCost=(consumables||[]).reduce((s,c)=>s+Number(c.amount||0)*(totalSqft>0?totalSqft/1000:1),0);
    const totalCost=materialCost+overheadCost+consumableCost;const margin=30;
    return {material_cost:Math.round(materialCost*100)/100,overhead_cost:Math.round(overheadCost*100)/100,labor_cost:0,final_price:Math.round(totalCost*(1+margin/100)*100)/100,profit_margin_pct:margin,grand_total:Math.round(totalCost*(1+margin/100)*100)/100};
  }

  async function saveOptionsOnly(){
    if(saving)return;setSaving(true);
    try{
      const {data:existingAreas}=await supabase.from("areas").select("id,area_type,sqft,floor_id,order_index").eq("project_id",savedProjectId||projectId).order("order_index");
      if(!existingAreas?.length){setSaving(false);return;}
      for(const floor of floors){for(const a of(areas[floor]||[])){if(!isAreaComplete(a))continue;const match=existingAreas.find(ea=>ea.area_type===a.area_type&&Math.abs(ea.sqft-a.sqft)<0.01);if(match&&(a.options||[]).length>0)await supabase.from("areas").update({options:a.options||[]}).eq("id",match.id);}}
      setSaved(true);setTimeout(()=>setSaved(false),2000);
    }catch(err){alert("Error saving options: "+err.message);}
    setSaving(false);
  }

  // Auto-commit any measurement that's typed in but not yet tapped ✓
  // Prevents data loss when user saves without committing pending inputs
  function commitPendingMeasurements(areasState){
    const result={};
    Object.entries(areasState).forEach(([floor,floorAreas])=>{
      result[floor]=(floorAreas||[]).map(area=>{
        const h=parseFloat(area.mh)||0;
        const l=parseFloat(area.ml)||0;
        const q=parseFloat(area.mq)||1;
        if(h&&l){
          const rowSqft=Math.round(h*l*q*100)/100;
          const meas=[...(area.measurements||[]),{h,l,q,sqft:rowSqft}];
          const d=parseFloat(area.deduct_sqft)||0;
          const total=Math.max(0,Math.round(meas.reduce((s,m)=>s+m.sqft,0)-d)*100)/100;
          return {...area,measurements:meas,sqft:total,mh:"",ml:"",mq:"1"};
        }
        return area;
      });
    });
    return result;
  }

  async function saveProject({silent=false}={}) {
  if(saving) return;
  if(!selectedLeadId){ if(!silent) alert("Please select or register a customer before saving."); return; }
  const hasAreas = floors.some(f=>(areas[f]||[]).some(a=>isAreaComplete(a)));
  // Auto-commit any in-progress measurement inputs before saving
  const committedAreas = commitPendingMeasurements(areas);
  // Also update state so UI reflects the committed measurements
  setAreas(committedAreas);
  if(!hasAreas){ if(!silent) alert("Add at least one area before saving."); return; }
  if(!silent) setSaving(true);
  try {
    const {data:{user}} = await supabase.auth.getUser();
    const {data:cd} = await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
    const companyId = cd?.id||null;

    // ── EDIT MODE: update existing project ──
    const targetProjectId = projectId || savedProjectId;
    if(targetProjectId){
     const allComplete = floors.every(f=>(areas[f]||[]).every(a=>!a.area_type||isAreaComplete(a)));
     const {data:currentProj} = await supabase.from("projects").select("pipeline_status").eq("id",targetProjectId).single();
     const updateFields = {
        name:projectName||"New Project",
        address:projectAddress||"",
        lead_id:Number(selectedLeadId)||null,
        crew_notes:JSON.stringify(crewNotes),
      };
     if(allComplete && (currentProj?.pipeline_status||"Draft")==="Draft"){
        updateFields.pipeline_status = "Measured";
      }
      await supabase.from("projects").update(updateFields).eq("id", targetProjectId);

      // delete old areas and re-insert
      await supabase.from("segments").delete().in("area_id",
        (await supabase.from("areas").select("id").eq("project_id",targetProjectId)).data?.map(a=>a.id)||[]
      );
      await supabase.from("areas").delete().eq("project_id", targetProjectId);
      await supabase.from("floors").delete().eq("project_id", targetProjectId);

      // re-insert floors — dedup first to prevent duplicate floor names
      const uniqueFloors = [...new Set(floors)];
      const {data:floorRows} = await supabase.from("floors").insert(
        uniqueFloors.map((name,i)=>({project_id:targetProjectId,name,order_index:i+1,company_id:companyId}))
      ).select();
      const floorMap={};
      (floorRows||[]).forEach(f=>{floorMap[f.name]=f.id;});

      // re-insert areas — tag each row with its area's temp_id so we can match segments reliably
      let _updateAreaIdx=0;
      const allAreas=uniqueFloors.flatMap(floor=>(committedAreas[floor]||[]).filter(a=>a.area_type&&(a.sqft>0||a.measurements?.length>0)).flatMap((a)=>{
        const i=_updateAreaIdx++;
        const mls=(a.mat_lines&&a.mat_lines.length>0)?a.mat_lines:[{material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||"",oc:a.oc||""}];
        return mls.map((ml,mi)=>{
          const mat=materialMap[ml.material];
          const {qty,unit,unit_price,line_total}=calcAreaForSave(a,ml,mi,mat,variantMap);
          return {project_id:targetProjectId,floor_id:floorMap[floor],area_type:a.area_type,material:ml.material,thickness_in:ml.thickness_in||null,r_value:ml.r_value,sqft:a.sqft,qty,unit,unit_price,line_total,order_index:i*10+mi,company_id:companyId,options:mi===0?(a.options||[]):[],paint_sqft:mi===0?Number(a.paint_sqft||0):0,deduct_sqft:mi===0?Number(a.deduct_sqft||0):0,price_override:mi===0?(a.price_override||null):null,phase:mi===0?(a.phase||null):null,is_optional:mi===0?(a.is_optional||false):false,optional_note:mi===0?(a.optional_note||""):""};
        });
      }));
      if(allAreas.length>0){
        const {data:areaRows}=await supabase.from("areas").insert(allAreas).select();
        // Build a map from order_index → DB id so we never rely on insert return order
        const orderToId={};
        (areaRows||[]).forEach(r=>{ orderToId[r.order_index]=r.id; });
        const segs=[];let _si=0;
        uniqueFloors.forEach(floor=>{
          (committedAreas[floor]||[]).filter(a=>a.area_type&&(a.sqft>0||a.measurements?.length>0)).forEach(a=>{
            // primary row for this area always has mi===0, i.e. order_index = _si*10
            const primaryId=orderToId[_si*10];_si++;
            if(!primaryId)return;
            (a.measurements||[]).forEach(m=>segs.push({area_id:primaryId,height:m.h,length:m.l,sqft:m.sqft,source:"field",company_id:companyId}));
          });
        });
        if(segs.length>0) await supabase.from("segments").insert(segs);
      }
    wasSaved.current = true;
    if(!silent){ setSaved(true); setSavedProjectId(targetProjectId); }
    else { setSavedProjectId(targetProjectId); }
    clearDraft(); setHasUnsavedChanges(false);
      return;
    }

    // ── NEW PROJECT: insert ──
      const allComplete = floors.every(f=>(areas[f]||[]).every(a=>!a.area_type||isAreaComplete(a)));
      const {data:proj,error:pe} = await supabase.from("projects").insert([{
        lead_id:Number(selectedLeadId), name:projectName||"New Project", address:projectAddress||"",
        status:"Active", source:"field", company_id:companyId,
        crew_notes: JSON.stringify(crewNotes),
        pipeline_status: allComplete ? "Measured" : "Draft",
      }]).select().single();
      if(pe)throw pe;
      const uniqueNewFloors=[...new Set(floors)];
      const {data:floorRows}=await supabase.from("floors").insert(uniqueNewFloors.map((name,i)=>({project_id:proj.id,name,order_index:i+1,company_id:companyId}))).select();
      const floorMap={};(floorRows||[]).forEach(f=>{floorMap[f.name]=f.id;});
      let _newAreaIdx=0;
      const allAreas=uniqueNewFloors.flatMap(floor=>(committedAreas[floor]||[]).filter(a=>a.area_type&&(a.sqft>0||a.measurements?.length>0)).flatMap((a)=>{
        const i=_newAreaIdx++;
        const mls=(a.mat_lines&&a.mat_lines.length>0)?a.mat_lines:[{material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||"",oc:a.oc||""}];
        return mls.map((ml,mi)=>{const mat=materialMap[ml.material];const {qty,unit,unit_price,line_total}=calcAreaForSave(a,ml,mi,mat,variantMap);return {project_id:proj.id,floor_id:floorMap[floor],area_type:a.area_type,material:ml.material,thickness_in:ml.thickness_in||null,r_value:ml.r_value,sqft:a.sqft,qty,unit,unit_price,line_total,order_index:i*10+mi,company_id:companyId,options:mi===0?(a.options||[]):[],paint_sqft:mi===0?Number(a.paint_sqft||0):0,deduct_sqft:mi===0?Number(a.deduct_sqft||0):0,price_override:mi===0?(a.price_override||null):null,phase:mi===0?(a.phase||null):null,is_optional:mi===0?(a.is_optional||false):false,optional_note:mi===0?(a.optional_note||""):""}; });
      }));
      if(allAreas.length>0){
        const {data:areaRows,error:ae}=await supabase.from("areas").insert(allAreas).select();
        if(ae)throw ae;
        const orderToId2={};
        (areaRows||[]).forEach(r=>{ orderToId2[r.order_index]=r.id; });
        const segs=[];let _si2=0;
        uniqueNewFloors.forEach(floor=>{(committedAreas[floor]||[]).filter(a=>a.area_type&&(a.sqft>0||a.measurements?.length>0)).forEach(a=>{const primaryId=orderToId2[_si2*10];_si2++;if(!primaryId)return;(a.measurements||[]).forEach(m=>segs.push({area_id:primaryId,height:m.h,length:m.l,sqft:m.sqft,source:"field",company_id:companyId}));});});
        if(segs.length>0)await supabase.from("segments").insert(segs);
      }
      const allAreasList=floors.flatMap(floor=>(committedAreas[floor]||[]).filter(a=>a.area_type&&(a.sqft>0||a.measurements?.length>0)).flatMap(a=>{const mls=(a.mat_lines&&a.mat_lines.length>0)?a.mat_lines:[{material:a.material||"",thickness_in:a.thickness_in||""}];return mls.map(ml=>({...a,material:ml.material,thickness_in:ml.thickness_in}));}));
      const finalLaborCost=laborRoles.reduce((s,r)=>s+Number(r.hours||0)*Number(r.days||1)*Number(r.people||1)*Number(r.rate||0),0);
      // actual conditioned sqft for the job — NOT the dollar total, which was
      // previously passed here by mistake and threw off consumables scaling
      const realTotalSqft=floors.reduce((s,f)=>s+(areas[f]||[]).filter(a=>!a.is_optional).reduce((ss,a)=>ss+(a.sqft||0),0),0);
      const pricing=await calculateJobPrice(companyId,allAreasList,realTotalSqft);
      const fuelCostCalc=Number(jobMiles||0)*2*fuelRate;
      const {data:assetList}=await supabase.from("assets").select("*").eq("company_id",companyId);
      const depreciationCost=((assetList||[]).reduce((s,a)=>(s+(Number(a.purchase_price||0)-Number(a.salvage_value||0))/Number(a.useful_life_years||5)/12),0))/20;
      const repData=selectedRep?salesReps.find(r=>r.id===selectedRep):null;
      const commissionPct=repData?Number(repData.commission_pct||0):0;
      const totalCostWithLabor=pricing.material_cost+pricing.overhead_cost+finalLaborCost+fuelCostCalc+depreciationCost;
      const basePriceWithMargin=totalCostWithLabor*(1+(pricing.profit_margin_pct||30)/100);
      const commissionCost=basePriceWithMargin*commissionPct/100;
      const finalPriceWithLabor=basePriceWithMargin+commissionCost;
      await supabase.from("customers").update({estimate_amount:Math.round(finalPriceWithLabor*100)/100}).eq("id",selectedLeadId);
      const allOptions=floors.flatMap(floor=>(areas[floor]||[]).filter(a=>a.area_type&&a.sqft&&(a.options||[]).length>0).map(a=>({area_type:a.area_type,floor,sqft:a.sqft,options:a.options,mat_lines:a.mat_lines})));
      await supabase.from("quotes").insert([{project_id:proj.id,subtotal:pricing.material_cost,tax_rate:0,tax_total:0,grand_total:Math.round(finalPriceWithLabor*100)/100,final_price:Math.round(finalPriceWithLabor*100)/100,material_cost:pricing.material_cost,overhead_cost:pricing.overhead_cost,labor_cost:Math.round(finalLaborCost*100)/100,labor_hours:laborRoles.reduce((s,r)=>s+Number(r.hours||0)*Number(r.days||1)*Number(r.people||1),0),crew_size:laborRoles.filter(r=>Number(r.hours||0)>0).length,labor_rate:laborRoles.find(r=>Number(r.hours||0)>0)?.rate||45,profit_margin_pct:pricing.profit_margin_pct,fuel_cost:Math.round(fuelCostCalc*100)/100,commission_cost:Math.round(commissionCost*100)/100,commission_pct:commissionPct,job_miles:Number(jobMiles||0),sales_rep_id:selectedRep||null,notes:allOptions.length>0?JSON.stringify(allOptions):null,status:"Draft",company_id:companyId}]);
      wasSaved.current = true;
      if(!silent){ setSaved(true); } setSavedProjectId(proj.id); clearDraft();
      setHasUnsavedChanges(false);

      // If started from "By Drawings", import the drawing draft into the new estimate
      if(fromDrawing){
        try{
          const draft=JSON.parse(localStorage.getItem("drawing_draft")||"[]");
          if(draft.length>0){
            const {data:floorRows}=await supabase.from("floors").select("id,name").eq("project_id",proj.id);
            const fmap={}; (floorRows||[]).forEach(f=>fmap[f.name]=f.id);
            const {data:{user:u}}=await supabase.auth.getUser();
            const {data:cd2}=await supabase.from("companies").select("id").eq("user_id",u.id).maybeSingle();
            const inserts=draft.map((a,i)=>({
              project_id:proj.id, floor_id:fmap[a.floor]||floorRows?.[0]?.id,
              company_id:cd2?.id, area_type:a.areaType, sqft:a.sqft,
              order_index:i*10, material:null, r_value:null, thickness_in:null,
              options:[], paint_sqft:0, deduct_sqft:0,
            })).filter(a=>a.floor_id);
            if(inserts.length) await supabase.from("areas").insert(inserts);
            localStorage.removeItem("drawing_draft");
            // Reload so the imported areas appear as cards
            window.location.href=`/project/${proj.id}`;
            return;
          }
        }catch(e){ console.warn("Drawing draft import error:",e.message); }
      }
    }catch(err){console.error(err);if(!silent)alert("Error: "+(err.message||JSON.stringify(err)));}
    finally{if(!silent)setSaving(false);}
  }

  useEffect(()=>{if(saved){const t=setTimeout(()=>setSaved(false),3000);return()=>clearTimeout(t);}},[saved]);

  const currentAreas=areas[activeFloor]||[];
  const panelProps={floors,areas,materialMap,variantMap,crewNotes,projectName,projectAddress,customer:selectedLead};

  if(loadingProject) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:"#64748b"}}>Loading estimate…</div>;

  return (
    <div style={{fontFamily:"system-ui,sans-serif",color:C.ink,background:C.bg,minHeight:"100%",display:"flex",flexDirection:"column",WebkitOverflowScrolling:"touch"}}>
      {saved&&(
        <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:300,display:"flex",alignItems:"center",gap:10,background:"#059669",color:"#fff",padding:"8px 16px",borderRadius:20,fontSize:12,fontWeight:700,boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>
          <span>✅ Saved!</span>
          {savedProjectId&&(<><button onClick={()=>navigate(`/project/drawings/${savedProjectId}`)} style={{background:"#7c3aed",color:"white",border:"none",borderRadius:12,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📐 Drawings</button><button onClick={()=>navigate(`/field-report/${savedProjectId}`)} style={{background:"#3b82f6",color:"white",border:"none",borderRadius:12,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📋 Office Report</button><button onClick={()=>navigate(`/quote/${savedProjectId}`)} style={{background:"white",color:"#059669",border:"none",borderRadius:12,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📄 Quote</button></>)}
        </div>
      )}
      {isLocked && (
        <div style={{background:"#fef3c7",borderBottom:"2px solid #f59e0b",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <span style={{fontSize:13,fontWeight:700,color:"#92400e"}}>🔒 This estimate has been sent to the customer — it is read-only.</span>
          <button onClick={()=>navigate(-1)} style={{fontSize:12,fontWeight:700,padding:"4px 14px",borderRadius:6,border:"1px solid #f59e0b",background:"#fff",color:"#92400e",cursor:"pointer"}}>← Go Back</button>
        </div>
      )}
      <div style={{position:"sticky",top:0,zIndex:100,background:C.white,borderBottom:`1px solid ${C.border}`,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <span style={{fontWeight:700,fontSize:14,flex:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{isEditing?(isLocked?"🔒 View Estimate":"✏️ Edit Estimate"):(projectName||"New Project")}</span>
        <div style={{display:"flex",gap:6}}>
          {savedProjectId&&(<><button onClick={()=>navigate(`/project/drawings/${savedProjectId}`)} style={{...BtnD,background:"#7c3aed",height:32,fontSize:12,padding:"0 10px",borderRadius:8}}>📐 Drawings</button><button onClick={()=>navigate(`/field-report/${savedProjectId}`)} style={{...BtnD,background:"#3b82f6",height:32,fontSize:12,padding:"0 10px",borderRadius:8}}>📋 Office</button><button onClick={()=>navigate(`/quote-pricing/${savedProjectId}`)} style={{...BtnD,background:"#f97316",height:32,fontSize:12,padding:"0 10px",borderRadius:8}}>📄 Quote</button></>)}
          {!isLocked && <button onClick={saveProject} disabled={saving} style={{...BtnD,fontSize:13,height:32,padding:"0 14px",background:saving?"#64748b":C.ink,borderRadius:8,opacity:!selectedLeadId?0.4:1}}>{saving?"…":"Save"}</button>}
        </div>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        <div ref={areaListRef} style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"8px 12px 200px 12px",minWidth:0,boxSizing:"border-box",width:"100%"}}>
          <CustomerSection leads={leads} selectedLead={selectedLead} selectedLeadId={selectedLeadId}
            projectAddress={projectAddress} projectName={projectName}
            onSelect={(lead)=>{setSelectedLeadId(String(lead.id));setProjectName(lead.name||"");/* never overwrite address when editing */}}
            onClear={()=>{setSelectedLeadId("");setProjectName("");if(!projectId) setProjectAddress("");}}
            isEditing={isEditing}
            onSaveNew={saveNewCustomer} onAddressChange={isEditing ? ()=>{} : setProjectAddress} onNameChange={setProjectName} />

            <div style={CARD_ORANGE} className={currentAreas.some(a=>!isAreaComplete(a))?"area-focus-bg":""}>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <select style={{...S,flex:1,height:32,fontSize:12}} value={crewNotes.const_type} onChange={e=>setCrewNotes(p=>({...p,const_type:e.target.value}))}><option value="">Job type…</option>{CONST_TYPES.map(t=><option key={t}>{t}</option>)}</select>
              <select style={{...S,flex:1,height:32,fontSize:12}} value={crewNotes.ladder} onChange={e=>setCrewNotes(p=>({...p,ladder:e.target.value}))}><option value="">Ladder…</option>{LADDER_OPTS.map(l=><option key={l}>{l}</option>)}</select>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>FireBlock</span>
              {["Yes","No"].map(v=>(<button key={v} onClick={()=>setCrewNotes(p=>({...p,fire_blocking:v}))} style={{...Btn,height:30,fontSize:12,padding:"0 10px",background:crewNotes.fire_blocking===v?C.ink:C.white,color:crewNotes.fire_blocking===v?"#fff":C.muted,borderColor:crewNotes.fire_blocking===v?C.ink:C.border}}>{v}</button>))}
              <span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",marginLeft:4}}>Park</span>
              {["Yes","No"].map(v=>(<button key={v} onClick={()=>setCrewNotes(p=>({...p,parking:v}))} style={{...Btn,height:30,fontSize:12,padding:"0 10px",background:crewNotes.parking===v?C.ink:C.white,color:crewNotes.parking===v?"#fff":C.muted,borderColor:crewNotes.parking===v?C.ink:C.border}}>{v}</button>))}
              <input placeholder="Units" value={crewNotes.units} onChange={e=>setCrewNotes(p=>({...p,units:e.target.value}))} style={{...I,flex:1,height:30,fontSize:12}} />
            </div>
            <input placeholder="Other info for crew…" value={crewNotes.extra_notes} onChange={e=>setCrewNotes(p=>({...p,extra_notes:e.target.value}))} style={{...I,width:"100%",height:30,fontSize:12}} />
          </div>

          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:5}} className={currentAreas.some(a=>!isAreaComplete(a))?"area-focus-bg":""}>
            {floors.map(floor=>{
              const act=activeFloor===floor;
              const hasAreas=(areas[floor]||[]).some(a=>isAreaComplete(a));
              return (<button key={floor} onClick={()=>setActiveFloor(floor)} className="floor-btn" style={{padding:"8px 14px",borderRadius:8,height:"auto",border:act?"2px solid #059669":"2px solid #86efac",background:act?"#059669":(hasAreas?"#dcfce7":C.white),color:act?"#fff":"#059669",cursor:"pointer",fontSize:14,fontWeight:700,whiteSpace:"nowrap",boxShadow:act?"0 2px 8px rgba(5,150,105,.3)":"none"}}>{floor}{hasAreas&&!act&&<span style={{marginLeft:4,fontSize:10}}>✓</span>}</button>);
            })}
            {addingFloor?(
              <div style={{display:"flex",gap:3}}>
                <input autoFocus placeholder="Name" value={newFloorName} onChange={e=>setNewFloorName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addFloor();if(e.key==="Escape")setAddingFloor(false);}} style={{...I,width:75}} />
                <button onClick={addFloor} style={{...BtnD,padding:"0 6px"}}>✓</button>
                <button onClick={()=>setAddingFloor(false)} style={{...Btn,padding:"0 5px"}}>✕</button>
              </div>
            ):(
              <button onClick={()=>setAddingFloor(true)} className="floor-btn" style={{padding:"8px 14px",borderRadius:8,height:"auto",border:"2px dashed #86efac",background:"none",color:"#059669",cursor:"pointer",fontSize:14,fontWeight:700,whiteSpace:"nowrap"}}>+ Floor</button>
            )}
          </div>

          <div style={{display:"flex",gap:6,marginBottom:6}}>
            <button onClick={()=>addArea(activeFloor)} className={currentAreas.some(a=>!isAreaComplete(a))?"area-focus-bg":""} style={{flex:1,padding:"7px",borderRadius:7,border:`1px dashed ${C.border}`,background:C.white,color:C.muted,cursor:"pointer",fontSize:11,fontWeight:600,height:"auto"}}>+ Add area to {activeFloor}</button>
            {savedProjectId&&(
              <button onClick={()=>navigate(`/project/drawings/${savedProjectId}`)}
                title="Measure areas from a PDF floor plan"
                style={{border:"none",background:"#7c3aed",color:"#fff",borderRadius:7,padding:"0 12px",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>
                📐 From Drawing
              </button>
            )}
          </div>

          {/* Focus overlay when an area is being edited */}
         {currentAreas.some(a=>!isAreaComplete(a)) && (
          <style>{`
            @media (max-width: 899px) {
              .area-focus-bg { opacity: 0.3; pointer-events: none; transition: opacity 0.2s; }
            }
          `}</style>
        )}

          {currentAreas.length===0 ? (
            <div style={{textAlign:"center",padding:"14px",color:C.faint,fontSize:11,background:C.white,borderRadius:7,border:`1px solid ${C.border}`,marginBottom:5}}>No areas for {activeFloor} — tap above to add one</div>
          ):(
            <>
              {currentAreas.map((area,idx)=>({area,idx})).filter(({area})=>!isAreaComplete(area)).map(({area,idx})=>(
                <AreaRow key={area.id||area.temp_id} area={area} matTypesLive={matTypesLive} materials={materials} materialMap={materialMap} variantMap={variantMap} onChange={(field,value)=>updateArea(activeFloor,idx,field,value)} onDelete={()=>deleteArea(activeFloor,idx)} onMove={(toFloor)=>{const realI=(areas[activeFloor]||[]).indexOf(area);moveArea(activeFloor,realI>=0?realI:idx,toFloor);}} floors={floors} activeFloor={activeFloor} saveOptionsOnly={saveOptionsOnly} onMaterialAdded={loadMaterials} customAreaTypes={customAreaTypes} onSaveCustomAreaType={saveCustomAreaType} dbThickOpts={dbThickOpts} dbRVals={dbRVals} />
              ))}
              {currentAreas.some(a=>isAreaComplete(a))&&(<div style={{fontSize:9,fontWeight:700,color:"#059669",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4,marginTop:2,paddingLeft:2}}>✓ Completed areas</div>)}
              {currentAreas.map((area,idx)=>({area,idx})).filter(({area})=>isAreaComplete(area)).map(({area,idx})=>(
                <AreaRow key={area.id||area.temp_id} area={area} matTypesLive={matTypesLive} materials={materials} materialMap={materialMap} variantMap={variantMap} onChange={(field,value)=>updateArea(activeFloor,idx,field,value)} onDelete={()=>deleteArea(activeFloor,idx)} onMove={(toFloor)=>{const realI=(areas[activeFloor]||[]).indexOf(area);moveArea(activeFloor,realI>=0?realI:idx,toFloor);}} floors={floors} activeFloor={activeFloor} saveOptionsOnly={saveOptionsOnly} onMaterialAdded={loadMaterials} customAreaTypes={customAreaTypes} onSaveCustomAreaType={saveCustomAreaType} dbThickOpts={dbThickOpts} dbRVals={dbRVals} />
              ))}
            </>
          )}

          {currentAreas.length>0&&(
            <div style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",background:C.white,borderRadius:6,border:`1px solid ${C.border}`,marginBottom:5,fontSize:11}}>
              <span style={{color:C.muted,fontWeight:600}}>{activeFloor} subtotal</span>
              <span style={{fontWeight:700}}>${fmt(floorTotal(activeFloor))}</span>
            </div>
          )}
        </div>

        <div className="estimate-side-panel" style={{width:220,flexShrink:0,borderLeft:`1px solid ${C.border}`,background:C.white,overflowY:"auto",padding:"10px 10px 20px"}}>
          <div style={{fontSize:10,fontWeight:800,color:C.faint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Estimate</div>
          <EstimatePanel {...panelProps} />
        </div>
      </div>

      <div className="estimate-bottom-panel" style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:C.white,borderTop:`2px solid ${C.border}`,boxShadow:"0 -2px 12px rgba(0,0,0,.08)"}}>
        <div onClick={()=>setPanelOpen(p=>!p)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 12px",cursor:"pointer",borderBottom:panelOpen?`1px solid ${C.border}`:"none"}}>
          <span style={{fontSize:10,fontWeight:800,color:C.faint,textTransform:"uppercase",letterSpacing:0.5}}>Estimate</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:13,fontWeight:800,color:C.green}}>${fmt(projectTotal)}</span>
            <span style={{fontSize:9,color:C.faint}}>{panelOpen?"▼":"▲"}</span>
          </div>
        </div>
        {panelOpen&&(<div style={{maxHeight:"45vh",overflowY:"auto",padding:"8px 12px 24px"}}><EstimatePanel {...panelProps} /></div>)}
      </div>

      <style>{`
        @media (min-width: 900px) { .estimate-bottom-panel { display: none !important; } }
        @media (max-width: 899px) { .estimate-side-panel { display: none !important; } }
        @media (min-width: 900px) {
          .area-hl-input { height: 22px !important; font-size: 11px !important; }
          .area-mq-input { height: 22px !important; font-size: 11px !important; width: 30px !important; }
          .area-deduct { height: 22px !important; font-size: 11px !important; width: 52px !important; }
          .area-select { height: 22px !important; font-size: 11px !important; }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        @media (max-width: 899px) { input, select, textarea { font-size: 16px !important; } }
      `}</style>
    </div>
  );
}

