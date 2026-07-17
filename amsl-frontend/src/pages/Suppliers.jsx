import ListPage from "../components/ListPage.jsx";
import { Badge } from "../components/ui.jsx";
const p = (v) => Number(v).toFixed(2);
export default function Suppliers() {
  return <ListPage title="Supplier List" resource="suppliers"
    columns={[
      { key: "name", label: "Supplier", render: (r) => <span className="name">{r.name}</span> },
      { key: "max_broker_comm_electric", label: "Max Elec (p/kWh)", render: (r) => p(r.max_broker_comm_electric) },
      { key: "broker_comm_inc_electric", label: "Inc Elec (p/kWh)", render: (r) => p(r.broker_comm_inc_electric) },
      { key: "max_broker_comm_gas", label: "Max Gas (p/kWh)", render: (r) => p(r.max_broker_comm_gas) },
      { key: "broker_comm_inc_gas", label: "Inc Gas (p/kWh)", render: (r) => p(r.broker_comm_inc_gas) },
      { key: "status", label: "Status", render: (r) => <Badge tone="green">{r.status}</Badge> },
    ]} />;
}
