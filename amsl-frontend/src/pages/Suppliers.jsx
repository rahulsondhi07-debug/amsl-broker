import { useState } from "react";
import { Plus, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useList, Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field } from "../components/ui.jsx";

const ROLES = ["No Role", "Matrix for Live quote Gas", "Matrix for Live Quote & Corporate", "Corporate Gas & Electricity", "Matrix for Live quote Electricity", "Matrix for Live quote Electricity & Gas"];
const FUEL_MIX = ["Standard", "Green / Renewable", "Mixed", "100% Renewable"];
const p = (v) => v == null ? "—" : Number(v).toFixed(2);

export default function Suppliers() {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList("suppliers", { limit: 10 });
  const [showAdd, setShowAdd] = useState(false);
  return (
    <>
      <div className="page-head">
        <div><h1>Supplier List</h1><p className="sub">Manage suppliers, TPI contacts and commission terms.</p></div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Supplier</button>
      </div>
      <Card>
        <input placeholder="Search supplier, role…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", marginBottom: 12 }} />
        {error && <ErrorBanner error={error} onRetry={reload} />}
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Supplier</th><th>Role</th><th>Fuel Mix</th><th>Max Elec</th><th>Max Gas</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td><span className="name">{r.name}</span></td>
                    <td style={{ fontSize: 12 }}>{r.supplier_role || "—"}</td>
                    <td style={{ fontSize: 12 }}>{r.fuel_mix || "—"}</td>
                    <td className="mono">{p(r.max_broker_comm_electric)}</td>
                    <td className="mono">{p(r.max_broker_comm_gas)}</td>
                    <td><Badge tone="green">{r.status}</Badge></td>
                    <td><Link className="btn ghost sm" to={`/suppliers/${r.id}`} title="View supplier"><Eye size={14} /> View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && <Pager meta={meta} page={page} setPage={setPage} />}
      </Card>
      {showAdd && <AddSupplier onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); }} />}
    </>
  );
}

const Section = ({ title, cols = 2, children }) => (
  <div style={{ marginTop: 14 }}>
    <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", marginBottom: 8 }}>{title}</div>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 12 }}>{children}</div>
  </div>
);

