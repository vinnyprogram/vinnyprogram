import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#f4f5f7", white: "#fff", ink: "#0f172a",
  muted: "#64748b", faint: "#94a3b8",
  border: "#e2e8f0", green: "#059669",
};
const I = {
  height: 32, fontSize: 13, borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.white, padding: "0 8px", boxSizing: "border-box",
  color: C.ink, outline: "none", width: "100%",
};
const Btn = {
  height: 32, fontSize: 12, borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.white, padding: "0 12px", cursor: "pointer", color: C.ink,
  whiteSpace: "nowrap", fontWeight: 600,
};
const BtnD = {
  height: 32, fontSize: 12, borderRadius: 6, border: "none",
  background: C.ink, padding: "0 14px", cursor: "pointer", color: "#fff",
  whiteSpace: "nowrap", fontWeight: 700, display: "inline-flex", alignItems: "center",
};
const CARD = {
  background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
  padding: "14px 16px", marginBottom: 12,
};
const lbl = { fontSize:9, color:C.faint, fontWeight:700, textTransform:"uppercase", marginBottom:2 };

const ORIENTATIONS = ["N","NE","E","SE","S","SW","W","NW"];

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:1,maximumFractionDigits:1});
}
function parseArr(v) {
  return Array.isArray(v) ? v : (typeof v==="string" ? JSON.parse(v||"[]") : []);
}
function withId(x) {
  return { ...x, id: x.id||Date.now()+Math.random() };
}

