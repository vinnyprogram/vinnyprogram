import { useState, useEffect } from "react";
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

  // live-calculated costs (not stale from saved quote)
  const [liveMaterialCost, setLiveMaterialCost] = useState(null);
  const [liveOverheadCost, setLiveOverheadCost] = useState(null);

  // labor roles from settings
  const [laborRoles, setLaborRoles] = useState([]);

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

    // load quote
    const { data:q } = await supabase.from("quotes")
      .select("*").eq("project_id", projectId).maybeSingle();
    setQuote(q);

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
      { data:matCosts },
      { data:variants },
      { data:overheadRows },
      { data:jpmRow },
    ] = await Promise.all([
      supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","labor_role").order("sort_order"),
      supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","fuel").maybeSingle(),
      supabase.from("sales_reps").select("*").eq("company_id",cd.id).eq("active",true),
      supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","job_consumable").order("sort_order"),
      supabase.from("project_areas").select("*").eq("project_id",projectId),
      supabase.from("material_costs").select("*").eq("company_id",cd.id),
      supabase.from("material_variants").select("*").eq("company_id",cd.id),
      supabase.from("cost_settings").select("*").eq("company_id",cd.id)
        .not("period","eq","labor_role").not("period","eq","job_consumable")
        .not("period","eq","fuel").not("period","eq","jobs_per_month"),
      supabase.from("cost_settings").select("*").eq("company_id",cd.id).eq("period","jobs_per_month").maybeSingle(),
    ]);

    // crew
    if(roles?.length){
      setLaborRoles(roles.map(r=>({
        role:r.name, rate:Number(r.amount||0),
        people:"1", days:"1", hours:"8", extra:"",
      })));
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

    // ── Live material cost recalculation ──────────────────────────────────
    // Recalculates from the project's actual areas + current Settings pricing
    // so the number is always up-to-date, not stale from when the estimate
    // was last saved (which might have been before pricing was configured).
    const THICK_MAP = {"2x4":3.5,"2x6":5.5,"2x8":7.25,"2x10":9.25,"2x12":11.25,"I-joist":11.875};
    const matCostMap = {};
    (matCosts||[]).forEach(m=>{ matCostMap[m.material_name]=m; });
    const variantMap = {};
    (variants||[]).forEach(v=>{ variantMap[`${v.material_name}|${v.r_value||""}`.toLowerCase()]=v; });
    function parseR(rValue){ const m=String(rValue||"").match(/(\d+(\.\d+)?)/); return m?parseFloat(m[1]):0; }

    let matTotal = 0;
    const seenOverride = new Set();
    (areas||[]).forEach(a=>{
      if(a.price_override && Number(a.price_override)>0){
        const key = a.id||a.area_type;
        if(seenOverride.has(key)) return;
        seenOverride.add(key);
        matTotal += (a.sqft||0)*Number(a.price_override);
        return;
      }
      const vKey = `${a.material||""}|${a.r_value||""}`.toLowerCase();
      const variant = variantMap[vKey];
      if(variant){
        matTotal += (a.sqft||0)*Number(variant.cost_per_sqft||0)*(1+Number(variant.markup_pct||0)/100);
        return;
      }
      const mc = matCostMap[a.material];
      if(!mc) return;
      const thick = (mc.unit==="board_ft" && mc.r_per_inch>0 && a.r_value)
        ? parseR(a.r_value)/Number(mc.r_per_inch)
        : (THICK_MAP[a.thickness_in]||0);
      const qty = mc.unit==="board_ft" ? (a.sqft||0)*thick
                : mc.unit==="bag" ? Math.ceil((a.sqft||0)*thick/(mc.coverage_factor||1))
                : (a.sqft||0);
      matTotal += qty*Number(mc.cost_per_unit||0)*(1+Number(mc.markup_pct||0)/100);
    });
    setLiveMaterialCost(Math.round(matTotal*100)/100);

    // ── Live overhead per job ─────────────────────────────────────────────
    const totalMonthlyOH = (overheadRows||[]).reduce((s,c)=>s+Number(c.amount||0),0);
    const jobsPerMonth = jpmRow ? Number(jpmRow.amount||20) : 20;
    const ohPerJob = jobsPerMonth>0 ? totalMonthlyOH/jobsPerMonth : 0;
    setLiveOverheadCost(Math.round(ohPerJob*100)/100);

    // ── Fuel distance auto-calculate ──────────────────────────────────────
    // Uses Google Maps Distance Matrix to get driving distance from the
    // shop/office address (Settings → Fuel) to the job site address.
    const jobAddress = proj?.address || "";
    if(shopAddr && jobAddress && import.meta.env.VITE_GOOGLE_PLACES_KEY){
      setCalcingMiles(true);
      try {
        const origin = encodeURIComponent(shopAddr);
        const dest = encodeURIComponent(jobAddress);
        const key = import.meta.env.VITE_GOOGLE_PLACES_KEY;
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${dest}&units=imperial&key=${key}`
        );
        const json = await res.json();
        const el = json?.rows?.[0]?.elements?.[0];
        if(el?.status==="OK" && el?.distance?.value){
          // distance.value is in meters — convert to miles (one-way)
          const miles = Math.round(el.distance.value / 1609.34);
          setJobMiles(String(miles));
        }
      } catch(e){
        console.warn("Distance Matrix error:", e);
      }
      setCalcingMiles(false);
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

  async function saveAndGoToQuote() {
    if(saving) return;
    setSaving(true);
    try {
      await supabase.from("quotes").update({
        labor_cost: Math.round(laborCost*100)/100,
        fuel_cost: Math.round(fuelCost*100)/100,
        consumables_cost: Math.round(consumablesCost*100)/100,
        commission_cost: Math.round(commission*100)/100,
        commission_pct: commissionPct,
        job_miles: Number(jobMiles||0),
        sales_rep_id: selectedRep||null,
        grand_total: Math.round(finalPrice*100)/100,
        final_price: Math.round(finalPrice*100)/100,
      }).eq("project_id", projectId);

      // update customer estimate amount
      if(project?.lead_id){
        await supabase.from("customers")
          .update({estimate_amount: Math.round(finalPrice*100)/100})
          .eq("id", project.lead_id);
      }

      navigate(`/quote/${projectId}`);
    } catch(err){
      alert("Error: "+err.message);
    }
    setSaving(false);
  }

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",
        justifyContent:"center",fontFamily:"system-ui",color:C.muted}}>
      Loading…
    </div>
  );

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:C.bg,
        minHeight:"100vh",paddingBottom:40}}>

      {/* header */}
      <div style={{background:C.ink,padding:"12px 20px",
          display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:100}}>
        <button onClick={()=>navigate(-1)}
          style={{border:"1px solid #475569",background:"none",color:"#94a3b8",
            padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← Back
        </button>
        <div style={{flex:1}}>
          <div style={{color:"white",fontWeight:700,fontSize:14}}>
            Quote Pricing
          </div>
          <div style={{color:"#94a3b8",fontSize:11}}>
            {customer?.name} · {project?.address}
          </div>
        </div>
        <button onClick={saveAndGoToQuote} disabled={saving}
          style={{border:"none",background:"#059669",color:"white",
            padding:"10px 20px",borderRadius:8,cursor:"pointer",
            fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
          {saving?"Saving…":"📄 Generate Quote"}
        </button>
      </div>

      <div style={{maxWidth:640,margin:"0 auto",padding:"16px 14px"}}>

        {/* COST SUMMARY — read only */}
        <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
            padding:"14px 16px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,
              textTransform:"uppercase",letterSpacing:0.4,marginBottom:10,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>📊 Cost Summary</span>
            <span style={{fontSize:9,color:"#059669",fontWeight:600}}>● live from Settings</span>
          </div>
          {[
            ["Materials",   materialCost],
            ["Overhead",    overheadCost],
          ].map(([label,val],i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",
                fontSize:12,color:C.muted,paddingBottom:4,marginBottom:4,
                borderBottom:`1px dashed ${C.border}`}}>
              <span>{label}</span>
              <span style={{color:val>0?C.ink:C.faint}}>${fmt(val)}</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",
              fontSize:13,fontWeight:700,color:C.ink}}>
            <span>Base Cost</span>
            <span style={{color:baseCost>0?C.green:C.faint}}>${fmt(baseCost)}</span>
          </div>
          {baseCost===0 && (
            <div style={{marginTop:8,fontSize:11,color:"#b45309",background:"#fffbeb",
                border:"1px solid #fde68a",borderRadius:6,padding:"6px 10px"}}>
              ⚠️ $0 means no material pricing is set up yet — go to
              <b> Settings → Materials</b> to import your pricing worksheet.
            </div>
          )}
        </div>

        {/* CREW & LABOR */}
        <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
            padding:"14px 16px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,
              textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>
            👷 Crew & Labor
          </div>
          <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
            Adjust hrs, days, and people for this job. Add or remove roles as needed.
          </div>
          <div style={{display:"grid",
              gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr 24px",
              gap:4,marginBottom:6}}>
            {["Role","Hrs/day","Days","People","$/hr","Extra/person",""].map((h,i)=>(
              <div key={i} style={{fontSize:9,color:C.faint,fontWeight:700,
                  textTransform:"uppercase"}}>{h}</div>
            ))}
          </div>
          {laborRoles.map((r,i)=>{
            const rowCost = Number(r.hours||8)*Number(r.days||1)*Number(r.people||1)*Number(r.rate||0)
              + Number(r.extra||0)*Number(r.people||1);
            return (
              <div key={i} style={{display:"grid",
                  gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr 24px",
                  gap:4,marginBottom:6,alignItems:"center"}}>
                <input value={r.role||""}
                  onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,role:e.target.value}:x))}
                  placeholder="Role name"
                  style={{...I,height:28,fontSize:11}} />
                <input type="number" value={r.hours}
                  onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,hours:e.target.value}:x))}
                  style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                <input type="number" value={r.days}
                  onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,days:e.target.value}:x))}
                  style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                <input type="number" value={r.people}
                  onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,people:e.target.value}:x))}
                  style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                <input type="number" value={r.rate}
                  onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,rate:e.target.value}:x))}
                  style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                <input type="number" placeholder="0" value={r.extra}
                  onChange={e=>setLaborRoles(p=>p.map((x,j)=>j===i?{...x,extra:e.target.value}:x))}
                  style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                <button onClick={()=>setLaborRoles(p=>p.filter((_,j)=>j!==i))}
                  style={{border:"none",background:"none",color:C.faint,
                    cursor:"pointer",fontSize:16,padding:0,lineHeight:1}}>✕</button>
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
            <button
              onClick={()=>setLaborRoles(p=>[...p,{role:"",rate:0,people:"1",days:"1",hours:"8",extra:""}])}
              style={{border:`1px dashed ${C.border}`,background:"none",color:C.muted,
                padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12}}>
              + Add Role
            </button>
            {laborCost>0 && (
              <div style={{fontSize:13,fontWeight:700,color:C.green}}>
                Total Labor: ${fmt(laborCost)}
              </div>
            )}
          </div>
        </div>

        {/* CONSUMABLES */}
        <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
            padding:"14px 16px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,
              textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>
            📦 Consumables & Job-Site Costs
          </div>
          <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
            Add supplies needed for this job. Bump qty for bigger jobs or add one-off items.
          </div>
          {consumables.length>0 && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"2fr 70px 70px 70px 24px",gap:4,
                  marginBottom:4,fontSize:9,fontWeight:700,color:C.faint,textTransform:"uppercase"}}>
                <span>Item</span><span>Each</span><span>Qty</span><span>Cost</span><span></span>
              </div>
              {consumables.map((c,i)=>{
                const rowCost = Number(c.amount||0)*Number(c.qty||1);
                return (
                  <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 70px 70px 70px 24px",
                      gap:4,marginBottom:4,alignItems:"center"}}>
                    <input value={c.name||""}
                      onChange={e=>setConsumables(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                      style={{...I,height:28,fontSize:11}} />
                    <div style={{fontSize:11,color:C.muted,textAlign:"center"}}>${fmt(c.amount)}</div>
                    <input type="number" value={c.qty}
                      onChange={e=>setConsumables(p=>p.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}
                      style={{...I,height:28,fontSize:11,textAlign:"center"}} />
                    <div style={{fontSize:11,color:C.green,fontWeight:700,textAlign:"right"}}>
                      ${fmt(rowCost)}
                    </div>
                    <button onClick={()=>setConsumables(p=>p.filter((_,j)=>j!==i))}
                      style={{border:"none",background:"none",color:C.faint,
                        cursor:"pointer",fontSize:16,padding:0,lineHeight:1}}>✕</button>
                  </div>
                );
              })}
            </>
          )}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
            <button
              onClick={()=>setConsumables(p=>[...p,{name:"",amount:0,qty:"1"}])}
              style={{border:`1px dashed ${C.border}`,background:"none",color:C.muted,
                padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12}}>
              + Add Item
            </button>
            {consumablesCost>0 && (
              <div style={{fontSize:13,fontWeight:700,color:C.green}}>
                Total: ${fmt(consumablesCost)}
              </div>
            )}
          </div>
        </div>

        {/* FUEL */}
        <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
            padding:"14px 16px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,
              textTransform:"uppercase",letterSpacing:0.4,marginBottom:4,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>⛽ Fuel</span>
            {calcingMiles && <span style={{fontSize:9,color:"#059669"}}>📍 calculating distance…</span>}
            {!calcingMiles && jobMiles && <span style={{fontSize:9,color:"#059669"}}>● auto-filled from Maps</span>}
          </div>
          {!calcingMiles && !jobMiles && (
            <div style={{fontSize:11,color:C.faint,marginBottom:8}}>
              Set your shop address in <b>Settings → Fuel</b> to auto-fill miles.
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Miles (one-way)</div>
              <input type="number" placeholder="0" inputMode="decimal"
                value={jobMiles}
                onChange={e=>setJobMiles(e.target.value)}
                style={{...I,width:"100%"}} />
            </div>
            <div style={{flex:1,paddingTop:18}}>
              <div style={{fontSize:12,color:C.muted}}>
                {jobMiles>0
                  ? `${Number(jobMiles)*2} miles round trip = `
                  : "Enter miles →"}
              </div>
              <div style={{fontSize:14,fontWeight:700,color:C.green}}>
                {jobMiles>0 ? `$${fmt(fuelCost)}` : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* SALES REP */}
        {salesReps.length>0 && (
          <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
              padding:"14px 16px",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,
                textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
              👤 Sales Rep
            </div>
            <select value={selectedRep}
              onChange={e=>setSelectedRep(e.target.value)}
              style={{...I,width:"100%"}}>
              <option value="">No commission</option>
              {salesReps.map(r=>(
                <option key={r.id} value={r.id}>
                  {r.name} — {r.commission_pct}% commission
                </option>
              ))}
            </select>
            {selectedRep && (
              <div style={{fontSize:12,color:C.muted,marginTop:6}}>
                Commission: ${fmt(commission)} ({commissionPct}% of price)
              </div>
            )}
          </div>
        )}

        {/* EXTRA CHARGES */}
        <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
            padding:"14px 16px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,
              textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
            ➕ Extra Charges
          </div>
          {extras.map((e,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
              <input placeholder="Description e.g. Permit fee"
                value={e.desc}
                onChange={ev=>setExtras(p=>p.map((x,j)=>j===i?{...x,desc:ev.target.value}:x))}
                style={{...I,flex:2}} />
              <div style={{display:"flex",alignItems:"center",gap:4,flex:1}}>
                <span style={{color:C.muted}}>$</span>
                <input type="number" placeholder="0"
                  value={e.amount}
                  onChange={ev=>setExtras(p=>p.map((x,j)=>j===i?{...x,amount:ev.target.value}:x))}
                  style={{...I,textAlign:"right"}} />
              </div>
              <button onClick={()=>setExtras(p=>p.filter((_,j)=>j!==i))}
                style={{border:"none",background:"none",color:C.faint,
                  cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
            </div>
          ))}
          <button onClick={()=>setExtras(p=>[...p,{desc:"",amount:""}])}
            style={{border:`1px dashed ${C.border}`,background:"none",
              color:C.muted,width:"100%",padding:"8px",borderRadius:6,
              cursor:"pointer",fontSize:12}}>
            + Add Extra Charge
          </button>
        </div>

        {/* DISCOUNT */}
        <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,
            padding:"14px 16px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,
              textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
            🏷 Discount
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{color:C.muted,fontSize:16}}>-$</span>
            <input type="number" placeholder="0"
              value={discount}
              onChange={e=>setDiscount(e.target.value)}
              style={{...I,flex:1}} />
          </div>
        </div>

        {/* FINAL PRICE */}
        <div style={{background:C.ink,borderRadius:12,padding:"16px 20px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Base Cost</span>
            <span style={{color:"white",fontSize:12}}>${fmt(baseCost)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Labor</span>
            <span style={{color:"white",fontSize:12}}>${fmt(laborCost)}</span>
          </div>
          {consumablesCost>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Consumables</span>
              <span style={{color:"white",fontSize:12}}>${fmt(consumablesCost)}</span>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Fuel</span>
            <span style={{color:"white",fontSize:12}}>${fmt(fuelCost)}</span>
          </div>
          {extraTotal>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Extras</span>
              <span style={{color:"white",fontSize:12}}>${fmt(extraTotal)}</span>
            </div>
          )}
          {commission>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Commission ({commissionPct}%)</span>
              <span style={{color:"white",fontSize:12}}>${fmt(commission)}</span>
            </div>
          )}
          {discountAmt>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Discount</span>
              <span style={{color:"#f87171",fontSize:12}}>-${fmt(discountAmt)}</span>
            </div>
          )}
          <div style={{borderTop:"1px solid #374151",paddingTop:12,marginTop:4,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:"#94a3b8",fontSize:11}}>Margin</div>
              <div style={{color:"#94a3b8",fontSize:12}}>{margin}%</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:"#94a3b8",fontSize:11}}>Final Price</div>
              <div style={{color:"#059669",fontWeight:800,fontSize:26}}>
                ${fmt0(finalPrice)}
              </div>
            </div>
          </div>
        </div>

        <button onClick={saveAndGoToQuote} disabled={saving}
          style={{width:"100%",border:"none",background:"#059669",color:"white",
            padding:"16px",borderRadius:12,cursor:"pointer",
            fontSize:16,fontWeight:700}}>
          {saving?"Saving…":"📄 Generate Customer Quote"}
        </button>

      </div>
    </div>
  );
}
