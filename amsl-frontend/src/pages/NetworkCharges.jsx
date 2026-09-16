import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Zap, AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const PURPOSES = ["Triad Avoidance", "DUoS Red Shift"];
const PLAN_STATUS = ["Planned", "Dispatched", "Verified", "Missed"];
const ALERT_LEVELS = ["Watch", "Warning", "Confirmed Triad", "Missed"];
const BANDS = ["Red", "Amber", "Green"];

const money = (n) => (n == null ? "—" : (n < 0 ? "-£" : "£") + Math.abs(Number(n)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money0 = (n) => (n == null ? "—" : (n < 0 ? "-£" : "£") + Math.abs(Number(n)).toLocaleString("en-GB", { maximumFractionDigits: 0 }));
const num = (v) => (v === "" || v == null ? null : Number(v));
const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" };
const bandTone = (b) => (b === "Red" ? "rose" : b === "Amber" ? "amber" : "green");

export default function NetworkCharges() {
  const [tab, setTab] = useState("dispatch");
  const [summary, setSummary] = useState(null);
  const loadSummary = useCallback(() => { api.netSummary().then((r) => setSummary(r.data)).catch(() => {}); }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Network Charges</h1>
          <p className="sub">Coordinate battery dispatch to cut Triad/TNUoS exposure and shift load out of the DUoS red band — the non-commodity costs a "fixed" contract usually passes straight through.</p>
        </div>
      </div>

      {summary && (
        <div className="grid cols-4" style={{ marginBottom: 14 }}>
          <Card><div className="sub" style={{ fontSize: 11 }}>ESTIMATED SAVING</div><div style={{ fontWeight: 800, fontSize: 22, color: "var(--brand,#0E7C7B)" }}>{money0(summary.estimated_saving)}</div><div className="sub" style={{ fontSize: 11 }}>{summary.plans} dispatch plans</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>TRIAD / TNUoS</div><div style={{ fontWeight: 800, fontSize: 22 }}>{money0(summary.triad_saving)}</div><div className="sub" style={{ fontSize: 11 }}>per year</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>DUoS RED SHIFT</div><div style={{ fontWeight: 800, fontSize: 22 }}>{money0(summary.duos_saving)}</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>OPEN TRIAD ALERTS</div><div style={{ fontWeight: 800, fontSize: 22, color: summary.open_triad_alerts ? "#B45309" : undefined }}>{summary.open_triad_alerts}</div><div className="sub" style={{ fontSize: 11 }}>awaiting outcome</div></Card>
        </div>
      )}

      <div className="toggle" style={{ marginBottom: 14 }}>
        <button className={tab === "dispatch" ? "active" : ""} onClick={() => setTab("dispatch")}>Dispatch Plans</button>
        <button className={tab === "triads" ? "active" : ""} onClick={() => setTab("triads")}>Triad Alerts</button>
        <button className={tab === "rates" ? "active" : ""} onClick={() => setTab("rates")}>DUoS &amp; TNUoS Rates</button>
      </div>

      {tab === "dispatch" && <Dispatch onChanged={loadSummary} />}
      {tab === "triads" && <Triads onChanged={loadSummary} />}
      {tab === "rates" && <Rates />}
    </>
  );
}

/* ---------------- Dispatch plans ---------------- */
function Dispatch({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [purpose, setPurpose] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    api.netDispatch(purpose ? { purpose } : {}).then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, [purpose]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (d, s) => { await api.netDispatchUpdate(d.id, { status: s }); load(); onChanged?.(); };
  const del = async (d) => {
    if (!confirm("Delete this dispatch plan?")) return;
    try { await api.netDispatchDelete(d.id); load(); onChanged?.(); } catch (e) { alert(e.message); }
  };
  const logDelivered = async (d) => {
    const isTriad = d.purpose === "Triad Avoidance";
    const v = prompt(isTriad ? "Delivered reduction (kW):" : "Delivered energy shifted (kWh):",
      isTriad ? (d.delivered_kw ?? d.planned_kw ?? "") : (d.delivered_kwh ?? d.planned_kwh ?? ""));
    if (v == null || v === "") return;
    await api.netDispatchUpdate(d.id, isTriad ? { delivered_kw: Number(v), status: "Verified" } : { delivered_kwh: Number(v), status: "Verified" });
    load(); onChanged?.();
  };

  return (
    <Card>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)} style={sel}>
          <option value="">All purposes</option>
          {PURPOSES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}><Plus size={15} /> Plan Dispatch</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Purpose</th><th>Date</th><th>Window</th><th>Asset</th><th>Reduction</th><th>Est. Saving</th><th>Actual</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={10} className="sub" style={{ padding: 16, textAlign: "center" }}>No dispatch plans yet.</td></tr>}
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="name">{d.business_name}</td>
                  <td>
                    <Badge tone={d.purpose === "Triad Avoidance" ? "indigo" : "rose"}>{d.purpose}</Badge>
                    {d.from_band && <div className="sub" style={{ fontSize: 10.5 }}>{d.from_band} → {d.to_band}</div>}
                  </td>
                  <td className="mono">{new Date(d.plan_date).toLocaleDateString("en-GB")}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{d.start_time || "—"}{d.end_time ? `–${d.end_time}` : ""}</td>
                  <td style={{ fontSize: 12 }}>{d.asset_type || "—"}<div className="sub" style={{ fontSize: 10.5 }}>{d.capacity_kw ? `${d.capacity_kw} kW` : ""}</div></td>
                  <td className="mono">{d.purpose === "Triad Avoidance" ? (d.planned_kw != null ? `${d.planned_kw} kW` : "—") : (d.planned_kwh != null ? `${d.planned_kwh} kWh` : "—")}</td>
                  <td className="name" style={{ color: d.estimated_saving < 0 ? "#B91C1C" : "var(--brand,#0E7C7B)" }}>{money(d.estimated_saving)}</td>
                  <td className="mono">{d.actual_saving != null ? money(d.actual_saving) : <button className="btn ghost sm" onClick={() => logDelivered(d)}><Zap size={12} /> Log</button>}</td>
                  <td>
                    <select value={d.status} onChange={(e) => setStatus(d, e.target.value)} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 7, border: "1px solid var(--line,#E7EBF0)" }}>
                      {PLAN_STATUS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}><button className="btn ghost sm" onClick={() => del(d)}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && <DispatchForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); onChanged?.(); }} />}
    </Card>
  );
}

