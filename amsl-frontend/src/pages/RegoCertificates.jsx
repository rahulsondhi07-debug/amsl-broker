import { useState, useEffect, useCallback } from "react";
import { Leaf, ShoppingCart, Plus, Trash2, RotateCcw, Pencil } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const money = (n) => "£" + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mwh = (n) => Number(n || 0).toLocaleString("en-GB") + " MWh";
const STATUS_TONE = { Ordered: "amber", Issued: "indigo", Retired: "green", Cancelled: "rose" };

export default function RegoCertificates() {
  const [tab, setTab] = useState("market");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>REGO Certificates</h1>
          <p className="sub">Buy Renewable Energy Guarantees of Origin across marketplaces. One REGO certifies 1 MWh of renewable generation.</p>
        </div>
      </div>
      <div className="toggle" style={{ marginBottom: 14 }}>
        <button className={tab === "market" ? "active" : ""} onClick={() => setTab("market")}>Marketplace</button>
        <button className={tab === "purchases" ? "active" : ""} onClick={() => setTab("purchases")}>Customer Purchases</button>
      </div>
      {tab === "market" ? <Marketplace /> : <Purchases />}
    </>
  );
}

function Marketplace() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [cfg, setCfg] = useState({});
  const [f, setF] = useState({ marketplace: "", technology: "", vintage_year: "", max_price: "", status: "" });
  const [buying, setBuying] = useState(null);   // offer being purchased
  const [editing, setEditing] = useState(null); // offer being added/edited
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    api.regoOffers(f).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  }, [f]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.configLookups().then((c) => setCfg({
      marketplaces: (c.data["REGO Marketplace"] || []).map((x) => x.value),
      technologies: (c.data["REGO Technology"] || []).map((x) => x.value),
    })).catch(() => {});
  }, []);

  const del = async (row) => {
    if (!confirm(`Remove this ${row.marketplace} offer from the catalogue?`)) return;
    try { await api.regoOfferDelete(row.id); load(); } catch (e) { alert(e.message); }
  };
  const reset = () => setF({ marketplace: "", technology: "", vintage_year: "", max_price: "", status: "" });
  const active = Object.values(f).some(Boolean);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <Card right={<button className="btn primary sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Offer</button>}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <select value={f.marketplace} onChange={set("marketplace")} style={sel}>
          <option value="">All marketplaces</option>
          {(cfg.marketplaces || []).map((m) => <option key={m}>{m}</option>)}
        </select>
        <select value={f.technology} onChange={set("technology")} style={sel}>
          <option value="">All technologies</option>
          {(cfg.technologies || []).map((t) => <option key={t}>{t}</option>)}
        </select>
        <input value={f.vintage_year} onChange={set("vintage_year")} placeholder="Vintage year" style={{ ...sel, width: 130 }} />
        <input value={f.max_price} onChange={set("max_price")} placeholder="Max £/MWh" style={{ ...sel, width: 130 }} />
        <select value={f.status} onChange={set("status")} style={sel}>
          <option value="">Available only</option>
          <option value="all">All statuses</option>
          <option value="Sold Out">Sold Out</option>
          <option value="Withdrawn">Withdrawn</option>
        </select>
        {active && <button className="btn ghost" onClick={reset}><RotateCcw size={14} /> Reset</button>}
      </div>

      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Marketplace</th><th>Technology</th><th>Generator</th><th>Vintage</th>
              <th>Price</th><th>Available</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="state">No offers match these filters.</td></tr>}
              {rows.map((o, i) => (
                <tr key={o.id} style={i === 0 && o.status === "Available" ? { background: "#f0fdf4" } : {}}>
                  <td><span className="mini"><span className="ini sq"><Leaf size={14} /></span><span className="name">{o.marketplace}</span></span></td>
                  <td style={{ fontSize: 12 }}>{o.technology || "—"}</td>
                  <td style={{ fontSize: 12 }}>{o.generator_name || <span className="sub">—</span>}</td>
                  <td className="mono">{o.vintage_year || "—"}</td>
                  <td className="name">{money(o.price_per_mwh)}<span className="sub" style={{ fontWeight: 400 }}>/MWh</span></td>
                  <td className="mono">{o.volume_available != null ? mwh(o.volume_available) : "—"}</td>
                  <td><Badge tone={o.status === "Available" ? "green" : o.status === "Sold Out" ? "slate" : "rose"}>{o.status}</Badge></td>
                  <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn primary sm" disabled={o.status !== "Available"} onClick={() => setBuying(o)}>
                      <ShoppingCart size={13} /> Purchase
                    </button>
                    <button className="btn ghost sm" onClick={() => setEditing(o)}><Pencil size={13} /></button>
                    <button className="btn ghost sm" onClick={() => del(o)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {buying && <PurchaseModal offer={buying} onClose={() => setBuying(null)} onDone={() => { setBuying(null); load(); }} />}
      {(showAdd || editing) && (
        <OfferModal offer={editing} cfg={cfg}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onDone={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
    </Card>
  );
}

const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" };

function PurchaseModal({ offer, onClose, onDone }) {
  const [businesses, setBusinesses] = useState([]);
  const [businessId, setBusinessId] = useState("");
  const [volume, setVolume] = useState("");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.list("customers", { limit: 500 }).then((r) => setBusinesses(r.data)).catch(() => {}); }, []);

  const vol = Number(volume) || 0;
  const total = vol * offer.price_per_mwh;

  const save = async () => {
    if (!businessId) return setErr("Select the customer this purchase is for");
    if (vol <= 0) return setErr("Enter a volume greater than zero");
    setSaving(true); setErr(null);
    try {
      await api.regoPurchaseCreate({
        business_id: Number(businessId), offer_id: offer.id, volume_mwh: vol,
        certificate_ref: ref || null, notes: notes || null,
      });
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Purchase REGOs" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Purchasing…" : "Confirm Purchase"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div style={{ padding: "10px 12px", background: "var(--subtle,#F8FAFC)", border: "1px solid var(--line,#E7EBF0)", borderRadius: 8, marginBottom: 12, fontSize: 12.5 }}>
        <b>{offer.marketplace}</b> · {offer.technology} · vintage {offer.vintage_year}
        {offer.generator_name && <> · {offer.generator_name}</>}
        <div className="sub" style={{ fontSize: 11.5, marginTop: 2 }}>
          {money(offer.price_per_mwh)}/MWh · {offer.volume_available != null ? `${mwh(offer.volume_available)} available` : "volume unlimited"}
        </div>
      </div>
      <div className="grid cols-2">
        <Field label="Customer *">
          <select value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">Select customer…</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name}</option>)}
          </select>
        </Field>
        <Field label="Volume (MWh) *"><input type="number" step="0.01" value={volume} onChange={(e) => setVolume(e.target.value)} autoFocus /></Field>
        <Field label="Certificate Reference"><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Issued by the registry" /></Field>
        <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      {vol > 0 && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="sub" style={{ fontSize: 12 }}>{mwh(vol)} × {money(offer.price_per_mwh)}/MWh</span>
          <span style={{ fontWeight: 800, fontSize: 18, color: "var(--brand,#0E7C7B)" }}>{money(total)}</span>
        </div>
      )}
    </Modal>
  );
}

function OfferModal({ offer, cfg, onClose, onDone }) {
  const [f, setF] = useState({
    marketplace: offer?.marketplace || "", technology: offer?.technology || "",
    country: offer?.country || "United Kingdom", vintage_year: offer?.vintage_year || new Date().getFullYear(),
    price_per_mwh: offer?.price_per_mwh ?? "", volume_available: offer?.volume_available ?? "",
    generator_name: offer?.generator_name || "", status: offer?.status || "Available", notes: offer?.notes || "",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.marketplace) return setErr("Marketplace is required");
    if (f.price_per_mwh === "" || Number(f.price_per_mwh) < 0) return setErr("Enter a valid price per MWh");
    setSaving(true); setErr(null);
    const body = {
      ...f, vintage_year: f.vintage_year ? Number(f.vintage_year) : null,
      price_per_mwh: Number(f.price_per_mwh),
      volume_available: f.volume_available === "" ? null : Number(f.volume_available),
    };
    try {
      if (offer) await api.regoOfferUpdate(offer.id, body);
      else await api.regoOfferCreate(body);
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={offer ? "Edit Offer" : "Add REGO Offer"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Marketplace *">
          <select value={f.marketplace} onChange={set("marketplace")}>
            <option value="">Select marketplace…</option>
            {(cfg.marketplaces || []).map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Technology">
          <select value={f.technology} onChange={set("technology")}>
            <option value="">Select…</option>
            {(cfg.technologies || []).map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Generator Name"><input value={f.generator_name} onChange={set("generator_name")} placeholder="Optional" /></Field>
        <Field label="Country of Origin"><input value={f.country} onChange={set("country")} /></Field>
        <Field label="Vintage Year"><input type="number" value={f.vintage_year} onChange={set("vintage_year")} /></Field>
        <Field label="Price (£ per MWh) *"><input type="number" step="0.01" value={f.price_per_mwh} onChange={set("price_per_mwh")} /></Field>
        <Field label="Volume Available (MWh)"><input type="number" step="0.01" value={f.volume_available} onChange={set("volume_available")} placeholder="Blank = unlimited" /></Field>
        <Field label="Status">
          <select value={f.status} onChange={set("status")}>
            <option>Available</option><option>Sold Out</option><option>Withdrawn</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><input value={f.notes} onChange={set("notes")} /></Field>
    </Modal>
  );
}

function Purchases() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState("");

  const load = useCallback(() => {
    setRows(null);
    api.regoPurchases(status ? { status } : {}).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const setPurchaseStatus = async (row, next) => {
    try { await api.regoPurchaseUpdate(row.id, { status: next }); load(); } catch (e) { alert(e.message); }
  };
  const del = async (row) => {
    if (!confirm(`Cancel this purchase of ${mwh(row.volume_mwh)}? The volume returns to the marketplace offer.`)) return;
    try { await api.regoPurchaseDelete(row.id); load(); } catch (e) { alert(e.message); }
  };

  const totalMwh = rows?.reduce((s, r) => s + Number(r.volume_mwh || 0), 0) || 0;
  const totalCost = rows?.reduce((s, r) => s + Number(r.total_cost || 0), 0) || 0;

  return (
    <Card>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={sel}>
          <option value="">All statuses</option>
          <option>Ordered</option><option>Issued</option><option>Retired</option><option>Cancelled</option>
        </select>
        {rows && rows.length > 0 && (
          <span className="sub" style={{ fontSize: 12 }}>
            {rows.length} purchase(s) · <b>{mwh(totalMwh)}</b> · <b>{money(totalCost)}</b>
          </span>
        )}
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Customer</th><th>Marketplace</th><th>Technology</th><th>Vintage</th>
              <th>Volume</th><th>Price</th><th>Total</th><th>Purchased</th><th>Ref</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={11} className="state">No REGO purchases recorded yet.</td></tr>}
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="name">{p.business_name || "—"}</td>
                  <td style={{ fontSize: 12 }}>{p.marketplace || "—"}</td>
                  <td style={{ fontSize: 12 }}>{p.technology || "—"}</td>
                  <td className="mono">{p.vintage_year || "—"}</td>
                  <td className="mono">{mwh(p.volume_mwh)}</td>
                  <td className="mono">{money(p.price_per_mwh)}</td>
                  <td className="name">{money(p.total_cost)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{p.purchase_date ? new Date(p.purchase_date).toLocaleDateString("en-GB") : "—"}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{p.certificate_ref || <span className="sub">—</span>}</td>
                  <td>
                    <select value={p.status} onChange={(e) => setPurchaseStatus(p, e.target.value)}
                      style={{ fontSize: 11.5, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--line,#E7EBF0)" }}>
                      <option>Ordered</option><option>Issued</option><option>Retired</option><option>Cancelled</option>
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn ghost sm" title="Cancel purchase" onClick={() => del(p)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
