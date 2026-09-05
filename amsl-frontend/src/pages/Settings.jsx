import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Layers, Settings as SettingsIcon } from "lucide-react";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState(null);
  const [activeCat, setActiveCat] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [editing, setEditing] = useState(null); // { id, value }

  const load = () => {
    setErr(null);
    api.configLookups().then((r) => {
      setCfg(r.data);
      setActiveCat((prev) => prev && r.data[prev] ? prev : Object.keys(r.data)[0]);
    }).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []);

  const addValue = async () => {
    const value = newValue.trim();
    if (!value || !activeCat) return;
    try { await api.configAdd(activeCat, value); setNewValue(""); setShowAdd(false); load(); }
    catch (e) { setErr(e.message); }
  };
  const saveEdit = async () => {
    if (!editing || !editing.value.trim()) return;
    try { await api.configUpdate(editing.id, editing.value.trim()); setEditing(null); load(); }
    catch (e) { setErr(e.message); }
  };
  const del = async (id) => {
    if (!confirm("Delete this setting value?")) return;
    await api.configDelete(id); load();
  };

  if (err && !cfg) return <ErrorBanner error={err} onRetry={load} />;
  if (!cfg) return <Spinner />;

  const categories = Object.keys(cfg).sort();
  const items = activeCat ? cfg[activeCat] || [] : [];

  return (
    <>
      <div className="page-head">
        <div className="mini" style={{ gap: 12 }}>
          <span className="ini sq" style={{ background: "#EEF2FF", color: "#4F46E5" }}><SettingsIcon size={18} /></span>
          <div><h1>System Settings</h1><p className="sub">Manage your portal configurations and defaults</p></div>
        </div>
      </div>

      {err && <ErrorBanner error={err} />}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
        <Card title="Categories" className="settings-cat-card">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCat(cat)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "9px 10px", borderRadius: 8,
                  border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: activeCat === cat ? "#4F46E5" : "transparent",
                  color: activeCat === cat ? "#fff" : "#334155",
                }}>
                <Layers size={14} /> {cat}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>{activeCat} <span className="sub" style={{ fontWeight: 500 }}>({items.length})</span></h3>
            <button className="btn primary sm" onClick={() => { setNewValue(""); setShowAdd(true); }}><Plus size={14} /> Add New</button>
          </div>
          <table className="tbl">
            <thead><tr><th>Setting Name</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={2} className="sub" style={{ padding: 16, textAlign: "center" }}>No values yet — add one with "Add New".</td></tr>}
              {items.map((v) => (
                <tr key={v.id}>
                  <td>{v.value}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn ghost sm" onClick={() => setEditing({ id: v.id, value: v.value })}><Pencil size={13} /></button>
                    <button className="btn ghost sm" onClick={() => del(v.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {showAdd && (
        <Modal title={`Add ${activeCat}`} onClose={() => setShowAdd(false)}
          footer={<><button className="btn" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn primary" onClick={addValue}>Save</button></>}>
          <Field label="Setting name">
            <input value={newValue} onChange={(e) => setNewValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addValue()} autoFocus />
          </Field>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Setting" onClose={() => setEditing(null)}
          footer={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" onClick={saveEdit}>Save</button></>}>
          <Field label="Setting name">
            <input value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveEdit()} autoFocus />
          </Field>
        </Modal>
      )}
    </>
  );
}
