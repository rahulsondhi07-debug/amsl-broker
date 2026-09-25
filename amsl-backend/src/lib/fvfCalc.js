/**
 * Fixed vs Flex calculations, shared by the API and every generated comparison document.
 *
 * Every line amount is derived from its basis so a rate and its total can never disagree.
 * All rates are pence, so every result is divided by 100 to reach pounds:
 *   p_kwh      pence per kWh              qty kWh x rate
 *   p_day      pence per day              days x rate
 *   p_kva_day  pence per kVA per day      qty kVA x rate x days
 *   p_kvarh    pence per kVArh            qty kVArh x rate
 */
import { db } from "../db.js";
import { computeSnapshot, seasonRange, shortSeason } from "./flexCalc.js";

export const round2 = (n) => Math.round(n * 100) / 100;
export const round4 = (n) => Math.round(n * 10000) / 10000;

/** Unrounded amount in pounds; rounding happens once, on the totals, as a spreadsheet does. */
export function lineAmountRaw(line, cmp) {
  const rate = Number(line.rate) || 0;
  const qty = Number(line.qty) || 0;
  const days = Number(cmp.days) || 365;
  switch (line.basis) {
    case "p_day": return (days * rate) / 100;
    case "p_kva_day": return (qty * rate * days) / 100;
    case "p_kwh":
    case "p_kvarh":
    default: return (qty * rate) / 100;
  }
}
export const lineAmount = (line, cmp) => round2(lineAmountRaw(line, cmp));

/**
 * One scenario-year: its layers, then the statutory additions on top. CCL and VAT sit
 * outside the subtotal because that is how a bill is presented, and because they are
 * identical across Fixed and Flex: comparing net of both is the only like-for-like view.
 */
export function buildScenario(cmp, lines) {
  const priced = lines.map((l) => ({ ...l, amount: lineAmount(l, cmp) }));
  const raw = lines.reduce((a, l) => a + lineAmountRaw(l, cmp), 0);
  const cclRaw = ((Number(cmp.annual_kwh) || 0) * (Number(cmp.ccl_p_kwh) || 0)) / 100;
  const netRaw = raw + cclRaw;
  const vatRaw = netRaw * ((Number(cmp.vat_pct) || 0) / 100);
  return {
    lines: priced, priced: priced.some((l) => l.rate != null),
    subtotal_ex_ccl_vat: round2(raw),
    ccl: round2(cclRaw), total_ex_vat: round2(netRaw), vat: round2(vatRaw), total_inc_vat: round2(netRaw + vatRaw),
    effective_p_kwh: cmp.annual_kwh ? round4((raw / cmp.annual_kwh) * 100) : null,
  };
}

const pctOf = (a, b) => (b ? round4(((a - b) / b) * 100) : null);

