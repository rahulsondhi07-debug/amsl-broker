import { Router } from "express";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { db } from "../db.js";

const r = Router();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = {
  group: { file: "TemplateGroupFile.xlsx", name: "TemplateGroupFile.xlsx" },
  basket: { file: "TemplateBasketFile.xlsx", name: "TemplateBasketFile.xlsx" },
};

/** Columns as they appear in the supplier's templates. Basket adds CRN — a basket is a set
 *  of INDIVIDUAL contracts, so each business needs its own company registration number. */
const FIELDS = [
  ["business_name", /business\s*name/i, true],
  ["postcode", /post\s*code/i, false],
  ["crn", /^crn$|company\s*reg/i, false],
  ["mpan_top", /mpan\s*top/i, false],
  ["mpan_core", /mpan\s*core/i, false],
  ["eac_day", /eac[_ ]?day/i, false],
  ["eac_night", /eac[_ ]?night/i, false],
  ["eac_ewe", /eac[_ ]?ewe/i, false],
  ["mprn", /mprn/i, false],
  ["aq", /^aq$/i, false],
  ["start_date", /prefer+ed\s*start/i, false],
  ["end_date", /prefer+ed\s*end/i, false],
];

const cellText = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (v.text) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
  }
  return String(v).trim();
};
const numOrNull = (v) => {
  const s = cellText(v).replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const digits = (v) => cellText(v).replace(/\D/g, "");

/** dd/mm/yyyy (as in the templates) or an Excel date, to ISO. */
function toIso(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = cellText(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Check one row. Problems are reported per row rather than rejecting the whole file: a
 * 200-site upload with two bad rows should still be usable, with those two flagged.
 */
function checkRow(row) {
  const issues = [];
  if (!row.business_name) issues.push("Business Name is missing");
  const hasElec = !!row.mpan_core;
  const hasGas = !!row.mprn;
  if (!hasElec && !hasGas) issues.push("No MPAN Core or MPRN — nothing to quote for this site");
  if (row.mpan_core && row.mpan_core.length !== 13) issues.push(`MPAN Core should be 13 digits, got ${row.mpan_core.length}`);
  if (row.mprn && (row.mprn.length < 6 || row.mprn.length > 10)) issues.push(`MPRN should be up to 10 digits, got ${row.mprn.length}`);
  if (hasElec && row.eac_day == null && row.eac_night == null && row.eac_ewe == null) {
    issues.push("Electricity site has no EAC — supplier cannot price it");
  }
  if (hasGas && row.aq == null) issues.push("Gas site has no AQ — supplier cannot price it");
  if (row.start_date && row.end_date && row.end_date < row.start_date) {
    issues.push("Preferred end date is before the start date");
  }
  return issues;
}


/**
 * Remove cell comments from a workbook.
 *
 * Templates often carry tooltip notes on the header cells, and the spreadsheet reader
 * throws on them ("Cannot read properties of undefined (reading 'comments')"), failing
 * the whole upload. The comments are of no interest to us, so they are stripped and the
 * file re-read rather than asking people to clean the file by hand.
 *
 * An .xlsx is a zip: drop the comment and legacy-drawing parts, then remove the
 * references to them, or the reader will complain about files that no longer exist.
 */
async function stripComments(buf) {
  const zip = await JSZip.loadAsync(buf);
  // Writers place these differently — xl/comments1.xml or xl/comments/comment1.xml — so
  // match on the file name rather than an exact path.
  const isComment = (f) => /comments?\d*\.xml$/i.test(f) || /\.vml$/i.test(f) || /vmlDrawing/i.test(f);
  const dead = Object.keys(zip.files).filter(isComment);
  if (!dead.length) return buf;
  dead.forEach((f) => zip.remove(f));

  for (const name of Object.keys(zip.files)) {
    if (/_rels\/.*\.rels$/i.test(name)) {
      let xml = await zip.file(name).async("string");
      // Drop any relationship pointing at a comment or VML part, whatever the path style.
      xml = xml.replace(/<Relationship\b[^>]*\/>/gi, (tag) => (/comment|vml/i.test(tag) ? "" : tag));
      zip.file(name, xml);
    } else if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) {
      let xml = await zip.file(name).async("string");
      xml = xml.replace(/<legacyDrawing[^>]*\/>/gi, "");
      zip.file(name, xml);
    } else if (/^\[Content_Types\]\.xml$/i.test(name)) {
      let xml = await zip.file(name).async("string");
      xml = xml.replace(/<Override\b[^>]*\/>/gi, (tag) => (/comment/i.test(tag) ? "" : tag))
               .replace(/<Default\b[^>]*Extension="vml"[^>]*\/>/gi, "");
      zip.file(name, xml);
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Read a group/basket file (xlsx or csv) into checked rows. */
async function parseFile(buf, filename = "") {
  let header = [], body = [];
  if (/\.csv$/i.test(filename) || buf.subarray(0, 2).toString() !== "PK") {
    const lines = buf.toString("utf8").split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return { rows: [], columns: [] };
    const split = (l) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    header = split(lines[0]);
    body = lines.slice(1).map(split);
  } else {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf);
    } catch (e) {
      // Comments are the usual cause; strip them and try once more before giving up.
      const cleaned = await stripComments(buf);
      await wb.xlsx.load(cleaned);
    }
    const ws = wb.worksheets.find((w) => w.actualRowCount > 1) || wb.worksheets[0];
    if (!ws) return { rows: [], columns: [] };
    const rowsRaw = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = cell.value; });
      rowsRaw.push(vals);
    });
    if (!rowsRaw.length) return { rows: [], columns: [] };
    header = rowsRaw[0].map(cellText);
    body = rowsRaw.slice(1);
  }

  // Map each template column to a field by matching the header text.
  const idx = {};
  FIELDS.forEach(([key, re]) => {
    const i = header.findIndex((h) => re.test(String(h || "")));
    if (i >= 0) idx[key] = i;
  });

  const rows = body.map((cells, n) => {
    const get = (k) => (idx[k] == null ? null : cells[idx[k]]);
    const row = {
      row_no: n + 2,           // +2: sheet row number, allowing for the header
      business_name: cellText(get("business_name")),
      postcode: cellText(get("postcode")),
      crn: cellText(get("crn")),
      mpan_top: digits(get("mpan_top")),
      mpan_core: digits(get("mpan_core")),
      eac_day: numOrNull(get("eac_day")),
      eac_night: numOrNull(get("eac_night")),
      eac_ewe: numOrNull(get("eac_ewe")),
      mprn: digits(get("mprn")),
      aq: numOrNull(get("aq")),
      start_date: toIso(get("start_date")),
      end_date: toIso(get("end_date")),
    };
    return { ...row, issues: checkRow(row) };
  }).filter((x) => x.business_name || x.mpan_core || x.mprn);   // drop blank trailing rows

  return { rows, columns: header.filter(Boolean), matched: Object.keys(idx) };
}

