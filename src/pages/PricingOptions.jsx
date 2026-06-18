// Shared pricing-option controls used by both HersEstimate.jsx and HersInvoice.jsx.
// Extracted to a single file so Markup/Discount/Deposit/Payment Schedule logic and
// styling can't drift between the two pages the way the address autocomplete did.

const I = {
  height: 22, fontSize: 11, borderRadius: 4, border: "1px solid #e2e8f0",
  background: "#fff", padding: "0 5px", width: "100%",
  boxSizing: "border-box", color: "#0f172a", outline: "none",
};
const Btn = {
  height: 22, fontSize: 11, borderRadius: 4, border: "1px solid #e2e8f0",
  background: "#fff", padding: "0 8px", cursor: "pointer", color: "#0f172a",
  fontWeight: 600,
};

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}

export function AdjustmentRow({ label, open, type, value, amount, onAdd, onTypeChange, onValueChange, onRemove }) {
  if(!open){
    return (
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0"}}>
        <span style={{fontSize:13,color:"#0f172a"}}>{label}</span>
        <button onClick={onAdd} style={{border:"none",background:"none",color:"#059669",
            cursor:"pointer",fontSize:12,fontWeight:700}}>+ Add</button>
      </div>
    );
  }
  return (
    <div style={{padding:"7px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:13,color:"#0f172a",fontWeight:600}}>{label}</span>
        <button onClick={onRemove} style={{border:"none",background:"none",color:"#94a3b8",
            cursor:"pointer",fontSize:12}}>✕ Remove</button>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <select value={type} onChange={e=>onTypeChange(e.target.value)} style={{...I,width:64,fontSize:12,flexShrink:0}}>
          <option value="percent">%</option>
          <option value="fixed">$</option>
        </select>
        <input type="number" value={value} onChange={e=>onValueChange(e.target.value)}
          placeholder={type==="percent"?"e.g. 15":"e.g. 100.00"}
          style={{...I,flex:1,fontSize:12,minWidth:0}} />
        <span style={{fontSize:12,color:"#64748b",whiteSpace:"nowrap",flexShrink:0}}>
          = ${fmt(amount)}
        </span>
      </div>
    </div>
  );
}

export function PaymentScheduleEditor({ open, schedule, grandTotal, scheduledTotal, onAdd, onChange, onRemoveAll, installmentAmount }) {
  function addInstallment(){
    onChange([...schedule, { id: Date.now()+Math.random(), label:`Payment ${schedule.length+1}`, type:"percent", value:"" }]);
  }
  function updateInstallment(idx, field, val){
    onChange(schedule.map((s,i)=> i===idx ? {...s,[field]:val} : s));
  }
  function removeInstallment(idx){
    onChange(schedule.filter((_,i)=>i!==idx));
  }
  const diff = Math.round((grandTotal-scheduledTotal)*100)/100;

  if(!open){
    return (
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0"}}>
        <span style={{fontSize:13,color:"#0f172a"}}>Payment Schedule</span>
        <button onClick={onAdd} style={{border:"none",background:"none",color:"#059669",
            cursor:"pointer",fontSize:12,fontWeight:700}}>+ Add</button>
      </div>
    );
  }
  return (
    <div style={{padding:"7px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:13,color:"#0f172a",fontWeight:600}}>Payment Schedule</span>
        <button onClick={onRemoveAll} style={{border:"none",background:"none",color:"#94a3b8",
            cursor:"pointer",fontSize:12}}>✕ Remove</button>
      </div>
      {schedule.map((s,idx)=>(
        <div key={s.id} style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
          <input value={s.label} onChange={e=>updateInstallment(idx,"label",e.target.value)}
            placeholder="Label" style={{...I,flex:1.4,fontSize:12,minWidth:0}} />
          <select value={s.type} onChange={e=>updateInstallment(idx,"type",e.target.value)}
            style={{...I,width:56,fontSize:12,flexShrink:0}}>
            <option value="percent">%</option>
            <option value="fixed">$</option>
          </select>
          <input type="number" value={s.value} onChange={e=>updateInstallment(idx,"value",e.target.value)}
            placeholder="0" style={{...I,width:64,fontSize:12,flexShrink:0}} />
          <span style={{fontSize:12,color:"#64748b",minWidth:64,textAlign:"right",flexShrink:0}}>
            ${fmt(installmentAmount(s))}
          </span>
          <button onClick={()=>removeInstallment(idx)}
            style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:14,flexShrink:0}}>✕</button>
        </div>
      ))}
      <button onClick={addInstallment} style={{...Btn,fontSize:11,marginTop:2}}>+ Add installment</button>
      {schedule.length>0 && Math.abs(diff)>0.01 && (
        <div style={{fontSize:11,color:"#b45309",marginTop:8,lineHeight:1.4}}>
          ⚠️ Scheduled payments total ${fmt(scheduledTotal)}, which is {diff>0
            ? `$${fmt(diff)} short of`
            : `$${fmt(Math.abs(diff))} over`} the grand total (${fmt(grandTotal)}).
        </div>
      )}
    </div>
  );
}
