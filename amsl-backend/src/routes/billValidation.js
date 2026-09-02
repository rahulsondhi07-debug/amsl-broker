import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const withParsed = (row) => {
  if (row && row.findings) { try { row.findings = JSON.parse(row.findings); } catch { /* leave as-is */ } }
  return row;
};
const nextRef = () => {
  const n = one("SELECT COUNT(*) c FROM bill_validations").c + 1;
  return `BV-${String(n).padStart(3, "0")}`;
};

/**
 * Core engine — full energy bill validation:
 *   1. Rate verification (tariff/standing charge vs contract)
 *   2. Meter reading cross-check (billed consumption vs actual meter reading)
 *   3. VAT rate verification (billed VAT % vs expected)
 *   4. Pass-through verification — Transmission (TNUoS) & Distribution (DUoS)
 *      fixed charges: rate correct, duration matches billing period,
 *      calculation aligns with the published rate
 *   5. Error detection — duplicate billing, invalid meter data (MPAN/MPRN format)
 *   6. CCL exemption/rebate, EII relief, Volume tolerance (as before)
 * All recoverable amounts aggregate into a single total_claim.
 */
function validateBill(b, contract, opts = {}) {
  const days = Math.max(1, Number(b.days) || 30);
  const consumption = Number(b.billed_consumption) || 0;

  const cUnit = contract ? Number(contract.day_rate ?? contract.unit_rate) || 0 : Number(b.contracted_unit_rate) || 0;
  const cStand = contract ? Number(contract.standing_charge) || 0 : Number(b.contracted_standing_charge) || 0;
  const bUnit = Number(b.billed_unit_rate) || 0;
  const bStand = Number(b.billed_standing_charge) || 0;

  const expectedEnergy = (consumption * cUnit) / 100 + (days * cStand) / 100;
  const billedEnergy = (consumption * bUnit) / 100 + (days * bStand) / 100;
  const variance = Math.round((billedEnergy - expectedEnergy) * 100) / 100;

  const findings = [];
  if (Math.abs(variance) > 0.5) {
    findings.push({
      check: "Rate", field: "unit_rate/standing_charge",
      detail: `Billed ${bUnit}p/kWh + ${bStand}p/day vs contracted ${cUnit}p/kWh + ${cStand}p/day over ${days} days`,
      amount: variance,
    });
  }

  /* ---- Meter reading cross-check ---- */
  const meterStart = b.meter_reading_start !== "" && b.meter_reading_start != null ? Number(b.meter_reading_start) : null;
  const meterEnd = b.meter_reading_end !== "" && b.meter_reading_end != null ? Number(b.meter_reading_end) : null;
  let meterReadConsumption = null, meterReadOvercharge = 0;
  if (meterStart != null && meterEnd != null) {
    meterReadConsumption = Math.max(0, meterEnd - meterStart);
    const consumptionDiff = consumption - meterReadConsumption;
    if (Math.abs(consumptionDiff) > Math.max(10, meterReadConsumption * 0.01)) {
      meterReadOvercharge = Math.max(0, Math.round(((consumptionDiff * bUnit) / 100) * 100) / 100);
      findings.push({
        check: "Meter", field: "meter_reading",
        detail: `Billed ${consumption.toLocaleString()} kWh vs actual meter reading ${meterReadConsumption.toLocaleString()} kWh (${meterStart.toLocaleString()} → ${meterEnd.toLocaleString()})`,
        amount: meterReadOvercharge,
      });
    }
  }

  /* ---- VAT rate verification ---- */
  const vatBilled = b.vat_rate != null && b.vat_rate !== "" ? Number(b.vat_rate) : 20;
  const vatExpected = b.vat_rate_expected != null && b.vat_rate_expected !== "" ? Number(b.vat_rate_expected) : 20;
  let vatOvercharge = 0;
  if (vatBilled > vatExpected) {
    vatOvercharge = Math.round((billedEnergy * (vatBilled - vatExpected)) / 100 * 100) / 100;
    findings.push({
      check: "VAT", field: "vat_rate",
      detail: `Billed at ${vatBilled}% VAT, expected ${vatExpected}% for this business/site`,
      amount: vatOvercharge,
    });
  }

  /* ---- Pass-through verification: TNUoS & DUoS fixed charges ---- */
  const tnuosCharged = Number(b.tnuos_charged) || 0;
  const tnuosRate = Number(b.tnuos_rate) || 0; // p/day, published rate
  const tnuosExpected = Math.round(((tnuosRate * days) / 100) * 100) / 100;
  const tnuosOvercharge = tnuosCharged > 0 ? Math.max(0, Math.round((tnuosCharged - tnuosExpected) * 100) / 100) : 0;
  if (tnuosOvercharge > 0.5) {
    findings.push({
      check: "TNUoS", field: "transmission_charge",
      detail: `Transmission (TNUoS) fixed charge: expected £${tnuosExpected.toFixed(2)} (${tnuosRate}p/day × ${days} days) vs charged £${tnuosCharged.toFixed(2)}`,
      amount: tnuosOvercharge,
    });
  }

  const duosCharged = Number(b.duos_charged) || 0;
  const duosRate = Number(b.duos_rate) || 0; // p/day, published rate
  const duosExpected = Math.round(((duosRate * days) / 100) * 100) / 100;
  const duosOvercharge = duosCharged > 0 ? Math.max(0, Math.round((duosCharged - duosExpected) * 100) / 100) : 0;
  if (duosOvercharge > 0.5) {
    findings.push({
      check: "DUoS", field: "distribution_charge",
      detail: `Distribution (DUoS) fixed charge: expected £${duosExpected.toFixed(2)} (${duosRate}p/day × ${days} days) vs charged £${duosCharged.toFixed(2)}`,
      amount: duosOvercharge,
    });
  }

  /* ---- CCL exemption & rebate ---- */
  const cclCharged = Number(b.ccl_charged) || 0;
  const cclRate = b.ccl_rate != null ? Number(b.ccl_rate) : 0.775; // p/kWh, default main CCL rate
  const cclExempt = !!b.ccl_exempt;
  const cclReliefPct = cclExempt ? 100 : (Number(b.ccl_relief_pct) || 0);
  const cclExpected = Math.round(((consumption * cclRate) / 100) * (1 - cclReliefPct / 100) * 100) / 100;
  const cclRebate = Math.max(0, Math.round((cclCharged - cclExpected) * 100) / 100);
  if (cclRebate > 0) {
    findings.push({
      check: "CCL", field: "ccl_relief",
      detail: cclExempt ? "Fully exempt but CCL was charged on the bill" : `${cclReliefPct}% relief applied — expected £${cclExpected.toFixed(2)}, charged £${cclCharged.toFixed(2)}`,
      amount: cclRebate,
    });
  }

  /* ---- Energy-Intensive Industry relief ---- */
  const eiiEligible = !!b.eii_eligible;
  const eiiPolicyCost = Number(b.eii_policy_cost) || 0;
  const eiiReliefPct = b.eii_relief_pct != null ? Number(b.eii_relief_pct) : 85;
  const eiiRelief = eiiEligible ? Math.round(((eiiPolicyCost * eiiReliefPct) / 100) * 100) / 100 : 0;
  if (eiiRelief > 0) {
    findings.push({
      check: "EII", field: "eii_relief",
      detail: `${eiiReliefPct}% EII relief on £${eiiPolicyCost.toFixed(2)} policy-cost portion`,
      amount: eiiRelief,
    });
  }

  /* ---- Network Charging Compensation (NCC) — 60% of TNUoS+DUoS+BSUoS network
     charges, in proportion to the EII certificate's exemption %, per DBT's
     worked example (guidance para 102): compensation = 0.6 x relief% x network cost. */
  const bsuosCharged = Number(b.bsuos_charged) || 0;
  const nccNetworkCosts = Math.round((tnuosCharged + duosCharged + bsuosCharged) * 100) / 100;
  const nccCompensation = eiiEligible && nccNetworkCosts > 0
    ? Math.round(0.6 * (eiiReliefPct / 100) * nccNetworkCosts * 100) / 100
    : 0;
  if (nccCompensation > 0) {
    findings.push({
      check: "NCC", field: "network_charging_compensation",
      detail: `60% compensation on ${eiiReliefPct}%-eligible network charges (TNUoS+DUoS+BSUoS = £${nccNetworkCosts.toFixed(2)})`,
      amount: nccCompensation,
    });
  }

  /* ---- Volume tolerance ---- */
  const eac = Number(b.eac) || (contract ? Number(contract.consumption) || 0 : 0);
  const tolerancePct = Number(b.tolerance_pct) || (contract && contract.tolerance_pct != null ? Number(contract.tolerance_pct) : 0) || 20;
  const annualised = Math.round((consumption / days) * 365);
  let volumeStatus = "Within";
  if (eac > 0) {
    const lo = eac * (1 - tolerancePct / 100);
    const hi = eac * (1 + tolerancePct / 100);
    volumeStatus = annualised > hi ? "Over" : annualised < lo ? "Under" : "Within";
    if (volumeStatus !== "Within") {
      findings.push({
        check: "Volume", field: "eac_tolerance",
        detail: `Annualised ${annualised.toLocaleString()} kWh vs EAC ${eac.toLocaleString()} ± ${tolerancePct}%`,
        amount: 0,
      });
    }
  }

  /* ---- Error detection: duplicate billing ---- */
  let duplicateFlag = false;
  if (b.meter_mpan_mpr && b.period) {
    const dupSql = `SELECT id, ref FROM bill_validations WHERE meter_mpan_mpr=? AND period=?${opts.excludeId ? " AND id != ?" : ""}`;
    const dupParams = opts.excludeId ? [b.meter_mpan_mpr, b.period, opts.excludeId] : [b.meter_mpan_mpr, b.period];
    const dup = db.prepare(dupSql).get(...dupParams);
    if (dup) {
      duplicateFlag = true;
      findings.push({
        check: "Duplicate", field: "duplicate_billing",
        detail: `Another validation (${dup.ref}) already exists for this meter and billing period — possible duplicate billing`,
        amount: 0,
      });
    }
  }

  /* ---- Error detection: meter data format (MPAN=13 digits, MPRN=6-10 digits) ---- */
  let meterDataFlag = false;
  if (b.meter_mpan_mpr) {
    const digits = String(b.meter_mpan_mpr).replace(/\D/g, "");
    const isElectricity = /electric/i.test(b.utility || (contract ? contract.utility : "") || "");
    const valid = isElectricity ? digits.length === 13 : digits.length >= 6 && digits.length <= 10;
    if (!valid) {
      meterDataFlag = true;
      findings.push({
        check: "Meter Data", field: "meter_mpan_mpr",
        detail: `${b.meter_mpan_mpr} does not match the expected ${isElectricity ? "13-digit MPAN" : "MPRN"} format — verify meter data`,
        amount: 0,
      });
    }
  }

  const totalClaim = Math.round((
    Math.max(0, variance) + meterReadOvercharge + vatOvercharge + tnuosOvercharge + duosOvercharge + cclRebate + eiiRelief + nccCompensation
  ) * 100) / 100;
  const status = findings.length ? "Discrepancy" : "Pass";

  return {
    days, contracted_unit_rate: cUnit, contracted_standing_charge: cStand,
    expected_amount: Math.round(expectedEnergy * 100) / 100, billed_amount: Math.round(billedEnergy * 100) / 100,
    variance, status, findings,
    meter_reading: { start: meterStart, end: meterEnd, consumption: meterReadConsumption, overcharge: meterReadOvercharge },
    vat: { billed: vatBilled, expected: vatExpected, overcharge: vatOvercharge },
    tnuos: { charged: tnuosCharged, rate: tnuosRate, expected: tnuosExpected, overcharge: tnuosOvercharge },
    duos: { charged: duosCharged, rate: duosRate, expected: duosExpected, overcharge: duosOvercharge },
    ccl: { charged: cclCharged, rate: cclRate, reliefPct: cclReliefPct, exempt: cclExempt, expected: cclExpected, rebate: cclRebate },
    eii: { eligible: eiiEligible, policyCost: eiiPolicyCost, reliefPct: eiiReliefPct, relief: eiiRelief },
    ncc: { bsuosCharged, networkCosts: nccNetworkCosts, compensation: nccCompensation },
    volume: { eac, tolerancePct, annualised, status: volumeStatus },
    duplicate_flag: duplicateFlag, meter_data_flag: meterDataFlag,
    total_claim: totalClaim,
  };
}

