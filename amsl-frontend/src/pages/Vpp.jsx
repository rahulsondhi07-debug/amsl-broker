import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, BatteryCharging, Zap, CalendarClock, PoundSterling, RotateCcw } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const SCHEME_TYPES = ["Demand Flexibility", "Capacity Market", "Frequency Response", "Local Flexibility"];
const BASES = ["Utilisation", "Availability"];
const ENROL_STATUS = ["Registered", "Active", "Suspended", "Exited"];
const PART_STATUS = ["Estimated", "Verified", "Paid"];

const money = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money0 = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 }));
const num = (v) => (v === "" || v == null ? null : Number(v));
const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" };

export default function Vpp() {
  const [tab, setTab] = useState("enrolments");
  const [summary, setSummary] = useState(null);
  const loadSummary = useCallback(() => { api.vppSummary().then((r) => setSummary(r.data)).catch(() => {}); }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Virtual Power Plant</h1>
          <p className="sub">Enrol customer batteries into flexibility schemes that pay for shifting load out of peak hours.</p>
        </div>
      </div>

      {summary && (
        <div className="grid cols-4" style={{ marginBottom: 14 }}>
          <Card><div className="sub" style={{ fontSize: 11 }}>ENROLLED ASSETS</div><div style={{ fontWeight: 800, fontSize: 22 }}>{summary.enrolments}</div><div className="sub" style={{ fontSize: 11 }}>{summary.contracted_kw} kW contracted</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>TOTAL EARNED</div><div style={{ fontWeight: 800, fontSize: 22, color: "var(--brand,#0E7C7B)" }}>{money0(summary.total_earnings)}</div><div className="sub" style={{ fontSize: 11 }}>{Number(summary.total_reduction_kwh).toLocaleString()} kWh shifted</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>PAID TO DATE</div><div style={{ fontWeight: 800, fontSize: 22 }}>{money0(summary.paid_to_date)}</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>AWAITING PAYMENT</div><div style={{ fontWeight: 800, fontSize: 22 }}>{money0(summary.pending)}</div></Card>
        </div>
      )}

      <div className="toggle" style={{ marginBottom: 14 }}>
        <button className={tab === "enrolments" ? "active" : ""} onClick={() => setTab("enrolments")}>Enrolments</button>
        <button className={tab === "programmes" ? "active" : ""} onClick={() => setTab("programmes")}>Programmes</button>
        <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>Events & Earnings</button>
      </div>

      {tab === "enrolments" && <Enrolments onChanged={loadSummary} />}
      {tab === "programmes" && <Programmes />}
      {tab === "events" && <Events onChanged={loadSummary} />}
    </>
  );
}

/* ---------------- Enrolments ---------------- */
function Enrolments({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    api.vppEnrolments(status ? { status } : {}).then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const setStat = async (row, s) => { await api.vppEnrolmentUpdate(row.id, { status: s }); load(); onChanged?.(); };
  const del = async (row) => {
    if (!confirm(`Remove this enrolment from ${row.programme_name}?`)) return;
    try { await api.vppEnrolmentDelete(row.id); load(); onChanged?.(); } catch (e) { alert(e.message); }
  };

  return (
    <Card>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={sel}>
          <option value="">All statuses</option>
          {ENROL_STATUS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}><Plus size={15} /> Enrol Asset</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Asset</th><th>Programme</th><th>Basis</th><th>Contracted</th><th>Earned</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="sub" style={{ padding: 16, textAlign: "center" }}>No enrolments yet — use "Enrol Asset" to add a battery to a scheme.</td></tr>}
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="name">{e.business_name || "—"}</td>
                  <td>
                    <span className="mini"><span className="ini sq"><BatteryCharging size={13} /></span>
                      <span style={{ fontSize: 12 }}>{e.asset_type || "—"}</span></span>
                    <div className="sub" style={{ fontSize: 11 }}>{[e.manufacturer, e.model].filter(Boolean).join(" ")}{e.capacity_kwh ? ` · ${e.capacity_kwh} kWh` : ""}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{e.programme_name}<div className="sub" style={{ fontSize: 11 }}>{e.operator}</div></td>
                  <td>
                    <Badge tone={e.payment_basis === "Availability" ? "indigo" : "slate"}>{e.payment_basis}</Badge>
                    <div className="sub" style={{ fontSize: 10.5 }}>
                      {e.payment_basis === "Availability" ? `£${e.availability_rate}/kW/yr` : `£${e.utilisation_rate}/MWh`}
                    </div>
                  </td>
                  <td className="mono">{e.contracted_kw != null ? `${e.contracted_kw} kW` : "—"}</td>
                  <td className="name">{money(e.earned_to_date)}</td>
                  <td>
                    <select value={e.status} onChange={(ev) => setStat(e, ev.target.value)} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 7, border: "1px solid var(--line,#E7EBF0)" }}>
                      {ENROL_STATUS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}><button className="btn ghost sm" onClick={() => del(e)}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && <EnrolForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); onChanged?.(); }} />}
    </Card>
  );
}

