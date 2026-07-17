import express from "express";
import cors from "cors";
import { db, initSchema } from "./db.js";
import dashboard from "./routes/dashboard.js";
import auth from "./routes/auth.js";
import comparison from "./routes/comparison.js";
import * as m from "./routes/modules.js";
import { seed } from "./seed.js";

initSchema();

// auto-seed on first run if empty
if (db.prepare("SELECT COUNT(*) c FROM agencies").get().c === 0) {
  console.log("Empty database detected — seeding sample data...");
  const r = seed();
  if (!r.skipped) console.log("Seeded:", r.counts);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// request logger
app.use((req, _res, next) => { console.log(`${req.method} ${req.url}`); next(); });

const api = express.Router();
api.get("/", (_req, res) =>
  res.json({
    name: "AMSL Broker API",
    version: "1.0.0",
    endpoints: [
      "GET  /api/dashboard", "GET  /api/dashboard/stats?period=monthly|total",
      "GET  /api/dashboard/earning", "GET /api/dashboard/revenue",
      "GET  /api/dashboard/regional", "GET /api/dashboard/campaigns",
      "GET  /api/dashboard/payment-status", "GET /api/dashboard/recent-contracts",
      "GET  /api/dashboard/top-agents", "GET /api/dashboard/demographics",
      "CRUD /api/agencies", "CRUD /api/agents", "CRUD /api/suppliers",
      "CRUD /api/products (+ /:id/price-matrix)", "CRUD /api/leads (+ /:id/convert)",
      "CRUD /api/customers", "CRUD /api/quotes", "CRUD /api/contracts",
      "CRUD /api/supplier-payments", "CRUD /api/tickets", "CRUD /api/tariffs",
      "POST /api/comparison  { utility, eac, term?, uplift? }", "GET /api/comparison/tariffs",
      "POST /api/auth/login", "GET /api/auth/me?email=",
    ],
    notes: "List endpoints support ?page=&limit=&q= . Everything returns { data, meta? }.",
  })
);

api.use("/dashboard", dashboard);
api.use("/comparison", comparison);
api.use("/auth", auth);
api.use("/agencies", m.agencies);
api.use("/agents", m.agents);
api.use("/suppliers", m.suppliers);
api.use("/products", m.products);
api.use("/leads", m.leads);
api.use("/customers", m.customers);
api.use("/quotes", m.quotes);
api.use("/contracts", m.contracts);
api.use("/supplier-payments", m.supplierPayments);
api.use("/tickets", m.tickets);
api.use("/tariffs", m.tariffs);

app.use("/api", api);
app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Serve the built frontend (single-origin production) when amsl-frontend/dist exists.
// Run `npm run build` in ../amsl-frontend first (or `npm start` from the repo root).
import fs from "fs";
import path from "path";
import { fileURLToPath as _f } from "url";
const _dir = path.dirname(_f(import.meta.url));
const distPath = path.join(_dir, "..", "..", "amsl-frontend", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && req.path !== "/health") {
      return res.sendFile(path.join(distPath, "index.html"));
    }
    next();
  });
  console.log("Serving frontend from", distPath);
}

// error + 404
app.use((req, res) => res.status(404).json({ error: `No route ${req.method} ${req.path}` }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 4000;
export default app;
import { fileURLToPath } from "url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(PORT, () => console.log(`\nAMSL Broker API running → http://localhost:${PORT}/api\n`));
}