/* LIST */
r.get("/", (req, res) => {
  const rows = all(`
    SELECT bv.*, c.contract_no
    FROM bill_validations bv LEFT JOIN contracts c ON c.id = bv.contract_id
    ORDER BY bv.id DESC`);
  const totals = one(`SELECT COALESCE(SUM(total_claim),0) total_claimable,
                              COALESCE(SUM(CASE WHEN status='Claim Raised' THEN claim_amount ELSE 0 END),0) raised,
                              COUNT(*) n,
                              SUM(CASE WHEN status='Discrepancy' THEN 1 ELSE 0 END) discrepancies
                       FROM bill_validations`);
  res.json({ data: { rows: rows.map(withParsed), totals } });
});

/**
 * OOOM Energy — Reference Guide: qualifying activities for EII, CCL, or both.
 * Tax origin: EU-mandated minimum energy taxation (2003 Directive).
 * Scheme origin: reduce competitive pressure on energy-intensive industry sectors.
 */
const QUALIFYING_ACTIVITIES = [
  { activity: "Stone", scheme: "EII" }, { activity: "Rubber", scheme: "EII" },
  { activity: "Chemicals", scheme: "EII" }, { activity: "Poultry processing", scheme: "EII" },
  { activity: "Grain Milling", scheme: "EII" }, { activity: "Malt", scheme: "EII" },
  { activity: "Textiles", scheme: "EII" }, { activity: "Plastics", scheme: "EII" },
  { activity: "Farm animal feed", scheme: "EII" }, { activity: "Batteries", scheme: "EII" },
  { activity: "Paper", scheme: "EII" }, { activity: "Fertiliser", scheme: "EII" },
  { activity: "Wood", scheme: "EII" }, { activity: "Coal", scheme: "EII" },
  { activity: "Cement", scheme: "BOTH" }, { activity: "Tubes and Pipes", scheme: "BOTH" },
  { activity: "Ceramics", scheme: "BOTH" }, { activity: "Refractory", scheme: "BOTH" },
  { activity: "Metal Production", scheme: "BOTH" }, { activity: "Plaster", scheme: "BOTH" },
  { activity: "Metal Casting", scheme: "BOTH" }, { activity: "Glass", scheme: "BOTH" },
  { activity: "Cold Drawing/Rolling", scheme: "BOTH" }, { activity: "Iron & Steels", scheme: "BOTH" },
  { activity: "Precious Metal", scheme: "CCL" }, { activity: "Metal Coating", scheme: "CCL" },
  { activity: "Nuclear Fuel", scheme: "CCL" }, { activity: "Concrete", scheme: "CCL" },
  { activity: "Forging", scheme: "CCL" }, { activity: "Transport", scheme: "CCL" },
];

