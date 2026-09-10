import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { Plus, Table2, Eye, Pencil, Trash2, RotateCcw, Upload } from "lucide-react";
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
  const [viewing, setViewing] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  useEffect(() => { api.list("suppliers", { limit: 300 }).then((r) => setSuppliers(r.data)).catch(() => {}); }, []);

  const del = async (row) => {
    if (!confirm(`Delete product "${row.name}"?`)) return;
    await api.delete(`/products/${row.id}`); reload();
  };

  const visible = data
    .filter((r) => !statusFilter || (r.price_book_status || r.status) === statusFilter)
    .filter((r) => !supplierFilter || String(r.supplier_id) === supplierFilter);

  return (
    <>
      <div className="page-head">
        <div><h1>Products List</h1><p className="sub">Price-book products and their price matrices.</p></div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Product</button>
      </div>
      <Card>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <input placeholder="Search product…" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" }}>
            <option value="">All Status</option>{PB_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" }}>
            <option value="">All Suppliers</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {(statusFilter || supplierFilter || q) && (
            <button className="btn ghost" onClick={() => { setStatusFilter(""); setSupplierFilter(""); setQ(""); }}><RotateCcw size={14} /> Reset</button>
          )}
        </div>
        {error && <ErrorBanner error={error} onRetry={reload} />}
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Product</th><th>Supplier</th><th>Utility</th><th>Segment</th><th>Acq/Renewal</th><th>Valid</th><th>Price Book</th><th>Actions</th><th>Price Matrix</th></tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td><span className="name">{r.name}</span></td>
                    <td>{r.supplier_name || "—"}</td>
                    <td>{r.utility}</td><td>{r.segment}</td><td style={{ fontSize: 12 }}>{r.acq_renewal}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.valid_from || "—"} → {r.valid_till || "—"}</td>
                    <td><Badge tone={r.price_book_status === "Released" ? "green" : "amber"}>{r.price_book_status || r.status}</Badge></td>
                    <td>
                      <button className="btn ghost sm" onClick={() => setViewing(r)}><Eye size={13} /></button>
                      <button className="btn ghost sm" onClick={() => setEditingProduct(r)}><Pencil size={13} /></button>
                      <button className="btn ghost sm" onClick={() => del(r)}><Trash2 size={13} /></button>
                    </td>
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
      {editingProduct && <AddProduct product={editingProduct} onClose={() => setEditingProduct(null)} onSaved={() => { setEditingProduct(null); reload(); }} />}
      {pmFor && <PriceMatrix product={pmFor} onClose={() => setPmFor(null)} />}
      {viewing && <ViewProduct product={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function ViewProduct({ product, onClose }) {
  const Row = ({ k, v }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "N/A"}</span>
    </div>
  );
  return (
    <Modal title={`View Product — ${product.name}`} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
        <Row k="Product Name" v={product.name} /><Row k="Supplier" v={product.supplier_name} />
        <Row k="Corporate/SME" v={product.segment} /><Row k="Utility" v={product.utility} />
        <Row k="Fuel Mix" v={product.fuel_mix} /><Row k="Standing Charge Type" v={product.standing_charge_type} />
        <Row k="Max Commission" v={product.max_commission != null ? `${product.max_commission} p/kWh` : null} />
        <Row k="Acquisition/Renewal" v={product.acq_renewal} />
        <Row k="Valid From" v={product.valid_from} /><Row k="Valid Till" v={product.valid_till} />
        <Row k="Price Book Status" v={product.price_book_status || product.status} />
        <Row k="Min Start Days" v={product.min_start_days} />
      </div>
    </Modal>
  );
}

function AddProduct({ product, onClose, onSaved }) {
  const isEdit = !!product;
  const [suppliers, setSuppliers] = useState([]);
  const [f, setF] = useState(product ? {
    name: product.name || "", supplier_id: product.supplier_id || "", segment: product.segment || "SME", utility: product.utility || "NHH",
    standing_charge_type: product.standing_charge_type || "Pence", fuel_mix: product.fuel_mix || "Green",
    max_commission: product.max_commission ?? "", commission_increment: product.commission_increment ?? "", commission_banded: product.commission_banded || "No", standing_charge: product.standing_charge || "No",
    payment_method: product.payment_method || "Cash/Cheque/Bacs", payment_mode: product.payment_mode || "Upfront Recon yearly", initial: product.initial || "", final: product.final || "", dd_discount: product.dd_discount ?? "",
    valid_from: product.valid_from || "", valid_till: product.valid_till || "", price_book_status: product.price_book_status || "Pending", acq_renewal: product.acq_renewal || "Acquisition",
    min_start_days: product.min_start_days ?? "", min_start_date: product.min_start_date ?? "", max_start_date: product.max_start_date ?? "", status: product.status || "Active",
  } : {
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
    try {
      const p = { ...f }; nums.forEach((k) => p[k] = f[k] === "" ? null : Number(f[k]));
      if (isEdit) await api.put(`/products/${product.id}`, p); else await api.post("/products", p);
      onSaved();
    }
    catch (e) { setErr(e.message); setSaving(false); }
  };
  return (
    <Modal title={isEdit ? `Edit Product — ${product.name}` : "Add Product"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : isEdit ? "Save" : "Submit"}</button></>}>
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

// Maps the real supplier flat-file headers (e.g. "SEB Electricity Flat File") to our price_matrix
// columns. Header matching is case/spacing-tolerant so small header variations don't break import.
// Category > Attribute tree matching the reference "CSV Header Mapping" screen — each
// attribute resolves to one of our price_matrix columns (FIELD_KEY) and a default
// calculation. The real supplier flat-file stores rates/charges as fractions of a pound
// (e.g. 0.3205), which display as pence (32.05) only once multiplied by 100 — this is
// exactly what the reference's "Multiplied By 100" calculation step does; skipping it
// silently stores rates 100x too small.
const CATEGORY_TREE = {
  "Select Category…": { "": { field: null, calc: "none" } },
  "Region": {
    "Dist ID": { field: "dist_id", calc: "none" },
    "Region": { field: "region", calc: "text" },
  },
  "Meter Type": { "Meter Type": { field: "meter_type", calc: "text" } },
  "Profile Class": { "Profile Class": { field: "profile", calc: "none" } },
  "Tariff Info": { "Tariff Name": { field: "set_name", calc: "text" } },
  "Standing Charge": { "Standing Charge": { field: "standing_charge", calc: "x100" } },
  "Unit Rates": {
    "Rate 1 (Unit Rate / Day / All)": { field: "day_rate", calc: "x100" },
    "Rate 2 (Night Rate)": { field: "night_rate", calc: "x100" },
    "Rate 3 (Eve & Weekend Rate)": { field: "eve_wknd_rate", calc: "x100" },
  },
  "Consumption": {
    "Min EAC": { field: "min_aq", calc: "none" },
    "Max EAC": { field: "max_aq", calc: "none" },
  },
  "Validity & Contract Dates": {
    "Minimum Contract Start Date": { field: "effective_from", calc: "date" },
    "Maximum Contract Start Date": { field: "effective_to", calc: "date" },
  },
  "Renewable Energy": { "Renewable Energy": { field: "renewable_energy", calc: "text" } },
  "Terms": { "Contract Term": { field: "product_name", calc: "text" } },
  "Voltage / TCR Band": { "Voltage/TCR Band": { field: "voltage_tcr_band", calc: "text" } },
  "Industrial Charges (HH)": { "KVA / Capacity Charge": { field: "capacity_charge", calc: "x100" } },
  "Ignore this column": { "Ignore": { field: null, calc: "none" } },
};
const CALC_LABELS = { none: "No Calculation…", x100: "Multiplied By 100", div100: "Divided By 100", date: "No Calculation…", text: "No Calculation…" };

// Best-guess auto-mapping from a raw CSV/XLSX header string to {category, attribute} —
// pre-fills the mapping modal so the person is confirming/adjusting, not starting blank.
const HEADER_GUESS = {
  "dist id": ["Region", "Dist ID"], "distid": ["Region", "Dist ID"],
  "region": ["Region", "Region"],
  "meter type": ["Meter Type", "Meter Type"], "metertype": ["Meter Type", "Meter Type"],
  "profile": ["Profile Class", "Profile Class"],
  "standingcharge": ["Standing Charge", "Standing Charge"], "standing charge": ["Standing Charge", "Standing Charge"],
  "day/all": ["Unit Rates", "Rate 1 (Unit Rate / Day / All)"], "day": ["Unit Rates", "Rate 1 (Unit Rate / Day / All)"], "all": ["Unit Rates", "Rate 1 (Unit Rate / Day / All)"],
  "night": ["Unit Rates", "Rate 2 (Night Rate)"],
  "eve&wkend": ["Unit Rates", "Rate 3 (Eve & Weekend Rate)"], "eve & wkend": ["Unit Rates", "Rate 3 (Eve & Weekend Rate)"], "evening": ["Unit Rates", "Rate 3 (Eve & Weekend Rate)"],
  "minaq": ["Consumption", "Min EAC"], "min aq": ["Consumption", "Min EAC"],
  "maxaq": ["Consumption", "Max EAC"], "max aq": ["Consumption", "Max EAC"],
  "effective from date": ["Validity & Contract Dates", "Minimum Contract Start Date"], "effectivefromdate": ["Validity & Contract Dates", "Minimum Contract Start Date"],
  "effective to date": ["Validity & Contract Dates", "Maximum Contract Start Date"], "effectivetodate": ["Validity & Contract Dates", "Maximum Contract Start Date"],
  "renewable energy": ["Renewable Energy", "Renewable Energy"], "renewableenergy": ["Renewable Energy", "Renewable Energy"],
  "product": ["Tariff Info", "Tariff Name"],
  "productname": ["Terms", "Contract Term"], "product name": ["Terms", "Contract Term"],
  "voltage/tcr band": ["Voltage / TCR Band", "Voltage/TCR Band"], "voltage/tcrband": ["Voltage / TCR Band", "Voltage/TCR Band"],
  "capacitycharge": ["Industrial Charges (HH)", "KVA / Capacity Charge"], "capacity charge": ["Industrial Charges (HH)", "KVA / Capacity Charge"],
  "producttype": ["Ignore this column", "Ignore"],
};
const norm = (h) => String(h || "").trim().toLowerCase();
const excelDate = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  return String(v);
};
const applyCalc = (calc, val) => {
  if (val === "" || val == null) return null;
  if (calc === "date") return excelDate(val);
  if (calc === "text") return String(val);
  const n = Number(val);
  if (Number.isNaN(n)) return null;
  if (calc === "x100") return Math.round(n * 100 * 10000) / 10000; // avoid float noise, e.g. 0.3205*100 -> 32.05
  if (calc === "div100") return n / 100;
  return n;
};
const CHUNK = 4000; // rows per bulk-import request, keeps each request comfortably under the JSON body limit

function PriceMatrix({ product, onClose }) {
  const [rows, setRows] = useState(null);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState(null);   // raw headers from the uploaded file
  const [dataRows, setDataRows] = useState(null);  // raw row arrays, aligned to `headers`
  const [mapping, setMapping] = useState(null);    // per-header [{header, category, attribute}]
  const [showMapping, setShowMapping] = useState(false);
  const [parsed, setParsed] = useState(null); // { rows } — built after mapping is confirmed
  const [progress, setProgress] = useState(null); // { done, total }
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.productPriceMatrix(product.id).then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setMsg(null); setParsed(null);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    if (!aoa.length) { setMsg("Couldn't read any rows from that file."); return; }
    const rawHeaders = aoa[0];
    const body = aoa.slice(1).filter((r) => r.some((c) => c != null && c !== ""));
    setHeaders(rawHeaders);
    setDataRows(body);
    // Pre-fill the mapping table from HEADER_GUESS — the person reviews/adjusts before import,
    // rather than data silently flowing through a mapping they never saw.
    setMapping(rawHeaders.map((h) => {
      const guess = HEADER_GUESS[norm(h)];
      return { header: h, category: guess ? guess[0] : "Select Category…", attribute: guess ? guess[1] : "" };
    }));
    setShowMapping(true);
  };

  const confirmMapping = () => {
    const mappedRows = dataRows.map((r) => {
      const row = {};
      mapping.forEach((m, i) => {
        const attr = CATEGORY_TREE[m.category]?.[m.attribute];
        if (!attr || !attr.field) return;
        row[attr.field] = applyCalc(attr.calc, r[i]);
      });
      return row;
    });
    setParsed({ rows: mappedRows });
    setShowMapping(false);
  };

  const runImport = async () => {
    if (!parsed || !parsed.rows.length) return;
    setBusy(true); setMsg(null);
    let importedTotal = 0, failedTotal = 0;
    const chunks = [];
    for (let i = 0; i < parsed.rows.length; i += CHUNK) chunks.push(parsed.rows.slice(i, i + CHUNK));
    setProgress({ done: 0, total: chunks.length });
    for (let i = 0; i < chunks.length; i++) {
      try {
        const { data } = await api.productPriceMatrixBulkImport(product.id, chunks[i]);
        importedTotal += data.imported; failedTotal += data.failed;
      } catch (e) { setMsg(`Import stopped: ${e.message}`); setBusy(false); return; }
      setProgress({ done: i + 1, total: chunks.length });
    }
    setMsg(`${importedTotal.toLocaleString()} row(s) imported${failedTotal ? `, ${failedTotal} failed` : ""}.`);
    setFile(null); setParsed(null); setHeaders(null); setDataRows(null); setMapping(null); setProgress(null); setBusy(false);
    load();
  };

  const clearAll = async () => {
    if (!confirm(`Delete all ${rows?.length?.toLocaleString() || ""} price matrix rows for this product?`)) return;
    await api.productPriceMatrixClear(product.id);
    load();
  };

  return (
    <Modal title={`Price Matrix — ${product.name}`} onClose={onClose} wide
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="sub" style={{ fontSize: 12, marginBottom: 8 }}>Supplier: {product.supplier_name || "—"} · {product.utility} · {product.segment}</div>

      <div style={{ border: "1px solid var(--line,#E7EBF0)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Upload Price Matrix (CSV, XLS or XLSX)</div>
        <input type="file" accept=".csv,.xls,.xlsx" onChange={onFile} style={{ fontSize: 12 }} />
        {mapping && !showMapping && !parsed && (
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setShowMapping(true)}>Review field mapping</button>
        )}
        {parsed && (
          <div style={{ marginTop: 10, fontSize: 12 }}>
            <div>Found <b>{parsed.rows.length.toLocaleString()}</b> row(s) in <b>{file?.name}</b>, mapped and ready to import.</div>
            <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setShowMapping(true)}>Edit mapping</button>{" "}
            <button className="btn primary sm" style={{ marginTop: 8 }} disabled={busy} onClick={runImport}>
              <Upload size={13} /> {busy ? `Importing… (${progress?.done || 0}/${progress?.total || 0})` : `Import ${parsed.rows.length.toLocaleString()} rows`}
            </button>
          </div>
        )}
        {msg && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--brand,#0E7C7B)" }}>{msg}</div>}
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <div className="sub">No price matrix rows yet.</div> : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="sub" style={{ fontSize: 12 }}>{rows.length.toLocaleString()} row(s)</div>
            <button className="btn ghost sm" onClick={clearAll}><Trash2 size={13} /> Clear all</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 320, overflow: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Meter Type</th><th>Profile</th><th>Region</th><th>Tariff Name</th><th>Term</th><th>Standing (p/day)</th><th>Day (p/kWh)</th><th>Night</th><th>Eve/Wknd</th><th>Min-Max AQ</th><th>Valid</th></tr></thead>
              <tbody>
                {rows.slice(0, 200).map((r) => (
                  <tr key={r.id}>
                    <td>{r.meter_type || "—"}</td><td>{r.profile ?? "—"}</td><td>{r.region || "—"}</td>
                    <td style={{ fontSize: 12 }}>{r.set_name || "—"}</td>
                    <td style={{ fontSize: 12 }}>{r.product_name || "—"}</td>
                    <td className="mono">{r.standing_charge ?? r.standing_charge_old ?? "—"}</td>
                    <td className="mono">{r.day_rate ?? r.unit_rate ?? "—"}</td>
                    <td className="mono">{r.night_rate ?? "—"}</td><td className="mono">{r.eve_wknd_rate ?? "—"}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.min_aq ?? r.min_consumption ?? 0}–{(r.max_aq ?? r.max_consumption)?.toLocaleString() || "—"}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.effective_from || "—"} → {r.effective_to || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && <div className="sub" style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Showing first 200 of {rows.length.toLocaleString()} rows.</div>}
          </div>
        </>
      )}

      {showMapping && mapping && (
        <HeaderMappingModal mapping={mapping} setMapping={setMapping} rowCount={dataRows?.length || 0}
          onCancel={() => setShowMapping(false)} onConfirm={confirmMapping} />
      )}
    </Modal>
  );
}

function HeaderMappingModal({ mapping, setMapping, rowCount, onCancel, onConfirm }) {
  const setRow = (i, patch) => setMapping(mapping.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const preMapped = mapping.filter((m) => HEADER_GUESS[norm(m.header)]).length;
  return (
    <Modal title="CSV Header Mapping" onClose={onCancel} wide
      footer={<>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={onConfirm}>Update</button>
      </>}>
      <div className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
        {rowCount.toLocaleString()} data row(s) · {preMapped} of {mapping.length} column(s) auto-recognised
        {preMapped > 0 && <span style={{ marginLeft: 8 }}><Badge tone="green">Previously mapped</Badge></span>}
      </div>
      <div className="table-wrap" style={{ maxHeight: 420, overflow: "auto" }}>
        <table className="tbl">
          <thead><tr><th>CSV Header</th><th>Category</th><th>Attribute</th><th>Calculation</th></tr></thead>
          <tbody>
            {mapping.map((m, i) => {
              const attrs = Object.keys(CATEGORY_TREE[m.category] || {});
              const calc = CATEGORY_TREE[m.category]?.[m.attribute]?.calc;
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600, fontSize: 12 }}>{m.header}</td>
                  <td>
                    <select value={m.category} onChange={(e) => setRow(i, { category: e.target.value, attribute: "" })} style={{ fontSize: 12 }}>
                      {Object.keys(CATEGORY_TREE).map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={m.attribute} onChange={(e) => setRow(i, { attribute: e.target.value })} style={{ fontSize: 12 }} disabled={!attrs.length}>
                      <option value="">Select…</option>
                      {attrs.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--slate-500,#64748B)" }}>{calc ? CALC_LABELS[calc] : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
