import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* Core validation: compare a supplier bill against the contracted rates.
   Recomputes the expected energy cost from contracted rates and flags any
   line-item where the billed value exceeds what was agreed. */
export function validateBill(input, contract) {
  const days = Number(input.days) || 30;
  const consumption = Number(input.billed_consumption) || 0;
  const bUnit = Number(input.billed_unit_rate) || 0;         // p/kWh billed
  const bStand = Number(input.billed_standing_charge) || 0;  // p/day billed
  const cUnit = contract ? Number(contract.day_rate) || 0 : Number(input.contracted_unit_rate) || 0;
  const cStand = contract ? Number(contract.standing_charge) || 0 : Number(input.contracted_standing_charge) || 0;

  // energy cost in £ = consumption(kWh) * rate(p)/100 + days * standing(p)/100
  const expectedEnergy = round(consumption * cUnit / 100 + days * cStand / 100);
  const billedEnergy = input.billed_amount != null && input.billed_amount !== ""
    ? round(input.billed_amount)
    : round(consumption * bUnit / 100 + days * bStand / 100);
  const variance = round(billedEnergy - expectedEnergy); // positive = overcharge

  const TOL = 0.5; // £ tolerance
  const findings = [
    { category: "Rate", item: "Unit Rate (p/kWh)", contracted: cUnit, billed: bUnit, delta: round(bUnit - cUnit), ok: bUnit <= cUnit + 0.01 },
    { category: "Rate", item: "Standing Charge (p/day)", contracted: cStand, billed: bStand, delta: round(bStand - cStand), ok: bStand <= cStand + 0.01 },
    { category: "Rate", item: "Energy Cost (£)", contracted: expectedEnergy, billed: billedEnergy, delta: variance, ok: variance <= TOL },
  ];

  // --- CCL (Climate Change Levy) exemption / reduction / rebate ---
  const cclRate = input.ccl_rate != null && input.ccl_rate !== "" ? Number(input.ccl_rate) : 0.775; // p/kWh (main rate, configurable)
  const cclCharged = round(input.ccl_charged);
  const cclExempt = !!input.ccl_exempt;
  const cclReliefPct = cclExempt ? 100 : (Number(input.ccl_relief_pct) || 0);
  const expectedCcl = round(consumption * cclRate / 100 * (1 - cclReliefPct / 100));
  const cclRebate = round(Math.max(0, cclCharged - expectedCcl));
  const cclApplies = cclCharged > 0 || cclReliefPct > 0 || cclExempt;
  const ccl = { rate: cclRate, exempt: cclExempt, reliefPct: cclReliefPct, charged: cclCharged, expected: expectedCcl, rebate: cclRebate, applies: cclApplies };
  if (cclApplies) findings.push({ category: "CCL", item: cclExempt ? "CCL (exempt)" : `CCL (${cclReliefPct}% relief)`, contracted: expectedCcl, billed: cclCharged, delta: cclRebate, ok: cclRebate <= TOL });

  // --- Energy-Intensive Industry (EII) relief on policy costs ---
  const eiiEligible = !!input.eii_eligible;
  const eiiPolicyCost = round(input.eii_policy_cost);
  const eiiReliefPct = input.eii_relief_pct != null && input.eii_relief_pct !== "" ? Number(input.eii_relief_pct) : 85;
  const eiiRelief = eiiEligible ? round(eiiPolicyCost * eiiReliefPct / 100) : 0;
  const eii = { eligible: eiiEligible, policyCost: eiiPolicyCost, reliefPct: eiiReliefPct, relief: eiiRelief };
  if (eiiEligible) findings.push({ category: "EII", item: `EII relief (${eiiReliefPct}% of policy cost)`, contracted: 0, billed: eiiPolicyCost, delta: eiiRelief, ok: eiiRelief <= TOL });

  // --- Volume tolerance ---
  const eac = Number(input.eac) || (contract ? Number(contract.consumption) || 0 : 0);
  const tolPct = input.tolerance_pct != null && input.tolerance_pct !== "" ? Number(input.tolerance_pct) : 20;
  const annualised = days ? round(consumption / days * 365) : 0;
  const lower = round(eac * (1 - tolPct / 100));
  const upper = round(eac * (1 + tolPct / 100));
  const withinTolerance = eac ? (annualised >= lower && annualised <= upper) : true;
  const volumeStatus = !eac ? "N/A" : withinTolerance ? "Within tolerance" : annualised > upper ? "Over tolerance" : "Under tolerance";
  const volume = { eac, tolerancePct: tolPct, annualised, lower, upper, withinTolerance, status: volumeStatus };
  if (eac) findings.push({ category: "Volume", item: `Annualised volume vs ±${tolPct}% band`, contracted: `${lower}–${upper}`, billed: annualised, delta: withinTolerance ? 0 : (annualised > upper ? round(annualised - upper) : round(annualised - lower)), ok: withinTolerance });

  const totalClaim = round(Math.max(0, variance) + cclRebate + eiiRelief);
  const hasIssue = variance > TOL || cclRebate > TOL || eiiRelief > TOL || !withinTolerance;
  const status = hasIssue ? "Discrepancy" : "Pass";

  return {
    days, contracted_unit_rate: cUnit, contracted_standing_charge: cStand,
    expected_amount: expectedEnergy, billed_amount: billedEnergy, variance,
    ccl, eii, volume, total_claim: totalClaim, status, findings,
  };
}

