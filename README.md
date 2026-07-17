# AMSL Broker — Full-Stack App

A reconstruction of the AMSL Broker energy-brokerage portal: an Express + SQLite API and a
React (Vite) admin UI, wired together in one repo.

---

## Option 1 — Docker (most hands-off, no Node needed)

If you have Docker Desktop, this is the whole thing:

```bash
docker compose up --build
```

Then open **http://localhost:4000**. That's it — the image installs everything, builds the UI,
and serves the UI + API together on one port. The SQLite database is created, seeded, and kept in
a named volume (`amsl-data`) so your data survives restarts.

Stop it with `Ctrl+C`, or `docker compose down` (add `-v` to also wipe the database volume).

---

## Option 2 — Node directly

Requires Node 18+.

```bash
npm install          # installs BOTH projects at once (npm workspaces)
npm run dev          # API (:4000) + UI (:5173) together — open http://localhost:5173
```

No CORS or API-URL setup: the UI calls `/api` and the Vite dev server proxies it to the backend.
The database seeds itself on first run.

Single-port production mode (backend serves the built UI):

```bash
npm start            # build UI, then serve UI + API on http://localhost:4000
```

Other commands: `npm run build` (UI only), `npm run seed` (rebuild sample data).

---

## Option 3 — Deploy to Render (hosted URL)

Push this folder to GitHub, then on Render: **New +  →  Blueprint** and point it at the repo — the
included `render.yaml` deploys it as a single web service and gives you a public HTTPS URL. Full
step-by-step (including the manual, no-Blueprint route and how to add persistent storage) is in
[`DEPLOY.md`](./DEPLOY.md).

---

## Sign in

The app opens on a login screen. Seeded accounts:

| Email | Password | Role |
|-------|----------|------|
| admin@brokerportal.com | admin123 | Admin |
| lawrence.nadar@azentratech.com | changeme | Super User |

## Energy comparison

**Get Quote** (sidebar) is a live comparison engine: pick utility, consumption (EAC), term and
your broker uplift (p/kWh), hit **Compare Prices**, and it ranks every supplier tariff by projected
annual cost — showing unit rate, standing charge, annual/monthly cost and **your commission** on
each deal. Click **Quote** on any row to save it as a quote (supplier, rate and commission stored).
Backing API: `POST /api/comparison`.

The rates behind the comparison are editable in-app on the **Tariffs** screen (add / edit / delete,
filter by utility). Changes take effect on the next comparison immediately — no redeploy. Backing
API: `CRUD /api/tariffs`.

## Modules

Dashboard (live) · Leads (add + convert) · Customers · Quotes (+ Get Quote form) · Contracts ·
Suppliers · **Tariffs** · Supplier Payments · Products · Agencies · Agents · Tickets.

## Layout

```
amsl-broker/
  docker-compose.yml   one-command containerized run
  Dockerfile
  package.json         npm workspaces + dev/start scripts
  amsl-backend/        Express + SQLite REST API   (own README)
  amsl-frontend/       React + Vite UI             (own README)
```

## Status / caveats

Functional reference build, not production-hardened. Seed data mirrors the figures from the live
portal (32 quotes, 5 contracts, £1,709 expected commission; Monthly stats 2 / 7 / 2 / 1). Before
real use: replace the demo SHA-256 login with bcrypt + JWT and add auth middleware, add request
validation, and wire real file storage for supplier-payment / ticket PDFs.
