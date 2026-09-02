import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  UserPlus, ClipboardList, Trophy, FileCheck2, Radio, RefreshCw, Building2,
  ShieldAlert, XCircle, Ban, FileSignature, Coins,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, initials } from "../components/ui.jsx";

// V1.6 lifted colour scheme
const BRAND = "#0E7C7B", INK = "#0f172a", GRID = "#eef2f7";
const CARD_META = {
  leads:      { icon: UserPlus,    color: "#2563EB", bg: "#EFF4FF" },
  prospects:  { icon: ClipboardList, color: "#7C3AED", bg: "#F3EEFF" },
  won:        { icon: Trophy,      color: "#0E7C7B", bg: "#E6F4F3" },
  under_reg:  { icon: FileCheck2,  color: "#B45309", bg: "#FEF3E2" },
  live:       { icon: Radio,       color: "#059669", bg: "#E7F7F0" },
  renewals:   { icon: RefreshCw,   color: "#0891B2", bg: "#E5F6FB" },
  agencies:   { icon: Building2,   color: "#4F46E5", bg: "#EEF0FF" },
  objected:   { icon: ShieldAlert, color: "#D97706", bg: "#FEF3E2" },
  rejected:   { icon: XCircle,     color: "#E11D48", bg: "#FEECF0" },
  lost:       { icon: Ban,         color: "#64748B", bg: "#F1F5F9" },
};
const tooltip = { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)", fontSize: 13 };
const money = (n) => "£" + Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 });
const stTone = { Projected: "#64748B", Reconciled: "#0E7C7B", Paid: "#059669" };

