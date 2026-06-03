import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const OVERHEAD_CATEGORIES = [
  "Overhead & Administration",
  "Vehicles & Equipment",
  "Labor (Non-Job)",
  "Facilities",
  "Other",
];

const DEFAULT_MATERIALS = [
  { material_name:"Open Cell",        unit:"board_ft", cost_per_unit:0.28, markup_pct:25 },
  { material_name:"Closed Cell",      unit:"board_ft", cost_per_unit:0.65, markup_pct:25 },
  { material_name:"Blown Fiberglass", unit:"bag",      cost_per_unit:18,   markup_pct:20 },
  { material_name:"Blown Cellulose",  unit:"bag",      cost_per_unit:22,   markup_pct:20 },
  { material_name:"Batt Fiberglass",  unit:"sqft",     cost_per_unit:0.45, markup_pct:20 },
  { material_name:"Rigid Foam",       unit:"sqft",     cost_per_unit:0.80, markup_pct:20 },
];

const C = {
  bg:"#f4f5f7", white:"#fff", ink:"#0f172a", muted:"#64748b",
  border:"#e2e8f0", green:"#059669", faint:"#94a3b8",
};
const I = {
  height:32, fontSize:13, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 8px", boxSizing:"border-box",
  color:C.ink, outline:"none", width:"100%",
};
const Btn = {
  height:32, fontSize:12, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 12px", cursor:"pointer", color:C.ink,
};
const BtnG = {
  ...Btn, border:"none", background:C.green, color:"#fff", fontWeight:700,
};

function fmt(n){ return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }

