import { Router } from "express";
import { db } from "../db.js";
import { DIST_AREAS } from "./localEnergy.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

const first2 = (v) => {
  const d = String(v || "").replace(/\D/g, "");
  return d.length >= 2 ? parseInt(d.slice(0, 2), 10) : null;
};

/** A business's distribution area, derived from any electricity MPAN we hold. */
function distIdForBusiness(businessId) {
  const rows = db.prepare(
    "SELECT mpan_mprn FROM meters WHERE business_id=? AND mpan_mprn IS NOT NULL AND utility LIKE 'ELEC%'"
  ).all(businessId);
  for (const m of rows) {
    const d = first2(m.mpan_mprn);
    if (d && DIST_AREAS[d]) return d;
  }
  return null;
}

/* ---- DUoS bands ---- */
r.get("/duos", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.dist_id) { where.push("dist_id = ?"); params.push(Number(req.query.dist_id)); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM duos_bands ${w} ORDER BY dist_id, CASE band WHEN 'Red' THEN 1 WHEN 'Amber' THEN 2 ELSE 3 END, start_time`).all(...params);
  res.json({ data: rows.map((b) => ({ ...b, region: DIST_AREAS[b.dist_id] || null })) });
});

const DUOS_COLS = ["dist_id", "band", "day_type", "start_time", "end_time", "rate_p_kwh", "season", "charge_year"];
r.post("/duos", (req, res) => {
  const b = req.body || {};
  if (!b.dist_id || !b.band || !b.rate_p_kwh) return res.status(400).json({ error: "dist_id, band and rate_p_kwh are required" });
  const info = db.prepare(`INSERT INTO duos_bands (${DUOS_COLS.join(",")}) VALUES (${DUOS_COLS.map(() => "?").join(",")})`)
    .run(...DUOS_COLS.map((c) => b[c] ?? null));
  res.status(201).json({ data: db.prepare("SELECT * FROM duos_bands WHERE id=?").get(info.lastInsertRowid) });
});

const updDuos = (req, res) => {
  const b = req.body || {};
  const cols = DUOS_COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE duos_bands SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM duos_bands WHERE id=?").get(req.params.id) });
};
r.put("/duos/:id", updDuos);
r.patch("/duos/:id", updDuos);
r.delete("/duos/:id", (req, res) => {
  const info = db.prepare("DELETE FROM duos_bands WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- TNUoS tariffs ---- */
r.get("/tnuos", (_req, res) => {
  res.json({ data: db.prepare("SELECT * FROM tnuos_tariffs ORDER BY tariff_gbp_kw DESC").all() });
});
r.put("/tnuos/:id", (req, res) => {
  const b = req.body || {};
  const cols = ["zone_name", "dist_id", "tariff_gbp_kw", "charge_year"].filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE tnuos_tariffs SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM tnuos_tariffs WHERE id=?").get(req.params.id) });
});

/* ---- Triad alerts ---- */
r.get("/triads", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.season) { where.push("season = ?"); params.push(req.query.season); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({
    data: db.prepare(`
      SELECT t.*, (SELECT COUNT(*) FROM dispatch_plans d WHERE d.triad_alert_id = t.id) AS plans,
             (SELECT COALESCE(SUM(d.estimated_saving),0) FROM dispatch_plans d WHERE d.triad_alert_id = t.id) AS est_saving
      FROM triad_alerts t ${w} ORDER BY t.alert_date DESC, t.start_time DESC`).all(...params),
  });
});

r.post("/triads", (req, res) => {
  const b = req.body || {};
  if (!b.alert_date) return res.status(400).json({ error: "alert_date is required" });
  const info = db.prepare(`INSERT INTO triad_alerts
    (alert_date, start_time, end_time, forecast_demand_mw, alert_level, season, notes)
    VALUES (?,?,?,?,?,?,?)`)
    .run(b.alert_date, b.start_time || "17:00", b.end_time || "18:30",
      b.forecast_demand_mw ?? null, b.alert_level || "Watch", b.season || null, b.notes || null);
  res.status(201).json({ data: db.prepare("SELECT * FROM triad_alerts WHERE id=?").get(info.lastInsertRowid) });
});

const updTriad = (req, res) => {
  const b = req.body || {};
  const cols = ["alert_date", "start_time", "end_time", "forecast_demand_mw", "alert_level", "season", "notes"]
    .filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE triad_alerts SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM triad_alerts WHERE id=?").get(req.params.id) });
};
r.put("/triads/:id", updTriad);
r.patch("/triads/:id", updTriad);
r.delete("/triads/:id", (req, res) => {
  const info = db.prepare("DELETE FROM triad_alerts WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/**
 * Savings maths.
 *
 * DUoS Red Shift — moving energy out of one band into another saves the difference
 * between the two unit rates:
 *     saving (£) = kWh shifted x (from_rate - to_rate) / 100
 *
 * Triad Avoidance — the TNUoS locational demand charge is levied on the customer's
 * average demand across the three Triad half-hours:
 *     annual charge (£) = average Triad kW x tariff (£/kW/yr)
 * Cutting demand in ONE Triad reduces that average by kW/3, so:
 *     saving (£/yr) = (kW reduced / 3) x tariff
 * A negative zonal tariff (as in northern Scotland) means demand is actually rewarded
 * there, so reducing it costs money — the sign is preserved rather than hidden.
 */
function calcSaving({ purpose, distId, planned_kw, planned_kwh, from_band, to_band }) {
  if (purpose === "Triad Avoidance") {
    const t = db.prepare("SELECT * FROM tnuos_tariffs WHERE dist_id=? ORDER BY id DESC LIMIT 1").get(distId);
    if (!t || planned_kw == null) return { saving: null, detail: "No TNUoS tariff for this area" };
    return {
      saving: round2((Number(planned_kw) / 3) * t.tariff_gbp_kw),
      detail: `${planned_kw} kW / 3 Triads x £${t.tariff_gbp_kw}/kW/yr (${t.zone_name})`,
    };
  }
  // DUoS band shift
  const rate = (band) => {
    const row = db.prepare("SELECT rate_p_kwh FROM duos_bands WHERE dist_id=? AND band=? ORDER BY id LIMIT 1").get(distId, band);
    return row ? row.rate_p_kwh : null;
  };
  const fromRate = rate(from_band || "Red");
  const toRate = rate(to_band || "Green");
  if (fromRate == null || toRate == null || planned_kwh == null) {
    return { saving: null, detail: "No DUoS rates for this area" };
  }
  return {
    saving: round2((Number(planned_kwh) * (fromRate - toRate)) / 100),
    detail: `${planned_kwh} kWh x (${fromRate}p ${from_band || "Red"} - ${toRate}p ${to_band || "Green"})`,
  };
}

/* ---- Dispatch plans ---- */
r.get("/dispatch", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.business_id) { where.push("d.business_id = ?"); params.push(req.query.business_id); }
  if (req.query.status) { where.push("d.status = ?"); params.push(req.query.status); }
  if (req.query.purpose) { where.push("d.purpose = ?"); params.push(req.query.purpose); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({
    data: db.prepare(`
      SELECT d.*, b.business_name, a.asset_type, a.manufacturer, a.model, a.capacity_kw,
             t.alert_date AS triad_date, t.alert_level
      FROM dispatch_plans d
      LEFT JOIN businesses b ON b.id = d.business_id
      LEFT JOIN energy_assets a ON a.id = d.asset_id
      LEFT JOIN triad_alerts t ON t.id = d.triad_alert_id
      ${w} ORDER BY d.plan_date DESC`).all(...params),
  });
});

/** Preview the saving before committing a plan, so an agent can show the number first. */
r.post("/dispatch/estimate", (req, res) => {
  const b = req.body || {};
  if (!b.business_id) return res.status(400).json({ error: "business_id is required" });
  const distId = distIdForBusiness(b.business_id);
  if (!distId) return res.status(400).json({ error: "No electricity MPAN on record, so the distribution area can't be determined." });
  const calc = calcSaving({ ...b, distId });
  res.json({ data: { dist_id: distId, region: DIST_AREAS[distId], ...calc } });
});

r.post("/dispatch", (req, res) => {
  const b = req.body || {};
  if (!b.business_id || !b.purpose || !b.plan_date) {
    return res.status(400).json({ error: "business_id, purpose and plan_date are required" });
  }
  const distId = distIdForBusiness(b.business_id);
  const calc = distId ? calcSaving({ ...b, distId }) : { saving: null };
  const info = db.prepare(`INSERT INTO dispatch_plans
    (business_id, asset_id, triad_alert_id, purpose, plan_date, start_time, end_time,
     planned_kw, planned_kwh, from_band, to_band, estimated_saving, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(b.business_id, b.asset_id ?? null, b.triad_alert_id ?? null, b.purpose, b.plan_date,
      b.start_time || null, b.end_time || null, b.planned_kw ?? null, b.planned_kwh ?? null,
      b.from_band || null, b.to_band || null, calc.saving, b.status || "Planned", b.notes || null);
  res.status(201).json({ data: db.prepare("SELECT * FROM dispatch_plans WHERE id=?").get(info.lastInsertRowid) });
});

