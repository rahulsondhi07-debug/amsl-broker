import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

const UK_REGIONS = [
  "West Midlands","East Midlands","Eastern England","London","Merseyside and Northern Wales",
  "North Eastern England","North Western England","Northern Scotland","South Eastern England",
  "South Western England","Southern England","Southern Scotland","Southern Wales","Yorkshire",
];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// month filter fragment: period=total (default) | monthly (current calendar month)
function monthFilter(col, period) {
  if (period === "monthly") return ` AND strftime('%Y-%m', ${col}) = strftime('%Y-%m','now')`;
  return "";
}

r.get("/stats", (req, res) => {
  const p = req.query.period === "monthly" ? "monthly" : "total";
  const c = (sql) => one(sql).c;
  res.json({
    period: p,
    data: {
      leads:     c(`SELECT COUNT(*) c FROM businesses WHERE stage='LEAD'${monthFilter("created_at", p)}`),
      quotes:    c(`SELECT COUNT(*) c FROM quotes WHERE 1=1${monthFilter("created_at", p)}`),
      contracts: c(`SELECT COUNT(*) c FROM contracts WHERE 1=1${monthFilter("created_at", p)}`),
      customers: c(`SELECT COUNT(*) c FROM businesses WHERE stage='CUSTOMER'${monthFilter("created_at", p)}`),
      sites:     c(`SELECT COUNT(*) c FROM sites WHERE 1=1${monthFilter("created_at", p)}`),
      suppliers: c(`SELECT COUNT(*) c FROM suppliers`),
      agencies:  c(`SELECT COUNT(*) c FROM agencies`),
      agents:    c(`SELECT COUNT(*) c FROM agents`),
    },
  });
});

r.get("/earning", (req, res) => {
  const quotesCreated = one("SELECT COUNT(*) c FROM quotes").c;
  const expectedCommissions = one("SELECT COALESCE(SUM(commission_value),0) s FROM contracts").s;
  const signedContracts = one("SELECT COUNT(*) c FROM contracts").c;
  const byMonth = MONTHS.map((m, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const quotes = one(`SELECT COUNT(*) c FROM quotes WHERE strftime('%m',created_at)=?`, mm).c;
    return { month: m, quotes };
  });
  res.json({ data: { quotesCreated, expectedCommissions: Math.round(expectedCommissions), signedContracts, byMonth } });
});

r.get("/demographics", (req, res) => {
  res.json({
    data: {
      total:     one("SELECT COUNT(*) c FROM businesses WHERE stage='CUSTOMER'").c,
      leads:     one("SELECT COUNT(*) c FROM businesses WHERE stage='LEAD'").c,
      prospects: one("SELECT COUNT(*) c FROM businesses WHERE stage='PROSPECT'").c,
      converted: one("SELECT COUNT(*) c FROM businesses WHERE stage='CUSTOMER'").c,
      newLeads:  all(`SELECT b.id, b.ref, b.business_name, b.created_at, b.stage,
                        a.name AS agent_name
                      FROM businesses b LEFT JOIN agents a ON a.id=b.agent_id
                      WHERE b.stage='LEAD' ORDER BY b.created_at DESC LIMIT 5`),
    },
  });
});

r.get("/regional", (req, res) => {
  const rows = UK_REGIONS.map((region) => {
    const active = one(
      `SELECT COUNT(DISTINCT s.business_id) c FROM sites s WHERE s.region = ?`, region
    ).c;
    return { region, active };
  });
  const totalActive = rows.reduce((s, r) => s + r.active, 0) || 1;
  res.json({ data: rows.map((r) => ({ ...r, pct: Math.round((r.active / totalActive) * 100) })) });
});

r.get("/revenue", (req, res) => {
  const total = one("SELECT COALESCE(SUM(commission_value),0) s FROM contracts").s;
  const byMonth = MONTHS.map((m, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const value = one(`SELECT COALESCE(SUM(commission_value),0) s FROM contracts WHERE strftime('%m',created_at)=?`, mm).s;
    return { month: m, value };
  });
  res.json({ data: { total, byMonth } });
});

