import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

// Power generation is sized in MW and certified by REGO; green gas is injected into the
// grid, sized by annual gas volume, and certified by RGGO. Keeping the labels beside the
// data stops a gas offer being read as if it were electricity.
const UNITS = {
  Power: { capacity: "MW", volume: "MWh", price: "p/kWh", cert: "REGO" },
  Gas:   { capacity: "MW (thermal)", volume: "MWh gas", price: "p/kWh", cert: "RGGO" },
};

/**
 * UK electricity distribution areas. The two-digit code is the first pair of digits of an
 * MPAN, so a customer's distribution area is already derivable from the meter number we
 * hold — no postcode lookup or geocoding needed. A generator sharing that code sits on the
 * same local distribution network as the customer, which is what "local" means here.
 */
export const DIST_AREAS = {
  10: "Eastern England", 11: "East Midlands", 12: "London",
  13: "North Wales, Merseyside & Cheshire", 14: "West Midlands",
  15: "North East England", 16: "North West England", 17: "Northern Scotland",
  18: "Southern Scotland", 19: "South East England", 20: "Southern England",
  21: "South Wales", 22: "South West England", 23: "Yorkshire",
};

const first2 = (v) => {
  const d = String(v || "").replace(/\D/g, "");
  return d.length >= 2 ? parseInt(d.slice(0, 2), 10) : null;
};

/** Work out a business's distribution area from any electricity meter we hold for it. */
function distIdForBusiness(businessId) {
  const rows = db.prepare(
    "SELECT mpan_mprn FROM meters WHERE business_id = ? AND mpan_mprn IS NOT NULL AND utility LIKE 'ELEC%'"
  ).all(businessId);
  for (const m of rows) {
    const d = first2(m.mpan_mprn);
    if (d && DIST_AREAS[d]) return d;
  }
  return null;
}

r.get("/areas", (_req, res) => {
  res.json({ data: Object.entries(DIST_AREAS).map(([id, name]) => ({ dist_id: Number(id), name })) });
});

/**
 * GET /api/local-energy/generators
 * Filters: dist_id, technology, max_price, status, q
 * Locality: pass business_id (or mpan) and every generator is tagged Local / Elsewhere and
 * local ones are sorted first, so an agent sees the customer's own area at the top.
 */
