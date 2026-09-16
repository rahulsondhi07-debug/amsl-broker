import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;
const UTILITIES = ["Power", "Gas"];

/* ---- Baskets ---- */
const BASKET_COLS = ["name", "code", "basket_type", "supplier_id", "purchasing_strategy",
  "index_reference", "management_fee", "contract_start", "contract_end",
  "budget_power", "budget_gas", "report_date", "market_commentary", "member_message", "status", "notes"];

// Gas trades in pence per therm against a therms/day requirement; power in pounds per
// MWh against MW. Keeping the units beside the data stops the two being blended.
const UNITS = {
  Gas:   { price: "p/th",  volume: "th/day", priceDp: 2, volDp: 0 },
  Power: { price: "£/MWh", volume: "MW",     priceDp: 2, volDp: 2 },
};

r.get("/baskets", (req, res) => {
  const where = req.query.status ? "WHERE b.status = ?" : "";
  const params = req.query.status ? [req.query.status] : [];
  res.json({
    data: db.prepare(`
      SELECT b.*, s.name AS supplier_name,
             (SELECT COUNT(DISTINCT business_id) FROM flex_basket_members m WHERE m.basket_id = b.id AND m.status='Active') AS members,
             (SELECT COALESCE(SUM(annual_volume_kwh),0) FROM flex_basket_members m WHERE m.basket_id = b.id AND m.status='Active') AS total_volume
      FROM flex_baskets b LEFT JOIN suppliers s ON s.id = b.supplier_id
      ${where} ORDER BY b.created_at DESC`).all(...params),
  });
});

