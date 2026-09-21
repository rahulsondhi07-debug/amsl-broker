import { useState, useEffect, useCallback } from "react";
import { Plus, Droplets, Trash2, Send, CheckCircle2 } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const money = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const STATUSES = ["Draft", "Evidence Gathering", "Submitted", "Agreed", "Refunded", "Rejected"];
const statusTone = (s) => ({ Refunded: "green", Agreed: "green", Submitted: "indigo", "Evidence Gathering": "amber", Rejected: "rose" }[s] || "slate");
const basisTone = (b) => (b === "confirmed" ? "green" : b === "evidence required" ? "amber" : "slate");

const empty = {
  business_id: "", business_name: "", retailer: "", wholesaler: "", spid: "", period: "", days: 91,
  bill_read_type: "Actual", read_start: "", read_end: "", billed_m3: "",
  water_rate_billed: "", water_rate_expected: "", water_standing_billed: "", water_standing_expected: "",
  sewer_rate_billed: "", sewer_rate_expected: "", sewer_standing_billed: "", sewer_standing_expected: "",
  rts_billed_pct: 95, rts_actual_pct: "", rts_evidence: "",
  swd_charged: "", swd_drainage: "Unknown", swd_connected_pct: "", swd_correct_charge: "",
  te_volume_m3: "", te_ot: "", te_st: "", te_os: "", te_ss: "", te_r: "", te_v: "", te_b: "", te_s: "", te_charged: "",
  net_total: "", vat_charged: "", vat_rate_expected: "", backdate_years: "", notes: "",
};

