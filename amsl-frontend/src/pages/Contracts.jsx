import ListPage from "../components/ListPage.jsx";
import { Badge } from "../components/ui.jsx";
import { Download, Eye } from "lucide-react";
import { Link } from "react-router-dom";
const money = (n) => "£" + Number(n||0).toLocaleString("en-GB",{minimumFractionDigits:2});

// V1.6-15: download a contract summary (client-side, no backend file needed)
function downloadContract(r) {
  const lines = [
    "AMSL BROKER — CONTRACT SUMMARY", "".padEnd(40, "="), "",
    `Contract ID:   ${r.contract_no || "—"}`,
    `Business:      ${r.business_name || "—"}`,
    `Supplier:      ${r.supplier_name || "—"}`,
    `Agent:         ${r.agent_name || "—"}`,
    `Utility:       ${r.utility || "—"}`,
    `Term:          ${r.term_months} months`,
    `Consumption:   ${Number(r.consumption).toLocaleString()} kWh/yr`,
    `Commission:    ${money(r.commission_value)}`,
    `Status:        ${r.status || "—"}`, "",
    `Generated:     ${new Date().toLocaleString("en-GB")}`,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `Contract-${r.contract_no || r.id || "AMSL"}.txt`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function Contracts() {
  return <ListPage title="Contract Management" resource="contracts"
    columns={[
      { key: "contract_no", label: "ID", render: (r) => <span className="name">{r.contract_no}</span> },
      { key: "business_name", label: "Business" },
      { key: "supplier_name", label: "Supplier", render: (r) => r.supplier_name || "—" },
      { key: "agent_name", label: "Agent", render: (r) => r.agent_name || "—" },
      { key: "term_months", label: "Term", render: (r) => `${r.term_months} M` },
      { key: "utility", label: "Utility" },
      { key: "consumption", label: "Consumption", render: (r) => <span className="mono">{Number(r.consumption).toLocaleString()}</span> },
      { key: "commission_value", label: "Commission", render: (r) => <span className="name">{money(r.commission_value)}</span> },
      { key: "status", label: "Status", render: (r) => <Badge tone={r.status.includes("Accepted")?"green":"amber"}>{r.status}</Badge> },
      { key: "view", label: "", render: (r) => (
        <Link className="btn ghost sm" to={`/contracts/${r.id}`} title="View contract" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Eye size={14} /> View
        </Link>
      ) },
      { key: "download", label: "Download Contract", render: (r) => (
        <button className="btn ghost sm" title="Download contract" onClick={() => downloadContract(r)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Download size={14} /> Download
        </button>
      ) },
    ]} />;
}