function EnrolForm({ onClose, onSaved }) {
  const [assets, setAssets] = useState([]);
  const [progs, setProgs] = useState([]);
  const [f, setF] = useState({ asset_id: "", programme_id: "", contracted_kw: "", start_date: "", reference: "", notes: "" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.vppEligibleAssets().then((r) => setAssets(r.data)).catch(() => {});
    api.vppProgrammes({ status: "Open" }).then((r) => setProgs(r.data)).catch(() => {});
  }, []);

  const asset = assets.find((a) => String(a.id) === String(f.asset_id));
  const prog = progs.find((p) => String(p.id) === String(f.programme_id));
  // Default the contracted capacity to the asset's rated power — the agent can trim it.
  const onAsset = (e) => {
    const a = assets.find((x) => String(x.id) === String(e.target.value));
    setF({ ...f, asset_id: e.target.value, contracted_kw: a?.capacity_kw ?? "" });
  };
  const kw = num(f.contracted_kw);
  const belowMin = prog?.min_capacity_kw != null && kw != null && kw < prog.min_capacity_kw;
  const estimate = prog && kw
    ? prog.payment_basis === "Availability"
      ? `Roughly ${money0(kw * (prog.availability_rate || 0))}/yr in availability payments`
      : `About ${money(((kw * 2) / 1000) * (prog.utilisation_rate || 0))} per 2-hour event at full output`
    : null;

  const save = async () => {
    if (!f.asset_id) return setErr("Select an asset to enrol");
    if (!f.programme_id) return setErr("Select a programme");
    setSaving(true); setErr(null);
    try {
      await api.vppEnrolmentCreate({
        business_id: asset.business_id, asset_id: Number(f.asset_id), programme_id: Number(f.programme_id),
        contracted_kw: kw, start_date: f.start_date || null, reference: f.reference || null, notes: f.notes || null,
      });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Enrol Asset in a Flexibility Scheme" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Enrol"}</button></>}>
      {err && <ErrorBanner error={err} />}
      {assets.length === 0 && (
        <div className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
          No eligible assets found. Add a Battery Storage or EV Charge Point on a customer's Energy Assets tab first.
        </div>
      )}
      <div className="grid cols-2">
        <Field label="Asset *">
          <select value={f.asset_id} onChange={onAsset}>
            <option value="">Select asset…</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.business_name} — {a.asset_type}{a.capacity_kw ? ` (${a.capacity_kw} kW)` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Programme *">
          <select value={f.programme_id} onChange={(e) => setF({ ...f, programme_id: e.target.value })}>
            <option value="">Select programme…</option>
            {progs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.operator})</option>)}
          </select>
        </Field>
        <Field label="Contracted Capacity (kW)"><input type="number" value={f.contracted_kw} onChange={(e) => setF({ ...f, contracted_kw: e.target.value })} /></Field>
        <Field label="Start Date"><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="Reference"><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Scheme/provider reference" /></Field>
      </div>
      {prog?.typical_window && <div className="sub" style={{ fontSize: 11.5, marginTop: 4 }}>Typical call window: {prog.typical_window}</div>}
      {belowMin && (
        <div style={{ padding: "8px 10px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 12, marginTop: 8 }}>
          {prog.name} requires at least {prog.min_capacity_kw} kW — this asset is below the threshold and will be rejected. Smaller sites usually need an aggregator to pool capacity.
        </div>
      )}
      {estimate && !belowMin && (
        <div style={{ padding: "8px 10px", background: "var(--subtle,#F8FAFC)", border: "1px solid var(--line,#E7EBF0)", borderRadius: 8, fontSize: 12, marginTop: 8 }}>
          Indicative only: {estimate}. Actual earnings depend on how often events are called and measured performance.
        </div>
      )}
      <Field label="Notes"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

/* ---------------- Programmes ---------------- */
function Programmes() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const load = useCallback(() => { api.vppProgrammes().then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (p) => {
    if (!confirm(`Delete programme "${p.name}"? Any enrolments in it will be removed too.`)) return;
    try { await api.vppProgrammeDelete(p.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <Card>
      <div style={{ display: "flex", marginBottom: 12 }}>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}><Plus size={15} /> Add Programme</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Programme</th><th>Operator</th><th>Type</th><th>Basis</th><th>Rate</th><th>Min Capacity</th><th>Window</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="name">{p.name}</td>
                  <td style={{ fontSize: 12 }}>{p.operator || "—"}</td>
                  <td style={{ fontSize: 12 }}>{p.scheme_type || "—"}</td>
                  <td><Badge tone={p.payment_basis === "Availability" ? "indigo" : "slate"}>{p.payment_basis}</Badge></td>
                  <td className="mono">{p.payment_basis === "Availability" ? `£${p.availability_rate}/kW/yr` : `£${p.utilisation_rate}/MWh`}</td>
                  <td className="mono">{p.min_capacity_kw != null ? `${p.min_capacity_kw} kW` : "—"}</td>
                  <td style={{ fontSize: 11.5, maxWidth: 200 }}>{p.typical_window || "—"}</td>
                  <td><Badge tone={p.status === "Open" ? "green" : "slate"}>{p.status}</Badge></td>
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
        <ProgrammeForm prog={editing} onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
    </Card>
  );
}

function ProgrammeForm({ prog, onClose, onSaved }) {
  const [f, setF] = useState({
    name: prog?.name || "", operator: prog?.operator || "", scheme_type: prog?.scheme_type || "Demand Flexibility",
    payment_basis: prog?.payment_basis || "Utilisation", utilisation_rate: prog?.utilisation_rate ?? "",
    availability_rate: prog?.availability_rate ?? "", min_capacity_kw: prog?.min_capacity_kw ?? "",
    typical_window: prog?.typical_window || "", status: prog?.status || "Open", notes: prog?.notes || "",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return setErr("Programme name is required");
    setSaving(true); setErr(null);
    const body = { ...f, utilisation_rate: num(f.utilisation_rate), availability_rate: num(f.availability_rate), min_capacity_kw: num(f.min_capacity_kw) };
    try {
      if (prog) await api.vppProgrammeUpdate(prog.id, body);
      else await api.vppProgrammeCreate(body);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={prog ? `Edit — ${prog.name}` : "Add Programme"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Programme Name *"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Operator"><input value={f.operator} onChange={set("operator")} placeholder="NESO, supplier or aggregator" /></Field>
        <Field label="Scheme Type"><select value={f.scheme_type} onChange={set("scheme_type")}>{SCHEME_TYPES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Payment Basis"><select value={f.payment_basis} onChange={set("payment_basis")}>{BASES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        {f.payment_basis === "Utilisation"
          ? <Field label="Utilisation Rate (£/MWh)"><input type="number" step="0.01" value={f.utilisation_rate} onChange={set("utilisation_rate")} /></Field>
          : <Field label="Availability Rate (£/kW/yr)"><input type="number" step="0.01" value={f.availability_rate} onChange={set("availability_rate")} /></Field>}
        <Field label="Minimum Capacity (kW)"><input type="number" value={f.min_capacity_kw} onChange={set("min_capacity_kw")} /></Field>
        <Field label="Typical Window"><input value={f.typical_window} onChange={set("typical_window")} placeholder="16:00-19:00 weekdays, Nov-Mar" /></Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}><option>Open</option><option>Closed</option></select></Field>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

/* ---------------- Events & Earnings ---------------- */
function Events({ onChanged }) {
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [logFor, setLogFor] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [parts, setParts] = useState([]);

  const load = useCallback(() => { api.vppEvents().then((r) => { setEvents(r.data); setErr(null); }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const openEvent = (ev) => {
    if (expanded === ev.id) { setExpanded(null); return; }
    setExpanded(ev.id);
    api.vppParticipation({ event_id: ev.id }).then((r) => setParts(r.data)).catch(() => setParts([]));
  };
  const setPartStatus = async (p, s) => {
    await api.vppParticipationUpdate(p.id, { status: s });
    api.vppParticipation({ event_id: expanded }).then((r) => setParts(r.data));
    load(); onChanged?.();
  };
  const delEvent = async (ev) => {
    if (!confirm(`Delete this event and its recorded performance?`)) return;
    try { await api.vppEventDelete(ev.id); setExpanded(null); load(); onChanged?.(); } catch (e) { alert(e.message); }
  };

  return (
    <Card>
      <div style={{ display: "flex", marginBottom: 12 }}>
        <div className="sub" style={{ fontSize: 12 }}>A called turn-down window. Log what each site delivered to calculate what they've earned.</div>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}><Plus size={15} /> Add Event</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!events ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Window</th><th>Programme</th><th>Type</th><th>Sites</th><th>Shifted</th><th>Payments</th><th></th></tr></thead>
            <tbody>
              {events.length === 0 && <tr><td colSpan={8} className="sub" style={{ padding: 16, textAlign: "center" }}>No events recorded yet.</td></tr>}
              {events.map((ev) => (
                <>
                  <tr key={ev.id} style={{ cursor: "pointer" }} onClick={() => openEvent(ev)}>
                    <td className="name">{new Date(ev.event_date).toLocaleDateString("en-GB")}</td>
                    <td className="mono">{ev.start_time || "—"}{ev.end_time ? `–${ev.end_time}` : ""}</td>
                    <td style={{ fontSize: 12 }}>{ev.programme_name}</td>
                    <td><Badge tone={ev.event_type === "Test" ? "slate" : "indigo"}>{ev.event_type}</Badge></td>
                    <td className="mono">{ev.participants}</td>
                    <td className="mono">{Number(ev.total_reduction_kwh || 0).toLocaleString()} kWh</td>
                    <td className="name">{money(ev.total_payment)}</td>
                    <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setLogFor(ev); }}><Zap size={13} /> Log</button>
                      <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); delEvent(ev); }}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                  {expanded === ev.id && (
                    <tr key={`${ev.id}-detail`}>
                      <td colSpan={8} style={{ background: "var(--subtle,#F8FAFC)", padding: 12 }}>
                        {parts.length === 0 ? <div className="sub" style={{ fontSize: 12 }}>Nothing logged for this event yet — use "Log" to record performance.</div> : (
                          <table className="tbl" style={{ background: "#fff" }}>
                            <thead><tr><th>Customer</th><th>Baseline</th><th>Actual</th><th>Reduction</th><th>Rate</th><th>Payment</th><th>Status</th></tr></thead>
                            <tbody>
                              {parts.map((p) => (
                                <tr key={p.id}>
                                  <td className="name">{p.business_name}</td>
                                  <td className="mono">{p.baseline_kwh} kWh</td>
                                  <td className="mono">{p.actual_kwh} kWh</td>
                                  <td className="mono" style={{ color: p.reduction_kwh > 0 ? "var(--brand,#0E7C7B)" : undefined }}>{p.reduction_kwh} kWh</td>
                                  <td className="mono">£{p.rate_per_mwh}/MWh</td>
                                  <td className="name">{money(p.payment)}</td>
                                  <td>
                                    <select value={p.status} onChange={(e) => setPartStatus(p, e.target.value)} style={{ fontSize: 12, padding: "3px 6px", borderRadius: 7, border: "1px solid var(--line,#E7EBF0)" }}>
                                      {PART_STATUS.map((s) => <option key={s}>{s}</option>)}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && <EventForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {logFor && <LogForm event={logFor} onClose={() => setLogFor(null)} onSaved={() => { setLogFor(null); load(); onChanged?.(); if (expanded) api.vppParticipation({ event_id: expanded }).then((r) => setParts(r.data)); }} />}
    </Card>
  );
}

function EventForm({ onClose, onSaved }) {
  const [progs, setProgs] = useState([]);
  const [f, setF] = useState({ programme_id: "", event_date: "", start_time: "16:00", end_time: "19:00", event_type: "Live", notes: "" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.vppProgrammes().then((r) => setProgs(r.data)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.programme_id || !f.event_date) return setErr("Programme and date are required");
    setSaving(true); setErr(null);
    try { await api.vppEventCreate({ ...f, programme_id: Number(f.programme_id) }); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Add Event" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Programme *">
          <select value={f.programme_id} onChange={set("programme_id")}>
            <option value="">Select…</option>
            {progs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Date *"><input type="date" value={f.event_date} onChange={set("event_date")} /></Field>
        <Field label="Start Time"><input type="time" value={f.start_time} onChange={set("start_time")} /></Field>
        <Field label="End Time"><input type="time" value={f.end_time} onChange={set("end_time")} /></Field>
        <Field label="Type"><select value={f.event_type} onChange={set("event_type")}><option>Live</option><option>Test</option></select></Field>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

function LogForm({ event, onClose, onSaved }) {
  const [enrolments, setEnrolments] = useState([]);
  const [f, setF] = useState({ enrolment_id: "", baseline_kwh: "", actual_kwh: "", status: "Estimated", notes: "" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.vppEnrolments({ status: "Active" }).then((r) => setEnrolments(r.data)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const reduction = Math.max(0, (num(f.baseline_kwh) || 0) - (num(f.actual_kwh) || 0));
  const rate = event.utilisation_rate || 0;
  const payment = (reduction / 1000) * rate;

  const save = async () => {
    if (!f.enrolment_id) return setErr("Select which enrolment this is for");
    setSaving(true); setErr(null);
    try {
      await api.vppParticipationCreate({
        event_id: event.id, enrolment_id: Number(f.enrolment_id),
        baseline_kwh: num(f.baseline_kwh), actual_kwh: num(f.actual_kwh),
        status: f.status, notes: f.notes || null,
      });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={`Log Performance — ${new Date(event.event_date).toLocaleDateString("en-GB")}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
        Baseline is what the site would normally have used in this window. Payment is based on the reduction against it, not total usage.
      </div>
      <div className="grid cols-2">
        <Field label="Enrolment *">
          <select value={f.enrolment_id} onChange={set("enrolment_id")}>
            <option value="">Select…</option>
            {enrolments.map((e) => <option key={e.id} value={e.id}>{e.business_name} — {e.programme_name}</option>)}
          </select>
        </Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}>{PART_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Baseline (kWh)"><input type="number" step="0.01" value={f.baseline_kwh} onChange={set("baseline_kwh")} /></Field>
        <Field label="Actual (kWh)"><input type="number" step="0.01" value={f.actual_kwh} onChange={set("actual_kwh")} /></Field>
      </div>
      {(f.baseline_kwh || f.actual_kwh) && (
        <div style={{ padding: "10px 12px", background: "var(--subtle,#F8FAFC)", border: "1px solid var(--line,#E7EBF0)", borderRadius: 8, fontSize: 13, marginTop: 4 }}>
          Reduction <b>{round(reduction)} kWh</b> × £{rate}/MWh = <b>{money(payment)}</b>
          {reduction === 0 && <div className="sub" style={{ fontSize: 11 }}>No reduction against baseline, so nothing earned for this event.</div>}
        </div>
      )}
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

const round = (n) => Math.round(n * 100) / 100;
