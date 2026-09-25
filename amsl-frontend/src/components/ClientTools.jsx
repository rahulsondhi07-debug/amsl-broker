import { useState } from "react";

/**
 * Two client-facing tools, used in the Knowledge Hub and in every client hub:
 *   StrategyFinder     which buying strategy suits the business (the decision table from
 *                      the buying guide, made interactive)
 *   TrancheCalculator  staged buying vs fixing on the best or worst day, on the client's
 *                      own volume
 */
const box = { border: "1px solid var(--line,#E7EBF0)", borderRadius: 12, padding: 16, background: "#fff" };
const inp = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", width: "100%", fontSize: 13 };
const lab = { fontSize: 11.5, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 };
const fmt = (n, dp = 0) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: dp });

export function StrategyFinder({ minElec = 175000, minGas = 300000, accent = "#0E7C7B", onRead }) {
  const [f, setF] = useState({ fuel: "Electricity", kwh: "", sites: "1", priority: "balanced", team: "no" });
  const kwh = Number(String(f.kwh).replace(/,/g, "")) || 0;
  const min = f.fuel === "Gas" ? minGas : minElec;
  let rec = null;
  if (kwh > 0) {
    if (f.priority === "certainty") rec = { title: "Fixed, or flexible with a high early hedge", why: "Budget certainty comes first. Accept the timing risk of a single fix, or reduce it by hedging a large share early within a flexible contract.", read: "which-strategy-suits-you" };
    else if (kwh < min) rec = { title: "Fixed contract, bought with a milestone strategy", why: `At ${fmt(kwh)} kWh a year you are below the ${fmt(min)} kWh ${f.fuel.toLowerCase()} entry level for flexible frameworks. The value is in timing the fix well: watch the market from 12 to 18 months out and fix when it offers value.`, read: "fixed-price-strategy" };
    else if (Number(f.sites) > 10 || kwh > min * 20 || f.team === "yes") rec = { title: "Bespoke flexible basket", why: "A large or multi-site portfolio can have a strategy, buy triggers and risk limits built around its own budget and risk tolerance.", read: "flexible-strategy" };
    else rec = { title: "Consortium flexible buying", why: "You clear the entry level. Pooled volume, staged buying and a professional trading desk, with no in-house effort.", read: "consortium-advantage" };
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div style={box}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Which strategy suits you?</div>
      <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 12 }}>Two questions matter most: how much you use, and how much price movement your budget can take.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <label><span style={lab}>Fuel</span><select value={f.fuel} onChange={set("fuel")} style={inp}><option>Electricity</option><option>Gas</option></select></label>
        <label><span style={lab}>Annual use (kWh)</span><input value={f.kwh} onChange={set("kwh")} inputMode="numeric" placeholder="e.g. 285,000" style={inp} /></label>
        <label><span style={lab}>Sites</span><input type="number" min="1" value={f.sites} onChange={set("sites")} style={inp} /></label>
        <label><span style={lab}>Priority</span><select value={f.priority} onChange={set("priority")} style={inp}>
          <option value="certainty">One fixed number, whatever the market</option><option value="balanced">Balance cost and certainty</option><option value="cost">Lowest overall cost</option></select></label>
        <label><span style={lab}>Own risk policy / trading team?</span><select value={f.team} onChange={set("team")} style={inp}><option value="no">No</option><option value="yes">Yes</option></select></label>
      </div>
      {rec && (
        <div style={{ marginTop: 14, borderLeft: `4px solid ${accent}`, background: "#f0fdfa", borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#64748b", fontWeight: 700 }}>Suggested approach</div>
          <div style={{ fontWeight: 800, fontSize: 16, margin: "2px 0 4px" }}>{rec.title}</div>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>{rec.why}</div>
          {onRead && <button className="btn ghost sm" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => onRead(rec.read)}>Read more →</button>}
        </div>
      )}
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>A starting point for a conversation, not advice. Every site's position, profile and contract timing is assessed individually.</div>
    </div>
  );
}

