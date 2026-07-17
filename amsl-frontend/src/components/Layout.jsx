import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Building2, Users, Truck, CreditCard, Package,
  UserPlus, FilePlus2, ClipboardList, UserCheck, FileSignature, Ticket,
  Search, Bell, Phone, LogOut, PoundSterling,
} from "lucide-react";
import { useAuth } from "./AuthContext.jsx";
import { initials } from "./ui.jsx";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/agencies", icon: Building2, label: "Agencies" },
  { to: "/agents", icon: Users, label: "Agents" },
  { to: "/suppliers", icon: Truck, label: "Suppliers" },
  { to: "/tariffs", icon: PoundSterling, label: "Tariffs" },
  { to: "/supplier-payments", icon: CreditCard, label: "Supplier Payments" },
  { to: "/products", icon: Package, label: "Products" },
  { to: "/leads", icon: UserPlus, label: "Leads" },
  { to: "/quotes/new", icon: FilePlus2, label: "Get Quote" },
  { to: "/quotes", icon: ClipboardList, label: "Quotes" },
  { to: "/customers", icon: UserCheck, label: "Customers" },
  { to: "/contracts", icon: FileSignature, label: "Contracts" },
  { to: "/tickets", icon: Ticket, label: "Tickets" },
];

export default function Layout() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const doLogout = () => { logout(); nav("/login", { replace: true }); };
  return (
    <div className="app">
      <aside className="rail">
        <div className="logo">AB</div>
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = n.end ? loc.pathname === "/" : loc.pathname.startsWith(n.to);
          return (
            <NavLink key={n.label} to={n.to} className={`rail-link ${active ? "active" : ""}`}>
              <Icon size={19} />
              <span className="tip">{n.label}</span>
            </NavLink>
          );
        })}
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="search">
            <Search size={16} />
            <input placeholder="Search leads, quotes, pages..." />
          </div>
          <div className="spacer" />
          <span className="pill"><Phone size={14} color="#10b981" /> Aircall</span>
          <span className="pill"><Bell size={15} /></span>
          <span className="pill" style={{ paddingLeft: 6 }}>
            <span className="avatar">{initials(user?.name || "AB")}</span>
            <span style={{ lineHeight: 1.1 }}>
              <div style={{ fontWeight: 700, color: "#334155", fontSize: 12 }}>{user?.name || "Admin Broker Portal"}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{user?.role || "Admin"}</div>
            </span>
          </span>
          <button className="pill" onClick={doLogout} title="Sign out" style={{ cursor: "pointer" }}><LogOut size={15} /></button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
