import { db } from "./db.js";

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const round = (n) => Math.round(n * 100) / 100;

// Default multi-level split: Supplier -> AMSL -> Master Broker -> Agent
const SPLIT = [{ level: "AMSL", pct: 40 }, { level: "Master Broker", pct: 20 }, { level: "Agent", pct: 40 }];

/* Seed a default commission config per supplier (idempotent). */
export function seedCommissionConfig() {
  const suppliers = all("SELECT id, broker_comm_inc_electric, broker_comm_inc_gas FROM suppliers");
  const ins = db.prepare(
    `INSERT OR IGNORE INTO commission_config (supplier_id,payment_method,uplift_rate,upfront_pct,deferred_pct,clawback_pct,vat_rate)
     VALUES (?,?,?,?,?,?,?)`
  );
  const tx = db.transaction(() => {
    suppliers.forEach((s, i) => {
      const uplift = s.broker_comm_inc_electric || s.broker_comm_inc_gas || 1.0;
      const method = i % 2 === 0 ? "Annual" : "Contract Length";
      ins.run(s.id, method, uplift, method === "Contract Length" ? 70 : 100, method === "Contract Length" ? 30 : 0, 100, 20);
    });
  });
  tx();
  return { configured: suppliers.length };
}

function addYears(dateStr, y) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setFullYear(d.getFullYear() + y);
  return d.toISOString().slice(0, 10);
}

/* Compute (or recompute) commission for a single contract. */
export function computeCommissionForContract(c) {
  const cfg = one("SELECT * FROM commission_config WHERE supplier_id=?", c.supplier_id) ||
    { uplift_rate: 1.0, payment_method: "Annual", upfront_pct: 100, deferred_pct: 0, vat_rate: 20 };
  const eac = c.consumption || 0;
  const termY = (c.term_months || 12) / 12;
  const annual = round((eac * cfg.uplift_rate) / 100);   // £/yr
  const gross = round(annual * termY);
  const vat = round(gross * cfg.vat_rate / 100);
  const net = gross;

  // upsert record
  db.prepare("DELETE FROM commission_records WHERE contract_id=?").run(c.id);
  const info = db.prepare(
    `INSERT INTO commission_records (contract_id,supplier_id,agent_id,eac,uplift_rate,term_months,gross,vat,net,status)
     VALUES (?,?,?,?,?,?,?,?,?, 'Projected')`
  ).run(c.id, c.supplier_id, c.agent_id, eac, cfg.uplift_rate, c.term_months, gross, vat, net);
  const rid = info.lastInsertRowid;

  // multi-level splits
  const insSplit = db.prepare("INSERT INTO commission_splits (record_id,level,pct,amount) VALUES (?,?,?,?)");
  SPLIT.forEach((s) => insSplit.run(rid, s.level, s.pct, round(gross * s.pct / 100)));

  // payment schedule
  const insSch = db.prepare("INSERT INTO commission_schedule (record_id,seq,due_date,amount,status) VALUES (?,?,?,?, 'Projected')");
  const start = c.created_at ? c.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  if (cfg.payment_method === "Contract Length") {
    insSch.run(rid, 1, start, round(gross * cfg.upfront_pct / 100));
    if (cfg.deferred_pct > 0) insSch.run(rid, 2, addYears(start, 1), round(gross * cfg.deferred_pct / 100));
  } else {
    const years = Math.max(1, Math.round(termY));
    for (let y = 0; y < years; y++) insSch.run(rid, y + 1, addYears(start, y), annual);
  }

  db.prepare("INSERT INTO commission_ledger (record_id,type,amount,note) VALUES (?,?,?,?)")
    .run(rid, "projected", gross, `Projected commission on EAC ${eac.toLocaleString()} @ ${cfg.uplift_rate}p, ${c.term_months}m`);
  return rid;
}

/* Generate commission for all contracts that don't yet have a record. */
export function generateAllCommissions() {
  const contracts = all(
    `SELECT c.id, c.supplier_id, c.agent_id, c.consumption, c.term_months, c.created_at
     FROM contracts c WHERE c.id NOT IN (SELECT contract_id FROM commission_records WHERE contract_id IS NOT NULL)`
  );
  const tx = db.transaction(() => contracts.forEach((c) => computeCommissionForContract(c)));
  tx();
  return { generated: contracts.length };
}

/* Reconcile against actual annual consumption (AAC). */
export function reconcile(recordId, aac) {
  const rec = one("SELECT * FROM commission_records WHERE id=?", recordId);
  if (!rec) return null;
  const termY = (rec.term_months || 12) / 12;
  const newGross = round((aac * rec.uplift_rate) / 100 * termY);
  const adjustment = round(newGross - rec.gross);
  db.prepare("UPDATE commission_records SET aac=?, gross=?, vat=?, net=?, status='Reconciled' WHERE id=?")
    .run(aac, newGross, round(newGross * 0.2), newGross, recordId);
  // rebalance splits
  db.prepare("DELETE FROM commission_splits WHERE record_id=?").run(recordId);
  const insSplit = db.prepare("INSERT INTO commission_splits (record_id,level,pct,amount) VALUES (?,?,?,?)");
  SPLIT.forEach((s) => insSplit.run(recordId, s.level, s.pct, round(newGross * s.pct / 100)));
  db.prepare("INSERT INTO commission_ledger (record_id,type,amount,note) VALUES (?,?,?,?)")
    .run(recordId, "reconciliation", adjustment, `Reconciled to AAC ${aac.toLocaleString()} (adjustment ${adjustment >= 0 ? "+" : ""}${adjustment})`);
  return { recordId, newGross, adjustment };
}

/* Clawback — reverse outstanding (unpaid) schedule + ledger entry. */
export function clawback(recordId, reason) {
  const rec = one("SELECT * FROM commission_records WHERE id=?", recordId);
  if (!rec) return null;
  const outstanding = one("SELECT COALESCE(SUM(amount),0) s FROM commission_schedule WHERE record_id=? AND status!='Paid'", recordId).s;
  db.prepare("UPDATE commission_schedule SET status='Reconciled' WHERE record_id=? AND status!='Paid'").run(recordId);
  db.prepare("UPDATE commission_records SET status='Clawback' WHERE id=?").run(recordId);
  db.prepare("INSERT INTO commission_ledger (record_id,type,amount,note) VALUES (?,?,?,?)")
    .run(recordId, "clawback", -round(outstanding), reason || "Contract cancelled / failed switch");
  return { recordId, clawedBack: round(outstanding) };
}