r.get("/campaigns", (req, res) => {
  const leads = one("SELECT COUNT(*) c FROM businesses WHERE stage='LEAD'").c;
  const prospects = one("SELECT COUNT(*) c FROM businesses WHERE stage='PROSPECT'").c;
  const converted = one("SELECT COUNT(*) c FROM businesses WHERE stage='CUSTOMER'").c;
  const callbacks = one("SELECT COUNT(*) c FROM tickets WHERE query_type='Callback'").c;
  const denom = leads + prospects + converted || 1;
  const pct = (n) => Math.round((n / denom) * 100);
  res.json({
    data: [
      { label: "New Leads", value: leads, pct: leads ? 100 : 0 },
      { label: "Prospects", value: prospects, pct: pct(prospects) },
      { label: "Callbacks", value: callbacks, pct: 0 },
      { label: "Converted", value: converted, pct: pct(converted) },
    ],
  });
});

r.get("/payment-status", (req, res) => {
  // buckets from contract statuses
  const paid = one("SELECT COUNT(*) c FROM contracts WHERE status LIKE '%Accepted%'").c;
  const pending = one("SELECT COUNT(*) c FROM contracts WHERE status LIKE '%Sent%'").c;
  const overdue = 0;
  res.json({ data: { paid, pending, overdue } });
});

r.get("/recent-contracts", (req, res) => {
  res.json({
    data: all(`SELECT c.contract_no, c.business_name, c.status, c.commission_value
               FROM contracts c ORDER BY c.created_at DESC LIMIT 5`),
  });
});

r.get("/top-agents", (req, res) => {
  res.json({
    data: all(`SELECT a.id, a.name, a.status,
                 (SELECT COUNT(*) FROM contracts c WHERE c.agent_id=a.id) AS contracts,
                 (SELECT COALESCE(SUM(c.commission_value),0) FROM contracts c WHERE c.agent_id=a.id) AS commission
               FROM agents a ORDER BY commission DESC, contracts DESC`),
  });
});

/**
 * V2 dashboard — matches the production crm.amslgroup.co.uk/dashboard layout exactly:
 * clickable status-card row, Earning Statistics + Commission Status panels,
 * Top 5 Agent Performance + Top 5 Performing Agencies leaderboards, Recent Contracts.
 */

/* Clickable status-card row */
r.get("/stat-cards", (req, res) => {
  const c = (stage) => one("SELECT COUNT(*) c FROM businesses WHERE journey_stage=?", stage).c;
  const leads = c("RAW_LEAD") + c("QUALIFIED");
  const quoted = c("QUOTED"), sentForESign = c("ESIGN_SENT");
  const prospects = c("QUOTE_CREATED") + quoted + sentForESign;
  const toBeRenewed = c("UP_FOR_RENEWAL"), renewed = c("RENEWED");
  const renewals = toBeRenewed + renewed;
  const agencyActive = one("SELECT COUNT(*) c FROM agencies WHERE status='Active'").c;
  const agencyInactive = one("SELECT COUNT(*) c FROM agencies WHERE status!='Active'").c;
  res.json({
    data: {
      leads,
      prospects: { total: prospects, quoted, sentForESign },
      won: c("WON"),
      underRegistration: c("UNDER_REGISTRATION"),
      live: c("LIVE"),
      renewals: { total: renewals, toBeRenewed, renewed },
      totalAgencies: { total: agencyActive + agencyInactive, active: agencyActive, inactive: agencyInactive },
      objected: c("OBJECTED"),
      rejected: c("REJECTED"),
      lost: c("LOST"),
    },
  });
});

