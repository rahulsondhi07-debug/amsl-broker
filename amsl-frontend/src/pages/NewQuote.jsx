import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Zap, Flame, Search, Trophy, Check } from "lucide-react";
import { api } from "../api.js";
import { Card, Field, ErrorBanner, Badge, Spinner } from "../components/ui.jsx";

const money = (n) => "£" + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function NewQuote() {
  const nav = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [form, setForm] = useState({ utility: "Electricity", business_id: "", business_name: "", meter_number: "", eac: "30000", term: "24", uplift: "1.0", start_date: "", acq_renewal: "Acquisition", business_type: "" });
  const [bespoke, setBespoke] = useState(false);
  const [bf, setBf] = useState({ meter_point: "", meter_details: "", supplier_id: "", product_name: "", unit_rate: "", standing_charge: "", distribution_charge: "", transmission_charge: "", term: "24" });
  const [suppliers, setSuppliers] = useState([]);
  const setB = (k) => (e) => setBf({ ...bf, [k]: e.target.value });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [cap, setCap] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    Promise.all([api.list("customers", { limit: 100 }), api.list("leads", { limit: 100 })])
      .then(([c, l]) => setBusinesses([...c.data, ...l.data]))
      .catch(() => {});
    api.list("suppliers", { limit: 100 }).then((s) => setSuppliers(s.data)).catch(() => {});
  }, []);

  const saveBespoke = async () => {
    if (!bf.meter_point) return setErr("Enter the meter point (MPAN/MPRN) for the bespoke quote");
    if (!bf.supplier_id) return setErr("Select a supplier for the bespoke quote");
    setSaving("bespoke"); setErr(null);
    try {
      const chosen = businesses.find((b) => String(b.id) === String(form.business_id));
      const unit = Number(bf.unit_rate) || 0, sc = Number(bf.standing_charge) || 0, eac = Number(form.eac) || 0;
      const annual = (unit * eac) / 100 + (sc * 365) / 100;
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
        acq_renewal: form.acq_renewal, business_type: form.business_type,
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
        term: form.term ? Number(form.term) : undefined,
        uplift: form.uplift ? Number(form.uplift) : 1.0,
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
        utility: form.utility, meter_number: form.meter_number,
        eac: Number(form.eac), start_date: form.start_date,
        supplier_id: o.supplier_id, term_months: o.term_months,
        unit_rate: o.unit_rate, standing_charge: o.standing_charge,
        annual_cost: o.annual_cost, commission: o.total_commission,
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
          <button className={!bespoke ? "active" : ""} onClick={() => setBespoke(false)}>Market Comparison</button>
          <button className={bespoke ? "active" : ""} onClick={() => setBespoke(true)}>Bespoke Pricing</button>
        </div>
        <div className="grid cols-3" style={{ gap: 14 }}>
          <Field label="Utility *">
            <select value={form.utility} onChange={set("utility")}>
              <option>Electricity</option>
              <option>Gas</option>
            </select>
          </Field>
          <Field label="Business">
            <select value={form.business_id} onChange={(e) => {
              const b = businesses.find((x) => String(x.id) === e.target.value);
              setForm({ ...form, business_id: e.target.value, business_name: b ? b.business_name : "" });
            }}>
              <option value="">— Select existing business —</option>
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name} (#{b.ref})</option>)}
            </select>
          </Field>
          <Field label={meterLabel}><input value={form.meter_number} onChange={set("meter_number")} placeholder={meterLabel} /></Field>
          <Field label="Consumption kWh/yr (EAC) *"><input type="number" value={form.eac} onChange={set("eac")} placeholder="30000" /></Field>
          <Field label="Contract Term">
            <select value={form.term} onChange={set("term")}>
              <option value="">All terms</option>
              <option value="12">12 months</option>
              <option value="24">24 months</option>
              <option value="36">36 months</option>
            </select>
          </Field>
          <Field label="Broker Uplift (p/kWh)"><input type="number" step="0.1" value={form.uplift} onChange={set("uplift")} placeholder="1.0" /></Field>
          {cap && cap.max != null && (
            <div style={{ gridColumn: "1 / -1", marginTop: -6, fontSize: 12, fontWeight: 600,
              color: cap.allowed ? "var(--ok,#0F766E)" : "var(--urgent,#E11D48)" }}>
              {cap.allowed ? "✓ " : "⚠ "}{cap.message}{cap.band ? ` (band ${cap.band})` : ""}
            </div>
          )}
          <Field label="Acquisition / Renewal">
            <select value={form.acq_renewal} onChange={set("acq_renewal")}>
              <option>Acquisition</option>
              <option>Renewal</option>
            </select>
          </Field>
          <Field label="Business Type">
            <select value={form.business_type} onChange={set("business_type")}>
              <option value="">Select…</option>
              {["Accommodation","Agriculture","Catering","Manufacturing","Retail","Office","Healthcare","Education","Other"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Start Date"><input type="date" value={form.start_date} onChange={set("start_date")} /></Field>
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
              <Field label="Distribution Charge (p/kWh)"><input type="number" step="0.01" value={bf.distribution_charge} onChange={setB("distribution_charge")} /></Field>
              <Field label="Transmission Charge (p/kWh)"><input type="number" step="0.01" value={bf.transmission_charge} onChange={setB("transmission_charge")} /></Field>
              <Field label="Term (months)">
                <select value={bf.term} onChange={setB("term")}>
                  <option value="12">12</option><option value="24">24</option><option value="36">36</option>
                </select>
              </Field>
            </div>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          {bespoke ? (
            <button className="btn primary" onClick={saveBespoke} disabled={saving === "bespoke"}>
              <Search size={15} /> {saving === "bespoke" ? "Saving…" : "Save Bespoke Quote"}
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
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Rank</th><th>Supplier</th><th>Term</th><th>Unit Rate</th><th>Standing Charge</th>
                    <th>Annual Cost</th><th>Monthly</th><th>Your Commission</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.offers.map((o) => {
                    const key = o.supplier_id + "-" + o.term_months;
                    return (
                      <tr key={key} style={o.best ? { background: "#f5f3ff" } : {}}>
                        <td>{o.best ? <Badge tone="green"><Trophy size={11} style={{ verticalAlign: "-1px" }} /> Best</Badge> : <span className="mono">#{o.rank}</span>}</td>
                        <td><span className="mini"><span className="ini sq">{o.utility === "GAS" ? <Flame size={14} /> : <Zap size={14} />}</span><span className="name">{o.supplier}</span></span></td>
                        <td>{o.term_months} m</td>
                        <td className="mono">{o.unit_rate}p</td>
                        <td className="mono">{o.standing_charge}p/d</td>
                        <td className="name">{money(o.annual_cost)}</td>
                        <td className="mono">{money(o.monthly_cost)}</td>
                        <td><span style={{ color: "var(--indigo)", fontWeight: 700 }}>{money(o.total_commission)}</span></td>
                        <td style={{ textAlign: "right" }}>
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
              <strong>Quote disclaimer:</strong> This quote is valid until 5:30pm today; after that, prices may change and are subject to availability.
              All contracts are subject to credit approval from the supplier. Unit rates are quoted in pence per kWh.
              Prices exclude Climate Change Levy and VAT. This quote is based on estimated annual consumption — your actual future usage may differ.
              The amounts shown are calculated using estimated consumption splits, which may not match the consumption splits you provided for this quote.
            </div>
          </Card>
        </>
      )}
    </>
  );
}
