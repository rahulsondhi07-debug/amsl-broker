import crypto from "crypto";
import { fileURLToPath } from "url";
import { db, initSchema } from "./db.js";

const hash = (pw) => crypto.createHash("sha256").update(pw).digest("hex");

export function seed({ reset = false } = {}) {
  initSchema();

  if (reset) {
    db.exec(`DELETE FROM tickets; DELETE FROM supplier_payments; DELETE FROM contracts;
             DELETE FROM quotes; DELETE FROM meters; DELETE FROM sites; DELETE FROM businesses;
             DELETE FROM price_matrix; DELETE FROM products; DELETE FROM suppliers;
             DELETE FROM agents; DELETE FROM agencies;`);
    db.exec(`DELETE FROM sqlite_sequence;`);
  }

  const already = db.prepare("SELECT COUNT(*) c FROM agencies").get().c;
  if (already && !reset) return { skipped: true };

  const insAgency = db.prepare("INSERT INTO agencies (name, status) VALUES (?, 'Active')");
  const agencyId = {};
  for (const n of ["Azentra Technologies", "linked", "AMSL broker portal"]) agencyId[n] = insAgency.run(n).lastInsertRowid;

  const insAgent = db.prepare(
    `INSERT INTO agents (name, agency_id, email, role, status, aircall_enabled, password_hash)
     VALUES (@name,@agency_id,@email,@role,'Active',@aircall,@ph)`);
  const agentId = {};
  for (const a of [
    { name: "Lawrence Nadar", agency: "Azentra Technologies", email: "lawrence.nadar@azentratech.com", role: "Super User", aircall: 1, pw: "changeme" },
    { name: "rahul son", agency: "linked", email: "rahul@linkedenergy.co.uk", role: "Super User", aircall: 0, pw: "changeme" },
    { name: "Admin Broker Portal", agency: "AMSL broker portal", email: "admin@brokerportal.com", role: "Admin", aircall: 1, pw: "admin123" },
  ]) agentId[a.name] = insAgent.run({ name: a.name, agency_id: agencyId[a.agency], email: a.email, role: a.role, aircall: a.aircall, ph: hash(a.pw) }).lastInsertRowid;

  const SUPPLIERS = [
    "BES Utilities","British Gas (BGB)","British Gas Business","British Gas Lite (BGL)","Brook Green Supply","Bryt Energy",
    "Bulb Energy for Business","Clear Buisness","CNG Energy","Corona Energy","Drax Energy Solutions","Dual Energy / Pozitive Energy",
    "Ecotricity Business","EDF","EDF Energy Business","Engie","E.ON Energy / E.ON Next Business","E.ON Next","Extra Energy",
    "First Utility (legacy)","Gazprom Energy","Good Energy Business","Haven Power","Hudson Energy","npower Business Solutions",
    "Octopus Energy for Business","Opus Energy","Pozitive Energy","Scottish Power","ScottishPower Business","Shell Energy UK Business",
    "Smartest Energy","SmartestEnergy Business","SSE","SSE Energy Solutions","Tem Energy","Total Gas & Power / TotalEnergies Gas & Power",
    "United Gas & Power","Utilita Energy","Valda Energy","Yorkshire Gas & Power","Yu Energy","Yü Energy",
  ];
  const commissioned = { "Clear Buisness": [2, 0.1, 2, 0.1], "Corona Energy": [2, 0.1, 2, 0.1] };
  const insSupplier = db.prepare(
    `INSERT INTO suppliers (name, max_broker_comm_electric, broker_comm_inc_electric, max_broker_comm_gas, broker_comm_inc_gas, status)
     VALUES (@name,@me,@ie,@mg,@ig,'Active')`);
  const supplierId = {};
  for (const name of SUPPLIERS) { const [me, ie, mg, ig] = commissioned[name] || [0, 0, 0, 0]; supplierId[name] = insSupplier.run({ name, me, ie, mg, ig }).lastInsertRowid; }

  const insProduct = db.prepare(
    `INSERT INTO products (name, supplier_id, utility, segment, acq_renewal, valid_from, valid_till, status)
     VALUES (@name,@sid,'NHH','SME',@ar,@vf,@vt,'Active')`);
  for (const p of [
    { name: "Corona Energy Product", supplier: "Corona Energy", ar: "Acquisition & Renewal", vf: "2026-05-01", vt: "2026-05-31" },
    { name: "Clear Bisiness Product", supplier: "Clear Buisness", ar: "Acquisition & Renewal", vf: "2026-05-01", vt: "2026-05-31" },
    { name: "Gazprom Product", supplier: "Gazprom Energy", ar: "Acquisition & Renewal", vf: "2026-05-01", vt: "2026-05-31" },
    { name: "Scottish Power Renewal Product", supplier: "Scottish Power", ar: "Renewal", vf: "2026-05-01", vt: "2026-05-31" },
    { name: "Smartest Energy Product", supplier: "Smartest Energy", ar: "Acquisition & Renewal", vf: "2026-05-01", vt: "2025-05-31" },
  ]) insProduct.run({ name: p.name, sid: supplierId[p.supplier], ar: p.ar, vf: p.vf, vt: p.vt });

  const insBiz = db.prepare(
    `INSERT INTO businesses (ref, business_name, contact_name, contact_email, contact_mobile, agency_id, agent_id, stage, created_at)
     VALUES (@ref,@bn,@cn,@ce,@cm,@ag,@at,@stage,@created)`);
  const insSite = db.prepare("INSERT INTO sites (business_id, name, region) VALUES (?,?,?)");
  const insMeter = db.prepare("INSERT INTO meters (site_id, business_id, utility, mpan_mprn, eac, status) VALUES (?,?,?,?,?,?)");
  function biz(o) {
    const id = insBiz.run({ ref: o.ref, bn: o.name, cn: o.contact || null, ce: o.email || null, cm: o.mobile || null, ag: agencyId[o.agency], at: agentId[o.agent], stage: o.stage, created: o.created }).lastInsertRowid;
    const siteId = insSite.run(id, o.name + " Site", o.region || "West Midlands").lastInsertRowid;
    for (const mt of o.meters || []) insMeter.run(siteId, id, mt.u, mt.n || null, mt.eac || null, mt.s || "C");
    return id;
  }
  biz({ ref: "d8a9ec43", name: "test1", agency: "AMSL broker portal", agent: "Admin Broker Portal", stage: "LEAD", created: "2026-07-13", region: "West Midlands", meters: [{ u: "ELEC", s: "S", eac: 30000 }] });
  biz({ ref: "9d4127ac", name: "test1", agency: "AMSL broker portal", agent: "Admin Broker Portal", stage: "LEAD", created: "2026-07-13", region: "London", meters: [{ u: "GAS", s: "S", eac: 20000 }] });
  biz({ ref: "529a7b2d", name: "rich son", contact: "rich son", mobile: "+447415212833", agency: "linked", agent: "rahul son", stage: "LEAD", created: "2026-06-01", region: "London" });
  biz({ ref: "e8370d4e", name: "test1", contact: "Test Test", mobile: "+919638028505", agency: "AMSL broker portal", agent: "Admin Broker Portal", stage: "LEAD", created: "2026-05-29", region: "London", meters: [{ u: "ELEC", s: "S", eac: 25000 }, { u: "ELEC", s: "C", eac: 25000 }] });
  biz({ ref: "e8856009", name: "Pizza Hut", agency: "AMSL broker portal", agent: "Admin Broker Portal", stage: "LEAD", created: "2026-05-18", region: "London", meters: [{ u: "ELEC", s: "S", eac: 40000 }] });
  biz({ ref: "a1b2c3d4", name: "Pizza Hut", agency: "AMSL broker portal", agent: "Admin Broker Portal", stage: "LEAD", created: "2026-05-18", region: "London", meters: [{ u: "GAS", s: "S", eac: 40000 }] });
  biz({ ref: "c1000001", name: "Rjr Chem Ltd", contact: "John Doe", agency: "Azentra Technologies", agent: "Lawrence Nadar", stage: "CUSTOMER", created: "2026-07-10", region: "West Midlands", meters: [{ u: "ELEC", s: "S", eac: 23444 }] });
  biz({ ref: "c1000002", name: "Test Business", agency: "AMSL broker portal", agent: "Admin Broker Portal", stage: "CUSTOMER", created: "2026-06-11", region: "London", meters: [{ u: "ELEC", s: "S", eac: 30000 }] });
  biz({ ref: "c1000003", name: "test1", agency: "AMSL broker portal", agent: "Admin Broker Portal", stage: "CUSTOMER", created: "2026-05-29", region: "London", meters: [{ u: "ELEC", s: "S", eac: 30000 }] });
  biz({ ref: "c1000004", name: "joes", contact: "trert etery", email: "richrahulson@gmail.com", agency: "AMSL broker portal", agent: "Admin Broker Portal", stage: "CUSTOMER", created: "2026-05-18", region: "London" });

  const bizByName = (n) => db.prepare("SELECT id FROM businesses WHERE business_name = ? ORDER BY id LIMIT 1").get(n)?.id;

  const insQuote = db.prepare(
    `INSERT INTO quotes (quote_no, business_id, business_name, agent_id, utility, meter_number, eac, start_date, status, created_at)
     VALUES (@no,@bid,@bn,@aid,@u,@mn,@eac,@sd,@st,@created)`);
  const visibleQuotes = [
    { no: 32, bn: "test1", agent: "Admin Broker Portal", u: "Electricity", mn: "14768767686", created: "2026-07-13", st: "Quote Requested" },
    { no: 31, bn: "test1", agent: "Admin Broker Portal", u: "Electricity", mn: "33464654", created: "2026-07-13", st: "Quote Requested" },
    { no: 30, bn: "test1", agent: "Admin Broker Portal", u: "Electricity", mn: "33464654", created: "2026-07-13", st: "Quote Requested" },
    { no: 29, bn: "test1", agent: "Admin Broker Portal", u: "Gas", mn: "33464654", created: "2026-07-13", st: "Quote Requested" },
    { no: 28, bn: "test1", agent: "Admin Broker Portal", u: "Gas", mn: "33464654", created: "2026-07-13", st: "Quote Requested" },
    { no: 27, bn: "test1", agent: "Admin Broker Portal", u: "Gas", mn: "33464654", created: "2026-07-13", st: "Quote Requested" },
    { no: 26, bn: "Rjr Chem Ltd", agent: "Lawrence Nadar", u: "Electricity", mn: "1418094351005", created: "2026-07-10", st: "Quote Accepted" },
    { no: 25, bn: "test1", agent: "Admin Broker Portal", u: "Electricity", mn: "1012345678901", created: "2026-06-25", st: "Quote Requested" },
    { no: 24, bn: "test1", agent: "Admin Broker Portal", u: "Electricity", mn: "676787679689", created: "2026-06-11", st: "Quote Requested" },
    { no: 23, bn: "ffds", agent: "Admin Broker Portal", u: "Electricity", mn: "1012345678901", created: "2026-05-30", st: "Quote Accepted" },
  ];
  for (const q of visibleQuotes) insQuote.run({ no: `QT-${q.no}`, bid: bizByName(q.bn) || null, bn: q.bn, aid: agentId[q.agent], u: q.u, mn: q.mn, eac: 30000, sd: q.created, st: q.st, created: q.created });
  for (let n = 22; n >= 1; n--) {
    const u = n % 2 ? "Electricity" : "Gas";
    const st = n === 5 || n === 12 ? "Quote Accepted" : "Quote Requested";
    const created = `2026-0${1 + (n % 5)}-${String(5 + (n % 20)).padStart(2, "0")}`;
    insQuote.run({ no: `QT-${n}`, bid: null, bn: "test1", aid: agentId["Admin Broker Portal"], u, mn: String(1000000000000 + n), eac: 25000, sd: created, st, created });
  }

  const insContract = db.prepare(
    `INSERT INTO contracts (contract_no, business_id, business_name, supplier_id, agency_id, agent_id, term_months, meter_mpan_mpr, utility, segment, consumption, commission_value, status, created_at)
     VALUES (@no,@bid,@bn,@sid,@agid,@aid,@term,@meter,@u,'SME',@cons,@comm,@st,@created)`);
  for (const c of [
    { no: "CN-01", bn: "test1", sup: "Clear Buisness", agency: "AMSL broker portal", agent: "Admin Broker Portal", term: 12, meter: "1476876768653", cons: 30000, comm: 180.0, st: "Contract Sent to Client", created: "2026-05-20" },
    { no: "CN-02", bn: "test1", sup: "Clear Buisness", agency: "AMSL broker portal", agent: "Admin Broker Portal", term: 12, meter: "1476876768653", cons: 30000, comm: 180.0, st: "Contract Sent to Client", created: "2026-05-22" },
    { no: "CN-03", bn: "Ann Bird", sup: "Smartest Energy", agency: "AMSL broker portal", agent: "Admin Broker Portal", term: 12, meter: "1785245444454", cons: 35000, comm: 700.0, st: "Contract Sent to Client", created: "2026-06-02" },
    { no: "CN-06", bn: "Rjr Chem Ltd", sup: "Clear Buisness", agency: "Azentra Technologies", agent: "Lawrence Nadar", term: 36, meter: "1418094351005", cons: 23444, comm: 180.0, st: "Contract Sent to Client", created: "2026-07-08" },
    { no: "CN-07", bn: "Rjr Chem Ltd", sup: "Smartest Energy", agency: "Azentra Technologies", agent: "Lawrence Nadar", term: 24, meter: "1418094351005", cons: 23444, comm: 468.88, st: "Contract Accepted", created: "2026-07-10" },
  ]) insContract.run({ no: c.no, bid: bizByName(c.bn) || null, bn: c.bn, sid: supplierId[c.sup], agid: agencyId[c.agency], aid: agentId[c.agent], term: c.term, meter: c.meter, u: "ELECTRICITY", cons: c.cons, comm: c.comm, st: c.st, created: c.created });

  /* ---------------- tariffs (power the energy comparison) ---------------- */
  const COMPARE = [
    "British Gas Business", "EDF Energy Business", "E.ON Next", "Scottish Power",
    "SSE Energy Solutions", "Smartest Energy", "Opus Energy", "Yu Energy",
    "Valda Energy", "Clear Buisness", "Corona Energy", "Gazprom Energy",
    "Pozitive Energy", "Total Gas & Power / TotalEnergies Gas & Power",
  ];
  const stableOffset = (name) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997; return h / 997; }; // 0..1
  const round2 = (n) => Math.round(n * 100) / 100;
  const insTariff = db.prepare(
    `INSERT INTO tariffs (supplier_id, utility, term_months, unit_rate, standing_charge, status)
     VALUES (?,?,?,?,?,'Active')`);
  for (const name of COMPARE) {
    const sid = supplierId[name];
    if (!sid) continue;
    const o = stableOffset(name);
    for (const utility of ["ELECTRICITY", "GAS"]) {
      const baseUnit = utility === "ELECTRICITY" ? 22.4 + o * 4.2 : 6.1 + o * 1.7;
      const baseSC = utility === "ELECTRICITY" ? 38 + o * 12 : 27 + o * 9;
      for (const term of [12, 24, 36]) {
        const termAdj = term === 12 ? 0.7 : term === 24 ? 0 : -0.45;
        const scAdj = term === 12 ? 1.5 : term === 36 ? -2 : 0;
        insTariff.run(sid, utility, term, round2(baseUnit + termAdj), round2(baseSC + scAdj));
      }
    }
  }

  const counts = {};
  for (const t of ["agencies","agents","suppliers","products","businesses","sites","meters","quotes","contracts","tariffs"]) counts[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  return { skipped: false, counts };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = seed({ reset: process.argv.includes("--reset") });
  if (result.skipped) console.log("Database already seeded. Run with --reset to rebuild.");
  else { console.log("Seed complete:"); for (const [k, v] of Object.entries(result.counts)) console.log(`  ${k.padEnd(12)} ${v}`); }
  process.exit(0);
}
