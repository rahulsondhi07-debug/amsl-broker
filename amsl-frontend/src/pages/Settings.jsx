import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState(null);
  const [adding, setAdding] = useState({}); // category -> value being typed

  const load = () => { setErr(null); api.configLookups().then((r) => setCfg(r.data)).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, []);

  const add = async (cat) => {
    const value = (adding[cat] || "").trim(); if (!value) return;
    try { await api.configAdd(cat, value); setAdding({ ...adding, [cat]: "" }); load(); }
    catch (e) { setErr(e.message); }
  };
  const del = async (id) => { await api.configDelete(id); load(); };

  if (err && !cfg) return <ErrorBanner error={err} onRetry={load} />;
  if (!cfg) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div><h1>System Settings</h1><p className="sub">Manage the configurable lookups used across the platform.</p></div>
      </div>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {Object.entries(cfg).map(([cat, vals]) => (
          <Card key={cat} title={cat}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {vals.map((v) => (
                <span key={v.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--subtle,#F1F5F9)", borderRadius: 7, padding: "4px 8px", fontSize: 12, fontWeight: 600 }}>
                  {v.value}
                  <button onClick={() => del(v.id)} style={{ border: 0, background: "none", cursor: "pointer", color: "#94A3B8", padding: 0, display: "flex" }}><Trash2 size={12} /></button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={adding[cat] || ""} onChange={(e) => setAdding({ ...adding, [cat]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && add(cat)} placeholder="Add value…"
                style={{ flex: 1, padding: "6px 9px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontSize: 12 }} />
              <button className="btn ghost sm" onClick={() => add(cat)}><Plus size={13} /></button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
