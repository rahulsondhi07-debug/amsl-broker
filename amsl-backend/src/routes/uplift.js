import { Router } from "express";
import { db } from "../db.js";

const r = Router();

/* List all caps (grouped by provider/utility) */
r.get("/", (_req, res) => {
  res.json({ data: db.prepare("SELECT * FROM uplift_caps ORDER BY utility, min_consumption").all() });
});

/* Validate an uplift against the consumption band (V1.6-17)
   Body: { utility: 'ELEC'|'GAS', consumption: number, uplift: number } */
r.post("/validate", (req, res) => {
  const utility = String(req.body.utility || "").toUpperCase();
  const consumption = Number(req.body.consumption);
  const uplift = Number(req.body.uplift);
  if (!["ELEC", "GAS"].includes(utility) || !Number.isFinite(consumption)) {
    return res.status(400).json({ error: "utility and numeric consumption required" });
  }
  const cap = db.prepare(
    `SELECT * FROM uplift_caps WHERE utility=? AND ? BETWEEN min_consumption AND max_consumption
     ORDER BY min_consumption LIMIT 1`
  ).get(utility, consumption);
  if (!cap) return res.json({ data: { allowed: true, max: null, message: "No cap configured for this band." } });

  const allowed = !Number.isFinite(uplift) || uplift <= cap.max_uplift_p;
  res.json({
    data: {
      allowed,
      max: cap.max_uplift_p,
      band: `${cap.min_consumption.toLocaleString()}–${cap.max_consumption >= 999999999 ? "∞" : cap.max_consumption.toLocaleString()} kWh`,
      provider: cap.provider,
      message: allowed
        ? `Within the ${cap.provider} cap of ${cap.max_uplift_p}p for this band.`
        : `Uplift ${uplift}p exceeds the ${cap.provider} maximum of ${cap.max_uplift_p}p for this consumption band. Reduce to ${cap.max_uplift_p}p or below.`,
    },
  });
});

export default r;
