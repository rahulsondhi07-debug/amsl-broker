import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner, initials } from "../components/ui.jsx";

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "N/A"}</span>
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [a, setA] = useState(null);
  const [tab, setTab] = useState("profile");
  const [err, setErr] = useState(null);

  useEffect(() => {
    // use the list (excludes password_hash) and find by id
    api.list("agents", { limit: 500 }).then((r) => {
      const found = r.data.find((x) => String(x.id) === String(id));
      if (found) setA(found); else setErr("Agent not found");
    }).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <ErrorBanner error={err} />;
  if (!a) return <Spinner />;

  const tabs = [["profile", "Profile & Role"], ["contact", "Contact & Address"], ["banking", "Banking"], ["compliance", "Compliance & Notes"]];

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}><ArrowLeft size={16} /></button>
          <span className="ini" style={{ width: 44, height: 44, borderRadius: 11, fontSize: 15 }}>{initials(a.name)}</span>
          <div>
            <h1 style={{ margin: 0 }}>{a.name} <Badge tone={a.role === "Super User" ? "green" : a.role === "Admin" ? "indigo" : "slate"}>{a.role}</Badge></h1>
            <p className="sub" style={{ margin: 0 }}>{a.agency_name || "—"} · {a.email}</p>
          </div>
        </div>
      </div>

      <div className="toggle" style={{ marginBottom: 14 }}>
        {tabs.map(([k, label]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === "profile" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <Card title="Agent Details">
            <Row k="Full Name" v={a.name} /><Row k="Trading Name" v={a.trading_name} />
            <Row k="Principal Name" v={a.principal_name} /><Row k="Agency" v={a.agency_name} />
            <Row k="Role" v={a.role} /><Row k="Status" v={a.status} />
            <Row k="Aircall" v={a.aircall_enabled ? "Enabled" : "Off"} />
          </Card>
          <Card title="Identity & Splits">
            <Row k="Business Structure" v={a.business_structure} /><Row k="Trading Account No" v={a.trading_account_no} />
            <Row k="VAT Number" v={a.vat_number} />
            <Row k="Agency Split" v={a.agency_split != null ? `${a.agency_split}%` : null} />
            <Row k="Agent Split" v={a.agent_split != null ? `${a.agent_split}%` : null} />
          </Card>
        </div>
      )}

      {tab === "contact" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <Card title="Contact">
            <Row k="Business Email" v={a.email} /><Row k="Office Website" v={a.office_website} />
            <Row k="Telephone" v={a.telephone} /><Row k="Mobile" v={a.mobile} />
          </Card>
          <Card title="Address">
            <Row k="Address Line 1" v={a.address_line1} /><Row k="Address Line 2" v={a.address_line2} />
            <Row k="City / Town" v={a.city} /><Row k="County" v={a.county} /><Row k="Postcode" v={a.postcode} />
          </Card>
        </div>
      )}

      {tab === "banking" && (
        <Card title="Banking Details">
          <Row k="Bank Name" v={a.bank_name} /><Row k="Account Name" v={a.account_name} />
          <Row k="Sort Code" v={a.sort_code} /><Row k="Account No" v={a.account_no} />
        </Card>
      )}

      {tab === "compliance" && (
        <Card title="Training & Compliance">
          <Row k="Training Status" v={a.training_status} />
          <div style={{ paddingTop: 10 }}>
            <div className="sub" style={{ fontSize: 12, marginBottom: 4 }}>Additional Notes</div>
            <div style={{ fontSize: 13 }}>{a.notes || "—"}</div>
          </div>
        </Card>
      )}
    </>
  );
}
