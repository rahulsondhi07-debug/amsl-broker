import BusinessTable from "../components/BusinessTable.jsx";
export default function Customers() {
  return <BusinessTable resource="customers" title="Customer Management" desc="Converted, active broker clients." isLead={false} />;
}
