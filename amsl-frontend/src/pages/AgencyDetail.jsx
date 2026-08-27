import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, initials } from "../components/ui.jsx";

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "N/A"}</span>
    </div>
  );
}

export default function AgencyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [a, setA] = useState(null);
  const [agents, setAgents] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/agencies/${id}`).then((r) => setA(r.data)).catch((e) => setErr(e.message));
    api.list("agents", { limit: 500 }).then((r) => setAgents(r.data.filter((x) => String(x.agency_id) === String(id)))).catch(() => {});
  }, [id]);

  if (err) return <ErrorBanner error={err} />;
  if (!a) return <Spinner />;

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}><ArrowLeft size={16} /></button>
          <span className="ini sq" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(a.name)}</span>
          <div>
            <h1 style={{ margin: 0 }}>{a.name} <Badge tone={/active/i.test(a.status) ? "green" : "amber"}>{a.status}</Badge></h1>
            <p className="sub" style={{ margin: 0 }}>Overview of registered contact and user metrics.</p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {[["Unique ID", a.uid || `AG-${a.id}`], ["Business Structure", a.business_structure || "N/A"], ["Max Users", a.max_users ?? "N/A"], ["Current Users", agents.length]].map(([k, v]) => (
          <Card key={k} style={{ flex: 1, minWidth: 150 }}><div className="sub" style={{ fontSize: 12 }}>{k}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div></Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title="Contact & Registration Information">
          <Row k="Email Address" v={a.email} /><Row k="Phone Number" v={a.phone} />
          <Row k="Website" v={a.website} /><Row k="Company Reg No" v={a.company_reg_no} />
          <Row k="VAT Number" v={a.vat_no} /><Row k="Address" v={a.address} />
          <Row k="White Label" v={Number(a.white_label) ? "Enabled" : "No"} />
          <Row k="Created Date" v={a.created_at ? new Date(a.created_at).toLocaleDateString("en-GB") : null} />
        </Card>
        <Card title={`Authorized Agents (${agents.length})`} right={<button className="btn ghost sm" onClick={() => nav("/agents")}><Plus size={13} /> Add Agent</button>}>
          {agents.length === 0 ? <div className="sub">No agents in this agency yet.</div> : (
            <table className="tbl">
              <thead><tr><th>Agent</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {agents.map((ag) => (
                  <tr key={ag.id}>
                    <td style={{ fontWeight: 600 }}>{ag.name}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{ag.email}</td>
                    <td><Badge tone={ag.role === "Super User" ? "green" : "slate"}>{ag.role}</Badge></td>
                    <td><Badge tone="green">{ag.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