/* Earning Statistics panel — Total/Monthly Earnings, Pending/Paid Commission, Jan-Dec chart */
r.get("/earning-stats", (req, res) => {
  const sumSched = (statusFrag) => one(`SELECT COALESCE(SUM(amount),0) s FROM commission_schedule WHERE 1=1 ${statusFrag}`).s;
  const totalEarnings = sumSched("");
  const monthlyEarnings = one(`SELECT COALESCE(SUM(amount),0) s FROM commission_schedule WHERE strftime('%Y-%m',due_date)=strftime('%Y-%m','now')`).s;
  const pendingCommission = sumSched("AND status IN ('Projected','Invoiced')");
  const paidCommission = sumSched("AND status='Paid'");
  const byMonth = MONTHS.map((m, i) => ({
    month: m,
    revenue: one(`SELECT COALESCE(SUM(amount),0) s FROM commission_schedule WHERE strftime('%m',due_date)=?`, String(i + 1).padStart(2, "0")).s,
    quotes: one(`SELECT COUNT(*) c FROM quotes WHERE strftime('%m',created_at)=?`, String(i + 1).padStart(2, "0")).c,
    contracts: one(`SELECT COUNT(*) c FROM contracts WHERE strftime('%m',created_at)=?`, String(i + 1).padStart(2, "0")).c,
  }));
  res.json({ data: { totalEarnings: Math.round(totalEarnings), monthlyEarnings: Math.round(monthlyEarnings), pendingCommission: Math.round(pendingCommission), paidCommission: Math.round(paidCommission), byMonth } });
});

/* Commission Status panel — Total/Paid/Pending/Processing/Overdue */
r.get("/commission-status", (req, res) => {
  const sum = (statusFrag) => one(`SELECT COALESCE(SUM(amount),0) s FROM commission_schedule WHERE 1=1 ${statusFrag}`).s;
  const total = sum("");
  const paid = sum("AND status='Paid'");
  const pending = sum("AND status IN ('Projected','Invoiced')");
  const processing = sum("AND status='Reconciled'");
  const overdue = sum("AND status='Overdue'");
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  res.json({
    data: {
      total: Math.round(total),
      breakdown: [
        { label: "Paid", amount: Math.round(paid), pct: pct(paid) },
        { label: "Pending", amount: Math.round(pending), pct: pct(pending) },
        { label: "Processing", amount: Math.round(processing), pct: pct(processing) },
        { label: "Overdue", amount: Math.round(overdue), pct: pct(overdue) },
      ],
    },
  });
});

/* Top 5 Agent Performance leaderboard */
r.get("/top-agent-performance", (req, res) => {
  res.json({
    data: all(`SELECT a.id, a.name, ag.name AS agency_name,
                 (SELECT COUNT(*) FROM contracts c WHERE c.agent_id=a.id) AS deals,
                 (SELECT COALESCE(SUM(c.commission_value),0) FROM contracts c WHERE c.agent_id=a.id) AS commission
               FROM agents a LEFT JOIN agencies ag ON ag.id=a.agency_id
               ORDER BY commission DESC, deals DESC LIMIT 5`),
  });
});

/* Top 5 Performing Agencies leaderboard */
r.get("/top-agencies", (req, res) => {
  res.json({
    data: all(`SELECT ag.id, ag.name,
                 (SELECT COUNT(*) FROM agents a WHERE a.agency_id=ag.id AND a.status='Active') AS active_agents,
                 (SELECT COUNT(*) FROM contracts c JOIN agents a ON a.id=c.agent_id WHERE a.agency_id=ag.id) AS sales,
                 (SELECT COALESCE(SUM(c.commission_value),0) FROM contracts c JOIN agents a ON a.id=c.agent_id WHERE a.agency_id=ag.id) AS revenue
               FROM agencies ag ORDER BY revenue DESC, sales DESC LIMIT 5`),
  });
});

/* Recent Contracts table — Contract ID / Client / Agent / Agency / Status / Date */
r.get("/recent-contracts-full", (req, res) => {
  res.json({
    data: all(`SELECT c.id, c.contract_no, c.business_name, a.name AS agent_name, ag.name AS agency_name, c.status, c.created_at
               FROM contracts c LEFT JOIN agents a ON a.id=c.agent_id LEFT JOIN agencies ag ON ag.id=c.agency_id
               ORDER BY c.created_at DESC LIMIT 10`),
  });
});