/** The whole comparison, ready for the screen or a document. */
export function computeComparison(id) {
  const cmp = db.prepare(`SELECT c.*, b.business_name FROM fvf_comparisons c
                          LEFT JOIN businesses b ON b.id = c.business_id WHERE c.id=?`).get(id);
  if (!cmp) return null;
  try { cmp.assumptions_list = cmp.assumptions ? JSON.parse(cmp.assumptions) : []; } catch { cmp.assumptions_list = String(cmp.assumptions || "").split("\n").filter(Boolean); }
  const all = db.prepare("SELECT * FROM fvf_lines WHERE comparison_id=? ORDER BY year_no, sort_order, id").all(id);
  const monthly = db.prepare("SELECT * FROM fvf_monthly WHERE comparison_id=? ORDER BY sort_order, id").all(id)
    .map((m) => ({ ...m, total_kwh: round2((m.day_kwh || 0) + (m.night_kwh || 0)) }));

  const curLines = all.filter((l) => l.scenario === "Current");
  const current = curLines.length ? buildScenario(cmp, curLines) : null;
  const hasCurrent = !!current?.priced;

  const main = all.filter((l) => l.scenario !== "Current");
  const years = [...new Set(main.map((l) => l.year_no))].sort((a, b) => a - b);
  const rows = years.map((y) => {
    const yl = main.find((l) => l.year_no === y)?.year_label || `Year ${y}`;
    const fixedLines = main.filter((l) => l.year_no === y && l.scenario === "Fixed");
    const fixed = buildScenario(cmp, fixedLines);
    const flex = buildScenario(cmp, main.filter((l) => l.year_no === y && l.scenario === "Flex"));
    // A year with no rates on one side cannot be compared; report it as such rather than
    // showing a saving equal to the whole of the other side.
    const comparable = fixed.priced && flex.priced;
    return {
      year_no: y, year_label: yl, fixed, flex, comparable, has_fixed: fixedLines.length > 0 && fixed.priced,
      saving_ex_ccl_vat: comparable ? round2(fixed.subtotal_ex_ccl_vat - flex.subtotal_ex_ccl_vat) : null,
      saving_pct: comparable && fixed.subtotal_ex_ccl_vat ? round4(((fixed.subtotal_ex_ccl_vat - flex.subtotal_ex_ccl_vat) / fixed.subtotal_ex_ccl_vat) * 100) : null,
      saving_inc_vat: comparable ? round2(fixed.total_inc_vat - flex.total_inc_vat) : null,
      saving_inc_pct: comparable && fixed.total_inc_vat ? round4(((fixed.total_inc_vat - flex.total_inc_vat) / fixed.total_inc_vat) * 100) : null,
    };
  });
  const comparableRows = rows.filter((x) => x.comparable);

  // Term view: the n-year fixed rate paid for every year of an n-year term, against the
  // sum of the n flex years. Uses the longest term with a priced fixed quote.
  let term = null;
  const fixedYears = rows.filter((r) => r.has_fixed).map((r) => r.year_no);
  const n = fixedYears.length ? Math.max(...fixedYears) : 0;
  const flexN = rows.filter((r) => r.year_no <= n && r.flex.priced);
  if (n && flexN.length === n) {
    const fx = rows.find((r) => r.year_no === n).fixed;
    const fixedNet = round2(fx.subtotal_ex_ccl_vat * n), flexNet = round2(flexN.reduce((a, r) => a + r.flex.subtotal_ex_ccl_vat, 0));
    const fixedInc = round2(fx.total_inc_vat * n), flexInc = round2(flexN.reduce((a, r) => a + r.flex.total_inc_vat, 0));
    term = {
      years: n, label: `${n}-Year Total`,
      fixed_net: fixedNet, flex_net: flexNet, saving_net: round2(fixedNet - flexNet), saving_pct: fixedNet ? round4(((fixedNet - flexNet) / fixedNet) * 100) : null,
      fixed_inc: fixedInc, flex_inc: flexInc, saving_inc: round2(fixedInc - flexInc), saving_inc_pct: fixedInc ? round4(((fixedInc - flexInc) / fixedInc) * 100) : null,
    };
  }
  const flexPriced = rows.filter((r) => r.flex.priced);

  // Every option on one table: stay put, renew fixed for 1..n years, or flex by year.
  const vsCur = (net, inc) => hasCurrent ? {
    vs_current_net_pct: pctOf(net, current.subtotal_ex_ccl_vat), vs_current_inc_pct: pctOf(inc, current.total_inc_vat),
  } : { vs_current_net_pct: null, vs_current_inc_pct: null };
  const option = (key, label, sc, kind) => ({
    key, label, kind, annual_net: sc.subtotal_ex_ccl_vat, annual_inc: sc.total_inc_vat,
    monthly_net: round2(sc.subtotal_ex_ccl_vat / 12), monthly_inc: round2(sc.total_inc_vat / 12),
    effective_p_kwh: sc.effective_p_kwh, ...vsCur(sc.subtotal_ex_ccl_vat, sc.total_inc_vat),
  });
  const options = [];
  if (hasCurrent) options.push(option("current", `Current${cmp.current_contract_end ? ` (in contract, ends ${fmtDate(cmp.current_contract_end)})` : ""}`, current, "current"));
  rows.filter((r) => r.has_fixed).forEach((r) => options.push(option(`fixed_${r.year_no}`, `Renewal — ${r.year_no} Year Fixed`, r.fixed, "fixed")));
  // Consecutive flex years at the same cost are shown once ("Years 2–4 (flat)").
  const flexGroups = [];
  flexPriced.forEach((r) => {
    const last = flexGroups[flexGroups.length - 1];
    if (last && Math.abs(last.sc.subtotal_ex_ccl_vat - r.flex.subtotal_ex_ccl_vat) < 0.005) last.to = r.year_no;
    else flexGroups.push({ from: r.year_no, to: r.year_no, sc: r.flex });
  });
  flexGroups.forEach((g) => options.push(option(`flex_${g.from}`,
    g.from === g.to ? `Flex — Year ${g.from}` : `Flex — Years ${g.from}–${g.to} (flat)`, g.sc, "flex")));

  // Rate summary (the "unit rates" and "rate build-up" tables).
  const rateOf = (sc, label) => sc?.lines.find((l) => l.label.toLowerCase() === label.toLowerCase())?.rate ?? null;
  const unitRates = [
    ...(hasCurrent ? [{ label: "Current", standing: rateOf(current, "Standing Charge"), day: rateOf(current, "Day Units"), night: rateOf(current, "Night Units") }] : []),
    ...rows.filter((r) => r.has_fixed).map((r) => ({ label: `${r.year_no} Year Fixed`, standing: rateOf(r.fixed, "Standing Charge"), day: rateOf(r.fixed, "Day Units"), night: rateOf(r.fixed, "Night Units") })),
  ];
  const flexKeys = [...new Set(main.filter((l) => l.scenario === "Flex" && l.basis === "p_kwh" && !/duos|fit|feed/i.test(l.label)).map((l) => l.label))];
  const flexBuild = flexKeys.map((k) => ({ label: k, by_year: flexPriced.map((r) => rateOf(r.flex, k)) }));

  const result = {
    comparison: cmp, current: hasCurrent ? current : null, current_stack: current, years: rows, monthly, options, term,
    unit_rates: unitRates, flex_build: flexBuild, flex_years: flexPriced.map((r) => r.year_no),
    totals: {
      term_saving_ex_ccl_vat: round2(comparableRows.reduce((a, x) => a + (x.saving_ex_ccl_vat || 0), 0)),
      term_saving_inc_vat: round2(comparableRows.reduce((a, x) => a + (x.saving_inc_vat || 0), 0)),
      years_compared: comparableRows.length,
      years_incomplete: rows.length - comparableRows.length,
      flex_all_years_net: round2(flexPriced.reduce((a, r) => a + r.flex.subtotal_ex_ccl_vat, 0)),
      flex_all_years_inc: round2(flexPriced.reduce((a, r) => a + r.flex.total_inc_vat, 0)),
    },
  };
  result.market = cmp.basket_id ? marketContext(cmp) : null;
  result.findings = keyFindings(result);
  return result;
}

