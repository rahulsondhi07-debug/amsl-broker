import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Zap, Flame, Search, Trophy, Check, Leaf } from "lucide-react";
import { api } from "../api.js";
import { Card, Field, ErrorBanner, Badge, Spinner, Modal } from "../components/ui.jsx";
import { useAuth } from "../components/AuthContext.jsx";

const money = (n) => "£" + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Same list as the Products "Payment Method" dropdown, kept in sync.
const PAY_METHODS = ["Cash/Cheque/Bacs", "Fixed DD", "Quarterly DD", "Variable DD", "Monthly DD", "DD and Non DD", "Monthly Fixed DD", "Quarterly Fixed DD"];

export default function NewQuote() {
  const nav = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [form, setForm] = useState({ utility: "Electricity", business_id: "", business_name: "", site_id: "", meter_id: "", meter_number: "", topline: "", postcode: "", eac: "30000", term: "", uplift: "1.0", start_date: "", current_supplier_id: "", business_type: "" });
  const [sites, setSites] = useState([]);
  const [meters, setMeters] = useState([]);
  const [bespoke, setBespoke] = useState(false);
  // Three pricing routes: fixed market comparison, hand-keyed bespoke, or a flexible
  // (non-fixed) purchasing enquiry. `bespoke` is derived so the existing bespoke logic
  // below keeps working unchanged.
  const [mode, setMode] = useState("market");
  useEffect(() => { setBespoke(mode === "bespoke"); }, [mode]);
  const [ff, setFfState] = useState({
    annual_volume: "", sites_count: "", contract_start: "", contract_length: "",
    purchasing_strategy: "", basket_type: "", tranche_count: "", index_reference: "",
    risk_appetite: "", volume_tolerance: "", management_fee: "", target_supplier_id: "", notes: "",
  });
  const setFf = (k) => (e) => setFfState((p) => ({ ...p, [k]: e.target.value }));
  const [fuelFilter, setFuelFilter] = useState("");      // "" | Green | Brown | Mix
  const [paymentFilter, setPaymentFilter] = useState(""); // "" or one of PAY_METHODS
  const [nightPct, setNightPct] = useState("");           // % of consumption on the night rate
  // Carbon Offset Premium — opt-in per quote. Prices come back inclusive of the premium.
  const [carbonOffset, setCarbonOffset] = useState(false);
  const [flexCfg, setFlexCfg] = useState({});
  // Flexible purchasing is permissioned per agency/agent, so the route is hidden entirely
  // for anyone without it rather than shown and then refused on submit.
  const { user } = useAuth();
  const [canFlex, setCanFlex] = useState(true);
  useEffect(() => {
    api.permissionsEffective(user?.role || "", user?.id, user?.agency_id)
      .then((r) => setCanFlex(r.data.includes("feature:flex-purchasing")))
      .catch(() => setCanFlex(true));
  }, [user?.role, user?.id, user?.agency_id]);
  useEffect(() => { if (!canFlex && mode === "flex") setMode("market"); }, [canFlex, mode]);
  useEffect(() => {
    api.configLookups().then((cfg) => {
      const pick = {};
      for (const c of ["Flex Purchasing Strategy", "Flex Basket Type", "Flex Index Reference"]) {
        pick[c] = (cfg.data[c] || []).map((x) => x.value);
      }
      setFlexCfg(pick);
    }).catch(() => {});
  }, []);
  const [bf, setBf] = useState({ meter_point: "", meter_details: "", supplier_id: "", product_name: "", unit_rate: "", standing_charge: "", distribution_charge: "", transmission_charge: "", term: "24" });
  const [suppliers, setSuppliers] = useState([]);
  const setB = (k) => (e) => setBf({ ...bf, [k]: e.target.value });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [cap, setCap] = useState(null);
  const [breakdown, setBreakdown] = useState(null); // offer shown in the "Show More" cost breakdown modal
  const [disclaimer, setDisclaimer] = useState(
    "This quote is valid until 5:30pm today; after that, prices may change and are subject to availability. " +
    "All contracts are subject to credit approval from the supplier. Unit rates are quoted in pence per kWh. " +
    "Prices exclude Climate Change Levy and VAT. This quote is based on estimated annual consumption — your actual future usage may differ."
  );
  useEffect(() => { api.disclaimer().then((r) => setDisclaimer(r.data.text)).catch(() => {}); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    Promise.all([api.list("customers", { limit: 100 }), api.list("leads", { limit: 100 })])
      .then(([c, l]) => setBusinesses([...c.data, ...l.data]))
      .catch(() => {});
    api.list("suppliers", { limit: 100 }).then((s) => setSuppliers(s.data)).catch(() => {});
  }, []);

  // Cascading: Business -> Site -> Meter (mirrors the reference "Get Quick Quote" flow)
  const onBusinessChange = (e) => {
    const id = e.target.value;
    const b = businesses.find((x) => String(x.id) === id);
    setForm({ ...form, business_id: id, business_name: b ? b.business_name : "", site_id: "", meter_id: "", meter_number: "", postcode: "" });
    setSites([]); setMeters([]);
    if (id) api.pipelineSites(id).then((r) => setSites(r.data)).catch(() => setSites([]));
  };
  const onSiteChange = (e) => {
    const siteId = e.target.value;
    setForm({ ...form, site_id: siteId, meter_id: "", meter_number: "" });
    const site = sites.find((s) => String(s.id) === siteId);
    setForm((f) => ({ ...f, site_id: siteId, postcode: site?.postcode || f.postcode, meter_id: "", meter_number: "" }));
    setMeters([]);
    if (form.business_id) {
      const utilKey = form.utility === "Gas" ? "GAS" : "ELEC";
      api.pipelineMeters(form.business_id, utilKey).then((r) => setMeters(r.data.filter((m) => !siteId || String(m.site_id) === siteId))).catch(() => setMeters([]));
    }
  };
  const onMeterChange = (e) => {
    const meterId = e.target.value;
    const m = meters.find((x) => String(x.id) === meterId);
    setForm((f) => ({ ...f, meter_id: meterId, meter_number: m?.mpan_mprn || f.meter_number, topline: m?.topline || f.topline, eac: m?.eac ? String(m.eac) : f.eac }));
  };
  // First 2 digits of the MPAN = Distributor ID; first 2 digits of the Topline = Profile
  // Class. These are how a real price matrix (Dist ID / Profile columns) gets filtered
  // down to the rates that actually apply to this meter.
  const first2 = (v) => { const d = String(v || "").replace(/\D/g, ""); return d.length >= 2 ? d.slice(0, 2) : null; };
  const distId = first2(form.meter_number);
  const profileClass = first2(form.topline);
  // If the person switches Electricity<->Gas after already picking a site, refresh the meter list for that utility.
  useEffect(() => {
    if (!form.business_id || !form.site_id) return;
    const utilKey = form.utility === "Gas" ? "GAS" : "ELEC";
    api.pipelineMeters(form.business_id, utilKey).then((r) => setMeters(r.data.filter((m) => String(m.site_id) === form.site_id))).catch(() => setMeters([]));
  }, [form.utility]); // eslint-disable-line

  const saveFlex = async () => {
    if (!ff.annual_volume || Number(ff.annual_volume) <= 0) return setErr("Annual volume (kWh) is required for a flex request");
    setSaving("flex"); setErr(null);
    const chosen = businesses.find((b) => String(b.id) === String(form.business_id));
    const num = (v) => (v === "" || v == null ? null : Number(v));
    try {
      const { data } = await api.flexCreate({
        business_id: form.business_id || null,
        business_name: chosen?.business_name || form.business_name || null,
        utility: form.utility, meter_number: form.meter_number || null,
        annual_volume: Number(ff.annual_volume), sites_count: num(ff.sites_count),
        contract_start: ff.contract_start || form.start_date || null,
        contract_length: num(ff.contract_length),
        basket_type: ff.basket_type || null, purchasing_strategy: ff.purchasing_strategy || null,
        tranche_count: num(ff.tranche_count), index_reference: ff.index_reference || null,
        risk_appetite: ff.risk_appetite || null, volume_tolerance: ff.volume_tolerance || null,
        management_fee: num(ff.management_fee),
        target_supplier_id: ff.target_supplier_id || null,
        status: "Requested", notes: ff.notes || null,
      });
      setSaved({ quote_no: data.ref, supplier: data.target_supplier_name || "supplier to be sourced" });
    } catch (e) { setErr(e.message); }
    setSaving(null);
  };

  const saveBespoke = async () => {
    if (!bf.meter_point) return setErr("Enter the meter point (MPAN/MPRN) for the bespoke quote");
    if (!bf.supplier_id) return setErr("Select a supplier for the bespoke quote");
    setSaving("bespoke"); setErr(null);
    try {
      const chosen = businesses.find((b) => String(b.id) === String(form.business_id));
      const unit = Number(bf.unit_rate) || 0, sc = Number(bf.standing_charge) || 0, eac = Number(form.eac) || 0;
      const dist = Number(bf.distribution_charge) || 0, trans = Number(bf.transmission_charge) || 0;
      // Bug fix (V1.7-16): Distribution and Transmission are p/day charges, same as Standing
      // Charge — they were being collected on this form but never actually added into the
      // annual cost total.
      const annual = (unit * eac) / 100 + (sc * 365) / 100 + (dist * 365) / 100 + (trans * 365) / 100;
      const q = await api.post("/quotes", {
        quote_no: "QT-" + Date.now().toString().slice(-6),
        business_id: form.business_id || null,
        business_name: chosen ? chosen.business_name : (form.business_name || "Unassigned Business"),
        utility: form.utility, meter_number: bf.meter_point, eac, start_date: form.start_date,
        supplier_id: bf.supplier_id, term_months: Number(bf.term) || null,
        unit_rate: unit, standing_charge: sc, annual_cost: Math.round(annual * 100) / 100,
        status: "Quoted", bespoke: 1, meter_point: bf.meter_point, meter_details: bf.meter_details,
        product_name: bf.product_name, distribution_charge: Number(bf.distribution_charge) || null,
        transmission_charge: Number(bf.transmission_charge) || null,
        acq_renewal: form.current_supplier_id && String(form.current_supplier_id) === String(bf.supplier_id) ? "Renewal" : "Acquisition", business_type: form.business_type,
      });
      nav("/quotes"); // V1.6-13: redirect to Quote page after creation
      return q;
    } catch (e) { setErr(e.message); }
    setSaving(null);
  };

  // V1.6-17: PE Solutions consumption-based uplift cap check
  useEffect(() => {
    const u = form.utility === "Gas" ? "GAS" : "ELEC";
    const c = Number(form.eac);
    if (!c || c <= 0) { setCap(null); return; }
    api.upliftValidate(u, c, Number(form.uplift)).then((r) => setCap(r.data)).catch(() => setCap(null));
  }, [form.utility, form.eac, form.uplift]);

  const meterLabel = form.utility === "Gas" ? "MPRN" : "MPAN";

  const runCompare = async () => {
    if (!form.eac || Number(form.eac) <= 0) return setErr("Enter annual consumption (EAC)");
    if (cap && cap.allowed === false) return setErr(cap.message);
    setLoading(true); setErr(null); setResult(null); setSaved(null);
    try {
      const { data } = await api.compare({
        utility: form.utility, eac: Number(form.eac),
        uplift: form.uplift ? Number(form.uplift) : 1.0,
        current_supplier_id: form.current_supplier_id || undefined,
        meter_number: form.meter_number || undefined,
        topline: form.topline || undefined,
        night_pct: nightPct === "" ? undefined : Number(nightPct),
        carbon_offset: carbonOffset,
      });
      setResult(data);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const selectOffer = async (o) => {
    setSaving(o.supplier_id + "-" + o.term_months); setErr(null);
    try {
      const chosen = businesses.find((b) => String(b.id) === String(form.business_id));
      const q = await api.post("/quotes", {
        quote_no: "QT-" + Date.now().toString().slice(-6),
        business_id: form.business_id || null,
        business_name: chosen ? chosen.business_name : (form.business_name || "Unassigned Business"),
        utility: form.utility, meter_number: form.meter_number, topline: form.topline,
        eac: Number(form.eac), start_date: form.start_date,
        supplier_id: o.supplier_id, term_months: o.term_months,
        unit_rate: o.unit_rate, standing_charge: o.standing_charge,
        annual_cost: o.annual_cost, commission: o.total_commission,
        uplift: o.uplift,
        carbon_offset: o.carbon_offset ? 1 : 0,
        carbon_offset_premium: o.carbon_offset_premium ?? null,
        carbon_offset_standard: o.carbon_offset_standard ?? null,
        status: "Quoted",
      });
      setSaved({ quote_no: q.data.quote_no, supplier: o.supplier });
    } catch (e) { setErr(e.message); }
    setSaving(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Energy Comparison</h2>
          <div className="desc">Compare supplier tariffs for a meter and turn the best deal into a quote.</div>
        </div>
        <button className="btn" onClick={() => nav(-1)}><ArrowLeft size={15} /> Back</button>
      </div>

      <Card title="Quote Parameters" right={<button className="btn ghost sm" onClick={() => nav("/tariffs")}>Manage tariffs →</button>}>
        {err && <ErrorBanner error={err} />}
        <div className="toggle" style={{ marginBottom: 14 }}>
          <button className={mode === "market" ? "active" : ""} onClick={() => setMode("market")}>Market Comparison</button>
          <button className={mode === "bespoke" ? "active" : ""} onClick={() => setMode("bespoke")}>Bespoke Pricing</button>
          {canFlex && <button className={mode === "flex" ? "active" : ""} onClick={() => setMode("flex")}>Flex Request</button>}
        </div>
        <div className="grid cols-3" style={{ gap: 14 }}>
          <Field label="Utility *">
            <select value={form.utility} onChange={set("utility")}>
              <option>Electricity</option>
              <option>Gas</option>
            </select>
          </Field>
          <Field label="Business">
            <select value={form.business_id} onChange={onBusinessChange}>
              <option value="">— Select existing business —</option>
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name} (#{b.ref})</option>)}
            </select>
          </Field>
          {form.business_id && (
            <Field label="Select Site">
              <select value={form.site_id} onChange={onSiteChange}>
                <option value="">— Select site —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.postcode ? ` (${s.postcode})` : ""}</option>)}
              </select>
            </Field>
          )}
          {form.business_id && form.site_id && (
            <Field label="Select Meter">
              <select value={form.meter_id} onChange={onMeterChange}>
                <option value="">— Select meter —</option>
                {meters.map((m) => <option key={m.id} value={m.id}>{form.utility === "Gas" ? "GAS" : "ELEC"} - {m.mpan_mprn || "no MPAN/MPRN"}{m.eac ? ` (${m.eac.toLocaleString()} kWh)` : ""}</option>)}
                {meters.length === 0 && <option disabled>No {form.utility === "Gas" ? "gas" : "electric"} meters on this site</option>}
              </select>
            </Field>
          )}
          <Field label={meterLabel}><input value={form.meter_number} onChange={set("meter_number")} placeholder={`${meterLabel} (auto-filled if a meter is selected above)`} /></Field>
          {form.utility === "Electricity" && (
            <Field label="Topline">
              <input value={form.topline} onChange={set("topline")} placeholder="8-digit header above the MPAN barcode" />
            </Field>
          )}
          <Field label="Postcode"><input value={form.postcode} onChange={set("postcode")} placeholder="Supply postcode" /></Field>
          <Field label="Consumption kWh/yr (EAC) *"><input type="number" value={form.eac} onChange={set("eac")} placeholder="30000" /></Field>
          <Field label="Current Supplier">
            <select value={form.current_supplier_id} onChange={set("current_supplier_id")}>
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          {cap && cap.max != null && (
            <div style={{ gridColumn: "1 / -1", marginTop: -6, fontSize: 12, fontWeight: 600,
              color: cap.allowed ? "var(--ok,#0F766E)" : "var(--urgent,#E11D48)" }}>
              {cap.allowed ? "✓ " : "⚠ "}{cap.message}{cap.band ? ` (band ${cap.band})` : ""}
            </div>
          )}
          <Field label="Business Type">
            <select value={form.business_type} onChange={set("business_type")}>
              <option value="">Select…</option>
              {["Accommodation","Agriculture","Catering","Manufacturing","Retail","Office","Healthcare","Education","Other"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Start Date"><input type="date" value={form.start_date} onChange={set("start_date")} /></Field>
        </div>
        <div className="sub" style={{ fontSize: 11, marginTop: 4 }}>
          Contract term and broker uplift are applied as filters once prices come back below — no need to pick them up front.
          Acquisition vs Renewal is worked out automatically per offer from the Current Supplier you select here.
          {form.utility === "Electricity" && (distId || profileClass) && (
            <> · Matrix filter: {distId && <>Distributor ID <b>{distId}</b></>}{distId && profileClass && ", "}{profileClass && <>Profile Class <b>{profileClass}</b></>}</>
          )}
        </div>
        {bespoke && (
          <div style={{ marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--line,#EEF1F4)" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Bespoke Details <span className="sub" style={{ fontWeight: 500 }}>· single product</span></div>
            <div className="grid cols-3" style={{ gap: 14 }}>
              <Field label="Meter Point (MPAN/MPRN) *"><input value={bf.meter_point} onChange={setB("meter_point")} placeholder="e.g. 2000012345678" /></Field>
              <Field label="Meter Details"><input value={bf.meter_details} onChange={setB("meter_details")} placeholder="e.g. HH · 3-phase" /></Field>
              <Field label="Supplier *">
                <select value={bf.supplier_id} onChange={setB("supplier_id")}>
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Product Name"><input value={bf.product_name} onChange={setB("product_name")} placeholder="e.g. Fixed 24m Bespoke" /></Field>
              <Field label="Unit Rate (p/kWh)"><input type="number" step="0.01" value={bf.unit_rate} onChange={setB("unit_rate")} /></Field>
              <Field label="Standing Charge (p/day)"><input type="number" step="0.01" value={bf.standing_charge} onChange={setB("standing_charge")} /></Field>
              <Field label="Distribution Charge (p/day)"><input type="number" step="0.01" value={bf.distribution_charge} onChange={setB("distribution_charge")} /></Field>
              <Field label="Transmission Charge (p/day)"><input type="number" step="0.01" value={bf.transmission_charge} onChange={setB("transmission_charge")} /></Field>
              <Field label="Term (months)">
                <select value={bf.term} onChange={setB("term")}>
                  <option value="12">12</option><option value="24">24</option><option value="36">36</option>
                </select>
              </Field>
            </div>
          </div>
        )}
        {mode === "flex" && (
          <div style={{ marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--line,#EEF1F4)" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Flexible Purchasing Request</div>
            <div className="sub" style={{ fontSize: 11.5, marginBottom: 10 }}>
              Flex contracts aren't priced from a matrix — volume is bought in tranches against the wholesale market.
              This logs the customer's requirements as an enquiry to take to suppliers/trading desks.
            </div>
            <div className="grid cols-3" style={{ gap: 14 }}>
              <Field label="Annual Volume (kWh) *"><input type="number" value={ff.annual_volume} onChange={setFf("annual_volume")} placeholder="e.g. 5000000" /></Field>
              <Field label="Number of Sites"><input type="number" value={ff.sites_count} onChange={setFf("sites_count")} /></Field>
              <Field label="Contract Start"><input type="date" value={ff.contract_start} onChange={setFf("contract_start")} /></Field>
              <Field label="Contract Length (months)">
                <select value={ff.contract_length} onChange={setFf("contract_length")}>
                  <option value="">—</option><option value="12">12</option><option value="24">24</option>
                  <option value="36">36</option><option value="48">48</option><option value="60">60</option>
                </select>
              </Field>
              <Field label="Purchasing Strategy">
                <select value={ff.purchasing_strategy} onChange={setFf("purchasing_strategy")}>
                  <option value="">Select…</option>
                  {(flexCfg["Flex Purchasing Strategy"] || []).map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Basket Type">
                <select value={ff.basket_type} onChange={setFf("basket_type")}>
                  <option value="">Select…</option>
                  {(flexCfg["Flex Basket Type"] || []).map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Number of Tranches"><input type="number" value={ff.tranche_count} onChange={setFf("tranche_count")} placeholder="e.g. 8" /></Field>
              <Field label="Index Reference">
                <select value={ff.index_reference} onChange={setFf("index_reference")}>
                  <option value="">Select…</option>
                  {(flexCfg["Flex Index Reference"] || []).map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Risk Appetite">
                <select value={ff.risk_appetite} onChange={setFf("risk_appetite")}>
                  <option value="">Select…</option><option>Low</option><option>Medium</option><option>High</option>
                </select>
              </Field>
              <Field label="Volume Tolerance"><input value={ff.volume_tolerance} onChange={setFf("volume_tolerance")} placeholder="e.g. +/- 20%" /></Field>
              <Field label="Management Fee (p/kWh)"><input type="number" step="0.01" value={ff.management_fee} onChange={setFf("management_fee")} /></Field>
              <Field label="Target Supplier">
                <select value={ff.target_supplier_id} onChange={setFf("target_supplier_id")}>
                  <option value="">Any / to be sourced</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes"><textarea value={ff.notes} onChange={setFf("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          {mode === "market" && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", marginBottom: 12,
              border: `1px solid ${carbonOffset ? "#a7f3d0" : "var(--line,#E7EBF0)"}`, background: carbonOffset ? "#ecfdf5" : "transparent",
              borderRadius: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={carbonOffset} onChange={(e) => setCarbonOffset(e.target.checked)}
                style={{ width: 17, height: 17, marginTop: 2, accentColor: "var(--brand,#0E7C7B)" }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                  Carbon Offset Premium {form.utility === "Gas" ? "Gas" : "Electricity"}?
                </div>
                <div className="sub" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>
                  Tick this box to offset your carbon emissions through certified projects.
                  {form.utility === "Gas" && " Carbon credits are sourced from projects and programmes registered with Verra's Verified Carbon Standard Program."}
                  {" "}Prices are inclusive of Carbon Offset Premium.
                </div>
              </div>
            </label>
          )}
          {mode === "bespoke" ? (
            <button className="btn primary" onClick={saveBespoke} disabled={saving === "bespoke"}>
              <Search size={15} /> {saving === "bespoke" ? "Saving…" : "Save Bespoke Quote"}
            </button>
          ) : mode === "flex" ? (
            <button className="btn primary" onClick={saveFlex} disabled={saving === "flex"}>
              <Search size={15} /> {saving === "flex" ? "Saving…" : "Submit Flex Request"}
            </button>
          ) : (
            <button className="btn primary" onClick={runCompare} disabled={loading}>
              <Search size={15} /> {loading ? "Comparing…" : "Compare Prices"}
            </button>
          )}
        </div>
      </Card>

      {loading && <Card><Spinner label="Pricing supplier tariffs…" /></Card>}

      {saved && (
        <div className="error-banner" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#047857" }}>
          Quote <b>{saved.quote_no}</b> created with {saved.supplier}. <button className="btn ghost sm" onClick={() => nav("/quotes")}>View quotes →</button>
        </div>
      )}

      {result && (
        <>
          <div className="grid cols-3">
            <Card title="Cheapest">
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)" }}>{result.summary.cheapest_supplier}</div>
              <div className="metric" style={{ marginTop: 8 }}><div className="v accent">{money(result.summary.cheapest_annual_cost)}</div><div className="l">Est. annual cost</div></div>
            </Card>
            <Card title="Potential Saving">
              <div style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>{money(result.summary.max_saving)}</div>
              <div className="metric" style={{ marginTop: 8 }}><div className="v">{result.summary.offers}</div><div className="l">Offers compared</div></div>
            </Card>
            <Card title="Your Commission (best deal)">
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--indigo)" }}>{money(result.summary.best_commission)}</div>
              <div className="metric" style={{ marginTop: 8 }}><div className="v">{form.utility === "Gas" ? "Gas" : "Electricity"}</div><div className="l">{Number(form.eac).toLocaleString()} kWh/yr</div></div>
            </Card>
          </div>

          <div className="page-head"><h2 style={{ fontSize: 16 }}>Supplier Offers</h2></div>
          <Card>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
              <Field label="Contract Term">
                <select value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
                  <option value="">All terms</option>
                  <option value="12">12 months</option>
                  <option value="24">24 months</option>
                  <option value="36">36 months</option>
                </select>
              </Field>
              <Field label="Energy Source">
                <select value={fuelFilter} onChange={(e) => setFuelFilter(e.target.value)}>
                  <option value="">All sources</option>
                  <option value="Green">Green (renewable)</option>
                  <option value="Brown">Brown (non-renewable)</option>
                  <option value="Mix">Mix</option>
                </select>
              </Field>
              <Field label="Payment Method">
                <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                  <option value="">All payment methods</option>
                  {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Night Usage (%)">
                <input type="number" min="0" max="100" value={nightPct} placeholder="e.g. 40"
                  onChange={(e) => setNightPct(e.target.value)} onBlur={runCompare} style={{ width: 120 }} />
              </Field>
              <Field label="Broker Uplift (p/kWh)">
                <input type="number" step="0.1" value={form.uplift} onChange={(e) => setForm({ ...form, uplift: e.target.value })} onBlur={runCompare} style={{ width: 120 }} />
              </Field>
              <span className="sub" style={{ fontSize: 11, paddingBottom: 9 }}>Changing uplift re-prices offers automatically.</span>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Rank</th><th>Supplier</th><th>Deal</th><th>Term</th><th>Source</th><th>Payment</th><th>Unit Rate</th><th>Standing Charge</th>
                    <th>Annual Cost</th><th>Monthly</th><th>Your Commission</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.offers
                    .filter((o) => !form.term || String(o.term_months) === String(form.term))
                    .filter((o) => !fuelFilter || o.fuel_mix === fuelFilter)
                    .filter((o) => !paymentFilter || o.payment_method === paymentFilter)
                    .map((o) => {
                    const key = o.supplier_id + "-" + o.term_months;
                    return (
                      <tr key={key} style={o.best ? { background: "#f5f3ff" } : {}}>
                        <td>{o.best ? <Badge tone="green"><Trophy size={11} style={{ verticalAlign: "-1px" }} /> Best</Badge> : <span className="mono">#{o.rank}</span>}</td>
                        <td><span className="mini"><span className="ini sq">{o.utility === "GAS" ? <Flame size={14} /> : <Zap size={14} />}</span><span className="name">{o.supplier}</span></span></td>
                        <td><Badge tone={o.deal_type === "Renewal" ? "indigo" : "slate"}>{o.deal_type}</Badge></td>
                        <td>{o.term_months} m</td>
                        <td>{o.fuel_mix ? <Badge tone={o.fuel_mix === "Green" ? "green" : o.fuel_mix === "Brown" ? "amber" : "slate"}>{o.fuel_mix === "Green" && <Leaf size={11} style={{ verticalAlign: "-1px", marginRight: 2 }} />}{o.fuel_mix}</Badge> : <span className="sub">—</span>}</td>
                        <td style={{ fontSize: 12 }}>{o.payment_method || <span className="sub">—</span>}</td>
                        <td className="mono">
                          {o.unit_rate}p
                          {o.carbon_offset && (
                            <div style={{ fontSize: 10.5, color: "#0E7C7B", fontWeight: 600 }}>
                              incl. {o.carbon_offset_premium}p offset{o.carbon_offset_standard ? ` · ${o.carbon_offset_standard}` : ""}
                            </div>
                          )}
                          {o.dual_rate && o.night_rate != null && (
                            <div className="sub" style={{ fontSize: 10.5 }}>night {o.night_rate}p · {o.night_split_pct}%</div>
                          )}
                        </td>
                        <td className="mono">{o.standing_charge}p/d</td>
                        <td className="name">{money(o.annual_cost)}</td>
                        <td className="mono">{money(o.monthly_cost)}</td>
                        <td><span style={{ color: "var(--indigo)", fontWeight: 700 }}>{money(o.total_commission)}</span></td>
                        <td style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn ghost sm" onClick={() => setBreakdown(o)}>Show More</button>
                          <button className="btn sm primary" disabled={saving === key} onClick={() => selectOffer(o)}>
                            <Check size={13} /> {saving === key ? "…" : "Quote"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="footer-note" style={{ textAlign: "left", marginTop: 10 }}>
              Unit rate shown includes your {form.uplift || 1}p/kWh broker uplift. Costs are estimates for {Number(form.eac).toLocaleString()} kWh/yr.
            </div>
            <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--subtle,#F8FAFC)", border: "1px solid var(--line,#E7EBF0)", borderRadius: 8, fontSize: 11, lineHeight: 1.5, color: "var(--muted,#64748B)" }}>
              <strong>Quote disclaimer:</strong> {disclaimer}
              {" "}The amounts shown are calculated using estimated consumption splits, which may not match the consumption splits you provided for this quote.
            </div>
          </Card>
        </>
      )}

      {breakdown && <CostBreakdownModal offer={breakdown} eac={Number(form.eac) || 0} days={365} onClose={() => setBreakdown(null)} />}
    </>
  );
}

function CostBreakdownModal({ offer, eac, days, onClose }) {
  const standingTotal = (offer.standing_charge * days) / 100;
  const unitTotal = (offer.unit_rate * eac) / 100;
  const annualExVat = standingTotal + unitTotal;
  const monthlyExVat = annualExVat / 12;
  const vatPct = 20; // standard rate; reduced-rate (5%) sites should confirm eligibility separately (see Bill Validation's school/CCL checker)
  const vat = (annualExVat * vatPct) / 100;
  const annualIncVat = annualExVat + vat;
  const monthlyIncVat = annualIncVat / 12;
  const row = (label, val, strong) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", fontWeight: strong ? 700 : 400, background: strong ? "#F8FAFC" : "transparent" }}>
      <span>{label}</span><span>£{val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  );
  return (
    <Modal title="Estimated Annual Cost" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="sub" style={{ fontSize: 12, marginBottom: 8 }}>{offer.supplier} · {offer.term_months} months · {eac.toLocaleString()} kWh/yr</div>
      <div style={{ border: "1px solid var(--line,#EEF1F4)", borderRadius: 10, overflow: "hidden" }}>
        {row(`Standing Charge (${offer.standing_charge}p/day × ${days} days)`, standingTotal)}
        {row(`Unit Rate (${offer.unit_rate}p/kWh × ${eac.toLocaleString()} kWh)`, unitTotal)}
        {row("Total Monthly Cost (excl. VAT)", monthlyExVat, true)}
        {row("Total Annual Cost (excl. VAT)", annualExVat, true)}
        {row(`VAT (${vatPct}%)`, vat)}
        {row("Total Monthly Cost (incl. VAT)", monthlyIncVat)}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", fontWeight: 800, background: "var(--brand,#0E7C7B)", color: "#fff" }}>
          <span>Total Annual Cost (incl. VAT)</span><span>£{annualIncVat.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
      <div className="sub" style={{ fontSize: 11, marginTop: 8 }}>
        Assumes standard-rate 20% VAT and excludes Climate Change Levy — check the Bill Validation module's school/CCA eligibility tools if this site may qualify for reduced-rate VAT or a CCL exemption.
      </div>
    </Modal>
  );
}
