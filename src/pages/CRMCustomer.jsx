import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import CustomerOverview from "../components/CustomerOverview";

// The CRM's view of one customer: who they are, every trade they use, and the
// notes - all in one place. The insulation estimate pages stay about the
// estimate only; this page is where you manage the relationship.
export default function CRMCustomer() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase.from("customers").select("*").eq("id", Number(customerId)).maybeSingle()
      .then(({ data }) => { if (alive) { setCustomer(data); setLoading(false); } });
    return () => { alive = false; };
  }, [customerId]);

  const btn = { height: 40, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading…</div>;
  if (!customer) return (
    <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
      Customer not found.
      <button onClick={() => navigate("/crm")} style={{ marginLeft: 12, cursor: "pointer" }}>← CRM</button>
    </div>
  );

  const digits = (customer.phone || "").replace(/\D/g, "");
  return (
    <div style={{ fontFamily: "Inter,system-ui,sans-serif", background: "#f6f7fb", minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 14px" }}>
        <button onClick={() => navigate("/crm")}
          style={{ border: "none", background: "none", padding: 0, marginBottom: 12, cursor: "pointer", color: "#334155", fontSize: 14, fontWeight: 700 }}>
          ← CRM
        </button>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", marginBottom: 18 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a", overflowWrap: "anywhere" }}>{customer.name}</h1>
              {customer.company_name && <div style={{ marginTop: 2, fontSize: 14, color: "#334155", fontWeight: 600 }}>{customer.company_name}</div>}
              <div style={{ marginTop: 8, fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                {customer.phone && <div>{customer.phone}</div>}
                {customer.email && <div style={{ overflowWrap: "anywhere" }}>{customer.email}</div>}
                {customer.address && <div>{customer.address}</div>}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {digits && <a href={`tel:${digits}`} style={{ ...btn, display: "inline-flex", alignItems: "center", border: "1px solid #cbd5e1", background: "white", color: "#0f172a", textDecoration: "none" }}>Call</a>}
              {digits && <a href={`sms:${digits}`} style={{ ...btn, display: "inline-flex", alignItems: "center", border: "1px solid #cbd5e1", background: "white", color: "#0f172a", textDecoration: "none" }}>Text</a>}
              <button onClick={() => navigate(`/customer/${customerId}`)}
                style={{ ...btn, border: "1px solid #cbd5e1", background: "white", color: "#0f172a" }}>Insulation estimates</button>
            </div>
          </div>
        </div>

        <CustomerOverview customerId={customerId} />
      </div>
    </div>
  );
}
