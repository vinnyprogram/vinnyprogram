import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

// ── Company defaults (will come from settings later) ──────────────────────────
const COMPANY = {
  name:    "Bright Choice Insulation",
  address: "69 Watson Street | Brockton, Massachusetts 02301",
  phone:   "(781) 507-3199",
  email:   "info@brightchoiceinsulation.com",
  website: "https://brightchoiceinsulation.com/",
};

const TERMS = `This quote is valid for the next 15 days, after which values may be subject to change.

1. Responsibility of the Customer:
A. It is the responsibility of the customer or signatory to this contract to make sure that the following conditions are met prior to commencement of work.
B. The area/areas to be insulated must be free of debris, tools, equipment, and obstructions.
C. All pre-insulation inspections must be done. If upon arrival to the jobsite, the contractor has not notified any company, manager, or supervisor that inspections have not been completed and the job had been scheduled, a company fee will be applied for lost time.
D. Wires must be installed tightly so as not to expand with the foam. If wires are not installed properly, blades can possibly cut the wires, which will not be covered through the company warranty.
E. Stud surfaces shall be free of staples, nails, and screws (or surfaces will not be shaved).
F. All soffits and roof or exterior wall openings must be properly sealed. Please note that any spray foam that leaks out as a result of inadequately sealed openings will not be covered under the company warranty.

2. Warranty/Limitation of Liability:
The workmanship warranty period is 1 year from project completion. Bright Choice Insulation's warranty covers any defective workmanship performed by the company, as well as any additional warranties imposed by law. The customer's claim for damages shall be limited to the amounts paid for services rendered hereunder only and shall not include any incidental or consequential damages.

3. Change Orders:
Any changes to the scope of work as described above will only be binding and accepted if agreed upon in writing in a "Change Order" form.

4. Payment Schedule and Terms:
All jobs of $3,000.00 and under must be paid in full prior to the start of the job. Bright Choice Insulation requires a 50% down payment of the contract/proposal price at least 3 days before the scheduled date. The second and final 50% is due when the job is completed. An administrative fee of 2% will be applied to all credit card payments. Past-due accounts, after 30 days, can be referred to debt collection agencies. An interest rate of 1.5% a month (18% annually) will be charged to all past-due accounts.

5. Legal Notices:
This is a Massachusetts contract and shall be construed under and governed by the laws of the State of Massachusetts. When the customer authorizes the service specified in this proposal with or without signatures, Bright Choice Insulation will act as if this was a signed contract.

6. Price Escalation:
The contract/proposal price has been calculated based on current prices. Should there be an increase in material prices after execution, the Builder/Owner agrees to pay that cost increase.`;

