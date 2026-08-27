import { Router } from "express";
import { db, MENU_CATALOG, FULL_ACCESS_ROLES } from "../db.js";

const r = Router();
const all = (sql, ...p) => db.prepare(sql).all(...p);

/* Menu catalog + all roles' current grants (for the admin grid) */
r.get("/", (_req, res) => {
  const roles = all("SELECT DISTINCT role FROM role_permissions").map((x) => x.role);
  const grants = {};
  for (const role of roles) grants[role] = all("SELECT menu_key FROM role_permissions WHERE role=?", role).map((x) => x.menu_key);
  res.json({ data: { catalog: MENU_CATALOG, roles, grants, fullAccessRoles: FULL_ACCESS_ROLES } });
});

/* Effective menu keys for a given role (used by the nav) */
r.get("/effective", (req, res) => {
  const role = req.query.role || "";
  if (FULL_ACCESS_ROLES.includes(role)) return res.json({ data: MENU_CATALOG.map((m) => m.key) });
  const menus = all("SELECT menu_key FROM role_permissions WHERE role=?", role).map((x) => x.menu_key);
  // unknown role -> full access fallback (so a new role isn't locked out)
  res.json({ data: menus.length ? menus : MENU_CATALOG.map((m) => m.key) });
});

/* Replace a role's menu grants */
r.put("/:role", (req, res) => {
  const role = req.params.role;
  const menus = Array.isArray(req.body.menus) ? req.body.menus.filter((m) => MENU_CATALOG.some((c) => c.key === m)) : [];
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM role_permissions WHERE role=?").run(role);
    const ins = db.prepare("INSERT OR IGNORE INTO role_permissions (role,menu_key) VALUES (?,?)");
    menus.forEach((m) => ins.run(role, m));
  });
  tx();
  res.json({ data: { role, menus } });
});

export default r;
