import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import {
  UserPlus, ClipboardList, FileSignature, UserCheck, Building2, Truck, Users,
  ArrowUpRight, TrendingUp, ChevronRight,
} from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, initials } from "../components/ui.jsx";

const INDIGO = "#4f46e5", VIOLET = "#8b5cf6";
const STAT_ICONS = { leads: UserPlus, quotes: ClipboardList, contracts: FileSignature, customers: UserCheck, sites: Building2, suppliers: Truck, agencies: Users, agents: Users };
const STAT_ORDER = ["leads", "quotes", "contracts", "customers", "sites", "suppliers", "agencies", "agents"];
const tooltip = { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)", fontSize: 12 };

export default function Dashboard() {
  const [period, setPeriod] = useState("monthly");
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
  const money = (n) => "£" + Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 });

  return (
    <>
      {/* banner */}
      <div className="banner">
        <div className="blob" style={{ width: 200, height: 200, top: -70, right: -30 }} />
        <div className="blob" style={{ width: 150, height: 150, bottom: -80, right: 120 }} />
        <div style={{ position: "relative" }}>
          <h1>Welcome back, Admin Broker Portal 👋</h1>
          <div className="sub">{today}</div>
        </div>
        <div style={{ position: "relative", display: "flex", gap: 8 }}>
          <div className="toggle" style={{ background: "rgba(255,255,255,.15)" }}>
            {["monthly", "total"].map((p) => (
              <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)} style={period !== p ? { color: "rgba(255,255,255,.8)" } : {}}>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid stat-grid">
        {STAT_ORDER.map((k) => {
          const Icon = STAT_ICONS[k];
          return (
            <div className="stat" key={k}>
              <div className="top"><span className="ic"><Icon size={18} /></span><ArrowUpRight size={16} color="#cbd5e1" /></div>
              <div className="val">{d.stats[k]}</div>
              <div className="lab">{k}</div>
            </div>
          );
        })}
      </div>

      {/* earning + demographics */}
      <div className="grid cols-3">
        <Card title="Yearly Earning Overview" className="span-2">
          <div className="grid cols-3" style={{ marginBottom: 14 }}>
            <div className="metric"><div className="v">{d.earning.quotesCreated}</div><div className="l">Quotes Created</div></div>
            <div className="metric"><div className="v accent">{money(d.earning.expectedCommissions)}</div><div className="l">Expected Commissions</div></div>
            <div className="metric"><div className="v">{d.earning.signedContracts}</div><div className="l">Signed Contracts</div></div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.earning.byMonth} barCategoryGap={18}>
              <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={INDIGO} /><stop offset="100%" stopColor={VIOLET} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={tooltip} />
              <Bar dataKey="quotes" fill="url(#bg)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Demographics">
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ position: "relative", width: 112, height: 112, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{ v: d.demographics.leads || 1 }, { v: Math.max(1, d.demographics.converted) }]} dataKey="v" innerRadius={38} outerRadius={54} startAngle={90} endAngle={-270} stroke="none">
                    <Cell fill={INDIGO} /><Cell fill="#e2e8f0" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{d.demographics.total}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>Total</div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="legend"><span className="l"><span className="dot" style={{ background: INDIGO }} />New Leads</span><span className="v">{d.demographics.leads}</span></div>
              <div className="legend"><span className="l"><span className="dot" style={{ background: VIOLET }} />Prospects</span><span className="v">0</span></div>
              <div className="legend"><span className="l"><span className="dot" style={{ background: "#e2e8f0" }} />Converted</span><span className="v">{d.demographics.converted}</span></div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #f1f5f9", marginTop: 14, paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8" }}>New Leads</span>
            </div>
            {d.demographics.newLeads.map((l) => (
              <div key={l.ref} className="legend">
                <span><span className="name" style={{ fontSize: 13 }}>{l.business_name}</span> <span className="mono">#{l.ref}</span></span>
                <Badge>LEAD</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* regional + revenue + campaigns */}
      <div className="grid cols-3">
        <Card title="UK Active Locations">
          <div style={{ maxHeight: 288, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {d.regional.map((r) => (
              <div key={r.region} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>{r.region}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{r.active} Active</span>
                  </div>
                  <div className="bar" style={{ marginTop: 4 }}><span style={{ width: `${r.pct}%` }} /></div>
                </div>
                <span style={{ width: 36, textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748b" }}>{r.pct}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Commissions Generated" right={<Badge tone="green">Active</Badge>}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{money(d.revenue.total)}</div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", color: "#059669", fontSize: 12, fontWeight: 600, margin: "4px 0 12px" }}>
            <TrendingUp size={14} /> Revenue growth this year
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={d.revenue.byMonth}>
              <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={INDIGO} stopOpacity={0.35} /><stop offset="100%" stopColor={INDIGO} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} interval={1} />
              <YAxis hide />
              <Tooltip contentStyle={tooltip} formatter={(v) => money(v)} />
              <Area type="monotone" dataKey="value" stroke={INDIGO} strokeWidth={2.5} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Performance Metrics">
          <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
            {d.campaigns.map((c) => (
              <div key={c.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, color: "#475569" }}>{c.label}</span>
                  <span style={{ fontWeight: 700, color: "#64748b" }}>{c.pct}%</span>
                </div>
                <div className="bar"><span style={{ width: `${c.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* payment + recent contracts + top agents */}
      <div className="grid cols-3">
        <Card title="Client Payment Status">
          <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 12 }}>
            <span className="legend" style={{ gap: 6 }}><span className="dot" style={{ background: "#22c55e" }} />Paid <b style={{ marginLeft: 4 }}>{d.paymentStatus.paid}</b></span>
            <span className="legend" style={{ gap: 6 }}><span className="dot" style={{ background: INDIGO }} />Pending <b style={{ marginLeft: 4 }}>{d.paymentStatus.pending}</b></span>
            <span className="legend" style={{ gap: 6 }}><span className="dot" style={{ background: "#f43f5e" }} />Overdue <b style={{ marginLeft: 4 }}>{d.paymentStatus.overdue}</b></span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, i) => ({ day, pending: [0,1,1,0,2,1,0][i] }))} barCategoryGap={14}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={tooltip} />
              <Bar dataKey="pending" fill={INDIGO} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Recent Contracts">
          {d.recentContracts.map((c) => (
            <div key={c.contract_no} className="legend" style={{ padding: "8px 0" }}>
              <span className="mini">
                <span className="ini sq"><FileSignature size={15} /></span>
                <span><div className="name">{c.contract_no}</div><div className="mono">{c.business_name}</div></span>
              </span>
              <span style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, color: "#334155" }}>{money(c.commission_value)}</div>
                <Badge tone="green">ACTIVE</Badge>
              </span>
            </div>
          ))}
        </Card>

        <Card title="Top Agents Listing">
          {d.topAgents.map((a, i) => (
            <div key={a.id} className="legend" style={{ padding: "8px 0" }}>
              <span className="mini">
                <b style={{ width: 14, color: "#cbd5e1" }}>{i + 1}</b>
                <span className="ini">{initials(a.name)}</span>
                <span><div className="name">{a.name}</div><div className="mono">{money(a.commission)} commission</div></span>
              </span>
              <Badge tone="green">Active</Badge>
            </div>
          ))}
        </Card>
      </div>

      <div className="footer-note">Live data from {api.base}</div>
    </>
  );
}
