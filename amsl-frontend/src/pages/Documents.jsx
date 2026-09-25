import { useState, useEffect, useCallback } from "react";
import { FilePlus2, Link2, Copy, ExternalLink, Trash2, Settings2, FolderOpen, Loader2 } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Field } from "../components/ui.jsx";
import { DocRow, FORMAT_ICON } from "../components/DocumentsPanel.jsx";

const TABS = [["docs", "All documents", FolderOpen], ["generate", "Generate", FilePlus2], ["hubs", "Client hubs", Link2], ["settings", "Document settings", Settings2]];
const hubLink = (token) => `${window.location.origin}/hub/${token}`;

export default function Documents() {
  const [tab, setTab] = useState("docs");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Client Documents</h1>
          <p className="sub">Every proposal, report and letter generated from live figures — download it, or publish it to the customer's private hub.</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(([k, l, Icon]) => (
          <button key={k} className={`btn ${tab === k ? "primary" : ""}`} onClick={() => setTab(k)}><Icon size={14} /> {l}</button>
        ))}
      </div>
      {tab === "docs" && <AllDocs />}
      {tab === "generate" && <Generate onDone={() => setTab("docs")} />}
      {tab === "hubs" && <Hubs />}
      {tab === "settings" && <DocSettings />}
    </>
  );
}

function useCustomers() {
  const [c, setC] = useState([]);
  useEffect(() => { api.list("customers", { limit: 500 }).then((r) => setC(r.data)).catch(() => {}); }, []);
  return c;
}

