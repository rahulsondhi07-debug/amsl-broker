import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Download, FileSignature, Mail, RefreshCw, History } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal } from "../components/ui.jsx";

const money = (n) => n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 });
const p2 = (v) => (v == null || v === "" ? "—" : `${Number(v).toFixed(2)}p`);

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v ?? "—"}</span>
    </div>
  );
}

// V1.7-13: pulls the admin-editable disclaimer at download time.
async function downloadReport(q) {
  let disclaimerText = "This quote is valid until 5:30pm today; prices may change and are subject to availability. All contracts are subject to credit approval. Rates in pence/kWh, excl. CCL & VAT.";
  try { disclaimerText = (await api.disclaimer()).data.text; } catch { /* fall back to default above */ }
  const L = [
    "UTILITY X — QUOTE RESULT", "".padEnd(40, "="), "",
    `Quote ID:      ${q.quote_no}${Number(q.bespoke) ? "  (BESPOKE)" : ""}`,
    `Business:      ${q.business_name || "—"}`,
    `Product:       ${q.product_name || "—"}`,
    `Supplier:      ${q.supplier_name || "—"}`,
    `Utility:       ${q.utility || "—"}   Meter: ${q.meter_number || "—"}`,
    `Consumption:   ${q.eac ? Number(q.eac).toLocaleString() + " kWh/yr" : "—"}`,
    `Term:          ${q.term_months ? q.term_months + " months" : "—"}`,
    `Unit Rate:     ${q.unit_rate != null ? q.unit_rate + "p/kWh" : "—"}`,
    `Standing Chg:  ${q.standing_charge != null ? q.standing_charge + "p/day" : "—"}`,
    q.distribution_charge != null ? `Distribution:  ${q.distribution_charge}p/day` : null,
    q.transmission_charge != null ? `Transmission:  ${q.transmission_charge}p/day` : null,
    `Annual Cost:   ${money(q.annual_cost)}`,
    `Commission:    ${money(q.commission)}`,
    `Status:        ${q.status || "—"}`, "",
    disclaimerText, "",
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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const [history, setHistory] = useState(null);

  const load = () => api.get(`/quotes/${id}`).then((r) => setQ(r.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const refreshPrice = async () => {
    setRefreshing(true); setRefreshMsg(null);
    try {
      const { data } = await api.quoteRefreshPrice(id);
      setRefreshMsg(data.changed ? "Price updated to the current market rate." : "Already showing the current market rate.");
      load();
    } catch (e) { setRefreshMsg(e.message); }
    setRefreshing(false);
  };
  const openHistory = () => api.quotePriceHistory(id).then((r) => setHistory(r.data)).catch(() => setHistory([]));

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
          {!bespoke && <button className="btn" disabled={refreshing} onClick={refreshPrice}><RefreshCw size={14} className={refreshing ? "spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh Price"}</button>}
          {!bespoke && <button className="btn" onClick={openHistory}><History size={14} /> Price History</button>}
          <button className="btn" onClick={() => downloadReport(q)}><Download size={14} /> Download Report</button>
          <button className="btn" onClick={() => alert("Send Email — emails the quote to the customer (wire to SMTP).")}><Mail size={14} /> Send Email</button>
          <Link className="btn primary" to={`/contracts/generate/${q.id}`}><FileSignature size={14} /> Generate Contract</Link>
        </div>
      </div>
      {refreshMsg && <div className="sub" style={{ marginBottom: 10, fontSize: 12 }}>{refreshMsg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title="Market Supplier Details">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0 12px", borderBottom: "2px solid var(--line,#EEF1F4)", marginBottom: 6 }}>
            <div><div style={{ fontWeight: 800, fontSize: 16 }}>{q.supplier_name || "—"}</div><div className="sub" style={{ fontSize: 12 }}>{q.product_name || "Market rate"}</div></div>
            <div style={{ textAlign: "right" }}><div className="sub" style={{ fontSize: 11 }}>Annual Cost {!bespoke && <Badge tone="green">Best Price</Badge>}</div><div style={{ fontWeight: 800, fontSize: 20, color: "var(--brand,#0E7C7B)" }}>{money(q.annual_cost)}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
            <Row k="Term" v={q.term_months ? `${q.term_months} months` : "—"} />
            <Row k="Unit / Day Rate" v={p2(q.unit_rate)} />
            <Row k="Standing Charge" v={p2(q.standing_charge)} />
            <Row k="Commission" v={money(q.commission)} />
            {bespoke && <Row k="Distribution Charge (p/day)" v={p2(q.distribution_charge)} />}
            {bespoke && <Row k="Transmission Charge (p/day)" v={p2(q.transmission_charge)} />}
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

      {history && (
        <Modal title={`Price History — ${q.quote_no}`} onClose={() => setHistory(null)} footer={<button className="btn" onClick={() => setHistory(null)}>Close</button>}>
          {history.length === 0 ? <div className="sub">No price history recorded.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, background: h.valid ? "#ecfdf5" : "#F8FAFC", border: `1px solid ${h.valid ? "#a7f3d0" : "var(--line,#E7EBF0)"}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{h.unit_rate}p/kWh · {h.standing_charge}p/day <span className="sub" style={{ fontWeight: 400 }}>({h.term_months}m)</span></div>
                    <div className="sub" style={{ fontSize: 11 }}>{money(h.annual_cost)}/yr · {h.source === "refresh" ? "Refreshed" : "Created"} {new Date(h.created_at).toLocaleString("en-GB")}</div>
                  </div>
                  <Badge tone={h.valid ? "green" : "rose"}>{h.valid ? "Best Price" : "Invalid Price"}</Badge>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
