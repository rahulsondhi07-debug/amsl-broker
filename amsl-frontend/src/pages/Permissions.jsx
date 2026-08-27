import { useState, useEffect } from "react";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";

export default function Permissions() {
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