function fmt(n) {
  return Number(n||0).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtDate(d) {
  return new Date(d||Date.now()).toLocaleDateString("en-US",
    { month:"short", day:"numeric", year:"numeric" });
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function QuotePDF() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const printRef = useRef();

  const [project, setProject]   = useState(null);
  const [quote, setQuote]       = useState(null);
  const [lead, setLead]         = useState(null);
  const [areas, setAreas]       = useState([]);
  const [floors, setFloors]     = useState([]);
  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [options, setOptions]   = useState([]); // optional items

  useEffect(()=>{
    async function load() {
      // get logged in user
      const { data:{ user } } = await supabase.auth.getUser();
      setUser(user);

      // project
      const { data:proj } = await supabase.from("projects")
        .select("*").eq("id", projectId).maybeSingle();
      if(!proj){ setLoading(false); return; }
      setProject(proj);

      // lead/customer
      if(proj.lead_id){
        const { data:l } = await supabase.from("customers")
          .select("*").eq("id", proj.lead_id).maybeSingle();
        setLead(l);
      }

      // quote
      const { data:q } = await supabase.from("quotes")
        .select("*").eq("project_id", projectId)
        .order("created_at", { ascending:false }).limit(1).maybeSingle();
      setQuote(q);

      // floors
      const { data:fl } = await supabase.from("floors")
        .select("*").eq("project_id", projectId).order("order_index");
      setFloors(fl||[]);

      // floors
      const { data:fl_data } = await supabase.from("floors")
        .select("*").eq("project_id", projectId).order("order_index");
      setFloors(fl_data||[]);

      // areas
      const { data:ar } = await supabase.from("areas")
        .select("*").eq("project_id", projectId).order("order_index");
      setAreas(ar||[]);

      // auto-populate options from area.options
      const areaOpts = [];
      (ar||[]).forEach(a=>{
        const aopts = Array.isArray(a.options) ? a.options :
          (typeof a.options==="string" ? JSON.parse(a.options||"[]") : []);
        aopts.forEach((opt,oi)=>{
          const fl = (fl_data||[]).find(f=>f.id===a.floor_id);
          const matDesc = opt.mat_lines?.length>1
            ? opt.mat_lines.map(ml=>[ml.material,ml.r_value].filter(Boolean).join(" ")).join(" + ")
            : [opt.material,opt.thickness_in||a.thickness_in,opt.r_value||a.r_value].filter(Boolean).join(" ");
          areaOpts.push({
            id: `area-${a.id}-opt-${oi}`,
            label: `Option ${oi+1}: ${fl?.name||""} ${a.area_type}`,
            description: `${matDesc} · ${a.sqft} ft²`,
            price: null,
          });
        });
      });
      if(areaOpts.length>0) setOptions(areaOpts);

      setLoading(false);
    }
    load();
  },[projectId]);

  function print() {
    window.print();
  }

  function addOption() {
    setOptions(p=>[...p,{id:Date.now(),label:"",description:"",price:""}]);
  }
  function updateOption(i,k,v) {
    setOptions(p=>p.map((o,j)=>j===i?{...o,[k]:v}:o));
  }
  function removeOption(i) {
    setOptions(p=>p.filter((_,j)=>j!==i));
  }

  // group areas by area_type across ALL floors, collecting all mat_lines per area
  function groupedScope() {
    // First build per-area groups (combining combo rows by floor+area_type+sqft)
    const areaMap = {};
    areas.filter(a=>a.area_type&&a.sqft>0&&!a.is_optional).forEach(a=>{
      const fl = floors.find(f=>f.id===a.floor_id);
      const flName = fl?.name||"";
      const areaKey = `${a.floor_id}|${a.area_type}|${a.sqft}`;
      if(!areaMap[areaKey]){
        areaMap[areaKey]={area_type:a.area_type,flName,sqft:a.sqft,
          matLines:[],totalCost:0,totalPaintSqft:0,phase:a.phase||null};
      }
      areaMap[areaKey].matLines.push({material:a.material,thickness_in:a.thickness_in||"",r_value:a.r_value||""});
      areaMap[areaKey].totalCost += a.line_total||0;
      areaMap[areaKey].totalPaintSqft += Number(a.paint_sqft||0);
      if(a.phase) areaMap[areaKey].phase=a.phase;
    });
    // Now group by area_type+matLines signature across floors
    const typeMap = {};
    Object.values(areaMap).forEach(a=>{
      const matSig = a.matLines.map(m=>m.material).sort().join("+");
      const key = `${a.area_type}|${matSig}`;
      if(!typeMap[key]) typeMap[key]={
        area_type:a.area_type, matLines:a.matLines, floorNames:[],
        totalSqft:0, totalCost:0, totalPaintSqft:0, phase:a.phase,
      };
      if(!typeMap[key].floorNames.includes(a.flName)) typeMap[key].floorNames.push(a.flName);
      typeMap[key].totalSqft += a.sqft;
      typeMap[key].totalCost += a.totalCost;
      typeMap[key].totalPaintSqft += a.totalPaintSqft;
    });
    return Object.values(typeMap);
  }

  // group optional areas the same way
  function groupedOptions() {
    const typeMap = {};
    areas.filter(a=>a.area_type&&a.sqft>0&&a.is_optional&&((a.order_index%10===0)||(a.order_index===0))).forEach(a=>{
      const fl = floors.find(f=>f.id===a.floor_id);
      const flName = fl?.name||"";
      const key = `${a.area_type}|${a.material}|${a.r_value||""}|${a.thickness_in||""}`;
      if(!typeMap[key]) typeMap[key]={
        area_type:a.area_type, material:a.material, r_value:a.r_value||"",
        thickness_in:a.thickness_in||"", areas:[], floorNames:[],
        totalSqft:0, totalCost:0, optional_note:a.optional_note||"",
      };
      typeMap[key].areas.push(a);
      if(!typeMap[key].floorNames.includes(flName)) typeMap[key].floorNames.push(flName);
      typeMap[key].totalSqft += a.sqft||0;
      typeMap[key].totalCost += a.line_total||0;
      if(a.optional_note) typeMap[key].optional_note = a.optional_note;
    });
    return Object.values(typeMap);
  }

  // build description for each group
  function buildDescription(group) {
    const floorNames = group.floorNames||[];
    const matLines = group.matLines||[{material:group.material||"",thickness_in:group.thickness_in||"",r_value:group.r_value||""}];
    const desc = matLines.map(m=>`${m.thickness_in?m.thickness_in+" ":""}${m.material}${m.r_value?" ("+m.r_value+")":""}`).join(" + ");
    const floorList = floorNames.map(f=>`- ${f} ${group.area_type}`).join("\n");
    const paintLine = group.totalPaintSqft>0?`\n🎨 Intumescent paint: ${group.totalPaintSqft} ft²`:"";
    return `${desc} over the following areas:\n${floorList}${paintLine}`;
  }

  if(loading) return (
    <div style={{padding:40,textAlign:"center",fontFamily:"system-ui",color:"#64748b"}}>
      Loading quote…
    </div>
  );

  if(!project) return (
    <div style={{padding:40,textAlign:"center",fontFamily:"system-ui",color:"#ef4444"}}>
      Project not found.{" "}
      <button onClick={()=>navigate(-1)} style={{color:"#0f172a",cursor:"pointer"}}>Go back</button>
    </div>
  );

  const quoteNum = quote?.id ? String(quote.id).padStart(4,"0") : String(projectId).padStart(4,"0");
  const scope = groupedScope();
  const optScope = groupedOptions();
  // Use the authoritative grand_total saved when the costing sheet was
  // generated — it includes live material pricing, labor, overhead,
  // consumables, fuel, commission, and discount. Summing stale area
  // line_totals gives the wrong number if pricing changed after the
  // estimate was last saved.
  const total = quote?.grand_total || quote?.final_price || scope.reduce((s,g)=>s+g.totalCost,0);
  const salesRep = user?.user_metadata?.full_name || user?.email || "Sales Representative";

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:"#f4f5f7",minHeight:"100vh"}}>

      {/* ── action bar (not printed) ── */}
      <div className="no-print" style={{
        background:"#0f172a",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        position:"sticky",top:0,zIndex:100,
      }}>
        <button onClick={()=>navigate(-1)}
          style={{background:"none",border:"1px solid #475569",color:"#94a3b8",
            padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>
          ← Back
        </button>
        <span style={{color:"white",fontWeight:700,fontSize:14}}>
          Quote #{quoteNum}
        </span>
        <button onClick={print}
          style={{background:"#f97316",border:"none",color:"white",
            padding:"8px 16px",borderRadius:6,cursor:"pointer",
            fontSize:13,fontWeight:700}}>
          🖨 Print / Save PDF
        </button>
      </div>

      {/* ── optional items editor (not printed) ── */}
      <div className="no-print" style={{
        maxWidth:780,margin:"12px auto",padding:"0 12px",
      }}>
        <div style={{background:"white",borderRadius:10,padding:"12px 14px",
            border:"1px solid #e2e8f0",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>
              Optional items (shown as "Not included" in quote)
            </span>
            <button onClick={addOption}
              style={{background:"#0f172a",border:"none",color:"white",
                padding:"4px 10px",borderRadius:5,cursor:"pointer",fontSize:11}}>
              + Add option
            </button>
          </div>
          {options.length===0 && (
            <div style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:"8px 0"}}>
              No options yet — tap "+ Add option" to add alternatives for the customer
            </div>
          )}
          {options.map((o,i)=>(
            <div key={o.id} style={{display:"flex",gap:8,marginBottom:6,alignItems:"flex-start"}}>
              <input placeholder="Option name (e.g. Fiberglass Option)"
                value={o.label} onChange={e=>updateOption(i,"label",e.target.value)}
                style={{flex:2,height:28,fontSize:11,border:"1px solid #e2e8f0",
                  borderRadius:5,padding:"0 8px"}} />
              <input placeholder="Description"
                value={o.description} onChange={e=>updateOption(i,"description",e.target.value)}
                style={{flex:4,height:28,fontSize:11,border:"1px solid #e2e8f0",
                  borderRadius:5,padding:"0 8px"}} />
              <input placeholder="Extra $"
                value={o.price} onChange={e=>updateOption(i,"price",e.target.value)}
                style={{width:80,height:28,fontSize:11,border:"1px solid #e2e8f0",
                  borderRadius:5,padding:"0 8px"}} />
              <button onClick={()=>removeOption(i)}
                style={{border:"none",background:"none",color:"#94a3b8",
                  cursor:"pointer",fontSize:16,padding:"4px"}}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── PRINTABLE QUOTE ── */}
      <div ref={printRef} className="print-page" style={{
        maxWidth:780,margin:"0 auto",padding:"0 12px 40px",
      }}>
        <div style={{background:"white",padding:"32px 36px",minHeight:"297mm",
            boxSizing:"border-box"}}>

          {/* header */}
          <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",marginBottom:28}}>
            {/* company info */}
            <div>
              <div style={{fontWeight:900,fontSize:22,color:"#0f172a",
                  letterSpacing:-0.5,marginBottom:4}}>
                {COMPANY.name}
              </div>
              <div style={{fontSize:11,color:"#64748b",lineHeight:1.7}}>
                {COMPANY.address}<br/>
                {COMPANY.phone} | {COMPANY.email}<br/>
                {COMPANY.website}
              </div>
            </div>
            {/* quote box */}
            <div style={{background:"#f97316",borderRadius:8,
                padding:"12px 20px",minWidth:220,textAlign:"right"}}>
              <div style={{fontSize:20,fontWeight:900,color:"white",marginBottom:8}}>
                Quote #{quoteNum}
              </div>
              {[
                ["Sent on", fmtDate(quote?.created_at)],
                ["Job Type", project.status||crewNotes?.const_type||"—"],
                ["Sales Rep.", salesRep],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",
                    gap:12,fontSize:11,color:"rgba(255,255,255,.9)",marginBottom:2}}>
                  <span>{k}</span><span style={{fontWeight:600}}>{v}</span>
                </div>
              ))}
              <div style={{marginTop:8,paddingTop:8,
                  borderTop:"1.5px solid rgba(255,255,255,.4)",
                  display:"flex",justifyContent:"space-between",
                  alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:700,color:"white"}}>Total</span>
                <span style={{fontSize:18,fontWeight:900,color:"white"}}>
                  ${fmt(total)}
                </span>
              </div>
            </div>
          </div>

          {/* recipient */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",
                textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>
              Recipient:
            </div>
            <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>
              {lead?.name||project.name}
            </div>
            <div style={{fontSize:12,color:"#64748b",lineHeight:1.7,marginTop:2}}>
              {project.address||lead?.address}<br/>
              {lead?.phone && <span>{lead.phone}<br/></span>}
              {lead?.email && <span>{lead.email}</span>}
            </div>
          </div>

          {/* scope table */}
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:20}}>
            <thead>
              <tr style={{background:"#f97316"}}>
                <th style={{padding:"10px 12px",textAlign:"left",color:"white",
                    fontSize:12,fontWeight:700,width:"30%"}}>
                  Product/Service
                </th>
                <th style={{padding:"10px 12px",textAlign:"left",color:"white",
                    fontSize:12,fontWeight:700}}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {(()=>{
                const hasPhases = scope.some(g=>g.phase===1||g.phase===2);
                if(!hasPhases) return scope.map((g,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #e2e8f0",background:i%2===0?"white":"#fafbfc"}}>
                    <td style={{padding:"12px",fontSize:12,fontWeight:600,color:"#0f172a",verticalAlign:"top"}}>{(g.matLines||[{material:g.material}]).map(m=>m.material).join(" + ")||g.area_type}</td>
                    <td style={{padding:"12px",fontSize:12,color:"#374151",lineHeight:1.7,verticalAlign:"top"}}>
                      {buildDescription(g).split('\n').map((line,j)=>(<div key={j}>{line}</div>))}
                    </td>
                  </tr>
                ));
                // Phased job — insert phase header rows
                const rows = [];
                let lastPhase = undefined;
                const sorted = [...scope].sort((a,b)=>(a.phase||99)-(b.phase||99));
                sorted.forEach((g,i)=>{
                  const ph = g.phase||99;
                  if(ph !== lastPhase){
                    lastPhase = ph;
                    const label = ph===1?"1st Phase — Before Rough Inspection": ph===2?"2nd Phase — After Rough Inspection":"";
                    if(label) rows.push(
                      <tr key={"ph"+ph} style={{background:ph===1?"#eff6ff":"#f5f3ff"}}>
                        <td colSpan={2} style={{padding:"8px 12px",fontSize:11,fontWeight:800,
                            color:ph===1?"#1d4ed8":"#6d28d9",textTransform:"uppercase",letterSpacing:0.5}}>
                          {ph===1?"🔵":"🟣"} {label}
                        </td>
                      </tr>
                    );
                  }
                  rows.push(
                    <tr key={i} style={{borderBottom:"1px solid #e2e8f0",background:i%2===0?"white":"#fafbfc"}}>
                      <td style={{padding:"12px",fontSize:12,fontWeight:600,color:"#0f172a",verticalAlign:"top"}}>{(g.matLines||[{material:g.material}]).map(m=>m.material).join(" + ")||g.area_type}</td>
                      <td style={{padding:"12px",fontSize:12,color:"#374151",lineHeight:1.7,verticalAlign:"top"}}>
                        {buildDescription(g).split('\n').map((line,j)=>(<div key={j}>{line}</div>))}
                      </td>
                    </tr>
                  );
                });
                return rows;
              })()}

              {/* optional areas as options */}
              {optScope.length>0&&(
                <tr style={{background:"#fffbeb"}}>
                  <td colSpan={2} style={{padding:"8px 12px",fontSize:11,fontWeight:800,color:"#92400e",textTransform:"uppercase",letterSpacing:0.5}}>
                    ⭐ Options (Customer Choice)
                  </td>
                </tr>
              )}
              {optScope.map((g,i)=>(
                <tr key={"opt"+i} style={{borderBottom:"1px solid #fde68a",background:"#fffbeb"}}>
                  <td style={{padding:"12px",fontSize:12,fontWeight:700,color:"#92400e",verticalAlign:"top"}}>
                    <div style={{fontSize:10,fontWeight:400,color:"#b45309",marginBottom:2}}>Optional</div>
                    {g.floorNames.join(", ")} — {g.area_type}
                  </td>
                  <td style={{padding:"12px",fontSize:12,color:"#374151",lineHeight:1.7,verticalAlign:"top"}}>
                    <div>{g.thickness_in?g.thickness_in+" ":""}{g.material}{g.r_value?" ("+g.r_value+")":""} · {g.totalSqft} ft²</div>
                    {g.optional_note&&<div style={{marginTop:4,fontSize:11,color:"#92400e",fontStyle:"italic"}}>📝 {g.optional_note}</div>}
                    {g.totalCost>0&&<div style={{marginTop:4,fontWeight:700,color:"#059669"}}>+ ${g.totalCost.toFixed(2)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* sub-options */}
          {subOptions.length>0&&(
            <div style={{marginBottom:16,border:"1px solid #fde68a",borderRadius:8,overflow:"hidden"}}>
              <div style={{background:"#fff7ed",padding:"8px 16px",fontSize:11,fontWeight:800,color:"#92400e",textTransform:"uppercase",letterSpacing:0.5}}>
                ⚡ Alternative Options (Priced Separately)
              </div>
              {subOptions.map((o,i)=>(
                <div key={i} style={{padding:"10px 16px",borderTop:"1px solid #fde68a",background:i%2===0?"#fffbeb":"white"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#92400e"}}>{o.floorName} — {o.areaType}</div>
                      <div style={{fontSize:11,color:"#374151"}}>{o.label}: {o.matLabel} · {o.sqft} ft²</div>
                      {o.note&&<div style={{fontSize:10,color:"#b45309",fontStyle:"italic"}}>📝 {o.note}</div>}
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:"#059669",whiteSpace:"nowrap"}}>
                      {o.extraAmt>0?`$${o.extraAmt.toFixed(2)}`:"TBQ"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* total row */}
          <div style={{display:"flex",justifyContent:"flex-end",
              marginBottom:28,borderTop:"1px solid #e2e8f0",paddingTop:12}}>
            <div style={{display:"flex",gap:24,alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>Total</span>
              <span style={{fontSize:16,fontWeight:900,color:"#0f172a",
                  background:"#f1f5f9",padding:"6px 16px",borderRadius:6}}>
                ${fmt(total)}
              </span>
            </div>
          </div>

          {/* terms */}
          <div style={{fontSize:9.5,color:"#6b7280",lineHeight:1.7,
              borderTop:"1px solid #e2e8f0",paddingTop:16,whiteSpace:"pre-line"}}>
            {TERMS}
          </div>

          {/* signature */}
          <div style={{marginTop:28,display:"flex",gap:48}}>
            <div>
              <div style={{borderBottom:"1.5px solid #374151",width:180,
                  marginBottom:4,paddingBottom:4}}/>
              <div style={{fontSize:10,color:"#94a3b8"}}>Signature</div>
            </div>
            <div>
              <div style={{borderBottom:"1.5px solid #374151",width:120,
                  marginBottom:4,paddingBottom:4}}/>
              <div style={{fontSize:10,color:"#94a3b8"}}>Date</div>
            </div>
          </div>

          {/* footer */}
          <div style={{marginTop:24,paddingTop:12,borderTop:"1px solid #e2e8f0",
              fontSize:9,color:"#94a3b8",textAlign:"center"}}>
            {COMPANY.address} | {COMPANY.phone} | {COMPANY.email} | {COMPANY.website}
          </div>
        </div>
      </div>

      {/* print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; }
          .print-page { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
          .print-page > div { box-shadow: none !important; padding: 20px 24px !important; }
        }
      `}</style>
    </div>
  );
}
