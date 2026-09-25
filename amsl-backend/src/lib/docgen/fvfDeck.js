/**
 * Client decks built from a Fixed vs Flex comparison, with native (editable) PowerPoint
 * charts. Two variants:
 *   proposal  the client proposal: headline KPIs, profile, annual cost, market, price
 *             build-up, agreement terms, next steps
 *   board     a board-pack version: market conditions, DUoS profile, the fixed/flex
 *             choice explained, the numbers inc VAT, what's included, onboarding terms
 */
import PptxGenJS from "pptxgenjs";
import { brand, gbp0, kwh0, pct, rate, longDate, today, MARKET_BLUE } from "./common.js";

const W = 13.333, H = 7.5;
const INK = "1E293B", MUTED = "64748B", LIGHT = "F1F5F9", GREEN = "0E7C7B";

function setup(r, variant) {
  const b = brand();
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = b.company; pptx.company = b.company;
  pptx.title = `${r.comparison.client_name} — Fixed vs Flex`;
  pptx.defineSlideMaster({
    title: "BODY", background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.12, fill: { color: b.primary } } },
      { text: { text: `${r.comparison.client_name}  |  ${b.company}`, options: { x: 0.5, y: H - 0.45, w: 9, h: 0.3, fontSize: 9, color: MUTED, fontFace: "Calibri" } } },
    ],
    slideNumber: { x: W - 1, y: H - 0.45, w: 0.5, h: 0.3, fontSize: 9, color: MUTED, fontFace: "Calibri" },
  });
  return { pptx, b, variant };
}

const heading = (s, t, sub) => {
  s.addText(t, { x: 0.5, y: 0.35, w: W - 1, h: 0.6, fontSize: 26, bold: true, color: INK, fontFace: "Calibri" });
  if (sub) s.addText(sub, { x: 0.5, y: 0.92, w: W - 1, h: 0.4, fontSize: 13, color: MUTED, fontFace: "Calibri" });
};
function tile(s, x, y, w, h, value, label, sub, color) {
  s.addShape("rect", { x, y, w, h, fill: { color: LIGHT }, line: { color: LIGHT } });
  s.addText(value, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: h * 0.45, fontSize: 30, bold: true, color: color || INK, fontFace: "Calibri", valign: "middle" });
  s.addText(label, { x: x + 0.2, y: y + h * 0.52, w: w - 0.4, h: 0.35, fontSize: 12.5, bold: true, color: INK, fontFace: "Calibri" });
  if (sub) s.addText(sub, { x: x + 0.2, y: y + h * 0.52 + 0.33, w: w - 0.4, h: h * 0.48 - 0.45, fontSize: 10.5, color: MUTED, fontFace: "Calibri", valign: "top" });
}
function box(s, x, y, w, h, heading_, body, fill = "FFF7EA", border) {
  s.addShape("rect", { x, y, w, h, fill: { color: fill }, line: { color: border || fill } });
  s.addText([
    ...(heading_ ? [{ text: heading_, options: { bold: true, fontSize: 13, color: INK, breakLine: true } }] : []),
    { text: body, options: { fontSize: 12, color: INK } },
  ], { x: x + 0.25, y: y + 0.15, w: w - 0.5, h: h - 0.3, fontFace: "Calibri", valign: "top", paraSpaceAfter: 4 });
}
const bulletsText = (items, size = 13) => items.map((t) => ({ text: t, options: { bullet: { indent: 16 }, fontSize: size, color: INK, breakLine: true, paraSpaceAfter: 6 } }));

function cover(ctx, r, heroTitle, heroSub, lines) {
  const { pptx, b } = ctx;
  const s = pptx.addSlide();
  s.background = { color: b.primary };
  s.addShape("rect", { x: 0, y: H - 0.18, w: W, h: 0.18, fill: { color: b.accent }, line: { color: b.accent } });
  s.addText(heroTitle, { x: 0.7, y: 1.3, w: 8.2, h: 1.1, fontSize: 44, bold: true, color: "FFFFFF", fontFace: "Calibri" });
  s.addText(heroSub, { x: 0.7, y: 2.35, w: 8.2, h: 0.6, fontSize: 20, color: "CBD5E1", fontFace: "Calibri" });
  s.addText(lines.map((t, i) => ({ text: t, options: { breakLine: true, fontSize: i === 0 ? 18 : 12.5, bold: i === 0, color: i === 0 ? "FFFFFF" : "CBD5E1" } })),
    { x: 0.7, y: 3.4, w: 8.2, h: 2.2, fontFace: "Calibri", valign: "top", paraSpaceAfter: 6 });
  return s;
}

