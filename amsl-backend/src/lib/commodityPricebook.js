import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PRICEBOOK_PATH = process.env.COMMODITY_PRICEBOOK_PATH
  || path.join(HERE, "..", "..", "db", "reference", "commodity_pricebook.json");

/**
 * Commodity (unit-rate) pricebook — the piece the bill analyser was missing.
 *
 * Every other check asks "does this bill match its own contract and the published
 * charges?". This one asks a different question: was the ENERGY rate itself fair for
 * that supplier, fuel and month? A bill can be arithmetically perfect and still be
 * priced well above the market.
 *
 * Reference priority: the supplier's own extracted rate for that month, else the market
 * benchmark for the year. With no data file present every call returns nothing, so the
 * check is a safe no-op rather than a source of invented findings.
 *
 * Expected file shape:
 *   benchmark      { elec: { "2024": 25.6 }, gas: {...} }              p/kWh
 *   supplier_rates { elec: { "<Supplier>": { "2024-06": 26.36 } } }    p/kWh
 *   rates          [ { s, ym, f, dno, pc, mt, tm, bmin, bmax, u, sc } ]
 */
const EMPTY = { benchmark: {}, supplier_rates: {}, rates: [] };
let cache = null;
let cachedMtime = 0;

const normFuel = (v) => (String(v || "").trim().toLowerCase().startsWith("g") ? "gas" : "elec");
const ymNum = (ym) => { const a = String(ym || "").split("-"); return Number(a[0]) + (Number(a[1] || 1) - 1) / 12; };
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

export function available() { return fs.existsSync(PRICEBOOK_PATH); }

export function data() {
  if (!available()) return EMPTY;
  try {
    // Reload when the file changes so an uploaded pricebook takes effect without a restart.
    const mtime = fs.statSync(PRICEBOOK_PATH).mtimeMs;
    if (!cache || mtime !== cachedMtime) {
      cache = JSON.parse(fs.readFileSync(PRICEBOOK_PATH, "utf8"));
      cachedMtime = mtime;
    }
    return cache || EMPTY;
  } catch {
    return EMPTY;          // a corrupt file must not take the validator down
  }
}
export function reload() { cache = null; cachedMtime = 0; }
export function meta() { return data()._meta || null; }

const nearest = (series, target, toNum) => {
  const keys = Object.keys(series || {});
  if (!keys.length) return null;
  const k = keys.reduce((best, cur) => (Math.abs(toNum(cur) - toNum(target)) < Math.abs(toNum(best) - toNum(target)) ? cur : best));
  const v = Number(series[k]);
  return Number.isFinite(v) ? v : null;
};

/** Fair-market unit rate (p/kWh) for a fuel and year, falling back to the nearest year. */
export function benchmark(fuel, year) {
  const series = data().benchmark?.[normFuel(fuel)];
  if (!series) return null;
  const y = String(year || "").slice(0, 4);
  const exact = Number(series[y]);
  if (Number.isFinite(exact)) return exact;
  return nearest(series, y, Number);
}

/** The supplier's own extracted rate (p/kWh) nearest to the given YYYY-MM. */
export function supplierRate(fuel, supplier, ym) {
  if (!supplier || !ym) return null;
  const series = data().supplier_rates?.[normFuel(fuel)]?.[supplier];
  if (!series) return null;
  const exact = Number(series[ym]);
  if (Number.isFinite(exact)) return exact;
  return nearest(series, ym, ymNum);
}

/** Structured lookup for electricity by DNO, profile class, meter type and band. */
export function lookup({ fuel = "elec", dno = null, profile = null, meter_type = null, consumption = null, ym = null } = {}) {
  const f = normFuel(fuel);
  const rows = (data().rates || []).filter((r) =>
    r.f === f
    && (dno == null || String(r.dno) === String(dno))
    && (profile == null || String(r.pc) === String(profile))
    && (meter_type == null || r.mt === meter_type)
    && (consumption == null || (Number(r.bmin) <= Number(consumption) && Number(consumption) <= Number(r.bmax))));
  if (!rows.length) return null;
  const row = ym
    ? rows.reduce((best, cur) => (Math.abs(ymNum(cur.ym) - ymNum(ym)) < Math.abs(ymNum(best.ym) - ymNum(ym)) ? cur : best))
    : rows[rows.length - 1];
  return {
    unit: row.u == null ? null : Number(row.u),
    standing: row.sc == null ? null : Number(row.sc),
    ym: row.ym, supplier: row.s, dno: row.dno, profile: row.pc,
    meter_type: row.mt, band: [row.bmin, row.bmax],
  };
}

/** Pull YYYY-MM and YYYY out of a free-text billing period such as "June 2026" or "2026-06". */
export function periodParts(period) {
  const s = String(period || "");
  const year = (s.match(/\b(20\d{2})\b/) || [])[1] || null;
  let ym = null;
  const iso = s.match(/\b(20\d{2})[-/ ](0[1-9]|1[0-2])\b/);
  if (iso) ym = `${iso[1]}-${iso[2]}`;
  else {
    const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const m = s.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
    if (m && year) ym = `${year}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}`;
  }
  return { ym, year };
}

/**
 * Commodity overcharge finding. Positive amount = recoverable pounds over the period.
 * Returns null when the bill is at or below the reference, or when there is no data —
 * silence is correct here; a missing pricebook must never produce a claim.
 */
export function overcharge({ fuel, billed_unit, consumption_kwh, ym = null, year = null, supplier = null, tolerance_p = 0.5 }) {
  if (billed_unit == null || !Number.isFinite(Number(billed_unit))) return null;
  const yr = year || (ym ? String(ym).slice(0, 4) : null);
  const ref = supplierRate(fuel, supplier, ym) ?? benchmark(fuel, yr);
  if (ref == null) return null;
  const deltaP = round3(Number(billed_unit) - Number(ref));
  // A small difference is normal commercial variation, not an overcharge.
  if (deltaP <= tolerance_p) return null;
  const amount = round2((deltaP / 100) * (Number(consumption_kwh) || 0));
  if (amount <= 0) return null;
  const usedSupplier = supplierRate(fuel, supplier, ym) != null;
  return {
    check: "Commodity",
    field: "unit_rate",
    detail: `Billed ${billed_unit}p/kWh against a ${usedSupplier ? `${supplier} ` : "market "}reference of `
      + `${round2(ref)}p/kWh (${ym || yr}) — ${deltaP}p/kWh over on ${Math.round(Number(consumption_kwh) || 0)} kWh`,
    amount,
    billed_unit: Number(billed_unit), reference_unit: Number(ref), delta_p: deltaP,
    basis: usedSupplier ? "supplier rate" : "market benchmark",
  };
}

/** Summary for the admin screen: is a pricebook loaded, and what does it cover? */
export function status() {
  if (!available()) return { available: false };
  const d = data();
  const fuels = Object.keys(d.benchmark || {});
  const years = [...new Set(fuels.flatMap((f) => Object.keys(d.benchmark[f] || {})))].sort();
  const suppliers = [...new Set(Object.values(d.supplier_rates || {}).flatMap((o) => Object.keys(o || {})))];
  return {
    available: true, meta: d._meta || null,
    fuels, years, suppliers: suppliers.length, rates: (d.rates || []).length,
    size_kb: Math.round(fs.statSync(PRICEBOOK_PATH).size / 1024),
    updated: fs.statSync(PRICEBOOK_PATH).mtime.toISOString().slice(0, 10),
  };
}
