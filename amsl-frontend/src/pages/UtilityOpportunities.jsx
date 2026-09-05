import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Search, RotateCcw, Zap, Flame } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Pager, Field } from "../components/ui.jsx";

const emptyFilters = {
  utility: "ALL", business_name: "", contact_name: "", contact_email: "", agency_id: "", agent_id: "",
  segment: "", mpan: "", postcode: "", city: "", current_supplier_id: "", min_consumption: "", max_consumption: "", days_to_renew: "",
};

export default function UtilityOpportunities() {
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState(null);
  const [refs, setRefs] = useState({ agencies: [], agents: [], suppliers: [] });

  useEffect(() => {
    Promise.all([api.list("agencies", { limit: 200 }), api.list("agents", { limit: 200 }), api.list("suppliers", { limit: 300 })])
      .then(([a, ag, s]) => setRefs({ agencies: a.data, agents: ag.data, suppliers: s.data })).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setErr(null);
    const params = { ...applied, page, limit: 25 };
    Object.keys(params).forEach((k) => { if (params[k] === "" || params[k] === "ALL") delete params[k]; });
    api.utilityOpportunities(params).then((r) => { setRows(r.data); setMeta(r.meta); }).catch((e) => setErr(e.message));
  }, [applied, page]);
  useEffect(load, [load]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const search = () => { setPage(1); setApplied(filters); };
  const reset = () => { setFilters(emptyFilters); setApplied(emptyFilters); setPage(1); };

  return (
    <>
      <div className="page-head">
        <div><h1>Utility Opportunities</h1><p className="sub">Every meter across your leads and customers, in one filterable view.</p></div>
      </div>

      <Card>
        <div className="grid cols-3" style={{ marginBottom: 12 }}>
          <Field label="Utility">
            <select value={filters.utility} onChange={set("utility")}><option value="ALL">Electric &amp; Gas</option><option value="ELEC">Electricity</option><option value="GAS">Gas</option></select>
          </Field>
          <Field label="Business Name"><input value={filters.business_name} onChange={set("business_name")} /></Field>
          <Field label="Customer Name"><input value={filters.contact_name} onChange={set("contact_name")} /></Field>
          <Field label="Customer Email"><input value={filters.contact_email} onChange={set("contact_email")} /></Field>
          <Field label="Agency">
            <select value={filters.agency_id} onChange={set("agency_id")}><option value="">--- Select Agency ---</option>{refs.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          <Field label="Agent">
            <select value={filters.agent_id} onChange={set("agent_id")}><option value="">--- Select Agent ---</option>{refs.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          <Field label="SME/Corp/Dom">
            <select value={filters.segment} onChange={set("segment")}><option value="">Select</option><option>SME</option><option>Corporate</option><option>Domestic</option></select>
          </Field>
          <Field label="MPAN / MPRN"><input value={filters.mpan} onChange={set("mpan")} /></Field>
          <Field label="Postcode"><input value={filters.postcode} onChange={set("postcode")} /></Field>
          <Field label="City / Region"><input value={filters.city} onChange={set("city")} /></Field>
          <Field label="Min Consumption (kWh)"><input type="number" value={filters.min_consumption} onChange={set("min_consumption")} /></Field>
          <Field label="Max Consumption (kWh)"><input type="number" value={filters.max_consumption} onChange={set("max_consumption")} /></Field>
          <Field label="Current Supplier">
            <select value={filters.current_supplier_id} onChange={set("current_supplier_id")}><option value="">Select Supplier</option>{refs.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
          <Field label="Days to Renew (within)"><input type="number" placeholder="e.g. 60" value={filters.days_to_renew} onChange={set("days_to_renew")} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn primary" onClick={search}><Search size={14} /> Search</button>
          <button className="btn ghost" onClick={reset}><RotateCcw size={14} /> Reset</button>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        {err && <ErrorBanner error={err} onRetry={load} />}
        {!rows ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Business</th><th>Agency</th><th>Agent</th><th>Utility</th><th>Site</th>
                  <th>EAC/AQ</th><th>Segment</th><th>MPAN/MPRN</th><th>Current Supplier</th>
                  <th>Contract End</th><th>Days to Renew</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={13} className="sub" style={{ padding: 20, textAlign: "center" }}>No meters match these filters.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.meter_id}>
                    <td><Link to={`/leads/${r.business_id}`} className="name">{r.business_name}</Link><div className="sub" style={{ fontSize: 11 }}>#{r.ref}</div></td>
                    <td style={{ fontSize: 12 }}>{r.agency_name || "—"}</td>
                    <td style={{ fontSize: 12 }}>{r.agent_name || "—"}</td>
                    <td>{r.utility === "ELEC" ? <span className="mini"><Zap size={13} /> Elec</span> : <span className="mini"><Flame size={13} /> Gas</span>}</td>
                    <td style={{ fontSize: 12 }}>{r.site_name || "—"}</td>
                    <td className="mono">{r.eac?.toLocaleString() || "0"}</td>
                    <td style={{ fontSize: 12 }}>{r.segment || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.mpan_mprn || "N/A"}</td>
                    <td style={{ fontSize: 12 }}>{r.current_supplier_name || "—"}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.contract_end || "N/A"}</td>
                    <td className="mono">{r.days_to_renew != null ? (r.days_to_renew < 0 ? "Overdue" : `${r.days_to_renew} Days`) : "N/A"}</td>
                    <td><Badge tone={r.status === "C" ? "green" : r.status === "S" ? "amber" : "slate"}>{r.status === "C" ? "Live" : r.status === "S" ? "Switching" : "Dropped"}</Badge></td>
                    <td><Link className="btn ghost sm" to={`/leads/${r.business_id}`}>Open Lead</Link></td>
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
