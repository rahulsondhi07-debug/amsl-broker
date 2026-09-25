/**
 * A small layer over the `docx` package so every Word document shares one look:
 * brand-coloured headings, a header strip, page-numbered footer with the disclaimer,
 * consistent tables and KPI tiles.
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, PageNumber, Header, Footer, LevelFormat, VerticalAlign, TableLayoutType,
} from "docx";
import { brand, parseMarkdown, inlineRuns, GOOD, BAD } from "./common.js";

const FONT = "Calibri";
const GREY = "64748B";
const LINE = "D9DEE5";

export function makeDoc({ title, subtitle, children, headerText }) {
  const b = brand();
  const header = new Header({
    children: [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: b.primary, space: 4 } },
      children: [
        new TextRun({ text: b.company.toUpperCase(), bold: true, color: b.primary, size: 17, font: FONT }),
        new TextRun({ text: `   |   ${headerText || title}`, color: GREY, size: 17, font: FONT }),
      ],
    })],
  });
  const footer = new Footer({
    children: [
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: b.disclaimer, color: "94A3B8", size: 14, font: FONT })] }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: `${[b.company, b.web].filter(Boolean).join(" · ")}   Page `, color: GREY, size: 16, font: FONT }),
          new TextRun({ children: [PageNumber.CURRENT], color: GREY, size: 16, font: FONT }),
          new TextRun({ text: " of ", color: GREY, size: 16, font: FONT }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], color: GREY, size: 16, font: FONT }),
        ],
      }),
    ],
  });
  return new Document({
    creator: b.company, title, description: subtitle || title,
    styles: {
      default: { document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { after: 120, line: 276 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { size: 44, bold: true, color: b.primary, font: FONT }, paragraph: { spacing: { after: 80 } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: b.primary, font: FONT }, paragraph: { spacing: { before: 300, after: 120 }, keepNext: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 25, bold: true, color: "1F3A5F", font: FONT }, paragraph: { spacing: { before: 220, after: 100 }, keepNext: true } },
      ],
    },
    numbering: {
      config: [{ reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] }],
    },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1050, right: 1050 } } },
      headers: { default: header }, footers: { default: footer },
      children,
    }],
  });
}
export const toBuffer = (doc) => Packer.toBuffer(doc);

/* ---- Building blocks ---- */
const runs = (text, opts = {}) => inlineRuns(String(text ?? "")).map((r) => new TextRun({ text: r.text, bold: r.bold || opts.bold, italics: r.italics || opts.italics, color: opts.color, size: opts.size, font: FONT }));

export const title = (t) => new Paragraph({ style: "Title", children: [new TextRun({ text: t })] });
export const subtitle = (t) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: t, color: "1F3A5F", size: 26, font: FONT })] });
export const meta = (t) => new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: t, color: GREY, size: 18, font: FONT })] });
export const h1 = (t) => new Paragraph({ style: "Heading1", children: [new TextRun({ text: t })] });
export const h2 = (t) => new Paragraph({ style: "Heading2", children: [new TextRun({ text: t })] });
export const p = (t, opts = {}) => new Paragraph({ alignment: opts.align, spacing: opts.spacing, children: runs(t, opts) });
export const small = (t) => new Paragraph({ children: [new TextRun({ text: t, size: 16, color: GREY, font: FONT })] });
export const bullets = (items) => items.filter(Boolean).map((t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: runs(t) }));
export const numbered = (items) => items.filter(Boolean).map((t) => new Paragraph({ numbering: { reference: "num", level: 0 }, spacing: { after: 80 }, children: runs(t) }));
export const spacer = (after = 120) => new Paragraph({ spacing: { after }, children: [] });

export function callout(text, { fill = "FFF7EA", border } = {}) {
  const b = brand();
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: noBorders({ left: { style: BorderStyle.SINGLE, size: 24, color: border || b.accent } }),
    rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill, color: "auto" },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: String(text).split("\n").map((t) => new Paragraph({ spacing: { after: 40 }, children: runs(t, { size: 20 }) })),
    })] })],
  });
}

function noBorders(over = {}) {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none, ...over };
}

/**
 * A data table. columns: [{ label, align: 'right'|'left', width (percent) }].
 * rows: arrays of strings, or { cells, bold, fill, colors: [..] } objects.
 */
export function table(columns, rows, { header = true, fontSize = 18 } = {}) {
  const b = brand();
  const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  const mk = (text, i, o = {}) => new TableCell({
    width: columns[i]?.width ? { size: columns[i].width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      spacing: { after: 0 }, alignment: columns[i]?.align === "right" ? AlignmentType.RIGHT : columns[i]?.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: runs(text, { bold: o.bold, color: o.color, size: fontSize }),
    })],
  });
  const head = header ? [new TableRow({ tableHeader: true, children: columns.map((c, i) => mk(c.label, i, { bold: true, fill: b.primary, color: "FFFFFF" })) })] : [];
  const body = rows.map((r, ri) => {
    const o = Array.isArray(r) ? { cells: r } : r;
    return new TableRow({ children: o.cells.map((c, i) => mk(c ?? "", i, {
      bold: o.bold, fill: o.fill || (ri % 2 ? "F8FAFC" : undefined), color: o.colors?.[i],
    })) });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [...head, ...body],
  });
}

/** A row of KPI tiles: [{ value, label, sub, color }]. */
export function kpis(items) {
  const b = brand();
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: noBorders({ insideVertical: { style: BorderStyle.SINGLE, size: 24, color: "FFFFFF" } }),
    rows: [new TableRow({ children: items.map((k) => new TableCell({
      width: { size: Math.floor(100 / items.length), type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" },
      margins: { top: 140, bottom: 140, left: 160, right: 160 },
      children: [
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: String(k.label).toUpperCase(), size: 15, color: GREY, bold: true, font: FONT })] }),
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: String(k.value), size: 34, bold: true, color: k.color || b.primary, font: FONT })] }),
        ...(k.sub ? [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: k.sub, size: 16, color: GREY, font: FONT })] })] : []),
      ],
    })) })],
  });
}

export const savingColor = (v) => (v == null ? undefined : v > 0 ? GOOD : v < 0 ? BAD : undefined);

/** Render a knowledge article body into Word paragraphs. */
export function markdownBlocks(md) {
  const out = [];
  for (const b of parseMarkdown(md)) {
    if (b.type === "h2") out.push(h2(b.text));
    else if (b.type === "p") out.push(p(b.text));
    else if (b.type === "quote") { out.push(callout(b.text, { fill: "EEF6FF", border: "2a78d6" })); out.push(spacer(80)); }
    else if (b.type === "ul") out.push(...bullets(b.items));
    else if (b.type === "ol") out.push(...numbered(b.items));
    else if (b.type === "table") {
      const cols = b.rows[0].map((l, i) => ({ label: l || " ", width: Math.floor(100 / b.rows[0].length), align: i ? "left" : "left" }));
      out.push(table(cols, b.rows.slice(1))); out.push(spacer(80));
    }
  }
  return out;
}

/** Signature / contact block. */
export function contactBlock() {
  const b = brand();
  return [
    p(b.contact ? `**${b.contact}**${b.contactTitle ? `, ${b.contactTitle}` : ""}` : `**${b.company}**`),
    p([b.company, b.address].filter(Boolean).join(" · "), { color: GREY, size: 18 }),
    p([b.phone && `Tel ${b.phone}`, b.mobile && `Mob ${b.mobile}`, b.contactEmail || b.email, b.web].filter(Boolean).join(" · "), { color: GREY, size: 18 }),
  ];
}
