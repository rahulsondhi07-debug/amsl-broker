import ListPage from "../components/ListPage.jsx";
import { Badge } from "../components/ui.jsx";
export default function Tickets() {
  return <ListPage title="Ticket Management" resource="tickets"
    columns={[
      { key: "business_name", label: "Business" },
      { key: "agency_name", label: "Agency", render: (r) => r.agency_name || "—" },
      { key: "agent_name", label: "Agent", render: (r) => r.agent_name || "—" },
      { key: "utility", label: "Utility" },
      { key: "query_type", label: "Query Type" },
      { key: "query_name", label: "Query" },
      { key: "status", label: "Status", render: (r) => <Badge tone="amber">{r.status}</Badge> },
      { key: "raised_date", label: "Raised", render: (r) => <span className="mono">{r.raised_date?.slice(0,10)}</span> },
    ]} />;
}
