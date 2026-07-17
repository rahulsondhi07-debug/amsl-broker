import ListPage from "../components/ListPage.jsx";
import { Badge } from "../components/ui.jsx";
export default function Products() {
  return <ListPage title="Products List" resource="products"
    columns={[
      { key: "name", label: "Product", render: (r) => <span className="name">{r.name}</span> },
      { key: "supplier_name", label: "Supplier", render: (r) => r.supplier_name || "—" },
      { key: "utility", label: "Utility" },
      { key: "segment", label: "Segment" },
      { key: "acq_renewal", label: "Acq / Renewal" },
      { key: "valid_from", label: "Valid From", render: (r) => <span className="mono">{r.valid_from}</span> },
      { key: "valid_till", label: "Valid Till", render: (r) => <span className="mono">{r.valid_till}</span> },
      { key: "status", label: "Status", render: (r) => <Badge tone="green">{r.status}</Badge> },
    ]} />;
}
