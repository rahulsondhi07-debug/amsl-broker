import { Router } from "express";
import { db } from "../db.js";

const r = Router();

// GET /api/other-services?business_id=123 — list a business's non-energy services.
// Bill content is intentionally excluded from the list response (can be large); use the
// dedicated download route below to fetch it.
r.get("/", (req, res) => {
  const businessId = req.query.business_id;
  if (!businessId) return res.status(400).json({ error: "business_id is required" });
  const rows = db.prepare(
    `SELECT id, business_id, service_type, provider, contract_end, notes, bill_filename, bill_mime, created_at
     FROM other_services WHERE business_id = ? ORDER BY created_at DESC`
  ).all(businessId);
  res.json({ data: rows });
});

r.post("/", (req, res) => {
  const b = req.body || {};
  if (!b.business_id) return res.status(400).json({ error: "business_id is required" });
  if (!b.service_type) return res.status(400).json({ error: "service_type is required" });
  const info = db.prepare(
    `INSERT INTO other_services (business_id, service_type, provider, contract_end, notes, bill_filename, bill_mime, bill_data)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(b.business_id, b.service_type, b.provider || null, b.contract_end || null, b.notes || null,
        b.bill_filename || null, b.bill_mime || null, b.bill_data || null);
  const row = db.prepare(
    `SELECT id, business_id, service_type, provider, contract_end, notes, bill_filename, bill_mime, created_at
     FROM other_services WHERE id = ?`
  ).get(info.lastInsertRowid);
  res.status(201).json({ data: row });
});

const upd = (req, res) => {
  const b = req.body || {};
  const cols = [];
  const vals = [];
  for (const k of ["service_type", "provider", "contract_end", "notes", "bill_filename", "bill_mime", "bill_data"]) {
    if (b[k] !== undefined) { cols.push(`${k}=?`); vals.push(b[k]); }
  }
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE other_services SET ${cols.join(",")} WHERE id=?`).run(...vals, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  const row = db.prepare(
    `SELECT id, business_id, service_type, provider, contract_end, notes, bill_filename, bill_mime, created_at
     FROM other_services WHERE id = ?`
  ).get(req.params.id);
  res.json({ data: row });
};
r.put("/:id", upd);
r.patch("/:id", upd);

r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM other_services WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

// GET /api/other-services/:id/bill — download the uploaded bill file.
r.get("/:id/bill", (req, res) => {
  const row = db.prepare("SELECT bill_filename, bill_mime, bill_data FROM other_services WHERE id=?").get(req.params.id);
  if (!row || !row.bill_data) return res.status(404).json({ error: "No bill uploaded for this service" });
  const buf = Buffer.from(row.bill_data, "base64");
  res.setHeader("Content-Type", row.bill_mime || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${(row.bill_filename || "bill").replace(/"/g, "")}"`);
  res.send(buf);
});

export default r;
