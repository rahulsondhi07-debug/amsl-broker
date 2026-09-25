/** Shared helpers for every generated client document. */
import { docSettings } from "../../flexSuite.js";

export function brand() {
  const s = docSettings();
  return {
    company: s.doc_company_name || "Your Energy Consultant",
    legal: s.doc_company_legal || "",
    address: s.doc_address || "", phone: s.doc_phone || "", mobile: s.doc_mobile || "",
    email: s.doc_email || "", web: s.doc_web || "",
    contact: s.doc_contact_name || "", contactTitle: s.doc_contact_title || "", contactEmail: s.doc_contact_email || "",
    primary: (s.doc_primary_color || "#0b2545").replace("#", ""),
    accent: (s.doc_accent_color || "#eb6834").replace("#", ""),
    disclaimer: s.doc_disclaimer || "",
    minElec: Number(s.flex_min_elec_kwh) || 175000, minGas: Number(s.flex_min_gas_kwh) || 300000,
  };
}

export const MARKET_BLUE = "2a78d6";
export const GOOD = "0E7C7B";
export const BAD = "B91C1C";

export const gbp = (n, dp = 2) => (n == null || !Number.isFinite(Number(n)) ? "—"
  : `${Number(n) < 0 ? "-" : ""}£${Math.abs(Number(n)).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const gbp0 = (n) => gbp(n, 0);
export const kwh = (n) => (n == null ? "—" : Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 }));
export const kwh0 = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-GB"));
export const pct = (n, dp = 1) => (n == null ? "—" : `${Number(n).toFixed(dp)}%`);
export const signedPct = (n, dp = 1) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(dp)}%`);
export const pctFrac = (f, dp = 0) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);
export const rate = (n, dp = 4) => (n == null ? "—" : Number(n).toFixed(dp).replace(/0+$/, "").replace(/\.$/, ".0"));
export const longDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
export const shortDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB") : "");
export const today = () => new Date().toISOString().slice(0, 10);
export const priceFmt = (v, units) => (v == null ? "—" : units?.price === "£/MWh" ? `£${Number(v).toFixed(2)}` : `${Number(v).toFixed(2)}p`);
export const volFmt = (v, units) => (v == null ? "—" : Number(v).toLocaleString("en-GB", { maximumFractionDigits: units?.volDp ?? 2 }));
export const safeName = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 90);

/**
 * The markdown subset used by knowledge articles, as blocks both the Word and HTML
 * renderers understand: h2, p, ul, ol, table, quote.
 */
export function parseMarkdown(md = "") {
  const lines = String(md).replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^##\s+/.test(l)) { blocks.push({ type: "h2", text: l.replace(/^##\s+/, "") }); i++; continue; }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ type: "quote", text: buf.join(" ") }); continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        const cells = lines[i++].replace(/^\||\|\s*$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
      }
      blocks.push({ type: "table", rows }); continue;
    }
    if (/^-\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) items.push(lines[i++].replace(/^-\s+/, ""));
      blocks.push({ type: "ul", items }); continue;
    }
    if (/^\d+\.\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s+/, ""));
      blocks.push({ type: "ol", items }); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(##\s|>|\||-\s|\d+\.\s)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

/** "**bold** and *italic*" -> [{text, bold, italics}] */
export function inlineRuns(text = "") {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const t = m[0];
    out.push(t.startsWith("**") ? { text: t.slice(2, -2), bold: true } : { text: t.slice(1, -1), italics: true });
    last = m.index + t.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const inlineHtml = (t) => inlineRuns(t).map((r) => r.bold ? `<b>${esc(r.text)}</b>` : r.italics ? `<i>${esc(r.text)}</i>` : esc(r.text)).join("");
export function markdownHtml(md) {
  return parseMarkdown(md).map((b) => {
    if (b.type === "h2") return `<h3>${inlineHtml(b.text)}</h3>`;
    if (b.type === "p") return `<p>${inlineHtml(b.text)}</p>`;
    if (b.type === "quote") return `<div class="callout">${inlineHtml(b.text)}</div>`;
    if (b.type === "ul") return `<ul>${b.items.map((x) => `<li>${inlineHtml(x)}</li>`).join("")}</ul>`;
    if (b.type === "ol") return `<ol>${b.items.map((x) => `<li>${inlineHtml(x)}</li>`).join("")}</ol>`;
    if (b.type === "table") return `<table><thead><tr>${b.rows[0].map((c) => `<th>${inlineHtml(c)}</th>`).join("")}</tr></thead><tbody>${b.rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    return "";
  }).join("\n");
}
