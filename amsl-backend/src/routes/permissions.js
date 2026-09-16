import { Router } from "express";
import { db, MENU_CATALOG, FEATURE_CATALOG, PERMISSION_GROUPS, FULL_ACCESS_ROLES } from "../db.js";

const r = Router();
const all = (sql, ...p) => db.prepare(sql).all(...p);
const ALL_KEYS = () => [...MENU_CATALOG.map((m) => m.key), ...FEATURE_CATALOG.map((f) => f.key)];
const isValidKey = (k) => ALL_KEYS().includes(k);

/* Menu catalog + all roles' current grants (for the admin grid) */
r.get("/", (_req, res) => {
  const roles = all("SELECT DISTINCT role FROM role_permissions").map((x) => x.role);
  const grants = {};
  for (const role of roles) grants[role] = all("SELECT menu_key FROM role_permissions WHERE role=?", role).map((x) => x.menu_key);
  res.json({
    data: {
      catalog: MENU_CATALOG, features: FEATURE_CATALOG, groups: PERMISSION_GROUPS,
      roles, grants, fullAccessRoles: FULL_ACCESS_ROLES,
    },
  });
});

/**
 * Resolve what a specific person can actually see.
 *
 * Layering, least specific to most specific:
 *   1. role grant           — the baseline for everyone with that role
 *   2. agency override      — applies to every agent in that agency
 *   3. agent override       — the individual, wins over everything
 *
 * An override can grant OR revoke (allowed = 1/0), because a role may hand out Compliance
 * broadly while one agency or agent needs it withheld. Admin and Super User bypass the
 * whole thing so an override can't lock an administrator out of their own settings.
 */
function effectiveFor({ role, agentId, agencyId }) {
  if (FULL_ACCESS_ROLES.includes(role)) return ALL_KEYS();

  const roleMenus = all("SELECT menu_key FROM role_permissions WHERE role=?", role).map((x) => x.menu_key);
  // Unknown role -> full access, so adding a role doesn't silently lock people out.
  const base = new Set(roleMenus.length ? roleMenus : ALL_KEYS());

  let resolvedAgencyId = agencyId;
  if (agentId && !resolvedAgencyId) {
    resolvedAgencyId = db.prepare("SELECT agency_id FROM agents WHERE id=?").get(agentId)?.agency_id ?? null;
  }

  const apply = (rows) => {
    for (const o of rows) {
      if (o.allowed) base.add(o.perm_key);
      else base.delete(o.perm_key);
    }
  };
  if (resolvedAgencyId) apply(all("SELECT perm_key, allowed FROM entity_permissions WHERE entity_type='agency' AND entity_id=?", resolvedAgencyId));
  if (agentId) apply(all("SELECT perm_key, allowed FROM entity_permissions WHERE entity_type='agent' AND entity_id=?", agentId));

  return [...base];
}

/* Effective keys for the nav / feature gating */
r.get("/effective", (req, res) => {
  const role = req.query.role || "";
  const agentId = req.query.agent_id ? Number(req.query.agent_id) : null;
  const agencyId = req.query.agency_id ? Number(req.query.agency_id) : null;
  res.json({ data: effectiveFor({ role, agentId, agencyId }) });
});

/* Replace a role's menu grants */
r.put("/:role", (req, res) => {
  const role = req.params.role;
  const menus = Array.isArray(req.body.menus) ? req.body.menus.filter(isValidKey) : [];
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM role_permissions WHERE role=?").run(role);
    const ins = db.prepare("INSERT OR IGNORE INTO role_permissions (role,menu_key) VALUES (?,?)");
    menus.forEach((m) => ins.run(role, m));
  });
  tx();
  res.json({ data: { role, menus } });
});

/* ---- Entity overrides (agencies and agents) ---- */

/**
 * The admin grid: every agency and agent, with their overrides and what they currently
 * resolve to. `effective` is what the grid ticks, so the checkbox reflects reality rather
 * than just whether an override row happens to exist.
 */
