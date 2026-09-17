import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Printer, BookOpen, Scale } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const BASES = [
  { v: "p_kwh", l: "p/kWh" }, { v: "p_day", l: "p/day" },
  { v: "p_kva_day", l: "p/kVA/day" }, { v: "p_kvarh", l: "p/kVArh" },
];
const STATUSES = ["Draft", "Issued", "Won", "Lost"];
const money = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money0 = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 }));
const kwh = (n) => (n == null ? "—" : Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 }));
const num = (v) => (v === "" || v == null ? null : Number(v));
const basisLabel = (b) => BASES.find((x) => x.v === b)?.l || b;
const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" };

export default function FixedVsFlex() {
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const load = useCallback(() => {
    api.fvfList().then((r) => { setRows(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (selected) return <Result id={selected} onBack={() => { setSelected(null); load(); }} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fixed vs Flex</h1>
          <p className="sub">Compare both strategies on the same consumption profile, layer by layer — not headline rate against headline rate.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowGuide(true)}><BookOpen size={15} /> Guidance</button>
          <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> New Comparison</button>
        </div>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      <Card>
        {!rows ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Client</th><th>Account / MPAN</th><th>Annual</th><th>Capacity</th><th>Years</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="sub" style={{ padding: 16, textAlign: "center" }}>No comparisons yet.</td></tr>}
                {rows.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setSelected(c.id)}>
                    <td><span className="name">{c.client_name}</span>{c.site && <div className="sub" style={{ fontSize: 11 }}>{c.site}</div>}</td>
                    <td style={{ fontSize: 12 }}>{c.account_ref || "—"}<div className="sub mono" style={{ fontSize: 11 }}>{c.mpan || ""}</div></td>
                    <td className="mono">{kwh(c.annual_kwh)} kWh</td>
                    <td className="mono">{c.capacity_kva ? `${c.capacity_kva} kVA` : "—"}</td>
                    <td className="mono">{c.years}</td>
                    <td><Badge tone={c.status === "Won" ? "green" : c.status === "Lost" ? "rose" : c.status === "Issued" ? "indigo" : "slate"}>{c.status}</Badge></td>
                    <td style={{ textAlign: "right" }}><button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setSelected(c.id); }}>Open →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {showAdd && <NewForm onClose={() => setShowAdd(false)} onSaved={(id) => { setShowAdd(false); load(); setSelected(id); }} />}
      {showGuide && <GuidanceModal onClose={() => setShowGuide(false)} />}
    </>
  );
}

function NewForm({ onClose, onSaved }) {
  const [businesses, setBusinesses] = useState([]);
  const [f, setF] = useState({
    business_id: "", client_name: "", account_ref: "", mpan: "", site: "",
    annual_kwh: "", day_kwh: "", night_kwh: "", duos_red_kwh: "", duos_amber_kwh: "", duos_green_kwh: "",
    capacity_kva: "", days: 365, ccl_p_kwh: 0.801, vat_pct: 20, years: 3, flex_start: "",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.list("customers", { limit: 300 }).then((r) => setBusinesses(r.data)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // The two splits must each reconcile to the annual total, or the comparison is built on
  // a profile that does not describe the site.
  const annual = num(f.annual_kwh) || 0;
  const dn = (num(f.day_kwh) || 0) + (num(f.night_kwh) || 0);
  const duos = (num(f.duos_red_kwh) || 0) + (num(f.duos_amber_kwh) || 0) + (num(f.duos_green_kwh) || 0);
  const dnOff = annual && dn ? round(dn - annual) : 0;
  const duosOff = annual && duos ? round(duos - annual) : 0;

  const save = async () => {
    if (!f.client_name.trim()) return setErr("Client name is required");
    if (!annual) return setErr("Annual consumption is required");
    setSaving(true); setErr(null);
    try {
      const { data } = await api.fvfCreate({
        ...f, business_id: num(f.business_id), annual_kwh: annual,
        day_kwh: num(f.day_kwh), night_kwh: num(f.night_kwh),
        duos_red_kwh: num(f.duos_red_kwh), duos_amber_kwh: num(f.duos_amber_kwh), duos_green_kwh: num(f.duos_green_kwh),
        capacity_kva: num(f.capacity_kva), days: num(f.days), ccl_p_kwh: num(f.ccl_p_kwh),
        vat_pct: num(f.vat_pct), years: num(f.years),
      });
      onSaved(data.id);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="New Fixed vs Flex Comparison" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Creating…" : "Create"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Customer">
          <select value={f.business_id} onChange={(e) => {
            const b = businesses.find((x) => String(x.id) === e.target.value);
            setF({ ...f, business_id: e.target.value, client_name: b?.business_name || f.client_name });
          }}>
            <option value="">Not linked</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name}</option>)}
          </select>
        </Field>
        <Field label="Client Name *"><input value={f.client_name} onChange={set("client_name")} /></Field>
        <Field label="Account Ref"><input value={f.account_ref} onChange={set("account_ref")} /></Field>
        <Field label="MPAN"><input value={f.mpan} onChange={set("mpan")} /></Field>
        <Field label="Site"><input value={f.site} onChange={set("site")} /></Field>
        <Field label="Annual Consumption (kWh) *"><input type="number" step="0.01" value={f.annual_kwh} onChange={set("annual_kwh")} /></Field>
      </div>
      <div className="sub" style={{ fontSize: 11, margin: "12px 0 6px", letterSpacing: ".04em", fontWeight: 700 }}>DAY / NIGHT SPLIT</div>
      <div className="grid cols-2">
        <Field label="Day Units (kWh)"><input type="number" step="0.01" value={f.day_kwh} onChange={set("day_kwh")} /></Field>
        <Field label="Night Units (kWh)"><input type="number" step="0.01" value={f.night_kwh} onChange={set("night_kwh")} /></Field>
      </div>
      {dnOff !== 0 && <div className="sub" style={{ fontSize: 11.5, color: "#B45309" }}>Day + night is {dnOff > 0 ? "over" : "under"} the annual total by {kwh(Math.abs(dnOff))} kWh.</div>}
      <div className="sub" style={{ fontSize: 11, margin: "12px 0 6px", letterSpacing: ".04em", fontWeight: 700 }}>DUoS BAND SPLIT — drives the flex distribution cost</div>
      <div className="grid cols-2">
        <Field label="Red Band (kWh)"><input type="number" step="0.01" value={f.duos_red_kwh} onChange={set("duos_red_kwh")} /></Field>
        <Field label="Amber Band (kWh)"><input type="number" step="0.01" value={f.duos_amber_kwh} onChange={set("duos_amber_kwh")} /></Field>
        <Field label="Green Band (kWh)"><input type="number" step="0.01" value={f.duos_green_kwh} onChange={set("duos_green_kwh")} /></Field>
        <Field label="Capacity (kVA)"><input type="number" step="0.01" value={f.capacity_kva} onChange={set("capacity_kva")} /></Field>
      </div>
      {duosOff !== 0 && <div className="sub" style={{ fontSize: 11.5, color: "#B45309" }}>Band split is {duosOff > 0 ? "over" : "under"} the annual total by {kwh(Math.abs(duosOff))} kWh.</div>}
      <div className="grid cols-2" style={{ marginTop: 12 }}>
        <Field label="Days in Year"><input type="number" value={f.days} onChange={set("days")} /></Field>
        <Field label="Contract Years"><input type="number" min="1" max="5" value={f.years} onChange={set("years")} /></Field>
        <Field label="CCL (p/kWh)"><input type="number" step="0.001" value={f.ccl_p_kwh} onChange={set("ccl_p_kwh")} /></Field>
        <Field label="VAT (%)"><input type="number" step="0.1" value={f.vat_pct} onChange={set("vat_pct")} /></Field>
      </div>
      <p className="sub" style={{ fontSize: 11.5, marginTop: 10 }}>
        The standard cost stack is created for both scenarios and every year. You then enter the rates.
      </p>
    </Modal>
  );
}

/* ---------------- Result ---------------- */
function Result({ id, onBack }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(true);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const load = useCallback(() => {
    api.fvfResult(id).then((r) => { setData(r.data); setDraft({}); setErr(null); }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const saveRates = async () => {
    const lines = Object.entries(draft).map(([lid, rate]) => ({ id: Number(lid), rate: rate === "" ? null : Number(rate) }));
    if (!lines.length) return;
    setSaving(true);
    try { await api.fvfSetRates(id, lines); load(); } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  if (err) return <ErrorBanner error={err} onRetry={load} />;
  if (!data) return <Spinner />;
  const { comparison: c, years, totals } = data;
  const dirty = Object.keys(draft).length > 0;

  return (
    <>
      <div className="page-head no-print">
        <button className="btn ghost sm" onClick={onBack}>← All comparisons</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowGuide(true)}><BookOpen size={14} /> Guidance</button>
          <button className="btn" onClick={() => setEdit(!edit)}>{edit ? "Hide rate entry" : "Enter rates"}</button>
          {dirty && <button className="btn primary" disabled={saving} onClick={saveRates}>{saving ? "Saving…" : `Save ${Object.keys(draft).length} rate(s)`}</button>}
          <button className="btn primary" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
        </div>
      </div>

      <Card>
        <div style={{ borderBottom: "3px solid var(--brand,#0E7C7B)", paddingBottom: 14, marginBottom: 18 }}>
          <h2 style={{ fontSize: 21, marginBottom: 3 }}>{c.client_name} — Fixed vs Flexible Comparison</h2>
          <div className="sub" style={{ fontSize: 12 }}>
            {c.account_ref && <>Account {c.account_ref} · </>}{c.mpan && <>MPAN {c.mpan} · </>}{c.site || ""}
          </div>
          <div className="sub" style={{ fontSize: 11.5, marginTop: 6 }}>
            {kwh(c.annual_kwh)} kWh/yr
            {c.day_kwh != null && <> · day {kwh(c.day_kwh)} / night {kwh(c.night_kwh)}</>}
            {c.duos_red_kwh != null && <> · DUoS red {kwh(c.duos_red_kwh)} / amber {kwh(c.duos_amber_kwh)} / green {kwh(c.duos_green_kwh)}</>}
            {c.capacity_kva ? <> · {c.capacity_kva} kVA</> : null}
          </div>
        </div>

        {totals.years_incomplete > 0 && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, marginBottom: 14 }}>
            {totals.years_incomplete} year{totals.years_incomplete > 1 ? "s" : ""} cannot be compared yet — both scenarios need rates before a saving is shown.
          </div>
        )}

        {/* Headline */}
        <div className="grid cols-3" style={{ marginBottom: 20 }}>
          <Card><div className="sub" style={{ fontSize: 11 }}>TERM SAVING (NET OF VAT &amp; CCL)</div>
            <div style={{ fontWeight: 800, fontSize: 24, color: totals.term_saving_ex_ccl_vat >= 0 ? "var(--brand,#0E7C7B)" : "#B91C1C" }}>{money0(totals.term_saving_ex_ccl_vat)}</div>
            <div className="sub" style={{ fontSize: 10.5 }}>across {totals.years_compared} year(s)</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>TERM SAVING (INC VAT)</div>
            <div style={{ fontWeight: 800, fontSize: 24 }}>{money0(totals.term_saving_inc_vat)}</div>
            <div className="sub" style={{ fontSize: 10.5 }}>for reference only</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>YEAR 1 DIFFERENCE</div>
            <div style={{ fontWeight: 800, fontSize: 24 }}>{years[0]?.saving_pct != null ? `${years[0].saving_pct.toFixed(1)}%` : "—"}</div>
            <div className="sub" style={{ fontSize: 10.5 }}>flex vs fixed, net of VAT &amp; CCL</div></Card>
        </div>

        {/* Year summary */}
        <table className="tbl" style={{ marginBottom: 22 }}>
          <thead><tr><th>Term</th><th style={{ textAlign: "right" }}>Fixed</th><th style={{ textAlign: "right" }}>Flex</th><th style={{ textAlign: "right" }}>Saving</th><th style={{ textAlign: "right" }}>%</th><th style={{ textAlign: "right" }}>Fixed p/kWh</th><th style={{ textAlign: "right" }}>Flex p/kWh</th></tr></thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year_no}>
                <td className="name">{y.year_label}</td>
                <td className="mono" style={{ textAlign: "right" }}>{money(y.fixed.subtotal_ex_ccl_vat)}</td>
                <td className="mono" style={{ textAlign: "right" }}>{money(y.flex.subtotal_ex_ccl_vat)}</td>
                <td className="name" style={{ textAlign: "right", color: y.saving_ex_ccl_vat > 0 ? "var(--brand,#0E7C7B)" : y.saving_ex_ccl_vat < 0 ? "#B91C1C" : undefined }}>
                  {y.comparable ? money(y.saving_ex_ccl_vat) : <span className="sub">incomplete</span>}
                </td>
                <td className="mono" style={{ textAlign: "right" }}>{y.saving_pct != null ? `${y.saving_pct.toFixed(1)}%` : "—"}</td>
                <td className="mono" style={{ textAlign: "right" }}>{y.fixed.effective_p_kwh ?? "—"}</td>
                <td className="mono" style={{ textAlign: "right" }}>{y.flex.effective_p_kwh ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Stacks */}
        {years.map((y) => (
          <div key={y.year_no} style={{ marginBottom: 26 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>{y.year_label} — cost stack</h3>
            <div style={{ display: "flex", gap: 18 }}>
              {[["Fixed", y.fixed], ["Flex", y.flex]].map(([name, sc]) => (
                <div key={name} style={{ flex: 1, border: "1px solid var(--line,#E7EBF0)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Badge tone={name === "Flex" ? "green" : "indigo"}>{name}</Badge>
                    <span className="sub" style={{ fontSize: 11 }}>{sc.effective_p_kwh != null ? `${sc.effective_p_kwh}p/kWh effective` : "no rates yet"}</span>
                  </div>
                  <table className="tbl">
                    <thead><tr><th>Layer</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Rate</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                    <tbody>
                      {sc.lines.map((l) => (
                        <tr key={l.id}>
                          <td style={{ fontSize: 12 }}>{l.label}</td>
                          <td className="mono" style={{ textAlign: "right", fontSize: 11.5 }}>
                            {l.basis === "p_day" ? `${c.days} days` : l.basis === "p_kva_day" ? `${l.qty ?? 0} kVA` : kwh(l.qty)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {edit ? (
                              <input type="number" step="0.0001"
                                value={draft[l.id] !== undefined ? draft[l.id] : (l.rate ?? "")}
                                onChange={(e) => setDraft({ ...draft, [l.id]: e.target.value })}
                                placeholder={basisLabel(l.basis)}
                                style={{ width: 92, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--line,#E7EBF0)", fontSize: 12, textAlign: "right" }} />
                            ) : (
                              <span className="mono" style={{ fontSize: 11.5 }}>{l.rate != null ? `${l.rate} ${basisLabel(l.basis)}` : "—"}</span>
                            )}
                          </td>
                          <td className="mono" style={{ textAlign: "right", fontSize: 12 }}>{l.rate != null ? money(l.amount) : "—"}</td>
                        </tr>
                      ))}
                      <tr><td colSpan={3} style={{ fontWeight: 700, paddingTop: 8 }}>Subtotal (net of VAT &amp; CCL)</td>
                        <td className="name" style={{ textAlign: "right", paddingTop: 8 }}>{money(sc.subtotal_ex_ccl_vat)}</td></tr>
                      <tr><td colSpan={3} className="sub" style={{ fontSize: 12 }}>Climate Change Levy</td>
                        <td className="mono" style={{ textAlign: "right", fontSize: 12 }}>{money(sc.ccl)}</td></tr>
                      <tr><td colSpan={3} className="sub" style={{ fontSize: 12 }}>VAT @ {c.vat_pct}%</td>
                        <td className="mono" style={{ textAlign: "right", fontSize: 12 }}>{money(sc.vat)}</td></tr>
                      <tr><td colSpan={3} style={{ fontWeight: 700 }}>Total (inc VAT)</td>
                        <td className="name" style={{ textAlign: "right" }}>{money(sc.total_inc_vat)}</td></tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="sub" style={{ fontSize: 10.5, borderTop: "1px solid var(--line,#E7EBF0)", paddingTop: 10, lineHeight: 1.6 }}>
          Savings are stated net of VAT and CCL, because both are charged identically under either strategy — including them
          would inflate the cash figure and understate the percentage. Flex commodity pricing reflects a purchasing position that
          moves with the market: it is not a fixed rate and the figures shown are indicative of the strategy, not a guaranteed
          outcome. Non-commodity costs are forecast and subject to industry change. This comparison is illustrative and does not
          constitute a contractual offer.
        </div>
      </Card>
      {showGuide && <GuidanceModal onClose={() => setShowGuide(false)} />}
    </>
  );
}

function GuidanceModal({ onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.fvfGuidance().then((r) => setRows(r.data)).catch(() => setRows([])); }, []);
  const sections = rows ? [...new Set(rows.map((r) => r.section))] : [];
  return (
    <Modal title="Fixed vs Flex — how to explain it" onClose={onClose} wide
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      {!rows ? <Spinner /> : sections.map((s) => (
        <div key={s} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Scale size={14} />
            <h3 style={{ fontSize: 15 }}>{s}</h3>
          </div>
          {rows.filter((r) => r.section === s).map((r) => (
            <div key={r.id} style={{ marginBottom: 10, paddingLeft: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.heading}</div>
              <div className="sub" style={{ fontSize: 12.5, lineHeight: 1.55 }}>{r.body}</div>
            </div>
          ))}
        </div>
      ))}
    </Modal>
  );
}

const round = (n) => Math.round(n * 100) / 100;
