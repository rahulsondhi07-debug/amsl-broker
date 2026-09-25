/**
 * Document centre: generate client documents from live data, keep them, download them,
 * and publish them to a customer's hub.
 */
import { Router } from "express";
import { db } from "../db.js";
import { DOC_TYPES, generateDocument } from "../lib/docgen/index.js";
import { DOC_SETTING_KEYS, docSettings } from "../flexSuite.js";
import { sendDoc } from "./knowledge.js";

const r = Router();
const LIST = `SELECT d.id, d.doc_type, d.title, d.filename, d.mime, d.size, d.business_id, d.source_kind, d.source_id,
                     d.published, d.created_by, d.created_at, b.business_name
              FROM generated_documents d LEFT JOIN businesses b ON b.id = d.business_id`;

r.get("/types", (_req, res) => res.json({ data: DOC_TYPES }));

r.get("/settings", (_req, res) => res.json({ data: docSettings() }));
r.put("/settings", (req, res) => {
  const up = db.prepare("INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  db.transaction(() => DOC_SETTING_KEYS.forEach((k) => { if (req.body?.[k] !== undefined) up.run(k, String(req.body[k] ?? "")); }))();
  res.json({ data: docSettings() });
});

r.get("/", (req, res) => {
  const where = [], p = [];
  for (const k of ["business_id", "doc_type", "source_kind", "source_id"]) if (req.query[k]) { where.push(`d.${k} = ?`); p.push(req.query[k]); }
  if (req.query.published) { where.push("d.published = ?"); p.push(Number(req.query.published)); }
  if (req.query.q) { where.push("(d.title LIKE ? OR b.business_name LIKE ?)"); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  res.json({ data: db.prepare(`${LIST} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY d.created_at DESC, d.id DESC LIMIT 500`).all(...p) });
});

/** Generate one document. Body: { doc_type, source_id, business_id?, options?, publish? } */
r.post("/generate", async (req, res, next) => {
  const b = req.body || {};
  try {
    const doc = await generateDocument(b.doc_type, { source_id: b.source_id, business_id: b.business_id || null, options: { ...(b.options || {}), publish: !!b.publish, created_by: b.created_by } });
    res.status(201).json({ data: doc });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

/** Generate a set in one go, e.g. breakdown + workbook + deck for one comparison. */
r.post("/generate-pack", async (req, res, next) => {
  const b = req.body || {};
  const types = Array.isArray(b.types) ? b.types : [];
  if (!types.length) return res.status(400).json({ error: "types array is required" });
  const out = [], errors = [];
  for (const t of types) {
    try { out.push(await generateDocument(t, { source_id: b.source_id, business_id: b.business_id || null, options: { ...(b.options || {}), publish: !!b.publish, created_by: b.created_by } })); }
    catch (e) { if (!e.status) return next(e); errors.push({ doc_type: t, error: e.message }); }
  }
  res.status(out.length ? 201 : 422).json({ data: out, errors, ...(out.length ? {} : { error: errors[0]?.error || "Nothing generated" }) });
});

r.get("/:id/download", (req, res) => {
  const doc = db.prepare("SELECT * FROM generated_documents WHERE id=?").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "not found" });
  sendDoc(res, doc, req.query.inline === "1");
});

r.put("/:id", (req, res) => {
  const b = req.body || {};
  const cols = ["published", "business_id", "title"].filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const vals = cols.map((c) => (c === "published" ? (b[c] ? 1 : 0) : c === "business_id" && b[c] === "" ? null : b[c]));
  if (cols.includes("published") && b.published && !b.business_id) {
    const d = db.prepare("SELECT business_id FROM generated_documents WHERE id=?").get(req.params.id);
    if (d && !d.business_id) return res.status(400).json({ error: "Link the document to a customer before publishing it to their hub." });
  }
  const info = db.prepare(`UPDATE generated_documents SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`).run(...vals, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare(`${LIST} WHERE d.id=?`).get(req.params.id) });
});

r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM generated_documents WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

export default r;
