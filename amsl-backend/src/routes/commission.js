import { Router } from "express";
import { db } from "../db.js";
import { generateAllCommissions, reconcile, clawback } from "../commissionEngine.js";

const r = Router();
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);

/* Records with splits + schedule */
r.get("/", (_req, res) => {
  const recs = all(`
    SELECT cr.*, ct.contract_no, ct.business_name, s.name AS supplier_name, a.name AS agent_name
    FROM commission_records cr
    LEFT JOIN contracts ct ON ct.id = cr.contract_id
    LEFT JOIN suppliers s ON s.id = cr.supplier_id
    LEFT JOIN agents a ON a.id = cr.agent_id
    ORDER BY cr.gross DESC`);
  for (const rec of recs) {
    rec.splits = all("SELECT level,pct,amount FROM commission_splits WHERE record_id=?", rec.id);
    rec.schedule = all("SELECT seq,due_date,amount,status FROM commission_schedule WHERE record_id=? ORDER BY seq", rec.id);
  }
  const totals = one(`SELECT COALESCE(SUM(gross),0) gross, COALESCE(SUM(vat),0) vat, COUNT(*) n FROM commission_records`);
  res.json({ data: { records: recs, totals } });
});

r.get("/config", (_req, res) => {
  res.json({ data: all(`SELECT cc.*, s.name AS supplier_name FROM commission_config cc LEFT JOIN suppliers s ON s.id=cc.supplier_id ORDER BY s.name`) });
});

r.get("/ledger", (_req, res) => {
  res.json({ data: all(`SELECT cl.*, cr.contract_id FROM commission_ledger cl LEFT JOIN commission_records cr ON cr.id=cl.record_id ORDER BY cl.created_at DESC, cl.id DESC LIMIT 200`) });
});

r.post("/generate", (_req, res) => res.json({ data: generateAllCommissions() }));

r.post("/:id/reconcile", (req, res) => {
  const aac = Number(req.body.aac);
  if (!Number.isFinite(aac) || aac <= 0) return res.status(400).json({ error: "valid actual annual consumption (aac) required" });
  const out = reconcile(req.params.id, aac);
  if (!out) return res.status(404).json({ error: "record not found" });
  res.json({ data: out });
});

r.post("/:id/clawback", (req, res) => {
  const out = clawback(req.params.id, req.body.reason);
  if (!out) return res.status(404).json({ error: "record not found" });
  res.json({ data: out });
});

export default r;
