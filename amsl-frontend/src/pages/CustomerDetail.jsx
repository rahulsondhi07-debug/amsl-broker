import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Pencil, Zap, Flame } from "lucide-react";
import { api, JOURNEY_STAGES } from "../api.js";
import { Card, Spinner, ErrorBanner, initials } from "../components/ui.jsx";

const labelOf = (k) => JOURNEY_STAGES.find((s) => s.key === k)?.label || k;
const p2 = (v) => (v == null || v === "" ? "—" : `${Number(v).toFixed(2)}p`);
const num = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString());

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v ?? "—"}</span>
    </div>
  );
}

function ElecMeter({ m }) {
  const hh = m.meter_type === "HH";
  return (
    <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Zap size={15} color="#4F46E5" /> Electricity · {m.mpan_mprn}</span>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
        <Row k="Meter Type" v={m.meter_type || "—"} />
        <Row k="EAC" v={m.eac ? `${num(m.eac)} kWh` : "—"} />
        <Row k="Standing Charge" v={p2(m.standing_charge)} />
        <Row k="Unit Rate" v={p2(m.unit_rate)} />
        <Row k="Day Rate" v={p2(m.day_rate)} />
        <Row k="Night Rate" v={p2(m.night_rate)} />
        <Row k="EWE Rate" v={p2(m.ewe_rate)} />
        <Row k="Last Meter Read" v={m.last_read ? new Date(m.last_read).toLocaleDateString("en-GB") : "—"} />
        {hh && <Row k="Distribution Charge" v={p2(m.distribution_charge)} />}
        {hh && <Row k="Transmission Charge" v={p2(m.transmission_charge)} />}
      </div>
    </Card>
  );
}

function GasMeter({ m }) {
  return (
    <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Flame size={15} color="#B45309" /> Gas · {m.mpan_mprn}</span>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
        <Row k="Meter Type" v={m.meter_type || "SME"} />
        <Row k="AQ" v={m.aq ? `${num(m.aq)} kWh` : "—"} />
        <Row k="Standing Charge" v={p2(m.standing_charge)} />
        <Row k="Unit Rate" v={p2(m.unit_rate)} />
        <Row k="Last Meter Read" v={m.last_read ? new Date(m.last_read).toLocaleDateString("en-GB") : "—"} />
      </div>
    </Card>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("details");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState(null);

  const load = useCallback(() => { setErr(null); api.pipelineDetail(id).then((r) => setData(r.data)).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => { load(); }, [load]);
  const addComment = async () => { if (comment.trim()) { await api.pipelineComment(id, comment.trim()); setComment(""); load(); } };
  const toggleFreeze = async () => { await api.pipelineFreeze(id); load(); };

  if (err) return <ErrorBanner error={err} onRetry={load} />;
  if (!data) return <Spinner />;

  const meters = data.meters || [];
  const elec = meters.filter((m) => m.utility === "ELEC");
  const gas = meters.filter((m) => m.utility === "GAS");

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}><ArrowLeft size={16} /></button>
          <span className="ini" style={{ width: 44, height: 44, borderRadius: 11, background: "var(--accent-soft,#EEF2FF)", color: "var(--accent,#4F46E5)", display: "grid", placeItems: "center", fontWeight: 800 }}>{initials(data.business_name)}</span>
          <div>
            <h1 style={{ margin: 0 }}>{data.business_name}{data.frozen ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#0369A1", background: "#E0F2FE", borderRadius: 6, padding: "2px 7px", verticalAlign: "middle" }}>❄ FROZEN</span> : null}</h1>
            <p className="sub" style={{ margin: 0 }}>{data.ref} · <strong>{labelOf(data.journey_stage)}</strong></p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={toggleFreeze}>{data.frozen ? "Unfreeze" : "Freeze"}</button>
          <button className="btn primary" onClick={() => alert("Edit customer — opens the edit form (wire to your edit route).")}><Pencil size={15} /> Edit</button>
        </div>
      </div>

      <div className="toggle" style={{ marginBottom: 14 }}>
        <button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Details</button>
        <button className={tab === "utility" ? "active" : ""} onClick={() => setTab("utility")}>Utility on Site{meters.length ? ` (${meters.length})` : ""}</button>
        <button className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}>Comments{data.comments?.length ? ` (${data.comments.length})` : ""}</button>
      </div>

      {tab === "details" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <Card title="Customer Details">
            <Row k="Contact" v={data.contact_name} /><Row k="Email" v={data.contact_email} />
            <Row k="Mobile" v={data.contact_mobile} /><Row k="Fuel" v={data.fuel} />
            <Row k="Stage" v={labelOf(data.journey_stage)} />
          </Card>
          <Card title="Account & Contract">
            <Row k="Supplier" v={data.supplier_name || "—"} /><Row k="Agency" v={data.agency_name || "—"} />
            <Row k="Agent" v={data.agent_name || "—"} />
            <Row k="Contract Start" v={data.contract_start ? new Date(data.contract_start).toLocaleDateString("en-GB") : "—"} />
            <Row k="Contract End" v={data.contract_end ? new Date(data.contract_end).toLocaleDateString("en-GB") : "—"} />
          </Card>
        </div>
      )}

      {tab === "utility" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {meters.length === 0 ? <Card><div className="sub">No meters recorded for this customer yet.</div></Card> : (
            <>
              {elec.map((m) => <ElecMeter key={m.id} m={m} />)}
              {gas.map((m) => <GasMeter key={m.id} m={m} />)}
            </>
          )}
        </div>
      )}

      {tab === "comments" && (
        <Card>
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
        </Card>
      )}
    </>
  );
}
