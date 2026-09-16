import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

/* ---- Programmes: the flexibility schemes a customer can be paid through ---- */
r.get("/programmes", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) { where.push("status = ?"); params.push(req.query.status); }
  if (req.query.scheme_type) { where.push("scheme_type = ?"); params.push(req.query.scheme_type); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({ data: db.prepare(`SELECT * FROM vpp_programmes ${w} ORDER BY name`).all(...params) });
});

const PROG_COLS = ["name", "operator", "scheme_type", "payment_basis", "utilisation_rate",
  "availability_rate", "min_capacity_kw", "typical_window", "season_start", "season_end", "status", "notes"];

r.post("/programmes", (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "name is required" });
  const info = db.prepare(`INSERT INTO vpp_programmes (${PROG_COLS.join(",")}) VALUES (${PROG_COLS.map(() => "?").join(",")})`)
    .run(...PROG_COLS.map((c) => b[c] ?? null));
  res.status(201).json({ data: db.prepare("SELECT * FROM vpp_programmes WHERE id=?").get(info.lastInsertRowid) });
});

const updProg = (req, res) => {
  const b = req.body || {};
  const cols = PROG_COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE vpp_programmes SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM vpp_programmes WHERE id=?").get(req.params.id) });
};
r.put("/programmes/:id", updProg);
r.patch("/programmes/:id", updProg);

