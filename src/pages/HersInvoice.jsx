import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AdjustmentRow, PaymentScheduleEditor } from "./PricingOptions";

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
  const [services, setServices] = useState([]);

  const [lineItems, setLineItems] = useState([]);
  const [taxRate, setTaxRate] = useState("0");
  const [markupOpen, setMarkupOpen]     = useState(false);
  const [markupType, setMarkupType]     = useState("percent");
  const [markupValue, setMarkupValue]   = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [depositOpen, setDepositOpen]   = useState(false);
  const [depositType, setDepositType]   = useState("percent");
  const [depositValue, setDepositValue] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [paymentSchedule, setPaymentSchedule] = useState([]);

  const [payments, setPayments] = useState([]);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payReference, setPayReference] = useState("");
  const [payDate, setPayDate]     = useState(new Date().toISOString().slice(0,10));
  const [dueDate, setDueDate]     = useState("");
  const [status, setStatus]       = useState("Unpaid");
  const [notes, setNotes]         = useState("");

  useEffect(()=>{ load(); },[]);

  async function load() {
    const { data:inv } = await supabase.from("hers_invoices").select("*").eq("id", invoiceId).maybeSingle();
    if(!inv){ setLoading(false); return; }
    setInvoice(inv);

    const items = Array.isArray(inv.line_items) ? inv.line_items
      : (typeof inv.line_items === "string" ? JSON.parse(inv.line_items||"[]") : []);
    setLineItems(items.map(it=>({...it, id: it.id||Date.now()+Math.random()})));
    setTaxRate(String(inv.tax_rate||0));
    if(inv.markup_value){ setMarkupOpen(true); setMarkupType(inv.markup_type||"percent"); setMarkupValue(String(inv.markup_value)); }
    if(inv.discount_value){ setDiscountOpen(true); setDiscountType(inv.discount_type||"percent"); setDiscountValue(String(inv.discount_value)); }
    if(inv.deposit_value){ setDepositOpen(true); setDepositType(inv.deposit_type||"percent"); setDepositValue(String(inv.deposit_value)); }
    const sched = Array.isArray(inv.payment_schedule) ? inv.payment_schedule
      : (typeof inv.payment_schedule === "string" ? JSON.parse(inv.payment_schedule||"[]") : []);
    if(sched.length){ setScheduleOpen(true); setPaymentSchedule(sched.map(s=>({...s, id: s.id||Date.now()+Math.random()}))); }

    if(inv.company_id){
      const { data:svc } = await supabase.from("hers_services")
        .select("*").eq("company_id", inv.company_id).order("sort_order");
      if(svc) setServices(svc);
    }

    let pmts = Array.isArray(inv.payments) ? inv.payments
      : (typeof inv.payments === "string" ? JSON.parse(inv.payments||"[]") : []);
    // legacy fallback: if this invoice has an old-style amount_paid but no ledger entries, preserve it as one entry
    if(pmts.length===0 && Number(inv.amount_paid)>0){
      pmts = [{ id: "legacy", amount: Number(inv.amount_paid), method: "Other",
        date: (inv.updated_at||inv.created_at||"").slice(0,10) }];
    }
    setPayments(pmts);
    setDueDate(inv.due_date||"");
    setStatus(inv.status||"Unpaid");
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

  function addLine(serviceName){
    const svc = services.find(s=>s.name===serviceName);
    setLineItems(p=>[...p, {
      id: Date.now()+Math.random(),
      service_name: serviceName||"",
      price: svc ? String(svc.default_price||0) : "",
      qty: "1", tax: "0",
    }]);
  }

  function updateLine(idx, field, value){
    setLineItems(p=>p.map((it,i)=>{
      if(i!==idx) return it;
      const upd = {...it, [field]: value};
      if(field==="service_name"){
        const svc = services.find(s=>s.name===value);
        if(svc) upd.price = String(svc.default_price||0);
      }
      return upd;
    }));
  }

  function removeLine(idx){
    setLineItems(p=>p.filter((_,i)=>i!==idx));
  }

  function lineTotal(it){
    return (Number(it.price)||0) * (Number(it.qty)||1);
  }

  const subtotal = lineItems.reduce((s,it)=>s+lineTotal(it),0);
  const markupAmount = markupOpen ? (markupType==="percent" ? subtotal*(Number(markupValue)||0)/100 : (Number(markupValue)||0)) : 0;
  const discountAmount = discountOpen ? (discountType==="percent" ? subtotal*(Number(discountValue)||0)/100 : (Number(discountValue)||0)) : 0;
  const adjustedSubtotal = subtotal + markupAmount - discountAmount;
  const taxTotal = adjustedSubtotal * (Number(taxRate)||0)/100;
  const grandTotal = adjustedSubtotal + taxTotal;
  const depositAmount = depositOpen ? (depositType==="percent" ? grandTotal*(Number(depositValue)||0)/100 : (Number(depositValue)||0)) : 0;
  function installmentAmount(s){
    return s.type==="percent" ? grandTotal*(Number(s.value)||0)/100 : (Number(s.value)||0);
  }
  const scheduledTotal = paymentSchedule.reduce((s,it)=>s+installmentAmount(it),0);

  const totalPaid = payments.reduce((s,p)=>s+(Number(p.amount)||0),0);
  const balanceDue = Math.max(0, Math.round((grandTotal-totalPaid)*100)/100);
  const isVoid = status==="Void";
  const depositReceived = depositAmount>0 && totalPaid>=depositAmount;

  function suggestStatus(amt){
    return amt<=0 ? "Unpaid" : amt>=grandTotal ? "Paid" : "Partial";
  }

  async function save(){
    if(saving) return;
    setSaving(true);
    try {
      const validItems = lineItems.filter(it=>it.service_name && Number(it.price)>=0);
      const payload = {
        line_items: validItems,
        subtotal: Math.round(subtotal*100)/100,
        tax_rate: Number(taxRate)||0,
        tax_total: Math.round(taxTotal*100)/100,
        grand_total: Math.round(grandTotal*100)/100,
        markup_type: markupOpen ? markupType : null,
        markup_value: markupOpen ? (Number(markupValue)||0) : 0,
        discount_type: discountOpen ? discountType : null,
        discount_value: discountOpen ? (Number(discountValue)||0) : 0,
        deposit_type: depositOpen ? depositType : null,
        deposit_value: depositOpen ? (Number(depositValue)||0) : 0,
        payment_schedule: scheduleOpen ? paymentSchedule.map(s=>({
          id: s.id, label: s.label||"", type: s.type, value: Number(s.value)||0,
        })) : [],
        payments: payments.map(p=>({
          id: p.id, amount: Math.round((Number(p.amount)||0)*100)/100, method: p.method||"Other",
          reference: p.reference||null, date: p.date||null,
        })),
        amount_paid: Math.round(totalPaid*100)/100,
        due_date: dueDate||null,
        status,
        deposit_paid: depositReceived,
        notes,
        paid_at: status==="Paid" ? (invoice.paid_at || new Date().toISOString()) : null,
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
    const newPayments = [...payments, {
      id: Date.now()+Math.random(), amount: amt, method: payMethod,
      reference: payMethod!=="Cash" ? (payReference||null) : null, date: payDate,
    }];
    setPayments(newPayments);
    setPayAmount(""); setPayReference("");
    if(status!=="Void") setStatus(suggestStatus(newPayments.reduce((s,p)=>s+(Number(p.amount)||0),0)));
  }

  function removePayment(id){
    if(!window.confirm("Remove this payment record?")) return;
    const newPayments = payments.filter(x=>x.id!==id);
    setPayments(newPayments);
    if(status!=="Void") setStatus(suggestStatus(newPayments.reduce((s,p)=>s+(Number(p.amount)||0),0)));
  }

  function fillRemainingBalance(){
    setPayAmount(String(balanceDue));
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
    if(markupAmount>0) lines.push(`Markup${markupType==="percent"?` (${markupValue}%)`:""}: +$${fmt(markupAmount)}`);
    if(discountAmount>0) lines.push(`Discount${discountType==="percent"?` (${discountValue}%)`:""}: -$${fmt(discountAmount)}`);
    if(Number(taxRate)>0) lines.push(`Tax (${taxRate}%): $${fmt(taxTotal)}`);
    lines.push(`Total: $${fmt(grandTotal)}`);
    if(payments.length>0){
      lines.push("");
      lines.push("Payments received:");
      payments.forEach(p=>{
        const d = p.date ? new Date(p.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "";
        const ref = p.reference ? ` #${p.reference}` : "";
        lines.push(`  - $${fmt(p.amount)} (${p.method||"Other"}${ref})${d?` on ${d}`:""}`);
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

        {/* line items - editable */}
        <div style={{...CARD, pointerEvents:isVoid?"none":"auto", opacity:isVoid?0.6:1}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:10}}>
            Line Items
          </div>
          {lineItems.map((it,idx)=>(
            <div key={it.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",marginBottom:8,boxSizing:"border-box"}}>
              <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                <select value={services.find(s=>s.name===it.service_name)?it.service_name:(it.service_name?"__custom__":"")}
                  onChange={e=>{
                    if(e.target.value==="__custom__") updateLine(idx,"service_name","");
                    else updateLine(idx,"service_name",e.target.value);
                  }}
                  style={{...I,fontSize:12,flex:1,minWidth:0,textOverflow:"ellipsis"}}>
                  <option value="">Select service…</option>
                  {services.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                  <option value="__custom__">✏️ Custom item</option>
                </select>
                <button onClick={()=>removeLine(idx)}
                  style={{border:"none",background:"none",color:C.faint,cursor:"pointer",fontSize:16,padding:"0 4px",flexShrink:0}}>✕</button>
              </div>
              {it.service_name && !services.find(s=>s.name===it.service_name) && (
                <input value={it.service_name} onChange={e=>updateLine(idx,"service_name",e.target.value)}
                  placeholder="Custom service name…" style={{...I,width:"100%",marginBottom:6,fontSize:12}} />
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                <div>
                  <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Price</div>
                  <input type="number" placeholder="0.00" value={it.price}
                    onChange={e=>updateLine(idx,"price",e.target.value)}
                    style={{...I,fontSize:12,textAlign:"right",width:"100%",boxSizing:"border-box"}} />
                </div>
                <div>
                  <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Qty</div>
                  <input type="number" placeholder="1" value={it.qty}
                    onChange={e=>updateLine(idx,"qty",e.target.value)}
                    style={{...I,fontSize:12,textAlign:"center",width:"100%",boxSizing:"border-box"}} />
                </div>
                <div>
                  <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Total</div>
                  <div style={{...I,display:"flex",alignItems:"center",justifyContent:"flex-end",
                      fontSize:13,fontWeight:700,color:C.green,background:"#f8fafc",boxSizing:"border-box"}}>
                    ${fmt(lineTotal(it))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <select onChange={e=>{ if(e.target.value){ addLine(e.target.value); e.target.value=""; } }}
              style={{...I,flex:1,fontSize:12}}>
              <option value="">+ Add from price list…</option>
              {services.map(s=><option key={s.id} value={s.name}>{s.name} — ${fmt(s.default_price)}</option>)}
            </select>
            <button onClick={()=>addLine("")} style={{...Btn,whiteSpace:"nowrap"}}>+ Custom Line</button>
          </div>
        </div>

        {/* pricing options - editable */}
        <div style={{...CARD, pointerEvents:isVoid?"none":"auto", opacity:isVoid?0.6:1}}>
          <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:0.4,marginBottom:4}}>
            Pricing Options
          </div>
          <div style={{display:"flex",gap:12,margin:"10px 0",alignItems:"center"}}>
            <span style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>Tax rate</span>
            <input type="number" value={taxRate} onChange={e=>setTaxRate(e.target.value)} style={{...I,width:80}} />
            <span style={{fontSize:12,color:C.muted}}>%</span>
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <AdjustmentRow label="Markup" open={markupOpen} type={markupType} value={markupValue} amount={markupAmount}
              onAdd={()=>setMarkupOpen(true)}
              onTypeChange={setMarkupType} onValueChange={setMarkupValue}
              onRemove={()=>{setMarkupOpen(false); setMarkupValue(""); setMarkupType("percent");}} />
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <AdjustmentRow label="Discount" open={discountOpen} type={discountType} value={discountValue} amount={discountAmount}
              onAdd={()=>setDiscountOpen(true)}
              onTypeChange={setDiscountType} onValueChange={setDiscountValue}
              onRemove={()=>{setDiscountOpen(false); setDiscountValue(""); setDiscountType("percent");}} />
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <AdjustmentRow label="Request a deposit" open={depositOpen} type={depositType} value={depositValue} amount={depositAmount}
              onAdd={()=>setDepositOpen(true)}
              onTypeChange={setDepositType} onValueChange={setDepositValue}
              onRemove={()=>{setDepositOpen(false); setDepositValue(""); setDepositType("percent");}} />
          </div>
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <PaymentScheduleEditor open={scheduleOpen} schedule={paymentSchedule} grandTotal={grandTotal}
              scheduledTotal={scheduledTotal} installmentAmount={installmentAmount}
              onAdd={()=>setScheduleOpen(true)}
              onChange={setPaymentSchedule}
              onRemoveAll={()=>{setScheduleOpen(false); setPaymentSchedule([]);}} />
          </div>
        </div>

        {/* pricing breakdown - live calculation */}
        <div style={{background:C.ink,borderRadius:12,padding:"16px 20px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Subtotal</span>
            <span style={{color:"#fff",fontSize:12}}>${fmt(subtotal)}</span>
          </div>
          {markupAmount>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Markup{markupType==="percent"?` (${markupValue}%)`:""}</span>
              <span style={{color:"#fff",fontSize:12}}>+${fmt(markupAmount)}</span>
            </div>
          )}
          {discountAmount>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Discount{discountType==="percent"?` (${discountValue}%)`:""}</span>
              <span style={{color:"#fff",fontSize:12}}>-${fmt(discountAmount)}</span>
            </div>
          )}
          {Number(taxRate)>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Tax ({taxRate}%)</span>
              <span style={{color:"#fff",fontSize:12}}>${fmt(taxTotal)}</span>
            </div>
          )}
          <div style={{borderTop:"1px solid #374151",paddingTop:10,marginTop:4,
              display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
            <span style={{color:"#94a3b8",fontSize:12}}>Total</span>
            <span style={{color:"#059669",fontWeight:800,fontSize:24}}>${fmt(grandTotal)}</span>
          </div>
          {depositAmount>0 && (
            <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTop:"1px solid #374151"}}>
              <span style={{color:"#94a3b8",fontSize:12}}>Deposit required{depositType==="percent"?` (${depositValue}%)`:""}</span>
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
            <select value={status} onChange={e=>setStatus(e.target.value)}
              style={{fontSize:11,padding:"3px 9px",borderRadius:10,fontWeight:700,border:"none",cursor:"pointer",
                background:STATUS_COLORS[status].bg,color:STATUS_COLORS[status].text}}>
              <option value="Unpaid">Unpaid</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
              <option value="Void">Void</option>
            </select>
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

          {invoice.paid_at && status==="Paid" && (
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
                  <span>{PAY_METHODS[p.method]||"📝"} {p.method||"Other"}{p.reference?` #${p.reference}`:""}
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
              {payMethod!=="Cash" && (
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:3}}>
                    {payMethod==="Check"?"Check #":"Reference / Confirmation #"} (optional)
                  </div>
                  <input value={payReference} onChange={e=>setPayReference(e.target.value)}
                    placeholder={payMethod==="Check"?"e.g. 1042":"e.g. auth code"} style={{...I,width:"100%"}} />
                </div>
              )}
              <div style={{marginBottom:8}}>
                <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:3}}>Date</div>
                <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} style={{...I,width:"100%"}} />
              </div>
              <button onClick={addPayment} style={{...BtnD,width:"100%",justifyContent:"center"}}>
                + Add Payment
              </button>
            </div>
          )}

          <button onClick={fillRemainingBalance} disabled={isVoid||balanceDue<=0}
            style={{...Btn,width:"100%",justifyContent:"center",opacity:(isVoid||balanceDue<=0)?0.4:1}}>
            ✅ Fill Remaining Balance
          </button>
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
