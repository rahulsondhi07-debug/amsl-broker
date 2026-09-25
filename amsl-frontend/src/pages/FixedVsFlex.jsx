import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Printer, BookOpen, Scale, Settings2, Table2, Copy, CalendarPlus, Lightbulb } from "lucide-react";
import DocumentsPanel from "../components/DocumentsPanel.jsx";
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

  if (selected) return <Result key={selected} id={selected} onBack={() => { setSelected(null); load(); }} onOpen={(nid) => setSelected(nid)} />;

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
                    <td><span className="name">{c.client_name}</span>{c.version_label && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--brand,#0E7C7B)" }}>{c.version_label}</div>}{c.site && <div className="sub" style={{ fontSize: 11 }}>{c.site}</div>}</td>
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
    fixed_quote_ref: "", current_contract_end: "", basket_id: "", flex_supplier: "",
  });
  const [baskets, setBaskets] = useState([]);
  useEffect(() => { api.flexBaskets().then((r) => setBaskets(r.data)).catch(() => {}); }, []);
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
        vat_pct: num(f.vat_pct), years: num(f.years), basket_id: num(f.basket_id),
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
        <Field label="Fixed Quote Ref"><input value={f.fixed_quote_ref} onChange={set("fixed_quote_ref")} /></Field>
        <Field label="Current Contract Ends"><input type="date" value={f.current_contract_end} onChange={set("current_contract_end")} /></Field>
        <Field label="Flex Start"><input type="date" value={f.flex_start} onChange={set("flex_start")} /></Field>
        <Field label="Consortium (for market position)"><select value={f.basket_id} onChange={set("basket_id")}>
          <option value="">None</option>{baskets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      </div>
      <p className="sub" style={{ fontSize: 11.5, marginTop: 10 }}>
        The standard cost stack is created for the current contract, both scenarios and every year. Then use the Rate card to fill every line at once.
      </p>
    </Modal>
  );
}