const SCHEME_INFO = {
  EII: {
    label: "Energy-Intensive Industries (EII)",
    whatIsIncluded: "Electricity only",
    eligibilityTest: "Yes",
    savings: "20-25% on electricity",
    retrospective: "No — only forwards",
    energyType: "Any electricity used by the business, including self-generation and landlord supplies",
    howApplied: "Proportionally to the eligible products or activities",
    administeredBy: "Department for BEIS",
  },
  CCL: {
    label: "Climate Change Levy (CCL)",
    whatIsIncluded: "Electricity, Gas, Propane (LPG)",
    eligibilityTest: "No",
    savings: "5-7% on all fuels",
    retrospective: "Yes — 4 year rebate",
    energyType: "Only direct supplies — no landlords unless listed",
    howApplied: "Proportionally to the eligible products or activities",
    administeredBy: "HMRC",
  },
};

/* Qualifying-activities reference guide (OOOM Energy) — must come before /:id so it isn't shadowed */
r.get("/qualifying-activities", (_req, res) => {
  res.json({ data: { activities: QUALIFYING_ACTIVITIES, schemes: SCHEME_INFO } });
});

/**
 * SIC/NACE code eligibility lookup for CCL and EII.
 * Codes marked verified are drawn directly from DBT's published EII Annex 1
 * eligible-sector list (4-digit NACE) and cross-checked against the real
 * EVTEC Aluminium example (24.53 Casting of light metals -> EII, matching
 * their actual "2453: casting of light metals" eligible product).
 * This is a reference aid, not a legal determination — always confirm
 * against the official Annex 1 list linked in GOV_LINKS before submitting
 * a claim.
 */
/**
 * EII eligible activities — Annex 1 of DBT's "Energy Intensive Industries
 * (EIIs): Guidance for applicants" (April 2025 revised), transcribed
 * directly from the uploaded document. This is the "sector level test":
 * a business must manufacture a product within one of these 4-digit NACE
 * codes to be eligible for an EII certificate (CFD/RO/FIT/CM exemption).
 * Passing the sector test alone is not sufficient — the business must
 * also pass the "business level test" (>=20% electricity intensity, see
 * eiiBusinessLevelTest below).
 *
 * IMPORTANT: this list is EII-specific. Climate Change Levy (CCL) relief
 * uses a different mechanism entirely — either a Climate Change Agreement
 * (CCA) held via a sector trade association, or one of the CCL exemption
 * categories (charity/domestic use/de-minimis) — not this NACE list. An
 * activity appearing here says nothing about CCL eligibility, and this
 * tool does not infer one from the other.
 */
