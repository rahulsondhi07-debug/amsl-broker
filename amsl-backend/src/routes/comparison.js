import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

// First 2 digits of a string, as an integer, or null if there aren't enough digits.
// Used for both the MPAN → Distributor ID and Topline → Profile Class derivations below.
const first2Digits = (v) => {
  const digits = String(v || "").replace(/\D/g, "");
  return digits.length >= 2 ? parseInt(digits.slice(0, 2), 10) : null;
};

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
 *
 * A real electricity price matrix (e.g. the SEB flat file) is banded by Distributor ID and
 * Profile Class, not just consumption and term — the same product has different rates in
 * different distribution areas and for different meter profiles. Two optional inputs let
 * a matrix row be matched down to the right band:
 *   - meter_number (the MPAN): its first 2 digits are the Distributor ID.
 *   - topline (the 8-digit header printed above the MPAN's barcode — Profile Class +
 *     Meter Time Switch Code + Line Loss Factor Class): its first 2 digits are the
 *     Profile Class.
 * A price_matrix row is only excluded on these grounds when BOTH the row itself specifies
 * a dist_id/profile AND the caller supplied an MPAN/topline that disagrees with it — rows
 * without that data (e.g. older manually-entered rows) are never filtered out by this.
 */
export function compare({ utility, eac, term, uplift = 1.0, current_supplier_id, meter_number, topline, night_pct, eve_wknd_pct, carbon_offset }) {
  const u = String(utility || "").toUpperCase().startsWith("G") ? "GAS" : "ELECTRICITY";
  const kwh = Number(eac) || 0;
  const requested = Math.max(0, Number(uplift) || 0);
  const today = new Date().toISOString().slice(0, 10);
  const distId = first2Digits(meter_number);   // Distributor ID, from the MPAN
  const profile = first2Digits(topline);        // Profile Class, from the Topline
  // Share of annual consumption used in the night / evening-weekend rate periods. Only
  // has an effect when the matrix row actually carries a night (or eve/wknd) rate.
  const nightPct = night_pct == null ? null : Number(night_pct);
  const eveWkndPct = eve_wknd_pct == null ? null : Number(eve_wknd_pct);

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
    SELECT p.id, p.supplier_id, p.utility, p.acq_renewal, p.fuel_mix, p.payment_method,
           p.carbon_offset_available, p.carbon_offset_premium, p.carbon_offset_standard, s.name AS supplier_name,
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
        // Distributor ID / Profile Class band matching — only rejects a row when both the
        // row and the request specify a value and they disagree (see the note above).
        if (distId != null && row.dist_id != null && Number(row.dist_id) !== distId) return false;
        if (profile != null && row.profile != null && Number(row.profile) !== profile) return false;
        const rate = row.day_rate ?? row.unit_rate;
        return rate != null && row.standing_charge != null;
      });

      // Carbon offset: when requested, only products that actually offer it qualify, and
      // the premium is added to every rate period so prices are shown INCLUSIVE of it.
      const wantsOffset = carbon_offset === true || carbon_offset === "true" || carbon_offset === 1 || carbon_offset === "1";
      if (wantsOffset && !p.carbon_offset_available) continue;
      const offsetPremium = wantsOffset ? (Number(p.carbon_offset_premium) || 0) : 0;

      for (const row of rows) {
        const baseRate = row.day_rate ?? row.unit_rate;
        const cap = capFor(u === "GAS" ? p.cap_g : p.cap_e);
        const appliedUplift = Math.min(requested, cap);
        const customerUnit = round2(baseRate + appliedUplift + offsetPremium);
        const termMonths = row.term_months || term || 12;
        const years = termMonths / 12;

        // Day/night (dual-rate) pricing. Previously every offer was costed on the day rate
        // alone, so an Economy 7 style rate looked far more expensive than it really is and
        // a battery charging overnight showed no benefit at all. When the matrix row has a
        // night rate AND the caller supplied a night split, consumption is apportioned and
        // each portion costed at its own rate.
        const nightBase = row.night_rate != null ? row.night_rate : null;
        const eveBase = row.eve_wknd_rate != null ? row.eve_wknd_rate : null;
        const nightShare = nightBase != null ? Math.min(Math.max(nightPct ?? 0, 0), 100) / 100 : 0;
        const eveShare = eveBase != null ? Math.min(Math.max(eveWkndPct ?? 0, 0), 100) / 100 : 0;
        const dayShare = Math.max(0, 1 - nightShare - eveShare);

        const nightUnit = nightBase != null ? round2(nightBase + appliedUplift + offsetPremium) : null;
        const eveUnit = eveBase != null ? round2(eveBase + appliedUplift + offsetPremium) : null;
        const energyCost = (customerUnit * kwh * dayShare)
          + (nightUnit != null ? nightUnit * kwh * nightShare : 0)
          + (eveUnit != null ? eveUnit * kwh * eveShare : 0);
        const annualCost = round2((energyCost + row.standing_charge * 365) / 100);
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
          carbon_offset: wantsOffset,
          carbon_offset_premium: wantsOffset ? offsetPremium : null,
          carbon_offset_standard: wantsOffset ? (p.carbon_offset_standard || null) : null,
          // Offer this so the form can say how many offers exist either way.
          carbon_offset_available: !!p.carbon_offset_available,
          night_rate: nightUnit,
          eve_wknd_rate: eveUnit,
          // true when this offer was actually costed across more than one rate period
          dual_rate: nightShare > 0 || eveShare > 0,
          day_split_pct: round2(dayShare * 100),
          night_split_pct: round2(nightShare * 100),
          standing_charge: row.standing_charge,
          annual_cost: annualCost,
          monthly_cost: round2(annualCost / 12),
          fuel_mix: p.fuel_mix || null,   // "Green" | "Brown" | "Mix" — set on the product
          payment_method: p.payment_method || null, // e.g. "Fixed DD", "Cash/Cheque/Bacs" — set on the product
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
    dist_id: distId,
    profile: profile,
  } : { utility: u, eac: kwh, offers: 0, dist_id: distId, profile: profile };

  return { summary, offers };
}

// POST /api/comparison  { utility, eac, term?, uplift?, current_supplier_id?, meter_number?, topline? }
r.post("/", (req, res) => {
  const { utility, eac, term, uplift, current_supplier_id, meter_number, topline, night_pct, eve_wknd_pct, carbon_offset } = req.body || {};
  if (!utility) return res.status(400).json({ error: "utility is required" });
  if (!eac || Number(eac) <= 0) return res.status(400).json({ error: "eac (annual consumption) is required" });
  res.json({ data: compare({ utility, eac, term, uplift, current_supplier_id, meter_number, topline, night_pct, eve_wknd_pct, carbon_offset }) });
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