/** The consortium position the flex price is built on, for the "why flex wins" slide. */
function marketContext(cmp) {
  const snap = computeSnapshot(cmp.basket_id);
  const power = snap?.positions.find((p) => p.utility === "Power");
  if (!power) return null;
  const start = cmp.flex_start ? new Date(cmp.flex_start) : new Date();
  const seasons = power.seasonal.filter((s) => { const r = seasonRange(s.label); return r && r.end >= start; }).slice(0, 7);
  return {
    basket_name: snap.basket.name, as_at: snap.basket.report_date,
    hedged_pct: power.hedged_pct, locked_avg: power.locked_avg,
    // The first season of supply: where the fixed quote's premium sits.
    near: seasons[0] || power.near_season,
    seasons: seasons.map((s) => ({ label: s.label, short: shortSeason(s.label), market: s.market, locked: s.locked, hedged_pct: s.hedged_pct })),
  };
}

const money0 = (n) => `£${Math.round(n).toLocaleString("en-GB")}`;
const pct1 = (n) => `${Math.abs(n).toFixed(1)}%`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Plain-English findings written from the numbers, never typed by hand. */
export function keyFindings(r) {
  const out = [];
  const comp = r.years.filter((y) => y.comparable);
  if (comp.length) {
    const cheaper = comp.filter((y) => y.saving_ex_ccl_vat > 0);
    if (cheaper.length === comp.length) {
      out.push(`Flex is cheaper than every fixed renewal term on offer: ${comp.map((y) => `${pct1(y.saving_pct)} below the ${y.year_no}-year fixed rate`).join(", ")} (net of VAT & CCL).`);
    } else if (!cheaper.length) {
      out.push(`On these figures the fixed renewal is cheaper in every year compared, by ${comp.map((y) => pct1(y.saving_pct)).join(" / ")} net of VAT & CCL. Fixed may be the better choice if budget certainty is the priority.`);
    } else {
      out.push(`Flex is cheaper in ${cheaper.length} of ${comp.length} years compared; the fixed rate wins in ${comp.filter((y) => y.saving_ex_ccl_vat <= 0).map((y) => `Year ${y.year_no}`).join(", ")}.`);
    }
  }
  if (r.term) out.push(`Over the full ${r.term.years}-year term, flex is forecast at ${money0(r.term.flex_net)} against ${money0(r.term.fixed_net)} on the ${r.term.years}-year fixed renewal: a ${r.term.saving_net >= 0 ? "saving" : "cost"} of ${money0(Math.abs(r.term.saving_net))} (${pct1(r.term.saving_pct)}), net of VAT & CCL.`);
  const cur = r.options.find((o) => o.kind === "current");
  if (cur) {
    const fixed = r.options.filter((o) => o.kind === "fixed");
    const flex = r.options.filter((o) => o.kind === "flex");
    if (fixed.length && fixed.every((o) => o.vs_current_net_pct > 0)) {
      const lo = Math.min(...fixed.map((o) => o.vs_current_net_pct)), hi = Math.max(...fixed.map((o) => o.vs_current_net_pct));
      out.push(`Every renewal term is more expensive than the current contract (+${lo.toFixed(1)}% to +${hi.toFixed(1)}%): the market has moved since the existing rate was fixed, so "do nothing and renew" carries a real cost.`);
    }
    const below = flex.filter((o) => o.vs_current_net_pct < 0);
    if (below.length) out.push(`${below[0].label.replace("Flex — ", "Flex ")} is ${pct1(below[0].vs_current_net_pct)} below the current contract's own cost${below.length > 1 ? `, rising to ${pct1(below[below.length - 1].vs_current_net_pct)} from ${below[below.length - 1].label.replace("Flex — ", "")}` : ""}.`);
  }
  const noFixed = r.years.filter((y) => y.flex.priced && !y.has_fixed);
  if (noFixed.length) out.push(`Flex also covers ${noFixed.map((y) => `Year ${y.year_no}`).join(", ")}, which no fixed renewal quote currently covers.`);
  if (r.market?.near && r.market.near.market && r.market.near.locked) {
    const s = r.market.near;
    out.push(`The consortium's ${s.label} position is ${Math.round(s.hedged_pct * 100)}% hedged at ${priceStr(s.locked)} against a live market of ${priceStr(s.market)}: ${Math.round(((s.market - s.locked) / s.market) * 100)}% below today's price.`);
  }
  return out;
}
const priceStr = (v) => `£${Number(v).toFixed(2)}/MWh`;

