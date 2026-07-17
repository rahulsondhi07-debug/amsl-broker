import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Zap, Flame } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field } from "../components/ui.jsx";

const money = (n) => Number(n).toFixed(2);
const EMPTY = { supplier_id: "", utility: "ELECTRICITY", term_months: 24, unit_rate: "", standing_charge: "", status: "Active" };

export default function Tariffs() {
  const [rows, setRows] = useState({ data: [], meta: {}, loading: true, error: null });
  const [page, setPage] = useState(1);
  const [utility, setUtility] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [editing, setEditing] = useState(null); // null | {} for new | row for edit
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setRows((s) => ({ ...s, loading: true }));
    api.list("tariffs", { page, limit: 15, utility })
      .then((r) => setRows({ data: r.data, meta: r.meta, loading: false, error: null }))
      .catch((e) => setRows({ data: [], meta: {}, loading: false, error: e.message }));
  }, [page, utility]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.list("suppliers", { limit: 200 }).then((r) => setSuppliers(r.data)).catch(() => {}); }, []);

  const remove = async (id) => {
    if (!confirm("Delete this tariff?")) return;
    setBusy(id);
    try { await api.del(`/tariffs/${id}`); load(); } catch (e) { alert(e.message); }
    setBusy(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Tariff Management</h2>
          <div className="desc">Maintain the supplier rates that power the energy comparison. Edits apply to new comparisons immediately.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="toggle">
            {[["", "All"], ["ELECTRICITY", "Electricity"], ["GAS", "Gas"]].map(([v, l]) => (
              <button key={l} className={utility === v ? "active" : ""} onClick={() => { setPage(1); setUtility(v); }}>{l}</button>
            ))}
          </div>
          <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}><Plus size={15} /> Add Tariff</button>
        </div>
      </div>

      <Card>
        {rows.loading ? <Spinner /> : rows.error ? <ErrorBanner error={rows.error} onRetry={load} /> : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Supplier</th><th>Utility</th><th>Term</th><th>Unit Rate (p/kWh)</th><th>Standing Charge (p/day)</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.data.map((t) => (
                    <tr key={t.id}>
                      <td><span className="mini"><span className="ini sq">{t.utility === "GAS" ? <Flame size={14} /> : <Zap size={14} />}</span><span className="name">{t.supplier_name}</span></span></td>
                      <td>{t.utility}</td>
                      <td>{t.term_months} m</td>
                      <td className="mono">{money(t.unit_rate)}</td>
                      <td className="mono">{money(t.standing_charge)}</td>
                      <td><Badge tone={t.status === "Active" ? "green" : "slate"}>{t.status}</Badge></td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button className="btn ghost sm" onClick={() => setEditing(t)}><Pencil size={14} /></button>
                          <button className="btn ghost sm danger" disabled={busy === t.id} onClick={() => remove(t.id)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!rows.data.length && <tr><td colSpan={7} className="state">No tariffs found.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager meta={rows.meta} page={page} setPage={setPage} />
          </>
        )}
      </Card>

      {editing && (
        <TariffModal tariff={editing} suppliers={suppliers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

function TariffModal({ tariff, suppliers, onClose, onSaved }) {
  const isEdit = !!tariff.id;
  const [form, setForm] = useState({
    supplier_id: tariff.supplier_id || "",
    utility: tariff.utility || "ELECTRICITY",
    term_months: tariff.term_months || 24,
    unit_rate: tariff.unit_rate ?? "",
    standing_charge: tariff.standing_charge ?? "",
    status: tariff.status || "Active",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.supplier_id) return setErr("Choose a supplier");
    if (form.unit_rate === "" || form.standing_charge === "") return setErr("Unit rate and standing charge are required");
    setSaving(true); setErr(null);
    const payload = {
      supplier_id: Number(form.supplier_id), utility: form.utility,
      term_months: Number(form.term_months), unit_rate: Number(form.unit_rate),
      standing_charge: Number(form.standing_charge), status: form.status,
    };
    try {
      if (isEdit) await api.put(`/tariffs/${tariff.id}`, payload);
      else await api.post("/tariffs", payload);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={isEdit ? "Edit Tariff" : "Add Tariff"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </>}>
      {err && <div className="error-banner">{err}</div>}
      <Field label="Supplier *">
        <select value={form.supplier_id} onChange={set("supplier_id")}>
          <option value="">— Select supplier —</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label="Utility">
          <select value={form.utility} onChange={set("utility")}>
            <option value="ELECTRICITY">Electricity</option>
            <option value="GAS">Gas</option>
          </select>
        </Field>
        <Field label="Term">
          <select value={form.term_months} onChange={set("term_months")}>
            <option value={12}>12 months</option>
            <option value={24}>24 months</option>
            <option value={36}>36 months</option>
          </select>
        </Field>
      </div>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label="Unit Rate (p/kWh) *"><input type="number" step="0.01" value={form.unit_rate} onChange={set("unit_rate")} placeholder="24.50" /></Field>
        <Field label="Standing Charge (p/day) *"><input type="number" step="0.01" value={form.standing_charge} onChange={set("standing_charge")} placeholder="42.00" /></Field>
      </div>
      <Field label="Status">
        <select value={form.status} onChange={set("status")}>
          <option>Active</option>
          <option>Inactive</option>
        </select>
      </Field>
    </Modal>
  );
}
