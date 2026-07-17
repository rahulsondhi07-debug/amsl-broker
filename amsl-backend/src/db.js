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
