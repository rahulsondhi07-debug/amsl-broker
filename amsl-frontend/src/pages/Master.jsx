import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, JOURNEY_STAGES } from "../api.js";
import { Card, Spinner, ErrorBanner, Pager, initials } from "../components/ui.jsx";

const FUELS = [{ k: "", label: "All fuels" }, { k: "ELEC", label: "Electricity" }, { k: "GAS", label: "Gas" }, { k: "DUAL", label: "Dual" }];
const labelOf = (k) => JOURNEY_STAGES.find((s) => s.key === k)?.label || k;
const groupOf = (k) => JOURNEY_STAGES.find((s) => s.key === k)?.group || "";

export default function Master() {
  const [f, setF] = useState({ stage: "", fuel: "", agency_id: "", agent_id: "", q: "" });
  const [refs, setRefs] = useState({ agencies: [], agents: [] });
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([api.list("agencies", { limit: 200 }), api.list("agents", { limit: 200 })])
      .then(([a, ag]) => setRefs({ agencies: a.data, agents: ag.data })).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setErr(null);
    api.pipelineList({ ...f, page, limit: 15 })
      .then((r) => { setRows(r.data); setMeta(r.meta); })
      .catch((e) => setErr(e.message));
  }, [f, page]);
  useEffect(() => { load(); }, [load]);
  const upd = (k) => (e) => { setPage(1); setF({ ...f, [k]: e.target.value }); };

  const sel = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#E7EBF0)", fontSize: 13, background: "#fff" };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Master Lead / Meter Management</h1>
          <p className="sub">Every customer and meter across all stages, with master filters.</p>
        </div>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}

      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input placeholder="Search business, contact, ref…" value={f.q} onChange={upd("q")} style={{ ...sel, flex: 1, minWidth: 200 }} />
          <select value={f.stage} onChange={upd("stage")} style={sel}>
            <option value="">All stages</option>
            {JOURNEY_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={f.fuel} onChange={upd("fuel")} style={sel}>
            {FUELS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
          </select>
          <select value={f.agency_id} onChange={upd("agency_id")} style={sel}>
            <option value="">All agencies</option>
            {refs.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={f.agent_id} onChange={upd("agent_id")} style={sel}>
            <option value="">All agents</option>
            {refs.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {!rows ? <Spinner /> : rows.length === 0 ? <div className="sub">No records match these filters.</div> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Business / Contact</th><th>Stage</th><th>Fuel</th><th>Meters</th>
                <th>Consumption</th><th>Supplier</th><th>Agency / Agent</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="ini" style={{ width: 26, height: 26, fontSize: 11, borderRadius: 7, background: "var(--accent-soft,#EEF2FF)", color: "var(--accent,#4F46E5)", display: "grid", placeItems: "center", fontWeight: 700 }}>{initials(r.business_name)}</span>
                        <div><div style={{ fontWeight: 600 }}>{r.business_name}</div><div className="sub" style={{ fontSize: 11 }}>{r.contact_name || "—"} · {r.ref}</div></div>
                      </div>
                    </td>
                    <td><span className="stg" style={{ fontSize: 12, fontWeight: 600 }}>{labelOf(r.journey_stage)}</span><div className="sub" style={{ fontSize: 10 }}>{groupOf(r.journey_stage)}</div></td>
                    <td><span className={`pill ${r.fuel === "GAS" ? "amber" : r.fuel === "ELEC" ? "indigo" : "slate"}`}>{r.fuel}</span></td>
                    <td className="mono">{r.meters || 0}</td>
                    <td className="mono">{r.total_eac ? Number(r.total_eac).toLocaleString() + " kWh" : "—"}</td>
                    <td>{r.supplier_name || "—"}</td>
                    <td style={{ fontSize: 12 }}>{r.agency_name || "—"}<div className="sub" style={{ fontSize: 11 }}>{r.agent_name || "—"}</div></td>
                    <td><Link className="btn ghost sm" to={`/pipeline?stage=${r.journey_stage}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && <Pager meta={meta} page={page} setPage={setPage} />}
      </Card>
    </>
  );
}
