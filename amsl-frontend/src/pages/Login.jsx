import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../components/AuthContext.jsx";
import { api } from "../api.js";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState(null);
  useEffect(() => { api.branding().then((r) => setBrand(r.data)).catch(() => {}); }, []);

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
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--grad)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, margin: "0 auto 12px", overflow: "hidden" }}>
            {brand?.logo_url
              ? <img src={brand.logo_url} alt={brand.brand_name || "logo"} style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; }} />
              : (brand?.brand_name || "AB").slice(0, 2).toUpperCase()}
          </div>
          <h2 style={{ fontSize: 20 }}>{brand?.brand_name || "Utility Live"}</h2>
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
      </form>
    </div>
  );
}
