import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Users, Leaf, TrendingDown, Calculator } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const REGISTRIES = ["Verra VCS", "Gold Standard", "Woodland Carbon Code", "Peatland Code", "Puro.earth", "American Carbon Registry", "Climate Action Reserve"];
const TYPES = ["Afforestation", "Peatland Restoration", "Agroforestry", "REDD+", "Cookstoves", "Renewable Energy", "Biochar", "Direct Air Capture"];
const POOL_STATUS = ["Open", "Closed", "Settled"];
const ALLOC_STATUS = ["Committed", "Purchased", "Retired", "Cancelled"];

const money = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money0 = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 }));
const t = (n) => (n == null ? "—" : `${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 })} t`);
const num = (v) => (v === "" || v == null ? null : Number(v));
const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" };

export default function Carbon() {
  const [tab, setTab] = useState("pools");
  const [summary, setSummary] = useState(null);
  const loadSummary = useCallback(() => { api.carbonSummary().then((r) => setSummary(r.data)).catch(() => {}); }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Carbon Credits</h1>
          <p className="sub">Pool customer demand into a single purchase so everyone reaches volume pricing. One credit = one tonne of CO2e.</p>
        </div>
      </div>

      {summary && (
        <div className="grid cols-4" style={{ marginBottom: 14 }}>
          <Card><div className="sub" style={{ fontSize: 11 }}>OPEN POOLS</div><div style={{ fontWeight: 800, fontSize: 22 }}>{summary.open_pools}</div><div className="sub" style={{ fontSize: 11 }}>{t(summary.pooled_tonnes)} committed</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>TOTAL VOLUME</div><div style={{ fontWeight: 800, fontSize: 22 }}>{t(summary.total_tonnes)}</div><div className="sub" style={{ fontSize: 11 }}>{money0(summary.total_value)} value</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>RETIRED</div><div style={{ fontWeight: 800, fontSize: 22, color: "var(--brand,#0E7C7B)" }}>{t(summary.retired_tonnes)}</div><div className="sub" style={{ fontSize: 11 }}>permanently claimed</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>AGGREGATION SAVING</div><div style={{ fontWeight: 800, fontSize: 22, color: "var(--brand,#0E7C7B)" }}>{money0(summary.aggregation_saving)}</div><div className="sub" style={{ fontSize: 11 }}>vs buying at list</div></Card>
        </div>
      )}

      <div className="toggle" style={{ marginBottom: 14 }}>
        <button className={tab === "pools" ? "active" : ""} onClick={() => setTab("pools")}>Pools</button>
        <button className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>Projects</button>
        <button className={tab === "allocations" ? "active" : ""} onClick={() => setTab("allocations")}>Customer Allocations</button>
      </div>

      {tab === "pools" && <Pools onChanged={loadSummary} />}
      {tab === "projects" && <Projects />}
      {tab === "allocations" && <Allocations onChanged={loadSummary} />}
    </>
  );
}

