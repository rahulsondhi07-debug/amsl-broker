import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner, initials } from "../components/ui.jsx";

function daysTo(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - new Date()) / 864e5);
}
function urgencyColor(d) {
  if (d == null) return "var(--muted,#94A3B8)";
  if (d <= 30) return "var(--urgent,#E11D48)";
  if (d <= 90) return "var(--warn,#B45309)";
  return "var(--muted,#64748B)";
}

export default function Renewals() {
  const [renewals, setRenewals] = useState(null);
  const [callbacks, setCallbacks] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    api.pipelineList({ stage: "UP_FOR_RENEWAL", limit: 100 }).then((r) => setRenewals(r.data)).catch((e) => setErr(e.message));
    api.pipelineCallbacksUpcoming().then((r) => setCallbacks(r.data)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const markDone = async (cid) => { await api.pipelineCallbackDone(cid); load(); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Renewals &amp; Callbacks</h1>
          <p className="sub">Customers due for renewal and your scheduled callbacks.</p>
        </div>
      </div>
      {err && <ErrorBanner error={err} onRetry={load} />}

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title={`Up for Renewal${renewals ? ` (${renewals.length})` : ""}`} right={<Link className="btn ghost sm" to="/pipeline?stage=UP_FOR_RENEWAL">Open in pipeline →</Link>}>
          {!renewals ? <Spinner /> : renewals.length === 0 ? <div className="sub">No customers up for renewal.</div> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Business</th><th>Fuel</th><th>Supplier</th><th>Renews</th></tr></thead>
                <tbody>
                  {renewals.map((row) => {
                    const d = daysTo(row.contract_end);
                    return (
                      <tr key={row.id}>
                        <td>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span className="ini" style={{ width: 26, height: 26, fontSize: 11, borderRadius: 7, background: "var(--accent-soft,#EEF2FF)", color: "var(--accent,#4F46E5)", display: "grid", placeItems: "center", fontWeight: 700 }}>{initials(row.business_name)}</span>
                            <div><div style={{ fontWeight: 600 }}>{row.business_name}</div><div className="sub" style={{ fontSize: 11 }}>{row.contact_name || "—"}</div></div>
                          </div>
                        </td>
                        <td><span className={`pill ${row.fuel === "GAS" ? "amber" : row.fuel === "ELEC" ? "indigo" : "slate"}`}>{row.fuel}</span></td>
                        <td>{row.supplier_name || "—"}</td>
                        <td style={{ fontWeight: 700, color: urgencyColor(d) }}>
                          {d != null ? `${d} day${d === 1 ? "" : "s"}` : "—"}
                          <div className="sub" style={{ fontSize: 11, fontWeight: 500 }}>{row.contract_end ? new Date(row.contract_end).toLocaleDateString("en-GB") : ""}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={`Upcoming Callbacks${callbacks ? ` (${callbacks.length})` : ""}`}>
          {!callbacks ? <Spinner /> : callbacks.length === 0 ? <div className="sub">No callbacks scheduled.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {callbacks.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line,#EEF1F4)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.business_name}</div>
                    <div className="sub" style={{ fontSize: 11 }}>{new Date(c.due_at).toLocaleString("en-GB")}{c.reason ? ` · ${c.reason}` : ""}</div>
                  </div>
                  <button className="btn ghost sm" onClick={() => markDone(c.id)}>Done</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
