import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Printer, Upload, Flame, Zap, ArrowLeftRight, Target, AlertTriangle, RefreshCw } from "lucide-react";
import DocumentsPanel from "../components/DocumentsPanel.jsx";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Modal, Field } from "../components/ui.jsx";

const COLOR_MARKET = "#2a78d6";
const COLOR_LOCKED = "#eb6834";
const num = (v) => (v === "" || v == null ? null : Number(v));
const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" };

const fmtPrice = (n, u) => (n == null ? "—" : u?.price === "£/MWh" ? `£${Number(n).toFixed(2)}` : `${Number(n).toFixed(2)}p`);
const fmtVol = (n, u) => (n == null ? "—" : Number(n).toLocaleString("en-GB", { maximumFractionDigits: u?.volDp ?? 0 }));
const pct = (n) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export default function FlexPosition() {
  const [baskets, setBaskets] = useState(null);
  const [selected, setSelected] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    api.flexBaskets().then((r) => { setBaskets(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (selected) return <Snapshot basketId={selected} onBack={() => { setSelected(null); load(); }} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Flex Position</h1>
          <p className="sub">Consortium position reports — how much of the forward requirement is locked in, at what price, against today's market.</p>
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><Plus size={15} /> New Consortium</button>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}
      <Card>
        {!baskets ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Consortium</th><th>Type</th><th>Supplier</th><th>Strategy</th><th>Members</th><th>Term</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {baskets.length === 0 && <tr><td colSpan={8} className="sub" style={{ padding: 16, textAlign: "center" }}>No consortiums yet.</td></tr>}
                {baskets.map((b) => (
                  <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => setSelected(b.id)}>
                    <td><span className="name">{b.name}</span>{b.code && <div className="sub" style={{ fontSize: 11 }}>{b.code}</div>}</td>
                    <td style={{ fontSize: 12 }}>{b.basket_type || "—"}</td>
                    <td style={{ fontSize: 12 }}>{b.supplier_name || "—"}</td>
                    <td style={{ fontSize: 12 }}>{b.purchasing_strategy || "—"}</td>
                    <td className="mono">{b.members}</td>
                    <td style={{ fontSize: 11.5 }}>{b.contract_start ? new Date(b.contract_start).toLocaleDateString("en-GB") : "—"}{b.contract_end ? ` – ${new Date(b.contract_end).toLocaleDateString("en-GB")}` : ""}</td>
                    <td><Badge tone={b.status === "Active" ? "green" : "slate"}>{b.status}</Badge></td>
                    <td style={{ textAlign: "right" }}><button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setSelected(b.id); }}>Snapshot →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {showAdd && <BasketForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </>
  );
}

function BasketForm({ basket, onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [f, setF] = useState({
    name: basket?.name || "", code: basket?.code || "", basket_type: basket?.basket_type || "Framework / Consortium",
    supplier_id: basket?.supplier_id ?? "", purchasing_strategy: basket?.purchasing_strategy || "Structured / Tranche",
    index_reference: basket?.index_reference || "Season Ahead", management_fee: basket?.management_fee ?? "",
    contract_start: basket?.contract_start || "", contract_end: basket?.contract_end || "",
    budget_power: basket?.budget_power ?? "", budget_gas: basket?.budget_gas ?? "",
    report_date: basket?.report_date || "", market_commentary: basket?.market_commentary || "",
    member_message: basket?.member_message || "",
    common_end_date: basket?.common_end_date || "", manager_name: basket?.manager_name || "",
  });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.list("suppliers", { limit: 300 }).then((r) => setSuppliers(r.data)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return setErr("Name is required");
    setSaving(true); setErr(null);
    const body = { ...f, supplier_id: num(f.supplier_id), management_fee: num(f.management_fee), budget_power: num(f.budget_power), budget_gas: num(f.budget_gas) };
    try {
      if (basket) await api.flexBasketUpdate(basket.id, body); else await api.flexBasketCreate(body);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title={basket ? `Edit — ${basket.name}` : "New Consortium"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Name *"><input value={f.name} onChange={set("name")} placeholder="FCT Consortium" /></Field>
        <Field label="Code"><input value={f.code} onChange={set("code")} placeholder="FCT" /></Field>
        <Field label="Type"><select value={f.basket_type} onChange={set("basket_type")}>
          <option>Framework / Consortium</option><option>Flexi Basket / Pooled</option><option>Individual (standalone)</option></select></Field>
        <Field label="Supplier"><select value={f.supplier_id} onChange={set("supplier_id")}>
          <option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Strategy"><input value={f.purchasing_strategy} onChange={set("purchasing_strategy")} /></Field>
        <Field label="Index Reference"><input value={f.index_reference} onChange={set("index_reference")} /></Field>
        <Field label="Position Data As At"><input type="date" value={f.report_date} onChange={set("report_date")} /></Field>
        <Field label="Management Fee"><input type="number" step="0.001" value={f.management_fee} onChange={set("management_fee")} /></Field>
        <Field label="Contract Start"><input type="date" value={f.contract_start} onChange={set("contract_start")} /></Field>
        <Field label="Contract End"><input type="date" value={f.contract_end} onChange={set("contract_end")} /></Field>
        <Field label="Common End Date (extension target)"><input type="date" value={f.common_end_date} onChange={set("common_end_date")} /></Field>
        <Field label="Consortium Manager"><input value={f.manager_name} onChange={set("manager_name")} placeholder="Your company" /></Field>
        <Field label="Budget — Gas (p/therm)"><input type="number" step="0.01" value={f.budget_gas} onChange={set("budget_gas")} /></Field>
        <Field label="Budget — Power (£/MWh)"><input type="number" step="0.01" value={f.budget_power} onChange={set("budget_power")} /></Field>
      </div>
      <Field label="Market Commentary"><textarea value={f.market_commentary} onChange={set("market_commentary")} rows={4}
        placeholder="Where the market is right now…" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "inherit" }} /></Field>
      <Field label="What This Means For Members"><textarea value={f.member_message} onChange={set("member_message")} rows={3}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "inherit" }} /></Field>
    </Modal>
  );
}

/* ---------------- Snapshot ---------------- */
function Snapshot({ basketId, onBack }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [showImport, setShowImport] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showMember, setShowMember] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  const [showThr, setShowThr] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [askLetter, setAskLetter] = useState(null);
  const resolver = useRef(null);
  // The extension letter is addressed to one member, so ask which before generating it.
  const optionsFor = (key) => key !== "extension_letter" ? Promise.resolve({}) : new Promise((res) => { resolver.current = res; setAskLetter({}); });

  const load = useCallback(() => {
    api.flexSnapshot(basketId).then((r) => { setData(r.data); setErr(null); }).catch((e) => setErr(e.message));
  }, [basketId]);
  useEffect(() => { load(); }, [load]);

  if (err) return <ErrorBanner error={err} onRetry={load} />;
  if (!data) return <Spinner />;
  const { basket, positions, totals, generated_at } = data;
  const asAt = basket.report_date ? new Date(basket.report_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <>
      <div className="page-head no-print">
        <button className="btn ghost sm" onClick={onBack}>← All consortiums</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowEdit(true)}>Edit</button>
          <button className="btn" onClick={() => setShowMember(true)}><Plus size={14} /> Member</button>
          <button className="btn" onClick={() => setShowTrades(true)}><ArrowLeftRight size={14} /> Log trades</button>
          <button className="btn" onClick={() => setShowThr(true)}><Target size={14} /> Thresholds</button>
          <button className="btn" onClick={() => setShowReport(true)}><Upload size={14} /> Import report</button>
          <button className="btn" onClick={() => setShowImport("Gas")}><Upload size={14} /> Paste Gas</button>
          <button className="btn" onClick={() => setShowImport("Power")}><Upload size={14} /> Paste Power</button>
          <button className="btn primary" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
        </div>
      </div>

      <Card>
        {/* Header */}
        <div style={{ borderBottom: `3px solid ${COLOR_MARKET}`, paddingBottom: 14, marginBottom: 18 }}>
          <h2 style={{ fontSize: 22, marginBottom: 3 }}>{basket.name} Position Snapshot — Gas &amp; Power</h2>
          <div className="sub" style={{ fontSize: 12.5 }}>{basket.supplier_name || basket.code || ""} · Consortium Position Report</div>
          <div className="sub" style={{ fontSize: 11, marginTop: 6 }}>
            {asAt && <>Position data as at {asAt} · </>}Prepared {new Date(generated_at).toLocaleDateString("en-GB")}
            {totals.members ? ` · ${totals.members} members` : ""}
          </div>
        </div>

        {basket.market_commentary && (
          <div style={{ background: "#f8fafc", border: "1px solid var(--line,#E7EBF0)", borderLeft: `4px solid ${COLOR_MARKET}`,
            borderRadius: 8, padding: "12px 14px", marginBottom: 20, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            <b>Where the market is right now:</b> {basket.market_commentary}
          </div>
        )}

        {data.validation?.length > 0 && (
          <div className="no-print" style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}><AlertTriangle size={13} style={{ verticalAlign: "-2px" }} /> Check before sending to clients</div>
            {data.validation.map((v, i) => <div key={i}>{v.utility ? `${v.utility} ` : ""}{v.label ? <b>{v.label}: </b> : null}{v.message}</div>)}
          </div>
        )}
        {positions.length === 0 && <div className="sub">No position data yet — use Import report to load a position report.</div>}
        {positions.map((p) => <CommoditySection key={p.utility} p={p} basketId={basketId} onChanged={load} />)}

        {basket.member_message && (
          <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "14px 16px", marginTop: 8, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            <b style={{ display: "block", marginBottom: 6 }}>What this means for consortium members</b>
            {basket.member_message}
          </div>
        )}

        <div className="sub" style={{ fontSize: 10.5, borderTop: "1px solid var(--line,#E7EBF0)", marginTop: 18, paddingTop: 10, lineHeight: 1.6 }}>
          "Current market" reflects the broker curve embedded in the source position report as at its generation date.
          "Locked-in average" is the volume-weighted price achieved on traded volume. Prices are wholesale commodity only and
          exclude network charges, levies, CCL and VAT{basket.management_fee ? `, and a management fee of ${basket.management_fee}` : ""}.
          These figures describe the consortium's aggregate position and are provided for information only — they are illustrative
          of the group strategy and do not constitute a price quotation for any individual meter. Past hedging performance is not a
          guide to future purchases. Does not constitute financial or procurement advice.
        </div>
      </Card>

      <DocumentsPanel source="basket" sourceId={basketId} title="Position documents" optionsFor={optionsFor} />
      {askLetter && <LetterForm basketId={basketId} onCancel={() => { setAskLetter(null); resolver.current?.(false); }}
        onOk={(o) => { setAskLetter(null); resolver.current?.(o); }} />}
      {showTrades && <TradesForm basketId={basketId} positions={positions} onClose={() => setShowTrades(false)} onSaved={() => { setShowTrades(false); load(); }} />}
      {showThr && <ThresholdsForm basketId={basketId} positions={positions} onClose={() => { setShowThr(false); load(); }} />}
      {showReport && <ReportImport basketId={basketId} onClose={() => setShowReport(false)} onSaved={() => { setShowReport(false); load(); }} />}
      {showImport && <ImportForm basketId={basketId} utility={showImport} onClose={() => setShowImport(null)} onSaved={() => { setShowImport(null); load(); }} />}
      {showEdit && <BasketForm basket={basket} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); load(); }} />}
      {showMember && <MemberForm basketId={basketId} onClose={() => setShowMember(false)} onSaved={() => { setShowMember(false); load(); }} />}
    </>
  );
}

