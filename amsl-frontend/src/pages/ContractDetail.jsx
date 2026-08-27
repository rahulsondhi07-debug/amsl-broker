import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, PenLine } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Spinner, ErrorBanner } from "../components/ui.jsx";

const money = (n) => n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 });
const date = (d) => d ? new Date(d).toLocaleDateString("en-GB") : "—";
const stTone = { Projected: "#64748B", Reconciled: "#0F766E", Paid: "#0F766E", Invoiced: "#B45309", Overdue: "#E11D48", Clawback: "#E11D48" };

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#EEF1F4)", fontSize: 13 }}>
      <span className="sub">{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "—"}</span>
    </div>
  );
}

function downloadContract(c) {
  const L = [
    "AMSL BROKER — CONTRACT", "".padEnd(44, "="), "",
    `Contract No:   ${c.contract_no}`, `Business:      ${c.business_name}`,
    `Supplier:      ${c.supplier_name || "—"}`, `Utility:       ${c.utility || "—"}`,
    `MPAN/MPRN:     ${c.meter_mpan_mpr || "—"}`, `Term:          ${c.term_months || "—"} months`,
    `Consumption:   ${c.consumption ? Number(c.consumption).toLocaleString() + " kWh/yr" : "—"}`,
    `Product:       ${c.product_name || "—"}`, `Standing Chg:  ${c.standing_charge ?? "—"}p/day`,
    `Day Rate:      ${c.day_rate ?? "—"}p/kWh`, `Payment:       ${c.payment_method || "—"} (${c.billing_period || "—"})`,
    `Signatory:     ${[c.title, c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}`,
    `Email:         ${c.email || "—"}`, `Status:        ${c.status || "—"}`, "",
    `Generated:     ${new Date().toLocaleString("en-GB")}`,
  ];
  const blob = new Blob([L.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = `Contract-${c.contract_no}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function ContractDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState(null);
  const [comm, setComm] = useState(undefined); // undefined=loading, null=none
  const [tab, setTab] = useState("details");
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/contracts/${id}`).then((r) => setC(r.data)).catch((e) => setErr(e.message));
    api.commissionByContract(id).then((r) => setComm(r.data)).catch(() => setComm(null));
  }, [id]);

  if (err) return <ErrorBanner error={err} />;
  if (!c) return <Spinner />;

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ margin: 0 }}>{c.contract_no} <Badge tone="green">{c.status}</Badge></h1>
            <p className="sub" style={{ margin: 0 }}>{c.business_name} · {c.supplier_name || "—"} · {c.utility}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => alert("Send for Sign — e-signature request (wire to Zoho/Smartest).")}><PenLine size={14} /> Send for Sign</button>
          <button className="btn primary" onClick={() => downloadContract(c)}><Download size={14} /> Download Contract</button>
        </div>
      </div>

      <div className="toggle" style={{ marginBottom: 14 }}>
        <button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Contract Details</button>
        <button className={tab === "commission" ? "active" : ""} onClick={() => setTab("commission")}>Commission Schedule</button>
      </div>

      {tab === "details" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <Card title="Overview">
            <Row k="Supplier" v={c.supplier_name} /><Row k="Utility" v={c.utility} />
            <Row k="MPAN / MPRN" v={c.meter_mpan_mpr} /><Row k="Term" v={c.term_months ? `${c.term_months} months` : "—"} />
            <Row k="Agency" v={c.agency_name} /><Row k="Broker" v={c.agent_name} /><Row k="Created On" v={date(c.created_at)} />
          </Card>
          <Card title="Meter Details">
            <Row k="Meter Serial Number" v={c.meter_serial} /><Row k="Estimated Consumption" v={c.consumption ? `${Number(c.consumption).toLocaleString()} kWh` : "—"} />
            <Row k="Last Reading" v={c.current_read} /><Row k="Site Address" v={[c.address_line1, c.town, c.postcode].filter(Boolean).join(", ")} />
          </Card>
          <Card title="Business & Contact Details">
            <Row k="Business Name" v={c.business_name} /><Row k="Company Reg No" v={c.company_reg} />
            <Row k="Trading Date" v={date(c.trading_from)} /><Row k="Business Type" v={c.business_type} />
            <Row k="Name" v={[c.title, c.first_name, c.last_name].filter(Boolean).join(" ")} />
            <Row k="Email" v={c.email} /><Row k="Mobile" v={c.mobile} /><Row k="Landline" v={c.telephone} />
          </Card>
          <Card title="Plan & Pricing Details">
            <Row k="Product Name" v={c.product_name} /><Row k="New Supplier" v={c.supplier_name} />
            <Row k="Contract Term" v={c.term_months ? `${c.term_months} months` : "—"} /><Row k="Price Fixed" v={c.fixed_price_term ? `${c.fixed_price_term} months` : "—"} />
            <Row k="Payment Method" v={c.payment_method ? `${c.payment_method} (${c.billing_period || "—"})` : "—"} />
            <Row k="Standing Charge" v={c.standing_charge != null ? `${c.standing_charge}p` : "—"} />
            <Row k="Universal / Day Rate" v={c.day_rate != null ? `${c.day_rate}p` : "—"} />
            <Row k="Night Rate" v={c.night_rate != null ? `${c.night_rate}p` : "—"} />
            <Row k="Eve & Wknd Rate" v={c.ewe_rate != null ? `${c.ewe_rate}p` : "—"} />
          </Card>
          <Card title="Billing Details">
            <Row k="Billing Name" v={c.billing_same ? "Same as above" : [c.billing_title, c.billing_first_name, c.billing_last_name].filter(Boolean).join(" ")} />
            <Row k="Billing Email" v={c.billing_same ? c.email : c.billing_email} />
            <Row k="Billing Address" v={c.billing_same ? "Same as above" : [c.billing_address1, c.billing_town, c.billing_postcode].filter(Boolean).join(", ")} />
          </Card>
        </div>
      )}

      {tab === "commission" && (
        <>
          <Card title="Commission Schedule">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 24px", marginBottom: 8 }}>
              <Row k="Contract No" v={c.contract_no} /><Row k="Business" v={c.business_name} /><Row k="Supplier" v={c.supplier_name} />
              <Row k="Utility" v={c.utility} /><Row k="MPAN" v={c.meter_mpan_mpr} /><Row k="Agent" v={c.agent_name} />
            </div>
          </Card>
          {comm === undefined ? <Spinner /> : comm === null ? (
            <Card><div className="sub" style={{ textAlign: "center", padding: 20 }}>No Payments Scheduled — there are no payment schedules or history logs associated with this contract yet.</div></Card>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start", marginTop: 16 }}>
              <Card title={`Payment Schedule · gross ${money(comm.gross)}${comm.status === "Reconciled" ? " (reconciled)" : ""}`}>
                <table className="tbl">
                  <thead><tr><th>#</th><th>Due Date</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {comm.schedule.map((s) => (
                      <tr key={s.seq}><td className="mono">{s.seq}</td><td>{date(s.due_date)}</td><td className="name">{money(s.amount)}</td>
                        <td style={{ fontWeight: 700, fontSize: 12, color: stTone[s.status] || "#64748B" }}>{s.status}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card title="Multi-level Split">
                {comm.splits.map((s, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--line,#EEF1F4)" }}><span>{s.level} ({s.pct}%)</span><strong>{money(s.amount)}</strong></div>)}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingTop: 8, fontWeight: 700 }}><span>VAT</span><span>{money(comm.vat)}</span></div>
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}
