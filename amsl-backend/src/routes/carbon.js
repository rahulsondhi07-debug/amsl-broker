import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * UK greenhouse gas conversion factors (kg CO2e per kWh), used to give an indicative
 * footprint from consumption we already hold. Electricity uses the location-based grid
 * average; gas is the gross calorific value figure for natural gas.
 * These move every year — they're defaults, not gospel, and should be reviewed annually
 * against the published DESNZ/DEFRA factors.
 */
const FACTORS = { ELECTRICITY: 0.207, GAS: 0.183 };

/* ---- Projects: the supply side ---- */
const PROJ_COLS = ["name", "registry", "project_type", "country", "vintage_year",
  "price_per_tonne", "available_tonnes", "co_benefits", "registry_ref", "status", "notes"];

r.get("/projects", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.registry) { where.push("registry = ?"); params.push(req.query.registry); }
  if (req.query.project_type) { where.push("project_type = ?"); params.push(req.query.project_type); }
  if (req.query.max_price) { where.push("price_per_tonne <= ?"); params.push(Number(req.query.max_price)); }
  if (req.query.status) { where.push("status = ?"); params.push(req.query.status); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({ data: db.prepare(`SELECT * FROM carbon_projects ${w} ORDER BY price_per_tonne`).all(...params) });
});

r.post("/projects", (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "name is required" });
  const info = db.prepare(`INSERT INTO carbon_projects (${PROJ_COLS.join(",")}) VALUES (${PROJ_COLS.map(() => "?").join(",")})`)
    .run(...PROJ_COLS.map((c) => b[c] ?? null));
  res.status(201).json({ data: db.prepare("SELECT * FROM carbon_projects WHERE id=?").get(info.lastInsertRowid) });
});

const updProj = (req, res) => {
  const b = req.body || {};
  const cols = PROJ_COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE carbon_projects SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM carbon_projects WHERE id=?").get(req.params.id) });
};
r.put("/projects/:id", updProj);
r.patch("/projects/:id", updProj);

r.delete("/projects/:id", (req, res) => {
  const info = db.prepare("DELETE FROM carbon_projects WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/**
 * Recalculate a pool after any allocation changes.
 * Sums committed tonnes, finds the best tier that volume unlocks, then writes that single
 * price back to every member — the whole point of pooling. Cancelled allocations are
 * excluded from the total so a withdrawn member can't prop up a tier they're not funding.
 */
function recalcPool(poolId) {
  const pool = db.prepare("SELECT * FROM carbon_pools WHERE id=?").get(poolId);
  if (!pool) return null;
  const committed = db.prepare(
    "SELECT COALESCE(SUM(tonnes),0) t FROM carbon_allocations WHERE pool_id=? AND status != 'Cancelled'"
  ).get(poolId).t;

  const tier = db.prepare(
    "SELECT * FROM carbon_price_tiers WHERE pool_id=? AND min_tonnes <= ? ORDER BY min_tonnes DESC LIMIT 1"
  ).get(poolId, committed);
  const project = pool.project_id ? db.prepare("SELECT * FROM carbon_projects WHERE id=?").get(pool.project_id) : null;
  // No tier reached yet -> fall back to the project's list price.
  const price = tier ? tier.price_per_tonne : project?.price_per_tonne ?? pool.effective_price ?? null;

  db.prepare("UPDATE carbon_pools SET committed_tonnes=?, effective_price=? WHERE id=?")
    .run(round2(committed), price, poolId);

  if (price != null) {
    // Reprice every live member at the new rate so everyone shares the volume benefit.
    const allocs = db.prepare("SELECT * FROM carbon_allocations WHERE pool_id=? AND status != 'Cancelled'").all(poolId);
    const upd = db.prepare("UPDATE carbon_allocations SET price_per_tonne=?, cost=? WHERE id=?");
    for (const a of allocs) upd.run(price, round2(a.tonnes * price), a.id);
  }
  return db.prepare("SELECT * FROM carbon_pools WHERE id=?").get(poolId);
}

/* ---- Pools ---- */
r.get("/pools", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) { where.push("p.status = ?"); params.push(req.query.status); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pools = db.prepare(`
    SELECT p.*, pr.name AS project_name, pr.registry, pr.project_type, pr.country,
           pr.vintage_year, pr.price_per_tonne AS list_price, pr.available_tonnes,
           (SELECT COUNT(*) FROM carbon_allocations a WHERE a.pool_id = p.id AND a.status != 'Cancelled') AS members
    FROM carbon_pools p LEFT JOIN carbon_projects pr ON pr.id = p.project_id
    ${w} ORDER BY p.created_at DESC`).all(...params);
  const tierStmt = db.prepare("SELECT * FROM carbon_price_tiers WHERE pool_id=? ORDER BY min_tonnes");
  res.json({
    data: pools.map((p) => {
      const tiers = tierStmt.all(p.id);
      const next = tiers.find((t) => t.min_tonnes > p.committed_tonnes);
      return {
        ...p, tiers,
        next_tier: next || null,
        tonnes_to_next_tier: next ? round2(next.min_tonnes - p.committed_tonnes) : null,
        saving_vs_list: p.list_price != null && p.effective_price != null
          ? round2((p.list_price - p.effective_price) * p.committed_tonnes) : null,
      };
    }),
  });
});

r.post("/pools", (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "name is required" });
  const info = db.prepare(`INSERT INTO carbon_pools (name, project_id, target_tonnes, closes_on, status, notes)
    VALUES (?,?,?,?,?,?)`)
    .run(b.name, b.project_id ?? null, b.target_tonnes ?? null, b.closes_on || null, b.status || "Open", b.notes || null);
  const poolId = info.lastInsertRowid;

  // Tiers can be supplied inline when creating the pool.
  if (Array.isArray(b.tiers)) {
    const t = db.prepare("INSERT INTO carbon_price_tiers (pool_id, min_tonnes, price_per_tonne) VALUES (?,?,?)");
    for (const tier of b.tiers) {
      if (tier.min_tonnes != null && tier.price_per_tonne != null) t.run(poolId, tier.min_tonnes, tier.price_per_tonne);
    }
  }
  res.status(201).json({ data: recalcPool(poolId) });
});

