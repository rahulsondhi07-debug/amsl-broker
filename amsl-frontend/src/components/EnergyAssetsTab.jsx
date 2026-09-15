import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, BatteryCharging, Plug, Sun, Zap, Moon } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "./ui.jsx";

const ICONS = {
  "Battery Storage": BatteryCharging,
  "EV Charge Point": Plug,
  "Solar PV": Sun,
};
// Only these assets can shift load into the night rate period, so the day/night tariff
// question is only relevant (and only shown) for them.
const DAY_NIGHT_RELEVANT = ["Battery Storage", "EV Charge Point"];
const num = (v) => (v === "" || v == null ? null : Number(v));

export default function EnergyAssetsTab({ businessId }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [cfg, setCfg] = useState({});

  const load = () => api.energyAssets(businessId).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  useEffect(load, [businessId]); // eslint-disable-line
  useEffect(() => {
    api.configLookups().then((c) => setCfg({
      types: (c.data["Energy Asset Type"] || []).map((x) => x.value),
      ownership: (c.data["Asset Ownership"] || []).map((x) => x.value),
      strategies: (c.data["Battery Charging Strategy"] || []).map((x) => x.value),
    })).catch(() => {});
  }, []);

  const del = async (row) => {
    if (!confirm(`Remove this ${row.asset_type} record?`)) return;
    try { await api.energyAssetDelete(row.id); load(); } catch (e) { alert(e.message); }
  };

  if (err) return <ErrorBanner error={err} onRetry={load} />;
  if (!rows) return <Spinner />;

  return (
    <Card title="Energy Assets" right={<button className="btn primary sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Asset</button>}>
      <p className="sub" style={{ fontSize: 12, marginBottom: 12 }}>
        On-site generation, storage and charging equipment. For batteries and EV chargers, the day/night flag records
        whether the site is on a dual-rate tariff — which is what makes overnight charging worth costing separately.
      </p>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr>
            <th>Asset</th><th>Make / Model</th><th>Rating</th><th>Qty</th>
            <th>Day/Night</th><th>Strategy</th><th>Ownership</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="state">No energy assets recorded — add one with "Add Asset".</td></tr>}
            {rows.map((a) => {
              const Icon = ICONS[a.asset_type] || Zap;
              const relevant = DAY_NIGHT_RELEVANT.includes(a.asset_type);
              return (
                <tr key={a.id}>
                  <td><span className="mini"><span className="ini sq"><Icon size={14} /></span><span className="name">{a.asset_type}</span></span></td>
                  <td style={{ fontSize: 12 }}>{[a.manufacturer, a.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {a.capacity_kw != null ? `${a.capacity_kw} kW` : ""}
                    {a.capacity_kw != null && a.capacity_kwh != null ? " / " : ""}
                    {a.capacity_kwh != null ? `${a.capacity_kwh} kWh` : ""}
                    {a.capacity_kw == null && a.capacity_kwh == null ? "—" : ""}
                  </td>
                  <td className="mono">{a.quantity ?? 1}</td>
                  <td>
                    {!relevant ? <span className="sub">n/a</span>
                      : Number(a.day_night_active)
                        ? <Badge tone="indigo"><Moon size={11} style={{ verticalAlign: "-1px", marginRight: 2 }} />Active</Badge>
                        : <Badge tone="slate">Single rate</Badge>}
                  </td>
                  <td style={{ fontSize: 12 }}>{a.charging_strategy || <span className="sub">—</span>}</td>
                  <td style={{ fontSize: 12 }}>{a.ownership || "—"}</td>
                  <td><Badge tone={a.status === "Active" ? "green" : a.status === "Planned" ? "amber" : "slate"}>{a.status}</Badge></td>
                  <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn ghost sm" onClick={() => setEditing(a)}><Pencil size={13} /></button>
                    <button className="btn ghost sm" onClick={() => del(a)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(showAdd || editing) && (
        <AssetModal businessId={businessId} asset={editing} cfg={cfg}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
    </Card>
  );
}

function AssetModal({ businessId, asset, cfg, onClose, onSaved }) {
  const [f, setF] = useState({
    asset_type: asset?.asset_type || "Battery Storage",
    manufacturer: asset?.manufacturer || "", model: asset?.model || "",
    capacity_kw: asset?.capacity_kw ?? "", capacity_kwh: asset?.capacity_kwh ?? "",
    quantity: asset?.quantity ?? 1, install_date: asset?.install_date || "",
    ownership: asset?.ownership || "", mpan: asset?.mpan || "",
    day_night_active: !!Number(asset?.day_night_active),
    charging_strategy: asset?.charging_strategy || "",
    export_capable: !!Number(asset?.export_capable),
    status: asset?.status || "Active", notes: asset?.notes || "",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const isBattery = f.asset_type === "Battery Storage";
  const relevant = DAY_NIGHT_RELEVANT.includes(f.asset_type);

  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      business_id: businessId, asset_type: f.asset_type,
      manufacturer: f.manufacturer || null, model: f.model || null,
      capacity_kw: num(f.capacity_kw), capacity_kwh: num(f.capacity_kwh),
      quantity: num(f.quantity) ?? 1, install_date: f.install_date || null,
      ownership: f.ownership || null, mpan: f.mpan || null,
      day_night_active: relevant && f.day_night_active ? 1 : 0,
      charging_strategy: relevant ? (f.charging_strategy || null) : null,
      export_capable: f.export_capable ? 1 : 0,
      status: f.status, notes: f.notes || null,
    };
    try {
      if (asset) await api.energyAssetUpdate(asset.id, body);
      else await api.energyAssetCreate(body);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={asset ? "Edit Energy Asset" : "Add Energy Asset"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Asset Type *">
          <select value={f.asset_type} onChange={set("asset_type")}>
            {(cfg.types || ["Battery Storage", "EV Charge Point", "Solar PV"]).map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={set("status")}>
            <option>Active</option><option>Planned</option><option>Decommissioned</option>
          </select>
        </Field>
        <Field label="Manufacturer"><input value={f.manufacturer} onChange={set("manufacturer")} placeholder="e.g. Tesla, Zappi, GivEnergy" /></Field>
        <Field label="Model"><input value={f.model} onChange={set("model")} /></Field>
        <Field label={isBattery ? "Power Rating (kW)" : "Rating (kW)"}>
          <input type="number" step="0.1" value={f.capacity_kw} onChange={set("capacity_kw")} placeholder={f.asset_type === "EV Charge Point" ? "e.g. 7.4 or 22" : ""} />
        </Field>
        {isBattery && <Field label="Storage Capacity (kWh)"><input type="number" step="0.1" value={f.capacity_kwh} onChange={set("capacity_kwh")} /></Field>}
        <Field label={f.asset_type === "EV Charge Point" ? "Number of Sockets" : "Quantity"}><input type="number" value={f.quantity} onChange={set("quantity")} /></Field>
        <Field label="Install Date"><input type="date" value={f.install_date} onChange={set("install_date")} /></Field>
        <Field label="Ownership">
          <select value={f.ownership} onChange={set("ownership")}>
            <option value="">Select…</option>
            {(cfg.ownership || []).map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="MPAN (if behind a specific meter)"><input value={f.mpan} onChange={set("mpan")} /></Field>
      </div>

      {relevant && (
        <div style={{ marginTop: 6, padding: "10px 12px", borderRadius: 8, background: "var(--subtle,#F8FAFC)", border: "1px solid var(--line,#E7EBF0)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={f.day_night_active} onChange={set("day_night_active")} style={{ width: 16, height: 16, accentColor: "var(--brand,#0E7C7B)" }} />
            Day/Night (dual-rate) tariff active on this supply
          </label>
          <div className="sub" style={{ fontSize: 11, marginTop: 4 }}>
            Tick this when the site is on an Economy 7 / dual-rate meter. It records that overnight charging is
            being priced at the night rate rather than a single flat rate.
          </div>
          {f.day_night_active && (
            <div style={{ marginTop: 10 }}>
              <Field label="Charging Strategy">
                <select value={f.charging_strategy} onChange={set("charging_strategy")}>
                  <option value="">Select…</option>
                  {(cfg.strategies || []).map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 10 }}>
        <input type="checkbox" checked={f.export_capable} onChange={set("export_capable")} style={{ width: 16, height: 16, accentColor: "var(--brand,#0E7C7B)" }} />
        Can export / discharge back to the grid
      </label>
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}
