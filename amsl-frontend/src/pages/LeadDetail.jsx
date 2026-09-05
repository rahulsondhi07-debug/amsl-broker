import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, Zap, Flame } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, initials, Modal, Field } from "../components/ui.jsx";

const SEGMENTS = ["SME", "Corporate", "Domestic"];
const STATUSES = [{ v: "C", l: "Current" }, { v: "S", l: "Switching" }, { v: "D", l: "Dropped" }];

const TABS = [
  ["user", "User Detail"], ["site", "Site Address"], ["elec", "Electric Meter Detail"],
  ["gas", "Gas Meter Detail"], ["quote", "Quote"], ["callback", "Callback"], ["notes", "Notes"],
];

export default function LeadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("user");
  const [err, setErr] = useState(null);
  const [refs, setRefs] = useState({ agencies: [], agents: [], suppliers: [] });

  const load = useCallback(() => {
    api.pipelineDetail(id).then((r) => setDetail(r.data)).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    Promise.all([api.list("agencies", { limit: 200 }), api.list("agents", { limit: 200 }), api.list("suppliers", { limit: 300 })])
      .then(([a, ag, s]) => setRefs({ agencies: a.data, agents: ag.data, suppliers: s.data })).catch(() => {});
  }, []);

  if (err) return <ErrorBanner error={err} />;
  if (!detail) return <Spinner />;

  const firstElec = (detail.meters || []).find((m) => m.utility === "ELEC");

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}><ArrowLeft size={16} /></button>
          <span className="ini" style={{ width: 44, height: 44, borderRadius: 11, fontSize: 15 }}>{initials(detail.business_name)}</span>
          <div>
            <h1 style={{ margin: 0 }}>{detail.business_name}</h1>
            <p className="sub" style={{ margin: 0 }}>#{detail.ref}</p>
          </div>
        </div>
      </div>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16, fontSize: 12 }}>
          <div><div className="sub">Utility Category</div><b>{detail.fuel || "—"}</b></div>
          <div><div className="sub">Topline / MPAN</div><b className="mono">{firstElec?.mpan_mprn || "—"}</b></div>
          <div><div className="sub">Created By</div><b>{detail.agent_name || "—"}</b></div>
          <div><div className="sub">Agency</div><b>{detail.agency_name || "—"}</b></div>
          <div><div className="sub">Broker</div><b>{detail.agent_name || "—"}</b></div>
          <div><div className="sub">Created On</div><b>{detail.created_at?.slice(0, 10)}</b></div>
        </div>
      </Card>

      <div className="toggle" style={{ marginTop: 14, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(([k, label]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === "user" && <UserDetailTab detail={detail} refs={refs} onSaved={load} />}
      {tab === "site" && <SiteTab businessId={id} />}
      {tab === "elec" && <MeterTab businessId={id} utility="ELEC" icon={<Zap size={14} />} suppliers={refs.suppliers} />}
      {tab === "gas" && <MeterTab businessId={id} utility="GAS" icon={<Flame size={14} />} suppliers={refs.suppliers} />}
      {tab === "quote" && <QuoteTab businessId={id} />}
      {tab === "callback" && <CallbackTab businessId={id} />}
      {tab === "notes" && <NotesTab businessId={id} comments={detail.comments || []} onSaved={load} />}
    </>
  );
}

function UserDetailTab({ detail, refs, onSaved }) {
  const [f, setF] = useState({
    business_name: detail.business_name || "", contact_name: detail.contact_name || "",
    contact_email: detail.contact_email || "", contact_mobile: detail.contact_mobile || "",
    agency_id: detail.agency_id || "", agent_id: detail.agent_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.business_name.trim()) return setErr("Business name is required");
    setSaving(true); setErr(null);
    try { await api.put(`/leads/${detail.id}`, { ...f, agency_id: f.agency_id || null, agent_id: f.agent_id || null }); onSaved(); }
    catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <Card title="User Detail">
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2" style={{ marginBottom: 12 }}>
        <Field label="Business Name *"><input value={f.business_name} onChange={set("business_name")} /></Field>
        <Field label="Contact Name"><input value={f.contact_name} onChange={set("contact_name")} /></Field>
        <Field label="Email"><input value={f.contact_email} onChange={set("contact_email")} /></Field>
        <Field label="Mobile"><input value={f.contact_mobile} onChange={set("contact_mobile")} /></Field>
        <Field label="Agency">
          <select value={f.agency_id} onChange={set("agency_id")}><option value="">—</option>{refs.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        <Field label="Agent">
          <select value={f.agent_id} onChange={set("agent_id")}><option value="">—</option>{refs.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
      </div>
      <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
    </Card>
  );
}

function SiteTab({ businessId }) {
  const [sites, setSites] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const load = () => api.pipelineSites(businessId).then((r) => setSites(r.data)).catch(() => setSites([]));
  useEffect(load, [businessId]); // eslint-disable-line

  const del = async (s) => { if (!confirm(`Delete site "${s.name}"?`)) return; await api.pipelineDeleteSite(s.id); load(); };

  if (!sites) return <Spinner />;
  return (
    <Card title="Site Address" right={<button className="btn primary sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Site</button>}>
      <table className="tbl">
        <thead><tr><th>Name</th><th>Address</th><th>Region</th><th>Postcode</th><th></th></tr></thead>
        <tbody>
          {sites.length === 0 && <tr><td colSpan={5} className="sub" style={{ padding: 16, textAlign: "center" }}>No sites recorded — add one with "Add Site".</td></tr>}
          {sites.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td><td>{s.address || "—"}</td><td>{s.region || "—"}</td><td>{s.postcode || "—"}</td>
              <td>
                <button className="btn ghost sm" onClick={() => setEditing(s)}><Pencil size={13} /></button>
                <button className="btn ghost sm" onClick={() => del(s)}><Trash2 size={13} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(showAdd || editing) && (
        <SiteForm businessId={businessId} site={editing} onClose={() => { setShowAdd(false); setEditing(null); }} onSaved={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
    </Card>
  );
}

function SiteForm({ businessId, site, onClose, onSaved }) {
  const [f, setF] = useState({ name: site?.name || "Main Site", address: site?.address || "", region: site?.region || "", postcode: site?.postcode || "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setSaving(true);
    try { if (site) await api.pipelineUpdateSite(site.id, f); else await api.pipelineAddSite(businessId, f); onSaved(); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };
  return (
    <Modal title={site ? "Edit Site" : "Add Site"} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      <Field label="Site Name"><input value={f.name} onChange={set("name")} /></Field>
      <Field label="Address"><input value={f.address} onChange={set("address")} /></Field>
      <Field label="Region"><input value={f.region} onChange={set("region")} /></Field>
      <Field label="Postcode"><input value={f.postcode} onChange={set("postcode")} /></Field>
    </Modal>
  );
}

function MeterTab({ businessId, utility, icon, suppliers }) {
  const [meters, setMeters] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const load = () => api.pipelineMeters(businessId, utility).then((r) => setMeters(r.data)).catch(() => setMeters([]));
  useEffect(load, [businessId, utility]); // eslint-disable-line

  const del = async (m) => { if (!confirm("Delete this meter?")) return; await api.pipelineDeleteMeter(m.id); load(); };

  if (!meters) return <Spinner />;
  const label = utility === "ELEC" ? "Electricity" : "Gas";
  return (
    <Card title={`${label} Meter Detail`} right={<button className="btn primary sm" onClick={() => setShowAdd(true)}>{icon} Add {label} Meter</button>}>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Current Supplier</th><th>Transferring Supplier</th><th>Segment</th><th>Meter Name</th><th>MPAN/MPRN</th><th>EAC</th><th>Contract Start</th><th>Contract End</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {meters.length === 0 && <tr><td colSpan={10} className="sub" style={{ padding: 16, textAlign: "center" }}>No {label.toLowerCase()} meters yet.</td></tr>}
            {meters.map((m) => (
              <tr key={m.id}>
                <td>{m.current_supplier_name || "—"}</td><td>{m.transferring_supplier_name || "—"}</td>
                <td>{m.segment || "—"}</td><td>{m.name || "—"}</td><td className="mono">{m.mpan_mprn || "—"}</td>
                <td className="mono">{m.eac?.toLocaleString() || "—"}</td>
                <td className="mono">{m.contract_start || "—"}</td><td className="mono">{m.contract_end || "—"}</td>
                <td><Badge tone={m.status === "C" ? "green" : m.status === "S" ? "amber" : "slate"}>{STATUSES.find((s) => s.v === m.status)?.l || m.status}</Badge></td>
                <td>
                  <button className="btn ghost sm" onClick={() => setEditing(m)}><Pencil size={13} /></button>
                  <button className="btn ghost sm" onClick={() => del(m)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(showAdd || editing) && (
        <MeterForm businessId={businessId} utility={utility} meter={editing} suppliers={suppliers}
          onClose={() => { setShowAdd(false); setEditing(null); }} onSaved={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
    </Card>
  );
}

function MeterForm({ businessId, utility, meter, suppliers, onClose, onSaved }) {
  const [f, setF] = useState({
    name: meter?.name || "", mpan_mprn: meter?.mpan_mprn || "", eac: meter?.eac ?? "",
    segment: meter?.segment || "SME", current_supplier_id: meter?.current_supplier_id || "",
    transferring_supplier_id: meter?.transferring_supplier_id || "", contract_start: meter?.contract_start || "",
    contract_end: meter?.contract_end || "", status: meter?.status || "C",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setSaving(true);
    const payload = { ...f, eac: f.eac === "" ? null : Number(f.eac), current_supplier_id: f.current_supplier_id || null, transferring_supplier_id: f.transferring_supplier_id || null };
    try { if (meter) await api.pipelineUpdateMeter(meter.id, payload); else await api.pipelineAddMeter(businessId, { ...payload, utility }); onSaved(); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };
  return (
    <Modal title={meter ? "Edit Meter" : `Add ${utility === "ELEC" ? "Electricity" : "Gas"} Meter`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      <div className="grid cols-2">
        <Field label="Meter Name"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="MPAN / MPRN"><input value={f.mpan_mprn} onChange={set("mpan_mprn")} /></Field>
        <Field label="Current Supplier">
          <select value={f.current_supplier_id} onChange={set("current_supplier_id")}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Field>
        <Field label="Transferring Supplier">
          <select value={f.transferring_supplier_id} onChange={set("transferring_supplier_id")}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Field>
        <Field label="Segment"><select value={f.segment} onChange={set("segment")}>{SEGMENTS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="EAC (kWh/yr)"><input type="number" value={f.eac} onChange={set("eac")} /></Field>
        <Field label="Contract Start"><input type="date" value={f.contract_start} onChange={set("contract_start")} /></Field>
        <Field label="Contract End"><input type="date" value={f.contract_end} onChange={set("contract_end")} /></Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

function QuoteTab({ businessId }) {
  const [quotes, setQuotes] = useState(null);
  useEffect(() => { api.pipelineQuotes(businessId).then((r) => setQuotes(r.data)).catch(() => setQuotes([])); }, [businessId]);
  if (!quotes) return <Spinner />;
  return (
    <Card title="Quote">
      <table className="tbl">
        <thead><tr><th>Quote No</th><th>Utility</th><th>Supplier</th><th>Term</th><th>Unit Rate</th><th>Annual Cost</th><th>Status</th></tr></thead>
        <tbody>
          {quotes.length === 0 && <tr><td colSpan={7} className="sub" style={{ padding: 16, textAlign: "center" }}>No quotes yet for this lead.</td></tr>}
          {quotes.map((q) => (
            <tr key={q.id}>
              <td>{q.quote_no}</td><td>{q.utility}</td><td>{q.supplier_name || "—"}</td>
              <td>{q.term_months ? `${q.term_months}m` : "—"}</td><td>{q.unit_rate ? `${q.unit_rate}p` : "—"}</td>
              <td>{q.annual_cost ? `£${Number(q.annual_cost).toLocaleString()}` : "—"}</td>
              <td><Badge tone="indigo">{q.status || "Draft"}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function CallbackTab({ businessId }) {
  const [callbacks, setCallbacks] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const load = () => api.pipelineBusinessCallbacks(businessId).then((r) => setCallbacks(r.data)).catch(() => setCallbacks([]));
  useEffect(load, [businessId]); // eslint-disable-line

  const markDone = async (cb) => { await api.pipelineCallbackDone(cb.id); load(); };

  if (!callbacks) return <Spinner />;
  return (
    <Card title="Callback" right={<button className="btn primary sm" onClick={() => setShowAdd(true)}><Plus size={14} /> New Callback</button>}>
      <table className="tbl">
        <thead><tr><th>Due</th><th>Reason</th><th>Note</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {callbacks.length === 0 && <tr><td colSpan={5} className="sub" style={{ padding: 16, textAlign: "center" }}>No callbacks or scheduled calls found. Click "New Callback" to add one.</td></tr>}
          {callbacks.map((c) => (
            <tr key={c.id}>
              <td className="mono">{c.due_at}</td><td>{c.reason || "—"}</td><td>{c.note || "—"}</td>
              <td><Badge tone={c.done ? "green" : "amber"}>{c.done ? "Done" : "Scheduled"}</Badge></td>
              <td>{!c.done && <button className="btn ghost sm" onClick={() => markDone(c)}>Mark Done</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showAdd && <CallbackForm businessId={businessId} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </Card>
  );
}

function CallbackForm({ businessId, onClose, onSaved }) {
  const [dueAt, setDueAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!dueAt) return alert("Due date/time is required");
    setSaving(true);
    try { await api.pipelineCallback(businessId, dueAt, reason); onSaved(); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };
  return (
    <Modal title="New Callback" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Schedule"}</button></>}>
      <Field label="Due Date &amp; Time *"><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
      <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Requested callback, Send quote…" /></Field>
    </Modal>
  );
}

function NotesTab({ businessId, comments, onSaved }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try { await api.pipelineComment(businessId, body.trim()); setBody(""); onSaved(); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };
  return (
    <Card title="Notes">
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input style={{ flex: 1 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn primary sm" disabled={saving || !body.trim()} onClick={add}>Add</button>
      </div>
      {comments.length === 0 && <div className="sub" style={{ padding: 12, textAlign: "center" }}>No notes yet.</div>}
      {comments.map((c) => (
        <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line,#EEF1F4)" }}>
          <div style={{ fontSize: 13 }}>{c.body}</div>
          <div className="sub" style={{ fontSize: 11, marginTop: 2 }}>{c.author || "—"} · {c.created_at?.slice(0, 16).replace("T", " ")}</div>
        </div>
      ))}
    </Card>
  );
}
