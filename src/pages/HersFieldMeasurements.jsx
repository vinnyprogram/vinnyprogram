import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { logEvent as sharedLogEvent } from "../utils/debugLog";
import DebugLogButton from "../components/DebugLogButton";
import { useAuth } from "../context/AuthContext";

function hersLog(msg){ sharedLogEvent(msg, "HERS Measurements"); }

// ── Same constants as insulation estimate ──
const DEFAULT_FLOORS = ["Floor","3rd","2nd","1st","Basement","Crawlspace"];
const AREA_TYPES = [
  "Roof Rafter w/ Strapping","Roof Rafter behind knee walls","Floor",
  "Exterior Wall","Demising Wall","Rim Joist","Concrete Wall",
  "Ceiling","Interior Walls","Fire Blocking","Other",
];
const THICK_OPTS = ["2x3","2x4","2x6","2x8","2x10","2x12","I-joist 14in","I-joist 16in","I-joist 18in"];
const R_VALS     = ["R-11","R-13","R-15","R-19","R-21","R-28","R-30","R-38","R-49","R-60"];
const ORIENTATIONS = ["N","NE","E","SE","S","SW","W","NW"];
// Standard architectural convention: walking clockwise around the building
// from the front, you hit Right, then Rear (opposite the front), then Left.
// Each step is 90° = 2 positions in the 8-point compass array above.
const SIDE_OFFSET = { Front:0, Right:2, Rear:4, Left:6 };

const C = {
  bg:"#f4f5f7", white:"#fff", ink:"#0f172a",
  muted:"#64748b", faint:"#94a3b8",
  border:"#e2e8f0", green:"#059669",
};
const I = {
  height:34, fontSize:14, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 8px", boxSizing:"border-box",
  color:C.ink, outline:"none", width:"100%",
};
const Btn = {
  height:32, fontSize:12, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 12px", cursor:"pointer", color:C.ink,
  whiteSpace:"nowrap", fontWeight:600,
};
const BtnD = {
  height:32, fontSize:12, borderRadius:6, border:"none",
  background:C.ink, padding:"0 14px", cursor:"pointer", color:"#fff",
  whiteSpace:"nowrap", fontWeight:700, display:"inline-flex", alignItems:"center",
};
const CARD = {
  background:C.white, borderRadius:10, border:`1px solid ${C.border}`,
  padding:"12px 14px", marginBottom:10,
};
const lbl = { fontSize:9, color:C.faint, fontWeight:700, textTransform:"uppercase", marginBottom:2 };

function fmt(n,d=1){ return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function uid(){ return Date.now()+Math.random(); }
function parseArr(v){ return Array.isArray(v)?v:(typeof v==="string"?JSON.parse(v||"[]"):[]); }
function withId(x){ return {...x, id:x.id||uid()}; }

// ── Ekotrope Summary panel (live) ──
function EkotropeSummary({ floors, areas, bedrooms }) {
  const [open, setOpen] = useState(true);
  const totalCFA = floors.reduce((s,f)=>f.cfaInclude===false?s:s+(Number(f.width)||0)*(Number(f.length)||0),0);
  const totalVol = floors.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0)*(Number(f.height)||0),0);

  // Aggregate sqft by area type across all floors
  const byType = {};
  Object.values(areas).flat().forEach(a=>{
    if(!a.area_type||!a.sqft) return;
    const key = a.customLabel ? `${a.area_type} — ${a.customLabel}` : a.area_type;
    byType[key] = (byType[key]||0) + a.sqft;
  });

  return (
    <div style={{background:"#111827",borderRadius:12,padding:"12px 16px",marginBottom:12,
        boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:open?12:0}}>
        <span style={{fontSize:10,fontWeight:800,color:"#e2e8f0",textTransform:"uppercase",letterSpacing:1}}>
          🟦 Ekotrope Summary
        </span>
        <button onClick={()=>setOpen(p=>!p)}
          style={{border:"none",background:"none",color:"#64748b",cursor:"pointer",fontSize:11,fontWeight:600}}>
          {open?"▲ Hide":"▼ Show"}
        </button>
      </div>
      {open && (
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
            {[["CFA",fmt(totalCFA,0),"ft²"],["Volume",fmt(totalVol,0),"ft³"],["Bedrooms",String(Number(bedrooms)||0),"rooms"]].map(([label,val,unit])=>(
              <div key={label} style={{background:"#1e2a3a",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:9,color:"#64748b",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>{label}</div>
                <div style={{fontSize:20,fontWeight:800,color:"#34d399",lineHeight:1}}>{val}</div>
                <div style={{fontSize:10,color:"#475569",marginTop:1}}>{unit}</div>
              </div>
            ))}
          </div>
          {Object.keys(byType).length>0 && (
            <>
              <div style={{fontSize:9,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Areas</div>
              {Object.entries(byType).map(([type,sqft])=>(
                <div key={type} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:"4px 6px",borderRadius:5,background:"#1e2a3a",marginBottom:2}}>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{type}</span>
                  <span style={{fontSize:12,fontWeight:700,color:"#34d399"}}>{fmt(sqft,0)} ft²</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── CFA / Volume floors editor ──
// Data stays a flat array (one row per measurement, each carrying a
// `label` field) so save() and EkotropeSummary don't need to change.
// This just PRESENTS those rows grouped by their label, as floor tabs,
// so you pick a floor once and add as many measurements to it as you
// need without retyping the floor name each time.
function FloorsEditor({ floors, onChange, onCommit, unitLabel }) {
  const floorLabels = [];
  floors.forEach(f=>{ if(!floorLabels.includes(f.label)) floorLabels.push(f.label); });
  const [activeLabel, setActiveLabel] = useState(floorLabels[0]||"");
  useEffect(()=>{
    if(!floorLabels.includes(activeLabel)) setActiveLabel(floorLabels[0]||"");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[floors]);

  function addFloor(){
    let n=floorLabels.length+1, label=`Floor ${n}`;
    while(floorLabels.includes(label)){ n++; label=`Floor ${n}`; }
    onChange([...floors,{id:uid(),label,width:"",length:"",height:"",cfaInclude:true}]);
    setActiveLabel(label);
    if(onCommit) onCommit();
  }
  function addMeasurement(label){
    onChange([...floors,{id:uid(),label,width:"",length:"",height:"",cfaInclude:true}]);
    if(onCommit) onCommit();
  }
  function renameFloor(oldLabel,newLabel){
    onChange(floors.map(f=>f.label===oldLabel?{...f,label:newLabel}:f));
    setActiveLabel(newLabel);
  }
  function removeFloor(label){ onChange(floors.filter(f=>f.label!==label)); if(onCommit) onCommit(); }
  function updRow(id,field,val){ onChange(floors.map(f=>f.id===id?{...f,[field]:val}:f)); }
  function removeRow(id){ onChange(floors.filter(f=>f.id!==id)); if(onCommit) onCommit(); }

  // Volume always counts every floor/space. CFA only counts floors marked
  // as conditioned — lets you record volume for a garage/vented attic/etc.
  // without it inflating the conditioned floor area total.
  const totalCFA = floors.reduce((s,f)=>f.cfaInclude===false?s:s+(Number(f.width)||0)*(Number(f.length)||0),0);
  const totalVol = floors.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0)*(Number(f.height)||0),0);
  const activeRows = floors.filter(f=>f.label===activeLabel);
  const floorCFA = activeRows.reduce((s,f)=>f.cfaInclude===false?s:s+(Number(f.width)||0)*(Number(f.length)||0),0);
  const floorVol = activeRows.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0)*(Number(f.height)||0),0);

  return (
    <div style={CARD}>
      <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
        Floors / Levels — CFA &amp; Volume
      </div>

      {floorLabels.length>0 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {floorLabels.map(label=>(
            <button key={label} onClick={()=>setActiveLabel(label)}
              style={{padding:"5px 12px",borderRadius:16,fontSize:12,fontWeight:600,cursor:"pointer",
                border:`1px solid ${label===activeLabel?C.green:C.border}`,
                background:label===activeLabel?C.green:"#fff",
                color:label===activeLabel?"#fff":C.muted}}>
              {label}
            </button>
          ))}
        </div>
      )}

      {activeLabel && (
        <div style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:10}}>
          <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"center"}}>
            <input value={activeLabel} onChange={e=>renameFloor(activeLabel,e.target.value)} onBlur={onCommit}
              placeholder="e.g. 1st Floor" style={{...I,flex:1,height:32,fontSize:13,fontWeight:700}} />
            <button onClick={()=>removeFloor(activeLabel)} title="Delete this floor and all its measurements"
              style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
          </div>

          {activeRows.map((f,i)=>{
            const cfa=(Number(f.width)||0)*(Number(f.length)||0);
            const vol=cfa*(Number(f.height)||0);
            const counted=f.cfaInclude!==false;
            return (
              <div key={f.id} style={{borderTop:i>0?`1px dashed ${C.border}`:"none",paddingTop:i>0?10:0,marginTop:i>0?10:0}}>
                {activeRows.length>1 && (
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:11,color:C.faint,fontWeight:600}}>Measurement {i+1}</span>
                    <button onClick={()=>removeRow(f.id)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:14}}>✕</button>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
                  <div><div style={lbl}>Width (ft)</div><input type="number" value={f.width} onChange={e=>updRow(f.id,"width",e.target.value)} onBlur={onCommit} style={{...I,height:30,fontSize:12,textAlign:"right"}} /></div>
                  <div><div style={lbl}>Length (ft)</div><input type="number" value={f.length} onChange={e=>updRow(f.id,"length",e.target.value)} onBlur={onCommit} style={{...I,height:30,fontSize:12,textAlign:"right"}} /></div>
                  <div><div style={lbl}>Height (ft)</div><input type="number" value={f.height} onChange={e=>updRow(f.id,"height",e.target.value)} onBlur={onCommit} style={{...I,height:30,fontSize:12,textAlign:"right"}} /></div>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,cursor:"pointer"}}>
                  <input type="checkbox" checked={counted} onChange={e=>{ updRow(f.id,"cfaInclude",e.target.checked); if(onCommit) onCommit(); }}
                    style={{width:14,height:14,accentColor:C.green}} />
                  <span style={{fontSize:11,color:counted?C.muted:"#b45309",fontWeight:counted?400:600}}>
                    Counts toward CFA{!counted&&" — volume only (e.g. garage, vented attic)"}
                  </span>
                </label>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted}}>
                  <span>CFA: <b style={{color:counted?C.green:C.faint,textDecoration:counted?"none":"line-through"}}>{fmt(cfa)} ft²</b></span>
                  <span>Volume: <b style={{color:C.green}}>{fmt(vol)} ft³</b></span>
                </div>
              </div>
            );
          })}

          <button onClick={()=>addMeasurement(activeLabel)} style={{...Btn,marginTop:10,fontSize:12}}>+ Add measurement to {activeLabel}{unitLabel?` (${unitLabel})`:""}</button>

          {activeRows.length>1 && (
            <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:12,fontWeight:700}}>
              <span>{activeLabel} CFA: <span style={{color:C.green}}>{fmt(floorCFA)} ft²</span></span>
              <span>{activeLabel} Volume: <span style={{color:C.green}}>{fmt(floorVol)} ft³</span></span>
            </div>
          )}
        </div>
      )}

      <button onClick={addFloor} style={Btn}>+ Add Floor/Level{unitLabel?` (${unitLabel})`:""}</button>
      {floors.length>0 && (
        <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,
            borderTop:`1px solid ${C.border}`,fontSize:13,fontWeight:700}}>
          <span>Total CFA: <span style={{color:C.green}}>{fmt(totalCFA)} ft²</span></span>
          <span>Total Volume: <span style={{color:C.green}}>{fmt(totalVol)} ft³</span></span>
        </div>
      )}
    </div>
  );
}

