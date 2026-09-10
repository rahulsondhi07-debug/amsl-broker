import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Flame, RotateCcw, Table2 } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, Pager } from "../components/ui.jsx";

const money = (n) => Number(n).toFixed(2);
const PB_STATUS = ["Pending", "Released"];

export default function Tariffs() {
  const nav = useNavigate();
  const [rows, setRows] = useState({ data: [], meta: {}, loading: true, error: null });
  const [page, setPage] = useState(1);
  const [utility, setUtility] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [term, setTerm] = useState("");
  const [pbStatus, setPbStatus] = useState("");
  const [suppliers, setSuppliers] = useState([]);

  const load = useCallback(() => {
    setRows((s) => ({ ...s, loading: true }));
    api.list("tariffs", { page, limit: 15, utility, supplier_id: supplierId, term_months: term, price_book_status: pbStatus })
      .then((r) => setRows({ data: r.data, meta: r.meta, loading: false, error: null }))
      .catch((e) => setRows({ data: [], meta: {}, loading: false, error: e.message }));
  }, [page, utility, supplierId, term, pbStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.list("suppliers", { limit: 300 }).then((r) => setSuppliers(r.data)).catch(() => {}); }, []);

  const resetFilters = () => { setUtility(""); setSupplierId(""); setTerm(""); setPbStatus(""); setPage(1); };
  const filtersActive = utility || supplierId || term || pbStatus;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Tariff Management</h2>
          <div className="desc">
            A filtered view of the rates uploaded under Products → Price Matrix — not a separate list. To
            change a rate, edit the price matrix on the product itself; only Released price books ever
            reach the customer-facing comparison.
          </div>
        </div>
        <div className="toggle">
          {[["", "All"], ["ELECTRICITY", "Electricity"], ["GAS", "Gas"]].map(([v, l]) => (
            <button key={l} className={utility === v ? "active" : ""} onClick={() => { setPage(1); setUtility(v); }}>{l}</button>
          ))}
        </div>
      </div>

      <Card>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={supplierId} onChange={(e) => { setPage(1); setSupplierId(e.target.value); }}
            style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" }}>
            <option value="">All Suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={term} onChange={(e) => { setPage(1); setTerm(e.target.value); }}
            style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" }}>
            <option value="">All Terms</option>
            <option value="12">12 months</option>
            <option value="24">24 months</option>
            <option value="36">36 months</option>
          </select>
          <select value={pbStatus} onChange={(e) => { setPage(1); setPbStatus(e.target.value); }}
            style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line,#E7EBF0)" }}>
            <option value="">All Price Book Statuses</option>
            {PB_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
          {filtersActive && <button className="btn ghost" onClick={resetFilters}><RotateCcw size={14} /> Reset</button>}
        </div>

        {rows.loading ? <Spinner /> : rows.error ? <ErrorBanner error={rows.error} onRetry={load} /> : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Supplier</th><th>Product</th><th>Utility</th><th>Term</th><th>Unit Rate (p/kWh)</th><th>Standing Charge (p/day)</th><th>Deal Type</th><th>Price Book</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.data.map((t) => (
                    <tr key={t.id}>
                      <td><span className="mini"><span className="ini sq">{t.utility === "GAS" ? <Flame size={14} /> : <Zap size={14} />}</span><span className="name">{t.supplier_name}</span></span></td>
                      <td style={{ fontSize: 12 }}>{t.product_name}</td>
                      <td>{t.utility}</td>
                      <td>{t.term_months ? `${t.term_months} m` : "—"}</td>
                      <td className="mono">{t.unit_rate != null ? money(t.unit_rate) : "—"}</td>
                      <td className="mono">{t.standing_charge != null ? money(t.standing_charge) : "—"}</td>
                      <td><Badge tone={t.acq_renewal === "Renewal" ? "indigo" : t.acq_renewal === "Acquisition" ? "amber" : "slate"}>{t.acq_renewal || "Both"}</Badge></td>
                      <td><Badge tone={t.price_book_status === "Released" ? "green" : "amber"}>{t.price_book_status}</Badge></td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn ghost sm" onClick={() => nav("/products")}><Table2 size={13} /> View in Products</button>
                      </td>
                    </tr>
                  ))}
                  {!rows.data.length && <tr><td colSpan={9} className="state">No matrix rows found for these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager meta={rows.meta} page={page} setPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
