import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import {
  LayoutDashboard, Building2, Users, Truck, CreditCard, Package,
  UserPlus, FilePlus2, ClipboardList, UserCheck, FileSignature, Ticket,
  Search, Bell, Phone, LogOut, PoundSterling, Workflow , CalendarClock, ShieldCheck, Boxes, Palette, GraduationCap, SlidersHorizontal, Coins} from "lucide-react";
import { useAuth } from "./AuthContext.jsx";
import { api } from "../api.js";
import { initials } from "./ui.jsx";

function NotificationsBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const load = () => api.pipelineNotifications().then((r) => setItems(r.data || [])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const unseen = items.filter((n) => !n.seen).length;
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && unseen) { await Promise.all(items.filter((n) => !n.seen).map((n) => api.pipelineNotificationSeen(n.id).catch(() => {}))); load(); }
  };
  return (
    <span className="pill" style={{ position: "relative", cursor: "pointer" }} ref={ref} onClick={toggle}>
      <Bell size={15} />
      {unseen > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 8, background: "#E11D48", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>{unseen}</span>}
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 30, right: 0, width: 320, maxHeight: 380, overflow: "auto", background: "#fff", border: "1px solid #E7EBF0", borderRadius: 12, boxShadow: "0 10px 30px -12px rgba(15,23,42,.25)", zIndex: 50 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #EEF1F4", fontWeight: 700, fontSize: 13 }}>Notifications</div>
          {items.length === 0 ? <div style={{ padding: 14, color: "#94A3B8", fontSize: 13 }}>Nothing new.</div> :
            items.slice(0, 20).map((n) => (
              <div key={n.id} style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9" }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{n.title}</div>
                {n.body && <div style={{ color: "#64748B", fontSize: 11.5, marginTop: 1 }}>{n.body}</div>}
                <div style={{ color: "#94A3B8", fontSize: 10.5, marginTop: 2 }}>{new Date(n.created_at).toLocaleString("en-GB")}</div>
              </div>
            ))}
          <Link to="/renewals" onClick={() => setOpen(false)} style={{ display: "block", padding: "9px 14px", textAlign: "center", fontSize: 12, fontWeight: 600, color: "#0E7C7B" }}>View renewals &amp; callbacks →</Link>
        </div>
      )}
    </span>
  );
}

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
  { to: "/pipeline", icon: Workflow, label: "Pipeline" },
  { to: "/renewals", icon: CalendarClock, label: "Renewals" },
  { to: "/contracts", icon: FileSignature, label: "Contracts" },
  { to: "/master", icon: Boxes, label: "Master Management" },
  { to: "/commission", icon: Coins, label: "Commission" },
  { to: "/tutorials", icon: GraduationCap, label: "Platform Guide" },
  { to: "/settings", icon: SlidersHorizontal, label: "System Settings" },
  { to: "/branding", icon: Palette, label: "Branding" },
  { to: "/tickets", icon: Ticket, label: "Tickets" },
];

export default function Layout() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const doLogout = () => { logout(); nav("/login", { replace: true }); };
  const [allowed, setAllowed] = useState(null); // null = still loading -> show all
  useEffect(() => {
    api.permissionsEffective(user?.role || "").then((r) => setAllowed(r.data)).catch(() => setAllowed(null));
    api.branding().then((r) => { if (r.data?.primary_color) document.documentElement.style.setProperty("--brand", r.data.primary_color); }).catch(() => {});
  }, [user?.role]);
  const NAV_ADMIN = [...NAV, { to: "/permissions", icon: ShieldCheck, label: "Permissions" }];
  const visibleNav = allowed ? NAV_ADMIN.filter((n) => allowed.includes(n.to)) : NAV;
  return (
    <div className="app">
      <aside className="rail">
        <div className="logo">AB</div>
        {visibleNav.map((n) => {
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
          <NotificationsBell />
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