// ── Single area row — mirrors AreaRow from insulation estimate, no pricing ──
function AreaRow({ area, materials, onChange, onDelete, onCommit }) {
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcExpr, setCalcExpr] = useState("");
  const meas = area.measurements||[];
  const sqft = area.sqft||0;
  const liveH = parseFloat(area.mh)||0;
  const liveL = parseFloat(area.ml)||0;
  const liveQ = parseFloat(area.mq)||1;
  const preview = liveH&&liveL ? Math.round(liveH*liveL*liveQ*100)/100 : 0;

  // expanded lives on the area object itself, not local component state,
  // so it survives the component remounting when the area moves between
  // the "in progress" and "completed" filtered lists in the parent.
  const expanded = area._expanded !== false; // default true (open) unless explicitly closed
  function setExpanded(v){ onChange("_expanded", v); }

  // mat_lines: [{id, material, thickness_in, r_value}] — supports combo
  const matLines = (area.mat_lines&&area.mat_lines.length>0)
    ? area.mat_lines
    : [{id:1, material:area.material||"", thickness_in:area.thickness_in||"", r_value:area.r_value||""}];
  const isComboMode = matLines.length>1 || matLines[0]?.material==="__combo__";

  function updateMatLine(idx, field, val){
    const lines = matLines.map((l,i)=>i===idx?{...l,[field]:val}:l);
    onChange("mat_lines", lines);
    if(idx===0&&!isComboMode) onChange(field, val);
  }
  function addMatLine(){
    const last = matLines[matLines.length-1];
    onChange("mat_lines",[...matLines,{id:Date.now(),material:last.material||"",thickness_in:last.thickness_in||"",r_value:last.r_value||""}]);
  }
  function removeMatLine(idx){
    if(matLines.length<=2) return;
    const lines = matLines.filter((_,i)=>i!==idx);
    onChange("mat_lines",lines);
  }

  const totalR = matLines.reduce((s,ml)=>{
    const r = parseInt((ml.r_value||"").replace(/\D/g,""))||0;
    return s+r;
  },0);

  const GS = {
    height:32, fontSize:13, borderRadius:6, border:`1px solid ${C.border}`,
    background:C.white, padding:"0 6px", boxSizing:"border-box",
    color:C.ink, outline:"none", cursor:"pointer",
  };

  function commit(){
    if(!liveH||!liveL) return;
    const s = Math.round(liveH*liveL*liveQ*100)/100;
    const newMeas = [...meas,{h:liveH,l:liveL,q:liveQ,sqft:s}];
    onChange("measurements", newMeas);
    onChange("sqft", Math.round(newMeas.reduce((acc,m)=>acc+m.sqft,0)*100)/100);
    onChange("mh",""); onChange("ml",""); onChange("mq","1");
    if(onCommit) onCommit();
  }
  function delMeas(i){
    const newMeas = meas.filter((_,j)=>j!==i);
    onChange("measurements", newMeas);
    onChange("sqft", Math.round(newMeas.reduce((acc,m)=>acc+m.sqft,0)*100)/100);
  }
  function calcPress(val){
    if(val==="C"){ setCalcExpr(""); return; }
    if(val==="⌫"){ setCalcExpr(p=>p.slice(0,-1)); return; }
    if(val==="="){
      try {
        const safe = calcExpr.replace(/[^0-9+\-*/.()]/g,"");
        const result = Function(`"use strict";return (${safe||0})`)();
        setCalcExpr(String(Math.round(result*100)/100));
      } catch{ setCalcExpr("Err"); }
      return;
    }
    setCalcExpr(p=>p+val);
  }
  function applyCalc(field){
    const n = parseFloat(calcExpr);
    if(!isNaN(n)) onChange(field, String(n));
    setCalcOpen(false); setCalcExpr("");
  }
  const CALC_BTNS = ["7","8","9","⌫","4","5","6","C","1","2","3","+","0",".","×","-"];

  const isComplete = !!(area.area_type && sqft>0);

  // Collapsed
  if(isComplete && !expanded) return (
    <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderLeft:"3px solid #059669",
        borderRadius:7,padding:"5px 10px",marginBottom:4}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:12,fontWeight:700,color:C.ink}}>{area.area_type}{area.customLabel?` — ${area.customLabel}`:""}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,fontWeight:700,color:C.green}}>{fmt(sqft,0)} ft²</span>
          <button onClick={()=>setExpanded(true)} style={{border:"none",background:"none",color:C.green,cursor:"pointer",fontSize:14,padding:"0 2px"}}>✏️</button>
        </div>
      </div>
      <div style={{fontSize:10,color:C.muted}}>
        {matLines.map((ml,i)=>[ml.material,ml.thickness_in,ml.r_value].filter(Boolean).join(" · ")||(i===0?"—":"")).join(" + ")}
        {meas.length>0 && <span style={{marginLeft:6,color:C.faint}}>({meas.map(m=>`${m.h}×${m.l}${m.q>1?`×${m.q}`:""}`).join("  ")})</span>}
        {totalR>0 && isComboMode && <span style={{marginLeft:8,color:"#059669",fontWeight:700}}>Total R-{totalR}</span>}
      </div>
    </div>
  );

  // Expanded
  return (
    <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderLeft:"3px solid #059669",
        borderRadius:8,padding:"8px 10px",marginBottom:6}}>

      {/* Done / Delete row */}
      {isComplete && (
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <button onClick={()=>setExpanded(false)}
            style={{...BtnD,flex:1,justifyContent:"center",background:"#059669"}}>✓ Done</button>
          <button onClick={onDelete}
            style={{...Btn,color:"#dc2626",borderColor:"#dc2626"}}>🗑 Delete</button>
        </div>
      )}

      {/* Area type + label */}
      <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center",borderBottom:`1px solid ${C.border}`,paddingBottom:6}}>
        <select value={area.area_type||""} onChange={e=>onChange("area_type",e.target.value)}
          style={{...GS,flex:1}}>
          <option value="">Area type…</option>
          {AREA_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        {!isComplete && (
          <button onClick={onDelete} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1,flexShrink:0}}>✕</button>
        )}
      </div>
      <input value={area.customLabel||""} onChange={e=>onChange("customLabel",e.target.value)}
        placeholder="Optional label (e.g. Garage, North side)"
        style={{...I,height:28,fontSize:11,marginBottom:8,color:C.muted,
          background:"transparent",border:"none",borderBottom:`1px dashed ${C.border}`,
          borderRadius:0,paddingLeft:0}} />

      {/* MATERIAL — single mode */}
      {!isComboMode && (
        <div style={{marginBottom:6,borderBottom:`1px solid ${C.border}`,paddingBottom:6}}>
          <div style={{display:"flex",gap:4,marginBottom:4}}>
            <select style={{...GS,flex:2}}
              value={area.material==="__custom_mat__"?"__custom_mat__":(matLines[0].material||"")}
              onChange={e=>{
                const val=e.target.value;
                if(val==="__combo__"){
                  onChange("mat_lines",[{id:1,material:"",thickness_in:"",r_value:""},{id:2,material:"",thickness_in:"",r_value:""}]);
                  onChange("material","__combo__");
                } else if(val==="__custom_mat__"){
                  onChange("mat_lines",[{id:1,material:"__custom_mat__",thickness_in:matLines[0].thickness_in||"",r_value:matLines[0].r_value||""}]);
                  onChange("material","__custom_mat__"); onChange("custom_material","");
                } else {
                  updateMatLine(0,"material",val);
                }
              }}>
              <option value="">Material</option>
              {materials.map(m=><option key={m.id}>{m.name}</option>)}
              <option value="__combo__">⚡ Combo</option>
              <option value="__custom_mat__">✏️ Other</option>
            </select>
            <select style={{...GS,width:80,flexShrink:0}}
              value={matLines[0].thickness_in||""}
              onChange={e=>updateMatLine(0,"thickness_in",e.target.value)}>
              <option value="">Thick</option>
              {THICK_OPTS.map(t=><option key={t}>{t}</option>)}
            </select>
            <select style={{...GS,width:80,flexShrink:0}}
              value={matLines[0].r_value||""}
              onChange={e=>updateMatLine(0,"r_value",e.target.value)}>
              <option value="">R-Val</option>
              {R_VALS.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
          {area.material==="__custom_mat__" && (
            <input autoFocus placeholder="Type material name…"
              style={{...I,height:32,marginBottom:4,border:"2px solid #059669",borderRadius:6,fontSize:13}}
              value={area.custom_material||""}
              onChange={e=>onChange("custom_material",e.target.value)}
              onBlur={()=>{ const v=(area.custom_material||"").trim(); if(v){ updateMatLine(0,"material",v); onChange("material",v); }}}
              onKeyDown={e=>{ if(e.key==="Enter"){ const v=(area.custom_material||"").trim(); if(v){ updateMatLine(0,"material",v); onChange("material",v); e.target.blur(); }}}} />
          )}
        </div>
      )}

      {/* MATERIAL — combo mode */}
      {isComboMode && (
        <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
          <div style={{fontSize:10,fontWeight:700,color:"#0369a1",marginBottom:6,textTransform:"uppercase",letterSpacing:0.4,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>⚡ Combo</span>
            {totalR>0 && <span style={{color:"#059669",fontWeight:800}}>Total R-{totalR}</span>}
            <button onClick={()=>{ onChange("mat_lines",[{id:1,material:"",thickness_in:"",r_value:""}]); onChange("material",""); }}
              style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:11,padding:0}}>× remove combo</button>
          </div>
          {matLines.map((ml,idx)=>(
            <div key={ml.id||idx} style={{marginBottom:8,paddingBottom:8,borderBottom:idx<matLines.length-1?"1px solid #e0f2fe":"none"}}>
              <div style={{display:"flex",gap:4,marginBottom:4,alignItems:"center"}}>
                <select style={{...GS,flex:1}}
                  value={ml.material||""}
                  onChange={e=>updateMatLine(idx,"material",e.target.value)}>
                  <option value="">Material {idx+1}</option>
                  {materials.map(m=><option key={m.id}>{m.name}</option>)}
                  <option value="__custom__">✏️ Other</option>
                </select>
                {matLines.length>2 && (
                  <button onClick={()=>removeMatLine(idx)}
                    style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:14,padding:"0 2px",flexShrink:0}}>✕</button>
                )}
              </div>
              <div style={{display:"flex",gap:4}}>
                <select style={{...GS,flex:1}} value={ml.thickness_in||""} onChange={e=>updateMatLine(idx,"thickness_in",e.target.value)}>
                  <option value="">Thick</option>{THICK_OPTS.map(t=><option key={t}>{t}</option>)}
                </select>
                <select style={{...GS,flex:1}} value={ml.r_value||""} onChange={e=>updateMatLine(idx,"r_value",e.target.value)}>
                  <option value="">R-Val</option>{R_VALS.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
          ))}
          <button onClick={addMatLine}
            style={{width:"100%",padding:"6px",borderRadius:6,border:"1px dashed #7dd3fc",
              background:"none",color:"#0369a1",cursor:"pointer",fontSize:11,fontWeight:600,height:"auto"}}>
            + Add material to combo
          </button>
        </div>
      )}

      {/* Measurement chips */}
      {meas.length>0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
          {meas.map((m,i)=>(
            <span key={i} style={{background:"#dcfce7",color:"#166534",borderRadius:6,
                padding:"2px 8px",fontSize:11,fontWeight:600,display:"inline-flex",alignItems:"center",gap:4}}>
              {m.h}×{m.l}{m.q>1?`×${m.q}`:""} <span style={{color:"#4ade80",fontSize:10}}>={fmt(m.sqft,0)}</span>
              <button onClick={()=>delMeas(i)} style={{border:"none",background:"none",color:"#4ade80",cursor:"pointer",fontSize:12,padding:0}}>✕</button>
            </span>
          ))}
        </div>
      )}

      {/* H × L × Qty input row + calculator */}
      <div style={{position:"relative"}}>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {/* Calculator icon button */}
          <button onClick={()=>setCalcOpen(p=>!p)} title="Calculator" type="button"
            style={{border:`1px solid ${calcOpen?C.green:C.border}`,background:calcOpen?C.green:"#f8fafc",
              borderRadius:6,width:36,height:36,
              cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={calcOpen?"#fff":"#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="8" y1="11" x2="8" y2="11.01" />
              <line x1="12" y1="11" x2="12" y2="11.01" />
              <line x1="16" y1="11" x2="16" y2="11.01" />
              <line x1="8" y1="15" x2="8" y2="15.01" />
              <line x1="12" y1="15" x2="12" y2="15.01" />
              <line x1="16" y1="15" x2="16" y2="15.01" />
              <line x1="8" y1="19" x2="8" y2="19.01" />
              <line x1="12" y1="19" x2="12" y2="19.01" />
              <line x1="16" y1="19" x2="16" y2="19.01" />
            </svg>
          </button>
          <div style={{width:46,flexShrink:0}}>
            <div style={lbl}>Qty</div>
            <input type="number" inputMode="decimal" value={area.mq||""}
              onChange={e=>onChange("mq",e.target.value)}
              placeholder="1"
              style={{...I,height:36,textAlign:"center",fontSize:13}} />
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={lbl}>H / W</div>
            <input type="number" inputMode="decimal" value={area.mh||""}
              onChange={e=>onChange("mh",e.target.value)}
              placeholder="0"
              style={{...I,height:36,textAlign:"right",fontSize:14}} />
          </div>
          <span style={{color:C.faint,fontSize:16,flexShrink:0,paddingTop:16}}>×</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={lbl}>L</div>
            <input type="number" inputMode="decimal" value={area.ml||""}
              onChange={e=>onChange("ml",e.target.value)}
              onBlur={()=>commit()}
              onKeyDown={e=>e.key==="Enter"&&commit()} placeholder="0"
              style={{...I,height:36,textAlign:"right",fontSize:14}} />
          </div>
        </div>
        {preview>0 && (
          <div style={{fontSize:11,color:C.green,fontWeight:700,textAlign:"right",marginTop:4}}>
            = {fmt(preview,0)} ft² — saves automatically when you leave the L field
          </div>
        )}

        {/* Calculator popup */}
        {calcOpen && (
          <div style={{position:"absolute",top:"100%",left:0,zIndex:200,
              background:C.white,border:`1px solid ${C.border}`,borderRadius:10,
              boxShadow:"0 8px 24px rgba(0,0,0,.15)",padding:10,marginTop:4,width:220}}>
            <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,textAlign:"right",
                padding:"6px 10px",background:"#f8fafc",borderRadius:6,marginBottom:8,
                color:C.ink,minHeight:32,border:`1px solid ${C.border}`}}>
              {calcExpr||"0"}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:8}}>
              {CALC_BTNS.map(v=>(
                <button key={v} onClick={()=>calcPress(v==="×"?"*":v)}
                  style={{height:34,borderRadius:6,border:`1px solid ${C.border}`,
                    background:v==="C"?"#fee2e2":v==="⌫"?"#fef9c3":C.white,
                    color:v==="C"?"#dc2626":v==="⌫"?"#92400e":C.ink,
                    cursor:"pointer",fontWeight:700,fontSize:14}}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={()=>calcPress("=")}
              style={{...BtnD,width:"100%",justifyContent:"center",marginBottom:6,background:"#059669"}}>
              =
            </button>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <button onClick={()=>applyCalc("mh")}
                style={{...Btn,fontSize:11,justifyContent:"center",color:"#059669",borderColor:"#059669"}}>
                → Use as H
              </button>
              <button onClick={()=>applyCalc("ml")}
                style={{...Btn,fontSize:11,justifyContent:"center",color:"#059669",borderColor:"#059669"}}>
                → Use as L
              </button>
            </div>
          </div>
        )}
      </div>

      {sqft>0 && (
        <div style={{display:"flex",justifyContent:"flex-end",fontSize:11,color:C.green,fontWeight:700,marginTop:6}}>
          Total: {fmt(sqft,0)} ft²
        </div>
      )}
    </div>
  );
}

