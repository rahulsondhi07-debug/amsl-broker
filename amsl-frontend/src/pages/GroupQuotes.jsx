import { useState, useEffect, useCallback } from "react";
import { Plus, Download, Upload, Users, Trash2, AlertTriangle } from "lucide-react";
import { api, API_BASE } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const TERMS = ["2 Month", "3 Month", "6 Month", "1 Year", "2 Year", "3 Year", "4 Year", "5 Year", "Other", "ALL"];
const STATUSES = ["Draft", "Sent", "Quoted", "Won", "Lost"];
const statusTone = (s) => ({ Won: "green", Quoted: "indigo", Sent: "amber", Lost: "rose" }[s] || "slate");
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 }));

const CHECKS = [
  ["monthly_variable", "Monthly Variable", null],
  ["third_party_mop", "Customer Third Party MOP Contract?", null],
  ["third_party_dadc", "Customer Third Party DA/DC Contract?", null],
  ["nominate_dadc", "Supplier to Nominate DA/DC?", null],
  ["property_managing_agent", "Property Managing Agent?", null],
  ["green_electricity", "Green Electricity?",
   "Backed by Renewable Energy Guarantees of Origin (REGO). Prices are inclusive of Green Premium."],
  ["carbon_offset_gas", "Carbon Offset Premium Gas?",
   "Offset through certified projects. Credits are sourced from projects and programmes registered with Verra's Verified Carbon Standard Program. Prices are inclusive of Carbon Offset Premium."],
  ["carbon_offset_elec", "Carbon Offset Premium Electricity?",
   "Offset through certified projects. Prices are inclusive of Carbon Offset Premium."],
];

const empty = {
  quote_kind: "Group", supplier_id: "", company_name: "", basket_name: "", group_name: "",
  company_reg_no: "", required_by: "", terms: [], product: "", notes: "",
  ...Object.fromEntries(CHECKS.map(([k]) => [k, false])),
};

