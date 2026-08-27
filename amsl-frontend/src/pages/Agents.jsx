import { useState, useEffect } from "react";
import { Plus, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useList, Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field, initials } from "../components/ui.jsx";

const STRUCTURES = ["Charity", "Government Funded", "LLP", "LTD", "Non-profit Making", "Partnership", "PLC", "Property Manager", "Private Limited Company", "Religious Institute", "Sole Trader", "Trust"];
const TRAINING = ["Industry Trained", "GDPR Compliant", "System Trained"];

export default function Agents() {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList("agents", { limit: 10 });
  const [showAdd, setShowAdd] = useState(false);
  return (
    <>
      <div className="page-head">
        <div><h1>Agents List</h1><p className="sub">Onboard and manage agents across your agencies.</p></div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Agent</button>
      </div>
      <Card>
        <input placeholder="Search agent, email…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", marginBottom: 12 }} />
        {error && <ErrorBanner error={error} onRetry={reload} />}
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Agent</th><th>Agency</th><th>Email</th><th>Role</th><th>Split</th><th>Aircall</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td><span className="mini"><span className="ini">{initials(r.name)}</span><span className="name">{r.name}</span></span></td>
                    <td>{r.agency_name || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.email}</td>
                    <td><Badge tone={r.role === "Admin" ? "indigo" : r.role === "Super User" ? "green" : "slate"}>{r.role}</Badge></td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.agent_split != null ? `${r.agent_split}%` : "—"}</td>
                    <td>{r.aircall_enabled ? <Badge tone="green">On</Badge> : <Badge tone="slate">Off</Badge>}</td>
                    <td><Badge tone="green">{r.status}</Badge></td>
                    <td><Link className="btn ghost sm" to={`/agents/${r.id}`} title="View agent"><Eye size={14} /> View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && <Pager meta={meta} page={page} setPage={setPage} />}
      </Card>
      {showAdd && <AddAgent onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); }} />}
    </>
  );
}

const Section = ({ title, children }) => (
  <div style={{ marginTop: 14 }}>
    <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", marginBottom: 8 }}>{title}</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>
  </div>
);

function AddAgent({ onClose, onSaved }) {
  const [agencies, setAgencies] = useState([]);
  const [f, setF] = useState({
    agency_id: "", trading_name: "", role: "Super User", status: "Active", email: "", password: "",
    business_structure: "", trading_account_no: "", vat_number: "", agency_split: "", agent_split: "",
    first_name: "", last_name: "", principal_name: "", office_website: "", telephone: "", mobile: "",
    address_line1: "", address_line2: "", city: "", county: "", postcode: "",
    bank_name: "", account_name: "", sort_code: "", account_no: "", training_status: "", notes: "", aircall_enabled: false,
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => { api.list("agencies", { limit: 200 }).then((r) => setAgencies(r.data)).catch(() => {}); }, []);

  const splitOk = (!f.agency_split && !f.agent_split) || (Number(f.agency_split || 0) + Number(f.agent_split || 0) === 100);

  const save = async () => {
    if (!f.first_name.trim()) return setErr("First Name is required");
    if (!f.email.trim()) return setErr("Login Email is required");
    if (!splitOk) return setErr("Agency Split + Agent Split must total 100%");
    setSaving(true); setErr(null);
    try {
      const name = `${f.first_name} ${f.last_name}`.trim();
      await api.post("/agents", {
        ...f, name,
        agency_id: f.agency_id || null,
        agency_split: f.agency_split ? Number(f.agency_split) : null,
        agent_split: f.agent_split ? Number(f.agent_split) : null,
        aircall_enabled: f.aircall_enabled ? 1 : 0,
      });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Add User Profile" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Submit"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <Section title="Agent Details">
        <Field label="Agency Name *">
          <select value={f.agency_id} onChange={set("agency_id")}>
            <option value="">Select Agency</option>
            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Trading Name"><input value={f.trading_name} onChange={set("trading_name")} /></Field>
        <Field label="User Role *">
          <select value={f.role} onChange={set("role")}><option>Super User</option><option>Sub User</option><option>Admin</option><option>Manager</option><option>Agent</option></select>
        </Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}><option>Active</option><option>Inactive</option></select></Field>
      </Section>
      <Section title="Login Details">
        <Field label="Login Email *"><input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Password *"><input type="password" value={f.password} onChange={set("password")} /></Field>
      </Section>
      <Section title="Identity & Splits">
        <Field label="Business Structure"><select value={f.business_structure} onChange={set("business_structure")}><option value="">Select</option>{STRUCTURES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Trading Account No"><input value={f.trading_account_no} onChange={set("trading_account_no")} /></Field>
        <Field label="VAT Number"><input value={f.vat_number} onChange={set("vat_number")} /></Field>
        <Field label={`Agency Split (%)${splitOk ? "" : " — total ≠ 100"}`}><input type="number" value={f.agency_split} onChange={set("agency_split")} /></Field>
        <Field label="Agent Split (%)"><input type="number" value={f.agent_split} onChange={set("agent_split")} /></Field>
      </Section>
      <Section title="Contact Information">
        <Field label="First Name *"><input value={f.first_name} onChange={set("first_name")} /></Field>
        <Field label="Last Name"><input value={f.last_name} onChange={set("last_name")} /></Field>
        <Field label="Principal Name"><input value={f.principal_name} onChange={set("principal_name")} /></Field>
        <Field label="Office Website"><input value={f.office_website} onChange={set("office_website")} /></Field>
        <Field label="Telephone"><input value={f.telephone} onChange={set("telephone")} /></Field>
        <Field label="Mobile"><input value={f.mobile} onChange={set("mobile")} /></Field>
      </Section>
      <Section title="Address Details">
        <Field label="Address Line 1"><input value={f.address_line1} onChange={set("address_line1")} /></Field>
        <Field label="Address Line 2"><input value={f.address_line2} onChange={set("address_line2")} /></Field>
        <Field label="City / Town"><input value={f.city} onChange={set("city")} /></Field>
        <Field label="County"><input value={f.county} onChange={set("county")} /></Field>
        <Field label="Postcode"><input value={f.postcode} onChange={set("postcode")} /></Field>
      </Section>
      <Section title="Banking Details">
        <Field label="Bank Name"><input value={f.bank_name} onChange={set("bank_name")} /></Field>
        <Field label="Account Name"><input value={f.account_name} onChange={set("account_name")} /></Field>
        <Field label="Sort Code"><input value={f.sort_code} onChange={set("sort_code")} /></Field>
        <Field label="Account No"><input value={f.account_no} onChange={set("account_no")} /></Field>
      </Section>
      <Section title="Training & Compliance">
        <Field label="Training Status"><select value={f.training_status} onChange={set("training_status")}><option value="">Select</option>{TRAINING.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Aircall"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, paddingTop: 6 }}><input type="checkbox" checked={f.aircall_enabled} onChange={set("aircall_enabled")} style={{ width: 16, height: 16, accentColor: "var(--brand,#0E7C7B)" }} /> Enable Aircall</label></Field>
      </Section>
      <Field label="Additional Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}
