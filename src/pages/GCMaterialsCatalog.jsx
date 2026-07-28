import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#f4f5f7", white: "#fff", ink: "#0f172a",
  muted: "#64748b", faint: "#94a3b8",
  border: "#e2e8f0", green: "#059669", amber: "#b45309",
};
const I = {
  height: 32, fontSize: 13, borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.white, padding: "0 8px", boxSizing: "border-box",
  color: C.ink, outline: "none",
};
const Btn = {
  height: 32, fontSize: 12, borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.white, padding: "0 12px", cursor: "pointer", color: C.ink,
  whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", fontWeight: 600,
};
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }

export default function GCMaterialsCatalog(){
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [templateCategories, setTemplateCategories] = useState([]); // distinct categories available to import
  const [selectedImportCats, setSelectedImportCats] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(()=>{
    (async()=>{
      const { data:{user} } = await supabase.auth.getUser();
      if(!user) return;
      const { data:cd } = await supabase.from("companies").select("id").eq("user_id",user.id).maybeSingle();
      setCompanyId(cd?.id||null);
      if(cd?.id){
        const { data:own } = await supabase.from("gc_materials").select("*").eq("company_id",cd.id).order("category").order("brand");
        setMaterials(own||[]);
        const { data:templates } = await supabase.from("gc_materials").select("category").is("company_id",null);
        setTemplateCategories([...new Set((templates||[]).map(t=>t.category))].sort());
      }
      setLoading(false);
    })();
  },[]);

  async function importSelected(){
    if(!selectedImportCats.length || !companyId) return;
    setImporting(true);
    try {
      const { data:toImport, error } = await supabase.from("gc_materials").select("*")
        .is("company_id",null).in("category",selectedImportCats);
      if(error) throw error;
      const existingKeys = new Set(materials.map(m=>`${m.category}|${m.brand}|${m.model}|${m.size}`));
      const newRows = (toImport||[])
        .filter(t=>!existingKeys.has(`${t.category}|${t.brand}|${t.model}|${t.size}`))
        .map(t=>({
          company_id: companyId, category: t.category, brand: t.brand, model: t.model,
          thickness: t.thickness, size: t.size, coverage_sqft: t.coverage_sqft,
          unit: t.unit, unit_price: t.unit_price, sku: t.sku, supplier: t.supplier,
          notes: t.notes, sort_order: t.sort_order,
        }));
      if(newRows.length){
        const { data:inserted, error:ie } = await supabase.from("gc_materials").insert(newRows).select();
        if(ie) throw ie;
        setMaterials(prev=>[...prev, ...(inserted||[])]);
      }
      alert(`Imported ${newRows.length} material(s). ${(toImport||[]).length-newRows.length} already existed and were skipped.`);
      setSelectedImportCats([]);
      setImportOpen(false);
    } catch(e){
      alert("Import failed: "+e.message);
    } finally {
      setImporting(false);
    }
  }

  function addRow(){
    setMaterials(prev=>[{
      id:"new-"+uid(), _isNew:true, category:"", brand:"", model:"", thickness:"", size:"",
      coverage_sqft:"", unit:"each", unit_price:"", notes:"",
    }, ...prev]);
  }
  function updateRow(id, field, value){
    setMaterials(prev=>prev.map(m=>m.id===id?{...m,[field]:value}:m));
  }
  async function saveRow(m){
    const payload = {
      company_id: companyId, category: m.category, brand: m.brand, model: m.model,
      thickness: m.thickness, size: m.size, coverage_sqft: m.coverage_sqft?Number(m.coverage_sqft):null,
      unit: m.unit, unit_price: Number(m.unit_price)||0, notes: m.notes,
    };
    if(m._isNew){
      const { data, error } = await supabase.from("gc_materials").insert([payload]).select().single();
      if(error){ alert("Save failed: "+error.message); return; }
      setMaterials(prev=>prev.map(x=>x.id===m.id?{...data}:x));
    } else {
      const { error } = await supabase.from("gc_materials").update(payload).eq("id",m.id);
      if(error){ alert("Save failed: "+error.message); return; }
      setMaterials(prev=>prev.map(x=>x.id===m.id?{...x,_dirty:false}:x));
    }
  }
  async function deleteRow(m){
    if(!m._isNew && !window.confirm(`Delete "${m.brand} ${m.model}"?`)) return;
    if(!m._isNew) await supabase.from("gc_materials").delete().eq("id",m.id);
    setMaterials(prev=>prev.filter(x=>x.id!==m.id));
  }

  const ownCategories = [...new Set(materials.map(m=>m.category).filter(Boolean))].sort();
  const filtered = materials.filter(m=>{
    if(categoryFilter && m.category!==categoryFilter) return false;
    if(search.trim()){
      const s = search.toLowerCase();
      if(!`${m.brand} ${m.model} ${m.thickness} ${m.size}`.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  if(loading) return <div style={{padding:40,textAlign:"center",color:C.muted}}>Loading…</div>;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"Inter,system-ui,sans-serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"12px 16px",background:C.white,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:10}}>
        <button onClick={()=>navigate(-1)} style={Btn}>← Back</button>
        <div style={{fontWeight:800,fontSize:15}}>📦 Materials Catalog</div>
        <button onClick={addRow} style={{...Btn,background:C.ink,color:"#fff",border:"none"}}>+ Add Material</button>
      </div>

      <div style={{maxWidth:900,margin:"0 auto",padding:"14px 12px"}}>

        {/* Import starter materials */}
        <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px 16px",marginBottom:14}}>
          <div onClick={()=>setImportOpen(p=>!p)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
            <div style={{fontWeight:700,fontSize:14}}>⬇️ Import Starter Materials</div>
            <span style={{fontSize:12,color:C.faint}}>{importOpen?"▲":"▼"}</span>
          </div>
          {importOpen && (
            <div style={{marginTop:12}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:10}}>
                Pick the categories relevant to your work — only checked categories get imported into your catalog, and anything you already have won't be duplicated.
              </div>
              <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:8}}>
                <button onClick={()=>setSelectedImportCats(templateCategories)} style={{...Btn,fontSize:11,height:26,padding:"0 8px"}}>Select all</button>
                <button onClick={()=>setSelectedImportCats([])} style={{...Btn,fontSize:11,height:26,padding:"0 8px"}}>Clear</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))",gap:6,marginBottom:12}}>
                {templateCategories.map(cat=>(
                  <label key={cat} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer"}}>
                    <input type="checkbox" checked={selectedImportCats.includes(cat)}
                      onChange={e=>setSelectedImportCats(prev=>e.target.checked?[...prev,cat]:prev.filter(c=>c!==cat))} />
                    {cat}
                  </label>
                ))}
              </div>
              <button onClick={importSelected} disabled={!selectedImportCats.length||importing}
                style={{...Btn,background:selectedImportCats.length?C.amber:C.faint,color:"#fff",border:"none",opacity:importing?0.6:1}}>
                {importing?"Importing…":`Import ${selectedImportCats.length} categor${selectedImportCats.length===1?"y":"ies"}`}
              </button>
            </div>
          )}
        </div>

        {/* Filter/search */}
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} style={{...I,width:180}}>
            <option value="">All categories</option>
            {ownCategories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Search brand/model/size…" value={search} onChange={e=>setSearch(e.target.value)} style={{...I,flex:1}} />
        </div>

        <div style={{fontSize:12,color:C.muted,marginBottom:8}}>{filtered.length} material(s)</div>

        {filtered.map(m=>(
          <div key={m.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginBottom:8}}>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <input placeholder="Category" value={m.category||""} onChange={e=>updateRow(m.id,"category",e.target.value)} style={{...I,width:140}} />
              <input placeholder="Brand" value={m.brand||""} onChange={e=>updateRow(m.id,"brand",e.target.value)} style={{...I,flex:1}} />
              <input placeholder="Model" value={m.model||""} onChange={e=>updateRow(m.id,"model",e.target.value)} style={{...I,flex:2}} />
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input placeholder="Thickness" value={m.thickness||""} onChange={e=>updateRow(m.id,"thickness",e.target.value)} style={{...I,width:90}} />
              <input placeholder="Size" value={m.size||""} onChange={e=>updateRow(m.id,"size",e.target.value)} style={{...I,width:110}} />
              <input placeholder="Coverage sqft" inputMode="decimal" value={m.coverage_sqft||""} onChange={e=>updateRow(m.id,"coverage_sqft",e.target.value)} style={{...I,width:100}} />
              <input placeholder="Unit" value={m.unit||""} onChange={e=>updateRow(m.id,"unit",e.target.value)} style={{...I,width:70}} />
              <input placeholder="$/unit" inputMode="decimal" value={m.unit_price||""} onChange={e=>updateRow(m.id,"unit_price",e.target.value)} style={{...I,width:80}} />
              <button onClick={()=>saveRow(m)} style={{...Btn,color:C.green,borderColor:C.green}}>Save</button>
              <button onClick={()=>deleteRow(m)} style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
          </div>
        ))}

        {filtered.length===0 && (
          <div style={{textAlign:"center",color:C.faint,fontSize:13,padding:"30px 0"}}>
            No materials yet — import a starter category above, or add one manually.
          </div>
        )}
      </div>
    </div>
  );
}
