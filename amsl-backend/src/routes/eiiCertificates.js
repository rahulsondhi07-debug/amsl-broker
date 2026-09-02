import { Router } from "express";
import { db } from "../db.js";

const r = Router();
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);

function withMeters(cert) {
  if (!cert) return cert;
  cert.meters = all("SELECT id, msid, proportion_exempt_pct FROM eii_certificate_meters WHERE certificate_id=? ORDER BY id", cert.id);
  return cert;
}

/* LIST — most recent validity first */
r.get("/", (_req, res) => {
  const certs = all("SELECT * FROM eii_certificates ORDER BY validity_end DESC, id DESC");
  res.json({ data: certs.map(withMeters) });
});

/**
 * MATCH — find the certificate (and its meter-specific Proportion Exempt %)
 * covering a given MSID/MPAN on a given date. Used by Bill Validation to
 * auto-fill EII eligibility + relief % instead of relying on a manual guess.
 * GET /eii-certificates/match?msid=1100039602388&date=2026-01-15
 * Must be registered before GET /:id so it isn't shadowed.
 */
r.get("/match", (req, res) => {
  const msid = String(req.query.msid || "").replace(/\s+/g, "");
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  if (!msid) return res.status(400).json({ error: "msid is required" });

  const row = one(`
    SELECT ec.id AS certificate_id, ec.certificate_number, ec.business_name, ec.validity_start, ec.validity_end,
           ecm.proportion_exempt_pct
    FROM eii_certificate_meters ecm
    JOIN eii_certificates ec ON ec.id = ecm.certificate_id
    WHERE REPLACE(ecm.msid,' ','') = ? AND ec.validity_start <= ? AND ec.validity_end >= ?
    ORDER BY ec.validity_end DESC
    LIMIT 1`, msid, date, date);

  res.json({ data: row || null });
});

/* GET one */
r.get("/:id", (req, res) => {
  const cert = one("SELECT * FROM eii_certificates WHERE id=?", req.params.id);
  if (!cert) return res.status(404).json({ error: "Certificate not found" });
  res.json({ data: withMeters(cert) });
});

/* CREATE — with meters: [{ msid, proportion_exempt_pct }] */
r.post("/", (req, res) => {
  const b = req.body || {};
  if (!b.business_name || !b.validity_start || !b.validity_end) {
    return res.status(400).json({ error: "business_name, validity_start and validity_end are required" });
  }
  const info = db.prepare(`INSERT INTO eii_certificates
    (certificate_number, business_id, business_name, company_number, date_of_issue, validity_start, validity_end, eligible_product, notes)
    VALUES (@certificate_number,@business_id,@business_name,@company_number,@date_of_issue,@validity_start,@validity_end,@eligible_product,@notes)`)
    .run({
      certificate_number: b.certificate_number || null,
      business_id: b.business_id || null,
      business_name: b.business_name,
      company_number: b.company_number || null,
      date_of_issue: b.date_of_issue || null,
      validity_start: b.validity_start,
      validity_end: b.validity_end,
      eligible_product: b.eligible_product || null,
      notes: b.notes || null,
    });
  const certId = info.lastInsertRowid;
  const meters = Array.isArray(b.meters) ? b.meters : [];
  const insMeter = db.prepare("INSERT INTO eii_certificate_meters (certificate_id, msid, proportion_exempt_pct) VALUES (?,?,?)");
  for (const m of meters) {
    if (m && m.msid) insMeter.run(certId, String(m.msid).trim(), m.proportion_exempt_pct != null ? Number(m.proportion_exempt_pct) : 100);
  }
  res.status(201).json({ data: withMeters(one("SELECT * FROM eii_certificates WHERE id=?", certId)) });
});

/* DELETE */
r.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM eii_certificates WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Certificate not found" });
  res.json({ data: { deleted: true } });
});

export default r;
