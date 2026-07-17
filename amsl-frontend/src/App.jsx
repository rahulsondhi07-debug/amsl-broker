import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Leads from "./pages/Leads.jsx";
import Customers from "./pages/Customers.jsx";
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
              <Route path="agents" element={<Agents />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="tariffs" element={<Tariffs />} />
              <Route path="supplier-payments" element={<SupplierPayments />} />
              <Route path="products" element={<Products />} />
              <Route path="leads" element={<Leads />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="quotes/new" element={<NewQuote />} />
              <Route path="customers" element={<Customers />} />
              <Route path="contracts" element={<Contracts />} />
              <Route path="tickets" element={<Tickets />} />
              <Route path="*" element={<Dashboard />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
