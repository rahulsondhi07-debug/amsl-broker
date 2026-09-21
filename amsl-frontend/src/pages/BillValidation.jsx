import { useState, useEffect, useCallback } from "react";
import { Plus, ShieldCheck, AlertTriangle, CheckCircle2, FileWarning, FileText, Send, Trash2, Calculator } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const money = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 }));
const stTone = (s) => (/claim/i.test(s || "") ? "indigo" : /discrep/i.test(s || "") ? "rose" : /pass/i.test(s || "") ? "green" : "slate");
const checkTone = (c) => ({ Rate: "amber", Meter: "amber", VAT: "indigo", TNUoS: "indigo", DUoS: "indigo", NCC: "green", CCL: "indigo", EII: "green", Volume: "rose", Duplicate: "rose", "Meter Data": "rose",
  Capacity: "amber", "Excess capacity": "amber", "Reactive power": "amber", Arithmetic: "rose" }[c] || "slate");

const emptyForm = {
  contract_id: "", business_name: "", supplier_name: "", utility: "ELECTRICITY", meter_mpan_mpr: "",
  period: "", days: 30, billed_consumption: "", billed_standing_charge: "", billed_unit_rate: "",
  contracted_unit_rate: "", contracted_standing_charge: "",
  meter_reading_start: "", meter_reading_end: "",
  vat_rate: 20, vat_rate_expected: 20,
  tnuos_charged: "", tnuos_rate: "", duos_charged: "", duos_rate: "", bsuos_charged: "",
  ccl_charged: "", ccl_exempt: false, ccl_relief_pct: "",
  eii_eligible: false, eii_policy_cost: "", eii_relief_pct: 85,
  eac: "", tolerance_pct: 20, notes: "",
  client_name: "", client_address: "", client_company_reg: "",
  business_activity: "", sic_code: "",
  // Capacity trio (HH sites) and the parsed bill lines for arithmetic reconciliation.
  asc_kva: "", capacity_rate: "", capacity_charged: "",
  excess_kva: "", excess_rate: "", excess_charged: "",
  reactive_kvarh: "", reactive_rate: "", reactive_charged: "",
  rows_json: "",
};

