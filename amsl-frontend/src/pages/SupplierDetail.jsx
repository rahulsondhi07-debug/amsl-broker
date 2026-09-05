import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, FileText, Upload } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const ROLES = ["No Role", "Matrix for Live quote Gas", "Matrix for Live Quote & Corporate", "Corporate Gas & Electricity", "Matrix for Live quote Electricity", "Matrix for Live quote Electricity & Gas"];
const FUEL_MIX = ["Standard", "Green / Renewable", "Mixed", "100% Renewable"];

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "N/A"}</span>
    </div>
  );
}
const pw = (has) => (has ? "•••••••• (set)" : "N/A");

// Broker meter types mapped to supplier-side values (used at quote/contract generation)
const METER_TYPES = [
  { type: "NHH Electricity", code: "E-NHH" },
  { type: "HH Electricity", code: "E-HH" },
  { type: "SME Gas", code: "G-SME" },
  { type: "Industrial Gas", code: "G-IND" },
];

export default function SupplierDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [s, setS] = useState(null);
  const [tab, setTab] = useState("details");
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = () => api.get(`/suppliers/${id}`).then((r) => setS(r.data)).catch((e) => setErr(e.message));
  useEffect(load, [id]); // eslint-disable-line
  if (err) return <ErrorBanner error={err} />;
  if (!s) return <Spinner />;

  const tabs = [["details", "Supplier Details"], ["documents", "Supplier Documents"], ["mapping", "Meter Type Mapping"], ["settings", "Supplier Settings"]];

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ margin: 0 }}>{s.name} <Badge tone={/active/i.test(s.status) ? "green" : "amber"}>{s.status}</Badge></h1>
            <p className="sub" style={{ margin: 0 }}>{s.supplier_role || "No Role"} · {s.fuel_mix || "—"}</p>
          </div>
        </div>
        <button className="btn primary" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>
      </div>

      <div className="toggle" style={{ marginBottom: 14 }}>
        {tabs.map(([k, label]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === "details" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
            <Card title="Overview">
              <Row k="Supplier Role" v={s.supplier_role} /><Row k="TPI Role" v={s.tpi_role} />
              <Row k="Fuel Mix" v={s.fuel_mix} /><Row k="Status" v={s.status} />
              <Row k="Max Broker Comm — Elec" v={s.max_broker_comm_electric != null ? `${s.max_broker_comm_electric}p` : null} />
              <Row k="Max Broker Comm — Gas" v={s.max_broker_comm_gas != null ? `${s.max_broker_comm_gas}p` : null} />
            </Card>
            <Card title="SME TPI Contact">
              <Row k="Email" v={s.sme_email} /><Row k="Mobile" v={s.sme_mobile} />
              <Row k="Landline" v={s.sme_landline} /><Row k="Password" v={pw(s.sme_has_password)} />
              <Row k="Threshold" v={s.sme_threshold ? `${Number(s.sme_threshold).toLocaleString()} kWh` : null} />
              <Row k="Corporate Login Email" v={s.corporate_login_email} />
            </Card>
            <Card title="Midmarket TPI Contact">
              <Row k="Name" v={s.mm_name} /><Row k="Email" v={s.mm_email} />
              <Row k="Password" v={pw(s.mm_has_password)} /><Row k="Mobile" v={s.mm_mobile} />
              <Row k="Landline" v={s.mm_landline} /><Row k="Threshold" v={s.mm_threshold ? `${Number(s.mm_threshold).toLocaleString()} kWh` : null} />
            </Card>
            <Card title="Industrial TPI Contact">
              <Row k="Name" v={s.ind_name} /><Row k="Email" v={s.ind_email} />
              <Row k="Password" v={pw(s.ind_has_password)} /><Row k="Mobile" v={s.ind_mobile} />
              <Row k="Landline" v={s.ind_landline} /><Row k="Threshold" v={s.ind_threshold ? `${Number(s.ind_threshold).toLocaleString()} kWh` : null} />
            </Card>
          </div>
          <Card title="Commercial Terms & About">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              <Row k="Contract Condition" v={s.contract_condition} /><Row k="Credit Check" v={s.credit_check} />
              <Row k="Commission Payment" v={s.commission_payment} /><Row k="Customer Billing" v={s.customer_billing} />
              <Row k="Supplier Contact" v={s.supplier_contact} /><Row k="Restricted Business Types" v={s.restricted_business_types} />
            </div>
            <div style={{ paddingTop: 10 }}><div className="sub" style={{ fontSize: 12 }}>Address</div><div style={{ fontSize: 13 }}>{s.supplier_address || "—"}</div></div>
            <div style={{ paddingTop: 8 }}><div className="sub" style={{ fontSize: 12 }}>About</div><div style={{ fontSize: 13 }}>{s.about || "—"}</div></div>
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <Card title="Supplier Documents">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            {["LOAs", "Renewals", "Terminations"].map((d) => (
              <div key={d} style={{ border: "1px dashed var(--line,#D8DEE6)", borderRadius: 10, padding: 16, textAlign: "center" }}>
                <FileText size={22} color="#94A3B8" />
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>{d}</div>
                <div className="sub" style={{ fontSize: 11 }}>No documents</div>
              </div>
            ))}
          </div>
          <button className="btn ghost" onClick={() => alert("Document upload attaches to the supplier record (wire to your file storage).")}><Upload size={14} /> Upload document</button>
        </Card>
      )}

      {tab === "mapping" && (
        <Card title="Supplier Meter Type Mapping">
          <p className="sub" style={{ fontSize: 12, marginBottom: 10 }}>Maps broker meter types to this supplier's expected values for quote &amp; contract generation.</p>
          <table className="tbl">
            <thead><tr><th>Broker Meter Type</th><th>Supplier Value</th></tr></thead>
            <tbody>
              {METER_TYPES.map((m) => (
                <tr key={m.type}><td>{m.type}</td><td><span className="mono">{s.name?.slice(0, 3).toUpperCase()}-{m.code}</span></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "settings" && (
        <Card title="Supplier Settings">
          <Row k="Status" v={s.status} />
          <Row k="Supplier Role" v={s.supplier_role} />
          <Row k="Max Broker Commission — Electricity" v={s.max_broker_comm_electric != null ? `${s.max_broker_comm_electric} p/kWh` : null} />
          <Row k="Max Broker Commission — Gas" v={s.max_broker_comm_gas != null ? `${s.max_broker_comm_gas} p/kWh` : null} />
          <Row k="SME Threshold" v={s.sme_threshold ? `${Number(s.sme_threshold).toLocaleString()} kWh` : null} />
          <Row k="Midmarket Threshold" v={s.mm_threshold ? `${Number(s.mm_threshold).toLocaleString()} kWh` : null} />
          <Row k="Industrial Threshold" v={s.ind_threshold ? `${Number(s.ind_threshold).toLocaleString()} kWh` : null} />
          <Row k="Restricted Business Types" v={s.restricted_business_types} />
        </Card>
      )}

      {editing && <EditSupplier supplier={s} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </>
  );
}

const Section = ({ title, cols = 2, children }) => (
  <div style={{ marginTop: 14 }}>
    <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", marginBottom: 8 }}>{title}</div>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 12 }}>{children}</div>
  </div>
);

function EditSupplier({ supplier: sp, onClose, onSaved }) {
  const [f, setF] = useState({
    name: sp.name || "", supplier_role: sp.supplier_role || "No Role", tpi_role: sp.tpi_role || "", fuel_mix: sp.fuel_mix || "Standard", status: sp.status || "Active",
    max_broker_comm_electric: sp.max_broker_comm_electric ?? "", max_broker_comm_gas: sp.max_broker_comm_gas ?? "",
    sme_email: sp.sme_email || "", sme_mobile: sp.sme_mobile || "", sme_landline: sp.sme_landline || "", sme_password: "", sme_threshold: sp.sme_threshold ?? "",
    corporate_login_email: sp.corporate_login_email || "",
    mm_name: sp.mm_name || "", mm_email: sp.mm_email || "", mm_password: "", mm_mobile: sp.mm_mobile || "", mm_landline: sp.mm_landline || "", mm_threshold: sp.mm_threshold ?? "",
    ind_name: sp.ind_name || "", ind_email: sp.ind_email || "", ind_password: "", ind_mobile: sp.ind_mobile || "", ind_landline: sp.ind_landline || "", ind_threshold: sp.ind_threshold ?? "",
    contract_condition: sp.contract_condition || "", credit_check: sp.credit_check || "", commission_payment: sp.commission_payment || "", customer_billing: sp.customer_billing || "",
    supplier_contact: sp.supplier_contact || "", supplier_address: sp.supplier_address || "", restricted_business_types: sp.restricted_business_types || "", about: sp.about || "",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return setErr("Supplier Name is required");
    setSaving(true); setErr(null);
    try {
      const payload = { ...f };
      payload.max_broker_comm_electric = f.max_broker_comm_electric === "" ? 0 : Number(f.max_broker_comm_electric);
      payload.max_broker_comm_gas = f.max_broker_comm_gas === "" ? 0 : Number(f.max_broker_comm_gas);
      ["sme_threshold", "mm_threshold", "ind_threshold"].forEach((k) => { if (f[k] === "") delete payload[k]; else payload[k] = Number(f[k]); });
      // Don't overwrite an existing password with a blank field the user didn't touch
      ["sme_password", "mm_password", "ind_password"].forEach((k) => { if (!f[k]) delete payload[k]; });
      await api.put(`/suppliers/${sp.id}`, payload);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Edit Supplier" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
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
        <Field label="SME Password"><input type="password" placeholder="Leave blank to keep current" value={f.sme_password} onChange={set("sme_password")} /></Field>
        <Field label="SME Threshold (kWh)"><input type="number" value={f.sme_threshold} onChange={set("sme_threshold")} /></Field>
        <Field label="Corporate Login Email"><input type="email" value={f.corporate_login_email} onChange={set("corporate_login_email")} /></Field>
      </Section>
      <Section title="Midmarket TPI Contact" cols={3}>
        <Field label="Midmarket Name"><input value={f.mm_name} onChange={set("mm_name")} /></Field>
        <Field label="Midmarket Email"><input type="email" value={f.mm_email} onChange={set("mm_email")} /></Field>
        <Field label="Midmarket Password"><input type="password" placeholder="Leave blank to keep current" value={f.mm_password} onChange={set("mm_password")} /></Field>
        <Field label="Midmarket Mobile"><input value={f.mm_mobile} onChange={set("mm_mobile")} /></Field>
        <Field label="Midmarket Landline"><input value={f.mm_landline} onChange={set("mm_landline")} /></Field>
        <Field label="Midmarket Threshold (kWh)"><input type="number" value={f.mm_threshold} onChange={set("mm_threshold")} /></Field>
      </Section>
      <Section title="Industrial TPI Contact" cols={3}>
        <Field label="Industrial Name"><input value={f.ind_name} onChange={set("ind_name")} /></Field>
        <Field label="Industrial Email"><input type="email" value={f.ind_email} onChange={set("ind_email")} /></Field>
        <Field label="Industrial Password"><input type="password" placeholder="Leave blank to keep current" value={f.ind_password} onChange={set("ind_password")} /></Field>
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
    </Modal>
  );
}