function CommoditySection({ p, basketId, onChanged }) {
  const [showTable, setShowTable] = useState(false);
  const u = p.units;
  const Icon = p.utility === "Gas" ? Flame : Zap;
  const seasonData = p.seasonal.map((s) => ({ ...s, hedged: Math.round(s.hedged_pct * 100), open_pct: 100 - Math.round(s.hedged_pct * 100) }));
  // Untraded months have no locked price; show them at market, as the source reports do.
  const trend = p.monthly.map((m) => ({ period: m.label, market: m.market, locked: m.traded > 0 && m.locked != null ? m.locked : m.market }));
  const prev = p.previous;
  const tr = p.latest_trades_summary;

  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span className="ini sq"><Icon size={14} /></span>
        <h3 style={{ fontSize: 16 }}>{p.utility} consortium position</h3>
      </div>
      <div className="sub" style={{ fontSize: 11.5, marginBottom: 12 }}>
        Volumes in {u.volume} (peak requirement basis) · prices in {u.price}
      </div>

      {/* KPI row */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Card><div className="sub" style={{ fontSize: 10.5 }}>OVERALL HEDGED</div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{pct(p.hedged_pct)}</div>
          <div className="sub" style={{ fontSize: 10.5 }}>{fmtVol(p.traded_total, u)} of {fmtVol(p.required_total, u)} {u.volume}</div>
          {prev && <div className="sub" style={{ fontSize: 10.5 }}>was {pct(prev.hedged_pct)} on {new Date(prev.as_at).toLocaleDateString("en-GB")}</div>}</Card>
        <Card><div className="sub" style={{ fontSize: 10.5 }}>LOCKED-IN AVG</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: COLOR_LOCKED }}>{fmtPrice(p.locked_avg, u)}</div>
          <div className="sub" style={{ fontSize: 10.5 }}>weighted by traded volume</div></Card>
        <Card><div className="sub" style={{ fontSize: 10.5 }}>MARKET (SAME PERIODS)</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: COLOR_MARKET }}>{fmtPrice(p.market_avg, u)}</div>
          <div className="sub" style={{ fontSize: 10.5 }}>like-for-like comparison</div></Card>
        <Card><div className="sub" style={{ fontSize: 10.5 }}>SAVING VS MARKET</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: p.saving_vs_market > 0 ? "var(--brand,#0E7C7B)" : "#B91C1C" }}>
            {p.saving_vs_market == null ? "—" : fmtPrice(Math.abs(p.saving_vs_market), u)}
          </div>
          <div className="sub" style={{ fontSize: 10.5 }}>{p.saving_pct != null ? `${Math.abs(p.saving_pct).toFixed(1)}% ${p.saving_pct >= 0 ? "below" : "above"} market` : "—"}</div></Card>
      </div>

      {p.latest_trades?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 13, marginBottom: 6 }}>Trades executed {new Date(p.latest_trade_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</h4>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Season</th><th>Clip</th><th>Price</th><th>Live market</th><th>vs market</th><th>Hedged before → after</th><th className="no-print"></th></tr></thead>
            <tbody>{p.latest_trades.map((t) => {
              const vs = t.live_market != null ? t.price - t.live_market : null;
              return (
                <tr key={t.id}>
                  <td className="name">{t.season_label}</td>
                  <td className="mono">{fmtVol(t.clip, u)} {u.volume}</td>
                  <td className="mono">{fmtPrice(t.price, u)}</td>
                  <td className="mono">{fmtPrice(t.live_market, u)}</td>
                  <td className="mono" style={{ color: vs == null ? undefined : vs <= 0 ? "var(--brand,#0E7C7B)" : "#B91C1C" }}>{vs == null ? "—" : `${vs <= 0 ? "-" : "+"}${fmtPrice(Math.abs(vs), u)}`}</td>
                  <td className="mono">{t.hedged_before != null ? `${pct(t.hedged_before)} → ${pct(t.hedged_after)}` : "—"}</td>
                  <td className="no-print" style={{ textAlign: "right" }}><button className="btn ghost sm" title="Remove from the log (does not reverse the curve)" onClick={async () => { if (confirm("Remove this trade from the log? The curve is not changed.")) { await api.flexTradeDelete(t.id); onChanged(); } }}><Trash2 size={12} /></button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {tr && <div className="sub" style={{ fontSize: 11, marginTop: 4 }}>{fmtVol(tr.clip_total, u)} {u.volume} bought at a blended {fmtPrice(tr.blended_price, u)}{tr.blended_market != null ? ` vs a blended live market of ${fmtPrice(tr.blended_market, u)}` : ""}{tr.all_below_market ? " — every clip at or below market." : "."}</div>}
        </div>
      )}

      {/* Price by season */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 13, marginBottom: 2 }}>Locked-in price vs today's market, by delivery season</h4>
        <div className="sub" style={{ fontSize: 11, marginBottom: 6 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, background: COLOR_MARKET, borderRadius: 2, marginRight: 4 }} />Current market ({u.price})
          <span style={{ display: "inline-block", width: 10, height: 10, background: COLOR_LOCKED, borderRadius: 2, margin: "0 4px 0 12px" }} />Locked-in avg ({u.price})
        </div>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={p.seasonal} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v, n) => [fmtPrice(v, u), n === "market" ? "Market" : "Locked-in"]} />
            <Bar dataKey="market" fill={COLOR_MARKET} name="market" radius={[3, 3, 0, 0]} />
            <Bar dataKey="locked" fill={COLOR_LOCKED} name="locked" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="sub" style={{ fontSize: 10.5 }}>Where the orange bar sits below the blue bar, the consortium is already paying less than today's market for that season.</div>
      </div>

      {/* Hedged % by season */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 13, marginBottom: 6 }}>% of requirement hedged, by season</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={seasonData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
            <Tooltip formatter={(v) => [`${v}%`, "Hedged"]} />
            <Bar dataKey="hedged" name="Hedged %" radius={[3, 3, 0, 0]}>
              {seasonData.map((e, i) => (
                <Cell key={i} fill={e.hedged >= 80 ? "#0E7C7B" : e.hedged >= 40 ? "#2a78d6" : e.hedged > 0 ? "#9ec5f4" : "#e2e8f0"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="sub" style={{ fontSize: 10.5 }}>Share of each season's volume already traded vs still open.</div>
      </div>

      {/* Monthly trend */}
      {trend.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 13, marginBottom: 6 }}>Monthly trend — market price vs locked-in price</h4>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 9 }} interval={Math.max(0, Math.floor(trend.length / 14))} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, n) => [fmtPrice(v, u), n === "market" ? "Market" : "Locked-in"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="market" stroke={COLOR_MARKET} dot={false} strokeWidth={2} name="Current market" />
              <Line type="monotone" dataKey="locked" stroke={COLOR_LOCKED} dot={false} strokeWidth={2} name="Locked-in avg" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <button className="btn ghost sm no-print" onClick={async () => { if (confirm(`Rebuild ${p.utility} seasons from the monthly rows? Seasonal rows are overwritten.`)) { await api.flexRebuildSeasons(basketId, p.utility); onChanged(); } }} disabled={!p.monthly.length} title="Aggregate monthly rows into seasons">
        <RefreshCw size={12} /> Rebuild seasons from months
      </button>{" "}
      <button className="btn ghost sm no-print" onClick={() => setShowTable(!showTable)}>
        {showTable ? "Hide" : "View"} full seasonal detail table
      </button>
      {showTable && (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="tbl">
            <thead><tr>
              <th>Season</th><th>Market ({u.price})</th><th>Locked-in ({u.price})</th><th>Saving</th>
              <th>Volume required</th><th>Traded</th><th>Open</th><th>Hedged %</th><th>Target / ceiling</th><th>Signal</th><th className="no-print"></th>
            </tr></thead>
            <tbody>
              {p.seasonal.map((s) => (
                <tr key={s.id}>
                  <td className="name">{s.label}</td>
                  <td className="mono">{fmtPrice(s.market, u)}</td>
                  <td className="mono">{fmtPrice(s.locked, u)}</td>
                  <td className="mono" style={{ color: s.saving == null ? undefined : s.saving > 0 ? "var(--brand,#0E7C7B)" : "#B91C1C" }}>
                    {s.saving == null ? "—" : `${s.saving > 0 ? "" : "+"}${fmtPrice(Math.abs(s.saving), u)}`}
                  </td>
                  <td className="mono">{fmtVol(s.vol_req, u)}</td>
                  <td className="mono">{fmtVol(s.traded, u)}</td>
                  <td className="mono">{fmtVol(s.open, u)}</td>
                  <td className="mono">{pct(s.hedged_pct)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{s.target != null || s.ceiling != null ? `${fmtPrice(s.target, u)} / ${fmtPrice(s.ceiling, u)}` : "—"}</td>
                  <td style={{ fontSize: 11 }}>{s.signal ? <Badge tone={/buy/i.test(s.signal) ? "green" : /protect|below/i.test(s.signal) ? "amber" : "slate"}>{s.signal}</Badge> : "—"}</td>
                  <td className="no-print" style={{ textAlign: "right" }}>
                    <button className="btn ghost sm" onClick={async () => { if (confirm(`Delete ${s.label}?`)) { await api.flexCurveDelete(s.id); onChanged(); } }}><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Paste-based import. The source position reports are tabular, so accepting pasted rows is
 * far quicker than typing each season, and re-importing a later report updates in place.
 */
function ImportForm({ basketId, utility, onClose, onSaved }) {
  const [periodType, setPeriodType] = useState("season");
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const parse = () => {
    const rows = [];
    text.split("\n").map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
      const parts = line.split(/\t|\s*,\s*|\s{2,}/).map((x) => x.trim()).filter((x) => x !== "");
      if (parts.length < 2) return;
      const [label, market, locked, vol_req, traded] = parts;
      if (/^season$|^label$/i.test(label)) return; // header row
      const n = (v) => { const x = Number(String(v ?? "").replace(/[£$,%p\s]/g, "")); return Number.isFinite(x) ? x : null; };
      rows.push({
        utility, period_type: periodType, label, sort_order: i,
        market: n(market), locked: n(locked), vol_req: n(vol_req), traded: n(traded),
      });
    });
    return rows;
  };

  const rows = parse();
  const save = async () => {
    if (!rows.length) return setErr("Nothing to import — paste rows first");
    setSaving(true); setErr(null);
    try { await api.flexCurveImport(basketId, rows); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  const unit = utility === "Gas" ? "p/therm, th/day" : "£/MWh, MW";
  return (
    <Modal title={`Import ${utility} Position`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={saving || !rows.length} onClick={save}>{saving ? "Importing…" : `Import ${rows.length} row${rows.length === 1 ? "" : "s"}`}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <select value={periodType} onChange={(e) => setPeriodType(e.target.value)} style={sel}>
          <option value="season">Seasonal rows</option>
          <option value="month">Monthly rows</option>
        </select>
      </div>
      <p className="sub" style={{ fontSize: 12, marginBottom: 8 }}>
        Paste one row per period, columns separated by tabs or commas, in this order — units {unit}:<br />
        <code style={{ fontSize: 11.5 }}>Label, Market, Locked-in, Volume required, Traded</code><br />
        Leave locked-in blank (or as a dash) where nothing has been traded for that period.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
        placeholder={utility === "Gas"
          ? "Summer 2025, 81.51, 106.43, 260, 260\nWinter 2026, 207.50, 113.20, 1850, 1480\nSummer 2028, 74.20, -, 1900, 0"
          : "Winter 2024, 94.99, 90.67, 0.77, 0.77\nWinter 2026, 166.00, 91.50, 1.05, 0.62"}
        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "monospace", fontSize: 12 }} />
      {rows.length > 0 && (
        <div className="sub" style={{ fontSize: 11.5, marginTop: 8 }}>
          Parsed {rows.length} rows · first: <b>{rows[0].label}</b> market {rows[0].market ?? "—"}, locked {rows[0].locked ?? "—"}, required {rows[0].vol_req ?? "—"}, traded {rows[0].traded ?? "—"}
        </div>
      )}
    </Modal>
  );
}

function MemberForm({ basketId, onClose, onSaved }) {
  const [businesses, setBusinesses] = useState([]);
  const [f, setF] = useState({ business_id: "", utility: "Power", annual_volume_kwh: "", joined_on: "" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.list("customers", { limit: 300 }).then((r) => setBusinesses(r.data)).catch(() => {}); }, []);

  const save = async () => {
    if (!f.annual_volume_kwh) return setErr("Annual volume is required");
    setSaving(true); setErr(null);
    try { await api.flexMemberCreate(basketId, { ...f, business_id: num(f.business_id), annual_volume_kwh: Number(f.annual_volume_kwh) }); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal title="Add Member" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Add"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div className="grid cols-2">
        <Field label="Customer"><select value={f.business_id} onChange={(e) => setF({ ...f, business_id: e.target.value })}>
          <option value="">Select…</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.business_name}</option>)}</select></Field>
        <Field label="Utility"><select value={f.utility} onChange={(e) => setF({ ...f, utility: e.target.value })}>
          <option>Power</option><option>Gas</option></select></Field>
        <Field label="Annual Volume (kWh) *"><input type="number" value={f.annual_volume_kwh} onChange={(e) => setF({ ...f, annual_volume_kwh: e.target.value })} /></Field>
        <Field label="Joined"><input type="date" value={f.joined_on} onChange={(e) => setF({ ...f, joined_on: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- Trades ---------------- */
const today = () => new Date().toISOString().slice(0, 10);
function TradesForm({ basketId, positions, onClose, onSaved }) {
  const blank = () => ({ utility: positions[0]?.utility || "Power", season_label: "", clip: "", price: "", live_market: "", rationale: "" });
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState([blank()]);
  const [apply, setApply] = useState(true);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const seasonsFor = (u) => positions.find((p) => p.utility === u)?.seasonal || [];
  const set = (i, k, v) => setRows(rows.map((r, j) => {
    if (j !== i) return r;
    const n = { ...r, [k]: v };
    // Pre-fill the live market from the curve so only the trade price needs typing.
    if (k === "season_label" && !r.live_market) n.live_market = seasonsFor(r.utility).find((s) => s.label === v)?.market ?? "";
    return n;
  }));
  const valid = rows.filter((r) => r.season_label && Number(r.clip) > 0 && r.price !== "");
  const clipTotal = valid.reduce((a, r) => a + Number(r.clip), 0);
  const blended = clipTotal ? valid.reduce((a, r) => a + Number(r.clip) * Number(r.price), 0) / clipTotal : null;

  const save = async () => {
    if (!valid.length) return setErr("Enter at least one trade: season, clip and price");
    setSaving(true); setErr(null);
    try { await api.flexTradesAdd(basketId, valid.map((r) => ({ ...r, trade_date: date })), apply); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };
  return (
    <Modal title="Log trades" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : `Save ${valid.length} trade(s)`}</button></>}>
      {err && <ErrorBanner error={err} />}
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <Field label="Trade date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
          <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} /> Apply to the curve (updates traded, open and locked-in price)
        </label>
      </div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Fuel</th><th>Season</th><th>Clip</th><th>Price</th><th>Live market</th><th>Rationale</th><th></th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td><select value={r.utility} onChange={(e) => set(i, "utility", e.target.value)} style={sel}><option>Power</option><option>Gas</option></select></td>
            <td><select value={r.season_label} onChange={(e) => set(i, "season_label", e.target.value)} style={sel}>
              <option value="">Select…</option>{seasonsFor(r.utility).map((s) => <option key={s.label} value={s.label}>{s.label} ({pct(s.hedged_pct)})</option>)}</select></td>
            <td><input type="number" step="0.01" value={r.clip} onChange={(e) => set(i, "clip", e.target.value)} placeholder={r.utility === "Gas" ? "th/day" : "MW"} style={{ ...sel, width: 80 }} /></td>
            <td><input type="number" step="0.01" value={r.price} onChange={(e) => set(i, "price", e.target.value)} placeholder={r.utility === "Gas" ? "p/th" : "£/MWh"} style={{ ...sel, width: 90 }} /></td>
            <td><input type="number" step="0.01" value={r.live_market} onChange={(e) => set(i, "live_market", e.target.value)} style={{ ...sel, width: 90 }} /></td>
            <td><input value={r.rationale} onChange={(e) => set(i, "rationale", e.target.value)} placeholder="Why this clip, now" style={{ ...sel, width: 200 }} /></td>
            <td><button className="btn ghost sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}><Trash2 size={12} /></button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
        <button className="btn sm" onClick={() => setRows([...rows, { ...blank(), utility: rows[rows.length - 1].utility }])}><Plus size={12} /> Add clip</button>
        {blended != null && <span className="sub" style={{ fontSize: 12 }}>{clipTotal.toFixed(2)} in total at a blended {blended.toFixed(2)}</span>}
      </div>
    </Modal>
  );
}

/* ---------------- Thresholds ---------------- */
function ThresholdsForm({ basketId, positions, onClose }) {
  const [rows, setRows] = useState(null);
  const [utility, setUtility] = useState(positions[0]?.utility || "Power");
  const [draft, setDraft] = useState({});
  const [err, setErr] = useState(null);
  const load = useCallback(() => api.flexThresholds(basketId).then((r) => setRows(r.data)).catch((e) => setErr(e.message)), [basketId]);
  useEffect(() => { load(); }, [load]);
  const seasons = positions.find((p) => p.utility === utility)?.seasonal || [];
  const cur = (label) => ({ ...(rows || []).find((t) => t.utility === utility && t.season_label === label), ...(draft[label] || {}) });
  const set = (label, k, v) => setDraft({ ...draft, [label]: { ...(draft[label] || {}), [k]: v } });
  const save = async () => {
    setErr(null);
    try {
      for (const [label, d] of Object.entries(draft)) await api.flexThresholdSet(basketId, { ...cur(label), ...d, utility, season_label: label });
      setDraft({}); load();
    } catch (e) { setErr(e.message); }
  };
  const inp = (label, k, w = 80) => <input type="number" step="0.01" value={cur(label)[k] ?? ""} onChange={(e) => set(label, k, e.target.value)} style={{ ...sel, width: w, padding: "5px 8px" }} />;
  return (
    <Modal title="Trading thresholds — floor, target, ceiling" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={!Object.keys(draft).length} onClick={save}>Save changes</button></>}>
      {err && <ErrorBanner error={err} />}
      <p className="sub" style={{ fontSize: 12 }}>Buy triggers (target), stop-loss (ceiling) and time-based minimums per season. The season table then shows a signal against today's market.</p>
      <select value={utility} onChange={(e) => { setUtility(e.target.value); setDraft({}); }} style={{ ...sel, marginBottom: 10 }}>
        {positions.map((p) => <option key={p.utility}>{p.utility}</option>)}</select>
      {!rows ? <Spinner /> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Season</th><th>Market</th><th>Hedged</th><th>Floor</th><th>Target</th><th>Ceiling</th><th>Min hedge %</th><th>By</th></tr></thead>
          <tbody>{seasons.map((s) => (
            <tr key={s.label}><td className="name">{s.label}</td><td className="mono">{s.market ?? "—"}</td><td className="mono">{pct(s.hedged_pct)}</td>
              <td>{inp(s.label, "floor")}</td><td>{inp(s.label, "target")}</td><td>{inp(s.label, "ceiling")}</td><td>{inp(s.label, "min_hedge_pct", 64)}</td>
              <td><input type="date" value={cur(s.label).min_hedge_by || ""} onChange={(e) => set(s.label, "min_hedge_by", e.target.value)} style={{ ...sel, padding: "5px 8px" }} /></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </Modal>
  );
}

/* ---------------- Whole-report import ---------------- */
function ReportImport({ basketId, onClose, onSaved }) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(today());
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  let parsed = null, counts = null;
  try {
    if (text.trim()) {
      // Accept the JSON on its own, or a whole saved HTML snapshot with the payload embedded.
      const m = text.match(/<script[^>]*id="data-payload"[^>]*>([\s\S]*?)<\/script>/i);
      parsed = JSON.parse(m ? m[1] : text);
      counts = ["gasMonthly", "gasSeasonal", "powerMonthly", "powerSeasonal"].map((k) => `${k}: ${(parsed[k] || []).length}`).join(" · ");
    }
  } catch { parsed = null; }
  const onFile = async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); };
  const save = async () => {
    if (!parsed) return setErr("Paste or choose a position report first");
    setSaving(true); setErr(null);
    try { await api.flexImportReport(basketId, parsed, date); onSaved(); } catch (e2) { setErr(e2.message); setSaving(false); }
  };
  return (
    <Modal title="Import a position report" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!parsed || saving} onClick={save}>{saving ? "Importing…" : "Import"}</button></>}>
      {err && <ErrorBanner error={err} />}
      <p className="sub" style={{ fontSize: 12 }}>Choose a saved position snapshot (.html) or its data (.json) with gasMonthly, gasSeasonal, powerMonthly and powerSeasonal. Existing periods are updated in place, and the book totals are recorded so the next report shows the movement.</p>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 10 }}>
        <Field label="Position data as at"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <label className="btn"><Upload size={14} /> Choose file<input type="file" accept=".html,.htm,.json" onChange={onFile} style={{ display: "none" }} /></label>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder='{"gasMonthly": [...], "gasSeasonal": [...], "powerMonthly": [...], "powerSeasonal": [...]}'
        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontFamily: "monospace", fontSize: 11.5 }} />
      {text.trim() && <div className="sub" style={{ fontSize: 12, marginTop: 6, color: parsed ? undefined : "#B91C1C" }}>{parsed ? `Found ${counts}` : "Couldn't read that as a position report."}</div>}
    </Modal>
  );
}

/* ---------------- Who the extension letter is for ---------------- */
function LetterForm({ basketId, onCancel, onOk }) {
  const [members, setMembers] = useState([]);
  const [f, setF] = useState({ business_id: "", contact_name: "", current_end: "" });
  useEffect(() => { api.flexMembers(basketId).then((r) => setMembers(r.data)).catch(() => {}); }, [basketId]);
  const opts = [...new Map(members.filter((m) => m.business_id).map((m) => [m.business_id, m])).values()];
  return (
    <Modal title="Framework extension letter" onClose={onCancel}
      footer={<><button className="btn" onClick={onCancel}>Cancel</button><button className="btn primary" onClick={() => onOk({ ...f, business_id: f.business_id ? Number(f.business_id) : null })}>Generate</button></>}>
      <div className="grid cols-2">
        <Field label="Member"><select value={f.business_id} onChange={(e) => setF({ ...f, business_id: e.target.value })}>
          <option value="">All members (generic letter)</option>{opts.map((m) => <option key={m.business_id} value={m.business_id}>{m.linked_name || m.business_name}</option>)}</select></Field>
        <Field label="Addressed to"><input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} placeholder="Contact name" /></Field>
        <Field label="Their current end date"><input type="date" value={f.current_end} onChange={(e) => setF({ ...f, current_end: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
