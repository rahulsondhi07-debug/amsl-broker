import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const MIN = 0.5;   // below 50p a difference is rounding, not a finding
const STATUSES = ["Draft", "Evidence Gathering", "Submitted", "Agreed", "Refunded", "Rejected"];

/**
 * Verify one water bill.
 *
 * The overcharge is split into parts that add up EXACTLY to the true difference, so no
 * pound is counted twice. With billed volume Vb, true volume Va, return-to-sewer shares
 * rB (billed) and rA (actual), and sewerage rates sB (billed) and sE (expected):
 *
 *   billed sewerage − true sewerage
 *     = (Vb − Va)·rB·sB           ← volume over-billed (meter read check)
 *     + Va·rB·(sB − sE)           ← wrong sewerage rate
 *     + Va·(rB − rA)·sE           ← non-return to sewer
 *
 * and the same shape for water supply. So each check works on the CORRECTED volume Va,
 * not the billed one.
 *
 * Findings carry a basis:
 *   confirmed         provable from the bill and actual readings → counts toward the claim
 *   evidence required depends on proof not yet held (drainage survey, sub-meter data)
 *                     → reported as potential, never mixed into the confirmed total
 *   info              worth knowing, no money attached
 */
export function validateWater(b) {
  const findings = [];
  const days = Math.max(1, num(b.days) || 30);
  const fmt = (n) => Number(n).toFixed(2);

  const billed = num(b.billed_m3) ?? 0;
  const wB = num(b.water_rate_billed), wE = num(b.water_rate_expected);
  const sB = num(b.sewer_rate_billed), sE = num(b.sewer_rate_expected);
  const rB = (num(b.rts_billed_pct) ?? 95) / 100;    // 95% is the usual default assumption
  const rA = num(b.rts_actual_pct) != null ? num(b.rts_actual_pct) / 100 : null;

  /* ---- 1. Meter reads ---- */
  let actual = billed;
  const rs = num(b.read_start), re = num(b.read_end);
  if (rs != null && re != null) {
    if (re < rs) {
      findings.push({ check: "Meter read", basis: "info", amount: 0,
        detail: `End reading ${re} is below start reading ${rs} — check for a meter exchange or a reading error before relying on it.` });
    } else {
      const readVol = round2(re - rs);
      if (billed - readVol > 0.5) {
        actual = readVol;
        const over = billed - readVol;
        const amount = round2(over * ((wB ?? 0) + (sB ?? 0) * rB));
        if (amount > MIN) {
          findings.push({ check: "Meter read", basis: "confirmed", amount,
            detail: `Billed ${fmt(billed)} m³ but actual readings show ${fmt(readVol)} m³ — ${fmt(over)} m³ over-billed for water and sewerage.` });
        }
      } else if (readVol - billed > 0.5) {
        findings.push({ check: "Meter read", basis: "info", amount: 0,
          detail: `Actual readings show ${fmt(readVol)} m³, more than the ${fmt(billed)} m³ billed — expect a catch-up charge; this is not a claim.` });
      }
    }
  }
  if (String(b.bill_read_type || "").toLowerCase() === "estimated") {
    findings.push({ check: "Meter read", basis: "info", amount: 0,
      detail: rs != null && re != null
        ? "The bill is based on an estimated read; the actual readings above have been used instead."
        : "The bill is based on an estimated read. Obtain an actual reading — estimates are a common source of overcharging." });
  }

  /* ---- 2. Water supply ---- */
  if (wB != null && wE != null && wB > wE) {
    const amount = round2(actual * (wB - wE));
    if (amount > MIN) findings.push({ check: "Water rate", basis: "confirmed", amount,
      detail: `Water charged at £${wB}/m³ against the £${wE}/m³ tariff on ${fmt(actual)} m³.` });
  }
  const wsB = num(b.water_standing_billed), wsE = num(b.water_standing_expected);
  if (wsB != null && wsE != null && wsB > wsE) {
    const amount = round2(days * (wsB - wsE));
    if (amount > MIN) findings.push({ check: "Water standing charge", basis: "confirmed", amount,
      detail: `£${wsB}/day charged against £${wsE}/day for ${days} days — often a wrong meter size.` });
  }

  /* ---- 3. Sewerage ---- */
  if (sB != null && sE != null && sB > sE) {
    const amount = round2(actual * rB * (sB - sE));
    if (amount > MIN) findings.push({ check: "Sewerage rate", basis: "confirmed", amount,
      detail: `Sewerage charged at £${sB}/m³ against the £${sE}/m³ tariff on ${fmt(actual * rB)} m³ returned.` });
  }
  const ssB = num(b.sewer_standing_billed), ssE = num(b.sewer_standing_expected);
  if (ssB != null && ssE != null && ssB > ssE) {
    const amount = round2(days * (ssB - ssE));
    if (amount > MIN) findings.push({ check: "Sewerage standing charge", basis: "confirmed", amount,
      detail: `£${ssB}/day charged against £${ssE}/day for ${days} days.` });
  }

  /* ---- 4. Non-return to sewer ---- */
  if (rA != null && rA < rB) {
    const rate = sE ?? sB;
    if (rate != null) {
      const amount = round2(actual * (rB - rA) * rate);
      if (amount > MIN) findings.push({ check: "Non-return to sewer", basis: b.rts_evidence ? "confirmed" : "evidence required", amount,
        detail: `Sewerage is charged on ${Math.round(rB * 100)}% of water, but only ${Math.round(rA * 100)}% reaches the sewer`
          + (b.rts_evidence ? ` (evidence: ${b.rts_evidence}).` : ". Needs evidence — sub-meter data or a process survey — before it can be claimed.") });
    }
  }

  /* ---- 5. Surface water drainage ---- */
  const swd = num(b.swd_charged);
  const drainage = String(b.swd_drainage || "Unknown");
  if (swd != null && swd > 0) {
    if (drainage === "None") {
      findings.push({ check: "Surface water drainage", basis: "evidence required", amount: round2(swd),
        detail: `£${fmt(swd)} charged for surface water drainage, but the site's rainwater does not reach the public sewer. Needs a drainage survey or site plan to claim.` });
    } else if (drainage === "Partial" && num(b.swd_connected_pct) != null) {
      const share = Math.min(100, Math.max(0, num(b.swd_connected_pct))) / 100;
      const amount = round2(swd * (1 - share));
      if (amount > MIN) findings.push({ check: "Surface water drainage", basis: "evidence required", amount,
        detail: `Only ${Math.round(share * 100)}% of the site drains to the public sewer, but the full charge applies. Needs a drainage survey to claim.` });
    } else if (num(b.swd_correct_charge) != null && swd > num(b.swd_correct_charge)) {
      const amount = round2(swd - num(b.swd_correct_charge));
      if (amount > MIN) findings.push({ check: "Surface water drainage", basis: "evidence required", amount,
        detail: `Charged £${fmt(swd)} against £${fmt(num(b.swd_correct_charge))} for the correct area band. Needs the site area confirmed.` });
    } else if (drainage === "Unknown") {
      findings.push({ check: "Surface water drainage", basis: "info", amount: 0,
        detail: "Drainage not yet checked. If rainwater from roofs and yards goes to a soakaway or watercourse, this charge may be recoverable." });
    }
  }

  /* ---- 6. Trade effluent (Mogden) ----
     Charge per m³ = R + V + (Ot/Os)·B + (St/Ss)·S
     R reception and conveyance, V primary treatment, B biological treatment, S sludge;
     Ot/St the effluent's COD and suspended solids, Os/Ss the standard strengths. */
  const teV = num(b.te_volume_m3), teC = num(b.te_charged);
  const [R, V, Bt, S, Ot, St, Os, Ss] = ["te_r", "te_v", "te_b", "te_s", "te_ot", "te_st", "te_os", "te_ss"].map((k) => num(b[k]));
  let teExpected = null;
  if (teV != null && teC != null && [R, V, Bt, S, Ot, St, Os, Ss].every((x) => x != null) && Os > 0 && Ss > 0) {
    const perM3 = R + V + (Ot / Os) * Bt + (St / Ss) * S;
    teExpected = round2(teV * perM3);
    const amount = round2(teC - teExpected);
    if (amount > MIN) findings.push({ check: "Trade effluent", basis: "confirmed", amount,
      detail: `Mogden gives £${fmt(teExpected)} (£${perM3.toFixed(4)}/m³ on ${fmt(teV)} m³) against £${fmt(teC)} charged.` });
  }

  /* ---- 7. VAT ----
     Whether business water attracts VAT depends on the customer's activity, so the
     expected rate is supplied rather than assumed. */
  const net = num(b.net_total), vat = num(b.vat_charged), vr = num(b.vat_rate_expected);
  if (net != null && vat != null && vr != null) {
    const expectedVat = round2((net * vr) / 100);
    const amount = round2(vat - expectedVat);
    if (amount > MIN) findings.push({ check: "VAT", basis: "confirmed", amount,
      detail: `£${fmt(vat)} VAT charged; ${vr}% of £${fmt(net)} is £${fmt(expectedVat)}.` });
  }

  const confirmed = round2(findings.filter((f) => f.basis === "confirmed").reduce((a, f) => a + f.amount, 0));
  const potential = round2(findings.filter((f) => f.basis === "evidence required").reduce((a, f) => a + f.amount, 0));
  const perYear = 365 / days;
  const years = num(b.backdate_years);
  return {
    days, billed_m3: billed, corrected_m3: round2(actual), findings,
    confirmed_claim: confirmed, potential_claim: potential,
    annualised: { confirmed: round2(confirmed * perYear), potential: round2(potential * perYear) },
    // A backdated figure is an ESTIMATE: it assumes the error ran at the same level for the
    // whole period. Whether a retailer or wholesaler will refund that far back is theirs to decide.
    backdated_estimate: years ? {
      years, confirmed: round2(confirmed * perYear * years), potential: round2(potential * perYear * years),
    } : null,
    trade_effluent_expected: teExpected,
    status: findings.some((f) => f.amount > 0) ? "Claim" : "Pass",
  };
}

