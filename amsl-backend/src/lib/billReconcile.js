/**
 * Non-commodity bill reconciliation.
 *
 * Two independent methods, either of which can surface a claim:
 *   1. ARITHMETIC RECONCILIATION — needs no reference data at all. Re-derives every
 *      line from the numbers printed on the bill and flags any that do not add up.
 *   2. REFERENCE COMPARISON — compares each printed rate against the published DUoS,
 *      TNUoS and national levy schedules below.
 *
 * The parser's one hard-won rule: on an HH invoice every charge line is a tuple
 *   Label | Quantity | Qty-unit | RATE | Rate-unit | Subtotal | VAT | Total
 * and the first number after the label is the QUANTITY, not the rate. Reading "31"
 * (days) as a 31p/day distribution rate was the source of every early false positive.
 * Always anchor on the rate-unit token and take the number immediately before it.
 */

/** Published schedules: DUOS[dno][year] = [red, amber, green, fixed];
 *  NCC[year] = [TNUoS, BSUoS, RO, FiT, CM, NCC/EII, NuclearRAB, AAHEDC]; TBANDS[year]. */
export const N = {"DNOS":[{"id":"10","name":"East Midlands","op":"National Grid (E.ON)","pc":["DE","LE","LN","NG","PE"]},{"id":"11","name":"Eastern","op":"UK Power Networks (EPN)","pc":["AL","CB","CM","CO","EN","HP","IP","LU","MK","NR","SG","SS","WD"]},{"id":"12","name":"London","op":"UK Power Networks (LPN)","pc":["BR","CR","DA","E","EC","HA","IG","KT","N","NW","RM","SE","SM","SW","TW","UB","W","WC"]},{"id":"13","name":"Merseyside & N Wales","op":"SP Manweb","pc":["CH","L","LL","SY"]},{"id":"14","name":"Midlands","op":"National Grid (WPD)","pc":["B","CV","DY","GL","HR","NN","OX","ST","TF","WR","WS","WV"]},{"id":"15","name":"North East","op":"Northern Powergrid","pc":["DH","DL","NE","SR","TS"]},{"id":"16","name":"North West","op":"Electricity North West","pc":["BB","BL","FY","LA","M","OL","PR","SK","WA","WN"]},{"id":"17","name":"South East","op":"UK Power Networks (SPN)","pc":["BN","CT","GU","ME","PO","RG","RH","SL","SO","TN"]},{"id":"18","name":"Southern","op":"SSEN Southern (SEPL)","pc":["BA","BS","DT","EX","TA","SP"]},{"id":"19","name":"South West","op":"National Grid (WPD SW)","pc":["PL","TQ","TR"]},{"id":"20","name":"South Wales","op":"National Grid (WPD SW Wales)","pc":["CF","LD","NP","SA"]},{"id":"21","name":"South Scotland","op":"SP Distribution","pc":["DG","EH","G","KA","ML","PA","TD"]},{"id":"22","name":"North Scotland","op":"SSEN Highland (SHEPD)","pc":["AB","DD","FK","IV","KW","KY","PH"]},{"id":"23","name":"Yorkshire","op":"Northern Powergrid","pc":["BD","DN","HD","HG","HU","HX","LS","WF","YO"]}],"YEARS":["2016/17","2017/18","2018/19","2019/20","2020/21","2021/22","2022/23","2023/24","2024/25","2025/26","2026/27"],"DUOS":{"10":{"2016/17":[6.21,0.52,0.1,17.5],"2017/18":[6.55,0.55,0.11,18.2],"2018/19":[7.1,0.58,0.11,19.0],"2019/20":[7.4,0.6,0.12,19.8],"2020/21":[7.65,0.62,0.12,20.5],"2021/22":[8.2,0.65,0.13,21.3],"2022/23":[9.1,0.7,0.14,22.5],"2023/24":[9.8,0.74,0.15,23.8],"2024/25":[10.2,0.77,0.15,24.5],"2025/26":[4.1,0.38,0.08,7.2],"2026/27":[4.25,0.39,0.08,7.5]},"11":{"2016/17":[7.8,0.65,0.13,22.0],"2017/18":[8.2,0.68,0.14,23.0],"2018/19":[8.9,0.72,0.14,24.5],"2019/20":[9.3,0.75,0.15,25.5],"2020/21":[9.6,0.77,0.15,26.3],"2021/22":[10.3,0.82,0.16,27.5],"2022/23":[11.4,0.88,0.17,29.0],"2023/24":[12.3,0.93,0.18,30.8],"2024/25":[12.8,0.97,0.19,32.0],"2025/26":[5.2,0.42,0.09,8.5],"2026/27":[12.3,0.65,0.09,19.9]},"12":{"2016/17":[10.2,0.85,0.17,28.5],"2017/18":[10.75,0.9,0.18,30.0],"2018/19":[11.6,0.95,0.19,32.0],"2019/20":[12.1,0.99,0.2,33.5],"2020/21":[12.5,1.02,0.2,34.5],"2021/22":[13.4,1.09,0.21,36.0],"2022/23":[14.8,1.17,0.23,38.0],"2023/24":[15.9,1.25,0.25,40.5],"2024/25":[16.5,1.3,0.26,42.0],"2025/26":[6.8,0.55,0.11,10.2],"2026/27":[8.0,0.62,0.12,20.9]},"13":{"2016/17":[5.8,0.48,0.1,16.0],"2017/18":[6.1,0.51,0.1,16.8],"2018/19":[6.6,0.54,0.11,17.8],"2019/20":[6.9,0.56,0.11,18.5],"2020/21":[7.1,0.58,0.12,19.2],"2021/22":[7.6,0.62,0.12,20.0],"2022/23":[8.4,0.67,0.13,21.2],"2023/24":[9.1,0.71,0.14,22.5],"2024/25":[9.4,0.74,0.15,23.3],"2025/26":[3.8,0.35,0.07,6.8],"2026/27":[3.9,0.36,0.07,7.0]},"14":{"2016/17":[6.5,0.54,0.11,18.0],"2017/18":[6.85,0.57,0.11,18.8],"2018/19":[7.4,0.61,0.12,20.0],"2019/20":[7.7,0.63,0.13,20.8],"2020/21":[7.95,0.65,0.13,21.5],"2021/22":[8.5,0.69,0.14,22.5],"2022/23":[9.4,0.75,0.15,23.8],"2023/24":[10.2,0.8,0.16,25.0],"2024/25":[10.6,0.83,0.17,26.0],"2025/26":[4.3,0.39,0.08,52.68],"2026/27":[4.45,0.4,0.08,26.13]},"15":{"2016/17":[5.2,0.43,0.09,14.5],"2017/18":[5.5,0.46,0.09,15.2],"2018/19":[5.95,0.49,0.1,16.2],"2019/20":[6.2,0.51,0.1,16.8],"2020/21":[6.4,0.52,0.1,17.4],"2021/22":[6.85,0.56,0.11,18.2],"2022/23":[7.6,0.61,0.12,19.2],"2023/24":[8.2,0.65,0.13,20.3],"2024/25":[8.5,0.68,0.14,21.0],"2025/26":[3.4,0.31,0.06,6.0],"2026/27":[3.55,0.32,0.06,6.25]},"16":{"2016/17":[7.1,0.59,0.12,19.8],"2017/18":[7.5,0.62,0.12,20.7],"2018/19":[8.1,0.67,0.13,22.0],"2019/20":[8.45,0.7,0.14,22.9],"2020/21":[8.7,0.72,0.14,23.7],"2021/22":[9.3,0.77,0.15,24.7],"2022/23":[10.3,0.83,0.16,26.1],"2023/24":[11.1,0.89,0.18,27.6],"2024/25":[11.5,0.93,0.18,28.6],"2025/26":[4.6,0.4,0.08,0.0],"2026/27":[4.1,0.36,0.07,0.0]},"17":{"2016/17":[8.5,0.71,0.14,23.5],"2017/18":[8.95,0.74,0.15,24.5],"2018/19":[9.7,0.8,0.16,26.1],"2019/20":[10.1,0.83,0.17,27.2],"2020/21":[10.4,0.86,0.17,28.1],"2021/22":[11.2,0.92,0.18,29.3],"2022/23":[12.4,1.01,0.2,31.0],"2023/24":[13.3,1.08,0.21,32.8],"2024/25":[13.8,1.12,0.22,34.0],"2025/26":[5.6,0.45,0.09,9.2],"2026/27":[5.8,0.47,0.09,9.5]},"18":{"2016/17":[7.4,0.62,0.12,20.5],"2017/18":[7.8,0.65,0.13,21.5],"2018/19":[8.45,0.7,0.14,22.9],"2019/20":[8.8,0.73,0.14,23.8],"2020/21":[9.1,0.75,0.15,24.6],"2021/22":[9.7,0.8,0.16,25.7],"2022/23":[10.8,0.88,0.17,27.1],"2023/24":[11.6,0.94,0.19,28.8],"2024/25":[12.0,0.98,0.19,29.8],"2025/26":[4.9,0.42,0.08,0.0],"2026/27":[5.0,0.43,0.09,0.0]},"19":{"2016/17":[6.8,0.57,0.11,18.8],"2017/18":[7.15,0.6,0.12,19.7],"2018/19":[7.75,0.64,0.13,21.0],"2019/20":[8.1,0.67,0.13,21.9],"2020/21":[8.35,0.69,0.14,22.6],"2021/22":[8.95,0.74,0.15,23.6],"2022/23":[9.9,0.8,0.16,24.9],"2023/24":[10.7,0.86,0.17,26.4],"2024/25":[11.1,0.89,0.18,27.4],"2025/26":[4.5,0.4,0.08,7.0],"2026/27":[4.65,0.41,0.08,7.25]},"20":{"2016/17":[5.9,0.49,0.1,16.3],"2017/18":[6.2,0.52,0.1,17.1],"2018/19":[6.7,0.55,0.11,18.2],"2019/20":[7.0,0.58,0.12,18.9],"2020/21":[7.2,0.59,0.12,19.6],"2021/22":[7.7,0.63,0.13,20.4],"2022/23":[8.55,0.69,0.14,21.6],"2023/24":[9.2,0.74,0.15,22.9],"2024/25":[9.55,0.77,0.15,23.7],"2025/26":[3.9,0.36,0.07,7.1],"2026/27":[4.0,0.37,0.07,7.35]},"21":{"2016/17":[5.5,0.46,0.09,15.2],"2017/18":[5.8,0.48,0.1,15.9],"2018/19":[6.25,0.52,0.1,17.0],"2019/20":[6.55,0.54,0.11,17.7],"2020/21":[6.75,0.56,0.11,18.3],"2021/22":[7.2,0.59,0.12,19.1],"2022/23":[8.0,0.65,0.13,20.2],"2023/24":[8.6,0.7,0.14,21.4],"2024/25":[8.9,0.73,0.15,22.2],"2025/26":[3.6,0.33,0.07,6.5],"2026/27":[3.75,0.34,0.07,6.75]},"22":{"2016/17":[4.8,0.4,0.08,13.5],"2017/18":[5.05,0.42,0.08,14.1],"2018/19":[5.45,0.45,0.09,15.1],"2019/20":[5.7,0.47,0.09,15.7],"2020/21":[5.9,0.49,0.1,16.3],"2021/22":[6.3,0.52,0.1,17.0],"2022/23":[6.98,0.57,0.11,17.9],"2023/24":[7.5,0.61,0.12,19.0],"2024/25":[7.8,0.64,0.13,19.7],"2025/26":[3.15,0.29,0.06,5.8],"2026/27":[3.25,0.3,0.06,6.0]},"23":{"2016/17":[6.9,0.57,0.11,19.1],"2017/18":[7.25,0.6,0.12,20.0],"2018/19":[7.85,0.65,0.13,21.3],"2019/20":[8.2,0.68,0.14,22.2],"2020/21":[8.45,0.7,0.14,22.9],"2021/22":[9.05,0.75,0.15,23.9],"2022/23":[10.0,0.81,0.16,25.3],"2023/24":[10.8,0.87,0.17,26.8],"2024/25":[11.2,0.9,0.18,27.8],"2025/26":[4.5,0.4,0.08,36.91],"2026/27":[4.65,0.41,0.08,7.45]}},"NCC":{"2016/17":[0.42,0.25,0.72,0.07,0.18,0.0,0.0,0.015],"2017/18":[0.43,0.26,0.74,0.09,0.195,0.0,0.0,0.016],"2018/19":[0.45,0.275,0.76,0.11,0.21,0.0,0.0,0.017],"2019/20":[0.48,0.28,0.78,0.13,0.225,0.0,0.0,0.018],"2020/21":[0.49,0.3,0.8,0.15,0.24,0.0,0.0,0.019],"2021/22":[0.55,0.607,0.82,0.165,0.255,0.0,0.0,0.02],"2022/23":[0.62,0.919,0.845,0.18,0.27,0.0,0.0,0.021],"2023/24":[0.68,1.341,0.875,0.195,0.285,0.0,0.0,0.022],"2024/25":[0.72,1.28,0.9,0.21,0.295,0.0,0.0,0.023],"2025/26":[0.85,1.374,0.92,0.225,0.31,0.15,0.3663,0.024],"2026/27":[1.37,1.312,0.94,0.24,0.325,0.15,0.4683,0.025]},"TBANDS":{"2016/17":{"t":"nhh","nhh":6.5431,"src":"Final TNUoS 2016/17 (NESO doc 50211)"},"2017/18":{"t":"nhh","nhh":6.15,"src":"Interpolated"},"2018/19":{"t":"nhh","nhh":5.7852,"src":"Final TNUoS 2018/19"},"2019/20":{"t":"nhh","nhh":5.72,"src":"Estimated"},"2020/21":{"t":"nhh","nhh":5.85,"src":"Estimated"},"2021/22":{"t":"nhh","nhh":5.9638,"src":"Final TNUoS 2021/22 (doc 186176)"},"2022/23":{"t":"nhh","nhh":6.1994,"src":"Final TNUoS 2022/23 (doc 235056)"},"2023/24":{"t":"band","l1":6.0904,"l2":27.717,"l3":66.096,"l4":205.22,"src":"Final TNUoS 2023/24 (doc 275736)"},"2024/25":{"t":"band","l1":6.917,"l2":24.56,"l3":57.28,"l4":179.19,"src":"Nov-23 Draft est. (doc 294586)"},"2025/26":{"t":"band","l1":15.483,"l2":36.605,"l3":76.071,"l4":206.86,"src":"NESO Statement Apr-25 (doc 362701)"},"2026/27":{"t":"band","l1":23.932,"l2":58.73,"l3":124.24,"l4":346.1,"src":"Final TNUoS 2026/27 (doc 376336)"}}}
;

