/**
 * Flex & client-documents suite: schema, migrations and first-run content for
 *   - flex position trades, thresholds and position history
 *   - Fixed vs Flex current baseline, versions, monthly consumption
 *   - market reports, client knowledge base and glossary
 *   - generated documents and client hubs
 *
 * Everything here is idempotent (CREATE IF NOT EXISTS, guarded ALTERs, INSERT OR IGNORE,
 * seed-if-missing) so it is safe on every boot and on a database that already has data.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import { ARTICLES, GLOSSARY } from "./seeds/knowledge.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function initFlexSuite() {
  db.exec(`
    -- Individual trades ("clips") executed for a consortium book. Kept separately from the
    -- curve so the report can say what was bought today, at what price against the live
    -- market, and how far each season's hedge moved as a result.
    CREATE TABLE IF NOT EXISTS flex_trades (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      basket_id     INTEGER NOT NULL REFERENCES flex_baskets(id) ON DELETE CASCADE,
      utility       TEXT NOT NULL,           -- Gas | Power
      trade_date    TEXT NOT NULL,
      season_label  TEXT NOT NULL,           -- matches flex_curve.label, e.g. "Winter 2028"
      side          TEXT NOT NULL DEFAULT 'Buy',   -- Buy | Sell
      clip          REAL NOT NULL,           -- MW or therms/day
      price         REAL NOT NULL,           -- £/MWh or p/therm
      live_market   REAL,                    -- market for the same season at the time of the trade
      hedged_before REAL,                    -- 0..1
      hedged_after  REAL,                    -- 0..1
      rationale     TEXT,
      confirmed_by  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Floor / target / ceiling per season: the buy triggers, stop-loss and time-based
    -- minimums the desk trades against.
    CREATE TABLE IF NOT EXISTS flex_thresholds (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      basket_id     INTEGER NOT NULL REFERENCES flex_baskets(id) ON DELETE CASCADE,
      utility       TEXT NOT NULL,
      season_label  TEXT NOT NULL,
      floor         REAL,
      target        REAL,
      ceiling       REAL,
      min_hedge_pct REAL,                    -- 0..100
      min_hedge_by  TEXT,
      notes         TEXT,
      UNIQUE(basket_id, utility, season_label)
    );
    -- Book-level totals recorded at a point in time, so a report can say "up from 71% at
    -- £79.29 yesterday" rather than only describing today.
    CREATE TABLE IF NOT EXISTS flex_position_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      basket_id      INTEGER NOT NULL REFERENCES flex_baskets(id) ON DELETE CASCADE,
      utility        TEXT NOT NULL,
      as_at          TEXT NOT NULL,
      hedged_pct     REAL,
      locked_avg     REAL,
      market_avg     REAL,
      traded_total   REAL,
      open_total     REAL,
      required_total REAL,
      note           TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Monthly consumption behind a comparison (the profile chart in the client deck).
    CREATE TABLE IF NOT EXISTS fvf_monthly (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      comparison_id  INTEGER NOT NULL REFERENCES fvf_comparisons(id) ON DELETE CASCADE,
      month_label    TEXT NOT NULL,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      day_kwh        REAL,
      night_kwh      REAL
    );

    -- Market reports: a dated view of where prices are and why, reused in banners, decks
    -- and client hubs rather than rewritten in each document.
    CREATE TABLE IF NOT EXISTS market_reports (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      report_date   TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'Draft',   -- Draft | Published
      headline      TEXT,
      summary       TEXT,
      backdrop      TEXT,
      drivers       TEXT,           -- one per line
      outlook       TEXT,
      fixed_view    TEXT,           -- what it means if you are on / renewing a fixed contract
      flex_view     TEXT,           -- what it means for flex / consortium members
      sources       TEXT,           -- one per line
      author        TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS market_report_prices (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id    INTEGER NOT NULL REFERENCES market_reports(id) ON DELETE CASCADE,
      commodity    TEXT NOT NULL,   -- Power | Gas | Other
      contract     TEXT NOT NULL,   -- "Winter 2026", "Day-ahead", "Storage"
      price        REAL,
      unit         TEXT,            -- £/MWh | p/therm | %
      previous     REAL,            -- last report / week-ago, for the change column
      note         TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS knowledge_articles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT UNIQUE NOT NULL,
      category    TEXT NOT NULL,
      title       TEXT NOT NULL,
      summary     TEXT,
      body        TEXT,
      audience    TEXT NOT NULL DEFAULT 'client',   -- client | internal
      published   INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS glossary_terms (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      term        TEXT UNIQUE NOT NULL,
      definition  TEXT NOT NULL,
      category    TEXT
    );

    -- Every generated client document, stored so it can be re-downloaded, attached to a
    -- customer and published to their hub without being regenerated.
    CREATE TABLE IF NOT EXISTS generated_documents (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type      TEXT NOT NULL,
      title         TEXT NOT NULL,
      filename      TEXT NOT NULL,
      mime          TEXT NOT NULL,
      content       BLOB NOT NULL,
      size          INTEGER,
      business_id   INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
      source_kind   TEXT,           -- fvf | basket | market_report | group_quote | knowledge
      source_id     INTEGER,
      params        TEXT,           -- JSON
      published     INTEGER NOT NULL DEFAULT 0,   -- visible in the client's hub
      created_by    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- A private, shareable client page: their documents, the published knowledge base,
    -- the latest market report and their consortium position.
    CREATE TABLE IF NOT EXISTS client_hubs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id     INTEGER UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      token           TEXT UNIQUE NOT NULL,
      enabled         INTEGER NOT NULL DEFAULT 1,
      welcome_message TEXT,
      basket_id       INTEGER REFERENCES flex_baskets(id) ON DELETE SET NULL,
      views           INTEGER NOT NULL DEFAULT 0,
      last_viewed_at  TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const addCol = (sql) => { try { db.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };
  // Group upload: the extra columns real site lists carry.
  addCol("ALTER TABLE group_quote_sites ADD COLUMN meter_type TEXT");
  addCol("ALTER TABLE group_quote_sites ADD COLUMN current_supplier TEXT");
  addCol("ALTER TABLE group_quote_sites ADD COLUMN contract_end TEXT");
  addCol("ALTER TABLE group_quote_sites ADD COLUMN out_of_contract INTEGER DEFAULT 0");
  addCol("ALTER TABLE group_quote_sites ADD COLUMN kva REAL");
  // Flex curve: power reports give traded + open rather than a requirement.
  addCol("ALTER TABLE flex_curve ADD COLUMN open REAL");
  addCol("ALTER TABLE flex_baskets ADD COLUMN common_end_date TEXT");
  addCol("ALTER TABLE flex_baskets ADD COLUMN manager_name TEXT");
  // Fixed vs Flex: the context a client document needs.
  for (const c of [
    "version_label TEXT", "parent_id INTEGER", "fixed_supplier TEXT", "fixed_quote_ref TEXT", "fixed_quote_date TEXT",
    "flex_supplier TEXT", "basket_id INTEGER", "current_contract_end TEXT", "early_termination_pct REAL",
    "onboarding_fee REAL", "flex_term_months INTEGER", "flex_end TEXT", "agreement_ref TEXT", "prepared_by TEXT",
    "consumption_period TEXT", "market_note TEXT", "assumptions TEXT", "metering TEXT",
  ]) addCol(`ALTER TABLE fvf_comparisons ADD COLUMN ${c}`);

  seedDocumentSettings();
  seedKnowledge();
  seedMarketReport();
  seedFctConsortium();
  seedPkComparison();
}

/* ---------------- Settings used on every generated document ---------------- */
export const DOC_SETTING_KEYS = [
  "doc_company_name", "doc_company_legal", "doc_address", "doc_phone", "doc_mobile", "doc_email", "doc_web",
  "doc_contact_name", "doc_contact_title", "doc_contact_email", "doc_primary_color", "doc_accent_color",
  "doc_disclaimer", "flex_min_elec_kwh", "flex_min_gas_kwh",
];
function seedDocumentSettings() {
  const ins = db.prepare("INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)");
  [
    ["doc_company_name", "FCT Energy Partners"],
    ["doc_company_legal", "FCT Energy Partners is the trading name of Future Corporate Technologies Limited."],
    ["doc_address", "Suite 6, Byron House, Hall Dean Way, Seaham Industrial Estate, County Durham, SR7 0PY"],
    ["doc_phone", "+44 191 820 4549"], ["doc_mobile", "+44 7436 863456"],
    ["doc_email", "info@thefctgroup.co.uk"], ["doc_web", "thefctgroup.co.uk"],
    ["doc_contact_name", "Mark Crozier"], ["doc_contact_title", "CEO & Head of Trading"],
    ["doc_contact_email", "mark.crozier@thefctgroup.co.uk"],
    ["doc_primary_color", "#0b2545"], ["doc_accent_color", "#eb6834"],
    ["doc_disclaimer", "This document is provided for information only. Figures are illustrative of the strategy described and do not constitute a price quotation for any individual meter, a contractual offer, or financial or procurement advice. Past hedging performance is not a guide to future purchases."],
    ["flex_min_elec_kwh", "175000"], ["flex_min_gas_kwh", "300000"],
  ].forEach(([k, v]) => ins.run(k, v));
}
export function docSettings() {
  const rows = db.prepare(`SELECT key,value FROM app_settings WHERE key IN (${DOC_SETTING_KEYS.map(() => "?").join(",")})`).all(...DOC_SETTING_KEYS);
  return Object.fromEntries(rows.map((x) => [x.key, x.value]));
}