export default function Dashboard() {
  const [period, setPeriod] = useState("total");
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true); setErr(null);
    api.dashboard(period).then((r) => { setD(r.data); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  };
  useEffect(load, [period]); // eslint-disable-line

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (err) return <ErrorBanner error={err} onRetry={load} />;
  if (!d) return null;

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const cards = d.statusCards || [];

  return (
    <div style={{ fontSize: 15 }}>
      {/* banner */}
      <div className="banner" style={{ background: `linear-gradient(120deg, ${BRAND}, #0a5f5e)` }}>
        <div className="blob" style={{ width: 200, height: 200, top: -70, right: -30 }} />
        <div className="blob" style={{ width: 150, height: 150, bottom: -80, right: 120 }} />
        <div style={{ position: "relative" }}>
          <h1 style={{ fontSize: 26 }}>Welcome back, Admin Broker Portal 👋</h1>
          <div className="sub" style={{ fontSize: 14 }}>{today}</div>
        </div>
        <div style={{ position: "relative", display: "flex", gap: 8 }}>
          <div className="toggle" style={{ background: "rgba(255,255,255,.15)" }}>
            {["monthly", "total"].map((p) => (
              <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)} style={period !== p ? { color: "rgba(255,255,255,.85)" } : {}}>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* V1.6 clickable status cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14, marginBottom: 20 }}>
        {cards.map((c) => {
          const m = CARD_META[c.key] || CARD_META.lost;
          const Icon = m.icon;
          return (
            <Link key={c.key} to={c.to} style={{ textDecoration: "none" }}>
              <div style={{ background: "#fff", border: "1px solid #e7ebf0", borderRadius: 16, padding: "16px 18px", transition: "box-shadow .15s, transform .15s", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 10px 28px rgba(15,23,42,.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, background: m.bg, color: m.color, display: "grid", placeItems: "center" }}><Icon size={19} /></span>
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, color: INK, lineHeight: 1 }}>{c.count}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#334155", marginTop: 6 }}>{c.label}</div>
                {c.sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{c.sub}</div>}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Earning Statistics */}
      <div className="grid cols-3">
        <Card title="Earning Statistics" className="span-2">
          <div className="grid cols-3" style={{ marginBottom: 14 }}>
            <div className="metric"><div className="v" style={{ fontSize: 24 }}>{d.earning.quotesCreated}</div><div className="l">Quotes Created</div></div>
            <div className="metric"><div className="v accent" style={{ fontSize: 24, color: BRAND }}>{money(d.earning.expectedCommissions)}</div><div className="l">Expected Commissions</div></div>
            <div className="metric"><div className="v" style={{ fontSize: 24 }}>{d.earning.signedContracts}</div><div className="l">Signed Contracts</div></div>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={d.earning.byMonth} barCategoryGap={18}>
              <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BRAND} /><stop offset="100%" stopColor="#3AAFAD" /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={tooltip} />
              <Bar dataKey="quotes" fill="url(#bg)" radius={[6, 6, 0, 0]} name="Quotes" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Commission Status */}
        <Card title="Commission Status" right={<Coins size={16} color={BRAND} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            {(d.commissionStatus || []).map((c) => (
              <div key={c.status}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, color: stTone[c.status] || "#475569" }}>{c.status}</span>
                  <span style={{ fontWeight: 700, color: "#334155" }}>{money(c.amount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8" }}>
                  <span>{c.count} payment{c.count === 1 ? "" : "s"}</span>
                </div>
                <div className="bar" style={{ marginTop: 4 }}><span style={{ width: `${Math.min(100, c.count ? 100 : 0)}%`, background: stTone[c.status] }} /></div>
              </div>
            ))}
            <Link to="/commission" className="btn ghost sm" style={{ marginTop: 4 }}>Open commission →</Link>
          </div>
        </Card>
      </div>

      {/* Top 5 Agents + Top 5 Agencies + Recent Contracts */}
      <div className="grid cols-3">
        <Card title="Top 5 Agent Performance">
          {d.topAgents.length === 0 ? <div className="sub">No agents yet.</div> : d.topAgents.map((a, i) => (
            <div key={a.id} className="legend" style={{ padding: "9px 0" }}>
              <span className="mini">
                <b style={{ width: 16, color: "#cbd5e1" }}>{i + 1}</b>
                <span className="ini">{initials(a.name)}</span>
                <span><div className="name">{a.name}</div><div className="mono">{money(a.commission)} commission</div></span>
              </span>
              <Badge tone="green">{a.status || "Active"}</Badge>
            </div>
          ))}
        </Card>

        <Card title="Top 5 Performing Agencies">
          {(d.topAgencies || []).length === 0 ? <div className="sub">No agencies yet.</div> : d.topAgencies.map((a, i) => (
            <div key={a.id} className="legend" style={{ padding: "9px 0" }}>
              <span className="mini">
                <b style={{ width: 16, color: "#cbd5e1" }}>{i + 1}</b>
                <span className="ini sq">{initials(a.name)}</span>
                <span><div className="name">{a.name}</div><div className="mono">{money(a.commission)} · {a.contracts} contracts</div></span>
              </span>
              <Badge tone={/active/i.test(a.status) ? "green" : "slate"}>{a.status || "Active"}</Badge>
            </div>
          ))}
        </Card>

        <Card title="Recent Contracts" right={<Link to="/contracts" className="btn ghost sm">All →</Link>}>
          {d.recentContracts.length === 0 ? <div className="sub">No contracts yet.</div> : d.recentContracts.map((c) => (
            <Link key={c.contract_no} to="/contracts" className="legend" style={{ padding: "9px 0", textDecoration: "none" }}>
              <span className="mini">
                <span className="ini sq"><FileSignature size={15} /></span>
                <span><div className="name">{c.contract_no}</div><div className="mono">{c.business_name}</div></span>
              </span>
              <span style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, color: "#334155" }}>{money(c.commission_value)}</div>
                <Badge tone="green">{(c.status || "").slice(0, 14) || "Active"}</Badge>
              </span>
            </Link>
          ))}
        </Card>
      </div>

      <div className="footer-note">Live data from {api.base}</div>
    </div>
  );
}