// everything in one call for convenience (matches the whole dashboard page)
r.get("/", (req, res) => {
  const p = req.query.period === "monthly" ? "monthly" : "total";
  const cc = (sql) => one(sql).c;

  const stats = {
    leads:     cc(`SELECT COUNT(*) c FROM businesses WHERE stage='LEAD'${monthFilter("created_at", p)}`),
    quotes:    cc(`SELECT COUNT(*) c FROM quotes WHERE 1=1${monthFilter("created_at", p)}`),
    contracts: cc(`SELECT COUNT(*) c FROM contracts WHERE 1=1${monthFilter("created_at", p)}`),
    customers: cc(`SELECT COUNT(*) c FROM businesses WHERE stage='CUSTOMER'${monthFilter("created_at", p)}`),
    sites:     cc(`SELECT COUNT(*) c FROM sites`),
    suppliers: cc(`SELECT COUNT(*) c FROM suppliers`),
    agencies:  cc(`SELECT COUNT(*) c FROM agencies`),
    agents:    cc(`SELECT COUNT(*) c FROM agents`),
  };

  const earning = {
    quotesCreated: one("SELECT COUNT(*) c FROM quotes").c,
    expectedCommissions: Math.round(one("SELECT COALESCE(SUM(commission_value),0) s FROM contracts").s),
    signedContracts: one("SELECT COUNT(*) c FROM contracts").c,
    byMonth: MONTHS.map((m, i) => ({
      month: m,
      quotes: one(`SELECT COUNT(*) c FROM quotes WHERE strftime('%m',created_at)=?`, String(i + 1).padStart(2, "0")).c,
    })),
  };

  const revenueByMonth = MONTHS.map((m, i) => ({
    month: m,
    value: one(`SELECT COALESCE(SUM(commission_value),0) s FROM contracts WHERE strftime('%m',created_at)=?`, String(i + 1).padStart(2, "0")).s,
  }));

  const totalActiveRegions = UK_REGIONS
    .map((region) => one(`SELECT COUNT(DISTINCT business_id) c FROM sites WHERE region=?`, region).c)
    .reduce((s, n) => s + n, 0) || 1;
  const regional = UK_REGIONS.map((region) => {
    const active = one(`SELECT COUNT(DISTINCT business_id) c FROM sites WHERE region=?`, region).c;
    return { region, active, pct: Math.round((active / totalActiveRegions) * 100) };
  });

  const leadsN = stats.leads, converted = stats.customers;
  res.json({
    period: p,
    data: {
      stats,
      earning,
      revenue: { total: one("SELECT COALESCE(SUM(commission_value),0) s FROM contracts").s, byMonth: revenueByMonth },
      demographics: {
        total: converted,
        leads: one("SELECT COUNT(*) c FROM businesses WHERE stage='LEAD'").c,
        converted,
        newLeads: all(`SELECT ref, business_name, created_at FROM businesses WHERE stage='LEAD' ORDER BY created_at DESC LIMIT 5`),
      },
      regional,
      campaigns: [
        { label: "New Leads", pct: leadsN ? 100 : 0 },
        { label: "Prospects", pct: 0 },
        { label: "Callbacks", pct: 0 },
        { label: "Converted", pct: 0 },
      ],
      paymentStatus: {
        paid: one("SELECT COUNT(*) c FROM contracts WHERE status LIKE '%Accepted%'").c,
        pending: one("SELECT COUNT(*) c FROM contracts WHERE status LIKE '%Sent%'").c,
        overdue: 0,
      },
      recentContracts: all(`SELECT contract_no, business_name, status, commission_value FROM contracts ORDER BY created_at DESC LIMIT 5`),
      topAgents: all(`SELECT a.id, a.name, a.status,
                        (SELECT COALESCE(SUM(c.commission_value),0) FROM contracts c WHERE c.agent_id=a.id) AS commission
                      FROM agents a ORDER BY commission DESC`),
    },
  });
});

export default r;
