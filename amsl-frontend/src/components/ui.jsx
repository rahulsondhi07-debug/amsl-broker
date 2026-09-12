import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { api } from "../api.js";

export function Card({ title, right, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <h3>{title}</h3>
          {right}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = "indigo" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="state">
      <div className="spinner" />
      {label}
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  return (
    <div className="error-banner">
      {String(error)}
      {onRetry && (
        <>
          {" "}
          <button className="btn ghost sm" onClick={onRetry}>Retry</button>
        </>
      )}
      <div style={{ marginTop: 6, fontSize: 12, color: "#9f1239" }}>
        Is the backend running at <code>{api.base}</code>? Start it with <code>npm start</code>.
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={wide ? { maxWidth: 720, width: "92vw" } : undefined}>
        <div className="m-head">
          <h3 style={{ fontSize: 16 }}>{title}</h3>
          <button className="btn ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="m-body">{children}</div>
        {footer && <div className="m-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

// Shared "set / reset password" prompt for agents — used from the Agents list, an agent's
// own detail page, and the Authorized Agents table on Agency Detail. Calls onSave(password)
// and lets the caller decide the actual API call (agents store password_hash, never the
// plain value, so callers should PUT { password } and let the backend hash it).
export function SetPasswordModal({ title = "Set Password", onClose, onSave }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (pw.length < 6) return setErr("Password must be at least 6 characters");
    if (pw !== confirm) return setErr("Passwords don't match");
    setSaving(true); setErr(null);
    try { await onSave(pw); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };
  return (
    <Modal title={title} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Password"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <Field label="New Password"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
      <Field label="Confirm Password"><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
    </Modal>
  );
}

/* data hook: fetches a list resource with page/limit/search */
export function useList(resource, { limit = 10, deps = [] } = {}) {
  const [state, setState] = useState({ data: [], meta: {}, loading: true, error: null });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    api.list(resource, { page, limit, q })
      .then((r) => setState({ data: r.data, meta: r.meta || {}, loading: false, error: null }))
      .catch((e) => setState({ data: [], meta: {}, loading: false, error: e.message }));
  }, [resource, page, limit, q]); // eslint-disable-line

  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line

  return { ...state, page, setPage, q, setQ, reload: load };
}

export function Pager({ meta, page, setPage }) {
  if (!meta || !meta.total) return null;
  const pages = meta.pages || 1;
  return (
    <div className="pager">
      <span>
        Showing {(page - 1) * (meta.limit || 10) + 1}–{Math.min(page * (meta.limit || 10), meta.total)} of {meta.total}
      </span>
      <div className="btns">
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span style={{ padding: "5px 8px" }}>{page} / {pages}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "–";
}
