import ListPage from "../components/ListPage.jsx";
import { Badge, initials } from "../components/ui.jsx";
export default function Agencies() {
  return <ListPage title="Agencies" desc="Manage your registered agencies and agent counts." resource="agencies"
    columns={[
      { key: "name", label: "Agency", render: (r) => <span className="mini"><span className="ini sq">{initials(r.name)}</span><span className="name">{r.name}</span></span> },
      { key: "total_agents", label: "Total Agents" },
      { key: "status", label: "Status", render: (r) => <Badge tone="green">{r.status}</Badge> },
    ]} />;
}
