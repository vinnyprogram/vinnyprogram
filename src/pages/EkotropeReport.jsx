import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

function parseArr(v){ return Array.isArray(v)?v:(typeof v==="string"?JSON.parse(v||"[]"):[]); }
function fmt(n,d=1){ return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}); }
const ORIENTATION_NAMES = { N:"North", NE:"Northeast", E:"East", SE:"Southeast", S:"South", SW:"Southwest", W:"West", NW:"Northwest" };

export default function EkotropeReport() {
  const navigate   = useNavigate();
  const { invoiceId, estimateId } = useParams();
  const mode = estimateId ? "estimate" : "invoice";

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [address, setAddress] = useState("");
  const [fm, setFm] = useState(null);

  useEffect(()=>{
    async function load(){
      let context = null;
      if(mode==="estimate"){
        const { data:e } = await supabase.from("hers_estimates").select("*").eq("id",estimateId).maybeSingle();
        if(!e){ setLoading(false); return; }
        context = e;
        setAddress(e.address||"");
      } else {
        const { data:i } = await supabase.from("hers_invoices").select("*").eq("id",invoiceId).maybeSingle();
        if(!i){ setLoading(false); return; }
        context = i;
        setAddress(i.address||"");
      }
      if(context.customer_id){
        const { data:cust } = await supabase.from("customers").select("id,name,phone,company_name").eq("id",context.customer_id).maybeSingle();
        if(cust) setCustomer(cust);
      }
      const fmQuery = mode==="estimate"
        ? supabase.from("hers_field_measurements").select("*").eq("hers_estimate_id",estimateId)
        : supabase.from("hers_field_measurements").select("*").eq("hers_invoice_id",invoiceId);
      const { data:fmData } = await fmQuery.maybeSingle();
      setFm(fmData||null);
      setLoading(false);
    }
    load();
  },[invoiceId, estimateId, mode]);

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:"#64748b"}}>
      Loading…
    </div>
  );

  // Parse measurement data
  const cfaFloors = parseArr(fm?.floors||[]);
  const totalCFA = cfaFloors.reduce((s,f)=>f.cfaInclude===false?s:s+(Number(f.width)||0)*(Number(f.length)||0),0);
  const totalVol = cfaFloors.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0)*(Number(f.height)||0),0);
  // Group the flat measurement rows by floor label so the report shows one
  // heading per floor (with a subtotal) instead of repeating the floor name
  // on every single measurement row.
  const cfaGroups = [];
  { const gm={}; cfaFloors.forEach(f=>{ const key=f.label||"Floor"; if(!gm[key]){ gm[key]={label:key,rows:[]}; cfaGroups.push(gm[key]); } gm[key].rows.push(f); }); }
  const bedrooms = Number(fm?.bedrooms||0);
  const allWindows  = parseArr(fm?.windows||[]);
  // Only print windows that are actually finished — width, height, and
  // top-to-overhang all filled in — so a half-started row never shows
  // up as a blank entry on the printed report. Incomplete ones are
  // still saved in the data, just not shown here until complete.
  const windows = allWindows.filter(w=>Number(w.width)>0 && Number(w.height)>0 && w.top_to_overhang!=="" && w.top_to_overhang!=null);

  // Parse floor-structured areas (v2 format) or flat areas
  const savedAreas = parseArr(fm?.areas||[]);
  let allAreas = [];
  if(savedAreas.length && savedAreas[0]?.floor_name){
    allAreas = savedAreas.flatMap(f=>(f.areas||[]).map(a=>({...a,floor:f.floor_name})));
  } else {
    allAreas = savedAreas.map(a=>({...a,floor:""}));
  }

  // Aggregate sqft by area type across all floors
  const byType = {};
  allAreas.forEach(a=>{
    if(!a.area_type||!(a.sqft>0)) return;
    if(!byType[a.area_type]) byType[a.area_type] = { sqft:0, instances:[] };
    byType[a.area_type].sqft += a.sqft;
    byType[a.area_type].instances.push({floor:a.floor,sqft:a.sqft,label:a.customLabel||"",material:a.material||"",thickness:a.thickness_in||"",r_value:a.r_value||""});
  });

  // Group windows by orientation for Ekotrope
  const windowsByOrientation = {};
  windows.forEach(w=>{
    const or = w.orientation||"N";
    if(!windowsByOrientation[or]) windowsByOrientation[or] = [];
    windowsByOrientation[or].push(w);
  });
  // Sort each orientation's windows by floor (using the floor order from the
  // CFA/Volume measurements) so windows on the same floor stay grouped
  // together, instead of showing in whatever order they were entered.
  const floorOrder = [];
  cfaFloors.forEach(f=>{ if(f.label && !floorOrder.includes(f.label)) floorOrder.push(f.label); });
  Object.values(windowsByOrientation).forEach(wins=>{
    wins.sort((a,b)=>{
      const ai = floorOrder.indexOf(a.floor), bi = floorOrder.indexOf(b.floor);
      if(ai===-1 && bi===-1) return 0;
      if(ai===-1) return 1;
      if(bi===-1) return -1;
      return ai-bi;
    });
  });

  const ROW = { display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"10px 14px", borderBottom:"1px solid #f1f5f9", fontSize:14 };
  const VAL = { fontWeight:700, color:"#0f172a", fontSize:15, minWidth:80, textAlign:"right" };
  const SEC = { fontSize:10, fontWeight:800, color:"#94a3b8", textTransform:"uppercase",
    letterSpacing:1, padding:"10px 14px 4px", borderBottom:"1px solid #e2e8f0", background:"#f8fafc" };
  const CARD_S = { background:"#fff", borderRadius:10, border:"1px solid #e2e8f0",
    marginBottom:16, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.06)" };

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:"#f4f5f7",paddingBottom:60}}>

      {/* Print-only header (hidden on screen) */}
      <div className="print-header">
        <div style={{fontSize:18,fontWeight:800,color:"#0f172a"}}>🟦 Ekotrope Data Entry Report</div>
        <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{customer?.name||""}{address?` · ${address}`:""}</div>
      </div>

      {/* Screen header */}
      <div style={{background:"#111827",padding:"14px 20px",
          display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>🟦 Ekotrope Data Entry Report</div>
          <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{customer?.name||""}{address?` · ${address}`:""}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>window.print()}
            style={{height:32,padding:"0 14px",borderRadius:6,border:"none",
              background:"#059669",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
            🖨 Print
          </button>
          <button onClick={()=>navigate(-1)}
            style={{height:32,padding:"0 14px",borderRadius:6,border:"1px solid #374151",
              background:"transparent",color:"#94a3b8",cursor:"pointer",fontSize:12}}>
            ← Back
          </button>
        </div>
      </div>

      <div style={{maxWidth:720,margin:"0 auto",padding:"20px 16px"}}>

        {!fm && (
          <div style={{...CARD_S,padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:13}}>
            No measurements saved yet. Go to Field Measurements to enter data first.
          </div>
        )}

        {fm && (
          <>
            {/* ── Building Summary ── */}
            <div style={CARD_S}>
              <div style={SEC}>Building Summary</div>
              <div style={ROW}>
                <span style={{color:"#64748b"}}>Conditioned Floor Area (CFA)</span>
                <span style={{...VAL,color:"#059669"}}>{fmt(totalCFA,0)} ft²</span>
              </div>
              <div style={ROW}>
                <span style={{color:"#64748b"}}>Conditioned Volume</span>
                <span style={{...VAL,color:"#059669"}}>{fmt(totalVol,0)} ft³</span>
              </div>
              <div style={{...ROW,borderBottom:"none"}}>
                <span style={{color:"#64748b"}}>Bedrooms</span>
                <span style={VAL}>{bedrooms}</span>
              </div>
            </div>

            {/* ── CFA Floor Breakdown ── */}
            {cfaFloors.length>0 && (
              <div style={CARD_S}>
                <div style={SEC}>CFA &amp; Volume — Floor Breakdown</div>
                {cfaGroups.map((g,gi)=>{
                  const groupCFA = g.rows.reduce((s,f)=>f.cfaInclude===false?s:s+(Number(f.width)||0)*(Number(f.length)||0),0);
                  const groupVol = g.rows.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0)*(Number(f.height)||0),0);
                  return (
                    <div key={g.label||gi} style={{marginBottom:gi<cfaGroups.length-1?12:0,paddingBottom:gi<cfaGroups.length-1?10:0,borderBottom:gi<cfaGroups.length-1?"1px solid #f1f5f9":"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
                        <div style={{fontSize:13,color:"#0f172a",fontWeight:700}}>{g.label}</div>
                        <div style={{textAlign:"right"}}>
                          <span style={{...VAL,fontSize:13,color:"#059669"}}>{fmt(groupCFA,0)} ft²</span>
                          <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>{fmt(groupVol,0)} ft³</span>
                        </div>
                      </div>
                      {g.rows.map((f,i)=>{
                        const cfa = (Number(f.width)||0)*(Number(f.length)||0);
                        const vol = cfa*(Number(f.height)||0);
                        const counted = f.cfaInclude!==false;
                        return (
                          <div key={f.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"3px 0 3px 10px"}}>
                            <div style={{fontSize:11,color:"#94a3b8"}}>
                              {f.width||"?"} × {f.length||"?"} × {f.height||"?"}ft
                              {!counted && <span style={{fontSize:10,color:"#b45309",fontWeight:700,marginLeft:6}}>VOLUME ONLY</span>}
                            </div>
                            <div style={{textAlign:"right"}}>
                              <span style={{fontSize:12,color:counted?"#0f172a":"#cbd5e1",textDecoration:counted?"none":"line-through"}}>{fmt(cfa,0)} ft²</span>
                              <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>{fmt(vol,0)} ft³</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Areas by Type (for Ekotrope) ── */}
            {Object.keys(byType).length>0 && (
              <div style={CARD_S}>
                <div style={SEC}>Envelope Areas — Enter into Ekotrope</div>
                {Object.entries(byType).map(([type,data],i,arr)=>(
                  <div key={type}>
                    <div style={{...ROW,alignItems:"flex-start",borderBottom:i<arr.length-1?"1px solid #f1f5f9":"none"}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:4}}>{type}</div>
                        {data.instances.map((inst,j)=>(
                          <div key={j} style={{fontSize:11,color:"#64748b",lineHeight:1.8}}>
                            {inst.floor&&<span style={{background:"#f1f5f9",borderRadius:4,padding:"1px 6px",marginRight:6,fontSize:10}}>{inst.floor}</span>}
                            {inst.label&&<span style={{color:"#94a3b8",marginRight:6}}>{inst.label}</span>}
                            <span style={{fontWeight:600}}>{fmt(inst.sqft,0)} ft²</span>
                            {(inst.material||inst.thickness||inst.r_value)&&(
                              <span style={{color:"#94a3b8",marginLeft:6}}>
                                {[inst.material,inst.thickness,inst.r_value].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={{textAlign:"right",paddingLeft:16,flexShrink:0}}>
                        <div style={{fontSize:22,fontWeight:800,color:"#059669"}}>{fmt(data.sqft,0)}</div>
                        <div style={{fontSize:10,color:"#94a3b8"}}>ft²</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Windows ── */}
            {windows.length>0 && (
              <div style={CARD_S}>
                <div style={SEC}>Windows — By Orientation</div>
                {Object.entries(windowsByOrientation).map(([orientation,wins],oi,oarr)=>{
                  const elevations = [...new Set(wins.map(w=>w.elevation).filter(Boolean))];
                  const elevLabel = elevations.length ? ` - ${elevations.join(", ")}` : "";
                  return (
                    <div key={orientation} style={{borderBottom:oi<oarr.length-1?"1px solid #e2e8f0":"none",paddingBottom:oi<oarr.length-1?10:0,marginBottom:oi<oarr.length-1?10:0}}>
                      <div style={{fontSize:14,fontWeight:800,color:"#0f172a",padding:"8px 0"}}>
                        {ORIENTATION_NAMES[orientation]||orientation}{elevLabel}
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                        {wins.map((w,wi)=>{
                          const qty = Number(w.qty)||1;
                          const eachArea = (Number(w.width)||0)*(Number(w.height)||0);
                          const area = eachArea*qty;
                          return (
                            <div key={w.id||wi} style={{border:"1px solid #0f172a",borderRadius:8,padding:"8px 10px",flex:"1 1 210px",minWidth:190,maxWidth:260}}>
                              <div style={{fontSize:13,fontWeight:600,color:"#0f172a",marginBottom:4}}>
                                {w.floor && <span style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>{w.floor} - </span>}
                                {w.label||`Window ${wi+1}`}{qty>1?` (×${qty})`:""}
                              </div>
                              <div style={{fontSize:12,color:"#64748b"}}>
                                {w.width||"?"} × {w.height||"?"} ft{qty>1?` × ${qty}`:""} = {fmt(area,1)} ft²
                              </div>
                              {(w.u_factor||w.shgc) && (
                                <div style={{marginTop:3,fontSize:11,color:"#0369a1"}}>
                                  {w.u_factor && <span>U-Factor: <b>{w.u_factor}</b></span>}
                                  {w.u_factor && w.shgc && <span style={{margin:"0 6px"}}>·</span>}
                                  {w.shgc && <span>SHGC: <b>{w.shgc}</b></span>}
                                </div>
                              )}
                              {(w.top_to_overhang||w.bottom_to_overhang||w.overhang_depth) && (
                                <div style={{marginTop:4,fontSize:11,color:"#7c3aed",lineHeight:1.8}}>
                                  {w.overhang_depth && <div>Overhang depth: <b>{w.overhang_depth} ft</b></div>}
                                  <div>Top→overhang: <b>{w.top_to_overhang||"—"} ft</b></div>
                                  <div>Bottom→overhang: <b>{w.bottom_to_overhang||"—"} ft</b></div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── No data sections ── */}
            {Object.keys(byType).length===0 && (
              <div style={{...CARD_S,padding:"20px",textAlign:"center",color:"#94a3b8",fontSize:13}}>
                No areas entered yet. Add measurements in the Field Measurements page.
              </div>
            )}

            {windows.length===0 && (
              <div style={{...CARD_S,padding:"14px",textAlign:"center",color:"#94a3b8",fontSize:13}}>
                No windows entered yet.
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: white !important; margin: 0 !important; }
          
          /* Hide UI controls */
          button { display: none !important; }
          
          /* Remove fixed height constraints that clip to one page */
          html, body { height: auto !important; overflow: visible !important; }
          #root > div { height: auto !important; min-height: 0 !important; }
          
          /* Hide the dark header bar — show a clean print header instead */
          div[style*="background:#111827"],
          div[style*="background: #111827"] {
            display: none !important;
          }
          
          /* Remove background and shadows from cards for clean print */
          div[style*="background:#f4f5f7"],
          div[style*="background: #f4f5f7"] {
            background: white !important;
            padding-top: 0 !important;
          }
          
          /* Allow cards to break across pages naturally */
          div[style*="border-radius:10px"],
          div[style*="border-radius: 10px"] {
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Print header — shown only when printing */
          .print-header {
            display: block !important;
            padding: 0 0 12px 0;
            margin-bottom: 16px;
            border-bottom: 2px solid #0f172a;
            font-family: Inter, system-ui, sans-serif;
          }
        }

        /* Hide print-only header on screen */
        .print-header { display: none; }
      `}</style>
    </div>
  );
}
