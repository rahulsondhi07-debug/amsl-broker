import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import ListPage from "../components/ListPage.jsx";
import { Badge } from "../components/ui.jsx";
const tone = (s) => s.includes("Accepted") ? "green" : s.includes("Reject") ? "rose" : s.includes("Quoted") ? "indigo" : "slate";
const money = (n) => n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 });
export default function Quotes() {
  const nav = useNavigate();
  return <ListPage title="Quote History" resource="quotes"
    toolbar={<button className="btn primary" onClick={() => nav("/quotes/new")}><Plus size={15} /> New Quote</button>}
    columns={[
      { key: "quote_no", label: "Quote ID", render: (r) => <span className="name">{r.quote_no}</span> },
      { key: "business_name", label: "Business" },
      { key: "utility", label: "Utility" },
      { key: "supplier_name", label: "Supplier", render: (r) => r.supplier_name || "—" },
      { key: "meter_number", label: "Meter", render: (r) => <span className="mono">{r.meter_number}</span> },
      { key: "annual_cost", label: "Annual Cost", render: (r) => <span className="mono">{money(r.annual_cost)}</span> },
      { key: "commission", label: "Commission", render: (r) => r.commission != null ? <span style={{ color: "var(--indigo)", fontWeight: 700 }}>{money(r.commission)}</span> : "—" },
      { key: "status", label: "Status", render: (r) => <Badge tone={tone(r.status)}>{r.status}</Badge> },
    ]} />;
}