r.delete("/programmes/:id", (req, res) => {
  const info = db.prepare("DELETE FROM vpp_programmes WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- Eligible assets: flexible assets that could be enrolled ----
   Batteries are the obvious candidate, but an EV charge point can also be turned down,
   so both are offered. Earnings potential is shown per asset from the programme rates. */
r.get("/eligible-assets", (req, res) => {
  const where = ["a.asset_type IN ('Battery Storage','EV Charge Point')", "a.status = 'Active'"];
  const params = [];
  if (req.query.business_id) { where.push("a.business_id = ?"); params.push(req.query.business_id); }
  const rows = db.prepare(`
    SELECT a.id, a.business_id, b.business_name, a.asset_type, a.manufacturer, a.model,
           a.capacity_kw, a.capacity_kwh, a.export_capable, a.mpan,
           (SELECT COUNT(*) FROM vpp_enrolments e WHERE e.asset_id = a.id AND e.status IN ('Registered','Active')) AS enrolments
    FROM energy_assets a LEFT JOIN businesses b ON b.id = a.business_id
    WHERE ${where.join(" AND ")} ORDER BY a.capacity_kw DESC`).all(...params);
  res.json({ data: rows });
});

/* ---- Enrolments ---- */
r.get("/enrolments", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.business_id) { where.push("e.business_id = ?"); params.push(req.query.business_id); }
  if (req.query.status) { where.push("e.status = ?"); params.push(req.query.status); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({
    data: db.prepare(`
      SELECT e.*, b.business_name, p.name AS programme_name, p.operator, p.payment_basis,
             p.utilisation_rate, p.availability_rate, p.scheme_type,
             a.asset_type, a.manufacturer, a.model, a.capacity_kwh,
             (SELECT COALESCE(SUM(pt.payment),0) FROM vpp_participation pt WHERE pt.enrolment_id = e.id) AS earned_to_date
      FROM vpp_enrolments e
      LEFT JOIN businesses b ON b.id = e.business_id
      LEFT JOIN vpp_programmes p ON p.id = e.programme_id
      LEFT JOIN energy_assets a ON a.id = e.asset_id
      ${w} ORDER BY e.created_at DESC`).all(...params),
  });
});

r.post("/enrolments", (req, res) => {
  const b = req.body || {};
  if (!b.business_id || !b.programme_id) return res.status(400).json({ error: "business_id and programme_id are required" });
  const prog = db.prepare("SELECT * FROM vpp_programmes WHERE id=?").get(b.programme_id);
  if (!prog) return res.status(404).json({ error: "programme not found" });
  if (prog.status !== "Open") return res.status(400).json({ error: `${prog.name} is closed to new enrolments.` });

  const kw = b.contracted_kw != null ? Number(b.contracted_kw) : null;
  if (prog.min_capacity_kw != null && (kw == null || kw < prog.min_capacity_kw)) {
    return res.status(400).json({ error: `${prog.name} requires at least ${prog.min_capacity_kw} kW. This asset offers ${kw ?? 0} kW.` });
  }
  const dup = db.prepare("SELECT id FROM vpp_enrolments WHERE asset_id IS NOT NULL AND asset_id=? AND programme_id=? AND status IN ('Registered','Active')")
    .get(b.asset_id ?? null, b.programme_id);
  if (dup) return res.status(400).json({ error: "This asset is already enrolled in that programme." });

  const info = db.prepare(`INSERT INTO vpp_enrolments
    (business_id, asset_id, programme_id, contracted_kw, start_date, end_date, reference, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(b.business_id, b.asset_id ?? null, b.programme_id, kw, b.start_date || null,
      b.end_date || null, b.reference || null, b.status || "Registered", b.notes || null);
  res.status(201).json({ data: db.prepare("SELECT * FROM vpp_enrolments WHERE id=?").get(info.lastInsertRowid) });
});

const updEnrol = (req, res) => {
  const b = req.body || {};
  const allowed = ["contracted_kw", "start_date", "end_date", "reference", "status", "notes"];
  const cols = allowed.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE vpp_enrolments SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM vpp_enrolments WHERE id=?").get(req.params.id) });
};
r.put("/enrolments/:id", updEnrol);
r.patch("/enrolments/:id", updEnrol);

r.delete("/enrolments/:id", (req, res) => {
  const info = db.prepare("DELETE FROM vpp_enrolments WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- Events: a called turn-down window ---- */
r.get("/events", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.programme_id) { where.push("ev.programme_id = ?"); params.push(req.query.programme_id); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({
    data: db.prepare(`
      SELECT ev.*, p.name AS programme_name, p.utilisation_rate,
             (SELECT COUNT(*) FROM vpp_participation pt WHERE pt.event_id = ev.id) AS participants,
             (SELECT COALESCE(SUM(pt.reduction_kwh),0) FROM vpp_participation pt WHERE pt.event_id = ev.id) AS total_reduction_kwh,
             (SELECT COALESCE(SUM(pt.payment),0) FROM vpp_participation pt WHERE pt.event_id = ev.id) AS total_payment
      FROM vpp_events ev LEFT JOIN vpp_programmes p ON p.id = ev.programme_id
      ${w} ORDER BY ev.event_date DESC, ev.start_time DESC`).all(...params),
  });
});

r.post("/events", (req, res) => {
  const b = req.body || {};
  if (!b.programme_id || !b.event_date) return res.status(400).json({ error: "programme_id and event_date are required" });
  const info = db.prepare(`INSERT INTO vpp_events (programme_id, event_date, start_time, end_time, event_type, notes)
    VALUES (?,?,?,?,?,?)`)
    .run(b.programme_id, b.event_date, b.start_time || null, b.end_time || null, b.event_type || "Live", b.notes || null);
  res.status(201).json({ data: db.prepare("SELECT * FROM vpp_events WHERE id=?").get(info.lastInsertRowid) });
});

r.delete("/events/:id", (req, res) => {
  const info = db.prepare("DELETE FROM vpp_events WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- Participation: what each site actually delivered in an event, and what it earned ---- */
r.get("/participation", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.event_id) { where.push("pt.event_id = ?"); params.push(req.query.event_id); }
  if (req.query.enrolment_id) { where.push("pt.enrolment_id = ?"); params.push(req.query.enrolment_id); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({
    data: db.prepare(`
      SELECT pt.*, b.business_name, p.name AS programme_name, ev.event_date, ev.start_time, ev.end_time
      FROM vpp_participation pt
      LEFT JOIN vpp_enrolments e ON e.id = pt.enrolment_id
      LEFT JOIN businesses b ON b.id = e.business_id
      LEFT JOIN vpp_events ev ON ev.id = pt.event_id
      LEFT JOIN vpp_programmes p ON p.id = ev.programme_id
      ${w} ORDER BY ev.event_date DESC`).all(...params),
  });
});

r.post("/participation", (req, res) => {
  const b = req.body || {};
  if (!b.event_id || !b.enrolment_id) return res.status(400).json({ error: "event_id and enrolment_id are required" });
  const ev = db.prepare("SELECT * FROM vpp_events WHERE id=?").get(b.event_id);
  if (!ev) return res.status(404).json({ error: "event not found" });
  const prog = db.prepare("SELECT * FROM vpp_programmes WHERE id=?").get(ev.programme_id);

  const baseline = Number(b.baseline_kwh) || 0;
  const actual = Number(b.actual_kwh) || 0;
  // Only genuine turn-down earns: if the site used more than its baseline, reduction is nil
  // rather than negative, so a poor performance can't produce a negative payment.
  const reduction = round2(Math.max(0, baseline - actual));
  const rate = b.rate_per_mwh != null ? Number(b.rate_per_mwh) : prog?.utilisation_rate ?? 0;
  const payment = round2((reduction / 1000) * rate);

  const info = db.prepare(`INSERT INTO vpp_participation
    (event_id, enrolment_id, baseline_kwh, actual_kwh, reduction_kwh, rate_per_mwh, payment, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(b.event_id, b.enrolment_id, baseline, actual, reduction, rate, payment, b.status || "Estimated", b.notes || null);
  res.status(201).json({ data: db.prepare("SELECT * FROM vpp_participation WHERE id=?").get(info.lastInsertRowid) });
});

const updPart = (req, res) => {
  const b = req.body || {};
  const row = db.prepare("SELECT * FROM vpp_participation WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const allowed = ["baseline_kwh", "actual_kwh", "rate_per_mwh", "status", "notes"];
  const cols = allowed.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  db.prepare(`UPDATE vpp_participation SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  // Recalculate whenever any input to the payment changed, so stored figures can't drift.
  const updated = db.prepare("SELECT * FROM vpp_participation WHERE id=?").get(req.params.id);
  const reduction = round2(Math.max(0, (updated.baseline_kwh || 0) - (updated.actual_kwh || 0)));
  const payment = round2((reduction / 1000) * (updated.rate_per_mwh || 0));
  db.prepare("UPDATE vpp_participation SET reduction_kwh=?, payment=? WHERE id=?").run(reduction, payment, req.params.id);
  res.json({ data: db.prepare("SELECT * FROM vpp_participation WHERE id=?").get(req.params.id) });
};
r.put("/participation/:id", updPart);
r.patch("/participation/:id", updPart);

r.delete("/participation/:id", (req, res) => {
  const info = db.prepare("DELETE FROM vpp_participation WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- Headline figures for the dashboard strip ---- */
r.get("/summary", (req, res) => {
  const bid = req.query.business_id;
  const scope = bid ? "WHERE e.business_id = " + Number(bid) : "";
  const enrolled = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(contracted_kw),0) kw FROM vpp_enrolments e ${scope || "WHERE 1=1"} AND e.status IN ('Registered','Active')`).get();
  const earnings = db.prepare(`
    SELECT COALESCE(SUM(pt.payment),0) total, COALESCE(SUM(pt.reduction_kwh),0) kwh
    FROM vpp_participation pt JOIN vpp_enrolments e ON e.id = pt.enrolment_id ${scope}`).get();
  const paid = db.prepare(`
    SELECT COALESCE(SUM(pt.payment),0) total FROM vpp_participation pt
    JOIN vpp_enrolments e ON e.id = pt.enrolment_id
    ${scope ? scope + " AND" : "WHERE"} pt.status = 'Paid'`).get();
  res.json({
    data: {
      enrolments: enrolled.c, contracted_kw: round2(enrolled.kw),
      total_earnings: round2(earnings.total), total_reduction_kwh: round2(earnings.kwh),
      paid_to_date: round2(paid.total), pending: round2(earnings.total - paid.total),
    },
  });
});

export default r;
