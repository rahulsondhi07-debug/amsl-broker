import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api, JOURNEY_STAGES } from "../api.js";
import { Spinner, ErrorBanner, initials } from "../components/ui.jsx";

const GROUPS = ["Lead", "Prospect", "Contract", "Other"];
const FUELS = [
  { k: "", label: "All fuels" },
  { k: "ELEC", label: "Electricity" },
  { k: "GAS", label: "Gas" },
  { k: "DUAL", label: "Elec + Gas" },
];
const labelOf = (k) => JOURNEY_STAGES.find((s) => s.key === k)?.label || k;
const groupTone = { Lead: "slate", Prospect: "indigo", Contract: "green", Other: "amber" };

function renewal(end) {
  if (!end) return { text: "—", tone: "" };
  const days = Math.round((new Date(end) - new Date()) / 86400000);
  const tone = days <= 30 ? "rose" : days <= 90 ? "amber" : "";
  return { text: `${days}d · ${new Date(end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, tone, days };
}

export default function Pipeline() {
  const [params, setParams] = useSearchParams();
  const stage = params.get("stage") || "";
  const [fuel, setFuel] = useState("");
  const [q, setQ] = useState("");
  const [stages, setStages] = useState(null);
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [selId, setSelId] = useState(null);

  const setStage = (s) => { const p = new URLSearchParams(params); s ? p.set("stage", s) : p.delete("stage"); setParams(p); };

  const loadStages = useCallback(() => {
    api.pipelineStages(fuel).then((r) => setStages(r.data)).catch((e) => setErr(e.message));
  }, [fuel]);
  const loadList = useCallback(() => {
    setList(null);
    api.pipelineList({ stage, fuel, q, limit: 50 }).then((r) => setList(r.data)).catch((e) => setErr(e.message));
  }, [stage, fuel, q]);

  useEffect(() => { loadStages(); }, [loadStages]);
  useEffect(() => { const t = setTimeout(loadList, 200); return () => clearTimeout(t); }, [loadList]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Sales Pipeline</h1>
          <p className="desc">The full customer journey — Raw Lead through to Renewal, sorted by soonest renewal.</p>
        </div>
        <div className="toggle">
          {FUELS.map((f) => (
            <button key={f.k} className={fuel === f.k ? "active" : ""} onClick={() => setFuel(f.k)}>{f.label}</button>
          ))}
        </div>
      </div>

      {err && <ErrorBanner error={err} onRetry={() => { setErr(null); loadStages(); loadList(); }} />}

      {/* stage strip grouped */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {!stages ? <Spinner /> : GROUPS.map((g) => (
            <div key={g} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="lab" style={{ fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted,#94A3B8)" }}>{g}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {stages.stages.filter((s) => s.group === g).map((s) => (
                  <button key={s.key}
                    onClick={() => setStage(stage === s.key ? "" : s.key)}
                    className={`badge ${groupTone[g]}`}
                    style={{ cursor: "pointer", border: stage === s.key ? "2px solid currentColor" : "1px solid transparent", padding: "6px 10px", display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 78 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{s.count}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600 }}>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid" style={{ display: "grid", gridTemplateColumns: selId ? "1fr 360px" : "1fr", gap: 16, alignItems: "start" }}>
        {/* list */}
        <div className="card">
          <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div className="search" style={{ flex: 1, maxWidth: 320 }}>
              <input placeholder="Search business, contact, ref…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <span className="sub">{stage ? labelOf(stage) : "All stages"}{fuel ? ` · ${FUELS.find((f) => f.k === fuel)?.label}` : ""}</span>
          </div>
          <div className="table-wrap">
            {!list ? <Spinner /> : list.length === 0 ? (
              <div className="state" style={{ padding: 30, textAlign: "center", color: "var(--muted,#94A3B8)" }}>No customers in this view.</div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Business / Contact</th><th>Fuel</th><th>Supplier</th><th>Renewal</th><th>Stage</th><th>Agent</th></tr></thead>
                <tbody>
                  {list.map((row) => {
                    const rn = renewal(row.contract_end);
                    return (
                      <tr key={row.id} onClick={() => setSelId(row.id)} style={{ cursor: "pointer", background: selId === row.id ? "var(--accent-soft,#EEF2FF)" : "" }}>
                        <td><div className="name">{row.business_name}</div><div className="sub">{row.contact_name || "—"} · {row.ref}</div></td>
                        <td><span className={`pill ${row.fuel === "GAS" ? "amber" : row.fuel === "ELEC" ? "indigo" : "slate"}`}>{row.fuel}</span></td>
                        <td>{row.supplier_name || "—"}</td>
                        <td><span className={rn.tone ? rn.tone : ""} style={{ fontWeight: 700, color: rn.tone === "rose" ? "#E11D48" : rn.tone === "amber" ? "#B45309" : "inherit" }}>{rn.text}</span></td>
                        <td><span className={`badge ${groupTone[JOURNEY_STAGES.find((s) => s.key === row.journey_stage)?.group] || "slate"}`}>{labelOf(row.journey_stage)}</span></td>
                        <td>{row.agent_name || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {selId && <DetailsPanel id={selId} onClose={() => setSelId(null)} onChanged={() => { loadStages(); loadList(); }} />}
      </div>
    </div>
  );
}

function DetailsPanel({ id, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("details");
  const [comment, setComment] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [disp, setDisp] = useState("");
  const [cbDate, setCbDate] = useState("");
  const [cbReason, setCbReason] = useState("No answer — retry");
  const load = useCallback(() => { setData(null); api.pipelineDetail(id).then((r) => { setData(r.data); setMoveTo(r.data.journey_stage); }); }, [id]);
  useEffect(() => { load(); }, [load]);

  const move = async () => { if (moveTo && data && moveTo !== data.journey_stage) { await api.pipelineMove(id, moveTo); load(); onChanged?.(); } };
  const addComment = async () => { if (comment.trim()) { await api.pipelineComment(id, comment.trim()); setComment(""); load(); onChanged?.(); } };
  const saveDisp = async () => { if (disp) { await api.pipelineDisposition(id, disp); setDisp(""); load(); } };
  const schedule = async () => { if (cbDate) { await api.pipelineCallback(id, cbDate.replace("T", " "), cbReason); setCbDate(""); load(); } };
  const DISPOSITIONS = ["Spoke - interested", "Spoke - not interested", "No answer", "Left voicemail", "Wrong number", "Requested callback", "Do not contact"];

  const rn = data ? renewal(data.contract_end) : null;
  return (
    <div className="card" style={{ position: "sticky", top: 12 }}>
      <div className="card-head" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div className="ini" style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-soft,#EEF2FF)", color: "var(--accent,#4F46E5)", display: "grid", placeItems: "center", fontWeight: 800 }}>{initials(data?.business_name || "")}</div>
        <div style={{ flex: 1 }}><div className="name">{data?.business_name || "…"}</div><div className="sub">{data?.ref}</div></div>
        <button className="btn ghost sm" onClick={onClose}>✕</button>
      </div>

      {!data ? <div className="card-body"><Spinner /></div> : (
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* move stage */}
          <div>
            <div className="lab" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted,#94A3B8)", marginBottom: 4 }}>Stage</div>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={{ flex: 1, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }}>
                {JOURNEY_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <button className="btn primary sm" disabled={moveTo === data.journey_stage} onClick={move}>Move</button>
            </div>
          </div>

          <div className="toggle" style={{ alignSelf: "flex-start" }}>
            <button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Details</button>
            <button className={tab === "actions" ? "active" : ""} onClick={() => setTab("actions")}>Actions</button>
            <button className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}>Comments{data.comments?.length ? ` (${data.comments.length})` : ""}</button>
          </div>

          {tab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                ["Contact", data.contact_name], ["Email", data.contact_email], ["Mobile", data.contact_mobile],
                ["Fuel", data.fuel], ["Supplier", data.supplier_name || "—"],
                ["Renewal", rn.text], ["Disposition", data.disposition || "—"],
                ["Agency", data.agency_name || "—"], ["Agent", data.agent_name || "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
                  <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "—"}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "actions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div className="lab" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted,#94A3B8)", marginBottom: 4 }}>Log disposition</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={disp} onChange={(e) => setDisp(e.target.value)} style={{ flex: 1, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }}>
                    <option value="">Select outcome…</option>
                    {DISPOSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button className="btn primary sm" disabled={!disp} onClick={saveDisp}>Save</button>
                </div>
                {data.disposition && <div className="sub" style={{ fontSize: 11, marginTop: 4 }}>Latest: {data.disposition}</div>}
              </div>
              <div>
                <div className="lab" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted,#94A3B8)", marginBottom: 4 }}>Schedule callback</div>
                <input type="datetime-local" value={cbDate} onChange={(e) => setCbDate(e.target.value)}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", marginBottom: 6 }} />
                <select value={cbReason} onChange={(e) => setCbReason(e.target.value)} style={{ width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", marginBottom: 6 }}>
                  {["No answer — retry", "Requested callback", "Send quote", "Awaiting documents", "Renewal discussion"].map((x) => <option key={x}>{x}</option>)}
                </select>
                <button className="btn primary sm" disabled={!cbDate} onClick={schedule}>Schedule callback</button>
              </div>
              {(data.history || []).length > 0 && (
                <div>
                  <div className="lab" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted,#94A3B8)", marginBottom: 4 }}>Activity</div>
                  {data.history.slice(0, 6).map((h) => (
                    <div key={h.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>{h.to_stage === "disposition" ? (h.note || "Disposition") : `${labelOf(h.from_stage) || "New"} → ${labelOf(h.to_stage)}`}</span>
                      <div className="sub" style={{ fontSize: 11 }}>{h.changed_by} · {new Date(h.changed_at).toLocaleString("en-GB")}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "comments" && (
            <div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <input placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)" }} />
                <button className="btn primary sm" onClick={addComment}>Post</button>
              </div>
              {(data.comments || []).length === 0 ? <div className="sub">No comments yet.</div> :
                data.comments.map((c) => (
                  <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)" }}>
                    <div style={{ fontSize: 13 }}>{c.body}</div>
                    <div className="sub" style={{ fontSize: 11 }}>{c.author} · {new Date(c.created_at).toLocaleString("en-GB")}</div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