export default function GroupQuotes() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(() => {
    api.groupQuotes().then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (q) => {
    if (!confirm(`Delete ${q.ref}?`)) return;
    try { await api.groupQuoteDelete(q.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Group Quotation</h1>
          <p className="sub">Request pricing for several sites at once — as one group contract, or as a basket of individual contracts.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href={`${API_BASE}/group-quotes/templates/group`}><Download size={15} /> Group Template</a>
          <a className="btn" href={`${API_BASE}/group-quotes/templates/basket`}><Download size={15} /> Basket Template</a>
          <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Group Quotation</button>
        </div>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      <Card>
        {!rows ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Ref</th><th>Name</th><th>Type</th><th>Supplier</th><th>Sites</th><th>Total EAC</th><th>Total AQ</th><th>Required by</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={10} className="sub" style={{ padding: 16, textAlign: "center" }}>No group quotations yet.</td></tr>}
                {rows.map((q) => (
                  <tr key={q.id} style={{ cursor: "pointer" }} onClick={() => setViewing(q.id)}>
                    <td className="mono">{q.ref}</td>
                    <td className="name">{q.group_name || q.basket_name || "—"}{q.company_name && <div className="sub" style={{ fontSize: 11 }}>{q.company_name}</div>}</td>
                    <td><Badge tone={q.quote_kind === "Basket" ? "indigo" : "slate"}>{q.quote_kind}</Badge></td>
                    <td style={{ fontSize: 12 }}>{q.supplier_name || "—"}</td>
                    <td className="mono">{q.sites}</td>
                    <td className="mono">{num(q.total_eac)}</td>
                    <td className="mono">{num(q.total_aq)}</td>
                    <td style={{ fontSize: 12 }}>{q.required_by ? new Date(q.required_by).toLocaleDateString("en-GB") : "—"}</td>
                    <td><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn ghost sm" onClick={() => del(q)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {showAdd && <GroupForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {viewing && <GroupView id={viewing} onClose={() => { setViewing(null); load(); }} />}
    </>
  );
}

/** Shared uploader: reads a group/basket file and shows what was found before anything is saved. */
export function useSiteFile() {
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setError("That file is over 10MB.");
    setBusy(true); setError(null); setParsed(null); setFilename(file.name);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("Could not read the file"));
        r.readAsDataURL(file);
      });
      const { data } = await api.groupQuoteParse(b64, file.name);
      setParsed(data);
    } catch (e2) { setError(e2.message); }
    setBusy(false);
  };
  return { parsed, setParsed, busy, error, setError, filename, onFile };
}

export function SiteFileSummary({ parsed }) {
  if (!parsed) return null;
  const bad = parsed.rows.filter((r) => r.issues.length);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 8 }}>
        <Badge tone="green">{parsed.total - parsed.with_issues} ready</Badge>
        {parsed.with_issues > 0 && <Badge tone="amber">{parsed.with_issues} with problems</Badge>}
        <span className="sub" style={{ fontSize: 12 }}>{parsed.businesses.length} business name(s) in the file</span>
      </div>
      {bad.length > 0 && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 12px", fontSize: 12, marginBottom: 8, maxHeight: 150, overflow: "auto" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}><AlertTriangle size={12} style={{ verticalAlign: "-2px" }} /> Rows a supplier could not price:</div>
          {bad.slice(0, 12).map((r) => (
            <div key={r.row_no}>Row {r.row_no} {r.business_name || "(no name)"} — {r.issues.join("; ")}</div>
          ))}
          {bad.length > 12 && <div className="sub">…and {bad.length - 12} more.</div>}
        </div>
      )}
      <div className="table-wrap" style={{ maxHeight: 220, overflow: "auto" }}>
        <table className="tbl">
          <thead><tr><th>Row</th><th>Business</th><th>Postcode</th><th>MPAN Core</th><th>EAC</th><th>MPRN</th><th>AQ</th><th>Start</th></tr></thead>
          <tbody>
            {parsed.rows.map((r) => (
              <tr key={r.row_no} style={r.issues.length ? { background: "#fff7ed" } : undefined}>
                <td className="mono">{r.row_no}</td>
                <td style={{ fontSize: 12 }}>{r.business_name || "—"}</td>
                <td style={{ fontSize: 12 }}>{r.postcode || "—"}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{r.mpan_core || "—"}</td>
                <td className="mono">{num((r.eac_day || 0) + (r.eac_night || 0) + (r.eac_ewe || 0)) }</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{r.mprn || "—"}</td>
                <td className="mono">{num(r.aq)}</td>
                <td style={{ fontSize: 11.5 }}>{r.start_date || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupForm({ onClose, onSaved }) {
  const [f, setF] = useState(empty);
  const [suppliers, setSuppliers] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const file = useSiteFile();
  useEffect(() => {
    api.list("suppliers", { limit: 300 }).then((r) => setSuppliers(r.data)).catch(() => {});
    api.list("customers", { limit: 300 }).then((r) => setBusinesses(r.data)).catch(() => {});
  }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (k) => () => setF({ ...f, [k]: !f[k] });
  const term = (t) => () => setF({ ...f, terms: f.terms.includes(t) ? f.terms.filter((x) => x !== t) : [...f.terms, t] });

  const save = async () => {
    if (f.quote_kind === "Group" && !f.group_name.trim()) return setErr("Group Name is required for a group quotation");
    if (f.quote_kind === "Basket" && !f.basket_name.trim()) return setErr("Basket Name is required for a basket quotation");
    if (!file.parsed?.rows?.length) return setErr("Upload the completed group or basket file first");
    if (!f.terms.length) return setErr("Choose at least one contract term to quote");
    setSaving(true); setErr(null);
    try {
      await api.groupQuoteCreate({ ...f, supplier_id: f.supplier_id || null, sites: file.parsed.rows, source_filename: file.filename });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Add Group Quotation" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Ask for Quote"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-3">
        <Field label="Quotation type">
          <select value={f.quote_kind} onChange={set("quote_kind")}>
            <option value="Group">Group — one contract covering all sites</option>
            <option value="Basket">Basket — individual contracts</option>
          </select>
        </Field>
        <Field label="Supplier / partner *">
          <select value={f.supplier_id} onChange={set("supplier_id")}>
            <option value="">Select…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Company name">
          <select value={f.company_name} onChange={set("company_name")}>
            <option value="">Select…</option>
            {businesses.map((b) => <option key={b.id} value={b.business_name}>{b.business_name}</option>)}
          </select>
        </Field>

        {f.quote_kind === "Basket"
          ? <Field label="Basket name *"><input value={f.basket_name} onChange={set("basket_name")} placeholder="For individual contracts" /></Field>
          : <Field label="Group name *"><input value={f.group_name} onChange={set("group_name")} placeholder="For group contracts" /></Field>}
        <Field label="Company register no"><input value={f.company_reg_no} onChange={set("company_reg_no")} /></Field>
        <Field label="Required by"><input type="datetime-local" value={f.required_by} onChange={set("required_by")} /></Field>

        <Field label="Supplier product"><input value={f.product} onChange={set("product")} placeholder="e.g. Fixed, Flex, Pass-through" /></Field>
      </div>

      <div className="form-section-title" style={{ marginTop: 8 }}>Terms to quote *</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        {TERMS.map((t) => (
          <label key={t} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={f.terms.includes(t)} onChange={term(t)} style={{ accentColor: "var(--brand,#0E7C7B)" }} />
            {t}
          </label>
        ))}
      </div>

      <div className="form-section-title">Contract options</div>
      <div className="grid cols-2" style={{ marginBottom: 10 }}>
        {CHECKS.map(([k, label, note]) => (
          <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px",
            border: `1px solid ${f[k] ? "#a7f3d0" : "var(--line,#E7EBF0)"}`, background: f[k] ? "#ecfdf5" : "transparent",
            borderRadius: 9, cursor: "pointer" }}>
            <input type="checkbox" checked={f[k]} onChange={toggle(k)} style={{ marginTop: 2, accentColor: "var(--brand,#0E7C7B)" }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
              {note && <div className="sub" style={{ fontSize: 11, lineHeight: 1.45 }}>{note}</div>}
            </div>
          </label>
        ))}
      </div>

      <div className="form-section-title">Sites</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <a className="btn ghost sm" href={`${API_BASE}/group-quotes/templates/${f.quote_kind === "Basket" ? "basket" : "group"}`}>
          <Download size={13} /> Download {f.quote_kind === "Basket" ? "basket" : "group"} template
        </a>
        <label className="btn sm" style={{ cursor: file.busy ? "wait" : "pointer" }}>
          <Upload size={13} /> {file.busy ? "Reading…" : file.filename ? `Replace (${file.filename})` : "Upload completed file"}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={file.onFile} disabled={file.busy} style={{ display: "none" }} />
        </label>
        <span className="sub" style={{ fontSize: 11.5 }}>
          {f.quote_kind === "Basket" ? "The basket template includes a company registration number per site." : "One row per site."}
        </span>
      </div>
      {file.error && <ErrorBanner error={file.error} />}
      <SiteFileSummary parsed={file.parsed} />

      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "inherit" }} /></Field>
    </Modal>
  );
}

function GroupView({ id, onClose }) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.groupQuote(id).then((r) => setQ(r.data)).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (s) => { await api.groupQuoteStatus(id, s); load(); };
  const createLeads = async () => {
    setBusy(true); setErr(null);
    try { const { data } = await api.groupQuoteCreateLeads(id, {}); setResult(data); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!q) return <Modal title="Group quotation" onClose={onClose}>{err ? <ErrorBanner error={err} /> : <Spinner />}</Modal>;
  const bad = q.sites.filter((s) => s.issues.length);
  return (
    <Modal title={`${q.ref} — ${q.group_name || q.basket_name}`} onClose={onClose} wide
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <Badge tone={q.quote_kind === "Basket" ? "indigo" : "slate"}>{q.quote_kind}</Badge>
        <span className="sub" style={{ fontSize: 12.5 }}>
          {q.supplier_name || "No supplier"} · {q.sites.length} sites · terms {q.terms.join(", ") || "—"}
          {q.product ? ` · ${q.product}` : ""}
        </span>
        <select value={q.status} onChange={(e) => setStatus(e.target.value)} style={{ marginLeft: "auto", padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line,#E7EBF0)", fontSize: 12 }}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {CHECKS.filter(([k]) => q[k]).map(([k, label]) => <Badge key={k} tone="green">{label.replace(/\?$/, "")}</Badge>)}
      </div>

      <div className="table-wrap" style={{ maxHeight: 280, overflow: "auto" }}>
        <table className="tbl">
          <thead><tr><th>Row</th><th>Business</th><th>Postcode</th><th>MPAN Core</th><th>EAC</th><th>MPRN</th><th>AQ</th><th>Issues</th></tr></thead>
          <tbody>
            {q.sites.map((s) => (
              <tr key={s.id} style={s.issues.length ? { background: "#fff7ed" } : undefined}>
                <td className="mono">{s.row_no}</td>
                <td style={{ fontSize: 12 }}>{s.business_name || "—"}</td>
                <td style={{ fontSize: 12 }}>{s.postcode || "—"}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{s.mpan_core || "—"}</td>
                <td className="mono">{num((s.eac_day || 0) + (s.eac_night || 0) + (s.eac_ewe || 0))}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{s.mprn || "—"}</td>
                <td className="mono">{num(s.aq)}</td>
                <td style={{ fontSize: 11 }}>{s.issues.join("; ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-section-title" style={{ marginTop: 16 }}>Add these sites to the portal</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn primary" disabled={busy} onClick={createLeads}>
          <Users size={14} /> {busy ? "Creating…" : "Create leads and meters"}
        </button>
        <span className="sub" style={{ fontSize: 11.5 }}>
          One lead per business name, with its meters. Existing businesses are matched by name rather than duplicated.
          {bad.length > 0 && ` ${bad.length} row(s) with problems will be skipped.`}
        </span>
      </div>
      {result && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 8 }}>
          Created {result.businesses_created} business(es), matched {result.businesses_matched} existing, added {result.meters_created} meter(s).
          {result.meters_already_present > 0 && ` ${result.meters_already_present} meter(s) were already on file.`}
          {result.rows_skipped > 0 && ` ${result.rows_skipped} row(s) skipped because of the problems above.`}
        </div>
      )}
    </Modal>
  );
}
