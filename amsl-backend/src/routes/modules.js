import { Router } from "express";
import { db } from "../db.js";
import { crudRouter } from "../crud.js";

/* ---- Agencies (with agent counts, like the UI) ---- */
export const agencies = crudRouter({
  table: "agencies",
  columns: ["name", "logo", "status", "email", "phone", "website", "max_users", "company_reg_no", "business_structure", "vat_no", "address", "white_label"],
  searchColumns: ["name", "email", "company_reg_no"],
  listSql: `SELECT a.*, (SELECT COUNT(*) FROM agents ag WHERE ag.agency_id = a.id) AS total_agents
            FROM agencies a`,
});

/* ---- Agents (never expose password_hash) ---- */
export const agents = crudRouter({
  table: "agents",
  columns: ["name", "agency_id", "email", "role", "status", "aircall_enabled",
            "first_name", "last_name", "trading_name", "principal_name", "business_structure",
            "trading_account_no", "vat_number", "agency_split", "agent_split", "telephone", "mobile",
            "office_website", "address_line1", "address_line2", "city", "county", "postcode",
            "bank_name", "account_name", "sort_code", "account_no", "training_status", "notes"],
  searchColumns: ["name", "email"],
  listSql: `SELECT ag.id, ag.name, ag.agency_id, a.name AS agency_name, ag.email, ag.role, ag.status,
                   ag.aircall_enabled, ag.first_name, ag.last_name, ag.trading_name, ag.principal_name,
                   ag.business_structure, ag.trading_account_no, ag.vat_number, ag.agency_split, ag.agent_split,
                   ag.telephone, ag.mobile, ag.office_website, ag.address_line1, ag.address_line2, ag.city,
                   ag.county, ag.postcode, ag.bank_name, ag.account_name, ag.sort_code, ag.account_no,
                   ag.training_status, ag.notes, ag.created_at
            FROM agents ag LEFT JOIN agencies a ON a.id = ag.agency_id`,
});

/* ---- Suppliers ---- */
export const suppliers = crudRouter({
  table: "suppliers",
  columns: ["name", "logo", "max_broker_comm_electric", "broker_comm_inc_electric",
            "max_broker_comm_gas", "broker_comm_inc_gas", "status",
            "supplier_role", "tpi_role", "fuel_mix", "contract_condition", "credit_check",
            "commission_payment", "customer_billing", "supplier_contact", "supplier_address",
            "restricted_business_types", "about",
            "sme_email", "sme_mobile", "sme_landline", "sme_password", "sme_threshold", "corporate_login_email",
            "mm_name", "mm_email", "mm_password", "mm_mobile", "mm_landline", "mm_threshold",
            "ind_name", "ind_email", "ind_password", "ind_mobile", "ind_landline", "ind_threshold"],
  searchColumns: ["name", "supplier_role"],
  listSql: `SELECT id, name, logo, status, supplier_role, tpi_role, fuel_mix,
                   max_broker_comm_electric, max_broker_comm_gas, sme_threshold, mm_threshold, ind_threshold,
                   contract_condition, credit_check, commission_payment, customer_billing, created_at
            FROM suppliers`,
  detailSql: `SELECT * FROM suppliers`,
  // detail masks stored TPI portal passwords (returns has_* booleans instead of the value)
  detailTransform: (row) => {
    if (!row) return row;
    for (const k of ["sme_password", "mm_password", "ind_password"]) {
      row[`${k.replace("_password", "")}_has_password`] = !!row[k];
      delete row[k];
    }
    return row;
  },
});

/* ---- Products (+ supplier name, + price matrix child) ---- */
export const products = (() => {
  const r = crudRouter({
    table: "products",
    columns: ["name", "supplier_id", "utility", "segment", "acq_renewal", "valid_from", "valid_till", "status",
              "standing_charge_type", "fuel_mix", "max_commission", "commission_increment", "commission_banded",
              "standing_charge", "payment_method", "payment_mode", "initial", "final", "dd_discount",
              "price_book_status", "min_start_days", "min_start_date", "max_start_date", "product_type"],
    searchColumns: ["name"],
    listSql: `SELECT p.*, s.name AS supplier_name
              FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id`,
  });
  // nested price matrix
  r.get("/:id/price-matrix", (req, res) => {
    res.json({ data: db.prepare("SELECT * FROM price_matrix WHERE product_id = ?").all(req.params.id) });
  });
  r.post("/:id/price-matrix", (req, res) => {
    const b = req.body;
    const info = db.prepare(
      `INSERT INTO price_matrix (product_id,min_consumption,max_consumption,term_months,unit_rate,standing_charge,commission)
       VALUES (?,?,?,?,?,?,?)`
    ).run(req.params.id, b.min_consumption, b.max_consumption, b.term_months, b.unit_rate, b.standing_charge, b.commission);
    res.status(201).json({ data: db.prepare("SELECT * FROM price_matrix WHERE id = ?").get(info.lastInsertRowid) });
  });
  return r;
})();

