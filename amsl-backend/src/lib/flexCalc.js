/**
 * Consortium position maths, shared by the Flex Position API, the client hub and every
 * generated position document, so a figure can never differ between screen and paper.
 */
import { db } from "../db.js";

export const round2 = (n) => Math.round(n * 100) / 100;
export const round3 = (n) => Math.round(n * 1000) / 1000;

// Gas trades in pence per therm against a therms/day requirement; power in pounds per
// MWh against MW. Keeping the units beside the data stops the two being blended.
export const UNITS = {
  Gas:   { price: "p/th",  volume: "th/day", priceDp: 2, volDp: 0 },
  Power: { price: "£/MWh", volume: "MW",     priceDp: 2, volDp: 2 },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Winter 2026" -> { start: 2026-10-01, end: 2027-03-31 }; "Summer 2027" -> Apr–Sep 2027. */
export function seasonRange(label) {
  const m = String(label || "").match(/(summer|winter|sum|win)\W*'?(\d{2,4})/i);
  if (!m) return null;
  let y = Number(m[2]); if (y < 100) y += 2000;
  const winter = /^w/i.test(m[1]);
  return winter
    ? { start: new Date(Date.UTC(y, 9, 1)), end: new Date(Date.UTC(y + 1, 2, 31)), winter: true, year: y }
    : { start: new Date(Date.UTC(y, 3, 1)), end: new Date(Date.UTC(y, 8, 30)), winter: false, year: y };
}
/** "Oct-26" -> Date(2026-10-01). */
export function monthStart(label) {
  const m = String(label || "").match(/([A-Za-z]{3})\W*(\d{2,4})/);
  if (!m) return null;
  const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
  if (mi < 0) return null;
  let y = Number(m[2]); if (y < 100) y += 2000;
  return new Date(Date.UTC(y, mi, 1));
}
/** Which season a month falls in: Oct–Mar is Winter of the October's year. */
export function seasonOfMonth(label) {
  const d = monthStart(label);
  if (!d) return null;
  const mo = d.getUTCMonth(), y = d.getUTCFullYear();
  if (mo >= 3 && mo <= 8) return `Summer ${y}`;
  return `Winter ${mo >= 9 ? y : y - 1}`;
}
export const shortSeason = (l) => String(l).replace(/Winter\s+(\d{2})(\d{2})/, "Win'$2").replace(/Summer\s+(\d{2})(\d{2})/, "Sum'$2");

/** A curve row with derived open / hedged / saving. */
function shapeRow(r0, thr) {
  const traded = r0.traded ?? 0;
  const req = r0.vol_req ?? (r0.open != null ? traded + r0.open : null);
  // Derive rather than store, so open can never contradict the volumes above it.
  const open = r0.open != null ? r0.open : (req != null ? Math.max(0, req - traded) : null);
  const denom = traded + (open || 0);
  const hedged = denom ? traded / denom : (traded > 0 ? 1 : 0);
  const t = thr?.[r0.label];
  return {
    id: r0.id, label: r0.label, market: r0.market, locked: r0.locked,
    vol_req: req != null ? round3(req) : null, traded: round3(traded), open: open != null ? round3(open) : null,
    hedged_pct: round3(Math.min(1, hedged)),
    saving: r0.market != null && r0.locked != null ? round3(r0.market - r0.locked) : null,
    saving_pct: r0.market && r0.locked != null ? round3(((r0.market - r0.locked) / r0.market) * 100) : null,
    floor: t?.floor ?? null, target: t?.target ?? null, ceiling: t?.ceiling ?? null,
    min_hedge_pct: t?.min_hedge_pct ?? null, min_hedge_by: t?.min_hedge_by ?? null,
    // Where the market sits against the desk's bands: a quick read of whether to buy.
    signal: t ? (r0.market != null && t.target != null && r0.market <= t.target ? "At or below target — buy"
      : r0.market != null && t.ceiling != null && r0.market >= t.ceiling ? "Through ceiling — protect"
      : t.min_hedge_pct != null && hedged * 100 < t.min_hedge_pct ? "Below minimum hedge" : "Hold") : null,
  };
}
const weighted = (rows, key) => {
  let num = 0, den = 0;
  for (const x of rows) if (x.traded && x[key] != null) { num += x.traded * x[key]; den += x.traded; }
  return den ? round3(num / den) : null;
};

/**
 * The full position for one consortium: per fuel, seasons and months, book totals, KPI
 * picks, latest trades, history and data-quality warnings.
 */
export function computeSnapshot(basketId) {
  const basket = db.prepare(`SELECT b.*, s.name AS supplier_name FROM flex_baskets b
                             LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE b.id=?`).get(basketId);
  if (!basket) return null;
  const members = db.prepare("SELECT * FROM flex_basket_members WHERE basket_id=? AND status='Active'").all(basketId);
  const curve = db.prepare("SELECT * FROM flex_curve WHERE basket_id=? ORDER BY sort_order, id").all(basketId);
  const thrRows = db.prepare("SELECT * FROM flex_thresholds WHERE basket_id=?").all(basketId);
  const tradesAll = db.prepare("SELECT * FROM flex_trades WHERE basket_id=? ORDER BY trade_date DESC, id").all(basketId);
  const history = db.prepare("SELECT * FROM flex_position_history WHERE basket_id=? ORDER BY as_at, id").all(basketId);
  const asAt = basket.report_date ? new Date(basket.report_date) : new Date();

  const positions = ["Gas", "Power"].map((utility) => {
    const thr = Object.fromEntries(thrRows.filter((t) => t.utility === utility).map((t) => [t.season_label, t]));
    const seasonal = curve.filter((c) => c.utility === utility && c.period_type === "season").map((r) => shapeRow(r, thr));
    const monthly = curve.filter((c) => c.utility === utility && c.period_type === "month").map((r) => shapeRow(r));
    const tradedTotal = seasonal.reduce((a, x) => a + (x.traded || 0), 0);
    const openTotal = seasonal.reduce((a, x) => a + (x.open || 0), 0);
    const locked = weighted(seasonal, "locked");
    const mkt = weighted(seasonal, "market");
    const budget = utility === "Gas" ? basket.budget_gas : basket.budget_power;
    // A season that ends within the month is effectively delivered; skip past it.
    const live = seasonal.filter((s) => { const r = seasonRange(s.label); return r && r.end >= new Date(asAt.getTime() + 30 * 864e5); });
    // The season being delivered now or next: where the cash exposure is.
    const near = live[0] || null;
    // The cheapest season at least a year out: where forward buying earns its keep.
    const far = live.filter((s) => { const r = seasonRange(s.label); return r && r.start >= new Date(asAt.getTime() + 365 * 864e5); });
    const opportunity = far.length ? [...far].sort((a, b) => (a.market ?? 1e9) - (b.market ?? 1e9))[0] : null;
    const trades = tradesAll.filter((t) => t.utility === utility);
    const lastDate = trades[0]?.trade_date || null;
    const latest = trades.filter((t) => t.trade_date === lastDate);
    const clip = latest.reduce((a, t) => a + t.clip, 0);
    const hist = history.filter((h) => h.utility === utility);
    return {
      utility, units: UNITS[utility], members: members.filter((m) => m.utility === utility).length,
      seasonal, monthly,
      traded_total: round3(tradedTotal), open_total: round3(openTotal), required_total: round3(tradedTotal + openTotal),
      hedged_pct: tradedTotal + openTotal ? round3(tradedTotal / (tradedTotal + openTotal)) : null,
      locked_avg: locked, market_avg: mkt,
      // Positive = the traded book sits below today's market on a like-for-like basis.
      saving_vs_market: locked != null && mkt != null ? round3(mkt - locked) : null,
      saving_pct: locked != null && mkt ? round3(((mkt - locked) / mkt) * 100) : null,
      budget, vs_budget: locked != null && budget != null ? round3(budget - locked) : null,
      near_season: near, opportunity_season: opportunity,
      latest_trades: latest, latest_trade_date: lastDate,
      latest_trades_summary: latest.length ? {
        count: latest.length, clip_total: round3(clip),
        blended_price: round2(latest.reduce((a, t) => a + t.clip * t.price, 0) / clip),
        blended_market: latest.every((t) => t.live_market != null) ? round2(latest.reduce((a, t) => a + t.clip * t.live_market, 0) / clip) : null,
        all_below_market: latest.every((t) => t.live_market == null || t.price <= t.live_market),
      } : null,
      history: hist,
      previous: hist.length > 1 ? hist[hist.length - 2] : null,
    };
  }).filter((p) => p.seasonal.length || p.monthly.length || p.members);

  return {
    basket, generated_at: new Date().toISOString(), positions,
    totals: { members: new Set(members.map((m) => m.business_id ?? m.business_name)).size },
    validation: validateCurve(curve, basket),
  };
}

/**
 * Data-quality checks on a loaded position. These are the errors real reports have
 * contained: a seasonal market that disagrees with its own months, a zero price against
 * traded volume, more traded than required.
 */
export function validateCurve(curve, basket) {
  const issues = [];
  for (const utility of ["Gas", "Power"]) {
    const seasons = curve.filter((c) => c.utility === utility && c.period_type === "season");
    const months = curve.filter((c) => c.utility === utility && c.period_type === "month");
    for (const s of seasons) {
      const ms = months.filter((m) => seasonOfMonth(m.label) === s.label && m.market != null);
      if (ms.length >= 3 && s.market != null) {
        const mean = ms.reduce((a, m) => a + m.market, 0) / ms.length;
        const diff = Math.abs(s.market - mean) / mean;
        if (diff > 0.05) issues.push({ utility, label: s.label, level: "warning",
          message: `Seasonal market ${s.market.toFixed(2)} differs from the mean of its ${ms.length} monthly prices (${mean.toFixed(2)}) by ${(diff * 100).toFixed(1)}%. Check the source cell before issuing.` });
      }
      if ((s.traded || 0) > 0 && (s.locked == null || s.locked === 0)) issues.push({ utility, label: s.label, level: "error",
        message: "Volume is traded but no locked-in price is recorded; it is excluded from the weighted average." });
      if (s.vol_req != null && (s.traded || 0) > s.vol_req * 1.001) issues.push({ utility, label: s.label, level: "warning",
        message: `Traded (${s.traded}) exceeds the requirement (${s.vol_req}).` });
    }
  }
  if (basket?.report_date) {
    const age = (Date.now() - new Date(basket.report_date).getTime()) / 864e5;
    if (age > 14) issues.push({ utility: null, label: null, level: "info",
      message: `Position data is ${Math.round(age)} days old. Import the latest report before sending it to clients.` });
  }
  return issues;
}

/**
 * Rebuild seasonal rows from monthly rows, the way the source reports aggregate them:
 * market is the simple mean of the months, locked is traded-weighted, power MW is the
 * mean of the monthly MW, gas therms/day are summed.
 */
export function rebuildSeasons(basketId, utility) {
  const months = db.prepare("SELECT * FROM flex_curve WHERE basket_id=? AND utility=? AND period_type='month' ORDER BY sort_order, id").all(basketId, utility);
  const groups = new Map();
  months.forEach((m) => { const s = seasonOfMonth(m.label); if (!s) return; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(m); });
  const agg = utility === "Power" ? (a) => a.reduce((x, y) => x + y, 0) / a.length : (a) => a.reduce((x, y) => x + y, 0);
  const up = db.prepare(`INSERT INTO flex_curve (basket_id, utility, period_type, label, sort_order, vol_req, traded, open, market, locked)
    VALUES (?,?,'season',?,?,?,?,?,?,?)
    ON CONFLICT(basket_id, utility, period_type, label) DO UPDATE SET sort_order=excluded.sort_order, vol_req=excluded.vol_req,
      traded=excluded.traded, open=excluded.open, market=excluded.market, locked=excluded.locked`);
  let i = 0;
  db.transaction(() => {
    for (const [label, ms] of groups) {
      const traded = agg(ms.map((m) => m.traded || 0));
      const open = agg(ms.map((m) => (m.open != null ? m.open : Math.max(0, (m.vol_req || 0) - (m.traded || 0)))));
      const mk = ms.filter((m) => m.market != null);
      const market = mk.length ? mk.reduce((a, m) => a + m.market, 0) / mk.length : null;
      let num = 0, den = 0;
      ms.forEach((m) => { if (m.traded && m.locked) { num += m.traded * m.locked; den += m.traded; } });
      up.run(basketId, utility, label, i++, round3(traded + open), round3(traded), round3(open),
        market != null ? round3(market) : null, den ? round3(num / den) : null);
    }
  })();
  return groups.size;
}

/** Record the current book totals, so the next report can show the movement. */
export function recordHistory(basketId, asAt, note) {
  const snap = computeSnapshot(basketId);
  if (!snap) return 0;
  const ins = db.prepare(`INSERT INTO flex_position_history (basket_id, utility, as_at, hedged_pct, locked_avg, market_avg, traded_total, open_total, required_total, note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  snap.positions.forEach((p) => ins.run(basketId, p.utility, asAt, p.hedged_pct, p.locked_avg, p.market_avg, p.traded_total, p.open_total, p.required_total, note || null));
  return snap.positions.length;
}

/**
 * Apply a trade to its season: traded volume goes up by the clip and the locked price
 * becomes the traded-weighted average of the old book and the new clip. Returns the
 * hedge before and after, which is what the trade log reports.
 */
export function applyTradeToCurve(basketId, t) {
  const row = db.prepare("SELECT * FROM flex_curve WHERE basket_id=? AND utility=? AND period_type='season' AND label=?")
    .get(basketId, t.utility, t.season_label);
  if (!row) return { before: null, after: null, applied: false };
  const sign = t.side === "Sell" ? -1 : 1;
  const traded = row.traded || 0;
  const req = row.vol_req ?? (row.open != null ? traded + row.open : null);
  const before = req ? traded / req : null;
  const newTraded = Math.max(0, traded + sign * t.clip);
  const locked = sign > 0 && newTraded
    ? ((row.locked ?? t.price) * traded + t.price * t.clip) / newTraded
    : row.locked;
  const newOpen = req != null ? Math.max(0, req - newTraded) : row.open;
  db.prepare("UPDATE flex_curve SET traded=?, open=?, locked=?, market=COALESCE(?, market) WHERE id=?")
    .run(round3(newTraded), newOpen != null ? round3(newOpen) : null, locked != null ? round3(locked) : null, t.live_market ?? null, row.id);
  return { before: before != null ? round3(before) : null, after: req ? round3(newTraded / req) : null, applied: true };
}
