import { useState, useEffect } from "react";
import { Video, FileText, Trash2, Plus, ExternalLink } from "lucide-react";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

export default function Tutorials() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ title: "", kind: "video", category: "", url: "", file_type: "MP4" });

  const load = () => { setErr(null); api.tutorials().then((r) => setItems(r.data)).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, []);
  const add = async () => { if (!f.title) return; await api.tutorialAdd(f); setShow(false); setF({ title: "", kind: "video", category: "", url: "", file_type: "MP4" }); load(); };
  const del = async (id) => { if (confirm("Remove this item?")) { await api.tutorialDelete(id); load(); } };

  const videos = (items || []).filter((t) => t.kind === "video");
  const docs = (items || []).filter((t) => t.kind === "document");

  return (
    <>
      <div className="page-head">
        <div><h1>Platform Guide</h1><p className="sub">Training videos and reference documents.</p></div>
        <button className="btn primary" onClick={() => setShow(true)}><Plus size={15} /> Add</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!items ? <Spinner /> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <Card title={`Videos (${videos.length})`}>
            {videos.length === 0 ? <div className="sub">No videos yet.</div> : videos.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line,#EEF1F4)" }}>
                <Video size={18} color="#4F46E5" />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</div><div className="sub" style={{ fontSize: 11 }}>{t.category || "—"} · {t.file_type}</div></div>
                {t.url && <a className="btn ghost sm" href={t.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>}
                <button className="btn ghost sm danger" onClick={() => del(t.id)}><Trash2 size={13} /></button>
              </div>
            ))}
          </Card>
          <Card title={`Documents (${docs.length})`}>
            {docs.length === 0 ? <div className="sub">No documents yet.</div> : docs.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line,#EEF1F4)" }}>
                <FileText size={18} color="#B45309" />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</div><div className="sub" style={{ fontSize: 11 }}>{t.category || "—"} · {t.file_type}</div></div>
                {t.url && <a className="btn ghost sm" href={t.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>}
                <button className="btn ghost sm danger" onClick={() => del(t.id)}><Trash2 size={13} /></button>
              </div>
            ))}
          </Card>
        </div>
      )}
      {show && (
        <Modal title="Add tutorial" onClose={() => setShow(false)}
          footer={<><button className="btn" onClick={() => setShow(false)}>Cancel</button><button className="btn primary" onClick={add}>Add</button></>}>
          <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, file_type: e.target.value === "video" ? "MP4" : "PDF" })}><option value="video">Video</option><option value="document">Document</option></select></Field>
          <Field label="Category"><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. Onboarding" /></Field>
          <Field label="File type"><select value={f.file_type} onChange={(e) => setF({ ...f, file_type: e.target.value })}>{["MP4", "PDF", "PNG", "JPG"].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="URL"><input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" /></Field>
        </Modal>
      )}
    </>
  );
}
