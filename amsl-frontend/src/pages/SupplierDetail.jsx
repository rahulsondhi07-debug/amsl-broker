import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, FileText, Upload } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner } from "../components/ui.jsx";

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

  useEffect(() => { api.get(`/suppliers/${id}`).then((r) => setS(r.data)).catch((e) => setErr(e.message)); }, [id]);
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
        <button className="btn primary" onClick={() => alert("Edit supplier — reuses the Add Supplier form, pre-filled (wire to your edit route).")}><Pencil size={15} /> Edit</button>
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
    </>
  );
}
