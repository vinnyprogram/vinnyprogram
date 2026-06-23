import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function fmt(n){ return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmt0(n){ return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0}); }

const C = {
  bg:"#f4f5f7", white:"#fff", ink:"#0f172a", muted:"#64748b",
  border:"#e2e8f0", green:"#059669", faint:"#94a3b8",
};
const I = {
  height:32, fontSize:13, borderRadius:6, border:`1px solid ${C.border}`,
  background:C.white, padding:"0 8px", boxSizing:"border-box",
  color:C.ink, outline:"none",
};

export default function QuotePricing() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject]   = useState(null);
  const [quote, setQuote]       = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const autoSaveTimer = useRef(null);

  // live-calculated costs (not stale from saved quote)
  const [liveMaterialCost, setLiveMaterialCost] = useState(null);
  const [liveOverheadCost, setLiveOverheadCost] = useState(null);

  // per-job material brand selections
  const [matTypes, setMatTypes]     = useState([]);
  const [matProducts, setMatProducts] = useState([]);
  const [qmsMap, setQmsMap]         = useState({}); // area_id → product_id override

  // ── Switch the brand for one area on this job ──────────────────────────────
  async function setAreaProduct(areaId, productId, line, product){
    // Update UI immediately
    const updatedLines = areaCostLines.map(l=>{
      if(l.area_id!==areaId) return l;
      if(!product||!l.matType) return l;
      const unit=l.matType.unit||"sqft";
      const rpi=l.matType.r_per_inch?Number(l.matType.r_per_inch):unit==="board_ft"?(l.material.toLowerCase().includes("closed")?6.8:l.material.toLowerCase().includes("open")?3.75:0):0;
      const THICK_MAP={"2x4":3.5,"2x6":5.5,"2x8":7.25,"2x10":9.25,"2x12":11.25,"I-joist":11.875};
      const parseR=v=>{const m=String(v||"").match(/(\d+(\.\d+)?)/);return m?parseFloat(m[1]):0;};
      const thick=(unit==="board_ft"&&rpi>0&&l.r_value)?parseR(l.r_value)/rpi:(THICK_MAP[l.thickness_in]||0);
      const cov=Number(product.coverage_factor||1);
      const qty=unit==="board_ft"?l.sqft*thick:unit==="bag"?Math.ceil(l.sqft*thick/cov):l.sqft;
      const sell=Number(product.cost_per_unit||0)*(1+Number(product.markup_pct||20)/100);
      const lineTotal=Math.round(qty*sell*100)/100;
      let pricingNote=unit==="board_ft"?`${thick.toFixed(2)}" (${rpi} R/in) × $${product.cost_per_unit}/bf`:unit==="bag"?`${Math.ceil(l.sqft*thick/cov)} bags × $${product.cost_per_unit}`:`$${product.cost_per_unit}/sqft`;
      return {...l,activeProductId:productId,lineTotal,pricingNote,effectivePerSqft:l.sqft>0?lineTotal/l.sqft:0};
    });
    setAreaCostLines(updatedLines);
    setLiveMaterialCost(Math.round(updatedLines.reduce((s,l)=>s+l.lineTotal,0)*100)/100);
    setQmsMap(prev=>({...prev,[areaId]:productId}));
    // Persist
    try{
      const updated = updatedLines.find(l=>l.area_id===areaId);
      await supabase.from("quote_material_selections").upsert({
        project_id:projectId, area_id:areaId, material_coverage_id:productId,
        qty:updated?.qty||0, unit_price:updated?.effectivePerSqft||0, line_total:updated?.lineTotal||0,
      },{onConflict:"project_id,area_id"});
    }catch(e){ console.warn("QMS save error:",e.message); }
  }

  // detailed breakdown for display
  const [areaCostLines, setAreaCostLines] = useState([]);
  const [overheadLines, setOverheadLines] = useState([]);
  const [jobsPerMonth, setJobsPerMonth] = useState(20);
  const [laborRoles, setLaborRoles] = useState([]);
  const [allRoles, setAllRoles]     = useState([]); // full list from Settings for the picker
  const [showRolePicker, setShowRolePicker] = useState(false);

  // consumables from settings — adjustable per job
  const [consumables, setConsumables] = useState([]);

  // fuel
  const [jobMiles, setJobMiles] = useState("");
  const [fuelRate, setFuelRate] = useState(0.67);
  const [calcingMiles, setCalcingMiles] = useState(false);

  // sales rep
  const [salesReps, setSalesReps]   = useState([]);
  const [selectedRep, setSelectedRep] = useState("");

  // extra charges
  const [extras, setExtras] = useState([{ desc:"", amount:"" }]);

  // discount
  const [discount, setDiscount] = useState("");

  useEffect(()=>{ load(); },[projectId]);

  async function load() {
    setLoading(true);

    // load project
    const { data:proj } = await supabase.from("projects")
      .select("*").eq("id", projectId).maybeSingle();
    setProject(proj);

    // load quote and restore previously saved costing-sheet values
    const { data:q } = await supabase.from("quotes")
      .select("*").eq("project_id", projectId).maybeSingle();
    setQuote(q);
    if(q?.job_miles)       setJobMiles(String(q.job_miles));
    if(q?.sales_rep_id)    setSelectedRep(q.sales_rep_id);
    if(q?.discount_amount) setDiscount(String(q.discount_amount));

    // load customer
    if(proj?.lead_id){
      const { data:cust } = await supabase.from("customers")
        .select("*").eq("id", proj.lead_id).maybeSingle();
      setCustomer(cust);
    }

    // load company settings
    const { data:{user} } = await supabase.auth.getUser();
    if(!user){ setLoading(false); return; }

    const { data:cd } = await supabase.from("companies")
      .select("id").eq("user_id",user.id).maybeSingle();
    if(!cd){ setLoading(false); return; }

    // load everything in parallel
    const [
      { data:roles },
      { data:fuel },
      { data:reps },
      { data:cons },
      { data:areas },
      { data:floorRows },
      { data:matCosts },
      { data:variants },
      { data:overheadRows },
      { data:jpmRow },
      { data:types },
      { data:products },
      { data:qmsRows },
    ] = await Promise.all([
      supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","labor_role").order("sort_order"),
      supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","fuel").maybeSingle(),
      supabase.from("sales_reps").select("*").eq("company_id",cd.id).eq("active",true),
      supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","job_consumable").order("sort_order"),
      supabase.from("areas").select("*").eq("project_id",projectId).order("order_index"),
      supabase.from("floors").select("*").eq("project_id",projectId).order("order_index"),
      supabase.from("material_costs").select("*").eq("company_id",cd.id),
      supabase.from("material_variants").select("*").eq("company_id",cd.id),
      supabase.from("cost_settings").select("*").eq("company_id",cd.id)
        .not("period","eq","labor_role").not("period","eq","job_consumable")
        .not("period","eq","fuel").not("period","eq","jobs_per_month"),
      supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","jobs_per_month").maybeSingle(),
      supabase.from("material_types").select("*").eq("company_id",cd.id).order("sort_order"),
      supabase.from("material_products").select("*").eq("company_id",cd.id).order("sort_order"),
      supabase.from("quote_material_selections").select("*").eq("project_id",projectId),
    ]);

    // store for brand-switching UI
    setMatTypes(types||[]);
    setMatProducts(products||[]);

    // build per-area overrides map: area_id → product_id
    const savedQms = {};
    (qmsRows||[]).forEach(s=>{ savedQms[s.area_id]=s.material_coverage_id; });
    setQmsMap(savedQms);

    // build floor name lookup
    const floorNameMap = {};
    (floorRows||[]).forEach(f=>{ floorNameMap[f.id]=f.name||f.label||""; });

    // crew — store the full Settings list for the picker, then either
    // restore the previously saved job-specific selection or use Settings as default
    if(roles?.length){
      const validRoles = roles.filter(r=>r.name&&r.name.trim());
      const settingsRoles = validRoles.map(r=>({
        role:r.name, rate:Number(r.amount||0),
        people:"1", days:"1", hours:"8", extra:"", fromSettings:true,
      }));
      setAllRoles(settingsRoles);
      // If the quote has a previously saved crew selection, restore that;
      // otherwise default to the full Settings list
      if(q?.labor_roles_json){
        try { setLaborRoles(JSON.parse(q.labor_roles_json)); }
        catch { setLaborRoles(settingsRoles); }
      } else {
        setLaborRoles(settingsRoles);
      }
    }

    // fuel rate + shop address
    const fRate = Number(fuel?.amount||0.67);
    setFuelRate(fRate);
    const shopAddr = fuel?.notes||"";

    // sales reps
    if(reps?.length) setSalesReps(reps);

    // consumables — all items from Settings, qty defaults to 1
    if(cons?.length){
      setConsumables(cons.map(c=>({ name:c.name, amount:Number(c.amount||0), qty:"1" })));
    }

    // ── Helpers for price lookup ──────────────────────────────────────────────
    const THICK_MAP = {"2x4":3.5,"2x6":5.5,"2x8":7.25,"2x10":9.25,"2x12":11.25,"I-joist":11.875};
    const matCostMap = {};
    (matCosts||[]).forEach(m=>{ matCostMap[m.material_name]=m; });
    // Build type/product maps — material_types takes priority over material_costs
    const typesByName = {};
    (types||[]).forEach(t=>{ typesByName[t.name]=t; });

    const variantMap = {};
    (variants||[]).forEach(v=>{ variantMap[`${v.material_name}|${v.r_value||""}`.toLowerCase()]=v; });
    function parseR(rValue){ const m=String(rValue||"").match(/(\d+(\.\d+)?)/); return m?parseFloat(m[1]):0; }

    // ── Compute pricing for one area given a specific product (or fallback) ──
    function computeAreaLine(a, product, matType){
      let lineTotal=0, pricingNote="", effectivePerSqft=0, qty=0;
      if(a.price_override && Number(a.price_override)>0){
        effectivePerSqft=Number(a.price_override);
        lineTotal=(a.sqft||0)*effectivePerSqft;
        pricingNote=`$${Number(a.price_override).toFixed(2)}/sqft (custom)`;
        qty=a.sqft||0;
      } else if(product && matType){
        // Two-layer system
        const unit = matType.unit||"sqft";
        const rpi = matType.r_per_inch ? Number(matType.r_per_inch)
          : unit==="board_ft" ? (matType.name.toLowerCase().includes("closed")?6.8:matType.name.toLowerCase().includes("open")?3.75:0) : 0;
        const thick = (unit==="board_ft"&&rpi>0&&a.r_value) ? parseR(a.r_value)/rpi : (THICK_MAP[a.thickness_in]||0);
        const covFactor = Number(product.coverage_factor||1);
        qty = unit==="board_ft"?(a.sqft||0)*thick : unit==="bag"?Math.ceil((a.sqft||0)*thick/covFactor):(a.sqft||0);
        const sell = Number(product.cost_per_unit||0)*(1+Number(product.markup_pct||20)/100);
        lineTotal = qty*sell;
        if(unit==="board_ft") pricingNote=`${thick.toFixed(2)}" (${rpi} R/in) × $${product.cost_per_unit}/bf`;
        else if(unit==="bag") pricingNote=`${Math.ceil((a.sqft||0)*thick/covFactor)} bags × $${product.cost_per_unit}`;
        else pricingNote=`$${product.cost_per_unit}/sqft`;
        effectivePerSqft=(a.sqft||0)>0?lineTotal/(a.sqft||0):0;
      } else {
        // Legacy fallback: material_costs
        const vKey=`${a.material||""}|${a.r_value||""}`.toLowerCase();
        const variant=variantMap[vKey];
        if(variant){
          effectivePerSqft=Number(variant.cost_per_sqft||0)*(1+Number(variant.markup_pct||0)/100);
          lineTotal=(a.sqft||0)*effectivePerSqft; qty=a.sqft||0;
          pricingNote=`$${effectivePerSqft.toFixed(3)}/sqft`;
        } else {
          const mc=matCostMap[a.material];
          if(mc){
            const matNameL=(a.material||"").toLowerCase();
            const rpi=mc.r_per_inch>0?Number(mc.r_per_inch):mc.unit==="board_ft"?(matNameL.includes("closed")?6.8:matNameL.includes("open")?3.75:0):0;
            const thick=(mc.unit==="board_ft"&&rpi>0&&a.r_value)?parseR(a.r_value)/rpi:(THICK_MAP[a.thickness_in]||0);
            qty=mc.unit==="board_ft"?(a.sqft||0)*thick:mc.unit==="bag"?Math.ceil((a.sqft||0)*thick/(mc.coverage_factor||1)):(a.sqft||0);
            lineTotal=qty*Number(mc.cost_per_unit||0)*(1+Number(mc.markup_pct||0)/100);
            if(mc.unit==="board_ft") pricingNote=`${thick.toFixed(2)}" (${rpi} R/in) × $${mc.cost_per_unit}/bf`;
            else if(mc.unit==="bag") pricingNote=`${Math.ceil((a.sqft||0)*thick/(mc.coverage_factor||1))} bags × $${mc.cost_per_unit}`;
            else pricingNote=`$${mc.cost_per_unit}/sqft`;
            effectivePerSqft=(a.sqft||0)>0?lineTotal/(a.sqft||0):0;
          } else { pricingNote="⚠️ no price in Settings"; }
        }
      }
      return {lineTotal:Math.round(lineTotal*100)/100,effectivePerSqft:Math.round(effectivePerSqft*1000)/1000,pricingNote,qty:Math.round(qty)};
    }

    // ── Live material cost recalculation using qms overrides ──────────────────
    let matTotal = 0;
    const lines = [];
    const seenOverride = new Set();
    (areas||[]).filter(a=>a.area_type&&a.sqft>0).forEach(a=>{
      const floorName = floorNameMap[a.floor_id]||"";
      if(a.price_override&&Number(a.price_override)>0&&seenOverride.has(a.id)) return;
      if(a.price_override&&Number(a.price_override)>0) seenOverride.add(a.id);

      // Determine which product to use: job-specific override → global active → legacy
      const matType = typesByName[a.material];
      let usedProduct = null;
      const availProds = matType ? (products||[]).filter(p=>p.material_type_id===matType.id) : [];
      if(savedQms[a.id]){
        usedProduct = availProds.find(p=>p.id===savedQms[a.id]) || availProds.find(p=>p.is_active) || availProds[0];
      } else {
        usedProduct = availProds.find(p=>p.is_active) || availProds[0];
      }
      const lineData = computeAreaLine(a, usedProduct, matType);
      matTotal += lineData.lineTotal;
      lines.push({
        area_id: a.id,
        floor: floorName,
        area_type: a.area_type||"",
        material: a.material||"",
        r_value: a.r_value||"",
        sqft: a.sqft||0,
        ...lineData,
        // For brand-switching UI
        availProds,
        activeProductId: usedProduct?.id||null,
        matType,
      });
    });
    setAreaCostLines(lines);
    setLiveMaterialCost(Math.round(matTotal*100)/100);

    // ── Live overhead per job ─────────────────────────────────────────────
    const jpm = jpmRow ? Number(jpmRow.amount||20) : 20;
    setJobsPerMonth(jpm);
    const ohLines = (overheadRows||[]).filter(c=>Number(c.amount||0)>0).map(c=>({
      name: c.name,
      category: c.category||"Overhead",
      monthlyAmt: Number(c.amount||0),
      perJob: jpm>0 ? Number(c.amount||0)/jpm : 0,
    }));
    setOverheadLines(ohLines);
    const totalMonthlyOH = ohLines.reduce((s,c)=>s+c.monthlyAmt,0);
    const ohPerJob = jpm>0 ? totalMonthlyOH/jpm : 0;
    setLiveOverheadCost(Math.round(ohPerJob*100)/100);

    // ── Fuel distance auto-calculate ──────────────────────────────────────
    // Google's Distance Matrix JSON API is blocked by CORS in browsers.
    // Use the Maps JavaScript SDK's DistanceMatrixService instead.
    const jobAddress = proj?.address || "";
    if(shopAddr && jobAddress && import.meta.env.VITE_GOOGLE_PLACES_KEY && !q?.job_miles){
      setCalcingMiles(true);
      try {
        // Dynamically load the Maps JS SDK if not already loaded
        await new Promise((resolve, reject)=>{
          if(window.google?.maps) return resolve();
          const s = document.createElement("script");
          s.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_PLACES_KEY}&libraries=places`;
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
        const svc = new window.google.maps.DistanceMatrixService();
        svc.getDistanceMatrix({
          origins:[shopAddr], destinations:[jobAddress],
          travelMode:window.google.maps.TravelMode.DRIVING,
          unitSystem:window.google.maps.UnitSystem.IMPERIAL,
        },(res,status)=>{
          if(status==="OK"){
            const el = res?.rows?.[0]?.elements?.[0];
            if(el?.status==="OK" && el?.distance?.value){
              const miles = Math.round(el.distance.value / 1609.34);
              setJobMiles(String(miles));
            }
          }
          setCalcingMiles(false);
        });
      } catch(e){
        console.warn("Distance Matrix error:", e.message);
        setCalcingMiles(false);
      }
    }

    setLoading(false);
  }

  // ── Calculations ────────────────────────────────────────────────────────────
  // Use live-recalculated values (from current Settings pricing) with
  // fallback to saved quote values if recalculation hasn't finished yet.
  const materialCost = liveMaterialCost ?? Number(quote?.material_cost||0);
  const overheadCost = liveOverheadCost ?? Number(quote?.overhead_cost||0);
  const baseCost = materialCost + overheadCost;

  const laborCost = laborRoles.reduce((s,r)=>
    s + Number(r.hours||8)*Number(r.days||1)*Number(r.people||1)*Number(r.rate||0)
    + Number(r.extra||0)*Number(r.people||1),
  0);

  const fuelCost = Number(jobMiles||0)*2*fuelRate;

  const consumablesCost = consumables.reduce((s,c)=>s+Number(c.amount||0)*Number(c.qty||1),0);

  const extraTotal = extras.reduce((s,e)=>s+Number(e.amount||0),0);

  const discountAmt = Number(discount||0);

  const totalCost = baseCost + laborCost + fuelCost + consumablesCost;

  const rep = salesReps.find(r=>r.id===selectedRep);
  const commissionPct = rep ? Number(rep.commission_pct||0) : 0;

  const priceBeforeDiscount = totalCost * (1 + (Number(quote?.profit_margin_pct||30)/100));
  const priceWithExtras = priceBeforeDiscount + extraTotal;
  const commission = priceWithExtras * commissionPct/100;
  const finalPrice = priceWithExtras + commission - discountAmt;

  const profit = finalPrice - totalCost - commission;
  const margin = finalPrice>0 ? (profit/finalPrice*100).toFixed(1) : 0;

  // ── Core save function — called both by auto-save and by the Generate button ──
  const saveQuote = useCallback(async ({navigate:doNavigate=false}={})=>{
    if(!projectId) return;
    const matCst = liveMaterialCost ?? Number(quote?.material_cost||0);
    const ohCst  = liveOverheadCost ?? Number(quote?.overhead_cost||0);
    const basC   = matCst + ohCst;
    const labC   = laborRoles.reduce((s,r)=>s+Number(r.hours||8)*Number(r.days||1)*Number(r.people||1)*Number(r.rate||0)+Number(r.extra||0)*Number(r.people||1),0);
    const fuelC  = Number(jobMiles||0)*2*fuelRate;
    const consC  = consumables.reduce((s,c)=>s+Number(c.amount||0)*Number(c.qty||1),0);
    const extT   = extras.reduce((s,e)=>s+Number(e.amount||0),0);
    const discA  = Number(discount||0);
    const totC   = basC + labC + fuelC + consC;
    const repRec = salesReps.find(r=>r.id===selectedRep);
    const commPct= repRec ? Number(repRec.commission_pct||0) : 0;
    const preBD  = totC * (1 + (Number(quote?.profit_margin_pct||30)/100));
    const comm   = (preBD + extT) * commPct/100;
    const finP   = preBD + extT + comm - discA;
    try {
      await supabase.from("quotes").update({
        material_cost: Math.round(matCst*100)/100,
        overhead_cost: Math.round(ohCst*100)/100,
        labor_cost: Math.round(labC*100)/100,
        fuel_cost: Math.round(fuelC*100)/100,
        consumables_cost: Math.round(consC*100)/100,
        commission_cost: Math.round(comm*100)/100,
        commission_pct: commPct,
        job_miles: Number(jobMiles||0),
        discount_amount: Number(discount||0),
        labor_roles_json: JSON.stringify(laborRoles),
        sales_rep_id: selectedRep||null,
        grand_total: Math.round(finP*100)/100,
        final_price: Math.round(finP*100)/100,
      }).eq("project_id", projectId);
      if(project?.lead_id){
        await supabase.from("customers")
          .update({estimate_amount: Math.round(finP*100)/100})
          .eq("id", project.lead_id);
      }
      setAutoSaved(true);
      setTimeout(()=>setAutoSaved(false), 2500);
      if(doNavigate) navigate(`/quote/${projectId}`);
    } catch(err){
      if(doNavigate) alert("Error: "+err.message);
      else console.warn("Auto-save error:", err.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[projectId, liveMaterialCost, liveOverheadCost, laborRoles, jobMiles, fuelRate, consumables, extras, discount, selectedRep, salesReps, quote, project]);

  // ── Auto-save: debounce 1.2 s after any editable field changes ──────────────
  useEffect(()=>{
    if(loading) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(()=>saveQuote(), 1200);
    return ()=>clearTimeout(autoSaveTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[laborRoles, consumables, jobMiles, selectedRep, extras, discount]);

  async function saveAndGoToQuote() {
    if(saving) return;
    setSaving(true);
    await saveQuote({navigate:true});
    setSaving(false);
  }

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",
        justifyContent:"center",fontFamily:"system-ui",color:C.muted}}>
      Loading…
    </div>
  );

  const CARD = {background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 16px",marginBottom:12};
  const SEC = {fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"};
  const ROW = {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px dashed ${C.border}`,fontSize:12};
  const TOTAL_ROW = {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",fontSize:13,fontWeight:700};

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:C.bg,minHeight:"100vh",paddingBottom:40}}>

      {/* header */}
      <div style={{background:C.ink,padding:"12px 20px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:100}}>
        <button onClick={()=>navigate(-1)}
          style={{border:"1px solid #475569",background:"none",color:"#94a3b8",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← Back
        </button>
        <div style={{flex:1}}>
          <div style={{color:"white",fontWeight:700,fontSize:14}}>Job Costing Sheet</div>
          <div style={{color:"#94a3b8",fontSize:11}}>{customer?.name} · {project?.address}</div>
        </div>
        <div style={{fontSize:11,color:autoSaved?"#34d399":"#475569",fontWeight:600,minWidth:60,textAlign:"right"}}>
          {autoSaved?"✓ Saved":""}
        </div>
        <button onClick={saveAndGoToQuote} disabled={saving}
          style={{border:"none",background:"#059669",color:"white",padding:"10px 20px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
          {saving?"Saving…":"📄 Generate Quote"}
        </button>
      </div>

      <div style={{maxWidth:700,margin:"0 auto",padding:"16px 14px"}}>

        {/* ── 1. MATERIAL COSTS ── */}
        <div style={CARD}>
          <div style={SEC}>
            <span>🧱 Material Costs</span>
            <span style={{fontSize:9,color:"#059669",fontWeight:600}}>● live from Settings</span>
          </div>
          {areaCostLines.length===0 ? (
            <div style={{fontSize:12,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"8px 12px"}}>
              ⚠️ No areas found — go back to the estimate, add measurements, and click <b>Save</b> before opening the Quote screen.
            </div>
          ) : (
            areaCostLines.map((a,i)=>(
              <div key={i} style={{...ROW, borderBottom: i<areaCostLines.length-1?`1px dashed ${C.border}`:"none", flexWrap:"wrap", gap:2}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,color:C.ink,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {a.area_type}{a.floor?` · ${a.floor}`:""}{a.r_value?` · ${a.r_value}`:""}
                  </div>
                  <div style={{fontSize:10,color:C.muted}}>{a.material} · {fmt0(a.sqft)} ft² · {a.pricingNote}</div>
                  {/* Brand selector — only shown when material_types exist for this material */}
                  {a.availProds&&a.availProds.length>1&&(
                    <div style={{display:"flex",alignItems:"center",gap:4,marginTop:3}}>
                      <span style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase"}}>Brand:</span>
                      <select value={a.activeProductId||""}
                        onChange={e=>{
                          const prod=a.availProds.find(p=>p.id===e.target.value);
                          if(prod) setAreaProduct(a.area_id,prod.id,a,prod);
                        }}
                        style={{fontSize:10,height:22,borderRadius:4,border:`1px solid ${C.border}`,background:"white",color:C.ink,padding:"0 4px"}}>
                        {a.availProds.map(p=>(
                          <option key={p.id} value={p.id}>
                            {p.brand||p.description||"(unnamed)"} — ${Number(p.cost_per_unit||0).toFixed(2)}/{a.matType?.unit==="board_ft"?"bf":a.matType?.unit==="bag"?"bag":"sqft"}
                            {p.is_active?" ✓":""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {a.availProds&&a.availProds.length===1&&(
                    <div style={{fontSize:9,color:C.faint,marginTop:2}}>
                      {a.availProds[0].brand||a.availProds[0].description||""}{a.availProds[0].brand?" — add more brands in Settings → Materials":""}
                    </div>
                  )}
                </div>
                <div style={{fontWeight:700,color:a.lineTotal>0?C.ink:C.faint,marginLeft:12,flexShrink:0}}>
                  {a.lineTotal>0?`$${fmt(a.lineTotal)}`:"—"}
                </div>
              </div>
            ))
          )}
          {materialCost===0 && areaCostLines.length>0 && (
            <div style={{marginTop:8,fontSize:11,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"6px 10px"}}>
              ⚠️ Prices show $0 — set up material pricing in <b>Settings → Materials</b> or import your pricing worksheet.
            </div>
          )}
          <div style={TOTAL_ROW}>
            <span>Total Materials</span>
            <span style={{color:C.green}}>${fmt(materialCost)}</span>
          </div>
        </div>

        {/* ── 2. OVERHEAD & BUSINESS COSTS ── */}
        <div style={CARD}>
          <div style={SEC}>
            <span>🏢 Overhead & Business Costs</span>
            <span style={{fontSize:9,color:C.faint}}>÷ {jobsPerMonth} jobs/mo</span>
          </div>
          {overheadLines.length===0 ? (
            <div style={{fontSize:12,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"8px 12px"}}>
              ⚠️ No overhead costs yet — add them in <b>Settings → Overhead</b> (rent, insurance, vehicles, etc.).
            </div>
          ) : (
            overheadLines.map((o,i)=>(
              <div key={i} style={{...ROW, borderBottom: i<overheadLines.length-1?`1px dashed ${C.border}`:"none"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:C.ink}}>{o.name}</div>
                  <div style={{fontSize:10,color:C.muted}}>{o.category} · ${fmt(o.monthlyAmt)}/mo</div>
                </div>
                <div style={{fontSize:12,fontWeight:600,color:C.ink,marginLeft:12}}>${fmt(o.perJob)}</div>
              </div>
            ))
          )}
          <div style={TOTAL_ROW}>
            <span>Total Overhead / Job</span>
            <span style={{color:C.green}}>${fmt(overheadCost)}</span>
          </div>
        </div>

        {/* ── 3. CREW & LABOR ── */}
        <div style={CARD}>
          <div style={SEC}>
            <span>👷 Crew & Labor</span>
            <span style={{fontSize:10,color:C.muted,fontWeight:400}}>pre-loaded from Settings — adjust for this job</span>
          </div>
          {laborRoles.length===0 && (
            <div style={{fontSize:12,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"8px 12px",marginBottom:10}}>
              ⚠️ No crew roles yet — set them up in <b>Settings → Labor Roles</b> with hourly rates.
            </div>
          )}
          {laborRoles.length>0 && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 52px 52px 52px 52px 52px 72px 24px",gap:3,marginBottom:6}}>
              {["Role","Hrs","Days","Ppl","$/hr","Extra","Cost",""].map((h,i)=>(
                <div key={i} style={{fontSize:8,color:C.faint,fontWeight:700,textTransform:"uppercase",textAlign:i>0?"center":"left"}}>{h}</div>
              ))}
            </div>
          )}
          {laborRoles.map((r,i)=>{
            const rowCost = Number(r.hours||8)*Number(r.days||1)*Number(r.people||1)*Number(r.rate||0)+Number(r.extra||0)*Number(r.people||1);
            return (
              <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 52px 52px 52px 52px 52px 72px 24px",gap:3,marginBottom:5,alignItems:"center"}}>
                <input value={r.role||""} onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,role:e.target.value}:x))} placeholder="Role name" style={{...I,height:28,fontSize:11}} />
                <input type="number" value={r.hours} onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,hours:e.target.value}:x))} style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                <input type="number" value={r.days} onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,days:e.target.value}:x))} style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                <input type="number" value={r.people} onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,people:e.target.value}:x))} style={{...I,height:28,fontSize:11,textAlign:"center",fontWeight:700,color:Number(r.people)>1?"#059669":C.ink}} />
                <input type="number" value={r.rate} onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,rate:e.target.value}:x))} style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                <input type="number" placeholder="0" value={r.extra} onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,extra:e.target.value}:x))} style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                <div style={{fontSize:12,fontWeight:700,color:rowCost>0?C.green:C.faint,textAlign:"right",paddingRight:2}}>${fmt(rowCost)}</div>
                <button onClick={()=>setLaborRoles(p=>p.filter((_,j)=>j!==i))} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,padding:0,lineHeight:1}}>✕</button>
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
            <div>
              {showRolePicker ? (
                <select autoFocus
                  style={{...I,height:32,fontSize:12,width:220}}
                  onChange={e=>{
                    const val = e.target.value;
                    if(!val) return;
                    if(val==="__blank__"){
                      setLaborRoles(p=>[...p,{role:"",rate:0,people:"1",days:"1",hours:"8",extra:""}]);
                    } else {
                      const found = allRoles.find(r=>r.role===val);
                      if(found) setLaborRoles(p=>[...p,{...found,people:"1",days:"1",hours:"8",extra:""}]);
                    }
                    setShowRolePicker(false);
                  }}
                  onBlur={()=>setShowRolePicker(false)}>
                  <option value="">— select a role —</option>
                  {allRoles.filter(r=>!laborRoles.some(lr=>lr.role===r.role)).map(r=>(
                    <option key={r.role} value={r.role}>{r.role} · ${r.rate}/hr</option>
                  ))}
                  <option value="__blank__">+ New blank role</option>
                </select>
              ) : (
                <button onClick={()=>setShowRolePicker(true)}
                  style={{border:`1px dashed ${C.border}`,background:"none",color:C.muted,padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12}}>
                  + Add Role
                </button>
              )}
            </div>
            {laborCost>0 && <div style={{...TOTAL_ROW,marginBottom:0}}><span>Total Labor</span><span style={{color:C.green,marginLeft:12}}>${fmt(laborCost)}</span></div>}
          </div>
        </div>

        {/* ── 4. CONSUMABLES & JOB-SITE COSTS ── */}
        <div style={CARD}>
          <div style={SEC}>
            <span>📦 Consumables & Job-Site Costs</span>
            <span style={{fontSize:10,color:C.muted,fontWeight:400}}>adjust qty per job</span>
          </div>
          {consumables.length===0 && (
            <div style={{fontSize:12,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"8px 12px",marginBottom:8}}>
              ⚠️ No consumables yet — set them up in <b>Settings → Consumables</b>, then they'll auto-load here with qty fields.
            </div>
          )}
          {consumables.length>0 && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"2fr 80px 70px 80px 24px",gap:4,marginBottom:6,fontSize:9,fontWeight:700,color:C.faint,textTransform:"uppercase"}}>
                <span>Item</span><span>Unit price</span><span>Qty</span><span>Total</span><span></span>
              </div>
              {consumables.map((c,i)=>{
                const rowCost = Number(c.amount||0)*Number(c.qty||1);
                return (
                  <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 80px 70px 80px 24px",gap:4,marginBottom:5,alignItems:"center"}}>
                    <input value={c.name||""} onChange={e=>setConsumables(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))} style={{...I,height:28,fontSize:11}} />
                    <div style={{fontSize:11,color:C.muted,textAlign:"center"}}>${fmt(c.amount)}</div>
                    <input type="number" value={c.qty} onChange={e=>setConsumables(p=>p.map((x,j)=>j===i?{...x,qty:e.target.value}:x))} style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                    <div style={{fontSize:12,fontWeight:700,color:C.green,textAlign:"right"}}>${fmt(rowCost)}</div>
                    <button onClick={()=>setConsumables(p=>p.filter((_,j)=>j!==i))} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,padding:0}}>✕</button>
                  </div>
                );
              })}
            </>
          )}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
            <button onClick={()=>setConsumables(p=>[...p,{name:"",amount:0,qty:"1"}])}
              style={{border:`1px dashed ${C.border}`,background:"none",color:C.muted,padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12}}>
              + Add Item
            </button>
            {consumablesCost>0 && <div style={{...TOTAL_ROW,marginBottom:0}}><span>Total Consumables</span><span style={{color:C.green,marginLeft:12}}>${fmt(consumablesCost)}</span></div>}
          </div>
        </div>

        {/* ── 5. FUEL ── */}
        <div style={CARD}>
          <div style={SEC}>
            <span>⛽ Fuel</span>
            {calcingMiles && <span style={{fontSize:9,color:"#059669"}}>📍 calculating…</span>}
            {!calcingMiles && jobMiles && <span style={{fontSize:9,color:"#059669"}}>● auto from Maps</span>}
          </div>
          {!calcingMiles && !jobMiles && (
            <div style={{fontSize:11,color:C.faint,marginBottom:8}}>Set shop address in <b>Settings → Fuel</b> to auto-fill.</div>
          )}
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Miles (one-way)</div>
              <input type="number" placeholder="0" value={jobMiles} onChange={e=>setJobMiles(e.target.value)} style={{...I,width:"100%"}} />
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:C.muted}}>{jobMiles>0?`${Number(jobMiles)*2} mi round trip · $${fuelRate}/mi`:"—"}</div>
              <div style={{fontSize:16,fontWeight:700,color:C.green}}>{jobMiles>0?`$${fmt(fuelCost)}`:"—"}</div>
            </div>
          </div>
        </div>

        {/* ── 6. SALES REP ── */}
        {salesReps.length>0 && (
          <div style={CARD}>
            <div style={SEC}><span>👤 Sales Rep / Commission</span></div>
            <select value={selectedRep} onChange={e=>setSelectedRep(e.target.value)} style={{...I,width:"100%"}}>
              <option value="">No commission</option>
              {salesReps.map(r=><option key={r.id} value={r.id}>{r.name} — {r.commission_pct}%</option>)}
            </select>
          </div>
        )}

        {/* ── 7. EXTRAS & DISCOUNT ── */}
        <div style={CARD}>
          <div style={SEC}><span>➕ Extra Charges</span></div>
          {extras.map((e,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
              <input placeholder="Description e.g. Permit fee" value={e.desc} onChange={ev=>setExtras(p=>p.map((x,j)=>j===i?{...x,desc:ev.target.value}:x))} style={{...I,flex:2}} />
              <div style={{display:"flex",alignItems:"center",gap:4,flex:1}}>
                <span style={{color:C.muted}}>$</span>
                <input type="number" placeholder="0" value={e.amount} onChange={ev=>setExtras(p=>p.map((x,j)=>j===i?{...x,amount:ev.target.value}:x))} style={{...I,textAlign:"right"}} />
              </div>
              <button onClick={()=>setExtras(p=>p.filter((_,j)=>j!==i))} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
            </div>
          ))}
          <button onClick={()=>setExtras(p=>[...p,{desc:"",amount:""}])}
            style={{border:`1px dashed ${C.border}`,background:"none",color:C.muted,width:"100%",padding:"8px",borderRadius:6,cursor:"pointer",fontSize:12}}>
            + Add Extra Charge
          </button>
        </div>
        <div style={CARD}>
          <div style={SEC}><span>🏷 Discount</span></div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{color:C.muted,fontSize:16}}>-$</span>
            <input type="number" placeholder="0" value={discount} onChange={e=>setDiscount(e.target.value)} style={{...I,flex:1}} />
          </div>
        </div>

        {/* ── 8. FULL COST SUMMARY ── */}
        <div style={{background:C.ink,borderRadius:12,padding:"16px 20px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5,marginBottom:12}}>
            Cost Summary
          </div>
          {[
            ["🧱 Materials",     materialCost],
            ["🏢 Overhead",      overheadCost],
            ["👷 Labor",         laborCost],
            ["📦 Consumables",   consumablesCost],
            ["⛽ Fuel",          fuelCost],
            extraTotal>0   ? ["➕ Extras",    extraTotal] : null,
            commission>0   ? [`👤 Commission (${commissionPct}%)`, commission] : null,
            discountAmt>0  ? ["🏷 Discount",  -discountAmt] : null,
          ].filter(Boolean).map(([label,val],i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>{label}</span>
              <span style={{color:val<0?"#f87171":"white",fontSize:12}}>{val<0?"-":""} ${fmt(Math.abs(val))}</span>
            </div>
          ))}
          <div style={{borderTop:"1px solid #374151",marginTop:12,paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
            <div>
              <div style={{color:"#94a3b8",fontSize:11}}>Total Cost</div>
              <div style={{color:"white",fontSize:14,fontWeight:700}}>${fmt(totalCost)}</div>
              <div style={{color:"#94a3b8",fontSize:11,marginTop:6}}>Margin</div>
              <div style={{color:"#94a3b8",fontSize:12}}>{margin}%</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:"#94a3b8",fontSize:11}}>Final Price</div>
              <div style={{color:"#059669",fontWeight:800,fontSize:30}}>${fmt0(finalPrice)}</div>
            </div>
          </div>
        </div>

        <button onClick={saveAndGoToQuote} disabled={saving}
          style={{width:"100%",border:"none",background:"#059669",color:"white",padding:"16px",borderRadius:12,cursor:"pointer",fontSize:16,fontWeight:700}}>
          {saving?"Saving…":"📄 Generate Customer Quote"}
        </button>

      </div>
    </div>
  );
}
