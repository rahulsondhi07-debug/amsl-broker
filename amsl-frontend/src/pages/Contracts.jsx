import ListPage from "../components/ListPage.jsx";
import { Badge } from "../components/ui.jsx";
const money = (n) => "£" + Number(n||0).toLocaleString("en-GB",{minimumFractionDigits:2});
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
    ]} />;
}
