import { Router } from "express";
import { db } from "../db.js";

const r = Router();

// V1.7-13: a single admin-editable disclaimer, shown everywhere a quote/price is
// presented to a customer. Stored in app_settings (same key-value table branding.js
// uses) rather than a dedicated table, since it's one free-text value.
const DEFAULT_TEXT =
  "This quote is valid until 5:30pm today; after that, prices may change and are subject to availability. " +
  "All contracts are subject to credit approval from the supplier. Unit rates are quoted in pence per kWh. " +
  "Prices exclude Climate Change Levy and VAT. This quote is based on estimated annual consumption — your actual future usage may differ.";

r.get("/", (_req, res) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key='quote_disclaimer'").get();
  res.json({ data: { text: row ? row.value : DEFAULT_TEXT } });
});

r.put("/", (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Disclaimer text cannot be empty" });
  db.prepare(
    "INSERT INTO app_settings (key,value) VALUES ('quote_disclaimer',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(text);
  res.json({ data: { text } });
});

export default r;