r.get("/generators", (req, res) => {
  const q = req.query;
  const where = [];
  const params = [];
  if (q.utility) { where.push("utility = ?"); params.push(q.utility); }
  if (q.dist_id) { where.push("dist_id = ?"); params.push(Number(q.dist_id)); }
  if (q.technology) { where.push("technology = ?"); params.push(q.technology); }
  if (q.max_price) { where.push("price_p_kwh <= ?"); params.push(Number(q.max_price)); }
  if (q.status) { where.push("status = ?"); params.push(q.status); }
  else if (q.available_only === "1") { where.push("status = 'Available'"); }
  if (q.q) { where.push("(name LIKE ? OR operator LIKE ? OR postcode LIKE ?)"); params.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  let rows = db.prepare(`SELECT * FROM generators ${w} ORDER BY price_p_kwh`).all(...params);

  // Locality tagging — only when we know which area the customer is in.
  const custDist = q.business_id ? distIdForBusiness(q.business_id) : first2(q.mpan);
  if (custDist) {
    rows = rows.map((g) => ({ ...g, locality: g.dist_id === custDist ? "Local" : "Elsewhere" }))
      .sort((a, b) => (a.locality === b.locality ? a.price_p_kwh - b.price_p_kwh : a.locality === "Local" ? -1 : 1));
  }
  res.json({
    data: rows.map((g) => ({ ...g, units: UNITS[g.utility || "Power"] })),
    meta: {
      customer_dist_id: custDist, customer_area: custDist ? DIST_AREAS[custDist] : null,
      total: rows.length,
      counts: {
        Power: rows.filter((g) => (g.utility || "Power") === "Power").length,
        Gas: rows.filter((g) => g.utility === "Gas").length,
      },
      units: UNITS,
    },
  });
});

r.post("/generators", (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "name is required" });
  const cols = ["name", "operator", "technology", "utility", "certification", "injection_point",
    "dist_id", "region", "postcode", "capacity_mw",
    "annual_output_mwh", "available_mwh", "price_p_kwh", "min_volume_mwh", "term_months_min",
    "term_months_max", "commissioned_year", "rego_accredited", "status", "notes"];
  const region = b.region || (b.dist_id ? DIST_AREAS[Number(b.dist_id)] : null);
  const vals = cols.map((c) => (c === "region" ? region : b[c] ?? null));
  const info = db.prepare(`INSERT INTO generators (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals);
  res.status(201).json({ data: db.prepare("SELECT * FROM generators WHERE id=?").get(info.lastInsertRowid) });
});

const updGen = (req, res) => {
  const b = req.body || {};
  if (b.dist_id !== undefined && b.region === undefined) b.region = DIST_AREAS[Number(b.dist_id)] || null;
  const allowed = ["name", "operator", "technology", "utility", "certification", "injection_point",
    "dist_id", "region", "postcode", "capacity_mw",
    "annual_output_mwh", "available_mwh", "price_p_kwh", "min_volume_mwh", "term_months_min",
    "term_months_max", "commissioned_year", "rego_accredited", "status", "notes"];
  const cols = allowed.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE generators SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM generators WHERE id=?").get(req.params.id) });
};
r.put("/generators/:id", updGen);
r.patch("/generators/:id", updGen);

r.delete("/generators/:id", (req, res) => {
  const info = db.prepare("DELETE FROM generators WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- PPA deals: a customer contracting volume from a generator ---- */
r.get("/deals", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.business_id) { where.push("d.business_id = ?"); params.push(req.query.business_id); }
  if (req.query.status) { where.push("d.status = ?"); params.push(req.query.status); }
  if (req.query.utility) { where.push("COALESCE(d.utility,'Power') = ?"); params.push(req.query.utility); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({
    data: db.prepare(`SELECT d.*, b.business_name, g.region, g.dist_id, g.postcode, g.certification
                      FROM ppa_deals d
                      LEFT JOIN businesses b ON b.id = d.business_id
                      LEFT JOIN generators g ON g.id = d.generator_id
                      ${w} ORDER BY d.created_at DESC`).all(...params),
  });
});

r.post("/deals", (req, res) => {
  const b = req.body || {};
  if (!b.business_id) return res.status(400).json({ error: "business_id is required" });
  const volume = Number(b.volume_mwh);
  if (!volume || volume <= 0) return res.status(400).json({ error: "volume_mwh must be greater than zero" });

  const gen = b.generator_id ? db.prepare("SELECT * FROM generators WHERE id=?").get(b.generator_id) : null;
  if (b.generator_id && !gen) return res.status(404).json({ error: "generator not found" });
  if (gen && gen.status !== "Available") {
    return res.status(400).json({ error: `${gen.name} is ${gen.status.toLowerCase()} and isn't offering volume right now.` });
  }
  if (gen && gen.available_mwh != null && volume > gen.available_mwh) {
    return res.status(400).json({ error: `${gen.name} only has ${gen.available_mwh} MWh uncontracted.` });
  }
  if (gen && gen.min_volume_mwh != null && volume < gen.min_volume_mwh) {
    return res.status(400).json({ error: `${gen.name} has a minimum of ${gen.min_volume_mwh} MWh.` });
  }

  const price = b.price_p_kwh != null ? Number(b.price_p_kwh) : gen?.price_p_kwh;
  if (price == null) return res.status(400).json({ error: "price_p_kwh is required when no generator is selected" });
  // volume is MWh, price is p/kWh: 1 MWh = 1000 kWh, /100 to convert pence to pounds.
  const annualValue = round2((volume * 1000 * price) / 100);

  const custDist = distIdForBusiness(b.business_id);
  const locality = gen && custDist && gen.dist_id === custDist ? "Local" : gen ? "Elsewhere" : null;

  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO ppa_deals
      (business_id, generator_id, generator_name, technology, utility, volume_mwh, price_p_kwh, term_months,
       annual_value, start_date, end_date, locality, reference, status, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.business_id, b.generator_id || null, b.generator_name ?? gen?.name ?? null,
        b.technology ?? gen?.technology ?? null, b.utility ?? gen?.utility ?? "Power",
        volume, price, b.term_months ?? null,
        annualValue, b.start_date || null, b.end_date || null, locality,
        b.reference || null, b.status || "Enquiry", b.notes || null);

    if (gen && gen.available_mwh != null) {
      const remaining = round2(gen.available_mwh - volume);
      db.prepare("UPDATE generators SET available_mwh=?, status=? WHERE id=?")
        .run(remaining, remaining <= 0 ? "Fully Contracted" : gen.status, gen.id);
    }
    return info.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json({ data: db.prepare("SELECT * FROM ppa_deals WHERE id=?").get(id) });
});

const updDeal = (req, res) => {
  const b = req.body || {};
  const allowed = ["volume_mwh", "price_p_kwh", "term_months", "start_date", "end_date",
    "reference", "status", "notes", "generator_name", "technology"];
  const cols = allowed.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE ppa_deals SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  const row = db.prepare("SELECT * FROM ppa_deals WHERE id=?").get(req.params.id);
  if (b.volume_mwh !== undefined || b.price_p_kwh !== undefined) {
    const v = round2((row.volume_mwh * 1000 * row.price_p_kwh) / 100);
    db.prepare("UPDATE ppa_deals SET annual_value=? WHERE id=?").run(v, row.id);
    row.annual_value = v;
  }
  res.json({ data: row });
};
r.put("/deals/:id", updDeal);
r.patch("/deals/:id", updDeal);

r.delete("/deals/:id", (req, res) => {
  // Returning the volume to the generator keeps available_mwh honest when a deal falls through.
  const deal = db.prepare("SELECT * FROM ppa_deals WHERE id=?").get(req.params.id);
  if (!deal) return res.status(404).json({ error: "not found" });
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM ppa_deals WHERE id=?").run(req.params.id);
    if (deal.generator_id) {
      const gen = db.prepare("SELECT * FROM generators WHERE id=?").get(deal.generator_id);
      if (gen && gen.available_mwh != null) {
        db.prepare("UPDATE generators SET available_mwh=?, status=? WHERE id=?")
          .run(round2(gen.available_mwh + deal.volume_mwh),
            gen.status === "Fully Contracted" ? "Available" : gen.status, gen.id);
      }
    }
  });
  tx();
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

export default r;
