import { Router } from "express";
import { db } from "../db.js";

const r = Router();
import { computeComparison, applyRateCard, readRateCard, round2 } from "../lib/fvfCalc.js";

/* ---- Comparisons ---- */
const CMP_COLS = ["business_id", "client_name", "account_ref", "mpan", "site", "annual_kwh",
  "day_kwh", "night_kwh", "duos_red_kwh", "duos_amber_kwh", "duos_green_kwh",
  "capacity_kva", "days", "ccl_p_kwh", "vat_pct", "flex_start", "notes", "status",
  "version_label", "parent_id", "fixed_supplier", "fixed_quote_ref", "fixed_quote_date", "flex_supplier", "basket_id",
  "current_contract_end", "early_termination_pct", "onboarding_fee", "flex_term_months", "flex_end", "agreement_ref",
  "prepared_by", "consumption_period", "market_note", "assumptions", "metering"];

r.get("/", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.business_id) { where.push("c.business_id = ?"); params.push(req.query.business_id); }
  if (req.query.status) { where.push("c.status = ?"); params.push(req.query.status); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({
    data: db.prepare(`SELECT c.*, b.business_name,
                        (SELECT COUNT(DISTINCT year_no) FROM fvf_lines l WHERE l.comparison_id = c.id) AS years
                      FROM fvf_comparisons c LEFT JOIN businesses b ON b.id = c.business_id
                      ${w} ORDER BY c.created_at DESC`).all(...params),
  });
});

/**
 * Creating a comparison lays down the standard cost stack for both scenarios, using the
 * client's own consumption split, so the agent edits rates rather than rebuilding the
 * structure of a bill from memory every time.
 */
function seedStack(id, c, years) {
  const ins = db.prepare(`INSERT INTO fvf_lines
    (comparison_id, scenario, year_no, year_label, label, basis, qty, rate, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  // The client's current contract, so every option can be shown against "do nothing".
  // Same structure as a fixed quote; leave the rates blank if it isn't known.
  [["Day Units", "p_kwh", c.day_kwh ?? c.annual_kwh], ["Night Units", "p_kwh", c.night_kwh ?? 0],
   ["Standing Charge", "p_day", null], ["Transmission Fixed Charge", "p_day", null],
   ["Distribution Fixed Charge", "p_day", null], ["Capacity Charge", "p_kva_day", c.capacity_kva ?? 0],
   ["Nuclear RAB Levy", "p_kwh", c.annual_kwh], ["Network Charging Compensation", "p_kwh", c.annual_kwh],
   ["Feed-in Tariff (FiT)", "p_kwh", c.annual_kwh],
  ].forEach(([label, basis, qty], o) => ins.run(id, "Current", 1, "Current contract", label, basis, qty, null, o));
  for (let y = 1; y <= years; y++) {
    const yl = `Year ${y}`;
    let o = 0;
    // Fixed: commodity is bundled into day/night unit rates.
    [["Day Units", "p_kwh", c.day_kwh ?? c.annual_kwh],
     ["Night Units", "p_kwh", c.night_kwh ?? 0],
     ["Standing Charge", "p_day", null],
     ["Transmission Fixed Charge", "p_day", null],
     ["Distribution Fixed Charge", "p_day", null],
     ["Capacity Charge", "p_kva_day", c.capacity_kva ?? 0],
     ["Excess Capacity Charge", "p_kva_day", 0],
     ["Reactive Capacity Charge", "p_kvarh", 0],
     ["Nuclear RAB Levy", "p_kwh", c.annual_kwh],
     ["Network Charging Compensation", "p_kwh", c.annual_kwh],
     ["Feed-in Tariff (FiT)", "p_kwh", c.annual_kwh],
    ].forEach(([label, basis, qty]) => ins.run(id, "Fixed", y, yl, label, basis, qty, null, o++));

    o = 0;
    // Flex: commodity and non-commodity are separated, and DUoS is billed by band —
    // which is usually where a large part of the difference shows up.
    [["Commodity Cost", "p_kwh", c.annual_kwh],
     ["Non-Commodity Cost", "p_kwh", c.annual_kwh],
     ["Consortium Management Fee", "p_kwh", c.annual_kwh],
     ["Supplier Management Fee", "p_kwh", c.annual_kwh],
     ["Standing Charge", "p_day", null],
     ["Transmission Fixed Charge", "p_day", null],
     ["Distribution Fixed Charge", "p_day", null],
     ["HH DUoS Red", "p_kwh", c.duos_red_kwh ?? 0],
     ["HH DUoS Amber", "p_kwh", c.duos_amber_kwh ?? 0],
     ["HH DUoS Green", "p_kwh", c.duos_green_kwh ?? 0],
     ["Capacity Charge", "p_kva_day", c.capacity_kva ?? 0],
     ["Feed-in Tariff (FiT)", "p_kwh", c.annual_kwh],
    ].forEach(([label, basis, qty]) => ins.run(id, "Flex", y, yl, label, basis, qty, null, o++));
  }
}

r.post("/", (req, res) => {
  const b = req.body || {};
  if (!b.client_name || !b.annual_kwh) return res.status(400).json({ error: "client_name and annual_kwh are required" });
  if (Array.isArray(b.assumptions)) b.assumptions = JSON.stringify(b.assumptions);
  const cols = CMP_COLS.filter((c) => b[c] !== undefined && b[c] !== null && b[c] !== "");
  const info = db.prepare(`INSERT INTO fvf_comparisons (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...cols.map((c) => b[c]));
  const id = info.lastInsertRowid;
  const cmp = db.prepare("SELECT * FROM fvf_comparisons WHERE id=?").get(id);
  seedStack(id, cmp, Math.min(5, Math.max(1, Number(b.years) || 3)));
  res.status(201).json({ data: cmp });
});