export default function BillValidation() {
  const [showReconcile, setShowReconcile] = useState(false);
  const [rows, setRows] = useState(null);
  const [totals, setTotals] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [refGuide, setRefGuide] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [certMatch, setCertMatch] = useState(undefined); // undefined=unchecked, null=checked no match, object=matched
  const [sicMatch, setSicMatch] = useState(undefined); // undefined=unchecked, null=checked no match, object=matched
  const [govLinks, setGovLinks] = useState(null);
  const [billFile, setBillFile] = useState(null);
  const [docModal, setDocModal] = useState(null); // { kind: 'pp11'|'eii', missingFields: [...], values: {...}, text }
  const [batchModal, setBatchModal] = useState(null); // { shared: {...}, sites: [...], results: null|[...] }
  const [bizTestModal, setBizTestModal] = useState(null); // { consumption_mwh, gva, result }
  const [schoolModal, setSchoolModal] = useState(null); // { answers: {...}, result }
  const [ccaRatesModal, setCcaRatesModal] = useState(false);
  const [ccaRates, setCcaRates] = useState(null);
  const [claimStages, setClaimStages] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    api.billValidationList().then((r) => { setRows(r.data.rows); setTotals(r.data.totals); }).catch((e) => setErr(e.message));
    api.list("contracts", { limit: 200 }).then((r) => setContracts(r.data)).catch(() => {});
    api.billValidationActivities().then((r) => setRefGuide(r.data)).catch(() => {});
    api.billValidationGovLinks().then((r) => setGovLinks(r.data)).catch(() => {});
    api.billValidationCcaRates().then((r) => setCcaRates(r.data)).catch(() => {});
    api.billValidationClaimStages().then((r) => setClaimStages(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => {
    const v = e && e.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const lookupSic = async (code) => {
    setForm((f) => ({ ...f, sic_code: code }));
    if (!code.trim()) { setSicMatch(undefined); return; }
    try {
      const { data } = await api.billValidationSicLookup(code.trim());
      setSicMatch(data.match);
      if (data.match) {
        setForm((f) => ({ ...f, eii_eligible: data.match.scheme === "EII" || data.match.scheme === "BOTH" ? true : f.eii_eligible }));
      }
    } catch { setSicMatch(undefined); }
  };

  const checkCertMatch = async (msid, periodDateGuess) => {
    if (!msid) { setCertMatch(undefined); return; }
    try {
      const { data } = await api.eiiCertificateMatch(msid, periodDateGuess || undefined);
      setCertMatch(data);
      if (data) {
        setForm((f) => ({ ...f, eii_eligible: true, eii_relief_pct: data.proportion_exempt_pct }));
      }
    } catch { setCertMatch(undefined); }
  };

  const onContractChange = (id) => {
    const c = contracts.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f, contract_id: id,
      business_name: c ? c.business_name : f.business_name,
      supplier_name: c ? c.supplier_name : f.supplier_name,
      utility: c ? c.utility : f.utility,
      meter_mpan_mpr: c ? c.meter_mpan_mpr : f.meter_mpan_mpr,
      contracted_unit_rate: c ? (c.day_rate ?? "") : f.contracted_unit_rate,
      contracted_standing_charge: c ? (c.standing_charge ?? "") : f.contracted_standing_charge,
      eac: c ? (c.consumption ?? "") : f.eac,
      tolerance_pct: c && c.tolerance_pct != null ? c.tolerance_pct : f.tolerance_pct,
    }));
    if (c && c.meter_mpan_mpr) checkCertMatch(c.meter_mpan_mpr);
  };

  const onActivityChange = (activityName) => {
    const found = refGuide && refGuide.activities.find((a) => a.activity === activityName);
    const scheme = found ? found.scheme : "";
    setForm((f) => ({
      ...f, business_activity: activityName,
      eii_eligible: scheme === "EII" || scheme === "BOTH" ? true : f.eii_eligible,
    }));
  };

  /**
   * Prefill the form from a PDF bill. Mapping follows the Phase 2 handoff with two
   * deliberate corrections:
   *  - The "Published TNUoS/DUoS rate" fields take the PUBLISHED schedule rate, not the
   *    rate printed on the bill. Comparing a bill with its own rate can never find an
   *    overcharge, so the handoff's mapping would have silently disabled that check.
   *    Where there is no firm published rate the field is left for a person to fill.
   *  - The meter field takes the full 13-digit MPAN, not the 2-digit prefix, which would
   *    fail the validator's format check and raise a false Meter Data finding.
   * Contracted rates are never prefilled: they come from the contract/LOA and are the
   * basis of the comparison.
   */
  const [prefill, setPrefill] = useState(null);   // { busy, name, msg, warnings, filled }
  const prefillFromPdf = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setPrefill({ msg: "That PDF is over 10MB." });
    setPrefill({ busy: true, name: file.name });
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("Could not read the file"));
        r.readAsDataURL(file);
      });
      const { data } = await api.bvReconcilePdf(b64, file.name);
      const x = data.fields;
      const rows = x.rows || [];
      const row = (k) => rows.find((r) => r.key === k) || {};
      const ref = (k) => (data.reference || []).find((c) => c.key === k);
      // Only a firm, non-zero published rate is usable as the comparison basis.
      const firm = (k) => { const c = ref(k); return c && c.reference && !c.isEstimate ? c.reference : null; };
      const v = (n) => (n == null || !Number.isFinite(Number(n)) ? undefined : Math.round(Number(n) * 1000) / 1000);
      const period = x.period_from
        ? new Date(x.period_from).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : undefined;

      const patch = {
        utility: x.fuel === "gas" ? "GAS" : "ELECTRICITY",
        meter_mpan_mpr: x.mpan || x.mprn || undefined,
        period, days: v(x.billDays), billed_consumption: v(x.consumption_kwh),
        vat_rate: v(x.vat_rate),
        billed_unit_rate: v(row("day_unit").rate),
        // Standing charge and DUoS are separate rows — keeping them apart stops the
        // distribution fixed charge being counted twice.
        billed_standing_charge: v(row("standing").rate),
        duos_charged: v(row("dist_fixed").subtotal), duos_rate: v(firm("dist_fixed")),
        tnuos_charged: v(row("tnuos_fixed").subtotal), tnuos_rate: v(firm("tnuos_fixed")),
        bsuos_charged: v(row("bsuos").subtotal),
        ccl_charged: v(row("ccl").subtotal),
        asc_kva: v(row("capacity").quantity ?? x.asc_kva), capacity_rate: v(row("capacity").rate), capacity_charged: v(row("capacity").subtotal),
        excess_kva: v(row("excess_capacity").quantity), excess_rate: v(row("excess_capacity").rate), excess_charged: v(row("excess_capacity").subtotal),
        reactive_kvarh: v(row("reactive_capacity").quantity), reactive_rate: v(row("reactive_capacity").rate), reactive_charged: v(row("reactive_capacity").subtotal),
      };
      const filled = Object.entries(patch).filter(([, val]) => val !== undefined && val !== "");
      setForm((f) => ({
        ...f,
        ...Object.fromEntries(filled),
        rows_json: JSON.stringify({ rows, subtotal: x.subtotal, vat_total: x.vat_total, total: x.total, billDays: x.billDays }),
      }));
      const noPublished = [];
      if (row("dist_fixed").rate != null && !firm("dist_fixed")) noPublished.push("DUoS");
      if (row("tnuos_fixed").rate != null && !firm("tnuos_fixed")) noPublished.push("TNUoS");
      setPrefill({
        name: file.name, filled: filled.length,
        msg: `Prefilled ${filled.length} field(s) and ${rows.length} bill line(s) for arithmetic checks. Now add the contracted rates from the contract or LOA, then Validate.`,
        warnings: [
          ...(data.warnings || []),
          ...(noPublished.length ? [`No firm published rate for ${noPublished.join(" and ")} — enter it from the DNO/NESO statement, or that pass-through check will be skipped.`] : []),
        ],
      });
    } catch (err) {
      setPrefill({ name: file.name, msg: `Could not read the PDF: ${err.message}` });
    }
  };

  const runPreview = async () => {
    setPreviewing(true);
    try { const { data } = await api.billValidationPreview(form); setPreview(data); }
    catch (e) { setPreview({ error: e.message }); }
    setPreviewing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.billValidationCreate(form);
      if (billFile) await api.billValidationUploadBill(data.id, billFile.name);
      setShowAdd(false); setForm(emptyForm); setPreview(null); setBillFile(null); load();
    }
    catch (e) { setPreview({ error: e.message }); }
    setSaving(false);
  };

  const raiseClaim = async (id) => { await api.billValidationRaiseClaim(id); load(); setViewing(null); };

  const downloadLoa = async (row) => {
    const { data } = await api.billValidationLoa(row.id);
    const blob = new Blob([data.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `LOA-${row.ref}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const sendLoa = async (row) => {
    const { data } = await api.billValidationSendLoa(row.id, {});
    setViewing(data); load();
  };

  const raiseQuery = async (row) => {
    const notes = prompt("Notes for the supplier query (optional):", "");
    const { data } = await api.billValidationRaiseQuery(row.id, { notes });
    setViewing(data); load();
  };
  const resolveQuery = async (row) => {
    const { data } = await api.billValidationResolveQuery(row.id, {});
    setViewing(data); load();
  };

  const FIELD_LABELS = {
    address_line1: "Business address (line 1)", address_line2: "Address line 2 (optional)", address_line3: "Address line 3 (optional)",
    postcode: "Postcode",
    responsible_person: "Responsible person's full name", phone: "Phone number",
    account_reference: "Account reference number", date_from: "Date relief applies from",
    company_number: "Company registration number", eligible_product: "Eligible product description",
  };

  const openDocGenerator = async (kind, row) => {
    const call = kind === "pp11" ? api.billValidationGeneratePp11 : api.billValidationGenerateEiiSummary;
    const { data } = await call(row.id, {});
    setDocModal({ kind, row, missing: data.missing, values: {}, text: data.text });
  };

  const regenerateDoc = async () => {
    const call = docModal.kind === "pp11" ? api.billValidationGeneratePp11 : api.billValidationGenerateEiiSummary;
    const { data } = await call(docModal.row.id, docModal.values);
    setDocModal((m) => ({ ...m, missing: data.missing, text: data.text }));
  };

  const downloadDoc = () => {
    const blob = new Blob([docModal.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${docModal.kind.toUpperCase()}-${docModal.row.ref}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const emptySite = () => ({ address_line1: "", address_line2: "", address_line3: "", postcode: "", account_reference: "", meter_number: "", date_from: "" });
  const runBizTest = async () => {
    const { data } = await api.billValidationEiiBusinessTest({ consumption_mwh: bizTestModal.consumption_mwh, gva: bizTestModal.gva });
    setBizTestModal((m) => ({ ...m, result: data }));
  };
  const checkSchoolEligibility = async () => {
    const { data } = await api.billValidationSchoolEligibility(schoolModal.answers);
    setSchoolModal((m) => ({ ...m, result: data }));
  };
  const advanceStage = async (row, stage) => {
    let payment_amount;
    if (stage === "payment_received") {
      const amt = prompt("Payment amount received (£):", "");
      if (amt === null) return;
      payment_amount = amt;
    }
    const { data } = await api.billValidationSetStage(row.id, { stage, payment_amount });
    setViewing(data); load();
  };
  const setShared = (k) => (e) => setBatchModal((m) => ({ ...m, shared: { ...m.shared, [k]: e.target.value } }));
  const setSite = (i, k) => (e) => setBatchModal((m) => { const sites = [...m.sites]; sites[i] = { ...sites[i], [k]: e.target.value }; return { ...m, sites }; });
  const addSite = () => setBatchModal((m) => ({ ...m, sites: [...m.sites, emptySite()] }));
  const removeSite = (i) => setBatchModal((m) => ({ ...m, sites: m.sites.filter((_, idx) => idx !== i) }));
  const generateBatch = async () => {
    const { data } = await api.billValidationGeneratePp11Batch({ shared: batchModal.shared, sites: batchModal.sites });
    setBatchModal((m) => ({ ...m, results: data }));
  };
  const downloadBatch = () => {
    const combined = batchModal.results.map((r) => r.text).join("\n\n" + "=".repeat(60) + "\n\n");
    const blob = new Blob([combined], { type: "text/plain" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `PP11-batch-${(batchModal.shared.business_name || "sites").replace(/\s+/g, "-")}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  if (err && !rows) return <ErrorBanner error={err} onRetry={load} />;
  if (!rows) return <Spinner />;

  return (
    <>
      {showReconcile && <ReconcileModal onClose={() => setShowReconcile(false)} />}
      <div className="page-head">
        <div>
          <h2>Bill Validation &amp; Energy Claims</h2>
          <p className="sub">Validate supplier bills against contracted rates and raise claims for overcharges, CCL rebates, and EII relief.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setBatchModal({ shared: { business_name: "", responsible_person: "", phone: "", supplier_name: "", relief_pct: "", utility: "ELECTRICITY" }, sites: [emptySite()], results: null })}>
            <FileText size={16} /> Batch PP11 (multi-site)
          </button>
          <button className="btn" onClick={() => setShowReconcile(true)}>
            <Calculator size={16} /> Reconcile Bill
          </button>
          <button className="btn primary" onClick={() => { setForm(emptyForm); setPreview(null); setCertMatch(undefined); setSicMatch(undefined); setBillFile(null); setPrefill(null); setShowAdd(true); }}>
            <Plus size={16} /> New Validation
          </button>
        </div>
      </div>

      {totals && (
        <div className="grid stat-grid" style={{ marginBottom: 16 }}>
          <Card><div className="sub">Validations</div><div style={{ fontSize: 22, fontWeight: 800 }}>{totals.n}</div></Card>
          <Card><div className="sub">Discrepancies</div><div style={{ fontSize: 22, fontWeight: 800, color: "#E11D48" }}>{totals.discrepancies || 0}</div></Card>
          <Card><div className="sub">Total Claimable</div><div style={{ fontSize: 22, fontWeight: 800 }}>{money(totals.total_claimable)}</div></Card>
          <Card><div className="sub">Claims Raised</div><div style={{ fontSize: 22, fontWeight: 800, color: "#0F766E" }}>{money(totals.raised)}</div></Card>
        </div>
      )}

      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th>Ref</th><th>Business</th><th>Supplier</th><th>Utility</th><th>Period</th>
              <th>Expected</th><th>Billed</th><th>Total Claimable</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="sub" style={{ padding: 20, textAlign: "center" }}>No validations yet — run one with "New Validation".</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.ref}</td>
                <td>{r.business_name || "—"}</td>
                <td>{r.supplier_name || "—"}</td>
                <td>{r.utility || "—"}</td>
                <td>{r.period || "—"}</td>
                <td>{money(r.expected_amount)}</td>
                <td>{money(r.billed_amount)}</td>
                <td style={{ fontWeight: 700, color: r.total_claim > 0.5 ? "#E11D48" : "#0F766E" }}>{money(r.total_claim)}</td>
                <td><Badge tone={stTone(r.status)}>{r.status}</Badge></td>
                <td><button className="btn ghost sm" onClick={() => setViewing(r)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showAdd && (
        <Modal title="New Bill Validation" onClose={() => setShowAdd(false)} wide
          footer={<>
            <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn" onClick={runPreview} disabled={previewing}>{previewing ? "Validating…" : "Validate"}</button>
            <button className="btn primary" onClick={save} disabled={saving || !preview || preview.error}>{saving ? "Saving…" : "Save"}</button>
          </>}>
          <div style={{
            position: "sticky", top: -20, zIndex: 5, background: "#fff", margin: "-20px -20px 14px", padding: "10px 20px",
            borderBottom: "1px solid #EEF1F4", display: "flex", flexWrap: "wrap", gap: 6,
          }}>
            {[
              ["sec-meter", "Meter Reading"], ["sec-vat", "VAT"], ["sec-passthrough", "TNUoS/DUoS"],
              ["sec-activity", "Activity"], ["sec-upload", "Upload"], ["sec-ccl", "CCL"],
              ["sec-capacity", "Capacity"], ["sec-eii", "EII"], ["sec-volume", "Volume"], ["sec-client", "Client / LOA"],
            ].map(([id, label]) => (
              <button key={id} className="btn ghost sm" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                {label}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 12,
            border: "2px dashed var(--line,#CBD5E1)", borderRadius: 10, cursor: prefill?.busy ? "wait" : "pointer", background: "#F8FAFC" }}>
            <FileText size={20} style={{ color: "var(--brand,#0E7C7B)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {prefill?.busy ? `Reading ${prefill.name}…` : "Prefill from a PDF bill"}
              </div>
              <div className="sub" style={{ fontSize: 11.5 }}>
                {prefill?.msg || "Fills the billed figures, capacity charges and bill lines. Contracted rates still come from the contract or LOA."}
              </div>
            </div>
            <input type="file" accept="application/pdf,.pdf" onChange={prefillFromPdf} disabled={prefill?.busy} style={{ display: "none" }} />
          </label>
          {prefill?.warnings?.length > 0 && (
            <div style={{ padding: "9px 12px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
              {prefill.warnings.map((w, k) => <div key={k}>{w}</div>)}
            </div>
          )}
          <div className="grid cols-3">
            <Field label="Contract (optional — auto-fills contracted rates)">
              <select value={form.contract_id} onChange={(e) => onContractChange(e.target.value)}>
                <option value="">— Manual entry —</option>
                {contracts.map((c) => <option key={c.id} value={c.id}>{c.contract_no} — {c.business_name}</option>)}
              </select>
            </Field>
            <Field label="Business name"><input value={form.business_name} onChange={set("business_name")} /></Field>
            <Field label="Supplier"><input value={form.supplier_name} onChange={set("supplier_name")} /></Field>
            <Field label="Utility">
              <select value={form.utility} onChange={set("utility")}>
                <option value="ELECTRICITY">Electricity</option>
                <option value="GAS">Gas</option>
              </select>
            </Field>
            <Field label="Meter (MPAN/MPRN)"><input value={form.meter_mpan_mpr} onChange={set("meter_mpan_mpr")} onBlur={(e) => checkCertMatch(e.target.value)} /></Field>
            <Field label="Billing period"><input placeholder="e.g. Jul 2026" value={form.period} onChange={set("period")} /></Field>
            <Field label="Days in period"><input type="number" value={form.days} onChange={set("days")} /></Field>

            <Field label="Contracted unit rate (p/kWh)"><input type="number" step="0.01" value={form.contracted_unit_rate} onChange={set("contracted_unit_rate")} /></Field>
            <Field label="Contracted standing charge (p/day)"><input type="number" step="0.01" value={form.contracted_standing_charge} onChange={set("contracted_standing_charge")} /></Field>
            <Field label="Billed consumption (kWh)"><input type="number" value={form.billed_consumption} onChange={set("billed_consumption")} /></Field>
            <Field label="Billed unit rate (p/kWh)"><input type="number" step="0.01" value={form.billed_unit_rate} onChange={set("billed_unit_rate")} /></Field>
            <Field label="Billed standing charge (p/day)"><input type="number" step="0.01" value={form.billed_standing_charge} onChange={set("billed_standing_charge")} /></Field>

            <div id="sec-meter" className="form-section-title">Meter Reading Cross-Check</div>
            <Field label="Meter reading — start (kWh)"><input type="number" value={form.meter_reading_start} onChange={set("meter_reading_start")} /></Field>
            <Field label="Meter reading — end (kWh)"><input type="number" value={form.meter_reading_end} onChange={set("meter_reading_end")} /></Field>

            <div id="sec-vat" className="form-section-title">VAT Rate Verification</div>
            <Field label="VAT rate billed (%)"><input type="number" value={form.vat_rate} onChange={set("vat_rate")} /></Field>
            <Field label="VAT rate expected (%)"><input type="number" value={form.vat_rate_expected} onChange={set("vat_rate_expected")} /></Field>

            <div id="sec-passthrough" className="form-section-title">Pass-Through Verification — Transmission (TNUoS) &amp; Distribution (DUoS)</div>
            <Field label="TNUoS charged on bill (£)"><input type="number" step="0.01" value={form.tnuos_charged} onChange={set("tnuos_charged")} /></Field>
            <Field label="Published TNUoS rate (p/day)"><input type="number" step="0.0001" value={form.tnuos_rate} onChange={set("tnuos_rate")} /></Field>
            <Field label="DUoS charged on bill (£)"><input type="number" step="0.01" value={form.duos_charged} onChange={set("duos_charged")} /></Field>
            <Field label="Published DUoS rate (p/day)"><input type="number" step="0.0001" value={form.duos_rate} onChange={set("duos_rate")} /></Field>
            <Field label="BSUoS charged on bill (£, optional — for Network Charging Compensation)"><input type="number" step="0.01" value={form.bsuos_charged} onChange={set("bsuos_charged")} /></Field>

            <div id="sec-capacity" className="form-section-title">Capacity Charges (HH sites — ASC / excess / reactive)</div>
            <Field label="ASC (kVA)"><input type="number" step="0.01" value={form.asc_kva} onChange={set("asc_kva")} /></Field>
            <Field label="Capacity rate (p/kVA/day)"><input type="number" step="0.0001" value={form.capacity_rate} onChange={set("capacity_rate")} /></Field>
            <Field label="Capacity charged (£)"><input type="number" step="0.01" value={form.capacity_charged} onChange={set("capacity_charged")} /></Field>
            <Field label="Excess capacity (kVA)"><input type="number" step="0.01" value={form.excess_kva} onChange={set("excess_kva")} /></Field>
            <Field label="Excess rate (p/kVA/day)"><input type="number" step="0.0001" value={form.excess_rate} onChange={set("excess_rate")} /></Field>
            <Field label="Excess charged (£)"><input type="number" step="0.01" value={form.excess_charged} onChange={set("excess_charged")} /></Field>
            <Field label="Reactive (kVArh)"><input type="number" step="0.01" value={form.reactive_kvarh} onChange={set("reactive_kvarh")} /></Field>
            <Field label="Reactive rate (p/kVArh)"><input type="number" step="0.0001" value={form.reactive_rate} onChange={set("reactive_rate")} /></Field>
            <Field label="Reactive charged (£)"><input type="number" step="0.01" value={form.reactive_charged} onChange={set("reactive_charged")} /></Field>
            {form.rows_json && (
              <div className="sub" style={{ gridColumn: "1 / -1", fontSize: 11.5 }}>
                {(() => { try { return `${JSON.parse(form.rows_json).rows.length} bill lines attached — each will be checked for quantity × rate and per-line VAT.`; } catch { return "Bill lines attached."; } })()}
                {" "}<button className="btn ghost sm" onClick={() => setForm((f) => ({ ...f, rows_json: "" }))}>Remove</button>
              </div>
            )}

            <div id="sec-activity" className="form-section-title">Qualifying Activity (OOOM Energy Reference Guide)</div>
            <Field label="Business activity">
              <select value={form.business_activity} onChange={(e) => onActivityChange(e.target.value)}>
                <option value="">— Select if known —</option>
                {refGuide && refGuide.activities.map((a) => (
                  <option key={a.activity} value={a.activity}>{a.activity} ({a.scheme === "BOTH" ? "EII + CCL" : a.scheme})</option>
                ))}
              </select>
            </Field>
            {form.business_activity && refGuide && (() => {
              const found = refGuide.activities.find((a) => a.activity === form.business_activity);
              const schemes = found ? (found.scheme === "BOTH" ? ["EII", "CCL"] : [found.scheme]) : [];
              return (
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12 }}>
                  {schemes.map((s) => (
                    <div key={s} style={{ flex: 1, background: "#F8FAFC", borderRadius: 10, padding: 10, fontSize: 12 }}>
                      <b>{refGuide.schemes[s].label}</b>
                      <div className="sub" style={{ marginTop: 4 }}>Savings: <b>{refGuide.schemes[s].savings}</b></div>
                      <div className="sub">Retrospective: {refGuide.schemes[s].retrospective}</div>
                      <div className="sub">Administered by: {refGuide.schemes[s].administeredBy}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <Field label="Or look up EII sector eligibility by SIC/NACE code"><input placeholder="e.g. 2453" value={form.sic_code} onChange={(e) => setForm((f) => ({ ...f, sic_code: e.target.value }))} onBlur={(e) => lookupSic(e.target.value)} /></Field>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="btn ghost sm" onClick={() => setBizTestModal({ consumption_mwh: "", gva: "", result: null })}>Check 20% business-level test</button>
            </div>
            {sicMatch !== undefined && (
              <div style={{ gridColumn: "1 / -1" }}>
                {sicMatch ? (
                  <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#065F46" }}>
                    <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                    SIC {sicMatch.sic} — {sicMatch.description} — passes the <b>EII sector-level test</b> (Annex 1).
                    Still needs the 20% business-level test above, and this says nothing about CCL eligibility (a separate test).
                  </div>
                ) : (
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#92400E" }}>
                    No match for that SIC code in the EII Annex 1 list — check the official list linked below. (This does not check CCL eligibility, which uses a different test.)
                  </div>
                )}
              </div>
            )}
            {govLinks && (
              <div style={{ gridColumn: "1 / -1", background: "#F8FAFC", borderRadius: 10, padding: 10, fontSize: 12 }}>
                <b>Official gov.uk resources</b>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 6 }}>
                  {Object.values(govLinks).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ color: "#4F46E5" }}>{l.title}</a>
                  ))}
                </div>
              </div>
            )}

            <div id="sec-upload" className="form-section-title">Upload Bill</div>
            <Field label="Bill file (PDF/image)">
              <input type="file" accept=".pdf,image/*" onChange={(e) => setBillFile(e.target.files[0] || null)} />
            </Field>
            <div className="sub" style={{ gridColumn: "1 / -1", fontSize: 11 }}>
              The file is attached to this validation for reference. Fields above still need entering manually — automatic reading of consumption/rates/VAT off the bill would need a document-AI/OCR service, which isn't wired up in this build yet.
            </div>

            <div id="sec-ccl" className="form-section-title">CCL Exemption &amp; Rebate</div>
            <Field label="CCL charged on bill (£)"><input type="number" step="0.01" value={form.ccl_charged} onChange={set("ccl_charged")} /></Field>
            <Field label="Fully exempt (charity / de-minimis / 100% renewable)">
              <label className="checkbox-row"><input type="checkbox" checked={form.ccl_exempt} onChange={set("ccl_exempt")} /> Exempt</label>
            </Field>
            <Field label="CCA relief % (if not fully exempt)"><input type="number" value={form.ccl_relief_pct} onChange={set("ccl_relief_pct")} /></Field>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
              <button className="btn ghost sm" onClick={() => setSchoolModal({ answers: {}, result: null })}>Is this school eligible? (VAT + CCL checker)</button>
              <button className="btn ghost sm" onClick={() => setCcaRatesModal(true)}>CCA relief rates by year</button>
            </div>

            <div id="sec-eii" className="form-section-title">Energy-Intensive Industry (EII) Relief</div>
            {certMatch !== undefined && (
              <div style={{ gridColumn: "1 / -1" }}>
                {certMatch ? (
                  <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#065F46" }}>
                    <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                    EII certificate <b>{certMatch.certificate_number}</b> matched this meter — <b>{certMatch.proportion_exempt_pct}%</b> exempt,
                    valid {certMatch.validity_start} to {certMatch.validity_end}. Relief % auto-filled below.
                  </div>
                ) : (
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#92400E" }}>
                    No EII certificate on file covers this meter for this date — enter relief details manually, or add one under EII Certificates.
                  </div>
                )}
              </div>
            )}
            <Field label="EII eligible">
              <label className="checkbox-row"><input type="checkbox" checked={form.eii_eligible} onChange={set("eii_eligible")} /> Eligible</label>
            </Field>
            <Field label="Policy-cost portion of bill (£)"><input type="number" step="0.01" value={form.eii_policy_cost} onChange={set("eii_policy_cost")} /></Field>
            <Field label="Relief % (default 85%)"><input type="number" value={form.eii_relief_pct} onChange={set("eii_relief_pct")} /></Field>

            <div id="sec-volume" className="form-section-title">Volume Tolerance</div>
            <Field label="Contract EAC (kWh/yr)"><input type="number" value={form.eac} onChange={set("eac")} /></Field>
            <Field label="Tolerance band (%)"><input type="number" value={form.tolerance_pct} onChange={set("tolerance_pct")} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={set("notes")} /></Field>

            <div id="sec-client" className="form-section-title">Client Agreement / Letter of Authority</div>
            <Field label="Client name (for LOA)"><input placeholder="Defaults to business name" value={form.client_name} onChange={set("client_name")} /></Field>
            <Field label="Client address"><input value={form.client_address} onChange={set("client_address")} /></Field>
            <Field label="Company registration number"><input value={form.client_company_reg} onChange={set("client_company_reg")} /></Field>
          </div>

          {preview && preview.error && <div className="error-banner" style={{ marginTop: 12 }}>{preview.error}</div>}
          {preview && !preview.error && (
            <div style={{ marginTop: 16, borderTop: "1px solid #EEF1F4", paddingTop: 16 }}>
              <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                <StatBox label="Expected" value={money(preview.expected_amount)} />
                <StatBox label="Billed" value={money(preview.billed_amount)} />
                <StatBox label="Total Claimable" value={money(preview.total_claim)} highlight={preview.total_claim > 0.5} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                {preview.status === "Pass"
                  ? <><CheckCircle2 size={16} color="#0F766E" /> <b>Pass</b> — no discrepancies found</>
                  : <><AlertTriangle size={16} color="#E11D48" /> <b>Discrepancy</b> — {preview.findings.length} finding(s) below</>}
              </div>
              {preview.findings.length > 0 && (
                <table className="tbl sm">
                  <thead><tr><th>Check</th><th>Detail</th><th>Amount</th></tr></thead>
                  <tbody>
                    {preview.findings.map((f, i) => (
                      <tr key={i}>
                        <td><Badge tone={checkTone(f.check)}>{f.check}</Badge></td>
                        <td className="sub">{f.detail}</td>
                        <td style={{ fontWeight: 700 }}>{f.amount ? money(f.amount) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Modal>
      )}

      {viewing && (
        <Modal title={`Validation ${viewing.ref}`} onClose={() => setViewing(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setViewing(null)}>Close</button>
            <button className="btn" onClick={() => downloadLoa(viewing)}><FileText size={14} /> Download LOA</button>
            {claimStages && (() => {
              const idx = claimStages.findIndex((s) => s.key === viewing.claim_stage);
              const next = claimStages[idx + 1];
              return next ? (
                <button className="btn" onClick={() => advanceStage(viewing, next.key)}>Advance: {next.label}</button>
              ) : null;
            })()}
            <button className="btn" onClick={() => openDocGenerator("pp11", viewing)}><FileText size={14} /> Generate PP11</button>
            {(viewing.eii_eligible || viewing.eii_relief > 0) && (
              <button className="btn" onClick={() => openDocGenerator("eii", viewing)}><FileText size={14} /> Generate EII Summary</button>
            )}
            {viewing.loa_status !== "Sent" && viewing.loa_status !== "Signed" && (
              <button className="btn" onClick={() => sendLoa(viewing)}><Send size={14} /> Send LOA to Client</button>
            )}
            {viewing.status === "Discrepancy" && viewing.supplier_query_status !== "Resolved" && (
              viewing.supplier_query_status === "Raised"
                ? <button className="btn" onClick={() => resolveQuery(viewing)}><CheckCircle2 size={14} /> Mark Query Resolved</button>
                : <button className="btn" onClick={() => raiseQuery(viewing)}><AlertTriangle size={14} /> Flag to Supplier</button>
            )}
            {viewing.status !== "Claim Raised" && viewing.total_claim > 0.5 && (
              <button className="btn primary" onClick={() => raiseClaim(viewing.id)}><FileWarning size={14} /> Raise Claim</button>
            )}
          </>}>
          {claimStages && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {claimStages.map((s) => {
                const idx = claimStages.findIndex((x) => x.key === viewing.claim_stage);
                const thisIdx = claimStages.findIndex((x) => x.key === s.key);
                const state = thisIdx < idx ? "done" : thisIdx === idx ? "current" : "pending";
                return (
                  <div key={s.key} title={`${s.detail} (${s.role})`}
                    style={{
                      fontSize: 10, padding: "4px 8px", borderRadius: 999, whiteSpace: "nowrap",
                      background: state === "done" ? "#ECFDF5" : state === "current" ? "#EEF2FF" : "#F8FAFC",
                      color: state === "done" ? "#065F46" : state === "current" ? "#4F46E5" : "#94A3B8",
                      fontWeight: state === "current" ? 700 : 500,
                      border: state === "current" ? "1px solid #C7D2FE" : "1px solid transparent",
                    }}>
                    {state === "done" ? "✓ " : ""}{s.label}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 20px", fontSize: 13, marginBottom: 14 }}>
            {[["Business", viewing.business_name], ["Supplier", viewing.supplier_name], ["Utility", viewing.utility],
              ["MPAN/MPRN", viewing.meter_mpan_mpr], ["Period", viewing.period], ["Days", viewing.days]].map(([k, v]) => (
              <div key={k} style={{ padding: "6px 0", borderBottom: "1px solid #EEF1F4" }}>
                <span className="sub">{k}: </span><b>{v || "—"}</b>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
            <StatBox label="Expected" value={money(viewing.expected_amount)} />
            <StatBox label="Billed" value={money(viewing.billed_amount)} />
            <StatBox label="Total Claimable" value={money(viewing.total_claim)} highlight={viewing.total_claim > 0.5} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <ShieldCheck size={16} /> <b>Status:</b> <Badge tone={stTone(viewing.status)}>{viewing.status}</Badge>
            {viewing.status === "Claim Raised" && <span className="sub">— {money(viewing.claim_amount)} booked</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <FileText size={16} /> <b>LOA:</b> <Badge tone={viewing.loa_status === "Signed" ? "green" : viewing.loa_status === "Sent" ? "amber" : "slate"}>{viewing.loa_status || "Not Sent"}</Badge>
            {viewing.loa_sent_at && <span className="sub">— sent {new Date(viewing.loa_sent_at).toLocaleDateString("en-GB")}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <AlertTriangle size={16} /> <b>Supplier Query:</b>{" "}
            <Badge tone={viewing.supplier_query_status === "Resolved" ? "green" : viewing.supplier_query_status === "Raised" ? "amber" : "slate"}>
              {viewing.supplier_query_status || "Not Raised"}
            </Badge>
            {viewing.supplier_query_raised_at && <span className="sub">— raised {new Date(viewing.supplier_query_raised_at).toLocaleDateString("en-GB")}</span>}
          </div>
          {Array.isArray(viewing.findings) && viewing.findings.length > 0 && (
            <table className="tbl sm">
              <thead><tr><th>Check</th><th>Detail</th><th>Amount</th></tr></thead>
              <tbody>
                {viewing.findings.map((f, i) => (
                  <tr key={i}>
                    <td><Badge tone={checkTone(f.check)}>{f.check}</Badge></td>
                    <td className="sub">{f.detail}</td>
                    <td style={{ fontWeight: 700 }}>{f.amount ? money(f.amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {docModal && (
        <Modal title={docModal.kind === "pp11" ? "Generate PP11 (CCL Supplier Certificate)" : "Generate EII Certificate Summary"} onClose={() => setDocModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setDocModal(null)}>Close</button>
            <button className="btn primary" onClick={downloadDoc}><FileText size={14} /> Download</button>
          </>}>
          {docModal.missing.length > 0 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#92400E", marginBottom: 8 }}>A few fields are missing — fill them in and regenerate:</div>
              <div className="grid cols-2">
                {docModal.missing.map((f) => (
                  <Field key={f} label={FIELD_LABELS[f] || f}>
                    <input value={docModal.values[f] || ""} onChange={(e) => setDocModal((m) => ({ ...m, values: { ...m.values, [f]: e.target.value } }))} />
                  </Field>
                ))}
              </div>
              <button className="btn sm" style={{ marginTop: 8 }} onClick={regenerateDoc}>Regenerate</button>
            </div>
          )}
          <pre style={{ background: "#F8FAFC", borderRadius: 10, padding: 14, fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 360, overflow: "auto" }}>{docModal.text}</pre>
        </Modal>
      )}

      {batchModal && (
        <Modal title="Batch PP11 — one business, multiple sites" onClose={() => setBatchModal(null)} wide
          footer={<>
            <button className="btn ghost" onClick={() => setBatchModal(null)}>Close</button>
            <button className="btn" onClick={generateBatch}>Generate All</button>
            {batchModal.results && <button className="btn primary" onClick={downloadBatch}><FileText size={14} /> Download All</button>}
          </>}>
          <div className="form-section-title" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>Shared across all sites</div>
          <div className="grid cols-3">
            <Field label="Business name"><input value={batchModal.shared.business_name} onChange={setShared("business_name")} /></Field>
            <Field label="Responsible person"><input value={batchModal.shared.responsible_person} onChange={setShared("responsible_person")} /></Field>
            <Field label="Phone"><input value={batchModal.shared.phone} onChange={setShared("phone")} /></Field>
            <Field label="Energy supplier"><input value={batchModal.shared.supplier_name} onChange={setShared("supplier_name")} /></Field>
            <Field label="CCL relief %"><input type="number" value={batchModal.shared.relief_pct} onChange={setShared("relief_pct")} /></Field>
            <Field label="Commodity">
              <select value={batchModal.shared.utility} onChange={setShared("utility")}>
                <option value="ELECTRICITY">Electricity</option>
                <option value="GAS">Gas</option>
              </select>
            </Field>
          </div>

          <div className="form-section-title">Sites</div>
          {batchModal.sites.map((s, i) => (
            <div key={i} style={{ border: "1px solid #EEF1F4", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <b style={{ fontSize: 12 }}>Site {i + 1}</b>
                {batchModal.sites.length > 1 && <button className="btn ghost sm" onClick={() => removeSite(i)}><Trash2 size={13} /></button>}
              </div>
              <div className="grid cols-3">
                <Field label="Address line 1"><input value={s.address_line1} onChange={setSite(i, "address_line1")} /></Field>
                <Field label="Address line 2"><input value={s.address_line2} onChange={setSite(i, "address_line2")} /></Field>
                <Field label="Address line 3 (optional)"><input value={s.address_line3} onChange={setSite(i, "address_line3")} /></Field>
                <Field label="Postcode"><input value={s.postcode} onChange={setSite(i, "postcode")} /></Field>
                <Field label="Account reference"><input value={s.account_reference} onChange={setSite(i, "account_reference")} /></Field>
                <Field label="Meter supply number"><input value={s.meter_number} onChange={setSite(i, "meter_number")} /></Field>
                <Field label="Date relief applies from"><input value={s.date_from} onChange={setSite(i, "date_from")} placeholder="DD/MM/YYYY" /></Field>
              </div>
              {batchModal.results && batchModal.results[i] && (
                batchModal.results[i].missing.length > 0
                  ? <div className="sub" style={{ fontSize: 11, color: "#E11D48", marginTop: 4 }}>Missing: {batchModal.results[i].missing.join(", ")}</div>
                  : <div className="sub" style={{ fontSize: 11, color: "#0F766E", marginTop: 4 }}>✓ Ready</div>
              )}
            </div>
          ))}
          <button className="btn ghost sm" onClick={addSite}><Plus size={13} /> Add site</button>
        </Modal>
      )}

      {bizTestModal && (
        <Modal title="EII Business-Level Test (20% electricity intensity)" onClose={() => setBizTestModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setBizTestModal(null)}>Close</button>
            <button className="btn primary" onClick={runBizTest}>Calculate</button>
          </>}>
          <p className="sub" style={{ fontSize: 12 }}>Per DBT guidance: electricity intensity = (Baseline Electricity Price × electricity consumed) ÷ Gross Value Added. Must be ≥ 20% to pass, alongside the sector test above.</p>
          <Field label="Electricity consumption over the relevant period (MWh)">
            <input type="number" value={bizTestModal.consumption_mwh} onChange={(e) => setBizTestModal((m) => ({ ...m, consumption_mwh: e.target.value }))} />
          </Field>
          <Field label="Gross Value Added — GVA (£, EBITDA + staff costs, over the same period)">
            <input type="number" value={bizTestModal.gva} onChange={(e) => setBizTestModal((m) => ({ ...m, gva: e.target.value }))} />
          </Field>
          {bizTestModal.result && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: bizTestModal.result.eligible ? "#ECFDF5" : "#FFFBEB" }}>
              <div>Representative electricity cost: <b>{money(bizTestModal.result.representative_electricity_cost)}</b> (at £{bizTestModal.result.bep}/MWh)</div>
              <div>Electricity intensity: <b>{bizTestModal.result.electricity_intensity_pct}%</b></div>
              <div style={{ marginTop: 6, fontWeight: 700, color: bizTestModal.result.eligible ? "#065F46" : "#92400E" }}>
                {bizTestModal.result.eligible ? "✓ Passes the 20% business-level test" : "✗ Below the 20% threshold"}
              </div>
            </div>
          )}
        </Modal>
      )}

      {schoolModal && (
        <Modal title="Is this school eligible? (reduced VAT + CCL exemption)" onClose={() => setSchoolModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setSchoolModal(null)}>Close</button>
            <button className="btn primary" onClick={checkSchoolEligibility}>Check</button>
          </>}>
          <p className="sub" style={{ fontSize: 11 }}>Guide only, not tax advice — confirm with a qualified tax advisor (per HMRC VAT Notice 701/30 and 701/19).</p>
          <Field label="Is it a registered charity?">
            <select onChange={(e) => setSchoolModal((m) => ({ ...m, answers: { ...m.answers, is_registered_charity: e.target.value === "yes" } }))}>
              <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </Field>
          <Field label="Is it a 'deemed charity' (foundation / voluntary aided / voluntary controlled / academy / free school etc.)?">
            <select onChange={(e) => setSchoolModal((m) => ({ ...m, answers: { ...m.answers, is_deemed_charity: e.target.value === "yes" } }))}>
              <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </Field>
          <Field label="Is education its primary purpose?">
            <select onChange={(e) => setSchoolModal((m) => ({ ...m, answers: { ...m.answers, education_primary_purpose: e.target.value === "yes" } }))}>
              <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </Field>
          <Field label="Does it have business income (fees, room hire, non-student trading, etc.)?">
            <select onChange={(e) => setSchoolModal((m) => ({ ...m, answers: { ...m.answers, has_business_income: e.target.value === "yes" } }))}>
              <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </Field>
          <Field label="Non-business activity, as a % of total activity (if known)">
            <input type="number" onChange={(e) => setSchoolModal((m) => ({ ...m, answers: { ...m.answers, non_business_pct: e.target.value } }))} />
          </Field>
          <Field label="Any residential properties (boarding students/staff)?">
            <select onChange={(e) => setSchoolModal((m) => ({ ...m, answers: { ...m.answers, has_residential: e.target.value === "yes" } }))}>
              <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </Field>
          {schoolModal.result && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: schoolModal.result.eligible ? "#ECFDF5" : schoolModal.result.partial ? "#FFFBEB" : "#FEECF0" }}>
              {schoolModal.result.steps.map((s, i) => <div key={i} className="sub" style={{ fontSize: 12 }}>• {s}</div>)}
              <div style={{ marginTop: 6, fontWeight: 700 }}>{schoolModal.result.result}</div>
              <div className="sub" style={{ fontSize: 11, marginTop: 6 }}>{schoolModal.result.disclaimer}</div>
            </div>
          )}
        </Modal>
      )}

      {ccaRatesModal && (
        <Modal title="CCA Relief Rates by Effective Date" onClose={() => setCcaRatesModal(false)} footer={<button className="btn ghost" onClick={() => setCcaRatesModal(false)}>Close</button>}>
          {ccaRates ? (
            <table className="tbl sm">
              <thead><tr><th>Effective</th><th>Electricity</th><th>Gas</th><th>LPG</th><th>Coal</th></tr></thead>
              <tbody>
                {ccaRates.map((r, i) => (
                  <tr key={i}>
                    <td>{r.effective_from}{r.effective_to ? ` – ${r.effective_to}` : " onward"}</td>
                    <td>{r.electricity}%</td><td>{r.gas}%</td><td>{r.lpg}%</td><td>{r.coal}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Spinner />}
          <p className="sub" style={{ fontSize: 11, marginTop: 10 }}>Maximum relief a site covered by a Climate Change Agreement can claim. Source: FDF CCA guidance, April 2024 revision.</p>
        </Modal>
      )}
    </>
  );
}

function StatBox({ label, value, highlight }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: highlight ? "#FEECF0" : "#F8FAFC" }}>
      <div className="sub" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: highlight ? "#E11D48" : undefined }}>{value}</div>
    </div>
  );
}


/* ---------------------------------------------------------------------------
   Non-commodity reconciliation.
   Distinct from the contract validation above: this checks a bill against itself
   (arithmetic) and against the published DUoS/TNUoS/levy schedules. The arithmetic
   half needs no reference data at all, which is what makes it defensible.
--------------------------------------------------------------------------- */
const SAMPLE_BILL = `Distribution Fixed Charge 31 days 140.0000 p/day 43.40 8.68 52.08
Day Unit 2182.90 kWh 23.4340 p/kWh 511.58 102.32 613.90
Night Unit 495.50 kWh 19.3260 p/kWh 95.76 19.15 114.91
Transmission Fixed Charge 31 days 1151.1840 p/day 356.87 71.37 428.24
Capacity Charge 100 kVA 6.92 p/kVA/day 214.52 42.90 257.42
Reactive Capacity Charge 24.07 kVArh 0.1730 p/kVArh 0.04 0.01 0.05
Nuclear RAB Levy 2678.40 kWh 0.5000 p/kWh 13.39 2.68 16.07
Network Charging Compensation 2678.40 kWh 0.1500 p/kWh 4.02 0.00 4.02
Climate Change Levy 2678.40 kWh 0.80100 p/kWh 21.45 4.29 25.74`;

function ReconcileModal({ onClose }) {
  const [meta, setMeta] = useState(null);
  const [text, setText] = useState("");
  const [f, setF] = useState({ mpan_prefix: "", tariff_year: "", billDays: "", vat_rate: 20,
    day_kwh: "", night_kwh: "", consumption_kwh: "", subtotal: "", vat_total: "", total: "" });
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pdfName, setPdfName] = useState(null);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => { api.bvReferenceMeta().then((r) => setMeta(r.data)).catch(() => {}); }, []);

  /**
   * Read the PDF on the server, then drop everything it found into the form and run the
   * check. The fields stay editable, because a real bill's layout can defeat the parser
   * and a person should confirm the extraction before relying on any finding.
   */
  const onPdf = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setErr("That PDF is over 10MB — please upload a smaller file.");
    setBusy(true); setErr(null); setResult(null); setWarnings([]); setPdfName(file.name);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("Could not read the file"));
        r.readAsDataURL(file);
      });
      const { data } = await api.bvReconcilePdf(b64, file.name);
      const x = data.fields;
      const v = (n) => (n == null ? "" : n);
      setF({
        mpan_prefix: v(x.mpan_prefix), tariff_year: v(x.tariff_year), billDays: v(x.billDays),
        vat_rate: v(x.vat_rate ?? 20), day_kwh: v(x.day_kwh), night_kwh: v(x.night_kwh),
        consumption_kwh: v(x.consumption_kwh), subtotal: v(x.subtotal), vat_total: v(x.vat_total), total: v(x.total),
      });
      setText(data.text || "");
      setWarnings(data.warnings || []);
      setResult(data);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const n = (v) => (v === "" || v == null ? null : Number(v));

  const run = async () => {
    if (!text.trim()) return setErr("Paste the bill's charge lines first");
    setBusy(true); setErr(null);
    try {
      const { data } = await api.bvReconcile({
        text, mpan_prefix: f.mpan_prefix || null, tariff_year: f.tariff_year || null,
        billDays: n(f.billDays), vat_rate: n(f.vat_rate),
        day_kwh: n(f.day_kwh), night_kwh: n(f.night_kwh), consumption_kwh: n(f.consumption_kwh),
        subtotal: n(f.subtotal), vat_total: n(f.vat_total), total: n(f.total),
      });
      setResult(data);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const tone = (v) => (v === "red" ? "rose" : v === "amber" || v === "review" ? "amber" : v === "green" ? "green" : "slate");

  return (
    <Modal title="Reconcile a Non-Commodity Bill" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" disabled={busy} onClick={run}>{busy ? "Checking…" : "Reconcile"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 12,
        border: "2px dashed var(--line,#CBD5E1)", borderRadius: 10, cursor: busy ? "wait" : "pointer", background: "#F8FAFC" }}>
        <FileText size={22} style={{ color: "var(--brand,#0E7C7B)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{busy && pdfName ? `Reading ${pdfName}…` : "Upload a PDF bill"}</div>
          <div className="sub" style={{ fontSize: 11.5 }}>
            {pdfName && !busy ? `Loaded ${pdfName} — check the fields below, then Reconcile again if you change anything.`
              : "Text-based PDFs from the supplier's portal. Scanned or photographed bills can't be read automatically."}
          </div>
        </div>
        <input type="file" accept="application/pdf,.pdf" onChange={onPdf} disabled={busy} style={{ display: "none" }} />
      </label>
      {warnings.length > 0 && (
        <div style={{ padding: "10px 12px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
      <p className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
        Or paste the charge lines from the bill. Each line should read label, quantity, rate with its unit, then subtotal, VAT and total.
        Arithmetic checks run with no reference data; add an MPAN top line and tariff year to also compare against published schedules.
      </p>
      <div className="grid cols-4" style={{ marginBottom: 10 }}>
        <Field label="MPAN top line / postcode"><input value={f.mpan_prefix} onChange={set("mpan_prefix")} placeholder="16" /></Field>
        <Field label="Tariff Year">
          <select value={f.tariff_year} onChange={set("tariff_year")}>
            <option value="">—</option>
            {(meta?.years || []).map((y) => <option key={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Billing Days"><input type="number" value={f.billDays} onChange={set("billDays")} /></Field>
        <Field label="VAT %"><input type="number" step="0.1" value={f.vat_rate} onChange={set("vat_rate")} /></Field>
        <Field label="Day kWh"><input type="number" step="0.01" value={f.day_kwh} onChange={set("day_kwh")} /></Field>
        <Field label="Night kWh"><input type="number" step="0.01" value={f.night_kwh} onChange={set("night_kwh")} /></Field>
        <Field label="Levy kWh"><input type="number" step="0.01" value={f.consumption_kwh} onChange={set("consumption_kwh")} /></Field>
        <Field label="Stated Subtotal"><input type="number" step="0.01" value={f.subtotal} onChange={set("subtotal")} /></Field>
        <Field label="Stated VAT"><input type="number" step="0.01" value={f.vat_total} onChange={set("vat_total")} /></Field>
        <Field label="Stated Total"><input type="number" step="0.01" value={f.total} onChange={set("total")} /></Field>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
        placeholder="Distribution Fixed Charge 31 days 140.0000 p/day 43.40 8.68 52.08…"
        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "monospace", fontSize: 12 }} />
      <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => {
        setText(SAMPLE_BILL);
        setF({ ...f, mpan_prefix: "16", tariff_year: "2026/27", billDays: 31, vat_rate: 20,
          day_kwh: 2182.90, night_kwh: 495.50, consumption_kwh: 2678.40, subtotal: 1261.03, vat_total: 251.40, total: 1512.43 });
      }}>Load worked example</button>

      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Badge tone={tone(result.verdict)}>{result.verdict.toUpperCase()}</Badge>
            {result.dno && <span className="sub" style={{ fontSize: 12 }}>DNO {result.dno.id} — {result.dno.name} ({result.dno.operator}) · {result.tariff_year}</span>}
          </div>
          {result.note && <div className="sub" style={{ fontSize: 11.5, marginBottom: 10 }}>{result.note}</div>}

          <h4 style={{ fontSize: 13, margin: "12px 0 6px" }}>Arithmetic findings — no reference data used</h4>
          {result.arithmetic.findings.length === 0 ? (
            <div className="sub" style={{ fontSize: 12 }}>Every line reconciles and the totals sum correctly.</div>
          ) : (
            <>
              <table className="tbl">
                <thead><tr><th>Severity</th><th>Line</th><th>Issue</th><th style={{ textAlign: "right" }}>Impact</th></tr></thead>
                <tbody>
                  {result.arithmetic.findings.map((x, i) => (
                    <tr key={i}>
                      <td><Badge tone={tone(x.severity)}>{x.severity}</Badge></td>
                      <td className="name" style={{ fontSize: 12 }}>{x.line}</td>
                      <td style={{ fontSize: 12 }}>{x.detail}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{x.impact != null ? money(x.impact) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="sub" style={{ fontSize: 11.5, marginTop: 6 }}>
                Net arithmetic impact <b>{money(result.arithmetic.total_impact)}</b> — defects proven from the bill's own figures.
              </div>
            </>
          )}

          {result.reference.length > 0 && (
            <>
              <h4 style={{ fontSize: 13, margin: "16px 0 6px" }}>Against published schedules</h4>
              <table className="tbl">
                <thead><tr><th>Charge</th><th style={{ textAlign: "right" }}>Billed</th><th style={{ textAlign: "right" }}>Reference</th><th style={{ textAlign: "right" }}>Variance</th><th>Status</th></tr></thead>
                <tbody>
                  {result.reference.map((c) => (
                    <tr key={c.key}>
                      <td style={{ fontSize: 12 }}>{c.label}<div className="sub" style={{ fontSize: 10.5 }}>{c.unit}{c.source ? ` · ${c.source}` : ""}</div></td>
                      <td className="mono" style={{ textAlign: "right" }}>{c.billed ?? "—"}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{c.reference ?? "—"}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{c.variance ?? "—"}</td>
                      <td>
                        <Badge tone={tone(c.status)}>{c.status}</Badge>
                        {c.evidential && <div className="sub" style={{ fontSize: 10 }}>evidential</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="sub" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
                Only items marked evidential rest on a firm published rate. Anything shown as review or amber depends on an assumed
                capacity band or an estimated schedule and must be confirmed against the supplier's own statement before it forms part of a claim.
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