const COLS = ["business_id", "business_name", "retailer", "wholesaler", "spid", "period", "days", "bill_read_type",
  "read_start", "read_end", "billed_m3", "water_rate_billed", "water_rate_expected",
  "water_standing_billed", "water_standing_expected", "sewer_rate_billed", "sewer_rate_expected",
  "sewer_standing_billed", "sewer_standing_expected", "rts_billed_pct", "rts_actual_pct", "rts_evidence",
  "swd_charged", "swd_drainage", "swd_connected_pct", "swd_correct_charge",
  "te_volume_m3", "te_ot", "te_st", "te_os", "te_ss", "te_r", "te_v", "te_b", "te_s", "te_charged",
  "net_total", "vat_charged", "vat_rate_expected", "backdate_years", "notes"];
const TEXT = new Set(["business_name", "retailer", "wholesaler", "spid", "period", "bill_read_type", "rts_evidence", "swd_drainage", "notes"]);
const clean = (b) => Object.fromEntries(COLS.map((c) => [c, TEXT.has(c) ? (b[c] || null) : (c === "business_id" ? (num(b[c])) : num(b[c]))]));
const parse = (row) => row && { ...row, findings: row.findings ? JSON.parse(row.findings) : [] };

function nextRef() {
  const n = db.prepare("SELECT COUNT(*) c FROM water_validations").get().c + 1;
  return `WV-${String(n).padStart(3, "0")}`;
}

