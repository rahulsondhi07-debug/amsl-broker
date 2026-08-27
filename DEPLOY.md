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

COMMISSION — Supplier statement import & matching (V1.3 final piece) — added:
  commission_statements + statement_lines tables; POST /api/commission/statements/import ({supplier_id,filename,lines:[{contract_no,amount,period}]}),
  GET /api/commission/statements. Auto-matches each line to the contract's commission record:
  within £1 = Matched (marks a schedule row Paid + ledger 'payment'), else Exception (variance flagged).
  Commission page: new "Statements" tab — paste contract_no,amount,period -> Import & match -> matched/exceptions + history.
  Changed/new: amsl-backend/src/db.js, commissionEngine.js, routes/commission.js; amsl-frontend/src/pages/Commission.jsx, api.js

ADD AGENCY — full form (matches production crm.amslgroup.co.uk/agency/add):
  agencies table extended: email, phone, website, max_users, company_reg_no, business_structure, vat_no, address, white_label.
  Agencies page rebuilt with an "Add Agency" button + modal form (Name*, Email, Phone, Website, Max Users,
  Company Reg No, Business Structure dropdown, VAT No, Address, White Label toggle, Status). List shows contact/structure/white-label.
  Changed: amsl-backend/src/db.js, routes/modules.js; amsl-frontend/src/pages/Agencies.jsx

VIEW AGENCY + ADD AGENT (match production):
  agents table extended with first/last name, trading/principal name, business_structure, trading_account_no,
    vat_number, agency_split, agent_split, telephone, mobile, office_website, address (line1/2/city/county/postcode),
    banking (bank_name/account_name/sort_code/account_no), training_status, notes. agencies get a uid (AG-xx).
  Agents page rebuilt: "Add Agent" grouped form (Agent Details, Login, Identity & Splits [100% validation],
    Contact, Address, Banking, Training & Compliance). password_hash never returned by the list.
  New View Agency page (/agencies/:id): header + Unique ID/Structure/Max Users/Current Users metrics,
    Contact & Registration info, Authorized Agents list. "View" (eye) action added to the Agencies list.
  Changed/new: amsl-backend/src/db.js, routes/modules.js; amsl-frontend/src/pages/Agents.jsx (rebuilt),
    pages/AgencyDetail.jsx (new), pages/Agencies.jsx, components/ui.jsx (Modal wide), App.jsx

VIEW AGENT (tabbed detail):
  New /agents/:id page — tabs: Profile & Role, Contact & Address, Banking, Compliance & Notes.
  "View" (eye) action added to Agents list; "Add Agent" button added to the agency view's Authorized Agents card.
  Agent detail reads from the safe agents list (password_hash never exposed).
  Changed/new: amsl-frontend/src/pages/AgentDetail.jsx (new), pages/Agents.jsx, pages/AgencyDetail.jsx, App.jsx

ADD SUPPLIER — full form (matches production crm.amslgroup.co.uk/suppliers/add):
  suppliers table extended: supplier_role, tpi_role, fuel_mix, contract_condition, credit_check,
    commission_payment, customer_billing, supplier_contact, supplier_address, restricted_business_types, about,
    + SME/Midmarket/Industrial TPI blocks (email, mobile, landline, password, name, threshold each), corporate_login_email.
  Suppliers page rebuilt: "Add Supplier" grouped form (Supplier Details incl. Role dropdown + Fuel Mix + comm caps,
    SME TPI, Midmarket TPI, Industrial TPI, Commercial Terms, Contact & About). TPI passwords stored but excluded from list SQL.
  Changed: amsl-backend/src/db.js, routes/modules.js; amsl-frontend/src/pages/Suppliers.jsx

