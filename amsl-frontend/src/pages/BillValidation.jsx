import { useState, useEffect } from "react";
import { Plus, ShieldCheck, AlertTriangle, CheckCircle2, FileWarning } from "lucide-react";
import { api } from "../api.js";
import { useList, Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field } from "../components/ui.jsx";

const money = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 }));
const stTone = (s) => /claim/i.test(s) ? "indigo" : /discrep/i.test(s) ? "rose" : /pass/i.test(s) ? "green" : "slate";

export default function BillValidation() {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList("bill-validation", { limit: 10 });
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState(null);

  return (
    <>
      <div className="page-head">
        <div><h1>Bill Validation &amp; Energy Claims</h1><p className="sub">Verify supplier bills against contracted rates and raise claims for overcharges.</p></div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> New Validation</button>
      </div>
      <Card>
        <input placeholder="Search business, ref, supplier…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", marginBottom: 12 }} />
        {error && <ErrorBanner error={error} onRetry={reload} />}
        {loading ? <Spinner /> : data.length === 0 ? (
          <div className="sub" style={{ textAlign: "center", padding: 24 }}>No bill validations yet. Click “New Validation” to check a supplier bill.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Ref</th><th>Business</th><th>Supplier</th><th>Period</th><th>Expected</th><th>Billed</th><th>Variance</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.ref}</td>
                    <td><span className="name">{r.business_name || "—"}</span></td>
                    <td style={{ fontSize: 12 }}>{r.supplier_name || "—"}</td>
                    <td>{r.period || "—"}</td>
                    <td className="mono">{money(r.expected_amount)}</td>
                    <td className="mono">{money(r.billed_amount)}</td>
                    <td className="mono" style={{ fontWeight: 700, color: r.variance > 0.5 ? "#E11D48" : "#059669" }}>{r.variance > 0 ? "+" : ""}{money(r.variance)}</td>
                    <td><Badge tone={stTone(r.status)}>{r.status}</Badge></td>
                    <td><button className="btn ghost sm" onClick={() => setViewing(r)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && <Pager meta={meta} page={page} setPage={setPage} />}
      </Card>
      {showAdd && <NewValidation onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); }} />}
      {viewing && <ViewValidation row={viewing} onClose={() => setViewing(null)} onChanged={() => { setViewing(null); reload(); }} />}
    </>
  );
}