const EXAMPLE = "140, 152, 165, 158, 146, 130, 118, 105, 95, 120, 145, 164";

export function TrancheCalculator({ accent = "#eb6834" }) {
  const [fuel, setFuel] = useState("Gas");
  const [kwh, setKwh] = useState("300000");
  const [text, setText] = useState(EXAMPLE);
  const prices = text.split(/[,\s]+/).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  const vol = Number(String(kwh).replace(/,/g, "")) || 0;
  const unit = fuel === "Gas" ? "p/therm" : "£/MWh";
  // Gas: kWh -> therms, priced in pence. Power: kWh -> MWh, priced in pounds.
  const cost = (p) => (fuel === "Gas" ? (vol / 29.3071) * p / 100 : (vol / 1000) * p);
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const worst = prices.length ? Math.max(...prices) : null, best = prices.length ? Math.min(...prices) : null;
  const pf = (p) => (fuel === "Gas" ? `${fmt(p, 1)}p` : `£${fmt(p, 2)}`);

  const W = 560, H = 170, L = 40, R = 10, T = 10, B = 24;
  const lo = prices.length ? Math.floor(Math.min(...prices) * 0.85) : 0, hi = prices.length ? Math.ceil(Math.max(...prices) * 1.08) : 1;
  const x = (i) => L + ((W - L - R) * (i + 0.5)) / Math.max(1, prices.length);
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / Math.max(1, hi - lo));
  const ref = (v, c, t) => <g><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={c} strokeDasharray="4 3" /><text x={W - R} y={y(v) - 3} fontSize="10" textAnchor="end" fill={c}>{t} {pf(v)}</text></g>;
  return (
    <div style={box}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Tranche calculator</div>
      <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 12 }}>Buying in equal stages against fixing on the best or worst day. Enter your annual use and a run of prices (one per purchase).</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <label><span style={lab}>Fuel</span><select value={fuel} onChange={(e) => { setFuel(e.target.value); setText(e.target.value === "Gas" ? EXAMPLE : "95, 104, 118, 112, 99, 88, 82, 76, 72, 85, 97, 110"); }} style={inp}><option>Gas</option><option>Electricity</option></select></label>
        <label><span style={lab}>Annual use (kWh)</span><input value={kwh} onChange={(e) => setKwh(e.target.value)} inputMode="numeric" style={inp} /></label>
        <label><span style={lab}>Prices ({unit}), comma separated</span><input value={text} onChange={(e) => setText(e.target.value)} style={inp} /></label>
      </div>
      {prices.length > 1 && vol > 0 && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ marginTop: 12, maxWidth: 680 }}>
            {ref(worst, "#B91C1C", "Fix on worst")}{ref(avg, accent, "Tranche average")}{ref(best, "#0E7C7B", "Fix on best")}
            {prices.map((p, i) => <circle key={i} cx={x(i)} cy={y(p)} r="5" fill="#2a78d6"><title>{pf(p)}</title></circle>)}
            <text x={L} y={H - 6} fontSize="10" fill="#64748b">each dot = one tranche bought</text>
          </svg>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, marginTop: 8 }}>
            {[["Fix on the worst day", worst, "#B91C1C"], ["Tranche average", avg, accent], ["Fix on the best day", best, "#0E7C7B"]].map(([l, p, c]) => (
              <div key={l} style={{ border: "1px solid var(--line,#E7EBF0)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{pf(p)}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>£{fmt(cost(p))} a year</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 13, background: "#fff7ea", borderRadius: 8, padding: "10px 12px" }}>
            Staging the purchases avoids <b>£{fmt(cost(worst) - cost(avg))} a year</b> of risk compared with fixing on the worst day. You give up <b>£{fmt(cost(avg) - cost(best))}</b> against the best day, which you'd only get by calling the bottom perfectly.
          </div>
        </>
      )}
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>Illustrative: commodity cost only, before network charges, levies and VAT.</div>
    </div>
  );
}