/* ---- Templates ---- */
r.get("/templates/:kind", (req, res) => {
  const t = TEMPLATES[String(req.params.kind).toLowerCase()];
  if (!t) return res.status(404).json({ error: "Template must be 'group' or 'basket'" });
  const p = path.join(HERE, "..", "templates", t.file);
  if (!fs.existsSync(p)) return res.status(500).json({ error: "Template file is missing from the server" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${t.name}"`);
  fs.createReadStream(p).pipe(res);
});

/** CSV template for the lead importer, matching the columns that importer accepts. */
r.get("/templates/leads/csv", (_req, res) => {
  const csv = "Business Name,Contact Name,Email,Mobile,Fuel\n"
    + "Acme Ltd,Jane Doe,jane@acme.co.uk,07700900000,Elec\n"
    + "Beta Foods,Sam Roe,sam@beta.co.uk,07700900111,Dual\n";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="LeadImportTemplate.csv"');
  res.send(csv);
});

/* ---- Parse an uploaded file without saving anything ---- */
r.post("/parse", async (req, res) => {
  const { file_base64, filename } = req.body || {};
  if (!file_base64) return res.status(400).json({ error: "file_base64 is required" });
  let buf;
  try { buf = Buffer.from(file_base64, "base64"); } catch { return res.status(400).json({ error: "The file could not be decoded" }); }
  try {
    const { rows, columns, matched } = await parseFile(buf, filename || "");
    if (!rows.length) {
      return res.status(422).json({ error: "No site rows found. Use the group or basket template, with a header row and one row per site." });
    }
    res.json({
      data: {
        rows, columns, matched,
        total: rows.length,
        with_issues: rows.filter((x) => x.issues.length).length,
        businesses: [...new Set(rows.map((x) => x.business_name).filter(Boolean))],
      },
    });
  } catch (e) {
    res.status(422).json({ error: `The file could not be read: ${e.message}` });
  }
});

/* ---- Quotes ---- */
const COLS = ["quote_kind", "supplier_id", "quote_suppliers", "business_id", "company_name", "basket_name", "group_name",
  "company_reg_no", "required_by", "terms", "product", "monthly_variable", "third_party_mop",
  "third_party_dadc", "nominate_dadc", "property_managing_agent", "green_electricity",
  "carbon_offset_gas", "carbon_offset_elec", "source_filename", "notes", "status"];
const BOOLS = new Set(["monthly_variable", "third_party_mop", "third_party_dadc", "nominate_dadc",
  "property_managing_agent", "green_electricity", "carbon_offset_gas", "carbon_offset_elec"]);

const parseQuote = (q) => q && { ...q, terms: q.terms ? JSON.parse(q.terms) : [] };

r.get("/", (req, res) => {
  const where = [], params = [];
  if (req.query.status) { where.push("q.status = ?"); params.push(req.query.status); }
  if (req.query.kind) { where.push("q.quote_kind = ?"); params.push(req.query.kind); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json({
    data: db.prepare(`SELECT q.*, s.name AS supplier_name,
        (SELECT COUNT(*) FROM group_quote_sites g WHERE g.quote_id = q.id) AS sites,
        (SELECT COALESCE(SUM(COALESCE(eac_day,0)+COALESCE(eac_night,0)+COALESCE(eac_ewe,0)),0)
           FROM group_quote_sites g WHERE g.quote_id = q.id) AS total_eac,
        (SELECT COALESCE(SUM(COALESCE(aq,0)),0) FROM group_quote_sites g WHERE g.quote_id = q.id) AS total_aq
      FROM group_quotes q LEFT JOIN suppliers s ON s.id = q.supplier_id
      ${w} ORDER BY q.created_at DESC`).all(...params).map(parseQuote),
  });
});

r.get("/:id", (req, res) => {
  const q = parseQuote(db.prepare(`SELECT q.*, s.name AS supplier_name FROM group_quotes q
    LEFT JOIN suppliers s ON s.id = q.supplier_id WHERE q.id=?`).get(req.params.id));
  if (!q) return res.status(404).json({ error: "not found" });
  const sites = db.prepare("SELECT * FROM group_quote_sites WHERE quote_id=? ORDER BY row_no, id").all(req.params.id)
    .map((s) => ({ ...s, issues: s.issues ? JSON.parse(s.issues) : [] }));
  res.json({ data: { ...q, sites } });
});

r.post("/", (req, res) => {
  const b = req.body || {};
  const kind = b.quote_kind === "Basket" ? "Basket" : "Group";
  // A group quote needs a group name, a basket quote a basket name — that is the whole
  // distinction on the supplier's form, so it is enforced rather than left to the user.
  if (kind === "Group" && !b.group_name) return res.status(400).json({ error: "Group Name is required for a group quotation" });
  if (kind === "Basket" && !b.basket_name) return res.status(400).json({ error: "Basket Name is required for a basket quotation" });
  const sites = Array.isArray(b.sites) ? b.sites : [];
  if (!sites.length) return res.status(400).json({ error: "Upload a group or basket file with at least one site" });

  const n = db.prepare("SELECT COUNT(*) c FROM group_quotes").get().c + 1;
  const ref = `GQ-${String(n).padStart(3, "0")}`;
  const vals = COLS.map((c) => {
    if (c === "quote_kind") return kind;
    if (c === "terms") return JSON.stringify(Array.isArray(b.terms) ? b.terms : []);
    if (BOOLS.has(c)) return b[c] ? 1 : 0;
    if (c === "status") return b.status || "Draft";
    if (c === "supplier_id" || c === "business_id") return b[c] ? Number(b[c]) : null;
    // Suppliers arrive as an array from the multi-select; stored as a clean, de-duplicated
    // comma-joined string so it reads straight out onto the quotation.
    if (c === "quote_suppliers") {
      const list = Array.isArray(b.quote_suppliers) ? b.quote_suppliers : String(b.quote_suppliers || "").split(",");
      const clean = [...new Set(list.map((x) => String(x).trim()).filter(Boolean))];
      return clean.length ? clean.join(", ") : null;
    }
    return b[c] ?? null;
  });
  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO group_quotes (${COLS.join(",")}, ref) VALUES (${COLS.map(() => "?").join(",")}, ?)`)
      .run(...vals, ref);
    const id = info.lastInsertRowid;
    const ins = db.prepare(`INSERT INTO group_quote_sites
      (quote_id,row_no,business_name,postcode,crn,mpan_top,mpan_core,eac_day,eac_night,eac_ewe,mprn,aq,start_date,end_date,issues)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    sites.forEach((s, i) => ins.run(id, s.row_no ?? i + 2, s.business_name || null, s.postcode || null,
      s.crn || null, s.mpan_top || null, s.mpan_core || null,
      s.eac_day ?? null, s.eac_night ?? null, s.eac_ewe ?? null, s.mprn || null, s.aq ?? null,
      s.start_date || null, s.end_date || null, JSON.stringify(s.issues || [])));
    return id;
  });
  const id = tx();
  res.status(201).json({ data: { id, ref } });
});

r.patch("/:id/status", (req, res) => {
  const allowed = ["Draft", "Sent", "Quoted", "Won", "Lost"];
  const { status } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ error: `Status must be one of: ${allowed.join(", ")}` });
  const info = db.prepare("UPDATE group_quotes SET status=? WHERE id=?").run(status, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), status } });
});

