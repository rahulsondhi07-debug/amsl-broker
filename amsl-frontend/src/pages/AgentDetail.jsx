import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, initials, Modal, Field } from "../components/ui.jsx";

const STRUCTURES = ["Charity", "Government Funded", "LLP", "LTD", "Non-profit Making", "Partnership", "PLC", "Property Manager", "Private Limited Company", "Religious Institute", "Sole Trader", "Trust"];

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "N/A"}</span>
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [a, setA] = useState(null);
  const [tab, setTab] = useState("profile");
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = () => {
    api.list("agents", { limit: 500 }).then((r) => {
      const found = r.data.find((x) => String(x.id) === String(id));
      if (found) setA(found); else setErr("Agent not found");
    }).catch((e) => setErr(e.message));
  };
  useEffect(load, [id]); // eslint-disable-line

  if (err) return <ErrorBanner error={err} />;
  if (!a) return <Spinner />;

  const tabs = [["profile", "Profile & Role"], ["contact", "Contact & Address"], ["banking", "Banking"], ["compliance", "Compliance & Notes"]];

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}><ArrowLeft size={16} /></button>
          <span className="ini" style={{ width: 44, height: 44, borderRadius: 11, fontSize: 15 }}>{initials(a.name)}</span>
          <div>
            <h1 style={{ margin: 0 }}>{a.name} <Badge tone={a.role === "Super User" ? "green" : a.role === "Admin" ? "indigo" : "slate"}>{a.role}</Badge></h1>
            <p className="sub" style={{ margin: 0 }}>{a.agency_name || "—"} · {a.email}</p>
          </div>
        </div>
        <button className="btn primary" onClick={() => setEditing(true)}><Pencil size={14} /> Edit Profile</button>
      </div>

      <div className="toggle" style={{ marginBottom: 14 }}>
        {tabs.map(([k, label]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === "profile" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <Card title="Agent Details">
            <Row k="Full Name" v={a.name} /><Row k="Trading Name" v={a.trading_name} />
            <Row k="Principal Name" v={a.principal_name} /><Row k="Agency" v={a.agency_name} />
            <Row k="Role" v={a.role} /><Row k="Status" v={a.status} />
            <Row k="Aircall" v={a.aircall_enabled ? "Enabled" : "Off"} />
          </Card>
          <Card title="Identity & Splits">
            <Row k="Business Structure" v={a.business_structure} /><Row k="Trading Account No" v={a.trading_account_no} />
            <Row k="VAT Number" v={a.vat_number} />
            <Row k="Agency Split" v={a.agency_split != null ? `${a.agency_split}%` : null} />
            <Row k="Agent Split" v={a.agent_split != null ? `${a.agent_split}%` : null} />
          </Card>
        </div>
      )}

      {tab === "contact" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <Card title="Contact">
            <Row k="Business Email" v={a.email} /><Row k="Office Website" v={a.office_website} />
            <Row k="Telephone" v={a.telephone} /><Row k="Mobile" v={a.mobile} />
          </Card>
          <Card title="Address">
            <Row k="Address Line 1" v={a.address_line1} /><Row k="Address Line 2" v={a.address_line2} />
            <Row k="City / Town" v={a.city} /><Row k="County" v={a.county} /><Row k="Postcode" v={a.postcode} />
          </Card>
        </div>
      )}

      {tab === "banking" && (
        <Card title="Banking Details">
          <Row k="Bank Name" v={a.bank_name} /><Row k="Account Name" v={a.account_name} />
          <Row k="Sort Code" v={a.sort_code} /><Row k="Account No" v={a.account_no} />
        </Card>
      )}

      {tab === "compliance" && (
        <Card title="Training & Compliance">
          <Row k="Training Status" v={a.training_status} />
          <div style={{ paddingTop: 10 }}>
            <div className="sub" style={{ fontSize: 12, marginBottom: 4 }}>Additional Notes</div>
            <div style={{ fontSize: 13 }}>{a.notes || "—"}</div>
          </div>
        </Card>
      )}

      {editing && <EditAgent agent={a} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </>
  );
}