export default function WaterValidation() {
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(() => {
    api.waterList().then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message));
    api.waterSummary().then((r) => setSummary(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (row) => {
    if (!confirm(`Delete ${row.ref}?`)) return;
    try { await api.waterDelete(row.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Water Validation</h1>
          <p className="sub">Check business water bills and claim back overcharges — meter reads, rates, sewerage, surface water drainage and trade effluent.</p>
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> New Water Validation</button>
      </div>

      {summary && (
        <div className="grid cols-4" style={{ marginBottom: 14 }}>
          <Card><div className="sub">Confirmed claims</div><div style={{ fontSize: 22, fontWeight: 800, color: "#0F766E" }}>{money(summary.confirmed)}</div></Card>
          <Card><div className="sub">Potential (needs evidence)</div><div style={{ fontSize: 22, fontWeight: 800, color: "#B45309" }}>{money(summary.potential)}</div></Card>
          <Card><div className="sub">Agreed by retailers</div><div style={{ fontSize: 22, fontWeight: 800 }}>{money(summary.agreed)}</div></Card>
          <Card><div className="sub">Refunded</div><div style={{ fontSize: 22, fontWeight: 800, color: "#0F766E" }}>{money(summary.refunded)}</div></Card>
        </div>
      )}

      {err && <ErrorBanner error={err} onRetry={load} />}
      <Card>
        {!rows ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Ref</th><th>Business</th><th>Retailer</th><th>Period</th><th style={{ textAlign: "right" }}>Confirmed</th><th style={{ textAlign: "right" }}>Potential</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={8} className="sub" style={{ padding: 16, textAlign: "center" }}>No water validations yet.</td></tr>}
                {rows.map((w) => (
                  <tr key={w.id} style={{ cursor: "pointer" }} onClick={() => setViewing(w.id)}>
                    <td className="mono">{w.ref}</td>
                    <td className="name">{w.business_name || "—"}</td>
                    <td style={{ fontSize: 12 }}>{w.retailer || "—"}</td>
                    <td style={{ fontSize: 12 }}>{w.period || "—"}</td>
                    <td className="mono" style={{ textAlign: "right", color: "#0F766E" }}>{money(w.confirmed_claim)}</td>
                    <td className="mono" style={{ textAlign: "right", color: "#B45309" }}>{money(w.potential_claim)}</td>
                    <td><Badge tone={statusTone(w.status)}>{w.status}</Badge></td>
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn ghost sm" onClick={() => del(w)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {showAdd && <WaterForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {viewing && <WaterView id={viewing} onClose={() => { setViewing(null); load(); }} />}
    </>
  );
}

function Findings({ result }) {
  if (!result) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="grid cols-3" style={{ marginBottom: 10 }}>
        <Card><div className="sub">Confirmed this bill</div><div style={{ fontSize: 20, fontWeight: 800, color: "#0F766E" }}>{money(result.confirmed_claim)}</div>
          <div className="sub" style={{ fontSize: 11 }}>{money(result.annualised?.confirmed)} a year</div></Card>
        <Card><div className="sub">Potential — needs evidence</div><div style={{ fontSize: 20, fontWeight: 800, color: "#B45309" }}>{money(result.potential_claim)}</div>
          <div className="sub" style={{ fontSize: 11 }}>{money(result.annualised?.potential)} a year</div></Card>
        <Card><div className="sub">Backdated estimate</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{result.backdated_estimate ? money(result.backdated_estimate.confirmed + result.backdated_estimate.potential) : "—"}</div>
          <div className="sub" style={{ fontSize: 11 }}>{result.backdated_estimate ? `over ${result.backdated_estimate.years} year(s), if the error ran throughout` : "set claim period to estimate"}</div></Card>
      </div>
      {result.findings.length === 0 ? <div className="sub">No issues found on this bill.</div> : (
        <table className="tbl">
          <thead><tr><th>Check</th><th>Basis</th><th>Finding</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>
            {result.findings.map((f, i) => (
              <tr key={i}>
                <td className="name" style={{ fontSize: 12 }}>{f.check}</td>
                <td><Badge tone={basisTone(f.basis)}>{f.basis}</Badge></td>
                <td style={{ fontSize: 12 }}>{f.detail}</td>
                <td className="mono" style={{ textAlign: "right" }}>{f.amount ? money(f.amount) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="sub" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        Only confirmed findings are provable from the bill and actual readings. Potential findings need evidence first — a drainage survey, site plan or sub-meter data —
        and the backdated figure is an estimate: how far back a retailer or wholesaler will refund is for them to decide.
      </div>
    </div>
  );
}

function WaterForm({ onClose, onSaved }) {
  const [f, setF] = useState(empty);
  const [businesses, setBusinesses] = useState([]);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.list("customers", { limit: 300 }).then((r) => setBusinesses(r.data)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const numIn = (k, label, step = "0.01") => (
    <Field label={label}><input type="number" step={step} value={f[k]} onChange={set(k)} /></Field>
  );

  const check = async () => {
    setBusy(true); setErr(null);
    try { const { data } = await api.waterPreview(f); setPreview(data); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const save = async () => {
    if (!f.business_id && !f.business_name) return setErr("Choose or name the business");
    setBusy(true); setErr(null);
    try { await api.waterCreate(f); onSaved(); } catch (e) { setErr(e.message); setBusy(false); }
  };

  const title = (t) => <div className="form-section-title" style={{ gridColumn: "1 / -1" }}>{t}</div>;

  return (
    <Modal title="New Water Validation" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={check}>Check bill</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save validation"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-3">
        {title("Bill details")}
        <Field label="Customer">
          <select value={f.business_id} onChange={(e) => {
            const b = businesses.find((x) => String(x.id) === e.target.value);
            setF({ ...f, business_id: e.target.value, business_name: b?.business_name || f.business_name });
          }}>
            <option value="">— Not linked —</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name}</option>)}
          </select>
        </Field>
        <Field label="Business name"><input value={f.business_name} onChange={set("business_name")} /></Field>
        <Field label="Retailer"><input value={f.retailer} onChange={set("retailer")} placeholder="e.g. Castle Water" /></Field>
        <Field label="Wholesaler (regional company)"><input value={f.wholesaler} onChange={set("wholesaler")} /></Field>
        <Field label="Supply point ID (SPID)"><input value={f.spid} onChange={set("spid")} /></Field>
        <Field label="Billing period"><input value={f.period} onChange={set("period")} placeholder="e.g. Q2 2026" /></Field>
        {numIn("days", "Days in period", "1")}

        {title("Meter reads")}
        <Field label="Bill based on">
          <select value={f.bill_read_type} onChange={set("bill_read_type")}><option>Actual</option><option>Estimated</option></select>
        </Field>
        {numIn("billed_m3", "Volume billed (m³)")}
        {numIn("read_start", "Actual reading — start (m³)")}
        {numIn("read_end", "Actual reading — end (m³)")}

        {title("Water supply")}
        {numIn("water_rate_billed", "Water rate billed (£/m³)", "0.0001")}
        {numIn("water_rate_expected", "Water rate on tariff (£/m³)", "0.0001")}
        {numIn("water_standing_billed", "Standing charge billed (£/day)", "0.0001")}
        {numIn("water_standing_expected", "Standing charge on tariff (£/day)", "0.0001")}

        {title("Sewerage and return to sewer")}
        {numIn("sewer_rate_billed", "Sewerage rate billed (£/m³)", "0.0001")}
        {numIn("sewer_rate_expected", "Sewerage rate on tariff (£/m³)", "0.0001")}
        {numIn("sewer_standing_billed", "Sewerage standing billed (£/day)", "0.0001")}
        {numIn("sewer_standing_expected", "Sewerage standing on tariff (£/day)", "0.0001")}
        {numIn("rts_billed_pct", "Return to sewer charged (%)", "0.1")}
        {numIn("rts_actual_pct", "Return to sewer actual (%)", "0.1")}
        <Field label="Evidence for actual return"><input value={f.rts_evidence} onChange={set("rts_evidence")} placeholder="e.g. sub-meter on process line" /></Field>

        {title("Surface water drainage")}
        {numIn("swd_charged", "Drainage charged this period (£)")}
        <Field label="Site rainwater drains to public sewer">
          <select value={f.swd_drainage} onChange={set("swd_drainage")}>
            <option>Unknown</option><option>Full</option><option>Partial</option><option>None</option>
          </select>
        </Field>
        {f.swd_drainage === "Partial" && numIn("swd_connected_pct", "Share of site draining to sewer (%)", "1")}
        {numIn("swd_correct_charge", "Correct charge if in wrong band (£)")}

        {title("Trade effluent (Mogden formula)")}
        {numIn("te_volume_m3", "Effluent volume (m³)")}
        {numIn("te_charged", "Trade effluent charged (£)")}
        {numIn("te_ot", "COD of effluent, Ot (mg/l)", "1")}
        {numIn("te_st", "Suspended solids, St (mg/l)", "1")}
        {numIn("te_os", "Standard COD, Os (mg/l)", "1")}
        {numIn("te_ss", "Standard solids, Ss (mg/l)", "1")}
        {numIn("te_r", "R — reception (£/m³)", "0.0001")}
        {numIn("te_v", "V — primary treatment (£/m³)", "0.0001")}
        {numIn("te_b", "B — biological (£/m³)", "0.0001")}
        {numIn("te_s", "S — sludge (£/m³)", "0.0001")}

        {title("VAT and claim period")}
        {numIn("net_total", "Bill total before VAT (£)")}
        {numIn("vat_charged", "VAT charged (£)")}
        {numIn("vat_rate_expected", "VAT rate that should apply (%)", "0.1")}
        {numIn("backdate_years", "Years to estimate back", "0.5")}
      </div>
      <div className="sub" style={{ fontSize: 11.5, marginTop: 8 }}>
        Leave any section blank to skip that check. Whether business water attracts VAT depends on the customer's activity, so enter the rate that should apply.
      </div>
      {preview && <Findings result={preview} />}
    </Modal>
  );
}

function WaterView({ id, onClose }) {
  const [row, setRow] = useState(null);
  const [agreed, setAgreed] = useState("");
  const [refunded, setRefunded] = useState("");
  const [err, setErr] = useState(null);
  const load = useCallback(() => {
    api.waterGet(id).then((r) => { setRow(r.data); setAgreed(r.data.agreed_amount ?? ""); setRefunded(r.data.refunded_amount ?? ""); })
      .catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const move = async (status, extra = {}) => {
    try { await api.waterStatus(id, { status, ...extra }); load(); } catch (e) { setErr(e.message); }
  };

  if (!row) return <Modal title="Water validation" onClose={onClose}>{err ? <ErrorBanner error={err} /> : <Spinner />}</Modal>;
  const hasPotential = row.potential_claim > 0;
  return (
    <Modal title={`${row.ref} — ${row.business_name || ""}`} onClose={onClose} wide
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Droplets size={16} />
        <span className="sub" style={{ fontSize: 12.5 }}>{row.retailer || "Retailer not set"} · {row.period || "no period"} · {row.days} days{row.spid ? ` · SPID ${row.spid}` : ""}</span>
        <span style={{ marginLeft: "auto" }}><Badge tone={statusTone(row.status)}>{row.status}</Badge></span>
      </div>
      <Findings result={row.result} />

      <div className="form-section-title" style={{ marginTop: 18 }}>Claim back</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {hasPotential && row.status === "Draft" && (
          <button className="btn" onClick={() => move("Evidence Gathering")}>Start gathering evidence</button>
        )}
        {["Draft", "Evidence Gathering"].includes(row.status) && (
          <button className="btn primary" onClick={() => move("Submitted")}><Send size={14} /> Mark submitted to retailer</button>
        )}
        {["Submitted", "Agreed", "Refunded"].includes(row.status) && (
          <>
            <Field label="Amount agreed (£)"><input type="number" step="0.01" value={agreed} onChange={(e) => setAgreed(e.target.value)} style={{ width: 150 }} /></Field>
            <button className="btn" onClick={() => move("Agreed", { agreed_amount: agreed === "" ? null : Number(agreed) })}>Record agreed</button>
            <Field label="Refund received (£)"><input type="number" step="0.01" value={refunded} onChange={(e) => setRefunded(e.target.value)} style={{ width: 150 }} /></Field>
            <button className="btn primary" onClick={() => move("Refunded", { refunded_amount: refunded === "" ? null : Number(refunded) })}>
              <CheckCircle2 size={14} /> Record refund
            </button>
          </>
        )}
        {row.status !== "Rejected" && row.status !== "Refunded" && (
          <button className="btn ghost" onClick={() => move("Rejected")}>Mark rejected</button>
        )}
      </div>
      {row.submitted_on && <div className="sub" style={{ fontSize: 11.5, marginTop: 8 }}>Submitted {new Date(row.submitted_on).toLocaleDateString("en-GB")}</div>}
    </Modal>
  );
}
