import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#f4f5f7", white: "#fff", ink: "#0f172a",
  muted: "#64748b", faint: "#94a3b8",
  border: "#e2e8f0", green: "#059669",
  greenBg: "#f0fdf4", chip: "#f1f5f9",
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
const BtnD = {
  height: 32, fontSize: 12, borderRadius: 6, border: "none",
  background: C.ink, padding: "0 14px", cursor: "pointer", color: "#fff",
  whiteSpace: "nowrap", fontWeight: 700, display: "inline-flex", alignItems: "center",
};
const CARD = {
  background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
  padding: "14px 16px", marginBottom: 12,
};
const STATUS_COLORS = {
  "Unpaid":  { bg:"#fee2e2", text:"#dc2626" },
  "Partial": { bg:"#fff7ed", text:"#f97316" },
  "Paid":    { bg:"#dcfce7", text:"#059669" },
  "Void":    { bg:"#f1f5f9", text:"#64748b" },
};
const PAY_METHODS = {
  "Cash":  "💵",
  "Check": "🧾",
  "Card":  "💳",
  "Other": "📝",
};

function fmt(n) {
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}

export default function HersInvoice() {
  const navigate = useNavigate();
  const { id: invoiceId } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const [invoice, setInvoice]   = useState(null);
  const [customer, setCustomer] = useState(null);

  const [payments, setPayments] = useState([]);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payDate, setPayDate]     = useState(new Date().toISOString().slice(0,10));
  const [dueDate, setDueDate]     = useState("");
  const [isVoid, setIsVoid]       = useState(false);
  const [notes, setNotes]         = useState("");

  useEffect(()=>{ load(); },[]);

  async function load() {
    const { data:inv } = await supabase.from("hers_invoices").select("*").eq("id", invoiceId).maybeSingle();
    if(!inv){ setLoading(false); return; }
    setInvoice(inv);
    let pmts = Array.isArray(inv.payments) ? inv.payments
      : (typeof inv.payments === "string" ? JSON.parse(inv.payments||"[]") : []);
    // legacy fallback: if this invoice has an old-style amount_paid but no ledger entries, preserve it as one entry
    if(pmts.length===0 && Number(inv.amount_paid)>0){
      pmts = [{ id: "legacy", amount: Number(inv.amount_paid), method: "Other",
        date: (inv.updated_at||inv.created_at||"").slice(0,10) }];
    }
    setPayments(pmts);
    setDueDate(inv.due_date||"");
    setIsVoid(inv.status==="Void");
    setNotes(inv.notes||"");
    if(inv.customer_id){
      const { data:cust } = await supabase.from("customers")
        .select("id,name,phone,email,company_name").eq("id", inv.customer_id).maybeSingle();
      if(cust) setCustomer(cust);
    }
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
      <button onClick={()=>navigate("/hers/search")} style={Btn}>← Back to estimates</button>
    </div>
  );

  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items
    : (typeof invoice.line_items === "string" ? JSON.parse(invoice.line_items||"[]") : []);

  const subtotal = Number(invoice.subtotal)||0;
  const grandTotal = Number(invoice.grand_total)||0;
  const markupAmount = invoice.markup_value ? (invoice.markup_type==="percent" ? subtotal*(Number(invoice.markup_value)||0)/100 : (Number(invoice.markup_value)||0)) : 0;
  const discountAmount = invoice.discount_value ? (invoice.discount_type==="percent" ? subtotal*(Number(invoice.discount_value)||0)/100 : (Number(invoice.discount_value)||0)) : 0;
  const depositAmount = invoice.deposit_value ? (invoice.deposit_type==="percent" ? grandTotal*(Number(invoice.deposit_value)||0)/100 : (Number(invoice.deposit_value)||0)) : 0;
  const paymentSchedule = Array.isArray(invoice.payment_schedule) ? invoice.payment_schedule
    : (typeof invoice.payment_schedule === "string" ? JSON.parse(invoice.payment_schedule||"[]") : []);
  function installmentAmount(s){
    return s.type==="percent" ? grandTotal*(Number(s.value)||0)/100 : (Number(s.value)||0);
  }

  const totalPaid = payments.reduce((s,p)=>s+(Number(p.amount)||0),0);
  const balanceDue = Math.max(0, Math.round((grandTotal-totalPaid)*100)/100);
  const derivedStatus = isVoid ? "Void" : (totalPaid<=0 ? "Unpaid" : totalPaid>=grandTotal ? "Paid" : "Partial");
  const depositReceived = depositAmount>0 && totalPaid>=depositAmount;

  async function save(){
    if(saving) return;
    setSaving(true);
    try {
      const nowPaidInFull = derivedStatus==="Paid";
      const payload = {
        payments: payments.map(p=>({
          id: p.id, amount: Math.round((Number(p.amount)||0)*100)/100, method: p.method||"Other", date: p.date||null,
        })),
        amount_paid: Math.round(totalPaid*100)/100,
        due_date: dueDate||null,
        status: derivedStatus,
        deposit_paid: depositReceived,
        notes,
        paid_at: nowPaidInFull ? (invoice.paid_at || new Date().toISOString()) : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("hers_invoices").update(payload).eq("id", invoiceId);
      if(error) throw error;
      setInvoice(p=>({...p, ...payload}));
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    } catch(err){
      alert("Error saving: "+(err.message||JSON.stringify(err)));
    }
    setSaving(false);
  }

  function addPayment(){
    const amt = Number(payAmount);
    if(!amt || amt<=0){ alert("Enter a payment amount greater than $0."); return; }
    setPayments(p=>[...p, { id: Date.now()+Math.random(), amount: amt, method: payMethod, date: payDate }]);
    setPayAmount("");
  }

  function removePayment(id){
    if(!window.confirm("Remove this payment record?")) return;
    setPayments(p=>p.filter(x=>x.id!==id));
  }

  function markPaidInFull(){
    setPayAmount(String(balanceDue));
  }

  function toggleVoid(){
    if(!isVoid && !window.confirm("Void this invoice? You can undo this later if needed.")) return;
    setIsVoid(p=>!p);
  }

  function emailInvoice(){
    if(!customer){ alert("No customer linked to this invoice."); return; }
    if(!customer.email){ alert(`${customer.name} doesn't have an email on file. Add one to their customer profile first.`); return; }

    const lines = [];
    lines.push(`Hi ${customer.name},`);
    lines.push("");
    lines.push("Here is your invoice for HERS Rating services:");
    lines.push("");
    lineItems.forEach(it=>{
      lines.push(`- ${it.service_name} (x${it.qty||1}): $${fmt((Number(it.price)||0)*(Number(it.qty)||1))}`);
    });
    lines.push("");
    lines.push(`Subtotal: $${fmt(subtotal)}`);
    if(markupAmount>0) lines.push(`Markup${invoice.markup_type==="percent"?` (${invoice.markup_value}%)`:""}: +$${fmt(markupAmount)}`);
    if(discountAmount>0) lines.push(`Discount${invoice.discount_type==="percent"?` (${invoice.discount_value}%)`:""}: -$${fmt(discountAmount)}`);
    if(Number(invoice.tax_rate)>0) lines.push(`Tax (${invoice.tax_rate}%): $${fmt(invoice.tax_total)}`);
    lines.push(`Total: $${fmt(grandTotal)}`);
    if(payments.length>0){
      lines.push("");
      lines.push("Payments received:");
      payments.forEach(p=>{
        const d = p.date ? new Date(p.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "";
        lines.push(`  - $${fmt(p.amount)} (${p.method||"Other"})${d?` on ${d}`:""}`);
      });
      lines.push(`Total Paid: $${fmt(totalPaid)}`);
    }
    lines.push(`Balance Due: $${fmt(balanceDue)}`);
    if(dueDate) lines.push(`Due date: ${new Date(dueDate+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`);
    if(depositAmount>0) lines.push(`Deposit required: $${fmt(depositAmount)}${depositReceived?" (received)":""}`);
    if(paymentSchedule.length>0){
      lines.push("");
      lines.push("Payment Schedule:");
      paymentSchedule.forEach(s=>lines.push(`  - ${s.label||"Payment"}: $${fmt(installmentAmount(s))}`));
    }
    if(invoice.address){ lines.push(""); lines.push(`Job address: ${invoice.address}`); }
    if(notes){ lines.push(""); lines.push(notes); }
    lines.push("");
    lines.push("Please let us know if you have any questions.");

    const subject = `Invoice${invoice.address?` — ${invoice.address}`:""}`;
    const parts = [];
    parts.push(`subject=${encodeURIComponent(subject)}`);
    parts.push(`body=${encodeURIComponent(lines.join("\n"))}`);
    window.location.href = `mailto:${customer.email}?${parts.join("&")}`;
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
          💵 HERS Invoice
        </span>
        <div style={{display:"flex",gap:6}}>
          {invoice.hers_estimate_id && (
            <button onClick={()=>navigate(`/hers/${invoice.hers_estimate_id}`)} style={Btn}>
              📄 View Estimate
            </button>
          )}
          <button onClick={emailInvoice} style={{...Btn,color:"#2563eb",borderColor:"#2563eb"}}>
            📧 Email
          </button>
          <button onClick={save} disabled={saving} style={{...BtnD,opacity:saving?0.6:1}}>
            {saving?"Saving…":"Save"}
          </button>
        </div>
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"16px 14px"}}>

        {/* customer */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>
            Customer
          </div>
          <div style={{fontSize:14,fontWeight:700,color:C.ink}}>{customer?.name||"Unknown"}</div>
          {customer?.company_name && <div style={{fontSize:12,color:C.muted}}>{customer.company_name}</div>}
          {customer?.phone && (
            <a href={`tel:${customer.phone.replace(/\D/g,"")}`} style={{fontSize:12,color:"#3b82f6",textDecoration:"none"}}>
              📞 {customer.phone}
            </a>
          )}
          {invoice.address && (
            <div style={{fontSize:12,color:C.muted,marginTop:6}}>📍 {invoice.address}</div>
          )}
        </div>

        {/* line items (locked from the estimate) */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
            Line Items
          </div>
          {lineItems.map((it,idx)=>(
            <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"8px 0",borderBottom:idx<lineItems.length-1?`1px solid ${C.border}`:"none"}}>
              <div>
                <div style={{fontSize:13,color:C.ink}}>{it.service_name}</div>
                <div style={{fontSize:11,color:C.faint}}>Qty {it.qty||1} × ${fmt(it.price)}</div>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:C.green}}>
                ${fmt((Number(it.price)||0)*(Number(it.qty)||1))}
              </div>
            </div>
          ))}
        </div>

        {/* pricing breakdown (read-only snapshot from the estimate) */}
        <div style={{background:C.ink,borderRadius:12,padding:"16px 20px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Subtotal</span>
            <span style={{color:"#fff",fontSize:12}}>${fmt(subtotal)}</span>
          </div>
          {markupAmount>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Markup{invoice.markup_type==="percent"?` (${invoice.markup_value}%)`:""}</span>
              <span style={{color:"#fff",fontSize:12}}>+${fmt(markupAmount)}</span>
            </div>
          )}
          {discountAmount>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Discount{invoice.discount_type==="percent"?` (${invoice.discount_value}%)`:""}</span>
              <span style={{color:"#fff",fontSize:12}}>-${fmt(discountAmount)}</span>
            </div>
          )}
          {Number(invoice.tax_rate)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Tax ({invoice.tax_rate}%)</span>
              <span style={{color:"#fff",fontSize:12}}>${fmt(invoice.tax_total)}</span>
            </div>
          )}
          <div style={{borderTop:"1px solid #374151",paddingTop:10,marginTop:4,
              display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Total</span>
            <span style={{color:"#059669",fontWeight:800,fontSize:24}}>${fmt(grandTotal)}</span>
          </div>
          {depositAmount>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTop:"1px solid #374151"}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Deposit required{invoice.deposit_type==="percent"?` (${invoice.deposit_value}%)`:""}</span>
              <span style={{color:"#fff",fontSize:13,fontWeight:700}}>${fmt(depositAmount)}</span>
            </div>
          )}
          {paymentSchedule.length>0 && (
            <div style={{marginTop:depositAmount>0?8:10,paddingTop:depositAmount>0?0:10,
                borderTop:depositAmount>0?"none":"1px solid #374151"}}>
              <div style={{color:"#94a3b8",fontSize:12,marginBottom:4}}>Payment Schedule</div>
              {paymentSchedule.map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{color:"#cbd5e1",fontSize:11}}>{s.label||"Payment"}</span>
                  <span style={{color:"#fff",fontSize:11}}>${fmt(installmentAmount(s))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* payment tracking */}
        <div style={CARD}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4}}>
              Payment Tracking
            </div>
            <span style={{fontSize:11,padding:"3px 9px",borderRadius:10,fontWeight:700,
                background:STATUS_COLORS[derivedStatus].bg,color:STATUS_COLORS[derivedStatus].text}}>
              {derivedStatus}
            </span>
          </div>

          <div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Due Date</div>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}
              disabled={isVoid} style={{...I,width:"100%"}} />
          </div>

          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:10,
              padding:"8px 10px",background:"#f8fafc",borderRadius:6}}>
            <span style={{color:C.muted}}>Total Paid</span>
            <span style={{fontWeight:700,color:C.green}}>${fmt(totalPaid)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:10,
              padding:"8px 10px",background:"#f8fafc",borderRadius:6}}>
            <span style={{color:C.muted}}>Balance Due</span>
            <span style={{fontWeight:700,color:balanceDue>0?"#dc2626":C.green}}>${fmt(balanceDue)}</span>
          </div>

          {depositAmount>0 && (
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,marginBottom:10,
                color:depositReceived?C.green:C.muted}}>
              {depositReceived?"✅":"⏳"} Deposit (${fmt(depositAmount)}) {depositReceived?"received":"not yet received"}
            </div>
          )}

          {invoice.paid_at && derivedStatus==="Paid" && (
            <div style={{fontSize:11,color:C.faint,marginBottom:10}}>
              Marked paid on {new Date(invoice.paid_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
            </div>
          )}

          {/* payments history */}
          {payments.length>0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>
                Payments Received
              </div>
              {payments.map(p=>(
                <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                  <span>{PAY_METHODS[p.method]||"📝"} {p.method||"Other"}
                    {p.date && <span style={{color:C.faint,fontSize:11}}> · {new Date(p.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                  </span>
                  <span style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontWeight:700,color:C.green}}>${fmt(p.amount)}</span>
                    {!isVoid && (
                      <button onClick={()=>removePayment(p.id)}
                        style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:14}}>✕</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* record a new payment */}
          {!isVoid && (
            <div style={{background:"#f8fafc",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
              <div style={{fontSize:10,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>
                Record a Payment
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div>
                  <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:3}}>Amount</div>
                  <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)}
                    placeholder="0.00" style={{...I,width:"100%"}} />
                </div>
                <div>
                  <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:3}}>Method</div>
                  <select value={payMethod} onChange={e=>setPayMethod(e.target.value)} style={{...I,width:"100%"}}>
                    {Object.keys(PAY_METHODS).map(m=><option key={m} value={m}>{PAY_METHODS[m]} {m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:3}}>Date</div>
                <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} style={{...I,width:"100%"}} />
              </div>
              <button onClick={addPayment} style={{...BtnD,width:"100%",justifyContent:"center"}}>
                + Add Payment
              </button>
            </div>
          )}

          <div style={{display:"flex",gap:8}}>
            <button onClick={markPaidInFull} disabled={isVoid||balanceDue<=0} style={{...Btn,flex:1,opacity:(isVoid||balanceDue<=0)?0.4:1}}>
              ✅ Fill Remaining Balance
            </button>
            <button onClick={toggleVoid} style={{...Btn,flex:1,color:isVoid?C.green:"#dc2626",borderColor:isVoid?C.green:"#dc2626"}}>
              {isVoid?"↩ Un-void":"🚫 Void Invoice"}
            </button>
          </div>
        </div>

        {/* notes */}
        <div style={CARD}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>
            Notes
          </div>
          <textarea placeholder="Notes for this invoice…" value={notes} onChange={e=>setNotes(e.target.value)}
            rows={2} style={{...I,width:"100%",height:"auto",padding:"8px",resize:"none",fontFamily:"inherit"}} />
        </div>

      </div>
    </div>
  );
}
