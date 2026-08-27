import { useState, useEffect, useCallback } from "react";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";

const money = (n) => "£" + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 });
const stTone = { Projected: "#64748B", Reconciled: "#0F766E", Clawback: "#E11D48", Invoiced: "#B45309", Paid: "#0F766E", Overdue: "#E11D48" };

export default function Commission() {
  const [tab, setTab] = useState("records");
  const [summary, setSummary] = useState(null);
  const [eng, setEng] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [err, setErr] = useState(null);
  const [expand, setExpand] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    api.commissionSummary().then((r) => setSummary(r.data)).catch((e) => setErr(e.message));
    api.commissionRecords().then((r) => setEng(r.data)).catch((e) => setErr(e.message));
    api.commissionLedger().then((r) => setLedger(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const reconcile = async (id) => {
    const aac = prompt("Enter actual annual consumption (AAC):");
    if (aac && Number(aac) > 0) { await api.commissionReconcile(id, Number(aac)); load(); }
  };
  const clawback = async (id) => {
    const reason = prompt("Clawback reason:", "Contract cancelled");
    if (reason !== null) { await api.commissionClawback(id, reason); load(); }
  };

  if (err && !eng) return <ErrorBanner error={err} onRetry={load} />;
  if (!eng || !summary) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div><h1>Commission</h1><p className="sub">Projected commission, multi-level splits, schedules, reconciliation & ledger.</p></div>
      </div>
      {err && <ErrorBanner error={err} />}

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <Card style={{ flex: 1 }}><div className="sub" style={{ fontSize: 12 }}>Records</div><div style={{ fontSize: 24, fontWeight: 800 }}>{eng.totals.n}</div></Card>
        <Card style={{ flex: 1 }}><div className="sub" style={{ fontSize: 12 }}>Gross commission</div><div style={{ fontSize: 24, fontWeight: 800, color: "var(--brand,#0E7C7B)" }}>{money(eng.totals.gross)}</div></Card>
        <Card style={{ flex: 1 }}><div className="sub" style={{ fontSize: 12 }}>VAT</div><div style={{ fontSize: 24, fontWeight: 800 }}>{money(eng.totals.vat)}</div></Card>
      </div>

      <div className="toggle" style={{ marginBottom: 14 }}>
        <button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}>Records</button>
        <button className={tab === "byagent" ? "active" : ""} onClick={() => setTab("byagent")}>By Agent</button>
        <button className={tab === "ledger" ? "active" : ""} onClick={() => setTab("ledger")}>Ledger</button>
      </div>

      {tab === "records" && (
        <Card>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Contract</th><th>Supplier</th><th>EAC/AAC</th><th>Gross</th><th>VAT</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {eng.records.map((r) => (
                  <>
                    <tr key={r.id}>
                      <td><span style={{ fontWeight: 600 }}>{r.business_name}</span><div className="sub" style={{ fontSize: 11 }}>{r.contract_no}</div></td>
                      <td>{r.supplier_name || "—"}</td>
                      <td className="mono">{Number(r.eac).toLocaleString()}{r.aac ? ` / ${Number(r.aac).toLocaleString()}` : ""}</td>
                      <td className="name">{money(r.gross)}</td>
                      <td>{money(r.vat)}</td>
                      <td><span style={{ fontWeight: 700, fontSize: 12, color: stTone[r.status] || "#64748B" }}>{r.status}</span></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn ghost sm" onClick={() => setExpand(expand === r.id ? null : r.id)}>{expand === r.id ? "Hide" : "Details"}</button>
                        <button className="btn ghost sm" onClick={() => reconcile(r.id)}>Reconcile</button>
                        <button className="btn ghost sm danger" onClick={() => clawback(r.id)}>Clawback</button>
                      </td>
                    </tr>
                    {expand === r.id && (
                      <tr key={r.id + "-x"}><td colSpan={7} style={{ background: "var(--subtle,#F8FAFC)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "10px 4px" }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Multi-level split</div>
                            {r.splits.map((s, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}><span>{s.level} ({s.pct}%)</span><strong>{money(s.amount)}</strong></div>)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Payment schedule</div>
                            {r.schedule.map((s) => <div key={s.seq} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}><span>#{s.seq} · {s.due_date} · {s.status}</span><strong>{money(s.amount)}</strong></div>)}
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "byagent" && (
        <Card title="Commission by agent">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Agent</th><th>Agency</th><th>Contracts</th><th>Total</th><th>Confirmed</th></tr></thead>
              <tbody>
                {summary.byAgent.map((a, i) => (
                  <tr key={i}><td style={{ fontWeight: 600 }}>{a.agent || "Unassigned"}</td><td>{a.agency || "—"}</td><td className="mono">{a.contracts}</td><td className="name">{money(a.total_commission)}</td><td>{money(a.confirmed_commission)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "ledger" && (
        <Card title="Commission ledger">
          {!ledger ? <Spinner /> : ledger.length === 0 ? <div className="sub">No transactions.</div> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Type</th><th>Amount</th><th>Note</th><th>When</th></tr></thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600, textTransform: "capitalize" }}>{l.type}</td>
                      <td className="name" style={{ color: l.amount < 0 ? "#E11D48" : "inherit" }}>{money(l.amount)}</td>
                      <td style={{ fontSize: 12 }}>{l.note}</td>
                      <td className="sub" style={{ fontSize: 11 }}>{new Date(l.created_at).toLocaleString("en-GB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