r.get("/entities", (req, res) => {
  const keys = req.query.keys ? String(req.query.keys).split(",").filter(isValidKey) : ALL_KEYS();
  const overrides = all("SELECT * FROM entity_permissions");
  const byEntity = (type, id) => {
    const o = {};
    for (const row of overrides) if (row.entity_type === type && row.entity_id === id) o[row.perm_key] = !!row.allowed;
    return o;
  };

  const agencies = all("SELECT id, name, status FROM agencies ORDER BY name").map((a) => {
    const eff = effectiveFor({ role: "Agent", agencyId: a.id });
    return {
      ...a, overrides: byEntity("agency", a.id),
      effective: Object.fromEntries(keys.map((k) => [k, eff.includes(k)])),
    };
  });
  const agents = all(`SELECT ag.id, ag.name, ag.email, ag.role, ag.status, ag.agency_id, a.name AS agency_name
                      FROM agents ag LEFT JOIN agencies a ON a.id = ag.agency_id ORDER BY ag.name`).map((ag) => {
    const eff = effectiveFor({ role: ag.role, agentId: ag.id, agencyId: ag.agency_id });
    return {
      ...ag, overrides: byEntity("agent", ag.id),
      full_access: FULL_ACCESS_ROLES.includes(ag.role),
      effective: Object.fromEntries(keys.map((k) => [k, eff.includes(k)])),
    };
  });
  res.json({ data: { agencies, agents, keys, groups: PERMISSION_GROUPS, catalog: MENU_CATALOG, features: FEATURE_CATALOG } });
});

/**
 * Set or clear one override.
 * allowed: true  -> explicitly grant
 * allowed: false -> explicitly revoke
 * allowed: null  -> remove the override and fall back to whatever the layer below says
 */
r.put("/entities/:type/:id", (req, res) => {
  const type = req.params.type;
  if (!["agency", "agent"].includes(type)) return res.status(400).json({ error: "type must be agency or agent" });
  const id = Number(req.params.id);
  const { perm_key, allowed } = req.body || {};
  if (!perm_key || !isValidKey(perm_key)) return res.status(400).json({ error: "A valid perm_key is required" });

  if (allowed === null || allowed === undefined) {
    db.prepare("DELETE FROM entity_permissions WHERE entity_type=? AND entity_id=? AND perm_key=?").run(type, id, perm_key);
  } else {
    db.prepare(`INSERT INTO entity_permissions (entity_type, entity_id, perm_key, allowed) VALUES (?,?,?,?)
                ON CONFLICT(entity_type, entity_id, perm_key) DO UPDATE SET allowed=excluded.allowed`)
      .run(type, id, perm_key, allowed ? 1 : 0);
  }
  const role = type === "agent" ? db.prepare("SELECT role FROM agents WHERE id=?").get(id)?.role : "Agent";
  const eff = effectiveFor({
    role: role || "Agent",
    agentId: type === "agent" ? id : null,
    agencyId: type === "agency" ? id : null,
  });
  res.json({ data: { entity_type: type, entity_id: id, perm_key, allowed, effective: eff } });
});

/** Apply a whole group (e.g. all of Compliance) to one entity in a single call. */
r.put("/entities/:type/:id/group", (req, res) => {
  const type = req.params.type;
  if (!["agency", "agent"].includes(type)) return res.status(400).json({ error: "type must be agency or agent" });
  const id = Number(req.params.id);
  const { group, allowed } = req.body || {};
  const g = PERMISSION_GROUPS.find((x) => x.name === group);
  if (!g) return res.status(400).json({ error: `Unknown group "${group}"` });

  const tx = db.transaction(() => {
    if (allowed === null || allowed === undefined) {
      const del = db.prepare("DELETE FROM entity_permissions WHERE entity_type=? AND entity_id=? AND perm_key=?");
      g.keys.forEach((k) => del.run(type, id, k));
    } else {
      const ins = db.prepare(`INSERT INTO entity_permissions (entity_type, entity_id, perm_key, allowed) VALUES (?,?,?,?)
                              ON CONFLICT(entity_type, entity_id, perm_key) DO UPDATE SET allowed=excluded.allowed`);
      g.keys.forEach((k) => ins.run(type, id, k, allowed ? 1 : 0));
    }
  });
  tx();
  res.json({ data: { entity_type: type, entity_id: id, group, allowed, keys: g.keys } });
});

export default r;
