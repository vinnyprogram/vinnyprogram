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

  // labor roles from settings
  const [laborRoles, setLaborRoles] = useState([]);

  // consumables from settings — adjustable per job (e.g. bump qty for a bigger job)
  const [consumables, setConsumables] = useState([]);

  // fuel
  const [jobMiles, setJobMiles] = useState("");
  const [fuelRate, setFuelRate] = useState(0.67);

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
    if(user){
      const { data:cd } = await supabase.from("companies")
        .select("id").eq("user_id",user.id).maybeSingle();
      if(cd){
        // labor roles
        const { data:roles } = await supabase.from("cost_settings")
          .select("*").eq("company_id",cd.id).eq("period","labor_role")
          .order("sort_order");
        if(roles?.length){
          setLaborRoles(roles.map(r=>({
            role:r.name, rate:Number(r.amount||0),
            people:"1", days:"1", hours:"8", extra:"",
          })));
        }

        // fuel rate
        const { data:fuel } = await supabase.from("cost_settings")
          .select("*").eq("company_id",cd.id).eq("period","fuel").maybeSingle();
        if(fuel) setFuelRate(Number(fuel.amount||0.67));

        // sales reps
        const { data:reps } = await supabase.from("sales_reps")
          .select("*").eq("company_id",cd.id).eq("active",true);
        if(reps?.length) setSalesReps(reps);

        // consumables — adjustable qty multiplier per job
        const { data:cons } = await supabase.from("cost_settings")
          .select("*").eq("company_id",cd.id).eq("period","job_consumable")
          .order("sort_order");
        if(cons?.length){
          setConsumables(cons.map(c=>({ name:c.name, amount:Number(c.amount||0), qty:"1" })));
        }
      }
    }

    setLoading(false);
  }

  // ── Calculations ────────────────────────────────────────────────────────────
  const baseCost = Number(quote?.material_cost||0)
    + Number(quote?.overhead_cost||0);

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
              textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
            📊 Cost Summary (Read Only)
          </div>
          {[
            ["Materials",   quote?.material_cost],
            ["Overhead",    quote?.overhead_cost],
          ].map(([label,val],i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",
                fontSize:12,color:C.muted,paddingBottom:4,marginBottom:4,
                borderBottom:`1px dashed ${C.border}`}}>
              <span>{label}</span>
              <span>${fmt(val)}</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",
              fontSize:13,fontWeight:700,color:C.ink}}>
            <span>Base Cost</span>
            <span>${fmt(baseCost)}</span>
          </div>
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
              textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
            ⛽ Fuel
          </div>
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
