/**
 * Market reports, client knowledge base and glossary, plus client hubs.
 *
 *   /api/knowledge/articles        CRUD; ?audience=client&published=1&q=
 *   /api/knowledge/glossary        CRUD
 *   /api/knowledge/market-reports  CRUD, each with a price table
 *   /api/knowledge/hubs            one private, shareable page per customer
 *   /api/hub/:token                the public read of a hub (no login)
 */
import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.js";
import { computeSnapshot } from "../lib/flexCalc.js";
import { CATEGORIES } from "../seeds/knowledge.js";

const r = Router();
const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/* ---------------- Articles ---------------- */
const ART_COLS = ["slug", "category", "title", "summary", "body", "audience", "published", "sort_order"];

r.get("/articles", (req, res) => {
  const where = [], p = [];
  if (req.query.audience) { where.push("audience = ?"); p.push(req.query.audience); }
  if (req.query.published != null && req.query.published !== "") { where.push("published = ?"); p.push(Number(req.query.published)); }
  if (req.query.category) { where.push("category = ?"); p.push(req.query.category); }
  if (req.query.q) { where.push("(title LIKE ? OR summary LIKE ? OR body LIKE ?)"); const q = `%${req.query.q}%`; p.push(q, q, q); }
  const rows = db.prepare(`SELECT * FROM knowledge_articles ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                           ORDER BY category, sort_order, title`).all(...p);
  res.json({ data: rows, meta: { categories: [...new Set([...CATEGORIES, ...rows.map((x) => x.category)])] } });
});
r.get("/articles/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM knowledge_articles WHERE id=? OR slug=?").get(req.params.id, req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({ data: row });
});
r.post("/articles", (req, res) => {
  const b = { ...(req.body || {}) };
  if (!b.title || !b.category) return res.status(400).json({ error: "title and category are required" });
  b.slug = slugify(b.slug || b.title);
  if (db.prepare("SELECT 1 FROM knowledge_articles WHERE slug=?").get(b.slug)) b.slug = `${b.slug}-${Date.now().toString(36)}`;
  const cols = ART_COLS.filter((c) => b[c] !== undefined);
  const info = db.prepare(`INSERT INTO knowledge_articles (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((c) => b[c]));
  res.status(201).json({ data: db.prepare("SELECT * FROM knowledge_articles WHERE id=?").get(info.lastInsertRowid) });
});
r.put("/articles/:id", (req, res) => {
  const b = req.body || {};
  const cols = ART_COLS.filter((c) => b[c] !== undefined && c !== "slug");
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE knowledge_articles SET ${cols.map((c) => `${c}=?`).join(",")}, updated_at=datetime('now') WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM knowledge_articles WHERE id=?").get(req.params.id) });
});
r.delete("/articles/:id", (req, res) => {
  const info = db.prepare("DELETE FROM knowledge_articles WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---------------- Glossary ---------------- */
r.get("/glossary", (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  res.json({ data: db.prepare(`SELECT * FROM glossary_terms ${q ? "WHERE term LIKE ? OR definition LIKE ?" : ""} ORDER BY term COLLATE NOCASE`).all(...(q ? [q, q] : [])) });
});
r.post("/glossary", (req, res) => {
  const b = req.body || {};
  if (!b.term || !b.definition) return res.status(400).json({ error: "term and definition are required" });
  try {
    const info = db.prepare("INSERT INTO glossary_terms (term, definition, category) VALUES (?,?,?)").run(b.term.trim(), b.definition, b.category || null);
    res.status(201).json({ data: db.prepare("SELECT * FROM glossary_terms WHERE id=?").get(info.lastInsertRowid) });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return res.status(400).json({ error: "That term is already in the glossary" });
    throw e;
  }
});
r.put("/glossary/:id", (req, res) => {
  const b = req.body || {};
  const cols = ["term", "definition", "category"].filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE glossary_terms SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`).run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM glossary_terms WHERE id=?").get(req.params.id) });
});
r.delete("/glossary/:id", (req, res) => {
  const info = db.prepare("DELETE FROM glossary_terms WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---------------- Market reports ---------------- */
const MR_COLS = ["title", "report_date", "status", "headline", "summary", "backdrop", "drivers", "outlook",
  "fixed_view", "flex_view", "sources", "author"];

export function marketReport(id) {
  const rep = db.prepare("SELECT * FROM market_reports WHERE id=?").get(id);
  if (!rep) return null;
  const prices = db.prepare("SELECT * FROM market_report_prices WHERE report_id=? ORDER BY sort_order, id").all(id)
    .map((p) => ({ ...p, change: p.price != null && p.previous != null ? Math.round((p.price - p.previous) * 100) / 100 : null,
      change_pct: p.price != null && p.previous ? Math.round(((p.price - p.previous) / p.previous) * 1000) / 10 : null }));
  return { ...rep, prices };
}

r.get("/market-reports", (req, res) => {
  const w = req.query.status ? "WHERE status=?" : "";
  res.json({ data: db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM market_report_prices p WHERE p.report_id=m.id) AS prices
                               FROM market_reports m ${w} ORDER BY report_date DESC, id DESC`).all(...(req.query.status ? [req.query.status] : [])) });
});
r.get("/market-reports/latest", (_req, res) => {
  const row = db.prepare("SELECT id FROM market_reports WHERE status='Published' ORDER BY report_date DESC, id DESC LIMIT 1").get();
  res.json({ data: row ? marketReport(row.id) : null });
});
r.get("/market-reports/:id", (req, res) => {
  const rep = marketReport(req.params.id);
  if (!rep) return res.status(404).json({ error: "not found" });
  res.json({ data: rep });
});

function savePrices(id, prices) {
  if (!Array.isArray(prices)) return;
  const n = (v) => (v === "" || v == null ? null : Number(v));
  const ins = db.prepare("INSERT INTO market_report_prices (report_id, commodity, contract, price, unit, previous, note, sort_order) VALUES (?,?,?,?,?,?,?,?)");
  db.prepare("DELETE FROM market_report_prices WHERE report_id=?").run(id);
  prices.filter((p) => p.contract).forEach((p, i) => ins.run(id, p.commodity || "Power", p.contract, n(p.price), p.unit || (p.commodity === "Gas" ? "p/therm" : "£/MWh"), n(p.previous), p.note || null, i));
}

r.post("/market-reports", (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.report_date) return res.status(400).json({ error: "title and report_date are required" });
  const cols = MR_COLS.filter((c) => b[c] !== undefined);
  const id = db.transaction(() => {
    const id = db.prepare(`INSERT INTO market_reports (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((c) => b[c])).lastInsertRowid;
    savePrices(id, b.prices);
    return id;
  })();
  res.status(201).json({ data: marketReport(id) });
});

/**
 * Start a new report from the last one: same structure and price list, with today's
 * prices blank and last report's prices carried into "previous" for the change column.
 */
r.post("/market-reports/:id/roll-forward", (req, res) => {
  const src = marketReport(req.params.id);
  if (!src) return res.status(404).json({ error: "not found" });
  const today = req.body?.report_date || new Date().toISOString().slice(0, 10);
  const id = db.transaction(() => {
    const id = db.prepare(`INSERT INTO market_reports (title, report_date, status, drivers, sources, author) VALUES (?,?, 'Draft', ?, ?, ?)`)
      .run(src.title, today, src.drivers, src.sources, src.author).lastInsertRowid;
    savePrices(id, src.prices.map((p) => ({ ...p, previous: p.price, price: null })));
    return id;
  })();
  res.status(201).json({ data: marketReport(id) });
});

r.put("/market-reports/:id", (req, res) => {
  const b = req.body || {};
  const cols = MR_COLS.filter((c) => b[c] !== undefined);
  db.transaction(() => {
    if (cols.length) db.prepare(`UPDATE market_reports SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`).run(...cols.map((c) => b[c]), req.params.id);
    savePrices(req.params.id, b.prices);
  })();
  const rep = marketReport(req.params.id);
  if (!rep) return res.status(404).json({ error: "not found" });
  res.json({ data: rep });
});
r.delete("/market-reports/:id", (req, res) => {
  const info = db.prepare("DELETE FROM market_reports WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---------------- Client hubs ---------------- */
r.get("/hubs", (_req, res) => {
  res.json({ data: db.prepare(`SELECT h.*, b.business_name, fb.name AS basket_name,
      (SELECT COUNT(*) FROM generated_documents d WHERE d.business_id=h.business_id AND d.published=1) AS documents
    FROM client_hubs h JOIN businesses b ON b.id=h.business_id LEFT JOIN flex_baskets fb ON fb.id=h.basket_id
    ORDER BY b.business_name`).all() });
});
r.get("/hubs/by-business/:businessId", (req, res) => {
  res.json({ data: db.prepare("SELECT * FROM client_hubs WHERE business_id=?").get(req.params.businessId) || null });
});
/** Create (or return) the hub for a customer. The token is the only key to the page. */
r.post("/hubs", (req, res) => {
  const b = req.body || {};
  if (!b.business_id) return res.status(400).json({ error: "business_id is required" });
  const biz = db.prepare("SELECT id FROM businesses WHERE id=?").get(b.business_id);
  if (!biz) return res.status(404).json({ error: "customer not found" });
  let hub = db.prepare("SELECT * FROM client_hubs WHERE business_id=?").get(b.business_id);
  if (!hub) {
    // Default the consortium to the one the customer is a member of, if any.
    const member = db.prepare("SELECT basket_id FROM flex_basket_members WHERE business_id=? AND status='Active' LIMIT 1").get(b.business_id);
    db.prepare("INSERT INTO client_hubs (business_id, token, welcome_message, basket_id) VALUES (?,?,?,?)")
      .run(b.business_id, crypto.randomBytes(18).toString("base64url"), b.welcome_message || null, b.basket_id ?? member?.basket_id ?? null);
    hub = db.prepare("SELECT * FROM client_hubs WHERE business_id=?").get(b.business_id);
  }
  res.status(201).json({ data: hub });
});
r.put("/hubs/:id", (req, res) => {
  const b = req.body || {};
  const cols = ["enabled", "welcome_message", "basket_id"].filter((c) => b[c] !== undefined);
  if (b.regenerate_token) { cols.push("token"); b.token = crypto.randomBytes(18).toString("base64url"); }
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE client_hubs SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`).run(...cols.map((c) => (c === "basket_id" && b[c] === "" ? null : b[c])), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM client_hubs WHERE id=?").get(req.params.id) });
});
r.delete("/hubs/:id", (req, res) => {
  const info = db.prepare("DELETE FROM client_hubs WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

export default r;

/* ---------------- Public hub (mounted at /api/hub, no login) ---------------- */
export const hubPublic = Router();

function hubFor(token) {
  const hub = db.prepare(`SELECT h.*, b.business_name FROM client_hubs h JOIN businesses b ON b.id=h.business_id
                          WHERE h.token=? AND h.enabled=1`).get(token);
  return hub || null;
}

/**
 * Everything the client sees, in one call. Only published documents for THIS customer,
 * only client-audience published articles, and only published market reports.
 */
hubPublic.get("/:token", (req, res) => {
  const hub = hubFor(req.params.token);
  if (!hub) return res.status(404).json({ error: "This link is not active. Please contact your energy consultant." });
  db.prepare("UPDATE client_hubs SET views=views+1, last_viewed_at=datetime('now') WHERE id=?").run(hub.id);
  const settings = Object.fromEntries(db.prepare("SELECT key,value FROM app_settings WHERE key LIKE 'doc_%' OR key LIKE 'flex_min_%' OR key IN ('brand_name','primary_color','logo_url')").all().map((x) => [x.key, x.value]));
  const documents = db.prepare(`SELECT id, doc_type, title, filename, mime, size, created_at FROM generated_documents
                                WHERE business_id=? AND published=1 ORDER BY created_at DESC`).all(hub.business_id);
  const articles = db.prepare(`SELECT id, slug, category, title, summary, body FROM knowledge_articles
                               WHERE audience='client' AND published=1 ORDER BY category, sort_order, title`).all();
  const glossary = db.prepare("SELECT term, definition, category FROM glossary_terms ORDER BY term COLLATE NOCASE").all();
  const mr = db.prepare("SELECT id FROM market_reports WHERE status='Published' ORDER BY report_date DESC, id DESC LIMIT 1").get();
  let position = null;
  if (hub.basket_id) {
    const snap = computeSnapshot(hub.basket_id);
    // Clients see the book, not the trade log or internal thresholds.
    if (snap) position = {
      basket: { name: snap.basket.name, report_date: snap.basket.report_date, market_commentary: snap.basket.market_commentary,
        member_message: snap.basket.member_message, common_end_date: snap.basket.common_end_date },
      positions: snap.positions.map((p) => ({
        utility: p.utility, units: p.units, hedged_pct: p.hedged_pct, locked_avg: p.locked_avg, market_avg: p.market_avg,
        traded_total: p.traded_total, required_total: p.required_total, saving_pct: p.saving_pct,
        near_season: p.near_season, opportunity_season: p.opportunity_season,
        seasonal: p.seasonal.map(({ label, market, locked, hedged_pct, saving, traded, open, vol_req }) => ({ label, market, locked, hedged_pct, saving, traded, open, vol_req })),
      })),
    };
  }
  res.json({
    data: {
      business_name: hub.business_name, welcome_message: hub.welcome_message, settings,
      documents, articles, glossary, market_report: mr ? marketReport(mr.id) : null, position,
    },
  });
});

hubPublic.get("/:token/documents/:id", (req, res) => {
  const hub = hubFor(req.params.token);
  if (!hub) return res.status(404).json({ error: "This link is not active." });
  const doc = db.prepare("SELECT * FROM generated_documents WHERE id=? AND business_id=? AND published=1").get(req.params.id, hub.business_id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  sendDoc(res, doc, req.query.inline === "1");
});

export function sendDoc(res, doc, inline = false) {
  res.setHeader("Content-Type", doc.mime);
  const safe = doc.filename.replace(/[^\w.\- ()&]/g, "_");
  res.setHeader("Content-Disposition", `${inline || /html/.test(doc.mime) ? "inline" : "attachment"}; filename="${safe}"`);
  res.send(Buffer.from(doc.content));
}
