import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { FileText, FileSpreadsheet, Presentation, Globe, Download, TrendingUp, BookOpen, BookA, Wrench, LayoutGrid, Search } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { api, API_BASE } from "../api.js";
import Markdown from "../components/Markdown.jsx";
import { StrategyFinder, TrancheCalculator } from "../components/ClientTools.jsx";

/**
 * The client's private hub, opened from a shareable link with no login. Everything here
 * comes from one read-only call scoped to the customer's token.
 */
const ICON = { docx: FileText, xlsx: FileSpreadsheet, pptx: Presentation, html: Globe };
const fmtOf = (m = "") => (/word/.test(m) ? "docx" : /sheet/.test(m) ? "xlsx" : /presentation/.test(m) ? "pptx" : "html");
const KIND = { docx: "Word document", xlsx: "Spreadsheet", pptx: "Presentation", html: "Web page" };
const priceFmt = (v, u) => (v == null ? "—" : u?.price === "£/MWh" ? `£${Number(v).toFixed(2)}` : `${Number(v).toFixed(2)}p`);
const pct = (f) => (f == null ? "—" : `${Math.round(f * 100)}%`);
const date = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

export default function ClientHub() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("home");
  const [article, setArticle] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.hubPublic(token).then((r) => { setD(r.data); document.title = `${r.data.business_name} — ${r.data.settings.doc_company_name || "Energy hub"}`; }).catch((e) => setErr(e.message)); }, [token]);

  if (err) return <Shell><div style={{ padding: 40, textAlign: "center", color: "#475569" }}>{err}</div></Shell>;
  if (!d) return <Shell><div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading…</div></Shell>;
  const s = d.settings;
  const primary = s.doc_primary_color || "#0b2545", accent = s.doc_accent_color || "#eb6834";
  const docLink = (doc, inline) => `${API_BASE}/hub/${token}/documents/${doc.id}${inline ? "?inline=1" : ""}`;
  const tabs = [["home", "Overview", LayoutGrid], ["docs", `Documents (${d.documents.length})`, FileText],
    ...(d.position ? [["position", "Your consortium", TrendingUp]] : []), ...(d.market_report ? [["market", "Market update", TrendingUp]] : []),
    ["learn", "Learn", BookOpen], ["glossary", "Glossary", BookA], ["tools", "Tools", Wrench]];
  const openArticle = (slug) => { const a = d.articles.find((x) => x.slug === slug); if (a) { setArticle(a); setTab("learn"); window.scrollTo(0, 0); } };

  const DocList = ({ limit }) => (
    d.documents.length === 0 ? <p style={{ color: "#64748b", fontSize: 13.5 }}>Nothing published yet. Your consultant will add proposals and reports here.</p> : (
      <div style={{ display: "grid", gap: 8 }}>
        {d.documents.slice(0, limit || 999).map((doc) => {
          const f = fmtOf(doc.mime), Icon = ICON[f];
          return (
            <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", background: "#fff" }}>
              <Icon size={20} color={primary} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{doc.title}</div>
                <div style={{ fontSize: 11.5, color: "#64748b" }}>{KIND[f]} · {date(doc.created_at)}</div>
              </div>
              {f === "html" && <a href={docLink(doc, true)} target="_blank" rel="noreferrer" style={btn(primary, true)}>Open</a>}
              <a href={docLink(doc)} style={btn(primary)}><Download size={13} /> Download</a>
            </div>
          );
        })}
      </div>
    ));

  return (
    <Shell>
      <header style={{ background: `linear-gradient(135deg, ${primary}, #17406f)`, color: "#fff", padding: "22px 16px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.8 }}>{s.doc_company_name}</div>
          <h1 style={{ margin: "4px 0 4px", fontSize: 24, color: "#fff" }}>{d.business_name}</h1>
          <div style={{ fontSize: 13.5, opacity: 0.9 }}>Your energy hub — proposals, reports, market updates and guides in one place.</div>
        </div>
      </header>
      <nav style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", gap: 2, overflowX: "auto", padding: "0 8px" }}>
          {tabs.map(([k, l, Icon]) => (
            <button key={k} onClick={() => { setTab(k); setArticle(null); }} style={{ border: 0, background: "none", padding: "12px 12px", cursor: "pointer", whiteSpace: "nowrap",
              fontSize: 13.5, fontWeight: 600, color: tab === k ? primary : "#64748b", borderBottom: `3px solid ${tab === k ? accent : "transparent"}`, display: "flex", gap: 6, alignItems: "center" }}>
              <Icon size={14} /> {l}</button>
          ))}
        </div>
      </nav>
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 16px 40px" }}>
        {d.welcome_message && tab === "home" && <div style={{ background: "#fff7ea", borderLeft: `4px solid ${accent}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 14 }}>{d.welcome_message}</div>}

        {tab === "home" && (
          <div style={{ display: "grid", gap: 16 }}>
            <Section title="Latest documents" action={d.documents.length > 3 ? ["See all", () => setTab("docs")] : null}><DocList limit={3} /></Section>
            {d.position && <Section title={`${d.position.basket.name} — where your consortium stands`} action={["Details", () => setTab("position")]}><PositionTiles p={d.position} accent={accent} /></Section>}
            {d.market_report && <Section title={`Market update — ${date(d.market_report.report_date)}`} action={["Read", () => setTab("market")]}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{d.market_report.headline}</div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "#334155" }}>{d.market_report.summary}</p></Section>}
            <Section title="Start here">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
                {d.articles.slice(0, 6).map((a) => <ArticleCard key={a.id} a={a} onOpen={() => { setArticle(a); setTab("learn"); }} />)}
              </div>
            </Section>
          </div>
        )}
        {tab === "docs" && <Section title="Your documents"><DocList /></Section>}
        {tab === "position" && d.position && <PositionView p={d.position} accent={accent} />}
        {tab === "market" && d.market_report && <MarketView m={d.market_report} />}
        {tab === "learn" && (article ? (
          <Section title={article.title} action={["← All articles", () => setArticle(null)]}>
            {article.summary && <p style={{ color: "#64748b", marginTop: 0 }}><i>{article.summary}</i></p>}
            <Markdown text={article.body} accent={accent} />
          </Section>
        ) : (
          <>
            <input placeholder="Search the guides" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #e2e8f0", width: "100%", maxWidth: 360, marginBottom: 14 }} />
            {[...new Set(d.articles.map((a) => a.category))].map((c) => {
              const list = d.articles.filter((a) => a.category === c && (!q || `${a.title} ${a.summary} ${a.body}`.toLowerCase().includes(q.toLowerCase())));
              if (!list.length) return null;
              return (
                <div key={c} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#64748b", marginBottom: 8 }}>{c}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
                    {list.map((a) => <ArticleCard key={a.id} a={a} onOpen={() => setArticle(a)} />)}
                  </div>
                </div>
              );
            })}
          </>
        ))}
        {tab === "glossary" && <GlossaryView items={d.glossary} />}
        {tab === "tools" && (
          <div style={{ display: "grid", gap: 14 }}>
            <StrategyFinder minElec={Number(s.flex_min_elec_kwh) || 175000} minGas={Number(s.flex_min_gas_kwh) || 300000} accent={primary} onRead={openArticle} />
            <TrancheCalculator accent={accent} />
          </div>
        )}
      </main>
      <footer style={{ borderTop: "1px solid #e2e8f0", padding: "16px", fontSize: 11.5, color: "#64748b" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", lineHeight: 1.6 }}>
          <b>{s.doc_company_name}</b>{s.doc_contact_name ? ` · ${s.doc_contact_name}${s.doc_contact_title ? `, ${s.doc_contact_title}` : ""}` : ""}
          {[s.doc_phone, s.doc_contact_email || s.doc_email, s.doc_web].filter(Boolean).map((x) => ` · ${x}`).join("")}
          <div style={{ marginTop: 6 }}>{s.doc_disclaimer} {s.doc_company_legal}</div>
        </div>
      </footer>
    </Shell>
  );
}

const btn = (c, ghost) => ({ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, textDecoration: "none",
  background: ghost ? "#fff" : c, color: ghost ? c : "#fff", border: `1px solid ${c}`, whiteSpace: "nowrap" });

function Shell({ children }) {
  return <div style={{ minHeight: "100vh", background: "#f4f6f9", fontFamily: "-apple-system, Segoe UI, Roboto, Calibri, Arial, sans-serif", color: "#0f172a" }}>{children}</div>;
}
function Section({ title, action, children }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
        {action && <button onClick={action[1]} style={{ border: 0, background: "none", color: "#2a78d6", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{action[0]}</button>}
      </div>
      {children}
    </section>
  );
}
function ArticleCard({ a, onOpen }) {
  return (
    <button onClick={onOpen} style={{ textAlign: "left", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "#fff", cursor: "pointer", font: "inherit", color: "inherit" }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{a.title}</div>
      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{a.summary}</div>
    </button>
  );
}
function Tile({ label, value, sub, color }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em", color: "#64748b", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, margin: "3px 0 2px", color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}
function PositionTiles({ p, accent }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
      {p.positions.flatMap((x) => [
        <Tile key={`${x.utility}h`} label={`${x.utility} — hedged`} value={pct(x.hedged_pct)} sub={`Weighted locked-in ${priceFmt(x.locked_avg, x.units)}`} />,
        x.near_season && <Tile key={`${x.utility}n`} label={`${x.utility} — ${x.near_season.label}`} value={pct(x.near_season.hedged_pct)} color={accent}
          sub={x.near_season.locked != null ? `Locked at ${priceFmt(x.near_season.locked, x.units)} vs market ${priceFmt(x.near_season.market, x.units)}` : ""} />,
      ]).filter(Boolean)}
    </div>
  );
}
function PositionView({ p, accent }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Section title={p.basket.name}>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 10 }}>Position data as at {date(p.basket.report_date)}</div>
        {p.basket.market_commentary && <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}><b>Where the market is right now:</b> {p.basket.market_commentary}</p>}
        <PositionTiles p={p} accent={accent} />
      </Section>
      {p.positions.map((x) => (
        <Section key={x.utility} title={`${x.utility} — locked-in price vs today's market`}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Prices in {x.units.price}. Where the orange bar is below the blue bar, the consortium is already paying less than today's market.</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={x.seasonal.map((s) => ({ ...s, label: s.label.replace(/(Winter|Summer) \d{2}(\d{2})/, "$1 $2") }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={55} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => priceFmt(v, x.units)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="market" name="Market" fill="#2a78d6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="locked" name="Locked-in" fill={accent} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 8 }}>
              <thead><tr style={{ color: "#64748b", textAlign: "right" }}><th style={{ textAlign: "left", padding: 6 }}>Season</th><th style={{ padding: 6 }}>Market</th><th style={{ padding: 6 }}>Locked-in</th><th style={{ padding: 6 }}>Hedged</th></tr></thead>
              <tbody>{x.seasonal.map((s) => (
                <tr key={s.label} style={{ borderTop: "1px solid #eef2f6", textAlign: "right" }}>
                  <td style={{ textAlign: "left", padding: 6 }}>{s.label}</td><td style={{ padding: 6 }}>{priceFmt(s.market, x.units)}</td>
                  <td style={{ padding: 6 }}>{priceFmt(s.locked, x.units)}</td><td style={{ padding: 6 }}>{pct(s.hedged_pct)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Section>
      ))}
      {p.basket.member_message && <Section title="What this means for you"><p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{p.basket.member_message}</p></Section>}
    </div>
  );
}
function MarketView({ m }) {
  const lines = (t) => String(t || "").split("\n").filter(Boolean);
  const fp = (v, u) => (v == null ? "—" : u === "£/MWh" ? `£${Number(v).toFixed(2)}` : u === "p/therm" ? `${Number(v).toFixed(2)}p` : `${v}${u ? ` ${u}` : ""}`);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Section title={`${m.title} — ${date(m.report_date)}`}>
        {m.headline && <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{m.headline}</div>}
        {m.summary && <p style={{ fontSize: 14, lineHeight: 1.6 }}>{m.summary}</p>}
        {m.prices?.length > 0 && (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ color: "#64748b" }}><th style={{ textAlign: "left", padding: 6 }}>Contract</th><th style={{ textAlign: "right", padding: 6 }}>Price</th><th style={{ textAlign: "right", padding: 6 }}>Change</th><th style={{ textAlign: "left", padding: 6 }}>Note</th></tr></thead>
            <tbody>{m.prices.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #eef2f6" }}>
                <td style={{ padding: 6 }}>{p.commodity !== "Other" ? `${p.commodity} — ` : ""}{p.contract}</td>
                <td style={{ padding: 6, textAlign: "right", fontWeight: 600 }}>{fp(p.price, p.unit)}</td>
                <td style={{ padding: 6, textAlign: "right", color: p.change_pct == null ? "#64748b" : p.change_pct > 0 ? "#B91C1C" : "#0E7C7B" }}>{p.change_pct == null ? "—" : `${p.change_pct > 0 ? "+" : ""}${p.change_pct}%`}</td>
                <td style={{ padding: 6, color: "#64748b" }}>{p.note || ""}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>
      {m.backdrop && <Section title="Market backdrop">{lines(m.backdrop).map((t, i) => <p key={i} style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>{t}</p>)}</Section>}
      {m.drivers && <Section title="What's driving prices"><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>{lines(m.drivers).map((t, i) => <li key={i}>{t}</li>)}</ul></Section>}
      {m.outlook && <Section title="Outlook"><p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{m.outlook}</p></Section>}
      {(m.fixed_view || m.flex_view) && (
        <Section title="What it means for you">
          {m.fixed_view && <><div style={{ fontWeight: 700, fontSize: 13.5 }}>On, or renewing, a fixed contract</div><p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{m.fixed_view}</p></>}
          {m.flex_view && <><div style={{ fontWeight: 700, fontSize: 13.5 }}>Buying flexibly or through the consortium</div><p style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 0 }}>{m.flex_view}</p></>}
        </Section>
      )}
      {m.sources && <div style={{ fontSize: 11.5, color: "#64748b" }}>Sources: {lines(m.sources).join(" · ")}</div>}
    </div>
  );
}
function GlossaryView({ items }) {
  const [q, setQ] = useState("");
  const list = items.filter((g) => !q || `${g.term} ${g.definition}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section title="Glossary">
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 12 }}><Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
        <input placeholder="Search terms" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: "9px 12px 9px 30px", borderRadius: 9, border: "1px solid #e2e8f0", width: "100%" }} /></div>
      <dl style={{ margin: 0 }}>{list.map((g) => (
        <div key={g.term} style={{ padding: "9px 0", borderTop: "1px solid #eef2f6" }}>
          <dt style={{ fontWeight: 700, fontSize: 13.5 }}>{g.term}</dt>
          <dd style={{ margin: "2px 0 0", fontSize: 13, color: "#334155", lineHeight: 1.55 }}>{g.definition}</dd>
        </div>
      ))}</dl>
    </Section>
  );
}
