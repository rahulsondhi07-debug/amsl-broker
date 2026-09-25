/** Documents built from a consortium position: HTML snapshot, Position & Risk report, extension letter. */
import { makeDoc, toBuffer, title, subtitle, meta, h1, h2, p, bullets, table, kpis, callout, spacer, contactBlock, small } from "./word.js";
import { brand, esc, longDate, today, priceFmt, volFmt, pctFrac, MARKET_BLUE, GOOD, BAD } from "./common.js";
import { groupedBars, percentBars, lineChart } from "./svg.js";
import { seasonRange } from "../flexCalc.js";

const short = (l) => String(l).replace(/(Winter|Summer)\s+(\d{2})(\d{2})/, "$1 $3");
const unitWord = (u) => (u.price === "£/MWh" ? "£/MWh" : "p/therm");
const pctStr = (f) => (f == null ? "—" : `${Math.round(f * 100)}%`);

/* ---------------- Interactive HTML snapshot ---------------- */
export function positionSnapshotHtml(snap, { latestReport } = {}) {
  const b = brand();
  const bk = snap.basket;
  const asAt = bk.report_date ? longDate(bk.report_date) : longDate(today());
  const kpi = (label, value, sub, good) => `<div class="kpi"><div class="kl">${esc(label)}</div><div class="kv">${esc(value)}</div><div class="ks ${good ? "good" : ""}">${esc(sub || "")}</div></div>`;
  const tiles = snap.positions.flatMap((p) => {
    const u = p.units;
    const n = p.near_season, o = p.opportunity_season;
    return [
      kpi(`${p.utility} — overall hedged`, pctStr(p.hedged_pct), `${volFmt(p.traded_total, u)} of ${volFmt(p.required_total, u)} ${u.volume} required`),
      kpi(`${p.utility} — weighted locked-in price`, priceFmt(p.locked_avg, u) + (u.price === "£/MWh" ? "/MWh" : "/th"), "Blended across all traded volume"),
      n ? kpi(`${p.utility} — ${short(n.label)} position`, pctStr(n.hedged_pct), n.locked != null ? `Locked at ${priceFmt(n.locked, u)} vs market ${priceFmt(n.market, u)}${n.saving != null ? ` — saving ${priceFmt(n.saving, u)}` : ""}` : "", n.saving > 0) : "",
      o ? kpi(`${p.utility} — ${short(o.label)} opportunity`, `${pctStr(o.hedged_pct)} hedged`, o.locked != null ? `Buying at ${priceFmt(o.locked, u)} vs today's market ${priceFmt(o.market, u)}` : `Market ${priceFmt(o.market, u)}`, o.saving > 0) : "",
    ].filter(Boolean);
  }).join("");

  const section = (p) => {
    const u = p.units;
    const s = p.seasonal;
    const bars = groupedBars(s.map((x) => short(x.label)), [
      { name: `Current market (${unitWord(u)})`, color: `#${MARKET_BLUE}`, values: s.map((x) => x.market) },
      { name: `Consortium locked-in avg (${unitWord(u)})`, color: `#${b.accent}`, values: s.map((x) => x.locked) },
    ], { unitPrefix: u.price === "£/MWh" ? "£" : "", unitSuffix: u.price === "£/MWh" ? "" : "p", dp: 2 });
    const hedge = percentBars(s.map((x) => short(x.label)), s.map((x) => x.hedged_pct));
    const m = p.monthly;
    const trend = m.length ? lineChart(m.map((x) => x.label), [
      { name: "Market", color: `#${MARKET_BLUE}`, values: m.map((x) => x.market) },
      { name: "Consortium locked-in", color: `#${b.accent}`, values: m.map((x) => (x.traded > 0 && x.locked != null ? x.locked : x.market)) },
    ], { unitPrefix: u.price === "£/MWh" ? "£" : "", unitSuffix: u.price === "£/MWh" ? "" : "p" }) : "";
    const rows = s.map((x) => `<tr><td>${esc(x.label)}</td><td>${priceFmt(x.market, u)}</td><td>${priceFmt(x.locked, u)}</td>
      <td class="${x.saving > 0 ? "good" : x.saving < 0 ? "bad" : ""}">${x.saving == null ? "—" : `${x.saving > 0 ? "+" : ""}${x.saving.toFixed(2)}`}</td>
      <td>${volFmt(x.vol_req, u)}</td><td>${volFmt(x.traded, u)}</td><td>${volFmt(x.open, u)}</td><td>${pctStr(x.hedged_pct)}</td></tr>`).join("");
    return `<section><h2>${esc(p.utility)} consortium position</h2><p class="sub">Volumes in ${esc(u.volume)} (peak requirement basis) · prices in ${esc(unitWord(u))}</p>
      <div class="grid2"><div class="card"><h3>Locked-in price vs today's market, by delivery season</h3>${bars}
      <p class="note">Where the orange bar sits below the blue bar, the consortium is already paying less than today's market for that season.</p></div>
      <div class="card"><h3>% of requirement hedged, by season</h3>${hedge}<p class="note">Share of each season's volume already traded vs still open.</p></div></div>
      ${trend ? `<div class="card"><h3>Monthly trend — market price vs consortium locked-in price</h3>${trend}</div>` : ""}
      <details><summary>View full seasonal detail table</summary><div class="tw"><table><thead><tr><th>Season</th><th>Market</th><th>Locked-in avg</th><th>Saving</th><th>Required</th><th>Traded</th><th>Open</th><th>Hedged</th></tr></thead><tbody>${rows}</tbody></table></div></details></section>`;
  };

  const banner = bk.market_commentary || latestReport?.summary;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(bk.name)} Position Snapshot — Gas &amp; Power</title>