r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM group_quotes WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/**
 * Turn the sites of a quote into leads and meters.
 *
 * Two modes:
 *   attach_to_business_id  every site becomes a meter on that one business — a group of
 *                          sites belonging to a single company.
 *   otherwise              one lead per distinct Business Name in the file, each with its
 *                          own meters.
 * Businesses are matched on name before being created, so re-running does not duplicate
 * them, and a meter already on file is left alone rather than added twice.
 */
r.post("/:id/create-leads", (req, res) => {
  const quote = db.prepare("SELECT * FROM group_quotes WHERE id=?").get(req.params.id);
  if (!quote) return res.status(404).json({ error: "not found" });
  const sites = db.prepare("SELECT * FROM group_quote_sites WHERE quote_id=?").all(req.params.id);
  if (!sites.length) return res.status(400).json({ error: "This quotation has no sites" });
  let attachTo = req.body?.attach_to_business_id ? Number(req.body.attach_to_business_id) : null;
  if (attachTo && !db.prepare("SELECT id FROM businesses WHERE id=?").get(attachTo)) {
    return res.status(404).json({ error: "The business to attach to was not found" });
  }
  // Attaching to a business that is not on the portal yet is the common case for a new
  // multi-site client, so a name can be given instead of an id. An existing business of
  // that name is reused rather than duplicated.
  const newName = (req.body?.attach_to_business_name || "").trim();
  let attachCreated = false;
  if (!attachTo && newName) {
    const found = db.prepare("SELECT id FROM businesses WHERE lower(business_name)=lower(?) LIMIT 1").get(newName);
    if (found) attachTo = found.id;
    else {
      const anyElec = sites.some((s) => s.mpan_core), anyGas = sites.some((s) => s.mprn);
      const fuel = anyElec && anyGas ? "DUAL" : anyGas ? "GAS" : "ELEC";
      const ref = `L-${String(db.prepare("SELECT COUNT(*) c FROM businesses").get().c + 1).padStart(4, "0")}`;
      attachTo = db.prepare(`INSERT INTO businesses (ref, business_name, stage, journey_stage, fuel)
                             VALUES (?,?,'LEAD','New Lead',?)`).run(ref, newName, fuel).lastInsertRowid;
      attachCreated = true;
    }
  }

  const findByName = db.prepare("SELECT id FROM businesses WHERE lower(business_name)=lower(?) LIMIT 1");
  const nextRef = () => `L-${String(db.prepare("SELECT COUNT(*) c FROM businesses").get().c + 1).padStart(4, "0")}`;
  // Columns match the existing lead importer: leads are created at stage LEAD with a
  // journey stage of New Lead, and the fuel is set from what the row actually carries.
  const insBiz = db.prepare(`INSERT INTO businesses (ref, business_name, stage, journey_stage, fuel)
                             VALUES (?,?,'LEAD','New Lead',?)`);
  const hasMeter = db.prepare("SELECT id, site_id FROM meters WHERE business_id=? AND mpan_mprn=?");
  const linkMeter = db.prepare("UPDATE meters SET site_id=?, name=COALESCE(name,?) WHERE id=?");
  // Each row in the file is a physical site, so it gets a site record and its meters hang
  // off it. Without this the meters loaded but the Sites count stayed at zero and the
  // site address tab was empty, which is what a group upload is mostly for.
  // Identity is the METER NUMBER, not the postcode: this file has 28 sites across 22
  // postcodes (four separate supplies share one postcode), so matching on postcode would
  // merge distinct sites and lose their meters. Matching on the meter also makes a repeat
  // upload land on the same site instead of creating a second one.
  const siteOfMeter = db.prepare("SELECT site_id FROM meters WHERE business_id=? AND mpan_mprn=? AND site_id IS NOT NULL LIMIT 1");
  const siteNameTaken = db.prepare("SELECT COUNT(*) c FROM sites WHERE business_id=? AND name=?");
  const insSite = db.prepare("INSERT INTO sites (business_id, name, address) VALUES (?,?,?)");
  // Meter status uses this schema's codes: C current, S switching, D dropped.
  const insMeter = db.prepare(`INSERT INTO meters (business_id, site_id, utility, mpan_mprn, topline, eac, aq, name, status)
                               VALUES (?,?,?,?,?,?,?,?,'C')`);

  let createdBiz = attachCreated ? 1 : 0, linkedBiz = attachTo && !attachCreated ? 1 : 0;
  let createdMeters = 0, skippedMeters = 0, createdSites = 0, linkedMeters = 0;
  const skipped = [];

  const tx = db.transaction(() => {
    for (const s of sites) {
      const issues = s.issues ? JSON.parse(s.issues) : [];
      // Rows the supplier could not price are not turned into leads; they are reported back.
      if (issues.length) { skipped.push({ row_no: s.row_no, business_name: s.business_name, issues }); continue; }

      let bizId = attachTo;
      if (!bizId) {
        const found = findByName.get(s.business_name);
        if (found) { bizId = found.id; linkedBiz++; }
        else {
          const fuel = s.mpan_core && s.mprn ? "DUAL" : s.mprn ? "GAS" : "ELEC";
          bizId = insBiz.run(nextRef(), s.business_name, fuel).lastInsertRowid;
          createdBiz++;
        }
      }
      // Reuse the site this row's meters already sit on, if the file has been uploaded before.
      let siteId = null;
      for (const n of [s.mpan_core, s.mprn]) {
        if (!n) continue;
        const hit = siteOfMeter.get(bizId, n);
        if (hit) { siteId = hit.site_id; break; }
      }
      if (!siteId) {
        // Postcodes repeat across separate supplies, so a duplicate name is numbered
        // rather than reused — otherwise four sites would look like one.
        let siteName = s.postcode || `Site ${s.row_no}`;
        const taken = siteNameTaken.get(bizId, siteName).c;
        if (taken) siteName = `${siteName} (${taken + 1})`;
        siteId = insSite.run(bizId, siteName, s.postcode || null).lastInsertRowid;
        createdSites++;
      }
      const siteLabel = db.prepare("SELECT name FROM sites WHERE id=?").get(siteId)?.name || null;

      const add = (utility, number, eac, aq, topline) => {
        if (!number) return;
        const existing = hasMeter.get(bizId, number);
        if (existing) {
          // Meters uploaded before sites were created have no site. Re-running the upload
          // attaches them rather than leaving them loose beside a set of empty new sites.
          if (!existing.site_id) { linkMeter.run(siteId, siteLabel, existing.id); linkedMeters++; }
          else skippedMeters++;
          return;
        }
        insMeter.run(bizId, siteId, utility, number, topline || null, eac ?? null, aq ?? null, siteLabel);
        createdMeters++;
      };
      // Electricity EAC is the sum of the day, night and evening/weekend figures; gas
      // carries AQ instead, which is a different measure and kept in its own column.
      const elecEac = (s.eac_day || 0) + (s.eac_night || 0) + (s.eac_ewe || 0);
      add("ELEC", s.mpan_core, elecEac || null, null, s.mpan_top);
      add("GAS", s.mprn, null, s.aq ?? null, null);
    }
  });
  tx();

  res.json({
    data: {
      businesses_created: createdBiz, businesses_matched: linkedBiz,
      sites_created: createdSites,
      meters_created: createdMeters, meters_already_present: skippedMeters,
      meters_linked_to_sites: linkedMeters,
      rows_skipped: skipped.length, skipped,
      attached_to: attachTo,
    },
  });
});

export default r;
