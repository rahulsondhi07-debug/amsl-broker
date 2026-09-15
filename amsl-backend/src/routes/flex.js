import { Router } from "express";
import { db } from "../db.js";

const r = Router();

const COLS = ["business_id", "business_name", "utility", "meter_number", "annual_volume", "sites_count",
              "contract_start", "contract_length", "basket_type", "purchasing_strategy", "tranche_count",
              "index_reference", "risk_appetite", "volume_tolerance", "management_fee",
              "target_supplier_id", "status", "notes", "agent_id"];

const DETAIL = `SELECT f.*, s.name AS target_supplier_name, a.name AS agent_name
                FROM flex_requests f
                LEFT JOIN suppliers s ON s.id = f.target_supplier_id
                LEFT JOIN agents a ON a.id = f.agent_id`;

// GET /api/flex?business_id=&status=&utility=
r.get("/", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.business_id) { where.push("f.business_id = ?"); params.push(req.query.business_id); }
  if (req.query.status) { where.push("f.status = ?"); params.push(req.query.status); }
  if (req.query.utility) { where.push("f.utility = ?"); params.push(req.query.utility); }
  const sql = `${DETAIL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY f.created_at DESC, f.id DESC`;
  res.json({ data: db.prepare(sql).all(...params) });
});

r.get("/:id", (req, res) => {
  const row = db.prepare(`${DETAIL} WHERE f.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({ data: row });
});

r.post("/", (req, res) => {
  const b = req.body || {};
  if (!b.utility) return res.status(400).json({ error: "utility is required" });
  if (!b.annual_volume || Number(b.annual_volume) <= 0) {
    return res.status(400).json({ error: "annual_volume (kWh/yr) is required — flex pricing is driven by volume" });
  }
  const cols = COLS.filter((c) => b[c] !== undefined);
  const info = db.prepare(`INSERT INTO flex_requests (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...cols.map((c) => b[c]));
  // Human-friendly reference, assigned after insert so it can include the row id.
  const ref = `FLX-${String(info.lastInsertRowid).padStart(4, "0")}`;
  db.prepare("UPDATE flex_requests SET ref=? WHERE id=?").run(ref, info.lastInsertRowid);
  res.status(201).json({ data: db.prepare(`${DETAIL} WHERE f.id = ?`).get(info.lastInsertRowid) });
});

const upd = (req, res) => {
  const b = req.body || {};
  const cols = COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE flex_requests SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare(`${DETAIL} WHERE f.id = ?`).get(req.params.id) });
};
r.put("/:id", upd);
r.patch("/:id", upd);

r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM flex_requests WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

export default r;
