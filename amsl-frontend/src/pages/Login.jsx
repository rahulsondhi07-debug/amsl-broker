import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../components/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("admin@brokerportal.com");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr(null);
    try {
      await login(email.trim(), password);
      nav(loc.state?.from || "/", { replace: true });
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "linear-gradient(120deg,#eef2ff,#f1f5f9)" }}>
      <form onSubmit={submit} className="card" style={{ width: 380, padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--grad)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, margin: "0 auto 12px" }}>AB</div>
          <h2 style={{ fontSize: 20 }}>AMSL Broker</h2>
          <div style={{ color: "var(--slate-400)", fontSize: 13, marginTop: 2 }}>Sign in to the broker portal</div>
        </div>

        {err && <div className="error-banner" style={{ marginBottom: 14 }}>{err}</div>}

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
        </div>
        <div className="field" style={{ marginBottom: 18 }}>
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
          <LogIn size={16} /> {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ marginTop: 16, padding: 12, background: "var(--slate-50)", borderRadius: 10, fontSize: 12, color: "var(--slate-500)" }}>
          <b>Demo accounts</b>
          <div style={{ marginTop: 4 }}>admin@brokerportal.com · admin123 <span className="badge indigo">Admin</span></div>
          <div style={{ marginTop: 2 }}>lawrence.nadar@azentratech.com · changeme <span className="badge slate">Super User</span></div>
        </div>
      </form>
    </div>
  );
}