VIEW SUPPLIER (tabbed detail, matches production suppliers/view):
  New /suppliers/:id page with Edit button + 4 tabs: Supplier Details (Overview + SME/Midmarket/Industrial TPI
    + Commercial Terms & About), Supplier Documents (LOAs/Renewals/Terminations + upload), Meter Type Mapping,
    Supplier Settings (status, role, commission caps, thresholds, restricted types).
  crudRouter now supports detailSql + detailTransform; supplier detail returns full row with TPI passwords masked
    (sme/mm/ind_has_password booleans instead of the value). "View" (eye) action added to the Suppliers list.
  Changed/new: amsl-backend/src/crud.js, routes/modules.js; amsl-frontend/src/pages/SupplierDetail.jsx (new),
    pages/Suppliers.jsx, App.jsx

GENERATE CONTRACT FROM QUOTE (matches production contract/generate):
  contracts table extended with ~45 generation fields: company_reg, business_structure, business_type, trading_from,
    signatory (title/first/last), address, contact, billing_* block, meter_serial, current_read, requested_start,
    product/tariff details, rates (standing/day/night/ewe/kva/broker_commission), fixed_price_term,
    payment_method/amount, billing_period, quote_id link.
  New /contracts/generate/:quoteId page — grouped form (Supply Details, Billing Details [same-as-above],
    Meter Details, Product & Contract Details), PRE-FILLED from the quote. On submit creates the contract and
    marks the quote Accepted, then redirects to Contracts.
  "Generate" action added to each row in Quote History.
  Changed: amsl-backend/src/db.js, routes/modules.js; amsl-frontend/src/pages/GenerateContract.jsx (new), pages/Quotes.jsx, App.jsx

VIEW QUOTE RESULTS (matches production quote/results):
  New /quotes/:id page — "Market Supplier Details" breakdown for the saved quote: supplier, product, term,
    unit/standing rates (+ distribution/transmission for bespoke), annual cost, commission; meter & consumption;
    business (acq/renewal, type). Actions: Download Report, Send Email (stub), Generate Contract.
  "View" (eye) action added to each row in Quote History.
  Changed/new: amsl-frontend/src/pages/QuoteDetail.jsx (new), pages/Quotes.jsx, App.jsx

VIEW CONTRACT + COMMISSION SCHEDULE (matches production contract/view + payment-history):
  New /contracts/:id page with 2 tabs: Contract Details (Overview, Meter Details, Business & Contact,
    Plan & Pricing, Billing) + Commission Schedule (contract summary + payment schedule table with statuses
    + multi-level splits + VAT). Header actions: Download Contract, Send for Sign (stub).
  New endpoint GET /api/commission/by-contract/:contractId — returns the record + schedule + splits + ledger,
    generating the commission record on demand if the contract doesn't have one yet.
  "View" (eye) action added to the Contracts list (alongside existing Download Contract).
  Changed/new: amsl-backend/src/routes/commission.js; amsl-frontend/src/pages/ContractDetail.jsx (new),
    pages/Contracts.jsx, api.js, App.jsx

ADD TICKET — full form (matches production ticket/add):
  tickets table extended: corporate_sme, description.
  Tickets page rebuilt with "Add Ticket" form: Query Name*, Business* (dropdown), Agency*, Agent* (filtered by agency),
    Corporate/SME*, Utility*, Ticket Query* (Billing/Registration/Objection/General/Complaint), Ticket Status*, Description.
    Attachment noted as post-creation. Changed: amsl-backend/src/db.js, routes/modules.js; amsl-frontend/src/pages/Tickets.jsx

EDIT TICKET (matches production ticket/edit):
  Ticket form now handles both Add and Edit — "Edit" (pencil) action on each ticket row opens the same form
  pre-filled and saves via PUT /tickets/:id. Expanded Ticket Query types (+ Partner Payments, Meter Reading,
  Change of Tenancy) and Statuses (+ Awaiting Agency Feedback, Awaiting Customer).
  Changed: amsl-frontend/src/pages/Tickets.jsx

VIEW TICKET (matches production ticket/view):
  "View" (eye) action on each ticket row opens a read-only modal showing all fields (Query Name, Business,
  Agency, Agent, Corporate/SME, Utility, Ticket Query, Status, Raised, Last Updated, Description, Attachment)
  with an Edit button that switches straight to the edit form.
  Changed: amsl-frontend/src/pages/Tickets.jsx
