/**
 * Document catalogue and generator. Every client document is produced from live data
 * through one entry point, stored, and can then be downloaded or published to the
 * customer's hub.
 */
import { db } from "../../db.js";
import { computeComparison } from "../fvfCalc.js";
import { computeSnapshot } from "../flexCalc.js";
import { fvfWorkbook } from "./fvfWorkbook.js";
import { fvfBreakdown, contractSummary, onboardingLetter } from "./fvfWord.js";
import { fvfDeck } from "./fvfDeck.js";
import { positionSnapshotHtml, positionRiskReport, extensionLetter } from "./positionDocs.js";
import { marketReportDoc, clientGuide, portfolioSummary } from "./otherDocs.js";
import { marketReport } from "../../routes/knowledge.js";
import { siteSummary } from "../../routes/groupQuotes.js";
import { safeName, today } from "./common.js";

export const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  html: "text/html; charset=utf-8",
};

export const DOC_TYPES = [
  { key: "fvf_breakdown", group: "Fixed vs Flex", source: "fvf", format: "docx", label: "Cost breakdown",
    description: "Written comparison: current vs renewal vs flex, annual and monthly on both VAT bases, unit rates, flex build-up, key findings and assumptions." },
  { key: "fvf_workbook", group: "Fixed vs Flex", source: "fvf", format: "xlsx", label: "Supporting workbook",
    description: "SUMMARY, FIXED and FLEX tabs with live formulas, so a finance team can check every figure." },
  { key: "fvf_deck", group: "Fixed vs Flex", source: "fvf", format: "pptx", label: "Client proposal deck",
    description: "8 slides with editable charts: headline, consumption, annual cost, market position, price build-up, agreement, next steps." },
  { key: "fvf_board_deck", group: "Fixed vs Flex", source: "fvf", format: "pptx", label: "Board presentation",
    description: "9 slides for a client's board: market conditions, profile, the choice explained, numbers inc VAT, what's included, onboarding." },
  { key: "contract_summary", group: "Fixed vs Flex", source: "fvf", format: "docx", label: "Agreement summary",
    description: "The agreement you're signing, in plain English: term, extension, what you pay, volume changes, leaving early, checklist." },
  { key: "onboarding_letter", group: "Fixed vs Flex", source: "fvf", format: "docx", label: "Next steps letter",
    description: "Letter confirming the saving and the four onboarding steps.", options: ["contact_name"] },
  { key: "position_snapshot", group: "Flex position", source: "basket", format: "html", label: "Position snapshot (interactive)",
    description: "Self-contained web page for members: KPI tiles, price and hedge charts, monthly trend, detail tables. Opens offline." },
  { key: "position_risk_report", group: "Flex position", source: "basket", format: "docx", label: "Position & risk report",
    description: "Summary, trades executed, season-by-season table, risk assessment written from the numbers, data quality, market backdrop." },
  { key: "extension_letter", group: "Flex position", source: "basket", format: "docx", label: "Framework extension letter",
    description: "Request to extend to the common end date, with the consortium's track record and a signature slip.", options: ["business_id", "contact_name", "current_end"] },
  { key: "market_report", group: "Market", source: "market_report", format: "docx", label: "Market report",
    description: "Prices at a glance with change, backdrop, drivers, outlook, and what it means for fixed and flex clients." },
  { key: "client_guide", group: "Knowledge", source: "knowledge", format: "docx", label: "Energy buying guide",
    description: "A pack of knowledge articles (all client articles, or a chosen set) with a glossary.", options: ["article_ids", "business_id", "title", "include_glossary"] },
  { key: "portfolio_summary", group: "Group quotes", source: "group_quote", format: "xlsx", label: "Portfolio site summary",
    description: "Totals, HH/NHH and supplier split, out-of-contract sites, consortium eligibility, and every site with its issues." },
];

const latestPublishedReport = () => {
  const row = db.prepare("SELECT id FROM market_reports WHERE status='Published' ORDER BY report_date DESC, id DESC LIMIT 1").get();
  return row ? marketReport(row.id) : null;
};