const EII_ELIGIBLE_ACTIVITIES = [
  { sic: "05.10", description: "Mining of hard coal" },
  { sic: "08.11", description: "Quarrying of ornamental and building stone, limestone, gypsum, chalk and slate" },
  { sic: "08.12", description: "Operation of gravel and sand pits; mining of clays and kaolin" },
  { sic: "08.99", description: "Other mining and quarrying not elsewhere classified" },
  { sic: "10.12", description: "Processing and preserving of poultry meat" },
  { sic: "10.61", description: "Manufacture of grain mill products" },
  { sic: "10.91", description: "Manufacture of prepared feeds for farm animals" },
  { sic: "11.06", description: "Manufacture of malt" },
  { sic: "13.10", description: "Preparation and spinning of textile fibres" },
  { sic: "13.20", description: "Weaving of textiles" },
  { sic: "13.91", description: "Manufacture of knitted and crocheted fabrics" },
  { sic: "13.93", description: "Manufacture of carpets and rugs" },
  { sic: "13.95", description: "Manufacture of non-wovens and articles made from non-wovens, except apparel" },
  { sic: "13.96", description: "Manufacture of other technical and industrial textiles" },
  { sic: "13.99", description: "Manufacture of other textiles not elsewhere classified" },
  { sic: "14.19", description: "Manufacture of other wearing apparel and accessories" },
  { sic: "14.31", description: "Manufacture of knitted and crocheted hosiery" },
  { sic: "14.39", description: "Manufacture of other knitted and crocheted apparel" },
  { sic: "15.11", description: "Tanning and dressing of leather; dressing and dyeing of fur" },
  { sic: "16.10", description: "Sawmilling and planing of wood" },
  { sic: "16.21", description: "Manufacture of veneer sheets and wood-based panels" },
  { sic: "16.29", description: "Manufacture of other products of wood; articles of cork, straw and plaiting materials" },
  { sic: "17.12", description: "Manufacture of paper and paperboard" },
  { sic: "17.21", description: "Manufacture of corrugated paper/paperboard and containers of paper/paperboard" },
  { sic: "17.22", description: "Manufacture of household and sanitary goods and of toilet requisites" },
  { sic: "17.24", description: "Manufacture of wallpaper" },
  { sic: "19.20", description: "Manufacture of refined petroleum products" },
  { sic: "20.11", description: "Manufacture of industrial gases" },
  { sic: "20.13", description: "Manufacture of other inorganic basic chemicals" },
  { sic: "20.14", description: "Manufacture of other organic basic chemicals" },
  { sic: "20.15", description: "Manufacture of fertilisers and nitrogen compounds" },
  { sic: "20.16", description: "Manufacture of plastics in primary forms" },
  { sic: "20.17", description: "Manufacture of synthetic rubber in primary forms" },
  { sic: "20.60", description: "Manufacture of man-made fibres" },
  { sic: "22.11", description: "Manufacture of rubber tyres and tubes; retreading and rebuilding of rubber tyres" },
  { sic: "22.19", description: "Manufacture of other rubber products" },
  { sic: "22.21", description: "Manufacture of plastic plates, sheets, tubes and profiles" },
  { sic: "22.22", description: "Manufacture of plastic packing goods" },
  { sic: "22.29", description: "Manufacture of other plastic products" },
  { sic: "23.11", description: "Manufacture of flat glass" },
  { sic: "23.13", description: "Manufacture of hollow glass" },
  { sic: "23.14", description: "Manufacture of glass fibres" },
  { sic: "23.19", description: "Manufacture and processing of other glass, including technical glassware" },
  { sic: "23.20", description: "Manufacture of refractory products" },
  { sic: "23.31", description: "Manufacture of ceramic tiles and flags" },
  { sic: "23.32", description: "Manufacture of bricks, tiles and construction products, in baked clay" },
  { sic: "23.44", description: "Manufacture of other technical ceramic products" },
  { sic: "23.49", description: "Manufacture of other ceramic products" },
  { sic: "23.51", description: "Manufacture of cement" },
  { sic: "23.52", description: "Manufacture of lime and plaster" },
  { sic: "23.62", description: "Manufacture of plaster products for construction purposes" },
  { sic: "23.65", description: "Manufacture of fibre cement" },
  { sic: "23.99", description: "Manufacture of other non-metallic mineral products not elsewhere classified" },
  { sic: "24.10", description: "Manufacture of basic iron and steel and of ferro-alloys" },
  { sic: "24.20", description: "Manufacture of tubes, pipes, hollow profiles and related fittings of steel" },
  { sic: "24.31", description: "Cold drawing of bars" },
  { sic: "24.32", description: "Cold rolling of narrow strip" },
  { sic: "24.34", description: "Cold drawing of wire" },
  { sic: "24.42", description: "Aluminium production" },
  { sic: "24.43", description: "Lead, zinc and tin production" },
  { sic: "24.44", description: "Copper production" },
  { sic: "24.45", description: "Other non-ferrous metal production" },
  { sic: "24.51", description: "Casting of iron" },
  { sic: "24.52", description: "Casting of steel" },
  { sic: "24.53", description: "Casting of light metals" },
  { sic: "24.54", description: "Casting of other non-ferrous metals" },
  { sic: "25.92", description: "Manufacture of light metal packaging" },
  { sic: "26.11", description: "Manufacture of electronic components" },
  { sic: "27.20", description: "Manufacture of batteries and accumulators" },
  { sic: "27.32", description: "Manufacture of other electronic and electric wires and cables" },
  { sic: "28.91", description: "Manufacture of machinery for metallurgy" },
];

/**
 * The "Business Level Test" — DBT's actual formula (guidance para 26/App.):
 *   Electricity Cost Impact = (BEP x BEC) / BGVA, must be >= 20%.
 *   BEP (Baseline Electricity Price) — currently £190.51/MWh in 2012 prices
 *     (2022 price for the average industrial user, deflated). DBT updates
 *     this periodically — treat this default as indicative and confirm
 *     against the current guidance before relying on it.
 *   BEC — the business's electricity consumption (MWh) over the relevant period.
 *   BGVA — the business's GVA (EBITDA + staff costs, deflated to 2012 prices)
 *     over the same period; any period below £1 is treated as £1.
 */
const DEFAULT_BEP_GBP_PER_MWH = 190.51;
function eiiBusinessLevelTest({ consumption_mwh, gva, bep = DEFAULT_BEP_GBP_PER_MWH }) {
  const consumption = Number(consumption_mwh) || 0;
  const gvaVal = Math.max(1, Number(gva) || 0); // GVA below £1 is floored to £1 per the guidance
  const representativeCost = consumption * bep;
  const intensity = gvaVal > 0 ? (representativeCost / gvaVal) * 100 : 0;
  return {
    bep, consumption_mwh: consumption, gva: gvaVal,
    representative_electricity_cost: Math.round(representativeCost * 100) / 100,
    electricity_intensity_pct: Math.round(intensity * 100) / 100,
    eligible: intensity >= 20,
  };
}

/**
 * Official gov.uk resources — verified live links (checked via search, not
 * guessed) for the forms and guidance the qualifying-activity/SIC checks
 * point to.
 */
const GOV_LINKS = {
  ccl_supplier_certificate_pp11: {
    title: "Climate Change Levy supplier certificate (PP11)",
    url: "https://www.gov.uk/government/publications/climate-change-levy-supplier-certificate-pp11",
    note: "Submit to your energy supplier — not to HMRC. Required before a supplier can apply CCL relief.",
  },
  pp11_online_form: {
    title: "PP11 — complete the interactive online form",
    url: "https://www.tax.service.gov.uk/print-and-post/form/Customs/1.0/PP11/pp11.xdp",
    note: "Fill in on screen, then print, sign, date and send to your supplier.",
  },
  ccl_relief_supporting_analysis_pp10: {
    title: "Climate Change Levy: relief supporting analysis (PP10)",
    url: "https://www.gov.uk/government/publications/climate-change-levy-relief-supporting-analysis-pp10",
    note: "Sent to HMRC to support a CCA-based relief claim (not needed for basic exemptions).",
  },
  pp10_online_form: {
    title: "PP10 — complete the interactive online form",
    url: "https://www.tax.service.gov.uk/print-and-post/form/CCL/1.0/PP10/pp10.xdp",
    note: "Fill in on screen, then print, sign, date and post to HMRC (Excise Processing Teams, BX9 1GL).",
  },
  ccl_rates_guidance: {
    title: "Climate Change Levy rates",
    url: "https://www.gov.uk/guidance/climate-change-levy-rates",
    note: "Current and historic CCL rates by commodity.",
  },
  eii_certificate_guidance: {
    title: "EII certificate — apply for an exemption or compensation (CfD, RO, small-scale FIT)",
    url: "https://www.gov.uk/government/publications/guidance-for-applicants-seeking-a-certificate-for-an-exemption-from-a-proportion-of-the-indirect-costs-of-funding-contracts-for-difference-cfd",
    note: "DBT guidance and application forms for the EII exemption certificate, incl. Annex 1 (eligible activities) and Annex 2 (application checklist).",
  },
};

