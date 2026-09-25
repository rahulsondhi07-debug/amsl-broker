/** Market report, client buying guide and portfolio site summary. */
import ExcelJS from "exceljs";
import { makeDoc, toBuffer, title, subtitle, meta, h1, h2, p, bullets, table, callout, spacer, contactBlock, small, markdownBlocks } from "./word.js";
import { brand, longDate, today, GOOD, BAD } from "./common.js";

/* ---------------- Market report ---------------- */
export async function marketReportDoc(rep) {
  const b = brand();
  const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const kids = [
    title(rep.title || "Market Update"),
    ...(rep.headline ? [subtitle(rep.headline)] : []),
    meta(`${b.company}${rep.author ? ` · ${rep.author}` : ""} · ${longDate(rep.report_date)}`),
  ];
  if (rep.summary) { kids.push(callout(rep.summary)); kids.push(spacer()); }
  if (rep.prices?.length) {
    kids.push(h1("Prices at a glance"));
    const groups = [...new Set(rep.prices.map((x) => x.commodity))];
    for (const g of groups) {
      const rows = rep.prices.filter((x) => x.commodity === g);
      kids.push(h2(g === "Other" ? "Other indicators" : `${g}`));
      kids.push(table([{ label: "Contract", width: 30 }, { label: "Price", width: 18, align: "right" }, { label: "Previous", width: 18, align: "right" }, { label: "Change", width: 14, align: "right" }, { label: "Note", width: 20 }],
        rows.map((x) => ({ cells: [x.contract, x.price != null ? `${fmtP(x.price, x.unit)}` : "—", x.previous != null ? fmtP(x.previous, x.unit) : "—",
          x.change_pct != null ? `${x.change_pct > 0 ? "+" : ""}${x.change_pct.toFixed(1)}%` : "—", x.note || ""],
          // Prices going up are bad news for a buyer.
          colors: [undefined, undefined, undefined, x.change_pct == null ? undefined : x.change_pct > 0 ? BAD : GOOD] }))));
    }
  }
  if (rep.backdrop) { kids.push(h1("Market backdrop")); lines(rep.backdrop).forEach((t) => kids.push(p(t))); }
  if (lines(rep.drivers).length) { kids.push(h1("What's driving prices")); kids.push(...bullets(lines(rep.drivers))); }
  if (rep.outlook) { kids.push(h1("Outlook")); lines(rep.outlook).forEach((t) => kids.push(p(t))); }
  if (rep.fixed_view || rep.flex_view) {
    kids.push(h1("What it means for you"));
    if (rep.fixed_view) { kids.push(h2("If you are on, or renewing, a fixed contract")); kids.push(p(rep.fixed_view)); }
    if (rep.flex_view) { kids.push(h2("If you buy flexibly or through the consortium")); kids.push(p(rep.flex_view)); }
  }
  if (lines(rep.sources).length) { kids.push(h2("Sources")); lines(rep.sources).forEach((s) => kids.push(small(s))); }
  kids.push(spacer(160)); kids.push(...contactBlock());
  return toBuffer(makeDoc({ title: rep.title || "Market Update", headerText: `${rep.title || "Market Update"} — ${longDate(rep.report_date)}`, children: kids }));
}
const fmtP = (v, unit) => (unit === "£/MWh" ? `£${Number(v).toFixed(2)}` : unit === "p/therm" ? `${Number(v).toFixed(2)}p` : `${Number(v).toLocaleString("en-GB")}${unit ? ` ${unit}` : ""}`);

/* ---------------- Client buying guide (a pack of knowledge articles) ---------------- */
export async function clientGuide(articles, glossary, { title: t = "Your Energy Buying Guide", intro, business_name } = {}) {
  const b = brand();
  const kids = [
    title(t),
    subtitle(business_name ? `Prepared for ${business_name}` : "A plain-English guide to buying business energy"),
    meta(`${b.company} · ${longDate(today())}`),
    ...(intro ? [p(intro)] : []),
    h1("Contents"),
    ...articles.map((a, i) => p(`${i + 1}.  ${a.title}`)),
  ];
  articles.forEach((a, i) => {
    kids.push(h1(`${i + 1}. ${a.title}`));
    if (a.summary) kids.push(p(`*${a.summary}*`, { color: "64748B" }));
    kids.push(...markdownBlocks(a.body));
  });
  if (glossary?.length) {
    kids.push(h1("Glossary"));
    kids.push(table([{ label: "Term", width: 28 }, { label: "Meaning", width: 72 }], glossary.map((g) => [`**${g.term}**`, g.definition]), { fontSize: 17 }));
  }
  kids.push(spacer(200)); kids.push(...contactBlock());
  return toBuffer(makeDoc({ title: t, headerText: t, children: kids }));
}

