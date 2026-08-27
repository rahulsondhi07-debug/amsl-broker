import { useState, useEffect } from "react";
import { Plus, Pencil, Eye } from "lucide-react";
import { api } from "../api.js";
import { useList, Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field } from "../components/ui.jsx";

const QUERY_TYPES = ["Billing", "Registration", "Objection", "General", "Complaint", "Partner Payments", "Meter Reading", "Change of Tenancy"];
const STATUSES = ["Open", "In Progress", "Awaiting Agency Feedback", "Awaiting Customer", "Resolved", "Closed"];
const UTILITIES = ["Electricity", "Gas", "Dual", "Water"];
const stTone = (s) => /open/i.test(s) ? "amber" : /progress/i.test(s) ? "indigo" : /resolv|closed/i.test(s) ? "green" : "slate";

export default function Tickets() {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList("tickets", { limit: 10 });
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  return (
    <>
      <div className="page-head">
        <div><h1>Ticket Management</h1><p className="sub">Raise and track customer support queries.</p></div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Ticket</button>
      </div>
      <Card>
        <input placeholder="Search business, query…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", marginBottom: 12 }} />
        {error && <ErrorBanner error={error} onRetry={reload} />}
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Query</th><th>Business</th><th>Agent</th><th>Utility</th><th>Type</th><th>Status</th><th>Raised</th><th></th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td><span className="name">{r.query_name}</span></td>
                    <td>{r.business_name || "—"}</td>
                    <td>{r.agent_name || "—"}</td>
                    <td>{r.utility || "—"}</td>
                    <td>{r.query_type || "—"}</td>
                    <td><Badge tone={stTone(r.status)}>{r.status}</Badge></td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.raised_date?.slice(0, 10)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn ghost sm" onClick={() => setViewing(r)} title="View ticket"><Eye size={13} /> View</button>
                      <button className="btn ghost sm" onClick={() => setEditing(r)} title="Edit ticket"><Pencil size={13} /> Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && <Pager meta={meta} page={page} setPage={setPage} />}
      </Card>
      {showAdd && <TicketForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); }} />}
      {editing && <TicketForm ticket={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {viewing && <TicketView ticket={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); }} />}
    </>
  );
}

function VRow({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "—"}</span>
    </div>
  );
}

function TicketView({ ticket: t, onClose, onEdit }) {
  return (
    <Modal title="View Ticket" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={onEdit}><Pencil size={14} /> Edit</button></>}>
      <div style={{ marginBottom: 10 }}><Badge tone={stTone(t.status)}>{t.status}</Badge></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
        <VRow k="Query Name" v={t.query_name} />
        <VRow k="Business Name" v={t.business_name} />
        <VRow k="Agency" v={t.agency_name} />
        <VRow k="Agent" v={t.agent_name} />
        <VRow k="Corporate / SME" v={t.corporate_sme} />
        <VRow k="Utility" v={t.utility} />
        <VRow k="Ticket Query" v={t.query_type} />
        <VRow k="Ticket Status" v={t.status} />
        <VRow k="Raised" v={t.raised_date?.slice(0, 10)} />
        <VRow k="Last Updated" v={t.last_updated?.slice(0, 10)} />
      </div>
      <div style={{ paddingTop: 12 }}>
        <div className="sub" style={{ fontSize: 12, marginBottom: 4 }}>Description</div>
        <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{t.description || "—"}</div>
      </div>
      {t.attachment && <div style={{ paddingTop: 10 }}><div className="sub" style={{ fontSize: 12 }}>Attachment</div><div style={{ fontSize: 13 }}>{t.attachment}</div></div>}
    </Modal>
  );
}

function TicketForm({ ticket, onClose, onSaved }) {
  const isEdit = !!ticket;
  const [refs, setRefs] = useState({ businesses: [], agencies: [], agents: [] });
  const [f, setF] = useState({
    query_name: ticket?.query_name || "", business_id: ticket?.business_id || "", business_name: ticket?.business_name || "",
    agency_id: ticket?.agency_id || "", agent_id: ticket?.agent_id || "", corporate_sme: ticket?.corporate_sme || "SME",
    utility: ticket?.utility || "Electricity", query_type: ticket?.query_type || "General", status: ticket?.status || "Open",
    description: ticket?.description || "",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    Promise.all([api.list("customers", { limit: 200 }), api.list("leads", { limit: 200 }), api.list("agencies", { limit: 200 }), api.list("agents", { limit: 200 })])
      .then(([c, l, ag, agt]) => setRefs({ businesses: [...c.data, ...l.data], agencies: ag.data, agents: agt.data })).catch(() => {});
  }, []);

  const agentsForAgency = f.agency_id ? refs.agents.filter((a) => String(a.agency_id) === String(f.agency_id)) : refs.agents;

  const save = async () => {
    if (!f.query_name.trim()) return setErr("Query Name is required");
    if (!f.business_id) return setErr("Business is required");
    setSaving(true); setErr(null);
    try {
      const biz = refs.businesses.find((b) => String(b.id) === String(f.business_id));
      const payload = { ...f, business_name: biz ? biz.business_name : f.business_name, business_id: f.business_id || null, agency_id: f.agency_id || null, agent_id: f.agent_id || null };
      if (isEdit) await api.put(`/tickets/${ticket.id}`, payload);
      else await api.post("/tickets", payload);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={isEdit ? "Edit Ticket" : "Add Ticket"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : isEdit ? "Update" : "Submit"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Query Name *"><input value={f.query_name} onChange={set("query_name")} /></Field>
        <Field label="Business Name *">
          <select value={f.business_id} onChange={set("business_id")}>
            <option value="">Select Business</option>
            {refs.businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name}</option>)}
          </select>
        </Field>
        <Field label="Agency *">
          <select value={f.agency_id} onChange={(e) => setF({ ...f, agency_id: e.target.value, agent_id: "" })}>
            <option value="">--- Select Agency ---</option>
            {refs.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Agent *">
          <select value={f.agent_id} onChange={set("agent_id")}>
            <option value="">{f.agency_id ? "Select Agent" : "Select Agency First"}</option>
            {agentsForAgency.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Corporate / SME *"><select value={f.corporate_sme} onChange={set("corporate_sme")}><option>SME</option><option>Corporate</option><option>Midmarket</option><option>Industrial</option></select></Field>
        <Field label="Utility *"><select value={f.utility} onChange={set("utility")}>{UTILITIES.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Ticket Query *"><select value={f.query_type} onChange={set("query_type")}>{QUERY_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Ticket Status *"><select value={f.status} onChange={set("status")}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <Field label="Description"><textarea value={f.description} onChange={set("description")} rows={3} placeholder="Enter description…" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
      <p className="sub" style={{ fontSize: 11, marginTop: 4 }}>Attachment upload is available on the ticket after creation.</p>
    </Modal>
  );
}
