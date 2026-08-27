import { useState, useEffect } from "react";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";

export default function Branding() {
  const [b, setB] = useState(null);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.branding().then((r) => setB(r.data)).catch((e) => setErr(e.message)); }, []);
  const upd = (k) => (e) => { setB({ ...b, [k]: e.target.value }); setSaved(false); };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await api.brandingSet(b); setB(r.data); setSaved(true);
      document.documentElement.style.setProperty("--brand", r.data.primary_color || "#0E7C7B");
      try { localStorage.setItem("amsl_brand", JSON.stringify(r.data)); } catch { /* ignore */ }
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  if (err && !b) return <ErrorBanner error={err} />;
  if (!b) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Branding &amp; White-Labelling</h1>
          <p className="sub">Customise how the portal is branded. Applied across the app for all users.</p>
        </div>
      </div>
      {err && <ErrorBanner error={err} />}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title="Branding settings">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Brand name
              <input value={b.brand_name || ""} onChange={upd("brand_name")} style={inp} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Primary colour
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={b.primary_color || "#0E7C7B"} onChange={upd("primary_color")} style={{ width: 46, height: 34, borderRadius: 8, border: "1px solid #E7EBF0", padding: 2 }} />
                <input value={b.primary_color || ""} onChange={upd("primary_color")} style={{ ...inp, flex: 1 }} />
              </div>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Logo URL
              <input value={b.logo_url || ""} onChange={upd("logo_url")} placeholder="https://…/logo.png" style={inp} />
            </label>
            <div>
              <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "Saved ✓" : "Save branding"}</button>
            </div>
          </div>
        </Card>

        <Card title="Preview">
          <div style={{ border: "1px solid #E7EBF0", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ background: b.primary_color || "#0E7C7B", color: "#fff", padding: "14px 16px", display: "flex", gap: 10, alignItems: "center" }}>
              {b.logo_url
                ? <img src={b.logo_url} alt="logo" style={{ height: 26, borderRadius: 4 }} onError={(e) => { e.target.style.display = "none"; }} />
                : <span style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.2)", display: "grid", placeItems: "center", fontWeight: 800 }}>{(b.brand_name || "AB").slice(0, 2).toUpperCase()}</span>}
              <strong>{b.brand_name || "AMSL Broker"}</strong>
            </div>
            <div style={{ padding: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Sample content</div>
              <button className="btn primary" style={{ background: b.primary_color || "#0E7C7B", borderColor: b.primary_color || "#0E7C7B" }}>Primary button</button>
            </div>
          </div>
          <p className="sub" style={{ fontSize: 11, marginTop: 8 }}>Per-agency white-labelling extends this by storing branding against each agency and resolving it at login.</p>
        </Card>
      </div>
    </>
  );
}

const inp = { width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #E7EBF0", fontSize: 13, fontWeight: 400 };
