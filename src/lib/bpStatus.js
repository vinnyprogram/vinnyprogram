// Board & Plaster estimate statuses - the same flow insulation uses.
// Older rows may still say Draft / Sent / Declined; they are read as the
// matching new status, nothing in the database needs to change.
export const BP_STATUSES = ["In Progress", "Sent to Office", "Emailed to Customer", "Accepted", "Lost"];

export function normalizeBPStatus(s){
  if(!s || s==="Draft") return "In Progress";
  if(s==="Sent") return "Emailed to Customer";
  if(s==="Declined") return "Lost";
  return s;
}
// Still being worked or waiting on the customer (not finished).
export function isOpenBPStatus(s){
  const n = normalizeBPStatus(s);
  return n==="In Progress" || n==="Sent to Office" || n==="Emailed to Customer";
}
export const BP_STATUS_COLORS = {
  "In Progress":         { bg:"#f1f5f9", text:"#64748b" },
  "Sent to Office":      { bg:"#fff7ed", text:"#f97316" },
  "Emailed to Customer": { bg:"#eff6ff", text:"#3b82f6" },
  "Accepted":            { bg:"#dcfce7", text:"#059669" },
  "Lost":                { bg:"#fee2e2", text:"#dc2626" },
};
