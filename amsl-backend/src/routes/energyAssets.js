import { Router } from "express";
import { db } from "../db.js";

const r = Router();

const COLS = ["business_id", "asset_type", "manufacturer", "model", "capacity_kw", "capacity_kwh",
              "quantity", "install_date", "ownership", "meter_id", "mpan", "day_night_active",
              "charging_strategy", "export_capable", "status", "notes"];

const DETAIL = `SELECT a.*, m.mpan_mprn AS meter_mpan
                FROM energy_assets a LEFT JOIN meters m ON m.id = a.meter_id`;

// GET /api/energy-assets?business_id=123
r.get("/", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.business_id) { where.push("a.business_id = ?"); params.push(req.query.business_id); }
  if (req.query.asset_type) { where.push("a.asset_type = ?"); params.push(req.query.asset_type); }
  if (req.query.status) { where.push("a.status = ?"); params.push(req.query.status); }
  const sql = `${DETAIL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY a.asset_type, a.id DESC`;
  res.json({ data: db.prepare(sql).all(...params) });
});

const bool = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

r.post("/", (req, res) => {
  const b = req.body || {};
  if (!b.business_id) return res.status(400).json({ error: "business_id is required" });
  if (!b.asset_type) return res.status(400).json({ error: "asset_type is required" });
  const body = { ...b, day_night_active: bool(b.day_night_active), export_capable: bool(b.export_capable) };
  const cols = COLS.filter((c) => body[c] !== undefined);
  const info = db.prepare(`INSERT INTO energy_assets (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...cols.map((c) => body[c]));
  res.status(201).json({ data: db.prepare(`${DETAIL} WHERE a.id = ?`).get(info.lastInsertRowid) });
});

const upd = (req, res) => {
  const b = req.body || {};
  const body = { ...b };
  if (b.day_night_active !== undefined) body.day_night_active = bool(b.day_night_active);
  if (b.export_capable !== undefined) body.export_capable = bool(b.export_capable);
  const cols = COLS.filter((c) => body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE energy_assets SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => body[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare(`${DETAIL} WHERE a.id = ?`).get(req.params.id) });
};
r.put("/:id", upd);
r.patch("/:id", upd);

r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM energy_assets WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

export default r;