function annualChart(ctx, s, r, x, y, w, h, basis = "net") {
  const ys = r.years.filter((q) => q.comparable);
  if (!ys.length) return;
  const v = (sc) => (basis === "net" ? sc.subtotal_ex_ccl_vat : sc.total_inc_vat);
  s.addChart("bar", [
    { name: "Fixed Renewal", labels: ys.map((q) => `Year ${q.year_no}`), values: ys.map((q) => v(q.fixed)) },
    { name: "Flex", labels: ys.map((q) => `Year ${q.year_no}`), values: ys.map((q) => v(q.flex)) },
  ], {
    x, y, w, h, barDir: "col", barGrouping: "clustered", chartColors: [MARKET_BLUE, ctx.b.accent],
    showLegend: true, legendPos: "b", legendFontSize: 11, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10,
    valAxisLabelFormatCode: "£#,##0", showValue: true, dataLabelFormatCode: "£#,##0", dataLabelFontSize: 9,
    valGridLine: { color: "E2E8F0", size: 0.5 },
  });
}

function costTable(r, basis = "net") {
  const hdr = (t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: "1F3A5F" } } });
  const rows = [[hdr("Year"), hdr("Fixed"), hdr("Flex"), hdr("Saving")]];
  const v = (sc) => (basis === "net" ? sc.subtotal_ex_ccl_vat : sc.total_inc_vat);
  r.years.filter((y) => y.comparable).forEach((y) => {
    const sav = v(y.fixed) - v(y.flex);
    rows.push([`Year ${y.year_no}`, gbp0(v(y.fixed)), gbp0(v(y.flex)), { text: `${gbp0(sav)} (${pct((sav / v(y.fixed)) * 100)})`, options: { color: sav >= 0 ? GREEN : "B91C1C", bold: true } }]);
  });
  if (r.term) {
    const f = basis === "net" ? r.term.fixed_net : r.term.fixed_inc, x = basis === "net" ? r.term.flex_net : r.term.flex_inc;
    rows.push([{ text: `${r.term.years}-Year Total`, options: { bold: true } }, { text: gbp0(f), options: { bold: true } }, { text: gbp0(x), options: { bold: true } },
      { text: `${gbp0(f - x)} (${pct(((f - x) / f) * 100)})`, options: { bold: true, color: f - x >= 0 ? GREEN : "B91C1C" } }]);
  }
  r.years.filter((y) => y.flex.priced && !y.has_fixed).forEach((y) => rows.push([`Year ${y.year_no} (flex only)`, "—", gbp0(v(y.flex)), "—"]));
  return rows;
}

function consumptionSlide(ctx, r) {
  const c = r.comparison;
  const s = ctx.pptx.addSlide({ masterName: "BODY" });
  heading(s, "Your Consumption Profile", c.consumption_period ? `From ${c.consumption_period}${c.mpan ? ` — MPAN ${c.mpan}` : ""}` : "The same 12 months of consumption is used for every option");
  if (r.monthly.length) {
    s.addChart("bar", [
      { name: "Day", labels: r.monthly.map((m) => m.month_label), values: r.monthly.map((m) => m.day_kwh || 0) },
      { name: "Night", labels: r.monthly.map((m) => m.month_label), values: r.monthly.map((m) => m.night_kwh || 0) },
    ], { x: 0.5, y: 1.5, w: 8.2, h: 5.2, barDir: "col", barGrouping: "stacked", chartColors: ["1F3A5F", "93C5FD"],
      showLegend: true, legendPos: "b", showTitle: true, title: "Monthly consumption (kWh)", titleFontSize: 12,
      catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, valAxisLabelFormatCode: "#,##0", valGridLine: { color: "E2E8F0", size: 0.5 } });
  } else if (c.duos_red_kwh != null) {
    s.addChart("doughnut", [{ name: "DUoS band", labels: ["Red", "Amber", "Green"], values: [c.duos_red_kwh, c.duos_amber_kwh, c.duos_green_kwh] }],
      { x: 0.5, y: 1.5, w: 8.2, h: 5.2, chartColors: ["DC2626", "F59E0B", "16A34A"], showLegend: true, legendPos: "r", showPercent: true, showTitle: true, title: "Consumption by DUoS band", titleFontSize: 12 });
  }
  const items = [["Total annual", c.annual_kwh], ["Day", c.day_kwh], ["Night", c.night_kwh], ["DUoS Red", c.duos_red_kwh], ["DUoS Amber", c.duos_amber_kwh], ["DUoS Green", c.duos_green_kwh]].filter(([, v]) => v != null);
  items.forEach(([l, v], i) => {
    const y = 1.5 + i * 0.85;
    s.addShape("rect", { x: 9.1, y, w: 3.7, h: 0.72, fill: { color: i === 0 ? ctx.b.primary : LIGHT }, line: { color: i === 0 ? ctx.b.primary : LIGHT } });
    s.addText([{ text: `${kwh0(v)} kWh`, options: { bold: true, fontSize: 16, color: i === 0 ? "FFFFFF" : INK, breakLine: true } }, { text: l, options: { fontSize: 10.5, color: i === 0 ? "CBD5E1" : MUTED } }],
      { x: 9.3, y, w: 3.4, h: 0.72, fontFace: "Calibri", valign: "middle" });
  });
  return s;
}