const updPool = (req, res) => {
  const b = req.body || {};
  const allowed = ["name", "project_id", "target_tonnes", "closes_on", "status", "notes"];
  const cols = allowed.filter((c) => b[c] !== undefined);
  if (cols.length) {
    const info = db.prepare(`UPDATE carbon_pools SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
      .run(...cols.map((c) => b[c]), req.params.id);
    if (!info.changes) return res.status(404).json({ error: "not found" });
  }
  if (Array.isArray(b.tiers)) {
    db.prepare("DELETE FROM carbon_price_tiers WHERE pool_id=?").run(req.params.id);
    const t = db.prepare("INSERT INTO carbon_price_tiers (pool_id, min_tonnes, price_per_tonne) VALUES (?,?,?)");
    for (const tier of b.tiers) {
      if (tier.min_tonnes != null && tier.price_per_tonne != null) t.run(req.params.id, tier.min_tonnes, tier.price_per_tonne);
    }
  }
  res.json({ data: recalcPool(req.params.id) });
};
r.put("/pools/:id", updPool);
r.patch("/pools/:id", updPool);

r.delete("/pools/:id", (req, res) => {
  const info = db.prepare("DELETE FROM carbon_pools WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- Allocations: a customer's share of a pool ---- */
r.get("/allocations", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.pool_id) { where.push("a.pool_id = ?"); params.push(req.query.pool_id); }
  if (req.query.business_id) { where.push("a.business_id = ?"); params.push(req.query.business_id); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({
    data: db.prepare(`
      SELECT a.*, b.business_name, p.name AS pool_name, p.status AS pool_status,
             pr.name AS project_name, pr.registry
      FROM carbon_allocations a
      LEFT JOIN businesses b ON b.id = a.business_id
      LEFT JOIN carbon_pools p ON p.id = a.pool_id
      LEFT JOIN carbon_projects pr ON pr.id = p.project_id
      ${w} ORDER BY a.created_at DESC`).all(...params),
  });
});

r.post("/allocations", (req, res) => {
  const b = req.body || {};
  if (!b.pool_id || !b.business_id) return res.status(400).json({ error: "pool_id and business_id are required" });
  const tonnes = Number(b.tonnes);
  if (!tonnes || tonnes <= 0) return res.status(400).json({ error: "tonnes must be greater than zero" });

  const pool = db.prepare("SELECT * FROM carbon_pools WHERE id=?").get(b.pool_id);
  if (!pool) return res.status(404).json({ error: "pool not found" });
  if (pool.status !== "Open") return res.status(400).json({ error: `${pool.name} is ${pool.status.toLowerCase()} and isn't accepting new commitments.` });

  // Don't let a pool commit more than the underlying project can actually supply.
  if (pool.project_id) {
    const proj = db.prepare("SELECT * FROM carbon_projects WHERE id=?").get(pool.project_id);
    if (proj?.available_tonnes != null && pool.committed_tonnes + tonnes > proj.available_tonnes) {
      return res.status(400).json({
        error: `${proj.name} only has ${round2(proj.available_tonnes - pool.committed_tonnes)} tonnes left available.`,
      });
    }
  }

  const info = db.prepare(`INSERT INTO carbon_allocations (pool_id, business_id, tonnes, status, notes)
    VALUES (?,?,?,?,?)`).run(b.pool_id, b.business_id, tonnes, b.status || "Committed", b.notes || null);
  recalcPool(b.pool_id);  // pricing for everyone may have just improved
  res.status(201).json({ data: db.prepare("SELECT * FROM carbon_allocations WHERE id=?").get(info.lastInsertRowid) });
});

const updAlloc = (req, res) => {
  const b = req.body || {};
  const row = db.prepare("SELECT * FROM carbon_allocations WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const allowed = ["tonnes", "status", "retirement_serial", "retired_on", "notes"];
  const cols = allowed.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  db.prepare(`UPDATE carbon_allocations SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  // Retiring stamps the date if the caller didn't supply one — retirement is the point at
  // which a credit is permanently claimed and can't be resold.
  if (b.status === "Retired" && !b.retired_on) {
    db.prepare("UPDATE carbon_allocations SET retired_on=date('now') WHERE id=? AND retired_on IS NULL").run(req.params.id);
  }
  recalcPool(row.pool_id);
  res.json({ data: db.prepare("SELECT * FROM carbon_allocations WHERE id=?").get(req.params.id) });
};
r.put("/allocations/:id", updAlloc);
r.patch("/allocations/:id", updAlloc);

r.delete("/allocations/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM carbon_allocations WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  db.prepare("DELETE FROM carbon_allocations WHERE id=?").run(req.params.id);
  recalcPool(row.pool_id);
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/**
 * GET /api/carbon/footprint?business_id=1
 * Indicative annual tCO2e from the consumption already on record, so an agent can suggest
 * a sensible volume rather than guessing. Covers energy use only — not travel, waste,
 * supply chain or anything else in a full carbon account.
 */
r.get("/footprint", (req, res) => {
  const bid = req.query.business_id;
  if (!bid) return res.status(400).json({ error: "business_id is required" });
  const meters = db.prepare("SELECT utility, eac FROM meters WHERE business_id=? AND eac IS NOT NULL").all(bid);
  let elecKwh = 0, gasKwh = 0;
  for (const m of meters) {
    if (String(m.utility || "").toUpperCase().startsWith("G")) gasKwh += Number(m.eac) || 0;
    else elecKwh += Number(m.eac) || 0;
  }
  const elecTonnes = round2((elecKwh * FACTORS.ELECTRICITY) / 1000);
  const gasTonnes = round2((gasKwh * FACTORS.GAS) / 1000);
  res.json({
    data: {
      electricity_kwh: elecKwh, gas_kwh: gasKwh,
      electricity_tonnes: elecTonnes, gas_tonnes: gasTonnes,
      total_tonnes: round2(elecTonnes + gasTonnes),
      factors: FACTORS,
      basis: "Energy use only (scope 1 gas + scope 2 electricity). Excludes travel, waste and supply chain.",
    },
  });
});

r.get("/summary", (_req, res) => {
  const pools = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(committed_tonnes),0) t FROM carbon_pools WHERE status='Open'").get();
  const alloc = db.prepare("SELECT COALESCE(SUM(tonnes),0) t, COALESCE(SUM(cost),0) v FROM carbon_allocations WHERE status != 'Cancelled'").get();
  const retired = db.prepare("SELECT COALESCE(SUM(tonnes),0) t FROM carbon_allocations WHERE status='Retired'").get();
  const saving = db.prepare(`
    SELECT COALESCE(SUM((pr.price_per_tonne - p.effective_price) * p.committed_tonnes),0) s
    FROM carbon_pools p JOIN carbon_projects pr ON pr.id = p.project_id
    WHERE p.effective_price IS NOT NULL AND pr.price_per_tonne IS NOT NULL`).get();
  res.json({
    data: {
      open_pools: pools.c, pooled_tonnes: round2(pools.t),
      total_tonnes: round2(alloc.t), total_value: round2(alloc.v),
      retired_tonnes: round2(retired.t), aggregation_saving: round2(saving.s),
    },
  });
});

export default r;