/**
 * CCA (Climate Change Agreement) relief rates — the max CCL relief a site
 * covered by a CCA can claim, by effective date (source: FDF CCA guidance,
 * April 2024 revision).
 */
const CCA_RELIEF_RATES = [
  { effective_from: "2024-04-01", electricity: 92, gas: 89, lpg: 77, coal: 89 },
  { effective_from: "2013-04-01", effective_to: "2024-03-31", electricity: 92, gas: 88, lpg: 77, coal: 88 },
];

/**
 * School VAT reduced-rate + CCL exemption eligibility — transcribed from a
 * published decision tree (Zenergi guide, reviewed 30/01/25). Not tax
 * advice; the guide itself carries the same disclaimer.
 */
function schoolCclEligibility(a) {
  const steps = [];
  if (!a.is_registered_charity && !a.is_deemed_charity) {
    steps.push("Not a registered charity and not a 'deemed charity' (foundation/voluntary aided/voluntary controlled/academy/free school/etc.)");
    return { eligible: false, partial: false, steps, result: "Not eligible for reduced VAT or CCL exemption." };
  }
  steps.push(a.is_registered_charity ? "Registered charity" : "Deemed charity (e.g. academy, voluntary aided/controlled school)");
  if (!a.education_primary_purpose) {
    steps.push("Education is not its primary purpose");
    return { eligible: false, partial: false, steps, result: "Not eligible for reduced VAT or CCL exemption." };
  }
  steps.push("Education is its primary purpose");
  if (!a.has_business_income) {
    steps.push("No business income");
    return { eligible: true, partial: false, steps, result: "Eligible for reduced-rate VAT and CCL exemption (adjust for any residential use)." };
  }
  const nonBizPct = Number(a.non_business_pct);
  if (!Number.isFinite(nonBizPct)) {
    steps.push("Has business income — non-business activity % needed to determine full vs partial eligibility");
    return { eligible: null, partial: null, steps, result: "Provide the non-business activity percentage to determine eligibility." };
  }
  if (nonBizPct >= 60) {
    steps.push(`Non-business activity ${nonBizPct}% (>=60%)`);
    return { eligible: true, partial: false, steps, result: "Eligible for reduced-rate VAT and CCL exemption (adjust for any residential use)." };
  }
  steps.push(`Non-business activity ${nonBizPct}% (<60%)`);
  if (a.has_residential) {
    steps.push("Has residential properties (boarding students/staff)");
    return { eligible: null, partial: true, steps, result: "May be eligible for a partial reduction on VAT and CCL — adjust for residential use. 100% business income means no partial reduction." };
  }
  return { eligible: null, partial: true, steps, result: "May be eligible for a partial reduction on VAT and CCL. 100% business income means no partial reduction." };
}

/* School VAT/CCL eligibility checker — must come before /:id so it isn't shadowed */
r.post("/school-ccl-eligibility", (req, res) => {
  const result = schoolCclEligibility(req.body || {});
  res.json({ data: { ...result, disclaimer: "This is a guide, not tax advice — confirm with a qualified tax advisor before relying on it (per HMRC VAT Notice 701/30 and 701/19)." } });
});

/* CCA relief rates by effective date — reference for the CCL section of the validation form */
r.get("/cca-relief-rates", (_req, res) => {
  res.json({ data: CCA_RELIEF_RATES });
});

/* SIC code eligibility lookup (EII sector test only) — must come before /:id so it isn't shadowed */
r.get("/sic-lookup", (req, res) => {
  const raw = String(req.query.code || "").trim();
  if (!raw) return res.status(400).json({ error: "code is required" });
  const digits = raw.replace(/[^\d]/g, "");
  const normalise = (s) => s.replace(/[^\d]/g, "");
  const match = EII_ELIGIBLE_ACTIVITIES.find((e) => normalise(e.sic) === digits || normalise(e.sic).startsWith(digits) || digits.startsWith(normalise(e.sic)));
  res.json({
    data: {
      match: match ? { ...match, scheme: "EII" } : null,
      note: "This checks the EII sector-level test (Annex 1) only. It does not check CCL eligibility, which depends on holding a Climate Change Agreement or an exemption category (charity/domestic/de-minimis) — a separate test.",
      links: GOV_LINKS,
    },
  });
});

/* Business-level test (20% electricity intensity) — the second EII eligibility test, alongside the sector test above */
r.post("/eii-business-test", (req, res) => {
  const b = req.body || {};
  if (b.consumption_mwh == null || b.gva == null) return res.status(400).json({ error: "consumption_mwh and gva are required" });
  res.json({ data: eiiBusinessLevelTest(b) });
});

/* Government resource links — same links surfaced standalone for the UI's reference panel */
r.get("/gov-links", (_req, res) => {
  res.json({ data: GOV_LINKS });
});

/**
 * Claim pipeline — the real operational workflow for the bill-validation /
 * CCL rebate service, transcribed from the internal process document:
 * Sales Agent agrees the service -> Back Office runs the agreement/LOA and
 * supplier request -> Reporter certifies and gets supplier approval ->
 * payment is collected (Sales Agent by call, Back Office by email).
 */
const CLAIM_STAGES = [
  { key: "service_agreed", label: "Service agreed", role: "Sales Agent", detail: "Customer agrees to take the bill validation, auditing and CCL rebate service." },
  { key: "agreement_loa_sent", label: "Agreement & LOA sent", role: "Back Office", detail: "Service agreement and LOA sent to the customer to sign." },
  { key: "agreement_loa_signed", label: "Agreement & LOA signed", role: "Back Office", detail: "Signed agreement and LOA received back from the customer." },
  { key: "loa_sent_to_supplier", label: "LOA sent to supplier", role: "Back Office", detail: "LOA sent to the supplier requesting all bills for the last 4 years." },
  { key: "bills_sent_to_reporter", label: "Bills & LOA sent to Reporter", role: "Back Office", detail: "All bills and the LOA passed to the Reporter for analysis." },
  { key: "certificate_approved", label: "Certificate approved", role: "Reporter", detail: "CCL certificate approved." },
  { key: "supplier_approved_rebate", label: "Supplier approved rebate", role: "Reporter", detail: "Supplier approves the rebate." },
  { key: "payment_received", label: "Payment received", role: "Sales Agent / Back Office", detail: "Percentage payment received from the customer (Sales Agent by call, Back Office by email)." },
];
const CLAIM_STAGE_KEYS = CLAIM_STAGES.map((s) => s.key);

/* Claim pipeline stage reference — must come before /:id so it isn't shadowed */
r.get("/claim-stages", (_req, res) => {
  res.json({ data: CLAIM_STAGES });
});

