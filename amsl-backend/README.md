# AMSL Broker — Backend API

A REST backend for the AMSL Broker energy‑brokerage portal. It reproduces the data model and
functionality of every module in the dashboard (leads, quotes, contracts, customers, suppliers,
products, agencies, agents, supplier payments, tickets) plus the aggregated **dashboard**
endpoints that drive the home screen widgets.

Built with **Node.js + Express + SQLite** (via `better-sqlite3`). Zero external services — the
database is a single file that is created and seeded automatically on first run.

---

## Quick start

```bash
npm install
npm start          # → http://localhost:4000/api  (auto‑creates + seeds amsl.db on first run)
```

Other scripts:

```bash
npm run dev        # start with --watch (auto‑restart on file changes)
npm run seed       # rebuild the sample data from scratch (drops + reseeds every table)
```

Environment variables (optional): `PORT` (default `4000`), `DB_PATH` (default `./amsl.db`).

---

## What’s modelled

| Module            | Table(s)                    | Notes |
|-------------------|-----------------------------|-------|
| Agencies          | `agencies`                  | list carries a live `total_agents` count |
| Agents            | `agents`                    | roles `Super User` / `Admin`, Aircall flag, hashed password (never returned) |
| Suppliers         | `suppliers`                 | 43 UK energy suppliers, per‑kWh electric/gas commission fields |
| Products          | `products` + `price_matrix` | supplier tariff products with a nested price matrix |
| Leads / Customers | `businesses` (+ `sites`, `meters`) | one table, separated by `stage` (`LEAD` → `PROSPECT` → `CUSTOMER`); gas/elec meters bucketed `C\|S\|D` |
| Quotes            | `quotes`                    | `QT-##`, utility, MPAN/MPRN, EAC, status |
| Contracts         | `contracts`                 | `CN-##`, supplier + term + consumption + commission + status |
| Supplier payments | `supplier_payments`         | uploaded invoice records per supplier |
| Tickets           | `tickets`                   | support/query tickets |

The seed reproduces the exact figures visible in the live portal, so the dashboard aggregates
line up: **32 quotes**, **5 signed contracts**, **£1,709** expected commission, and the *Monthly*
stat view returns **Leads 2 · Quotes 7 · Contracts 2 · Customers 1**.

---

## API overview

Base URL: `http://localhost:4000/api`. Every response is `{ data, meta? }`.
List endpoints accept `?page=`, `?limit=` and `?q=` (search).

### Dashboard
```
GET /dashboard                       # everything the home screen needs, in one call
GET /dashboard/stats?period=total|monthly
GET /dashboard/earning               # quotesCreated, expectedCommissions, signedContracts, byMonth
GET /dashboard/revenue               # commissions total + byMonth
GET /dashboard/demographics          # totals + latest leads
GET /dashboard/regional              # active businesses per UK region
GET /dashboard/campaigns             # lead funnel percentages
GET /dashboard/payment-status        # paid / pending / overdue
GET /dashboard/recent-contracts
GET /dashboard/top-agents            # agents ranked by commission
```

### Modules (full CRUD)
```
GET|POST            /agencies            GET|PUT|PATCH|DELETE /agencies/:id
GET|POST            /agents              GET|PUT|PATCH|DELETE /agents/:id
GET|POST            /suppliers           GET|PUT|PATCH|DELETE /suppliers/:id
GET|POST            /products            GET|PUT|PATCH|DELETE /products/:id
GET|POST            /products/:id/price-matrix
GET|POST            /leads               GET|PUT|PATCH|DELETE /leads/:id
POST               /leads/:id/convert    # promote a lead to a customer
GET|POST            /customers           GET|PUT|PATCH|DELETE /customers/:id
GET|POST            /quotes              GET|PUT|PATCH|DELETE /quotes/:id
GET|POST            /contracts           GET|PUT|PATCH|DELETE /contracts/:id
GET|POST            /supplier-payments   GET|PUT|PATCH|DELETE /supplier-payments/:id
GET|POST            /tickets             GET|PUT|PATCH|DELETE /tickets/:id
```

### Auth (demo)
```
POST /auth/login     { email, password }   → { token, user }
GET  /auth/me?email=
```
Seeded logins: `admin@brokerportal.com` / `admin123` (Admin),
`lawrence.nadar@azentratech.com` / `changeme` (Super User).

---

## Example requests

```bash
curl localhost:4000/api/dashboard/stats?period=monthly
curl "localhost:4000/api/suppliers?q=energy&limit=5"
curl -X POST localhost:4000/api/leads \
  -H 'content-type: application/json' \
  -d '{"business_name":"Acme Ltd","contact_name":"Jane","agency_id":1,"agent_id":1}'
curl -X POST localhost:4000/api/leads/3/convert
```

---

## Notes / production hardening

This is a functional reference backend, not a hardened production service. Before real use:

- **Auth**: swap the SHA‑256 password check + stub token for `bcrypt` + signed JWTs, and add
  auth middleware to protect the module routes.
- **Validation**: add a schema validator (e.g. `zod`) on request bodies.
- **File uploads**: `supplier-payments` and ticket `attachment` store filenames only; wire up
  `multer` + object storage for actual PDFs.
- **Regional widget** reflects the `region` set on seeded `sites`; adjust the seed or the query
  to match your real geographic data.
- The data is illustrative sample data captured from the portal’s list screens, not a live export.
```
