import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner, Field } from "../components/ui.jsx";

const STRUCTURES = ["Charity", "Government Funded", "LLP", "LTD", "Non-profit Making", "Partnership", "PLC", "Property Manager", "Private Limited Company", "Religious Institute", "Sole Trader", "Trust"];
const BIZ_TYPES = ["Accommodation", "Agriculture", "Catering", "Charity", "Church", "Construction", "Manufacturing", "Newsagents / Supermarket", "Professional And Business", "Public Building", "Retail", "Transport", "Wholesale", "Motor Dealership", "Hardware Store", "Gym", "Law", "Software", "Cafe", "Accountants", "Health Store", "Other"];

const Section = ({ title, cols = 3, children }) => (
  <Card title={title}>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 12 }}>{children}</div>
  </Card>
);

export default function GenerateContract() {
  const { quoteId } = useParams();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    business_id: "", business_name: "", company_reg: "", business_structure: "", business_type: "", trading_from: "",
    title: "", first_name: "", last_name: "", address_line1: "", address_line2: "", town: "", postcode: "",
    telephone: "", mobile: "", email: "",
    billing_same: true, billing_title: "", billing_first_name: "", billing_last_name: "", billing_address1: "",
    billing_address2: "", billing_town: "", billing_postcode: "", billing_telephone: "", billing_mobile: "", billing_email: "",
    supplier_id: "", utility: "Electricity", meter_mpan_mpr: "", meter_serial: "", consumption: "", current_read: "", requested_start: "",
    product_name: "", tariff_name: "", acq_renewal: "Acquisition", tariff_type: "", supplier_start: "", tariff_end: "", supplier_end: "",
    term_months: "", fixed_price_term: "", standing_charge: "", day_rate: "", night_rate: "", ewe_rate: "", kva_charge: "", broker_commission: "",
    payment_method: "", payment_amount: "", billing_period: "Monthly",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  useEffect(() => {
    if (!quoteId) { setLoading(false); return; }
    api.get(`/quotes/${quoteId}`).then((r) => {
      const q = r.data;
      setF((p) => ({
        ...p,
        business_id: q.business_id || "", business_name: q.business_name || "", business_type: q.business_type || "",
        acq_renewal: q.acq_renewal || "Acquisition", supplier_id: q.supplier_id || "", utility: q.utility || "Electricity",
        meter_mpan_mpr: q.meter_number || q.meter_point || "", consumption: q.eac || "", requested_start: q.start_date || "",
        product_name: q.product_name || "", term_months: q.term_months || "", standing_charge: q.standing_charge ?? "",
        day_rate: q.unit_rate ?? "", broker_commission: q.commission ?? "",
      }));
      setLoading(false);
    }).catch((e) => { setErr(e.message); setLoading(false); });
  }, [quoteId]);

  const save = async () => {
    if (!f.business_name.trim()) return setErr("Company Name is required");
    if (!f.meter_mpan_mpr.trim()) return setErr("MPAN is required");
    if (!f.consumption) return setErr("Estimated Annual Consumption is required");
    setSaving(true); setErr(null);
    const numKeys = ["term_months", "fixed_price_term", "standing_charge", "day_rate", "night_rate", "ewe_rate", "kva_charge", "broker_commission", "payment_amount"];
    try {
      const payload = { ...f, quote_id: quoteId ? Number(quoteId) : null, contract_no: "CN-" + Date.now().toString().slice(-6),
        business_id: f.business_id || null, supplier_id: f.supplier_id || null, billing_same: f.billing_same ? 1 : 0,
        consumption: Number(f.consumption) || null, commission_value: Number(f.broker_commission) || 0,
        status: "Contract Sent to Client" };
      numKeys.forEach((k) => { payload[k] = f[k] === "" ? null : Number(f[k]); });
      await api.post("/contracts", payload);
      if (quoteId) { try { await api.put(`/quotes/${quoteId}`, { status: "Quote Accepted" }); } catch { /* ignore */ } }
      nav("/contracts");
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}><ArrowLeft size={16} /></button>
          <div><h1 style={{ margin: 0 }}>Generate {f.utility} Contract</h1><p className="sub" style={{ margin: 0 }}>{quoteId ? "Pre-filled from the quote — complete the remaining details." : "Complete the contract details."}</p></div>
        </div>
      </div>
      {err && <ErrorBanner error={err} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Section title="Supply Details">
          <Field label="Company Name *"><input value={f.business_name} onChange={set("business_name")} /></Field>
          <Field label="Company Registration"><input value={f.company_reg} onChange={set("company_reg")} /></Field>
          <Field label="Business Structure"><select value={f.business_structure} onChange={set("business_structure")}><option value="">Select Structure</option>{STRUCTURES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Business Type *"><select value={f.business_type} onChange={set("business_type")}><option value="">Select Business Type</option>{BIZ_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Trading From Date"><input type="date" value={f.trading_from} onChange={set("trading_from")} /></Field>
          <Field label="Acquisition / Renewal"><select value={f.acq_renewal} onChange={set("acq_renewal")}><option>Acquisition</option><option>Renewal</option></select></Field>
          <Field label="Title *"><input value={f.title} onChange={set("title")} placeholder="Mr / Mrs / Ms" /></Field>
          <Field label="First Name *"><input value={f.first_name} onChange={set("first_name")} /></Field>
          <Field label="Last Name *"><input value={f.last_name} onChange={set("last_name")} /></Field>
          <Field label="Address Line 1 *"><input value={f.address_line1} onChange={set("address_line1")} /></Field>
          <Field label="Address Line 2"><input value={f.address_line2} onChange={set("address_line2")} /></Field>
          <Field label="Town / City *"><input value={f.town} onChange={set("town")} /></Field>
          <Field label="Postcode *"><input value={f.postcode} onChange={set("postcode")} /></Field>
          <Field label="Telephone *"><input value={f.telephone} onChange={set("telephone")} /></Field>
          <Field label="Mobile"><input value={f.mobile} onChange={set("mobile")} /></Field>
          <Field label="Email * (contract sent here)"><input type="email" value={f.email} onChange={set("email")} /></Field>
        </Section>

        <Card title="Billing Details">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: f.billing_same ? 0 : 12 }}>
            <input type="checkbox" checked={f.billing_same} onChange={set("billing_same")} style={{ width: 16, height: 16, accentColor: "var(--brand,#0E7C7B)" }} /> Same as above
          </label>
          {!f.billing_same && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              <Field label="Billing Title"><input value={f.billing_title} onChange={set("billing_title")} /></Field>
              <Field label="Billing First Name"><input value={f.billing_first_name} onChange={set("billing_first_name")} /></Field>
              <Field label="Billing Last Name"><input value={f.billing_last_name} onChange={set("billing_last_name")} /></Field>
              <Field label="Billing Address Line 1"><input value={f.billing_address1} onChange={set("billing_address1")} /></Field>
              <Field label="Billing Address Line 2"><input value={f.billing_address2} onChange={set("billing_address2")} /></Field>
              <Field label="Billing Town / City"><input value={f.billing_town} onChange={set("billing_town")} /></Field>
              <Field label="Billing Postcode"><input value={f.billing_postcode} onChange={set("billing_postcode")} /></Field>
              <Field label="Billing Telephone"><input value={f.billing_telephone} onChange={set("billing_telephone")} /></Field>
              <Field label="Billing Email"><input value={f.billing_email} onChange={set("billing_email")} /></Field>
            </div>
          )}
        </Card>

        <Section title="Meter Details">
          <Field label="MPAN / MPRN *"><input value={f.meter_mpan_mpr} onChange={set("meter_mpan_mpr")} /></Field>
          <Field label="Meter Serial Number"><input value={f.meter_serial} onChange={set("meter_serial")} /></Field>
          <Field label="Estimated Annual Consumption (kWh) *"><input type="number" value={f.consumption} onChange={set("consumption")} /></Field>
          <Field label="Current Meter Reading"><input value={f.current_read} onChange={set("current_read")} /></Field>
          <Field label="Requested Start Date *"><input type="date" value={f.requested_start} onChange={set("requested_start")} /></Field>
        </Section>

        <Section title="Product & Contract Details">
          <Field label="Product Name *"><input value={f.product_name} onChange={set("product_name")} /></Field>
          <Field label="Tariff Name"><input value={f.tariff_name} onChange={set("tariff_name")} /></Field>
          <Field label="Tariff Type"><input value={f.tariff_type} onChange={set("tariff_type")} /></Field>
          <Field label="Supplier Start Date"><input type="date" value={f.supplier_start} onChange={set("supplier_start")} /></Field>
          <Field label="Tariff End Date"><input type="date" value={f.tariff_end} onChange={set("tariff_end")} /></Field>
          <Field label="Supplier End Date"><input type="date" value={f.supplier_end} onChange={set("supplier_end")} /></Field>
          <Field label="Contract Term (months) *"><input type="number" value={f.term_months} onChange={set("term_months")} /></Field>
          <Field label="Fixed Price Term (months) *"><input type="number" value={f.fixed_price_term} onChange={set("fixed_price_term")} /></Field>
          <Field label="Standing Charge (p/day) *"><input type="number" step="0.01" value={f.standing_charge} onChange={set("standing_charge")} /></Field>
          <Field label="Universal Day Rate (p/kWh) *"><input type="number" step="0.01" value={f.day_rate} onChange={set("day_rate")} /></Field>
          <Field label="Night Rate (p/kWh)"><input type="number" step="0.01" value={f.night_rate} onChange={set("night_rate")} /></Field>
          <Field label="Eve/Weekend Rate (p/kWh)"><input type="number" step="0.01" value={f.ewe_rate} onChange={set("ewe_rate")} /></Field>
          <Field label="kVA Charge (p/kVA/month)"><input type="number" step="0.01" value={f.kva_charge} onChange={set("kva_charge")} /></Field>
          <Field label="Broker Commission (p/kWh)"><input type="number" step="0.01" value={f.broker_commission} onChange={set("broker_commission")} /></Field>
          <Field label="Payment Method *"><input value={f.payment_method} onChange={set("payment_method")} placeholder="Direct Debit / BACS" /></Field>
          <Field label="Payment Amount (Fixed DD Only)"><input type="number" step="0.01" value={f.payment_amount} onChange={set("payment_amount")} /></Field>
          <Field label="Billing Period *"><select value={f.billing_period} onChange={set("billing_period")}><option>Monthly</option><option>Quarterly</option><option>Yearly</option></select></Field>
        </Section>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => nav(-1)}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Generating…" : "Generate Contract"}</button>
        </div>
      </div>
    </>
  );
}