/* GET one */
r.get("/:id", (req, res) => {
  const row = one(`SELECT bv.*, c.contract_no FROM bill_validations bv LEFT JOIN contracts c ON c.id = bv.contract_id WHERE bv.id=?`, req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  res.json({ data: withParsed(row) });
});

/* PREVIEW — validate live, no save */
r.post("/preview", (req, res) => {
  const b = req.body || {};
  const contract = b.contract_id ? one("SELECT * FROM contracts WHERE id=?", b.contract_id) : null;
  res.json({ data: validateBill(b, contract) });
});

/* CREATE — validate + save */
r.post("/", (req, res) => {
  const b = req.body || {};
  const contract = b.contract_id ? one("SELECT * FROM contracts WHERE id=?", b.contract_id) : null;
  const v = validateBill(b, contract);
  const ref = nextRef();

  const info = db.prepare(`INSERT INTO bill_validations
    (ref, contract_id, business_id, business_name, supplier_id, supplier_name, utility, meter_mpan_mpr,
     period, days, billed_consumption, billed_standing_charge, billed_unit_rate, billed_amount, vat_rate,
     contracted_standing_charge, contracted_unit_rate, expected_amount, variance, status, claim_amount, findings, notes,
     ccl_charged, ccl_rate, ccl_relief_pct, ccl_exempt, ccl_rebate,
     eii_eligible, eii_policy_cost, eii_relief_pct, eii_relief, eac, tolerance_pct, volume_status, total_claim,
     client_name, client_address, client_company_reg,
     meter_reading_start, meter_reading_end, vat_rate_expected,
     tnuos_charged, tnuos_rate, duos_charged, duos_rate, duplicate_flag, meter_data_flag, sic_code,
     bsuos_charged, ncc_compensation)
    VALUES (@ref,@contract_id,@business_id,@business_name,@supplier_id,@supplier_name,@utility,@meter,
     @period,@days,@consumption,@bStand,@bUnit,@billed,@vat,@cStand,@cUnit,@expected,@variance,@status,0,@findings,@notes,
     @cclCharged,@cclRate,@cclReliefPct,@cclExempt,@cclRebate,
     @eiiEligible,@eiiPolicyCost,@eiiReliefPct,@eiiRelief,@eac,@tolPct,@volStatus,@totalClaim,
     @clientName,@clientAddress,@clientRegNo,
     @meterStart,@meterEnd,@vatExpected,
     @tnuosCharged,@tnuosRate,@duosCharged,@duosRate,@duplicateFlag,@meterDataFlag,@sicCode,
     @bsuosCharged,@nccCompensation)`)
    .run({
      ref,
      contract_id: b.contract_id || null,
      business_id: b.business_id || (contract ? contract.business_id : null),
      business_name: b.business_name || (contract ? contract.business_name : null),
      supplier_id: b.supplier_id || (contract ? contract.supplier_id : null),
      supplier_name: b.supplier_name || null,
      utility: b.utility || (contract ? contract.utility : null),
      meter: b.meter_mpan_mpr || (contract ? contract.meter_mpan_mpr : null),
      period: b.period || null, days: v.days,
      consumption: Number(b.billed_consumption) || 0, bStand: Number(b.billed_standing_charge) || 0,
      bUnit: Number(b.billed_unit_rate) || 0, billed: v.billed_amount, vat: v.vat.billed,
      cStand: v.contracted_standing_charge, cUnit: v.contracted_unit_rate, expected: v.expected_amount,
      variance: v.variance, status: v.status, findings: JSON.stringify(v.findings), notes: b.notes || null,
      cclCharged: v.ccl.charged, cclRate: v.ccl.rate, cclReliefPct: v.ccl.reliefPct, cclExempt: v.ccl.exempt ? 1 : 0, cclRebate: v.ccl.rebate,
      eiiEligible: v.eii.eligible ? 1 : 0, eiiPolicyCost: v.eii.policyCost, eiiReliefPct: v.eii.reliefPct, eiiRelief: v.eii.relief,
      eac: v.volume.eac, tolPct: v.volume.tolerancePct, volStatus: v.volume.status, totalClaim: v.total_claim,
      clientName: b.client_name || b.business_name || (contract ? contract.business_name : null),
      clientAddress: b.client_address || null,
      clientRegNo: b.client_company_reg || null,
      meterStart: v.meter_reading.start, meterEnd: v.meter_reading.end, vatExpected: v.vat.expected,
      tnuosCharged: v.tnuos.charged, tnuosRate: v.tnuos.rate, duosCharged: v.duos.charged, duosRate: v.duos.rate,
      duplicateFlag: v.duplicate_flag ? 1 : 0, meterDataFlag: v.meter_data_flag ? 1 : 0,
      sicCode: b.sic_code || null,
      bsuosCharged: v.ncc.bsuosCharged, nccCompensation: v.ncc.compensation,
    });

  res.status(201).json({ data: withParsed(one("SELECT * FROM bill_validations WHERE id=?", info.lastInsertRowid)) });
});

/* RAISE CLAIM — books total_claim (rate overcharge + CCL rebate + EII relief) */
r.post("/:id/raise-claim", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  const claim = Math.max(0, Number(row.total_claim) || Number(row.variance) || 0);
  db.prepare("UPDATE bill_validations SET status='Claim Raised', claim_amount=? WHERE id=?").run(claim, row.id);
  res.json({ data: withParsed(one("SELECT * FROM bill_validations WHERE id=?", row.id)) });
});

/**
 * Merges the client's details into the standard Agency Client Agreement /
 * Letter of Authority for CCA advisory, EII and CCL rebate & bill validation
 * services (source: AMSL Bill Validation Agency Terms & Conditions).
 */
