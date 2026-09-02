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

  // sales journey / pipeline
  pipelineStages: (fuel) => request("/pipeline/stages", { params: { fuel } }),
  pipelineList: (params) => request("/pipeline", { params }),
  pipelineDetail: (id) => request(`/pipeline/${id}`),
  pipelineMove: (id, stage, note) => request(`/pipeline/${id}/stage`, { method: "POST", body: { stage, note } }),
  pipelineComment: (id, body) => request(`/pipeline/${id}/comments`, { method: "POST", body: { body } }),
  pipelineDisposition: (id, disposition, note) => request(`/pipeline/${id}/disposition`, { method: "POST", body: { disposition, note } }),
  pipelineCallback: (id, due_at, reason) => request(`/pipeline/${id}/callback`, { method: "POST", body: { due_at, reason } }),
  pipelineRunAutomations: () => request(`/pipeline/automations/run`, { method: "POST" }),
  pipelineNotifications: () => request(`/pipeline/notifications`),
  pipelineNotificationSeen: (nid) => request(`/pipeline/notifications/${nid}/seen`, { method: "POST" }),
  importLeads: (rows) => request(`/leads/import`, { method: "POST", body: { rows } }),
  permissions: () => request(`/permissions`),
  permissionsEffective: (role) => request(`/permissions/effective`, { params: { role } }),
  permissionsSet: (role, menus) => request(`/permissions/${encodeURIComponent(role)}`, { method: "PUT", body: { menus } }),
  pipelineCallbacksUpcoming: () => request(`/pipeline/callbacks/upcoming`),
  pipelineCallbackDone: (cid) => request(`/pipeline/callbacks/${cid}/done`, { method: "POST" }),
  pipelineFreeze: (id) => request(`/pipeline/${id}/freeze`, { method: "POST" }),
  dailyReminders: () => request(`/pipeline/reminders/daily`),
  branding: () => request(`/branding`),
  brandingSet: (b) => request(`/branding`, { method: "PUT", body: b }),
  tutorials: () => request(`/platform/tutorials`),
  tutorialAdd: (t) => request(`/platform/tutorials`, { method: "POST", body: t }),
  tutorialDelete: (id) => request(`/platform/tutorials/${id}`, { method: "DELETE" }),
  configLookups: () => request(`/platform/config`),
  configAdd: (category, value) => request(`/platform/config`, { method: "POST", body: { category, value } }),
  configDelete: (id) => request(`/platform/config/${id}`, { method: "DELETE" }),
  commissionSummary: () => request(`/platform/commission/summary`),
  commissionRecords: () => request(`/commission`),
  commissionGenerate: () => request(`/commission/generate`, { method: "POST" }),
  commissionReconcile: (id, aac) => request(`/commission/${id}/reconcile`, { method: "POST", body: { aac } }),
  commissionClawback: (id, reason) => request(`/commission/${id}/clawback`, { method: "POST", body: { reason } }),
  commissionLedger: () => request(`/commission/ledger`),
  commissionStatements: () => request(`/commission/statements`),
  commissionImportStatement: (lines, filename, supplier_id) => request(`/commission/statements/import`, { method: "POST", body: { lines, filename, supplier_id } }),
  commissionByContract: (cid) => request(`/commission/by-contract/${cid}`),
  billValidationPreview: (body) => request(`/bill-validation/preview`, { method: "POST", body }),
  billValidationRaiseClaim: (id) => request(`/bill-validation/${id}/raise-claim`, { method: "POST" }),
  productPriceMatrix: (id) => request(`/products/${id}/price-matrix`),
  productPriceMatrixAdd: (id, row) => request(`/products/${id}/price-matrix`, { method: "POST", body: row }),
  upliftCaps: () => request(`/uplift-caps`),
  upliftValidate: (utility, consumption, uplift) => request(`/uplift-caps/validate`, { method: "POST", body: { utility, consumption, uplift } }),
};

// Stage metadata for the UI (mirrors backend JOURNEY_STAGES)
export const JOURNEY_STAGES = [
  { key: "RAW_LEAD", label: "Raw Lead", group: "Lead" },
  { key: "QUALIFIED", label: "Qualified", group: "Lead" },
  { key: "QUOTE_CREATED", label: "Quote Created", group: "Prospect" },
  { key: "QUOTED", label: "Quoted", group: "Prospect" },
  { key: "ESIGN_SENT", label: "E-Sign Contract Sent", group: "Prospect" },
  { key: "WON", label: "Won", group: "Contract" },
  { key: "UNDER_REGISTRATION", label: "Under Registration", group: "Contract" },
  { key: "LIVE", label: "Live", group: "Contract" },
  { key: "OBJECTED", label: "Objected / Rejected", group: "Other" },
  { key: "LOST", label: "Lost", group: "Other" },
  { key: "UP_FOR_RENEWAL", label: "Up for Renewal", group: "Other" },
  { key: "RENEWED", label: "Renewed", group: "Other" },
];
