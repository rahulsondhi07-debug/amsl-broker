import { useState } from "react";
import { Plus, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useList, Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field, initials } from "../components/ui.jsx";

const STRUCTURES = ["Charity", "Government Funded", "LLP", "LTD", "Non-profit Making", "Partnership", "PLC", "Property Manager", "Private Limited Company", "Religious Institute", "Sole Trader", "Trust"];

export default function Agencies() {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList("agencies", { limit: 10 });
  const [showAdd, setShowAdd] = useState(false);

  return (
    <>
      <div className="page-head">
        <div><h1>Agencies</h1><p className="sub">Manage your registered agencies and agent counts.</p></div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Agency</button>
      </div>

      <Card>
        <input className="search" placeholder="Search agency, email, reg no…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", marginBottom: 12 }} />
        {error && <ErrorBanner error={error} onRetry={reload} />}
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Agency</th><th>Contact</th><th>Structure</th><th>Agents</th><th>White Label</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td><span className="mini"><span className="ini sq">{initials(r.name)}</span><span className="name">{r.name}</span></span>
                      {r.company_reg_no && <div className="sub" style={{ fontSize: 11 }}>Reg {r.company_reg_no}</div>}</td>
                    <td style={{ fontSize: 12 }}>{r.email || "—"}<div className="sub" style={{ fontSize: 11 }}>{r.phone || ""}</div></td>
                    <td style={{ fontSize: 12 }}>{r.business_structure || "—"}</td>
                    <td className="mono">{r.total_agents}</td>
                    <td>{Number(r.white_label) ? <Badge tone="indigo">On</Badge> : <span className="sub">—</span>}</td>
                    <td><Badge tone={r.status === "Active" || r.status === "ACTIVE" ? "green" : "amber"}>{r.status}</Badge></td>
                    <td><Link className="btn ghost sm" to={`/agencies/${r.id}`} title="View agency"><Eye size={14} /> View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && <Pager meta={meta} page={page} setPage={setPage} />}
      </Card>

      {showAdd && <AddAgency onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); }} />}
    </>
  );
}

function AddAgency({ onClose, onSaved }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", website: "", max_users: "", company_reg_no: "", business_structure: "", vat_no: "", address: "", white_label: false, status: "Active" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async () => {
    if (!f.name.trim()) return setErr("Agency Name is required");
    setSaving(true); setErr(null);
    try {
      await api.post("/agencies", { ...f, max_users: f.max_users ? Number(f.max_users) : null, white_label: f.white_label ? 1 : 0 });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Add Agency" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Submit"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Agency Name *"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Email Address"><input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Phone Number"><input value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Website URL"><input value={f.website} onChange={set("website")} placeholder="https://…" /></Field>
        <Field label="Maximum Users"><input type="number" value={f.max_users} onChange={set("max_users")} /></Field>
        <Field label="Company Reg No"><input value={f.company_reg_no} onChange={set("company_reg_no")} /></Field>
        <Field label="Business Structure">
          <select value={f.business_structure} onChange={set("business_structure")}>
            <option value="">Select Business Structure</option>
            {STRUCTURES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="VAT No"><input value={f.vat_no} onChange={set("vat_no")} /></Field>
        <Field label="Agency Status">
          <select value={f.status} onChange={set("status")}><option>Active</option><option>Inactive</option></select>
        </Field>
        <Field label="White Label">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, paddingTop: 6 }}>
            <input type="checkbox" checked={f.white_label} onChange={set("white_label")} style={{ width: 16, height: 16, accentColor: "var(--brand,#0E7C7B)" }} /> Enable white-label branding
          </label>
        </Field>
      </div>
      <Field label="Address"><textarea value={f.address} onChange={set("address")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
      <p className="sub" style={{ fontSize: 11, marginTop: 4 }}>Logo upload is available on the agency record after creation.</p>
    </Modal>
  );
}