export default function Settings() {
  const { company } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overhead");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Overhead
  const [costs, setCosts] = useState([]);
  const [jobsPerMonth, setJobsPerMonth] = useState(20);

  // Materials
  const [matCosts, setMatCosts] = useState([]);

  // Consumables
  const [consumables, setConsumables] = useState([]);

  // Labor
  const [laborRate, setLaborRate] = useState(45);
  const [laborMode, setLaborMode] = useState("hour"); // hour | sqft
  const [laborSqftRate, setLaborSqftRate] = useState(0.45);
  const [defaultCrew, setDefaultCrew] = useState(2);

  // Margin
  const [margin, setMargin] = useState(30);

  useEffect(()=>{ if(company) load(); },[company]);

  async function load() {
    // load overhead costs
    const { data:c } = await supabase.from("cost_settings")
      .select("*").eq("company_id", company.id)
      .order("sort_order");
    if(c?.length) setCosts(c);
    else seedOverhead();

    // load consumables
    const { data:con } = await supabase.from("cost_settings")
      .select("*").eq("company_id", company.id)
      .eq("period","job_consumable").order("sort_order");
    if(con?.length) setConsumables(con);
    else seedConsumables();

    // load material costs
    const { data:m } = await supabase.from("material_costs")
      .select("*").eq("company_id", company.id);
    if(m?.length) setMatCosts(m);
    else seedMaterials();
  }

  function seedOverhead() {
    setCosts([
      { id:null, category:"Overhead & Administration", name:"Business Insurance", amount:500, period:"month", sort_order:1 },
      { id:null, category:"Overhead & Administration", name:"Accounting", amount:200, period:"month", sort_order:2 },
      { id:null, category:"Overhead & Administration", name:"Software & Subscriptions", amount:50, period:"month", sort_order:3 },
      { id:null, category:"Vehicles & Equipment", name:"Truck Payment", amount:800, period:"month", sort_order:4 },
      { id:null, category:"Vehicles & Equipment", name:"Truck Insurance", amount:250, period:"month", sort_order:5 },
      { id:null, category:"Vehicles & Equipment", name:"Fuel", amount:400, period:"month", sort_order:6 },
      { id:null, category:"Vehicles & Equipment", name:"Equipment Maintenance", amount:150, period:"month", sort_order:7 },
      { id:null, category:"Vehicles & Equipment", name:"Rig/Machine Payment", amount:600, period:"month", sort_order:8 },
      { id:null, category:"Labor (Non-Job)", name:"Office Admin", amount:2000, period:"month", sort_order:9 },
      { id:null, category:"Facilities", name:"Storage/Warehouse", amount:500, period:"month", sort_order:10 },
    ]);
  }

  function seedConsumables() {
    setConsumables([
      { id:null, name:"Plastic Sheeting",   unit_price:8,  qty_per_job:3, unit:"roll", sort_order:1 },
      { id:null, name:"Staples & Tape",     unit_price:5,  qty_per_job:2, unit:"box",  sort_order:2 },
      { id:null, name:"Protective Suits",   unit_price:4,  qty_per_job:5, unit:"each", sort_order:3 },
      { id:null, name:"Masks & PPE",        unit_price:2.5,qty_per_job:4, unit:"each", sort_order:4 },
      { id:null, name:"Miscellaneous Tools",unit_price:30, qty_per_job:1, unit:"job",  sort_order:5 },
    ]);
  }

  function seedMaterials() {
    setMatCosts(DEFAULT_MATERIALS.map(m=>({...m, id:null})));
  }

  // consumables total
  const totalConsumables = consumables.reduce((s,c)=>
    s + (Number(c.unit_price||0) * Number(c.qty_per_job||1)), 0);

  // overhead totals
  const totalMonthly = costs.reduce((s,c)=>s+Number(c.amount||0),0);
  const overheadPerJob = jobsPerMonth>0 ? totalMonthly/jobsPerMonth : 0;

  function updateCost(idx, field, value) {
    setCosts(p=>p.map((c,i)=> i===idx ? {...c,[field]:value} : c));
  }
  function addCost() {
    setCosts(p=>[...p,{id:null,category:"Other",name:"",amount:0,period:"month",sort_order:p.length+1}]);
  }
  function removeCost(idx) {
    setCosts(p=>p.filter((_,i)=>i!==idx));
  }
  function updateConsumable(idx, field, value) {
    setConsumables(p=>p.map((c,i)=> i===idx ? {...c,[field]:value} : c));
  }
  function addConsumable() {
    setConsumables(p=>[...p,{id:null,name:"",amount:0,unit:"job",sort_order:p.length+1}]);
  }
  function removeConsumable(idx) {
    setConsumables(p=>p.filter((_,i)=>i!==idx));
  }

  function updateMat(idx, field, value) {
    setMatCosts(p=>p.map((m,i)=> i===idx ? {...m,[field]:value} : m));
  }
  function addMat() {
    setMatCosts(p=>[...p,{id:null,material_name:"",unit:"board_ft",cost_per_unit:0,markup_pct:25}]);
  }
  function removeMat(idx) {
    setMatCosts(p=>p.filter((_,i)=>i!==idx));
  }

  async function saveAll() {
    if(!company) return;
    setSaving(true);
    try {
      // save overhead costs
      await supabase.from("cost_settings").delete().eq("company_id", company.id);
      if(costs.length>0){
        await supabase.from("cost_settings").insert(
          costs.map((c,i)=>({
            company_id: company.id,
            category: c.category,
            name: c.name,
            amount: Number(c.amount)||0,
            period: c.period||"month",
            sort_order: i,
          }))
        );
      }

      // save consumables — stored in cost_settings with period=job_consumable
      await supabase.from("cost_settings")
        .delete().eq("company_id", company.id).eq("period","job_consumable");
      if(consumables.length>0){
        await supabase.from("cost_settings").insert(
          consumables.filter(c=>c.name).map((c,i)=>({
            company_id: company.id,
            category: "Job Consumables",
            name: c.name,
            amount: Number(c.unit_price||0) * Number(c.qty_per_job||1),
            markup_pct: Number(c.markup_pct)||0,
            period: "job_consumable",
            sort_order: i,
          }))
        );
      }

      // save material costs
      await supabase.from("material_costs").delete().eq("company_id", company.id);
      if(matCosts.length>0){
        await supabase.from("material_costs").insert(
          matCosts.filter(m=>m.material_name).map(m=>({
            company_id: company.id,
            material_name: m.material_name,
            unit: m.unit,
            cost_per_unit: Number(m.cost_per_unit)||0,
            markup_pct: Number(m.markup_pct)||0,
          }))
        );
      }

      setSaved(true);
      setTimeout(()=>setSaved(false), 2000);
      await load();
    } catch(err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  }

  const TABS = [
    { id:"overhead", label:"Overhead" },
    { id:"materials", label:"Materials" },
    { id:"labor", label:"Labor & Margin" },
    { id:"consumables", label:"Consumables" },
    { id:"summary", label:"Summary" },
  ];

  return (
    <div style={{ fontFamily:"Inter,system-ui,sans-serif", background:C.bg,
        minHeight:"100vh", paddingBottom:40 }}>

      {/* header */}
      <div style={{ background:C.ink, padding:"12px 20px",
          display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={()=>navigate(-1)}
          style={{...Btn, background:"none", border:"1px solid #475569",
            color:"#94a3b8", fontSize:12}}>
          ← Back
        </button>
        <span style={{ color:"white", fontWeight:700, fontSize:16, flex:1 }}>
          Cost Settings
        </span>
        <button onClick={saveAll} disabled={saving}
          style={{...BtnG, height:36, fontSize:13, padding:"0 20px"}}>
          {saving ? "Saving…" : saved ? "✅ Saved!" : "Save All"}
        </button>
      </div>

      {/* tabs */}
      <div style={{ display:"flex", background:C.white,
          borderBottom:`1px solid ${C.border}`, padding:"0 16px",
          overflowX:"auto", gap:0 }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:"12px 16px", border:"none", background:"none",
              cursor:"pointer", fontSize:13, fontWeight:tab===t.id?700:400,
              color: tab===t.id ? C.green : C.muted,
              borderBottom: tab===t.id ? `2px solid ${C.green}` : "2px solid transparent",
              whiteSpace:"nowrap" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:700, margin:"0 auto", padding:"16px 14px" }}>

        {/* ── OVERHEAD TAB ── */}
        {tab==="overhead" && (
          <div>
            {/* jobs per month */}
            <div style={{ background:C.white, borderRadius:10, padding:"14px 16px",
                border:`1px solid ${C.border}`, marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>Jobs per Month</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                    Used to calculate overhead cost per job
                  </div>
                </div>
                <input type="number" value={jobsPerMonth}
                  onChange={e=>setJobsPerMonth(Number(e.target.value))}
                  style={{...I, width:80, textAlign:"center"}} />
              </div>
            </div>

            {/* costs by category */}
            {OVERHEAD_CATEGORIES.map(cat=>{
              const catCosts = costs.filter(c=>c.category===cat);
              if(!catCosts.length) return null;
              const catTotal = catCosts.reduce((s,c)=>s+Number(c.amount||0),0);
              return (
                <div key={cat} style={{ background:C.white, borderRadius:10,
                    border:`1px solid ${C.border}`, marginBottom:10, overflow:"hidden" }}>
                  <div style={{ padding:"10px 14px", background:"#f8fafc",
                      borderBottom:`1px solid ${C.border}`,
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontWeight:700, fontSize:13, color:C.ink }}>{cat}</span>
                    <span style={{ fontSize:12, color:C.green, fontWeight:700 }}>
                      ${fmt(catTotal)}/mo
                    </span>
                  </div>
                  {catCosts.map((cost, i)=>{
                    const realIdx = costs.indexOf(cost);
                    return (
                      <div key={i} style={{ display:"flex", gap:8, alignItems:"center",
                          padding:"8px 14px",
                          borderBottom:`1px solid ${C.border}` }}>
                        <input placeholder="Cost name" value={cost.name}
                          onChange={e=>updateCost(realIdx,"name",e.target.value)}
                          style={{...I, flex:2, height:30, fontSize:12}} />
                        <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                          <span style={{ fontSize:12, color:C.muted }}>$</span>
                          <input type="number" placeholder="0" value={cost.amount}
                            onChange={e=>updateCost(realIdx,"amount",e.target.value)}
                            style={{...I, width:80, height:30, fontSize:12, textAlign:"right"}} />
                        </div>
                        <span style={{ fontSize:11, color:C.faint, flexShrink:0 }}>/mo</span>
                        <button onClick={()=>removeCost(realIdx)}
                          style={{...Btn, padding:"0 8px", height:28, color:C.faint,
                            fontSize:14, flexShrink:0}}>✕</button>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* add cost */}
            <div style={{ background:C.white, borderRadius:10,
                border:`1px solid ${C.border}`, padding:"10px 14px", marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:8 }}>
                Add new cost item
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <select style={{...I, flex:1, height:30, fontSize:12}}
                  onChange={e=>{ addCost(); }}>
                  <option value="">Select category…</option>
                  {OVERHEAD_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
                <button onClick={addCost} style={{...BtnG, height:30, fontSize:12, padding:"0 12px"}}>
                  + Add
                </button>
              </div>
            </div>

            {/* monthly total */}
            <div style={{ background:C.ink, borderRadius:10, padding:"12px 16px",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ color:"#94a3b8", fontSize:11 }}>Total Monthly Overhead</div>
                <div style={{ color:"white", fontWeight:800, fontSize:20 }}>
                  ${fmt(totalMonthly)}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color:"#94a3b8", fontSize:11 }}>Per Job ({jobsPerMonth} jobs/mo)</div>
                <div style={{ color:C.green, fontWeight:800, fontSize:20 }}>
                  ${fmt(overheadPerJob)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MATERIALS TAB ── */}
        {tab==="materials" && (
          <div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
              Enter your actual cost per unit and desired markup percentage.
              The sell price is calculated automatically.
            </div>

            <div style={{ background:C.white, borderRadius:10,
                border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:10 }}>
              {/* header */}
              <div style={{ display:"grid",
                  gridTemplateColumns:"2fr 1fr 80px 70px 80px 28px",
                  gap:6, padding:"8px 12px", background:"#f8fafc",
                  borderBottom:`1px solid ${C.border}`,
                  fontSize:10, fontWeight:700, color:C.muted,
                  textTransform:"uppercase", letterSpacing:0.4 }}>
                <span>Material</span>
                <span>Unit</span>
                <span>Cost</span>
                <span>Markup</span>
                <span>Sell Price</span>
                <span></span>
              </div>

              {matCosts.map((m, i)=>{
                const sellPrice = Number(m.cost_per_unit||0) * (1 + Number(m.markup_pct||0)/100);
                return (
                  <div key={i} style={{ display:"grid",
                      gridTemplateColumns:"2fr 1fr 80px 70px 80px 28px",
                      gap:6, padding:"8px 12px",
                      borderBottom: i<matCosts.length-1?`1px solid ${C.border}`:"none",
                      alignItems:"center", background:i%2===0?C.white:"#fafbfc" }}>
                    <input placeholder="Material name" value={m.material_name}
                      onChange={e=>updateMat(i,"material_name",e.target.value)}
                      style={{...I, height:28, fontSize:11}} />
                    <select value={m.unit} onChange={e=>updateMat(i,"unit",e.target.value)}
                      style={{...I, height:28, fontSize:11, padding:"0 4px"}}>
                      <option value="board_ft">board ft</option>
                      <option value="bag">bag</option>
                      <option value="sqft">sqft</option>
                    </select>
                    <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                      <span style={{ fontSize:11, color:C.muted }}>$</span>
                      <input type="number" value={m.cost_per_unit}
                        onChange={e=>updateMat(i,"cost_per_unit",e.target.value)}
                        style={{...I, height:28, fontSize:11, textAlign:"right"}} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:1 }}>
                      <input type="number" value={m.markup_pct}
                        onChange={e=>updateMat(i,"markup_pct",e.target.value)}
                        style={{...I, height:28, fontSize:11, textAlign:"right"}} />
                      <span style={{ fontSize:11, color:C.muted }}>%</span>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:C.green,
                        textAlign:"right" }}>
                      ${sellPrice.toFixed(2)}
                    </div>
                    <button onClick={()=>removeMat(i)}
                      style={{...Btn, padding:"0 6px", height:26,
                        color:C.faint, fontSize:13}}>✕</button>
                  </div>
                );
              })}
            </div>

            <button onClick={addMat}
              style={{...BtnG, width:"100%", height:36, fontSize:13}}>
              + Add Material
            </button>
          </div>
        )}

        {/* ── LABOR & MARGIN TAB ── */}
        {tab==="labor" && (
          <div>
            <div style={{ background:C.white, borderRadius:10,
                border:`1px solid ${C.border}`, padding:"16px", marginBottom:12 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>
                Labor Calculation Method
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                {[["hour","By Hour"],["sqft","By Sqft"]].map(([val,label])=>(
                  <button key={val} onClick={()=>setLaborMode(val)}
                    style={{...Btn, flex:1, height:36,
                      background:laborMode===val?C.ink:C.white,
                      color:laborMode===val?"white":C.muted,
                      border:laborMode===val?`1px solid ${C.ink}`:`1px solid ${C.border}`,
                      fontWeight:laborMode===val?700:400}}>
                    {label}
                  </button>
                ))}
              </div>

              {laborMode==="hour" && (
                <div style={{ display:"flex", gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>Rate per person/hour</div>
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ color:C.muted }}>$</span>
                      <input type="number" value={laborRate}
                        onChange={e=>setLaborRate(Number(e.target.value))}
                        style={{...I, textAlign:"right"}} />
                      <span style={{ color:C.muted, fontSize:12 }}>/hr</span>
                    </div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>Default crew size</div>
                    <input type="number" value={defaultCrew}
                      onChange={e=>setDefaultCrew(Number(e.target.value))}
                      style={{...I, textAlign:"right"}} />
                  </div>
                </div>
              )}

              {laborMode==="sqft" && (
                <div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>Rate per sqft</div>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ color:C.muted }}>$</span>
                    <input type="number" value={laborSqftRate}
                      onChange={e=>setLaborSqftRate(Number(e.target.value))}
                      style={{...I, textAlign:"right"}} />
                    <span style={{ color:C.muted, fontSize:12 }}>/sqft</span>
                  </div>
                </div>
              )}
            </div>

            {/* profit margin */}
            <div style={{ background:C.white, borderRadius:10,
                border:`1px solid ${C.border}`, padding:"16px" }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>
                Profit Margin
              </div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
                Applied on top of all costs (materials + labor + overhead)
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" min="5" max="60" value={margin}
                  onChange={e=>setMargin(Number(e.target.value))}
                  style={{ flex:1, accentColor:C.green }} />
                <div style={{ fontSize:24, fontWeight:800, color:C.green,
                    minWidth:60, textAlign:"right" }}>
                  {margin}%
                </div>
              </div>
              <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>
                If total cost = $1,000 → Final price = ${fmt(1000 * (1 + margin/100))}
              </div>
            </div>
          </div>
        )}

        {/* ── CONSUMABLES TAB ── */}
        {tab==="consumables" && (
          <div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
              Fixed costs added to every job regardless of size.
              In the future these can be scaled by job sqft.
            </div>

            {/* avg sqft info */}
            <div style={{ background:"#eff6ff", borderRadius:8, padding:"10px 14px",
                border:"1px solid #bfdbfe", marginBottom:10, fontSize:12, color:"#1e40af" }}>
              <b>How it works:</b> Enter your cost per job for an average job.
              The app divides by your average job sqft to get $/sqft rate.
              Each estimate is then charged based on its actual sqft automatically.
            </div>

            {/* header */}
            <div style={{ display:"grid",
                gridTemplateColumns:"2fr 70px 80px 70px 80px 28px",
                gap:4, padding:"8px 12px", background:"#f8fafc",
                border:`1px solid ${C.border}`,
                borderRadius:"10px 10px 0 0",
                fontSize:9, fontWeight:700, color:C.muted,
                textTransform:"uppercase", letterSpacing:0.4 }}>
              <span>Item</span>
              <span>Unit</span>
              <span>Unit Price</span>
              <span>Qty/job</span>
              <span>Cost/job</span>
              <span></span>
            </div>

            <div style={{ border:`1px solid ${C.border}`, borderTop:"none",
                borderRadius:"0 0 10px 10px", overflow:"hidden", marginBottom:10 }}>
              {consumables.map((c,i)=>{
                const costJob = Number(c.unit_price||0) * Number(c.qty_per_job||1);
                return (
                  <div key={i} style={{ display:"grid",
                      gridTemplateColumns:"2fr 70px 80px 70px 80px 28px",
                      gap:4, padding:"8px 12px",
                      borderBottom:i<consumables.length-1?`1px solid ${C.border}`:"none",
                      background:i%2===0?C.white:"#fafbfc", alignItems:"center" }}>
                    <input placeholder="e.g. Plastic Sheeting"
                      value={c.name}
                      onChange={e=>updateConsumable(i,"name",e.target.value)}
                      style={{...I, height:28, fontSize:11}} />
                    <input placeholder="roll"
                      value={c.unit||""}
                      onChange={e=>updateConsumable(i,"unit",e.target.value)}
                      style={{...I, height:28, fontSize:11}} />
                    <div style={{ display:"flex", alignItems:"center", gap:1 }}>
                      <span style={{ fontSize:10, color:C.muted }}>$</span>
                      <input type="number" value={c.unit_price||0}
                        onChange={e=>updateConsumable(i,"unit_price",e.target.value)}
                        style={{...I, height:28, fontSize:11, textAlign:"right"}} />
                    </div>
                    <input type="number" value={c.qty_per_job||1}
                      onChange={e=>updateConsumable(i,"qty_per_job",e.target.value)}
                      style={{...I, height:28, fontSize:11, textAlign:"center"}} />
                    <div style={{ fontSize:12, fontWeight:700, color:C.green,
                        textAlign:"right" }}>
                      ${fmt(costJob)}
                    </div>

                    <button onClick={()=>removeConsumable(i)}
                      style={{...Btn, padding:"0 6px", height:26,
                        color:C.faint, fontSize:13}}>✕</button>
                  </div>
                );
              })}
            </div>

            <button onClick={addConsumable}
              style={{...BtnG, width:"100%", height:36, fontSize:13, marginBottom:12}}>
              + Add Item
            </button>

            {/* total */}
            <div style={{ background:C.ink, borderRadius:10, padding:"12px 16px",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ color:"#94a3b8", fontSize:11 }}>Total Cost/job</div>
                <div style={{ color:"white", fontWeight:800, fontSize:18 }}>
                  ${fmt(totalConsumables)}
                </div>
              </div>

            </div>

            <div style={{ marginTop:10, padding:"10px 14px", background:"#fffbeb",
                borderRadius:8, border:"1px solid #fde68a", fontSize:12, color:"#92400e" }}>
              💡 Consumables are added to total job cost before applying profit margin.
              They scale automatically by job sqft — bigger jobs use more materials.
            </div>
          </div>
        )}

        {/* ── SUMMARY TAB ── */}
        {tab==="summary" && (
          <div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:12 }}>
              This is how your final job price will be calculated on every estimate.
            </div>

            {/* formula card */}
            <div style={{ background:C.white, borderRadius:10,
                border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:12 }}>
              {[
                ["Materials", "Quantity × cost per unit for each material"],
                ["Markup", `${0}% markup applied to material cost`],
                ["Labor", laborMode==="hour"
                  ? `Crew (${defaultCrew}) × hours × $${laborRate}/hr`
                  : `Total sqft × $${laborSqftRate}/sqft`],
                ["Overhead", `$${fmt(overheadPerJob)} per job (${jobsPerMonth} jobs/month)`],
                ["Profit Margin", `${margin}% on top of all costs`],
              ].map(([label,desc],i)=>(
                <div key={i} style={{ padding:"10px 14px",
                    borderBottom:i<4?`1px solid ${C.border}`:"none",
                    display:"flex", justifyContent:"space-between",
                    background:i%2===0?C.white:"#fafbfc" }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{label}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{desc}</div>
                  </div>
                  {i===3 && (
                    <div style={{ fontWeight:700, fontSize:13, color:C.green }}>
                      ${fmt(overheadPerJob)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* example calculation */}
            <div style={{ background:"#f0fdf4", borderRadius:10,
                border:`1px solid #86efac`, padding:"14px 16px" }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:C.ink }}>
                Example — 1,000 sqft Open Cell 2x6
              </div>
              {(()=>{
                const mat = matCosts.find(m=>m.material_name==="Open Cell");
                const costPU = mat ? Number(mat.cost_per_unit) : 0.28;
                const markupPct = mat ? Number(mat.markup_pct) : 25;
                const qty = 1000 * 5.5; // board feet
                const matCost = qty * costPU;
                const matPrice = matCost * (1 + markupPct/100);
                const labor = laborMode==="hour"
                  ? defaultCrew * 4 * laborRate
                  : 1000 * laborSqftRate;
                const totalCost = matPrice + labor + overheadPerJob;
                const finalPrice = totalCost * (1 + margin/100);
                return (
                  <div style={{ fontSize:12, lineHeight:2 }}>
                    {[
                      [`Materials (${qty.toLocaleString()} board ft × $${costPU}/bf + ${markupPct}% markup)`, `$${fmt(matPrice)}`],
                      [laborMode==="hour"
                        ? `Labor (${defaultCrew} crew × 4hrs × $${laborRate}/hr)`
                        : `Labor (1,000 sqft × $${laborSqftRate}/sqft)`, `$${fmt(labor)}`],
                      [`Overhead per job`, `$${fmt(overheadPerJob)}`],
                [`Job Consumables`, `$${fmt(totalConsumables)}`],
                      [`Total Cost`, `$${fmt(totalCost)}`],
                      [`Profit Margin (${margin}%)`, `$${fmt(totalCost*margin/100)}`],
                    ].map(([l,v],i)=>(
                      <div key={i} style={{ display:"flex", justifyContent:"space-between",
                          borderBottom:i<4?`1px dashed #86efac`:"none",
                          paddingBottom:i<4?4:0, color:i===3?"#374151":C.muted }}>
                        <span>{l}</span>
                        <span style={{ fontWeight:i===3||i===4?700:400 }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ display:"flex", justifyContent:"space-between",
                        marginTop:8, paddingTop:8, borderTop:`2px solid #059669` }}>
                      <span style={{ fontWeight:800, fontSize:14 }}>Final Price</span>
                      <span style={{ fontWeight:800, fontSize:14, color:C.green }}>
                        ${fmt(finalPrice)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