/* ---------------- Portfolio site summary from a group / basket upload ---------------- */
export async function portfolioSummary(q, summary) {
  const b = brand();
  const wb = new ExcelJS.Workbook();
  wb.creator = b.company;
  const head = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: `FF${b.primary}` } }, alignment: { vertical: "middle", wrapText: true } };
  const name = q.group_name || q.basket_name || q.company_name || q.ref;

  const s = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  s.columns = [{ width: 3 }, { width: 34 }, { width: 18 }, { width: 18 }];
  s.getCell("B1").value = `${name} — Portfolio Summary`; s.getCell("B1").font = { bold: true, size: 15, color: { argb: `FF${b.primary}` } };
  s.getCell("B2").value = `${q.ref} · ${q.quote_kind} quotation · ${longDate(today())} · ${b.company}`; s.getCell("B2").font = { color: { argb: "FF64748B" } };
  let r = 4;
  const kv = (k, v, fmt) => { s.getCell(`B${r}`).value = k; s.getCell(`C${r}`).value = v; if (fmt) s.getCell(`C${r}`).numFmt = fmt; s.getCell(`B${r}`).font = { bold: true }; r++; };
  kv("Electricity sites", summary.elec_sites);
  kv("Gas sites", summary.gas_sites);
  kv("Total annual electricity (kWh)", summary.total_kwh, "#,##0");
  kv("Sites out of contract", summary.out_of_contract);
  kv("Contract end dates", summary.contract_end_dates.map((d) => new Date(d).toLocaleDateString("en-GB")).join(", ") || "—");
  kv("Flex consortium entry level (kWh)", summary.flex_threshold_kwh, "#,##0");
  kv("Eligible for the flex consortium", summary.flex_eligible ? "Yes — combined volume clears the entry level" : "No — below the entry level");
  r++;
  const group = (titleText, rows) => {
    s.getCell(`B${r}`).value = titleText; s.getCell(`B${r}`).font = { bold: true, size: 12 }; r++;
    ["", "Sites", "kWh"].forEach((h, i) => { const c = s.getRow(r).getCell(2 + i); c.value = i === 0 ? titleText.split(" ").pop() : h; Object.assign(c, head); });
    r++;
    rows.forEach((x) => { s.getCell(`B${r}`).value = x.key; s.getCell(`C${r}`).value = x.sites; s.getCell(`D${r}`).value = Math.round(x.kwh); s.getCell(`D${r}`).numFmt = "#,##0"; r++; });
    r++;
  };
  group("By meter type", summary.by_meter_type);
  group("By current supplier", summary.by_supplier);

  const ws = wb.addWorksheet("Sites");
  const cols = [["Row", 6], ["Business", 26], ["MPAN Core", 17], ["Meter type", 10], ["Day kWh", 12], ["Night kWh", 12], ["Total kWh", 13], ["kVA", 8], ["MPRN", 13], ["AQ", 12], ["Current supplier", 16], ["Contract end", 13], ["Issues", 50]];
  ws.columns = cols.map(([, w]) => ({ width: w }));
  cols.forEach(([h], i) => { const c = ws.getRow(1).getCell(i + 1); c.value = h; Object.assign(c, head); });
  q.sites.forEach((x, i) => {
    const row = ws.getRow(i + 2);
    row.values = [x.row_no, x.business_name, x.mpan_core, x.meter_type, x.eac_day, x.eac_night, null, x.kva, x.mprn, x.aq, x.current_supplier,
      x.out_of_contract ? "Out of contract" : x.contract_end ? new Date(x.contract_end) : null, (x.issues || []).join("; ")];
    row.getCell(7).value = { formula: `SUM(E${i + 2}:F${i + 2})`, result: (x.eac_day || 0) + (x.eac_night || 0) };
    [5, 6, 7, 10].forEach((k) => { row.getCell(k).numFmt = "#,##0"; });
    if (x.contract_end && !x.out_of_contract) row.getCell(12).numFmt = "dd/mm/yyyy";
    if ((x.issues || []).length) row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } }; });
  });
  const tot = q.sites.length + 2;
  ws.getCell(`B${tot}`).value = "Total"; ws.getRow(tot).font = { bold: true };
  ["E", "F", "G", "J"].forEach((k) => { ws.getCell(`${k}${tot}`).value = { formula: `SUM(${k}2:${k}${tot - 1})` }; ws.getCell(`${k}${tot}`).numFmt = "#,##0"; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: `M${tot - 1}` };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
