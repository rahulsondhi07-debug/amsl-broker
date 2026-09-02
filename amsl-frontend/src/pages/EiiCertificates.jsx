import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");
const isActive = (start, end) => {
  const today = new Date().toISOString().slice(0, 10);
  return start <= today && end >= today;
};

const emptyForm = {
  certificate_number: "", business_name: "", company_number: "", date_of_issue: "",
  validity_start: "", validity_end: "", eligible_product: "", notes: "",
  meters: [{ msid: "", proportion_exempt_pct: 100 }],
};

export default function EiiCertificates() {
  const [certs, setCerts] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setErr(null);
    api.eiiCertificatesList().then((r) => setCerts(r.data)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const setMeter = (i, k) => (e) => {
    const v = e.target.value;
    setForm((f) => { const meters = [...f.meters]; meters[i] = { ...meters[i], [k]: v }; return { ...f, meters }; });
  };
  const addMeterRow = () => setForm((f) => ({ ...f, meters: [...f.meters, { msid: "", proportion_exempt_pct: 100 }] }));
  const removeMeterRow = (i) => setForm((f) => ({ ...f, meters: f.meters.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      await api.eiiCertificateCreate({
        ...form,
        meters: form.meters.filter((m) => m.msid.trim()).map((m) => ({ msid: m.msid.trim(), proportion_exempt_pct: Number(m.proportion_exempt_pct) || 100 })),
      });
      setShowAdd(false); setForm(emptyForm); load();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!confirm("Delete this EII certificate?")) return;
    await api.eiiCertificateDelete(id); load();
  };

  if (err && !certs) return <ErrorBanner error={err} onRetry={load} />;
  if (!certs) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>EII Certificates</h2>
          <p className="sub">Energy-Intensive Industries certificates from DBT — each covers one or more meters with a Proportion Exempt %, used to auto-fill EII relief in Bill Validation.</p>
        </div>
        <button className="btn primary" onClick={() => { setForm(emptyForm); setShowAdd(true); }}>
          <Plus size={16} /> Add Certificate
        </button>
      </div>

      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th>Certificate No.</th><th>Business</th><th>Meters (MSID → % Exempt)</th>
              <th>Eligible Product</th><th>Validity</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {certs.length === 0 && <tr><td colSpan={7} className="sub" style={{ padding: 20, textAlign: "center" }}>No certificates yet — add one with "Add Certificate".</td></tr>}
            {certs.map((c) => (
              <tr key={c.id}>
                <td>{c.certificate_number || "—"}</td>
                <td>{c.business_name}</td>
                <td>
                  {c.meters.map((m) => (
                    <div key={m.id} className="sub" style={{ fontSize: 12 }}>{m.msid} → <b>{m.proportion_exempt_pct}%</b></div>
                  ))}
                </td>
                <td className="sub" style={{ fontSize: 12 }}>{c.eligible_product || "—"}</td>
                <td className="sub" style={{ fontSize: 12 }}>{fmtDate(c.validity_start)} – {fmtDate(c.validity_end)}</td>
                <td><Badge tone={isActive(c.validity_start, c.validity_end) ? "green" : "slate"}>{isActive(c.validity_start, c.validity_end) ? "Active" : "Expired"}</Badge></td>
                <td><button className="btn ghost sm" onClick={() => remove(c.id)}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showAdd && (
        <Modal title="Add EII Certificate" onClose={() => setShowAdd(false)} wide
          footer={<>
            <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={saving || !form.business_name || !form.validity_start || !form.validity_end}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>}>
          <div className="grid cols-3">
            <Field label="Certificate number"><input placeholder="e.g. 6457-3" value={form.certificate_number} onChange={set("certificate_number")} /></Field>
            <Field label="Business name"><input value={form.business_name} onChange={set("business_name")} /></Field>
            <Field label="Company number"><input value={form.company_number} onChange={set("company_number")} /></Field>
            <Field label="Date of issue"><input type="date" value={form.date_of_issue} onChange={set("date_of_issue")} /></Field>
            <Field label="Validity start"><input type="date" value={form.validity_start} onChange={set("validity_start")} /></Field>
            <Field label="Validity end"><input type="date" value={form.validity_end} onChange={set("validity_end")} /></Field>
            <Field label="Eligible product"><input placeholder="e.g. 2453: casting of light metals" value={form.eligible_product} onChange={set("eligible_product")} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={set("notes")} /></Field>
          </div>

          <div className="form-section-title">Meters (MSID / MPAN) &amp; Proportion Exempt %</div>
          {form.meters.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 8 }}>
              <Field label="MSID / MPAN"><input value={m.msid} onChange={setMeter(i, "msid")} /></Field>
              <Field label="Proportion Exempt (%)"><input type="number" value={m.proportion_exempt_pct} onChange={setMeter(i, "proportion_exempt_pct")} /></Field>
              {form.meters.length > 1 && (
                <button className="btn ghost sm" onClick={() => removeMeterRow(i)}><Trash2 size={13} /></button>
              )}
            </div>
          ))}
          <button className="btn ghost sm" onClick={addMeterRow}><Plus size={13} /> Add meter</button>
        </Modal>
      )}
    </>
  );
}
