import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * A cost line's amount, derived from its basis so a rate and its total can never disagree.
 * All rates are in pence, so every result is divided by 100 to reach pounds.
 *   p_kwh      pence per kWh              qty kWh x rate
 *   p_day      pence per day              days x rate
 *   p_kva_day  pence per kVA per day      qty kVA x rate x days
 *   p_kvarh    pence per kVArh            qty kVArh x rate
 */
function lineAmount(line, cmp) {
  const rate = Number(line.rate) || 0;
  const qty = Number(line.qty) || 0;
  const days = Number(cmp.days) || 365;
  switch (line.basis) {
    case "p_day": return round2((days * rate) / 100);
    case "p_kva_day": return round2((qty * rate * days) / 100);
    case "p_kwh":
    case "p_kvarh":
    default: return round2((qty * rate) / 100);
  }
}

/**
 * Build one scenario-year: its layers, then the statutory additions on top.
 * CCL and VAT sit outside the subtotal because that is how a bill is actually presented,
 * and because comparing net of VAT and CCL is the only like-for-like view — both are
 * identical across Fixed and Flex, so including them flatters neither side but does
 * shrink the apparent percentage saving.
 */
function buildScenario(cmp, lines) {
  const priced = lines.map((l) => ({ ...l, amount: lineAmount(l, cmp) }));
  const subtotal = round2(priced.reduce((a, l) => a + l.amount, 0));
  const ccl = round2(((Number(cmp.annual_kwh) || 0) * (Number(cmp.ccl_p_kwh) || 0)) / 100);
  const netVat = round2(subtotal + ccl);
  const vat = round2(netVat * ((Number(cmp.vat_pct) || 0) / 100));
  return {
    lines: priced,
    subtotal_ex_ccl_vat: subtotal,
    ccl, total_ex_vat: netVat, vat, total_inc_vat: round2(netVat + vat),
    // Effective p/kWh makes two different stacks directly comparable.
    effective_p_kwh: cmp.annual_kwh ? round4((subtotal / cmp.annual_kwh) * 100) : null,
  };
}

/* ---- Comparisons ---- */
const CMP_COLS = ["business_id", "client_name", "account_ref", "mpan", "site", "annual_kwh",
  "day_kwh", "night_kwh", "duos_red_kwh", "duos_amber_kwh", "duos_green_kwh",
  "capacity_kva", "days", "ccl_p_kwh", "vat_pct", "flex_start", "notes", "status"];

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
     ["Platform Management Fee", "p_kwh", c.annual_kwh],
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
  const cols = CMP_COLS.filter((c) => b[c] !== undefined && b[c] !== null && b[c] !== "");
  const info = db.prepare(`INSERT INTO fvf_comparisons (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...cols.map((c) => b[c]));
  const id = info.lastInsertRowid;
  const cmp = db.prepare("SELECT * FROM fvf_comparisons WHERE id=?").get(id);
  seedStack(id, cmp, Math.min(5, Math.max(1, Number(b.years) || 3)));
  res.status(201).json({ data: cmp });
});

const updCmp = (req, res) => {
  const b = req.body || {};
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
 * The full comparison: each year's Fixed and Flex stacks, and the saving between them.
 * Savings are reported net of VAT and CCL as the headline, because those two are identical
 * on both sides — including them inflates the absolute figure and understates the percentage.
 */
r.get("/:id/result", (req, res) => {
  const cmp = db.prepare(`SELECT c.*, b.business_name FROM fvf_comparisons c
                          LEFT JOIN businesses b ON b.id = c.business_id WHERE c.id=?`).get(req.params.id);
  if (!cmp) return res.status(404).json({ error: "comparison not found" });
  const all = db.prepare("SELECT * FROM fvf_lines WHERE comparison_id=? ORDER BY year_no, sort_order, id").all(req.params.id);
  const years = [...new Set(all.map((l) => l.year_no))].sort((a, b) => a - b);

  const rows = years.map((y) => {
    const yl = all.find((l) => l.year_no === y)?.year_label || `Year ${y}`;
    const fixed = buildScenario(cmp, all.filter((l) => l.year_no === y && l.scenario === "Fixed"));
    const flex = buildScenario(cmp, all.filter((l) => l.year_no === y && l.scenario === "Flex"));
    // A year with no rates entered on one side cannot be compared; report it as such
    // rather than showing a saving equal to the whole of the other side.
    const fixedPriced = fixed.lines.some((l) => l.rate != null);
    const flexPriced = flex.lines.some((l) => l.rate != null);
    const comparable = fixedPriced && flexPriced;
    return {
      year_no: y, year_label: yl, fixed, flex, comparable,
      saving_ex_ccl_vat: comparable ? round2(fixed.subtotal_ex_ccl_vat - flex.subtotal_ex_ccl_vat) : null,
      saving_pct: comparable && fixed.subtotal_ex_ccl_vat
        ? round4(((fixed.subtotal_ex_ccl_vat - flex.subtotal_ex_ccl_vat) / fixed.subtotal_ex_ccl_vat) * 100) : null,
      saving_inc_vat: comparable ? round2(fixed.total_inc_vat - flex.total_inc_vat) : null,
    };
  });

  const comparableRows = rows.filter((x) => x.comparable);
  res.json({
    data: {
      comparison: cmp, years: rows,
      totals: {
        term_saving_ex_ccl_vat: round2(comparableRows.reduce((a, x) => a + (x.saving_ex_ccl_vat || 0), 0)),
        term_saving_inc_vat: round2(comparableRows.reduce((a, x) => a + (x.saving_inc_vat || 0), 0)),
        years_compared: comparableRows.length,
        years_incomplete: rows.length - comparableRows.length,
      },
    },
  });
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