function EditAgent({ agent, onClose, onSaved }) {
  const [f, setF] = useState({
    name: agent.name || "", trading_name: agent.trading_name || "", role: agent.role || "Super User", status: agent.status || "Active",
    email: agent.email || "", business_structure: agent.business_structure || "", trading_account_no: agent.trading_account_no || "",
    vat_number: agent.vat_number || "", agency_split: agent.agency_split ?? "", agent_split: agent.agent_split ?? "",
    principal_name: agent.principal_name || "", office_website: agent.office_website || "", telephone: agent.telephone || "", mobile: agent.mobile || "",
    address_line1: agent.address_line1 || "", address_line2: agent.address_line2 || "", city: agent.city || "", county: agent.county || "", postcode: agent.postcode || "",
    bank_name: agent.bank_name || "", account_name: agent.account_name || "", sort_code: agent.sort_code || "", account_no: agent.account_no || "",
    training_status: agent.training_status || "", notes: agent.notes || "", aircall_enabled: !!agent.aircall_enabled,
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const splitOk = (!f.agency_split && !f.agent_split) || (Number(f.agency_split || 0) + Number(f.agent_split || 0) === 100);

  const save = async () => {
    if (!f.name.trim()) return setErr("Full Name is required");
    if (!splitOk) return setErr("Agency Split + Agent Split must total 100%");
    setSaving(true); setErr(null);
    try {
      await api.put(`/agents/${agent.id}`, {
        ...f,
        agency_split: f.agency_split !== "" ? Number(f.agency_split) : null,
        agent_split: f.agent_split !== "" ? Number(f.agent_split) : null,
        aircall_enabled: f.aircall_enabled ? 1 : 0,
      });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Edit Profile" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Full Name *"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Trading Name"><input value={f.trading_name} onChange={set("trading_name")} /></Field>
        <Field label="User Role *">
          <select value={f.role} onChange={set("role")}><option>Super User</option><option>Sub User</option><option>Admin</option><option>Manager</option><option>Agent</option></select>
        </Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}><option>Active</option><option>Inactive</option></select></Field>
        <Field label="Business Structure">
          <select value={f.business_structure} onChange={set("business_structure")}><option value="">Select</option>{STRUCTURES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Trading Account No"><input value={f.trading_account_no} onChange={set("trading_account_no")} /></Field>
        <Field label="VAT Number"><input value={f.vat_number} onChange={set("vat_number")} /></Field>
        <Field label={`Agency Split (%)${splitOk ? "" : " — total ≠ 100"}`}><input type="number" value={f.agency_split} onChange={set("agency_split")} /></Field>
        <Field label="Agent Split (%)"><input type="number" value={f.agent_split} onChange={set("agent_split")} /></Field>
        <Field label="Principal Name"><input value={f.principal_name} onChange={set("principal_name")} /></Field>
        <Field label="Office Website"><input value={f.office_website} onChange={set("office_website")} /></Field>
        <Field label="Telephone"><input value={f.telephone} onChange={set("telephone")} /></Field>
        <Field label="Mobile"><input value={f.mobile} onChange={set("mobile")} /></Field>
        <Field label="Address Line 1"><input value={f.address_line1} onChange={set("address_line1")} /></Field>
        <Field label="Address Line 2"><input value={f.address_line2} onChange={set("address_line2")} /></Field>
        <Field label="City / Town"><input value={f.city} onChange={set("city")} /></Field>
        <Field label="County"><input value={f.county} onChange={set("county")} /></Field>
        <Field label="Postcode"><input value={f.postcode} onChange={set("postcode")} /></Field>
        <Field label="Bank Name"><input value={f.bank_name} onChange={set("bank_name")} /></Field>
        <Field label="Account Name"><input value={f.account_name} onChange={set("account_name")} /></Field>
        <Field label="Sort Code"><input value={f.sort_code} onChange={set("sort_code")} /></Field>
        <Field label="Account No"><input value={f.account_no} onChange={set("account_no")} /></Field>
        <Field label="Aircall">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, paddingTop: 6 }}>
            <input type="checkbox" checked={f.aircall_enabled} onChange={set("aircall_enabled")} style={{ width: 16, height: 16 }} /> Enable Aircall
          </label>
        </Field>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}