export const NCC_MAP = { tnuos_resid: 0, bsuos: 1, ro: 2, fit: 3, cm: 4, ncc_eii: 5, nuclear_rab: 6, aahedc: 7 };

const num = (x) => { const v = parseFloat(String(x).replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
const round2 = (n) => Math.round(n * 100) / 100;

/* ---- Reference lookups ---- */
const duos = (dno, yr, idx) => {
  const d = N.DUOS[dno] && N.DUOS[dno][yr];
  return d ? { value: d[idx], source: `DUoS ${yr} (Band 2 LV HH reference)` } : { value: null };
};
const refDuosFixed = (dno, yr) => {
  const d = N.DUOS[dno] && N.DUOS[dno][yr];
  // A published zero is a real value, not a missing one, but flag it as worth checking.
  return d ? { value: d[3], source: `DUoS Fixed ${yr}`, isEstimate: d[3] === 0 } : { value: null };
};
const nccVal = (yr, key) => {
  const a = N.NCC[yr];
  if (!a) return { value: null };
  return { value: a[NCC_MAP[key]], source: `National non-commodity schedule ${yr}` };
};
const refTnuos = (yr, opt) => {
  if (opt && opt.site === "kva") {
    return { value: null, source: "kVA-banded TNUoS — check the NESO statement for the site's MIC band", isEstimate: true };
  }
  const t = N.TBANDS[yr];
  if (!t) return { value: null };
  if (t.t === "nhh") return { value: t.nhh, source: t.src, isEstimate: /Est|Interp/i.test(t.src) };
  // Banded TNUoS depends on the site's own capacity band. Without it we are guessing,
  // so the value is returned as an assumption and never drives a red verdict.
  const assumed = !(opt && opt.band != null);
  const band = assumed ? 1 : opt.band;
  return {
    value: [t.l1, t.l2, t.l3, t.l4][band],
    source: `${t.src} (LV${band + 1})${assumed ? " — band assumed, confirm the site's MIC band" : ""}`,
    isEstimate: assumed || /Est|Draft/i.test(t.src),
  };
};

export const CHARGES = [
  { key: "dist_fixed", label: "Distribution Fixed Charge", unit: "p/day", ref: (d, y) => refDuosFixed(d, y) },
  { key: "duos_red", label: "DUoS Red unit", unit: "p/kWh", ref: (d, y) => duos(d, y, 0) },
  { key: "duos_amber", label: "DUoS Amber unit", unit: "p/kWh", ref: (d, y) => duos(d, y, 1) },
  { key: "duos_green", label: "DUoS Green unit", unit: "p/kWh", ref: (d, y) => duos(d, y, 2) },
  { key: "tnuos_fixed", label: "TNUoS Transmission", unit: "p/site/day", ref: (d, y, o) => refTnuos(y, o) },
  { key: "bsuos", label: "BSUoS", unit: "p/kWh", ref: (d, y) => nccVal(y, "bsuos") },
  { key: "ncc_eii", label: "NCC / EII", unit: "p/kWh", ref: (d, y) => nccVal(y, "ncc_eii") },
  { key: "nuclear_rab", label: "Nuclear RAB Levy", unit: "p/kWh", ref: (d, y) => nccVal(y, "nuclear_rab") },
  { key: "aahedc", label: "AAHEDC", unit: "p/kWh", ref: (d, y) => nccVal(y, "aahedc") },
  { key: "ro", label: "Renewables Obligation", unit: "p/kWh", ref: (d, y) => nccVal(y, "ro") },
  // The capacity trio has no national schedule — it is site-specific, so these are
  // validated arithmetically and against measured demand rather than a published rate.
  { key: "capacity", label: "Capacity Charge (ASC)", unit: "p/kVA/day",
    ref: () => ({ value: null, source: "billed on Agreed Supply Capacity — validate arithmetically and against measured max demand" }) },
  { key: "excess_capacity", label: "Excess Capacity Charge", unit: "p/kVA/day",
    ref: () => ({ value: null, source: "measured max demand above ASC — commonly recoverable" }) },
  { key: "reactive_capacity", label: "Reactive Capacity Charge", unit: "p/kVArh",
    ref: () => ({ value: null, source: "reactive power above DNO threshold" }) },
];

export function getReferenceRate(dnoId, tariffYear, chargeType, opt) {
  const def = CHARGES.find((c) => c.key === chargeType);
  if (!def) return { value: null, source: "unknown charge" };
  return def.ref(dnoId, tariffYear, opt) || { value: null };
}

/** DNO from the MPAN distribution id (first two digits of the top line), else postcode. */
export function resolveDno(input) {
  const s = (input || "").trim().toUpperCase().replace(/\s/g, "");
  const m = s.match(/^(\d{2})/);
  if (m) { const d = N.DNOS.find((x) => x.id === m[1]); if (d) return d; }
  const pa = s.match(/^[A-Z]{1,2}/);
  if (pa) for (const d of N.DNOS) for (const p of d.pc) if (s.startsWith(p)) return d;
  return null;
}

/**
 * Row-tuple parser. Anchors on the rate-unit token and reads the rate as the number
 * immediately before it — never the first number after the label.
 */
export function parseElecRows(T) {
  const RUNIT = /([\d,]+(?:\.\d+)?)\s*(p\/kVA\/day|p\/kVArh|p\/kWh|p\/day|p\/site\/day)/i;
  const LABELS = [
    ["dist_fixed", /distribution fixed(?: charge)?/i],
    ["tnuos_fixed", /transmission fixed charge|tnuos/i],
    ["excess_capacity", /excess capacity/i],
    ["reactive_capacity", /reactive (?:capacity|power)/i],
    // Negative lookbehind so "excess capacity charge" is not read as the base charge.
    ["capacity", /(?<!excess )(?<!reactive )capacity charge/i],
    ["nuclear_rab", /nuclear rab(?: levy)?|rab levy/i],
    ["ncc_eii", /network charging comp\w*|british industry supercharger|\bncc\b|\beii\b/i],
    ["bsuos", /bsuos/i],
    ["aahedc", /aahedc/i],
    ["ro", /renewables? obligation/i],
    ["duos_red", /duos red|red (?:band|unit|rate)/i],
    ["duos_amber", /duos amber|amber (?:band|unit|rate)/i],
    ["duos_green", /duos green|green (?:band|unit|rate)/i],
    ["day_unit", /day (?:unit|rate|consumption|units?)/i],
    ["night_unit", /night (?:unit|rate|consumption|units?)/i],
    ["standing", /standing charge/i],
    ["ccl", /climate change levy|\bccl\b/i],
  ];
  const found = [];
  LABELS.forEach(([key, re]) => { const m = re.exec(T); if (m) found.push({ key, idx: m.index, len: m[0].length, label: m[0].trim() }); });
  found.sort((a, b) => a.idx - b.idx);

  return found.map((f, i) => {
    const start = f.idx + f.len;
    const end = i + 1 < found.length ? found[i + 1].idx : Math.min(T.length, start + 180);
    const win = T.slice(start, end);
    const ru = RUNIT.exec(win);
    const rate = ru ? num(ru[1]) : null;
    const rateUnit = ru ? ru[2].toLowerCase() : null;
    const q = /([\d,]+(?:\.\d+)?)\s*(days?|kWh|kVArh|kVA)\b/i.exec(win);
    let subtotal = null, vat = null, total = null;
    if (ru) {
      const after = win.slice(ru.index + ru[0].length);
      const amts = [];
      const rx = /(-?[\d,]+\.\d{2})\b/g;
      let mm;
      while ((mm = rx.exec(after)) !== null) amts.push(num(mm[1]));
      [subtotal, vat, total] = [amts[0] ?? null, amts[1] ?? null, amts[2] ?? null];
    }
    return {
      key: f.key, label: f.label,
      quantity: q ? num(q[1]) : null,
      qtyUnit: q ? q[2].toLowerCase().replace(/s$/, "") : null,
      rate, rateUnit, subtotal, vat, total,
    };
  });
}

/** Expected subtotal for a row, from its rate unit. */
function expectedSubtotal(row, bill) {
  const rate = row.rate;
  if (rate == null) return null;
  const days = bill.billDays ?? null;
  switch ((row.rateUnit || "").toLowerCase()) {
    case "p/day":
    case "p/site/day":
      return days == null ? null : round2((days * rate) / 100);
    case "p/kva/day":
      return days == null || row.quantity == null ? null : round2((row.quantity * rate * days) / 100);
    case "p/kwh":
    case "p/kvarh":
      return row.quantity == null ? null : round2((row.quantity * rate) / 100);
    default:
      return null;
  }
}

/**
 * Arithmetic reconciliation — no reference data required.
 * Finds supplier arithmetic errors such as a line with a subtotal but zero VAT.
 */
export function reconcile(bill) {
  const rows = bill.rows || [];
  const vatRate = (bill.vat_rate ?? 20) / 100;
  const findings = [];
  const TOL = 0.02;   // rounding tolerance in pounds

  const checked = rows.map((row) => {
    const exp = expectedSubtotal(row, bill);
    const diff = exp == null || row.subtotal == null ? null : Math.abs(exp - row.subtotal);
    const subOk = diff == null ? null : diff <= TOL;
    if (subOk === false) {
      // HH bills are built from ~1,500 half-hourly amounts each rounded to the penny, so a
      // few pence of drift on a large line is expected. That is noted as rounding, not
      // asserted as a defect — mixing trivial rounding into a claim beside a genuine error
      // (like a zero-VAT line) weakens the credible finding.
      const rounding = diff <= Math.max(0.10, Math.abs(row.subtotal) * 0.0005);
      findings.push({
        severity: rounding ? "amber" : "red",
        type: rounding ? "rounding difference" : "rate-quantity mismatch",
        line: row.label,
        detail: rounding
          ? `Printed £${row.subtotal} vs £${exp} from ${row.quantity} × ${row.rate}${row.rateUnit} — a ${round2(diff * 100)}p difference, consistent with half-hourly rounding.`
          : `Printed subtotal £${row.subtotal} but ${row.quantity ?? "?"} × ${row.rate}${row.rateUnit} works out at £${exp}.`,
        impact: rounding ? null : round2((row.subtotal ?? 0) - exp),
      });
    }
    // VAT is checked per line: a subtotal with no VAT is the classic defect.
    let vatOk = null;
    if (row.subtotal != null && row.vat != null) {
      const expVat = round2(row.subtotal * vatRate);
      vatOk = Math.abs(expVat - row.vat) <= TOL;
      if (!vatOk) {
        findings.push({
          severity: "red", type: "VAT on line wrong", line: row.label,
          detail: `£${row.subtotal} at ${bill.vat_rate ?? 20}% should carry £${expVat} VAT, but £${row.vat} was charged.`,
          impact: round2(row.vat - expVat),
        });
      }
    }
    return { ...row, expected_subtotal: exp, subtotal_ok: subOk, vat_ok: vatOk };
  });

  /* ---- Totals block ---- */
  const sum = (f) => round2(rows.reduce((a, r) => a + (f(r) ?? 0), 0));
  const sumSub = sum((r) => r.subtotal), sumVat = sum((r) => r.vat);
  if (bill.subtotal != null && Math.abs(sumSub - bill.subtotal) > TOL) {
    findings.push({ severity: "red", type: "totals do not sum", line: "Subtotal",
      detail: `Lines add to £${sumSub} but the bill states £${bill.subtotal}.`, impact: round2(bill.subtotal - sumSub) });
  }
  if (bill.vat_total != null && Math.abs(sumVat - bill.vat_total) > TOL) {
    findings.push({ severity: "red", type: "totals do not sum", line: "VAT",
      detail: `Line VAT adds to £${sumVat} but the bill states £${bill.vat_total}.`, impact: round2(bill.vat_total - sumVat) });
  }
  if (bill.subtotal != null && bill.vat_total != null && bill.total != null) {
    const t = round2(bill.subtotal + bill.vat_total);
    if (Math.abs(t - bill.total) > TOL) {
      findings.push({ severity: "red", type: "totals do not sum", line: "Total",
        detail: `Subtotal plus VAT is £${t} but the bill states £${bill.total}.`, impact: round2(bill.total - t) });
    }
  }
  /* ---- Period and volume cross-checks ---- */
  if (bill.period_from && bill.period_to && bill.billDays != null) {
    const d = Math.round((new Date(bill.period_to) - new Date(bill.period_from)) / 86400000);
    if (Number.isFinite(d) && Math.abs(d - bill.billDays) > 1) {
      findings.push({ severity: "amber", type: "days do not match period", line: "Billing period",
        detail: `Billed ${bill.billDays} days but the period ${bill.period_from} to ${bill.period_to} is ${d} days.` });
    }
  }
  if (bill.day_kwh != null && bill.night_kwh != null && bill.consumption_kwh != null) {
    const dn = round2(bill.day_kwh + bill.night_kwh);
    if (Math.abs(dn - bill.consumption_kwh) > 1) {
      findings.push({ severity: "amber", type: "levy kWh does not match day + night", line: "Consumption",
        detail: `Day plus night is ${dn} kWh but levies are charged on ${bill.consumption_kwh} kWh.` });
    }
  }

  const reds = findings.filter((f) => f.severity === "red");
  return {
    rows: checked, findings,
    verdict: reds.length ? "red" : findings.length ? "amber" : "green",
    // Only arithmetic defects carry a defensible cash figure; amber items need review.
    total_impact: round2(reds.reduce((a, f) => a + (f.impact ?? 0), 0)),
  };
}

/** Compare each printed rate to the published schedule for that DNO and year. */
export function compareToReference(bill, dnoId, year, opt = {}) {
  const rows = bill.rows || [];
  return CHARGES.map((def) => {
    const row = rows.find((r) => r.key === def.key);
    const ref = getReferenceRate(dnoId, year, def.key, opt);
    const billed = row ? row.rate : null;
    let status = "n/a", variance = null;
    if (billed == null) {
      status = "n/a";
    } else if (ref.value == null || ref.value === 0) {
      // A zero in the schedule means "not published for this area/year", not "should be
      // zero". Treating it as a reference produced a false green on a real 140p charge.
      status = "no-reference";
    } else {
      variance = round2(billed - ref.value);
      const pct = Math.abs(variance / ref.value);
      const raw = pct <= 0.02 ? "green" : pct <= 0.10 ? "amber" : "red";
      // An assumed or estimated reference can flag for review but must never assert a
      // defect — that is how apples-to-oranges comparisons become false claims.
      status = ref.isEstimate && raw === "red" ? "review" : raw;
    }
    return {
      key: def.key, label: def.label, unit: def.unit,
      billed, reference: ref.value, source: ref.source ?? null,
      isEstimate: !!ref.isEstimate, variance, status,
      // Only a firm reference mismatch is evidence; everything else needs a human.
      evidential: status === "red" && !ref.isEstimate,
    };
  }).filter((c) => c.billed != null || c.reference != null);
}

/**
 * Pull the bill-level fields out of raw bill text: fuel, MPAN top line, billing days,
 * day/night kWh, capacity and the stated totals. Ported from the handoff's parseBillText.
 *
 * Every field it cannot find is left null rather than guessed, and the caller is told
 * which fields were found, because an extracted figure that is silently wrong would feed
 * straight into a reconciliation finding.
 */
export function extractBillFields(raw) {
  const T = (" " + String(raw || "") + " ").replace(/\s+/g, " ");
  const out = { fuel: null, rows: [] };

  const isGas = /MPRN/i.test(T) || /\bm3\b|m³/.test(T)
    || /cadent|wales *& *west|northern gas|\bsgn\b|national grid gas|scotia gas/i.test(T);
  out.fuel = isGas ? "gas" : "elec";

  // Tariff year: an explicit "2026/27", else the charging year a bill date falls in.
  // Charging years run April to March, so a January 2027 bill belongs to 2026/27.
  let m = T.match(/\b(20\d\d\s?\/\s?\d{2})\b/);
  if (m) out.tariff_year = m[1].replace(/\s/g, "");
  else {
    m = T.match(/(\d{2})\/(\d{2})\/(20\d\d)/);
    if (m) {
      const y = +m[3], mo = +m[2];
      const start = mo >= 4 ? y : y - 1;
      out.tariff_year = `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
    }
  }

  // Billing period. An explicit "period ... to ..." is used first: a bill also carries an
  // invoice date and a due date, and taking the earliest and latest dates on the page
  // stretches a 31-day period to include them. Counted inclusively (1st–31st = 31 days).
  const toDate = (d, mo, y) => new Date(Date.UTC(+y, +mo - 1, +d));
  const pm = T.match(/(?:supply period|billing period|period|from)[^0-9]{0,20}(\d{2})\/(\d{2})\/(20\d\d)\s*(?:to|-|–|until)\s*(\d{2})\/(\d{2})\/(20\d\d)/i);
  if (pm) {
    const a = toDate(pm[1], pm[2], pm[3]), z = toDate(pm[4], pm[5], pm[6]);
    const dd = Math.round((z - a) / 86400000) + 1;
    if (dd > 0 && dd <= 400) {
      out.billDays = dd;
      out.period_from = a.toISOString().slice(0, 10);
      out.period_to = z.toISOString().slice(0, 10);
    }
  }
  const dts = [...T.matchAll(/(\d{2})\/(\d{2})\/(20\d\d)/g)]
    .map((x) => new Date(Date.UTC(+x[3], +x[2] - 1, +x[1])))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (out.billDays == null && dts.length >= 2) {
    const first = dts[0], last = dts[dts.length - 1];
    const dd = Math.round((last - first) / 86400000) + 1;
    if (dd >= 25 && dd <= 40) {
      out.billDays = dd;
      out.period_from = first.toISOString().slice(0, 10);
      out.period_to = last.toISOString().slice(0, 10);
    }
  }

  if (isGas) {
    m = T.match(/MPRN[^0-9]{0,10}(\d{6,11})/i);
    if (m) out.mprn = m[1];
    const km = T.match(/=\s*([\d,]+\.?\d*)\s*kWh/i);
    out.consumption_kwh = km ? num(km[1]) : null;
  } else {
    // MPAN top line: the two-digit distribution id that decides which DUoS schedule applies.
    m = T.match(/\b(\d{2}\s?\d{4}\s?\d{4}\s?\d{3})\b/);
    if (m) out.mpan_prefix = m[1].replace(/\D/g, "").slice(0, 2);
    else {
      m = T.match(/MPAN[^0-9]{0,10}(\d[\d ]{10,24}\d)/i);
      if (m) out.mpan_prefix = m[1].replace(/\D/g, "").slice(-13, -11);
    }
    out.rows = parseElecRows(T);

    // Day and night volumes come from their own charge rows where present, which is more
    // reliable than a loose "day ... kWh" match that can catch a header or a total.
    const dayRow = out.rows.find((r) => r.key === "day_unit" && r.qtyUnit === "kwh");
    const nightRow = out.rows.find((r) => r.key === "night_unit" && r.qtyUnit === "kwh");
    out.day_kwh = dayRow ? dayRow.quantity : null;
    out.night_kwh = nightRow ? nightRow.quantity : null;

    // Levy kWh: the quantity the per-kWh levies are charged on. Taken from a levy row so
    // the day+night cross-check compares two genuinely independent numbers.
    const levy = out.rows.find((r) => ["nuclear_rab", "ncc_eii", "ccl", "ro", "bsuos"].includes(r.key) && r.qtyUnit === "kwh");
    out.consumption_kwh = levy ? levy.quantity
      : (out.day_kwh != null && out.night_kwh != null ? round2(out.day_kwh + out.night_kwh) : null);

    if (out.billDays == null) {
      const dr = out.rows.find((r) => r.qtyUnit === "day");
      if (dr) out.billDays = dr.quantity;
    }
    const am = T.match(/(?:agreed supply capacity|supply capacity|\basc\b)[^0-9]{0,12}([\d,]+\.?\d*)\s*kVA/i);
    if (am) out.asc_kva = num(am[1]);
  }

  // Totals. Prefer explicit "total VAT" phrasing: a bare "VAT" usually matches the column
  // header first and would read the next row's number as the VAT total.
  const sm = T.match(/sub[- ]?total[^0-9£]{0,12}£?\s?([\d,]+\.\d{2})/i);
  if (sm) out.subtotal = num(sm[1]);
  const vm = T.match(/(?:total vat|vat total|vat amount|vat @\s*\d+%)[^0-9£]{0,12}£?\s?([\d,]+\.\d{2})/i);
  if (vm) out.vat_total = num(vm[1]);
  const tm = T.match(/(?:period total|invoice total|total amount due|total due|total payable|amount due)[^0-9£]{0,12}£?\s?([\d,]+\.\d{2})/i);
  if (tm) out.total = num(tm[1]);
  const vr = T.match(/vat[^0-9]{0,12}(\d{1,2}(?:\.\d+)?)\s*%/i) || T.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*vat/i);
  out.vat_rate = vr ? num(vr[1]) : 20;

  const fields = ["mpan_prefix", "tariff_year", "billDays", "day_kwh", "night_kwh", "consumption_kwh", "subtotal", "vat_total", "total"];
  out.found = fields.filter((k) => out[k] != null);
  out.missing = fields.filter((k) => out[k] == null && !(isGas && ["mpan_prefix", "day_kwh", "night_kwh"].includes(k)));
  return out;
}