/* ---------------- Result ---------------- */
function Result({ id, onBack, onOpen }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(true);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

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
  const { comparison: c, years, totals, options, term, findings } = data;
  const newVersion = async () => {
    const label = prompt("Name for the new version", `v${(c.version_label?.match(/v(\d+)/)?.[1] ?? 1) * 1 + 1} — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
    if (!label) return;
    const r = await api.fvfDuplicate(id, label);
    onOpen?.(r.data.id);
  };
  const dirty = Object.keys(draft).length > 0;

  return (
    <>
      <div className="page-head no-print">
        <button className="btn ghost sm" onClick={onBack}>← All comparisons</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowGuide(true)}><BookOpen size={14} /> Guidance</button>
          <button className="btn" onClick={() => setShowDetails(true)}><Settings2 size={14} /> Details</button>
          <button className="btn" onClick={() => setShowCard(true)}><Table2 size={14} /> Rate card</button>
          <button className="btn" onClick={() => setShowMonthly(true)}>Monthly kWh</button>
          <button className="btn" onClick={async () => { await api.fvfAddYear(id, "Flex"); load(); }} title="Add a flex year (e.g. a year with no fixed equivalent)"><CalendarPlus size={14} /></button>
          <button className="btn" onClick={newVersion}><Copy size={14} /> New version</button>
          <button className="btn" onClick={() => setEdit(!edit)}>{edit ? "Hide rate entry" : "Enter rates"}</button>
          {dirty && <button className="btn primary" disabled={saving} onClick={saveRates}>{saving ? "Saving…" : `Save ${Object.keys(draft).length} rate(s)`}</button>}
          <button className="btn primary" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
        </div>
      </div>

      <Card>
        <div style={{ borderBottom: "3px solid var(--brand,#0E7C7B)", paddingBottom: 14, marginBottom: 18 }}>
          <h2 style={{ fontSize: 21, marginBottom: 3 }}>{c.client_name} — Fixed vs Flexible Comparison</h2>
          {c.version_label && <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand,#0E7C7B)", marginBottom: 2 }}>{c.version_label}</div>}
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
          <Card><div className="sub" style={{ fontSize: 11 }}>{term ? `${term.years}-YEAR TERM SAVING` : "TERM SAVING"} (NET OF VAT &amp; CCL)</div>
            <div style={{ fontWeight: 800, fontSize: 24, color: (term?.saving_net ?? totals.term_saving_ex_ccl_vat) >= 0 ? "var(--brand,#0E7C7B)" : "#B91C1C" }}>{money0(term?.saving_net ?? totals.term_saving_ex_ccl_vat)}</div>
            <div className="sub" style={{ fontSize: 10.5 }}>{term ? `${term.saving_pct.toFixed(1)}% · ${term.years}-year fixed rate × ${term.years} vs flex years 1–${term.years}` : `across ${totals.years_compared} year(s)`}</div></Card>
          <Card><div className="sub" style={{ fontSize: 11 }}>TERM SAVING (INC VAT)</div>
            <div style={{ fontWeight: 800, fontSize: 24 }}>{money0(term?.saving_inc ?? totals.term_saving_inc_vat)}</div>
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
            {term && (
              <tr style={{ background: "#f1f5f9" }}>
                <td className="name">{term.label}</td>
                <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{money(term.fixed_net)}</td>
                <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{money(term.flex_net)}</td>
                <td className="name" style={{ textAlign: "right", color: term.saving_net > 0 ? "var(--brand,#0E7C7B)" : "#B91C1C" }}>{money(term.saving_net)}</td>
                <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{term.saving_pct.toFixed(1)}%</td>
                <td colSpan={2} className="sub" style={{ fontSize: 11 }}>{term.years}-yr fixed × {term.years}</td>
              </tr>
            )}
          </tbody>
        </table>

        {options?.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Every option</h3>
            <div className="sub" style={{ fontSize: 11.5, marginBottom: 8 }}>Stay put, renew fixed, or move to flex — against the current contract on both bases.</div>
            <table className="tbl">
              <thead><tr><th>Option</th><th style={{ textAlign: "right" }}>Annual (net)</th><th style={{ textAlign: "right" }}>Monthly (net)</th><th style={{ textAlign: "right" }}>vs current (net)</th>
                <th style={{ textAlign: "right" }}>Annual (inc VAT)</th><th style={{ textAlign: "right" }}>vs current (inc VAT)</th><th style={{ textAlign: "right" }}>p/kWh</th></tr></thead>
              <tbody>{options.map((o) => {
                const tone = (v) => (v == null ? undefined : v < 0 ? "var(--brand,#0E7C7B)" : "#B91C1C");
                const sp = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
                return (
                  <tr key={o.key} style={o.kind === "current" ? { background: "#f8fafc" } : undefined}>
                    <td className="name" style={{ fontSize: 12.5 }}><Badge tone={o.kind === "flex" ? "green" : o.kind === "fixed" ? "indigo" : "slate"}>{o.kind}</Badge> {o.label}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{money(o.annual_net)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{money(o.monthly_net)}</td>
                    <td className="mono" style={{ textAlign: "right", color: o.kind === "current" ? undefined : tone(o.vs_current_net_pct) }}>{o.kind === "current" ? "—" : sp(o.vs_current_net_pct)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{money(o.annual_inc)}</td>
                    <td className="mono" style={{ textAlign: "right", color: o.kind === "current" ? undefined : tone(o.vs_current_inc_pct) }}>{o.kind === "current" ? "—" : sp(o.vs_current_inc_pct)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{o.effective_p_kwh?.toFixed(3) ?? "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}

        {findings?.length > 0 && (
          <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: "12px 16px", marginBottom: 22 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}><Lightbulb size={14} style={{ verticalAlign: "-2px" }} /> Key findings</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>{findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </div>
        )}

        {data.current_stack && (
          <div style={{ marginBottom: 26 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Current contract — cost stack <span className="sub" style={{ fontSize: 11.5, fontWeight: 400 }}>the "do nothing" baseline every option is measured against</span></h3>
            <StackCard name="Current" sc={data.current_stack} c={c} edit={edit} draft={draft} setDraft={setDraft} />
          </div>
        )}

        {/* Stacks */}
        {years.map((y) => (
          <div key={y.year_no} style={{ marginBottom: 26 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>{y.year_label} — cost stack</h3>
            <div style={{ display: "flex", gap: 18 }}>
              {[["Fixed", y.fixed], ["Flex", y.flex]].filter(([, sc]) => sc.lines.length).map(([name, sc]) => (
                <StackCard key={name} name={name} sc={sc} c={c} edit={edit} draft={draft} setDraft={setDraft} />
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
      <DocumentsPanel source="fvf" sourceId={id} businessId={c.business_id}
        optionsFor={(k) => Promise.resolve(k === "onboarding_letter" ? { contact_name: prompt("Who is the letter addressed to? (leave blank for Sir or Madam)") || "" } : {})} />
      {showGuide && <GuidanceModal onClose={() => setShowGuide(false)} />}
      {showCard && <RateCard id={id} years={years} onClose={() => setShowCard(false)} onSaved={() => { setShowCard(false); load(); }} />}
      {showMonthly && <MonthlyForm id={id} annual={c.annual_kwh} onClose={() => setShowMonthly(false)} onSaved={() => { setShowMonthly(false); load(); }} />}
      {showDetails && <DetailsForm c={c} onClose={() => setShowDetails(false)} onSaved={() => { setShowDetails(false); load(); }} />}
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

function StackCard({ name, sc, c, edit, draft, setDraft }) {
  return (
    <div style={{ flex: 1, border: "1px solid var(--line,#E7EBF0)", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Badge tone={name === "Flex" ? "green" : name === "Fixed" ? "indigo" : "slate"}>{name}</Badge>
        <span className="sub" style={{ fontSize: 11 }}>{sc.priced && sc.effective_p_kwh != null ? `${sc.effective_p_kwh}p/kWh effective` : "no rates yet"}</span>
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
  );
}

/* ---------------- Rate card: every rate on one form ---------------- */
const CARD = {
  current: [["day", "Day unit rate", "p/kWh"], ["night", "Night unit rate", "p/kWh"], ["standing", "Standing charge", "p/day"]],
  fixed: [["day", "Day unit rate", "p/kWh", true], ["night", "Night unit rate", "p/kWh", true], ["standing", "Standing charge", "p/day"],
    ["tx", "Transmission fixed charge", "p/day"], ["dx", "Distribution fixed charge", "p/day"], ["capacity", "Capacity charge", "p/kVA/day"],
    ["excess_capacity", "Excess capacity charge", "p/kVA/day"], ["reactive", "Reactive capacity charge", "p/kVArh"],
    ["rab", "Nuclear RAB levy", "p/kWh"], ["ncc", "Network charging compensation", "p/kWh"], ["fit", "Feed-in Tariff", "p/kWh"]],
  flex: [["commodity", "Commodity cost", "p/kWh", true], ["non_commodity", "Non-commodity cost", "p/kWh", true],
    ["consortium_fee", "Consortium management fee", "p/kWh"], ["supplier_fee", "Supplier management fee", "p/kWh"],
    ["duos_red", "HH DUoS Red", "p/kWh"], ["duos_amber", "HH DUoS Amber", "p/kWh"], ["duos_green", "HH DUoS Green", "p/kWh"]],
};
function RateCard({ id, years, onClose, onSaved }) {
  const [card, setCard] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const fixedYears = [...new Set(years.filter((y) => y.fixed.lines.length).map((y) => y.year_no))];
  const flexYears = [...new Set(years.filter((y) => y.flex.lines.length).map((y) => y.year_no))];
  useEffect(() => {
    api.fvfRateCard(id).then((r) => {
      // Collapse per-year arrays to a single value where every year is the same.
      const out = {};
      for (const scen of ["current", "fixed", "flex"]) {
        out[scen] = {};
        for (const [k, , , perYear] of CARD[scen]) {
          const v = r.data[scen]?.[k] || [];
          out[scen][k] = perYear ? v.map((x) => x ?? "") : (v.find((x) => x != null) ?? "");
        }
      }
      setCard(out);
    }).catch((e) => setErr(e.message));
  }, [id]);
  const set = (scen, k, v, yi) => setCard((c0) => {
    const c = structuredClone(c0);
    if (yi == null) c[scen][k] = v; else { const a = Array.isArray(c[scen][k]) ? c[scen][k] : []; a[yi] = v; c[scen][k] = a; }
    return c;
  });
  const save = async () => {
    setSaving(true); setErr(null);
    const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => (x === "" ? null : Number(x))) : v === "" ? undefined : Number(v)]));
    try { await api.fvfRateCardSave(id, { current: clean(card.current), fixed: clean(card.fixed), flex: clean(card.flex) }); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };
  const inp = (scen, k, yi) => (
    <input type="number" step="0.0001" value={yi == null ? (card[scen][k] ?? "") : (card[scen][k]?.[yi] ?? "")} onChange={(e) => set(scen, k, e.target.value, yi)}
      style={{ width: 90, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line,#E7EBF0)", textAlign: "right" }} />
  );
  const section = (scen, title, ys, note) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{title}</div>
      {note && <div className="sub" style={{ fontSize: 11.5, marginBottom: 6 }}>{note}</div>}
      <table className="tbl"><tbody>
        {CARD[scen].map(([k, label, unit, perYear]) => (
          <tr key={k}><td style={{ fontSize: 12.5 }}>{label} <span className="sub" style={{ fontSize: 11 }}>{unit}</span></td>
            <td style={{ textAlign: "right" }}>{perYear ? <span style={{ display: "inline-flex", gap: 6 }}>{ys.map((y, i) => <span key={y} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span className="sub" style={{ fontSize: 10.5 }}>Y{y}</span>{inp(scen, k, i)}</span>)}</span> : inp(scen, k)}</td></tr>
        ))}
      </tbody></table>
    </div>
  );
  return (
    <Modal title="Rate card" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!card || saving} onClick={save}>{saving ? "Applying…" : "Apply to every line"}</button></>}>
      {err && <ErrorBanner error={err} />}
      {!card ? <Spinner /> : <>
        {section("fixed", "Fixed renewal quote", fixedYears, "Year n = the n-year fixed rate. Network and policy rates entered here are also used for the current contract and flex unless overridden.")}
        {section("flex", "Flex", flexYears, "Standing, transmission, distribution, capacity and FiT are taken from the fixed quote: they are network charges and don't depend on the supplier.")}
        {section("current", "Current contract", [1], "Only the unit rates and standing charge usually differ from the renewal quote.")}
      </>}
    </Modal>
  );
}

/* ---------------- Monthly consumption ---------------- */
function MonthlyForm({ id, annual, onClose, onSaved }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  useEffect(() => { api.fvfMonthly(id).then((r) => setText(r.data.map((m) => `${m.month_label}\t${m.day_kwh ?? ""}\t${m.night_kwh ?? ""}`).join("\n"))).catch(() => {}); }, [id]);
  const rows = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\t|\s*,\s*|\s{2,}/)).filter((p) => p[0] && !/^month$/i.test(p[0]))
    .map(([month_label, d, n]) => ({ month_label, day_kwh: d ? Number(String(d).replace(/,/g, "")) : null, night_kwh: n ? Number(String(n).replace(/,/g, "")) : null }));
  const total = rows.reduce((a, r) => a + (r.day_kwh || 0) + (r.night_kwh || 0), 0);
  const save = async () => { try { await api.fvfMonthlySave(id, rows); onSaved(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title="Monthly consumption" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save {rows.length} month(s)</button></>}>
      {err && <ErrorBanner error={err} />}
      <p className="sub" style={{ fontSize: 12 }}>One month per line: <code>Month, Day kWh, Night kWh</code> — paste straight from a spreadsheet. Used for the consumption chart in the client deck and workbook.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={13} placeholder={"Sep-25\t19397.2\t2189.1\nOct-25\t21034.6\t2177.9"}
        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "monospace", fontSize: 12 }} />
      <div className="sub" style={{ fontSize: 12, marginTop: 6, color: rows.length && Math.abs(total - annual) > 1 ? "#B45309" : undefined }}>
        {rows.length} months · {kwh(total)} kWh{rows.length ? ` · annual figure ${kwh(annual)} kWh${Math.abs(total - annual) > 1 ? ` (differs by ${kwh(Math.abs(total - annual))})` : " ✓"}` : ""}
      </div>
    </Modal>
  );
}

/* ---------------- Details used on client documents ---------------- */
function DetailsForm({ c, onClose, onSaved }) {
  const [baskets, setBaskets] = useState([]);
  const [f, setF] = useState({
    status: c.status || "Draft", version_label: c.version_label || "", fixed_supplier: c.fixed_supplier || "", fixed_quote_ref: c.fixed_quote_ref || "",
    fixed_quote_date: c.fixed_quote_date || "", flex_supplier: c.flex_supplier || "", basket_id: c.basket_id ?? "", current_contract_end: c.current_contract_end || "",
    early_termination_pct: c.early_termination_pct ?? "", flex_start: c.flex_start || "", flex_end: c.flex_end || "", flex_term_months: c.flex_term_months ?? "",
    onboarding_fee: c.onboarding_fee ?? "", agreement_ref: c.agreement_ref || "", prepared_by: c.prepared_by || "", metering: c.metering || "",
    consumption_period: c.consumption_period || "", market_note: c.market_note || "", assumptions: (c.assumptions_list || []).join("\n"),
  });
  const [err, setErr] = useState(null);
  useEffect(() => { api.flexBaskets().then((r) => setBaskets(r.data)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      await api.fvfUpdate(c.id, { ...f, basket_id: num(f.basket_id), early_termination_pct: num(f.early_termination_pct), flex_term_months: num(f.flex_term_months),
        onboarding_fee: num(f.onboarding_fee), assumptions: f.assumptions.split("\n").map((x) => x.trim()).filter(Boolean) });
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  const ta = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "inherit" };
  return (
    <Modal title="Comparison details" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      {err && <ErrorBanner error={err} />}
      <p className="sub" style={{ fontSize: 12 }}>These appear on the generated breakdown, workbook, decks and letters.</p>
      <div className="grid cols-3">
        <Field label="Status"><select value={f.status} onChange={set("status")}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Version"><input value={f.version_label} onChange={set("version_label")} /></Field>
        <Field label="Prepared by"><input value={f.prepared_by} onChange={set("prepared_by")} /></Field>
        <Field label="Fixed supplier"><input value={f.fixed_supplier} onChange={set("fixed_supplier")} /></Field>
        <Field label="Fixed quote ref"><input value={f.fixed_quote_ref} onChange={set("fixed_quote_ref")} /></Field>
        <Field label="Fixed quote date"><input type="date" value={f.fixed_quote_date} onChange={set("fixed_quote_date")} /></Field>
        <Field label="Current contract ends"><input type="date" value={f.current_contract_end} onChange={set("current_contract_end")} /></Field>
        <Field label="Early termination (% remaining)"><input type="number" value={f.early_termination_pct} onChange={set("early_termination_pct")} /></Field>
        <Field label="Metering"><input value={f.metering} onChange={set("metering")} placeholder="Half-hourly" /></Field>
        <Field label="Flex supplier"><input value={f.flex_supplier} onChange={set("flex_supplier")} /></Field>
        <Field label="Consortium"><select value={f.basket_id} onChange={set("basket_id")}><option value="">None</option>{baskets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Agreement ref"><input value={f.agreement_ref} onChange={set("agreement_ref")} /></Field>
        <Field label="Flex start"><input type="date" value={f.flex_start} onChange={set("flex_start")} /></Field>
        <Field label="Flex end"><input type="date" value={f.flex_end} onChange={set("flex_end")} /></Field>
        <Field label="Flex term (months)"><input type="number" value={f.flex_term_months} onChange={set("flex_term_months")} /></Field>
        <Field label="Onboarding fee (£)"><input type="number" value={f.onboarding_fee} onChange={set("onboarding_fee")} /></Field>
        <Field label="Consumption period"><input value={f.consumption_period} onChange={set("consumption_period")} placeholder="Sep 2025 – Aug 2026 (HH data)" /></Field>
      </div>
      <Field label="Market note (why now)"><textarea rows={3} value={f.market_note} onChange={set("market_note")} style={ta} /></Field>
      <Field label="Notes & assumptions (one per line)"><textarea rows={6} value={f.assumptions} onChange={set("assumptions")} style={ta} /></Field>
    </Modal>
  );
}
