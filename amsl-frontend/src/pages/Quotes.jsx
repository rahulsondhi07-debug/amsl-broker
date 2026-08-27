import { useNavigate } from "react-router-dom";
import { Plus, Download, FileSignature, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import ListPage from "../components/ListPage.jsx";
import { Badge } from "../components/ui.jsx";
const tone = (s) => s.includes("Accepted") ? "green" : s.includes("Reject") ? "rose" : s.includes("Quoted") ? "indigo" : "slate";
const money = (n) => n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 });

// V1.6-10: download a quote breakdown (client-side)
function downloadBreakdown(r) {
  const L = [
    "AMSL BROKER — QUOTE BREAKDOWN", "".padEnd(40, "="), "",
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
    r.distribution_charge != null ? `Distribution:  ${r.distribution_charge}p/kWh` : null,
    r.transmission_charge != null ? `Transmission:  ${r.transmission_charge}p/kWh` : null,
    `Annual Cost:   ${money(r.annual_cost)}`,
    `Commission:    ${money(r.commission)}`,
    `Status:        ${r.status || "—"}`, "",
    "This quote is valid until 5:30pm today; prices may change and are subject to availability.",
    "All contracts are subject to credit approval. Rates in pence/kWh, excl. CCL & VAT.",
    `Generated:     ${new Date().toLocaleString("en-GB")}`,
  ].filter((x) => x != null);
  const blob = new Blob([L.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = `Quote-${r.quote_no}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function Quotes() {
  const nav = useNavigate();
  return <ListPage title="Quote History" resource="quotes"
    toolbar={<button className="btn primary" onClick={() => nav("/quotes/new")}><Plus size={15} /> New Quote</button>}
    columns={[
      { key: "quote_no", label: "Quote ID", render: (r) => (
        <span className="name">{r.quote_no}{Number(r.bespoke) ? <span style={{ display: "block", marginTop: 2, fontSize: 10, fontWeight: 700, color: "#0E7C7B", background: "#E1F1F0", borderRadius: 5, padding: "1px 5px", width: "fit-content" }}>BESPOKE</span> : null}</span>
      ) },
      { key: "business_name", label: "Business" },
      { key: "product_name", label: "Product", render: (r) => r.product_name || "—" },
      { key: "utility", label: "Utility" },
      { key: "supplier_name", label: "Supplier", render: (r) => r.supplier_name || "—" },
      { key: "meter_number", label: "Meter", render: (r) => <span className="mono">{r.meter_number}</span> },
      { key: "annual_cost", label: "Annual Cost", render: (r) => <span className="mono">{money(r.annual_cost)}</span> },
      { key: "commission", label: "Commission", render: (r) => r.commission != null ? <span style={{ color: "var(--indigo)", fontWeight: 700 }}>{money(r.commission)}</span> : "—" },
      { key: "status", label: "Status", render: (r) => <Badge tone={tone(r.status)}>{r.status}</Badge> },
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
    ]} />;
}