function marketSlide(ctx, r, title) {
  const m = r.market;
  if (!m?.seasons?.length) return null;
  const s = ctx.pptx.addSlide({ masterName: "BODY" });
  heading(s, title, `${m.basket_name} position${m.as_at ? ` — ${longDate(m.as_at)}` : ""}`);
  const pts = m.seasons.filter((x) => x.market != null);
  s.addChart("line", [
    { name: "Live market (£/MWh)", labels: pts.map((x) => x.short), values: pts.map((x) => x.market) },
    { name: "Consortium locked-in (£/MWh)", labels: pts.map((x) => x.short), values: pts.map((x) => x.locked ?? x.market) },
  ], { x: 0.5, y: 1.5, w: 7.8, h: 5.2, chartColors: [MARKET_BLUE, ctx.b.accent], lineSize: 2.5, lineDataSymbol: "circle", lineDataSymbolSize: 7,
    showLegend: true, legendPos: "b", catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, valAxisLabelFormatCode: "£#,##0", valGridLine: { color: "E2E8F0", size: 0.5 } });
  const n = m.near;
  if (n?.market && n?.locked) {
    const sv = Math.round(((n.market - n.locked) / n.market) * 100);
    s.addShape("rect", { x: 8.7, y: 1.5, w: 4.1, h: 1.9, fill: { color: ctx.b.primary }, line: { color: ctx.b.primary } });
    s.addText([{ text: `${sv}%`, options: { fontSize: 40, bold: true, color: "FFFFFF", breakLine: true } },
      { text: `${n.label} below market: ${Math.round(n.hedged_pct * 100)}% hedged at £${n.locked.toFixed(2)}/MWh vs a live market of £${n.market.toFixed(2)}/MWh`, options: { fontSize: 11, color: "CBD5E1" } }],
      { x: 8.9, y: 1.55, w: 3.8, h: 1.8, fontFace: "Calibri", valign: "middle" });
  }
  const pts2 = [
    r.comparison.market_note,
    m.hedged_pct != null ? `The consortium is ${Math.round(m.hedged_pct * 100)}% hedged overall at a blended £${m.locked_avg?.toFixed(2)}/MWh, having bought ahead of the volatility rather than at the point of consumption.` : null,
    "A fixed renewal prices today's near-curve premium into every unit of the term; flex draws on volume already bought.",
  ].filter(Boolean);
  s.addText(bulletsText(pts2, 11.5), { x: 8.7, y: 3.6, w: 4.1, h: 3.1, fontFace: "Calibri", valign: "top" });
  return s;
}

