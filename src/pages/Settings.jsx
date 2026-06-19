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

  // Assets depreciation
  const [assets, setAssets] = useState([]);
  // Sales reps
  const [salesReps, setSalesReps] = useState([]);
  // Fuel
  const [fuelRate, setFuelRate] = useState(0.67); // $/mile IRS rate
  const [companyAddress] = useState("69 Watson St, Brockton MA");

  // Labor roles
  const [laborRoles, setLaborRoles] = useState([
    { role:"Lead Installer", rate:55 },
    { role:"Helper",         rate:35 },
    { role:"",               rate:0  },
    { role:"",               rate:0  },
  ]);

  // Consumables
  const [consumables, setConsumables] = useState([]);

  // Labor
  const [laborRate, setLaborRate] = useState(45);
  const [laborMode, setLaborMode] = useState("hour"); // hour | sqft
  const [laborSqftRate, setLaborSqftRate] = useState(0.45);
  const [defaultCrew, setDefaultCrew] = useState(2);

  // Margin
  const [margin, setMargin] = useState(30);

  // Trade configuration
  const [offersInsulation, setOffersInsulation] = useState(true);
  const [offersHers, setOffersHers] = useState(true);

  useEffect(()=>{ if(company) load(); },[company]);

  async function load() {
    // load overhead costs
    const { data:c } = await supabase.from("cost_settings")
      .select("*").eq("company_id", company.id)
      .order("sort_order");
    if(c?.length) setCosts(c);
    else seedOverhead();

    // load assets
    const { data:assetData } = await supabase.from("assets")
      .select("*").eq("company_id", company.id).order("sort_order");
    if(assetData?.length) setAssets(assetData);
    else setAssets([
      { id:null, name:"Spray Rig",     purchase_price:80000, useful_life_years:10, salvage_value:5000, sort_order:0 },
      { id:null, name:"Truck #1",      purchase_price:45000, useful_life_years:5,  salvage_value:5000, sort_order:1 },
      { id:null, name:"Blown Machine", purchase_price:12000, useful_life_years:7,  salvage_value:500,  sort_order:2 },
    ]);

    // load sales reps
    const { data:repData } = await supabase.from("sales_reps")
      .select("*").eq("company_id", company.id).order("created_at");
    if(repData?.length) setSalesReps(repData);
    else setSalesReps([{ id:null, name:"Vinicius", commission_pct:5, active:true }]);

    // load fuel rate
    const { data:fuelData } = await supabase.from("cost_settings")
      .select("*").eq("company_id", company.id).eq("period","fuel").maybeSingle();
    if(fuelData) setFuelRate(Number(fuelData.amount||0.67));

    // load labor roles
    const { data:lr } = await supabase.from("cost_settings")
      .select("*").eq("company_id", company.id)
      .eq("period","labor_role").order("sort_order");
    if(lr?.length) setLaborRoles(lr.map(r=>({role:r.name, rate:Number(r.amount||0)})));

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

    // load trade configuration
    const { data:co } = await supabase.from("companies")
      .select("offers_insulation,offers_hers").eq("id",company.id).maybeSingle();
    if(co){
      setOffersInsulation(co.offers_insulation !== false); // default true
      setOffersHers(co.offers_hers !== false);             // default true
    }
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
  // depreciation calculations
  const totalMonthlyDepreciation = assets.reduce((s,a)=>{
    const annual = (Number(a.purchase_price||0) - Number(a.salvage_value||0)) / Number(a.useful_life_years||5);
    return s + annual/12;
  }, 0);
  const depreciationPerJob = jobsPerMonth>0 ? totalMonthlyDepreciation/jobsPerMonth : 0;

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

  async function recalculateAll() {
    if(!company) return;
    setSaving(true);
    try {
      const THICK_MAP_LOCAL = {"2x4":3.5,"2x6":5.5,"2x8":7.25,"2x10":9.25,"2x12":11.25,"I-joist":11.875};

      // load all projects for this company
      const { data:projects } = await supabase.from("projects")
        .select("id").eq("company_id", company.id);
      if(!projects?.length){ alert("No projects found"); setSaving(false); return; }

      // load material costs
      const { data:mCosts } = await supabase.from("material_costs")
        .select("*").eq("company_id", company.id);
      const matCostMap = {};
      (mCosts||[]).forEach(m=>{ matCostMap[m.material_name]=m; });

      // load overhead
      const { data:overheadCosts } = await supabase.from("cost_settings")
        .select("*").eq("company_id", company.id).not("period","eq","job_consumable");
      const totalMonthly = (overheadCosts||[]).reduce((s,c)=>s+Number(c.amount||0),0);
      const overheadPerJob = totalMonthly / (jobsPerMonth||20);

      // load consumables
      const { data:cons } = await supabase.from("cost_settings")
        .select("*").eq("company_id", company.id).eq("period","job_consumable");
      const totalConsumablesPerJob = (cons||[]).reduce((s,c)=>s+Number(c.amount||0),0);

      let updated = 0;
      for(const proj of projects) {
        // load areas
        const { data:areas } = await supabase.from("areas")
          .select("*").eq("project_id", proj.id);
        if(!areas?.length) continue;

        // calculate material cost
        let materialCost = 0;
        let totalSqft = 0;
        areas.forEach(a=>{
          totalSqft += Number(a.sqft||0);
          const mc = matCostMap[a.material];
          if(!mc) return;
          const thick = THICK_MAP_LOCAL[a.thickness_in]||0;
          let qty = mc.unit==="board_ft" ? Number(a.sqft||0)*thick
                  : mc.unit==="bag" ? Math.ceil((Number(a.sqft||0)*thick)/(mc.coverage_factor||1))
                  : Number(a.sqft||0);
          const cost = qty * Number(mc.cost_per_unit||0);
          materialCost += cost * (1 + Number(mc.markup_pct||0)/100);
        });

        // scale consumables by sqft
        const avgSqft = 1000;
        const consumableCost = totalSqft>0
          ? totalConsumablesPerJob * (totalSqft/avgSqft)
          : totalConsumablesPerJob;

        const totalCost = materialCost + overheadPerJob + consumableCost;
        const finalPrice = totalCost * (1 + margin/100);

        // update quote
        await supabase.from("quotes")
          .update({
            material_cost: Math.round(materialCost*100)/100,
            overhead_cost: Math.round(overheadPerJob*100)/100,
            labor_cost: 0,
            final_price: Math.round(finalPrice*100)/100,
            grand_total: Math.round(finalPrice*100)/100,
            profit_margin_pct: margin,
          })
          .eq("project_id", proj.id);

        // update customer estimate amount
        const { data:proj2 } = await supabase.from("projects")
          .select("lead_id").eq("id", proj.id).single();
        if(proj2?.lead_id){
          await supabase.from("customers")
            .update({ estimate_amount: Math.round(finalPrice*100)/100 })
            .eq("id", proj2.lead_id);
        }

        updated++;
      }

      alert(`✅ Recalculated ${updated} estimates successfully!`);
    } catch(err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
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

      // save assets
      await supabase.from("assets").delete().eq("company_id", company.id);
      if(assets.filter(a=>a.name).length>0){
        await supabase.from("assets").insert(
          assets.filter(a=>a.name).map((a,i)=>({
            company_id: company.id,
            name: a.name,
            purchase_price: Number(a.purchase_price||0),
            useful_life_years: Number(a.useful_life_years||5),
            salvage_value: Number(a.salvage_value||0),
            sort_order: i,
          }))
        );
      }

      // save sales reps
      for(const rep of salesReps.filter(r=>r.name)){
        if(rep.id){
          await supabase.from("sales_reps").update({
            name: rep.name,
            commission_pct: Number(rep.commission_pct||0),
            active: rep.active,
          }).eq("id", rep.id);
        } else {
          await supabase.from("sales_reps").insert([{
            company_id: company.id,
            name: rep.name,
            commission_pct: Number(rep.commission_pct||0),
            active: true,
          }]);
        }
      }

      // save fuel rate
      await supabase.from("cost_settings")
        .delete().eq("company_id", company.id).eq("period","fuel");
      await supabase.from("cost_settings").insert([{
        company_id: company.id,
        category: "Fuel",
        name: "Fuel rate per mile",
        amount: Number(fuelRate||0.67),
        period: "fuel",
        sort_order: 0,
      }]);

      // save labor roles
      await supabase.from("cost_settings")
        .delete().eq("company_id", company.id).eq("period","labor_role");
      const validRoles = laborRoles.filter(r=>r.role&&Number(r.rate||0)>0);
      if(validRoles.length>0){
        await supabase.from("cost_settings").insert(
          validRoles.map((r,i)=>({
            company_id: company.id,
            category: "Labor",
            name: r.role,
            amount: Number(r.rate||0),
            period: "labor_role",
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

      // save trade configuration
      await supabase.from("companies")
        .update({ offers_insulation: offersInsulation, offers_hers: offersHers })
        .eq("id", company.id);

      setSaved(true);
      setTimeout(()=>setSaved(false), 2000);
      await load();
    } catch(err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  }

  const TABS = [
    { id:"trades",     label:"Trades" },
    { id:"overhead",   label:"Overhead" },
    { id:"materials",  label:"Materials" },
    { id:"labor",      label:"Labor & Margin" },
    { id:"laboroles",  label:"Labor Roles" },
    { id:"assets",     label:"Assets" },
    { id:"fuel",       label:"Fuel" },
    { id:"salesreps",  label:"Sales Reps" },
    { id:"consumables",label:"Consumables" },
    { id:"summary",    label:"Summary" },
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
        <div style={{display:"flex",gap:8}}>
          <button onClick={recalculateAll} disabled={saving}
            style={{...Btn, height:36, fontSize:12, padding:"0 14px",
              background:"#eff6ff", color:"#3b82f6", border:"1px solid #93c5fd"}}>
            🔄 Recalculate All
          </button>
          <button onClick={saveAll} disabled={saving}
            style={{...BtnG, height:36, fontSize:13, padding:"0 20px"}}>
            {saving ? "Saving…" : saved ? "✅ Saved!" : "Save All"}
          </button>
        </div>
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

        {/* ── TRADES TAB ── */}
        {tab==="trades" && (
          <div>
            <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"20px 20px",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:C.ink,marginBottom:4}}>Which trades does your company offer?</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:20,lineHeight:1.5}}>
                This controls which sections appear on the New Job screen and throughout the app.
                You can change this at any time.
              </div>

              <label style={{display:"flex",alignItems:"flex-start",gap:14,padding:"14px 16px",
                  border:`1px solid ${C.border}`,borderRadius:8,marginBottom:10,cursor:"pointer",
                  background:offersInsulation?"#f0fdf4":"#fafafa"}}>
                <input type="checkbox" checked={offersInsulation}
                  onChange={e=>setOffersInsulation(e.target.checked)}
                  style={{width:18,height:18,marginTop:1,accentColor:C.green,flexShrink:0}} />
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:C.ink}}>🏠 Insulation</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                    Estimates, proposals, job costing, and field measurements for insulation work.
                  </div>
                </div>
              </label>

              <label style={{display:"flex",alignItems:"flex-start",gap:14,padding:"14px 16px",
                  border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer",
                  background:offersHers?"#f0fdf4":"#fafafa"}}>
                <input type="checkbox" checked={offersHers}
                  onChange={e=>setOffersHers(e.target.checked)}
                  style={{width:18,height:18,marginTop:1,accentColor:C.green,flexShrink:0}} />
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:C.ink}}>⭐ HERS Rating</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                    HERS estimates, invoices, Ekotrope field measurements, and energy modeling data.
                  </div>
                </div>
              </label>

              {!offersInsulation && !offersHers && (
                <div style={{marginTop:12,padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",
                    borderRadius:8,fontSize:12,color:"#dc2626"}}>
                  ⚠️ At least one trade must be enabled.
                </div>
              )}
            </div>
          </div>
        )}

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

        {/* ── ASSETS TAB ── */}
        {tab==="assets" && (
          <div>
            <div style={{fontSize:12,color:C.muted,marginBottom:10}}>
              Asset depreciation is calculated monthly and added to overhead cost per job.
              Formula: (Purchase Price - Salvage Value) ÷ Useful Life Years ÷ 12 months
            </div>

            <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:10}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 28px",
                  gap:4,padding:"8px 12px",background:"#f8fafc",
                  borderBottom:`1px solid ${C.border}`,
                  fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.4}}>
                <span>Asset</span><span>Purchase $</span><span>Life (yrs)</span>
                <span>Salvage $</span><span>$/month</span><span></span>
              </div>
              {assets.map((a,i)=>{
                const annual = (Number(a.purchase_price||0)-Number(a.salvage_value||0))/Number(a.useful_life_years||5);
                const monthly = annual/12;
                return (
                  <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 28px",
                      gap:4,padding:"8px 12px",
                      borderBottom:i<assets.length-1?`1px solid ${C.border}`:"none",
                      background:i%2===0?C.white:"#fafbfc",alignItems:"center"}}>
                    <input placeholder="Asset name" value={a.name}
                      onChange={e=>setAssets(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                      style={{...I,height:28,fontSize:11}} />
                    <div style={{display:"flex",alignItems:"center",gap:1}}>
                      <span style={{fontSize:10,color:C.muted}}>$</span>
                      <input type="number" value={a.purchase_price||""}
                        onChange={e=>setAssets(p=>p.map((x,j)=>j===i?{...x,purchase_price:e.target.value}:x))}
                        style={{...I,height:28,fontSize:11,textAlign:"right"}} />
                    </div>
                    <input type="number" value={a.useful_life_years||""}
                      onChange={e=>setAssets(p=>p.map((x,j)=>j===i?{...x,useful_life_years:e.target.value}:x))}
                      style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                    <div style={{display:"flex",alignItems:"center",gap:1}}>
                      <span style={{fontSize:10,color:C.muted}}>$</span>
                      <input type="number" value={a.salvage_value||""}
                        onChange={e=>setAssets(p=>p.map((x,j)=>j===i?{...x,salvage_value:e.target.value}:x))}
                        style={{...I,height:28,fontSize:11,textAlign:"right"}} />
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:C.green,textAlign:"right"}}>
                      ${fmt(monthly)}/mo
                    </div>
                    <button onClick={()=>setAssets(p=>p.filter((_,j)=>j!==i))}
                      style={{...Btn,padding:"0 6px",height:26,color:C.faint,fontSize:13}}>✕</button>
                  </div>
                );
              })}
            </div>
            <button onClick={()=>setAssets(p=>[...p,{id:null,name:"",purchase_price:0,useful_life_years:5,salvage_value:0,sort_order:p.length}])}
              style={{...BtnG,width:"100%",height:36,fontSize:13,marginBottom:12}}>
              + Add Asset
            </button>
            <div style={{background:C.ink,borderRadius:10,padding:"12px 16px",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:"#94a3b8",fontSize:11}}>Total Monthly Depreciation</div>
                <div style={{color:"white",fontWeight:800,fontSize:18}}>${fmt(totalMonthlyDepreciation)}/mo</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:"#94a3b8",fontSize:11}}>Per Job ({jobsPerMonth} jobs/mo)</div>
                <div style={{color:C.green,fontWeight:800,fontSize:18}}>${fmt(depreciationPerJob)}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── FUEL TAB ── */}
        {tab==="fuel" && (
          <div>
            <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
              Fuel cost is calculated per job based on distance from your company to the job site.
              Enter miles manually on each estimate.
            </div>
            <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"16px",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Fuel Rate</div>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Cost per mile (round trip)</div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{color:C.muted}}>$</span>
                    <input type="number" value={fuelRate}
                      onChange={e=>setFuelRate(Number(e.target.value))}
                      style={{...I,textAlign:"right"}} />
                    <span style={{fontSize:12,color:C.muted}}>/mile</span>
                  </div>
                  <div style={{fontSize:11,color:C.faint,marginTop:4}}>
                    IRS standard rate 2026: $0.67/mile
                  </div>
                </div>
              </div>
              <div style={{background:"#f0fdf4",borderRadius:8,padding:"12px",border:"1px solid #86efac"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#059669",marginBottom:6}}>Example</div>
                <div style={{fontSize:12,color:"#374151",lineHeight:2}}>
                  <div>Job is 25 miles from company (50 miles round trip)</div>
                  <div>Fuel cost = 50 × ${fuelRate} = <b>${fmt(50*fuelRate)}</b></div>
                </div>
              </div>
            </div>
            <div style={{background:"#fffbeb",borderRadius:8,padding:"10px 14px",
                border:"1px solid #fde68a",fontSize:12,color:"#92400e"}}>
              💡 On each estimate you enter the one-way miles to the job.
              The app calculates round trip automatically.
            </div>
          </div>
        )}

        {/* ── SALES REPS TAB ── */}
        {tab==="salesreps" && (
          <div>
            <div style={{fontSize:12,color:C.muted,marginBottom:10}}>
              Commission is calculated as a % of the final price and added to job cost.
              Each estimate can be assigned to a specific sales rep.
            </div>
            <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:10}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 28px",
                  gap:8,padding:"8px 14px",background:"#f8fafc",
                  borderBottom:`1px solid ${C.border}`,
                  fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.4}}>
                <span>Name</span><span>Commission %</span><span>Active</span><span></span>
              </div>
              {salesReps.map((r,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 28px",
                    gap:8,padding:"8px 14px",
                    borderBottom:i<salesReps.length-1?`1px solid ${C.border}`:"none",
                    background:i%2===0?C.white:"#fafbfc",alignItems:"center"}}>
                  <input placeholder="Rep name" value={r.name}
                    onChange={e=>setSalesReps(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                    style={{...I,height:30,fontSize:12}} />
                  <div style={{display:"flex",alignItems:"center",gap:2}}>
                    <input type="number" value={r.commission_pct||""}
                      onChange={e=>setSalesReps(p=>p.map((x,j)=>j===i?{...x,commission_pct:e.target.value}:x))}
                      style={{...I,height:30,fontSize:12,textAlign:"right"}} />
                    <span style={{fontSize:11,color:C.muted}}>%</span>
                  </div>
                  <button onClick={()=>setSalesReps(p=>p.map((x,j)=>j===i?{...x,active:!x.active}:x))}
                    style={{...Btn,height:28,fontSize:11,padding:"0 8px",
                      background:r.active?"#dcfce7":C.white,
                      color:r.active?"#059669":C.faint,
                      border:r.active?"1px solid #86efac":`1px solid ${C.border}`}}>
                    {r.active?"Active":"Inactive"}
                  </button>
                  <button onClick={()=>setSalesReps(p=>p.filter((_,j)=>j!==i))}
                    style={{...Btn,padding:"0 6px",height:26,color:C.faint,fontSize:13}}>✕</button>
                </div>
              ))}
            </div>
            <button onClick={()=>setSalesReps(p=>[...p,{id:null,name:"",commission_pct:5,active:true}])}
              style={{...BtnG,width:"100%",height:36,fontSize:13}}>
              + Add Sales Rep
            </button>
          </div>
        )}

        {/* ── LABOR ROLES TAB ── */}
        {tab==="laboroles" && (
          <div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
              Define your crew roles and hourly rates once.
              These auto-fill into every estimate automatically.
            </div>

            <div style={{ background:C.white, borderRadius:10,
                border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:10 }}>
              {/* header */}
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 28px",
                  gap:8, padding:"8px 14px", background:"#f8fafc",
                  borderBottom:`1px solid ${C.border}`,
                  fontSize:10, fontWeight:700, color:C.muted,
                  textTransform:"uppercase", letterSpacing:0.4 }}>
                <span>Role</span>
                <span>Rate/hr</span>
                <span></span>
              </div>
              {laborRoles.map((r,i)=>(
                <div key={i} style={{ display:"grid",
                    gridTemplateColumns:"2fr 1fr 28px",
                    gap:8, padding:"8px 14px",
                    borderBottom:i<laborRoles.length-1?`1px solid ${C.border}`:"none",
                    background:i%2===0?C.white:"#fafbfc", alignItems:"center" }}>
                  <input placeholder={i===0?"Lead Installer":i===1?"Helper":"Role name"}
                    value={r.role}
                    onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,role:e.target.value}:x))}
                    style={{...I, height:30, fontSize:12}} />
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ fontSize:12, color:C.muted }}>$</span>
                    <input type="number" value={r.rate||""}
                      onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,rate:e.target.value}:x))}
                      style={{...I, height:30, fontSize:12, textAlign:"right"}} />
                    <span style={{ fontSize:11, color:C.muted }}>/hr</span>
                  </div>
                  <button onClick={()=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,role:"",rate:0}:x))}
                    style={{...Btn, padding:"0 6px", height:26, color:C.faint, fontSize:13}}>
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button onClick={()=>setLaborRoles(p=>[...p,{role:"",rate:0}])}
              style={{...BtnG, width:"100%", height:36, fontSize:13, marginBottom:12}}>
              + Add Role
            </button>

            <div style={{ background:"#fffbeb", borderRadius:8, padding:"10px 14px",
                border:"1px solid #fde68a", fontSize:12, color:"#92400e" }}>
              💡 These rates auto-fill into the Labor section of every new estimate.
              You can still adjust hours per job on the estimate form.
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
