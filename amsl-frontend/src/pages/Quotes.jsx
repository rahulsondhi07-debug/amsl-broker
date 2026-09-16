import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Download, FileSignature, Eye, RefreshCw, History } from "lucide-react";
import { Link } from "react-router-dom";
import ListPage from "../components/ListPage.jsx";
import { Badge, Modal, Spinner } from "../components/ui.jsx";
import { api } from "../api.js";

const tone = (s) => s.includes("Accepted") ? "green" : s.includes("Reject") ? "rose" : s.includes("Quoted") ? "indigo" : "slate";
const money = (n) => n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 });

// V1.7-13: pulls the admin-editable disclaimer at download time so every export always
// reflects whatever is currently set in Settings, not a baked-in copy.
async function downloadBreakdown(r) {
  let disclaimerText = "This quote is valid until 5:30pm today; prices may change and are subject to availability. All contracts are subject to credit approval. Rates in pence/kWh, excl. CCL & VAT.";
  try { disclaimerText = (await api.disclaimer()).data.text; } catch { /* fall back to default above */ }
  const L = [
    "UTILITY X — QUOTE BREAKDOWN", "".padEnd(40, "="), "",
    `Quote ID:      ${r.quote_no}${Number(r.bespoke) ? "  (BESPOKE)" : ""}`,
    `Business:      ${r.business_name || "—"}`,
    `Product:       ${r.product_name || "—"}`,
    `Supplier:      ${r.supplier_name || "—"}`,
    `Utility:       ${r.utility || "—"}`,
    `Meter:         ${r.meter_number || "—"}`,
    `Consumption:   ${r.eac ? Number(r.eac).toLocaleString() + " kWh/yr" : "—"}`,
    `Term:          ${r.term_months ? r.term_months + " months" : "—"}`,
    `Unit Rate:     ${r.unit_rate != null ? r.unit_rate + "p/kWh" : "—"}`,
    `Standing Chg:  ${r.standing_charge != null ? r.standing_charge + "p/day" : "—"}`,
    r.distribution_charge != null ? `Distribution:  ${r.distribution_charge}p/day` : null,
    r.transmission_charge != null ? `Transmission:  ${r.transmission_charge}p/day` : null,
    `Annual Cost:   ${money(r.annual_cost)}`,
    `Commission:    ${money(r.commission)}`,
    `Status:        ${r.status || "—"}`, "",
    disclaimerText,
    `Generated:     ${new Date().toLocaleString("en-GB")}`,
  ].filter((x) => x != null);
  const blob = new Blob([L.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = `Quote-${r.quote_no}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// V1.7-11: re-price against the current market; refuses (with a message) for bespoke quotes
// or when the supplier/term no longer has a rate — surfaced as an "Invalid Price" toast.
function RefreshPriceButton({ r, reload }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const refresh = async () => {
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.quoteRefreshPrice(r.id);
      setMsg(data.changed ? "Price updated" : "Already current");
      reload?.();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
    setTimeout(() => setMsg(null), 4000);
  };
  if (Number(r.bespoke)) return null;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button className="btn ghost sm" title="Refresh price" disabled={busy} onClick={refresh} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <RefreshCw size={13} className={busy ? "spin" : ""} /> {busy ? "…" : "Refresh"}
      </button>
      {msg && <span className="sub" style={{ position: "absolute", top: "100%", left: 0, whiteSpace: "nowrap", fontSize: 10.5, marginTop: 2 }}>{msg}</span>}
    </span>
  );
}

function PriceHistoryModal({ quote, onClose }) {
  const [rows, setRows] = useState(null);
  useState(() => { api.quotePriceHistory(quote.id).then((r) => setRows(r.data)).catch(() => setRows([])); }, []);
  return (
    <Modal title={`Price History — ${quote.quote_no}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="sub">No price history recorded.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((h) => (
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
  );
}

export default function Quotes() {
  const nav = useNavigate();
  const [historyFor, setHistoryFor] = useState(null);
  return <>
    <ListPage title="Quoted" resource="quotes"
      toolbar={<button className="btn primary" onClick={() => nav("/quotes/new")}><Plus size={15} /> New Quote</button>}
      columns={[
        { key: "quote_no", label: "Quote ID", render: (r) => (
          <span className="name">{r.quote_no}{Number(r.bespoke) ? <span style={{ display: "block", marginTop: 2, fontSize: 10, fontWeight: 700, color: "#0E7C7B", background: "#E1F1F0", borderRadius: 5, padding: "1px 5px", width: "fit-content" }}>BESPOKE</span> : null}</span>
        ) },
        { key: "business_name", label: "Business" },
        { key: "product_name", label: "Product", className: "frozen-col", render: (r) => r.product_name || "—" },
        { key: "utility", label: "Utility" },
        { key: "supplier_name", label: "Supplier", render: (r) => r.supplier_name || "—" },
        { key: "meter_number", label: "Meter", render: (r) => <span className="mono">{r.meter_number}</span> },
        { key: "annual_cost", label: "Annual Cost", render: (r) => (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="mono">{money(r.annual_cost)}</span>
            {!Number(r.bespoke) && <Badge tone="green">Best Price</Badge>}
          </span>
        ) },
        { key: "commission", label: "Commission", render: (r) => r.commission != null ? <span style={{ color: "var(--indigo)", fontWeight: 700 }}>{money(r.commission)}</span> : "—" },
        { key: "status", label: "Status", render: (r) => <Badge tone={tone(r.status)}>{r.status}</Badge> },
        { key: "refresh", label: "", render: (r, reload) => <RefreshPriceButton r={r} reload={reload} /> },
        { key: "history", label: "", render: (r) => (
          <button className="btn ghost sm" title="Price history" onClick={() => setHistoryFor(r)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <History size={14} /> History
          </button>
        ) },
        { key: "download", label: "Breakdown", render: (r) => (
          <button className="btn ghost sm" title="Download quote breakdown" onClick={() => downloadBreakdown(r)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Download size={14} /> PDF
          </button>
        ) },
        { key: "view", label: "", render: (r) => (
          <Link className="btn ghost sm" to={`/quotes/${r.id}`} title="View quote results" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Eye size={14} /> View
          </Link>
        ) },
        { key: "generate", label: "Contract", render: (r) => (
          <Link className="btn ghost sm" to={`/contracts/generate/${r.id}`} title="Generate contract from this quote" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <FileSignature size={14} /> Generate
          </Link>
        ) },
      ]} />
    {historyFor && <PriceHistoryModal quote={historyFor} onClose={() => setHistoryFor(null)} />}
  </>;
}