function DispatchForm({ onClose, onSaved }) {
  const [businesses, setBusinesses] = useState([]);
  const [assets, setAssets] = useState([]);
  const [triads, setTriads] = useState([]);
  const [f, setF] = useState({
    business_id: "", asset_id: "", triad_alert_id: "", purpose: "Triad Avoidance",
    plan_date: "", start_time: "17:00", end_time: "18:30",
    planned_kw: "", planned_kwh: "", from_band: "Red", to_band: "Green", notes: "",
  });
  const [est, setEst] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.list("customers", { limit: 300 }).then((r) => setBusinesses(r.data)).catch(() => {});
    api.vppEligibleAssets().then((r) => setAssets(r.data)).catch(() => {});
    api.netTriads().then((r) => setTriads(r.data)).catch(() => {});
  }, []);

  const isTriad = f.purpose === "Triad Avoidance";
  // Live estimate as the inputs change, so the number is visible before committing.
  useEffect(() => {
    const ready = f.business_id && (isTriad ? f.planned_kw : f.planned_kwh);
    if (!ready) { setEst(null); return; }
    api.netEstimate({
      business_id: Number(f.business_id), purpose: f.purpose,
      planned_kw: num(f.planned_kw), planned_kwh: num(f.planned_kwh),
      from_band: f.from_band, to_band: f.to_band,
    }).then((r) => setEst(r.data)).catch((e) => setEst({ error: e.message }));
  }, [f.business_id, f.purpose, f.planned_kw, f.planned_kwh, f.from_band, f.to_band]); // eslint-disable-line

  const onBiz = (e) => {
    const id = e.target.value;
    const a = assets.find((x) => String(x.business_id) === String(id));
    setF({ ...f, business_id: id, asset_id: a ? String(a.id) : "", planned_kw: a?.capacity_kw ?? f.planned_kw });
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.business_id) return setErr("Select a customer");
    if (!f.plan_date) return setErr("Pick a date");
    setSaving(true); setErr(null);
    try {
      await api.netDispatchCreate({
        ...f, business_id: Number(f.business_id),
        asset_id: num(f.asset_id), triad_alert_id: num(f.triad_alert_id),
        planned_kw: num(f.planned_kw), planned_kwh: num(f.planned_kwh),
      });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const bizAssets = assets.filter((a) => String(a.business_id) === String(f.business_id));

  return (
    <Modal title="Plan Battery Dispatch" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Plan"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Customer *">
          <select value={f.business_id} onChange={onBiz}>
            <option value="">Select customer…</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name}</option>)}
          </select>
        </Field>
        <Field label="Purpose">
          <select value={f.purpose} onChange={set("purpose")}>{PURPOSES.map((p) => <option key={p}>{p}</option>)}</select>
        </Field>
        <Field label="Asset">
          <select value={f.asset_id} onChange={set("asset_id")}>
            <option value="">No specific asset</option>
            {bizAssets.map((a) => <option key={a.id} value={a.id}>{a.asset_type}{a.capacity_kw ? ` (${a.capacity_kw} kW)` : ""}</option>)}
          </select>
        </Field>
        <Field label="Date *"><input type="date" value={f.plan_date} onChange={set("plan_date")} /></Field>
        <Field label="Start"><input type="time" value={f.start_time} onChange={set("start_time")} /></Field>
        <Field label="End"><input type="time" value={f.end_time} onChange={set("end_time")} /></Field>
        {isTriad ? (
          <>
            <Field label="Demand Reduction (kW) *"><input type="number" step="0.1" value={f.planned_kw} onChange={set("planned_kw")} /></Field>
            <Field label="Link to Triad Alert">
              <select value={f.triad_alert_id} onChange={set("triad_alert_id")}>
                <option value="">None</option>
                {triads.map((t) => <option key={t.id} value={t.id}>{new Date(t.alert_date).toLocaleDateString("en-GB")} — {t.alert_level}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Energy Shifted (kWh) *"><input type="number" step="0.1" value={f.planned_kwh} onChange={set("planned_kwh")} /></Field>
            <Field label="Shift From"><select value={f.from_band} onChange={set("from_band")}>{BANDS.map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label="Shift To"><select value={f.to_band} onChange={set("to_band")}>{BANDS.map((b) => <option key={b}>{b}</option>)}</select></Field>
          </>
        )}
      </div>

      {est && (
        <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 13, marginTop: 4,
          background: est.error ? "#fff1f2" : "var(--subtle,#F8FAFC)",
          border: `1px solid ${est.error ? "#fecdd3" : "var(--line,#E7EBF0)"}` }}>
          {est.error ? est.error : (
            <>
              <TrendingDown size={13} style={{ verticalAlign: "-2px" }} /> Estimated saving <b style={{ color: est.saving < 0 ? "#B91C1C" : "var(--brand,#0E7C7B)" }}>{money(est.saving)}</b>
              {isTriad && <span className="sub"> per year</span>}
              <div className="sub" style={{ fontSize: 11, marginTop: 3 }}>{est.detail} · {est.region}</div>
              {isTriad && est.saving < 0 && (
                <div style={{ fontSize: 11.5, marginTop: 4, color: "#B91C1C" }}>
                  This zone has a negative TNUoS tariff — demand is rewarded here, so reducing it during a Triad costs money rather than saving it.
                </div>
              )}
            </>
          )}
        </div>
      )}
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

/* ---------------- Triad alerts ---------------- */
function Triads({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const load = useCallback(() => { api.netTriads().then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const setLevel = async (t, l) => { await api.netTriadUpdate(t.id, { alert_level: l }); load(); onChanged?.(); };
  const del = async (t) => {
    if (!confirm("Delete this Triad alert?")) return;
    try { await api.netTriadDelete(t.id); load(); onChanged?.(); } catch (e) { alert(e.message); }
  };

  return (
    <Card>
      <div style={{ display: "flex", marginBottom: 12 }}>
        <div className="sub" style={{ fontSize: 12, maxWidth: 620 }}>
          Triads are the three highest national demand half-hours between November and February, at least 10 clear days apart. They're only confirmed after the season, so issue a Watch or Warning on the day and confirm later.
        </div>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}><Plus size={15} /> Add Alert</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Window</th><th>Forecast Demand</th><th>Level</th><th>Plans</th><th>Est. Saving</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="sub" style={{ padding: 16, textAlign: "center" }}>No Triad alerts recorded.</td></tr>}
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="name">{new Date(t.alert_date).toLocaleDateString("en-GB")}</td>
                  <td className="mono" style={{ fontSize: 12 }}><Clock size={11} style={{ verticalAlign: "-1px" }} /> {t.start_time}–{t.end_time}</td>
                  <td className="mono">{t.forecast_demand_mw ? `${Number(t.forecast_demand_mw).toLocaleString()} MW` : "—"}</td>
                  <td>
                    <select value={t.alert_level} onChange={(e) => setLevel(t, e.target.value)} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 7, border: "1px solid var(--line,#E7EBF0)" }}>
                      {ALERT_LEVELS.map((l) => <option key={l}>{l}</option>)}
                    </select>
                    {t.alert_level === "Warning" && <span style={{ marginLeft: 6 }}><Badge tone="amber"><AlertTriangle size={10} style={{ verticalAlign: "-1px" }} /> act</Badge></span>}
                    {t.alert_level === "Confirmed Triad" && <span style={{ marginLeft: 6 }}><Badge tone="green">confirmed</Badge></span>}
                  </td>
                  <td className="mono">{t.plans}</td>
                  <td className="name">{money(t.est_saving)}</td>
                  <td style={{ textAlign: "right" }}><button className="btn ghost sm" onClick={() => del(t)}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && <TriadForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); onChanged?.(); }} />}
    </Card>
  );
}