function AddSupplier({ onClose, onSaved }) {
  const [f, setF] = useState({
    name: "", supplier_role: "No Role", tpi_role: "", fuel_mix: "Standard", status: "Active",
    max_broker_comm_electric: "", max_broker_comm_gas: "",
    sme_email: "", sme_mobile: "", sme_landline: "", sme_password: "", sme_threshold: "",
    corporate_login_email: "",
    mm_name: "", mm_email: "", mm_password: "", mm_mobile: "", mm_landline: "", mm_threshold: "",
    ind_name: "", ind_email: "", ind_password: "", ind_mobile: "", ind_landline: "", ind_threshold: "",
    contract_condition: "", credit_check: "", commission_payment: "", customer_billing: "",
    supplier_contact: "", supplier_address: "", restricted_business_types: "", about: "",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return setErr("Supplier Name is required");
    setSaving(true); setErr(null);
    try {
      const payload = { ...f };
      // commission caps are NOT NULL columns — default blanks to 0
      payload.max_broker_comm_electric = f.max_broker_comm_electric === "" ? 0 : Number(f.max_broker_comm_electric);
      payload.max_broker_comm_gas = f.max_broker_comm_gas === "" ? 0 : Number(f.max_broker_comm_gas);
      // thresholds are nullable — omit when blank so they aren't sent as invalid values
      ["sme_threshold", "mm_threshold", "ind_threshold"].forEach((k) => { if (f[k] === "") delete payload[k]; else payload[k] = Number(f[k]); });
      await api.post("/suppliers", payload);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Add Supplier" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Submit"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <Section title="Supplier Details">
        <Field label="Supplier Name *"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Supplier Role"><select value={f.supplier_role} onChange={set("supplier_role")}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="TPI Role"><input value={f.tpi_role} onChange={set("tpi_role")} /></Field>
        <Field label="Fuel Mix"><select value={f.fuel_mix} onChange={set("fuel_mix")}>{FUEL_MIX.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Max Broker Comm — Elec (p/kWh)"><input type="number" step="0.01" value={f.max_broker_comm_electric} onChange={set("max_broker_comm_electric")} /></Field>
        <Field label="Max Broker Comm — Gas (p/kWh)"><input type="number" step="0.01" value={f.max_broker_comm_gas} onChange={set("max_broker_comm_gas")} /></Field>
        <Field label="Supplier Status"><select value={f.status} onChange={set("status")}><option>Active</option><option>Inactive</option></select></Field>
      </Section>
      <Section title="SME TPI Contact">
        <Field label="SME Email"><input type="email" value={f.sme_email} onChange={set("sme_email")} /></Field>
        <Field label="SME Mobile"><input value={f.sme_mobile} onChange={set("sme_mobile")} /></Field>
        <Field label="SME Landline"><input value={f.sme_landline} onChange={set("sme_landline")} /></Field>
        <Field label="SME Password"><input type="password" value={f.sme_password} onChange={set("sme_password")} /></Field>
        <Field label="SME Threshold (kWh)"><input type="number" value={f.sme_threshold} onChange={set("sme_threshold")} /></Field>
        <Field label="Corporate Login Email"><input type="email" value={f.corporate_login_email} onChange={set("corporate_login_email")} /></Field>
      </Section>
      <Section title="Midmarket TPI Contact" cols={3}>
        <Field label="Midmarket Name"><input value={f.mm_name} onChange={set("mm_name")} /></Field>
        <Field label="Midmarket Email"><input type="email" value={f.mm_email} onChange={set("mm_email")} /></Field>
        <Field label="Midmarket Password"><input type="password" value={f.mm_password} onChange={set("mm_password")} /></Field>
        <Field label="Midmarket Mobile"><input value={f.mm_mobile} onChange={set("mm_mobile")} /></Field>
        <Field label="Midmarket Landline"><input value={f.mm_landline} onChange={set("mm_landline")} /></Field>
        <Field label="Midmarket Threshold (kWh)"><input type="number" value={f.mm_threshold} onChange={set("mm_threshold")} /></Field>
      </Section>
      <Section title="Industrial TPI Contact" cols={3}>
        <Field label="Industrial Name"><input value={f.ind_name} onChange={set("ind_name")} /></Field>
        <Field label="Industrial Email"><input type="email" value={f.ind_email} onChange={set("ind_email")} /></Field>
        <Field label="Industrial Password"><input type="password" value={f.ind_password} onChange={set("ind_password")} /></Field>
        <Field label="Industrial Mobile"><input value={f.ind_mobile} onChange={set("ind_mobile")} /></Field>
        <Field label="Industrial Landline"><input value={f.ind_landline} onChange={set("ind_landline")} /></Field>
        <Field label="Industrial Threshold (kWh)"><input type="number" value={f.ind_threshold} onChange={set("ind_threshold")} /></Field>
      </Section>
      <Section title="Commercial Terms">
        <Field label="Contract Condition"><input value={f.contract_condition} onChange={set("contract_condition")} /></Field>
        <Field label="Credit Check"><input value={f.credit_check} onChange={set("credit_check")} /></Field>
        <Field label="Commission Payment"><input value={f.commission_payment} onChange={set("commission_payment")} /></Field>
        <Field label="Customer Billing"><input value={f.customer_billing} onChange={set("customer_billing")} /></Field>
      </Section>
      <Section title="Contact & About">
        <Field label="Supplier Contact"><input value={f.supplier_contact} onChange={set("supplier_contact")} /></Field>
        <Field label="Restricted Business Types"><input value={f.restricted_business_types} onChange={set("restricted_business_types")} /></Field>
      </Section>
      <Field label="Supplier Address"><textarea value={f.supplier_address} onChange={set("supplier_address")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
      <Field label="About Supplier"><textarea value={f.about} onChange={set("about")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
      <p className="sub" style={{ fontSize: 11, marginTop: 4 }}>Logo upload is available on the supplier record after creation.</p>
    </Modal>
  );
}
