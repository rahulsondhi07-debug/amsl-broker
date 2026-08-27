import { useState, useEffect } from "react";
import { Plus, Table2 } from "lucide-react";
import { api } from "../api.js";
import { useList, Card, Badge, Spinner, ErrorBanner, Pager, Modal, Field } from "../components/ui.jsx";

const UTILITY = ["NHH", "HH", "NHH (Multimetre)", "Domestic Electricity", "Domestic Gas", "Gas"];
const SEGMENT = ["SME", "Corporate", "Domestic"];
const ACQ = ["Acquisition", "Renewal", "Acquisition & Renewal"];
const FUEL_MIX = ["Green", "Brown", "Mix"];
const SC_TYPE = ["Pence", "Month", "Quarter"];
const YESNO = ["Yes", "No", "Yes and No"];
const PAY_METHOD = ["Cash/Cheque/Bacs", "Fixed DD", "Quarterly DD", "Variable DD", "Monthly DD", "DD and Non DD", "Monthly Fixed DD", "Quarterly Fixed DD"];
const PAY_MODE = ["Upfront Recon yearly", "Residual Monthly Payment"];
const PB_STATUS = ["Pending", "Released"];

const Section = ({ title, cols = 3, children }) => (
  <div style={{ marginTop: 14 }}>
    <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand,#0E7C7B)", marginBottom: 8 }}>{title}</div>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 12 }}>{children}</div>
  </div>
);

export default function Products() {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList("products", { limit: 10 });
  const [showAdd, setShowAdd] = useState(false);
  const [pmFor, setPmFor] = useState(null);
  return (
    <>
      <div className="page-head">
        <div><h1>Products List</h1><p className="sub">Price-book products and their price matrices.</p></div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Product</button>
      </div>
      <Card>
        <input placeholder="Search product…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)", marginBottom: 12 }} />
        {error && <ErrorBanner error={error} onRetry={reload} />}
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Product</th><th>Supplier</th><th>Utility</th><th>Segment</th><th>Acq/Renewal</th><th>Valid</th><th>Price Book</th><th>Price Matrix</th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td><span className="name">{r.name}</span></td>
                    <td>{r.supplier_name || "—"}</td>
                    <td>{r.utility}</td><td>{r.segment}</td><td style={{ fontSize: 12 }}>{r.acq_renewal}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.valid_from || "—"} → {r.valid_till || "—"}</td>
                    <td><Badge tone={r.price_book_status === "Released" ? "green" : "amber"}>{r.price_book_status || r.status}</Badge></td>
                    <td><button className="btn ghost sm" onClick={() => setPmFor(r)}><Table2 size={14} /> Price Matrix</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && <Pager meta={meta} page={page} setPage={setPage} />}
      </Card>
      {showAdd && <AddProduct onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); }} />}
      {pmFor && <PriceMatrix product={pmFor} onClose={() => setPmFor(null)} />}
    </>
  );
}

