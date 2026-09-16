import { useState, useEffect, useCallback } from "react";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner, Badge } from "../components/ui.jsx";

export default function Permissions() {
  const [tab, setTab] = useState("roles");
  return (
    <>
      <div className="toggle" style={{ marginBottom: 14 }}>
        <button className={tab === "roles" ? "active" : ""} onClick={() => setTab("roles")}>By Role</button>
        <button className={tab === "entities" ? "active" : ""} onClick={() => setTab("entities")}>By Agency &amp; Agent</button>
      </div>
      {tab === "roles" ? <RolePermissions /> : <EntityPermissions />}
    </>
  );
}

/**
 * Per-agency and per-agent overrides for the grouped permissions (Compliance, Flexible
 * Purchasing). A tick here grants, an untick revokes — both are explicit overrides that
 * beat the role default, with agent beating agency.
 */
function EntityPermissions() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [scope, setScope] = useState("agencies");

  const load = useCallback(() => {
    api.permissionEntities().then((r) => { setData(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleGroup = async (type, row, group, on) => {
    setBusy(`${type}-${row.id}-${group.name}`);
    try { await api.permissionEntityGroup(type, row.id, group.name, on); load(); }
    catch (e) { setErr(e.message); }
    setBusy(null);
  };
  const clearGroup = async (type, row, group) => {
    setBusy(`${type}-${row.id}-${group.name}`);
    try { await api.permissionEntityGroup(type, row.id, group.name, null); load(); }
    catch (e) { setErr(e.message); }
    setBusy(null);
  };

  if (err && !data) return <ErrorBanner error={err} onRetry={load} />;
  if (!data) return <Spinner />;
  const { agencies, agents, groups } = data;
  const rows = scope === "agencies" ? agencies : agents;
  const type = scope === "agencies" ? "agency" : "agent";

  // A group is ticked when every key in it currently resolves to allowed.
  const groupOn = (row, g) => g.keys.every((k) => row.effective[k]);
  const groupPartial = (row, g) => !groupOn(row, g) && g.keys.some((k) => row.effective[k]);
  const hasOverride = (row, g) => g.keys.some((k) => k in (row.overrides || {}));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Agency &amp; Agent Permissions</h1>
          <p className="sub">Tick to grant, untick to revoke. These override the role default — an agent setting beats their agency, which beats the role.</p>
        </div>
      </div>
      {err && <ErrorBanner error={err} />}
      <Card>
        <div className="toggle" style={{ marginBottom: 12 }}>
          <button className={scope === "agencies" ? "active" : ""} onClick={() => setScope("agencies")}>Agencies ({agencies.length})</button>
          <button className={scope === "agents" ? "active" : ""} onClick={() => setScope("agents")}>Agents ({agents.length})</button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{scope === "agencies" ? "Agency" : "Agent"}</th>
                {groups.map((g) => <th key={g.name} style={{ textAlign: "center" }}>{g.name}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="name">{row.name}</span>
                    <div className="sub" style={{ fontSize: 11 }}>
                      {scope === "agents"
                        ? <>{row.email} · {row.role}{row.agency_name ? ` · ${row.agency_name}` : ""}</>
                        : <>{row.status}</>}
                    </div>
                  </td>
                  {groups.map((g) => {
                    const on = groupOn(row, g);
                    const partial = groupPartial(row, g);
                    const locked = scope === "agents" && row.full_access;
                    return (
                      <td key={g.name} style={{ textAlign: "center" }}>
                        {locked ? (
                          <span title={`${row.role} always has full access`}><Badge tone="indigo">all</Badge></span>
                        ) : (
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                            <input type="checkbox" checked={on}
                              ref={(el) => { if (el) el.indeterminate = partial; }}
                              disabled={busy === `${type}-${row.id}-${g.name}`}
                              onChange={(e) => toggleGroup(type, row, g, e.target.checked)}
                              style={{ width: 16, height: 16, accentColor: "var(--brand,#0E7C7B)" }} />
                            {hasOverride(row, g) && <span className="sub" style={{ fontSize: 10 }} title="Overriding the role default">override</span>}
                          </label>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "right" }}>
                    {groups.some((g) => hasOverride(row, g)) && !(scope === "agents" && row.full_access) && (
                      <button className="btn ghost sm" title="Remove overrides and fall back to the role default"
                        onClick={() => groups.forEach((g) => hasOverride(row, g) && clearGroup(type, row, g))}>
                        Reset to role
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ fontSize: 11.5, marginTop: 10 }}>
          A partially-filled box means some pages in that group are allowed and others aren't — ticking it grants the whole group.
        </p>
      </Card>
    </>
  );
}

function RolePermissions() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(null);
  const [savedRole, setSavedRole] = useState(null);

  const load = () => { setErr(null); api.permissions().then((r) => setData(r.data)).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, []);

  const toggle = (role, key) => {
    setData((d) => {
      const cur = new Set(d.grants[role] || []);
      cur.has(key) ? cur.delete(key) : cur.add(key);
      return { ...d, grants: { ...d.grants, [role]: [...cur] } };
    });
    setSavedRole(null);
  };
  const save = async (role) => {
    setSaving(role); setErr(null);
    try { await api.permissionsSet(role, data.grants[role] || []); setSavedRole(role); }
    catch (e) { setErr(e.message); }
    setSaving(null);
  };

  if (err && !data) return <ErrorBanner error={err} onRetry={load} />;
  if (!data) return <Spinner />;

  const { catalog, roles, grants, fullAccessRoles } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Menu Rights &amp; Permissions</h1>
          <p className="sub">Control which menus each role can access. Full-access roles ({fullAccessRoles.join(", ")}) always see everything.</p>
        </div>
      </div>
      {err && <ErrorBanner error={err} />}

      <Card>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Menu</th>
                {roles.map((role) => (
                  <th key={role} style={{ textAlign: "center" }}>
                    {role}
                    {fullAccessRoles.includes(role) && <div className="sub" style={{ fontSize: 10, fontWeight: 500 }}>full access</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog.map((m) => (
                <tr key={m.key}>
                  <td style={{ fontWeight: 600 }}>{m.label}</td>
                  {roles.map((role) => {
                    const full = fullAccessRoles.includes(role);
                    const on = full || (grants[role] || []).includes(m.key);
                    return (
                      <td key={role} style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={on} disabled={full}
                          onChange={() => toggle(role, m.key)}
                          style={{ width: 16, height: 16, accentColor: "#0E7C7B", cursor: full ? "not-allowed" : "pointer" }} />
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td></td>
                {roles.map((role) => (
                  <td key={role} style={{ textAlign: "center", paddingTop: 12 }}>
                    {!fullAccessRoles.includes(role) && (
                      <button className="btn primary sm" disabled={saving === role} onClick={() => save(role)}>
                        {saving === role ? "Saving…" : savedRole === role ? "Saved ✓" : "Save"}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <p className="sub" style={{ marginTop: 10, fontSize: 12 }}>Changes take effect when a user next loads the app. Users see only the menus granted to their role.</p>
    </>
  );
}