function buildUpSlide(ctx, r) {
  const c = r.comparison;
  const s = ctx.pptx.addSlide({ masterName: "BODY" });
  heading(s, "How Each Price Is Built", "Fixed: one all-in unit rate. Flex: a transparent stack of contractual fees.");
  const fy = r.years.find((y) => y.has_fixed);
  const xs = r.years.filter((y) => y.flex.priced);
  const card = (x, t, rows, color) => {
    s.addShape("rect", { x, y: 1.5, w: 6, h: 0.5, fill: { color }, line: { color } });
    s.addText(t, { x: x + 0.2, y: 1.5, w: 5.6, h: 0.5, fontSize: 14, bold: true, color: "FFFFFF", fontFace: "Calibri", valign: "middle" });
    s.addTable(rows.map(([a, v]) => [{ text: a, options: { color: INK } }, { text: v, options: { align: "right", bold: true, color: INK } }]),
      { x, y: 2.05, w: 6, colW: [3.3, 2.7], fontSize: 11, fontFace: "Calibri", border: { type: "solid", pt: 0.5, color: "E2E8F0" }, fill: { color: "FFFFFF" }, rowH: 0.36 });
  };
  const rateOf = (sc, re) => sc?.lines.find((l) => re.test(l.label))?.rate;
  if (fy) {
    const ys = r.years.filter((y) => y.has_fixed);
    card(0.5, `Fixed Renewal${c.fixed_quote_ref ? ` — Quote ${c.fixed_quote_ref}` : ""}`, [
      ["Day / Night unit rate", ys.map((y) => `${rate(rateOf(y.fixed, /^day/i), 2)}p / ${rate(rateOf(y.fixed, /^night/i), 2)}p`).join("  ·  ") + " per kWh"],
      ["Standing charge", `${rate(rateOf(fy.fixed, /standing/i), 2)}p/day`],
      ["Transmission & distribution", `${rate(rateOf(fy.fixed, /transmission/i), 2)}p + ${rate(rateOf(fy.fixed, /distribution/i), 2)}p per day`],
      ["Capacity charge", `${rate(rateOf(fy.fixed, /^capacity/i), 2)}p/kVA/day${c.capacity_kva ? ` (${c.capacity_kva} kVA)` : ""}`],
      ["Nuclear RAB + Network Charging Comp.", `${rate(rateOf(fy.fixed, /nuclear/i), 2)}p + ${rate(rateOf(fy.fixed, /network charging/i), 2)}p per kWh`],
      ["Feed-in Tariff", `${rate(rateOf(fy.fixed, /feed/i), 2)}p per kWh`],
    ].filter(([, v]) => !/—p/.test(v)), "1F3A5F");
  }
  if (xs.length) {
    const byYear = (re) => xs.map((y) => rate(rateOf(y.flex, re), 2));
    const uniq = (arr) => ([...new Set(arr)].length === 1 ? arr[0] : arr.join("p / "));
    card(6.85, `Flex${c.flex_supplier ? ` — ${c.flex_supplier}` : ""}`, [
      [`Commodity cost (Yr ${xs.map((y) => y.year_no).join("/")})`, `${byYear(/^commodity/i).join("p / ")}p per kWh`],
      ["Non-commodity cost", `${uniq(byYear(/non.?commodity/i))}p per kWh`],
      ["Consortium management fee", `${uniq(byYear(/consortium management|fct management/i))}p per kWh`],
      ["Supplier management fee", `${uniq(byYear(/supplier management|platform|evolve/i))}p per kWh`],
      ["Standing / transmission / distribution", "Same network rates as fixed"],
      ["HH DUoS Red / Amber / Green", `${rate(rateOf(xs[0].flex, /duos red/i), 3)}p / ${rate(rateOf(xs[0].flex, /duos amber/i), 3)}p / ${rate(rateOf(xs[0].flex, /duos green/i), 3)}p`],
    ], ctx.b.accent);
  }
  return s;
}

function stepsSlide(ctx, r, title, sub) {
  const s = ctx.pptx.addSlide({ masterName: "BODY" });
  heading(s, title, sub);
  const steps = [["Credit check & insurance", "The supplier confirms it can offer terms and whether any security is needed."],
    ["Contract drawn up & signed", "Your agreement sets out the term, fees and supply start date."],
    ["HH data reviewed & modelled", "Your half-hourly data is modelled against the consortium's buying strategy."],
    ["Bill analysis & strategy", "A full review of your bills and the onboarding strategy agreed with the other members."]];
  steps.forEach(([t, d], i) => {
    const x = 0.5 + i * 3.15;
    s.addShape("ellipse", { x: x + 1.05, y: 1.7, w: 0.9, h: 0.9, fill: { color: ctx.b.primary }, line: { color: ctx.b.primary } });
    s.addText(String(i + 1), { x: x + 1.05, y: 1.7, w: 0.9, h: 0.9, fontSize: 24, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: "Calibri" });
    s.addText(t, { x, y: 2.8, w: 3, h: 0.5, fontSize: 14, bold: true, color: INK, align: "center", fontFace: "Calibri" });
    s.addText(d, { x, y: 3.3, w: 3, h: 1.2, fontSize: 11.5, color: MUTED, align: "center", valign: "top", fontFace: "Calibri" });
  });
  const b = ctx.b;
  s.addText([{ text: b.contact || b.company, options: { bold: true, fontSize: 14, color: INK, breakLine: true } },
    { text: [b.contactTitle, b.company].filter(Boolean).join(", "), options: { fontSize: 11.5, color: MUTED, breakLine: true } },
    { text: [b.contactEmail || b.email, b.phone].filter(Boolean).join("  ·  "), options: { fontSize: 11.5, color: MUTED } }],
  { x: 0.5, y: 5.3, w: 12, h: 1.1, fontFace: "Calibri", align: "center" });
  return s;
}

