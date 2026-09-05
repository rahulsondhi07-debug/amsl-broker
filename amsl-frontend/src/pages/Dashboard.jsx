import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, CheckCircle2, Clock, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, initials } from "../components/ui.jsx";

const INDIGO = "#4f46e5";
const tooltip = { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)", fontSize: 12 };
const money = (n) => "£" + Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 });

// Matches production's exact per-card accent colours (stat-card-leads etc.)
const CARD_ACCENTS = {
  leads: "#f59e0b", prospects: "#8b5cf6", won: "#10b981", underRegistration: "#3b82f6", live: "#22c55e",
  renewals: "#06b6d4", totalAgencies: "#f43f5e", objected: "#f97316", rejected: "#ef4444", lost: "#64748b",
};
const COMMISSION_COLORS = { Paid: "#22c55e", Pending: "#f59e0b", Processing: "#4f46e5", Overdue: "#ef4444" };

export default function Dashboard() {
  const [period, setPeriod] = useState("monthly");
  const [cards, setCards] = useState(null);
  const [earning, setEarning] = useState(null);
  const [earningView, setEarningView] = useState("Revenue"); // Revenue | Quotes | Contracts
  const [earningRange, setEarningRange] = useState("Yearly");
  const [commission, setCommission] = useState(null);
  const [topAgents, setTopAgents] = useState(null);
  const [topAgencies, setTopAgencies] = useState(null);
  const [recentContracts, setRecentContracts] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => {
    setErr(null);
    Promise.all([
      api.dashboardStatCards(), api.dashboardEarningStats(), api.dashboardCommissionStatus(),
      api.dashboardTopAgentPerformance(), api.dashboardTopAgencies(), api.dashboardRecentContractsFull(),
    ]).then(([c, e, cs, ta, tag, rc]) => {
      setCards(c.data); setEarning(e.data); setCommission(cs.data);
      setTopAgents(ta.data); setTopAgencies(tag.data); setRecentContracts(rc.data);
    }).catch((err) => setErr(err.message));
  };
  useEffect(load, []); // eslint-disable-line

  if (err) return <ErrorBanner error={err} onRetry={load} />;
  if (!cards || !earning || !commission || !topAgents || !topAgencies || !recentContracts) return <Spinner label="Loading dashboard…" />;

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const dataKey = earningView === "Revenue" ? "revenue" : earningView === "Quotes" ? "quotes" : "contracts";
  const donutData = commission.breakdown.filter((b) => b.amount > 0);

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

      {/* status-card row — 5 columns x 2 rows, matching production exactly */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 20 }}>
        <StatCard to="/pipeline?stage=RAW_LEAD" label="Leads" value={cards.leads} accent={CARD_ACCENTS.leads} />
        <StatCard to="/pipeline?stage=QUOTED" label="Prospects" value={cards.prospects.total} accent={CARD_ACCENTS.prospects}
          subs={[["Quoted:", cards.prospects.quoted], ["Sent for E-Sign:", cards.prospects.sentForESign]]} />
        <StatCard to="/pipeline?stage=WON" label="Won" value={cards.won} accent={CARD_ACCENTS.won} />
        <StatCard to="/pipeline?stage=UNDER_REGISTRATION" label="Under Registration" value={cards.underRegistration} accent={CARD_ACCENTS.underRegistration} />
        <StatCard to="/pipeline?stage=LIVE" label="Live" value={cards.live} accent={CARD_ACCENTS.live} />
        <StatCard to="/pipeline?stage=UP_FOR_RENEWAL" label="Renewals" value={cards.renewals.total} accent={CARD_ACCENTS.renewals}
          subs={[["To be Renewed:", cards.renewals.toBeRenewed], ["Renewed:", cards.renewals.renewed]]} />
        <StatCard to="/agencies" label="Total Agencies" value={cards.totalAgencies.total} accent={CARD_ACCENTS.totalAgencies}
          subs={[["Active:", cards.totalAgencies.active], ["Inactive:", cards.totalAgencies.inactive]]} />
        <StatCard to="/pipeline?stage=OBJECTED" label="Objected" value={cards.objected} accent={CARD_ACCENTS.objected} />
        <StatCard to="/pipeline?stage=REJECTED" label="Rejected" value={cards.rejected} accent={CARD_ACCENTS.rejected} />
        <StatCard to="/pipeline?stage=LOST" label="Lost" value={cards.lost} accent={CARD_ACCENTS.lost} />
      </div>

      {/* Earning Statistics + Commission Status */}
      <div className="grid cols-3">
        <Card className="span-2" title="Earning Statistics" right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="toggle">
              {["Revenue", "Quotes", "Contracts"].map((v) => (
                <button key={v} className={earningView === v ? "active" : ""} onClick={() => setEarningView(v)}>{v}</button>
              ))}
            </div>
            <div className="toggle">
              {["Yearly", "Monthly"].map((v) => (
                <button key={v} className={earningRange === v ? "active" : ""} onClick={() => setEarningRange(v)}>{v}</button>
              ))}
            </div>
          </div>
        }>
          <div className="sub" style={{ marginTop: -8, marginBottom: 14 }}>Real-time commission and revenue analytics</div>
          <div className="grid cols-2" style={{ marginBottom: 16 }}>
            <MetricBox icon={<TrendingUp size={14} />} label="Total Earnings" value={money(earning.totalEarnings)} delta="+14.2%" />
            <MetricBox icon={<TrendingUp size={14} />} label="Monthly Earnings" value={money(earning.monthlyEarnings)} delta="+8.7%" />
            <MetricBox icon={<Clock size={14} />} label="Pending Commission" value={money(earning.pendingCommission)} tag="Pending Review" />
            <MetricBox icon={<CheckCircle2 size={14} />} label="Paid Commission" value={money(earning.paidCommission)} tag="Completed" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={earning.byMonth} barCategoryGap={18}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={tooltip} />
              <Bar dataKey={dataKey} fill={INDIGO} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Commission Status" right={<Badge>Total: {money(commission.total)}</Badge>}>
          <div className="sub" style={{ marginTop: -8, marginBottom: 14 }}>Commission payouts &amp; status breakdown</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData.length ? donutData : [{ label: "None", amount: 1 }]} dataKey="amount" nameKey="label" innerRadius={40} outerRadius={58} startAngle={90} endAngle={-270} stroke="none">
                    {(donutData.length ? donutData : [{ label: "None" }]).map((d, i) => (
                      <Cell key={i} fill={COMMISSION_COLORS[d.label] || "#e2e8f0"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{money(commission.total)}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>Total</div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              {commission.breakdown.map((b) => (
                <div key={b.label} className="legend">
                  <span className="l"><span className="dot" style={{ background: COMMISSION_COLORS[b.label] }} />{b.label}</span>
                  <span style={{ textAlign: "right" }}>
                    <div className="v">{money(b.amount)}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{b.pct}%</div>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Top 5 leaderboards */}
      <div className="grid cols-2">
        <Card title="Top 5 Agent Performance" right={<Link to="/agents" className="btn ghost sm">View All</Link>}>
          <div className="sub" style={{ marginTop: -8, marginBottom: 10 }}>Leading sales agents by deal closures &amp; commission</div>
          {topAgents.length === 0 && <div className="sub" style={{ padding: 12 }}>No agent data yet.</div>}
          {topAgents.map((a) => (
            <div key={a.id} className="legend" style={{ padding: "8px 0" }}>
              <span className="mini">
                <span className="ini">{initials(a.name)}</span>
                <span><div className="name">{a.name}</div><div className="mono">{a.agency_name || "—"}</div></span>
              </span>
              <span style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, color: "#334155" }}>{a.deals} Deals Closed</div>
                <div className="mono">{money(a.commission)}</div>
              </span>
            </div>
          ))}
        </Card>

        <Card title="Top 5 Performing Agencies" right={<Link to="/agencies" className="btn ghost sm">View All</Link>}>
          <div className="sub" style={{ marginTop: -8, marginBottom: 10 }}>Agency leaderboard ranked by sales volume &amp; growth</div>
          {topAgencies.length === 0 && <div className="sub" style={{ padding: 12 }}>No agency data yet.</div>}
          {topAgencies.map((a) => (
            <div key={a.id} className="legend" style={{ padding: "8px 0" }}>
              <span className="mini">
                <span className="ini sq">{initials(a.name)}</span>
                <span><div className="name">{a.name}</div><div className="mono">{a.active_agents} Active Agents • {a.sales} Sales</div></span>
              </span>
              <span style={{ fontWeight: 700, color: "#334155" }}>{money(a.revenue)}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Recent Contracts */}
      <Card title="Recent Contracts" right={<Link to="/contracts" className="btn ghost sm">View All Contracts →</Link>}>
        <div className="sub" style={{ marginTop: -8, marginBottom: 10 }}>Latest submitted and processed energy contracts</div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Contract ID</th><th>Client / Business</th><th>Agent</th><th>Agency</th><th>Status</th><th>Date</th><th>Action</th></tr>
            </thead>
            <tbody>
              {recentContracts.length === 0 && <tr><td colSpan={7} className="sub" style={{ padding: 16, textAlign: "center" }}>No contracts yet.</td></tr>}
              {recentContracts.map((c) => (
                <tr key={c.id}>
                  <td>{c.contract_no}</td>
                  <td>{c.business_name || "Unassigned Client"}</td>
                  <td>{c.agent_name || "—"}</td>
                  <td>{c.agency_name || "—"}</td>
                  <td><Badge tone="slate">{c.status}</Badge></td>
                  <td>{new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td><Link to={`/contracts/${c.id}`} className="btn ghost sm"><Eye size={14} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="footer-note">Live data from {api.base}</div>
    </>
  );
}

function StatCard({ to, label, value, accent, subs }) {
  return (
    <Link to={to} style={{
      textDecoration: "none", background: "#fff", border: "1px solid #e7ebf0", borderRadius: 16, padding: 14,
      borderLeft: `3px solid ${accent}`, boxShadow: "var(--shadow)", display: "block", transition: "transform .15s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: ".02em" }}>{label}</span>
        <span style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>{value}</span>
      </div>
      {subs && (
        <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
          {subs.map(([l, v]) => <span key={l}>{l} <b style={{ color: "#64748b" }}>{v}</b></span>)}
        </div>
      )}
    </Link>
  );
}

function MetricBox({ icon, label, value, delta, tag }) {
  return (
    <div style={{ border: "1px solid #eef1f4", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{label}</span>
        <span style={{ color: "#94a3b8" }}>{icon}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{value}</span>
        {delta && <Badge tone="green">{delta}</Badge>}
        {tag && <span style={{ fontSize: 10, color: "#94a3b8" }}>{tag}</span>}
      </div>
    </div>
  );
}
