import { Router } from "express";
import { db, JOURNEY_STAGES, runAutomations } from "../db.js";

const r = Router();
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const STAGE_KEYS = JOURNEY_STAGES.map((s) => s.key);

// fuel filter fragment (?fuel=ELEC|GAS|DUAL|ALL)
function fuelFrag(fuel) {
  if (fuel === "ELEC") return " AND b.fuel IN ('ELEC','DUAL')";
  if (fuel === "GAS")  return " AND b.fuel IN ('GAS','DUAL')";
  if (fuel === "DUAL") return " AND b.fuel='DUAL'";
  return "";
}

const baseSelect = `
  SELECT b.id, b.ref, b.business_name, b.contact_name, b.contact_email, b.contact_mobile,
         b.journey_stage, b.fuel, b.contract_end, b.contract_start, b.disposition, b.frozen, b.stage_updated_at, b.created_at,
         ag.name AS agency_name, a.name AS agent_name, s.name AS supplier_name,
         (SELECT COUNT(*) FROM sites si WHERE si.business_id=b.id) AS sites,
         (SELECT COUNT(*) FROM meters m WHERE m.business_id=b.id) AS meters,
         (SELECT COALESCE(SUM(eac),0) FROM meters m WHERE m.business_id=b.id) AS total_eac,
         (SELECT COUNT(*) FROM customer_comments c WHERE c.business_id=b.id) AS comment_count
  FROM businesses b
  LEFT JOIN agencies ag ON ag.id=b.agency_id
  LEFT JOIN agents   a  ON a.id=b.agent_id
  LEFT JOIN suppliers s ON s.id=b.supplier_id`;

/* ---- Stage counts (for the dashboard cards + pipeline strip) ---- */
r.get("/stages", (req, res) => {
  const fuel = req.query.fuel;
  const rows = all(`SELECT journey_stage k, COUNT(*) c FROM businesses b WHERE 1=1${fuelFrag(fuel)} GROUP BY journey_stage`);
  const counts = Object.fromEntries(rows.map((x) => [x.k, x.c]));
  const stages = JOURNEY_STAGES.map((s) => ({ ...s, count: counts[s.key] || 0 }));
  const groups = {};
  for (const s of stages) groups[s.group] = (groups[s.group] || 0) + s.count;
  res.json({ data: { stages, groups, total: stages.reduce((a, s) => a + s.count, 0) } });
});