function SegmentList({ title, segments, onChange, unit }) {
  function add(){ onChange([...segments, { id:Date.now()+Math.random(), label:`Segment ${segments.length+1}`, length:"" }]); }
  function update(idx,field,val){ onChange(segments.map((s,i)=>i===idx?{...s,[field]:val}:s)); }
  function remove(idx){ onChange(segments.filter((_,i)=>i!==idx)); }
  const total = segments.reduce((s,x)=>s+(Number(x.length)||0),0);
  return (
    <div style={CARD}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>{title}</div>
        <div style={{fontSize:13,fontWeight:700,color:C.green}}>Total: {fmt(total)} {unit}</div>
      </div>
      {segments.map((s,idx)=>(
        <div key={s.id} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
          <input value={s.label} onChange={e=>update(idx,"label",e.target.value)} placeholder="Label" style={{...I,flex:1.4,fontSize:12}} />
          <input type="number" value={s.length} onChange={e=>update(idx,"length",e.target.value)} placeholder="0" style={{...I,width:80,fontSize:12,textAlign:"right",flexShrink:0}} />
          <span style={{fontSize:11,color:C.faint,flexShrink:0}}>{unit}</span>
          <button onClick={()=>remove(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
        </div>
      ))}
      <button onClick={add} style={{...Btn,marginTop:4}}>+ Add Segment</button>
    </div>
  );
}

function FloorsEditor({ floors, onChange }) {
  function add(){ onChange([...floors, { id:Date.now()+Math.random(), label:`Floor ${floors.length+1}`, width:"", length:"", height:"" }]); }
  function update(idx,field,val){ onChange(floors.map((f,i)=>i===idx?{...f,[field]:val}:f)); }
  function remove(idx){ onChange(floors.filter((_,i)=>i!==idx)); }
  const totalCFA = floors.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0),0);
  const totalVol = floors.reduce((s,f)=>s+(Number(f.width)||0)*(Number(f.length)||0)*(Number(f.height)||0),0);
  return (
    <div style={CARD}>
      <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
        Floors / Levels — CFA &amp; Volume
      </div>
      {floors.map((f,idx)=>{
        const cfa = (Number(f.width)||0)*(Number(f.length)||0);
        const vol = cfa*(Number(f.height)||0);
        return (
          <div key={f.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
            <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
              <input value={f.label} onChange={e=>update(idx,"label",e.target.value)} placeholder="e.g. 1st Floor" style={{...I,flex:1,fontSize:12}} />
              <button onClick={()=>remove(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
              <div><div style={lbl}>Width (ft)</div><input type="number" value={f.width} onChange={e=>update(idx,"width",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
              <div><div style={lbl}>Length (ft)</div><input type="number" value={f.length} onChange={e=>update(idx,"length",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
              <div><div style={lbl}>Height (ft)</div><input type="number" value={f.height} onChange={e=>update(idx,"height",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted}}>
              <span>CFA: <b style={{color:C.green}}>{fmt(cfa)} ft²</b></span>
              <span>Volume: <b style={{color:C.green}}>{fmt(vol)} ft³</b></span>
            </div>
          </div>
        );
      })}
      <button onClick={add} style={Btn}>+ Add Floor/Level</button>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,
          borderTop:`1px solid ${C.border}`,fontSize:13,fontWeight:700}}>
        <span>Total CFA: <span style={{color:C.green}}>{fmt(totalCFA)} ft²</span></span>
        <span>Total Volume: <span style={{color:C.green}}>{fmt(totalVol)} ft³</span></span>
      </div>
    </div>
  );
}

function WindowsEditor({ windows, onChange }) {
  function add(){ onChange([...windows, { id:Date.now()+Math.random(), label:`Window ${windows.length+1}`,
    orientation:"N", width:"", height:"", top_to_overhang:"", bottom_to_overhang:"", overhang_depth:"" }]); }
  function update(idx,field,val){ onChange(windows.map((w,i)=>i===idx?{...w,[field]:val}:w)); }
  function remove(idx){ onChange(windows.filter((_,i)=>i!==idx)); }
  return (
    <div style={CARD}>
      <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
        Windows
      </div>
      {windows.map((w,idx)=>(
        <div key={w.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
          <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
            <input value={w.label} onChange={e=>update(idx,"label",e.target.value)} placeholder="e.g. Living room" style={{...I,flex:1,fontSize:12}} />
            <select value={w.orientation} onChange={e=>update(idx,"orientation",e.target.value)} style={{...I,width:60,fontSize:12,flexShrink:0}}>
              {ORIENTATIONS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
            <button onClick={()=>remove(idx)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            <div><div style={lbl}>Width (ft)</div><input type="number" value={w.width} onChange={e=>update(idx,"width",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
            <div><div style={lbl}>Height (ft)</div><input type="number" value={w.height} onChange={e=>update(idx,"height",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
          </div>
          <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>
            Overhang shading (optional, for Ekotrope)
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div><div style={lbl}>Top→overhang</div><input type="number" value={w.top_to_overhang} onChange={e=>update(idx,"top_to_overhang",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
            <div><div style={lbl}>Bottom→overhang</div><input type="number" value={w.bottom_to_overhang} onChange={e=>update(idx,"bottom_to_overhang",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
            <div><div style={lbl}>Overhang depth</div><input type="number" value={w.overhang_depth} onChange={e=>update(idx,"overhang_depth",e.target.value)} style={{...I,fontSize:12,textAlign:"right"}} /></div>
          </div>
        </div>
      ))}
      <button onClick={add} style={Btn}>+ Add Window</button>
    </div>
  );
}

export default function HersFieldMeasurements() {
  const navigate = useNavigate();
  const { invoiceId } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const [invoice, setInvoice]   = useState(null);
  const [customer, setCustomer] = useState(null);

  const [floors, setFloors] = useState([]);
  const [roofSegments, setRoofSegments] = useState([]);
  const [wallSegments, setWallSegments] = useState([]);
  const [rimJoistSegments, setRimJoistSegments] = useState([]);
  const [bedrooms, setBedrooms] = useState("0");
  const [windows, setWindows] = useState([]);
  const [notes, setNotes] = useState("");

  const [photos, setPhotos]   = useState([]);
  const [docs, setDocs]       = useState([]);
  const [uploading, setUploading]       = useState(false);
  const [uploadingDoc, setUploadingDoc]   = useState(false);

  useEffect(()=>{ load(); },[]);

  async function load() {
    const { data:inv } = await supabase.from("hers_invoices").select("*").eq("id", invoiceId).maybeSingle();
    if(!inv){ setLoading(false); return; }
    setInvoice(inv);
    if(inv.customer_id){
      const { data:cust } = await supabase.from("customers")
        .select("id,name,phone,company_name").eq("id", inv.customer_id).maybeSingle();
      if(cust) setCustomer(cust);
    }

    const { data:fm } = await supabase.from("hers_field_measurements")
      .select("*").eq("hers_invoice_id", invoiceId).maybeSingle();
    if(fm){
      setFloors(parseArr(fm.floors).map(withId));
      setRoofSegments(parseArr(fm.roof_segments).map(withId));
      setWallSegments(parseArr(fm.wall_segments).map(withId));
      setRimJoistSegments(parseArr(fm.rim_joist_segments).map(withId));
      setBedrooms(String(fm.bedrooms||0));
      setWindows(parseArr(fm.windows).map(withId));
      setNotes(fm.notes||"");
    }

    const { data:phData } = await supabase.from("job_photos")
      .select("*").eq("hers_invoice_id", invoiceId).is("doc_type", null)
      .order("created_at",{ascending:false});
    setPhotos(phData||[]);
    const { data:docData } = await supabase.from("job_photos")
      .select("*").eq("hers_invoice_id", invoiceId).eq("doc_type","document")
      .order("created_at",{ascending:false});
    setDocs(docData||[]);

    setLoading(false);
  }

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.muted}}>
      Loading…
    </div>
  );

  if(!invoice) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.muted,gap:10}}>
      <div>Invoice not found.</div>
      <button onClick={()=>navigate("/hers/invoices")} style={Btn}>← Back to invoices</button>
    </div>
  );

  async function save(){
    if(saving) return;
    setSaving(true);
    try {
      const payload = {
        hers_invoice_id: invoiceId,
        company_id: invoice.company_id,
        floors: floors.map(f=>({id:f.id,label:f.label||"",width:Number(f.width)||0,length:Number(f.length)||0,height:Number(f.height)||0})),
        roof_segments: roofSegments.map(s=>({id:s.id,label:s.label||"",length:Number(s.length)||0})),
        wall_segments: wallSegments.map(s=>({id:s.id,label:s.label||"",length:Number(s.length)||0})),
        rim_joist_segments: rimJoistSegments.map(s=>({id:s.id,label:s.label||"",length:Number(s.length)||0})),
        bedrooms: Number(bedrooms)||0,
        windows: windows.map(w=>({
          id:w.id, label:w.label||"", orientation:w.orientation||"N",
          width:Number(w.width)||0, height:Number(w.height)||0,
          top_to_overhang: w.top_to_overhang!==""? Number(w.top_to_overhang):null,
          bottom_to_overhang: w.bottom_to_overhang!==""? Number(w.bottom_to_overhang):null,
          overhang_depth: w.overhang_depth!==""? Number(w.overhang_depth):null,
        })),
        notes,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("hers_field_measurements")
        .upsert(payload, { onConflict: "hers_invoice_id" });
      if(error) throw error;
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    } catch(err){
      alert("Error saving: "+(err.message||JSON.stringify(err)));
    }
    setSaving(false);
  }

  async function uploadPhotos(files){
    if(!files?.length) return;
    setUploading(true);
    let errorMsgs = [];
    for(const file of Array.from(files)){
      const ext = file.name.split('.').pop();
      const path = `${invoice.company_id}/hers/${invoiceId}/${Date.now()}.${ext}`;
      const { error:upErr } = await supabase.storage.from("job-photos").upload(path, file);
      if(upErr){ errorMsgs.push(upErr.message||JSON.stringify(upErr)); continue; }
      const { data:urlData } = supabase.storage.from("job-photos").getPublicUrl(path);
      const { error:insErr } = await supabase.from("job_photos").insert([{
        hers_invoice_id: invoiceId, url: urlData.publicUrl, company_id: invoice.company_id,
      }]);
      if(insErr) errorMsgs.push(insErr.message||JSON.stringify(insErr));
    }
    if(errorMsgs.length>0) alert(`Upload failed:\n${errorMsgs.join("\n")}`);
    await load();
    setUploading(false);
  }

  async function uploadDocs(files){
    if(!files?.length) return;
    setUploadingDoc(true);
    for(const file of Array.from(files)){
      const path = `${invoice.company_id}/hers/${invoiceId}/docs/${Date.now()}_${file.name}`;
      const { error:upErr } = await supabase.storage.from("job-photos").upload(path, file);
      if(upErr){ console.error(upErr); continue; }
      const { data:urlData } = supabase.storage.from("job-photos").getPublicUrl(path);
      await supabase.from("job_photos").insert([{
        hers_invoice_id: invoiceId, url: urlData.publicUrl, caption: file.name,
        company_id: invoice.company_id, doc_type: "document",
      }]);
    }
    await load();
    setUploadingDoc(false);
  }

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:C.bg,minHeight:"100vh",paddingBottom:60}}>

      {saved && (
        <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:300,
            background:"#059669",color:"#fff",padding:"8px 16px",borderRadius:20,fontSize:12,fontWeight:700,
            boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>
          ✅ Saved!
        </div>
      )}

      {/* header */}
      <div style={{position:"sticky",top:0,zIndex:100,background:C.white,borderBottom:`1px solid ${C.border}`,
          padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>navigate(-1)} style={Btn}>← Back</button>
        <span style={{fontWeight:700,fontSize:14,flex:1,textAlign:"center"}}>
          📐 Field Measurements
        </span>
        <button onClick={save} disabled={saving} style={{...BtnD,opacity:saving?0.6:1}}>
          {saving?"Saving…":"Save"}
        </button>
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"16px 14px"}}>

        {/* job reference - read only */}
        <div style={{...CARD, background:"#f8fafc"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.ink}}>{customer?.name||"Unknown"}</div>
          {invoice.address && <div style={{fontSize:12,color:C.muted,marginTop:2}}>📍 {invoice.address}</div>}
        </div>

        {/* bedrooms */}
        <div style={CARD}>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <span style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>Bedrooms</span>
            <input type="number" value={bedrooms} onChange={e=>setBedrooms(e.target.value)} style={{...I,width:80}} />
          </div>
        </div>

        <FloorsEditor floors={floors} onChange={setFloors} />
        <SegmentList title="Roof Line" segments={roofSegments} onChange={setRoofSegments} unit="ft" />
        <SegmentList title="Exterior Walls" segments={wallSegments} onChange={setWallSegments} unit="ft" />
        <SegmentList title="Rim Joist" segments={rimJoistSegments} onChange={setRimJoistSegments} unit="ft" />
        <WindowsEditor windows={windows} onChange={setWindows} />

        {/* notes */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>
            Notes
          </div>
          <textarea placeholder="Notes from the field…" value={notes} onChange={e=>setNotes(e.target.value)}
            rows={2} style={{...I,height:"auto",padding:"8px",resize:"none",fontFamily:"inherit"}} />
        </div>

        {/* photos */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>
              📷 Photos
            </div>
            <div style={{display:"flex",gap:6}}>
              <label style={{border:"none",background:C.ink,color:"white",padding:"6px 12px",
                  borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700}}>
                📷 Camera
                <input type="file" accept="image/*" capture="environment" multiple
                  style={{display:"none"}} onChange={e=>uploadPhotos(e.target.files)} />
              </label>
              <label style={{border:`1px solid ${C.border}`,background:"white",color:"#374151",
                  padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700}}>
                🖼 Gallery
                <input type="file" accept="image/*" multiple
                  style={{display:"none"}} onChange={e=>uploadPhotos(e.target.files)} />
              </label>
            </div>
          </div>
          {uploading && <div style={{textAlign:"center",padding:"12px 0",fontSize:12,color:C.muted}}>Uploading photos…</div>}
          {photos.length===0 ? (
            <div style={{textAlign:"center",padding:"20px 0",color:C.faint,fontSize:12}}>
              No photos yet — tap Camera or Gallery to add
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
              {photos.map(ph=>(
                <div key={ph.id} style={{position:"relative",paddingBottom:"100%",borderRadius:8,overflow:"hidden",background:"#f1f5f9"}}>
                  <img src={ph.url} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",cursor:"pointer"}}
                    onClick={()=>window.open(ph.url,"_blank")} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* documents */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>
              📁 Documents &amp; Drawings
            </div>
            <label style={{border:"none",background:C.ink,color:"white",padding:"6px 12px",
                borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700,display:"inline-block"}}>
              + Upload
              <input type="file" accept="application/pdf,image/*,.dwg,.dxf,.doc,.docx" multiple
                style={{display:"none"}} onChange={e=>uploadDocs(e.target.files)} />
            </label>
          </div>
          {uploadingDoc && <div style={{fontSize:12,color:C.muted,textAlign:"center",padding:"8px 0"}}>Uploading…</div>}
          {docs.length===0 ? (
            <div style={{textAlign:"center",padding:"16px 0",color:C.faint,fontSize:12}}>
              No documents yet — tap Upload to add PDFs or drawings
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {docs.map(d=>(
                <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",
                    background:"#f8fafc",borderRadius:8,border:`1px solid ${C.border}`}}>
                  <span style={{fontSize:18}}>{(d.caption||"").toLowerCase().endsWith(".pdf")?"📄":"📎"}</span>
                  <span style={{flex:1,fontSize:12,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {d.caption||"Document"}
                  </span>
                  <button onClick={()=>window.open(d.url,"_blank")}
                    style={{border:"none",background:"#eff6ff",color:"#3b82f6",padding:"4px 10px",
                      borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
