import { useState, useEffect } from "react";
import { Plus, ArrowRightLeft, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { useList, Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field } from "./ui.jsx";

const csd = (c, s, d) => `${c} | ${s} | ${d}`;

export default function BusinessTable({ resource, title, desc, isLead }) {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList(resource, { limit: 10 });
  const [showAdd, setShowAdd] = useState(false);
  const [refs, setRefs] = useState({ agencies: [], agents: [] });
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    Promise.all([api.list("agencies", { limit: 100 }), api.list("agents", { limit: 100 })])
      .then(([a, ag]) => setRefs({ agencies: a.data, agents: ag.data }))
      .catch(() => {});
  }, []);

  const convert = async (id) => { setBusy(id); try { await api.post(`/${resource}/${id}/convert`); reload(); } catch (e) { alert(e.message); } setBusy(null); };
  const remove = async (id) => { if (!confirm("Delete this record?")) return; setBusy(id); try { await api.del(`/${resource}/${id}`); reload(); } catch (e) { alert(e.message); } setBusy(null); };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{title}</h2>
          <div className="desc">{desc}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="search" style={{ maxWidth: 220 }}>
            <input placeholder="Search…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} style={{ paddingLeft: 12 }} />
          </div>
          <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> {isLead ? "Add Lead" : "Add Customer"}</button>
        </div>
      </div>

      <Card>
        {loading ? <Spinner /> : error ? <ErrorBanner error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Business</th><th>Contact</th><th>Agency</th><th>Agent</th>
                    <th>Sites</th><th>Gas (C|S|D)</th><th>Elec (C|S|D)</th><th>Created</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((b) => (
                    <tr key={b.id}>
                      <td><div className="name">{b.business_name}</div><div className="mono">#{b.ref}</div></td>
                      <td>{b.contact_name || "—"}{b.contact_mobile ? <div className="mono">{b.contact_mobile}</div> : null}</td>
                      <td>{b.agency_name || "—"}</td>
                      <td>{b.agent_name || "—"}</td>
                      <td>{b.sites}</td>
                      <td className="mono">{csd(b.gas_c, b.gas_s, b.gas_d)}</td>
                      <td className="mono">{csd(b.elec_c, b.elec_s, b.elec_d)}</td>
                      <td className="mono">{b.created_at?.slice(0, 10)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          {isLead && (
                            <button className="btn ghost sm" disabled={busy === b.id} onClick={() => convert(b.id)} title="Convert to customer">
                              <ArrowRightLeft size={14} /> Convert
                            </button>
                          )}
                          <button className="btn ghost sm danger" disabled={busy === b.id} onClick={() => remove(b.id)} title="Delete"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!data.length && <tr><td colSpan={9} className="state">No records found.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager meta={meta} page={page} setPage={setPage} />
          </>
        )}
      </Card>

      {showAdd && (
        <AddBusiness resource={resource} refs={refs} isLead={isLead}
          onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); }} />
      )}
    </>
  );
}

function AddBusiness({ resource, refs, isLead, onClose, onSaved }) {
  const [form, setForm] = useState({ business_name: "", contact_name: "", contact_email: "", contact_mobile: "", agency_id: "", agent_id: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.business_name.trim()) return setErr("Business name is required");
    setSaving(true); setErr(null);
    try {
      await api.post(`/${resource}`, {
        ...form,
        agency_id: form.agency_id || null,
        agent_id: form.agent_id || null,
      });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={isLead ? "Add Lead" : "Add Customer"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </>}>
      {err && <div className="error-banner">{err}</div>}
      <Field label="Business name *"><input value={form.business_name} onChange={set("business_name")} placeholder="Acme Ltd" /></Field>
      <Field label="Contact name"><input value={form.contact_name} onChange={set("contact_name")} /></Field>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label="Email"><input value={form.contact_email} onChange={set("contact_email")} /></Field>
        <Field label="Mobile"><input value={form.contact_mobile} onChange={set("contact_mobile")} /></Field>
      </div>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label="Agency">
          <select value={form.agency_id} onChange={set("agency_id")}>
            <option value="">—</option>
            {refs.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Agent">
          <select value={form.agent_id} onChange={set("agent_id")}>
            <option value="">—</option>
            {refs.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