function buildLoaText(row) {
  const today = new Date().toLocaleDateString("en-GB");
  return [
    "CLIENT AGREEMENT FOR AUDITING & CCL REBATE SERVICES", "",
    `This Agreement is made on ${today} between:`, "",
    "Client:", `  ${row.client_name || row.business_name || "[Client Name]"}`,
    `  ${row.client_address || "[Client Address]"}`,
    `  ${row.client_company_reg ? "Company Registration Number: " + row.client_company_reg : "[Company Registration Number]"}`, "",
    "Agency:", "  ADVANCE MERCHANT SERVICES LTD", "  Havelock Hub, 14 Havelock Place, Harrow HA1 1LJ", "  Company No. 15658696", "",
    "1. Appointment of Agent", "",
    "The Client hereby appoints ADVANCE MERCHANT SERVICES LTD as its exclusive agent to manage all",
    "activities related to CCA advisory, EII, Climate Change Levy (CCL) or both rebates and exemption",
    "services going forward. This includes:",
    "  - Initial Free Consultation",
    "  - Evaluating eligibility for CCA advisory, EII, CCL, both relief schemes.",
    "  - Preparing and submitting required documentation.",
    "  - Liaising with suppliers and HMRC on the Client's behalf.",
    "  - Bill auditing and validation",
    "  - Administration, account and claim management", "",
    "2. Scope of Authority", "",
    "The Agency is authorised to act on behalf of the Client solely for the purpose of delivering the",
    "agreed Services, communicate with third parties including energy suppliers and government bodies,",
    "and submit applications and supporting documents as required.",
    "The Agency is not authorised to enter into energy supply contracts or financial agreements on",
    "behalf of the Client, or make binding commitments beyond the scope of this Agreement.", "",
    "3. Client Responsibilities", "",
    "The Client agrees to provide accurate and complete information, sign and return any Letters of",
    "Authority promptly, notify the Agency of any changes affecting eligibility, and cooperate with",
    "audits or compliance checks if requested.", "",
    "4. Fees and Payment Terms", "",
    "  - Agency funds all work related until audit and CCA advisory, EII, CCL or Both's completion.",
    "  - A success-based fee of 30% of net rebate received will be payable to the Agency.",
    "  - Payment is due within 14 calendar days of invoice issuance following rebate confirmation.",
    "  - No upfront fees or expenses will be charged unless otherwise agreed in writing.", "",
    "5. Termination", "",
    "This Agreement may be terminated by either party with 30 days' written notice. The Client remains",
    "liable for any fees due for successful claims processed prior to termination.", "",
    "6. Liability and Indemnity", "",
    "The Agency shall not be liable for missed rebates or penalties arising from incorrect or incomplete",
    "information provided by the Client. The Client indemnifies the Agency against any claims or losses",
    "resulting from false declarations or non-compliance with HMRC regulations.", "",
    "7. Confidentiality — Both parties agree to maintain confidentiality of sensitive information exchanged.", "",
    "8. Governing Law — England and Wales.", "",
    "Schedule A — Fee Structure",
    "  Success Fee: 30% of net rebate recovered",
    "  Payment Terms: 14 days from invoice",
    `  Bill Validation Reference: ${row.ref} — this validation's claimable total: £${Number(row.total_claim || 0).toFixed(2)}`, "",
    "Signed for and on behalf of the Client:",
    "  Name: ______________________   Position: ______________________",
    "  Signature: ______________________   Date: ______________________", "",
    "Signed for and on behalf of the Agency: ADVANCE MERCHANT SERVICES LTD",
    "  Name: ______________________   Position: ______________________",
    "  Signature: ______________________   Date: ______________________",
  ].join("\n");
}

/* PREVIEW / DOWNLOAD LOA text (merged with this record's client details) */
r.get("/:id/loa", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  res.json({ data: { text: buildLoaText(row), loa_status: row.loa_status } });
});

/* SEND LOA — stubbed (needs live SMTP/e-sign, same as contract-signed emails) */
r.post("/:id/send-loa", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  if (req.body && (req.body.client_name || req.body.client_address || req.body.client_company_reg)) {
    db.prepare("UPDATE bill_validations SET client_name=COALESCE(@n,client_name), client_address=COALESCE(@a,client_address), client_company_reg=COALESCE(@r,client_company_reg) WHERE id=@id")
      .run({ n: req.body.client_name || null, a: req.body.client_address || null, r: req.body.client_company_reg || null, id: row.id });
  }
  db.prepare("UPDATE bill_validations SET loa_status='Sent', loa_sent_at=datetime('now') WHERE id=?").run(row.id);
  res.json({ data: withParsed(one("SELECT * FROM bill_validations WHERE id=?", row.id)) });
});

/* BILL UPLOAD — stores the file's metadata against the validation.
 * Note: this stores the filename/timestamp only. Automatically reading the
 * consumption, rates, VAT etc. off an arbitrary uploaded bill needs a
 * document-AI/OCR service, which isn't wired up here — the fields above
 * still need entering (or confirming) manually, same as the other stubbed
 * integrations in this app (PDF/Excel statement parsing, logo uploads). */
r.post("/:id/upload-bill", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  const fileName = (req.body && req.body.file_name) || null;
  if (!fileName) return res.status(400).json({ error: "file_name is required" });
  db.prepare("UPDATE bill_validations SET bill_file_name=?, bill_uploaded_at=datetime('now') WHERE id=?").run(fileName, row.id);
  res.json({ data: withParsed(one("SELECT * FROM bill_validations WHERE id=?", row.id)) });
});

/**
 * Pure PP11 renderer — takes plain fields (not a DB row) and produces the
 * filled form text + a list of still-missing required fields. Matches the
 * real form exactly (verified against completed examples for Danesfield
 * Hotels and Resorts Ltd and Adham Hotels Ltd, multiple sites): Line 1/2
 * required, Line 3 optional, one commodity, meter supply number, date
 * from, % relief, supplier name, responsible person + phone.
 */
function renderPp11(f) {
  const required = {
    business_name: f.business_name || null,
    address_line1: f.address_line1 || null,
    address_line2: f.address_line2 || null,
    postcode: f.postcode || null,
    account_reference: f.account_reference || null,
    meter_number: f.meter_number || null,
    date_from: f.date_from || null,
    relief_pct: f.relief_pct,
    supplier_name: f.supplier_name || null,
    responsible_person: f.responsible_person || null,
    phone: f.phone || null,
  };
  const addressLine3 = f.address_line3 || null;
  const missing = Object.entries(required).filter(([, v]) => v == null || v === "").map(([k]) => k);
  const commodity = /gas/i.test(f.utility || "") ? "Gas" : "Electricity";
  const text = [
    "CLIMATE CHANGE LEVY SUPPLIER CERTIFICATE (PP11)", "Do not send this certificate to HMRC — send it directly to your supplier.", "",
    "Qualifying business and relief claimed", "",
    `Name of qualifying business: ${required.business_name || "[MISSING]"}`, "",
    "Address of qualifying business (UK)",
    `Line 1: ${required.address_line1 || "[MISSING]"}`,
    `Line 2: ${required.address_line2 || "[MISSING]"}`,
    `Line 3 (optional): ${addressLine3 || "—"}`,
    `Postcode: ${required.postcode || "[MISSING]"}`, "",
    `Account reference number: ${required.account_reference || "[MISSING]"}`, "",
    `Commodity on which relief is claimed: ${commodity}`,
    `Electricity/gas meter supply number: ${required.meter_number || "[MISSING]"}`,
    `Date from which relief is to be applied: ${required.date_from || "[MISSING]"}`,
    `Percentage of supplies eligible for relief from CCL: ${required.relief_pct != null && required.relief_pct !== "" ? required.relief_pct + "%" : "[MISSING]"}`,
    `Energy supplier's name: ${required.supplier_name || "[MISSING]"}`, "",
    "Declaration",
    `Full name of responsible person within the business: ${required.responsible_person || "[MISSING]"}`,
    `Phone number: ${required.phone || "[MISSING]"}`,
    "Signature: ______________________   Date: ______________________", "",
    "What to do now: sign and date this form, then send it to your energy supplier.",
    "Official form and guidance: " + GOV_LINKS.ccl_supplier_certificate_pp11.url,
  ].join("\n");
  return { text, missing };
}