const withParsed = (row) => (row ? { ...row, findings: row.findings ? JSON.parse(row.findings) : [] } : row);

// LIST
r.get("/", (req, res) => {
  const q = (req.query.q || "").trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 10);
  const where = q ? `WHERE business_name LIKE @q OR ref LIKE @q OR supplier_name LIKE @q` : "";
  const params = q ? { q: `%${q}%` } : {};
  const total = one(`SELECT COUNT(*) c FROM bill_validations ${where}`, params).c;
  const data = all(`SELECT * FROM bill_validations ${where} ORDER BY id DESC LIMIT @limit OFFSET @off`,
    { ...params, limit, off: (page - 1) * limit });
  res.json({ data: data.map(withParsed), meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

// DETAIL
r.get("/:id", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  res.json({ data: withParsed(row) });
});

// PREVIEW (validate without saving) — used by the form's "Validate" button
r.post("/preview", (req, res) => {
  const contract = req.body.contract_id ? one("SELECT * FROM contracts WHERE id=?", req.body.contract_id) : null;
  res.json({ data: validateBill(req.body, contract) });
});

// CREATE (validate + save)
r.post("/", (req, res) => {
  const b = req.body;
  const contract = b.contract_id ? one("SELECT * FROM contracts WHERE id=?", b.contract_id) : null;
  const v = validateBill(b, contract);
  const ref = "BV-" + Date.now().toString().slice(-6);
  const supplier = b.supplier_id ? one("SELECT name FROM suppliers WHERE id=?", b.supplier_id) : null;
  const info = db.prepare(`INSERT INTO bill_validations
    (ref, contract_id, business_id, business_name, supplier_id, supplier_name, utility, meter_mpan_mpr,
     period, days, billed_consumption, billed_standing_charge, billed_unit_rate, billed_amount, vat_rate,
     contracted_standing_charge, contracted_unit_rate, expected_amount, variance, status, claim_amount, findings, notes,
     ccl_charged, ccl_rate, ccl_relief_pct, ccl_exempt, ccl_rebate,
     eii_eligible, eii_policy_cost, eii_relief_pct, eii_relief, eac, tolerance_pct, volume_status, total_claim)
    VALUES (@ref,@contract_id,@business_id,@business_name,@supplier_id,@supplier_name,@utility,@meter,
     @period,@days,@consumption,@bStand,@bUnit,@billed,@vat,@cStand,@cUnit,@expected,@variance,@status,0,@findings,@notes,
     @cclCharged,@cclRate,@cclReliefPct,@cclExempt,@cclRebate,
     @eiiEligible,@eiiPolicyCost,@eiiReliefPct,@eiiRelief,@eac,@tolPct,@volStatus,@totalClaim)`)
    .run({
      ref, contract_id: b.contract_id || null, business_id: b.business_id || (contract ? contract.business_id : null),
      business_name: b.business_name || (contract ? contract.business_name : null),
      supplier_id: b.supplier_id || (contract ? contract.supplier_id : null),
      supplier_name: (supplier && supplier.name) || b.supplier_name || null,
      utility: b.utility || (contract ? contract.utility : null),
      meter: b.meter_mpan_mpr || (contract ? contract.meter_mpan_mpr : null),
      period: b.period || null, days: v.days,
      consumption: Number(b.billed_consumption) || 0, bStand: Number(b.billed_standing_charge) || 0,
      bUnit: Number(b.billed_unit_rate) || 0, billed: v.billed_amount, vat: b.vat_rate != null ? Number(b.vat_rate) : 20,
      cStand: v.contracted_standing_charge, cUnit: v.contracted_unit_rate, expected: v.expected_amount,
      variance: v.variance, status: v.status, findings: JSON.stringify(v.findings), notes: b.notes || null,
      cclCharged: v.ccl.charged, cclRate: v.ccl.rate, cclReliefPct: v.ccl.reliefPct, cclExempt: v.ccl.exempt ? 1 : 0, cclRebate: v.ccl.rebate,
      eiiEligible: v.eii.eligible ? 1 : 0, eiiPolicyCost: v.eii.policyCost, eiiReliefPct: v.eii.reliefPct, eiiRelief: v.eii.relief,
      eac: v.volume.eac, tolPct: v.volume.tolerancePct, volStatus: v.volume.status, totalClaim: v.total_claim,
    });
  res.status(201).json({ data: withParsed(one("SELECT * FROM bill_validations WHERE id=?", info.lastInsertRowid)) });
});

// RAISE CLAIM (mark overcharge as a claim)
r.post("/:id/raise-claim", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  const claim = Math.max(0, Number(row.total_claim) || Number(row.variance) || 0);
  db.prepare("UPDATE bill_validations SET status='Claim Raised', claim_amount=? WHERE id=?").run(claim, row.id);
  res.json({ data: withParsed(one("SELECT * FROM bill_validations WHERE id=?", row.id)) });
});

// DELETE
r.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM bill_validations WHERE id=?").run(req.params.id);
  res.json({ data: { deleted: true } });
});

export default r;
