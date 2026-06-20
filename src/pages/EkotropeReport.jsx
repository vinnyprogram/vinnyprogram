import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

function parseArr(v){ return Array.isArray(v)?v:(typeof v==="string"?JSON.parse(v||"[]"):[]); }
function fmt(n,d=1){ return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}); }

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
  const bedrooms = Number(fm?.bedrooms||0);
  const windows  = parseArr(fm?.windows||[]);

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

  const ROW = { display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"10px 14px", borderBottom:"1px solid #f1f5f9", fontSize:14 };
  const VAL = { fontWeight:700, color:"#0f172a", fontSize:15, minWidth:80, textAlign:"right" };
  const SEC = { fontSize:10, fontWeight:800, color:"#94a3b8", textTransform:"uppercase",
    letterSpacing:1, padding:"10px 14px 4px", borderBottom:"1px solid #e2e8f0", background:"#f8fafc" };
  const CARD_S = { background:"#fff", borderRadius:10, border:"1px solid #e2e8f0",
    marginBottom:16, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.06)" };

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:"#f4f5f7",minHeight:"100vh",paddingBottom:60}}>

      {/* header */}
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
                {cfaFloors.map((f,i)=>{
                  const cfa = (Number(f.width)||0)*(Number(f.length)||0);
                  const vol = cfa*(Number(f.height)||0);
                  const counted = f.cfaInclude!==false;
                  return (
                    <div key={f.id||i} style={{...ROW,borderBottom:i<cfaFloors.length-1?"1px solid #f1f5f9":"none"}}>
                      <div>
                        <div style={{fontSize:13,color:"#0f172a",fontWeight:600}}>
                          {f.label||`Floor ${i+1}`}
                          {!counted && <span style={{fontSize:10,color:"#b45309",fontWeight:700,marginLeft:6}}>VOLUME ONLY</span>}
                        </div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>
                          {f.width||"?"} × {f.length||"?"} × {f.height||"?"}ft
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{...VAL,fontSize:13,color:counted?"#0f172a":"#cbd5e1",textDecoration:counted?"none":"line-through"}}>{fmt(cfa,0)} ft²</div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>{fmt(vol,0)} ft³</div>
                      </div>
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
                  const totalWinArea = wins.reduce((s,w)=>(s+(Number(w.width)||0)*(Number(w.height)||0)*(Number(w.qty)||1)),0);
                  const totalCount = wins.reduce((s,w)=>s+(Number(w.qty)||1),0);
                  return (
                    <div key={orientation} style={{borderBottom:oi<oarr.length-1?"1px solid #e2e8f0":"none"}}>
                      <div style={{...SEC,background:"#eff6ff",color:"#1d4ed8",fontSize:11}}>
                        {orientation} — {totalCount} window{totalCount!==1?"s":""} · {fmt(totalWinArea,1)} ft² total
                      </div>
                      {wins.map((w,wi)=>{
                        const qty = Number(w.qty)||1;
                        const eachArea = (Number(w.width)||0)*(Number(w.height)||0);
                        const area = eachArea*qty;
                        return (
                          <div key={w.id||wi} style={{...ROW,borderBottom:wi<wins.length-1?"1px solid #f1f5f9":"none",alignItems:"flex-start"}}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color:"#0f172a",marginBottom:4}}>
                                {w.label||`Window ${wi+1}`}{qty>1?` (×${qty})`:""}
                              </div>
                              <div style={{fontSize:12,color:"#64748b"}}>
                                {w.width||"?"} × {w.height||"?"} ft{qty>1?` × ${qty}`:""} = {fmt(area,1)} ft²
                              </div>
                              {(w.top_to_overhang||w.bottom_to_overhang||w.overhang_depth) && (
                                <div style={{marginTop:4,fontSize:11,color:"#7c3aed",lineHeight:1.8}}>
                                  {w.overhang_depth && <div>Overhang depth: <b>{w.overhang_depth} ft</b></div>}
                                  <div>Top→overhang: <b>{w.top_to_overhang||"—"} ft</b></div>
                                  <div>Bottom→overhang: <b>{w.bottom_to_overhang||"—"} ft</b></div>
                                </div>
                              )}
                            </div>
                            <div style={{textAlign:"right",paddingLeft:16,flexShrink:0}}>
                              <div style={{fontSize:18,fontWeight:800,color:"#3b82f6"}}>{fmt(area,1)}</div>
                              <div style={{fontSize:10,color:"#94a3b8"}}>ft²</div>
                              <div style={{fontSize:11,fontWeight:700,color:"#1d4ed8",marginTop:2,whiteSpace:"nowrap"}}>
                                {w.orientation}{w.elevation?` · ${w.elevation}`:""}
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
          body { background: white !important; }
          button { display: none !important; }
          div[style*="background:#111827"] { background: white !important; color: black !important; }
          div[style*="background:#111827"] div { color: black !important; }
        }
      `}</style>
    </div>
  );
}