export async function fvfDeck(r, { variant = "proposal" } = {}) {
  const ctx = setup(r, variant);
  const { pptx, b } = ctx;
  const c = r.comparison;
  const idLine = [c.account_ref && `Account ${c.account_ref}`, c.mpan && `MPAN ${c.mpan}`, c.site].filter(Boolean).join(" | ");
  const y1 = r.years.find((y) => y.comparable);

  if (variant === "board") {
    cover(ctx, r, "Fixed vs Flex:\nYour Energy Strategy", c.client_name, [
      `Prepared for the Board | ${longDate(today())}`, idLine, [b.contact, b.contactTitle && `${b.contactTitle}, ${b.company}`].filter(Boolean).join(" — "),
    ]);
    // Market conditions
    const s2 = pptx.addSlide({ masterName: "BODY" });
    heading(s2, "Market Conditions", "Why timing matters right now");
    box(s2, 0.5, 1.5, 7.4, 5.1, "Where the market is", [c.market_note, r.market ? "Further-dated seasons are comparatively cheap, which is where a staged, consortium strategy buys ahead." : null].filter(Boolean).join("\n\n") || "Wholesale gas and power remain volatile. A fixed contract locks in a single day's price for the whole term; buying across the curve spreads that risk.");
    if (r.market?.near?.market) {
      const n = r.market.near;
      tile(s2, 8.3, 1.5, 4.5, 2.4, `£${n.market.toFixed(2)}`, `UK power — ${n.label}`, "Today's live market, £/MWh", MARKET_BLUE);
      tile(s2, 8.3, 4.2, 4.5, 2.4, `£${(n.locked ?? 0).toFixed(2)}`, "Consortium's hedged position", `~${Math.round(((n.market - n.locked) / n.market) * 100)}% below today's market price`, b.accent);
    }
    // Consumption with DUoS
    const s3 = consumptionSlide(ctx, r);
    if (c.duos_red_kwh != null && r.monthly.length) {
      s3.addText([{ text: "What Red / Amber / Green means", options: { bold: true, breakLine: true } },
        { text: "Red: peak network hours (weekday late afternoon) — the highest DUoS charge. Amber: shoulder hours. Green: off-peak, including weekends — the lowest.", options: {} }],
      { x: 0.5, y: 6.75, w: 12.3, h: 0.5, fontSize: 9.5, color: MUTED, fontFace: "Calibri" });
    }
    // Explainer
    const s4 = pptx.addSlide({ masterName: "BODY" });
    heading(s4, "Fixed vs Flex", "Two ways to buy the same energy");
    box(s4, 0.5, 1.5, 6, 5.1, "FIXED", "One rate, locked for the whole term: simple, predictable budgeting.\n\nThe rate is set once, at the point of signing, with no ability to benefit if markets fall afterwards.\n\nBest suited to businesses that value certainty above all else.", "EEF2F7");
    box(s4, 6.85, 1.5, 6, 5.1, "FLEX (via the consortium)", "Energy bought ahead on the forward curve alongside other members, smoothing out volatility rather than fixing a single spot rate.\n\nTransparent pricing, with monthly reviews, market updates and bill validation included.\n\nBest suited to businesses that can accept some variability for a lower overall cost.", "FFF7EA");
    // Numbers inc VAT
    const s5 = pptx.addSlide({ masterName: "BODY" });
    heading(s5, "Your Numbers", "Fixed renewal vs flex forecast, by year — figures inc VAT, as invoiced");
    s5.addTable(costTable(r, "inc"), { x: 0.5, y: 1.5, w: 7.6, colW: [2.2, 1.8, 1.8, 1.8], fontSize: 12, fontFace: "Calibri", border: { type: "solid", pt: 0.5, color: "E2E8F0" }, rowH: 0.45 });
    annualChart(ctx, s5, r, 8.4, 1.5, 4.5, 4.2, "inc");
    if (y1) box(s5, 0.5, 5.4, 7.6, 1.2, null, r.findings[0] || "", "ECFDF5", "A7F3D0");
    // What's included
    const s6 = pptx.addSlide({ masterName: "BODY" });
    heading(s6, "What's Included with Flex", "Ongoing service, not just a price");
    [["Monthly account reviews", "Your position and consumption reviewed every month."], ["Market updates & bill validation", "Know where prices are, and every invoice checked."],
     ["Meter upgrades", "Half-hourly metering upgrades on request."], ["100% green tariff", "Available, backed by REGO certificates."],
     ["Grant support", "Eligibility for government schemes checked during onboarding."], ["Consortium buying power", "Buy alongside other members on the forward curve."]]
      .forEach(([t, d], i) => tile(s6, 0.5 + (i % 3) * 4.15, 1.5 + Math.floor(i / 3) * 2.6, 3.95, 2.35, ["✓", "✓", "✓", "✓", "✓", "✓"][i], t, d, GREEN));
    // Onboarding terms
    const s7 = pptx.addSlide({ masterName: "BODY" });
    heading(s7, "Onboarding Terms", "Joining the consortium");
    const terms = [["Proposed flex start date", c.flex_start ? longDate(c.flex_start) : "To be confirmed"],
      ["One-off onboarding fee", c.onboarding_fee ? `£${Number(c.onboarding_fee).toLocaleString("en-GB")}, payable on signing` : "None"],
      ["Contract end date (flex)", c.flex_end ? longDate(c.flex_end) : "To be confirmed"]];
    terms.forEach(([l, v], i) => tile(s7, 0.5 + i * 4.15, 1.6, 3.95, 2.4, v, l, null, b.primary));
    stepsSlide(ctx, r, "Next Steps", "From decision to supply start");
    const s9 = pptx.addSlide();
    s9.background = { color: b.primary };
    s9.addText("Let's talk it through.", { x: 0.7, y: 2.6, w: 12, h: 1, fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Calibri" });
    s9.addText([b.contact, b.contactTitle, b.company, b.contactEmail || b.email].filter(Boolean).join("  ·  "), { x: 0.7, y: 3.7, w: 12, h: 0.6, fontSize: 16, color: "CBD5E1", fontFace: "Calibri" });
    return pptx.write({ outputType: "nodebuffer" });
  }

  // ---- Client proposal ----
  const hero = r.term ? `${Math.round(r.term.saving_pct)}%` : y1 ? `${Math.round(y1.saving_pct)}%` : "";
  const cs = cover(ctx, r, "FIXED vs FLEX", "Electricity Procurement Comparison", [c.client_name, idLine, `Prepared by ${c.prepared_by || b.company} | ${longDate(today())}`]);
  if (hero) {
    cs.addShape("rect", { x: 9.4, y: 1.5, w: 3.3, h: 3.3, fill: { color: "FFFFFF", transparency: 88 }, line: { color: "FFFFFF", transparency: 70 } });
    cs.addText([{ text: hero, options: { fontSize: 60, bold: true, color: "FFFFFF", breakLine: true } },
      { text: r.term ? `total saving with flex over the ${r.term.years}-year term (net of VAT & CCL)` : "year 1 saving with flex (net of VAT & CCL)", options: { fontSize: 12, color: "E2E8F0" } }],
    { x: 9.6, y: 1.6, w: 2.9, h: 3.1, fontFace: "Calibri", align: "center", valign: "middle" });
  }

  const s2 = pptx.addSlide({ masterName: "BODY" });
  heading(s2, "Executive Summary", "Renewing the fixed contract vs joining the flex consortium — same site, same 12 months of metered consumption");
  tile(s2, 0.5, 1.6, 3.95, 2.6, kwh0(c.annual_kwh), "Total annual consumption (kWh)", c.consumption_period || "");
  tile(s2, 4.7, 1.6, 3.95, 2.6, r.term ? gbp0(r.term.saving_net) : y1 ? gbp0(y1.saving_ex_ccl_vat) : "—", r.term ? `${r.term.years}-year saving with flex` : "Year 1 saving with flex", `Net of VAT & CCL, vs the ${r.term ? `${r.term.years}-year` : "1-year"} fixed renewal`, GREEN);
  if (r.market?.near) tile(s2, 8.9, 1.6, 3.95, 2.6, `${Math.round(r.market.near.hedged_pct * 100)}%`, `${r.market.near.label} already hedged`, r.market.near.locked ? `at £${r.market.near.locked.toFixed(2)}/MWh vs a live market of £${r.market.near.market.toFixed(2)}/MWh` : "", b.accent);
  else if (y1) tile(s2, 8.9, 1.6, 3.95, 2.6, pct(y1.saving_pct), "Year 1 difference", "flex vs 1-year fixed, net of VAT & CCL", b.accent);
  if (y1) box(s2, 0.5, 4.5, 12.35, 1.6, "The headline, in one line",
    `Switching to flex is forecast to cost ${gbp0(y1.flex.subtotal_ex_ccl_vat)} in Year 1 against ${gbp0(y1.fixed.subtotal_ex_ccl_vat)} on the fixed renewal — a ${pct(y1.saving_pct)} saving${r.term ? `, and ${pct(r.term.saving_pct)} across the full ${r.term.years}-year term` : ""}.${c.market_note ? ` ${c.market_note}` : ""}`);

  consumptionSlide(ctx, r);

  const s4 = pptx.addSlide({ masterName: "BODY" });
  heading(s4, "Fixed Renewal vs Flex — Annual Cost", "Figures net of VAT & CCL (levied equally on both, so excluded to isolate the true commercial difference)");
  annualChart(ctx, s4, r, 0.5, 1.5, 7.2, 5.2, "net");
  s4.addTable(costTable(r, "net"), { x: 8, y: 1.6, w: 4.85, colW: [1.35, 1.1, 1.1, 1.3], fontSize: 10.5, fontFace: "Calibri", border: { type: "solid", pt: 0.5, color: "E2E8F0" }, rowH: 0.42 });

  marketSlide(ctx, r, "Why Flex Wins Right Now");
  buildUpSlide(ctx, r);

  const s7 = pptx.addSlide({ masterName: "BODY" });
  heading(s7, "The Agreement You're Signing", c.agreement_ref ? `Consortium Customer Agreement — ${c.flex_supplier || ""} (${c.agreement_ref})` : "Consortium customer agreement — the key terms");
  const items = [
    ["Term", c.flex_start ? `Commences ${longDate(c.flex_start)}${c.flex_end ? `, initial term to ${longDate(c.flex_end)}` : ""}` : "Initial term as set out in the agreement"],
    ["Auto-extension", "Extends by further 12-month periods only if further volume is purchased ahead of the next trading seasons — no fixed end date beyond that"],
    ["Supplier", c.flex_supplier ? `${c.flex_supplier}, trading under the consortium framework` : "Licensed I&C supplier under the consortium framework"],
    ["Consortium manager", `${b.company}, trading on your behalf against pooled consortium capacity`],
    ["Included as standard", "Monthly account reviews, ongoing market updates, bill validation; meter upgrades and a 100% green tariff on request"],
    ["Grant support", "Eligibility for government schemes checked as part of onboarding"],
  ];
  items.forEach(([t, d], i) => {
    const x = 0.5 + (i % 2) * 6.2, y = 1.5 + Math.floor(i / 2) * 1.75;
    s7.addShape("ellipse", { x, y: y + 0.1, w: 0.6, h: 0.6, fill: { color: b.primary }, line: { color: b.primary } });
    s7.addText(String(i + 1), { x, y: y + 0.1, w: 0.6, h: 0.6, fontSize: 16, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: "Calibri" });
    s7.addText([{ text: t, options: { bold: true, fontSize: 14, color: INK, breakLine: true } }, { text: d, options: { fontSize: 11.5, color: MUTED } }],
      { x: x + 0.8, y, w: 5.2, h: 1.55, fontFace: "Calibri", valign: "top" });
  });

  stepsSlide(ctx, r, "Ready to Move to Flex", r.term ? `${r.term.years}-year consortium agreement — forecast saving of ${gbp0(r.term.saving_net)} (${pct(r.term.saving_pct, 0)}) net of VAT & CCL vs the fixed renewal` : "From decision to supply start");
  return pptx.write({ outputType: "nodebuffer" });
}
