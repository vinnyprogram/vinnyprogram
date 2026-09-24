import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const C = { bg:"#f4f5f7", white:"#fff", ink:"#0f172a", muted:"#64748b",
  faint:"#94a3b8", border:"#e2e8f0", green:"#059669" };
const CARD = { background:C.white, borderRadius:12, padding:16, marginBottom:14,
  boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}` };
const I = { width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`,
  fontSize:14, boxSizing:"border-box" };
const Btn = { border:`1px solid ${C.border}`, background:"#fff", color:C.ink,
  padding:"8px 14px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 };
const BtnD = { border:"none", background:C.green, color:"#fff",
  padding:"8px 16px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 };

// Searchable "HVAC contractor" picker - same pattern as the client-company
// picker on the Clients page. Typing filters the existing directory;
// picking one auto-fills phone/email so they don't need retyping every job.
// If nothing matches, offers to save it as a new contractor on the spot.
function ContractorPicker({ value, contractors, onPick, onCreateNew }){
  const [query, setQuery] = useState(value||"");
  const [open, setOpen] = useState(false);
  useEffect(()=>{ setQuery(value||""); },[value]);
  const q = query.trim().toLowerCase();
  const matches = q ? contractors.filter(c=>c.name.toLowerCase().includes(q)) : contractors;
  const exactMatch = contractors.find(c=>c.name.toLowerCase()===q);
  return (
    <div style={{position:"relative"}}>
      <input placeholder="HVAC contractor name" value={query}
        onChange={e=>{ setQuery(e.target.value); setOpen(true); onPick(null,e.target.value); }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>setTimeout(()=>setOpen(false),150)}
        style={{...I,marginBottom:8}} />
      {open && (matches.length>0 || q) && (
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:20,background:"#fff",
            border:`1px solid ${C.border}`,borderRadius:8,marginTop:-4,maxHeight:200,overflowY:"auto",
            boxShadow:"0 6px 18px rgba(0,0,0,.1)"}}>
          {matches.map(c=>(
            <div key={c.id} onMouseDown={()=>{ onPick(c.id,c.name); setQuery(c.name); setOpen(false); }}
              style={{padding:"8px 10px",cursor:"pointer",fontSize:13,borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontWeight:600}}>
                {c.is_hvac_contractor && <span title="Already tagged as an HVAC contractor" style={{marginRight:4}}>🔧</span>}
                {c.name}
              </div>
              {(c.phone||c.email) && <div style={{fontSize:11,color:C.muted}}>{[c.phone,c.email].filter(Boolean).join(" · ")}</div>}
            </div>
          ))}
          {q && !exactMatch && (
            <div onMouseDown={()=>{ onCreateNew(query.trim()); setOpen(false); }}
              style={{padding:"8px 10px",cursor:"pointer",fontSize:13,color:"#2563eb",fontWeight:600}}>
              + Save "{query.trim()}" as a new contractor
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Simplified peak solar heat gain (Btu/h per sqft of glass) by compass
// orientation - a standard simplification used in quick load estimates.
// Not ACCA's full CLTD/CLF methodology (which varies by hour, latitude,
// and month) - a reasonable approximation for a preliminary estimate.
const SOLAR_GAIN = { N:30, NE:90, E:140, SE:130, S:100, SW:130, W:140, NW:90 };

// Classifies a HERS/Insulation area_type string into which envelope
// component it contributes to - free-text categories, matched by keyword,
// same pattern used elsewhere in the app (areaTypePriority).
function classifyEnvelope(areaType){
  const t = (areaType||"").toLowerCase();
  if(t.includes("ceiling")||t.includes("roof")||t.includes("attic")) return "ceiling";
  if(t.includes("floor")||t.includes("rim joist")||t.includes("crawlspace")||t.includes("basement")||t.includes("slab")) return "floor";
  if(t.includes("wall") && !t.includes("interior") && !t.includes("demising")) return "wall";
  return null; // interior partitions, fire blocking, etc - not exterior envelope
}
function rValueToU(rValueStr){
  const r = parseInt((rValueStr||"").replace(/\D/g,""))||0;
  return r>0 ? 1/r : 0.5; // uninsulated fallback - conservative, flags attention
}

// Converts a HERS field-measurement record (areas grouped by floor, plus a
// flat windows list) into "zones" (one per floor) with aggregated envelope
// UA (U x Area) and window data - the direct input this calc engine needs.
function zonesFromHers(fm){
  const areasByFloor = fm.areas || [];
  return areasByFloor.map(f=>{
    let wall_ua=0, ceiling_ua=0, floor_ua=0, sqft=0;
    (f.areas||[]).forEach(a=>{
      const cls = classifyEnvelope(a.area_type);
      const u = rValueToU(a.r_value);
      const areaSqft = Number(a.sqft)||0;
      if(cls==="wall"){ wall_ua += areaSqft*u; sqft += areaSqft; }
      else if(cls==="ceiling"){ ceiling_ua += areaSqft*u; }
      else if(cls==="floor"){ floor_ua += areaSqft*u; }
    });
    const windows = (fm.windows||[]).filter(w=>w.floor===f.floor_name).map(w=>({
      sqft: (Number(w.width)||0)*(Number(w.height)||0)*(Number(w.qty)||1),
      u_factor: w.u_factor!=null?Number(w.u_factor):0.5,
      shgc: w.shgc!=null?Number(w.shgc):0.4,
      orientation: w.orientation||"N",
    }));
    return { name:f.floor_name, sqft, volume_cf: sqft*8, occupants:0, wall_ua, ceiling_ua, floor_ua, windows };
  });
}

// The actual calculation - standard heat-transfer physics (U x A x deltaT
// for conduction, ACH-based infiltration, ASHRAE per-person internal gain
// assumptions, simplified peak solar factors for windows). This is a
// PRELIMINARY ESTIMATE, not an ACCA Manual J(R)-certified calculation -
// "Manual J" and "ACCA" are registered trademarks and their compliant
// methodology requires going through ACCA's software approval process.
function calculateZone(zone, cond){
  const dtHeat = cond.indoorTempHeating - cond.designTempHeating;
  const dtCool = cond.designTempCooling - cond.indoorTempCooling;

  const windowUA = zone.windows.reduce((s,w)=>s+(w.sqft*w.u_factor),0);
  const windowSolar = zone.windows.reduce((s,w)=>s+(w.sqft*w.shgc*(SOLAR_GAIN[w.orientation]||100)),0);
  const envelopeUA = (zone.wall_ua||0)+(zone.ceiling_ua||0)+(zone.floor_ua||0)+windowUA;

  const volumeCf = zone.volume_cf || (zone.sqft||0)*8;
  const cfm = (volumeCf*(cond.infiltrationAch||0.35))/60;

  const heatingBtu = Math.round(envelopeUA*dtHeat + 1.1*cfm*dtHeat);

  const occupants = Number(zone.occupants)||0;
  const coolingSensible = Math.round(
    envelopeUA*dtCool + 1.1*cfm*dtCool + windowSolar + occupants*230 + (zone.sqft||0)*0.6
  );
  const coolingLatent = Math.round(29*cfm + occupants*200);
  const coolingTotal = coolingSensible + coolingLatent;

  return { heating_btu:heatingBtu, cooling_sensible:coolingSensible, cooling_latent:coolingLatent, cooling_total:coolingTotal };
}

const EMPTY_JOB = {
  customer_id:null, hers_estimate_id:null, address:"", job_type:"New Construction",
  hvac_contractor_customer_id:null, hvac_contractor_name:"", hvac_contractor_phone:"", hvac_contractor_email:"",
  design_temp_heating:10, design_temp_cooling:92, indoor_temp_heating:70, indoor_temp_cooling:75,
  infiltration_ach:0.35, zones:[], results:{}, notes:"", status:"Draft",
};

export default function LoadCalc(){
  const { id } = useParams();
  const navigate = useNavigate();
  const { company } = useAuth();
  const isNew = !id;

  const [job, setJob] = useState(EMPTY_JOB);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [hersJobs, setHersJobs] = useState([]);
  const [showImportPicker, setShowImportPicker] = useState(false);

  useEffect(()=>{
    supabase.from("customers").select("*").order("name").then(({data})=>{ if(data) setCustomers(data); });
  },[]);

  // HVAC contractors are just customers too - so a contractor who's also a
  // customer never gets entered twice, and adding one here makes them show
  // up in Clients/CRM as well. Only needs a name at creation time; phone/
  // email can be filled in on the job form (or later, on their customer
  // record) since those stay as separate editable fields either way.
  async function createNewContractor(name){
    const { data, error } = await supabase.from("customers")
      .insert([{ name, company_id: company?.id, is_hvac_contractor:true }])
      .select().maybeSingle();
    if(error){ alert("Could not save contractor: "+error.message); return; }
    setCustomers(p=>[...p, data]);
    setJob(p=>({ ...p, hvac_contractor_customer_id:data.id, hvac_contractor_name:data.name }));
  }

  // Picking an existing customer as the contractor tags them as an HVAC
  // contractor going forward too (if they weren't already) - being used in
  // this role is the actual signal we care about, whether or not someone
  // remembered to tag them ahead of time.
  async function tagAsContractorIfNeeded(customerId){
    const c = customers.find(x=>x.id===customerId);
    if(c && !c.is_hvac_contractor){
      await supabase.from("customers").update({ is_hvac_contractor:true }).eq("id",customerId);
      setCustomers(p=>p.map(x=>x.id===customerId?{...x,is_hvac_contractor:true}:x));
    }
  }

  useEffect(()=>{
    if(isNew){ setLoading(false); return; }
    (async()=>{
      const { data } = await supabase.from("load_calc_jobs").select("*").eq("id",id).maybeSingle();
      if(data) setJob({ ...EMPTY_JOB, ...data, zones: data.zones||[], results: data.results||{} });
      setLoading(false);
    })();
  },[id]);

  // Finds this customer's existing HERS jobs so their building data can be
  // pulled in instead of re-entered from scratch.
  async function findHersJobsForCustomer(customerId){
    const { data } = await supabase.from("hers_estimates").select("id,address,created_at")
      .eq("customer_id",customerId).order("created_at",{ascending:false});
    setHersJobs(data||[]);
    setShowImportPicker(true);
  }

  async function importFromHers(hersEstimateId){
    const { data:fm } = await supabase.from("hers_field_measurements").select("*")
      .eq("hers_estimate_id",hersEstimateId).limit(1).maybeSingle();
    if(!fm){ alert("No field measurements found on that HERS job yet."); return; }
    const zones = zonesFromHers(fm);
    setJob(p=>({ ...p, hers_estimate_id:hersEstimateId, zones }));
    setShowImportPicker(false);
  }

  function addBlankZone(){
    setJob(p=>({ ...p, zones:[...p.zones, {
      name:`Zone ${p.zones.length+1}`, sqft:0, volume_cf:0, occupants:0,
      wall_ua:0, ceiling_ua:0, floor_ua:0, windows:[], results:{},
    }]}));
  }
  function updateZone(idx, field, val){
    setJob(p=>({ ...p, zones: p.zones.map((z,i)=>i===idx?{...z,[field]:val}:z) }));
  }
  function removeZone(idx){
    setJob(p=>({ ...p, zones: p.zones.filter((_,i)=>i!==idx) }));
  }

  function runCalculation(){
    const cond = {
      designTempHeating: Number(job.design_temp_heating)||10,
      designTempCooling: Number(job.design_temp_cooling)||92,
      indoorTempHeating: Number(job.indoor_temp_heating)||70,
      indoorTempCooling: Number(job.indoor_temp_cooling)||75,
      infiltrationAch: Number(job.infiltration_ach)||0.35,
    };
    const zonesWithResults = job.zones.map(z=>({ ...z, results: calculateZone(z, cond) }));
    const whole = zonesWithResults.reduce((acc,z)=>({
      heating_btu: acc.heating_btu + z.results.heating_btu,
      cooling_sensible: acc.cooling_sensible + z.results.cooling_sensible,
      cooling_latent: acc.cooling_latent + z.results.cooling_latent,
      cooling_total: acc.cooling_total + z.results.cooling_total,
    }), { heating_btu:0, cooling_sensible:0, cooling_latent:0, cooling_total:0 });
    whole.tons = Math.round((whole.cooling_total/12000)*100)/100;
    setJob(p=>({ ...p, zones: zonesWithResults, results: whole }));
  }

  async function save(){
    setSaving(true);
    const payload = { ...job, company_id: company?.id, updated_at: new Date().toISOString() };
    delete payload.id;
    if(isNew){
      const { data, error } = await supabase.from("load_calc_jobs").insert([payload]).select().single();
      setSaving(false);
      if(error){ alert("Could not save: "+error.message); return; }
      navigate(`/load-calc/${data.id}`, { replace:true });
    } else {
      const { error } = await supabase.from("load_calc_jobs").update(payload).eq("id",id);
      setSaving(false);
      if(error){ alert("Could not save: "+error.message); return; }
    }
  }

  if(loading) return <div style={{textAlign:"center",color:C.faint,padding:40}}>Loading…</div>;

  const selectedCustomer = customers.find(c=>c.id===job.customer_id);

  return (
    <div style={{padding:"20px 16px",maxWidth:820,margin:"0 auto",fontFamily:"system-ui,sans-serif"}} className="no-print">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <button onClick={()=>navigate("/load-calc")} style={Btn}>← Back</button>
        <div style={{fontSize:11,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"4px 10px",fontWeight:600}}>
          ⚠️ Preliminary Load Estimate — not ACCA Manual J® certified
        </div>
      </div>

      <div style={CARD}>
        <div style={{fontSize:16,fontWeight:800,marginBottom:10}}>Job Info</div>
        <select value={job.customer_id||""} onChange={e=>{
            const cid = Number(e.target.value)||null;
            setJob(p=>({...p,customer_id:cid}));
            if(cid) findHersJobsForCustomer(cid);
          }} style={{...I,marginBottom:8}}>
          <option value="">Select customer…</option>
          {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="Address" value={job.address} onChange={e=>setJob(p=>({...p,address:e.target.value}))} style={{...I,marginBottom:8}} />
        <select value={job.job_type} onChange={e=>setJob(p=>({...p,job_type:e.target.value}))} style={{...I,marginBottom:8}}>
          <option>New Construction</option><option>Replacement</option><option>Addition</option>
        </select>
        <div style={{fontSize:12,fontWeight:700,color:C.muted,marginTop:10,marginBottom:6}}>HVAC Contractor (who this report is for)</div>
        <ContractorPicker value={job.hvac_contractor_name} contractors={customers}
          onPick={(id,name)=>{
            const match = id ? customers.find(c=>c.id===id) : null;
            setJob(p=>({ ...p,
              hvac_contractor_customer_id: id,
              hvac_contractor_name: name,
              hvac_contractor_phone: match?.phone || p.hvac_contractor_phone,
              hvac_contractor_email: match?.email || p.hvac_contractor_email,
            }));
            if(id) tagAsContractorIfNeeded(id);
          }}
          onCreateNew={createNewContractor} />
        <input placeholder="Contractor phone" value={job.hvac_contractor_phone} onChange={e=>setJob(p=>({...p,hvac_contractor_phone:e.target.value}))} style={{...I,marginBottom:8}} />
        <input placeholder="Contractor email" value={job.hvac_contractor_email} onChange={e=>setJob(p=>({...p,hvac_contractor_email:e.target.value}))} style={I} />
      </div>

      {showImportPicker && (
        <div style={CARD}>
          <div style={{fontSize:14,fontWeight:800,marginBottom:8}}>Import building data from an existing HERS job?</div>
          {hersJobs.length===0 ? (
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>No HERS jobs found for this customer — you can enter zones manually below instead.</div>
          ) : hersJobs.map(h=>(
            <button key={h.id} onClick={()=>importFromHers(h.id)} style={{...Btn,display:"block",width:"100%",textAlign:"left",marginBottom:6}}>
              {h.address||"(no address)"} — {new Date(h.created_at).toLocaleDateString()}
            </button>
          ))}
          <button onClick={()=>setShowImportPicker(false)} style={{...Btn,marginTop:4}}>Skip — I'll enter zones manually</button>
        </div>
      )}

      <div style={CARD}>
        <div style={{fontSize:16,fontWeight:800,marginBottom:10}}>Design Conditions</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div><div style={{fontSize:11,color:C.muted,marginBottom:2}}>Outdoor design temp — heating (°F)</div>
            <input type="number" value={job.design_temp_heating} onChange={e=>setJob(p=>({...p,design_temp_heating:e.target.value}))} style={I} /></div>
          <div><div style={{fontSize:11,color:C.muted,marginBottom:2}}>Outdoor design temp — cooling (°F)</div>
            <input type="number" value={job.design_temp_cooling} onChange={e=>setJob(p=>({...p,design_temp_cooling:e.target.value}))} style={I} /></div>
          <div><div style={{fontSize:11,color:C.muted,marginBottom:2}}>Indoor design temp — heating (°F)</div>
            <input type="number" value={job.indoor_temp_heating} onChange={e=>setJob(p=>({...p,indoor_temp_heating:e.target.value}))} style={I} /></div>
          <div><div style={{fontSize:11,color:C.muted,marginBottom:2}}>Indoor design temp — cooling (°F)</div>
            <input type="number" value={job.indoor_temp_cooling} onChange={e=>setJob(p=>({...p,indoor_temp_cooling:e.target.value}))} style={I} /></div>
        </div>
        <div style={{fontSize:11,color:C.muted,marginBottom:2}}>Infiltration (air changes per hour)</div>
        <input type="number" step="0.05" value={job.infiltration_ach} onChange={e=>setJob(p=>({...p,infiltration_ach:e.target.value}))} style={{...I,width:120}} />
      </div>

      <div style={CARD}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:16,fontWeight:800}}>Zones ({job.zones.length})</div>
          <button onClick={addBlankZone} style={Btn}>+ Add Zone</button>
        </div>
        {job.zones.length===0 && <div style={{fontSize:12,color:C.faint}}>No zones yet — import from a HERS job above, or add one manually.</div>}
        {job.zones.map((z,idx)=>(
          <div key={idx} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginBottom:8}}>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <input value={z.name} onChange={e=>updateZone(idx,"name",e.target.value)} placeholder="Zone name (e.g. First Floor)" style={{...I,flex:1}} />
              <button onClick={()=>removeZone(idx)} style={{border:"none",background:"none",color:"#dc2626",cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
              <div><div style={{fontSize:10,color:C.faint}}>Floor sqft</div><input type="number" value={z.sqft} onChange={e=>updateZone(idx,"sqft",Number(e.target.value))} style={I} /></div>
              <div><div style={{fontSize:10,color:C.faint}}>Occupants</div><input type="number" value={z.occupants} onChange={e=>updateZone(idx,"occupants",Number(e.target.value))} style={I} /></div>
              <div><div style={{fontSize:10,color:C.faint}}>Volume (ft³)</div><input type="number" value={z.volume_cf} onChange={e=>updateZone(idx,"volume_cf",Number(e.target.value))} style={I} /></div>
            </div>
            <div style={{fontSize:10,color:C.faint,marginBottom:2}}>Envelope UA (U × Area) — wall / ceiling / floor</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
              <input type="number" step="0.1" value={z.wall_ua} onChange={e=>updateZone(idx,"wall_ua",Number(e.target.value))} style={I} placeholder="Wall UA" />
              <input type="number" step="0.1" value={z.ceiling_ua} onChange={e=>updateZone(idx,"ceiling_ua",Number(e.target.value))} style={I} placeholder="Ceiling UA" />
              <input type="number" step="0.1" value={z.floor_ua} onChange={e=>updateZone(idx,"floor_ua",Number(e.target.value))} style={I} placeholder="Floor UA" />
            </div>
            <div style={{fontSize:10,color:C.faint}}>{(z.windows||[]).length} window(s) imported {z.windows?.length>0 && `— ${z.windows.reduce((s,w)=>s+w.sqft,0).toFixed(0)} sqft total`}</div>
            {z.results?.heating_btu>0 && (
              <div style={{marginTop:6,fontSize:12,fontWeight:700,color:C.green}}>
                Heating: {z.results.heating_btu.toLocaleString()} Btu/h · Cooling: {z.results.cooling_total.toLocaleString()} Btu/h
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={runCalculation} disabled={job.zones.length===0} style={{...BtnD,flex:1}}>⚡ Calculate</button>
        <button onClick={save} disabled={saving} style={{...Btn,flex:1}}>{saving?"Saving…":"💾 Save"}</button>
        {job.results?.tons>0 && <button onClick={()=>window.print()} style={{...Btn,flex:1}}>🖨️ Print Report</button>}
      </div>

      {job.results?.tons>0 && (
        <div style={CARD}>
          <div style={{fontSize:16,fontWeight:800,marginBottom:10}}>Whole-House Results</div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:4}}>
            <span>Total Heating</span><b>{job.results.heating_btu.toLocaleString()} Btu/h</b>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:4}}>
            <span>Total Cooling</span><b>{job.results.cooling_total.toLocaleString()} Btu/h</b>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:16,color:C.green,fontWeight:800,marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
            <span>Cooling Tons</span><span>{job.results.tons} tons</span>
          </div>
        </div>
      )}

      {job.results?.tons>0 && (
        <div className="print-only" style={{display:"none"}}>
          <PrintableReport job={job} customer={selectedCustomer} />
        </div>
      )}

      <style>{`
        @media print {
          .no-print > *:not(.print-only) { display: none !important; }
          .print-only { display: block !important; }
        }
      `}</style>
    </div>
  );
}

function PrintableReport({ job, customer }){
  return (
    <div style={{fontFamily:"system-ui,sans-serif",padding:24,color:"#0f172a"}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:800}}>RESIDENTIAL HVAC LOAD CALCULATION</div>
        <div style={{fontSize:12,color:"#b45309",marginTop:4}}>Preliminary Estimate — Not ACCA Manual J® Certified</div>
      </div>
      <div style={{marginBottom:16,fontSize:13}}>
        <div><b>Project:</b> {customer?.name||"—"}</div>
        <div><b>Address:</b> {job.address}</div>
        <div><b>Type:</b> {job.job_type}</div>
        {job.hvac_contractor_name && <div><b>Prepared for:</b> {job.hvac_contractor_name}</div>}
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
        <thead>
          <tr style={{background:"#f1f5f9"}}>
            <th style={{textAlign:"left",padding:8,border:"1px solid #e2e8f0"}}>Zone</th>
            <th style={{textAlign:"right",padding:8,border:"1px solid #e2e8f0"}}>Heating (Btu/h)</th>
            <th style={{textAlign:"right",padding:8,border:"1px solid #e2e8f0"}}>Cooling (Btu/h)</th>
          </tr>
        </thead>
        <tbody>
          {job.zones.map((z,i)=>(
            <tr key={i}>
              <td style={{padding:8,border:"1px solid #e2e8f0"}}>{z.name}</td>
              <td style={{textAlign:"right",padding:8,border:"1px solid #e2e8f0"}}>{(z.results?.heating_btu||0).toLocaleString()}</td>
              <td style={{textAlign:"right",padding:8,border:"1px solid #e2e8f0"}}>{(z.results?.cooling_total||0).toLocaleString()}</td>
            </tr>
          ))}
          <tr style={{fontWeight:800}}>
            <td style={{padding:8,border:"1px solid #e2e8f0"}}>Total</td>
            <td style={{textAlign:"right",padding:8,border:"1px solid #e2e8f0"}}>{job.results.heating_btu.toLocaleString()}</td>
            <td style={{textAlign:"right",padding:8,border:"1px solid #e2e8f0"}}>{job.results.cooling_total.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
      <div style={{fontSize:14,fontWeight:700}}>
        Cooling: {job.results.cooling_total.toLocaleString()} ÷ 12,000 = {job.results.tons} tons
      </div>
    </div>
  );
}