const updCmp = (req, res) => {
  const b = { ...(req.body || {}) };
  if (Array.isArray(b.assumptions)) b.assumptions = JSON.stringify(b.assumptions);
  const cols = CMP_COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE fvf_comparisons SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM fvf_comparisons WHERE id=?").get(req.params.id) });
};
r.put("/:id", updCmp);
r.patch("/:id", updCmp);

r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM fvf_comparisons WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---- Lines ---- */
r.put("/lines/:id", (req, res) => {
  const b = req.body || {};
  const cols = ["label", "basis", "qty", "rate", "sort_order", "notes"].filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE fvf_lines SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM fvf_lines WHERE id=?").get(req.params.id) });
});

/** Set many rates at once, which is how an agent actually works through a quote. */
r.put("/:id/lines", (req, res) => {
  const rows = Array.isArray(req.body?.lines) ? req.body.lines : null;
  if (!rows) return res.status(400).json({ error: "lines array is required" });
  const upd = db.prepare("UPDATE fvf_lines SET rate=? WHERE id=? AND comparison_id=?");
  const tx = db.transaction(() => rows.forEach((l) => { if (l.id != null) upd.run(l.rate ?? null, l.id, req.params.id); }));
  tx();
  res.json({ data: { updated: rows.length } });
});

