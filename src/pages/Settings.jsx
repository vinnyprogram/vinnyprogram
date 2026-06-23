import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
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

  // Configurable lists
  const DEFAULT_AREA_TYPES = ["Roof Rafter w/ Strapping","Roof Rafter behind knee walls","Floor","Exterior Wall","Demising Wall","Rim Joist","Concrete Wall","Ceiling","Interior Walls","Fire Blocking"];
  const DEFAULT_THICK_OPTS = ["2x3","2x4","2x6","2x8","2x10","2x12","I-joist 14in","I-joist 16in","I-joist 18in"];
  const DEFAULT_R_VALS     = ["R-11","R-13","R-15","R-19","R-21","R-28","R-30","R-38","R-49","R-60"];
  const [listAreaTypes, setListAreaTypes] = useState(DEFAULT_AREA_TYPES);
  const [listThickOpts, setListThickOpts] = useState(DEFAULT_THICK_OPTS);
  const [listRVals,     setListRVals]     = useState(DEFAULT_R_VALS);
  const [newAreaType,   setNewAreaType]   = useState("");
  const [newThickOpt,   setNewThickOpt]   = useState("");
  const [newRVal,       setNewRVal]       = useState("");

  // Overhead
  const [costs, setCosts] = useState([]);
  const [jobsPerMonth, setJobsPerMonth] = useState(20);

  // Materials
  const [matCosts, setMatCosts] = useState([]);
  // Two-layer material system: types (Layer 1) each have products (Layer 2)
  const [matTypes, setMatTypes] = useState([]); // [{id, name, unit, r_per_inch, products:[...]}]
  // Per-thickness/R-value/facing pricing for batts & rigid foam
  const [materialVariants, setMaterialVariants] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  // Assets depreciation
  const [assets, setAssets] = useState([]);
  // Sales reps
  const [salesReps, setSalesReps] = useState([]);
  // Fuel
  const [fuelRate, setFuelRate] = useState(0.67); // $/mile IRS rate
  const [shopAddress, setShopAddress] = useState(""); // for fuel auto-calc on quotes
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

  useEffect(()=>{ if(company?.id) load(); },[company?.id]);

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
    if(fuelData?.notes) setShopAddress(fuelData.notes||"");

    // load jobs-per-month (used to allocate overhead per job) — was previously
    // never persisted at all, just a local default that reset every reload
    const { data:jpmData } = await supabase.from("cost_settings")
      .select("*").eq("company_id", company.id).eq("period","jobs_per_month").maybeSingle();
    if(jpmData) setJobsPerMonth(Number(jpmData.amount||20));

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

    // Load two-layer material system
    const [{data:types},{data:products}] = await Promise.all([
      supabase.from("material_types").select("*").eq("company_id",company.id).order("sort_order"),
      supabase.from("material_products").select("*").eq("company_id",company.id).order("sort_order"),
    ]);
    if(types?.length){
      // DB has the new system — load and combine
      setMatTypes(types.map(t=>({
        ...t,
        products:(products||[]).filter(p=>p.material_type_id===t.id),
      })));
    } else if(m?.length){
      // No types yet — seed from existing material_costs so user sees their
      // existing data in the new UI and can save to migrate it
      setMatTypes(m.map((mc,i)=>({
        id:null, material_type_id:null,
        name:mc.material_name, unit:mc.unit||"sqft", r_per_inch:mc.r_per_inch||null,
        sort_order:i,
        products:[{
          id:null, brand:"", description:"",
          cost_per_unit:mc.cost_per_unit||0, markup_pct:mc.markup_pct||20,
          coverage_factor:mc.coverage_factor||1, is_active:true, r_value:null,
        }],
      })));
    }
    else seedMaterials();

    // load material variants (per thickness/R-value pricing)
    const { data:mv } = await supabase.from("material_variants")
      .select("*").eq("company_id", company.id).order("sort_order");
    if(mv?.length) setMaterialVariants(mv);

    // load trade configuration
    const { data:co } = await supabase.from("companies")
      .select("offers_insulation,offers_hers").eq("id",company.id).maybeSingle();
    if(co){
      setOffersInsulation(co.offers_insulation !== false); // default true
      setOffersHers(co.offers_hers !== false);             // default true
    }

    // load configurable lists (area types, thickness, R-values)
    const { data:listRows } = await supabase.from("cost_settings").select("*")
      .eq("company_id",company.id)
      .in("period",["list_area_type","list_thick_opt","list_r_val"])
      .order("sort_order");
    if(listRows?.length){
      const at = listRows.filter(r=>r.period==="list_area_type").map(r=>r.name);
      const th = listRows.filter(r=>r.period==="list_thick_opt").map(r=>r.name);
      const rv = listRows.filter(r=>r.period==="list_r_val").map(r=>r.name);
      if(at.length) setListAreaTypes(at);
      if(th.length) setListThickOpts(th);
      if(rv.length) setListRVals(rv);
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
    setMatCosts(p=>[...p,{id:null,material_name:"",unit:"board_ft",cost_per_unit:0,markup_pct:25,coverage_factor:1,r_per_inch:null}]);
  }
  function removeMat(idx) {
    setMatCosts(p=>p.filter((_,i)=>i!==idx));
  }

  function updateVariant(idx, field, value) {
    setMaterialVariants(p=>p.map((v,i)=> i===idx ? {...v,[field]:value} : v));
  }
  function addVariant() {
    setMaterialVariants(p=>[...p,{id:null,material_name:"",thickness_in:"",r_value:"",facing:"",cost_per_sqft:0,markup_pct:20,sort_order:p.length}]);
  }
  function removeVariant(idx) {
    setMaterialVariants(p=>p.filter((_,i)=>i!==idx));
  }

  async function handleImportWorkbook(file) {
    setImporting(true);
    setImportSummary(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type:"array", cellDates:true });

      function rows(sheetName){
        const ws = wb.Sheets[sheetName];
        if(!ws) return null;
        return XLSX.utils.sheet_to_json(ws, { header:1, defval:"", raw:true });
      }
      const isDate = v => v instanceof Date;
      const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
      const str = v => (v===null||v===undefined) ? "" : String(v).trim();

      const newMatCosts = [...matCosts];
      function upsertMatCost(material_name, unit, cost_per_unit, markup_pct, coverage_factor, r_per_inch=null){
        const idx = newMatCosts.findIndex(m=>(m.material_name||"").toLowerCase()===material_name.toLowerCase());
        const row = { id: idx>=0?newMatCosts[idx].id:null, material_name, unit, cost_per_unit, markup_pct, coverage_factor, r_per_inch };
        if(idx>=0) newMatCosts[idx]=row; else newMatCosts.push(row);
      }

      // Spray Foam (Sets) — continuous board-ft pricing. Thickness sprayed
      // is calculated from the area's target R-value (R-value ÷ R-per-inch),
      // not a stud-cavity dropdown — so each row gets a default R-per-inch
      // based on whether it's open or closed cell, editable afterward.
      let sprayCount=0;
      const sprayRows = rows("Spray Foam (Sets)");
      if(sprayRows){
        for(let i=3;i<sprayRows.length;i++){
          const r = sprayRows[i];
          const name = str(r[0]); if(!name) continue;
          const pricePerBoardFt = num(r[4]);
          if(pricePerBoardFt<=0) continue;
          const nameLower = name.toLowerCase();
          const rPerInch = nameLower.includes("closed") ? 6.85 : nameLower.includes("open") ? 3.75 : null;
          upsertMatCost(name, "board_ft", Math.round(pricePerBoardFt*10000)/10000, 25, 1, rPerInch);
          sprayCount++;
        }
      }

      // Cellulose (Bags) — continuous sqft-inch pricing via coverage_factor
      let celCount=0;
      const celRows = rows("Cellulose (Bags)");
      if(celRows){
        for(let i=3;i<celRows.length;i++){
          const r = celRows[i];
          const name = str(r[0]); if(!name) continue;
          const pricePerBag = num(r[2]);
          const coverageFactor = num(r[3]);
          if(pricePerBag<=0) continue;
          upsertMatCost(name, "bag", Math.round(pricePerBag*100)/100, 20, coverageFactor||1);
          celCount++;
        }
      }

      const newVariants = [...materialVariants];
      function upsertVariant(material_name, thickness_in, r_value, facing, cost_per_sqft, markup_pct){
        // Matches the pricing lookup key — material + R-value only.
        // Thickness varies by cavity depth on the actual job, not by price,
        // so it's kept on the row for reference but isn't part of the match.
        const key = v => `${v.material_name}|${v.r_value}`.toLowerCase();
        const targetKey = `${material_name}|${r_value}`.toLowerCase();
        const idx = newVariants.findIndex(v=>key(v)===targetKey);
        const row = { id: idx>=0?newVariants[idx].id:null, material_name, thickness_in, r_value, facing,
          cost_per_sqft, markup_pct, sort_order: idx>=0?newVariants[idx].sort_order:newVariants.length };
        if(idx>=0) newVariants[idx]=row; else newVariants.push(row);
      }

      // Batts — discrete per thickness/R-value/facing pricing
      let battCount=0, battSkipped=0;
      const battRows = rows("Batts (Fiberglass-MineralWool)");
      if(battRows){
        for(let i=3;i<battRows.length;i++){
          const r = battRows[i];
          const name = str(r[0]); if(!name) continue;
          const thickness = str(r[1]).replace(/X/g,"x");
          const rvalue = str(r[2]);
          const facing = str(r[3]);
          const priceSqft = num(r[8]); // auto-calc Price per Sqft column
          if(priceSqft<=0){ battSkipped++; continue; }
          upsertVariant(name, thickness, rvalue, facing, Math.round(priceSqft*10000)/10000, 20);
          battCount++;
        }
      }

      // Rigid Foam — discrete per thickness/R-value pricing (no facing)
      let rigidCount=0, rigidSkipped=0;
      const rigidRows = rows("Rigid Foam (Sheets)");
      if(rigidRows){
        for(let i=3;i<rigidRows.length;i++){
          const r = rigidRows[i];
          const name = str(r[0]); if(!name) continue;
          const thicknessRaw = r[1];
          // Excel sometimes mis-parses a typed fraction like "1/2" as a date —
          // skip and flag rather than guess at the intended thickness
          if(isDate(thicknessRaw)){ rigidSkipped++; continue; }
          const thickness = str(thicknessRaw)+"in";
          const rvalue = str(r[2]);
          const priceSqft = num(r[7]); // auto-calc Price per Sqft column
          if(priceSqft<=0){ rigidSkipped++; continue; }
          upsertVariant(name, thickness, rvalue, "", Math.round(priceSqft*10000)/10000, 20);
          rigidCount++;
        }
      }

      // Indirect Costs (Overhead)
      const CATEGORY_MAP = {
        facility:"Facilities", insurance:"Overhead & Administration",
        vehicles:"Vehicles & Equipment", equipment:"Vehicles & Equipment",
        software:"Overhead & Administration", marketing:"Overhead & Administration",
        admin:"Overhead & Administration", licensing:"Overhead & Administration",
        taxes:"Overhead & Administration", other:"Other",
      };
      const newCosts = [...costs];
      let overheadCount=0;
      let newJobsPerMonth = jobsPerMonth;
      const ohRows = rows("Indirect Costs (Overhead)");
      if(ohRows){
        for(let i=3;i<ohRows.length;i++){
          const r = ohRows[i];
          const cat = str(r[0]);
          const item = str(r[1]);
          const amount = num(r[2]);
          if(!item) continue;
          const itemLower = item.toLowerCase();
          if(itemLower.includes("total monthly overhead")) continue;
          if(itemLower.includes("avg. jobs per month")){ if(amount>0) newJobsPerMonth=amount; continue; }
          if(itemLower.includes("overhead allocation per job")) continue;
          if(amount<=0) continue;
          const mappedCat = CATEGORY_MAP[cat.toLowerCase()] || "Other";
          const existIdx = newCosts.findIndex(c=>c.name===item);
          const row = { id: existIdx>=0?newCosts[existIdx].id:null, category:mappedCat, name:item,
            amount, period:"month", sort_order: existIdx>=0?newCosts[existIdx].sort_order:newCosts.length };
          if(existIdx>=0) newCosts[existIdx]=row; else newCosts.push(row);
          overheadCount++;
        }
      }

      // Crew & Job-Site Costs — splits across consumables / labor roles / sales reps / overhead
      const newConsumables = [...consumables];
      const newLaborRoles = [...laborRoles];
      const newSalesReps = [...salesReps];
      let consumableCount=0, laborCount=0;
      const salaryNotes=[];
      const crewRows = rows("Crew & Job-Site Costs");
      if(crewRows){
        for(let i=3;i<crewRows.length;i++){
          const r = crewRows[i];
          const col0 = str(r[0]);
          const col1 = str(r[1]);
          const cost = num(r[2]);
          const unitRaw = r[3];
          const notes = str(r[4]);
          if(!col0) continue;

          if(col1.toLowerCase()==="employee"){
            if(str(unitRaw).toLowerCase().includes("hour")){
              const existIdx = newLaborRoles.findIndex(lr=>lr.role===col0);
              if(existIdx>=0) newLaborRoles[existIdx] = {...newLaborRoles[existIdx], rate:cost};
              else newLaborRoles.push({role:col0, rate:cost});
              laborCount++;
            } else if(str(unitRaw).toLowerCase().includes("week")){
              // weekly salary doesn't fit the hourly labor-role model —
              // converted to a monthly overhead line item instead
              const monthlyEquiv = Math.round(cost*52/12*100)/100;
              const ohName = `${col0} (weekly salary)`;
              const existIdx = newCosts.findIndex(c=>c.name===ohName);
              const row = { id: existIdx>=0?newCosts[existIdx].id:null, category:"Labor (Non-Job)",
                name:ohName, amount:monthlyEquiv, period:"month",
                sort_order: existIdx>=0?newCosts[existIdx].sort_order:newCosts.length };
              if(existIdx>=0) newCosts[existIdx]=row; else newCosts.push(row);
              overheadCount++;
              salaryNotes.push(`${col0}: $${cost}/week → $${monthlyEquiv}/mo overhead`);
              const commMatch = notes.match(/(\d+(\.\d+)?)\s*%/);
              if(commMatch){
                const pct = Number(commMatch[1]);
                const repIdx = newSalesReps.findIndex(sr=>sr.name===col0);
                if(repIdx>=0) newSalesReps[repIdx] = {...newSalesReps[repIdx], commission_pct:pct};
                else newSalesReps.push({id:null, name:col0, commission_pct:pct, active:true});
                salaryNotes.push(`${col0}: ${pct}% commission added to Sales Reps`);
              }
            }
            continue;
          }

          if(cost<=0) continue;
          const qty = (typeof unitRaw === "number") ? unitRaw : 1;
          const unitLabel = (typeof unitRaw === "string" && unitRaw) ? unitRaw : "job";
          const existIdx = newConsumables.findIndex(c=>c.name===col1);
          const row = { id: existIdx>=0?newConsumables[existIdx].id:null, name:col1, unit:unitLabel,
            unit_price:cost, qty_per_job:qty, sort_order: existIdx>=0?newConsumables[existIdx].sort_order:newConsumables.length };
          if(existIdx>=0) newConsumables[existIdx]=row; else newConsumables.push(row);
          consumableCount++;
        }
      }

      setMatCosts(newMatCosts);
      setMaterialVariants(newVariants);
      setCosts(newCosts);
      setJobsPerMonth(newJobsPerMonth);
      setConsumables(newConsumables);
      setLaborRoles(newLaborRoles);
      setSalesReps(newSalesReps);

      const lines = [
        `✅ Imported — review the values below, then click Save All to persist them.`,
        ``,
        `• ${sprayCount} spray foam material${sprayCount!==1?"s":""}`,
        `• ${celCount} cellulose material${celCount!==1?"s":""}`,
        `• ${battCount} batt variant${battCount!==1?"s":""}${battSkipped>0?` (${battSkipped} skipped — blank price)`:""}`,
        `• ${rigidCount} rigid foam variant${rigidCount!==1?"s":""}${rigidSkipped>0?` (${rigidSkipped} skipped — blank price or unreadable thickness, re-enter manually on the Batt/Rigid Pricing tab)`:""}`,
        `• ${overheadCount} overhead line item${overheadCount!==1?"s":""}`,
        `• ${consumableCount} consumable/job-cost item${consumableCount!==1?"s":""}`,
        `• ${laborCount} hourly labor role${laborCount!==1?"s":""}`,
      ];
      if(salaryNotes.length) lines.push(``, `Weekly-salary roles (Sales person, Mechanic) don't fit the hourly labor model, so:`, ...salaryNotes.map(s=>`  - ${s}`));
      setImportSummary(lines.join("\n"));
    } catch(err){
      alert("Import error: " + (err.message||JSON.stringify(err)));
    }
    setImporting(false);
  }

  async function recalculateAll() {
    if(!company) return;
    setSaving(true);
    try {
      const THICK_MAP_LOCAL = {"2x4":3.5,"2x6":5.5,"2x8":7.25,"2x10":9.25,"2x12":11.25,"I-joist":11.875};
      function parseRValueLocal(rValue){
        if(!rValue) return 0;
        const m = String(rValue).match(/(\d+(\.\d+)?)/);
        return m ? parseFloat(m[1]) : 0;
      }

      // load all projects for this company
      const { data:projects } = await supabase.from("projects")
        .select("id").eq("company_id", company.id);
      if(!projects?.length){ alert("No projects found"); setSaving(false); return; }

      // load material costs
      const { data:mCosts } = await supabase.from("material_costs")
        .select("*").eq("company_id", company.id);
      const matCostMap = {};
      (mCosts||[]).forEach(m=>{ matCostMap[m.material_name]=m; });

      // load per-thickness/R-value variant pricing
      const { data:mVariants } = await supabase.from("material_variants")
        .select("*").eq("company_id", company.id);
      const variantMap = {};
      (mVariants||[]).forEach(v=>{ variantMap[`${v.material_name}|${v.r_value}`.toLowerCase()]=v; });

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
          const variant = variantMap[`${a.material}|${a.r_value}`.toLowerCase()];
          if(variant){
            materialCost += Number(a.sqft||0) * Number(variant.cost_per_sqft||0) * (1 + Number(variant.markup_pct||0)/100);
            return;
          }
          const mc = matCostMap[a.material];
          if(!mc) return;
          const matNameL = (a.material||"").toLowerCase();
          const rpi = mc.r_per_inch>0 ? Number(mc.r_per_inch)
            : mc.unit==="board_ft" ? (matNameL.includes("closed")?6.8:matNameL.includes("open")?3.75:0)
            : mc.unit==="bag" ? (matNameL.includes("cellulose")||matNameL.includes("blown")?3.5:0)
            : 0;
          const thick = (rpi>0 && a.r_value)
            ? parseRValueLocal(a.r_value)/rpi
            : (THICK_MAP_LOCAL[a.thickness_in]||0);
          let qty = mc.unit==="board_ft" ? Number(a.sqft||0)*thick
                  : mc.unit==="bag" ? Math.ceil((Number(a.sqft||0)*thick)/(mc.coverage_factor||1))
                  : Number(a.sqft||0);
          const cost = qty * Number(mc.cost_per_unit||0);
          materialCost += cost;
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

      // save fuel rate + shop address (used for auto-calculating fuel miles on quotes)
      await supabase.from("cost_settings")
        .delete().eq("company_id", company.id).eq("period","fuel");
      await supabase.from("cost_settings").insert([{
        company_id: company.id,
        category: "Fuel",
        name: "Fuel rate per mile",
        amount: Number(fuelRate||0.67),
        notes: shopAddress||"",
        period: "fuel",
        sort_order: 0,
      }]);

      // save jobs-per-month (overhead allocation basis)
      await supabase.from("cost_settings")
        .delete().eq("company_id", company.id).eq("period","jobs_per_month");
      await supabase.from("cost_settings").insert([{
        company_id: company.id,
        category: "Overhead",
        name: "Jobs per month",
        amount: Number(jobsPerMonth||20),
        period: "jobs_per_month",
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

      // save material costs (legacy — kept for backward compat)
      await supabase.from("material_costs").delete().eq("company_id", company.id);
      if(matCosts.length>0){
        await supabase.from("material_costs").insert(
          matCosts.filter(m=>m.material_name).map(m=>({
            company_id: company.id,
            material_name: m.material_name,
            unit: m.unit,
            cost_per_unit: Number(m.cost_per_unit)||0,
            markup_pct: Number(m.markup_pct)||0,
            coverage_factor: Number(m.coverage_factor)||1,
            r_per_inch: m.r_per_inch!==""&&m.r_per_inch!=null ? Number(m.r_per_inch) : null,
          }))
        );
      }

      // ── save two-layer material system ─────────────────────────────────────
      if(matTypes.length>0){
        // delete existing, then reinsert (simplest approach — no partial updates)
        await supabase.from("material_products").delete().eq("company_id", company.id);
        await supabase.from("material_types").delete().eq("company_id", company.id);
        const validTypes = matTypes.filter(t=>t.name?.trim());
        if(validTypes.length){
          const {data:savedTypes} = await supabase.from("material_types").insert(
            validTypes.map((t,i)=>({
              company_id: company.id, name:t.name.trim(), unit:t.unit||"sqft",
              r_per_inch:t.r_per_inch?Number(t.r_per_inch):null, sort_order:i,
            }))
          ).select();
          if(savedTypes?.length){
            const allProducts = [];
            savedTypes.forEach((savedType,ti)=>{
              const origType = validTypes[ti];
              (origType.products||[]).filter(p=>p.brand?.trim()||p.cost_per_unit>0).forEach((p,pi)=>{
                allProducts.push({
                  company_id: company.id,
                  material_type_id: savedType.id,
                  brand: p.brand||"",
                  description: p.description||"",
                  cost_per_unit: Number(p.cost_per_unit||0),
                  markup_pct: Number(p.markup_pct||20),
                  coverage_factor: Number(p.coverage_factor||1),
                  is_active: !!p.is_active,
                  r_value: p.r_value||null,
                  sort_order: pi,
                });
              });
            });
            if(allProducts.length>0) await supabase.from("material_products").insert(allProducts);
          }
        }
        // Also sync back to material_costs for backward compat with old queries
        const syncCosts = validTypes.map(t=>{
          const active = (t.products||[]).find(p=>p.is_active) || t.products?.[0];
          return {
            company_id:company.id, material_name:t.name.trim(),
            unit:t.unit||"sqft", cost_per_unit:Number(active?.cost_per_unit||0),
            markup_pct:Number(active?.markup_pct||20),
            coverage_factor:Number(active?.coverage_factor||1),
            r_per_inch:t.r_per_inch?Number(t.r_per_inch):null,
          };
        });
        if(syncCosts.length>0){
          await supabase.from("material_costs").delete().eq("company_id",company.id);
          await supabase.from("material_costs").insert(syncCosts);
        }
      }

      // save material variants (per thickness/R-value pricing)
      await supabase.from("material_variants").delete().eq("company_id", company.id);
      if(materialVariants.length>0){
        await supabase.from("material_variants").insert(
          materialVariants.filter(v=>v.material_name).map((v,i)=>({
            company_id: company.id,
            material_name: v.material_name,
            thickness_in: v.thickness_in||"",
            r_value: v.r_value||"",
            facing: v.facing||"",
            cost_per_sqft: Number(v.cost_per_sqft)||0,
            markup_pct: Number(v.markup_pct)||0,
            sort_order: i,
          }))
        );
      }

      // save trade configuration
      await supabase.from("companies")
        .update({ offers_insulation: offersInsulation, offers_hers: offersHers })
        .eq("id", company.id);

      // save configurable lists
      await supabase.from("cost_settings").delete().eq("company_id",company.id)
        .in("period",["list_area_type","list_thick_opt","list_r_val"]);
      const listInserts = [
        ...listAreaTypes.filter(Boolean).map((name,i)=>({company_id:company.id,category:"Lists",name,period:"list_area_type",amount:0,sort_order:i})),
        ...listThickOpts.filter(Boolean).map((name,i)=>({company_id:company.id,category:"Lists",name,period:"list_thick_opt",amount:0,sort_order:i})),
        ...listRVals.filter(Boolean).map((name,i)=>({company_id:company.id,category:"Lists",name,period:"list_r_val",amount:0,sort_order:i})),
      ];
      if(listInserts.length>0) await supabase.from("cost_settings").insert(listInserts);

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
    { id:"materials",  label:"Materials & Pricing" },
    { id:"lists",      label:"Area Types & Lists" },
    { id:"laboroles",  label:"Crew & Margin" },
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
            <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
              <b>Material Types</b> (Layer 1) are what appear in the area dropdown — e.g. "Fiberglass Batt".
              Under each type, add the <b>brands/products</b> (Layer 2) you actually buy from suppliers.
              Mark one as <span style={{color:"#059669",fontWeight:700}}>Active</span> — that product's
              price is used for estimates. Switch active products when you change suppliers without
              touching any area cards.
            </div>

            <label style={{display:"block",marginBottom:12}}>
              <input type="file" accept=".xlsx,.xls" style={{display:"none"}}
                onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImportWorkbook(f); e.target.value=""; }} />
              <span style={{...BtnG,display:"inline-flex",alignItems:"center",gap:6,
                  cursor:importing?"default":"pointer",opacity:importing?0.6:1}}
                onClick={e=>{ if(importing) e.preventDefault(); }}>
                {importing?"Importing…":"📥 Import Pricing Worksheet (.xlsx)"}
              </span>
            </label>

            {importSummary && (
              <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,
                  padding:"12px 14px",marginBottom:12,fontSize:12,color:"#166534",whiteSpace:"pre-line"}}>
                {importSummary}
              </div>
            )}

            {matTypes.map((t,ti)=>{
              const updateType=(field,val)=>setMatTypes(p=>p.map((x,i)=>i===ti?{...x,[field]:val}:x));
              const updateProduct=(pi,field,val)=>setMatTypes(p=>p.map((x,i)=>i===ti?{...x,products:x.products.map((pp,j)=>j===pi?{...pp,[field]:val}:pp)}:x));
              const removeProduct=(pi)=>setMatTypes(p=>p.map((x,i)=>i===ti?{...x,products:x.products.filter((_,j)=>j!==pi)}:x));
              const setActive=(pi)=>setMatTypes(p=>p.map((x,i)=>{
                if(i!==ti) return x;
                const clickedR = x.products[pi]?.r_value||"";
                // Turning ON: deactivate others in the same R-value group first
                // Turning OFF: just toggle
                const isCurrentlyActive = x.products[pi]?.is_active;
                return {...x, products:x.products.map((pp,j)=>{
                  if(j===pi) return {...pp, is_active:!pp.is_active};
                  // If turning ON, deactivate others with the same R-value (or same "no R-value" group)
                  if(!isCurrentlyActive){
                    const sameGroup = (pp.r_value||"")===(clickedR);
                    if(sameGroup) return {...pp, is_active:false};
                  }
                  return pp;
                })};
              }));
              const addProduct=()=>setMatTypes(p=>p.map((x,i)=>i===ti?{...x,products:[...x.products,{id:null,brand:"",description:"",cost_per_unit:0,markup_pct:20,coverage_factor:1,is_active:false,r_value:null}]}:x));
              const activeProduct=(t.products||[]).find(p=>p.is_active);
              const activeCost = activeProduct ? Number(activeProduct.cost_per_unit||0) : 0;
              return (
                <div key={ti} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:12,overflow:"hidden"}}>
                  {/* Type header */}
                  <div style={{background:"#f8fafc",borderBottom:`1px solid ${C.border}`,padding:"10px 12px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <input placeholder="Type name (e.g. Fiberglass Batt)" value={t.name||""}
                      onChange={e=>updateType("name",e.target.value)}
                      style={{...I,height:32,fontSize:13,fontWeight:700,flex:2,minWidth:140}} />
                    <select value={t.unit||"sqft"} onChange={e=>updateType("unit",e.target.value)}
                      style={{...I,height:32,fontSize:12,flex:1,minWidth:110}}>
                      <option value="sqft">sqft</option>
                      <option value="board_ft">board ft (spray foam)</option>
                      <option value="bag">bag (cellulose)</option>
                    </select>
                    {(t.unit==="board_ft"||t.unit==="bag")&&(
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <input type="number" placeholder="R/in" value={t.r_per_inch||""}
                          onChange={e=>updateType("r_per_inch",e.target.value)}
                          title={t.unit==="board_ft"
                            ?"R-value per inch — thickness sprayed = R-value ÷ R/in (closed cell≈6.8, open cell≈3.75)"
                            :"R-value per inch — depth blown = R-value ÷ R/in (cellulose≈3.5, blown fiberglass≈2.2)"}
                          style={{...I,height:32,fontSize:12,width:60,textAlign:"right"}} />
                        <span style={{fontSize:11,color:C.muted}}>R/in</span>
                      </div>
                    )}
                    {activeCost>0&&<div style={{fontSize:12,color:C.muted,fontWeight:600,marginLeft:"auto"}}>Cost: ${activeCost.toFixed(2)}/{t.unit==="board_ft"?"bf":t.unit==="bag"?"bag":"sqft"}</div>}
                    <button onClick={()=>setMatTypes(p=>p.filter((_,i)=>i!==ti))}
                      style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:18,padding:"0 4px",flexShrink:0}}>✕</button>
                  </div>

                  {/* Products (Layer 2) */}
                  <div style={{padding:"8px 12px"}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>
                      Brands / Supplier Products
                    </div>
                    {(t.products||[]).length===0&&(
                      <div style={{fontSize:11,color:C.faint,fontStyle:"italic",marginBottom:6}}>
                        No products yet — add at least one brand/product to price this material.
                      </div>
                    )}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 55px 80px"+(t.unit==="bag"?" 70px":"")+" 90px 24px",
                        gap:5,padding:"0 8px 4px",fontSize:9,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.3}}>
                      <span>Brand</span><span>SKU / Description</span><span>R-Val</span>
                      <span>Cost</span>{t.unit==="bag"&&<span>Coverage</span>}<span></span><span></span>
                    </div>
                    {(t.products||[]).map((p,pi)=>(
                        <div key={pi} style={{display:"grid",gridTemplateColumns:"1fr 1fr 55px 80px"+(t.unit==="bag"?" 70px":"")+" 90px 24px",
                            gap:5,padding:"6px 8px",marginBottom:4,borderRadius:6,
                            background:p.is_active?"#f0fdf4":"#fafbfc",
                            border:`1px solid ${p.is_active?"#86efac":C.border}`,
                            alignItems:"center"}}>
                          <input placeholder="Brand" value={p.brand||""} onChange={e=>updateProduct(pi,"brand",e.target.value)} style={{...I,height:26,fontSize:11}} />
                          <input placeholder="SKU / Description" value={p.description||""} onChange={e=>updateProduct(pi,"description",e.target.value)} style={{...I,height:26,fontSize:11}} />
                          <input placeholder="R-val" value={p.r_value||""} onChange={e=>updateProduct(pi,"r_value",e.target.value)} title="Optional: match only areas with this R-value. Leave blank as fallback." style={{...I,height:26,fontSize:11,textAlign:"center"}} />
                          <div style={{display:"flex",alignItems:"center",gap:2}}>
                            <span style={{fontSize:10,color:C.muted}}>$</span>
                            <input type="number" value={p.cost_per_unit} onChange={e=>updateProduct(pi,"cost_per_unit",e.target.value)} style={{...I,height:26,fontSize:11,textAlign:"right"}} />
                          </div>
                          {t.unit==="bag"&&(
                            <div style={{display:"flex",alignItems:"center",gap:2}}>
                              <input type="number" value={p.coverage_factor||1} title="sqft·in one bag covers" onChange={e=>updateProduct(pi,"coverage_factor",e.target.value)} style={{...I,height:26,fontSize:11,textAlign:"right"}} />
                              <span style={{fontSize:9,color:C.muted}}>ft²·in</span>
                            </div>
                          )}
                          <button onClick={()=>setActive(pi)} style={{border:"none",borderRadius:5,height:26,fontSize:10,fontWeight:700,cursor:"pointer",background:p.is_active?"#059669":"#e5e7eb",color:p.is_active?"white":C.muted,whiteSpace:"nowrap"}}>
                            {p.is_active?"✓ Using":"Use this"}
                          </button>
                          <button onClick={()=>removeProduct(pi)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,padding:0}}>✕</button>
                        </div>
                    ))}
                    <button onClick={addProduct}
                      style={{border:`1px dashed ${C.border}`,background:"none",color:C.muted,
                        padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:11,marginTop:2}}>
                      + Add Brand / Product
                    </button>
                  </div>
                </div>
              );
            })}

            <button onClick={()=>setMatTypes(p=>[...p,{id:null,name:"",unit:"sqft",r_per_inch:null,products:[{id:null,brand:"",description:"",cost_per_unit:0,markup_pct:20,coverage_factor:1,is_active:true,r_value:null}]}])}
              style={{...BtnG,width:"100%",height:38,fontSize:13,marginBottom:8}}>
              + Add Material Type
            </button>
          </div>
        )}

        {/* ── BATT / RIGID FOAM VARIANT PRICING TAB ── */}
        {tab==="variants" && (
          <div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
              Batts and rigid foam are priced per R-value — an R-11 batt
              costs differently than an R-38 batt. Add one row per product
              you stock. <b>Pricing matches by Material + R-Value only</b>,
              not thickness — the same R-value batt costs the same
              regardless of which stud cavity it ends up in on the job.
              Thickness is kept here just for your own reference. When an
              estimate's area matches a Material + R-Value below, this
              price is used instead of the flat Materials tab price.
            </div>

            <div style={{ background:C.white, borderRadius:10,
                border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:10 }}>
              <div style={{ display:"grid",
                  gridTemplateColumns:"1.6fr 80px 70px 80px 70px 60px 80px 28px",
                  gap:5, padding:"8px 12px", background:"#f8fafc",
                  borderBottom:`1px solid ${C.border}`,
                  fontSize:9, fontWeight:700, color:C.muted,
                  textTransform:"uppercase", letterSpacing:0.4 }}>
                <span>Material</span>
                <span>Thickness</span>
                <span>R-Value</span>
                <span>Facing</span>
                <span>$/sqft</span>
                <span>Mkup</span>
                <span>Sell $/sqft</span>
                <span></span>
              </div>

              {materialVariants.length===0 && (
                <div style={{padding:"16px 12px",fontSize:12,color:C.faint,textAlign:"center"}}>
                  No variant pricing yet — add rows below or import a pricing worksheet from the Materials tab.
                </div>
              )}

              {materialVariants.map((v, i)=>{
                const sellPrice = Number(v.cost_per_sqft||0) * (1 + Number(v.markup_pct||0)/100);
                return (
                  <div key={i} style={{ display:"grid",
                      gridTemplateColumns:"1.6fr 80px 70px 80px 70px 60px 80px 28px",
                      gap:5, padding:"8px 12px",
                      borderBottom: i<materialVariants.length-1?`1px solid ${C.border}`:"none",
                      alignItems:"center", background:i%2===0?C.white:"#fafbfc" }}>
                    <input placeholder="e.g. Fiberglass Batt" value={v.material_name}
                      onChange={e=>updateVariant(i,"material_name",e.target.value)}
                      style={{...I, height:28, fontSize:11}} />
                    <input placeholder="2x6" value={v.thickness_in}
                      onChange={e=>updateVariant(i,"thickness_in",e.target.value)}
                      style={{...I, height:28, fontSize:11}} />
                    <input placeholder="R-19" value={v.r_value}
                      onChange={e=>updateVariant(i,"r_value",e.target.value)}
                      style={{...I, height:28, fontSize:11}} />
                    <select value={v.facing||""} onChange={e=>updateVariant(i,"facing",e.target.value)}
                      style={{...I, height:28, fontSize:11, padding:"0 4px"}}>
                      <option value="">—</option>
                      <option value="Faced">Faced</option>
                      <option value="Unfaced">Unfaced</option>
                    </select>
                    <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                      <span style={{ fontSize:11, color:C.muted }}>$</span>
                      <input type="number" value={v.cost_per_sqft}
                        onChange={e=>updateVariant(i,"cost_per_sqft",e.target.value)}
                        style={{...I, height:28, fontSize:11, textAlign:"right"}} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:1 }}>
                      <input type="number" value={v.markup_pct}
                        onChange={e=>updateVariant(i,"markup_pct",e.target.value)}
                        style={{...I, height:28, fontSize:11, textAlign:"right"}} />
                      <span style={{ fontSize:11, color:C.muted }}>%</span>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:C.green, textAlign:"right" }}>
                      ${sellPrice.toFixed(2)}
                    </div>
                    <button onClick={()=>removeVariant(i)}
                      style={{...Btn, padding:"0 6px", height:26, color:C.faint, fontSize:13}}>✕</button>
                  </div>
                );
              })}
            </div>

            <button onClick={addVariant}
              style={{...BtnG, width:"100%", height:36, fontSize:13}}>
              + Add Variant
            </button>
          </div>
        )}

        {/* ── LABOR & MARGIN TAB ── */}
        {/* ── AREA TYPES, THICKNESS & R-VALUES ── */}
        {tab==="lists" && (
          <div>
            <div style={{fontSize:12,color:C.muted,marginBottom:16,lineHeight:1.6}}>
              These lists appear in the estimate and HERS field measurement dropdowns.
              <b> Drag ☰ to reorder</b>, or use ↑↓ buttons. Changes take effect after saving.
            </div>

            {[
              {id:"area",  label:"Area Types", description:"Location/type of insulation areas", list:listAreaTypes, setList:setListAreaTypes, newVal:newAreaType, setNew:setNewAreaType, placeholder:"e.g. Cathedral Ceiling"},
              {id:"thick", label:"Thickness / Stud Size", description:"Stud cavity and joist sizes", list:listThickOpts, setList:setListThickOpts, newVal:newThickOpt, setNew:setNewThickOpt, placeholder:"e.g. I-joist 11in"},
              {id:"rval",  label:"R-Values", description:"R-value options for the area dropdown", list:listRVals, setList:setListRVals, newVal:newRVal, setNew:setNewRVal, placeholder:"e.g. R-25"},
            ].map(({id,label,description,list,setList,newVal,setNew,placeholder})=>(
              <div key={id} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:16,overflow:"hidden"}}>
                <div style={{background:"#f8fafc",borderBottom:`1px solid ${C.border}`,padding:"10px 14px"}}>
                  <div style={{fontWeight:700,fontSize:14,color:C.ink}}>{label}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{description}</div>
                </div>
                <div style={{padding:"10px 14px"}}>
                  <DragDropContext onDragEnd={result=>{
                    if(!result.destination) return;
                    const from=result.source.index, to=result.destination.index;
                    if(from===to) return;
                    setList(prev=>{
                      const arr=[...prev];
                      const [moved]=arr.splice(from,1);
                      arr.splice(to,0,moved);
                      return arr;
                    });
                  }}>
                    <Droppable droppableId={id}>
                      {provided=>(
                        <div ref={provided.innerRef} {...provided.droppableProps}
                          style={{marginBottom:10}}>
                          {list.map((item,i)=>(
                            <Draggable key={item+i} draggableId={id+i} index={i}>
                              {(prov,snap)=>(
                                <div ref={prov.innerRef} {...prov.draggableProps}
                                  style={{...prov.draggableProps.style,
                                    display:"flex",alignItems:"center",gap:6,
                                    background:snap.isDragging?"#e0f2fe":"#f1f5f9",
                                    border:`1px solid ${snap.isDragging?"#38bdf8":C.border}`,
                                    borderRadius:6,padding:"6px 8px",marginBottom:4,
                                    boxShadow:snap.isDragging?"0 4px 12px rgba(0,0,0,0.15)":"none"}}>
                                  {/* drag handle */}
                                  <span {...prov.dragHandleProps}
                                    style={{color:C.faint,cursor:"grab",fontSize:14,padding:"0 2px",userSelect:"none",touchAction:"none"}}>
                                    ☰
                                  </span>
                                  <span style={{flex:1,fontSize:12,color:C.ink}}>{item}</span>
                                  {/* up/down for mobile */}
                                  <button onClick={()=>setList(p=>{if(i===0)return p;const a=[...p];[a[i-1],a[i]]=[a[i],a[i-1]];return a;})}
                                    disabled={i===0}
                                    style={{border:"none",background:"none",color:i===0?C.chip:C.muted,cursor:i===0?"default":"pointer",fontSize:13,padding:"0 2px",lineHeight:1}}>↑</button>
                                  <button onClick={()=>setList(p=>{if(i===p.length-1)return p;const a=[...p];[a[i],a[i+1]]=[a[i+1],a[i]];return a;})}
                                    disabled={i===list.length-1}
                                    style={{border:"none",background:"none",color:i===list.length-1?C.chip:C.muted,cursor:i===list.length-1?"default":"pointer",fontSize:13,padding:"0 2px",lineHeight:1}}>↓</button>
                                  <button onClick={()=>setList(p=>p.filter((_,j)=>j!==i))}
                                    style={{border:"none",background:"none",color:"#ef4444",cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1}}>✕</button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                  <div style={{display:"flex",gap:6}}>
                    <input placeholder={placeholder} value={newVal}
                      onChange={e=>setNew(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter"&&newVal.trim()&&!list.includes(newVal.trim())){ setList(p=>[newVal.trim(),...p]); setNew(""); } }}
                      style={{...I,flex:1,fontSize:12}} />
                    <button onClick={()=>{ if(newVal.trim()&&!list.includes(newVal.trim())){ setList(p=>[newVal.trim(),...p]); setNew(""); } }}
                      style={{...BtnG,height:32,padding:"0 14px",fontSize:12}}>
                      + Add to top
                    </button>
                  </div>
                  <div style={{fontSize:10,color:C.faint,marginTop:4}}>New items are added to the top. Drag ☰ or use ↑↓ to reorder.</div>
                </div>
              </div>
            ))}
          </div>
        )}

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
              Set your shop/office address so the Quote screen can auto-calculate
              the driving distance to each job site and fill in fuel miles automatically.
            </div>
            <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"16px",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Shop / Office Address</div>
              <input placeholder="e.g. 123 Main St, Millis, MA 02054"
                value={shopAddress} onChange={e=>setShopAddress(e.target.value)}
                style={{...I,width:"100%",fontSize:13,marginBottom:4}} />
              <div style={{fontSize:11,color:C.faint}}>
                Used to auto-calculate one-way miles to the job when you open the Quote screen.
              </div>
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
            {/* Profit Margin — moved here from the removed Labor & Margin tab */}
            <div style={{ background:C.white, borderRadius:10,
                border:`1px solid ${C.border}`, padding:"16px", marginBottom:12 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>
                Profit Margin
              </div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
                Applied once to total job cost (materials + labor + overhead + consumables + fuel) on the Quote screen.
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
                Example: total cost $5,000 → final price ${fmt(5000*(1+margin/100))}
              </div>
            </div>

            <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
              Define your crew roles and hourly rates. These auto-fill into the Quote screen for every job.
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
