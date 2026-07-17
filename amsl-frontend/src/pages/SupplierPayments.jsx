import { useState, useEffect } from "react";
import { UploadCloud } from "lucide-react";
import { api } from "../api.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";

export default function SupplierPayments() {
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [payments, setPayments] = useState({ data: [], loading: true, error: null });

  useEffect(() => {
    api.list("suppliers", { limit: 200 }).then((r) => setSuppliers(r.data)).catch(() => {});
    load();
  }, []);
  const load = () => {
    setPayments((s) => ({ ...s, loading: true }));
    api.list("supplier-payments", { limit: 50 })
      .then((r) => setPayments({ data: r.data, loading: false, error: null }))
      .catch((e) => setPayments({ data: [], loading: false, error: e.message }));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Upload Supplier Payment Invoice</h2>
          <div className="desc">Attach settlement / commission invoices per supplier.</div>
        </div>
      </div>

      <Card>
        <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label>Select Supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Choose a supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{
            border: "2px dashed #cbd5e1", borderRadius: 12, padding: "28px 16px", textAlign: "center",
            color: "#94a3b8", background: supplierId ? "#f8fafc" : "#f1f5f9",
          }}>
            <UploadCloud size={26} style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 600, color: "#64748b" }}>{supplierId ? "Drop a PDF here or click to browse" : "Select a supplier first"}</div>
            <div style={{ fontSize: 12 }}>{supplierId ? "PDF up to 10MB" : "Choose a supplier from the dropdown above to enable upload"}</div>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            File uploads are stored as records by the API in this demo (filename + uploader). Wire up multer + object storage for real PDFs.
          </div>
        </div>
      </Card>

      <Card title="Uploaded PDF Files">
        {payments.loading ? <Spinner /> : payments.error ? <ErrorBanner error={payments.error} onRetry={load} /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>File Name</th><th>Supplier</th><th>Uploaded By</th><th>Uploaded At</th></tr></thead>
              <tbody>
                {payments.data.map((p) => (
                  <tr key={p.id}>
                    <td className="name">{p.file_name}</td>
                    <td>{p.supplier_name || "—"}</td>
                    <td>{p.uploaded_by || "—"}</td>
                    <td className="mono">{p.uploaded_at?.slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
                {!payments.data.length && <tr><td colSpan={4} className="state">No PDF uploads found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
