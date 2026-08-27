import { db } from "./db.js";

/* Populate the customer journey with realistic sample records across every stage,
   so the pipeline + dashboard cards have data to show. Idempotent: runs once. */
export function seedPipeline() {
  const marker = db.prepare("SELECT COUNT(*) c FROM businesses WHERE ref LIKE 'PJ-%'").get().c;
  if (marker > 0) return { skipped: true };

  const agencyIds = db.prepare("SELECT id FROM agencies").all().map((r) => r.id);
  const agentIds  = db.prepare("SELECT id FROM agents").all().map((r) => r.id);
  const supIds    = db.prepare("SELECT id FROM suppliers").all().map((r) => r.id);
  const pick = (a) => (a.length ? a[Math.floor(Math.random() * a.length)] : null);
  const daysFromNow = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

  // [business_name, contact, stage, fuel, contract_end]
  const rows = [
    ["Marker Business Ltd",      "Richard Simpson", "RAW_LEAD",           "GAS",  null],
    ["Broadstone Pharmacy",      "Harry Johal",     "RAW_LEAD",           "ELEC", null],
    ["Northgate Motors",         "D. Okafor",       "QUALIFIED",          "GAS",  null],
    ["Riverside Dental Ltd",     "Priya Shah",      "QUALIFIED",          "ELEC", null],
    ["Evergreen Pharmacy",       "Harry Johal",     "QUOTE_CREATED",      "DUAL", daysFromNow(24)],
    ["Beacon Care Homes",        "M. Ali",          "QUOTED",             "ELEC", daysFromNow(58)],
    ["Cobalt Logistics",         "S. Turner",       "QUOTED",             "GAS",  daysFromNow(72)],
    ["Aspen Hotels Group",       "L. Marsh",        "ESIGN_SENT",         "DUAL", daysFromNow(40)],
    ["Taylor & Son Building",    "J. Taylor",       "WON",                "ELEC", daysFromNow(365)],
    ["Willow Veterinary",        "K. Bright",       "WON",                "GAS",  daysFromNow(300)],
    ["Summit Fitness Ltd",       "R. Cole",         "UNDER_REGISTRATION", "ELEC", daysFromNow(21)],
    ["Harbour View Cafe",        "A. Rossi",        "UNDER_REGISTRATION", "DUAL", daysFromNow(410)],
    ["Rjr Chem Ltd",             "Shirish Patel",   "LIVE",               "ELEC", daysFromNow(500)],
    ["Meadow Foods",             "G. Hunt",         "LIVE",               "GAS",  daysFromNow(28)],
    ["Bluebird Nurseries",       "T. Frost",        "LIVE",               "DUAL", daysFromNow(19)],
    ["Ironworks Design",         "C. Mills",        "OBJECTED",           "ELEC", null],
    ["Pinnacle Recruitment",     "V. Reddy",        "LOST",               "GAS",  null],
    ["Oakfield Surgery",         "N. Dawson",       "UP_FOR_RENEWAL",     "ELEC", daysFromNow(12)],
    ["Station Road Garage",      "P. Green",        "UP_FOR_RENEWAL",     "GAS",  daysFromNow(9)],
    ["Crescent Chambers",        "E. Wood",         "RENEWED",            "DUAL", daysFromNow(720)],
  ];

  const insB = db.prepare(
    `INSERT INTO businesses (ref,business_name,contact_name,contact_email,contact_mobile,agency_id,agent_id,supplier_id,stage,journey_stage,fuel,contract_end,contract_start,stage_updated_at)
     VALUES (@ref,@name,@contact,@email,@mobile,@agency,@agent,@supplier,@legacy,@stage,@fuel,@end,@start,datetime('now'))`
  );
  const insC = db.prepare("INSERT INTO customer_comments (business_id,author,body,created_at) VALUES (?,?,?,datetime('now',?))");
  const insH = db.prepare("INSERT INTO stage_history (business_id,from_stage,to_stage,note,changed_by,changed_at) VALUES (?,?,?,?,?,datetime('now',?))");
  const insSite = db.prepare("INSERT INTO sites (business_id,name,address,region) VALUES (?,?,?,?)");
  const insMeter = db.prepare(
    `INSERT INTO meters (site_id,business_id,utility,mpan_mprn,eac,status,meter_type,standing_charge,unit_rate,day_rate,night_rate,ewe_rate,distribution_charge,transmission_charge,aq,last_read)
     VALUES (@site,@biz,@utility,@mpan,@eac,'C',@mtype,@sc,@ur,@day,@night,@ewe,@dist,@trans,@aq,@read)`
  );
  const REGIONS = ["West Midlands", "London", "Yorkshire", "North Western England", "Southern England", "Eastern England", "Southern Wales"];
  const legacyOf = (s) => (["RAW_LEAD", "QUALIFIED"].includes(s) ? "LEAD" : ["QUOTE_CREATED", "QUOTED", "ESIGN_SENT"].includes(s) ? "PROSPECT" : "CUSTOMER");

  const tx = db.transaction(() => {
    rows.forEach(([name, contact, stage, fuel, end], i) => {
      const supplier = ["WON", "UNDER_REGISTRATION", "LIVE", "UP_FOR_RENEWAL", "RENEWED"].includes(stage) ? pick(supIds) : null;
      const info = insB.run({
        ref: `PJ-${String(i + 1).padStart(3, "0")}`,
        name, contact,
        email: contact.toLowerCase().replace(/[^a-z]/g, ".") + "@example.co.uk",
        mobile: "07" + Math.floor(100000000 + Math.random() * 899999999),
        agency: pick(agencyIds), agent: pick(agentIds), supplier,
        legacy: legacyOf(stage), stage, fuel, end,
        start: ["LIVE","UP_FOR_RENEWAL","RENEWED"].includes(stage) ? daysFromNow(-200)
             : stage==="UNDER_REGISTRATION" ? daysFromNow(i%2===0 ? -2 : 25) : null,
      });
      const id = info.lastInsertRowid;
      insH.run(id, null, "RAW_LEAD", "Lead created", "System", "-3 days");
      if (stage !== "RAW_LEAD") insH.run(id, "RAW_LEAD", stage, "Progressed", "You", "-1 days");
      if (fuel && i % 2 === 0) insC.run(id, "You", stage === "UP_FOR_RENEWAL" ? "Renewal due soon — call to re-quote." : "Left voicemail, awaiting callback.", "-1 days");

      // V1.6-03: seed a site + utility-on-site meters for post-quote stages
      if (["WON", "UNDER_REGISTRATION", "LIVE", "UP_FOR_RENEWAL", "RENEWED"].includes(stage)) {
        const siteInfo = insSite.run(id, `${name} — Main Site`, `${10 + i} High Street`, pick(REGIONS));
        const siteId = siteInfo.lastInsertRowid;
        const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) * 100) / 100;
        if (fuel === "ELEC" || fuel === "DUAL") {
          const hh = i % 3 === 0;
          insMeter.run({
            site: siteId, biz: id, utility: "ELEC", mpan: "S" + (1000000000000 + Math.floor(Math.random() * 8e12)),
            eac: 20000 + i * 5000, mtype: hh ? "HH" : "NHH", sc: rnd(25, 45), ur: rnd(18, 28),
            day: rnd(20, 30), night: rnd(10, 16), ewe: rnd(0.5, 2),
            dist: hh ? rnd(1, 4) : null, trans: hh ? rnd(0.5, 2) : null, aq: null,
            read: daysFromNow(-14),
          });
        }
        if (fuel === "GAS" || fuel === "DUAL") {
          insMeter.run({
            site: siteId, biz: id, utility: "GAS", mpan: String(1000000 + Math.floor(Math.random() * 8e6)),
            eac: null, mtype: "SME", sc: rnd(20, 40), ur: rnd(5, 9),
            day: null, night: null, ewe: null, dist: null, trans: null, aq: 15000 + i * 4000,
            read: daysFromNow(-14),
          });
        }
      }
    });
  });
  tx();
  return { skipped: false, added: rows.length };
}
