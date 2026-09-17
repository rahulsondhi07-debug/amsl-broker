import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, MapPin, Wind, Sun, Droplets, Leaf, Factory, ShoppingCart, RotateCcw, Flame, Zap, Recycle } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

// Technologies differ by fuel: you cannot buy a wind farm's output as gas, or biomethane
// as electricity, so the technology list follows the selected fuel.
const TECHS_BY_FUEL = {
  Power: ["Wind (Onshore)", "Wind (Offshore)", "Solar PV", "Hydro", "Anaerobic Digestion", "Biomass"],
  Gas: ["Biomethane (Anaerobic Digestion)", "Biomethane (Food Waste)", "Biomethane (Sewage Gas)",
        "Biomethane (Landfill Gas)", "Bio-SNG (Gasification)"],
};
const ALL_TECHS = [...TECHS_BY_FUEL.Power, ...TECHS_BY_FUEL.Gas];
const CERTS = ["REGO", "RGGO", "Green Gas Certification Scheme", "None"];
// Only a private wire is a genuinely direct physical supply; the rest keep a licensed
// supplier in the chain, because supplying over the public network needs a supply licence.
const STRUCTURES = ["Private Wire", "Sleeved", "Virtual (CfD)", "Supplier-matched"];
const STATUSES = ["Available", "Fully Contracted", "Offline"];
const DEAL_STATUSES = ["Enquiry", "Offer Sent", "Contracted", "Live", "Ended"];

const ICONS = {
  "Wind (Onshore)": Wind, "Wind (Offshore)": Wind, "Solar PV": Sun,
  Hydro: Droplets, "Anaerobic Digestion": Leaf, Biomass: Factory,
  "Biomethane (Anaerobic Digestion)": Leaf, "Biomethane (Food Waste)": Recycle,
  "Biomethane (Sewage Gas)": Droplets, "Biomethane (Landfill Gas)": Recycle,
  "Bio-SNG (Gasification)": Factory,
};
const money = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 }));
const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === "" || v == null ? null : Number(v));

export default function LocalEnergy() {
  const [tab, setTab] = useState("generators");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Local Energy Marketplace</h1>
          <p className="sub">Buy power directly from a named generator. Pick a customer to surface generators on their own distribution network first.</p>
        </div>
      </div>
      <div className="toggle" style={{ marginBottom: 14 }}>
        <button className={tab === "generators" ? "active" : ""} onClick={() => setTab("generators")}>Generators</button>
        <button className={tab === "deals" ? "active" : ""} onClick={() => setTab("deals")}>Customer Deals</button>
      </div>
      {tab === "generators" ? <Generators /> : <Deals />}
    </>
  );
}

