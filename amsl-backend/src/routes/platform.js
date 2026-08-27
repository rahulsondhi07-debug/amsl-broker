import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);

/* ---------- Tutorials / Platform Guide (V1.0-19) ---------- */
r.get("/tutorials", (_req, res) => res.json({ data: all("SELECT * FROM tutorials ORDER BY kind, title") }));
r.post("/tutorials", (req, res) => {
  const b = req.body;
  if (!b.title) return res.status(400).json({ error: "title required" });
  const info = db.prepare("INSERT INTO tutorials (title,kind,category,url,file_type) VALUES (?,?,?,?,?)")
    .run(b.title, b.kind || "video", b.category || null, b.url || null, b.file_type || null);
  res.status(201).json({ data: one("SELECT * FROM tutorials WHERE id=?", info.lastInsertRowid) });
});
r.delete("/tutorials/:id", (req, res) => {
  const info = db.prepare("DELETE FROM tutorials WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---------- Platform Settings / config lookups (V1.0-17) ---------- */
r.get("/config", (_req, res) => {
  const rows = all("SELECT * FROM config_lookups ORDER BY category, value");
  const byCat = {};
  for (const x of rows) (byCat[x.category] = byCat[x.category] || []).push(x);
  res.json({ data: byCat });
});
r.post("/config", (req, res) => {
  const { category, value } = req.body;
  if (!category || !value) return res.status(400).json({ error: "category and value required" });
  try {
    const info = db.prepare("INSERT INTO config_lookups (category,value) VALUES (?,?)").run(category, value);
    res.status(201).json({ data: one("SELECT * FROM config_lookups WHERE id=?", info.lastInsertRowid) });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: `"${value}" already exists in ${category}.` });
    throw e;
  }
});
r.delete("/config/:id", (req, res) => {
  const info = db.prepare("DELETE FROM config_lookups WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---------- Commission report (V1.2/V1.3 reporting layer) ---------- */
r.get("/commission/summary", (_req, res) => {
  const byAgent = all(`
    SELECT a.id, a.name AS agent, ag.name AS agency,
           COUNT(c.id) AS contracts,
           COALESCE(SUM(c.commission_value),0) AS total_commission,
           COALESCE(SUM(CASE WHEN c.status LIKE '%Accepted%' THEN c.commission_value ELSE 0 END),0) AS confirmed_commission
    FROM contracts c
    LEFT JOIN agents a  ON a.id = c.agent_id
    LEFT JOIN agencies ag ON ag.id = a.agency_id
    GROUP BY a.id ORDER BY total_commission DESC`);
  const totals = one(`SELECT COUNT(*) contracts, COALESCE(SUM(commission_value),0) total FROM contracts`);
  res.json({ data: { byAgent, totals } });
});

export default r;