const updDispatch = (req, res) => {
  const b = req.body || {};
  const row = db.prepare("SELECT * FROM dispatch_plans WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const cols = ["asset_id", "triad_alert_id", "purpose", "plan_date", "start_time", "end_time",
    "planned_kw", "planned_kwh", "delivered_kw", "delivered_kwh", "from_band", "to_band", "status", "notes"]
    .filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  db.prepare(`UPDATE dispatch_plans SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);

  const updated = db.prepare("SELECT * FROM dispatch_plans WHERE id=?").get(req.params.id);
  const distId = distIdForBusiness(updated.business_id);
  if (distId) {
    // Re-estimate from the plan, and compute the actual once delivery figures are entered
    // so planned vs achieved can be compared honestly.
    const est = calcSaving({ ...updated, distId });
    const actual = (updated.delivered_kw != null || updated.delivered_kwh != null)
      ? calcSaving({ ...updated, distId, planned_kw: updated.delivered_kw, planned_kwh: updated.delivered_kwh }).saving
      : null;
    db.prepare("UPDATE dispatch_plans SET estimated_saving=?, actual_saving=? WHERE id=?")
      .run(est.saving, actual, req.params.id);
  }
  res.json({ data: db.prepare("SELECT * FROM dispatch_plans WHERE id=?").get(req.params.id) });
};
r.put("/dispatch/:id", updDispatch);
r.patch("/dispatch/:id", updDispatch);

r.delete("/dispatch/:id", (req, res) => {
  const info = db.prepare("DELETE FROM dispatch_plans WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

r.get("/summary", (_req, res) => {
  const s = db.prepare(`SELECT
      COUNT(*) plans,
      COALESCE(SUM(estimated_saving),0) est,
      COALESCE(SUM(actual_saving),0) act,
      COALESCE(SUM(CASE WHEN purpose='Triad Avoidance' THEN estimated_saving ELSE 0 END),0) triad,
      COALESCE(SUM(CASE WHEN purpose='DUoS Red Shift' THEN estimated_saving ELSE 0 END),0) duos
    FROM dispatch_plans WHERE status != 'Missed'`).get();
  const openTriads = db.prepare("SELECT COUNT(*) c FROM triad_alerts WHERE alert_level IN ('Watch','Warning')").get().c;
  res.json({
    data: {
      plans: s.plans, estimated_saving: round2(s.est), actual_saving: round2(s.act),
      triad_saving: round2(s.triad), duos_saving: round2(s.duos), open_triad_alerts: openTriads,
    },
  });
});

export default r;
