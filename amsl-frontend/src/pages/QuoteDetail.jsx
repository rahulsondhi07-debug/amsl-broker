import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Download, FileSignature, Mail } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner } from "../components/ui.jsx";

const money = (n) => n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 });
const p2 = (v) => (v == null || v === "" ? "—" : `${Number(v).toFixed(2)}p`);

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v ?? "—"}</span>
    </div>
  );
}

function downloadReport(q) {
  const L = [
    "AMSL BROKER — QUOTE RESULT", "".padEnd(40, "="), "",
    `Quote ID:      ${q.quote_no}${Number(q.bespoke) ? "  (BESPOKE)" : ""}`,
    `Business:      ${q.business_name || "—"}`,
    `Product:       ${q.product_name || "—"}`,
    `Supplier:      ${q.supplier_name || "—"}`,
    `Utility:       ${q.utility || "—"}   Meter: ${q.meter_number || "—"}`,
    `Consumption:   ${q.eac ? Number(q.eac).toLocaleString() + " kWh/yr" : "—"}`,
    `Term:          ${q.term_months ? q.term_months + " months" : "—"}`,
    `Unit Rate:     ${q.unit_rate != null ? q.unit_rate + "p/kWh" : "—"}`,
    `Standing Chg:  ${q.standing_charge != null ? q.standing_charge + "p/day" : "—"}`,
    q.distribution_charge != null ? `Distribution:  ${q.distribution_charge}p/kWh` : null,
    q.transmission_charge != null ? `Transmission:  ${q.transmission_charge}p/kWh` : null,
    `Annual Cost:   ${money(q.annual_cost)}`,
    `Commission:    ${money(q.commission)}`,
    `Status:        ${q.status || "—"}`, "",
    `Generated:     ${new Date().toLocaleString("en-GB")}`,
  ].filter(Boolean);
  const blob = new Blob([L.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = `Quote-${q.quote_no}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function QuoteDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { api.get(`/quotes/${id}`).then((r) => setQ(r.data)).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <ErrorBanner error={err} />;
  if (!q) return <Spinner />;

  const bespoke = Number(q.bespoke);

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ margin: 0 }}>{q.quote_no} {bespoke ? <Badge tone="indigo">Bespoke</Badge> : null} <Badge tone={/Accept/i.test(q.status) ? "green" : /Reject/i.test(q.status) ? "rose" : "slate"}>{q.status}</Badge></h1>
            <p className="sub" style={{ margin: 0 }}>{q.business_name} · Market Supplier Details</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => downloadReport(q)}><Download size={14} /> Download Report</button>
          <button className="btn" onClick={() => alert("Send Email — emails the quote to the customer (wire to SMTP).")}><Mail size={14} /> Send Email</button>
          <Link className="btn primary" to={`/contracts/generate/${q.id}`}><FileSignature size={14} /> Generate Contract</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title="Market Supplier Details">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0 12px", borderBottom: "2px solid var(--line,#EEF1F4)", marginBottom: 6 }}>
            <div><div style={{ fontWeight: 800, fontSize: 16 }}>{q.supplier_name || "—"}</div><div className="sub" style={{ fontSize: 12 }}>{q.product_name || "Market rate"}</div></div>
            <div style={{ textAlign: "right" }}><div className="sub" style={{ fontSize: 11 }}>Annual Cost</div><div style={{ fontWeight: 800, fontSize: 20, color: "var(--brand,#0E7C7B)" }}>{money(q.annual_cost)}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
            <Row k="Term" v={q.term_months ? `${q.term_months} months` : "—"} />
            <Row k="Unit / Day Rate" v={p2(q.unit_rate)} />
            <Row k="Standing Charge" v={p2(q.standing_charge)} />
            <Row k="Commission" v={money(q.commission)} />
            {bespoke && <Row k="Distribution Charge" v={p2(q.distribution_charge)} />}
            {bespoke && <Row k="Transmission Charge" v={p2(q.transmission_charge)} />}
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Meter & Consumption">
            <Row k="Utility" v={q.utility} /><Row k="Meter (MPAN/MPRN)" v={q.meter_number} />
            <Row k="EAC" v={q.eac ? `${Number(q.eac).toLocaleString()} kWh/yr` : "—"} />
          </Card>
          <Card title="Business">
            <Row k="Business" v={q.business_name} />
            <Row k="Acquisition / Renewal" v={q.acq_renewal} />
            <Row k="Business Type" v={q.business_type} />
          </Card>
        </div>
      </div>
    </>
  );
}
