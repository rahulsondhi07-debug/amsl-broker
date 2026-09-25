import { Router } from "express";
import { db } from "../db.js";
import { computeSnapshot, rebuildSeasons, recordHistory, applyTradeToCurve } from "../lib/flexCalc.js";
import { importReportPayload } from "../flexSuite.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;
const UTILITIES = ["Power", "Gas"];

/* ---- Baskets ---- */
const BASKET_COLS = ["name", "code", "basket_type", "supplier_id", "purchasing_strategy",
  "index_reference", "management_fee", "contract_start", "contract_end",
  "budget_power", "budget_gas", "report_date", "market_commentary", "member_message", "status", "notes",
  "common_end_date", "manager_name"];

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

const CURVE_COLS = ["utility", "period_type", "label", "sort_order", "vol_req", "traded", "open", "market", "locked", "notes"];

/** Upsert a single period, so re-importing a later report updates rather than duplicates. */
function upsertCurve(basketId, row, order) {
  const traded = row.traded ?? null;
  // A locked price without traded volume is meaningless and would distort the weighted
  // average, so it is dropped rather than stored. The source reports show "-" for these.
  const locked = traded && traded > 0 ? (row.locked || null) : null;
  // Power reports give traded + open rather than a requirement; derive it so hedged % works.
  const open = row.open ?? null;
  const volReq = row.vol_req ?? (open != null && traded != null ? Math.round((traded + open) * 1000) / 1000 : null);
  db.prepare(`INSERT INTO flex_curve (basket_id, utility, period_type, label, sort_order, vol_req, traded, open, market, locked, notes)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(basket_id, utility, period_type, label) DO UPDATE SET
                sort_order=excluded.sort_order, vol_req=excluded.vol_req, traded=excluded.traded, open=excluded.open,
                market=excluded.market, locked=excluded.locked, notes=excluded.notes`)
    .run(basketId, row.utility, row.period_type || "season", row.label,
      row.sort_order ?? order ?? 0, volReq, traded, open, row.market ?? null, locked, row.notes ?? null);
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
 * The consortium position, per fuel, across the delivery curve (see lib/flexCalc.js).
 * The headline "locked-in average" is weighted by TRADED volume: a season with 2,000
 * th/day traded must count far more than one with 60. "Saving" is market minus locked.
 */
r.get("/baskets/:id/snapshot", (req, res) => {
  const snap = computeSnapshot(req.params.id);
  if (!snap) return res.status(404).json({ error: "basket not found" });
  res.json({ data: snap });
});

/** Import a whole position report in the JSON format the HTML snapshot embeds. */
r.post("/baskets/:id/curve/import-report", (req, res) => {
  const p = req.body?.payload || req.body || {};
  if (!p.gasMonthly && !p.gasSeasonal && !p.powerMonthly && !p.powerSeasonal) {
    return res.status(400).json({ error: "Expected gasMonthly / gasSeasonal / powerMonthly / powerSeasonal arrays" });
  }
  const n = importReportPayload(req.params.id, p);
  if (req.body?.report_date) db.prepare("UPDATE flex_baskets SET report_date=? WHERE id=?").run(req.body.report_date, req.params.id);
  if (req.body?.record_history !== false) recordHistory(req.params.id, req.body?.report_date || new Date().toISOString().slice(0, 10), "Report imported");
  res.json({ data: { imported: n } });
});

/** Rebuild seasonal rows from the monthly rows already loaded for a fuel. */
r.post("/baskets/:id/curve/rebuild-seasons", (req, res) => {
  const utility = req.body?.utility;
  if (!["Gas", "Power"].includes(utility)) return res.status(400).json({ error: "utility must be Gas or Power" });
  res.json({ data: { seasons: rebuildSeasons(req.params.id, utility) } });
});

/* ---- Trades ---- */
r.get("/baskets/:id/trades", (req, res) => {
  res.json({ data: db.prepare("SELECT * FROM flex_trades WHERE basket_id=? ORDER BY trade_date DESC, id").all(req.params.id) });
});

/**
 * Log one or more trades. By default each is applied to its season on the curve, and the
 * hedge before and after is captured from the curve, so the trade log and the position
 * can never disagree. Book totals are recorded to history once per batch.
 */
r.post("/baskets/:id/trades", (req, res) => {
  const list = Array.isArray(req.body?.trades) ? req.body.trades : [req.body || {}];
  const apply = req.body?.apply_to_curve !== false;
  const bad = list.findIndex((t) => !t.utility || !t.season_label || !(Number(t.clip) > 0) || t.price == null || !t.trade_date);
  if (bad >= 0) return res.status(400).json({ error: `Trade ${bad + 1}: utility, trade_date, season_label, clip and price are required` });
  const ins = db.prepare(`INSERT INTO flex_trades (basket_id, utility, trade_date, season_label, side, clip, price, live_market, hedged_before, hedged_after, rationale, confirmed_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const out = db.transaction(() => list.map((t) => {
    const tt = { ...t, clip: Number(t.clip), price: Number(t.price), live_market: t.live_market === "" || t.live_market == null ? null : Number(t.live_market), side: t.side || "Buy" };
    const hb = apply ? applyTradeToCurve(req.params.id, tt) : { before: t.hedged_before ?? null, after: t.hedged_after ?? null };
    const info = ins.run(req.params.id, tt.utility, tt.trade_date, tt.season_label, tt.side, tt.clip, tt.price, tt.live_market,
      hb.before, hb.after, t.rationale || null, t.confirmed_by || null);
    return { id: info.lastInsertRowid, ...hb };
  }))();
  if (apply) {
    const date = list[0].trade_date;
    db.prepare("UPDATE flex_baskets SET report_date=? WHERE id=? AND (report_date IS NULL OR report_date < ?)").run(date, req.params.id, date);
    recordHistory(req.params.id, date, `After ${list.length} trade(s) on ${date}`);
  }
  res.status(201).json({ data: out });
});

r.delete("/trades/:id", (req, res) => {
  const info = db.prepare("DELETE FROM flex_trades WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- Thresholds (floor / target / ceiling) ---- */
r.get("/baskets/:id/thresholds", (req, res) => {
  res.json({ data: db.prepare("SELECT * FROM flex_thresholds WHERE basket_id=? ORDER BY utility, id").all(req.params.id) });
});
r.post("/baskets/:id/thresholds", (req, res) => {
  const b = req.body || {};
  if (!b.utility || !b.season_label) return res.status(400).json({ error: "utility and season_label are required" });
  const n = (v) => (v === "" || v == null ? null : Number(v));
  db.prepare(`INSERT INTO flex_thresholds (basket_id, utility, season_label, floor, target, ceiling, min_hedge_pct, min_hedge_by, notes)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(basket_id, utility, season_label) DO UPDATE SET floor=excluded.floor, target=excluded.target,
      ceiling=excluded.ceiling, min_hedge_pct=excluded.min_hedge_pct, min_hedge_by=excluded.min_hedge_by, notes=excluded.notes`)
    .run(req.params.id, b.utility, b.season_label, n(b.floor), n(b.target), n(b.ceiling), n(b.min_hedge_pct), b.min_hedge_by || null, b.notes || null);
  res.status(201).json({ data: db.prepare("SELECT * FROM flex_thresholds WHERE basket_id=? AND utility=? AND season_label=?").get(req.params.id, b.utility, b.season_label) });
});
r.delete("/thresholds/:id", (req, res) => {
  const info = db.prepare("DELETE FROM flex_thresholds WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- History ---- */
r.get("/baskets/:id/history", (req, res) => {
  res.json({ data: db.prepare("SELECT * FROM flex_position_history WHERE basket_id=? ORDER BY as_at DESC, id DESC").all(req.params.id) });
});
r.post("/baskets/:id/history", (req, res) => {
  const asAt = req.body?.as_at || new Date().toISOString().slice(0, 10);
  res.status(201).json({ data: { recorded: recordHistory(req.params.id, asAt, req.body?.note) } });
});

export default r;
