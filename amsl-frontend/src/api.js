const BASE = import.meta.env.VITE_API_URL || "/api";
export const API_BASE = BASE; // exported so components can build direct download links (e.g. bill files)

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
  delete: (p) => request(p, { method: "DELETE" }),
  del: (p) => request(p, { method: "DELETE" }),

  dashboard: (period) => request("/dashboard", { params: { period } }),
  dashboardStatCards: () => request("/dashboard/stat-cards"),
  dashboardEarningStats: () => request("/dashboard/earning-stats"),
  dashboardCommissionStatus: () => request("/dashboard/commission-status"),
  dashboardTopAgentPerformance: () => request("/dashboard/top-agent-performance"),
  dashboardTopAgencies: () => request("/dashboard/top-agencies"),
  dashboardRecentContractsFull: () => request("/dashboard/recent-contracts-full"),
  list: (resource, params) => request(`/${resource}`, { params }),

  // auth
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),

  // energy comparison
  compare: (payload) => request("/comparison", { method: "POST", body: payload }),

  // sales journey / pipeline
  pipelineStages: (fuel) => request("/pipeline/stages", { params: { fuel } }),
  utilityOpportunities: (params) => request("/pipeline/utility-opportunities", { params }),
  pipelineSites: (id) => request(`/pipeline/${id}/sites`),
  pipelineAddSite: (id, body) => request(`/pipeline/${id}/sites`, { method: "POST", body }),
  pipelineUpdateSite: (siteId, body) => request(`/pipeline/sites/${siteId}`, { method: "PUT", body }),
  pipelineDeleteSite: (siteId) => request(`/pipeline/sites/${siteId}`, { method: "DELETE" }),
  pipelineMeters: (id, utility) => request(`/pipeline/${id}/meters`, { params: { utility } }),
  pipelineAddMeter: (id, body) => request(`/pipeline/${id}/meters`, { method: "POST", body }),
  pipelineUpdateMeter: (meterId, body) => request(`/pipeline/meters/${meterId}`, { method: "PUT", body }),
  pipelineDeleteMeter: (meterId) => request(`/pipeline/meters/${meterId}`, { method: "DELETE" }),
  pipelineBusinessCallbacks: (id) => request(`/pipeline/${id}/callbacks`),
  pipelineQuotes: (id) => request(`/pipeline/${id}/quotes`),
  pipelineList: (params) => request("/pipeline", { params }),
  pipelineDetail: (id) => request(`/pipeline/${id}`),
  pipelineMove: (id, stage, note) => request(`/pipeline/${id}/stage`, { method: "POST", body: { stage, note } }),
  pipelineComment: (id, body) => request(`/pipeline/${id}/comments`, { method: "POST", body: { body } }),
  pipelineDisposition: (id, disposition, note) => request(`/pipeline/${id}/disposition`, { method: "POST", body: { disposition, note } }),
  pipelineContractDates: (id, body) => request(`/pipeline/${id}/contract-dates`, { method: "POST", body }),
  quotePriceHistory: (id) => request(`/quotes/${id}/price-history`),
  quoteRefreshPrice: (id) => request(`/quotes/${id}/refresh-price`, { method: "POST" }),
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
  localAreas: () => request(`/local-energy/areas`),
  localGenerators: (params) => request(`/local-energy/generators`, { params }),
  localGeneratorCreate: (body) => request(`/local-energy/generators`, { method: "POST", body }),
  localGeneratorUpdate: (id, body) => request(`/local-energy/generators/${id}`, { method: "PUT", body }),
  localGeneratorDelete: (id) => request(`/local-energy/generators/${id}`, { method: "DELETE" }),
  localDeals: (params) => request(`/local-energy/deals`, { params }),
  localDealCreate: (body) => request(`/local-energy/deals`, { method: "POST", body }),
  localDealUpdate: (id, body) => request(`/local-energy/deals/${id}`, { method: "PUT", body }),
  localDealDelete: (id) => request(`/local-energy/deals/${id}`, { method: "DELETE" }),
  disclaimer: () => request(`/disclaimer`),
  disclaimerSet: (text) => request(`/disclaimer`, { method: "PUT", body: { text } }),
  otherServicesList: (businessId) => request(`/other-services?business_id=${businessId}`),
  otherServiceCreate: (body) => request(`/other-services`, { method: "POST", body }),
  otherServiceUpdate: (id, body) => request(`/other-services/${id}`, { method: "PUT", body }),
  otherServiceDelete: (id) => request(`/other-services/${id}`, { method: "DELETE" }),
  regoOffers: (q = {}) => request(`/rego/offers?${new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== "" && v != null)))}`),
  regoOfferCreate: (body) => request(`/rego/offers`, { method: "POST", body }),
  regoOfferUpdate: (id, body) => request(`/rego/offers/${id}`, { method: "PUT", body }),
  regoOfferDelete: (id) => request(`/rego/offers/${id}`, { method: "DELETE" }),
  regoPurchases: (q = {}) => request(`/rego/purchases?${new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== "" && v != null)))}`),
  regoPurchaseCreate: (body) => request(`/rego/purchases`, { method: "POST", body }),
  regoPurchaseUpdate: (id, body) => request(`/rego/purchases/${id}`, { method: "PUT", body }),
  regoPurchaseDelete: (id) => request(`/rego/purchases/${id}`, { method: "DELETE" }),
  flexList: (q = {}) => request(`/flex?${new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== "" && v != null)))}`),
  flexCreate: (body) => request(`/flex`, { method: "POST", body }),
  flexUpdate: (id, body) => request(`/flex/${id}`, { method: "PUT", body }),
  flexDelete: (id) => request(`/flex/${id}`, { method: "DELETE" }),
  energyAssets: (businessId) => request(`/energy-assets?business_id=${businessId}`),
  energyAssetCreate: (body) => request(`/energy-assets`, { method: "POST", body }),
  energyAssetUpdate: (id, body) => request(`/energy-assets/${id}`, { method: "PUT", body }),
  energyAssetDelete: (id) => request(`/energy-assets/${id}`, { method: "DELETE" }),
  agencyPayouts: (q = {}) => request(`/agency-payouts?${new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== "" && v != null)))}`),
  agencyPayoutCreate: (body) => request(`/agency-payouts`, { method: "POST", body }),
  agencyPayoutUpdate: (id, body) => request(`/agency-payouts/${id}`, { method: "PUT", body }),
  agencyPayoutDelete: (id) => request(`/agency-payouts/${id}`, { method: "DELETE" }),
  tutorials: () => request(`/platform/tutorials`),
  tutorialAdd: (t) => request(`/platform/tutorials`, { method: "POST", body: t }),
  tutorialDelete: (id) => request(`/platform/tutorials/${id}`, { method: "DELETE" }),
  configLookups: () => request(`/platform/config`),
  configAdd: (category, value) => request(`/platform/config`, { method: "POST", body: { category, value } }),
  configUpdate: (id, value) => request(`/platform/config/${id}`, { method: "PATCH", body: { value } }),
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
  billValidationList: () => request(`/bill-validation`),
  billValidationPreview: (body) => request(`/bill-validation/preview`, { method: "POST", body }),
  billValidationCreate: (body) => request(`/bill-validation`, { method: "POST", body }),
  billValidationRaiseClaim: (id) => request(`/bill-validation/${id}/raise-claim`, { method: "POST" }),
  billValidationDelete: (id) => request(`/bill-validation/${id}`, { method: "DELETE" }),
  billValidationLoa: (id) => request(`/bill-validation/${id}/loa`),
  billValidationSendLoa: (id, body) => request(`/bill-validation/${id}/send-loa`, { method: "POST", body }),
  billValidationRaiseQuery: (id, body) => request(`/bill-validation/${id}/raise-query`, { method: "POST", body }),
  billValidationResolveQuery: (id, body) => request(`/bill-validation/${id}/resolve-query`, { method: "POST", body }),
  billValidationSicLookup: (code) => request(`/bill-validation/sic-lookup`, { params: { code } }),
  billValidationSchoolEligibility: (body) => request(`/bill-validation/school-ccl-eligibility`, { method: "POST", body }),
  billValidationCcaRates: () => request(`/bill-validation/cca-relief-rates`),
  billValidationClaimStages: () => request(`/bill-validation/claim-stages`),
  billValidationSetStage: (id, body) => request(`/bill-validation/${id}/set-stage`, { method: "POST", body }),
  billValidationEiiBusinessTest: (body) => request(`/bill-validation/eii-business-test`, { method: "POST", body }),
  billValidationGovLinks: () => request(`/bill-validation/gov-links`),
  billValidationUploadBill: (id, fileName) => request(`/bill-validation/${id}/upload-bill`, { method: "POST", body: { file_name: fileName } }),
  billValidationGeneratePp11: (id, body) => request(`/bill-validation/${id}/generate-pp11`, { method: "POST", body }),
  billValidationGeneratePp11Batch: (body) => request(`/bill-validation/generate-pp11-batch`, { method: "POST", body }),
  billValidationGenerateEiiSummary: (id, body) => request(`/bill-validation/${id}/generate-eii-summary`, { method: "POST", body }),
  billValidationActivities: () => request(`/bill-validation/qualifying-activities`),
  eiiCertificatesList: () => request(`/eii-certificates`),
  eiiCertificateCreate: (body) => request(`/eii-certificates`, { method: "POST", body }),
  eiiCertificateDelete: (id) => request(`/eii-certificates/${id}`, { method: "DELETE" }),
  eiiCertificateMatch: (msid, date) => request(`/eii-certificates/match`, { params: { msid, date } }),
  productPriceMatrix: (id) => request(`/products/${id}/price-matrix`),
  productPriceMatrixAdd: (id, row) => request(`/products/${id}/price-matrix`, { method: "POST", body: row }),
  productPriceMatrixBulkImport: (id, rows) => request(`/products/${id}/price-matrix/bulk`, { method: "POST", body: { rows } }),
  productPriceMatrixClear: (id) => request(`/products/${id}/price-matrix`, { method: "DELETE" }),
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
  { key: "OBJECTED", label: "Objected", group: "Other" },
  { key: "REJECTED", label: "Rejected", group: "Other" },
  { key: "LOST", label: "Lost", group: "Other" },
  { key: "UP_FOR_RENEWAL", label: "Up for Renewal", group: "Other" },
  { key: "RENEWED", label: "Renewed", group: "Other" },
];
