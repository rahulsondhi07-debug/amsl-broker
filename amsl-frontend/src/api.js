const BASE = import.meta.env.VITE_API_URL || "/api";

let token = null;
try { token = localStorage.getItem("amsl_token"); } catch { /* ignore */ }

export function setToken(t) {
  token = t;
  try { t ? localStorage.setItem("amsl_token", t) : localStorage.removeItem("amsl_token"); } catch { /* ignore */ }
}

async function request(path, { method = "GET", body, params } = {}) {
  let url = BASE + path;
  if (params) {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null)
    ).toString();
    if (q) url += (path.includes("?") ? "&" : "?") + q;
  }
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  base: BASE,
  get: (p, params) => request(p, { params }),
  post: (p, body) => request(p, { method: "POST", body }),
  put: (p, body) => request(p, { method: "PUT", body }),
  del: (p) => request(p, { method: "DELETE" }),

  dashboard: (period) => request("/dashboard", { params: { period } }),
  list: (resource, params) => request(`/${resource}`, { params }),

  // auth
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),

  // energy comparison
  compare: (payload) => request("/comparison", { method: "POST", body: payload }),
};
