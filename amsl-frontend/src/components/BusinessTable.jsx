import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowRightLeft, Trash2, Upload, Eye, Download, Users} from "lucide-react";
import { api, API_BASE } from "../api.js";
import { useList, Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field } from "./ui.jsx";

const csd = (c, s, d) => `${c} | ${s} | ${d}`;

export default function BusinessTable({ resource, title, desc, isLead }) {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList(resource, { limit: 10 });
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
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
          {isLead && <a className="btn" href={`${API_BASE}/group-quotes/templates/leads/csv`}><Download size={15} /> CSV Template</a>}
          {isLead && <button className="btn" onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</button>}
          {isLead && <button className="btn" onClick={() => setShowGroup(true)}><Users size={15} /> Upload Group</button>}
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
                            <>
                              <Link className="btn ghost sm" to={`/leads/${b.id}`} title="View / edit lead">
                                <Eye size={14} /> View
                              </Link>
                              <button className="btn ghost sm" disabled={busy === b.id} onClick={() => convert(b.id)} title="Convert to customer">
                                <ArrowRightLeft size={14} /> Convert
                              </button>
                            </>
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
      {showGroup && (
        <ImportGroup onClose={() => setShowGroup(false)} onDone={() => reload()} />
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


/**
 * Upload a group or basket file and turn it into leads and meters.
 *
 * Two ways to land the sites, because a "group" file means one of two things in practice:
 *  - all the sites belong to ONE business (a multi-site company) → attach them to it;
 *  - the file lists several businesses → create a lead per business name.
 * The file is saved as a group quotation either way, so there is a record of where the
 * sites came from rather than rows appearing with no provenance.
 */
function ImportGroup({ onClose, onDone }) {
  const [kind, setKind] = useState("Group");
  const [mode, setMode] = useState("perBusiness");
  const [businessId, setBusinessId] = useState("");
  const [newBusiness, setNewBusiness] = useState("");
  const [businesses, setBusinesses] = useState([]);
  const [name, setName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [filename, setFilename] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  // Both leads and customers: a multi-site group may belong to either, and listing only
  // leads left the picker empty with no way forward.
  useEffect(() => {
    Promise.all([
      api.list("leads", { limit: 200 }).catch(() => ({ data: [] })),
      api.list("customers", { limit: 200 }).catch(() => ({ data: [] })),
    ]).then(([l, c]) => setBusinesses([
      ...l.data.map((b) => ({ ...b, kind: "Lead" })),
      ...c.data.map((b) => ({ ...b, kind: "Customer" })),
    ]));
  }, []);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setErr(null); setParsed(null); setResult(null); setFilename(file.name);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("Could not read the file"));
        r.readAsDataURL(file);
      });
      const { data } = await api.groupQuoteParse(b64, file.name);
      setParsed(data);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
      // Fill the name in rather than only offering it as placeholder text: a greyed-out
      // placeholder reads as filled, so pressing Create produced a "choose a business"
      // error on a box that looked complete.
      if (data.businesses?.length === 1 && !newBusiness.trim()) setNewBusiness(data.businesses[0]);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  const run = async () => {
    if (!parsed?.rows?.length) return setErr("Upload a completed group or basket file first");
    if (mode === "attach" && !businessId && !newBusiness.trim()) {
      return setErr("Choose an existing business, or type a name to create one");
    }
    setBusy(true); setErr(null);
    try {
      const { data: q } = await api.groupQuoteCreate({
        quote_kind: kind,
        [kind === "Basket" ? "basket_name" : "group_name"]: name || filename || "Uploaded group",
        business_id: mode === "attach" ? Number(businessId) : null,
        terms: [], sites: parsed.rows, source_filename: filename, status: "Draft",
      });
      const { data } = await api.groupQuoteCreateLeads(q.id, mode === "attach"
        ? (businessId ? { attach_to_business_id: Number(businessId) } : { attach_to_business_name: newBusiness.trim() })
        : {});
      setResult({ ...data, ref: q.ref });
      onDone?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const bad = parsed?.rows.filter((r) => r.issues.length) || [];
  return (
    <Modal title="Upload a group of sites" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" disabled={busy || !parsed} onClick={run}>{busy ? "Working…" : "Create leads and meters"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-3">
        <Field label="File type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="Group">Group file</option>
            <option value="Basket">Basket file (includes CRN)</option>
          </select>
        </Field>
        <Field label="These sites belong to">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="perBusiness">Use the business name in the file</option>
            <option value="attach">One business I choose</option>
          </select>
        </Field>
        {mode === "attach" ? (
          <Field label="Business *">
            <select value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
              <option value="">— Create a new business —</option>
              {businesses.map((b) => <option key={`${b.kind}-${b.id}`} value={b.id}>{b.business_name} ({b.kind})</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Group name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="For your own reference" /></Field>
        )}
      </div>
      {mode === "attach" && !businessId && (
        <div style={{ marginTop: 8 }}>
          <Field label="New business name *">
            <input value={newBusiness} onChange={(e) => setNewBusiness(e.target.value)}
              placeholder={parsed?.businesses?.[0] || "Name of the business these sites belong to"} />
          </Field>
          {parsed?.businesses?.length === 1 && newBusiness.trim() === "" && (
            <button className="btn ghost sm" onClick={() => setNewBusiness(parsed.businesses[0])}>
              Use "{parsed.businesses[0]}" from the file
            </button>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0 6px", flexWrap: "wrap" }}>
        <a className="btn ghost sm" href={`${API_BASE}/group-quotes/templates/${kind === "Basket" ? "basket" : "group"}`}>
          <Download size={13} /> Download {kind === "Basket" ? "basket" : "group"} template
        </a>
        <label className="btn sm" style={{ cursor: busy ? "wait" : "pointer" }}>
          <Upload size={13} /> {filename ? `Replace (${filename})` : "Choose completed file"}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={busy} style={{ display: "none" }} />
        </label>
      </div>
      {parsed && parsed.businesses.length === 1 && mode === "perBusiness" && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 8 }}>
          Every site in this file belongs to <b>{parsed.businesses[0]}</b>, so one business will be created with all {parsed.total} sites on it.
        </div>
      )}
      {parsed && (
        <div style={{ fontSize: 12.5 }}>
          <b>{parsed.total - parsed.with_issues}</b> site(s) ready{parsed.with_issues > 0 && <>, <b>{parsed.with_issues}</b> with problems that will be skipped</>}
          {mode === "perBusiness" && <> · {parsed.businesses.length} business name(s)</>}
          {bad.length > 0 && (
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 10px", marginTop: 8, maxHeight: 140, overflow: "auto", fontSize: 12 }}>
              {bad.slice(0, 10).map((r) => <div key={r.row_no}>Row {r.row_no} {r.business_name || "(no name)"} — {r.issues.join("; ")}</div>)}
              {bad.length > 10 && <div className="sub">…and {bad.length - 10} more.</div>}
            </div>
          )}
        </div>
      )}
      {result && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 10 }}>
          Saved as {result.ref}. Created {result.businesses_created} business(es), matched {result.businesses_matched} existing,
          added {result.meters_created} meter(s).
          {result.meters_already_present > 0 && ` ${result.meters_already_present} meter(s) were already on file.`}
          {result.rows_skipped > 0 && ` ${result.rows_skipped} row(s) skipped.`}
        </div>
      )}
    </Modal>
  );
}
