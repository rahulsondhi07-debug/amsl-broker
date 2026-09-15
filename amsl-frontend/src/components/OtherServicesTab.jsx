import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Download, Droplets, Trash, CreditCard, FileUp, Fuel } from "lucide-react";
import { api, API_BASE } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "./ui.jsx";

const SERVICE_TYPES = ["Water", "Waste", "Card Payment", "LPG"];

// Each service type's provider dropdown is admin-managed via System Settings, under the
// matching category below — the same generic add/edit/delete lookup mechanism every other
// dropdown in the app uses (Contract Stage, Payment Type, etc). Nothing is hardcoded here;
// adding/removing a provider is just editing that category in Settings.
const PROVIDER_CATEGORY = {
  Water: "Water Provider",
  Waste: "Waste Provider",
  "Card Payment": "Card Payment Provider",
  LPG: "LPG Provider",
};

const ICONS = { Water: Droplets, Waste: Trash, "Card Payment": CreditCard, LPG: Fuel };
const MAX_BILL_MB = 8;

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(new Error("Could not read the file"));
  r.readAsDataURL(file);
});

export default function OtherServicesTab({ businessId }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => api.otherServicesList(businessId).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  useEffect(load, [businessId]); // eslint-disable-line

  const del = async (row) => {
    if (!confirm(`Remove this ${row.service_type} service record?`)) return;
    try { await api.otherServiceDelete(row.id); load(); }
    catch (e) { alert(e.message); }
  };

  const daysLeft = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

  if (err) return <ErrorBanner error={err} onRetry={load} />;
  if (!rows) return <Spinner />;

  return (
    <Card title="Other Services" right={<button className="btn primary sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Service</button>}>
      <p className="sub" style={{ fontSize: 12, marginBottom: 12 }}>
        Non-energy and off-mains services for this customer — Water, Waste, Card Payment, and LPG — each with its own provider, contract end date, and an optional uploaded bill.
      </p>
      <table className="tbl">
        <thead><tr><th>Service</th><th>Provider</th><th>Contract End</th><th>Bill</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className="sub" style={{ padding: 16, textAlign: "center" }}>No other services recorded — add one with "Add Service".</td></tr>}
          {rows.map((row) => {
            const Icon = ICONS[row.service_type] || Droplets;
            const left = daysLeft(row.contract_end);
            return (
              <tr key={row.id}>
                <td><span className="mini"><span className="ini sq"><Icon size={14} /></span><span className="name">{row.service_type}</span></span></td>
                <td>{row.provider || "—"}</td>
                <td>
                  {row.contract_end ? new Date(row.contract_end).toLocaleDateString("en-GB") : "—"}
                  {left != null && left <= 30 && (
                    <span style={{ marginLeft: 6 }}><Badge tone={left < 0 ? "rose" : "amber"}>{left < 0 ? "Expired" : `${left}d left`}</Badge></span>
                  )}
                </td>
                <td>
                  {row.bill_filename
                    ? <a className="btn ghost sm" href={`${API_BASE}/other-services/${row.id}/bill`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Download size={13} /> {row.bill_filename}</a>
                    : <span className="sub">—</span>}
                </td>
                <td style={{ fontSize: 12, maxWidth: 220 }}>{row.notes || "—"}</td>
                <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button className="btn ghost sm" onClick={() => setEditing(row)}><Pencil size={13} /></button>
                  <button className="btn ghost sm" onClick={() => del(row)}><Trash2 size={13} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(showAdd || editing) && (
        <ServiceFormModal businessId={businessId} row={editing}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
    </Card>
  );
}

function ServiceFormModal({ businessId, row, onClose, onSaved }) {
  const [f, setF] = useState({
    service_type: row?.service_type || "Water",
    provider: row?.provider || "",
    contract_end: row?.contract_end || "",
    notes: row?.notes || "",
  });
  const [providerLists, setProviderLists] = useState(null); // { Water: [...], Waste: [...], "Card Payment": [...] }
  const [billFile, setBillFile] = useState(null); // { name, mime, data } once read
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    api.configLookups().then((cfg) => {
      const lists = {};
      for (const [type, category] of Object.entries(PROVIDER_CATEGORY)) {
        lists[type] = (cfg.data[category] || []).map((x) => x.value);
      }
      setProviderLists(lists);
    }).catch(() => setProviderLists({}));
  }, []);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BILL_MB * 1024 * 1024) { setErr(`File is too large — please keep bills under ${MAX_BILL_MB}MB`); e.target.value = ""; return; }
    setErr(null);
    try { setBillFile({ name: file.name, mime: file.type, data: await fileToBase64(file) }); }
    catch (e2) { setErr(e2.message); }
  };

  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      business_id: businessId, service_type: f.service_type, provider: f.provider || null,
      contract_end: f.contract_end || null, notes: f.notes || null,
      ...(billFile ? { bill_filename: billFile.name, bill_mime: billFile.mime, bill_data: billFile.data } : {}),
    };
    try {
      if (row) await api.otherServiceUpdate(row.id, body);
      else await api.otherServiceCreate(body);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const providerOptions = providerLists?.[f.service_type] || [];

  return (
    <Modal title={row ? "Edit Service" : "Add Service"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Service Type *">
          <select value={f.service_type} onChange={(e) => setF({ ...f, service_type: e.target.value, provider: "" })}>
            {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Provider">
          <select value={f.provider} onChange={set("provider")} disabled={!providerLists}>
            <option value="">{providerLists ? "Select provider…" : "Loading…"}</option>
            {providerOptions.map((p) => <option key={p}>{p}</option>)}
          </select>
          {providerLists && !providerOptions.length && (
            <div className="sub" style={{ fontSize: 11, marginTop: 4 }}>No {f.service_type} providers set up yet — add some in Settings → {PROVIDER_CATEGORY[f.service_type]}.</div>
          )}
        </Field>
        <Field label="Contract End Date"><input type="date" value={f.contract_end || ""} onChange={set("contract_end")} /></Field>
        <Field label="Upload Bill (xlsx, csv, pdf)">
          <label className="btn ghost sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", width: "fit-content" }}>
            <FileUp size={14} /> {billFile ? billFile.name : row?.bill_filename ? "Replace file…" : "Choose file…"}
            <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={onFile} style={{ display: "none" }} />
          </label>
        </Field>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}