r.post("/:id/lines", (req, res) => {
  const b = req.body || {};
  if (!b.scenario || !b.label || !b.basis) return res.status(400).json({ error: "scenario, label and basis are required" });
  const info = db.prepare(`INSERT INTO fvf_lines (comparison_id, scenario, year_no, year_label, label, basis, qty, rate, sort_order, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(req.params.id, b.scenario, b.year_no ?? 1, b.year_label ?? `Year ${b.year_no ?? 1}`,
      b.label, b.basis, b.qty ?? null, b.rate ?? null, b.sort_order ?? 99, b.notes ?? null);
  res.status(201).json({ data: db.prepare("SELECT * FROM fvf_lines WHERE id=?").get(info.lastInsertRowid) });
});

r.delete("/lines/:id", (req, res) => {
  const info = db.prepare("DELETE FROM fvf_lines WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/**
 * GET /api/fixed-vs-flex/:id/result
 * The full comparison (see lib/fvfCalc.js): each year's Fixed and Flex stacks, the saving
 * between them, the current-contract baseline, every option on one table, the term view
 * and plain-English findings. Savings are headlined net of VAT and CCL.
 */
r.get("/:id/result", (req, res) => {
  const out = computeComparison(req.params.id);
  if (!out) return res.status(404).json({ error: "comparison not found" });
  res.json({ data: out });
});

/* ---- Rate card: fill every line from one form ---- */
r.get("/:id/rate-card", (req, res) => res.json({ data: readRateCard(req.params.id) }));
r.put("/:id/rate-card", (req, res) => {
  const card = req.body || {};
  if (!card.fixed && !card.flex && !card.current) return res.status(400).json({ error: "Provide fixed, flex and/or current rates" });
  res.json({ data: { updated: applyRateCard(req.params.id, card) } });
});

/* ---- Monthly consumption ---- */
r.get("/:id/monthly", (req, res) => {
  res.json({ data: db.prepare("SELECT * FROM fvf_monthly WHERE comparison_id=? ORDER BY sort_order, id").all(req.params.id) });
});
r.put("/:id/monthly", (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: "rows array is required" });
  const ins = db.prepare("INSERT INTO fvf_monthly (comparison_id, month_label, sort_order, day_kwh, night_kwh) VALUES (?,?,?,?,?)");
  const n = (v) => (v === "" || v == null ? null : Number(String(v).replace(/,/g, "")));
  db.transaction(() => {
    db.prepare("DELETE FROM fvf_monthly WHERE comparison_id=?").run(req.params.id);
    rows.filter((x) => x.month_label).forEach((x, i) => ins.run(req.params.id, x.month_label, i, n(x.day_kwh), n(x.night_kwh)));
  })();
  const saved = db.prepare("SELECT * FROM fvf_monthly WHERE comparison_id=? ORDER BY sort_order").all(req.params.id);
  const sum = saved.reduce((a, x) => a + (x.day_kwh || 0) + (x.night_kwh || 0), 0);
  const cmp = db.prepare("SELECT annual_kwh FROM fvf_comparisons WHERE id=?").get(req.params.id);
  res.json({ data: { rows: saved, total_kwh: round2(sum), annual_kwh: cmp?.annual_kwh, difference: cmp ? round2(sum - cmp.annual_kwh) : null } });
});

/**
 * Save a new version. The source keeps its history (v7 as issued stays as issued) and the
 * copy is edited, so a client who saw an earlier set of numbers can always be shown it.
 */
r.post("/:id/duplicate", (req, res) => {
  const src = db.prepare("SELECT * FROM fvf_comparisons WHERE id=?").get(req.params.id);
  if (!src) return res.status(404).json({ error: "comparison not found" });
  const { id: _i, created_at: _c, ...rest } = src;
  const copy = { ...rest, status: "Draft", parent_id: src.id, version_label: req.body?.version_label || `Copy of ${src.version_label || `#${src.id}`}` };
  const cols = Object.keys(copy);
  const newId = db.transaction(() => {
    const id = db.prepare(`INSERT INTO fvf_comparisons (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((k) => copy[k])).lastInsertRowid;
    db.prepare(`INSERT INTO fvf_lines (comparison_id, scenario, year_no, year_label, label, basis, qty, rate, sort_order, notes)
      SELECT ?, scenario, year_no, year_label, label, basis, qty, rate, sort_order, notes FROM fvf_lines WHERE comparison_id=?`).run(id, src.id);
    db.prepare(`INSERT INTO fvf_monthly (comparison_id, month_label, sort_order, day_kwh, night_kwh)
      SELECT ?, month_label, sort_order, day_kwh, night_kwh FROM fvf_monthly WHERE comparison_id=?`).run(id, src.id);
    return id;
  })();
  res.status(201).json({ data: { id: newId } });
});

/** Add a year to both scenarios (e.g. a fourth flex year with no fixed equivalent). */
r.post("/:id/years", (req, res) => {
  const scen = req.body?.scenario || "Flex";
  const last = db.prepare("SELECT MAX(year_no) y FROM fvf_lines WHERE comparison_id=? AND scenario=?").get(req.params.id, scen)?.y || 0;
  const y = last + 1;
  const tpl = db.prepare("SELECT * FROM fvf_lines WHERE comparison_id=? AND scenario=? AND year_no=? ORDER BY sort_order").all(req.params.id, scen, last);
  if (!tpl.length) return res.status(400).json({ error: `No ${scen} year to copy from` });
  const ins = db.prepare(`INSERT INTO fvf_lines (comparison_id, scenario, year_no, year_label, label, basis, qty, rate, sort_order) VALUES (?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => tpl.forEach((l) => ins.run(req.params.id, scen, y, req.body?.year_label || `Year ${y}`, l.label, l.basis, l.qty, l.rate, l.sort_order)))();
  res.status(201).json({ data: { year_no: y } });
});

/* ---- Guidance ---- */
r.get("/guidance/all", (_req, res) => {
  res.json({ data: db.prepare("SELECT * FROM fvf_guidance ORDER BY section, sort_order").all() });
});

r.put("/guidance/:id", (req, res) => {
  const b = req.body || {};
  const cols = ["section", "heading", "body", "sort_order"].filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE fvf_guidance SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM fvf_guidance WHERE id=?").get(req.params.id) });
});

export default r;