r.get("/", (req, res) => {
  const where = [], params = [];
  if (req.query.status) { where.push("status = ?"); params.push(req.query.status); }
  if (req.query.business_id) { where.push("business_id = ?"); params.push(req.query.business_id); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({ data: db.prepare(`SELECT * FROM water_validations ${w} ORDER BY created_at DESC`).all(...params).map(parse) });
});

r.get("/summary", (_req, res) => {
  const s = db.prepare(`SELECT COUNT(*) n,
      COALESCE(SUM(confirmed_claim),0) confirmed, COALESCE(SUM(potential_claim),0) potential,
      COALESCE(SUM(agreed_amount),0) agreed, COALESCE(SUM(refunded_amount),0) refunded
    FROM water_validations WHERE status != 'Rejected'`).get();
  res.json({ data: { validations: s.n, confirmed: round2(s.confirmed), potential: round2(s.potential),
    agreed: round2(s.agreed), refunded: round2(s.refunded) } });
});

r.get("/:id", (req, res) => {
  const row = parse(db.prepare("SELECT * FROM water_validations WHERE id=?").get(req.params.id));
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({ data: { ...row, result: validateWater(row) } });
});

/** Live check without saving. */
r.post("/preview", (req, res) => res.json({ data: validateWater(req.body || {}) }));

r.post("/", (req, res) => {
  const b = req.body || {};
  if (!b.business_name && !b.business_id) return res.status(400).json({ error: "A business is required" });
  const v = validateWater(b);
  const row = clean(b);
  if (!row.business_name && row.business_id) {
    row.business_name = db.prepare("SELECT business_name FROM businesses WHERE id=?").get(row.business_id)?.business_name || null;
  }
  const cols = [...COLS, "ref", "findings", "confirmed_claim", "potential_claim"];
  const vals = [...COLS.map((c) => row[c]), nextRef(), JSON.stringify(v.findings), v.confirmed_claim, v.potential_claim];
  const info = db.prepare(`INSERT INTO water_validations (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals);
  const saved = parse(db.prepare("SELECT * FROM water_validations WHERE id=?").get(info.lastInsertRowid));
  res.status(201).json({ data: { ...saved, result: v } });
});

/** Re-check after new evidence (e.g. a drainage survey), recalculating the findings. */
r.put("/:id", (req, res) => {
  const cur = db.prepare("SELECT * FROM water_validations WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  const merged = { ...cur, ...req.body };
  const v = validateWater(merged);
  const row = clean(merged);
  db.prepare(`UPDATE water_validations SET ${COLS.map((c) => `${c}=?`).join(",")}, findings=?, confirmed_claim=?, potential_claim=? WHERE id=?`)
    .run(...COLS.map((c) => row[c]), JSON.stringify(v.findings), v.confirmed_claim, v.potential_claim, req.params.id);
  res.json({ data: { ...parse(db.prepare("SELECT * FROM water_validations WHERE id=?").get(req.params.id)), result: v } });
});

/** Move a claim through its lifecycle: submitted to the retailer, agreed, then refunded. */
r.patch("/:id/status", (req, res) => {
  const cur = db.prepare("SELECT * FROM water_validations WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "not found" });
  const { status, agreed_amount, refunded_amount } = req.body || {};
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}` });
  const agreed = agreed_amount !== undefined ? num(agreed_amount) : cur.agreed_amount;
  const refunded = refunded_amount !== undefined ? num(refunded_amount) : cur.refunded_amount;
  if (agreed != null && refunded != null && refunded > agreed + 0.005) {
    return res.status(400).json({ error: "The refund received cannot exceed the amount agreed." });
  }
  const submitted = status === "Submitted" && !cur.submitted_on ? new Date().toISOString().slice(0, 10) : cur.submitted_on;
  db.prepare("UPDATE water_validations SET status=?, agreed_amount=?, refunded_amount=?, submitted_on=? WHERE id=?")
    .run(status || cur.status, agreed, refunded, submitted, req.params.id);
  res.json({ data: parse(db.prepare("SELECT * FROM water_validations WHERE id=?").get(req.params.id)) });
});

r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM water_validations WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

export default r;