function Generators() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({});
  const [err, setErr] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [f, setF] = useState({ business_id: "", utility: "", dist_id: "", technology: "", max_price: "", available_only: "1" });
  const [areas, setAreas] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [buying, setBuying] = useState(null);

  const load = useCallback(() => {
    api.localGenerators(f)
      .then((r) => { setRows(r.data); setMeta(r.meta || {}); setErr(null); })
      .catch((e) => setErr(e.message));
  }, [f]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.localAreas().then((r) => setAreas(r.data)).catch(() => {});
    api.list("customers", { limit: 300 }).then((r) => setBusinesses(r.data)).catch(() => {});
  }, []);

  const del = async (g) => {
    if (!confirm(`Remove generator "${g.name}"?`)) return;
    try { await api.localGeneratorDelete(g.id); load(); } catch (e) { alert(e.message); }
  };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const active = f.business_id || f.utility || f.dist_id || f.technology || f.max_price;
  const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" };

  return (
    <Card>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <select value={f.business_id} onChange={set("business_id")} style={{ ...sel, minWidth: 220 }}>
          <option value="">Locality: no customer selected</option>
          {businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name}</option>)}
        </select>
        <div className="toggle">
          {[["", "All fuels"], ["Power", "Power"], ["Gas", "Green Gas"]].map(([v, l]) => (
            <button key={l} className={f.utility === v ? "active" : ""}
              onClick={() => setF({ ...f, utility: v, technology: "" })}>
              {l}{meta.counts && v && ` (${meta.counts[v] ?? 0})`}
            </button>
          ))}
        </div>
        <select value={f.dist_id} onChange={set("dist_id")} style={sel}>
          <option value="">All areas</option>
          {areas.map((a) => <option key={a.dist_id} value={a.dist_id}>{a.dist_id} — {a.name}</option>)}
        </select>
        <select value={f.technology} onChange={set("technology")} style={sel}>
          <option value="">All technologies</option>
          {(f.utility ? TECHS_BY_FUEL[f.utility] : ALL_TECHS).map((t) => <option key={t}>{t}</option>)}
        </select>
        <input placeholder="Max p/kWh" value={f.max_price} onChange={set("max_price")} style={{ ...sel, width: 120 }} />
        <select value={f.available_only} onChange={set("available_only")} style={sel}>
          <option value="1">Available only</option>
          <option value="">All statuses</option>
        </select>
        {active && <button className="btn ghost" onClick={() => setF({ business_id: "", utility: "", dist_id: "", technology: "", max_price: "", available_only: "1" })}><RotateCcw size={14} /> Reset</button>}
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}><Plus size={15} /> Add Generator</button>
      </div>

      {meta.customer_area && (
        <div className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
          <MapPin size={12} style={{ verticalAlign: "-2px" }} /> This customer is in distribution area <b>{meta.customer_dist_id} — {meta.customer_area}</b> (from their MPAN). Generators on that network are tagged Local and listed first.
        </div>
      )}
      {f.business_id && !meta.customer_area && (
        <div className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
          No electricity MPAN on record for this customer, so locality can't be determined — add a meter to enable local matching.
        </div>
      )}

      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Generator</th><th>Fuel</th><th>Technology</th><th>Area</th><th>Capacity</th>
              <th>Available</th><th>Price</th><th>Cert</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={10} className="sub" style={{ padding: 16, textAlign: "center" }}>No generators match these filters.</td></tr>}
              {rows.map((g) => {
                const Icon = ICONS[g.technology] || Wind;
                return (
                  <tr key={g.id} style={g.locality === "Local" ? { background: "#f0fdf4" } : undefined}>
                    <td>
                      <span className="mini"><span className="ini sq"><Icon size={14} /></span>
                        <span className="name">{g.name}</span></span>
                      <div className="sub" style={{ fontSize: 11 }}>{g.operator || "—"}{g.postcode ? ` · ${g.postcode}` : ""}</div>
                    </td>
                    <td>
                      <Badge tone={g.utility === "Gas" ? "amber" : "indigo"}>
                        {g.utility === "Gas" ? <Flame size={10} style={{ verticalAlign: "-1px" }} /> : <Zap size={10} style={{ verticalAlign: "-1px" }} />}
                        {" "}{g.utility === "Gas" ? "Green Gas" : "Power"}
                      </Badge>
                    </td>
                    <td style={{ fontSize: 12 }}>{g.technology || "—"}</td>
                    <td style={{ fontSize: 12 }}>
                      {g.region || "—"}
                      {g.locality === "Local" && <div><Badge tone="green"><MapPin size={10} style={{ verticalAlign: "-1px" }} /> Local</Badge></div>}
                    </td>
                    <td className="mono">{g.capacity_mw != null ? `${g.capacity_mw} MW` : "—"}</td>
                    <td className="mono">{g.available_mwh != null ? `${Number(g.available_mwh).toLocaleString()} MWh` : "—"}</td>
                    <td className="mono">{g.price_p_kwh != null ? `${g.price_p_kwh}p` : "—"}</td>
                    <td style={{ fontSize: 11.5 }}>{g.certification ? <Badge tone="green">{g.certification}</Badge> : <span className="sub">—</span>}</td>
                    <td><Badge tone={g.status === "Available" ? "green" : g.status === "Offline" ? "rose" : "amber"}>{g.status}</Badge></td>
                    <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {g.status === "Available" && <button className="btn primary sm" onClick={() => setBuying(g)}><ShoppingCart size={13} /> Buy</button>}
                      <button className="btn ghost sm" onClick={() => setEditing(g)}><Pencil size={13} /></button>
                      <button className="btn ghost sm" onClick={() => del(g)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <GeneratorForm gen={editing} areas={areas}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
      {buying && (
        <BuyForm gen={buying} businesses={businesses} defaultBusinessId={f.business_id}
          onClose={() => setBuying(null)} onSaved={() => { setBuying(null); load(); }} />
      )}
    </Card>
  );
}

function GeneratorForm({ gen, areas, onClose, onSaved }) {
  const [f, setF] = useState({
    name: gen?.name || "", operator: gen?.operator || "", technology: gen?.technology || "Solar PV",
    utility: gen?.utility || "Power", certification: gen?.certification || "REGO", injection_point: gen?.injection_point || "",
    dist_id: gen?.dist_id ?? "", postcode: gen?.postcode || "", capacity_mw: gen?.capacity_mw ?? "",
    annual_output_mwh: gen?.annual_output_mwh ?? "", available_mwh: gen?.available_mwh ?? "",
    price_p_kwh: gen?.price_p_kwh ?? "", min_volume_mwh: gen?.min_volume_mwh ?? "",
    term_months_min: gen?.term_months_min ?? "", term_months_max: gen?.term_months_max ?? "",
    commissioned_year: gen?.commissioned_year ?? "", status: gen?.status || "Available", notes: gen?.notes || "",
    private_wire_available: gen?.private_wire_available ? "1" : "0",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return setErr("Generator name is required");
    setSaving(true); setErr(null);
    const body = {
      ...f, dist_id: num(f.dist_id), capacity_mw: num(f.capacity_mw),
      annual_output_mwh: num(f.annual_output_mwh), available_mwh: num(f.available_mwh),
      price_p_kwh: num(f.price_p_kwh), min_volume_mwh: num(f.min_volume_mwh),
      term_months_min: num(f.term_months_min), term_months_max: num(f.term_months_max),
      commissioned_year: num(f.commissioned_year), private_wire_available: Number(f.private_wire_available) || 0,
    };
    try {
      if (gen) await api.localGeneratorUpdate(gen.id, body);
      else await api.localGeneratorCreate(body);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={gen ? `Edit — ${gen.name}` : "Add Generator"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Generator Name *"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Operator"><input value={f.operator} onChange={set("operator")} /></Field>
        <Field label="Fuel">
          <select value={f.utility} onChange={(e) => {
            const u = e.target.value;
            // Switching fuel resets technology and certification to that fuel's defaults,
            // so a gas producer can't be left tagged as wind with a REGO.
            setF({ ...f, utility: u, technology: TECHS_BY_FUEL[u][0], certification: u === "Gas" ? "RGGO" : "REGO" });
          }}>
            <option value="Power">Power</option><option value="Gas">Green Gas</option>
          </select>
        </Field>
        <Field label="Technology"><select value={f.technology} onChange={set("technology")}>
          {TECHS_BY_FUEL[f.utility].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Certification"><select value={f.certification} onChange={set("certification")}>
          {CERTS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        {f.utility === "Gas" && (
          <Field label="Grid Injection Point"><input value={f.injection_point} onChange={set("injection_point")} placeholder="e.g. Poundbury Entry" /></Field>
        )}
        <Field label="Distribution Area">
          <select value={f.dist_id} onChange={set("dist_id")}>
            <option value="">—</option>
            {areas.map((a) => <option key={a.dist_id} value={a.dist_id}>{a.dist_id} — {a.name}</option>)}
          </select>
        </Field>
        <Field label="Postcode"><input value={f.postcode} onChange={set("postcode")} /></Field>
        <Field label="Capacity (MW)"><input type="number" step="0.1" value={f.capacity_mw} onChange={set("capacity_mw")} /></Field>
        <Field label="Annual Output (MWh)"><input type="number" value={f.annual_output_mwh} onChange={set("annual_output_mwh")} /></Field>
        <Field label="Available to Contract (MWh)"><input type="number" value={f.available_mwh} onChange={set("available_mwh")} /></Field>
        <Field label="Price (p/kWh)"><input type="number" step="0.01" value={f.price_p_kwh} onChange={set("price_p_kwh")} /></Field>
        <Field label="Minimum Volume (MWh)"><input type="number" value={f.min_volume_mwh} onChange={set("min_volume_mwh")} /></Field>
        <Field label="Min Term (months)"><input type="number" value={f.term_months_min} onChange={set("term_months_min")} /></Field>
        <Field label="Max Term (months)"><input type="number" value={f.term_months_max} onChange={set("term_months_max")} /></Field>
        <Field label="Commissioned Year"><input type="number" value={f.commissioned_year} onChange={set("commissioned_year")} /></Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Private Wire Possible">
          <select value={f.private_wire_available} onChange={set("private_wire_available")}>
            <option value="0">No — needs a supplier in the chain</option>
            <option value="1">Yes — direct connection available</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

function BuyForm({ gen, businesses, defaultBusinessId, onClose, onSaved }) {
  const [f, setF] = useState({
    business_id: defaultBusinessId || "", volume_mwh: "", price_p_kwh: gen.price_p_kwh ?? "",
    term_months: gen.term_months_min ?? "", start_date: "", status: "Enquiry", notes: "",
    structure: gen.private_wire_available ? "Private Wire" : "Sleeved",
    sleeving_supplier_id: "", sleeving_fee_p_kwh: "",
  });
  const [structures, setStructures] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  useEffect(() => {
    api.localStructures().then((r) => setStructures(r.data)).catch(() => {});
    api.list("suppliers", { limit: 300 }).then((r) => setSuppliers(r.data)).catch(() => {});
  }, []);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const meta = structures.find((x) => x.name === f.structure);
  const sleeve = num(f.sleeving_fee_p_kwh) || 0;
  const delivered = num(f.price_p_kwh) != null ? round2(num(f.price_p_kwh) + sleeve) : null;
  const annual = num(f.volume_mwh) && delivered ? (num(f.volume_mwh) * 1000 * delivered) / 100 : null;
  const pwBlocked = f.structure === "Private Wire" && !gen.private_wire_available;

  const save = async () => {
    if (!f.business_id) return setErr("Select which customer this is for");
    if (!num(f.volume_mwh)) return setErr("Enter a volume in MWh");
    setSaving(true); setErr(null);
    try {
      await api.localDealCreate({
        business_id: Number(f.business_id), generator_id: gen.id,
        volume_mwh: num(f.volume_mwh), price_p_kwh: num(f.price_p_kwh),
        term_months: num(f.term_months), start_date: f.start_date || null,
        status: f.status, notes: f.notes || null,
        structure: f.structure, sleeving_supplier_id: num(f.sleeving_supplier_id),
        sleeving_fee_p_kwh: num(f.sleeving_fee_p_kwh),
      });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={`Buy from ${gen.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Create Deal"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
        {gen.technology} · {gen.region || "—"} · {gen.available_mwh != null ? `${Number(gen.available_mwh).toLocaleString()} MWh uncontracted` : "volume on request"}
        {gen.min_volume_mwh != null ? ` · minimum ${gen.min_volume_mwh} MWh` : ""}
      </div>
      <div className="grid cols-2">
        <Field label="Customer *">
          <select value={f.business_id} onChange={set("business_id")}>
            <option value="">Select customer…</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name}</option>)}
          </select>
        </Field>
        <Field label="Volume (MWh/yr) *"><input type="number" value={f.volume_mwh} onChange={set("volume_mwh")} /></Field>
        <Field label="PPA Structure *">
          <select value={f.structure} onChange={set("structure")}>
            {STRUCTURES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        {meta?.needsSupplier && (
          <Field label="Licensed Supplier *">
            <select value={f.sleeving_supplier_id} onChange={set("sleeving_supplier_id")}>
              <option value="">Select supplier…</option>
              {suppliers.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </select>
          </Field>
        )}
        {meta?.needsSupplier && (
          <Field label="Sleeving Fee (p/kWh)"><input type="number" step="0.01" value={f.sleeving_fee_p_kwh} onChange={set("sleeving_fee_p_kwh")} /></Field>
        )}
        <Field label="Price (p/kWh)"><input type="number" step="0.01" value={f.price_p_kwh} onChange={set("price_p_kwh")} /></Field>
        <Field label="Term (months)"><input type="number" value={f.term_months} onChange={set("term_months")} /></Field>
        <Field label="Start Date"><input type="date" value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}>{DEAL_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      {meta && (
        <div style={{ padding: "10px 12px", background: meta.direct ? "#ecfdf5" : "#F8FAFC", border: `1px solid ${meta.direct ? "#a7f3d0" : "var(--line,#E7EBF0)"}`, borderRadius: 8, fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
          <b>{meta.direct ? "Direct physical supply" : "A licensed supplier remains in the chain"}</b> — {meta.note}
        </div>
      )}
      {pwBlocked && (
        <div style={{ padding: "10px 12px", background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 8, fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
          {gen.name} is not marked as offering a private wire. Without a physical connection to the site this must be sleeved, virtual or supplier-matched.
        </div>
      )}
      {annual != null && (
        <div style={{ padding: "10px 12px", background: "var(--subtle,#F8FAFC)", border: "1px solid var(--line,#E7EBF0)", borderRadius: 8, fontSize: 13, marginTop: 4 }}>
          Indicative annual value: <b>{money(annual)}</b>
          <span className="sub"> ({Number(f.volume_mwh).toLocaleString()} MWh × {delivered}p/kWh delivered
          {sleeve ? ` — ${f.price_p_kwh}p generator + ${sleeve}p sleeving` : ""})</span>
        </div>
      )}
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

function Deals() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState("");
  const load = useCallback(() => {
    api.localDeals(status ? { status } : {}).then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const setDealStatus = async (d, s) => { await api.localDealUpdate(d.id, { status: s }); load(); };
  const del = async (d) => {
    if (!confirm(`Delete this deal? The ${d.volume_mwh} MWh will be returned to ${d.generator_name || "the generator"}.`)) return;
    try { await api.localDealDelete(d.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <Card>
      <div style={{ marginBottom: 12 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" }}>
          <option value="">All statuses</option>
          {DEAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Generator</th><th>Structure</th><th>Area</th><th>Volume</th><th>Delivered</th><th>Annual Value</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="sub" style={{ padding: 16, textAlign: "center" }}>No deals yet — buy from a generator to create one.</td></tr>}
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="name">{d.business_name || "—"}</td>
                  <td>{d.generator_name || "—"}<div className="sub" style={{ fontSize: 11 }}>{d.technology || ""}</div></td>
                  <td>
                    <Badge tone={d.structure === "Private Wire" ? "green" : "slate"}>{d.structure || "Sleeved"}</Badge>
                    {d.sleeving_supplier_name && <div className="sub" style={{ fontSize: 10.5 }}>via {d.sleeving_supplier_name}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {d.region || "—"}
                    {d.locality && d.locality !== "Elsewhere" && (
                      <div><Badge tone={d.locality.startsWith("Local") ? "green" : "slate"}>
                        <MapPin size={10} style={{ verticalAlign: "-1px" }} /> {d.locality}</Badge></div>
                    )}
                  </td>
                  <td className="mono">{Number(d.volume_mwh).toLocaleString()} MWh</td>
                  <td className="mono">{d.total_delivered_p_kwh ?? d.price_p_kwh}p
                    {d.sleeving_fee_p_kwh ? <div className="sub" style={{ fontSize: 10.5 }}>incl {d.sleeving_fee_p_kwh}p sleeve</div> : null}
                  </td>
                  <td className="name">{money(d.annual_value)}</td>
                  <td>
                    <select value={d.status} onChange={(e) => setDealStatus(d, e.target.value)}
                      style={{ fontSize: 12, padding: "4px 6px", borderRadius: 7, border: "1px solid var(--line,#E7EBF0)" }}>
                      {DEAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}><button className="btn ghost sm" onClick={() => del(d)}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
