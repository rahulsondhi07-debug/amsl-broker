/**
 * Fixed vs Flex supporting workbook: SUMMARY, FIXED (quote) and FLEX tabs with live
 * formulas, laid out like the broker's own model so it can be handed to a client's
 * finance team and checked cell by cell.
 */
import ExcelJS from "exceljs";
import { brand, longDate } from "./common.js";

const BASIS_UNIT = { p_kwh: ["kWh at", "pence per kWh"], p_day: ["Days at", "p/day"], p_kva_day: ["kVA", "p/kVA/day"], p_kvarh: ["kVArh", "pence per kVArh"] };
const GBP = '"£"#,##0.00';
const PCT = "0.00%";

export async function fvfWorkbook(r) {
  const c = r.comparison;
  const b = brand();
  const wb = new ExcelJS.Workbook();
  wb.creator = b.company; wb.created = new Date();
  const head = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: `FF${b.primary}` } } };
  const titleFont = { bold: true, size: 14, color: { argb: `FF${b.primary}` } };
  const days = Number(c.days) || 365;
  const ref = {}; // "Fixed-1" -> { sub, inc, net }

  /** Write one scenario-year block and return the row after it. */
  const block = (ws, row, heading, sc, key) => {
    ws.getCell(`B${row}`).value = heading; ws.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: `FF${b.primary}` } };
    ws.getCell(`G${row}`).value = "Total Cost"; ws.getCell(`G${row}`).font = { bold: true };
    row++;
    const first = row;
    for (const l of sc.lines) {
      const [qWord, uWord] = BASIS_UNIT[l.basis] || BASIS_UNIT.p_kwh;
      const qty = l.basis === "p_day" ? days : Number(l.qty) || 0;
      ws.getCell(`B${row}`).value = l.label;
      ws.getCell(`C${row}`).value = qty; ws.getCell(`C${row}`).numFmt = "#,##0.00";
      ws.getCell(`D${row}`).value = qWord;
      ws.getCell(`E${row}`).value = l.rate ?? 0; ws.getCell(`E${row}`).numFmt = "0.0000";
      ws.getCell(`F${row}`).value = uWord;
      const f = l.basis === "p_kva_day" ? `C${row}*E${row}*${days}/100` : `C${row}*E${row}/100`;
      ws.getCell(`G${row}`).value = { formula: f, result: l.amount };
      ws.getCell(`G${row}`).numFmt = GBP;
      row++;
    }
    const last = row - 1;
    const sub = row;
    ws.getCell(`F${sub}`).value = "Subtotal (Net of VAT & CCL)"; ws.getCell(`F${sub}`).font = { bold: true };
    ws.getCell(`G${sub}`).value = { formula: `SUM(G${first}:G${last})`, result: sc.subtotal_ex_ccl_vat };
    ws.getCell(`G${sub}`).font = { bold: true };
    const ccl = sub + 1;
    ws.getCell(`B${ccl}`).value = "Climate Change Levy"; ws.getCell(`C${ccl}`).value = Number(c.annual_kwh); ws.getCell(`C${ccl}`).numFmt = "#,##0.00";
    ws.getCell(`D${ccl}`).value = "kWh at"; ws.getCell(`E${ccl}`).value = Number(c.ccl_p_kwh); ws.getCell(`F${ccl}`).value = "pence per kWh";
    ws.getCell(`G${ccl}`).value = { formula: `C${ccl}*E${ccl}/100`, result: sc.ccl };
    const net = ccl + 1;
    ws.getCell(`F${net}`).value = "Total (Net of VAT)"; ws.getCell(`G${net}`).value = { formula: `G${sub}+G${ccl}`, result: sc.total_ex_vat };
    const vat = net + 1;
    ws.getCell(`F${vat}`).value = `VAT @ ${c.vat_pct}%`; ws.getCell(`G${vat}`).value = { formula: `G${net}*${Number(c.vat_pct) / 100}`, result: sc.vat };
    const inc = vat + 1;
    ws.getCell(`F${inc}`).value = "Total (Inc VAT)"; ws.getCell(`F${inc}`).font = { bold: true };
    ws.getCell(`G${inc}`).value = { formula: `G${net}+G${vat}`, result: sc.total_inc_vat }; ws.getCell(`G${inc}`).font = { bold: true };
    [ccl, net, vat, inc].forEach((x) => { ws.getCell(`G${x}`).numFmt = GBP; });
    ws.getCell(`G${sub}`).numFmt = GBP;
    ref[key] = { sub, inc };
    return inc + 2;
  };
  const setCols = (ws) => { ws.columns = [{ width: 3 }, { width: 38 }, { width: 14 }, { width: 9 }, { width: 11 }, { width: 30 }, { width: 16 }]; };

  // SUMMARY is created first so it is the first tab, and filled in once the other tabs
  // exist, because its formulas point at their cells.
  const ws = wb.addWorksheet("SUMMARY", { views: [{ showGridLines: false }] });

  // FIXED tab (with the current contract first, if known).
  const wsF = wb.addWorksheet("FIXED (Quote)"); setCols(wsF);
  wsF.getCell("B1").value = `${c.account_ref ? `${c.account_ref} - ` : ""}${c.client_name} - FIXED${c.fixed_quote_ref ? ` (Supplier Quote ${c.fixed_quote_ref})` : ""}`;
  wsF.getCell("B1").font = titleFont;
  let row = 3;
  if (r.current) row = block(wsF, row, `${c.mpan ? `MPAN ${c.mpan}  —  ` : ""}Current contract${c.current_contract_end ? ` (ends ${longDate(c.current_contract_end)})` : ""}`, r.current, "Current-1");
  r.years.filter((y) => y.has_fixed).forEach((y) => {
    row = block(wsF, row, `${c.mpan ? `MPAN ${c.mpan}  —  ` : ""}${y.year_no} Year Fixed${c.fixed_quote_ref ? ` (Quote ${c.fixed_quote_ref})` : ""}`, y.fixed, `Fixed-${y.year_no}`);
  });

  // FLEX tab.
  const wsX = wb.addWorksheet("FLEX"); setCols(wsX);
  wsX.getCell("B1").value = `${c.account_ref ? `${c.account_ref} - ` : ""}${c.client_name} - FLEX${c.flex_supplier ? ` WITH ${c.flex_supplier.toUpperCase()}` : ""}`;
  wsX.getCell("B1").font = titleFont;
  row = 3;
  const flexYears = r.years.filter((y) => y.flex.priced);
  flexYears.forEach((y) => { row = block(wsX, row, `${c.mpan ? `MPAN ${c.mpan}  —  ` : ""}FLEX ${y.year_label}`, y.flex, `Flex-${y.year_no}`); });
  if (flexYears.length > 1) {
    wsX.getCell(`F${row}`).value = `${flexYears.length}-Year Total (Net of VAT & CCL)`; wsX.getCell(`F${row}`).font = { bold: true };
    wsX.getCell(`G${row}`).value = { formula: flexYears.map((y) => `G${ref[`Flex-${y.year_no}`].sub}`).join("+"), result: r.totals.flex_all_years_net };
    wsX.getCell(`G${row + 1}`).value = { formula: flexYears.map((y) => `G${ref[`Flex-${y.year_no}`].inc}`).join("+"), result: r.totals.flex_all_years_inc };
    wsX.getCell(`F${row + 1}`).value = `${flexYears.length}-Year Total (Inc VAT)`;
    [row, row + 1].forEach((x) => { wsX.getCell(`G${x}`).numFmt = GBP; wsX.getCell(`G${x}`).font = { bold: true }; });
  }

  // SUMMARY tab, first in the book.
  ws.columns = [{ width: 3 }, { width: 70 }, { width: 20 }, { width: 20 }, { width: 16 }, { width: 12 }];
  ws.getCell("B1").value = `${c.client_name} — Fixed vs Flex Cost Comparison`; ws.getCell("B1").font = { ...titleFont, size: 16 };
  ws.getCell("B2").value = [c.account_ref && `Account ${c.account_ref}`, c.mpan && `MPAN ${c.mpan}`, c.site, `Prepared by ${c.prepared_by || b.company}`].filter(Boolean).join("  |  ");
  ws.getCell("B2").font = { color: { argb: "FF64748B" } };
  row = 4;
  ws.getCell(`B${row}`).value = `Annual Consumption Profile${c.consumption_period ? ` (${c.consumption_period})` : ""}`; ws.getCell(`B${row}`).font = { bold: true, size: 12 };
  row++;
  [["Total Annual Consumption", c.annual_kwh], ["Day Units", c.day_kwh], ["Night Units", c.night_kwh],
   ["DUoS Red", c.duos_red_kwh], ["DUoS Amber", c.duos_amber_kwh], ["DUoS Green", c.duos_green_kwh]]
    .filter(([, v]) => v != null).forEach(([l, v]) => { ws.getCell(`B${row}`).value = `${l} (kWh)`; ws.getCell(`C${row}`).value = Number(v); ws.getCell(`C${row}`).numFmt = "#,##0.00"; row++; });
  row++;

  const cmpTable = (heading, key, cols) => {
    ws.getCell(`B${row}`).value = heading; ws.getCell(`B${row}`).font = { bold: true, size: 12 }; row++;
    ["Term", ...cols, "Saving (£)", "Saving (%)"].forEach((h, i) => { const cell = ws.getRow(row).getCell(2 + i); cell.value = h; Object.assign(cell, head); });
    row++;
    r.years.filter((y) => y.comparable).forEach((y) => {
      ws.getCell(`B${row}`).value = `Year ${y.year_no}: ${y.year_no}-Year Fixed Renewal Rate  vs  Flex ${y.year_label}`;
      ws.getCell(`C${row}`).value = { formula: `'FIXED (Quote)'!G${ref[`Fixed-${y.year_no}`][key]}`, result: key === "sub" ? y.fixed.subtotal_ex_ccl_vat : y.fixed.total_inc_vat };
      ws.getCell(`D${row}`).value = { formula: `FLEX!G${ref[`Flex-${y.year_no}`][key]}`, result: key === "sub" ? y.flex.subtotal_ex_ccl_vat : y.flex.total_inc_vat };
      ws.getCell(`E${row}`).value = { formula: `C${row}-D${row}` }; ws.getCell(`F${row}`).value = { formula: `IF(C${row}=0,"",E${row}/C${row})` };
      [ "C", "D", "E"].forEach((k) => { ws.getCell(`${k}${row}`).numFmt = GBP; }); ws.getCell(`F${row}`).numFmt = PCT;
      row++;
    });
    if (r.term) {
      const n = r.term.years;
      ws.getCell(`B${row}`).value = `${n}-Year Total: ${n}-Year Fixed Renewal Rate x ${n} years  vs  ${n}-Year Flex`;
      ws.getCell(`C${row}`).value = { formula: `('FIXED (Quote)'!G${ref[`Fixed-${n}`][key]})*${n}`, result: key === "sub" ? r.term.fixed_net : r.term.fixed_inc };
      ws.getCell(`D${row}`).value = { formula: Array.from({ length: n }, (_, i) => `FLEX!G${ref[`Flex-${i + 1}`][key]}`).join("+"), result: key === "sub" ? r.term.flex_net : r.term.flex_inc };
      ws.getCell(`E${row}`).value = { formula: `C${row}-D${row}` }; ws.getCell(`F${row}`).value = { formula: `IF(C${row}=0,"",E${row}/C${row})` };
      ["C", "D", "E"].forEach((k) => { ws.getCell(`${k}${row}`).numFmt = GBP; }); ws.getCell(`F${row}`).numFmt = PCT;
      ws.getRow(row).font = { bold: true };
      row++;
    }
    r.years.filter((y) => y.flex.priced && !y.has_fixed).forEach((y) => {
      ws.getCell(`B${row}`).value = `Year ${y.year_no}: Flex ${y.year_label} (no fixed equivalent quoted)`;
      ws.getCell(`D${row}`).value = { formula: `FLEX!G${ref[`Flex-${y.year_no}`][key]}` }; ws.getCell(`D${row}`).numFmt = GBP;
      row++;
    });
    row++;
  };
  cmpTable("Fixed vs Flex Comparison — Net of VAT & CCL (levied equally on both, so excluded to isolate the commercial difference)", "sub", ["Fixed (Net of VAT & CCL)", "Flex (Net of VAT & CCL)"]);
  cmpTable("For reference — Inc VAT (as would actually be invoiced)", "inc", ["Fixed (Inc VAT)", "Flex (Inc VAT)"]);

  if (r.current) {
    ws.getCell(`B${row}`).value = "Every option against the current contract (Net of VAT & CCL)"; ws.getCell(`B${row}`).font = { bold: true, size: 12 }; row++;
    ["Option", "Annual", "Monthly", "vs Current"].forEach((h, i) => { const cell = ws.getRow(row).getCell(2 + i); cell.value = h; Object.assign(cell, head); });
    row++;
    const curRow = row;
    r.options.forEach((o) => {
      ws.getCell(`B${row}`).value = o.label; ws.getCell(`C${row}`).value = o.annual_net; ws.getCell(`D${row}`).value = { formula: `C${row}/12`, result: o.monthly_net };
      if (o.kind !== "current") { ws.getCell(`E${row}`).value = { formula: `C${row}/C${curRow}-1`, result: o.vs_current_net_pct / 100 }; ws.getCell(`E${row}`).numFmt = "+0.0%;-0.0%"; }
      ws.getCell(`C${row}`).numFmt = GBP; ws.getCell(`D${row}`).numFmt = GBP;
      row++;
    });
    row++;
  }

  const notes = [...r.findings, ...(c.assumptions_list || []), c.market_note].filter(Boolean);
  if (notes.length) {
    ws.getCell(`B${row}`).value = "Findings, notes & assumptions"; ws.getCell(`B${row}`).font = { bold: true, size: 12 }; row++;
    notes.forEach((n, i) => {
      ws.mergeCells(`B${row}:F${row}`);
      ws.getCell(`B${row}`).value = `${i + 1}. ${n}`; ws.getCell(`B${row}`).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(row).height = Math.max(15, Math.ceil(n.length / 120) * 15);
      row++;
    });
    row++;
  }
  if (r.monthly.length) {
    ws.getCell(`B${row}`).value = "Monthly Consumption (kWh)"; ws.getCell(`B${row}`).font = { bold: true, size: 12 }; row++;
    ["Month", "Day kWh", "Night kWh", "Total kWh"].forEach((h, i) => { const cell = ws.getRow(row).getCell(2 + i); cell.value = h; Object.assign(cell, head); });
    row++;
    const f = row;
    r.monthly.forEach((m) => {
      ws.getCell(`B${row}`).value = m.month_label; ws.getCell(`C${row}`).value = m.day_kwh; ws.getCell(`D${row}`).value = m.night_kwh;
      ws.getCell(`E${row}`).value = { formula: `C${row}+D${row}`, result: m.total_kwh };
      ["C", "D", "E"].forEach((k) => { ws.getCell(`${k}${row}`).numFmt = "#,##0.00"; });
      row++;
    });
    ws.getCell(`B${row}`).value = "Total"; ws.getRow(row).font = { bold: true };
    ["C", "D", "E"].forEach((k) => { ws.getCell(`${k}${row}`).value = { formula: `SUM(${k}${f}:${k}${row - 1})` }; ws.getCell(`${k}${row}`).numFmt = "#,##0.00"; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
