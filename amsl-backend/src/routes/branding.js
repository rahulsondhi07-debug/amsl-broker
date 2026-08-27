import { Router } from "express";
import { db } from "../db.js";
const r = Router();
const KEYS = ["brand_name", "primary_color", "logo_url"];

r.get("/", (_req, res) => {
  const rows = db.prepare("SELECT key,value FROM app_settings WHERE key IN ('brand_name','primary_color','logo_url')").all();
  res.json({ data: Object.fromEntries(rows.map((x) => [x.key, x.value])) });
});
r.put("/", (req, res) => {
  const up = db.prepare("INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const tx = db.transaction(() => KEYS.forEach((k) => { if (req.body[k] !== undefined) up.run(k, String(req.body[k])); }));
  tx();
  const rows = db.prepare("SELECT key,value FROM app_settings WHERE key IN ('brand_name','primary_color','logo_url')").all();
  res.json({ data: Object.fromEntries(rows.map((x) => [x.key, x.value])) });
});
export default r;
