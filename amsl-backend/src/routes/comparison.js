import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Core energy comparison. Given a utility, annual consumption (EAC kWh) and a broker
 * uplift (p/kWh), price every active supplier tariff and rank by projected annual cost.
 *
 *   customer unit rate = base tariff rate + broker uplift (capped by supplier max)
 *   annual cost (£)    = (customer_unit_rate * eac + standing_charge * 365) / 100
 *   commission (£)     = (uplift * eac) / 100  * (term_months / 12)
 */
export function compare({ utility, eac, term, uplift = 1.0 }) {
  const u = String(utility || "").toUpperCase().startsWith("G") ? "GAS" : "ELECTRICITY";
  const kwh = Number(eac) || 0;
  const requested = Math.max(0, Number(uplift) || 0);

  let sql = `SELECT t.*, s.name AS supplier_name,
                    s.max_broker_comm_electric AS cap_e, s.max_broker_comm_gas AS cap_g
             FROM tariffs t JOIN suppliers s ON s.id = t.supplier_id
             WHERE t.utility = ? AND t.status = 'Active'`;
  const params = [u];
  if (term) { sql += " AND t.term_months = ?"; params.push(Number(term)); }
  const rows = db.prepare(sql).all(...params);

  let offers = rows.map((t) => {
    const rawCap = u === "GAS" ? t.cap_g : t.cap_e;      // supplier's max broker comm
    const cap = rawCap && rawCap > 0 ? rawCap : 2.0;      // default cap when unset
    const appliedUplift = Math.min(requested, cap);
    const customerUnit = round2(t.unit_rate + appliedUplift);
    const years = t.term_months / 12;
    const annualCost = round2((customerUnit * kwh + t.standing_charge * 365) / 100);
    const annualCommission = round2((appliedUplift * kwh) / 100);
    const totalCommission = round2(annualCommission * years);
    return {
      supplier_id: t.supplier_id,
      supplier: t.supplier_name,
      utility: u,
      term_months: t.term_months,
      base_unit_rate: t.unit_rate,
      uplift: round2(appliedUplift),
      unit_rate: customerUnit,
      standing_charge: t.standing_charge,
      annual_cost: annualCost,
      monthly_cost: round2(annualCost / 12),
      annual_commission: annualCommission,
      total_commission: totalCommission,
    };
  });

  offers.sort((a, b) => a.annual_cost - b.annual_cost);
  offers = offers.map((o, i) => ({ ...o, rank: i + 1, best: i === 0 }));

  const cheapest = offers[0] || null;
  const dearest = offers[offers.length - 1] || null;
  const summary = cheapest && dearest ? {
    utility: u, eac: kwh,
    offers: offers.length,
    cheapest_supplier: cheapest.supplier,
    cheapest_annual_cost: cheapest.annual_cost,
    max_saving: round2(dearest.annual_cost - cheapest.annual_cost),
    best_commission: cheapest.total_commission,
  } : { utility: u, eac: kwh, offers: 0 };

  return { summary, offers };
}

// POST /api/comparison  { utility, eac, term?, uplift? }
r.post("/", (req, res) => {
  const { utility, eac, term, uplift } = req.body || {};
  if (!utility) return res.status(400).json({ error: "utility is required" });
  if (!eac || Number(eac) <= 0) return res.status(400).json({ error: "eac (annual consumption) is required" });
  res.json({ data: compare({ utility, eac, term, uplift }) });
});

// GET /api/comparison/tariffs?utility=ELECTRICITY  — inspect the raw tariff book
r.get("/tariffs", (req, res) => {
  let sql = `SELECT t.*, s.name AS supplier_name FROM tariffs t JOIN suppliers s ON s.id = t.supplier_id`;
  const params = [];
  if (req.query.utility) { sql += " WHERE t.utility = ?"; params.push(String(req.query.utility).toUpperCase()); }
  sql += " ORDER BY s.name, t.utility, t.term_months";
  res.json({ data: db.prepare(sql).all(...params) });
});

export default r;
