import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.js";

const r = Router();
const hash = (pw) => crypto.createHash("sha256").update(pw).digest("hex");

// Demo login: validates email + password against the agents table.
// NOTE: returns a stub token only. Swap sha256 for bcrypt and issue a real JWT
// before using anywhere near production.
r.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const user = db.prepare("SELECT id,name,email,role,agency_id,password_hash FROM agents WHERE email = ?").get(email);
  if (!user || user.password_hash !== hash(password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const { password_hash, ...safe } = user;
  const token = crypto.randomBytes(24).toString("hex"); // stub session token
  res.json({ data: { token, user: safe } });
});

r.get("/me", (req, res) => {
  // stub: identify by ?email for the demo
  const email = req.query.email;
  const user = email && db.prepare("SELECT id,name,email,role,agency_id FROM agents WHERE email=?").get(email);
  if (!user) return res.status(404).json({ error: "not found" });
  res.json({ data: user });
});

export default r;