/* ---- List by stage + fuel + search ---- */
r.get("/", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 12);
  const stage = STAGE_KEYS.includes(req.query.stage) ? req.query.stage : null;
  const fuel = req.query.fuel;
  const q = (req.query.q || "").trim();

  let where = " WHERE 1=1";
  const params = [];
  if (stage) { where += " AND b.journey_stage=?"; params.push(stage); }
  where += fuelFrag(fuel);
  if (req.query.agency_id) { where += " AND b.agency_id=?"; params.push(req.query.agency_id); }
  if (req.query.agent_id) { where += " AND b.agent_id=?"; params.push(req.query.agent_id); }
  if (q) { where += " AND (b.business_name LIKE ? OR b.contact_name LIKE ? OR b.ref LIKE ?)"; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  const total = one(`SELECT COUNT(*) c FROM businesses b${where}`, ...params).c;
  const rows = all(
    `${baseSelect}${where} ORDER BY (b.contract_end IS NULL), b.contract_end ASC, b.stage_updated_at DESC LIMIT ? OFFSET ?`,
    ...params, limit, (page - 1) * limit
  );
  res.json({ data: rows, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

/* ---- Notifications list (must precede /:id) ---- */
r.get("/notifications", (_req, res) => {
  res.json({ data: all("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100") });
});

/* ---- Full detail (details panel) ---- */
r.get("/:id", (req, res) => {
  const row = one(`${baseSelect} WHERE b.id=?`, req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  row.meters = all("SELECT * FROM meters WHERE business_id=?", req.params.id);
  row.comments = all("SELECT * FROM customer_comments WHERE business_id=? ORDER BY created_at DESC", req.params.id);
  row.history = all("SELECT * FROM stage_history WHERE business_id=? ORDER BY changed_at DESC", req.params.id);
  res.json({ data: row });
});

/* ---- Move stage (records history) ---- */
r.post("/:id/stage", (req, res) => {
  const to = req.body.stage;
  if (!STAGE_KEYS.includes(to)) return res.status(400).json({ error: "invalid stage" });
  const b = one("SELECT journey_stage FROM businesses WHERE id=?", req.params.id);
  if (!b) return res.status(404).json({ error: "not found" });
  // keep the legacy stage field roughly in sync so old screens still work
  const legacy = ["RAW_LEAD", "QUALIFIED"].includes(to) ? "LEAD"
    : ["QUOTE_CREATED", "QUOTED", "ESIGN_SENT"].includes(to) ? "PROSPECT" : "CUSTOMER";
  db.prepare("UPDATE businesses SET journey_stage=?, stage=?, stage_updated_at=datetime('now') WHERE id=?")
    .run(to, legacy, req.params.id);
  db.prepare("INSERT INTO stage_history (business_id,from_stage,to_stage,note,changed_by) VALUES (?,?,?,?,?)")
    .run(req.params.id, b.journey_stage, to, req.body.note || null, req.body.by || "You");
  // V1.6-11: contract-signed notification + email recipients (send stubbed for production SMTP)
  if (to === "WON") {
    const biz = one(
      `SELECT b.business_name, b.contact_email, ag.name AS agent_name, a2.email AS agent_email
       FROM businesses b LEFT JOIN agents ag ON ag.id=b.agent_id LEFT JOIN agents a2 ON a2.id=b.agent_id
       WHERE b.id=?`, req.params.id);
    const DEFAULTS = ["rahul@amslgroup.co.uk", "amsl.crm@azentratech.com", "prinali@amslgroup.co.uk"];
    const to_ = biz?.contact_email ? [biz.contact_email] : [];
    const cc = [...DEFAULTS, biz?.agent_email].filter(Boolean);
    db.prepare("INSERT INTO notifications (business_id,kind,title,body) VALUES (?,?,?,?)")
      .run(req.params.id, "contract_signed",
        `Contract signed — ${biz?.business_name || "customer"}`,
        `Email queued (SMTP stub). To: ${to_.join(", ") || "customer contract email"}. CC: ${cc.join(", ")}.`);
  }
  res.json({ data: one("SELECT id, journey_stage, stage_updated_at FROM businesses WHERE id=?", req.params.id) });
});

/* ---- Comments ---- */
r.get("/:id/comments", (req, res) => {
  res.json({ data: all("SELECT * FROM customer_comments WHERE business_id=? ORDER BY created_at DESC", req.params.id) });
});
r.post("/:id/comments", (req, res) => {
  if (!req.body.body || !req.body.body.trim()) return res.status(400).json({ error: "comment is empty" });
  const info = db.prepare("INSERT INTO customer_comments (business_id,author,body) VALUES (?,?,?)")
    .run(req.params.id, req.body.author || "You", req.body.body.trim());
  res.status(201).json({ data: one("SELECT * FROM customer_comments WHERE id=?", info.lastInsertRowid) });
});

/* ---- Disposition (V1.6-06): record the outcome of a contact attempt ---- */
r.post("/:id/disposition", (req, res) => {
  const d = (req.body.disposition || "").trim();
  if (!d) return res.status(400).json({ error: "disposition required" });
  const info = db.prepare("UPDATE businesses SET disposition=? WHERE id=?").run(d, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  db.prepare("INSERT INTO stage_history (business_id,from_stage,to_stage,note,changed_by) VALUES (?,?,?,?,?)")
    .run(req.params.id, null, "disposition", `Disposition: ${d}${req.body.note ? " — " + req.body.note : ""}`, req.body.by || "You");
  res.json({ data: { id: Number(req.params.id), disposition: d } });
});

/* ---- Schedule a callback (V1.6-06 CallBack form) ---- */
r.post("/:id/callback", (req, res) => {
  if (!req.body.due_at) return res.status(400).json({ error: "due_at required" });
  const info = db.prepare("INSERT INTO callbacks (business_id,due_at,reason,note,created_by) VALUES (?,?,?,?,?)")
    .run(req.params.id, req.body.due_at, req.body.reason || null, req.body.note || null, req.body.by || "You");
  const biz = one("SELECT business_name FROM businesses WHERE id=?", req.params.id);
  db.prepare("INSERT INTO notifications (business_id,kind,title,body) VALUES (?,?,?,?)")
    .run(req.params.id, "callback", `Callback scheduled — ${biz?.business_name || ""}`, `${req.body.due_at}${req.body.reason ? " · " + req.body.reason : ""}`);
  res.status(201).json({ data: one("SELECT * FROM callbacks WHERE id=?", info.lastInsertRowid) });
});

/* ---- Upcoming callbacks (for reminders / a callbacks view) ---- */
r.get("/callbacks/upcoming", (req, res) => {
  res.json({ data: all(
    `SELECT cb.*, b.business_name, b.journey_stage FROM callbacks cb
     JOIN businesses b ON b.id=cb.business_id
     WHERE cb.done=0 ORDER BY cb.due_at ASC LIMIT 100`
  ) });
});
r.post("/callbacks/:cid/done", (req, res) => {
  const info = db.prepare("UPDATE callbacks SET done=1 WHERE id=?").run(req.params.cid);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.cid), done: true } });
});

/* ---- Run stage automations on demand (V1.7-04 & V1.7-07) ---- */
r.post("/automations/run", (_req, res) => res.json({ data: runAutomations() }));

/* ---- Notifications (mark seen; list is defined above /:id) ---- */
r.post("/notifications/:nid/seen", (req, res) => {
  db.prepare("UPDATE notifications SET seen=1 WHERE id=?").run(req.params.nid);
  res.json({ data: { id: Number(req.params.nid), seen: true } });
});

/* ---- Freeze / unfreeze a customer (V1.6-14) ---- */
r.post("/:id/freeze", (req, res) => {
  const cur = one("SELECT frozen FROM businesses WHERE id=?", req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  const next = cur.frozen ? 0 : 1;
  db.prepare("UPDATE businesses SET frozen=? WHERE id=?").run(next, req.params.id);
  db.prepare("INSERT INTO stage_history (business_id,from_stage,to_stage,note,changed_by) VALUES (?,?,?,?,?)")
    .run(req.params.id, null, "freeze", next ? "Account frozen" : "Account unfrozen", (req.body && req.body.by) || "You");
  res.json({ data: { id: Number(req.params.id), frozen: next } });
});

/* ---- V1.6-08: daily agent reminder data (scheduled callbacks per agent).
   Real deployment triggers this on a 9AM cron and emails the agent an Excel;
   here it assembles the data + records a notification (email send is stubbed). ---- */
r.get("/reminders/daily", (_req, res) => {
  const rows = all(
    `SELECT cb.id, cb.due_at, cb.reason, b.business_name, b.contact_name, b.contact_mobile,
            ag.id AS agent_id, ag.name AS agent_name, ag.email AS agent_email
     FROM callbacks cb JOIN businesses b ON b.id=cb.business_id
     LEFT JOIN agents ag ON ag.id=b.agent_id
     WHERE cb.done=0 AND date(cb.due_at)=date('now')
     ORDER BY ag.name, cb.due_at`
  );
  const byAgent = {};
  for (const r of rows) {
    const k = r.agent_id || 0;
    (byAgent[k] = byAgent[k] || { agent_name: r.agent_name || "Unassigned", agent_email: r.agent_email, calls: [] })
      .calls.push({ due_at: r.due_at, business: r.business_name, contact: r.contact_name, mobile: r.contact_mobile, reason: r.reason });
  }
  res.json({ data: { generated_at: new Date().toISOString(), emailDelivery: "stub (configure SMTP in production)", agents: Object.values(byAgent) } });
});

export default r;
