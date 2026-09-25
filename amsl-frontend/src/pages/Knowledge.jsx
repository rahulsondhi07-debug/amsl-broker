import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, BookOpen, BookA, Wrench, Search, Eye, EyeOff } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";
import Markdown from "../components/Markdown.jsx";
import { StrategyFinder, TrancheCalculator } from "../components/ClientTools.jsx";

const ta = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "inherit", fontSize: 13 };

export default function Knowledge() {
  const [tab, setTab] = useState("articles");
  const [openSlug, setOpenSlug] = useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Knowledge Hub</h1>
          <p className="sub">Plain-English articles, a glossary and tools for clients. Client articles appear in every client hub and can be packed into a buying guide from Client Documents.</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["articles", "Articles", BookOpen], ["glossary", "Glossary", BookA], ["tools", "Client tools", Wrench]].map(([k, l, Icon]) => (
          <button key={k} className={`btn ${tab === k ? "primary" : ""}`} onClick={() => setTab(k)}><Icon size={14} /> {l}</button>
        ))}
      </div>
      {tab === "articles" && <Articles openSlug={openSlug} clearOpen={() => setOpenSlug(null)} />}
      {tab === "glossary" && <Glossary />}
      {tab === "tools" && (
        <div style={{ display: "grid", gap: 14 }}>
          <StrategyFinder onRead={(slug) => { setOpenSlug(slug); setTab("articles"); }} />
          <TrancheCalculator />
        </div>
      )}
    </>
  );
}

function Articles({ openSlug, clearOpen }) {
  const [rows, setRows] = useState(null);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [view, setView] = useState(null);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => api.kbArticles({ q, category: cat }).then((r) => { setRows(r.data); setCats(r.meta.categories); }).catch((e) => setErr(e.message)), [q, cat]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (openSlug && rows) { const a = rows.find((x) => x.slug === openSlug); if (a) setView(a); clearOpen(); } }, [openSlug, rows, clearOpen]);

  const groups = rows ? [...new Set(rows.map((r) => r.category))] : [];
  return (
    <>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
          <input placeholder="Search articles" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: "8px 11px 8px 30px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", minWidth: 240 }} /></div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" }}>
          <option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => setEdit({ category: cats[0] || "Buying strategies", audience: "client", published: 1, title: "", summary: "", body: "" })}><Plus size={14} /> New article</button>
      </div>
      {!rows ? <Spinner /> : groups.map((g) => (
        <div key={g} style={{ marginBottom: 18 }}>
          <div className="sub" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8 }}>{g}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
            {rows.filter((r) => r.category === g).map((a) => (
              <div key={a.id} className="card" onClick={() => setView(a)} style={{ cursor: "pointer", padding: 14, border: "1px solid var(--line,#E7EBF0)", borderRadius: 12, background: "#fff" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                  {a.audience === "internal" && <Badge tone="amber">Internal</Badge>}
                  {!a.published && <Badge tone="slate">Draft</Badge>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{a.title}</div>
                <div className="sub" style={{ fontSize: 12, lineHeight: 1.5 }}>{a.summary}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {view && (
        <Modal title={view.title} onClose={() => setView(null)} wide
          footer={<><button className="btn" onClick={() => { setEdit(view); setView(null); }}><Pencil size={13} /> Edit</button><button className="btn primary" onClick={() => setView(null)}>Close</button></>}>
          {view.summary && <p className="sub" style={{ fontSize: 13, marginTop: 0 }}><i>{view.summary}</i></p>}
          <Markdown text={view.body} />
        </Modal>
      )}
      {edit && <ArticleForm a={edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}

function ArticleForm({ a, cats, onClose, onSaved }) {
  const [f, setF] = useState({ ...a });
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.title?.trim()) return setErr("Title is required");
    try { await api.kbArticleSave(a.id, { category: f.category, title: f.title, summary: f.summary, body: f.body, audience: f.audience, published: Number(f.published), sort_order: Number(f.sort_order) || 0 }); onSaved(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={a.id ? "Edit article" : "New article"} onClose={onClose} wide
      footer={<>
        {a.id && <button className="btn" style={{ marginRight: "auto" }} onClick={async () => { if (confirm("Delete this article?")) { await api.kbArticleDelete(a.id); onSaved(); } }}><Trash2 size={13} /> Delete</button>}
        <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-3">
        <Field label="Category"><input list="kb-cats" value={f.category} onChange={set("category")} /><datalist id="kb-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Audience"><select value={f.audience} onChange={set("audience")}><option value="client">Client (shown in hubs)</option><option value="internal">Internal (agents only)</option></select></Field>
        <Field label="Status"><select value={f.published} onChange={set("published")}><option value={1}>Published</option><option value={0}>Draft</option></select></Field>
      </div>
      <Field label="Title"><input value={f.title} onChange={set("title")} /></Field>
      <Field label="Summary (one line)"><input value={f.summary || ""} onChange={set("summary")} /></Field>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0" }}>
        <span className="sub" style={{ fontSize: 11.5 }}>Formatting: <code>## Heading</code> · <code>- bullet</code> · <code>1. step</code> · <code>**bold**</code> · <code>| table | row |</code> · <code>&gt; callout</code></span>
        <button className="btn ghost sm" onClick={() => setPreview(!preview)}>{preview ? <><EyeOff size={13} /> Edit</> : <><Eye size={13} /> Preview</>}</button>
      </div>
      {preview ? <div style={{ border: "1px solid var(--line,#E7EBF0)", borderRadius: 8, padding: 14, maxHeight: 420, overflow: "auto" }}><Markdown text={f.body} /></div>
        : <textarea rows={16} value={f.body || ""} onChange={set("body")} style={{ ...ta, fontFamily: "monospace", fontSize: 12.5 }} />}
    </Modal>
  );
}

function Glossary() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => api.kbGlossary({ q }).then((r) => setRows(r.data)).catch((e) => setErr(e.message)), [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const save = async () => {
    try { await api.kbGlossarySave(edit.id, { term: edit.term, definition: edit.definition, category: edit.category }); setEdit(null); load(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Card>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input placeholder="Search terms" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", minWidth: 240 }} />
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => setEdit({ term: "", definition: "", category: "" })}><Plus size={14} /> Add term</button>
      </div>
      {!rows ? <Spinner /> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th style={{ width: 220 }}>Term</th><th>Meaning</th><th>Category</th><th></th></tr></thead>
          <tbody>{rows.map((g) => (
            <tr key={g.id}>
              <td className="name">{g.term}</td>
              <td style={{ fontSize: 12.5, whiteSpace: "normal", lineHeight: 1.5 }}>{g.definition}</td>
              <td style={{ fontSize: 11.5 }}>{g.category || "—"}</td>
              <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                <button className="btn ghost sm" onClick={() => setEdit(g)}><Pencil size={12} /></button>
                <button className="btn ghost sm" onClick={async () => { if (confirm(`Delete "${g.term}"?`)) { await api.kbGlossaryDelete(g.id); load(); } }}><Trash2 size={12} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? "Edit term" : "Add term"} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <Field label="Term"><input value={edit.term} onChange={(e) => setEdit({ ...edit, term: e.target.value })} /></Field>
          <Field label="Category"><input value={edit.category || ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
          <Field label="Meaning"><textarea rows={4} value={edit.definition} onChange={(e) => setEdit({ ...edit, definition: e.target.value })} style={ta} /></Field>
        </Modal>
      )}
    </Card>
  );
}
