import { useState, useEffect, useCallback } from "react";
import { FileText, FileSpreadsheet, Presentation, Globe, Download, Trash2, Eye, Share2, Loader2 } from "lucide-react";
import { api, docUrl } from "../api.js";
import { Badge, ErrorBanner } from "./ui.jsx";

export const FORMAT_ICON = { docx: FileText, xlsx: FileSpreadsheet, pptx: Presentation, html: Globe };
export const formatOf = (mime = "") => (/word/.test(mime) ? "docx" : /sheet/.test(mime) ? "xlsx" : /presentation/.test(mime) ? "pptx" : "html");
export const fmtSize = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round((n || 0) / 1024)} KB`);

/**
 * Generate and manage the documents for one source (a comparison, a consortium, a market
 * report, a group quote). Shows a button per document type, plus everything generated so
 * far with download, preview, publish-to-hub and delete.
 */
export default function DocumentsPanel({ source, sourceId, businessId, optionsFor, title = "Client documents", compact }) {
  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    api.docs({ source_kind: source, source_id: sourceId }).then((r) => setDocs(r.data)).catch((e) => setErr(e.message));
  }, [source, sourceId]);
  useEffect(() => { api.docTypes().then((r) => setTypes(r.data.filter((t) => t.source === source))).catch(() => {}); load(); }, [source, load]);

  const gen = async (keys) => {
    setBusy(keys.join(",")); setErr(null);
    try {
      if (keys.length === 1) {
        const opts = optionsFor ? await optionsFor(keys[0]) : {};
        if (opts === false) { setBusy(null); return; }
        await api.docGenerate({ doc_type: keys[0], source_id: sourceId, business_id: businessId || null, options: opts || {} });
      } else {
        const r = await api.docGeneratePack({ types: keys, source_id: sourceId, business_id: businessId || null });
        if (r.errors?.length) setErr(r.errors.map((e) => `${e.doc_type}: ${e.error}`).join(" · "));
      }
      load();
    } catch (e) { setErr(e.message); }
    setBusy(null);
  };
  const togglePublish = async (d) => {
    try { await api.docUpdate(d.id, { published: !d.published }); load(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="no-print" style={{ border: "1px solid var(--line,#E7EBF0)", borderRadius: 12, padding: compact ? 12 : 16, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
          <div className="sub" style={{ fontSize: 11.5 }}>Generated from the figures on this page. Publish a document to show it in the customer's hub.</div>
        </div>
        {types.length > 1 && (
          <button className="btn primary sm" disabled={!!busy} onClick={() => gen(types.filter((t) => !t.options?.includes("business_id")).map((t) => t.key))}>
            {busy?.includes(",") ? <><Loader2 size={13} className="spin" /> Generating…</> : `Generate all ${types.filter((t) => !t.options?.includes("business_id")).length}`}
          </button>
        )}
      </div>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8, marginBottom: 12 }}>
        {types.map((t) => {
          const Icon = FORMAT_ICON[t.format] || FileText;
          return (
            <button key={t.key} className="btn" disabled={!!busy} onClick={() => gen([t.key])} title={t.description}
              style={{ justifyContent: "flex-start", textAlign: "left", height: "auto", padding: "9px 11px", display: "flex", gap: 9, alignItems: "flex-start" }}>
              {busy === t.key ? <Loader2 size={16} className="spin" /> : <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
              <span><span style={{ fontWeight: 600, fontSize: 12.5, display: "block" }}>{t.label}</span>
                <span className="sub" style={{ fontSize: 10.5, textTransform: "uppercase" }}>.{t.format}</span></span>
            </button>
          );
        })}
      </div>
      {docs && docs.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Document</th><th>Customer</th><th>Created</th><th>Size</th><th>Hub</th><th></th></tr></thead>
            <tbody>
              {docs.slice(0, compact ? 6 : 20).map((d) => <DocRow key={d.id} d={d} onPublish={() => togglePublish(d)} onDelete={async () => { if (confirm(`Delete ${d.filename}?`)) { await api.docDelete(d.id); load(); } }} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DocRow({ d, onPublish, onDelete, showSource }) {
  const f = formatOf(d.mime);
  const Icon = FORMAT_ICON[f] || FileText;
  return (
    <tr>
      <td><span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><Icon size={14} /><span className="name" style={{ fontSize: 12.5 }}>{d.title}</span></span>
        {showSource && <div className="sub" style={{ fontSize: 10.5 }}>{d.doc_type.replace(/_/g, " ")}</div>}</td>
      <td style={{ fontSize: 12 }}>{d.business_name || <span className="sub">Not linked</span>}</td>
      <td style={{ fontSize: 11.5 }}>{new Date(d.created_at + (d.created_at.includes("Z") ? "" : "Z")).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
      <td className="mono" style={{ fontSize: 11.5 }}>{fmtSize(d.size)}</td>
      <td>{onPublish ? (
        <button className="btn ghost sm" onClick={onPublish} title={d.business_id ? "Show in the customer's hub" : "Link a customer first"}>
          {d.published ? <Badge tone="green">Published</Badge> : <><Share2 size={12} /> Publish</>}
        </button>) : d.published ? <Badge tone="green">Published</Badge> : null}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {f === "html" && <a className="btn ghost sm" href={docUrl(d.id, true)} target="_blank" rel="noreferrer" title="Open"><Eye size={13} /></a>}
        <a className="btn ghost sm" href={docUrl(d.id)} title="Download"><Download size={13} /></a>
        {onDelete && <button className="btn ghost sm" onClick={onDelete} title="Delete"><Trash2 size={13} /></button>}
      </td>
    </tr>
  );
}
