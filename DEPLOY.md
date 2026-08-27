# AMSL Broker — Sales Journey + Quote Engine (Phases 1–3)

Complete drop-in src/ for both backend and frontend. Unzip over your repo, commit the
changed files, push — Render auto-deploys. Migration + seeds + automations run on boot
(idempotent, safe on live data).

## Delivered
PHASE 1 — Sales journey pipeline           V1.6-05,06 · V1.7-01,02,08
  12-stage journey, stage strip, fuel filter, right-side details panel, move-stage, comments,
  dashboard clickable stage cards, nav.
PHASE 2 — Journey actions & automations    V1.6-06,11 · V1.7-04,07
  Dispositions, callback scheduling, contract-signed notification,
  auto Under Registration -> Live (on contract start), auto Live -> Up for Renewal (<30 days),
  notifications feed.
PHASE 3 — PE Solutions uplift caps          V1.6-17
  Consumption-band max-uplift caps (ELEC 1-30k:3p / 30k-120k:2p / 120k+:1.5p; GAS bands too).
  Live validation in Get Quote — warns and blocks an uplift above the band maximum.

## Changed files to commit
BACKEND : amsl-backend/src/db.js, server.js, routes/pipeline.js, routes/uplift.js, seedPipeline.js
FRONTEND: amsl-frontend/src/api.js, App.jsx, components/Layout.jsx, pages/Dashboard.jsx,
          pages/Pipeline.jsx, pages/NewQuote.jsx

## New API (all under /api)
/pipeline/stages · /pipeline · /pipeline/:id · /pipeline/:id/stage · /pipeline/:id/comments
/pipeline/:id/disposition · /pipeline/:id/callback · /pipeline/callbacks/upcoming
/pipeline/automations/run · /pipeline/notifications
/uplift-caps · /uplift-caps/validate

PHASE 4 — Quote disclaimer + Renewals workspace   V1.6-19 · V1.7-07 · V1.6-06
  Quote results now carry the full compliance disclaimer.
  New "Renewals & Callbacks" page (nav): up-for-renewal customers by urgency + upcoming callbacks with mark-done.
  Changed/new: amsl-frontend/src/pages/NewQuote.jsx, pages/Renewals.jsx (new), App.jsx, components/Layout.jsx, api.js

PHASE 5 — Notifications, bulk import, download contract   V1.6-16 · V1.6-15 + notifications UI
  Notifications bell in top bar (unseen badge, dropdown, mark-seen) surfacing contract-signed /
    went-live / up-for-renewal / callback alerts.
  Bulk lead Import CSV (paste or file) with row-level friendly errors  (V1.6-16)  — POST /api/leads/import
  Download Contract column on Contracts  (V1.6-15).
  Changed/new: amsl-backend/src/routes/modules.js; amsl-frontend/src/components/Layout.jsx,
               components/BusinessTable.jsx, pages/Contracts.jsx, api.js

PHASE 6 — Menu Rights & Permissions + auto-agent   V1.7-12 · V1.6-12
  Role-based menu access: role_permissions table, /api/permissions (grid), /effective (nav), PUT per role.
  Nav filters by the logged-in user's role; Admin/Super User = full access.
  New "Permissions" admin page (role x menu grid).
  Auto-select agent from agency on lead creation (V1.6-12).
  Changed/new: amsl-backend/src/db.js, server.js, routes/permissions.js (new), routes/modules.js;
               amsl-frontend/src/components/Layout.jsx, pages/Permissions.jsx (new), App.jsx, api.js

PHASE 7 — Master Lead / Meter Management   V1.7-09
  Central cross-stage view: every business across all 12 stages with meter counts + total consumption,
  and master filters (search, stage, fuel, agency, agent). New "Master Management" nav page.
  Pipeline list now also accepts agency_id / agent_id and returns meters + total_eac.
  Changed/new: amsl-backend/src/db.js (menu catalog), routes/pipeline.js;
               amsl-frontend/src/pages/Master.jsx (new), App.jsx, components/Layout.jsx

PHASE 8 — Customer inner page + Utility-on-Site   V1.6-02/03/04 · V1.6-14 (partial)
  New Customer inner page (/customers/:id): Details / Utility on Site / Comments tabs + Edit button.
  Utility on Site — Electricity: meter type (SME/NHH/HH), standing/unit/day/night/EWE, EAC, last read,
    + Distribution/Transmission for HH.  Gas: meter type, standing/unit, AQ, last read.
  Customers list: View (eye) opens the inner page; Delete hidden once beyond Prospect (backend-guarded 403).
  meters table extended with utility-on-site fields; seedPipeline now seeds sites + meters for live customers.
  Changed/new: amsl-backend/src/db.js, seedPipeline.js, routes/modules.js;
               amsl-frontend/src/pages/CustomerDetail.jsx (new), App.jsx, components/BusinessTable.jsx

