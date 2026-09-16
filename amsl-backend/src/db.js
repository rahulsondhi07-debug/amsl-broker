import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "amsl.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ------------------------------------------------------------------ */
/*  Schema                                                            */
/* ------------------------------------------------------------------ */
export function initSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS agencies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    logo        TEXT,
    status      TEXT NOT NULL DEFAULT 'Active',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    agency_id       INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    email           TEXT UNIQUE NOT NULL,
    role            TEXT NOT NULL DEFAULT 'Super User',   -- Super User | Admin
    status          TEXT NOT NULL DEFAULT 'Active',
    aircall_enabled INTEGER NOT NULL DEFAULT 0,
    password_hash   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    name                        TEXT NOT NULL,
    logo                        TEXT,
    max_broker_comm_electric    REAL NOT NULL DEFAULT 0,
    broker_comm_inc_electric    REAL NOT NULL DEFAULT 0,
    max_broker_comm_gas         REAL NOT NULL DEFAULT 0,
    broker_comm_inc_gas         REAL NOT NULL DEFAULT 0,
    status                      TEXT NOT NULL DEFAULT 'Active',
    created_at                  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
    utility      TEXT NOT NULL DEFAULT 'NHH',          -- NHH | HH
    segment      TEXT NOT NULL DEFAULT 'SME',          -- SME | Corporate
    acq_renewal  TEXT NOT NULL DEFAULT 'Acquisition',  -- Acquisition | Renewal | Acquisition & Renewal
    valid_from   TEXT,
    valid_till   TEXT,
    status       TEXT NOT NULL DEFAULT 'Active',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS price_matrix (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id     INTEGER REFERENCES products(id) ON DELETE CASCADE,
    min_consumption INTEGER,
    max_consumption INTEGER,
    term_months    INTEGER,
    unit_rate      REAL,     -- p/kWh
    standing_charge REAL,    -- p/day
    commission     REAL
  );

  -- leads + prospects + customers share one table, separated by stage
  CREATE TABLE IF NOT EXISTS businesses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ref            TEXT UNIQUE NOT NULL,
    business_name  TEXT NOT NULL,
    contact_name   TEXT,
    contact_email  TEXT,
    contact_mobile TEXT,
    agency_id      INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    stage          TEXT NOT NULL DEFAULT 'LEAD',   -- LEAD | PROSPECT | CUSTOMER
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sites (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id  INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    name         TEXT,
    address      TEXT,
    region       TEXT,   -- UK region name (West Midlands, London, ...)
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meters (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id      INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    business_id  INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    utility      TEXT NOT NULL,          -- GAS | ELEC
    mpan_mprn    TEXT,
    eac          INTEGER,                -- consumption kWh/yr
    status       TEXT NOT NULL DEFAULT 'C'  -- C (current) | S (switching) | D (dropped)
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_no     TEXT UNIQUE NOT NULL,       -- QT-32
    business_id  INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    business_name TEXT,
    agent_id     INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    utility      TEXT NOT NULL,              -- Electricity | Gas
    meter_number TEXT,                       -- MPAN / MPRN
    eac          INTEGER,                    -- consumption kWh/yr
    start_date   TEXT,
    -- selected comparison result (nullable until an offer is chosen)
    supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    term_months  INTEGER,
    unit_rate    REAL,                       -- customer p/kWh incl. uplift
    standing_charge REAL,                    -- p/day
    annual_cost  REAL,                       -- £
    commission   REAL,                       -- projected £ commission
    status       TEXT NOT NULL DEFAULT 'Quote Requested',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- supplier tariffs powering the energy comparison
  CREATE TABLE IF NOT EXISTS tariffs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id     INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
    utility         TEXT NOT NULL,           -- ELECTRICITY | GAS
    term_months     INTEGER NOT NULL,        -- 12 | 24 | 36
    unit_rate       REAL NOT NULL,           -- base p/kWh (before broker uplift)
    standing_charge REAL NOT NULL,           -- p/day
    status          TEXT NOT NULL DEFAULT 'Active',
    acq_renewal     TEXT NOT NULL DEFAULT 'Both'  -- Acquisition | Renewal | Both — which deal type this tariff is valid for
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_no   TEXT UNIQUE NOT NULL,      -- CN-01
    business_id   INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    business_name TEXT,
    supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    agency_id     INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    agent_id      INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    term_months   INTEGER,
    meter_mpan_mpr TEXT,
    utility       TEXT,                       -- ELECTRICITY | GAS
    segment       TEXT DEFAULT 'SME',         -- SME | Corporate
    consumption   INTEGER,
    commission_value REAL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'Contract Sent to Client',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS supplier_payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
    file_name    TEXT NOT NULL,
    uploaded_by  TEXT,
    uploaded_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT,
    business_id   INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    agency_id     INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    agent_id      INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    utility       TEXT,
    query_type    TEXT,
    query_name    TEXT,
    status        TEXT NOT NULL DEFAULT 'Open',
    raised_date   TEXT NOT NULL DEFAULT (datetime('now')),
    last_updated  TEXT NOT NULL DEFAULT (datetime('now')),
    attachment    TEXT
  );
  `);
}

/* ============================================================
   V1.6 / V1.7 — Sales Journey migration (idempotent)
   Extends the existing businesses.stage backbone into the full
   12-stage customer journey, plus comments & stage history.
   ============================================================ */
export const JOURNEY_STAGES = [
  { key: "RAW_LEAD",           label: "Raw Lead",            group: "Lead" },
  { key: "QUALIFIED",          label: "Qualified",           group: "Lead" },
  { key: "QUOTE_CREATED",      label: "Quote Created",       group: "Prospect" },
  { key: "QUOTED",             label: "Quoted",              group: "Prospect" },
  { key: "ESIGN_SENT",         label: "E-Sign Contract Sent",group: "Prospect" },
  { key: "WON",                label: "Won",                 group: "Contract" },
  { key: "UNDER_REGISTRATION", label: "Under Registration",  group: "Contract" },
  { key: "LIVE",               label: "Live",                group: "Contract" },
  { key: "OBJECTED",           label: "Objected",            group: "Other" },
  { key: "REJECTED",           label: "Rejected",            group: "Other" },
  { key: "LOST",               label: "Lost",                group: "Other" },
  { key: "UP_FOR_RENEWAL",     label: "Up for Renewal",      group: "Other" },
  { key: "RENEWED",            label: "Renewed",             group: "Other" },
];

export function migrate() {
  const addCol = (sql) => { try { db.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };

  // Rebrand AMSL -> Utility X for databases seeded before the rename. Code defaults only
  // apply to a fresh install, so without this an existing deployment would keep showing
  // the old name and, more importantly, keep writing commission rows against a level
  // called "AMSL" that no longer matches the split definition — quietly breaking payouts.
  // Every statement is idempotent, so this is safe to run on each boot.
  try {
    db.prepare("UPDATE commission_splits SET level='Utility X' WHERE level='AMSL'").run();
    db.prepare("UPDATE agencies SET name='Utility X Portal' WHERE name='AMSL broker portal'").run();
    db.prepare("UPDATE app_settings SET value='Utility X' WHERE key='brand_name' AND value='AMSL Broker'").run();
    db.prepare("UPDATE app_settings SET value='/utility-x-mark.svg' WHERE key='logo_url' AND (value IS NULL OR value='')").run();
  } catch (e) { /* tables may not exist yet on a brand-new database — seeding covers those */ }
  addCol("ALTER TABLE businesses ADD COLUMN journey_stage    TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN fuel             TEXT");   // ELEC | GAS | DUAL
  addCol("ALTER TABLE businesses ADD COLUMN supplier_id      INTEGER");
  addCol("ALTER TABLE businesses ADD COLUMN contract_end     TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN contract_start   TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN disposition      TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN stage_updated_at TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN frozen           INTEGER DEFAULT 0");
  // Agency detail fields (match production Add Agency form)
  // Default payout settings per agency, so a payout form can pre-fill rather than
  // re-keying wallet details every time (and mis-typing a crypto address).
  addCol("ALTER TABLE agencies ADD COLUMN payout_method       TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN bank_account_name   TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN bank_sort_code      TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN bank_account_no     TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN crypto_currency     TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN crypto_network      TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN wallet_address      TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN email              TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN phone              TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN website            TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN max_users          INTEGER");
  addCol("ALTER TABLE agencies ADD COLUMN company_reg_no     TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN business_structure TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN vat_no             TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN address            TEXT");
  addCol("ALTER TABLE agencies ADD COLUMN white_label        INTEGER DEFAULT 0");
  // Agent detail fields (match production Add User/Agent form)
  addCol("ALTER TABLE agents ADD COLUMN first_name         TEXT");
  addCol("ALTER TABLE agents ADD COLUMN last_name          TEXT");
  addCol("ALTER TABLE agents ADD COLUMN trading_name       TEXT");
  addCol("ALTER TABLE agents ADD COLUMN principal_name     TEXT");
  addCol("ALTER TABLE agents ADD COLUMN business_structure TEXT");
  addCol("ALTER TABLE agents ADD COLUMN trading_account_no TEXT");
  addCol("ALTER TABLE agents ADD COLUMN vat_number         TEXT");
  addCol("ALTER TABLE agents ADD COLUMN agency_split       REAL");
  addCol("ALTER TABLE agents ADD COLUMN agent_split        REAL");
  addCol("ALTER TABLE agents ADD COLUMN telephone          TEXT");
  addCol("ALTER TABLE agents ADD COLUMN mobile             TEXT");
  addCol("ALTER TABLE agents ADD COLUMN office_website     TEXT");
  addCol("ALTER TABLE agents ADD COLUMN address_line1      TEXT");
  addCol("ALTER TABLE agents ADD COLUMN address_line2      TEXT");
  addCol("ALTER TABLE agents ADD COLUMN city               TEXT");
  addCol("ALTER TABLE agents ADD COLUMN county             TEXT");
  addCol("ALTER TABLE agents ADD COLUMN postcode           TEXT");
  addCol("ALTER TABLE agents ADD COLUMN bank_name          TEXT");
  addCol("ALTER TABLE agents ADD COLUMN account_name       TEXT");
  addCol("ALTER TABLE agents ADD COLUMN sort_code          TEXT");
  addCol("ALTER TABLE agents ADD COLUMN account_no         TEXT");
  addCol("ALTER TABLE agents ADD COLUMN training_status    TEXT");
  addCol("ALTER TABLE agents ADD COLUMN notes              TEXT");
  // Agency unique reference (AG-xx) for the view page
  addCol("ALTER TABLE agencies ADD COLUMN uid              TEXT");
  db.exec("UPDATE agencies SET uid='AG-'||printf('%02d',id) WHERE uid IS NULL");
  // Supplier detail fields (match production Add Supplier form)
  const sc = (c) => addCol(`ALTER TABLE suppliers ADD COLUMN ${c}`);
  ["supplier_role TEXT", "tpi_role TEXT", "fuel_mix TEXT", "contract_condition TEXT",
   "credit_check TEXT", "commission_payment TEXT", "customer_billing TEXT",
   "supplier_contact TEXT", "supplier_address TEXT", "restricted_business_types TEXT", "about TEXT",
   "sme_email TEXT", "sme_mobile TEXT", "sme_landline TEXT", "sme_password TEXT", "sme_threshold INTEGER",
   "corporate_login_email TEXT",
   "mm_name TEXT", "mm_email TEXT", "mm_password TEXT", "mm_mobile TEXT", "mm_landline TEXT", "mm_threshold INTEGER",
   "ind_name TEXT", "ind_email TEXT", "ind_password TEXT", "ind_mobile TEXT", "ind_landline TEXT", "ind_threshold INTEGER",
   "contract_agent_id TEXT"   // V1.7-14: the Agent ID this supplier issues to Utility X — gets
                              // auto-published onto every contract generated for them.
  ].forEach(sc);
  // Contract generation fields (match production contract/generate form)
  const cc = (c) => addCol(`ALTER TABLE contracts ADD COLUMN ${c}`);
  ["quote_id INTEGER", "company_reg TEXT", "business_structure TEXT", "business_type TEXT", "trading_from TEXT",
   "title TEXT", "first_name TEXT", "last_name TEXT", "address_line1 TEXT", "address_line2 TEXT",
   "town TEXT", "postcode TEXT", "telephone TEXT", "mobile TEXT", "email TEXT",
   "billing_same INTEGER DEFAULT 1", "billing_title TEXT", "billing_first_name TEXT", "billing_last_name TEXT",
   "billing_address1 TEXT", "billing_address2 TEXT", "billing_town TEXT", "billing_postcode TEXT",
   "billing_telephone TEXT", "billing_mobile TEXT", "billing_email TEXT",
   "site_same INTEGER DEFAULT 1", "site_address1 TEXT", "site_address2 TEXT", "site_town TEXT", "site_postcode TEXT",
   "meter_serial TEXT", "current_read TEXT", "requested_start TEXT",
   "product_name TEXT", "tariff_name TEXT", "acq_renewal TEXT", "tariff_type TEXT",
   "supplier_start TEXT", "tariff_end TEXT", "supplier_end TEXT", "fixed_price_term INTEGER",
   "standing_charge REAL", "day_rate REAL", "night_rate REAL", "ewe_rate REAL", "kva_charge REAL", "broker_commission REAL",
   "payment_method TEXT", "payment_amount REAL", "billing_period TEXT", "tolerance_pct REAL",
   "topline TEXT", "supplier_agent_id TEXT"   // V1.7-14: copied from the supplier's Agent ID at generation time
  ].forEach(cc);
  // Ticket fields (match production Add Ticket form)
  addCol("ALTER TABLE tickets ADD COLUMN corporate_sme TEXT");
  addCol("ALTER TABLE tickets ADD COLUMN description   TEXT");
  // Product price-book fields (match production Add Product form)
  const pc = (c) => addCol(`ALTER TABLE products ADD COLUMN ${c}`);
  ["standing_charge_type TEXT", "fuel_mix TEXT", "max_commission REAL", "commission_increment REAL",
   "commission_banded TEXT", "standing_charge TEXT", "payment_method TEXT", "payment_mode TEXT",
   "initial TEXT", "final TEXT", "dd_discount REAL", "price_book_status TEXT DEFAULT 'Pending'",
   "min_start_days INTEGER", "min_start_date INTEGER", "max_start_date INTEGER", "product_type TEXT"
  ].forEach(pc);
  // V1.6-03 Utility-on-Site meter fields
  addCol("ALTER TABLE meters ADD COLUMN meter_type          TEXT");   // SME | NHH | HH
  addCol("ALTER TABLE meters ADD COLUMN standing_charge     REAL");
  addCol("ALTER TABLE meters ADD COLUMN unit_rate           REAL");
  addCol("ALTER TABLE meters ADD COLUMN day_rate            REAL");
  addCol("ALTER TABLE meters ADD COLUMN night_rate          REAL");
  addCol("ALTER TABLE meters ADD COLUMN ewe_rate            REAL");
  addCol("ALTER TABLE meters ADD COLUMN distribution_charge REAL");
  addCol("ALTER TABLE meters ADD COLUMN transmission_charge REAL");
  addCol("ALTER TABLE meters ADD COLUMN aq                  INTEGER");
  addCol("ALTER TABLE meters ADD COLUMN last_read           TEXT");
  // Lead Management parity: meter identity, supplier switching, segment, contract window
  addCol("ALTER TABLE meters ADD COLUMN name                TEXT");
  addCol("ALTER TABLE meters ADD COLUMN current_supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL");
  addCol("ALTER TABLE meters ADD COLUMN transferring_supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL");
  addCol("ALTER TABLE meters ADD COLUMN segment             TEXT");   // SME | Corporate | Domestic
  addCol("ALTER TABLE meters ADD COLUMN contract_start      TEXT");
  addCol("ALTER TABLE meters ADD COLUMN contract_end        TEXT");
  addCol("ALTER TABLE tariffs ADD COLUMN acq_renewal TEXT NOT NULL DEFAULT 'Both'");
  addCol("ALTER TABLE sites ADD COLUMN postcode             TEXT");
  // Price Matrix — real supplier flat-file columns (e.g. "SEB Electricity Flat File"):
  // ProductType, Dist ID, Region, Meter Type, Profile, Product, StandingCharge, Day/All,
  // Night, Eve&Wkend, MinAQ, MaxAQ, Effective From/To Date, Renewable Energy, ProductName,
  // Voltage/TCR Band, CapacityCharge. Existing min_consumption/max_consumption/unit_rate/
  // standing_charge/commission columns are kept for the original single-row manual-entry
  // flow; these new columns support real bulk file imports without breaking that.
  const pmc = (c) => addCol(`ALTER TABLE price_matrix ADD COLUMN ${c}`);
  ["dist_id INTEGER", "region TEXT", "meter_type TEXT", "profile INTEGER", "day_rate REAL",
   "night_rate REAL", "eve_wknd_rate REAL", "min_aq INTEGER", "max_aq INTEGER",
   "effective_from TEXT", "effective_to TEXT", "renewable_energy TEXT", "product_name TEXT",
   "voltage_tcr_band TEXT", "capacity_charge REAL", "set_name TEXT",
  ].forEach(pmc);
  // V1.6-10/13 Bespoke Get Quick Quote fields
  addCol("ALTER TABLE quotes ADD COLUMN bespoke             INTEGER DEFAULT 0");
  addCol("ALTER TABLE quotes ADD COLUMN meter_point         TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN meter_details       TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN distribution_charge REAL");
  addCol("ALTER TABLE quotes ADD COLUMN transmission_charge REAL");
  addCol("ALTER TABLE quotes ADD COLUMN product_name        TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN acq_renewal         TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN business_type       TEXT");
  // Topline — the 8-digit header printed above an electricity MPAN's barcode (Profile
  // Class + Meter Time Switch Code + Line Loss Factor Class). Its first 2 digits give the
  // Profile Class, which — together with the Distributor ID (the first 2 digits of the
  // MPAN itself) — is how a real supplier price matrix (see price_matrix.profile /
  // price_matrix.dist_id) is filtered down to the rates that actually apply to a meter.
  addCol("ALTER TABLE meters ADD COLUMN topline             TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN topline             TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN uplift              REAL");

  // V1.7-11: Quote Price History — retains every price a quote has ever shown, so a
  // superseded price can be flagged Invalid rather than silently disappearing, and the
  // current one shown as the Best Price.
  db.exec(`
    CREATE TABLE IF NOT EXISTS quote_price_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id        INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      unit_rate       REAL, standing_charge REAL, annual_cost REAL, commission REAL,
      term_months     INTEGER, supplier_id INTEGER,
      valid           INTEGER NOT NULL DEFAULT 1,   -- 0 once superseded by a refresh
      source          TEXT NOT NULL DEFAULT 'created', -- created | refresh
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Backfill journey_stage from the legacy 3-stage field
  db.exec(`UPDATE businesses SET journey_stage='RAW_LEAD' WHERE journey_stage IS NULL AND stage='LEAD'`);
  db.exec(`UPDATE businesses SET journey_stage='QUOTED'   WHERE journey_stage IS NULL AND stage='PROSPECT'`);
  db.exec(`UPDATE businesses SET journey_stage='LIVE'     WHERE journey_stage IS NULL AND stage='CUSTOMER'`);
  db.exec(`UPDATE businesses SET journey_stage='RAW_LEAD' WHERE journey_stage IS NULL`);
  db.exec(`UPDATE businesses SET fuel='DUAL' WHERE fuel IS NULL`);
  db.exec(`UPDATE businesses SET stage_updated_at=COALESCE(stage_updated_at, created_at, datetime('now')) WHERE stage_updated_at IS NULL`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      author      TEXT,
      body        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stage_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      from_stage  TEXT,
      to_stage    TEXT NOT NULL,
      note        TEXT,
      changed_by  TEXT,
      changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Other Services: non-energy services tracked per business (Water, Waste, Card
    -- Payment) — each with its own provider and contract end date, plus an optional
    -- uploaded bill (xlsx/csv/pdf) stored inline as base64 since there's no separate file
    -- storage in this app. Deliberately its own table rather than overloading meters,
    -- since these aren't metered utilities with an MPAN/MPRN or EAC.
    CREATE TABLE IF NOT EXISTS other_services (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      service_type  TEXT NOT NULL,   -- 'Water' | 'Waste' | 'Card Payment'
      provider      TEXT,
      contract_end  TEXT,
      notes         TEXT,
      bill_filename TEXT,
      bill_mime     TEXT,
      bill_data     TEXT,            -- base64-encoded file content
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS callbacks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      due_at      TEXT NOT NULL,
      reason      TEXT,
      note        TEXT,
      done        INTEGER NOT NULL DEFAULT 0,
      created_by  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT,
      seen        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS uplift_caps (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      provider        TEXT NOT NULL DEFAULT 'PE Solutions',
      utility         TEXT NOT NULL,          -- ELEC | GAS
      min_consumption INTEGER NOT NULL,
      max_consumption INTEGER NOT NULL,
      max_uplift_p    REAL NOT NULL,          -- max uplift in pence/kWh
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      role     TEXT NOT NULL,
      menu_key TEXT NOT NULL,
      UNIQUE(role, menu_key)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS tutorials (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'video',   -- video | document
      category   TEXT,
      url        TEXT,
      file_type  TEXT,                             -- PDF | PNG | JPG | MP4
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS config_lookups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      category   TEXT NOT NULL,
      value      TEXT NOT NULL,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, value)
    );
    CREATE TABLE IF NOT EXISTS commission_config (
      supplier_id    INTEGER PRIMARY KEY,
      payment_method TEXT NOT NULL DEFAULT 'Annual',   -- Annual | Contract Length
      uplift_rate    REAL NOT NULL DEFAULT 1.0,          -- p/kWh
      upfront_pct    REAL NOT NULL DEFAULT 100,
      deferred_pct   REAL NOT NULL DEFAULT 0,
      clawback_pct   REAL NOT NULL DEFAULT 100,
      vat_rate       REAL NOT NULL DEFAULT 20
    );
    CREATE TABLE IF NOT EXISTS commission_records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER,
      supplier_id INTEGER,
      agent_id    INTEGER,
      eac         INTEGER,
      aac         INTEGER,
      uplift_rate REAL,
      term_months INTEGER,
      gross       REAL,
      vat         REAL,
      net         REAL,
      status      TEXT NOT NULL DEFAULT 'Projected',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(contract_id)
    );
    CREATE TABLE IF NOT EXISTS commission_splits (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL REFERENCES commission_records(id) ON DELETE CASCADE,
      level     TEXT NOT NULL,   -- Utility X | Master Broker | Agent
      pct       REAL NOT NULL,
      amount    REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commission_schedule (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL REFERENCES commission_records(id) ON DELETE CASCADE,
      seq       INTEGER NOT NULL,
      due_date  TEXT,
      amount    REAL NOT NULL,
      status    TEXT NOT NULL DEFAULT 'Projected'   -- Projected | Invoiced | Paid | Overdue | Reconciled
    );
    CREATE TABLE IF NOT EXISTS commission_ledger (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id  INTEGER REFERENCES commission_records(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,   -- projected | reconciliation | clawback | vat | payment
      amount     REAL NOT NULL,
      note       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Agency payouts: what Utility X owes each agency once the supplier has actually paid us.
    -- Separate from commission_records (what the supplier owes Utility X) because the two sides
    -- settle independently — a supplier can pay us before we pay the agency, and the
    -- payout can go out by a completely different method.
    -- Cryptocurrency payouts capture the extra detail a bank transfer doesn't need: which
    -- coin, which network (getting this wrong loses the funds), the destination wallet, the
    -- GBP/crypto rate used at the time, and the on-chain transaction hash as the receipt.
    CREATE TABLE IF NOT EXISTS agency_payouts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id         INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
      record_id         INTEGER REFERENCES commission_records(id) ON DELETE SET NULL,
      contract_id       INTEGER,
      supplier_id       INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      gross_amount      REAL NOT NULL DEFAULT 0,
      vat_amount        REAL NOT NULL DEFAULT 0,
      net_amount        REAL NOT NULL DEFAULT 0,
      currency          TEXT NOT NULL DEFAULT 'GBP',
      payment_method    TEXT NOT NULL DEFAULT 'BACS',  -- BACS | Faster Payments | Cheque | Cryptocurrency ...
      supplier_paid_on  TEXT,      -- when the supplier settled with us (gates the payout)
      paid_on           TEXT,      -- when we paid the agency
      status            TEXT NOT NULL DEFAULT 'Awaiting Supplier', -- Awaiting Supplier | Ready to Pay | Paid | Failed | On Hold
      reference         TEXT,
      -- crypto-only fields
      crypto_currency   TEXT,      -- BTC | ETH | USDT | USDC ...
      crypto_network    TEXT,      -- Bitcoin | Ethereum (ERC-20) | Tron (TRC-20) | Polygon ...
      wallet_address    TEXT,
      crypto_amount     REAL,      -- amount sent in the coin's own units
      exchange_rate     REAL,      -- GBP per 1 unit of the coin at time of payment
      tx_hash           TEXT,      -- on-chain transaction hash (the receipt)
      notes             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS commission_statements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      filename    TEXT,
      lines       INTEGER DEFAULT 0,
      matched     INTEGER DEFAULT 0,
      exceptions  INTEGER DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS statement_lines (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL REFERENCES commission_statements(id) ON DELETE CASCADE,
      contract_no  TEXT,
      amount       REAL,
      period       TEXT,
      record_id    INTEGER,
      expected     REAL,
      variance     REAL,
      status       TEXT NOT NULL DEFAULT 'Exception'
    );

    -- Bill Validation & Energy Claims module
    CREATE TABLE IF NOT EXISTS bill_validations (
      id                         INTEGER PRIMARY KEY AUTOINCREMENT,
      ref                        TEXT,
      contract_id                INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
      business_id                INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
      business_name              TEXT,
      supplier_id                INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name              TEXT,
      utility                    TEXT,
      meter_mpan_mpr             TEXT,
      period                     TEXT,
      days                       INTEGER DEFAULT 30,
      billed_consumption         REAL,
      billed_standing_charge     REAL,
      billed_unit_rate           REAL,
      billed_amount              REAL,
      vat_rate                   REAL DEFAULT 20,
      contracted_standing_charge REAL,
      contracted_unit_rate       REAL,
      expected_amount            REAL,
      variance                   REAL DEFAULT 0,
      -- CCL exemption / rebate
      ccl_charged                REAL DEFAULT 0,
      ccl_rate                   REAL DEFAULT 0.775,
      ccl_relief_pct             REAL DEFAULT 0,
      ccl_exempt                 INTEGER DEFAULT 0,
      ccl_rebate                 REAL DEFAULT 0,
      -- Energy-Intensive Industry relief
      eii_eligible               INTEGER DEFAULT 0,
      eii_policy_cost            REAL DEFAULT 0,
      eii_relief_pct             REAL DEFAULT 85,
      eii_relief                 REAL DEFAULT 0,
      -- Volume tolerance
      eac                        REAL,
      tolerance_pct              REAL DEFAULT 20,
      volume_status              TEXT DEFAULT 'Within',
      -- Aggregate
      total_claim                REAL DEFAULT 0,
      status                     TEXT NOT NULL DEFAULT 'Pending',
      claim_amount               REAL DEFAULT 0,
      findings                   TEXT,
      notes                      TEXT,
      -- Meter reading cross-check
      meter_reading_start        REAL,
      meter_reading_end          REAL,
      -- VAT rate verification
      vat_rate_expected          REAL DEFAULT 20,
      -- Pass-through verification: Transmission (TNUoS) & Distribution (DUoS) fixed charges
      tnuos_charged               REAL DEFAULT 0,
      tnuos_rate                  REAL DEFAULT 0,
      duos_charged                REAL DEFAULT 0,
      duos_rate                   REAL DEFAULT 0,
      bsuos_charged                REAL DEFAULT 0,
      ncc_compensation             REAL DEFAULT 0,
      -- Error detection / supplier follow-up
      duplicate_flag              INTEGER DEFAULT 0,
      meter_data_flag             INTEGER DEFAULT 0,
      supplier_query_status       TEXT DEFAULT 'Not Raised',   -- Not Raised | Raised | Resolved
      supplier_query_notes        TEXT,
      supplier_query_raised_at    TEXT,
      -- Claim pipeline (Sales Agent -> Back Office -> Reporter workflow)
      claim_stage                 TEXT DEFAULT 'service_agreed',
      claim_stage_updated_at      TEXT,
      payment_received_amount     REAL,
      payment_received_at         TEXT,
      -- Client Agreement / Letter of Authority (CCA/EII/CCL rebate service)
      client_name                TEXT,
      client_address             TEXT,
      client_company_reg         TEXT,
      sic_code                   TEXT,
      bill_file_name              TEXT,
      bill_uploaded_at             TEXT,
      loa_status                 TEXT DEFAULT 'Not Sent',   -- Not Sent | Sent | Signed
      loa_sent_at                TEXT,
      created_at                 TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- EII Certificates (modelled on real DBT certificates, e.g. EVTEC Aluminium 6457-1/-2/-3)
    -- One certificate can cover multiple meters (MSIDs), each with its own Proportion Exempt %.
    CREATE TABLE IF NOT EXISTS eii_certificates (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_number  TEXT,
      business_id         INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
      business_name       TEXT NOT NULL,
      company_number      TEXT,
      date_of_issue       TEXT,
      validity_start      TEXT NOT NULL,
      validity_end        TEXT NOT NULL,
      eligible_product    TEXT,
      notes               TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS eii_certificate_meters (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_id         INTEGER NOT NULL REFERENCES eii_certificates(id) ON DELETE CASCADE,
      msid                   TEXT NOT NULL,
      proportion_exempt_pct  REAL NOT NULL DEFAULT 100
    );
    -- Flexible (flex) purchasing requests. Unlike a fixed-price quote, flex contracts
    -- aren't priced from a matrix — the customer buys volume in tranches against the
    -- wholesale market, so this is an enquiry routed to suppliers/trading desks rather
    -- than an instantly-priced offer. Hence its own table rather than a row in quotes.
    CREATE TABLE IF NOT EXISTS flex_requests (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      ref                 TEXT,
      business_id         INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
      business_name       TEXT,
      utility             TEXT NOT NULL,          -- Electricity | Gas
      meter_number        TEXT,
      annual_volume       REAL,                   -- total annual consumption, kWh
      sites_count         INTEGER,
      contract_start      TEXT,
      contract_length     INTEGER,                -- months
      basket_type         TEXT,                   -- Individual | Flexi Basket / Pooled
      purchasing_strategy TEXT,                   -- Fully Flexible | Structured / Tranche | Risk Managed
      tranche_count       INTEGER,
      index_reference     TEXT,                   -- Day Ahead | Month Ahead | Season Ahead | Quarterly
      risk_appetite       TEXT,                   -- Low | Medium | High
      volume_tolerance    TEXT,                   -- e.g. '+/- 20%'
      management_fee      REAL,                   -- p/kWh
      target_supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      status              TEXT NOT NULL DEFAULT 'Requested', -- Requested | Sent to Supplier | Indicative Received | Won | Lost
      notes               TEXT,
      agent_id            INTEGER REFERENCES agents(id) ON DELETE SET NULL,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- On-site energy assets (battery storage, EV charge points, solar PV, CHP...).
    -- Kept separate from meters: an asset sits behind a meter rather than being one, and
    -- several assets can share a single MPAN. day_night_active flags whether the site is
    -- on a dual-rate (day/night) tariff, which is what makes battery charge/discharge
    -- arbitrage worthwhile — see the day/night pricing in comparison.js.
    CREATE TABLE IF NOT EXISTS energy_assets (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id       INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      asset_type        TEXT NOT NULL,     -- Battery Storage | EV Charge Point | Solar PV | ...
      manufacturer      TEXT,
      model             TEXT,
      capacity_kw       REAL,              -- rated power (kW) — charger speed / inverter size
      capacity_kwh      REAL,              -- storage capacity (kWh) — batteries only
      quantity          INTEGER DEFAULT 1, -- e.g. number of charge point sockets
      install_date      TEXT,
      ownership         TEXT,              -- Owned | Leased | PPA / Third Party
      meter_id          INTEGER REFERENCES meters(id) ON DELETE SET NULL,
      mpan              TEXT,
      day_night_active  INTEGER NOT NULL DEFAULT 0,  -- 1 = on a dual-rate day/night tariff
      charging_strategy TEXT,              -- Off-Peak Charging | Solar Self-Consumption | ...
      export_capable    INTEGER NOT NULL DEFAULT 0,  -- can export/discharge back to grid
      status            TEXT NOT NULL DEFAULT 'Active', -- Active | Planned | Decommissioned
      notes             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- REGO (Renewable Energy Guarantees of Origin) certificates.
    -- rego_offers is the catalogue: what's currently available to buy, across the
    -- different marketplaces/registries Utility X sources from. One REGO = 1 MWh of certified
    -- renewable generation, so everything is priced and traded per MWh.
    CREATE TABLE IF NOT EXISTS rego_offers (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      marketplace      TEXT NOT NULL,          -- e.g. 'Ofgem REGO Registry', 'STX Group'
      technology       TEXT,                   -- Wind | Solar | Hydro | Biomass | Mixed
      country          TEXT,                   -- generation country of origin
      vintage_year     INTEGER,                -- compliance/generation year
      price_per_mwh    REAL NOT NULL,          -- £ per certificate (1 REGO = 1 MWh)
      volume_available REAL,                   -- MWh still purchasable on this offer
      generator_name   TEXT,
      status           TEXT NOT NULL DEFAULT 'Available',  -- Available | Sold Out | Withdrawn
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- A customer's actual purchase against an offer. offer_id is SET NULL on delete so
    -- historical purchases survive an offer being removed from the catalogue; the
    -- marketplace/technology/price are copied here so the record stays accurate even if
    -- the original offer later changes price or is withdrawn.
    CREATE TABLE IF NOT EXISTS rego_purchases (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id      INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      offer_id         INTEGER REFERENCES rego_offers(id) ON DELETE SET NULL,
      marketplace      TEXT,
      technology       TEXT,
      country          TEXT,
      vintage_year     INTEGER,
      volume_mwh       REAL NOT NULL,
      price_per_mwh    REAL NOT NULL,
      total_cost       REAL NOT NULL,
      purchase_date    TEXT NOT NULL DEFAULT (date('now')),
      certificate_ref  TEXT,
      status           TEXT NOT NULL DEFAULT 'Ordered',   -- Ordered | Issued | Retired | Cancelled
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Local energy marketplace: buying power directly from a named generator (a PPA),
    -- rather than from a supplier's price book.
    -- "Locality" here means the electricity distribution area, identified by dist_id — the
    -- same two-digit code we already derive from the first 2 digits of a customer's MPAN.
    -- That is the meaningful unit for local supply: a generator and a consumer in the same
    -- distribution area share the local network, which is what underpins any genuine
    -- "bought from your local wind farm" claim.
    CREATE TABLE IF NOT EXISTS generators (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      operator          TEXT,
      technology        TEXT,              -- Solar PV | Wind (Onshore) | Hydro | Anaerobic Digestion | ...
      dist_id           INTEGER,           -- distribution area (10-23), matches MPAN first 2 digits
      region            TEXT,              -- human-readable area name
      postcode          TEXT,
      capacity_mw       REAL,
      annual_output_mwh REAL,              -- typical generation per year
      available_mwh     REAL,              -- volume still uncontracted and offerable
      price_p_kwh       REAL,              -- indicative PPA price
      min_volume_mwh    REAL,
      term_months_min   INTEGER,
      term_months_max   INTEGER,
      commissioned_year INTEGER,
      rego_accredited   INTEGER NOT NULL DEFAULT 1,
      status            TEXT NOT NULL DEFAULT 'Available',  -- Available | Fully Contracted | Offline
      notes             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ppa_deals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id     INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      generator_id    INTEGER REFERENCES generators(id) ON DELETE SET NULL,
      generator_name  TEXT,
      technology      TEXT,
      volume_mwh      REAL NOT NULL,
      price_p_kwh     REAL NOT NULL,
      term_months     INTEGER,
      annual_value    REAL,
      start_date      TEXT,
      end_date        TEXT,
      locality        TEXT,   -- 'Local' when the customer and generator share a distribution area
      reference       TEXT,
      status          TEXT NOT NULL DEFAULT 'Enquiry',  -- Enquiry | Offer Sent | Contracted | Live | Ended
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Virtual Power Plant: aggregating customer batteries (and other flexible assets) so
    -- they can be paid for turning down or exporting during peak periods.
    -- Two distinct ways these schemes pay, which is why both rate columns exist:
    --   * utilisation — paid per MWh actually shifted during a called event (e.g. NESO's
    --     Demand Flexibility Service), so earnings depend on measured performance.
    --   * availability — paid per kW simply for being contracted and available across a
    --     season (e.g. the Capacity Market), whether or not an event is ever called.
    CREATE TABLE IF NOT EXISTS vpp_programmes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      operator          TEXT,              -- NESO, a supplier, or an aggregator
      scheme_type       TEXT,              -- Demand Flexibility | Capacity Market | Frequency Response | ...
      payment_basis     TEXT NOT NULL DEFAULT 'Utilisation',  -- Utilisation | Availability
      utilisation_rate  REAL,              -- £ per MWh shifted
      availability_rate REAL,              -- £ per kW per year
      min_capacity_kw   REAL,              -- smallest asset the scheme will accept
      typical_window    TEXT,              -- e.g. "16:00-19:00 weekdays, Nov-Mar"
      season_start      TEXT,
      season_end        TEXT,
      status            TEXT NOT NULL DEFAULT 'Open',  -- Open | Closed
      notes             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vpp_enrolments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id     INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      asset_id        INTEGER REFERENCES energy_assets(id) ON DELETE SET NULL,
      programme_id    INTEGER NOT NULL REFERENCES vpp_programmes(id) ON DELETE CASCADE,
      contracted_kw   REAL,                -- capacity committed to the scheme
      start_date      TEXT,
      end_date        TEXT,
      reference       TEXT,
      status          TEXT NOT NULL DEFAULT 'Registered', -- Registered | Active | Suspended | Exited
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vpp_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      programme_id    INTEGER NOT NULL REFERENCES vpp_programmes(id) ON DELETE CASCADE,
      event_date      TEXT NOT NULL,
      start_time      TEXT,
      end_time        TEXT,
      event_type      TEXT NOT NULL DEFAULT 'Live',  -- Live | Test
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- One row per enrolment per event. Reduction is baseline minus actual: the baseline is
    -- what the site would normally have used in that window, so payment reflects the extra
    -- turn-down achieved, not total consumption.
    CREATE TABLE IF NOT EXISTS vpp_participation (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id        INTEGER NOT NULL REFERENCES vpp_events(id) ON DELETE CASCADE,
      enrolment_id    INTEGER NOT NULL REFERENCES vpp_enrolments(id) ON DELETE CASCADE,
      baseline_kwh    REAL,
      actual_kwh      REAL,
      reduction_kwh   REAL,
      rate_per_mwh    REAL,
      payment         REAL,
      status          TEXT NOT NULL DEFAULT 'Estimated', -- Estimated | Verified | Paid
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Carbon credits. One credit = 1 tonne of CO2e.
    -- The point of aggregation here is price: a single small business buying 40 tonnes pays
    -- retail, but pooling many customers' demand into one purchase reaches volume tiers.
    -- Pools therefore recalculate a single effective price for every member whenever the
    -- committed total crosses a tier, so late joiners and early joiners pay the same rate.
    CREATE TABLE IF NOT EXISTS carbon_projects (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      registry         TEXT,            -- Verra VCS | Gold Standard | Woodland Carbon Code | ...
      project_type     TEXT,            -- Afforestation | REDD+ | Renewable Energy | Biochar | ...
      country          TEXT,
      vintage_year     INTEGER,
      price_per_tonne  REAL,            -- retail/list price before pooling
      available_tonnes REAL,
      co_benefits      TEXT,            -- e.g. "SDG 8, SDG 15"
      registry_ref     TEXT,            -- project ID on the registry, for verification
      status           TEXT NOT NULL DEFAULT 'Available',  -- Available | Sold Out | Retired
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS carbon_pools (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      project_id       INTEGER REFERENCES carbon_projects(id) ON DELETE SET NULL,
      target_tonnes    REAL,            -- volume we're aiming to reach
      committed_tonnes REAL NOT NULL DEFAULT 0,  -- recalculated from allocations
      effective_price  REAL,            -- current tier price, applied to all members
      closes_on        TEXT,
      status           TEXT NOT NULL DEFAULT 'Open',  -- Open | Closed | Settled
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Volume discount ladder for a pool: the tier with the highest min_tonnes at or below
    -- the pool's committed total sets the price everyone pays.
    CREATE TABLE IF NOT EXISTS carbon_price_tiers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_id         INTEGER NOT NULL REFERENCES carbon_pools(id) ON DELETE CASCADE,
      min_tonnes      REAL NOT NULL,
      price_per_tonne REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS carbon_allocations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_id           INTEGER NOT NULL REFERENCES carbon_pools(id) ON DELETE CASCADE,
      business_id       INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tonnes            REAL NOT NULL,
      price_per_tonne   REAL,           -- snapshot of the effective price for this member
      cost              REAL,
      retirement_serial TEXT,           -- registry serial once retired on the customer's behalf
      retired_on        TEXT,
      status            TEXT NOT NULL DEFAULT 'Committed', -- Committed | Purchased | Retired | Cancelled
      notes             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Network charge optimisation: coordinating battery dispatch to cut the non-commodity
    -- costs that sit outside the "fixed" unit rate.
    --
    -- DUoS unit rates are banded by time of day (red/amber/green) and vary by distribution
    -- area. The saving from shifting load is the difference between the band you left and
    -- the band you moved into, so both rates matter, not just the red one.
    CREATE TABLE IF NOT EXISTS duos_bands (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      dist_id       INTEGER NOT NULL,        -- distribution area (10-23)
      band          TEXT NOT NULL,           -- Red | Amber | Green
      day_type      TEXT NOT NULL DEFAULT 'Weekday', -- Weekday | Weekend | All
      start_time    TEXT NOT NULL,
      end_time      TEXT NOT NULL,
      rate_p_kwh    REAL NOT NULL,
      season        TEXT,                    -- optional, e.g. Winter
      charge_year   TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- TNUoS locational demand tariff, £/kW of Triad demand per year, by transmission zone.
    -- Post-TCR (April 2023) the residual element became a fixed band, so only this
    -- locational element still responds to Triad behaviour.
    CREATE TABLE IF NOT EXISTS tnuos_tariffs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_name       TEXT NOT NULL,
      dist_id         INTEGER,
      tariff_gbp_kw   REAL NOT NULL,
      charge_year     TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Candidate Triad half-hours. A Triad is one of the three highest national demand
    -- half-hours between November and February, each separated by at least 10 clear days.
    -- They're only confirmed retrospectively, so the workflow is: forecast -> warn ->
    -- confirm after the season.
    CREATE TABLE IF NOT EXISTS triad_alerts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_date        TEXT NOT NULL,
      start_time        TEXT,
      end_time          TEXT,
      forecast_demand_mw REAL,
      alert_level       TEXT NOT NULL DEFAULT 'Watch',  -- Watch | Warning | Confirmed Triad | Missed
      season            TEXT,
      notes             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- A planned or delivered battery/load action in a specific window.
    CREATE TABLE IF NOT EXISTS dispatch_plans (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id       INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      asset_id          INTEGER REFERENCES energy_assets(id) ON DELETE SET NULL,
      triad_alert_id    INTEGER REFERENCES triad_alerts(id) ON DELETE SET NULL,
      purpose           TEXT NOT NULL,       -- Triad Avoidance | DUoS Red Shift
      plan_date         TEXT NOT NULL,
      start_time        TEXT,
      end_time          TEXT,
      planned_kw        REAL,                -- power reduction during the window
      planned_kwh       REAL,                -- energy shifted out of the window
      delivered_kw      REAL,
      delivered_kwh     REAL,
      from_band         TEXT,                -- band the load was shifted out of
      to_band           TEXT,                -- band it moved into
      estimated_saving  REAL,
      actual_saving     REAL,
      status            TEXT NOT NULL DEFAULT 'Planned', -- Planned | Dispatched | Verified | Missed
      notes             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const setDef = db.prepare("INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)");
  setDef.run("brand_name", "Utility X");
  setDef.run("logo_url", "/utility-x-mark.svg");
  setDef.run("primary_color", "#0E7C7B");
  setDef.run("logo_url", "");
}

/* V1.0-17/19: seed platform settings lookups + tutorial entries.
   Made additive (not just "run once") the same way seedPermissions was fixed —
   INSERT OR IGNORE against the UNIQUE(category,value) constraint means this is
   safe to call on every boot and will pick up categories/values added later
   without duplicating or disturbing anything a user has since edited. */
export function seedPlatform() {
  const cfg = {
    "Contract Stage": ["New", "In Progress", "Signed", "Live", "Expired"],
    "Lifecycle Status": ["Lead", "Active", "Closed", "Cancelled"],
    "Lead Action": ["Call", "Email", "Callback", "No Answer", "Not Interested"],
    "Callback Reason": ["No answer — retry", "Requested callback", "Send quote", "Awaiting documents", "Renewal discussion"],
    "Priority Stage": ["Low", "Medium", "High", "Urgent"],
    "Quote Status": ["Draft", "Quoted", "Sent", "Accepted", "Rejected"],
    "Ticket Query Type": ["Pre-Contract Submission", "Live date request", "IT systems", "Partner Payments", "Registrations", "Pricing", "Partner Support", "Technical Support", "Contract Status", "Complaint"],
    "Payment Status": ["Projected", "Invoiced", "Paid", "Overdue", "Reconciled"],
    "Inclusion Type": ["Included", "Excluded", "Optional"],
    "Supplier Status": ["Awaiting Price", "Failed Credit Check", "Quote Received", "Quote Not Received", "Deposit Required", "Declined due to Volume"],
    "Billing Period": ["Monthly", "Quarterly", "Annually"],
    "Contract Status": ["Pending", "Active", "Terminated", "Renewed"],
    "Tariff Type": ["Fixed", "Variable", "Deemed", "Out of Contract"],
    "Monthly Payment": ["Direct Debit", "BACS", "Card", "Cheque"],
    "Price Book Status": ["Live", "Expired", "Pending Upload"],
    "Position": ["Director", "Manager", "Sales Agent", "Admin", "Support"],
    "Business Structure": ["Charity", "Government Funded", "LLP", "LTD", "Non-profit Making", "Partnership", "PLC", "Property Manager", "Private Limited Company", "Religious Institute", "Sole Trader", "Trust"],
    "Payment Type": ["Direct Debit", "BACS", "Card"],
    "Schedule Call Status": ["Scheduled", "Completed", "Missed", "Cancelled"],
    "Contract Method": ["E-Sign", "Wet Signature", "Verbal (Recorded)"],
    "Utility Mapping": ["Electricity", "Gas", "Water", "Dual Fuel"],
    "Ticket Status": ["Open", "In Progress", "Resolved", "Closed"],
    // V1.7-extra: admin-manageable provider lists for the "Other Services" (Water/Waste/
    // Card Payment) feature — same add/edit/delete UI as every other category here, so no
    // separate admin screen was needed for these.
    "Water Provider": ["Castle Water", "Water Plus", "Business Stream", "Everflow", "Wave", "Clear Business Water",
                        "SES Business Water", "Yorkshire Water Business", "Affinity for Business", "Pennon Water Services"],
    "Waste Provider": ["Biffa", "Veolia", "Suez", "Grundon", "Reconomy", "First Mile", "Bywaters", "FCC Environment", "Enva"],
    "Card Payment Provider": ["Worldpay", "Dojo", "Takepayments", "Elavon", "Barclaycard Payments", "Handepay",
                               "SumUp", "Square", "Zettle", "Advance Merchant Services"],
    // REGO certificate sourcing — admin-manageable the same way as everything else here.
    "REGO Marketplace": ["Ofgem REGO Registry", "STX Group", "ACT Commodities", "Vertis Environmental Finance",
                          "Redshaw Advisors", "Nasdaq Clearing", "EEX", "Brainstorm / Green Trading", "Direct from Generator"],
    "REGO Technology": ["Wind (Onshore)", "Wind (Offshore)", "Solar PV", "Hydro", "Biomass", "Landfill Gas", "Anaerobic Digestion", "Mixed Renewable"],
    "REGO Status": ["Ordered", "Issued", "Retired", "Cancelled"],
    // LPG — tracked alongside Water/Waste/Card Payment as a non-mains fuel source, since
    // it has a supplier and contract end date but no MPAN/MPRN to meter against.
    "LPG Provider": ["Calor Gas", "Flogas", "AvantiGas", "BP Gas Light", "Countrywide LPG",
                      "Nexus Energy", "Prax LPG", "Certas Energy", "Autogas", "Independent / Other"],
    // Flexible (non-fixed) purchasing — dropdowns for the Flex Request form.
    "Flex Purchasing Strategy": ["Fully Flexible", "Structured / Tranche", "Risk Managed", "Peak / Off-Peak Split", "Click & Fix"],
    "Flex Basket Type": ["Individual (standalone)", "Flexi Basket / Pooled", "Framework / Consortium"],
    "Flex Index Reference": ["Day Ahead", "Within Day", "Month Ahead", "Quarter Ahead", "Season Ahead", "Annual (Calendar)"],
    "Flex Request Status": ["Requested", "Sent to Supplier", "Indicative Received", "Won", "Lost"],
    // On-site energy assets.
    "Energy Asset Type": ["Battery Storage", "EV Charge Point", "Solar PV", "CHP", "Heat Pump",
                           "Wind Turbine", "Voltage Optimisation", "Backup Generator"],
    "Asset Ownership": ["Owned", "Leased", "PPA / Third Party", "Funded / Shared Saving"],
    "Battery Charging Strategy": ["Off-Peak (Night Rate) Charging", "Solar Self-Consumption", "Peak Shaving",
                                   "Triad / DUoS Avoidance", "Grid Services / Flexibility", "Backup Only"],
    // Agency commission payouts.
    "Agency Payout Method": ["BACS", "Faster Payments", "CHAPS", "Cheque", "Cryptocurrency"],
    "Cryptocurrency": ["BTC (Bitcoin)", "ETH (Ethereum)", "USDT (Tether)", "USDC (USD Coin)", "SOL (Solana)", "XRP (Ripple)"],
    "Crypto Network": ["Bitcoin", "Ethereum (ERC-20)", "Tron (TRC-20)", "Polygon", "Solana", "Binance Smart Chain (BEP-20)", "Lightning Network"],
    "Agency Payout Status": ["Awaiting Supplier", "Ready to Pay", "Paid", "Failed", "On Hold"],
  };
  const ins = db.prepare("INSERT OR IGNORE INTO config_lookups (category,value) VALUES (?,?)");
  const before = db.prepare("SELECT COUNT(*) c FROM config_lookups").get().c;
  const tx = db.transaction(() => { for (const [cat, vals] of Object.entries(cfg)) vals.forEach((v) => ins.run(cat, v)); });
  tx();
  const after = db.prepare("SELECT COUNT(*) c FROM config_lookups").get().c;
  if (before === 0) console.log(`Seeded config_lookups: ${after} values across ${Object.keys(cfg).length} categories.`);
  else if (after > before) console.log(`Added ${after - before} new config_lookups value(s) for categories introduced since last deploy.`);
  if (db.prepare("SELECT COUNT(*) c FROM tutorials").get().c === 0) {
    const ins = db.prepare("INSERT INTO tutorials (title,kind,category,url,file_type) VALUES (?,?,?,?,?)");
    ins.run("Getting started with Utility X", "video", "Onboarding", "https://example.com/getting-started.mp4", "MP4");
    ins.run("Creating a quote & comparison", "video", "Quotes", "https://example.com/quotes.mp4", "MP4");
    ins.run("Module Walkthroughs (PDF)", "document", "Reference", "https://example.com/walkthroughs.pdf", "PDF");
  }
  // Sample REGO catalogue so the marketplace isn't empty on a fresh install. Prices are
  // illustrative only — real REGO prices move with the market and should be maintained by
  // an admin on the REGO Certificates screen.
  if (db.prepare("SELECT COUNT(*) c FROM rego_offers").get().c === 0) {
    const ro = db.prepare(`INSERT INTO rego_offers
      (marketplace, technology, country, vintage_year, price_per_mwh, volume_available, generator_name, status)
      VALUES (?,?,?,?,?,?,?, 'Available')`);
    [
      ["Ofgem REGO Registry", "Wind (Onshore)", "United Kingdom", 2026, 5.25, 12000, "Whitelee Wind Farm"],
      ["Ofgem REGO Registry", "Wind (Offshore)", "United Kingdom", 2026, 6.10, 8000, "Hornsea Project One"],
      ["Ofgem REGO Registry", "Solar PV", "United Kingdom", 2026, 5.80, 4500, "Shotwick Solar Park"],
      ["STX Group", "Hydro", "United Kingdom", 2025, 4.40, 6000, "Cruachan Power Station"],
      ["STX Group", "Mixed Renewable", "United Kingdom", 2026, 5.00, 20000, null],
      ["ACT Commodities", "Biomass", "United Kingdom", 2025, 3.95, 9000, "Drax Power Station"],
      ["ACT Commodities", "Wind (Onshore)", "United Kingdom", 2025, 4.75, 15000, null],
      ["Vertis Environmental Finance", "Solar PV", "United Kingdom", 2026, 6.35, 2500, "Lyneham Solar Farm"],
      ["Redshaw Advisors", "Anaerobic Digestion", "United Kingdom", 2026, 7.20, 1200, null],
      ["Direct from Generator", "Wind (Onshore)", "United Kingdom", 2026, 4.90, 3000, "Pen y Cymoedd"],
    ].forEach((v) => ro.run(...v));
    console.log("Seeded 10 sample REGO offers.");
  }
  // Sample generators for the local energy marketplace, spread across distribution areas so
  // the locality matching is demonstrable. Prices and volumes are illustrative — real PPA
  // terms are negotiated per deal and should be maintained by an admin.
  if (db.prepare("SELECT COUNT(*) c FROM generators").get().c === 0) {
    const gi = db.prepare(`INSERT INTO generators
      (name, operator, technology, dist_id, region, postcode, capacity_mw, annual_output_mwh,
       available_mwh, price_p_kwh, min_volume_mwh, term_months_min, term_months_max,
       commissioned_year, rego_accredited, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'Available')`);
    [
      ["Whitelee Wind Farm", "ScottishPower Renewables", "Wind (Onshore)", 18, "Southern Scotland", "G76 0QQ", 539, 1300000, 40000, 8.20, 500, 24, 120, 2009],
      ["Pen y Cymoedd", "Vattenfall", "Wind (Onshore)", 21, "South Wales", "CF44 9RU", 228, 700000, 25000, 8.05, 500, 24, 120, 2017],
      ["Shotwick Solar Park", "Wirsol Energy", "Solar PV", 13, "North Wales, Merseyside & Cheshire", "CH5 2LL", 72, 68000, 9000, 9.10, 250, 12, 60, 2016],
      ["Lyneham Solar Farm", "Lightsource bp", "Solar PV", 22, "South West England", "SN15 4PZ", 25, 24000, 5000, 9.40, 100, 12, 60, 2015],
      ["Cruachan Power Station", "Drax Group", "Hydro", 17, "Northern Scotland", "PA33 1AN", 440, 705000, 30000, 8.60, 1000, 36, 120, 1965],
      ["Fenland AD Facility", "Bio Capital", "Anaerobic Digestion", 10, "Eastern England", "PE13 2TB", 5, 38000, 6000, 10.20, 100, 12, 84, 2014],
      ["Keadby Wind", "SSE Renewables", "Wind (Onshore)", 23, "Yorkshire", "DN17 3EF", 68, 180000, 12000, 8.35, 250, 24, 96, 2012],
      ["Rampion Offshore", "RWE", "Wind (Offshore)", 19, "South East England", "BN43 5HZ", 400, 1400000, 35000, 8.90, 1000, 36, 180, 2018],
      ["Birmingham Rooftop Portfolio", "Midlands Community Energy", "Solar PV", 14, "West Midlands", "B1 1AA", 12, 11000, 3000, 9.75, 50, 12, 48, 2019],
      ["Tees Renewable Plant", "MGT Power", "Biomass", 15, "North East England", "TS2 1UD", 299, 2000000, 18000, 9.95, 500, 24, 120, 2020],
    ].forEach((v) => gi.run(...v));
    console.log("Seeded 10 sample generators for the local energy marketplace.");
  }
  // Flexibility schemes a business can be paid through for shifting load off peak. Rates
  // are indicative starting points only — real rates are set per season/auction and must be
  // maintained by an admin on the Virtual Power Plant screen.
  if (db.prepare("SELECT COUNT(*) c FROM vpp_programmes").get().c === 0) {
    const vp = db.prepare(`INSERT INTO vpp_programmes
      (name, operator, scheme_type, payment_basis, utilisation_rate, availability_rate,
       min_capacity_kw, typical_window, status, notes)
      VALUES (?,?,?,?,?,?,?,?, 'Open', ?)`);
    [
      ["Demand Flexibility Service", "NESO", "Demand Flexibility", "Utilisation", 3000, null, 10,
       "16:00-19:00 weekdays, Nov-Mar", "Paid per MWh shifted out of called peak windows. Delivered through a registered provider, not claimed directly."],
      ["Capacity Market (DSR)", "NESO", "Capacity Market", "Availability", null, 60, 500,
       "Winter stress events", "Availability payment per kW for being contracted; penalties apply if you fail to deliver when called."],
      ["Dynamic Containment", "NESO", "Frequency Response", "Availability", null, 85, 1000,
       "24/7 second-by-second", "Fast frequency response — needs battery-grade response times."],
      ["Local Flexibility (DNO)", "Distribution Network Operator", "Local Flexibility", "Utilisation", 2200, null, 50,
       "Constraint windows, area-specific", "Paid to relieve local network constraints in specific distribution areas."],
      ["Supplier Peak-Shift Scheme", "Energy Supplier", "Demand Flexibility", "Utilisation", 1800, null, 5,
       "Supplier-defined peak events", "Supplier-run scheme; typically lower rates but a lower entry threshold."],
    ].forEach((v) => vp.run(...v));
    console.log("Seeded 5 flexibility programmes.");
  }
  // Sample carbon projects. Prices are illustrative — the voluntary carbon market moves
  // and varies hugely by project type and quality, so an admin should maintain these.
  if (db.prepare("SELECT COUNT(*) c FROM carbon_projects").get().c === 0) {
    const cp = db.prepare(`INSERT INTO carbon_projects
      (name, registry, project_type, country, vintage_year, price_per_tonne, available_tonnes,
       co_benefits, registry_ref, status)
      VALUES (?,?,?,?,?,?,?,?,?, 'Available')`);
    [
      ["Scottish Highlands Native Woodland", "Woodland Carbon Code", "Afforestation", "United Kingdom", 2026, 32.00, 8000, "Biodiversity, SDG 15", "WCC-UK-2291"],
      ["Pennine Peatland Restoration", "Peatland Code", "Peatland Restoration", "United Kingdom", 2026, 28.50, 5000, "Water quality, SDG 6", "PC-UK-0417"],
      ["Devon Hedgerow & Agroforestry", "Woodland Carbon Code", "Agroforestry", "United Kingdom", 2025, 26.00, 3000, "Farm resilience, SDG 2", "WCC-UK-1863"],
      ["Rimba Raya Biodiversity Reserve", "Verra VCS", "REDD+", "Indonesia", 2024, 11.50, 40000, "Orangutan habitat, SDG 13/15", "VCS-674"],
      ["Kariba REDD+ Forest Protection", "Verra VCS", "REDD+", "Zimbabwe", 2023, 8.75, 60000, "Community livelihoods, SDG 1", "VCS-902"],
      ["Gyapa Improved Cookstoves", "Gold Standard", "Cookstoves", "Ghana", 2025, 14.20, 25000, "Indoor air quality, SDG 3", "GS-1247"],
      ["Bundled Solar Mini-Grids", "Gold Standard", "Renewable Energy", "India", 2025, 9.40, 35000, "Energy access, SDG 7", "GS-3390"],
      ["UK Biochar Carbon Removal", "Puro.earth", "Biochar", "United Kingdom", 2026, 118.00, 800, "Durable removal, 100yr+", "PURO-BC-0088"],
    ].forEach((v) => cp.run(...v));
    console.log("Seeded 8 carbon projects.");
  }
  // DUoS band windows and rates. Indicative shapes only — every DNO publishes its own
  // schedule and rates each charging year, so these must be maintained by an admin.
  if (db.prepare("SELECT COUNT(*) c FROM duos_bands").get().c === 0) {
    const dbnd = db.prepare(`INSERT INTO duos_bands
      (dist_id, band, day_type, start_time, end_time, rate_p_kwh, charge_year) VALUES (?,?,?,?,?,?, '2026/27')`);
    // [dist_id, red rate, amber rate, green rate]
    [[10, 12.80, 1.40, 0.18], [12, 15.60, 1.85, 0.22], [14, 11.90, 1.30, 0.17],
     [16, 10.40, 1.20, 0.15], [19, 13.20, 1.45, 0.19], [22, 14.10, 1.55, 0.20],
     [23, 11.20, 1.25, 0.16], [18, 9.80, 1.10, 0.14]].forEach(([d, red, amber, green]) => {
      dbnd.run(d, "Red", "Weekday", "16:00", "19:00", red);
      dbnd.run(d, "Amber", "Weekday", "07:00", "16:00", amber);
      dbnd.run(d, "Amber", "Weekday", "19:00", "21:00", amber);
      dbnd.run(d, "Green", "Weekday", "21:00", "07:00", green);
      dbnd.run(d, "Green", "Weekend", "00:00", "24:00", green);
    });
    console.log("Seeded DUoS bands for 8 distribution areas.");
  }
  if (db.prepare("SELECT COUNT(*) c FROM tnuos_tariffs").get().c === 0) {
    const tn = db.prepare("INSERT INTO tnuos_tariffs (zone_name, dist_id, tariff_gbp_kw, charge_year) VALUES (?,?,?, '2026/27')");
    // Locational element only. Northern zones are typically negative or low; southern
    // zones carry the highest tariffs, which is where Triad avoidance is worth most.
    [["Northern Scotland", 17, -2.40], ["Southern Scotland", 18, 1.85], ["North East England", 15, 6.20],
     ["North West England", 16, 9.40], ["Yorkshire", 23, 8.10], ["East Midlands", 11, 14.70],
     ["West Midlands", 14, 17.30], ["Eastern England", 10, 19.80], ["London", 12, 23.60],
     ["South East England", 19, 26.40], ["Southern England", 20, 28.10], ["South Wales", 21, 21.50],
     ["South West England", 22, 30.20], ["North Wales, Merseyside & Cheshire", 13, 12.60]]
      .forEach(([z, d, t]) => tn.run(z, d, t));
    console.log("Seeded TNUoS locational tariffs for 14 zones.");
  }
  return { skipped: false };
}

/* Menu catalog — keys match the frontend nav 'to' paths (V1.7-12) */
export const MENU_CATALOG = [
  { key: "/", label: "Dashboard" }, { key: "/agencies", label: "Agencies" },
  { key: "/agents", label: "Agents" }, { key: "/suppliers", label: "Suppliers" },
  { key: "/tariffs", label: "Tariffs" }, { key: "/supplier-payments", label: "Supplier Payments" },
  { key: "/products", label: "Products" }, { key: "/leads", label: "Leads" },
  { key: "/quotes/new", label: "Get Quote" }, { key: "/quotes", label: "Quotes" },
  { key: "/customers", label: "Customers" }, { key: "/pipeline", label: "Pipeline" },
  { key: "/utility-opportunities", label: "Utility Opportunities" },
  { key: "/renewals", label: "Renewals" }, { key: "/contracts", label: "Contracts" },
  { key: "/master", label: "Master Management" },
  { key: "/tickets", label: "Tickets" }, { key: "/permissions", label: "Permissions" },
  { key: "/commission", label: "Commission" }, { key: "/bill-validation", label: "Bill Validation" },
  { key: "/eii-certificates", label: "EII Certificates" },
  { key: "/rego-certificates", label: "REGO Certificates" },
  { key: "/local-energy", label: "Local Energy Marketplace" },
  { key: "/vpp", label: "Virtual Power Plant" },
  { key: "/carbon", label: "Carbon Credits" },
  { key: "/network-charges", label: "Network Charges" },
  { key: "/tutorials", label: "Platform Guide" },
  { key: "/settings", label: "System Settings" }, { key: "/branding", label: "Branding" },
];
export const FULL_ACCESS_ROLES = ["Admin", "Super User"];

/* Seed default role -> menu permissions. Idempotent. */
export function seedPermissions() {
  // Previously this skipped entirely once any row existed, which meant menu
  // items added after the first deploy (e.g. Bill Validation, EII
  // Certificates) never got granted to any role on an already-seeded
  // database. INSERT OR IGNORE is safe to re-run: it only adds missing
  // (role, menu_key) pairs and never touches permissions someone has
  // customised via the Permissions screen.
  const all = MENU_CATALOG.map((m) => m.key);
  const agentMenus = ["/", "/leads", "/pipeline", "/renewals", "/quotes/new", "/quotes", "/customers", "/contracts", "/tickets"];
  const grants = { "Admin": all, "Super User": all, "Manager": all.filter((k) => k !== "/permissions"), "Agent": agentMenus };
  const before = db.prepare("SELECT COUNT(*) c FROM role_permissions").get().c;
  const ins = db.prepare("INSERT OR IGNORE INTO role_permissions (role,menu_key) VALUES (?,?)");
  const tx = db.transaction(() => { for (const [role, menus] of Object.entries(grants)) menus.forEach((m) => ins.run(role, m)); });
  tx();
  const after = db.prepare("SELECT COUNT(*) c FROM role_permissions").get().c;
  return { skipped: false, added: after - before };
}
export function seedUpliftCaps() {
  if (db.prepare("SELECT COUNT(*) c FROM uplift_caps").get().c > 0) return { skipped: true };
  const rows = [
    ["ELEC", 1, 30000, 3], ["ELEC", 30001, 120000, 2], ["ELEC", 120001, 999999999, 1.5],
    ["GAS", 1, 50000, 2], ["GAS", 50001, 200000, 1.5], ["GAS", 200001, 999999999, 1],
  ];
  const ins = db.prepare("INSERT INTO uplift_caps (provider,utility,min_consumption,max_consumption,max_uplift_p) VALUES ('PE Solutions',?,?,?,?)");
  const tx = db.transaction(() => rows.forEach((r) => ins.run(...r)));
  tx();
  return { skipped: false, added: rows.length };
}

/* ============================================================
   Stage automations (V1.7-04 & V1.7-07)
   - Under Registration -> Live once contract_start has arrived
   - Live -> Up for Renewal when contract_end is within 30 days
   Idempotent: safe to run on every boot / on demand.
   ============================================================ */
export function runAutomations() {
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const log = db.prepare("INSERT INTO stage_history (business_id,from_stage,to_stage,note,changed_by) VALUES (?,?,?,?, 'Automation')");
  const notify = db.prepare("INSERT INTO notifications (business_id,kind,title,body) VALUES (?,?,?,?)");

  // Under Registration -> Live on/after contract start (not objected)
  const toLive = db.prepare(
    `SELECT id, business_name FROM businesses
     WHERE journey_stage='UNDER_REGISTRATION' AND contract_start IS NOT NULL AND contract_start <= ?`
  ).all(today);
  const setLive = db.prepare("UPDATE businesses SET journey_stage='LIVE', stage='CUSTOMER', stage_updated_at=datetime('now') WHERE id=?");
  for (const b of toLive) {
    setLive.run(b.id); log.run(b.id, "UNDER_REGISTRATION", "LIVE", "Contract start date reached");
    notify.run(b.id, "went_live", `${b.business_name} is now Live`, "Auto-moved on contract start date.");
  }

  // Live -> Up for Renewal within 30 days of contract end
  const toRenewal = db.prepare(
    `SELECT id, business_name, contract_end FROM businesses
     WHERE journey_stage='LIVE' AND contract_end IS NOT NULL AND contract_end <= ? AND contract_end >= ?`
  ).all(in30, today);
  const setRenewal = db.prepare("UPDATE businesses SET journey_stage='UP_FOR_RENEWAL', stage_updated_at=datetime('now') WHERE id=?");
  for (const b of toRenewal) {
    setRenewal.run(b.id); log.run(b.id, "LIVE", "UP_FOR_RENEWAL", "Within 30 days of contract end");
    notify.run(b.id, "up_for_renewal", `${b.business_name} is up for renewal`, `Contract ends ${b.contract_end}.`);
  }
  return { toLive: toLive.length, toRenewal: toRenewal.length };
}
