import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

const COLS = ["agency_id", "record_id", "contract_id", "supplier_id", "gross_amount", "vat_amount",
              "net_amount", "currency", "payment_method", "supplier_paid_on", "paid_on", "status",
              "reference", "crypto_currency", "crypto_network", "wallet_address", "crypto_amount",
              "exchange_rate", "tx_hash", "notes"];

const DETAIL = `SELECT p.*, ag.name AS agency_name, s.name AS supplier_name
                FROM agency_payouts p
                LEFT JOIN agencies ag ON ag.id = p.agency_id
                LEFT JOIN suppliers s ON s.id = p.supplier_id`;

const isCrypto = (m) => String(m || "").toLowerCase().includes("crypto");

// A crypto payout is only meaningful with a destination and a network — sending on the
// wrong chain loses the funds — so both are required before it can be marked Paid.
function validate(body, existing = {}) {
  const merged = { ...existing, ...body };
  if (isCrypto(merged.payment_method)) {
    if (!merged.wallet_address) return "A wallet address is required for a cryptocurrency payout";
    if (!merged.crypto_network) return "A crypto network is required — sending on the wrong chain can lose the funds";
    if (merged.status === "Paid" && !merged.tx_hash) return "Record the transaction hash before marking a crypto payout as Paid";
  }
  if (merged.status === "Paid" && !merged.supplier_paid_on) {
    return "The supplier payment date must be recorded before paying the agency";
  }
  return null;
}

// GET /api/agency-payouts?agency_id=&status=&payment_method=
r.get("/", (req, res) => {
  const where = [];
  const params = [];
  for (const [q, col] of [["agency_id", "p.agency_id"], ["status", "p.status"], ["payment_method", "p.payment_method"], ["supplier_id", "p.supplier_id"]]) {
    if (req.query[q]) { where.push(`${col} = ?`); params.push(req.query[q]); }
  }
  const sql = `${DETAIL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.created_at DESC, p.id DESC`;
  res.json({ data: db.prepare(sql).all(...params) });
});

r.post("/", (req, res) => {
  const b = req.body || {};
  if (!b.agency_id) return res.status(400).json({ error: "agency_id is required" });
  const gross = Number(b.gross_amount) || 0;
  if (gross <= 0) return res.status(400).json({ error: "gross_amount must be greater than zero" });
  const err = validate(b);
  if (err) return res.status(400).json({ error: err });

  const vat = b.vat_amount != null ? Number(b.vat_amount) : 0;
  const net = b.net_amount != null ? Number(b.net_amount) : round2(gross - vat);
  // Derive the coin amount from the GBP net and the rate, so the two can't drift apart.
  const cryptoAmount = b.crypto_amount != null ? Number(b.crypto_amount)
    : (isCrypto(b.payment_method) && Number(b.exchange_rate) > 0 ? round2(net / Number(b.exchange_rate) * 1e6) / 1e6 : null);

  const body = { ...b, gross_amount: gross, vat_amount: vat, net_amount: net, crypto_amount: cryptoAmount };
  const cols = COLS.filter((c) => body[c] !== undefined);
  const info = db.prepare(`INSERT INTO agency_payouts (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...cols.map((c) => body[c]));
  res.status(201).json({ data: db.prepare(`${DETAIL} WHERE p.id = ?`).get(info.lastInsertRowid) });
});

const upd = (req, res) => {
  const existing = db.prepare("SELECT * FROM agency_payouts WHERE id=?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  const b = req.body || {};
  const err = validate(b, existing);
  if (err) return res.status(400).json({ error: err });

  const body = { ...b };
  // Keep net and the derived crypto amount consistent when the money fields change.
  if (b.gross_amount !== undefined || b.vat_amount !== undefined) {
    const gross = Number(b.gross_amount ?? existing.gross_amount) || 0;
    const vat = Number(b.vat_amount ?? existing.vat_amount) || 0;
    body.net_amount = b.net_amount != null ? Number(b.net_amount) : round2(gross - vat);
  }
  const rate = Number(b.exchange_rate ?? existing.exchange_rate);
  const netForCrypto = Number(body.net_amount ?? existing.net_amount);
  if (b.crypto_amount === undefined && isCrypto(b.payment_method ?? existing.payment_method) && rate > 0) {
    body.crypto_amount = round2(netForCrypto / rate * 1e6) / 1e6;
  }
  // Stamp the payment date automatically the moment it's marked Paid.
  if (b.status === "Paid" && !b.paid_on && !existing.paid_on) body.paid_on = new Date().toISOString().slice(0, 10);

  const cols = COLS.filter((c) => body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ error: "No valid fields" });
  db.prepare(`UPDATE agency_payouts SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`)
    .run(...cols.map((c) => body[c]), req.params.id);
  res.json({ data: db.prepare(`${DETAIL} WHERE p.id = ?`).get(req.params.id) });
};
r.put("/:id", upd);
r.patch("/:id", upd);

r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM agency_payouts WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ data: { id: Number(req.params.id), deleted: true } });
});

export default r;