function AddProduct({ onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [f, setF] = useState({
    name: "", supplier_id: "", segment: "SME", utility: "NHH", standing_charge_type: "Pence", fuel_mix: "Green",
    max_commission: "", commission_increment: "", commission_banded: "No", standing_charge: "No",
    payment_method: "Cash/Cheque/Bacs", payment_mode: "Upfront Recon yearly", initial: "", final: "", dd_discount: "",
    valid_from: "", valid_till: "", price_book_status: "Pending", acq_renewal: "Acquisition",
    min_start_days: "", min_start_date: "", max_start_date: "", status: "Active",
  });
  const [err, setErr] = useState(null); const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => { api.list("suppliers", { limit: 300 }).then((r) => setSuppliers(r.data)).catch(() => {}); }, []);
  const nums = ["max_commission", "commission_increment", "dd_discount", "min_start_days", "min_start_date", "max_start_date"];
  const save = async () => {
    if (!f.name.trim()) return setErr("Product Name is required");
    if (!f.supplier_id) return setErr("Current Supplier is required");
    setSaving(true); setErr(null);
    try { const p = { ...f }; nums.forEach((k) => p[k] = f[k] === "" ? null : Number(f[k])); await api.post("/products", p); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };
  return (
    <Modal title="Add Product" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Submit"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <Section title="Product Details">
        <Field label="Product Name *"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Current Supplier *"><select value={f.supplier_id} onChange={set("supplier_id")}><option value="">Select Supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Corporate / SME *"><select value={f.segment} onChange={set("segment")}>{SEGMENT.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Utility *"><select value={f.utility} onChange={set("utility")}>{UTILITY.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Fuel Mix"><select value={f.fuel_mix} onChange={set("fuel_mix")}>{FUEL_MIX.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Standing Charge Type"><select value={f.standing_charge_type} onChange={set("standing_charge_type")}>{SC_TYPE.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </Section>
      <Section title="Commission">
        <Field label="Max Commission (p/kWh)"><input type="number" step="0.01" value={f.max_commission} onChange={set("max_commission")} /></Field>
        <Field label="Commission Increment (p/kWh)"><input type="number" step="0.01" value={f.commission_increment} onChange={set("commission_increment")} /></Field>
        <Field label="Commission Banded"><select value={f.commission_banded} onChange={set("commission_banded")}>{YESNO.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Standing Charge"><select value={f.standing_charge} onChange={set("standing_charge")}>{YESNO.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="DD Discount (%)"><input type="number" step="0.01" value={f.dd_discount} onChange={set("dd_discount")} /></Field>
      </Section>
      <Section title="Payment">
        <Field label="Payment Method"><select value={f.payment_method} onChange={set("payment_method")}>{PAY_METHOD.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Payment Mode"><select value={f.payment_mode} onChange={set("payment_mode")}>{PAY_MODE.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Initial"><input value={f.initial} onChange={set("initial")} /></Field>
        <Field label="Final"><input value={f.final} onChange={set("final")} /></Field>
      </Section>
      <Section title="Validity & Price Book">
        <Field label="Valid From"><input type="date" value={f.valid_from} onChange={set("valid_from")} /></Field>
        <Field label="Valid Till"><input type="date" value={f.valid_till} onChange={set("valid_till")} /></Field>
        <Field label="Price Book Status *"><select value={f.price_book_status} onChange={set("price_book_status")}>{PB_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Acquisition / Renewal"><select value={f.acq_renewal} onChange={set("acq_renewal")}>{ACQ.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </Section>
      <Section title="Start Date Windows">
        <Field label="Minimum start Days (visible on price book)"><input type="number" value={f.min_start_days} onChange={set("min_start_days")} /></Field>
        <Field label="Minimum start date (days)"><input type="number" value={f.min_start_date} onChange={set("min_start_date")} /></Field>
        <Field label="Maximum start date (days)"><input type="number" value={f.max_start_date} onChange={set("max_start_date")} /></Field>
      </Section>
      <p className="sub" style={{ fontSize: 11, marginTop: 6 }}>Direct Debit Form &amp; Terms and Conditions files can be attached on the product record after creation.</p>
    </Modal>
  );
}

function PriceMatrix({ product, onClose }) {
  const [rows, setRows] = useState(null);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState(null);
  const load = () => api.productPriceMatrix(product.id).then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const importRows = async () => {
    const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim() && !/min.?consumption/i.test(l));
    if (!lines.length) { setMsg("Paste rows: min_consumption, max_consumption, term_months, unit_rate, standing_charge, commission"); return; }
    let n = 0;
    for (const l of lines) {
      const [min_consumption, max_consumption, term_months, unit_rate, standing_charge, commission] = l.split(",").map((x) => x.trim());
      try { await api.productPriceMatrixAdd(product.id, { min_consumption: +min_consumption, max_consumption: +max_consumption, term_months: +term_months, unit_rate: +unit_rate, standing_charge: +standing_charge, commission: +commission }); n++; } catch { /* skip bad row */ }
    }
    setMsg(`${n} price rows uploaded`); setCsv(""); load();
  };
  return (
    <Modal title={`Price Matrix — ${product.name}`} onClose={onClose} wide
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="sub" style={{ fontSize: 12, marginBottom: 8 }}>Supplier: {product.supplier_name || "—"} · {product.utility} · {product.segment}</div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>Upload price matrix rows — <strong>min_consumption, max_consumption, term_months, unit_rate, standing_charge, commission</strong></div>
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"0, 25000, 12, 24.5, 30, 1.2\n25001, 50000, 24, 23.9, 32, 1.0"}
        style={{ width: "100%", minHeight: 80, padding: 10, borderRadius: 8, border: "1px solid #E7EBF0", fontFamily: "monospace", fontSize: 12 }} />
      <div style={{ margin: "8px 0" }}><button className="btn primary sm" onClick={importRows} disabled={!csv.trim()}>Upload Price Matrix</button>{msg && <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: "var(--brand,#0E7C7B)" }}>{msg}</span>}</div>
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="sub">No price matrix rows yet.</div> : (
        <table className="tbl"><thead><tr><th>Consumption band</th><th>Term</th><th>Unit rate</th><th>Standing</th><th>Commission</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td className="mono">{r.min_consumption?.toLocaleString()}–{r.max_consumption?.toLocaleString()}</td><td>{r.term_months}m</td><td>{r.unit_rate}p</td><td>{r.standing_charge}p</td><td>{r.commission}p</td></tr>)}</tbody>
        </table>
      )}
    </Modal>
  );
}
