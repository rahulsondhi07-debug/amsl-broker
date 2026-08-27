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
    status          TEXT NOT NULL DEFAULT 'Active'
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
  { key: "OBJECTED",           label: "Objected / Rejected", group: "Other" },
  { key: "LOST",               label: "Lost",                group: "Other" },
  { key: "UP_FOR_RENEWAL",     label: "Up for Renewal",      group: "Other" },
  { key: "RENEWED",            label: "Renewed",             group: "Other" },
];

export function migrate() {
  const addCol = (sql) => { try { db.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };
  addCol("ALTER TABLE businesses ADD COLUMN journey_stage    TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN fuel             TEXT");   // ELEC | GAS | DUAL
  addCol("ALTER TABLE businesses ADD COLUMN supplier_id      INTEGER");
  addCol("ALTER TABLE businesses ADD COLUMN contract_end     TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN contract_start   TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN disposition      TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN stage_updated_at TEXT");
  addCol("ALTER TABLE businesses ADD COLUMN frozen           INTEGER DEFAULT 0");
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
  // V1.6-10/13 Bespoke Get Quick Quote fields
  addCol("ALTER TABLE quotes ADD COLUMN bespoke             INTEGER DEFAULT 0");
  addCol("ALTER TABLE quotes ADD COLUMN meter_point         TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN meter_details       TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN distribution_charge REAL");
  addCol("ALTER TABLE quotes ADD COLUMN transmission_charge REAL");
  addCol("ALTER TABLE quotes ADD COLUMN product_name        TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN acq_renewal         TEXT");
  addCol("ALTER TABLE quotes ADD COLUMN business_type       TEXT");

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
      level     TEXT NOT NULL,   -- AMSL | Master Broker | Agent
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
  `);
  // V1.7-11 White-labelling: default branding
  const setDef = db.prepare("INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)");
  setDef.run("brand_name", "AMSL Broker");
  setDef.run("primary_color", "#0E7C7B");
  setDef.run("logo_url", "");
}

/* V1.0-17/19: seed platform settings lookups + tutorial entries. Idempotent. */
export function seedPlatform() {
  if (db.prepare("SELECT COUNT(*) c FROM config_lookups").get().c === 0) {
    const cfg = {
      "Contract Stage": ["New", "In Progress", "Signed", "Live", "Expired"],
      "Lifecycle Status": ["Lead", "Active", "Closed", "Cancelled"],
      "Lead Action": ["Call", "Email", "Callback", "No Answer", "Not Interested"],
      "Callback Reason": ["No answer — retry", "Requested callback", "Send quote", "Awaiting documents", "Renewal discussion"],
      "Priority Stage": ["Low", "Medium", "High", "Urgent"],
      "Quote Status": ["Draft", "Quoted", "Sent", "Accepted", "Rejected"],
      "Ticket Query Type": ["Billing", "Registration", "Objection", "General", "Complaint"],
      "Payment Status": ["Projected", "Invoiced", "Paid", "Overdue", "Reconciled"],
    };
    const ins = db.prepare("INSERT OR IGNORE INTO config_lookups (category,value) VALUES (?,?)");
    const tx = db.transaction(() => { for (const [cat, vals] of Object.entries(cfg)) vals.forEach((v) => ins.run(cat, v)); });
    tx();
  }
  if (db.prepare("SELECT COUNT(*) c FROM tutorials").get().c === 0) {
    const ins = db.prepare("INSERT INTO tutorials (title,kind,category,url,file_type) VALUES (?,?,?,?,?)");
    ins.run("Getting started with AMSL Broker", "video", "Onboarding", "https://example.com/getting-started.mp4", "MP4");
    ins.run("Creating a quote & comparison", "video", "Quotes", "https://example.com/quotes.mp4", "MP4");
    ins.run("Module Walkthroughs (PDF)", "document", "Reference", "https://example.com/walkthroughs.pdf", "PDF");
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
  { key: "/renewals", label: "Renewals" }, { key: "/contracts", label: "Contracts" },
  { key: "/master", label: "Master Management" },
  { key: "/tickets", label: "Tickets" }, { key: "/permissions", label: "Permissions" },
  { key: "/commission", label: "Commission" }, { key: "/tutorials", label: "Platform Guide" },
  { key: "/settings", label: "System Settings" }, { key: "/branding", label: "Branding" },
];
export const FULL_ACCESS_ROLES = ["Admin", "Super User"];

/* Seed default role -> menu permissions. Idempotent. */
export function seedPermissions() {
  if (db.prepare("SELECT COUNT(*) c FROM role_permissions").get().c > 0) return { skipped: true };
  const all = MENU_CATALOG.map((m) => m.key);
  const agentMenus = ["/", "/leads", "/pipeline", "/renewals", "/quotes/new", "/quotes", "/customers", "/contracts", "/tickets"];
  const grants = { "Admin": all, "Super User": all, "Manager": all.filter((k) => k !== "/permissions"), "Agent": agentMenus };
  const ins = db.prepare("INSERT OR IGNORE INTO role_permissions (role,menu_key) VALUES (?,?)");
  const tx = db.transaction(() => { for (const [role, menus] of Object.entries(grants)) menus.forEach((m) => ins.run(role, m)); });
  tx();
  return { skipped: false };
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
