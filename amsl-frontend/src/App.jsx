import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Leads from "./pages/Leads.jsx";
import Customers from "./pages/Customers.jsx";
import Pipeline from "./pages/Pipeline.jsx";
import Renewals from "./pages/Renewals.jsx";
import Permissions from "./pages/Permissions.jsx";
import Master from "./pages/Master.jsx";
import CustomerDetail from "./pages/CustomerDetail.jsx";
import Branding from "./pages/Branding.jsx";
import AgencyDetail from "./pages/AgencyDetail.jsx";
import AgentDetail from "./pages/AgentDetail.jsx";
import SupplierDetail from "./pages/SupplierDetail.jsx";
import GenerateContract from "./pages/GenerateContract.jsx";
import QuoteDetail from "./pages/QuoteDetail.jsx";
import ContractDetail from "./pages/ContractDetail.jsx";
import Tutorials from "./pages/Tutorials.jsx";
import Settings from "./pages/Settings.jsx";
import Commission from "./pages/Commission.jsx";
import BillValidation from "./pages/BillValidation.jsx";
import EiiCertificates from "./pages/EiiCertificates.jsx";
import Quotes from "./pages/Quotes.jsx";
import NewQuote from "./pages/NewQuote.jsx";
import Contracts from "./pages/Contracts.jsx";
import Suppliers from "./pages/Suppliers.jsx";
import SupplierPayments from "./pages/SupplierPayments.jsx";
import Agencies from "./pages/Agencies.jsx";
import Agents from "./pages/Agents.jsx";
import Products from "./pages/Products.jsx";
import Tickets from "./pages/Tickets.jsx";
import Tariffs from "./pages/Tariffs.jsx";

function RequireAuth() {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="agencies" element={<Agencies />} />
              <Route path="agencies/:id" element={<AgencyDetail />} />
              <Route path="agents" element={<Agents />} />
              <Route path="agents/:id" element={<AgentDetail />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="suppliers/:id" element={<SupplierDetail />} />
              <Route path="tariffs" element={<Tariffs />} />
              <Route path="supplier-payments" element={<SupplierPayments />} />
              <Route path="products" element={<Products />} />
              <Route path="leads" element={<Leads />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="quotes/:id" element={<QuoteDetail />} />
              <Route path="quotes/new" element={<NewQuote />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="renewals" element={<Renewals />} />
              <Route path="permissions" element={<Permissions />} />
              <Route path="master" element={<Master />} />
              <Route path="branding" element={<Branding />} />
              <Route path="tutorials" element={<Tutorials />} />
              <Route path="settings" element={<Settings />} />
              <Route path="commission" element={<Commission />} />
              <Route path="bill-validation" element={<BillValidation />} />
              <Route path="eii-certificates" element={<EiiCertificates />} />
              <Route path="contracts" element={<Contracts />} />
              <Route path="contracts/:id" element={<ContractDetail />} />
              <Route path="contracts/generate" element={<GenerateContract />} />
              <Route path="contracts/generate/:quoteId" element={<GenerateContract />} />
              <Route path="tickets" element={<Tickets />} />
              <Route path="*" element={<Dashboard />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
