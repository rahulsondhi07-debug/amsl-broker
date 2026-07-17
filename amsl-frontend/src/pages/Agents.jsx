import ListPage from "../components/ListPage.jsx";
import { Badge, initials } from "../components/ui.jsx";
export default function Agents() {
  return <ListPage title="Agents List" resource="agents"
    columns={[
      { key: "name", label: "Agent", render: (r) => <span className="mini"><span className="ini">{initials(r.name)}</span><span className="name">{r.name}</span></span> },
      { key: "agency_name", label: "Agency", render: (r) => r.agency_name || "—" },
      { key: "email", label: "Email", render: (r) => <span className="mono">{r.email}</span> },
      { key: "role", label: "Role", render: (r) => <Badge tone={r.role==="Admin"?"indigo":"slate"}>{r.role}</Badge> },
      { key: "aircall_enabled", label: "Aircall", render: (r) => r.aircall_enabled ? <Badge tone="green">On</Badge> : <Badge tone="slate">Off</Badge> },
      { key: "status", label: "Status", render: (r) => <Badge tone="green">{r.status}</Badge> },
    ]} />;
}
