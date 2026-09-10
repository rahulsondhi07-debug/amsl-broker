import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Core energy comparison. Given a utility, annual consumption (EAC kWh) and a broker
 * uplift (p/kWh), price every eligible rate and rank by projected annual cost.
 *
 *   customer unit rate = base rate + broker uplift (capped by supplier max)
 *   annual cost (£)    = (customer_unit_rate * eac + standing_charge * 365) / 100
 *   commission (£)     = (uplift * eac) / 100  * (term_months / 12)
 *
 * Acquisition vs Renewal is NOT a parameter the caller chooses — it's derived per offer
 * by comparing the customer's current_supplier_id against each rate's own supplier: if
 * they match, that supplier's own rate is priced as a Renewal; every other supplier's
 * rate is priced as an Acquisition. A rate tagged acq_renewal='Acquisition' or 'Renewal'
 * (rather than the default 'Both') is only shown for the deal type it's valid for — e.g.
 * a renewal-only rate won't appear as an acquisition offer from a rival supplier.
 *
 * Rates come from exactly one source: `products` + `price_matrix` — your real supplier
 * price-book uploads. There is no fallback to the old standalone `tariffs` table, so a
 * supplier only ever appears in a customer-facing comparison if you actually hold a price
 * book (a product) for them — never because of unrelated seed/demo data.
 */
export function compare({ utility, eac, term, uplift = 1.0, current_supplier_id }) {
  const u = String(utility || "").toUpperCase().startsWith("G") ? "GAS" : "ELECTRICITY";
  const kwh = Number(eac) || 0;
  const requested = Math.max(0, Number(uplift) || 0);
  const today = new Date().toISOString().slice(0, 10);

  const dealTypeFor = (supplierId) =>
    current_supplier_id && String(supplierId) === String(current_supplier_id) ? "Renewal" : "Acquisition";
  const capFor = (rawCap) => (rawCap && rawCap > 0 ? rawCap : 2.0); // default cap when unset

  let offers = [];

  // ---- Released price-book products' price_matrix rows (the only source) ----
  // A product only contributes rows once its price book is Released (or, for legacy
  // products without the field, the plain 'status' as a fallback) AND, if a validity
  // window is set, today falls inside it. Pending/unreleased price books are filtered
  // out here, before pricing — they never reach the ranked offer list.
  const productSql = `
    SELECT p.id, p.supplier_id, p.utility, p.acq_renewal, s.name AS supplier_name,
           s.max_broker_comm_electric AS cap_e, s.max_broker_comm_gas AS cap_g
    FROM products p JOIN suppliers s ON s.id = p.supplier_id
    WHERE COALESCE(p.price_book_status, p.status) = 'Released'
      AND (p.valid_from IS NULL OR p.valid_from = '' OR p.valid_from <= ?)
      AND (p.valid_till IS NULL OR p.valid_till = '' OR p.valid_till >= ?)
  `;
  const products = db.prepare(productSql).all(today, today)
    .filter((p) => (u === "GAS" ? /gas/i.test(p.utility || "") : !/gas/i.test(p.utility || "")));

  if (products.length) {
    const pmStmt = db.prepare(`SELECT * FROM price_matrix WHERE product_id = ?`);
    for (const p of products) {
      const dealType = dealTypeFor(p.supplier_id);
      const acqRenewal = (p.acq_renewal || "Both").replace("Acquisition & Renewal", "Both");
      if (acqRenewal !== "Both" && acqRenewal !== dealType) continue;

      const rows = pmStmt.all(p.id).filter((row) => {
        if (term && row.term_months && Number(row.term_months) !== Number(term)) return false;
        const minC = row.min_aq ?? row.min_consumption;
        const maxC = row.max_aq ?? row.max_consumption;
        if (minC != null && kwh < minC) return false;
        if (maxC != null && kwh > maxC) return false;
        if (row.effective_from && row.effective_from > today) return false;
        if (row.effective_to && row.effective_to < today) return false;
        const rate = row.day_rate ?? row.unit_rate;
        return rate != null && row.standing_charge != null;
      });

      for (const row of rows) {
        const baseRate = row.day_rate ?? row.unit_rate;
        const cap = capFor(u === "GAS" ? p.cap_g : p.cap_e);
        const appliedUplift = Math.min(requested, cap);
        const customerUnit = round2(baseRate + appliedUplift);
        const termMonths = row.term_months || term || 12;
        const years = termMonths / 12;
        const annualCost = round2((customerUnit * kwh + row.standing_charge * 365) / 100);
        const annualCommission = round2((appliedUplift * kwh) / 100);
        const totalCommission = round2(annualCommission * years);
        offers.push({
          supplier_id: p.supplier_id,
          supplier: p.supplier_name,
          utility: u,
          term_months: termMonths,
          deal_type: dealType,
          base_unit_rate: baseRate,
          uplift: round2(appliedUplift),
          unit_rate: customerUnit,
          standing_charge: row.standing_charge,
          annual_cost: annualCost,
          monthly_cost: round2(annualCost / 12),
          annual_commission: annualCommission,
          total_commission: totalCommission,
          source: "matrix",
          product_id: p.id,
        });
      }
    }
  }

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

// POST /api/comparison  { utility, eac, term?, uplift?, current_supplier_id? }
r.post("/", (req, res) => {
  const { utility, eac, term, uplift, current_supplier_id } = req.body || {};
  if (!utility) return res.status(400).json({ error: "utility is required" });
  if (!eac || Number(eac) <= 0) return res.status(400).json({ error: "eac (annual consumption) is required" });
  res.json({ data: compare({ utility, eac, term, uplift, current_supplier_id }) });
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