/**
 * Fill a comparison's rates from a rate card rather than cell by cell. A value may be a
 * number (every year) or an array (by year). Lines are matched by label.
 */
const CARD_KEYS = [
  ["day", /^day units/i], ["night", /^night units/i], ["standing", /standing/i], ["tx", /transmission fixed/i],
  ["dx", /distribution fixed/i], ["excess_capacity", /excess capacity/i], ["reactive", /reactive/i], ["capacity", /^capacity/i],
  ["rab", /nuclear|rab/i], ["ncc", /network charging/i], ["fit", /feed-in|fit\b/i],
  ["commodity", /^commodity/i], ["non_commodity", /non.?commodity/i], ["consortium_fee", /consortium management|fct management/i],
  ["supplier_fee", /supplier management|platform management|evolve management/i],
  ["duos_red", /duos red/i], ["duos_amber", /duos amber/i], ["duos_green", /duos green/i],
];
export const cardKeyFor = (label) => CARD_KEYS.find(([, re]) => re.test(label))?.[0] || null;

export function applyRateCard(id, card) {
  const lines = db.prepare("SELECT * FROM fvf_lines WHERE comparison_id=?").all(id);
  const upd = db.prepare("UPDATE fvf_lines SET rate=? WHERE id=?");
  let n = 0;
  const shared = ["standing", "tx", "dx", "capacity", "excess_capacity", "reactive", "fit"];
  db.transaction(() => {
    for (const l of lines) {
      const scen = l.scenario === "Current" ? "current" : l.scenario === "Fixed" ? "fixed" : "flex";
      const k = cardKeyFor(l.label);
      if (!k) continue;
      let v = card[scen]?.[k];
      // Network and policy rates are the same whoever supplies the energy: fall back to
      // the fixed card so they only need entering once.
      if ((v === undefined || v === "") && scen !== "fixed" && shared.includes(k)) v = card.fixed?.[k];
      if ((v === undefined || v === "") && scen === "current" && ["rab", "ncc"].includes(k)) v = card.fixed?.[k];
      if (v === undefined || v === "") continue;
      const val = Array.isArray(v) ? v[(l.year_no || 1) - 1] : v;
      if (val === undefined || val === "" || val === null) continue;
      upd.run(Number(val), l.id); n++;
    }
  })();
  return n;
}

/** Read the card back from the lines, so the form opens pre-filled. */
export function readRateCard(id) {
  const lines = db.prepare("SELECT * FROM fvf_lines WHERE comparison_id=? ORDER BY year_no").all(id);
  const card = { current: {}, fixed: {}, flex: {} };
  for (const l of lines) {
    const scen = l.scenario === "Current" ? "current" : l.scenario === "Fixed" ? "fixed" : "flex";
    const k = cardKeyFor(l.label);
    if (!k) continue;
    const y = (l.year_no || 1) - 1;
    if (!Array.isArray(card[scen][k])) card[scen][k] = [];
    card[scen][k][y] = l.rate;
  }
  return card;
}