function FindingsTable({ findings }) {
  return (
    <table className="tbl" style={{ marginTop: 6 }}>
      <thead><tr><th>Check</th><th>Line Item</th><th>Contracted / Expected</th><th>Billed</th><th>Delta / Claimable</th><th></th></tr></thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.item}>
            <td><Badge tone={f.category === "CCL" ? "indigo" : f.category === "EII" ? "amber" : f.category === "Volume" ? "slate" : "green"}>{f.category || "Rate"}</Badge></td>
            <td>{f.item}</td>
            <td className="mono">{f.contracted}</td>
            <td className="mono">{f.billed}</td>
            <td className="mono" style={{ fontWeight: 700, color: f.ok ? "#059669" : "#E11D48" }}>{typeof f.delta === "number" ? (f.delta > 0 ? "+" : "") + f.delta : f.delta}</td>
            <td>{f.ok ? <CheckCircle2 size={16} color="#059669" /> : <AlertTriangle size={16} color="#E11D48" />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NewValidation({ onClose, onSaved }) {
  const [contracts, setContracts] = useState([]);
  const [f, setF] = useState({
    contract_id: "", business_name: "", supplier_name: "", utility: "Electricity", meter_mpan_mpr: "",
    period: "", days: 30, billed_consumption: "", billed_standing_charge: "", billed_unit_rate: "", billed_amount: "", vat_rate: 20,
    contracted_unit_rate: "", contracted_standing_charge: "",
    ccl_charged: "", ccl_rate: 0.775, ccl_relief_pct: "", ccl_exempt: false,
    eii_eligible: false, eii_policy_cost: "", eii_relief_pct: 85,
    eac: "", tolerance_pct: 20,
  });
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }); setPreview(null); };

  useEffect(() => { api.list("contracts", { limit: 500 }).then((r) => setContracts(r.data)).catch(() => {}); }, []);

  const pickContract = (e) => {
    const id = e.target.value;
    const c = contracts.find((x) => String(x.id) === String(id));
    setPreview(null);
    setF({
      ...f, contract_id: id,
      business_name: c ? c.business_name : "", supplier_name: c ? c.supplier_name : "",
      utility: c ? c.utility || "Electricity" : f.utility, meter_mpan_mpr: c ? c.meter_mpan_mpr || "" : "",
      contracted_unit_rate: c && c.day_rate != null ? c.day_rate : "", contracted_standing_charge: c && c.standing_charge != null ? c.standing_charge : "",
      eac: c && c.consumption != null ? c.consumption : "",
    });
  };

  const runValidate = async () => {
    setErr(null);
    if (!f.billed_consumption) return setErr("Billed consumption is required to validate");
    try { const r = await api.billValidationPreview(f); setPreview(r.data); }
    catch (e) { setErr(e.message); }
  };

  const save = async () => {
    if (!f.billed_consumption) return setErr("Billed consumption is required");
    setSaving(true); setErr(null);
    try { await api.post("/bill-validation", { ...f, contract_id: f.contract_id || null }); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="New Bill Validation" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={runValidate}><ShieldCheck size={14} /> Validate</button>
        <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Validation"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", marginBottom: 8 }}>Contract & Meter</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Contract">
          <select value={f.contract_id} onChange={pickContract}>
            <option value="">Select contract (auto-fills rates)</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.contract_no} · {c.business_name}</option>)}
          </select>
        </Field>
        <Field label="Business"><input value={f.business_name} onChange={set("business_name")} /></Field>
        <Field label="Supplier"><input value={f.supplier_name} onChange={set("supplier_name")} /></Field>
        <Field label="Utility"><select value={f.utility} onChange={set("utility")}><option>Electricity</option><option>Gas</option></select></Field>
        <Field label="MPAN / MPRN"><input value={f.meter_mpan_mpr} onChange={set("meter_mpan_mpr")} /></Field>
        <Field label="Billing Period"><input value={f.period} onChange={set("period")} placeholder="e.g. Aug 2026" /></Field>
      </div>
      <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", margin: "14px 0 8px" }}>Contracted Rates (agreed)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Contracted Unit Rate (p/kWh)"><input type="number" step="0.01" value={f.contracted_unit_rate} onChange={set("contracted_unit_rate")} /></Field>
        <Field label="Contracted Standing Charge (p/day)"><input type="number" step="0.01" value={f.contracted_standing_charge} onChange={set("contracted_standing_charge")} /></Field>
      </div>
      <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", margin: "14px 0 8px" }}>Billed on the Invoice</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Days in Period"><input type="number" value={f.days} onChange={set("days")} /></Field>
        <Field label="Consumption (kWh) *"><input type="number" value={f.billed_consumption} onChange={set("billed_consumption")} /></Field>
        <Field label="VAT %"><input type="number" value={f.vat_rate} onChange={set("vat_rate")} /></Field>
        <Field label="Billed Unit Rate (p/kWh)"><input type="number" step="0.01" value={f.billed_unit_rate} onChange={set("billed_unit_rate")} /></Field>
        <Field label="Billed Standing Charge (p/day)"><input type="number" step="0.01" value={f.billed_standing_charge} onChange={set("billed_standing_charge")} /></Field>
        <Field label="Billed Amount (£, optional)"><input type="number" step="0.01" value={f.billed_amount} onChange={set("billed_amount")} /></Field>
      </div>

      <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", margin: "14px 0 8px" }}>CCL Exemption &amp; Rebate</div>
      <p className="sub" style={{ fontSize: 11, marginTop: -4, marginBottom: 8 }}>Charities/non-business, low-usage (de minimis) and 100% renewable supplies can be exempt; Climate Change Agreement (CCA) holders get a reduction. If CCL was charged but relief applies, a rebate is claimable.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="CCL Charged on Bill (£)"><input type="number" step="0.01" value={f.ccl_charged} onChange={set("ccl_charged")} /></Field>
        <Field label="CCL Rate (p/kWh)"><input type="number" step="0.001" value={f.ccl_rate} onChange={set("ccl_rate")} /></Field>
        <Field label="CCL Relief % (e.g. CCA elec 92%)"><input type="number" value={f.ccl_relief_pct} onChange={set("ccl_relief_pct")} disabled={f.ccl_exempt} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 8 }}>
        <input type="checkbox" checked={f.ccl_exempt} onChange={set("ccl_exempt")} style={{ width: 16, height: 16, accentColor: "var(--brand,#0E7C7B)" }} /> Fully exempt from CCL (charity / de minimis / 100% renewable)
      </label>

      <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", margin: "14px 0 8px" }}>Energy-Intensive Industry (EII) Relief</div>
      <p className="sub" style={{ fontSize: 11, marginTop: -4, marginBottom: 8 }}>Energy-intensive sectors can claim relief on policy costs (Renewables Obligation, FiT, CfD) carried in the bill.</p>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
        <input type="checkbox" checked={f.eii_eligible} onChange={set("eii_eligible")} style={{ width: 16, height: 16, accentColor: "var(--brand,#0E7C7B)" }} /> Business is an energy-intensive industry (EII eligible)
      </label>
      {f.eii_eligible && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Policy Cost on Bill (£)"><input type="number" step="0.01" value={f.eii_policy_cost} onChange={set("eii_policy_cost")} /></Field>
          <Field label="Relief % (up to ~85%)"><input type="number" value={f.eii_relief_pct} onChange={set("eii_relief_pct")} /></Field>
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", margin: "14px 0 8px" }}>Volume Tolerance</div>
      <p className="sub" style={{ fontSize: 11, marginTop: -4, marginBottom: 8 }}>Checks whether annualised consumption falls within the contract's ± tolerance band around the estimated annual quantity.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Contracted EAC / AQ (kWh/yr)"><input type="number" value={f.eac} onChange={set("eac")} /></Field>
        <Field label="Tolerance ± %"><input type="number" value={f.tolerance_pct} onChange={set("tolerance_pct")} /></Field>
      </div>

      {preview && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: preview.status === "Pass" ? "#E7F7F0" : "#FEECF0", border: `1px solid ${preview.status === "Pass" ? "#059669" : "#E11D48"}22` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {preview.status === "Pass" ? <CheckCircle2 size={18} color="#059669" /> : <FileWarning size={18} color="#E11D48" />}
            <strong style={{ fontSize: 15 }}>{preview.status === "Pass" ? "Bill matches contracted rates" : "Discrepancy found"}</strong>
            <span style={{ marginLeft: "auto", fontWeight: 800, color: preview.total_claim > 0.5 ? "#E11D48" : "#059669" }}>
              Total claimable {money(preview.total_claim)}
            </span>
          </div>
          <FindingsTable findings={preview.findings} />
          {preview.total_claim > 0.5 && (
            <p className="sub" style={{ fontSize: 12, marginTop: 8 }}>
              Claimable breakdown: rate overcharge {money(Math.max(0, preview.variance))}
              {preview.ccl.rebate > 0 ? ` · CCL rebate ${money(preview.ccl.rebate)}` : ""}
              {preview.eii.relief > 0 ? ` · EII relief ${money(preview.eii.relief)}` : ""}
              {!preview.volume.withinTolerance ? ` · volume ${preview.volume.status.toLowerCase()} (${preview.volume.annualised.toLocaleString()} kWh vs ${preview.volume.lower.toLocaleString()}–${preview.volume.upper.toLocaleString()})` : ""}.
              Save this validation, then raise the claim.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function ViewValidation({ row, onClose, onChanged }) {
  const [r, setR] = useState(row);
  const [busy, setBusy] = useState(false);
  const raise = async () => { setBusy(true); try { const res = await api.billValidationRaiseClaim(r.id); setR(res.data); onChanged(); } catch { setBusy(false); } };

  return (
    <Modal title={`Validation ${r.ref}`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Close</button>
        {r.total_claim > 0.5 && r.status !== "Claim Raised" && <button className="btn primary" disabled={busy} onClick={raise}><FileWarning size={14} /> Raise Claim ({money(r.total_claim)})</button>}</>}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <Badge tone={stTone(r.status)}>{r.status}</Badge>
        {r.claim_amount > 0 && <Badge tone="indigo">Claim {money(r.claim_amount)}</Badge>}
        {r.volume_status && r.volume_status !== "N/A" && <Badge tone={/within/i.test(r.volume_status) ? "green" : "rose"}>Volume: {r.volume_status}</Badge>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 20px", fontSize: 13 }}>
        {[["Business", r.business_name], ["Supplier", r.supplier_name], ["Utility", r.utility], ["MPAN/MPRN", r.meter_mpan_mpr], ["Period", r.period], ["Days", r.days]].map(([k, v]) => (
          <div key={k} style={{ padding: "6px 0", borderBottom: "1px solid #EEF1F4" }}><span className="sub">{k}: </span><b>{v || "—"}</b></div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, margin: "14px 0" }}>
        <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: "#F8FAFC" }}><div className="sub" style={{ fontSize: 11 }}>Expected</div><div style={{ fontSize: 20, fontWeight: 800 }}>{money(r.expected_amount)}</div></div>
        <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: "#F8FAFC" }}><div className="sub" style={{ fontSize: 11 }}>Billed</div><div style={{ fontSize: 20, fontWeight: 800 }}>{money(r.billed_amount)}</div></div>
        <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: r.total_claim > 0.5 ? "#FEECF0" : "#E7F7F0" }}><div className="sub" style={{ fontSize: 11 }}>Total Claimable</div><div style={{ fontSize: 20, fontWeight: 800, color: r.total_claim > 0.5 ? "#E11D48" : "#059669" }}>{money(r.total_claim)}</div></div>
      </div>
      <FindingsTable findings={r.findings || []} />
    </Modal>
  );
}