/* ---- Businesses helper (leads / customers share a table via ?stage) ---- */
function businessRouter(stage) {
  const r = Router();
  const base = `
    SELECT b.*, ag.name AS agency_name, a.name AS agent_name,
      (SELECT COUNT(*) FROM sites s WHERE s.business_id = b.id) AS sites,
      (SELECT COUNT(*) FROM meters m WHERE m.business_id=b.id AND m.utility='GAS'  AND m.status='C') AS gas_c,
      (SELECT COUNT(*) FROM meters m WHERE m.business_id=b.id AND m.utility='GAS'  AND m.status='S') AS gas_s,
      (SELECT COUNT(*) FROM meters m WHERE m.business_id=b.id AND m.utility='GAS'  AND m.status='D') AS gas_d,
      (SELECT COUNT(*) FROM meters m WHERE m.business_id=b.id AND m.utility='ELEC' AND m.status='C') AS elec_c,
      (SELECT COUNT(*) FROM meters m WHERE m.business_id=b.id AND m.utility='ELEC' AND m.status='S') AS elec_s,
      (SELECT COUNT(*) FROM meters m WHERE m.business_id=b.id AND m.utility='ELEC' AND m.status='D') AS elec_d
    FROM businesses b
    LEFT JOIN agencies ag ON ag.id = b.agency_id
    LEFT JOIN agents a ON a.id = b.agent_id
    WHERE b.stage = '${stage}'`;

  r.get("/", (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 10);
    const total = db.prepare(`SELECT COUNT(*) c FROM businesses WHERE stage=?`).get(stage).c;
    const rows = db.prepare(`${base} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?`)
      .all(limit, (page - 1) * limit);
    res.json({ data: rows, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  });

  r.get("/:id", (req, res) => {
    const row = db.prepare(`${base} AND b.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    row.meters = db.prepare("SELECT * FROM meters WHERE business_id = ?").all(req.params.id);
    row.sites_list = db.prepare("SELECT * FROM sites WHERE business_id = ?").all(req.params.id);
    res.json({ data: row });
  });

  r.post("/", (req, res) => {
    const b = req.body;
    const ref = b.ref || Math.random().toString(16).slice(2, 10);
    // V1.6-12: auto-select the agent from the agency when none is given
    let agentId = b.agent_id;
    if (b.agency_id && !agentId) {
      const a = db.prepare("SELECT id FROM agents WHERE agency_id=? AND status='Active' ORDER BY id LIMIT 1").get(b.agency_id);
      if (a) agentId = a.id;
    }
    const info = db.prepare(
      `INSERT INTO businesses (ref,business_name,contact_name,contact_email,contact_mobile,agency_id,agent_id,stage)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(ref, b.business_name, b.contact_name, b.contact_email, b.contact_mobile, b.agency_id, agentId, stage);
    res.status(201).json({ data: db.prepare("SELECT * FROM businesses WHERE id = ?").get(info.lastInsertRowid) });
  });

  const upd = (req, res) => {
    const cols = ["business_name","contact_name","contact_email","contact_mobile","agency_id","agent_id","stage"]
      .filter((c) => req.body[c] !== undefined);
    if (!cols.length) return res.status(400).json({ error: "No valid fields" });
    const info = db.prepare(`UPDATE businesses SET ${cols.map(c=>`${c}=?`).join(",")} WHERE id=?`)
      .run(...cols.map(c=>req.body[c]), req.params.id);
    if (!info.changes) return res.status(404).json({ error: "not found" });
    res.json({ data: db.prepare("SELECT * FROM businesses WHERE id=?").get(req.params.id) });
  };
  r.put("/:id", upd); r.patch("/:id", upd);

  // V1.6-16: bulk import with friendly, row-level errors
  r.post("/import", (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: "No rows to import. Provide a 'rows' array." });
    if (rows.length > 5000) return res.status(400).json({ error: "Too many rows in one import (max 5,000). Please split the file." });
    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const ins = db.prepare(
      `INSERT INTO businesses (ref,business_name,contact_name,contact_email,contact_mobile,agency_id,agent_id,stage,journey_stage,fuel)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    const results = { imported: 0, failed: 0, errors: [] };
    rows.forEach((row, i) => {
      const line = i + 1;
      const name = (row.business_name || row["Business Name"] || "").trim();
      const email = (row.contact_email || row.Email || "").trim();
      const fuel = (row.fuel || row.Fuel || "DUAL").toUpperCase();
      if (!name) { results.failed++; results.errors.push({ row: line, message: `Row ${line}: Business Name is required.` }); return; }
      if (email && !emailRe.test(email)) { results.failed++; results.errors.push({ row: line, message: `Row ${line}: "${email}" is not a valid email address.` }); return; }
      if (!["ELEC", "GAS", "DUAL"].includes(fuel)) { results.failed++; results.errors.push({ row: line, message: `Row ${line}: Fuel must be Elec, Gas or Dual (got "${row.fuel || row.Fuel}").` }); return; }
      try {
        ins.run(
          Math.random().toString(16).slice(2, 10), name,
          (row.contact_name || row["Contact Name"] || "").trim() || null,
          email || null, (row.contact_mobile || row.Mobile || "").trim() || null,
          row.agency_id || null, row.agent_id || null, "LEAD", "RAW_LEAD", fuel
        );
        results.imported++;
      } catch (e) {
        results.failed++;
        results.errors.push({ row: line, message: `Row ${line}: could not be saved (${e.message.replace(/SQLITE_\w+:?/i, "").trim()}).` });
      }
    });
    res.json({ data: results });
  });

  // convert lead -> customer
  r.post("/:id/convert", (req, res) => {
    const info = db.prepare("UPDATE businesses SET stage='CUSTOMER' WHERE id=? AND stage!='CUSTOMER'").run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: "not found or already a customer" });
    res.json({ data: db.prepare("SELECT * FROM businesses WHERE id=?").get(req.params.id) });
  });

  r.delete("/:id", (req, res) => {
    // V1.6-14: cannot delete once a customer is beyond Prospect
    const biz = db.prepare("SELECT journey_stage FROM businesses WHERE id=? AND stage=?").get(req.params.id, stage);
    if (biz && ["WON", "UNDER_REGISTRATION", "LIVE", "UP_FOR_RENEWAL", "RENEWED"].includes(biz.journey_stage)) {
      return res.status(403).json({ error: "This customer is beyond the Prospect stage and cannot be deleted." });
    }
    const info = db.prepare("DELETE FROM businesses WHERE id=? AND stage=?").run(req.params.id, stage);
    if (!info.changes) return res.status(404).json({ error: "not found" });
    res.json({ data: { id: Number(req.params.id), deleted: true } });
  });
  return r;
}
export const leads = businessRouter("LEAD");
export const customers = businessRouter("CUSTOMER");

/* ---- Quotes ---- */
export const quotes = crudRouter({
  table: "quotes",
  columns: ["quote_no","business_id","business_name","agent_id","utility","meter_number","eac","start_date",
            "supplier_id","term_months","unit_rate","standing_charge","annual_cost","commission","status",
            "bespoke","meter_point","meter_details","distribution_charge","transmission_charge","product_name","acq_renewal","business_type"],
  searchColumns: ["quote_no","business_name","meter_number"],
  listSql: `SELECT q.*, a.name AS broker, s.name AS supplier_name
            FROM quotes q LEFT JOIN agents a ON a.id = q.agent_id
            LEFT JOIN suppliers s ON s.id = q.supplier_id`,
});

/* ---- Contracts (with supplier/agency/agent names + filters) ---- */
export const contracts = (() => {
  const base = `SELECT c.*, s.name AS supplier_name, ag.name AS agency_name, a.name AS agent_name
                FROM contracts c
                LEFT JOIN suppliers s ON s.id = c.supplier_id
                LEFT JOIN agencies ag ON ag.id = c.agency_id
                LEFT JOIN agents a ON a.id = c.agent_id`;
  const r = crudRouter({
    table: "contracts",
    columns: ["contract_no","business_id","business_name","supplier_id","agency_id","agent_id",
              "term_months","meter_mpan_mpr","utility","segment","consumption","commission_value","status",
              "quote_id","company_reg","business_structure","business_type","trading_from",
              "title","first_name","last_name","address_line1","address_line2","town","postcode","telephone","mobile","email",
              "billing_same","billing_title","billing_first_name","billing_last_name","billing_address1","billing_address2",
              "billing_town","billing_postcode","billing_telephone","billing_mobile","billing_email",
              "meter_serial","current_read","requested_start",
              "product_name","tariff_name","acq_renewal","tariff_type","supplier_start","tariff_end","supplier_end","fixed_price_term",
              "standing_charge","day_rate","night_rate","ewe_rate","kva_charge","broker_commission",
              "payment_method","payment_amount","billing_period"],
    searchColumns: ["contract_no","business_name","meter_mpan_mpr"],
    listSql: base,
  });
  return r;
})();

/* ---- Supplier payments ---- */
export const supplierPayments = crudRouter({
  table: "supplier_payments",
  columns: ["supplier_id","file_name","uploaded_by"],
  listSql: `SELECT sp.*, s.name AS supplier_name
            FROM supplier_payments sp LEFT JOIN suppliers s ON s.id = sp.supplier_id`,
});

/* ---- Tickets ---- */
export const tickets = crudRouter({
  table: "tickets",
  columns: ["business_name","business_id","agency_id","agent_id","utility","query_type","query_name","status","attachment","corporate_sme","description"],
  searchColumns: ["business_name","query_name"],
  listSql: `SELECT t.*, ag.name AS agency_name, a.name AS agent_name
            FROM tickets t LEFT JOIN agencies ag ON ag.id=t.agency_id LEFT JOIN agents a ON a.id=t.agent_id`,
});

/* ---- Tariffs (power the comparison; editable in-app) ---- */
export const tariffs = (() => {
  const r = Router();
  const cols = ["supplier_id","utility","term_months","unit_rate","standing_charge","status"];

  r.get("/", (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, parseInt(req.query.limit) || 20);
    const where = [];
    const params = [];
    if (req.query.utility) { where.push("UPPER(t.utility) = ?"); params.push(String(req.query.utility).toUpperCase()); }
    if (req.query.supplier_id) { where.push("t.supplier_id = ?"); params.push(Number(req.query.supplier_id)); }
    if (req.query.term_months) { where.push("t.term_months = ?"); params.push(Number(req.query.term_months)); }
    if (req.query.q) { where.push("s.name LIKE ?"); params.push(`%${req.query.q}%`); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const from = `FROM tariffs t JOIN suppliers s ON s.id = t.supplier_id ${w}`;
    const total = db.prepare(`SELECT COUNT(*) c ${from}`).get(...params).c;
    const rows = db.prepare(
      `SELECT t.*, s.name AS supplier_name ${from} ORDER BY s.name, t.utility, t.term_months LIMIT ? OFFSET ?`
    ).all(...params, limit, (page - 1) * limit);
    res.json({ data: rows, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  });

  r.post("/", (req, res) => {
    const c = cols.filter((k) => req.body[k] !== undefined);
    if (!c.length) return res.status(400).json({ error: "No valid fields" });
    const info = db.prepare(`INSERT INTO tariffs (${c.join(",")}) VALUES (${c.map(() => "?").join(",")})`).run(...c.map((k) => req.body[k]));
    res.status(201).json({ data: db.prepare("SELECT * FROM tariffs WHERE id=?").get(info.lastInsertRowid) });
  });

  const upd = (req, res) => {
    const c = cols.filter((k) => req.body[k] !== undefined);
    if (!c.length) return res.status(400).json({ error: "No valid fields" });
    const info = db.prepare(`UPDATE tariffs SET ${c.map((k) => `${k}=?`).join(",")} WHERE id=?`).run(...c.map((k) => req.body[k]), req.params.id);
    if (!info.changes) return res.status(404).json({ error: "not found" });
    res.json({ data: db.prepare("SELECT * FROM tariffs WHERE id=?").get(req.params.id) });
  };
  r.put("/:id", upd); r.patch("/:id", upd);
  r.delete("/:id", (req, res) => {
    const info = db.prepare("DELETE FROM tariffs WHERE id=?").run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: "not found" });
    res.json({ data: { id: Number(req.params.id), deleted: true } });
  });
  return r;
})();