/* ---------------- Knowledge ---------------- */
function seedKnowledge() {
  const ins = db.prepare(`INSERT OR IGNORE INTO knowledge_articles (slug,category,title,summary,body,audience,published,sort_order)
                          VALUES (?,?,?,?,?,'client',1,?)`);
  const g = db.prepare("INSERT OR IGNORE INTO glossary_terms (term,definition,category) VALUES (?,?,?)");
  db.transaction(() => {
    ARTICLES.forEach((a) => ins.run(a.slug, a.category, a.title, a.summary, a.body, a.sort));
    GLOSSARY.forEach(([t, d, c]) => g.run(t, d, c));
  })();
}

/* ---------------- A first market report, from the 22 Sep 2026 risk report ---------------- */
function seedMarketReport() {
  if (db.prepare("SELECT COUNT(*) c FROM market_reports").get().c > 0) return;
  const info = db.prepare(`INSERT INTO market_reports (title,report_date,status,headline,summary,backdrop,drivers,outlook,fixed_view,flex_view,sources,author)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "UK Gas & Power Market Update", "2026-09-22", "Published",
    "Near-term prices remain more than double pre-war levels; the far curve is where the value is.",
    "UK gas hovered near two-week lows at the start of the week, with closes to 21 September easing 5–10% off mid-September peaks. Prices nonetheless remain more than double pre-war levels, and the premium sits on the near curve: Winter 2026 power is around £159/MWh while Summer 2028 onwards trades around £67–81/MWh.",
    "European gas has been trading near its highest levels since 2022 amid a Middle East supply shock. UK and EU storage are well below their five-year averages heading into the heating season, which keeps the coming winter exposed to any further disruption.",
    "US–Iran conflict affecting the Strait of Hormuz\nSaudi Aramco cut to October crude allocations for European refiners\nUK and EU gas storage well below the five-year average\nIEA expects meaningful LNG relief no earlier than 2028–2029",
    "Near- and medium-term risk still skews upward rather than downward. Further-dated seasons (Summer 2028 onwards) are comparatively cheap, which is where staged buying is concentrating.",
    "A fixed renewal signed today prices the Winter 2026 spike into every unit for the whole term. If you are renewing, compare the fixed quote against a staged or consortium strategy before signing, and avoid fixing 100% of a multi-year term on a single day.",
    "The consortium's Winter 2026 power position is 94% hedged at around £92.53/MWh against a live market of £159.00/MWh. Current buying is concentrated in the least-covered medium-dated seasons (Winter 2028 to Winter 2030).",
    "Corona Energy, Daily Energy Matters, 22 Sep 2026\nIEA Gas Market Report Q2-2026\nReuters, Bloomberg, Energy Connects and EIA coverage, 10–22 Sep 2026\nFCT Electric Consortium position data, 22 Sep 2026",
    "Mark Crozier",
  );
  const p = db.prepare("INSERT INTO market_report_prices (report_id,commodity,contract,price,unit,previous,note,sort_order) VALUES (?,?,?,?,?,?,?,?)");
  [
    ["Power", "Winter 2026", 159.00, "£/MWh", 161.20, "UK baseload", 1],
    ["Power", "Summer 2027", 105.70, "£/MWh", 109.00, null, 2],
    ["Power", "Winter 2027", 107.20, "£/MWh", 108.25, null, 3],
    ["Power", "Summer 2028", 71.00, "£/MWh", 71.00, null, 4],
    ["Power", "Winter 2028", 80.75, "£/MWh", 81.00, null, 5],
    ["Gas", "Winter 2026", 201.23, "p/therm", 207.50, "NBP", 6],
    ["Gas", "Summer 2027", 136.24, "p/therm", null, null, 7],
    ["Gas", "Summer 2028", 82.17, "p/therm", null, null, 8],
    ["Other", "UK gas storage", 68, "% full", null, "Germany c.56%", 9],
  ].forEach((v) => p.run(info.lastInsertRowid, ...v));
}

/* ---------------- FCT consortium book, from the 14 & 22 Sep 2026 position reports ---------------- */
function seedFctConsortium() {
  if (db.prepare("SELECT COUNT(*) c FROM flex_baskets WHERE code='FCT-FEC'").get().c > 0) return;
  const file = path.join(HERE, "seeds", "fct_position_14sep2026.json");
  if (!fs.existsSync(file)) return;
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const supplier = db.prepare("SELECT id FROM suppliers WHERE name LIKE '%Evolve%' LIMIT 1").get();
  const b = db.prepare(`INSERT INTO flex_baskets (name, code, basket_type, supplier_id, purchasing_strategy, index_reference,
      management_fee, contract_start, contract_end, report_date, market_commentary, member_message, status, common_end_date, manager_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'Active',?,?)`).run(
    "Flexible Energy Consortium", "FCT-FEC", "Framework / Consortium", supplier?.id ?? null,
    "Structured / Tranche", "Season Ahead", 2.5, "2024-10-01", "2031-03-31", "2026-09-22",
    "The Middle East supply shock (Strait of Hormuz disruption, the Saudi East-West pipeline attack and cuts to European crude allocations) has kept European gas near its highest since 2022, with UK storage below its five-year average. The premium sits on the near curve; Summer 2028 onward is comparatively cheap, which is where the desk is buying.",
    "The figures above are the track record behind our request to extend gas and electricity contracts to a common consortium end date of 31 March 2031. Extending keeps you inside this collective buying strategy: it is how Winter 2026 gas and power were both locked in well below today's market, and it lets us keep buying Summer 2028 and beyond, in pockets, ahead of the crowd on your behalf. It is a straightforward extension of your existing framework, on the same rates and terms, not a renegotiation.",
    "2031-03-31", "FCT Energy Partners",
  );
  const id = b.lastInsertRowid;
  importReportPayload(id, payload);

  // Power seasons as updated for the trades executed on 22 September 2026.
  const power22 = [
    ["Winter 2024", 94.51, 90.58, 0.76, 0.00], ["Summer 2025", 74.52, 73.17, 0.92, 0.00],
    ["Winter 2025", 83.53, 86.69, 1.24, 0.00], ["Summer 2026", 105.27, 72.32, 1.17, 0.00],
    ["Winter 2026", 159.00, 92.53, 1.66, 0.10], ["Summer 2027", 105.70, 73.07, 1.33, 0.09],
    ["Winter 2027", 107.20, 83.46, 1.48, 0.13], ["Summer 2028", 71.00, 66.70, 0.97, 0.27],
    ["Winter 2028", 80.75, 76.54, 0.82, 0.60], ["Summer 2029", 67.70, 68.74, 0.83, 0.58],
    ["Winter 2029", 75.75, 74.05, 0.71, 0.69], ["Summer 2030", 67.70, 68.67, 0.83, 0.56],
    ["Winter 2030", 75.75, 74.88, 0.60, 0.66],
  ];
  const up = db.prepare(`INSERT INTO flex_curve (basket_id, utility, period_type, label, sort_order, vol_req, traded, open, market, locked)
    VALUES (?, 'Power', 'season', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(basket_id, utility, period_type, label) DO UPDATE SET
      vol_req=excluded.vol_req, traded=excluded.traded, open=excluded.open, market=excluded.market, locked=excluded.locked`);
  const trades = db.prepare(`INSERT INTO flex_trades (basket_id, utility, trade_date, season_label, clip, price, live_market, hedged_before, hedged_after, rationale, confirmed_by)
    VALUES (?, 'Power', '2026-09-22', ?, ?, ?, ?, ?, ?, ?, 'Evolve (verbal)')`);
  const hist = db.prepare(`INSERT INTO flex_position_history (basket_id, utility, as_at, hedged_pct, locked_avg, market_avg, traded_total, open_total, required_total, note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    power22.forEach(([label, market, locked, traded, open], i) =>
      up.run(id, label, i, Math.round((traded + open) * 1000) / 1000, traded, open, market, locked));
    [
      ["Winter 2028", 0.20, 79.50, 79.66, 0.44, 0.58],
      ["Summer 2029", 0.20, 66.75, 67.70, 0.45, 0.59],
      ["Summer 2030", 0.32, 67.50, 67.70, 0.37, 0.60],
      ["Winter 2029", 0.20, 74.65, 75.75, 0.36, 0.51],
      ["Winter 2030", 0.30, 74.00, 75.75, 0.24, 0.48],
    ].forEach(([s, clip, price, mkt, before, after]) =>
      trades.run(id, s, clip, price, mkt, before, after, "Least-covered medium-dated season; bought below the live market."));
    hist.run(id, "Power", "2026-09-21", 0.712, 79.29, null, 12.10, 4.90, 17.00, "Position report 21 Sep 2026 (superseded)");
    hist.run(id, "Power", "2026-09-22", 0.784, 76.92, null, 13.32, 3.68, 17.00, "Updated for trades executed 22 Sep 2026");
  })();
  console.log("Seeded Flexible Energy Consortium position (gas 14 Sep, power 22 Sep 2026).");
}

/**
 * Load a position-report payload in the format the HTML snapshot embeds:
 * { gasMonthly, gasSeasonal, powerMonthly, powerSeasonal }, each row with
 * period|label, vol_req, traded, open, market, mtm. Exported for the import endpoint.
 */
export function importReportPayload(basketId, payload) {
  const up = db.prepare(`INSERT INTO flex_curve (basket_id, utility, period_type, label, sort_order, vol_req, traded, open, market, locked)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(basket_id, utility, period_type, label) DO UPDATE SET sort_order=excluded.sort_order,
      vol_req=excluded.vol_req, traded=excluded.traded, open=excluded.open, market=excluded.market, locked=excluded.locked`);
  let n = 0;
  const sets = [["Gas", "month", payload.gasMonthly], ["Gas", "season", payload.gasSeasonal],
                ["Power", "month", payload.powerMonthly], ["Power", "season", payload.powerSeasonal]];
  db.transaction(() => {
    for (const [utility, type, rows] of sets) {
      (rows || []).forEach((r, i) => {
        const traded = num(r.traded);
        const open = num(r.open);
        const volReq = num(r.vol_req) ?? (traded != null && open != null ? round3(traded + open) : null);
        // A zero locked price against traded volume is a source error, not a free trade.
        let locked = num(r.mtm ?? r.locked);
        if (!traded || locked === 0) locked = null;
        up.run(basketId, utility, type, r.period || r.label, i, volReq, traded, open, num(r.market), locked);
        n++;
      });
    }
  })();
  return n;
}
const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const round3 = (n) => Math.round(n * 1000) / 1000;

/* ---------------- P K Engineering comparison, v7 (16 Sep) and v9 (21 Sep) ---------------- */
export const FIXED_LABELS = ["Day Units", "Night Units", "Standing Charge", "Transmission Fixed Charge",
  "Distribution Fixed Charge", "Capacity Charge", "Excess Capacity Charge", "Reactive Capacity Charge",
  "Nuclear RAB Levy", "Network Charging Compensation", "Feed-in Tariff (FiT)"];

function seedPkComparison() {
  if (db.prepare("SELECT COUNT(*) c FROM fvf_comparisons WHERE account_ref='585895'").get().c > 0) return;
  const biz = db.prepare("SELECT id FROM businesses WHERE business_name LIKE '%K Engineering%' LIMIT 1").get();
  const basket = db.prepare("SELECT id FROM flex_baskets WHERE code='FCT-FEC'").get();
  const base = {
    business_id: biz?.id ?? null, client_name: "P K Engineering (West Bromwich) Ltd", account_ref: "585895",
    mpan: "14 1068 3260 003", site: "Unit 3, Kelvin Way, West Bromwich, B70 7TN", capacity_kva: 117, days: 365,
    ccl_p_kwh: 0.801, vat_pct: 20, flex_start: "2026-11-01", fixed_supplier: "Incumbent supplier",
    fixed_quote_ref: "3950517", fixed_quote_date: "2026-09-16", flex_supplier: "Evolve Energy Supply Limited",
    basket_id: basket?.id ?? null, current_contract_end: "2026-10-31", early_termination_pct: 60,
    prepared_by: "FCT Energy Partners", metering: "Half-hourly",
  };
  const ins = (c) => {
    const cols = Object.keys(c);
    return db.prepare(`INSERT INTO fvf_comparisons (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((k) => c[k])).lastInsertRowid;
  };
  const line = db.prepare(`INSERT INTO fvf_lines (comparison_id, scenario, year_no, year_label, label, basis, qty, rate, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const month = db.prepare("INSERT INTO fvf_monthly (comparison_id, month_label, sort_order, day_kwh, night_kwh) VALUES (?,?,?,?,?)");

  const build = (id, c, flexRates, nonComm, years, yearLabels) => {
    const fixedDay = [31.6354, 29.8372, 27.3692], fixedNight = [28.6944, 25.8342, 24.2942];
    const fixedStack = (y, day, night) => [
      ["Day Units", "p_kwh", c.day_kwh, day], ["Night Units", "p_kwh", c.night_kwh, night],
      ["Standing Charge", "p_day", null, 75], ["Transmission Fixed Charge", "p_day", null, 1151.184],
      ["Distribution Fixed Charge", "p_day", null, 219.77], ["Capacity Charge", "p_kva_day", 117, 10.66],
      ["Excess Capacity Charge", "p_kva_day", 0, 10.66], ["Reactive Capacity Charge", "p_kvarh", 0, 0.114],
      ["Nuclear RAB Levy", "p_kwh", c.annual_kwh, 0.5], ["Network Charging Compensation", "p_kwh", c.annual_kwh, 0.15],
      ["Feed-in Tariff (FiT)", "p_kwh", c.annual_kwh, 0.82],
    ];
    // The in-contract rates, from the breakdown document: only day/night differ.
    fixedStack(1, 22.95, 18.95).forEach(([l, b, q, r], o) => line.run(id, "Current", 1, "Current contract", l, b, q, r, o));
    for (let y = 1; y <= Math.min(3, years); y++) {
      fixedStack(y, fixedDay[y - 1], fixedNight[y - 1]).forEach(([l, b, q, r], o) => line.run(id, "Fixed", y, yearLabels[y - 1], l, b, q, r, o));
    }
    for (let y = 1; y <= years; y++) {
      [
        ["Commodity Cost", "p_kwh", c.annual_kwh, flexRates[y - 1]], ["Non-Commodity Cost", "p_kwh", c.annual_kwh, nonComm],
        ["Consortium Management Fee", "p_kwh", c.annual_kwh, 2.5], ["Supplier Management Fee", "p_kwh", c.annual_kwh, 0.5],
        ["Standing Charge", "p_day", null, 75], ["Transmission Fixed Charge", "p_day", null, 1151.184],
        ["Distribution Fixed Charge", "p_day", null, 219.77], ["HH DUoS Red", "p_kwh", c.duos_red_kwh, 5.471],
        ["HH DUoS Amber", "p_kwh", c.duos_amber_kwh, 0.509], ["HH DUoS Green", "p_kwh", c.duos_green_kwh, 0.028],
        ["Capacity Charge", "p_kva_day", 117, 10.66], ["Feed-in Tariff (FiT)", "p_kwh", c.annual_kwh, 0.82],
      ].forEach(([l, b, q, r], o) => line.run(id, "Flex", y, yearLabels[y - 1], l, b, q, r, o));
    }
  };

  db.transaction(() => {
    const v7 = {
      ...base, annual_kwh: 283809.36, day_kwh: 252952.81, night_kwh: 30856.55,
      duos_red_kwh: 26825.8, duos_amber_kwh: 190689.1, duos_green_kwh: 66294.46,
      version_label: "v7 — Board pack, 16 Sep 2026", status: "Issued", onboarding_fee: 250, flex_term_months: 53,
      flex_end: "2031-03-31", consumption_period: "12 months' half-hourly data",
      market_note: "Proposed flex start 1 Nov 2026 is the most volatile point for UK gas and power since 2022. Winter-26 gas was near 207.5p/therm and power near £166/MWh. The consortium's Winter 2026 hedge, around £89.80/MWh, sits roughly 44% below today's market of c.£160/MWh.",
      assumptions: JSON.stringify([
        "Fixed pricing is the supplier's new quote (Ref 3950517, 16 Sep 2026) with the £25/MWh management fee already built into the day/night unit rates.",
        "Flex pricing reflects the premium to join the consortium: new joiners receive the weighted-average purchase price built up over the preceding one to two years (Year 1 c.£77/MWh charged at 8.0p/kWh; Years 2–4 c.£70/MWh charged at 7.0p/kWh).",
        "Nuclear RAB Levy and Network Charging Compensation are itemised on the fixed side and bundled within the flex non-commodity cost.",
        "One-off onboarding admin fee of £250, payable on signing, not included in the annual figures.",
        "Early termination of the current fixed contract before 31/10/2026 costs 60% of the remaining contract value.",
      ]),
    };
    const labels4 = ["Year 1 (Nov 26 – Oct 27)", "Year 2 (Nov 27 – Oct 28)", "Year 3 (Nov 28 – Oct 29)", "Year 4 (Nov 29 – Oct 30)"];
    const id7 = ins(v7);
    build(id7, v7, [8, 7, 7, 7], 9.3, 4, labels4);

    const v9 = {
      ...base, annual_kwh: 285732.76, day_kwh: 255479.21, night_kwh: 30253.55,
      duos_red_kwh: 27007.6, duos_amber_kwh: 191981.42, duos_green_kwh: 66743.74,
      version_label: "v9 — signed agreement, 21 Sep 2026", status: "Won", parent_id: id7, flex_term_months: 36,
      flex_end: "2029-10-31", agreement_ref: "Flexi Nov26 36M", consumption_period: "Sep 2025 – Aug 2026 (365 days, half-hourly metered)",
      market_note: "The fixed renewal quote is priced into today's Gulf-driven price spike. Per the 21 Sep 2026 position report, Winter 2026 is 94% hedged at £92.60/MWh against a live market of £159.00/MWh.",
      assumptions: JSON.stringify([
        "Fixed pricing is the supplier's new quote (Ref 3950517, 16 Sep 2026) with the £25/MWh management fee already built into the day/night unit rates.",
        "Flex commodity 9.0p / 7.5p / 7.0p per kWh and non-commodity 9.4p per kWh are the consortium's confirmed pricing, reflecting its forward-hedged position. The actual monthly Final Energy Price follows the volume-weighted price achieved.",
        "Non-commodity bundles Nuclear RAB, Network Charging Compensation and other at-cost pass-throughs (BSUoS, RO, CM, CfD, AAHEDC, EII Support Levy, settlement, DA/DC, MOp, reactive power).",
        "Network and policy charges (standing, transmission, distribution, capacity, FiT) use the same quoted rates on both sides.",
        "Consumption is half-hourly data for MPAN 14 1068 3260 003, 1 Sep 2025 to 31 Aug 2026, cross-checked against invoiced monthly totals.",
        "Initial term to 31 Oct 2029, extending by 12-month periods only if further volume is purchased ahead of the next two trading seasons.",
        "Early termination of the current fixed contract before 31/10/2026 costs 60% of the remaining contract value.",
      ]),
    };
    const id9 = ins(v9);
    build(id9, v9, [9, 7.5, 7], 9.4, 3, labels4);
    [["Sep-25", 19397.2, 2189.1], ["Oct-25", 21034.6, 2177.9], ["Nov-25", 20760.2, 2640.5], ["Dec-25", 14530.2, 1552.7],
     ["Jan-26", 23785.6, 3109.1], ["Feb-26", 23735.9, 3744.7], ["Mar-26", 27551.31, 3758.05], ["Apr-26", 24458.3, 3802.4],
     ["May-26", 20722, 2709.3], ["Jun-26", 22130.5, 2147.6], ["Jul-26", 20268.5, 1401.9], ["Aug-26", 17104.9, 1020.3]]
      .forEach(([m, d, n], i) => month.run(id9, m, i, d, n));
  })();
  console.log("Seeded P K Engineering Fixed vs Flex comparisons (v7 and v9).");
}