export async function generateDocument(type, { source_id, business_id, options = {} } = {}) {
  const t = DOC_TYPES.find((x) => x.key === type);
  if (!t) throw httpError(400, `Unknown document type: ${type}`);
  let buf, title, biz = business_id ?? null, fname;
  const stamp = today();

  if (t.source === "fvf") {
    const r = computeComparison(source_id);
    if (!r) throw httpError(404, "Comparison not found");
    if (!r.years.some((y) => y.comparable)) throw httpError(422, "Enter rates for both fixed and flex before generating documents.");
    biz = biz ?? r.comparison.business_id;
    const basket = r.comparison.basket_id ? db.prepare(`SELECT b.*, s.name AS supplier_name FROM flex_baskets b LEFT JOIN suppliers s ON s.id=b.supplier_id WHERE b.id=?`).get(r.comparison.basket_id) : null;
    const client = r.comparison.client_name;
    if (type === "fvf_breakdown") { buf = await fvfBreakdown(r); title = `${client} — Fixed vs Flex Breakdown`; }
    if (type === "fvf_workbook") { buf = await fvfWorkbook(r); title = `${client} — Fixed vs Flex Workbook`; }
    if (type === "fvf_deck") { buf = await fvfDeck(r, { variant: "proposal" }); title = `${client} — Fixed vs Flex Proposal`; }
    if (type === "fvf_board_deck") { buf = await fvfDeck(r, { variant: "board" }); title = `${client} — Board Presentation`; }
    if (type === "contract_summary") { buf = await contractSummary(r, basket); title = `${client} — Agreement Summary`; }
    if (type === "onboarding_letter") { buf = await onboardingLetter(r, options); title = `${client} — Next Steps Letter`; }
    fname = [r.comparison.account_ref, title.split(" — ")[1], "-", client].filter(Boolean).map(safeName).join(" ");
  } else if (t.source === "basket") {
    const snap = computeSnapshot(source_id);
    if (!snap) throw httpError(404, "Consortium not found");
    if (!snap.positions.length) throw httpError(422, "Load position data for this consortium first.");
    const rep = latestPublishedReport();
    const asAt = snap.basket.report_date || stamp;
    if (type === "position_snapshot") { buf = positionSnapshotHtml(snap, { latestReport: rep }); title = `${snap.basket.name} — Position Snapshot ${asAt}`; }
    if (type === "position_risk_report") { buf = await positionRiskReport(snap, { latestReport: rep }); title = `${snap.basket.name} — Position & Risk Report ${asAt}`; }
    if (type === "extension_letter") {
      const b = options.business_id ? db.prepare("SELECT id, business_name, contact_name FROM businesses WHERE id=?").get(options.business_id) : null;
      biz = biz ?? b?.id ?? null;
      buf = await extensionLetter(snap, { business_name: b?.business_name || options.business_name, contact_name: options.contact_name || b?.contact_name, current_end: options.current_end });
      title = `${b?.business_name || snap.basket.name} — Framework Extension Letter`;
    }
    fname = safeName(title);
  } else if (t.source === "market_report") {
    const rep = marketReport(source_id);
    if (!rep) throw httpError(404, "Market report not found");
    buf = await marketReportDoc(rep);
    title = `${rep.title} — ${rep.report_date}`;
    fname = safeName(title);
  } else if (t.source === "knowledge") {
    const ids = Array.isArray(options.article_ids) && options.article_ids.length ? options.article_ids.map(Number) : null;
    let arts = db.prepare("SELECT * FROM knowledge_articles WHERE published=1 AND audience='client' ORDER BY category, sort_order, title").all();
    if (ids) arts = ids.map((id) => db.prepare("SELECT * FROM knowledge_articles WHERE id=?").get(id)).filter(Boolean);
    if (!arts.length) throw httpError(422, "No articles selected");
    const gl = options.include_glossary === false ? [] : db.prepare("SELECT * FROM glossary_terms ORDER BY term COLLATE NOCASE").all();
    const b = biz ? db.prepare("SELECT business_name FROM businesses WHERE id=?").get(biz) : null;
    title = options.title || "Your Energy Buying Guide";
    buf = await clientGuide(arts, gl, { title, business_name: b?.business_name });
    fname = safeName(`${title}${b ? ` - ${b.business_name}` : ""}`);
  } else if (t.source === "group_quote") {
    const q = db.prepare("SELECT * FROM group_quotes WHERE id=?").get(source_id);
    if (!q) throw httpError(404, "Group quotation not found");
    q.sites = db.prepare("SELECT * FROM group_quote_sites WHERE quote_id=? ORDER BY row_no, id").all(source_id).map((s) => ({ ...s, issues: s.issues ? JSON.parse(s.issues) : [] }));
    biz = biz ?? q.business_id ?? null;
    buf = await portfolioSummary(q, siteSummary(q.sites));
    title = `${q.group_name || q.basket_name || q.ref} — Portfolio Summary`;
    fname = safeName(title);
  }

  const filename = `${fname.replace(/\s+—\s+/g, " - ")}.${t.format}`;
  const info = db.prepare(`INSERT INTO generated_documents (doc_type, title, filename, mime, content, size, business_id, source_kind, source_id, params, published, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(type, title, filename, MIME[t.format], buf, buf.length, biz, t.source, source_id ?? null,
    JSON.stringify(options || {}), options.publish ? 1 : 0, options.created_by || null);
  return db.prepare("SELECT id, doc_type, title, filename, mime, size, business_id, source_kind, source_id, published, created_at FROM generated_documents WHERE id=?").get(info.lastInsertRowid);
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