PHASE 9 — Bespoke Get Quick Quote   V1.6-10 · V1.6-13
  Get Quote now has a Market Comparison / Bespoke Pricing toggle.
  Bespoke form: Meter Point, Meter Details, Supplier, Product Name, Unit Rate, Standing Charge,
    Distribution Charge, Transmission Charge, Term — single product, saved as a bespoke quote.
  Added Acquisition/Renewal + Business Type fields; redirect to Quote History after creation.
  Quote History shows a BESPOKE flag under the Quote ID and a Product column.
  Changed: amsl-backend/src/db.js, routes/modules.js; amsl-frontend/src/pages/NewQuote.jsx, pages/Quotes.jsx

PHASE 10 — Freeze, quote breakdown, supplier, email/reminder hooks   V1.6-14/10/07/11/08
  Customer Freeze / Unfreeze (inner page) with frozen badge; supplier shown on Won/Under-Reg/Live inner page.
  Quote History: download Quote Breakdown (client-side).
  Contract-signed notification now assembles real recipients (customer + rahul@ / amsl.crm@ / prinali@ + agent) — SMTP send stubbed.
  Daily agent reminder endpoint /api/pipeline/reminders/daily assembles each agent's callbacks for today (cron+email stubbed).

PHASE 11 — White-labelling   V1.7-11
  app_settings table + /api/branding (brand name, primary colour, logo URL). New Branding page with live preview.
  Primary colour applied app-wide via --brand on load. Per-agency branding is the documented extension.

EXTERNAL INTEGRATIONS (hooks in place, need production services/credentials — NOT faked):
  Zoho E-Sign (templates exist on prod), Aircall dialing, Positive Energy Contract Pad (V1.6-18),
  live SMTP for the email hooks above. Each has a clear in-app trigger/stub to wire to the real service.

FOUNDATION GAPS (from V1.0-V1.5 consolidated notes) — added:
  Platform Guide / Tutorials  (V1.0-19): videos + documents (PDF/PNG/JPG/MP4), add/open/remove. /api/platform/tutorials
  System Settings / config lookups (V1.0-17): manage Contract Stage, Lifecycle Status, Lead Action, Callback Reason,
    Priority Stage, Quote Status, Ticket Query Type, Payment Status. /api/platform/config
  Commission Report (V1.2/V1.3 reporting layer): commission by agent from booked contracts. /api/platform/commission/summary
  New pages: Commission, Platform Guide, System Settings (+ nav, routes, permission catalog).
  Changed/new: amsl-backend/src/db.js, server.js, routes/platform.js (new);
               amsl-frontend/src/pages/{Tutorials,Settings,Commission}.jsx (new), App.jsx, components/Layout.jsx, api.js

STILL NEEDS EXTERNAL SERVICES (hooks/stubs in place, not faked):
  V1.0-16 Smartest Contract Pad · V1.1 Send-quote-by-email + email header/footer · V1.1/V1.5 Aircall ·
  V1.2 Zoho E-Sign · full V1.3 commission engine (reconciliation/ledger/VAT/clawback/multi-level splits) ·
  V1.1 supplier-wise + Excel quote downloads.

COMMISSION ENGINE (V1.3 core) — added:
  Per-supplier commission_config (payment method Annual/Contract Length, uplift rate, upfront/deferred %, clawback %, VAT).
  Auto commission calculation on booked contracts (EAC x uplift x term), VAT, projected.
  Multi-level distribution: AMSL 40% / Master Broker 20% / Agent 40% (commission_splits).
  Payment schedule with statuses Projected/Invoiced/Paid/Overdue/Reconciled (commission_schedule).
  Reconciliation vs actual AAC (adjustment + ledger), Clawback (reverses outstanding schedule), Commission ledger.
  Commission page rebuilt: Records (splits+schedule, reconcile/clawback), By Agent, Ledger.
  New: amsl-backend/src/commissionEngine.js, routes/commission.js; db.js (5 commission tables); server.js.
  Note: statement import + supplier-statement matching remain a future add (need real statement files).