/* ---------------- Pools ---------------- */
function Pools({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [joining, setJoining] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [members, setMembers] = useState([]);

  const load = useCallback(() => {
    api.carbonPools().then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (p) => {
    if (expanded === p.id) { setExpanded(null); return; }
    setExpanded(p.id);
    api.carbonAllocations({ pool_id: p.id }).then((r) => setMembers(r.data)).catch(() => setMembers([]));
  };
  const del = async (p) => {
    if (!confirm(`Delete pool "${p.name}" and all its commitments?`)) return;
    try { await api.carbonPoolDelete(p.id); setExpanded(null); load(); onChanged?.(); } catch (e) { alert(e.message); }
  };
  const setStatus = async (p, s) => { await api.carbonPoolUpdate(p.id, { status: s }); load(); onChanged?.(); };

  return (
    <Card>
      <div style={{ display: "flex", marginBottom: 12 }}>
        <div className="sub" style={{ fontSize: 12 }}>Click a pool to see its members. Prices improve for everyone as committed volume crosses each tier.</div>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}><Plus size={15} /> Create Pool</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Pool</th><th>Project</th><th>Members</th><th>Committed</th><th>Price</th><th>Next Tier</th><th>Saving</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="sub" style={{ padding: 16, textAlign: "center" }}>No pools yet — create one to start aggregating demand.</td></tr>}
              {rows.map((p) => {
                const pct = p.target_tonnes ? Math.min(100, (p.committed_tonnes / p.target_tonnes) * 100) : null;
                return (
                  <>
                    <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => open(p)}>
                      <td>
                        <span className="name">{p.name}</span>
                        {pct != null && (
                          <div style={{ marginTop: 4, height: 5, background: "#E2E8F0", borderRadius: 999, width: 130 }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand,#0E7C7B)", borderRadius: 999 }} />
                          </div>
                        )}
                        {p.target_tonnes && <div className="sub" style={{ fontSize: 10.5 }}>{t(p.committed_tonnes)} of {t(p.target_tonnes)} target</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{p.project_name || "—"}<div className="sub" style={{ fontSize: 11 }}>{p.registry || ""}</div></td>
                      <td className="mono"><Users size={12} style={{ verticalAlign: "-1px" }} /> {p.members}</td>
                      <td className="mono">{t(p.committed_tonnes)}</td>
                      <td>
                        <span className="name">{money(p.effective_price)}/t</span>
                        {p.list_price != null && p.effective_price != null && p.effective_price < p.list_price && (
                          <div className="sub" style={{ fontSize: 10.5, textDecoration: "line-through" }}>{money(p.list_price)}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 11.5 }}>
                        {p.next_tier
                          ? <>{t(p.tonnes_to_next_tier)} away<div className="sub" style={{ fontSize: 10.5 }}>then {money(p.next_tier.price_per_tonne)}/t</div></>
                          : <span className="sub">best tier reached</span>}
                      </td>
                      <td>{p.saving_vs_list ? <Badge tone="green"><TrendingDown size={10} style={{ verticalAlign: "-1px" }} /> {money0(p.saving_vs_list)}</Badge> : <span className="sub">—</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select value={p.status} onChange={(e) => setStatus(p, e.target.value)} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 7, border: "1px solid var(--line,#E7EBF0)" }}>
                          {POOL_STATUS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                        {p.status === "Open" && <button className="btn primary sm" onClick={() => setJoining(p)}><Plus size={13} /> Add Customer</button>}
                        <button className="btn ghost sm" onClick={() => setEditing(p)}><Pencil size={13} /></button>
                        <button className="btn ghost sm" onClick={() => del(p)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                    {expanded === p.id && (
                      <tr key={`${p.id}-d`}>
                        <td colSpan={9} style={{ background: "var(--subtle,#F8FAFC)", padding: 12 }}>
                          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
                            <div>
                              <div className="sub" style={{ fontSize: 11, marginBottom: 4 }}>PRICE TIERS</div>
                              {p.tiers.length === 0 ? <span className="sub" style={{ fontSize: 12 }}>No tiers — list price applies.</span> : (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {p.tiers.map((tr) => (
                                    <span key={tr.id} style={{
                                      fontSize: 11.5, padding: "4px 8px", borderRadius: 7,
                                      border: "1px solid var(--line,#E7EBF0)",
                                      background: p.committed_tonnes >= tr.min_tonnes ? "#ecfdf5" : "#fff",
                                      fontWeight: p.effective_price === tr.price_per_tonne ? 700 : 400,
                                    }}>
                                      {t(tr.min_tonnes)}+ → {money(tr.price_per_tonne)}/t
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {members.length === 0 ? <div className="sub" style={{ fontSize: 12 }}>No customers in this pool yet.</div> : (
                            <table className="tbl" style={{ background: "#fff" }}>
                              <thead><tr><th>Customer</th><th>Tonnes</th><th>Price</th><th>Cost</th><th>Status</th></tr></thead>
                              <tbody>
                                {members.map((m) => (
                                  <tr key={m.id}>
                                    <td className="name">{m.business_name}</td>
                                    <td className="mono">{t(m.tonnes)}</td>
                                    <td className="mono">{money(m.price_per_tonne)}</td>
                                    <td className="name">{money(m.cost)}</td>
                                    <td><Badge tone={m.status === "Retired" ? "green" : m.status === "Cancelled" ? "rose" : "slate"}>{m.status}</Badge></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(showAdd || editing) && <PoolForm pool={editing} onClose={() => { setShowAdd(false); setEditing(null); }} onSaved={() => { setShowAdd(false); setEditing(null); load(); onChanged?.(); }} />}
      {joining && <JoinForm pool={joining} onClose={() => setJoining(null)} onSaved={() => { setJoining(null); load(); onChanged?.(); if (expanded) api.carbonAllocations({ pool_id: expanded }).then((r) => setMembers(r.data)); }} />}
    </Card>
  );
}

function PoolForm({ pool, onClose, onSaved }) {
  const [projects, setProjects] = useState([]);
  const [f, setF] = useState({
    name: pool?.name || "", project_id: pool?.project_id ?? "", target_tonnes: pool?.target_tonnes ?? "",
    closes_on: pool?.closes_on || "", status: pool?.status || "Open", notes: pool?.notes || "",
  });
  const [tiers, setTiers] = useState(pool?.tiers?.length ? pool.tiers.map((t) => ({ min_tonnes: t.min_tonnes, price_per_tonne: t.price_per_tonne })) : [{ min_tonnes: "", price_per_tonne: "" }]);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.carbonProjects().then((r) => setProjects(r.data)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setTier = (i, k, v) => setTiers(tiers.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));

  const save = async () => {
    if (!f.name.trim()) return setErr("Pool name is required");
    setSaving(true); setErr(null);
    const body = {
      ...f, project_id: num(f.project_id), target_tonnes: num(f.target_tonnes),
      tiers: tiers.filter((t) => t.min_tonnes !== "" && t.price_per_tonne !== "")
        .map((t) => ({ min_tonnes: Number(t.min_tonnes), price_per_tonne: Number(t.price_per_tonne) })),
    };
    try {
      if (pool) await api.carbonPoolUpdate(pool.id, body);
      else await api.carbonPoolCreate(body);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={pool ? `Edit — ${pool.name}` : "Create Pool"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Pool Name *"><input value={f.name} onChange={set("name")} placeholder="e.g. Q1 2026 Woodland Pool" /></Field>
        <Field label="Project">
          <select value={f.project_id} onChange={set("project_id")}>
            <option value="">Select project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price_per_tonne)}/t</option>)}
          </select>
        </Field>
        <Field label="Target Volume (tonnes)"><input type="number" value={f.target_tonnes} onChange={set("target_tonnes")} /></Field>
        <Field label="Closes On"><input type="date" value={f.closes_on} onChange={set("closes_on")} /></Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}>{POOL_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="sub" style={{ fontSize: 11, marginBottom: 6 }}>VOLUME PRICE TIERS — the best tier reached applies to every member</div>
        {tiers.map((tr, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
            <input type="number" placeholder="From tonnes" value={tr.min_tonnes} onChange={(e) => setTier(i, "min_tonnes", e.target.value)} style={{ ...sel, width: 140 }} />
            <span className="sub" style={{ fontSize: 12 }}>→ £</span>
            <input type="number" step="0.01" placeholder="per tonne" value={tr.price_per_tonne} onChange={(e) => setTier(i, "price_per_tonne", e.target.value)} style={{ ...sel, width: 140 }} />
            {tiers.length > 1 && <button className="btn ghost sm" onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}><Trash2 size={13} /></button>}
          </div>
        ))}
        <button className="btn ghost sm" onClick={() => setTiers([...tiers, { min_tonnes: "", price_per_tonne: "" }])}><Plus size={13} /> Add tier</button>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

function JoinForm({ pool, onClose, onSaved }) {
  const [businesses, setBusinesses] = useState([]);
  const [f, setF] = useState({ business_id: "", tonnes: "", notes: "" });
  const [footprint, setFootprint] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.list("customers", { limit: 300 }).then((r) => setBusinesses(r.data)).catch(() => {}); }, []);

  const onBiz = (e) => {
    const id = e.target.value;
    setF({ ...f, business_id: id });
    setFootprint(null);
    if (id) api.carbonFootprint(id).then((r) => setFootprint(r.data)).catch(() => {});
  };
  const tonnes = num(f.tonnes);
  const projected = pool.committed_tonnes + (tonnes || 0);
  const newTier = pool.tiers?.filter((t) => t.min_tonnes <= projected).sort((a, b) => b.min_tonnes - a.min_tonnes)[0];
  const unlocks = newTier && pool.effective_price != null && newTier.price_per_tonne < pool.effective_price;

  const save = async () => {
    if (!f.business_id) return setErr("Select a customer");
    if (!tonnes) return setErr("Enter a volume in tonnes");
    setSaving(true); setErr(null);
    try {
      await api.carbonAllocationCreate({ pool_id: pool.id, business_id: Number(f.business_id), tonnes, notes: f.notes || null });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={`Add Customer to ${pool.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Commit"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Customer *">
          <select value={f.business_id} onChange={onBiz}>
            <option value="">Select customer…</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name}</option>)}
          </select>
        </Field>
        <Field label="Tonnes (tCO2e) *"><input type="number" step="0.01" value={f.tonnes} onChange={(e) => setF({ ...f, tonnes: e.target.value })} /></Field>
      </div>
      {footprint && (
        <div style={{ padding: "10px 12px", background: "var(--subtle,#F8FAFC)", border: "1px solid var(--line,#E7EBF0)", borderRadius: 8, fontSize: 12.5, marginBottom: 8 }}>
          <Calculator size={13} style={{ verticalAlign: "-2px" }} /> Estimated energy footprint: <b>{t(footprint.total_tonnes)}/yr</b>
          <span className="sub"> ({t(footprint.electricity_tonnes)} electricity, {t(footprint.gas_tonnes)} gas)</span>
          {footprint.total_tonnes > 0 && !f.tonnes && (
            <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setF({ ...f, tonnes: String(footprint.total_tonnes) })}>Use this</button>
          )}
          <div className="sub" style={{ fontSize: 11, marginTop: 4 }}>{footprint.basis}</div>
        </div>
      )}
      {tonnes > 0 && (
        <div style={{ padding: "10px 12px", background: unlocks ? "#ecfdf5" : "var(--subtle,#F8FAFC)", border: `1px solid ${unlocks ? "#a7f3d0" : "var(--line,#E7EBF0)"}`, borderRadius: 8, fontSize: 13 }}>
          Pool would reach <b>{t(projected)}</b> at {money(newTier?.price_per_tonne ?? pool.effective_price)}/t
          {unlocks && <div style={{ marginTop: 3 }}><Badge tone="green">Unlocks a better tier for every member</Badge></div>}
          <div className="sub" style={{ fontSize: 11.5, marginTop: 3 }}>This customer's cost: {money((newTier?.price_per_tonne ?? pool.effective_price ?? 0) * tonnes)}</div>
        </div>
      )}
      <Field label="Notes"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

/* ---------------- Projects ---------------- */
function Projects() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ registry: "", project_type: "", max_price: "" });
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => { api.carbonProjects(f).then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message)); }, [f]);
  useEffect(() => { load(); }, [load]);

  const del = async (p) => {
    if (!confirm(`Delete project "${p.name}"?`)) return;
    try { await api.carbonProjectDelete(p.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <Card>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <select value={f.registry} onChange={(e) => setF({ ...f, registry: e.target.value })} style={sel}>
          <option value="">All registries</option>
          {REGISTRIES.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={f.project_type} onChange={(e) => setF({ ...f, project_type: e.target.value })} style={sel}>
          <option value="">All types</option>
          {TYPES.map((x) => <option key={x}>{x}</option>)}
        </select>
        <input placeholder="Max £/tonne" value={f.max_price} onChange={(e) => setF({ ...f, max_price: e.target.value })} style={{ ...sel, width: 130 }} />
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}><Plus size={15} /> Add Project</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Project</th><th>Registry</th><th>Type</th><th>Country</th><th>Vintage</th><th>List Price</th><th>Available</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="mini"><span className="ini sq"><Leaf size={13} /></span><span className="name">{p.name}</span></span>
                    {p.co_benefits && <div className="sub" style={{ fontSize: 11 }}>{p.co_benefits}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>{p.registry || "—"}<div className="sub" style={{ fontSize: 10.5 }}>{p.registry_ref || ""}</div></td>
                  <td style={{ fontSize: 12 }}>{p.project_type || "—"}</td>
                  <td style={{ fontSize: 12 }}>{p.country || "—"}</td>
                  <td className="mono">{p.vintage_year || "—"}</td>
                  <td className="name">{money(p.price_per_tonne)}</td>
                  <td className="mono">{p.available_tonnes != null ? Number(p.available_tonnes).toLocaleString() : "—"}</td>
                  <td><Badge tone={p.status === "Available" ? "green" : "slate"}>{p.status}</Badge></td>
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
      {(showAdd || editing) && <ProjectForm proj={editing} onClose={() => { setShowAdd(false); setEditing(null); }} onSaved={() => { setShowAdd(false); setEditing(null); load(); }} />}
    </Card>
  );
}

function ProjectForm({ proj, onClose, onSaved }) {
  const [f, setF] = useState({
    name: proj?.name || "", registry: proj?.registry || REGISTRIES[0], project_type: proj?.project_type || TYPES[0],
    country: proj?.country || "United Kingdom", vintage_year: proj?.vintage_year ?? "",
    price_per_tonne: proj?.price_per_tonne ?? "", available_tonnes: proj?.available_tonnes ?? "",
    co_benefits: proj?.co_benefits || "", registry_ref: proj?.registry_ref || "", status: proj?.status || "Available", notes: proj?.notes || "",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return setErr("Project name is required");
    setSaving(true); setErr(null);
    const body = { ...f, vintage_year: num(f.vintage_year), price_per_tonne: num(f.price_per_tonne), available_tonnes: num(f.available_tonnes) };
    try {
      if (proj) await api.carbonProjectUpdate(proj.id, body);
      else await api.carbonProjectCreate(body);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={proj ? `Edit — ${proj.name}` : "Add Project"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Project Name *"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Registry"><select value={f.registry} onChange={set("registry")}>{REGISTRIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Project Type"><select value={f.project_type} onChange={set("project_type")}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Country"><input value={f.country} onChange={set("country")} /></Field>
        <Field label="Vintage Year"><input type="number" value={f.vintage_year} onChange={set("vintage_year")} /></Field>
        <Field label="List Price (£/tonne)"><input type="number" step="0.01" value={f.price_per_tonne} onChange={set("price_per_tonne")} /></Field>
        <Field label="Available (tonnes)"><input type="number" value={f.available_tonnes} onChange={set("available_tonnes")} /></Field>
        <Field label="Registry Reference"><input value={f.registry_ref} onChange={set("registry_ref")} placeholder="Project ID on the registry" /></Field>
        <Field label="Co-benefits"><input value={f.co_benefits} onChange={set("co_benefits")} placeholder="e.g. Biodiversity, SDG 15" /></Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}><option>Available</option><option>Sold Out</option><option>Retired</option></select></Field>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

/* ---------------- Allocations ---------------- */
function Allocations({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => { api.carbonAllocations().then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (a, s) => {
    const body = { status: s };
    if (s === "Retired") {
      const serial = prompt("Registry retirement serial (optional):", a.retirement_serial || "");
      if (serial) body.retirement_serial = serial;
    }
    await api.carbonAllocationUpdate(a.id, body); load(); onChanged?.();
  };
  const del = async (a) => {
    if (!confirm(`Remove ${a.business_name}'s commitment of ${t(a.tonnes)}? Pool pricing will be recalculated.`)) return;
    try { await api.carbonAllocationDelete(a.id); load(); onChanged?.(); } catch (e) { alert(e.message); }
  };

  return (
    <Card>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Pool</th><th>Project</th><th>Tonnes</th><th>Price</th><th>Cost</th><th>Retirement</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="sub" style={{ padding: 16, textAlign: "center" }}>No allocations yet.</td></tr>}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="name">{a.business_name}</td>
                  <td style={{ fontSize: 12 }}>{a.pool_name}</td>
                  <td style={{ fontSize: 12 }}>{a.project_name || "—"}<div className="sub" style={{ fontSize: 10.5 }}>{a.registry || ""}</div></td>
                  <td className="mono">{t(a.tonnes)}</td>
                  <td className="mono">{money(a.price_per_tonne)}</td>
                  <td className="name">{money(a.cost)}</td>
                  <td style={{ fontSize: 11.5 }}>
                    {a.retirement_serial || <span className="sub">—</span>}
                    {a.retired_on && <div className="sub" style={{ fontSize: 10.5 }}>{new Date(a.retired_on).toLocaleDateString("en-GB")}</div>}
                  </td>
                  <td>
                    <select value={a.status} onChange={(e) => setStatus(a, e.target.value)} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 7, border: "1px solid var(--line,#E7EBF0)" }}>
                      {ALLOC_STATUS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}><button className="btn ghost sm" onClick={() => del(a)}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