/** Thin wrapper for the single-validation-record flow — pulls defaults from the saved row. */
function buildPp11(row, extra = {}) {
  return renderPp11({
    business_name: row.business_name,
    address_line1: extra.address_line1,
    address_line2: extra.address_line2 || row.client_address,
    address_line3: extra.address_line3,
    postcode: extra.postcode,
    account_reference: extra.account_reference || row.ref,
    meter_number: row.meter_mpan_mpr,
    date_from: extra.date_from || row.period,
    relief_pct: row.ccl_relief_pct,
    supplier_name: row.supplier_name,
    responsible_person: extra.responsible_person,
    phone: extra.phone,
    utility: row.utility,
  });
}

/* PREVIEW/GENERATE PP11 — pass any missing fields in the body to fill them in */
r.post("/:id/generate-pp11", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  const built = buildPp11(row, req.body || {});
  res.json({ data: built });
});

/**
 * BATCH PP11 — one business with multiple sites, each needing its own PP11,
 * sharing the responsible person/phone/supplier/relief % (the real-world
 * pattern seen in the Adham Hotels Ltd examples: 3 hotels, 3 account refs,
 * 3 meters, same person/supplier/92% relief across all of them).
 * Body: { shared: {business_name, responsible_person, phone, supplier_name,
 *          relief_pct, utility}, sites: [{address_line1, address_line2,
 *          address_line3, postcode, account_reference, meter_number,
 *          date_from}, ...] }
 */
r.post("/generate-pp11-batch", (req, res) => {
  const { shared = {}, sites = [] } = req.body || {};
  if (!Array.isArray(sites) || !sites.length) return res.status(400).json({ error: "sites array is required" });
  const results = sites.map((site, i) => ({
    index: i,
    site_label: site.address_line1 || `Site ${i + 1}`,
    ...renderPp11({ ...shared, ...site }),
  }));
  res.json({ data: results });
});

/**
 * Builds an EII certificate application summary — pulls the matched
 * eii_certificates record (if any) for this meter/period, otherwise uses
 * the manually-entered EII fields on the validation.
 */
function buildEiiSummary(row, extra = {}) {
  const cert = row.meter_mpan_mpr
    ? one(`SELECT ec.certificate_number, ec.eligible_product, ec.validity_start, ec.validity_end, ecm.proportion_exempt_pct
           FROM eii_certificate_meters ecm JOIN eii_certificates ec ON ec.id = ecm.certificate_id
           WHERE REPLACE(ecm.msid,' ','') = ? ORDER BY ec.validity_end DESC LIMIT 1`, row.meter_mpan_mpr)
    : null;
  const required = {
    business_name: row.business_name,
    company_number: extra.company_number || row.client_company_reg,
    meter_number: row.meter_mpan_mpr,
    eligible_product: (cert && cert.eligible_product) || extra.eligible_product || null,
    proportion_exempt: cert ? cert.proportion_exempt_pct : row.eii_relief_pct,
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  const text = [
    "ENERGY INTENSIVE INDUSTRIES (EII) CERTIFICATE — APPLICATION SUMMARY", "",
    `Business: ${required.business_name || "[MISSING]"}`,
    `Company number: ${required.company_number || "[MISSING]"}`,
    `MSID / meter: ${required.meter_number || "[MISSING]"}`,
    `Eligible product: ${required.eligible_product || "[MISSING]"}`,
    `Proportion exempt (%): ${required.proportion_exempt != null ? required.proportion_exempt : "[MISSING]"}`,
    cert ? `Existing certificate on file: ${cert.certificate_number} (valid ${cert.validity_start} to ${cert.validity_end})` : "No existing certificate on file for this meter — this would be a new application.", "",
    "Sector/business-level tests (self-certify before submitting):",
    "  - Sector test: product manufactured falls within an eligible 4-digit NACE code",
    "  - Business test: electricity costs are at least 20% of Gross Value Added (GVA)",
    "", "Apply via DBT using the official guidance and application forms:",
    GOV_LINKS.eii_certificate_guidance.url,
  ].join("\n");
  return { text, missing, matched_certificate: cert || null };
}

r.post("/:id/generate-eii-summary", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  const built = buildEiiSummary(row, req.body || {});
  res.json({ data: built });
});

/* Advance/set a validation's claim-pipeline stage */
r.post("/:id/set-stage", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  const stage = req.body && req.body.stage;
  if (!CLAIM_STAGE_KEYS.includes(stage)) return res.status(400).json({ error: `stage must be one of: ${CLAIM_STAGE_KEYS.join(", ")}` });

  if (stage === "payment_received") {
    const amount = req.body.payment_amount != null ? Number(req.body.payment_amount) : null;
    db.prepare("UPDATE bill_validations SET claim_stage=?, claim_stage_updated_at=datetime('now'), payment_received_amount=?, payment_received_at=datetime('now') WHERE id=?")
      .run(stage, amount, row.id);
  } else {
    db.prepare("UPDATE bill_validations SET claim_stage=?, claim_stage_updated_at=datetime('now') WHERE id=?").run(stage, row.id);
  }
  res.json({ data: withParsed(one("SELECT * FROM bill_validations WHERE id=?", row.id)) });
});

/* SUPPLIER FOLLOW-UP — flag a discrepancy for supplier resolution (refund/credit) */
r.post("/:id/raise-query", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  db.prepare("UPDATE bill_validations SET supplier_query_status='Raised', supplier_query_notes=?, supplier_query_raised_at=datetime('now') WHERE id=?")
    .run((req.body && req.body.notes) || null, row.id);
  res.json({ data: withParsed(one("SELECT * FROM bill_validations WHERE id=?", row.id)) });
});

r.post("/:id/resolve-query", (req, res) => {
  const row = one("SELECT * FROM bill_validations WHERE id=?", req.params.id);
  if (!row) return res.status(404).json({ error: "Validation not found" });
  db.prepare("UPDATE bill_validations SET supplier_query_status='Resolved', supplier_query_notes=COALESCE(?,supplier_query_notes) WHERE id=?")
    .run((req.body && req.body.notes) || null, row.id);
  res.json({ data: withParsed(one("SELECT * FROM bill_validations WHERE id=?", row.id)) });
});

/* DELETE */
r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM bill_validations WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Validation not found" });
  res.json({ data: { deleted: true } });
});

export default r;
