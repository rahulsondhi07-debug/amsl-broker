import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Bitcoin, Landmark, RotateCcw, Pencil } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "./ui.jsx";

const money = (n, ccy = "GBP") =>
  (ccy === "GBP" ? "£" : "") + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isCrypto = (m) => String(m || "").toLowerCase().includes("crypto");
const TONE = { "Awaiting Supplier": "slate", "Ready to Pay": "amber", Paid: "green", Failed: "rose", "On Hold": "indigo" };
const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" };

export default function AgencyPayoutsTab() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ agency_id: "", status: "", payment_method: "" });
  const [agencies, setAgencies] = useState([]);
  const [cfg, setCfg] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setRows(null);
    api.agencyPayouts(f).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  }, [f]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.list("agencies", { limit: 300 }).then((r) => setAgencies(r.data)).catch(() => {});
    api.configLookups().then((c) => setCfg({
      methods: (c.data["Agency Payout Method"] || []).map((x) => x.value),
      coins: (c.data["Cryptocurrency"] || []).map((x) => x.value),
      networks: (c.data["Crypto Network"] || []).map((x) => x.value),
      statuses: (c.data["Agency Payout Status"] || []).map((x) => x.value),
    })).catch(() => {});
  }, []);

  const del = async (row) => {
    if (!confirm(`Delete this payout to ${row.agency_name}?`)) return;
    try { await api.agencyPayoutDelete(row.id); load(); } catch (e) { alert(e.message); }
  };
  const setStatus = async (row, status) => {
    try { await api.agencyPayoutUpdate(row.id, { status }); load(); }
    catch (e) { alert(e.message); load(); }
  };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const active = Object.values(f).some(Boolean);
  const owed = rows?.filter((r) => r.status !== "Paid").reduce((s, r) => s + Number(r.net_amount || 0), 0) || 0;
  const paid = rows?.filter((r) => r.status === "Paid").reduce((s, r) => s + Number(r.net_amount || 0), 0) || 0;

  return (
    <Card right={<button className="btn primary sm" onClick={() => setShowAdd(true)}><Plus size={14} /> New Payout</button>}>
      <p className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
        Commission owed to agencies. A payout can only be marked Paid once the supplier payment date is recorded —
        we pay agencies out of money we've actually received.
      </p>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={f.agency_id} onChange={set("agency_id")} style={sel}>
          <option value="">All agencies</option>
          {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={f.status} onChange={set("status")} style={sel}>
          <option value="">All statuses</option>
          {(cfg.statuses || []).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={f.payment_method} onChange={set("payment_method")} style={sel}>
          <option value="">All methods</option>
          {(cfg.methods || []).map((m) => <option key={m}>{m}</option>)}
        </select>
        {active && <button className="btn ghost" onClick={() => setF({ agency_id: "", status: "", payment_method: "" })}><RotateCcw size={14} /> Reset</button>}
        {rows && rows.length > 0 && (
          <span className="sub" style={{ fontSize: 12, marginLeft: "auto" }}>
            Outstanding <b>{money(owed)}</b> · Paid <b>{money(paid)}</b>
          </span>
        )}
      </div>

      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Agency</th><th>Supplier</th><th>Net</th><th>Method</th><th>Crypto Detail</th>
              <th>Supplier Paid</th><th>Paid On</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="state">No agency payouts recorded yet.</td></tr>}
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="name">{p.agency_name || "—"}</td>
                  <td style={{ fontSize: 12 }}>{p.supplier_name || "—"}</td>
                  <td className="name">{money(p.net_amount)}</td>
                  <td>
                    <span className="mini">
                      <span className="ini sq">{isCrypto(p.payment_method) ? <Bitcoin size={13} /> : <Landmark size={13} />}</span>
                      <span style={{ fontSize: 12 }}>{p.payment_method}</span>
                    </span>
                  </td>
                  <td style={{ fontSize: 11.5 }}>
                    {isCrypto(p.payment_method) ? (
                      <>
                        <div><b>{p.crypto_amount ?? "—"}</b> {(p.crypto_currency || "").split(" ")[0]}</div>
                        <div className="sub">{p.crypto_network || "—"}{p.exchange_rate ? ` · @ ${money(p.exchange_rate)}` : ""}</div>
                        {p.wallet_address && <div className="sub mono" style={{ fontSize: 10 }} title={p.wallet_address}>{p.wallet_address.slice(0, 10)}…{p.wallet_address.slice(-6)}</div>}
                        {p.tx_hash && <div className="sub mono" style={{ fontSize: 10 }} title={p.tx_hash}>tx {p.tx_hash.slice(0, 10)}…</div>}
                      </>
                    ) : <span className="sub">—</span>}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{p.supplier_paid_on ? new Date(p.supplier_paid_on).toLocaleDateString("en-GB") : <span className="sub">—</span>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{p.paid_on ? new Date(p.paid_on).toLocaleDateString("en-GB") : <span className="sub">—</span>}</td>
                  <td>
                    <select value={p.status} onChange={(e) => setStatus(p, e.target.value)}
                      style={{ fontSize: 11.5, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--line,#E7EBF0)" }}>
                      {(cfg.statuses || ["Awaiting Supplier", "Ready to Pay", "Paid", "Failed", "On Hold"]).map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <div style={{ marginTop: 2 }}><Badge tone={TONE[p.status] || "slate"}>{p.status}</Badge></div>
                  </td>
                  <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn ghost sm" onClick={() => setEditing(p)}><Pencil size={13} /></button>
                    <button className="btn ghost sm" onClick={() => del(p)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <PayoutModal payout={editing} agencies={agencies} cfg={cfg}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
    </Card>
  );
}

function PayoutModal({ payout, agencies, cfg, onClose, onSaved }) {
  const [f, setF] = useState({
    agency_id: payout?.agency_id || "", supplier_id: payout?.supplier_id || "",
    gross_amount: payout?.gross_amount ?? "", vat_amount: payout?.vat_amount ?? "",
    payment_method: payout?.payment_method || "BACS",
    supplier_paid_on: payout?.supplier_paid_on || "", status: payout?.status || "Awaiting Supplier",
    reference: payout?.reference || "",
    crypto_currency: payout?.crypto_currency || "", crypto_network: payout?.crypto_network || "",
    wallet_address: payout?.wallet_address || "", exchange_rate: payout?.exchange_rate ?? "",
    tx_hash: payout?.tx_hash || "", notes: payout?.notes || "",
  });
  const [suppliers, setSuppliers] = useState([]);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.list("suppliers", { limit: 300 }).then((r) => setSuppliers(r.data)).catch(() => {}); }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const crypto = isCrypto(f.payment_method);
  const net = (Number(f.gross_amount) || 0) - (Number(f.vat_amount) || 0);
  const coinAmount = crypto && Number(f.exchange_rate) > 0 ? net / Number(f.exchange_rate) : null;

  // Pre-fill wallet details from the agency's saved defaults when switching to crypto.
  const onAgency = (e) => {
    const id = e.target.value;
    const a = agencies.find((x) => String(x.id) === String(id));
    setF((p) => ({
      ...p, agency_id: id,
      payment_method: a?.payout_method || p.payment_method,
      crypto_currency: a?.crypto_currency || p.crypto_currency,
      crypto_network: a?.crypto_network || p.crypto_network,
      wallet_address: a?.wallet_address || p.wallet_address,
    }));
  };

  const save = async () => {
    if (!f.agency_id) return setErr("Select an agency");
    if (!f.gross_amount || Number(f.gross_amount) <= 0) return setErr("Enter a gross amount");
    setSaving(true); setErr(null);
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const body = {
      agency_id: Number(f.agency_id), supplier_id: num(f.supplier_id),
      gross_amount: Number(f.gross_amount), vat_amount: Number(f.vat_amount) || 0,
      payment_method: f.payment_method, supplier_paid_on: f.supplier_paid_on || null,
      status: f.status, reference: f.reference || null,
      crypto_currency: crypto ? f.crypto_currency || null : null,
      crypto_network: crypto ? f.crypto_network || null : null,
      wallet_address: crypto ? f.wallet_address || null : null,
      exchange_rate: crypto ? num(f.exchange_rate) : null,
      tx_hash: crypto ? f.tx_hash || null : null,
      notes: f.notes || null,
    };
    try {
      if (payout) await api.agencyPayoutUpdate(payout.id, body);
      else await api.agencyPayoutCreate(body);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={payout ? "Edit Payout" : "New Agency Payout"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Payout"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Agency *">
          <select value={f.agency_id} onChange={onAgency}>
            <option value="">Select agency…</option>
            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Supplier (source of the commission)">
          <select value={f.supplier_id} onChange={set("supplier_id")}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Gross Amount (£) *"><input type="number" step="0.01" value={f.gross_amount} onChange={set("gross_amount")} /></Field>
        <Field label="VAT (£)"><input type="number" step="0.01" value={f.vat_amount} onChange={set("vat_amount")} /></Field>
        <Field label="Supplier Paid Us On"><input type="date" value={f.supplier_paid_on} onChange={set("supplier_paid_on")} /></Field>
        <Field label="Payment Method">
          <select value={f.payment_method} onChange={set("payment_method")}>
            {(cfg.methods || ["BACS", "Faster Payments", "CHAPS", "Cheque", "Cryptocurrency"]).map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={set("status")}>
            {(cfg.statuses || ["Awaiting Supplier", "Ready to Pay", "Paid", "Failed", "On Hold"]).map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Reference"><input value={f.reference} onChange={set("reference")} /></Field>
      </div>

      <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: "var(--subtle,#F8FAFC)", border: "1px solid var(--line,#E7EBF0)", display: "flex", justifyContent: "space-between" }}>
        <span className="sub" style={{ fontSize: 12 }}>Net payable to agency</span>
        <b style={{ fontSize: 16, color: "var(--brand,#0E7C7B)" }}>{money(net)}</b>
      </div>

      {crypto && (
        <div style={{ marginTop: 10, padding: "12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
            <Bitcoin size={14} /> Cryptocurrency Payment
          </div>
          <div className="sub" style={{ fontSize: 11, marginBottom: 10 }}>
            Check the network carefully — sending to the right address on the wrong chain will lose the funds.
          </div>
          <div className="grid cols-2">
            <Field label="Coin">
              <select value={f.crypto_currency} onChange={set("crypto_currency")}>
                <option value="">Select…</option>
                {(cfg.coins || []).map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Network *">
              <select value={f.crypto_network} onChange={set("crypto_network")}>
                <option value="">Select…</option>
                {(cfg.networks || []).map((n) => <option key={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Exchange Rate (£ per coin)"><input type="number" step="0.01" value={f.exchange_rate} onChange={set("exchange_rate")} /></Field>
            <Field label="Transaction Hash"><input value={f.tx_hash} onChange={set("tx_hash")} placeholder="Required to mark as Paid" /></Field>
          </div>
          <Field label="Wallet Address *"><input className="mono" value={f.wallet_address} onChange={set("wallet_address")} /></Field>
          {coinAmount != null && (
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span className="sub">Coin amount to send</span>
              <b>{coinAmount.toFixed(8)} {(f.crypto_currency || "").split(" ")[0]}</b>
            </div>
          )}
        </div>
      )}
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}