function AllDocs() {
  const customers = useCustomers();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [biz, setBiz] = useState("");
  const [err, setErr] = useState(null);
  const load = useCallback(() => {
    api.docs({ q, business_id: biz }).then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, [q, biz]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const link = async (d, business_id) => { try { await api.docUpdate(d.id, { business_id: business_id ? Number(business_id) : "" }); load(); } catch (e) { setErr(e.message); } };
  return (
    <Card>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input placeholder="Search title or customer" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", minWidth: 240 }} />
        <select value={biz} onChange={(e) => setBiz(e.target.value)} style={{ padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" }}>
          <option value="">All customers</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
        </select>
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="sub" style={{ padding: 16, textAlign: "center" }}>No documents yet. Generate one from a comparison, a consortium, a market report — or the Generate tab.</div> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Document</th><th>Customer</th><th>Created</th><th>Size</th><th>Hub</th><th></th></tr></thead>
          <tbody>{rows.map((d) => (
            d.business_id ? <DocRow key={d.id} d={d} showSource onPublish={async () => { await api.docUpdate(d.id, { published: !d.published }); load(); }}
              onDelete={async () => { if (confirm(`Delete ${d.filename}?`)) { await api.docDelete(d.id); load(); } }} />
              : <UnlinkedRow key={d.id} d={d} customers={customers} onLink={link} onDelete={async () => { if (confirm(`Delete ${d.filename}?`)) { await api.docDelete(d.id); load(); } }} />
          ))}</tbody>
        </table></div>
      )}
    </Card>
  );
}

/** A document with no customer can't be published; offer to link one inline. */
function UnlinkedRow({ d, customers, onLink, onDelete }) {
  return (
    <>
      <DocRow d={d} showSource onDelete={onDelete} />
      <tr><td colSpan={6} style={{ paddingTop: 0 }}>
        <span className="sub" style={{ fontSize: 11 }}>Link to a customer to publish: </span>
        <select defaultValue="" onChange={(e) => onLink(d, e.target.value)} style={{ padding: "3px 6px", borderRadius: 6, border: "1px solid var(--line,#E7EBF0)", fontSize: 11.5 }}>
          <option value="">Choose…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
        </select>
      </td></tr>
    </>
  );
}

function Generate({ onDone }) {
  const customers = useCustomers();
  const [types, setTypes] = useState([]);
  const [type, setType] = useState("");
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [biz, setBiz] = useState("");
  const [articles, setArticles] = useState([]);
  const [picked, setPicked] = useState([]);
  const [contact, setContact] = useState("");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { api.docTypes().then((r) => setTypes(r.data)).catch(() => {}); api.kbArticles({ audience: "client", published: 1 }).then((r) => setArticles(r.data)).catch(() => {}); }, []);
  const t = types.find((x) => x.key === type);
  useEffect(() => {
    setSources([]); setSourceId("");
    if (!t) return;
    const load = {
      fvf: () => api.fvfList().then((r) => r.data.map((c) => ({ id: c.id, label: `${c.client_name}${c.version_label ? ` — ${c.version_label}` : ""}`, business_id: c.business_id }))),
      basket: () => api.flexBaskets().then((r) => r.data.map((b) => ({ id: b.id, label: b.name }))),
      market_report: () => api.marketReports().then((r) => r.data.map((m) => ({ id: m.id, label: `${m.report_date} — ${m.title} (${m.status})` }))),
      group_quote: () => api.groupQuotes().then((r) => r.data.map((q) => ({ id: q.id, label: `${q.ref} — ${q.group_name || q.basket_name || q.company_name || ""}`, business_id: q.business_id }))),
      knowledge: () => Promise.resolve([]),
    }[t.source];
    load?.().then(setSources).catch((e) => setErr(e.message));
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    if (!t) return setErr("Choose a document type");
    if (t.source !== "knowledge" && !sourceId) return setErr("Choose what to generate it from");
    setBusy(true); setErr(null);
    try {
      const options = {};
      if (t.options?.includes("contact_name") && contact) options.contact_name = contact;
      if (t.key === "extension_letter" && biz) options.business_id = Number(biz);
      if (t.key === "client_guide" && picked.length) options.article_ids = picked;
      await api.docGenerate({ doc_type: type, source_id: sourceId ? Number(sourceId) : null, business_id: biz ? Number(biz) : null, options, publish: publish && !!biz });
      onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const groups = [...new Set(types.map((x) => x.group))];
  return (
    <Card>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 8, marginBottom: 16 }}>
        {groups.map((g) => (
          <div key={g}>
            <div className="sub" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", margin: "4px 0 6px" }}>{g}</div>
            {types.filter((x) => x.group === g).map((x) => {
              const Icon = FORMAT_ICON[x.format];
              return (
                <button key={x.key} onClick={() => setType(x.key)} className="btn" style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", height: "auto", padding: "8px 10px", marginBottom: 6, display: "flex", gap: 8, borderColor: type === x.key ? "var(--brand,#0E7C7B)" : undefined, background: type === x.key ? "#ecfdf5" : undefined }}>
                  <Icon size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span><b style={{ fontSize: 12.5 }}>{x.label}</b> <span className="sub" style={{ fontSize: 10.5 }}>.{x.format}</span>
                    <span className="sub" style={{ display: "block", fontSize: 11, fontWeight: 400, lineHeight: 1.35 }}>{x.description}</span></span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {t && (
        <div style={{ borderTop: "1px solid var(--line,#E7EBF0)", paddingTop: 14 }}>
          <div className="grid cols-2">
            {t.source !== "knowledge" && (
              <Field label={{ fvf: "Comparison", basket: "Consortium", market_report: "Market report", group_quote: "Group quotation" }[t.source]}>
                <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); const s = sources.find((x) => String(x.id) === e.target.value); if (s?.business_id) setBiz(String(s.business_id)); }}>
                  <option value="">Choose…</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Customer (to file it against and publish to their hub)">
              <select value={biz} onChange={(e) => setBiz(e.target.value)}>
                <option value="">None</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
              </select>
            </Field>
            {t.options?.includes("contact_name") && <Field label="Addressed to"><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact name" /></Field>}
          </div>
          {t.key === "client_guide" && (
            <div style={{ margin: "8px 0" }}>
              <div className="sub" style={{ fontSize: 12, marginBottom: 6 }}>Articles to include — none ticked means all client articles.</div>
              <div style={{ columns: 2, fontSize: 12.5 }}>
                {articles.map((a) => (
                  <label key={a.id} style={{ display: "flex", gap: 6, marginBottom: 4, breakInside: "avoid" }}>
                    <input type="checkbox" checked={picked.includes(a.id)} onChange={() => setPicked(picked.includes(a.id) ? picked.filter((x) => x !== a.id) : [...picked, a.id])} /> {a.title}
                  </label>
                ))}
              </div>
            </div>
          )}
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, margin: "8px 0 12px" }}>
            <input type="checkbox" checked={publish} disabled={!biz} onChange={(e) => setPublish(e.target.checked)} /> Publish to the customer's hub straight away
          </label>
          <button className="btn primary" disabled={busy} onClick={go}>{busy ? <><Loader2 size={14} className="spin" /> Generating…</> : <>Generate {t.label}</>}</button>
        </div>
      )}
    </Card>
  );
}

function Hubs() {
  const customers = useCustomers();
  const [rows, setRows] = useState(null);
  const [baskets, setBaskets] = useState([]);
  const [biz, setBiz] = useState("");
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(null);
  const load = useCallback(() => api.hubs().then((r) => setRows(r.data)).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); api.flexBaskets().then((r) => setBaskets(r.data)).catch(() => {}); }, [load]);
  const create = async () => { if (!biz) return; try { await api.hubCreate({ business_id: Number(biz) }); setBiz(""); load(); } catch (e) { setErr(e.message); } };
  const upd = async (h, body) => { try { await api.hubUpdate(h.id, body); load(); } catch (e) { setErr(e.message); } };
  const copy = async (h) => { try { await navigator.clipboard.writeText(hubLink(h.token)); setCopied(h.id); setTimeout(() => setCopied(null), 1500); } catch { prompt("Copy this link", hubLink(h.token)); } };
  return (
    <Card>
      {err && <ErrorBanner error={err} />}
      <p className="sub" style={{ fontSize: 12.5, marginTop: 0 }}>
        A client hub is a private page for one customer: the documents you publish to them, your client knowledge articles and glossary, the latest published market report, their consortium's position, and a strategy and tranche calculator. Anyone with the link can open it, so share it only with the customer. Regenerate the link to revoke access.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <select value={biz} onChange={(e) => setBiz(e.target.value)} style={{ padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", minWidth: 260 }}>
          <option value="">Choose a customer…</option>{customers.filter((c) => !rows?.some((h) => h.business_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
        </select>
        <button className="btn primary" disabled={!biz} onClick={create}><Link2 size={14} /> Create hub</button>
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="sub" style={{ padding: 12 }}>No hubs yet.</div> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Customer</th><th>Consortium</th><th>Published docs</th><th>Views</th><th>Status</th><th>Welcome message</th><th></th></tr></thead>
          <tbody>{rows.map((h) => (
            <tr key={h.id}>
              <td className="name">{h.business_name}</td>
              <td><select value={h.basket_id ?? ""} onChange={(e) => upd(h, { basket_id: e.target.value ? Number(e.target.value) : "" })} style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid var(--line,#E7EBF0)", fontSize: 12 }}>
                <option value="">None</option>{baskets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
              <td className="mono">{h.documents}</td>
              <td className="mono" style={{ fontSize: 11.5 }}>{h.views}{h.last_viewed_at ? <div className="sub" style={{ fontSize: 10.5 }}>last {new Date(h.last_viewed_at + "Z").toLocaleDateString("en-GB")}</div> : null}</td>
              <td><button className="btn ghost sm" onClick={() => upd(h, { enabled: h.enabled ? 0 : 1 })}>{h.enabled ? <Badge tone="green">Live</Badge> : <Badge tone="slate">Off</Badge>}</button></td>
              <td><input defaultValue={h.welcome_message || ""} placeholder="Optional note shown at the top" onBlur={(e) => e.target.value !== (h.welcome_message || "") && upd(h, { welcome_message: e.target.value })}
                style={{ padding: "4px 7px", borderRadius: 6, border: "1px solid var(--line,#E7EBF0)", fontSize: 12, width: 220 }} /></td>
              <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                <button className="btn ghost sm" onClick={() => copy(h)} title="Copy link"><Copy size={13} /> {copied === h.id ? "Copied" : ""}</button>
                <a className="btn ghost sm" href={hubLink(h.token)} target="_blank" rel="noreferrer" title="Open"><ExternalLink size={13} /></a>
                <button className="btn ghost sm" onClick={() => confirm("Issue a new link? The old one stops working.") && upd(h, { regenerate_token: true })} title="New link">↻</button>
                <button className="btn ghost sm" onClick={async () => { if (confirm(`Delete the hub for ${h.business_name}?`)) { await api.hubDelete(h.id); load(); } }}><Trash2 size={13} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  );
}

const SETTINGS = [
  ["doc_company_name", "Company name"], ["doc_company_legal", "Legal line (footer)"], ["doc_address", "Address"],
  ["doc_phone", "Telephone"], ["doc_mobile", "Mobile"], ["doc_email", "Email"], ["doc_web", "Website"],
  ["doc_contact_name", "Signatory name"], ["doc_contact_title", "Signatory title"], ["doc_contact_email", "Signatory email"],
  ["doc_primary_color", "Primary colour", "color"], ["doc_accent_color", "Accent colour", "color"],
  ["flex_min_elec_kwh", "Flex entry level — electricity (kWh/yr)", "number"], ["flex_min_gas_kwh", "Flex entry level — gas (kWh/yr)", "number"],
];
function DocSettings() {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.docSettings().then((r) => setF(r.data)).catch((e) => setErr(e.message)); }, []);
  if (!f) return err ? <ErrorBanner error={err} /> : <Spinner />;
  const save = async () => { try { setF((await api.docSettingsSave(f)).data); setMsg("Saved — new documents will use these details."); setTimeout(() => setMsg(null), 2500); } catch (e) { setErr(e.message); } };
  return (
    <Card>
      {err && <ErrorBanner error={err} />}
      <p className="sub" style={{ fontSize: 12.5, marginTop: 0 }}>Shown on every generated document and in client hubs.</p>
      <div className="grid cols-3">
        {SETTINGS.map(([k, l, type]) => (
          <Field key={k} label={l}><input type={type || "text"} value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
        ))}
      </div>
      <Field label="Disclaimer (footer of every document)"><textarea rows={3} value={f.doc_disclaimer || ""} onChange={(e) => setF({ ...f, doc_disclaimer: e.target.value })}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "inherit" }} /></Field>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><button className="btn primary" onClick={save}>Save</button>{msg && <span className="sub">{msg}</span>}</div>
    </Card>
  );
}
