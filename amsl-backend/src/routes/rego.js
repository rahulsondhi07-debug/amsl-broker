import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- Offers (the marketplace catalogue) ---------- */

// GET /api/rego/offers?marketplace=&technology=&vintage_year=&max_price=&status=
r.get("/offers", (req, res) => {
  const where = [];
  const params = [];
  const q = req.query;
  if (q.marketplace) { where.push("marketplace = ?"); params.push(q.marketplace); }
  if (q.technology) { where.push("technology = ?"); params.push(q.technology); }
  if (q.country) { where.push("country = ?"); params.push(q.country); }
  if (q.vintage_year) { where.push("vintage_year = ?"); params.push(Number(q.vintage_year)); }
  if (q.max_price) { where.push("price_per_mwh <= ?"); params.push(Number(q.max_price)); }
  // Default to showing only what's actually purchasable; pass status=all to see everything.
  if (q.status && q.status !== "all") { where.push("status = ?"); params.push(q.status); }
  else if (!q.status) { where.push("status = 'Available'"); }
  const sql = `SELECT * FROM rego_offers ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY price_per_mwh ASC, marketplace`;
  res.json({ data: db.prepare(sql).all(...params) });
});

const OFFER_COLS = ["marketplace", "technology", "country", "vintage_year", "price_per_mwh",
                    "volume_available", "generator_name", "status", "notes"];

r.post("/offers", (req, res) => {
  const b = req.body || {};
  if (!b.marketplace) return res.status(400).json({ error: "marketplace is required" });
  if (b.price_per_mwh == null || Number(b.price_per_mwh) < 0) return res.status(400).json({ error: "A valid price_per_mwh is required" });
  const cols = OFFER_COLS.filter((c) => b[c] !== undefined);
  const info = db.prepare(`INSERT INTO rego_offers (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...cols.map((c) => b[c]));
  res.status(201).json({ data: db.prepare("SELECT * FROM rego_offers WHERE id=?").get(info.lastInsertRowid) });
});

const updOffer = (req, res) => {
  const b = req.body || {};
  const cols = OFFER_COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE rego_offers SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM rego_offers WHERE id=?").get(req.params.id) });
};
r.put("/offers/:id", updOffer);
r.patch("/offers/:id", updOffer);

r.delete("/offers/:id", (req, res) => {
  const info = db.prepare("DELETE FROM rego_offers WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

/* ---------- Purchases ---------- */

// GET /api/rego/purchases?business_id=123  (business_id optional — omit for all)
r.get("/purchases", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.business_id) { where.push("p.business_id = ?"); params.push(req.query.business_id); }
  if (req.query.status) { where.push("p.status = ?"); params.push(req.query.status); }
  const sql = `SELECT p.*, b.business_name
               FROM rego_purchases p LEFT JOIN businesses b ON b.id = p.business_id
               ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
               ORDER BY p.purchase_date DESC, p.id DESC`;
  res.json({ data: db.prepare(sql).all(...params) });
});

// POST /api/rego/purchases — buy a volume of REGOs for a customer.
// Decrements the offer's remaining volume in the same transaction so the catalogue can't
// oversell, and copies the offer's details onto the purchase so the record stays accurate
// even if the offer is later re-priced or withdrawn.
r.post("/purchases", (req, res) => {
  const b = req.body || {};
  if (!b.business_id) return res.status(400).json({ error: "business_id is required" });
  const volume = Number(b.volume_mwh);
  if (!volume || volume <= 0) return res.status(400).json({ error: "volume_mwh must be greater than zero" });

  const offer = b.offer_id ? db.prepare("SELECT * FROM rego_offers WHERE id=?").get(b.offer_id) : null;
  if (b.offer_id && !offer) return res.status(404).json({ error: "offer not found" });
  if (offer && offer.status !== "Available") return res.status(400).json({ error: `This offer is ${offer.status.toLowerCase()} and can no longer be purchased.` });
  if (offer && offer.volume_available != null && volume > offer.volume_available) {
    return res.status(400).json({ error: `Only ${offer.volume_available} MWh remains on this offer.` });
  }

  const price = b.price_per_mwh != null ? Number(b.price_per_mwh) : offer?.price_per_mwh;
  if (price == null) return res.status(400).json({ error: "price_per_mwh is required when no offer is selected" });
  const total = round2(price * volume);

  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO rego_purchases
      (business_id, offer_id, marketplace, technology, country, vintage_year, volume_mwh, price_per_mwh, total_cost, purchase_date, certificate_ref, status, notes)
      VALUES (?,?,?,?,?,?,?,?,?,COALESCE(?, date('now')),?,?,?)`)
      .run(b.business_id, b.offer_id || null,
        b.marketplace ?? offer?.marketplace ?? null,
        b.technology ?? offer?.technology ?? null,
        b.country ?? offer?.country ?? null,
        b.vintage_year ?? offer?.vintage_year ?? null,
        volume, price, total, b.purchase_date || null,
        b.certificate_ref || null, b.status || "Ordered", b.notes || null);

    if (offer && offer.volume_available != null) {
      const remaining = round2(offer.volume_available - volume);
      db.prepare("UPDATE rego_offers SET volume_available=?, status=? WHERE id=?")
        .run(remaining, remaining <= 0 ? "Sold Out" : offer.status, offer.id);
    }
    return info.lastInsertRowid;
  });

  const id = tx();
  res.status(201).json({ data: db.prepare("SELECT * FROM rego_purchases WHERE id=?").get(id) });
});

const updPurchase = (req, res) => {
  const b = req.body || {};
  const cols = ["certificate_ref", "status", "notes", "purchase_date"].filter((c) => b[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE rego_purchases SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => b[c]), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: db.prepare("SELECT * FROM rego_purchases WHERE id=?").get(req.params.id) });
};
r.put("/purchases/:id", updPurchase);
r.patch("/purchases/:id", updPurchase);

// Cancelling a purchase returns its volume to the originating offer, so the catalogue
// stays consistent rather than permanently losing that stock.
r.delete("/purchases/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM rego_purchases WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM rego_purchases WHERE id=?").run(req.params.id);
    if (p.offer_id) {
      const offer = db.prepare("SELECT * FROM rego_offers WHERE id=?").get(p.offer_id);
      if (offer && offer.volume_available != null) {
        db.prepare("UPDATE rego_offers SET volume_available=?, status=? WHERE id=?")
          .run(round2(offer.volume_available + p.volume_mwh), offer.status === "Sold Out" ? "Available" : offer.status, offer.id);
      }
    }
  });
  tx();
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

export default r;
