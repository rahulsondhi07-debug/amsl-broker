import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, CopyPlus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Field } from "../components/ui.jsx";
import DocumentsPanel from "../components/DocumentsPanel.jsx";

const ta = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "inherit", fontSize: 13 };
const cell = { padding: "5px 7px", borderRadius: 6, border: "1px solid var(--line,#E7EBF0)", fontSize: 12.5 };
const UNITS = { Power: "£/MWh", Gas: "p/therm", Other: "%" };

export default function MarketReports() {
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => api.marketReports().then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (sel) return <Editor id={sel === "new" ? null : sel} onBack={() => { setSel(null); load(); }} onOpen={setSel} />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Market Reports</h1>
          <p className="sub">Where prices are and why. Published reports appear in client hubs, feed the position reports' market backdrop, and generate as a client document.</p>
        </div>
        <button className="btn primary" onClick={() => setSel("new")}><Plus size={15} /> New report</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      <Card>
        {!rows ? <Spinner /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Title</th><th>Headline</th><th>Prices</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="sub" style={{ padding: 16, textAlign: "center" }}>No reports yet.</td></tr>}
              {rows.map((m) => (
                <tr key={m.id} style={{ cursor: "pointer" }} onClick={() => setSel(m.id)}>
                  <td className="mono">{new Date(m.report_date).toLocaleDateString("en-GB")}</td>
                  <td className="name">{m.title}</td>
                  <td style={{ fontSize: 12, maxWidth: 420 }}>{m.headline || "—"}</td>
                  <td className="mono">{m.prices}</td>
                  <td><Badge tone={m.status === "Published" ? "green" : "slate"}>{m.status}</Badge></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn ghost sm" title="Start next report from this one" onClick={async () => { const r = await api.marketReportRoll(m.id); setSel(r.data.id); }}><CopyPlus size={13} /> Roll forward</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}

const blank = { title: "UK Gas & Power Market Update", report_date: new Date().toISOString().slice(0, 10), status: "Draft", headline: "", summary: "", backdrop: "",
  drivers: "", outlook: "", fixed_view: "", flex_view: "", sources: "", author: "", prices: [] };

function Editor({ id, onBack, onOpen }) {
  const [f, setF] = useState(id ? null : blank);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (id) api.marketReport(id).then((r) => setF(r.data)).catch((e) => setErr(e.message)); }, [id]);
  if (!f) return err ? <ErrorBanner error={err} /> : <Spinner />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setP = (i, k, v) => setF({ ...f, prices: f.prices.map((p, j) => (j === i ? { ...p, [k]: v, ...(k === "commodity" ? { unit: UNITS[v] } : {}) } : p)) });
  const save = async (status) => {
    setSaving(true); setErr(null);
    try {
      const body = { ...f, status: status || f.status, prices: f.prices.map((p) => ({ ...p, price: p.price === "" ? null : p.price, previous: p.previous === "" ? null : p.previous })) };
      const r = await api.marketReportSave(id, body);
      setF(r.data); setMsg(status === "Published" ? "Published — now visible in client hubs." : "Saved."); setTimeout(() => setMsg(null), 2500);
      if (!id) onOpen(r.data.id);
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };
  return (
    <>
      <div className="page-head">
        <button className="btn ghost sm" onClick={onBack}>← All reports</button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {msg && <span className="sub" style={{ fontSize: 12 }}>{msg}</span>}
          {id && <button className="btn" onClick={async () => { if (confirm("Delete this report?")) { await api.marketReportDelete(id); onBack(); } }}><Trash2 size={14} /></button>}
          <button className="btn" disabled={saving} onClick={() => save()}>Save</button>
          {f.status !== "Published"
            ? <button className="btn primary" disabled={saving} onClick={() => save("Published")}>Publish</button>
            : <button className="btn" disabled={saving} onClick={() => save("Draft")}>Unpublish</button>}
        </div>
      </div>
      {err && <ErrorBanner error={err} />}
      <Card>
        <div className="grid cols-3">
          <Field label="Title"><input value={f.title} onChange={set("title")} /></Field>
          <Field label="Report date"><input type="date" value={f.report_date} onChange={set("report_date")} /></Field>
          <Field label="Author"><input value={f.author || ""} onChange={set("author")} /></Field>
        </div>
        <Field label="Headline (one line)"><input value={f.headline || ""} onChange={set("headline")} /></Field>
        <Field label="Summary"><textarea rows={3} value={f.summary || ""} onChange={set("summary")} style={ta} /></Field>

        <div style={{ fontWeight: 700, fontSize: 13, margin: "14px 0 6px" }}>Prices at a glance</div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Commodity</th><th>Contract</th><th>Price</th><th>Unit</th><th>Previous</th><th>Change</th><th>Note</th><th></th></tr></thead>
          <tbody>{f.prices.map((p, i) => {
            const ch = p.price !== "" && p.price != null && p.previous ? ((p.price - p.previous) / p.previous) * 100 : null;
            return (
              <tr key={i}>
                <td><select value={p.commodity} onChange={(e) => setP(i, "commodity", e.target.value)} style={cell}><option>Power</option><option>Gas</option><option>Other</option></select></td>
                <td><input value={p.contract} onChange={(e) => setP(i, "contract", e.target.value)} placeholder="Winter 2026" style={{ ...cell, width: 140 }} /></td>
                <td><input type="number" step="0.01" value={p.price ?? ""} onChange={(e) => setP(i, "price", e.target.value)} style={{ ...cell, width: 90 }} /></td>
                <td><input value={p.unit || ""} onChange={(e) => setP(i, "unit", e.target.value)} style={{ ...cell, width: 70 }} /></td>
                <td><input type="number" step="0.01" value={p.previous ?? ""} onChange={(e) => setP(i, "previous", e.target.value)} style={{ ...cell, width: 90 }} /></td>
                <td className="mono" style={{ color: ch == null ? undefined : ch > 0 ? "#B91C1C" : "var(--brand,#0E7C7B)" }}>{ch == null ? "—" : <>{ch > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(ch).toFixed(1)}%</>}</td>
                <td><input value={p.note || ""} onChange={(e) => setP(i, "note", e.target.value)} style={{ ...cell, width: 150 }} /></td>
                <td><button className="btn ghost sm" onClick={() => setF({ ...f, prices: f.prices.filter((_, j) => j !== i) })}><Trash2 size={12} /></button></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setF({ ...f, prices: [...f.prices, { commodity: "Power", contract: "", price: "", unit: "£/MWh", previous: "", note: "" }] })}><Plus size={12} /> Add price</button>

        <div className="grid cols-2" style={{ marginTop: 14 }}>
          <Field label="Market backdrop"><textarea rows={5} value={f.backdrop || ""} onChange={set("backdrop")} style={ta} /></Field>
          <Field label="What's driving prices (one per line)"><textarea rows={5} value={f.drivers || ""} onChange={set("drivers")} style={ta} /></Field>
          <Field label="Outlook"><textarea rows={4} value={f.outlook || ""} onChange={set("outlook")} style={ta} /></Field>
          <Field label="Sources (one per line)"><textarea rows={4} value={f.sources || ""} onChange={set("sources")} style={ta} /></Field>
          <Field label="What it means — fixed contracts / renewals"><textarea rows={4} value={f.fixed_view || ""} onChange={set("fixed_view")} style={ta} /></Field>
          <Field label="What it means — flex / consortium members"><textarea rows={4} value={f.flex_view || ""} onChange={set("flex_view")} style={ta} /></Field>
        </div>
      </Card>
      {id && <DocumentsPanel source="market_report" sourceId={id} title="Market report documents" />}
    </>
  );
}