<style>
:root{--p:#${b.primary};--a:#${b.accent};--ink:#0f172a;--mut:#64748b;--line:#e2e8f0}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Calibri,Arial,sans-serif;color:var(--ink);background:#f4f6f9;line-height:1.5}
.wrap{max-width:1080px;margin:0 auto;padding:20px 16px 40px}
header{background:linear-gradient(135deg,var(--p),#17406f);color:#fff;border-radius:14px;padding:26px 26px 22px}
header .tag{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8}header h1{margin:6px 0 8px;font-size:26px}
header p{margin:0 0 8px;opacity:.92;max-width:760px}header .meta{font-size:12px;opacity:.75}
.banner{background:#fff7ea;border-left:4px solid var(--a);border-radius:10px;padding:14px 16px;margin:16px 0;font-size:14px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}
.kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}.kl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);font-weight:700}
.kv{font-size:24px;font-weight:800;margin:4px 0 2px}.ks{font-size:12px;color:var(--mut)}.ks.good{color:#${GOOD}}
section{margin-top:26px}h2{font-size:20px;margin:0}.sub{color:var(--mut);font-size:12.5px;margin:2px 0 10px}
.grid2{display:grid;grid-template-columns:1fr;gap:0}.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
h3{font-size:14px;margin:0 0 8px}.note{font-size:11.5px;color:var(--mut);margin:6px 0 0}
details{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px}summary{cursor:pointer;font-weight:600;font-size:13px}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12.5px;margin-top:10px}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}
td.good{color:#${GOOD};font-weight:600}td.bad{color:#${BAD};font-weight:600}
.cta{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px 18px;margin-top:22px}.cta h2{font-size:17px;margin-bottom:6px}
footer{font-size:11px;color:var(--mut);margin-top:24px;border-top:1px solid var(--line);padding-top:10px}
@media (max-width:760px){.kpis{grid-template-columns:1fr 1fr}.grid2{grid-template-columns:1fr}header h1{font-size:21px}}
@media print{body{background:#fff}.card,.kpi{break-inside:avoid}details{display:block}details>*{display:block}}
</style></head><body><div class="wrap">
<header><div class="tag">${esc(b.company)} · Consortium Position Report</div><h1>Your Consortium's Gas &amp; Power Buying Position</h1>
<p>How much of the consortium's forward requirement — the group you buy alongside — is already locked in, at what price, and how that compares with where the market sits today.</p>
<div class="meta">Position data as at ${esc(asAt)} · Prepared ${esc(longDate(today()))}${snap.totals.members ? ` · ${snap.totals.members} members` : ""}</div></header>
${banner ? `<div class="banner"><b>Where the market is right now:</b> ${esc(banner)}</div>` : ""}
<div class="kpis">${tiles}</div>
${snap.positions.map(section).join("")}
${bk.member_message ? `<div class="cta"><h2>What this means for consortium members</h2><p>${esc(bk.member_message)}</p><p><b>Questions or ready to confirm?</b> Contact ${esc([b.contact, b.company].filter(Boolean).join(", "))}${b.contactEmail ? ` — ${esc(b.contactEmail)}` : ""}${b.phone ? ` · ${esc(b.phone)}` : ""}.</p></div>` : ""}
<footer>"Market" is the live broker curve for each season at the position date. "Locked-in average" blends the weighted average price achieved on traded volume with today's market for any volume still open. Prices are wholesale commodity only and exclude network charges, levies, CCL and VAT. ${esc(b.disclaimer)} ${esc(b.legal)}</footer>
</div></body></html>`;
  return Buffer.from(html, "utf8");
}

/* ---------------- Position & Risk report (Word) ---------------- */
function cashExposure(x, u) {
  // Value of open volume at today's market over the season: MW x hours x £/MWh, or
  // therms/day x days x p/therm.
  const r = seasonRange(x.label);
  if (!r || x.open == null || x.market == null) return null;
  const days = Math.round((r.end - r.start) / 864e5) + 1;
  return u.price === "£/MWh" ? x.open * days * 24 * x.market : (x.open * days * x.market) / 100;
}

export async function positionRiskReport(snap, { latestReport } = {}) {
  const b = brand();
  const bk = snap.basket;
  const asAt = bk.report_date || today();
  const kids = [
    title("Position & Risk Report"),
    subtitle(`${bk.name} — Gas & Power Buying Basket${snap.positions.some((p) => p.latest_trade_date) ? `, updated for trades executed ${longDate(snap.positions.map((p) => p.latest_trade_date).filter(Boolean).sort().pop())}` : ""}`),
    meta(`${b.company}${b.contact ? ` · ${b.contact}` : ""} · Position as at ${longDate(asAt)}`),
  ];

  for (const pos of snap.positions) {
    const u = pos.units;
    const prev = pos.previous;
    const tr = pos.latest_trades_summary;
    kids.push(h1(`${pos.utility}`));
    kids.push(kpis([
      { label: "Overall hedged", value: pctStr(pos.hedged_pct), sub: `${volFmt(pos.traded_total, u)} of ${volFmt(pos.required_total, u)} ${u.volume}` },
      { label: "Weighted locked-in", value: priceFmt(pos.locked_avg, u), sub: unitWord(u) },
      { label: "Open volume", value: `${volFmt(pos.open_total, u)} ${u.volume}`, sub: prev?.open_total ? `was ${volFmt(prev.open_total, u)} on ${longDate(prev.as_at)}` : "still exposed to the market" },
    ]));
    kids.push(spacer(100));
    const n = pos.near_season;
    kids.push(h2("Summary"));
    kids.push(p([
      `The ${pos.utility.toLowerCase()} basket is **${pctFrac(pos.hedged_pct, 1)} hedged** (${volFmt(pos.traded_total, u)} of ${volFmt(pos.required_total, u)} ${u.volume} requirement), with a weighted locked-in price of **${priceFmt(pos.locked_avg, u)}** across all traded volume.`,
      prev ? `That compares with ${pctFrac(prev.hedged_pct, 0)} at ${priceFmt(prev.locked_avg, u)} on ${longDate(prev.as_at)}${tr ? `, after ${tr.count} clip${tr.count > 1 ? "s" : ""} totalling ${volFmt(tr.clip_total, u)} ${u.volume}` : ""}.` : "",
      n ? `${n.label} is the nearest season in delivery at ${pctStr(n.hedged_pct)} hedged, locked at ${priceFmt(n.locked, u)} against a live market of ${priceFmt(n.market, u)}.` : "",
    ].filter(Boolean).join(" ")));

    if (pos.latest_trades?.length) {
      kids.push(h2(`Trades executed ${longDate(pos.latest_trade_date)}`));
      kids.push(table([{ label: "Season", width: 20 }, { label: "Clip", width: 12, align: "right" }, { label: "Price", width: 14, align: "right" }, { label: "Live market", width: 16, align: "right" }, { label: "vs market", width: 14, align: "right" }, { label: "Hedged before → after", width: 24, align: "right" }],
        pos.latest_trades.map((t) => {
          const vs = t.live_market != null ? t.price - t.live_market : null;
          return { cells: [t.season_label, `${volFmt(t.clip, u)} ${u.volume}`, priceFmt(t.price, u), priceFmt(t.live_market, u), vs == null ? "—" : `${vs <= 0 ? "-" : "+"}${priceFmt(Math.abs(vs), u)}`,
            t.hedged_before != null ? `${pctStr(t.hedged_before)} → ${pctStr(t.hedged_after)}` : "—"], colors: [undefined, undefined, undefined, undefined, vs == null ? undefined : vs <= 0 ? GOOD : BAD] };
        })));
      if (tr) kids.push(small(`${volFmt(tr.clip_total, u)} ${u.volume} bought at a blended ${priceFmt(tr.blended_price, u)}${tr.blended_market != null ? ` against a blended live market of ${priceFmt(tr.blended_market, u)} for the same seasons` : ""}${tr.all_below_market ? " — every clip executed at or below market" : ""}. Blended = clip-weighted average; "vs market" = price minus live market, negative is good.`));
    }

    kids.push(h2("Season-by-season position"));
    const updated = new Set((pos.latest_trades || []).map((t) => t.season_label));
    kids.push(table([{ label: "Season", width: 20 }, { label: `Market`, width: 11, align: "right" }, { label: "Locked-in", width: 12, align: "right" }, { label: "Saving", width: 11, align: "right" },
      { label: `Traded`, width: 12, align: "right" }, { label: "Open", width: 12, align: "right" }, { label: "Hedged", width: 10, align: "right" }, { label: "Signal", width: 12 }],
      [...pos.seasonal.map((x) => ({ cells: [`${x.label}${updated.has(x.label) ? " ●" : ""}`, priceFmt(x.market, u), priceFmt(x.locked, u), x.saving == null ? "—" : `${x.saving > 0 ? "+" : ""}${x.saving.toFixed(2)}`,
        volFmt(x.traded, u), volFmt(x.open, u), pctStr(x.hedged_pct), x.signal || ""], bold: updated.has(x.label),
        colors: [undefined, undefined, undefined, x.saving > 0 ? GOOD : x.saving < 0 ? BAD : undefined] })),
      { cells: ["Total", "", priceFmt(pos.locked_avg, u), "", volFmt(pos.traded_total, u), volFmt(pos.open_total, u), pctStr(pos.hedged_pct), ""], bold: true, fill: "EEF2F7" }], { fontSize: 16 }));
    kids.push(small(`Prices in ${unitWord(u)}, volumes in ${u.volume}. ${updated.size ? "● = position updated by the latest trades. " : ""}"Market" is today's live broker curve; "Locked-in" is the weighted average achieved on traded volume.`));

    // Risk assessment, written from the numbers.
    kids.push(h2("Risk assessment"));
    const paras = [];
    if (prev?.open_total != null && pos.open_total != null && prev.open_total > 0) {
      const ch = (prev.open_total - pos.open_total) / prev.open_total;
      paras.push(`Open (unhedged) volume across the tracked curve has ${ch >= 0 ? "fallen" : "risen"} from ${volFmt(prev.open_total, u)} to ${volFmt(pos.open_total, u)} ${u.volume}, a ${Math.abs(Math.round(ch * 100))}% ${ch >= 0 ? "reduction" : "increase"} in the volume still exposed to further price moves.`);
    }
    const live = pos.seasonal.filter((x) => (x.open || 0) > 0);
    const least = [...live].sort((a, c) => a.hedged_pct - c.hedged_pct).slice(0, 3);
    if (least.length) paras.push(`The least-covered seasons are ${least.map((x) => `${x.label} (${Math.round((1 - x.hedged_pct) * 100)}% open)`).join(", ")}. ${least[0].label} carries the largest open share and is the priority for further tranches, subject to price triggers.`);
    const neg = pos.seasonal.filter((x) => x.saving != null && x.saving < 0 && (x.open || 0) > 0);
    if (neg.length) paras.push(`${neg.map((x) => x.label).join(" and ")} show${neg.length === 1 ? "s" : ""} a negative saving (locked-in average above today's market). This is not a sign of poor trades: the curve for ${neg.length === 1 ? "this season" : "these seasons"} has fallen since earlier tranches were bought. Hedging protects against the market moving the wrong way; it is not a guarantee that every historical trade beats every later price.`);
    const exp = live.map((x) => ({ x, v: cashExposure(x, u) })).filter((e) => e.v != null).sort((a, c) => c.v - a.v)[0];
    if (exp) paras.push(`In cash terms the largest single exposure is ${exp.x.label}: ${volFmt(exp.x.open, u)} ${u.volume} still open, worth about £${Math.round(exp.v).toLocaleString("en-GB")} at today's market of ${priceFmt(exp.x.market, u)}. That volume is priced at whatever the market does between now and delivery.`);
    if (!paras.length) paras.push("Every tracked season is fully hedged; the book carries no open price exposure.");
    paras.forEach((t) => kids.push(p(t)));
  }

  const dq = snap.validation.filter((v) => v.level !== "info");
  if (dq.length) { kids.push(h1("Data quality notes")); kids.push(...bullets(dq.map((v) => `${v.utility ? `${v.utility} ` : ""}${v.label ? `${v.label}: ` : ""}${v.message}`))); }
  kids.push(h1("Market backdrop"));
  if (bk.market_commentary) kids.push(p(bk.market_commentary));
  if (latestReport) {
    if (latestReport.summary) kids.push(p(latestReport.summary));
    const d = String(latestReport.drivers || "").split("\n").filter(Boolean);
    if (d.length) kids.push(...bullets(d));
  }
  const sources = [`${bk.name} position data, ${longDate(asAt)}`, ...String(latestReport?.sources || "").split("\n").filter(Boolean)];
  kids.push(h2("Sources"));
  kids.push(...sources.map((s) => small(s)));
  kids.push(spacer(160));
  kids.push(...contactBlock());
  return toBuffer(makeDoc({ title: "Position & Risk Report", headerText: `${bk.name} — Position & Risk Report`, children: kids }));
}

/* ---------------- Framework extension request letter ---------------- */
export async function extensionLetter(snap, { business_name, contact_name, current_end } = {}) {
  const b = brand();
  const bk = snap.basket;
  const endDate = bk.common_end_date || bk.contract_end;
  const lines = snap.positions.map((pos) => {
    const n = pos.near_season, o = pos.opportunity_season, u = pos.units;
    return [
      n && n.locked != null ? `${pos.utility}: ${n.label} is ${pctStr(n.hedged_pct)} hedged at ${priceFmt(n.locked, u)} against today's market of ${priceFmt(n.market, u)}${n.market ? ` — ${Math.round(((n.market - n.locked) / n.market) * 100)}% below` : ""}.` : null,
      o ? `${pos.utility}: ${o.label} is being bought ${o.locked != null ? `at ${priceFmt(o.locked, u)} ` : ""}against a market of ${priceFmt(o.market, u)}, ${pctStr(o.hedged_pct)} hedged so far.` : null,
    ].filter(Boolean);
  }).flat();
  const kids = [
    p(longDate(today()), { color: "64748B" }), spacer(80),
    ...(business_name ? [p(`**${business_name}**`)] : []), spacer(120),
    p(`Dear ${contact_name || (business_name ? "Sir or Madam" : "Member")},`),
    p(`**Extending your framework to ${endDate ? longDate(endDate) : "the consortium's common end date"}**`, { color: b.primary }),
    p(`${current_end ? `Your framework agreement currently runs to ${longDate(current_end)}. ` : ""}We are asking members of the ${bk.name} to extend their gas and electricity frameworks to a common end date of ${endDate ? longDate(endDate) : "the consortium's common end date"}, the same date a number of other members have already agreed to.`),
    p("Extending keeps you inside the collective buying strategy that has served members well through this year's volatility. The track record, as at the latest position report:"),
    ...bullets(lines.length ? lines : ["See the enclosed position report for the consortium's current hedge and prices."]),
    p(bk.member_message || "This is a straightforward extension of your existing framework, on the same rates and terms, not a renegotiation."),
    p("To confirm, please sign and return the slip below, or reply to this letter by email."),
    spacer(120), p("Yours sincerely,"), spacer(260), ...contactBlock(),
    spacer(300),
    callout(`CONFIRMATION OF EXTENSION\n\nI confirm that ${business_name || "_______________________________"} agrees to extend its framework agreement with the ${bk.name} to ${endDate ? longDate(endDate) : "the common end date"}, on the existing rates and terms.\n\nSigned: _______________________________      Name: _______________________________\n\nPosition: _______________________________      Date: ______________`, { fill: "F8FAFC", border: b.primary }),
  ];
  return toBuffer(makeDoc({ title: "Framework extension", headerText: `${bk.name} — framework extension`, children: kids }));
}
