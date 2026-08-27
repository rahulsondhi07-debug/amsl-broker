import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowRightLeft, Trash2, Upload, Eye } from "lucide-react";
import { api } from "../api.js";
import { useList, Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field } from "./ui.jsx";

const csd = (c, s, d) => `${c} | ${s} | ${d}`;

export default function BusinessTable({ resource, title, desc, isLead }) {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList(resource, { limit: 10 });
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
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
          {isLead && <button className="btn" onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</button>}
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
                          {!isLead && (
                            <Link className="btn ghost sm" to={`/customers/${b.id}`} title="View customer inner page">
                              <Eye size={14} /> View
                            </Link>
                          )}
                          {isLead && (
                            <button className="btn ghost sm" disabled={busy === b.id} onClick={() => convert(b.id)} title="Convert to customer">
                              <ArrowRightLeft size={14} /> Convert
                            </button>
                          )}
                          {/* V1.6-14: no delete once beyond Prospect */}
                          {!(["WON","UNDER_REGISTRATION","LIVE","UP_FOR_RENEWAL","RENEWED"].includes(b.journey_stage)) && (
                            <button className="btn ghost sm danger" disabled={busy === b.id} onClick={() => remove(b.id)} title="Delete"><Trash2 size={14} /></button>
                          )}
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

      {showImport && (
        <ImportLeads onClose={() => setShowImport(false)} onDone={() => reload()} />
      )}
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

// V1.6-16: bulk lead import with friendly, row-level errors
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });
    return row;
  });
}

function ImportLeads({ onClose, onDone }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const sample = "Business Name,Contact Name,Email,Mobile,Fuel\nAcme Ltd,Jane Doe,jane@acme.co.uk,07700900000,Elec\nBeta Foods,Sam Roe,sam@beta.co.uk,07700900111,Dual";

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => setText(String(rd.result || "")); rd.readAsText(f);
  };
  const run = async () => {
    const rows = parseCSV(text);
    if (!rows.length) { setResult({ error: "No rows found. Include a header row plus at least one lead." }); return; }
    setBusy(true);
    try { const { data } = await api.importLeads(rows); setResult(data); if (data.imported) onDone?.(); }
    catch (e) { setResult({ error: e.message }); }
    setBusy(false);
  };

  return (
    <Modal title="Import Leads from CSV" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" disabled={busy || !text.trim()} onClick={run}>{busy ? "Importing…" : "Import"}</button>
      </>}>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
        Columns: <strong>Business Name</strong> (required), Contact Name, Email, Mobile, Fuel (Elec/Gas/Dual).
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ fontSize: 12 }} />
        <button className="btn ghost sm" onClick={() => setText(sample)}>Use sample</button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste CSV here…"
        style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 8, border: "1px solid #E7EBF0", fontFamily: "monospace", fontSize: 12 }} />
      {result && (
        <div style={{ marginTop: 12 }}>
          {result.error ? (
            <div style={{ color: "#E11D48", fontWeight: 600, fontSize: 13 }}>⚠ {result.error}</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                <span style={{ color: "#0F766E" }}>{result.imported} imported</span>
                {result.failed > 0 && <span style={{ color: "#E11D48" }}> · {result.failed} failed</span>}
              </div>
              {result.errors?.length > 0 && (
                <div style={{ marginTop: 6, maxHeight: 160, overflow: "auto", background: "#FEF2F4", border: "1px solid #FCE0E6", borderRadius: 8, padding: "8px 10px" }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#B4253C", padding: "2px 0" }}>{e.message}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
