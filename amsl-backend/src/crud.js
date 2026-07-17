import { Router } from "express";
import { db } from "./db.js";

// paginate helper: reads ?page & ?limit, returns {rows,total,page,limit}
export function paginate(baseSql, params, req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 10);
  const offset = (page - 1) * limit;
  const total = db.prepare(`SELECT COUNT(*) c FROM (${baseSql})`).get(...params).c;
  const rows = db.prepare(`${baseSql} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { data: rows, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/**
 * Build a REST router for a table.
 * opts: { table, columns:[...writable], listSql?, searchColumns?:[] }
 */
export function crudRouter({ table, columns, listSql, searchColumns = [] }) {
  const r = Router();
  const selectAll = listSql || `SELECT * FROM ${table}`;

  // LIST (paginated, optional ?q= search)
  r.get("/", (req, res) => {
    let inner = selectAll;
    const params = [];
    if (req.query.q && searchColumns.length) {
      const where = searchColumns.map((c) => `${c} LIKE ?`).join(" OR ");
      inner = `SELECT * FROM (${selectAll}) WHERE ${where}`;
      searchColumns.forEach(() => params.push(`%${req.query.q}%`));
    }
    // wrap in a derived table so ORDER BY / COUNT never hit ambiguous joined columns
    const sql = `SELECT * FROM (${inner}) ORDER BY id DESC`;
    res.json(paginate(sql, params, req));
  });

  // GET one
  r.get("/:id", (req, res) => {
    const row = db.prepare(`SELECT * FROM (${selectAll}) WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: `${table} not found` });
    res.json({ data: row });
  });

  // CREATE
  r.post("/", (req, res) => {
    const cols = columns.filter((c) => req.body[c] !== undefined);
    if (!cols.length) return res.status(400).json({ error: "No valid fields provided" });
    const stmt = db.prepare(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`
    );
    const info = stmt.run(...cols.map((c) => req.body[c]));
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json({ data: row });
  });

  // UPDATE (partial)
  r.put("/:id", update);
  r.patch("/:id", update);
  function update(req, res) {
    const cols = columns.filter((c) => req.body[c] !== undefined);
    if (!cols.length) return res.status(400).json({ error: "No valid fields provided" });
    const stmt = db.prepare(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(",")} WHERE id = ?`
    );
    const info = stmt.run(...cols.map((c) => req.body[c]), req.params.id);
    if (!info.changes) return res.status(404).json({ error: `${table} not found` });
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    res.json({ data: row });
  }

  // DELETE
  r.delete("/:id", (req, res) => {
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: `${table} not found` });
    res.json({ data: { id: Number(req.params.id), deleted: true } });
  });

  return r;
}