r.post("/baskets", (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "name is required" });
  // Only insert columns actually supplied, so NOT NULL columns with defaults (status)
  // keep their default rather than being handed an explicit null.
  const cols = BASKET_COLS.filter((c) => b[c] !== undefined && b[c] !== null && b[c] !== "");
  const info = db.prepare(`INSERT INTO flex_baskets (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...cols.map((c) => b[c]));
  res.status(201).json({ data: db.prepare("SELECT * FROM flex_baskets WHERE id=?").get(info.lastInsertRowid) });
});

const updBasket = (req, res) => {
  const b = req.body || {};
  const cols = BASKET_COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE flex_baskets SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM flex_baskets WHERE id=?").get(req.params.id) });
};
r.put("/baskets/:id", updBasket);
r.patch("/baskets/:id", updBasket);

r.delete("/baskets/:id", (req, res) => {
  const info = db.prepare("DELETE FROM flex_baskets WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- Members ---- */
r.get("/baskets/:id/members", (req, res) => {
  res.json({
    data: db.prepare(`SELECT m.*, b.business_name AS linked_name FROM flex_basket_members m
                      LEFT JOIN businesses b ON b.id = m.business_id
                      WHERE m.basket_id=? ORDER BY m.utility, m.annual_volume_kwh DESC`).all(req.params.id),
  });
});

r.post("/baskets/:id/members", (req, res) => {
  const b = req.body || {};
  if (!b.utility || !b.annual_volume_kwh) return res.status(400).json({ error: "utility and annual_volume_kwh are required" });
  const name = b.business_name || (b.business_id ? db.prepare("SELECT business_name FROM businesses WHERE id=?").get(b.business_id)?.business_name : null);
  try {
    const info = db.prepare(`INSERT INTO flex_basket_members
      (basket_id, business_id, business_name, utility, annual_volume_kwh, joined_on, status)
      VALUES (?,?,?,?,?,?,?)`)
      .run(req.params.id, b.business_id ?? null, name, b.utility, Number(b.annual_volume_kwh),
        b.joined_on || null, b.status || "Active");
    res.status(201).json({ data: db.prepare("SELECT * FROM flex_basket_members WHERE id=?").get(info.lastInsertRowid) });
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) return res.status(400).json({ error: "That customer is already in this basket for that utility." });
    throw e;
  }
});

r.put("/members/:id", (req, res) => {
  const b = req.body || {};
  const cols = ["annual_volume_kwh", "status", "joined_on", "business_name"].filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE flex_basket_members SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM flex_basket_members WHERE id=?").get(req.params.id) });
});

r.delete("/members/:id", (req, res) => {
  const info = db.prepare("DELETE FROM flex_basket_members WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- Curve rows (the position by delivery period) ---- */
r.get("/baskets/:id/curve", (req, res) => {
  const where = ["basket_id = ?"];
  const params = [req.params.id];
  if (req.query.utility) { where.push("utility = ?"); params.push(req.query.utility); }
  if (req.query.period_type) { where.push("period_type = ?"); params.push(req.query.period_type); }
  res.json({ data: db.prepare(`SELECT * FROM flex_curve WHERE ${where.join(" AND ")} ORDER BY utility, period_type, sort_order, id`).all(...params) });
});

const CURVE_COLS = ["utility", "period_type", "label", "sort_order", "vol_req", "traded", "market", "locked", "notes"];

/** Upsert a single period, so re-importing a later report updates rather than duplicates. */
function upsertCurve(basketId, row, order) {
  const traded = row.traded ?? null;
  // A locked price without traded volume is meaningless and would distort the weighted
  // average, so it is dropped rather than stored. The source reports show "-" for these.
  const locked = traded && traded > 0 ? (row.locked ?? null) : null;
  db.prepare(`INSERT INTO flex_curve (basket_id, utility, period_type, label, sort_order, vol_req, traded, market, locked, notes)
              VALUES (?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(basket_id, utility, period_type, label) DO UPDATE SET
                sort_order=excluded.sort_order, vol_req=excluded.vol_req, traded=excluded.traded,
                market=excluded.market, locked=excluded.locked, notes=excluded.notes`)
    .run(basketId, row.utility, row.period_type || "season", row.label,
      row.sort_order ?? order ?? 0, row.vol_req ?? null, traded, row.market ?? null, locked, row.notes ?? null);
}

r.post("/baskets/:id/curve", (req, res) => {
  const b = req.body || {};
  if (!b.utility || !b.label) return res.status(400).json({ error: "utility and label are required" });
  upsertCurve(req.params.id, b, b.sort_order);
  res.status(201).json({ data: db.prepare("SELECT * FROM flex_curve WHERE basket_id=? AND utility=? AND period_type=? AND label=?")
    .get(req.params.id, b.utility, b.period_type || "season", b.label) });
});

/**
 * Bulk import, so a position report can be loaded in one go rather than typed period by
 * period. Accepts { rows: [...] }; each row needs utility, label and period_type.
 */
r.post("/baskets/:id/curve/import", (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: "rows array is required" });
  const bad = rows.findIndex((x) => !x.utility || !x.label);
  if (bad >= 0) return res.status(400).json({ error: `Row ${bad + 1} is missing utility or label` });
  const tx = db.transaction(() => rows.forEach((row, i) => upsertCurve(req.params.id, row, row.sort_order ?? i)));
  tx();
  res.json({ data: { imported: rows.length } });
});

r.put("/curve/:id", (req, res) => {
  const b = req.body || {};
  const cols = CURVE_COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE flex_curve SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM flex_curve WHERE id=?").get(req.params.id) });
});

r.delete("/curve/:id", (req, res) => {
  const info = db.prepare("DELETE FROM flex_curve WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/**
 * GET /api/flex-basket/baskets/:id/snapshot
 * The consortium position, per fuel, across the delivery curve.
 *
 * The headline "locked-in average" is weighted by TRADED volume, not by requirement and
 * not a simple mean: a season with 2,000 th/day traded must count far more than one with
 * 60. Periods with nothing traded carry no price at all and are excluded from the average
 * rather than counted as zero, which would drag it down artificially.
 *
 * "Saving" is market minus locked for that period — positive means the consortium is
 * already paying less than today's market for that delivery season.
 */
r.get("/baskets/:id/snapshot", (req, res) => {
  const basket = db.prepare(`SELECT b.*, s.name AS supplier_name FROM flex_baskets b
                             LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE b.id=?`).get(req.params.id);
  if (!basket) return res.status(404).json({ error: "basket not found" });

  const members = db.prepare("SELECT * FROM flex_basket_members WHERE basket_id=? AND status='Active'").all(req.params.id);
  const curve = db.prepare("SELECT * FROM flex_curve WHERE basket_id=? ORDER BY sort_order, id").all(req.params.id);

  const shape = (rows) => rows.map((r0) => {
    const req_ = r0.vol_req ?? null;
    const traded = r0.traded ?? 0;
    // Derive rather than store, so open can never contradict the volumes above it.
    const open = req_ != null ? round3(Math.max(0, req_ - traded)) : null;
    const hedged = req_ ? traded / req_ : (traded > 0 ? 1 : 0);
    return {
      id: r0.id, label: r0.label, market: r0.market, locked: r0.locked,
      vol_req: req_, traded: round3(traded), open,
      hedged_pct: round3(Math.min(1, hedged)),
      saving: r0.market != null && r0.locked != null ? round3(r0.market - r0.locked) : null,
    };
  });

  const weightedAvg = (rows) => {
    let num = 0, den = 0;
    for (const x of rows) if (x.traded && x.locked != null) { num += x.traded * x.locked; den += x.traded; }
    return den ? round3(num / den) : null;
  };
  const weightedMarket = (rows) => {
    let num = 0, den = 0;
    for (const x of rows) if (x.traded && x.market != null) { num += x.traded * x.market; den += x.traded; }
    return den ? round3(num / den) : null;
  };

  const positions = ["Gas", "Power"].map((utility) => {
    const seasonalRaw = curve.filter((c) => c.utility === utility && c.period_type === "season");
    const monthlyRaw = curve.filter((c) => c.utility === utility && c.period_type === "month");
    const seasonal = shape(seasonalRaw);
    const monthly = shape(monthlyRaw);
    const tradedTotal = seasonal.reduce((a, x) => a + (x.traded || 0), 0);
    const reqTotal = seasonal.reduce((a, x) => a + (x.vol_req || 0), 0);
    const locked = weightedAvg(seasonal);
    const mkt = weightedMarket(seasonal);
    const budget = utility === "Gas" ? basket.budget_gas : basket.budget_power;
    const mem = members.filter((m) => m.utility === utility);
    return {
      utility, units: UNITS[utility],
      members: mem.length,
      seasonal, monthly,
      traded_total: round3(tradedTotal),
      required_total: round3(reqTotal),
      open_total: round3(Math.max(0, reqTotal - tradedTotal)),
      hedged_pct: reqTotal ? round3(tradedTotal / reqTotal) : null,
      locked_avg: locked,
      market_avg: mkt,
      // Positive = the traded book sits below today's market on a like-for-like basis.
      saving_vs_market: locked != null && mkt != null ? round3(mkt - locked) : null,
      saving_pct: locked != null && mkt != null && mkt !== 0 ? round3(((mkt - locked) / mkt) * 100) : null,
      budget, vs_budget: locked != null && budget != null ? round3(budget - locked) : null,
    };
  }).filter((p) => p.seasonal.length || p.monthly.length || p.members);

  res.json({
    data: {
      basket, generated_at: new Date().toISOString(), positions,
      totals: { members: new Set(members.map((m) => m.business_id ?? m.business_name)).size },
    },
  });
});

export default r;
