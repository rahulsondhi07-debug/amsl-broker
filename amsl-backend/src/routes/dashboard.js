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