// ── Windows editor ──
function WindowsEditor({ windows, onChange, onCommit, floorOptions, unitLabel }) {
  // Learns the building's facing the first time a Side (Front/Right/Rear/Left)
  // and Orientation (N/NE/E/etc) are paired together on any window, then
  // auto-fills Orientation on every subsequent window the moment a Side is
  // picked. Stored as "what orientation is Front", everything else derives
  // from the 90°-per-side rotation in SIDE_OFFSET.
  const [frontIndex, setFrontIndex] = useState(()=>{
    const learned = windows.find(w=>w.elevation && SIDE_OFFSET[w.elevation]!==undefined && w.orientation);
    if(!learned) return null;
    const oi = ORIENTATIONS.indexOf(learned.orientation);
    if(oi<0) return null;
    return (oi - SIDE_OFFSET[learned.elevation] + 8) % 8;
  });

  function add(){
    const last = windows[windows.length-1];
    onChange([...windows, last ? {
      ...last,
      id:uid(),
      label:`Window ${windows.length+1}`,
    } : {
      id:uid(), label:`Window ${windows.length+1}`, orientation:"N", elevation:"", floor:"", qty:"1",
      width:"", height:"",
      u_factor:"", shgc:"",
      top_to_overhang:"", bottom_to_overhang:"", overhang_depth:"",
    }]);
    if(onCommit) onCommit();
  }
  function upd(idx,f,v){
    onChange(windows.map((w,i)=>{
      if(i!==idx) return w;
      const updated = {...w,[f]:v};
      // auto-calc bottom-to-overhang = top-to-overhang + window height,
      // whenever either of those two changes and both have a value
      if(f==="top_to_overhang" || f==="height"){
        if(updated.top_to_overhang!=="" && updated.height!==""){
          const top = parseFloat(updated.top_to_overhang)||0;
          const h   = parseFloat(updated.height)||0;
          updated.bottom_to_overhang = String(Math.round((top+h)*100)/100);
        }
      }
      return updated;
    }));
  }
  function rem(idx){ onChange(windows.filter((_,i)=>i!==idx)); if(onCommit) onCommit(); }
  // selects commit immediately on change (no separate blur needed);
  // text/number inputs autosave on blur, same pattern as areas/floors
  function updAndCommit(idx,f,v){ upd(idx,f,v); if(onCommit) onCommit(); }

  // Picking a Side: if we already know the building's facing, auto-fill
  // this window's Orientation from it. Always still editable afterward.
  // Both fields are written in ONE state update — calling upd() twice in a
  // row here would have each computed from the same stale 'windows' closure,
  // so the second call's array would silently overwrite the first's change.
  function pickSide(idx, side){
    let newOrientation = null;
    if(frontIndex!==null && SIDE_OFFSET[side]!==undefined){
      const oi = (frontIndex + SIDE_OFFSET[side]) % 8;
      newOrientation = ORIENTATIONS[oi];
    }
    onChange(windows.map((w,i)=>{
      if(i!==idx) return w;
      return newOrientation ? {...w, elevation:side, orientation:newOrientation} : {...w, elevation:side};
    }));
    if(onCommit) onCommit();
  }

  // Manually picking an Orientation while a Side is set teaches/corrects
  // the building's facing for every window going forward.
  function pickOrientation(idx, orientation, currentSide){
    onChange(windows.map((w,i)=> i===idx ? {...w, orientation} : w));
    if(currentSide && SIDE_OFFSET[currentSide]!==undefined){
      const oi = ORIENTATIONS.indexOf(orientation);
      if(oi>=0) setFrontIndex((oi - SIDE_OFFSET[currentSide] + 8) % 8);
    }
    if(onCommit) onCommit();
  }

  const oI = { ...I, height:26, fontSize:11, textAlign:"right" };
  const oLbl = { fontSize:8, color:C.faint, fontWeight:700, textTransform:"uppercase", marginBottom:2 };
  const noSpin = { className:"no-spinner" };

  return (
    <div style={CARD}>
      <style>{`
        .no-spinner::-webkit-outer-spin-button,
        .no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinner { -moz-appearance: textfield; }
      `}</style>
      <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>Windows</div>
      <datalist id="window-floor-options">
        {(floorOptions||[]).map(fl=><option key={fl} value={fl} />)}
      </datalist>
      {windows.map((w,idx)=>(
        <div key={w.id} style={{border:"2px solid #0f172a",borderRadius:8,padding:"8px 10px",marginBottom:8}}>

          {/* Row 1: Floor, Side, Orientation, U-Factor, SHGC, Qty */}
          <div style={{display:"flex",gap:5,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
            <input list="window-floor-options" value={w.floor||""} onChange={e=>updAndCommit(idx,"floor",e.target.value)}
              title="Which floor/level this window is on — type any name, or pick a suggestion"
              placeholder="Floor…" style={{...I,width:60,height:28,fontSize:11,flexShrink:0}} />
            <select value={w.elevation||""} onChange={e=>pickSide(idx,e.target.value)}
              title="Building side / elevation — picking this fills in Orientation automatically once the building's facing is known"
              style={{...I,width:58,height:28,fontSize:11,flexShrink:0}}>
              <option value="">Side…</option>
              <option value="Front">Front</option>
              <option value="Right">Right</option>
              <option value="Left">Left</option>
              <option value="Rear">Rear</option>
            </select>
            <select value={w.orientation} onChange={e=>pickOrientation(idx,e.target.value,w.elevation)}
              title="Compass orientation (for Ekotrope)"
              style={{...I,width:48,height:28,fontSize:12,flexShrink:0}}>
              {ORIENTATIONS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
            <div style={{width:54,flexShrink:0}}>
              <input {...noSpin} type="number" step="0.01" value={w.u_factor||""} onChange={e=>upd(idx,"u_factor",e.target.value)} onBlur={onCommit}
                placeholder="U-Fac" title="U-Factor" style={{...I,height:30,fontSize:12,textAlign:"center"}} />
            </div>
            <div style={{width:54,flexShrink:0}}>
              <input {...noSpin} type="number" step="0.01" value={w.shgc||""} onChange={e=>upd(idx,"shgc",e.target.value)} onBlur={onCommit}
                placeholder="SHGC" title="SHGC" style={{...I,height:30,fontSize:12,textAlign:"center"}} />
            </div>
            <div style={{width:34,flexShrink:0}}>
              <input {...noSpin} type="number" value={w.qty||""} onChange={e=>upd(idx,"qty",e.target.value)} onBlur={onCommit}
                placeholder="Qty" title="Quantity — how many identical windows"
                style={{...I,height:28,fontSize:12,textAlign:"center"}} />
            </div>
            <button onClick={()=>{ if(window.confirm(`Delete ${w.label||"this window"}? This can't be undone.`)) rem(idx); }}
              style={{border:"1px solid #dc2626",background:"#fee2e2",color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0,borderRadius:6,padding:"0 10px",height:28}}>
              Del
            </button>
          </div>

          {/* Row 2: Label, Width, Height together — Width/Height keep their labels since
              the auto bottom-to-overhang calc depends on Height being entered correctly */}
          <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"flex-end"}}>
            <input value={w.label} onChange={e=>upd(idx,"label",e.target.value)} onBlur={onCommit} placeholder="e.g. Living room"
              style={{...I,flex:"2 1 0",height:32,fontSize:12,minWidth:0}} />
            <div style={{flex:"1 1 0",minWidth:0}}>
              <div style={lbl}>Width (ft)</div>
              <input {...noSpin} type="number" value={w.width} onChange={e=>upd(idx,"width",e.target.value)} onBlur={onCommit}
                style={{...I,height:32,fontSize:12,textAlign:"right",width:"100%"}} />
            </div>
            <div style={{flex:"1 1 0",minWidth:0}}>
              <div style={lbl}>Height (ft)</div>
              <input {...noSpin} type="number" value={w.height} onChange={e=>upd(idx,"height",e.target.value)} onBlur={onCommit}
                style={{...I,height:32,fontSize:12,textAlign:"right",width:"100%"}} />
            </div>
          </div>

          <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Overhang shading (for Ekotrope)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
            <div>
              <div style={oLbl}>Overhang depth</div>
              <input {...noSpin} type="number" value={w.overhang_depth} onChange={e=>upd(idx,"overhang_depth",e.target.value)} onBlur={onCommit} style={oI} />
            </div>
            <div>
              <div style={oLbl}>Top→overhang</div>
              <input {...noSpin} type="number" value={w.top_to_overhang} onChange={e=>upd(idx,"top_to_overhang",e.target.value)} onBlur={onCommit} style={oI} />
            </div>
            <div>
              <div style={{...oLbl,color:"#059669"}}>Bottom→overhang ⚡auto</div>
              <input {...noSpin} type="number" value={w.bottom_to_overhang} onChange={e=>upd(idx,"bottom_to_overhang",e.target.value)} onBlur={onCommit}
                style={{...oI,background:"#f0fdf4",borderColor:"#86efac"}} />
            </div>
          </div>
        </div>
      ))}
      <button onClick={add} style={Btn}>+ Add Window{unitLabel?` (${unitLabel})`:""}</button>
    </div>
  );
}

// ══════════════════════════════════════════════
export default function HersFieldMeasurements() {
  const { company } = useAuth();
  const offersBoardPlaster = company?.offers_board_plaster === true;
  const navigate   = useNavigate();
  const { invoiceId, estimateId } = useParams();
  const mode = estimateId ? "estimate" : "invoice";
  const [searchParams] = useSearchParams();
  // Multifamily support: which unit this page is measuring. Empty string
  // means "the only unit" - existing single-unit jobs work exactly as
  // before with no visible change.
  const unitLabel = searchParams.get("unit") || "";

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [skipNote, setSkipNote]   = useState(null);
  const [autoSaveTick, setAutoSaveTick] = useState(0);
  const [importing, setImporting] = useState(false);
  const [pushing, setPushing]     = useState(false);

  const [invoice, setInvoice]   = useState(null);
  const [customer, setCustomer] = useState(null);

  // CFA/Volume floors (width × length × height)
  const [cfaFloors, setCfaFloors] = useState([]);
  // Measurement floors (same structure as insulation estimate)
  const [floors, setFloors]         = useState([...DEFAULT_FLOORS]);
  const [activeFloor, setActiveFloor] = useState(DEFAULT_FLOORS[0]);
  const [addingFloor, setAddingFloor] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  // areas keyed by floor name: { "Attic": [{...}], "1st": [{...}], ... }
  const [areas, setAreas] = useState({});

  const [windows, setWindows]   = useState([]);
  const [bedrooms, setBedrooms] = useState("0");
  const [notes, setNotes]       = useState("");
  const [materials, setMaterials] = useState([]);
  const [section, setSection]   = useState("overview"); // overview | measurements | windows

  const [photos, setPhotos]             = useState([]);
  const [docs, setDocs]                 = useState([]);
  const [uploading, setUploading]       = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Local safety-net key: if a save gets cut off (app backgrounded/closed
  // right after an edit, before the network request finishes), this lets
  // us detect and retry it next time the page loads, instead of the change
  // silently vanishing.
  function backupKey(){ return `hers_fm_backup_${mode}_${estimateId||invoiceId}_${unitLabel}`; }
  const [unitLabels, setUnitLabels] = useState([]); // multifamily: ordered array of real unit identifiers, e.g. ["1A","1B"]
  const [duplicating, setDuplicating] = useState(false);

  const loadData = useCallback(async()=>{
    let context = null;
    if(mode==="estimate"){
      const { data:e } = await supabase.from("hers_estimates").select("*").eq("id",estimateId).maybeSingle();
      if(!e){ setLoading(false); return; }
      context = { id:null, customer_id:e.customer_id, address:e.address, company_id:e.company_id };
      const uc = Number(e.unit_count)||1;
      setUnitLabels(e.unit_labels || (uc>1 ? Array.from({length:uc},(_,i)=>`Unit ${i+1}`) : []));
    } else {
      const { data:i } = await supabase.from("hers_invoices").select("*").eq("id",invoiceId).maybeSingle();
      if(!i){ setLoading(false); return; }
      context = i;
    }
    setInvoice(context);

    if(context.customer_id){
      const { data:cust } = await supabase.from("customers").select("id,name,phone,company_name").eq("id",context.customer_id).maybeSingle();
      if(cust) setCustomer(cust);
    }

    const fmQuery = mode==="estimate"
      ? supabase.from("hers_field_measurements").select("*").eq("hers_estimate_id",estimateId).eq("unit_label",unitLabel)
      : supabase.from("hers_field_measurements").select("*").eq("hers_invoice_id",invoiceId).eq("unit_label",unitLabel);
    const { data:fm } = await fmQuery.maybeSingle();
    hersLog(`Page loaded (unit: ${unitLabel||"(single)"}, server data: ${fm?"found":"none yet"})`);

    // Recover from a local backup if it's newer than what made it to the
    // server - means a previous save got cut off (app closed/backgrounded
    // right after an edit, before the request finished).
    let recovered = null;
    try {
      const raw = localStorage.getItem(backupKey());
      if(raw){
        const backup = JSON.parse(raw);
        if(!fm || new Date(backup.updated_at) > new Date(fm.updated_at||0)){
          recovered = backup;
          hersLog(`⚠️ Recovered a local backup newer than the server - a previous save had not completed. Retrying save automatically.`);
        } else {
          localStorage.removeItem(backupKey()); // backup is stale, server already has it
        }
      }
    } catch(e){}
    const fmToUse = recovered || fm;

    // Always start from a clean slate before populating - otherwise
    // switching to a unit with less/no data leaves the PREVIOUS unit's
    // floors/windows/bedrooms/notes sitting in memory instead of clearing.
    const emptyAreas = {};
    DEFAULT_FLOORS.forEach(f=>{ emptyAreas[f]=[]; });
    setFloors([...DEFAULT_FLOORS]);
    setActiveFloor(DEFAULT_FLOORS[0]);
    setAreas(emptyAreas);
    setCfaFloors([]);
    setBedrooms("0");
    setWindows([]);
    setNotes("");

    if(fmToUse){
      setCfaFloors(parseArr(fmToUse.floors).map(withId));
      setBedrooms(String(fmToUse.bedrooms||0));
      setWindows(parseArr(fmToUse.windows).map(withId));
      setNotes(fmToUse.notes||"");

      // Load floor-structured measurement data from areas column
      const savedAreas = parseArr(fmToUse.areas);
      // Detect v2 format: array of {floor_name, areas: [...]}
      if(savedAreas.length && savedAreas[0]?.floor_name){
        const floorNames = savedAreas.map(f=>f.floor_name);
        setFloors(floorNames);
        setActiveFloor(floorNames[0]);
        const newAreas = {};
        savedAreas.forEach(f=>{
          newAreas[f.floor_name] = (f.areas||[]).map(a=>({...withId(a),mh:"",ml:"",mq:"1"}));
        });
        setAreas(newAreas);
      } else if(savedAreas.length){
        // Flat legacy format — put all in Attic for migration
        const legacyAreas = savedAreas.map(a=>({...withId(a),mh:"",ml:"",mq:"1"}));
        setAreas({"Attic":legacyAreas});
      }
    }

    const photoFilter = mode==="invoice"
      ? supabase.from("job_photos").select("*").eq("hers_invoice_id",invoiceId)
      : supabase.from("job_photos").select("*").eq("hers_estimate_id",estimateId);
    const { data:phData } = await photoFilter.is("doc_type",null).order("created_at",{ascending:false});
    setPhotos(phData||[]);
    const docFilter = mode==="invoice"
      ? supabase.from("job_photos").select("*").eq("hers_invoice_id",invoiceId)
      : supabase.from("job_photos").select("*").eq("hers_estimate_id",estimateId);
    const { data:docData } = await docFilter.eq("doc_type","document").order("created_at",{ascending:false});
    setDocs(docData||[]);
    setLoading(false);
    // A previous save never made it to the server - retry it now that we're
    // back online, instead of leaving the recovered data only in memory.
    // Goes through the same autoSaveTick mechanism as every other edit
    // (not a direct save() call) since loadData is memoized and would
    // otherwise close over stale, mount-time state.
    if(recovered) setTimeout(()=>setAutoSaveTick(t=>t+1),300);
  },[invoiceId, estimateId, mode, unitLabel]);

  useEffect(()=>{ loadData(); },[loadData]);

  // Auto-save in the background whenever a measurement chip is added
  // (triggered via AreaRow's onCommit), so a completed measurement
  // shows up on the Ekotrope Report right away without needing to
  // tap the top Save button.
  useEffect(()=>{
    if(autoSaveTick>0) save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoSaveTick]);
  useEffect(()=>{
    supabase.from("materials").select("*").then(({data})=>{ if(data) setMaterials(data); });
  },[]);

  // Area helpers
  function addArea(floor){
    const newArea = {id:uid(),area_type:"",customLabel:"",measurements:[],sqft:0,mh:"",ml:"",mq:"1",material:"",thickness_in:"",r_value:""};
    setAreas(p=>({...p,[floor]:[...((p[floor])||[]),newArea]}));
  }
  function updateArea(floor,idx,field,val){
    setAreas(p=>({...p,[floor]:(p[floor]||[]).map((a,i)=>i===idx?{...a,[field]:val}:a)}));
  }
  function deleteArea(floor,idx){
    setAreas(p=>({...p,[floor]:(p[floor]||[]).filter((_,i)=>i!==idx)}));
  }
  function addFloor(){
    const name = newFloorName.trim();
    if(!name||floors.includes(name)) return;
    setFloors(p=>[...p,name]);
    setAreas(p=>({...p,[name]:[]}));
    setActiveFloor(name);
    setAddingFloor(false);
    setNewFloorName("");
  }

  const currentAreas = areas[activeFloor]||[];
  const totalSqft = Object.values(areas).flat().reduce((s,a)=>s+(a.sqft||0),0);

  async function save(){
    if(saving) return;
    hersLog(`Save requested (unit: ${unitLabel||"(single)"})`);
    setSaving(true);
    try {
      // Save everything exactly as entered, including half-finished
      // rows — nothing should ever be silently lost just because a
      // measurement or window isn't finished yet. Filtering blank
      // entries out of the printed Ekotrope Report happens on that
      // page instead, not here.
      const areasV2 = floors.map(f=>({
        floor_name: f,
        areas: (areas[f]||[]).map(a=>({
          id:a.id, area_type:a.area_type||"", customLabel:a.customLabel||"",
          measurements:(a.measurements||[]).map(m=>({h:m.h,l:m.l,q:m.q||1,sqft:m.sqft})),
          sqft:a.sqft||0,
          mat_lines: (a.mat_lines||[{material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||""}])
            .map(ml=>({material:ml.material||"",thickness_in:ml.thickness_in||"",r_value:ml.r_value||""})),
          material:a.material||"", thickness_in:a.thickness_in||"", r_value:a.r_value||"",
        })),
      }));

      const payload = {
        company_id: invoice.company_id,
        floors: cfaFloors.map(f=>({id:f.id,label:f.label||"",width:Number(f.width)||0,length:Number(f.length)||0,height:Number(f.height)||0,cfaInclude:f.cfaInclude!==false})),
        areas: areasV2,
        roof_segments:[], wall_segments:[], rim_joist_segments:[],
        bedrooms: Number(bedrooms)||0,
        windows: windows.map(w=>({id:w.id,label:w.label||"",orientation:w.orientation||"N",elevation:w.elevation||"",floor:w.floor||"",qty:Number(w.qty)||1,width:Number(w.width)||0,height:Number(w.height)||0,u_factor:w.u_factor!==""?Number(w.u_factor):null,shgc:w.shgc!==""?Number(w.shgc):null,top_to_overhang:w.top_to_overhang!==""?Number(w.top_to_overhang):null,bottom_to_overhang:w.bottom_to_overhang!==""?Number(w.bottom_to_overhang):null,overhang_depth:w.overhang_depth!==""?Number(w.overhang_depth):null})),
        notes,
        updated_at: new Date().toISOString(),
      };

      // Write to local storage FIRST, synchronously, before the network
      // request - so if the app gets closed/backgrounded before the
      // request finishes, this change is recoverable next time the page
      // loads instead of silently reverting.
      try { localStorage.setItem(backupKey(), JSON.stringify(payload)); } catch(e){}

      payload.unit_label = unitLabel;
      if(mode==="estimate"){
        payload.hers_estimate_id = estimateId;
        const { error } = await supabase.from("hers_field_measurements").upsert(payload,{onConflict:"hers_estimate_id,unit_label"});
        if(error) throw error;
      } else {
        payload.hers_invoice_id = invoiceId;
        const { error } = await supabase.from("hers_field_measurements").upsert(payload,{onConflict:"hers_invoice_id,unit_label"});
        if(error) throw error;
      }
      try { localStorage.removeItem(backupKey()); } catch(e){} // made it to the server - backup no longer needed
      hersLog(`✅ Save completed successfully (unit: ${unitLabel||"(single)"})`);

      const incompleteAreas = floors.reduce((s,f)=>s+(areas[f]||[]).filter(a=>!(a.area_type&&a.sqft>0)).length,0);
      const incompleteWindows = windows.filter(w=>!(Number(w.width)>0&&Number(w.height)>0&&w.top_to_overhang!=="")).length;
      setSkipNote(
        (incompleteAreas>0||incompleteWindows>0)
          ? `Saved (${incompleteAreas>0?`${incompleteAreas} area${incompleteAreas!==1?"s":""}`:""}${incompleteAreas>0&&incompleteWindows>0?" & ":""}${incompleteWindows>0?`${incompleteWindows} window${incompleteWindows!==1?"s":""}`:""} still incomplete — won't show on Ekotrope Report yet)`
          : null
      );
      setSaved(true); setTimeout(()=>{ setSaved(false); setSkipNote(null); },3500);
    } catch(err){ hersLog(`❌ SAVE FAILED: ${err.message||JSON.stringify(err)}`); alert("Error saving: "+(err.message||JSON.stringify(err))); }
    setSaving(false);
  }

  // ── Import from insulation ──
  async function importFromInsulation(){
    if(!invoice?.customer_id||!invoice?.company_id) return;
    if(!window.confirm("Import from the insulation project for this customer?")) return;
    setImporting(true);
    try {
      const { data:projs } = await supabase.from("projects").select("id,name,address").eq("lead_id",invoice.customer_id).order("created_at",{ascending:false}).limit(5);
      if(!projs?.length){ alert("No insulation project found."); setImporting(false); return; }
      const proj = projs.find(p=>(p.address||"").toLowerCase().includes((invoice.address||"").split(",")[0].toLowerCase()))||projs[0];
      const { data:projFloors } = await supabase.from("floors").select("*").eq("project_id",proj.id).order("order_index");
      const { data:projAreas  } = await supabase.from("areas").select("*").eq("project_id",proj.id).order("order_index");
      const areaIds = (projAreas||[]).map(a=>a.id);
      let segs = [];
      if(areaIds.length){ const { data:s } = await supabase.from("segments").select("*").in("area_id",areaIds); segs=s||[]; }
      const floorMap = {};
      (projFloors||[]).forEach(f=>{ floorMap[f.id]=f.name; });
      const newFloorSet = new Set(floors);
      const newAreas = {...areas};
      (projAreas||[]).forEach(a=>{
        if(!a.area_type) return;
        const floorName = floorMap[a.floor_id]||"Other";
        if(!newFloorSet.has(floorName)){ newFloorSet.add(floorName); newAreas[floorName]=[]; }
        const areaSegs = segs.filter(s=>s.area_id===a.id);
        const meas = areaSegs.length
          ? areaSegs.map(s=>({h:Number(s.height)||0,l:Number(s.length)||0,q:1,sqft:Math.round((Number(s.height)||0)*(Number(s.length)||0)*100)/100}))
          : parseArr(a.measurements).map(m=>({...m}));
        const sqft = meas.reduce((s,m)=>s+(m.sqft||0),0)||a.sqft||0;
        newAreas[floorName].push({id:uid(),area_type:a.area_type,customLabel:"",measurements:meas,sqft,mh:"",ml:"",mq:"1",material:a.material||"",thickness_in:a.thickness_in||"",r_value:a.r_value||""});
      });
      const newFloorArr = [...newFloorSet];
      setFloors(newFloorArr);
      setAreas(newAreas);
      setActiveFloor(newFloorArr[0]);
      alert(`✅ Imported from "${proj.name||proj.address}" — including materials and R-values.`);
    } catch(err){ alert("Import error: "+(err.message||JSON.stringify(err))); }
    setImporting(false);
  }

  // ── Push to insulation ──
  async function pushToInsulation(){
    if(!invoice?.customer_id) return;

    // Multifamily: insulation works at the BUILDING level, not per-unit -
    // pull every unit's measurements and sum matching floor+area_type+
    // material combos together, rather than only pushing whichever unit
    // happens to be open in memory right now.
    let buildingAreas = areas;
    if(mode==="estimate" && unitLabels.length>1){
      const fmRows = await Promise.all(unitLabels.map(ul=>
        supabase.from("hers_field_measurements").select("areas").eq("hers_estimate_id",estimateId).eq("unit_label",ul).maybeSingle()
      ));
      const combined = {};
      fmRows.forEach(({data:fm})=>{
        const savedAreas = Array.isArray(fm?.areas) ? fm.areas : (typeof fm?.areas==="string" ? JSON.parse(fm.areas||"[]") : []);
        let flatByFloor = {};
        if(savedAreas.length && savedAreas[0]?.floor_name){
          savedAreas.forEach(f=>{ flatByFloor[f.floor_name] = (f.areas||[]); });
        } else {
          flatByFloor["Other"] = savedAreas;
        }
        Object.entries(flatByFloor).forEach(([floorName,floorAreas])=>{
          if(!combined[floorName]) combined[floorName]=[];
          floorAreas.filter(a=>a.area_type&&a.sqft>0).forEach(a=>{
            const existing = combined[floorName].find(x=>x.area_type===a.area_type && x.material===(a.material||"") && x.thickness_in===(a.thickness_in||"") && x.r_value===(a.r_value||""));
            if(existing){ existing.sqft += Number(a.sqft); }
            else { combined[floorName].push({ area_type:a.area_type, sqft:Number(a.sqft), material:a.material||"", thickness_in:a.thickness_in||"", r_value:a.r_value||"" }); }
          });
        });
      });
      buildingAreas = combined;
    }

    const allAreas = Object.values(buildingAreas).flat().filter(a=>a.area_type&&a.sqft>0);
    if(!allAreas.length){ alert("No completed areas to push."); return; }
    if(!window.confirm("Push measurements to the insulation estimate?\n\nIf no insulation estimate exists for this customer, a new one will be created.")) return;
    setPushing(true);
    try {
      let proj = null;
      const { data:projs } = await supabase.from("projects").select("id,name,address").eq("lead_id",invoice.customer_id).order("created_at",{ascending:false}).limit(5);

      if(projs?.length){
        proj = projs.find(p=>(p.address||"").toLowerCase().includes((invoice.address||"").split(",")[0].toLowerCase()))||projs[0];
      } else {
        const { data:newProj, error:projErr } = await supabase.from("projects").insert([{
          lead_id: invoice.customer_id,
          company_id: invoice.company_id,
          name: invoice.address || "HERS Estimate",
          address: invoice.address || "",
          status: "New",
        }]).select().single();
        if(projErr) throw projErr;
        proj = newProj;
      }

      if(invoice.address && (!proj.address || proj.address !== invoice.address)){
        await supabase.from("projects").update({address:invoice.address}).eq("id",proj.id);
      }

      // Get the floor names from HERS measurement areas
      const hersFloorNames = [...new Set(
        Object.entries(buildingAreas).flatMap(([floorName, floorAreas]) =>
          floorAreas.filter(a=>a.area_type&&a.sqft>0).map(()=>floorName)
        )
      )];

      // Get or create matching floors in the insulation project
      let { data:projFloors } = await supabase.from("floors").select("*").eq("project_id",proj.id).order("order_index");
      const floorNameToId = {};
      (projFloors||[]).forEach(f=>{ floorNameToId[f.name]=f.id; });

      // Create any missing floors
      for(let i=0; i<hersFloorNames.length; i++){
        const name = hersFloorNames[i];
        if(!floorNameToId[name]){
          const { data:newFloor } = await supabase.from("floors").insert([{
            project_id: proj.id,
            company_id: invoice.company_id,
            name,
            order_index: (Object.keys(floorNameToId).length + i + 1) * 10,
          }]).select().single();
          if(newFloor) floorNameToId[name] = newFloor.id;
        }
      }

      // Get existing areas to avoid duplicates
      const { data:existing } = await supabase.from("areas").select("id,area_type,floor_id").eq("project_id",proj.id);
      const existingMap = {};
      (existing||[]).forEach(a=>{ existingMap[`${a.area_type}__${a.floor_id}`]=a; });

      let updated=0, created=0;

      // Push each floor's areas with correct floor mapping
      for(const [floorName, floorAreas] of Object.entries(buildingAreas)){
        const floorId = floorNameToId[floorName];
        if(!floorId) continue;

        for(const area of floorAreas.filter(a=>a.area_type&&a.sqft>0)){
          const key = `${area.area_type}__${floorId}`;
          const payload = {
            sqft: Math.round(area.sqft*100)/100,
            material: area.material||"",
            thickness_in: area.thickness_in||"",
            r_value: area.r_value||"",
          };
          if(existingMap[key]){
            await supabase.from("areas").update(payload).eq("id",existingMap[key].id);
            updated++;
          } else {
            await supabase.from("areas").insert([{
              project_id: proj.id,
              floor_id: floorId,
              company_id: invoice.company_id,
              area_type: area.area_type,
              order_index: created * 10,
              ...payload,
            }]);
            created++;
          }
        }
      }

      alert(`✅ Pushed to insulation estimate — ${updated} updated, ${created} created across ${hersFloorNames.length} floor(s)${mode==="estimate"&&unitLabels.length>1?` (building total across ${unitLabels.length} units)`:""}.\n\nGo to Insulation Estimates to open it.`);
    } catch(err){ alert("Push error: "+(err.message||JSON.stringify(err))); }
    setPushing(false);
  }

  async function pushToBoardPlaster(){
    if(!invoice?.customer_id) return;
    // Push every area type, not just a pre-filtered "relevant" subset - let
    // the user delete whatever doesn't apply to plaster on the other side.
    const RELEVANT = ["Roof Rafter w/ Strapping","Roof Rafter behind knee walls","Floor","Exterior Wall","Demising Wall","Rim Joist","Concrete Wall","Ceiling","Interior Walls","Fire Blocking","Other"];
    const defaultThickness = (t)=> t==="Demising Wall" ? '5/8"' : '1/2"';

    let pushAreas = [];
    if(mode==="estimate" && unitLabels.length>1){
      // Multifamily: don't just push whichever unit happens to be open in
      // memory right now - pull every unit's measurements and combine
      // matching floor+area_type combos into the BUILDING's total.
      // Insulation and Board & Plaster work at the building level, not
      // per-unit. Each unit's individual H×L segments are concatenated
      // together (not just summed into one opaque number), so the
      // combined area still has a real measurement breakdown.
      const fmRows = await Promise.all(unitLabels.map(ul=>
        supabase.from("hers_field_measurements").select("areas").eq("hers_estimate_id",estimateId).eq("unit_label",ul).maybeSingle()
      ));
      const combined = {}; // key -> {sqft, measurements}
      fmRows.forEach(({data:fm})=>{
        const savedAreas = Array.isArray(fm?.areas) ? fm.areas : (typeof fm?.areas==="string" ? JSON.parse(fm.areas||"[]") : []);
        let flatAreas = [];
        if(savedAreas.length && savedAreas[0]?.floor_name){
          flatAreas = savedAreas.flatMap(f=>(f.areas||[]).map(a=>({...a,floor:f.floor_name})));
        } else {
          flatAreas = savedAreas.map(a=>({...a,floor:a.floor||"Other"}));
        }
        flatAreas.filter(a=>a.area_type && RELEVANT.includes(a.area_type) && a.sqft>0)
          .forEach(a=>{
            const key = `${a.floor||"Other"}||${a.area_type}`;
            if(!combined[key]) combined[key] = { sqft:0, measurements:[] };
            combined[key].sqft += Number(a.sqft);
            combined[key].measurements.push(...(a.measurements||[]).map(m=>({h:m.h,l:m.l,q:m.q||1,sqft:m.sqft,note:""})));
          });
      });
      pushAreas = Object.entries(combined).map(([key,val])=>{
        const [floor,area_type] = key.split("||");
        return { id:uid(), floor, area_type, sqft:Math.round(val.sqft*100)/100, thickness:defaultThickness(area_type), thicknessOther:"", layers:1, measurements:val.measurements, mh:"",ml:"",mq:"1", deduct:"", note:"", finish:"Smooth skim coat" };
      });
    } else {
      // Single-family: current in-memory state for the one unit is enough
      pushAreas = Object.entries(areas).flatMap(([floorName,floorAreas])=>
        floorAreas.filter(a=>a.area_type && RELEVANT.includes(a.area_type) && a.sqft>0)
          .map(a=>({ id:uid(), floor:floorName, area_type:a.area_type, sqft:a.sqft, thickness:defaultThickness(a.area_type), thicknessOther:"", layers:1,
            measurements:(a.measurements||[]).map(m=>({h:m.h,l:m.l,q:m.q||1,sqft:m.sqft,note:""})), mh:"",ml:"",mq:"1", deduct:a.deduct_sqft||"", note:"", finish:"Smooth skim coat" }))
      );
    }

    if(!pushAreas.length){ alert("No wall/ceiling/fire-blocking areas to push."); return; }
    if(!window.confirm(`Push ${pushAreas.length} area(s) to Board & Plaster?\n\nIf a Board & Plaster estimate already exists for this customer/address, its measurements will be replaced with these. If none exists, a new one will be created.`)) return;
    setPushing(true);
    hersLog(`Push to Board & Plaster requested (${pushAreas.length} areas)`);
    try {
      const { data:existing } = await supabase.from("board_plaster_estimates")
        .select("id,address").eq("customer_id",invoice.customer_id).order("created_at",{ascending:false}).limit(5);
      let target = (existing||[]).find(e=>(e.address||"").toLowerCase().includes((invoice.address||"").split(",")[0].toLowerCase()))||(existing||[])[0];

      if(target){
        const { error } = await supabase.from("board_plaster_estimates")
          .update({ areas: pushAreas, address: invoice.address||target.address, updated_at:new Date().toISOString() })
          .eq("id", target.id);
        if(error) throw error;
      } else {
        const { data:created, error } = await supabase.from("board_plaster_estimates").insert([{
          company_id: invoice.company_id, customer_id: invoice.customer_id,
          address: invoice.address||"", status:"Draft", areas: pushAreas, line_items:[], payment_schedule:[],
        }]).select().single();
        if(error) throw error;
        target = created;
      }
      hersLog("✅ Push to Board & Plaster completed");
      alert(`✅ Pushed to Board & Plaster.`);
      navigate(`/board-plaster/${target.id}`);
    } catch(err){
      hersLog(`❌ Push to Board & Plaster failed: ${err.message}`);
      alert("Error pushing: "+(err.message||JSON.stringify(err)));
    }
    setPushing(false);
  }

  async function uploadPhotos(files){
    if(!files?.length) return;
    setUploading(true);
    const errors=[];
    const path_prefix = mode==="estimate"?`${invoice.company_id}/hers/est-${estimateId}`:`${invoice.company_id}/hers/${invoiceId}`;
    const photo_key = mode==="estimate"?{hers_estimate_id:estimateId}:{hers_invoice_id:invoiceId};
    for(const file of Array.from(files)){
      const ext=file.name.split('.').pop();
      const path=`${path_prefix}/${Date.now()}.${ext}`;
      const { error:upErr } = await supabase.storage.from("job-photos").upload(path,file);
      if(upErr){ errors.push(upErr.message); continue; }
      const { data:urlData } = supabase.storage.from("job-photos").getPublicUrl(path);
      await supabase.from("job_photos").insert([{...photo_key,url:urlData.publicUrl,company_id:invoice.company_id}]);
    }
    if(errors.length) alert("Upload failed:\n"+errors.join("\n"));
    await loadData(); setUploading(false);
  }

  async function uploadDocs(files){
    if(!files?.length) return;
    setUploadingDoc(true);
    const path_prefix = mode==="estimate"?`${invoice.company_id}/hers/est-${estimateId}/docs`:`${invoice.company_id}/hers/${invoiceId}/docs`;
    const photo_key = mode==="estimate"?{hers_estimate_id:estimateId}:{hers_invoice_id:invoiceId};
    for(const file of Array.from(files)){
      const path=`${path_prefix}/${Date.now()}_${file.name}`;
      const { error:upErr } = await supabase.storage.from("job-photos").upload(path,file);
      if(upErr){ console.error(upErr); continue; }
      const { data:urlData } = supabase.storage.from("job-photos").getPublicUrl(path);
      await supabase.from("job_photos").insert([{...photo_key,url:urlData.publicUrl,caption:file.name,company_id:invoice.company_id,doc_type:"document"}]);
    }
    await loadData(); setUploadingDoc(false);
  }

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.muted}}>Loading…</div>
  );
  if(!invoice) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.muted,gap:10}}>
      <div>Invoice not found.</div>
      <button onClick={()=>navigate("/hers/invoices")} style={Btn}>← Back</button>
    </div>
  );

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:C.bg,minHeight:"100vh",paddingBottom:60}}>

      {saved && (
        <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:300,
            background:"#059669",color:"#fff",padding:"8px 16px",borderRadius:20,fontSize:12,fontWeight:700,
            boxShadow:"0 4px 16px rgba(0,0,0,.15)",textAlign:"center",maxWidth:"90vw"}}>
          ✅ {skipNote||"Saved!"}
        </div>
      )}

      {/* header */}
      <div style={{position:"sticky",top:0,zIndex:100,background:C.white,borderBottom:`1px solid ${C.border}`,
          padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>navigate(-1)} style={Btn}>← Back</button>
        <span style={{fontWeight:700,fontSize:14,flex:1,textAlign:"center"}}>📐 Field Measurements{unitLabel?` — ${unitLabel}`:""}</span>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
          <DebugLogButton />
          <button onClick={importFromInsulation} disabled={importing}
            style={{...Btn,color:"#7c3aed",borderColor:"#7c3aed",opacity:importing?0.6:1,fontSize:11}}>
            {importing?"…":"⬇ From Insulation"}
          </button>
          <button onClick={pushToInsulation} disabled={pushing}
            style={{...Btn,color:"#0369a1",borderColor:"#0369a1",opacity:pushing?0.6:1,fontSize:11}}>
            {pushing?"…":"⬆ To Insulation"}
          </button>
          <button onClick={pushToBoardPlaster} disabled={pushing}
            style={{...Btn,color:"#b45309",borderColor:"#b45309",opacity:pushing?0.6:1,fontSize:11,display:offersBoardPlaster?"inline-flex":"none"}}>
            {pushing?"…":"🧱 To Board & Plaster"}
          </button>
          <button onClick={()=>{
              const unitQuery = unitLabel ? `?unit=${encodeURIComponent(unitLabel)}` : "";
              navigate(mode==="estimate"?`/hers/ekotrope/estimate/${estimateId}${unitQuery}`:`/hers/ekotrope/${invoiceId}${unitQuery}`);
            }}
            title={unitLabel?"Shows just this unit's report":"Shows the whole-building report"}
            style={{...Btn,color:"#1d4ed8",borderColor:"#1d4ed8",fontSize:11}}>
            🟦 {unitLabel?`This Unit's Report`:`Ekotrope Report`}
          </button>
          <button onClick={save} disabled={saving} style={{...BtnD,opacity:saving?0.6:1}}>
            {saving?"Saving…":"Save"}
          </button>
        </div>
      </div>

      {/* multifamily unit switcher - jump between units without leaving this page */}
      {mode==="estimate" && unitLabels.length>1 && (
        <div style={{background:"#f8fafc",borderBottom:`1px solid ${C.border}`,
            padding:"8px 16px",display:"flex",gap:6,justifyContent:"center",alignItems:"center",flexWrap:"wrap"}}>
          {unitLabels.map((label,i)=>{
            const isActive = unitLabel===label;
            return (
              <div key={i} style={{display:"flex",alignItems:"center"}}>
                <button
                  onClick={()=>navigate(`/hers/measurements/estimate/${estimateId}?unit=${encodeURIComponent(label)}`)}
                  style={{padding:"5px 12px",borderRadius:isActive?"16px 0 0 16px":16,fontSize:12,fontWeight:600,cursor:"pointer",
                    border:`1px solid ${isActive?"#0f172a":C.border}`,
                    borderRight:isActive?"none":undefined,
                    background:isActive?"#0f172a":"#fff",
                    color:isActive?"#fff":C.muted,whiteSpace:"nowrap"}}>
                  {label}
                </button>
                {isActive && (
                  <button
                    title="Rename this unit (e.g. 1A, 2C)"
                    onClick={async()=>{
                      const newName = prompt(`Rename this unit? (currently "${label}")`, label);
                      if(newName===null) return;
                      const trimmed = newName.trim();
                      if(!trimmed || trimmed===label) return;
                      if(unitLabels.includes(trimmed)){ alert(`"${trimmed}" is already used by another unit.`); return; }
                      const newLabels = [...unitLabels];
                      newLabels[i] = trimmed;
                      await supabase.from("hers_estimates").update({ unit_labels: newLabels }).eq("id", estimateId);
                      // Rename the actual measurement row too, if one exists yet
                      await supabase.from("hers_field_measurements").update({ unit_label: trimmed })
                        .eq("hers_estimate_id", estimateId).eq("unit_label", label);
                      setUnitLabels(newLabels);
                      navigate(`/hers/measurements/estimate/${estimateId}?unit=${encodeURIComponent(trimmed)}`);
                    }}
                    style={{padding:"5px 8px",borderRadius:"0 16px 16px 0",fontSize:12,cursor:"pointer",
                      border:"1px solid #0f172a",background:"#0f172a",color:"#fff"}}>
                    ✏️
                  </button>
                )}
              </div>
            );
          })}
          {unitLabel && (
            <button disabled={duplicating}
              onClick={async()=>{
                const otherNames = unitLabels.filter(l=>l!==unitLabel).join(", ");
                const from = prompt(`Copy measurements from which unit into ${unitLabel}? (${otherNames})`);
                if(!from||!from.trim()) return;
                const typed = from.trim();
                const match = unitLabels.find(l=>l.toLowerCase()===typed.toLowerCase());
                if(!match){ alert(`Couldn't find a unit named "${typed}".`); return; }
                setDuplicating(true);
                try {
                  const { data:src } = await supabase.from("hers_field_measurements")
                    .select("*").eq("hers_estimate_id",estimateId).eq("unit_label",match).maybeSingle();
                  if(!src){ alert(`${match} doesn't have any measurements yet - nothing to copy.`); return; }
                  const { id, unit_label, created_at, ...rest } = src;
                  await supabase.from("hers_field_measurements").upsert(
                    { ...rest, hers_estimate_id: estimateId, unit_label: unitLabel },
                    { onConflict: "hers_estimate_id,unit_label" }
                  );
                  alert(`Copied ${match} into ${unitLabel}. Adjust anything that's different, then Save.`);
                  loadData();
                } catch(err){
                  alert("Error duplicating unit: "+(err.message||JSON.stringify(err)));
                }
                setDuplicating(false);
              }}
              style={{padding:"5px 12px",borderRadius:16,fontSize:12,fontWeight:600,cursor:"pointer",
                border:`1px solid ${C.border}`,background:"#fff",color:C.muted,whiteSpace:"nowrap",
                opacity:duplicating?0.5:1,marginLeft:6}}>
              ⧉ Duplicate from…
            </button>
          )}
          <button
            onClick={()=>navigate(`/hers/ekotrope/estimate/${estimateId}`)}
            style={{padding:"5px 12px",borderRadius:16,fontSize:12,fontWeight:600,cursor:"pointer",
              border:"1px solid #1d4ed8",background:"#fff",color:"#1d4ed8",whiteSpace:"nowrap",marginLeft:6}}>
            📊 Whole Building Report
          </button>
        </div>
      )}

      {/* section tabs */}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,
          padding:"8px 16px",display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
        {[
          {key:"overview",     label:"📊 Overview",  desc:"Ekotrope, CFA/Volume, Photos & Docs"},
          {key:"measurements", label:"🏗 Insulation", desc:"Area measurements"},
          {key:"windows",      label:"🪟 Windows",    desc:"Window shading"},
        ].map(t=>(
          <button key={t.key} onClick={()=>setSection(t.key)} title={t.desc}
            style={{padding:"7px 16px",borderRadius:8,
              border: section===t.key ? "2px solid #059669" : "2px solid transparent",
              background: section===t.key ? "#dcfce7" : "#f8fafc",
              color: section===t.key ? "#059669" : C.muted,
              cursor:"pointer",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"12px 14px"}}>

        {/* reference — always visible */}
        <div style={{...CARD,background:"#f8fafc",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.ink}}>{customer?.name||"Unknown"}</div>
            {invoice.address && <div style={{fontSize:12,color:C.muted,marginTop:2}}>📍 {invoice.address}</div>}
          </div>
          {unitLabels.length>1 && (
            <div style={{background:unitLabel?"#0f172a":"#dc2626",color:"#fff",fontWeight:800,fontSize:14,
                padding:"6px 16px",borderRadius:8,whiteSpace:"nowrap"}}>
              {unitLabel || "⚠ No unit selected"}
            </div>
          )}
        </div>

        {/* ══════════ OVERVIEW TAB ══════════ */}
        {section==="overview" && (
          <>
            {/* bedrooms */}
            <div style={{...CARD,display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>Bedrooms</span>
              <input type="number" value={bedrooms} onChange={e=>setBedrooms(e.target.value)} style={{...I,width:80,height:32}} />
            </div>

            {/* Ekotrope Summary */}
            <EkotropeSummary floors={cfaFloors} areas={areas} bedrooms={bedrooms} />

            {/* CFA / Volume */}
            <FloorsEditor floors={cfaFloors} onChange={setCfaFloors} onCommit={()=>setAutoSaveTick(t=>t+1)} unitLabel={unitLabel} />
          </>
        )}

        {/* ══════════ INSULATION MEASUREMENTS TAB ══════════ */}
        {section==="measurements" && (
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>Measurements</div>
            <span style={{fontSize:12,fontWeight:700,color:C.green}}>{fmt(totalSqft,0)} ft² total</span>
          </div>

          {/* Floor tabs — exact same as insulation estimate */}
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
            {floors.map(floor=>{
              const act = activeFloor===floor;
              const hasAreas = (areas[floor]||[]).some(a=>a.area_type&&a.sqft>0);
              return (
                <button key={floor} onClick={()=>setActiveFloor(floor)}
                  style={{padding:"7px 14px",borderRadius:8,height:"auto",
                    border:act?"2px solid #059669":"2px solid #86efac",
                    background:act?"#059669":(hasAreas?"#dcfce7":C.white),
                    color:act?"#fff":"#059669",cursor:"pointer",fontSize:13,fontWeight:700,whiteSpace:"nowrap",
                    boxShadow:act?"0 2px 8px rgba(5,150,105,.3)":"none"}}>
                  {floor}{hasAreas&&!act&&<span style={{marginLeft:4,fontSize:10}}>✓</span>}
                </button>
              );
            })}
            {addingFloor ? (
              <div style={{display:"flex",gap:4}}>
                <input autoFocus placeholder="Name" value={newFloorName} onChange={e=>setNewFloorName(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") addFloor(); if(e.key==="Escape") setAddingFloor(false); }}
                  style={{...I,width:80,height:34}} />
                <button onClick={addFloor} style={{...BtnD,padding:"0 8px"}}>✓</button>
                <button onClick={()=>setAddingFloor(false)} style={{...Btn,padding:"0 8px"}}>✕</button>
              </div>
            ) : (
              <button onClick={()=>setAddingFloor(true)}
                style={{padding:"7px 14px",borderRadius:8,border:"2px dashed #86efac",background:"none",
                  color:"#059669",cursor:"pointer",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
                + Floor
              </button>
            )}
          </div>

          {/* Add area button */}
          <button onClick={()=>addArea(activeFloor)}
            style={{width:"100%",padding:"7px",borderRadius:7,border:`1px dashed ${C.border}`,
              background:C.white,color:C.muted,cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:8,height:"auto"}}>
            + Add area to {activeFloor}{unitLabel?` (${unitLabel})`:""}
          </button>

          {/* Areas for active floor */}
          {currentAreas.length===0 ? (
            <div style={{textAlign:"center",padding:"14px",color:C.faint,fontSize:11,background:C.white,
                borderRadius:7,border:`1px solid ${C.border}`}}>
              No areas for {activeFloor} — tap above to add one
            </div>
          ) : (
            <>
              {currentAreas.filter(a=>!(a.area_type&&a.sqft>0)).map((area)=>{
                const realIdx = currentAreas.indexOf(area);
                return (
                  <AreaRow key={area.id} area={area} materials={materials}
                    onChange={(f,v)=>updateArea(activeFloor,realIdx,f,v)}
                    onDelete={()=>deleteArea(activeFloor,realIdx)}
                    onCommit={()=>setAutoSaveTick(t=>t+1)} />
                );
              })}
              {currentAreas.some(a=>a.area_type&&a.sqft>0) && (
                <div style={{fontSize:9,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:0.5,margin:"4px 0 4px 2px"}}>
                  ✓ Completed areas
                </div>
              )}
              {currentAreas.filter(a=>a.area_type&&a.sqft>0).map((area)=>{
                const realIdx = currentAreas.indexOf(area);
                return (
                  <AreaRow key={area.id} area={area} materials={materials}
                    onChange={(f,v)=>updateArea(activeFloor,realIdx,f,v)}
                    onDelete={()=>deleteArea(activeFloor,realIdx)}
                    onCommit={()=>setAutoSaveTick(t=>t+1)} />
                );
              })}
            </>
          )}

          {currentAreas.length>0 && (
            <div style={{display:"flex",justifyContent:"space-between",padding:"5px 10px",background:C.white,
                borderRadius:6,border:`1px solid ${C.border}`,marginTop:6,fontSize:11}}>
              <span style={{color:C.muted,fontWeight:600}}>{activeFloor} total</span>
              <span style={{fontWeight:700,color:C.green}}>{fmt(currentAreas.reduce((s,a)=>s+(a.sqft||0),0),0)} ft²</span>
            </div>
          )}
        </div>
        )}

        {/* ══════════ WINDOWS TAB ══════════ */}
        {section==="windows" && (
          <WindowsEditor windows={windows} onChange={setWindows} floorOptions={floors} onCommit={()=>setAutoSaveTick(t=>t+1)} unitLabel={unitLabel} />
        )}

        {/* ══════════ OVERVIEW TAB (continued) — Notes, Photos, Documents ══════════ */}
        {section==="overview" && (
        <>
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>Notes</div>
          <textarea placeholder="Notes from the field…" value={notes} onChange={e=>setNotes(e.target.value)}
            rows={2} style={{...I,height:"auto",padding:"8px",resize:"none",fontFamily:"inherit"}} />
        </div>

        {/* Photos */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>📷 Photos</div>
            <div style={{display:"flex",gap:6}}>
              <label style={{border:"none",background:C.ink,color:"white",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700}}>
                📷 Camera<input type="file" accept="image/*" capture="environment" multiple style={{display:"none"}} onChange={e=>uploadPhotos(e.target.files)} />
              </label>
              <label style={{border:`1px solid ${C.border}`,background:"white",color:"#374151",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700}}>
                🖼 Gallery<input type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>uploadPhotos(e.target.files)} />
              </label>
            </div>
          </div>
          {uploading && <div style={{textAlign:"center",padding:"12px 0",fontSize:12,color:C.muted}}>Uploading…</div>}
          {photos.length===0
            ? <div style={{textAlign:"center",padding:"20px 0",color:C.faint,fontSize:12}}>No photos yet</div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                {photos.map(ph=>(
                  <div key={ph.id} style={{position:"relative",paddingBottom:"100%",borderRadius:8,overflow:"hidden",background:"#f1f5f9"}}>
                    <img src={ph.url} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",cursor:"pointer"}} onClick={()=>window.open(ph.url,"_blank")} />
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Documents */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>📁 Documents &amp; Drawings</div>
            <label style={{border:"none",background:C.ink,color:"white",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700,display:"inline-block"}}>
              + Upload<input type="file" accept="application/pdf,image/*,.dwg,.dxf,.doc,.docx" multiple style={{display:"none"}} onChange={e=>uploadDocs(e.target.files)} />
            </label>
          </div>
          {uploadingDoc && <div style={{fontSize:12,color:C.muted,textAlign:"center",padding:"8px 0"}}>Uploading…</div>}
          {docs.length===0
            ? <div style={{textAlign:"center",padding:"16px 0",color:C.faint,fontSize:12}}>No documents yet</div>
            : <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {docs.map(d=>(
                  <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:"#f8fafc",borderRadius:8,border:`1px solid ${C.border}`}}>
                    <span style={{fontSize:18}}>{(d.caption||"").toLowerCase().endsWith(".pdf")?"📄":"📎"}</span>
                    <span style={{flex:1,fontSize:12,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.caption||"Document"}</span>
                    <button onClick={()=>window.open(d.url,"_blank")} style={{border:"none",background:"#eff6ff",color:"#3b82f6",padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Open</button>
                  </div>
                ))}
              </div>
          }
        </div>
        </>
        )}
      </div>
    </div>
  );
}