function TriadForm({ onClose, onSaved }) {
  const [f, setF] = useState({ alert_date: "", start_time: "17:00", end_time: "18:30", forecast_demand_mw: "", alert_level: "Watch", season: "", notes: "" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.alert_date) return setErr("Date is required");
    setSaving(true); setErr(null);
    try { await api.netTriadCreate({ ...f, forecast_demand_mw: num(f.forecast_demand_mw) }); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Add Triad Alert" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Date *"><input type="date" value={f.alert_date} onChange={set("alert_date")} /></Field>
        <Field label="Level"><select value={f.alert_level} onChange={set("alert_level")}>{ALERT_LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>
        <Field label="Start"><input type="time" value={f.start_time} onChange={set("start_time")} /></Field>
        <Field label="End"><input type="time" value={f.end_time} onChange={set("end_time")} /></Field>
        <Field label="Forecast Demand (MW)"><input type="number" value={f.forecast_demand_mw} onChange={set("forecast_demand_mw")} /></Field>
        <Field label="Season"><input value={f.season} onChange={set("season")} placeholder="2026/27" /></Field>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} /></Field>
    </Modal>
  );
}

/* ---------------- Rates ---------------- */
function Rates() {
  const [duos, setDuos] = useState(null);
  const [tnuos, setTnuos] = useState(null);
  const [areas, setAreas] = useState([]);
  const [distId, setDistId] = useState("");

  useEffect(() => { api.localAreas().then((r) => setAreas(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.netDuos(distId ? { dist_id: distId } : {}).then((r) => setDuos(r.data)).catch(() => {}); }, [distId]);
  useEffect(() => { api.netTnuos().then((r) => setTnuos(r.data)).catch(() => {}); }, []);

  return (
    <>
      <Card title="DUoS Band Rates">
        <div style={{ marginBottom: 12 }}>
          <select value={distId} onChange={(e) => setDistId(e.target.value)} style={sel}>
            <option value="">All distribution areas</option>
            {areas.map((a) => <option key={a.dist_id} value={a.dist_id}>{a.dist_id} — {a.name}</option>)}
          </select>
        </div>
        {!duos ? <Spinner /> : (
          <div className="table-wrap" style={{ maxHeight: 360, overflow: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Area</th><th>Band</th><th>Days</th><th>Window</th><th>Rate</th></tr></thead>
              <tbody>
                {duos.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontSize: 12 }}>{b.dist_id} — {b.region}</td>
                    <td><Badge tone={bandTone(b.band)}>{b.band}</Badge></td>
                    <td style={{ fontSize: 12 }}>{b.day_type}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{b.start_time}–{b.end_time}</td>
                    <td className="mono">{b.rate_p_kwh}p/kWh</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div style={{ height: 14 }} />
      <Card title="TNUoS Locational Demand Tariffs">
        <p className="sub" style={{ fontSize: 12, marginBottom: 10 }}>
          £ per kW of average Triad demand, per year. Since the Targeted Charging Review the residual element is a fixed band, so only this locational element still responds to Triad behaviour. Northern zones can be negative, meaning demand there is rewarded.
        </p>
        {!tnuos ? <Spinner /> : (
          <div className="table-wrap" style={{ maxHeight: 320, overflow: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Zone</th><th>Area</th><th>Tariff</th><th>Charge Year</th></tr></thead>
              <tbody>
                {tnuos.map((t) => (
                  <tr key={t.id}>
                    <td className="name">{t.zone_name}</td>
                    <td className="mono">{t.dist_id ?? "—"}</td>
                    <td className="mono" style={{ color: t.tariff_gbp_kw < 0 ? "#B91C1C" : undefined }}>£{t.tariff_gbp_kw}/kW/yr</td>
                    <td style={{ fontSize: 12 }}>{t.charge_year || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
