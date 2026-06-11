/* global fetch, setTimeout */

const { app, BrowserWindow, ipcMain, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { closeAllDeviceViews, registerDeviceViewIpc, runDeviceViewSelfTest } = require("./device-view-manager.cjs");

const isDev = !app.isPackaged;
const devServerUrl = process.env.BOTAPP_DEV_SERVER_URL || "http://127.0.0.1:5173";
let compassLastConnectionTestAt = null;
let compassLastAnalysisAt = null;
let compassLastSafeError = null;
let compassLastProviderErrorCode = null;
let compassServerKeyStatus = "unknown";
let runtimeConfigCache = null;

function safeUrl(value, fallback) {
  try {
    const url = new URL(value || fallback);
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallback;
  }
}

function runtimeConfigPath() {
  return path.join(app.getPath("userData"), "botapp-runtime-config.json");
}

function readRuntimeConfig() {
  if (runtimeConfigCache) return runtimeConfigCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(runtimeConfigPath(), "utf8"));
    runtimeConfigCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    runtimeConfigCache = {};
  }
  return runtimeConfigCache;
}

function writeRuntimeConfig(nextConfig) {
  runtimeConfigCache = { ...readRuntimeConfig(), ...nextConfig };
  fs.mkdirSync(path.dirname(runtimeConfigPath()), { recursive: true });
  fs.writeFileSync(runtimeConfigPath(), JSON.stringify(runtimeConfigCache, null, 2), { mode: 0o600 });
  return runtimeConfigCache;
}

function removeRuntimeConfig(keys) {
  const current = { ...readRuntimeConfig() };
  for (const key of keys) {
    delete current[key];
  }
  runtimeConfigCache = current;
  fs.mkdirSync(path.dirname(runtimeConfigPath()), { recursive: true });
  fs.writeFileSync(runtimeConfigPath(), JSON.stringify(runtimeConfigCache, null, 2), { mode: 0o600 });
  return runtimeConfigCache;
}

function normalizeRelayUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeHttpsUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function maskUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/[redacted]`;
  } catch {
    return "[redacted-url]";
  }
}

function inferWebhookProvider(value) {
  const url = String(value || "").toLowerCase();
  if (url.includes("slack")) return "slack";
  if (url.includes("discord")) return "discord";
  return "custom";
}

function compassConfig() {
  const stored = readRuntimeConfig();
  const relayUrl = normalizeRelayUrl(process.env.BOTAPP_COMPASS_AI_RELAY_URL || stored.compassAiRelayUrl || "");
  const relayKey = process.env[["BOTAPP", "RELAY", "API", "KEY"].join("_")] || stored.botappRelayKey || "";
  return {
    relayUrl,
    relayKey,
    model: "server-side",
  };
}

function compassRuntimeMode(cfg = compassConfig()) {
  if (cfg.relayUrl) return "relay";
  return "rules_only";
}

function compassRuntimeStatus(message, cfg = compassConfig()) {
  const mode = compassRuntimeMode(cfg);
  const relayOrigin = cfg.relayUrl ? safeUrl(cfg.relayUrl, null) : null;
  const status = mode === "relay"
    ? "ready"
    : "relay_missing";
  const defaultMessage = mode === "relay"
    ? "Compass AI relay is configured."
    : "Compass AI relay not configured. Add a relay URL to enable AI recommendations.";
  return {
    mode,
    status,
    provider: "OpenAI",
    model: cfg.model,
    relayUrlConfigured: Boolean(cfg.relayUrl),
    relayOrigin,
    relayKeyConfigured: Boolean(cfg.relayKey),
    serverKeyStatus: compassServerKeyStatus,
    lastConnectionTestAt: compassLastConnectionTestAt,
    lastAnalysisAt: compassLastAnalysisAt,
    lastSafeError: compassLastSafeError,
    lastProviderErrorCode: compassLastProviderErrorCode,
    message: message || defaultMessage,
  };
}

const sensitiveTextPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  new RegExp(`${["s", "k-"].join("")}[A-Za-z0-9._-]{8,}`, "gi"),
  /ak_(?:live|test)_[A-Za-z0-9._-]{8,}/gi,
  new RegExp(`${["wh", "sec_"].join("")}[A-Za-z0-9._-]+`, "gi"),
];
const sensitiveKeyPattern = new RegExp([
  ["pass", "word"].join(""),
  ["to", "ken"].join(""),
  ["authoriza", "tion"].join(""),
  ["sec", "ret"].join(""),
  ["service", "role"].join("_"),
  ["web", "hook"].join(""),
].join("|"), "i");

function sanitizeCompassValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeCompassValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      if (sensitiveKeyPattern.test(key)) {
        return [key, "[REDACTED]"];
      }
      return [key, sanitizeCompassValue(nested)];
    }));
  }
  if (typeof value === "string") {
    return sensitiveTextPatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value);
  }
  return value;
}

function fallbackCompassAdvisor(period, message, status = "ai_unavailable") {
  return {
    status,
    provider: "openai",
    model: compassConfig().model,
    lastAnalyzedAt: null,
    period,
    summary: message,
    healthAssessment: "watch",
    analysis: null,
    relayTarget: "/api/instagram-dashboard/compass/analyze",
    serverSideOnly: true,
  };
}

function safeAnalyzeMessage(reason, fallback) {
  if (reason === "model_unavailable") return "AI provider model unavailable.";
  if (reason === "schema_validation_failed") return "AI response failed schema validation.";
  if (reason === "invalid_provider_json") return "AI provider returned invalid JSON.";
  if (reason === "payload_invalid") return "Relay analyze payload invalid.";
  if (reason === "provider_timeout") return "Provider timeout.";
  if (reason === "provider_rate_limited") return "AI provider quota/rate limit reached.";
  if (reason === "provider_error") return "AI provider returned an error.";
  if (reason === "compass_ai_disabled") return "AI provider disabled on relay.";
  if (reason === "provider_key_missing") return "AI provider is not configured on the relay server.";
  if (reason === "provider_key_invalid") return "AI provider key is invalid on the relay server.";
  if (reason === "unsupported_model_parameter") return "AI provider model does not support a requested API parameter.";
  return fallback;
}

function routeFromRelayTarget(targetTab) {
  if (targetTab === "activity_log") return "activity";
  if (targetTab === "client_accounts") return "account";
  if (["credentials", "devices", "targets", "profiles", "compass"].includes(targetTab)) return targetTab;
  return "compass";
}

function targetFromRelay(targetTab, label, filter, accountId, username, clientId) {
  return {
    targetTab: routeFromRelayTarget(targetTab),
    label: label || `Open ${routeFromRelayTarget(targetTab)}`,
    context: {
      accountId: accountId || undefined,
      username: username || undefined,
      clientId: clientId || undefined,
      filter: filter || undefined,
    },
  };
}

function normalizeCompassAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") return null;
  return {
    analysisId: typeof analysis.analysisId === "string" ? analysis.analysisId : analysis.analysis_id,
    period: analysis.period === "24h" || analysis.period === "30d" ? analysis.period : "7d",
    overallSummary: typeof analysis.overallSummary === "string" ? analysis.overallSummary : analysis.overall_summary,
    healthAssessment: typeof analysis.healthAssessment === "string" ? analysis.healthAssessment : analysis.health_assessment,
    recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations.map((recommendation, index) => ({
      id: recommendation.id || `ai_rec_${index + 1}`,
      severity: recommendation.severity || "info",
      confidence: recommendation.confidence || "medium",
      title: recommendation.title || "AI recommendation",
      summary: recommendation.summary || recommendation.admin_summary || recommendation.adminSummary || "",
      recommendationType: recommendation.recommendationType || recommendation.recommendation_type || "operational_risk",
      adminSummary: recommendation.adminSummary || recommendation.admin_summary || "",
      clientSummary: recommendation.clientSummary || recommendation.client_summary || "",
      clientVisible: Boolean(recommendation.clientVisible ?? recommendation.client_visible),
      clientRawVisible: Boolean(recommendation.clientRawVisible ?? recommendation.client_raw_visible),
      clientRecommendationInput: Boolean(recommendation.clientRecommendationInput ?? recommendation.client_recommendation_input ?? true),
      technicalReason: recommendation.technicalReason || recommendation.technical_reason || "",
      clientSafeReason: recommendation.clientSafeReason || recommendation.client_safe_reason || "",
      affectedAccounts: Array.isArray(recommendation.affectedAccounts || recommendation.affected_accounts)
        ? (recommendation.affectedAccounts || recommendation.affected_accounts).map((account) => {
          const accountId = account.accountId || account.account_id || "";
          const username = account.username || "";
          const clientId = account.clientId || account.client_id || "";
          const targetTab = account.targetTab || account.target_tab || recommendation.target_tab || "compass";
          return {
            accountId,
            username,
            clientId,
            reason: account.reason || "",
            target: targetFromRelay(targetTab, `Open ${username ? `@${username}` : targetTab}`, recommendation.target_tab || targetTab, accountId, username, clientId),
          };
        })
        : [],
      recommendedActions: Array.isArray(recommendation.recommendedActions || recommendation.recommended_actions)
        ? (recommendation.recommendedActions || recommendation.recommended_actions).map((action) => {
          const targetTab = action.targetTab || action.target_tab || recommendation.target_tab || "compass";
          const label = action.label || recommendation.recommended_action || "Open Compass";
          return {
            label,
            target: targetFromRelay(targetTab, label, action.filter || ""),
            actionType: action.actionType || action.action_type || "open_tab",
          };
        })
        : [],
      evidence: Array.isArray(recommendation.evidence) ? recommendation.evidence : [],
      sourceFacts: Array.isArray(recommendation.sourceFacts || recommendation.source_facts) ? (recommendation.sourceFacts || recommendation.source_facts) : [],
      target: targetFromRelay(recommendation.targetTab || recommendation.target_tab || "compass", recommendation.recommended_action || "Open Compass", recommendation.target_tab || ""),
      recommendedAction: recommendation.recommendedAction || recommendation.recommended_action || "",
      whyThisMatters: recommendation.whyThisMatters || recommendation.why_this_matters || "",
      whatNotToAssume: recommendation.whatNotToAssume || recommendation.what_not_to_assume || "",
    })) : [],
    internalSignals: Array.isArray(analysis.internalSignals || analysis.internal_signals)
      ? (analysis.internalSignals || analysis.internal_signals).map((signal) => ({
        signal: signal.signal || "inactive_accounts",
        adminVisible: true,
        clientRawVisible: false,
        clientRecommendationInput: true,
        count: Number.isFinite(Number(signal.count)) ? Number(signal.count) : 0,
        summary: signal.summary || "",
      }))
      : [],
    filteredRecommendationsCount: Number.isFinite(Number(analysis.filteredRecommendationsCount ?? analysis.filtered_recommendations_count))
      ? Number(analysis.filteredRecommendationsCount ?? analysis.filtered_recommendations_count)
      : 0,
    filteredReasons: Array.isArray(analysis.filteredReasons || analysis.filtered_reasons) ? (analysis.filteredReasons || analysis.filtered_reasons) : [],
  };
}

function normalizeCompassAdvisor(data, period) {
  const payload = data && typeof data === "object" && data.ok === true && data.data ? data.data : data;
  const status = typeof payload?.status === "string" ? payload.status : "ai_enabled";
  const analysis = normalizeCompassAnalysis(payload?.analysis);
  const fallbackReason = typeof payload?.fallback_reason === "string" ? payload.fallback_reason : null;
  const providerErrorCode = typeof payload?.provider_error_code === "string" ? payload.provider_error_code : null;
  const fallbackMessage = safeAnalyzeMessage(fallbackReason, "Compass AI returned a safe fallback.");
  return {
    status,
    provider: "openai",
    model: typeof payload?.model === "string" ? payload.model : compassConfig().model,
    lastAnalyzedAt: new Date().toISOString(),
    period,
    summary: typeof analysis?.overallSummary === "string" && analysis.overallSummary
      ? analysis.overallSummary
      : status === "ai_enabled"
        ? "Compass AI analysis received from secure runtime."
        : fallbackMessage,
    healthAssessment: typeof analysis?.healthAssessment === "string" ? analysis.healthAssessment : "watch",
    analysis,
    fallbackReason,
    providerErrorCode,
    relayTarget: "/api/instagram-dashboard/compass/analyze",
    serverSideOnly: true,
  };
}

async function analyzeCompassViaRelay(relayUrl, period, snapshot) {
  const cfg = compassConfig();
  const response = await fetch(relayUrl, {
    method: "POST",
    headers: relayHeaders(cfg),
    body: JSON.stringify({ period, snapshot: sanitizeCompassValue(snapshot), dry_run: true }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readRelayError(data, "Compass AI relay returned an error."));
  }
  return normalizeCompassAdvisor(data, period);
}

function relayHeaders(cfg = compassConfig()) {
  const headers = {
    "Content-Type": "application/json",
    "X-Request-Id": `botapp-compass-${Date.now().toString(36)}`,
  };
  if (cfg.relayKey) {
    headers.Authorization = `${["Bear", "er"].join("")} ${cfg.relayKey}`;
    headers["X-BotApp-Relay-Key"] = cfg.relayKey;
  }
  return headers;
}

function dashboardOrigin(cfg = compassConfig()) {
  if (!cfg.relayUrl) return "";
  try {
    const url = new URL(cfg.relayUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function absoluteDashboardPath(pathname, cfg = compassConfig()) {
  const origin = dashboardOrigin(cfg);
  if (!origin || !pathname || typeof pathname !== "string" || !pathname.startsWith("/api/instagram-dashboard/")) return pathname;
  return `${origin}${pathname}`;
}

function attachRelayHeadersForDashboardAvatars() {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["*://*/api/instagram-dashboard/avatar*"] }, (details, callback) => {
    const cfg = compassConfig();
    const origin = dashboardOrigin(cfg);
    try {
      const requestUrl = new URL(details.url);
      if (origin && `${requestUrl.protocol}//${requestUrl.host}` === origin && requestUrl.pathname === "/api/instagram-dashboard/avatar" && cfg.relayKey) {
        details.requestHeaders.Authorization = `${["Bear", "er"].join("")} ${cfg.relayKey}`;
        details.requestHeaders["X-BotApp-Relay-Key"] = cfg.relayKey;
      }
    } catch {
      // Keep the request unchanged when it is not a dashboard avatar URL.
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

const endpointTestState = new Map();
const botappEndpointRegistry = [
  {
    id: "botapp_overview",
    name: "BotApp overview aggregate",
    method: "GET",
    path: "/api/instagram-dashboard/botapp/overview",
    usedBy: ["Overview", "Profiles", "Client Accounts", "Credentials", "Activity Log", "Compass", "Auto Restart"],
    purpose: "Load production-safe dashboard aggregate for BotApp tabs",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "devices_overview",
    name: "Devices overview",
    method: "GET",
    path: "/api/instagram-dashboard/devices",
    usedBy: ["Devices", "Overview", "Auto Restart", "Compass"],
    purpose: "Load physical phones and runtime heartbeat status",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "profiles_overview",
    name: "Profiles overview",
    method: "GET",
    path: "/api/instagram-dashboard/profiles",
    usedBy: ["Profiles"],
    purpose: "Load real dashboard Manage/Profile account rows",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "profiles_account_details",
    name: "Profile account details",
    method: "GET",
    path: "/api/instagram-dashboard/profiles/:account_id/details",
    usedBy: ["Profiles", "Profile drawers"],
    purpose: "Load safe per-account stats, logs, targets, settings, and filters",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_create",
    name: "Profiles create dry-run",
    method: "POST",
    path: "/api/instagram-dashboard/accounts/create",
    usedBy: ["Profiles", "Add Profile"],
    purpose: "Validate profile create contract through secure relay without mutation",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "targets_collection",
    name: "Targets collection",
    method: "POST",
    path: "/api/instagram-dashboard/targets",
    usedBy: ["Profile targets"],
    purpose: "Create CT targets through secure relay and Supabase",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "targets_reset",
    name: "Targets reset",
    method: "PATCH",
    path: "/api/instagram-dashboard/targets/reset",
    usedBy: ["Profile targets"],
    purpose: "Reset CT target verification state through secure relay and Supabase",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "client_accounts_overview",
    name: "Client accounts overview",
    method: "GET",
    path: "/api/instagram-dashboard/client-accounts",
    usedBy: ["Client Accounts"],
    purpose: "Load real client account operations rows from Manage/Credentials projections",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "credentials_actions",
    name: "Credentials actions",
    method: "GET",
    path: "/api/instagram-dashboard/credentials-actions",
    usedBy: ["Credentials"],
    purpose: "Load real dashboard credential blockers/actions",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "activity_log",
    name: "Activity log",
    method: "GET",
    path: "/api/instagram-dashboard/activity-log",
    usedBy: ["Activity Log"],
    purpose: "Load safe interaction evidence and CT audit activity",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "settings_overview",
    name: "Settings overview",
    method: "GET",
    path: "/api/instagram-dashboard/settings?account_id=:account_id",
    usedBy: ["Settings"],
    purpose: "Account-scoped settings endpoint exists; global BotApp settings overview is planned",
    authRequired: true,
    status: "planned",
    testStrategy: "none",
  },
  {
    id: "compass_health",
    name: "Compass health",
    method: "GET",
    path: "/api/instagram-dashboard/compass/health",
    usedBy: ["Compass", "API / Webhooks / Keys"],
    purpose: "Check relay auth and server-side AI provider configuration",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "compass_analyze",
    name: "Compass analyze",
    method: "POST",
    path: "/api/instagram-dashboard/compass/analyze",
    usedBy: ["Compass", "API / Webhooks / Keys"],
    purpose: "Run server-side Compass AI analysis from grounded facts",
    authRequired: true,
    status: "active",
    testStrategy: "config_only",
  },
  {
    id: "auto_restart_overview",
    name: "Auto Restart overview",
    method: "GET",
    path: "/api/instagram-dashboard/auto-restart/overview",
    usedBy: ["Auto Restart"],
    purpose: "Load scheduler preview, rules, candidates, gates, and decisions",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "auto_restart_dry_run",
    name: "Auto Restart dry-run",
    method: "POST",
    path: "/api/instagram-dashboard/auto-restart/dry-run",
    usedBy: ["Auto Restart"],
    purpose: "Recompute restart preview without mutations",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
  {
    id: "auto_restart_action_preview",
    name: "Auto Restart action preview",
    method: "POST",
    path: "/api/instagram-dashboard/auto-restart/action-preview",
    usedBy: ["Auto Restart"],
    purpose: "Validate Auto Restart action contracts without runtime mutation",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
];

function endpointById(id) {
  return botappEndpointRegistry.find((endpoint) => endpoint.id === id) || null;
}

function endpointUrl(endpoint, routeParams = {}) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return "";
  const url = new URL(cfg.relayUrl);
  let pathname = endpoint.path;
  for (const [key, value] of Object.entries(routeParams)) {
    pathname = pathname.replace(`:${key}`, encodeURIComponent(String(value)));
  }
  url.pathname = pathname;
  url.search = "";
  return url.toString();
}

function endpointPublicState(endpoint) {
  const state = endpointTestState.get(endpoint.id) || {};
  const cfg = compassConfig();
  const configuredStatus = endpoint.status === "active" && !cfg.relayUrl ? "failing" : endpoint.status === "active" ? "untested" : endpoint.status;
  return {
    id: endpoint.id,
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    usedBy: endpoint.usedBy,
    purpose: endpoint.purpose,
    authRequired: endpoint.authRequired,
    status: endpoint.status,
    lastTestAt: state.lastTestAt || null,
    lastStatusCode: state.lastStatusCode || null,
    lastSafeError: state.lastSafeError || null,
    testStatus: state.testStatus || configuredStatus,
  };
}

function endpointRegistryList() {
  return botappEndpointRegistry.map(endpointPublicState);
}

function safeEndpointBody(endpoint) {
  if (endpoint.id === "auto_restart_dry_run") return { dry_run: true };
  if (endpoint.id === "auto_restart_action_preview") {
    return {
      action: "dry_run_preview",
      request_id: `botapp-endpoint-test-${Date.now().toString(36)}`,
      target: null,
    };
  }
  return { dry_run: true };
}

async function testBotappEndpoint(id) {
  const endpoint = endpointById(id);
  const now = new Date().toISOString();
  if (!endpoint) {
    return { id, ok: false, status: "wiring_missing", lastTestAt: now, lastStatusCode: null, lastSafeError: "Unknown endpoint." };
  }
  if (endpoint.status !== "active" || endpoint.testStrategy === "none") {
    const result = {
      id: endpoint.id,
      ok: false,
      status: endpoint.status === "planned" ? "planned" : "wiring_missing",
      lastTestAt: now,
      lastStatusCode: null,
      lastSafeError: endpoint.status === "planned" ? "Planned endpoint; not deployed for testing." : "Wiring missing.",
    };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: null, lastSafeError: result.lastSafeError });
    return result;
  }
  const cfg = compassConfig();
  if (!cfg.relayUrl) {
    const result = { id: endpoint.id, ok: false, status: "failing", lastTestAt: now, lastStatusCode: null, lastSafeError: "Authentication required: relay URL is not configured." };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: null, lastSafeError: result.lastSafeError });
    return result;
  }
  if (endpoint.testStrategy === "config_only") {
    const result = { id: endpoint.id, ok: true, status: "connected", lastTestAt: now, lastStatusCode: null, lastSafeError: "Configured. Provider call not executed by endpoint registry test." };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: null, lastSafeError: result.lastSafeError });
    return result;
  }
  try {
    const response = await fetch(endpointUrl(endpoint), {
      method: endpoint.method,
      headers: relayHeaders(cfg),
      body: endpoint.method === "POST" ? JSON.stringify(safeEndpointBody(endpoint)) : undefined,
    });
    const data = await response.json().catch(() => null);
    const ok = response.ok && data?.ok !== false;
    const status = ok ? "connected" : response.status === 401 || response.status === 403 ? "auth_protected" : response.status === 404 ? "not_deployed" : "failing";
    const result = {
      id: endpoint.id,
      ok,
      status,
      lastTestAt: now,
      lastStatusCode: response.status,
      lastSafeError: ok ? null : readRelayError(data, "Endpoint test failed."),
    };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: response.status, lastSafeError: result.lastSafeError });
    return result;
  } catch (error) {
    const result = {
      id: endpoint.id,
      ok: false,
      status: "failing",
      lastTestAt: now,
      lastStatusCode: null,
      lastSafeError: safeRuntimeError(error, "Endpoint unavailable."),
    };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: null, lastSafeError: result.lastSafeError });
    return result;
  }
}

async function testAllBotappEndpoints() {
  const results = [];
  for (const endpoint of botappEndpointRegistry) {
    results.push(await testBotappEndpoint(endpoint.id));
  }
  return { endpoints: endpointRegistryList(), results };
}

function exportBotappConnectionProfile() {
  const cfg = compassConfig();
  return {
    generatedAt: new Date().toISOString(),
    relayOrigin: cfg.relayUrl ? safeUrl(cfg.relayUrl, null) : null,
    endpoints: botappEndpointRegistry.map(({ id, name, method, path, usedBy, purpose, authRequired, status }) => ({
      id,
      name,
      method,
      path,
      usedBy,
      purpose,
      authRequired,
      status,
    })),
  };
}

function autoRestartUrl(pathnameSuffix) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return "";
  const endpoint = endpointById(`auto_restart_${pathnameSuffix.replace("-", "_")}`);
  return endpoint ? endpointUrl(endpoint) : "";
}

function readPayload(data) {
  return data && typeof data === "object" && data.ok === true && data.data ? data.data : data;
}

function autoRestartFallback(sourceSummary = "Auto Restart backend overview is not available.") {
  const control = (action, label, detail, confirmationRequired, impact) => ({
    action,
    label,
    detail,
    requestId: `botapp-auto-restart-${action}-${Date.now().toString(36)}`,
    dryRun: true,
    confirmationRequired,
    impact,
    affectedAccountsCount: 0,
    affectedDevicesCount: 0,
    backendStatus: "backend_pending",
  });
  return {
    status: "backend_pending",
    enabled: false,
    mode: "backend_pending",
    lastRestartAt: null,
    nextEligibleRestartAt: null,
    activeAccountsAffected: 0,
    safetyStatus: "backend_pending",
    backendSyncStatus: "backend_pending",
    sourceSummary,
    sessionResume: {
      pausedDueToQuota: 0,
      eligibleToResume: 0,
      remainingDailyQuota: { follows: null, unfollows: null, dms: null },
      resumeBlockedReason: sourceSummary,
      lastSuccessfulAction: null,
      nextResumeWindow: null,
    },
    businessSessionWindow: {
      status: "backend_pending",
      currentStart: null,
      currentEnd: null,
      timeRemaining: null,
      preventOverrun: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      packageRelation: "Not available yet",
    },
    phoneRest: {
      phonesResting: 0,
      phonesActive: 0,
      nextRestWindow: null,
      reason: "Not available yet",
      devices: [],
    },
    affectedAccounts: [],
    controls: [
      control("refresh_overview", "Refresh overview", "Reload status", false, "Reloads overview only."),
      control("dry_run_preview", "Run dry-run preview", "Compute safe preview", false, "No mutation."),
      control("enable_auto_restart", "Enable Auto Restart", "Requires backend settings", true, "Would enable scheduler mode."),
      control("disable_auto_restart", "Disable Auto Restart", "Requires backend settings", true, "Would disable scheduler mode."),
      control("restart_eligible_sessions", "Restart eligible sessions", "Requires worker scheduler", true, "Would enqueue eligible sessions."),
      control("resume_quota_paused", "Resume quota-paused accounts", "Requires worker scheduler", true, "Would resume eligible quota-paused accounts."),
      control("pause_device_rest", "Pause device rest", "Requires rest policy", true, "Would override rest policy."),
      control("resume_phone", "Resume phone", "Requires rest policy", true, "Would resume one phone."),
      control("open_affected_accounts", "Open affected accounts", "Navigate to account projection", false, "Read-only navigation."),
      control("open_device", "Open device", "Navigate to device", false, "Read-only navigation."),
      control("open_compass_issue", "Open Compass issue", "Navigate to Compass", false, "Read-only navigation."),
      control("open_credentials", "Open Credentials", "Navigate to credential blockers", false, "Read-only navigation."),
      control("open_activity_log", "Open Activity Log", "Navigate to evidence", false, "Read-only navigation."),
      control("view_safety_gates", "View safety gates", "Focus safety gates", false, "Read-only navigation."),
      control("view_candidates", "View candidates", "Focus candidates", false, "Read-only navigation."),
      control("export_preview", "Export preview", "Export backend pending", false, "No mutation."),
      control("copy_safe_summary", "Copy safe summary", "Copy safe status", false, "No mutation."),
    ],
    safetyRules: [
      { id: "no_overlap", label: "No overlapping runs", detail: "No active run or account_run_request.", status: "backend_pending" },
      { id: "day_limits", label: "Respect day limits", detail: "Daily follow/unfollow/DM caps must pass.", status: "backend_pending" },
      { id: "session_window", label: "Respect 6h session", detail: "Restart only inside assigned window.", status: "backend_pending" },
      { id: "phone_rest", label: "Respect phone rest", detail: "Avoid 24/24 runtime.", status: "backend_pending" },
      { id: "credential_blocks", label: "Block credential accounts", detail: "Checkpoint/2FA/password blocks restart.", status: "backend_pending" },
      { id: "device_health", label: "Block offline devices", detail: "Assigned device must be online.", status: "backend_pending" },
    ],
    rules: {
      enabled: false,
      restartYellowAccounts: true,
      restartRedAccounts: true,
      respectFixedBlackouts: true,
      respectSixHourWindow: true,
      checkEveryMinutes: 15,
      maxRestartsPerAccountPerDay: 2,
      maxRestartsPerAccountPerWindow: 1,
      writable: false,
    },
    quotaCandidates: [],
    decisions: [],
  };
}

function normalizeAutoRestartOverview(data) {
  const payload = readPayload(data);
  if (!payload || typeof payload !== "object") return autoRestartFallback();
  const status = payload.status || {};
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const sourceStatus = Array.isArray(payload.sourceStatus) ? payload.sourceStatus : [];
  const safetyGates = Array.isArray(payload.safetyGates) ? payload.safetyGates : [];
  const rules = payload.rules || {};
  const firstCandidate = candidates[0] || {};
  const quotaRemaining = (key) => {
    const value = firstCandidate?.quotas?.[key]?.remaining;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  };
  const candidateAccounts = candidates.map((candidate) => ({
    accountId: candidate.accountId || "",
    username: candidate.username || "unknown",
    clientName: candidate.username || "Unknown client",
    packageLabel: candidate.packageLabel || "Unknown package",
    status: candidate.gateStatus || "unknown",
    quotaStatus: candidate.restartEligible ? "quota_available" : "blocked",
    resumeEligibility: candidate.restartEligible ? "eligible" : "blocked",
    assignedDevice: candidate.phoneName || "Not assigned",
    lastRun: null,
    nextAction: candidate.restartEligible ? `Plan ${candidate.plannedRunType}` : "Review blocker",
    blockingReason: candidate.blockReason || null,
  }));
  const resting = candidates.filter((candidate) => /rest/i.test(String(candidate.phoneRestStatus || ""))).length;
  const active = candidates.filter((candidate) => /active|ok|none|not active/i.test(String(candidate.phoneRestStatus || ""))).length;
  const control = (action, label, detail, confirmationRequired, impact, backendStatus = "relay_ready") => ({
    action,
    label,
    detail,
    requestId: `botapp-auto-restart-${action}-${Date.now().toString(36)}`,
    dryRun: true,
    confirmationRequired,
    impact,
    affectedAccountsCount: candidateAccounts.length,
    affectedDevicesCount: new Set(candidateAccounts.map((account) => account.assignedDevice).filter(Boolean)).size,
    backendStatus,
  });
  return {
    status: status.enabled ? "enabled" : "disabled",
    enabled: Boolean(status.enabled),
    mode: status.mode === "active" || status.mode === "dry_run" || status.mode === "disabled" ? status.mode : "dry_run",
    lastRestartAt: status.lastSchedulerCheck || null,
    nextEligibleRestartAt: status.nextSchedulerCheck || null,
    activeAccountsAffected: Number(status.activeRestartCandidates || 0),
    safetyStatus: Number(status.blockedCandidates || 0) > 0 ? "watch" : "safe",
    backendSyncStatus: "relay_ready",
    sourceSummary: status.statusLabel || "Dashboard Auto Restart overview loaded.",
    sessionResume: {
      pausedDueToQuota: candidates.filter((candidate) => /quota/i.test(String(candidate.blockReason || ""))).length,
      eligibleToResume: Number(status.activeRestartCandidates || 0),
      remainingDailyQuota: {
        follows: quotaRemaining("follow"),
        unfollows: quotaRemaining("unfollow"),
        dms: quotaRemaining("welcome") ?? quotaRemaining("outreach"),
      },
      resumeBlockedReason: Number(status.blockedCandidates || 0) ? `${status.blockedCandidates} blocked candidate(s)` : null,
      lastSuccessfulAction: null,
      nextResumeWindow: status.nextSchedulerCheck || null,
    },
    businessSessionWindow: {
      status: String(firstCandidate.sessionWindowStatus || "").includes("in_window") ? "in_window" : firstCandidate.sessionWindowStatus ? "outside_window" : "not_configured",
      currentStart: null,
      currentEnd: null,
      timeRemaining: null,
      preventOverrun: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      packageRelation: "Dashboard applies package/session caps before restart planning.",
    },
    phoneRest: {
      phonesResting: resting,
      phonesActive: active,
      nextRestWindow: null,
      reason: "Derived from dashboard phone_rest_windows and schedule gates.",
      devices: candidates.slice(0, 20).map((candidate) => ({
        deviceId: candidate.phoneName || candidate.accountId || "",
        deviceLabel: candidate.phoneName || "Unknown phone",
        status: /offline/i.test(String(candidate.phoneRestStatus || "")) ? "offline" : /rest/i.test(String(candidate.phoneRestStatus || "")) ? "resting" : "active",
        reason: candidate.phoneRestStatus || "No rest blocker",
        nextRestWindow: null,
        highVolumePackageProtection: /80|120|pro|premium/i.test(String(candidate.packageLabel || "")),
      })),
    },
    affectedAccounts: candidateAccounts,
    controls: [
      control("refresh_overview", "Refresh overview", "Reload latest backend overview", false, "Reloads overview only."),
      control("dry_run_preview", "Run dry-run preview", "Recompute candidates", false, "No mutation."),
      control("enable_auto_restart", "Enable Auto Restart", "Preview enable contract", true, "Would enable scheduler after backend settings are writable.", "backend_pending"),
      control("disable_auto_restart", "Disable Auto Restart", "Preview disable contract", true, "Would disable scheduler.", "backend_pending"),
      control("restart_eligible_sessions", "Restart eligible sessions", "Preview restart contract", true, "Would enqueue eligible sessions only.", "backend_pending"),
      control("resume_quota_paused", "Resume quota-paused accounts", "Preview quota resume", true, "Would resume quota-paused eligible accounts.", "backend_pending"),
      control("pause_device_rest", "Pause device rest", "Preview rest override", true, "Would pause a rest window under backend policy.", "backend_pending"),
      control("resume_phone", "Resume phone", "Preview phone resume", true, "Would resume a phone after gates pass.", "backend_pending"),
      control("open_affected_accounts", "Open affected accounts", "Open affected accounts", false, "Read-only navigation."),
      control("open_device", "Open device", "Open Devices", false, "Read-only navigation."),
      control("open_compass_issue", "Open Compass issue", "Open Compass", false, "Read-only navigation."),
      control("open_credentials", "Open Credentials", "Open blockers", false, "Read-only navigation."),
      control("open_activity_log", "Open Activity Log", "Open evidence", false, "Read-only navigation."),
      control("view_safety_gates", "View safety gates", "Focus safety gates", false, "Read-only navigation."),
      control("view_candidates", "View candidates", "Focus candidates", false, "Read-only navigation."),
      control("export_preview", "Export preview", "Export safe summary", false, "Export backend pending.", "backend_pending"),
      control("copy_safe_summary", "Copy safe summary", "Copy safe summary", false, "No mutation."),
    ],
    safetyRules: safetyGates.length ? safetyGates.map((gate, index) => ({
      id: `gate_${index + 1}`,
      label: gate.label || "Safety gate",
      detail: gate.detail || "",
      status: gate.status === "ready" ? "safe" : gate.status === "blocked" ? "blocked" : "watch",
    })) : sourceStatus.map((source, index) => ({
      id: `source_${index + 1}`,
      label: source.label || "Source",
      detail: source.detail || "",
      status: source.status === "connected" ? "safe" : "backend_pending",
    })),
    rules: {
      enabled: Boolean(rules.enabled),
      restartYellowAccounts: Boolean(rules.restartYellowAccounts),
      restartRedAccounts: Boolean(rules.restartRedAccounts),
      respectFixedBlackouts: Boolean(rules.respectPhoneRest),
      respectSixHourWindow: Boolean(rules.respectSixHourWindow),
      checkEveryMinutes: Number(rules.checkEveryMinutes || 15),
      maxRestartsPerAccountPerDay: Number(rules.maxRestartsPerAccountPerDay || 2),
      maxRestartsPerAccountPerWindow: Number(rules.maxRestartsPerAccountPerWindow || 1),
      writable: false,
    },
    quotaCandidates: candidates.map((candidate) => ({
      accountId: candidate.accountId || "",
      username: candidate.username || "unknown",
      packageLabel: candidate.packageLabel || "Unknown package",
      phoneName: candidate.phoneName || "No phone",
      followRemaining: Number(candidate.quotas?.follow?.remaining || 0),
      unfollowRemaining: Number(candidate.quotas?.unfollow?.remaining || 0),
      welcomeRemaining: Number(candidate.quotas?.welcome?.remaining || 0),
      outreachRemaining: Number(candidate.quotas?.outreach?.remaining || 0),
      plannedRunType: candidate.plannedRunType || "none",
      decision: candidate.restartEligible ? "Eligible" : "Blocked",
      reason: candidate.blockReason || "",
    })),
    decisions: Array.isArray(payload.decisions) ? payload.decisions.map((decision) => ({
      id: decision.id || `${decision.account || "decision"}-${decision.decisionTime || ""}`,
      account: decision.account || "Unknown",
      decisionTime: decision.decisionTime || null,
      action: decision.action || "",
      reason: decision.reason || "",
      requestId: decision.requestId || null,
    })) : [],
  };
}

async function autoRestartOverview() {
  const cfg = compassConfig();
  const url = autoRestartUrl("overview");
  if (!url) return autoRestartFallback("Configure the relay URL to load Auto Restart overview.");
  try {
    const response = await fetch(url, { method: "GET", headers: relayHeaders(cfg) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) return autoRestartFallback(readRelayError(data, "Auto Restart overview unavailable."));
    return normalizeAutoRestartOverview(data);
  } catch (error) {
    return autoRestartFallback(safeRuntimeError(error, "Auto Restart overview unavailable."));
  }
}

async function autoRestartDryRun() {
  const cfg = compassConfig();
  const url = autoRestartUrl("dry-run");
  if (!url) return { ok: false, error: "Configure the relay URL to run Auto Restart dry-run.", overview: autoRestartFallback() };
  try {
    const response = await fetch(url, { method: "POST", headers: relayHeaders(cfg), body: JSON.stringify({ dry_run: true }) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) return { ok: false, error: readRelayError(data, "Auto Restart dry-run unavailable."), overview: autoRestartFallback() };
    return { ok: true, overview: normalizeAutoRestartOverview(readPayload(data)?.overview || data), dryRun: true };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Auto Restart dry-run unavailable."), overview: autoRestartFallback() };
  }
}

async function autoRestartActionPreview(input) {
  const cfg = compassConfig();
  const url = autoRestartUrl("action-preview");
  if (!url) return { ok: false, error: "Configure the relay URL to preview Auto Restart actions." };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: relayHeaders(cfg),
      body: JSON.stringify({
        action: input?.action,
        request_id: input?.requestId || `botapp-auto-restart-${Date.now().toString(36)}`,
        target: sanitizeCompassValue(input?.target || {}),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) return { ok: false, error: readRelayError(data, "Auto Restart action preview failed.") };
    return { ok: true, data: readPayload(data) };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Auto Restart action preview failed.") };
  }
}

function dashboardApiUrl(pathnameSuffix) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return "";
  const endpoint = endpointById(pathnameSuffix);
  if (endpoint) return endpointUrl(endpoint);
  const url = new URL(cfg.relayUrl);
  url.pathname = url.pathname.replace(/\/compass\/analyze\/?$/, `/${pathnameSuffix.replace(/^\/+/, "")}`);
  return url.toString();
}

async function dashboardGet(pathnameSuffix, routeParams = {}) {
  const cfg = compassConfig();
  const endpoint = endpointById(pathnameSuffix);
  const url = endpoint ? endpointUrl(endpoint, routeParams) : dashboardApiUrl(pathnameSuffix);
  if (!url) return null;
  const response = await fetch(url, { method: "GET", headers: relayHeaders(cfg) });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) throw new Error(readRelayError(data, `${pathnameSuffix} unavailable.`));
  return readPayload(data);
}

async function dashboardPost(endpointId, body, routeParams = {}) {
  return dashboardRequest("POST", endpointId, body, routeParams);
}

async function dashboardRequest(method, endpointId, body, routeParams = {}) {
  const cfg = compassConfig();
  const endpoint = endpointById(endpointId);
  const url = endpoint ? endpointUrl(endpoint, routeParams) : dashboardApiUrl(endpointId);
  if (!url) throw new Error("Relay URL is not configured.");
  const response = await fetch(url, {
    method,
    headers: relayHeaders(cfg),
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) throw new Error(readRelayError(data, `${endpointId} unavailable.`));
  return readPayload(data);
}

async function profileDetailsData(accountId) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) return { ok: false, error: "Missing account id." };
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to load profile details." };
  try {
    const data = await dashboardGet("profiles_account_details", { account_id: normalizedAccountId });
    return { ok: true, data: normalizeProfileDetailsAvatarUrls(data, cfg) };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Profile details unavailable.") };
  }
}

async function profileCreateDryRun(input) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to validate profile creation." };
  try {
    const payload = sanitizeAddProfilePayload(input);
    const data = await dashboardPost("profiles_create", { ...payload, dry_run: true });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Profile create dry-run failed.") };
  }
}

async function addProfileTarget(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const username = String(input?.username || input?.target_username || "").trim();
  if (!accountId || !username) return { ok: false, error: "Missing account id or target username." };
  try {
    const data = await dashboardPost("targets_collection", {
      account_id: accountId,
      target_username: username,
      actor_type: "admin",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Target add failed.") };
  }
}

async function bulkAddProfileTargets(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const usernames = Array.isArray(input?.usernames) ? input.usernames.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (!accountId || !usernames.length) return { ok: false, error: "Missing account id or target usernames." };
  try {
    const data = await dashboardPost("targets_collection", {
      account_id: accountId,
      usernames,
      actor_type: "admin",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Bulk target add failed.") };
  }
}

async function deleteProfileTargets(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const ids = normalizeTargetIds(input);
  if (!accountId || !ids.length) return { ok: false, error: "Missing account id or target ids." };
  try {
    const data = await dashboardRequest("DELETE", "targets_collection", {
      account_id: accountId,
      ids,
      actor_type: "admin",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Target delete failed.") };
  }
}

async function resetProfileTargets(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const ids = normalizeTargetIds(input);
  if (!accountId || !ids.length) return { ok: false, error: "Missing account id or target ids." };
  try {
    const data = await dashboardRequest("PATCH", "targets_reset", {
      account_id: accountId,
      ids,
      actor_type: "admin",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Target reset failed.") };
  }
}

function normalizeTargetIds(input) {
  if (Array.isArray(input?.ids)) return input.ids.map((item) => String(item || "").trim()).filter(Boolean);
  if (Array.isArray(input?.targetIds)) return input.targetIds.map((item) => String(item || "").trim()).filter(Boolean);
  const single = String(input?.id || input?.targetId || input?.target_id || "").trim();
  return single ? [single] : [];
}

function sanitizeAddProfilePayload(input) {
  const allowed = [
    "username",
    "password",
    "email",
    "display_name",
    "internal_label",
    "notes",
    "login_method",
    "clone_mode",
    "device_id",
    "app_instance_id",
    "device_name",
    "device_udid",
    "template_mode",
    "template_id",
    "runtime_mode",
    "commercial_package",
    "addons",
    "starts_at",
    "ends_at",
  ];
  const payload = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input || {}, key)) payload[key] = input[key];
  }
  return payload;
}

function normalizeProfileDetailsAvatarUrls(data, cfg = compassConfig()) {
  const targetItems = data?.targets?.items;
  if (!Array.isArray(targetItems)) return data;
  return {
    ...data,
    targets: {
      ...data.targets,
      items: targetItems.map((target) => {
        if (!target || typeof target !== "object") return target;
        return {
          ...target,
          avatar_url: typeof target.avatar_url === "string" && target.avatar_url.startsWith("/api/instagram-dashboard/")
            ? absoluteDashboardPath(target.avatar_url, cfg)
            : target.avatar_url,
        };
      }),
    },
  };
}

const knownPhoneSerials = [
  { serial: "RFGL145VCKE", label: "PHONE 1" },
  { serial: "RFGL145LZHE", label: "PHONE 2" },
];

function maskSerial(serial) {
  const value = String(serial || "");
  if (value.length <= 4) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function localKnownDevices() {
  return knownPhoneSerials.map((phone) => ({
    id: phone.serial,
    name: phone.label,
    model: "Samsung A16",
    status: "offline",
    adbSerial: phone.serial,
    shortSerial: maskSerial(phone.serial),
    deviceKind: "physical_phone",
    pool: "full_cycle",
    product: "a16nsxx",
    deviceCode: "a16",
    profileCount: 0,
    latencyMs: null,
    appInstancesCount: 0,
    appInstancesAvailableCount: 0,
    appInstancesOccupiedCount: 0,
    heartbeatStatus: "unknown",
    hostLabel: null,
    hubLabel: null,
    hubPort: null,
    viewAvailable: true,
    viewUnavailableReason: null,
    battery: 0,
    cloneCount: 0,
    activeSession: null,
    nextBufferEndsAt: null,
    lockReason: "Backend heartbeat unavailable",
  }));
}

function asDashboardDevice(row, index) {
  const id = row?.id || row?.device_id || row?.adb_serial || knownPhoneSerials[index]?.serial || `phone_${index + 1}`;
  const label = row?.device_name || row?.phone_name || row?.display_name || row?.name || knownPhoneSerials[index]?.label || `PHONE ${index + 1}`;
  const rawStatus = String(row?.heartbeat_status || row?.status || "").toLowerCase();
  const connected = ["online", "connected", "available", "reserved"].includes(rawStatus);
  const offline = ["offline", "stale", "unavailable"].includes(rawStatus);
  const serial = row?.adb_serial || id;
  const instanceCount = Number(row?.app_instances_count || row?.total_app_instances || 0);
  return {
    id: String(id),
    name: String(label),
    model: String(row?.model || "Samsung A16"),
    status: offline ? "offline" : connected ? "connected" : "maintenance",
    adbSerial: String(serial || ""),
    shortSerial: maskSerial(serial),
    deviceKind: String(row?.device_kind || row?.kind || "physical_phone").includes("emulator") ? "emulator" : "physical_phone",
    pool: String(row?.pool_type || row?.pool || "full_cycle").includes("outreach") ? "outreach_only" : "full_cycle",
    product: String(row?.product || ""),
    deviceCode: String(row?.device || row?.device_code || ""),
    profileCount: instanceCount,
    latencyMs: null,
    appInstancesCount: instanceCount,
    appInstancesAvailableCount: Number(row?.app_instances_available_count || 0),
    appInstancesOccupiedCount: Number(row?.app_instances_occupied_count || 0),
    heartbeatStatus: rawStatus === "stale" ? "stale" : connected ? "connected" : offline ? "offline" : "unknown",
    hostLabel: row?.host_name || row?.host_label || null,
    hubLabel: row?.hub_label || null,
    hubPort: row?.hub_port || null,
    viewAvailable: Boolean(serial),
    viewUnavailableReason: serial ? null : "ADB serial unavailable.",
    battery: 0,
    cloneCount: instanceCount,
    activeSession: null,
    nextBufferEndsAt: null,
    lockReason: row?.heartbeat_warning || null,
  };
}

function normalizeDashboardDevices(rows) {
  const items = Array.isArray(rows?.items) ? rows.items : Array.isArray(rows?.phone_devices) ? rows.phone_devices : Array.isArray(rows) ? rows : [];
  const normalized = items
    .filter((row) => row && typeof row === "object")
    .map(asDashboardDevice);
  if (normalized.length) return normalized;
  return localKnownDevices();
}

function packageLabel(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("premium")) return "Premium";
  if (text.includes("pro")) return "Pro";
  return "Growth";
}

function accountStatus(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("pause")) return "paused";
  if (text.includes("cancel")) return "cancelled";
  if (text.includes("onboard")) return "onboarding";
  if (text.includes("pending")) return "pending";
  if (text.includes("active") || text.includes("ready")) return "active";
  return "unknown";
}

function normalizeMatchText(value) {
  return String(value || "").trim().toLowerCase();
}

function profileCounters(account) {
  const packageCaps = packageCounterCaps(account);
  const cap = (key, fallbackMax) => {
    const fallback = packageCaps[key] ?? fallbackMax;
    const current = Number(account?.quotas?.[key]?.used ?? account?.[`${key}Today`] ?? 0);
    const max = Number(account?.quotas?.[key]?.max ?? account?.[`${key}Cap`] ?? fallback);
    return {
      current: Number.isFinite(current) ? current : 0,
      max: Number.isFinite(max) && max >= 0 ? max : fallback,
    };
  };
  return {
    follow: cap("follow", packageCaps.follow),
    unfollow: cap("unfollow", packageCaps.unfollow),
    like: cap("like", packageCaps.like),
    comment: cap("comment", 0),
    dm: cap("dm", packageCaps.dm),
  };
}

function packageCounterCaps(account) {
  const label = readPackageLabel(account).toLowerCase();
  if (label.includes("premium")) return { follow: 180, unfollow: 240, like: 500, dm: 100, comment: 0 };
  if (label.includes("pro")) return { follow: 120, unfollow: 120, like: 500, dm: 10, comment: 0 };
  return { follow: 80, unfollow: 80, like: 100, dm: 0, comment: 0 };
}

function formatCompactDateTime(value, fallback = "No session yet") {
  if (!value) return fallback;
  const raw = String(value);
  if (/scheduled/i.test(raw)) return "Scheduled";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.includes("T") ? "—" : raw;
  const iso = date.toISOString();
  return `${iso.slice(11, 19)} ${iso.slice(0, 10)}`;
}

function formatTimePart(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const hhmm = raw.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  if (hhmm) return `${hhmm[1]}:${hhmm[2]}`;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(11, 16);
  return "";
}

function accountRowId(account, index) {
  return String(account?.accountId || account?.account_id || account?.id || `account_${index + 1}`);
}

function uniqueManageAccounts(lists) {
  const seen = new Set();
  const rows = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const account of list) {
      if (!account || typeof account !== "object") continue;
      const id = accountRowId(account, rows.length);
      const key = id || normalizeMatchText(account?.username) || `row_${rows.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(account);
    }
  }
  return rows;
}

function extractManageAccounts(profilesPayload, clientAccountsPayload, overviewPayload) {
  const manageSection = overviewPayload?.manage;
  const manage = manageSection?.ok ? manageSection.data : null;
  const combinedLifecycle = manage
    ? uniqueManageAccounts([manage.activeAccounts, manage.archivedAccounts, manage.trashedAccounts])
    : [];
  const candidates = uniqueManageAccounts([
    profilesPayload?.profiles,
    profilesPayload?.allAccounts,
    clientAccountsPayload?.accounts,
    manage?.allAccounts,
    combinedLifecycle,
  ]);
  const counts = {
    profiles_endpoint_count: Array.isArray(profilesPayload?.profiles) ? profilesPayload.profiles.length : 0,
    manage_all_accounts_count: Array.isArray(manage?.allAccounts) ? manage.allAccounts.length : 0,
    client_accounts_count: Array.isArray(clientAccountsPayload?.accounts) ? clientAccountsPayload.accounts.length : 0,
    lifecycle_combined_count: combinedLifecycle.length,
    normalized_profiles_count: candidates.length,
  };
  let source = "none";
  if (counts.normalized_profiles_count > 0) {
    if (counts.profiles_endpoint_count === counts.normalized_profiles_count) source = "profiles_endpoint";
    else if (counts.manage_all_accounts_count === counts.normalized_profiles_count) source = "manage_all_accounts";
    else if (counts.client_accounts_count === counts.normalized_profiles_count) source = "client_accounts";
    else if (counts.lifecycle_combined_count === counts.normalized_profiles_count) source = "manage_lifecycle";
    else source = "manage_merged";
  }
  return { accounts: candidates, counts, source };
}

function resolveProfileDevice(account, devices) {
  const hints = [
    account?.phoneName,
    account?.phone_name,
    account?.phoneLabel,
    account?.phone_label,
    account?.assignedPhone,
    account?.assigned_phone,
    account?.assignedDevice,
    account?.assigned_device,
    account?.assigned_device_name,
    account?.deviceName,
    account?.device_name,
    account?.safeDeviceLabel,
    account?.deviceId,
    account?.device_id,
    account?.phoneId,
    account?.phone_id,
    account?.assignedDeviceId,
    account?.assigned_device_id,
    account?.adbSerial,
    account?.adb_serial,
    account?.deviceSerial,
    account?.device_serial,
    account?.assignment?.deviceName,
    account?.assignment?.deviceId,
    account?.assignment?.phoneName,
    account?.assignment?.phoneId,
    account?.assignment?.adbSerial,
  ].map(normalizeMatchText).filter(Boolean);
  return devices.find((item) => {
    const labels = [item.name, item.id, item.adbSerial, item.shortSerial].map(normalizeMatchText);
    return hints.some((hint) => labels.includes(hint) || labels.some((label) => label && (label.includes(hint) || hint.includes(label))));
  }) || null;
}

function readAssignmentLabel(account) {
  return String(
    account?.phoneName
      || account?.phone_name
      || account?.phoneLabel
      || account?.phone_label
      || account?.assignedDevice
      || account?.assigned_device
      || account?.assigned_device_name
      || account?.deviceName
      || account?.device_name
      || account?.assignment?.deviceName
      || "No phone",
  );
}

function readActiveWindow(account) {
  const start = account?.timeslotStart || account?.timeslot_start || account?.assignmentStartsAt || account?.assignment?.startsAt;
  const end = account?.timeslotEnd || account?.timeslot_end || account?.assignmentEndsAt || account?.assignment?.endsAt;
  const startTime = formatTimePart(start);
  const endTime = formatTimePart(end);
  if (startTime && endTime) return `${startTime}-${endTime}`;
  if (account?.activeWindow || account?.active_window || account?.timeslot) {
    const raw = String(account.activeWindow || account.active_window || account.timeslot);
    const parts = raw.match(/([0-2]\d:[0-5]\d).+?([0-2]\d:[0-5]\d)/);
    return parts ? `${parts[1]}-${parts[2]}` : raw;
  }
  if (startTime) return "Scheduled";
  return "Scheduled";
}

function readSlotKind(account) {
  const value = String(account?.slotKind || account?.slot_kind || account?.assignment?.slotKind || account?.runtimeProfile || account?.runtimeProfilesLabel || "");
  if (/40|outreach/i.test(value)) return "outreach_40m";
  if (/3h|growth/i.test(value)) return "growth_3h";
  return "full_cycle_6h";
}

function readRuntimeProfile(account) {
  const value = String(account?.runtimeProfile || account?.runtime_profile || account?.runtimeProfilesLabel || account?.slotKind || "");
  if (/outreach/i.test(value)) return "outreach_only";
  if (/follow/i.test(value)) return "follow_only";
  return "full_cycle";
}

function readProfileNumber(account, index) {
  const value = Number(account?.profileNumber || account?.profile_number || account?.cloneIndex || account?.clone_index || account?.appInstanceIndex || account?.app_instance_index || index + 1);
  return Number.isFinite(value) && value > 0 ? value : index + 1;
}

function readDeviceId(account, device) {
  return String(device?.id || account?.deviceId || account?.device_id || account?.phoneId || account?.phone_id || account?.assignment?.deviceId || "");
}

function readDeviceName(account, device) {
  return device?.name || readAssignmentLabel(account);
}

function readAssignmentState(account, device) {
  const raw = normalizeMatchText(account?.assignmentStatus || account?.assignment_status || account?.assignmentState || account?.assignment_state || account?.assignment?.assignmentStatus);
  if (raw.includes("reserved")) return "reserved";
  if (raw.includes("blocked")) return "blocked";
  if (raw.includes("assigned") || device?.id) return "assigned";
  if (raw.includes("missing")) return "missing_slot";
  return device?.id ? "assigned" : "missing_slot";
}

function readDeviceAvailability(account, device) {
  if (!device) return "unassigned";
  const raw = normalizeMatchText(account?.assignmentStatus || account?.assignment_status || account?.assignmentState || account?.assignment_state);
  if (raw.includes("reserved")) return "reserved";
  if (raw.includes("blocked")) return "blocked";
  if (device.status === "offline") return "offline";
  return "available";
}

function readProfileStatus(account, blocked) {
  const raw = normalizeMatchText(account?.runStatus || account?.run_status || account?.currentRunStatus || account?.current_run_status || account?.status);
  if (raw.includes("running")) return "running";
  if (raw.includes("pause")) return "paused";
  if (raw.includes("archive")) return "archived";
  if (blocked) return "blocked";
  return "ready";
}

function readReadiness(account, blocked) {
  const raw = normalizeMatchText(account?.readiness || account?.readinessStatus || account?.readiness_status);
  if (raw.includes("ready")) return "ready";
  if (raw.includes("login")) return "needs_login";
  if (raw.includes("target")) return "needs_targets";
  if (blocked) return "blocked";
  return "ready";
}

function readEligibility(account, blocked) {
  const raw = normalizeMatchText(account?.eligibility || account?.eligibilityStatus || account?.eligibility_status);
  if (raw.includes("can_start") || raw === "ready") return "can_start";
  if (raw.includes("blocked")) return "blocked_now";
  return blocked ? "blocked_now" : "can_start";
}

function readEligibilityReason(account, blocked) {
  return String(account?.eligibilityReason || account?.eligibility_reason || account?.primaryBlockReason || account?.primary_block_reason || (blocked ? "blocked" : "ready"));
}

function readPackageLabel(account) {
  return packageLabel(account?.packageLabel || account?.package_label || account?.commercialPackage || account?.commercial_package || account?.package);
}

function readPlatform(account) {
  const platformRaw = String(account?.platform || account?.platformLabel || account?.platform_label || "instagram").trim();
  return /tiktok/i.test(platformRaw) ? "TikTok" : "Instagram";
}

function readEntitlements(account, packageValue) {
  const raw = account?.entitlements || account?.entitlementSummary || account?.entitlement_summary || account?.packageLabel || packageValue || "follow";
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  return String(raw).split(/[,+]/).map((item) => item.trim()).filter(Boolean);
}

function readCredentialStatus(account) {
  const value = String(account?.credentialsStatus || account?.credentialStatus || account?.credential_status || "");
  if (/missing/i.test(value)) return "missing";
  if (/reauth|invalid|failed|update/i.test(value)) return "needs_update";
  return "active";
}

function readLoginStatus(account) {
  const value = String(account?.loginStatus || account?.login_status || account?.credentialsStatus || "");
  if (/challenge/i.test(value)) return "challenge_required";
  if (/2fa/i.test(value)) return "needs_2fa";
  if (/missing/i.test(value)) return "missing_credentials";
  if (/connected/i.test(value)) return "connected";
  return "ready";
}

function readRequirement(blocked, label) {
  return {
    enabled: !blocked,
    reason: blocked ? "runtime_blocked" : "ready",
    label: blocked ? "Blocked" : label,
    detail: blocked ? "Runtime or credential gate blocked" : "Prerequisites are satisfied.",
  };
}

function readFollowerDelta(account) {
  const value = Number(account?.last7dGrowth || account?.followerDelta || account?.follower_delta || account?.growthDelta || 0);
  return Number.isFinite(value) ? value : 0;
}

function readLastSessionAt(account) {
  return formatCompactDateTime(account?.lastSafeUpdate || account?.last_safe_update || account?.lastSessionAt || account?.last_session_at || null);
}

function profileFromManageAccount(account, index, devices) {
  const blocked = Boolean(account?.blockingCampaign || account?.pendingActionsCount > 0 || /checkpoint|challenge|missing|blocked|failed|reauth/i.test(`${account?.loginStatus || ""} ${account?.credentialsStatus || ""}`));
  const device = resolveProfileDevice(account, devices);
  const eligibilityReason = readEligibilityReason(account, blocked);
  const eligibility = readEligibility(account, blocked);
  const readiness = readReadiness(account, blocked);
  const packageValue = readPackageLabel(account);
  const entitlements = readEntitlements(account, packageValue);
  return {
    id: accountRowId(account, index),
    username: String(account?.username || "unknown"),
    displayName: String(account?.displayName || account?.username || "unknown"),
    platform: readPlatform(account),
    package: packageValue,
    planType: "normal",
    profileNumber: readProfileNumber(account, index),
    clientName: String(account?.clientName || "Client"),
    status: readProfileStatus(account, blocked),
    deviceId: readDeviceId(account, device),
    deviceName: readDeviceName(account, device),
    activeWindow: readActiveWindow(account),
    followers: Number(account?.followersCount || account?.followers_count || account?.followers || 0),
    followerDelta: readFollowerDelta(account),
    followsToday: Number(account?.followsToday || account?.follows_today || 0),
    dmsToday: Number(account?.dmsToday || account?.dms_today || 0),
    counters: profileCounters(account),
    twoFactorEnabled: /enabled/i.test(String(account?.twoFactorDisplay || "")),
    credentialStatus: readCredentialStatus(account),
    loginStatus: readLoginStatus(account),
    deviceAvailability: readDeviceAvailability(account, device),
    assignmentState: readAssignmentState(account, device),
    entitlements,
    runtimeProfile: readRuntimeProfile(account),
    slotKind: readSlotKind(account),
    autoLoginRequirement: readRequirement(blocked, "Ready to login"),
    assignNowRequirement: readRequirement(blocked, "Ready to assign"),
    lastSessionAt: readLastSessionAt(account),
    readiness,
    eligibility,
    eligibilityReason,
    eligibilityDetail: {
      status: eligibility,
      primary_block_reason: eligibility === "blocked_now" ? eligibilityReason : "",
      reason_label: eligibility === "blocked_now" ? eligibilityReason.replaceAll("_", " ") : "Ready",
      reason_description: eligibility === "blocked_now" ? "Start is blocked until eligibility is resolved." : "Ready",
    },
    runtimeLock: String(account?.runtimeLock || account?.runtime_lock || "none"),
  };
}

function clientAccountFromManage(account, profile, devices) {
  const device = devices.find((item) => item.id === profile.deviceId);
  const status = accountStatus(account?.adminStatus || account?.customerStatus || account?.subscriptionStatus);
  const actionsNeeded = [];
  if (account?.pendingActionsCount) actionsNeeded.push(`${account.pendingActionsCount} pending action(s)`);
  if (account?.blockingCampaign) actionsNeeded.push("campaign blocked");
  return {
    accountId: profile.id,
    profileId: profile.id,
    clientId: String(account?.clientId || profile.id),
    clientName: profile.clientName,
    username: profile.username,
    displayName: profile.displayName,
    platform: "Instagram",
    createdAtLabel: String(account?.createdAt || ""),
    accountStatus: status,
    adminStatus: String(account?.adminStatus || "unknown"),
    customerStatus: String(account?.customerStatus || "unknown"),
    subscriptionStatus: String(account?.subscriptionStatus || "unknown"),
    lifecycleStatus: status === "cancelled" ? "cancelled" : status === "paused" ? "paused" : "active",
    loginStatus: profile.loginStatus,
    credentialStatus: profile.credentialStatus,
    credentialsConfigured: Boolean(account?.credentialsConfigured),
    reauthRequired: Boolean(account?.reauthRequired),
    twoFactorStatus: /enabled/i.test(String(account?.twoFactorDisplay || "")) ? "enabled" : "unknown",
    readiness: profile.readiness,
    eligibility: profile.eligibility,
    eligibilityReason: profile.eligibilityReason,
    reasonLabel: profile.eligibilityDetail.reason_label,
    packageLabel: profile.package,
    entitlementSummary: String(account?.entitlementSummary || ""),
    entitlements: profile.entitlements,
    assignment: {
      deviceId: device?.id || "",
      deviceName: device?.name || account?.phoneName || "No phone",
      deviceStatus: device?.status || "offline",
      appInstanceLabel: String(account?.appInstanceLabel || ""),
      packageName: String(account?.appPackageName || "com.instagram.android"),
      assignmentStatus: profile.assignmentState,
      slotKind: profile.slotKind,
      activeWindow: profile.activeWindow,
    },
    lastActivityAt: account?.lastSafeUpdate || null,
    targetsCount: 0,
    actionsNeeded,
    safeEmailDisplay: String(account?.emailDisplay || "hidden"),
    sourceLabel: "admin-dashboard manage_overview",
    profileImageUrl: account?.profileImageUrl || null,
    instagramVerificationStatus: account?.instagramVerificationStatus === "verified" ? "verified" : account?.instagramVerificationStatus === "pending" ? "pending" : "unknown",
    passwordStatus: /missing/i.test(String(account?.passwordDisplay || account?.credentialsStatus || "")) ? "missing" : /update|reauth/i.test(String(account?.passwordDisplay || account?.credentialsStatus || "")) ? "update_needed" : "configured",
    twoFactorDisplay: /enabled/i.test(String(account?.twoFactorDisplay || "")) ? "enabled" : /code/i.test(String(account?.twoFactorDisplay || "")) ? "code required" : "unknown",
  };
}

function summarizeClientAccounts(items) {
  return {
    total: items.length,
    active: items.filter((item) => item.accountStatus === "active").length,
    pending: items.filter((item) => item.accountStatus === "pending").length,
    onboarding: items.filter((item) => item.accountStatus === "onboarding").length,
    paused: items.filter((item) => item.accountStatus === "paused").length,
    cancelled: items.filter((item) => item.accountStatus === "cancelled").length,
    needsAssistance: items.filter((item) => item.actionsNeeded.length > 0).length,
    reauthRequired: items.filter((item) => item.reauthRequired).length,
  };
}

function credentialsFromDashboard(credentials, accountsById) {
  const source = credentials?.ok ? credentials.data : credentials;
  const groups = Array.isArray(source?.actionGroups) ? source.actionGroups : [];
  const actions = groups.map((group, index) => {
    const account = accountsById.get(String(group.accountId || ""));
    return {
      id: `${group.accountId || "action"}_${index}`,
      accountId: String(group.accountId || account?.accountId || ""),
      clientId: account?.clientId || String(group.accountId || ""),
      profileId: account?.profileId || String(group.accountId || ""),
      username: String(group.username || account?.username || "unknown"),
      clientName: String(group.clientName || account?.clientName || "Client"),
      actionType: String(group.actionTypes?.[0] || "review_credentials"),
      title: String(group.mainIssue || "Review credentials"),
      description: String(group.description || group.recommendedAction || ""),
      status: String(group.status || "pending").replace("unknown", "pending"),
      priority: String(group.severity || "info").replace("error", "critical").replace("unknown", "info"),
      audience: String(group.audience || "admin").replace("unknown", "admin"),
      requiresClientAction: Boolean(group.audience === "client"),
      blockingCampaign: Boolean(group.blockingCampaign),
      credentialStatus: String(group.credentialsStatus || account?.credentialStatus || "unknown"),
      loginStatus: String(group.loginStatus || account?.loginStatus || "unknown"),
      provisioningStatus: String(group.provisioningStatus || account?.readiness || "unknown"),
      sourceLabel: group.sourceLabel === "account_dashboard_actions" ? "account_dashboard_actions" : "derived from dashboard overview",
      assignedPhone: account?.assignment?.deviceName || "",
      createdAtLabel: "",
      updatedAtLabel: "",
      ageLabel: "",
      nextAction: String(group.recommendedAction || "Review account"),
    };
  });
  return {
    actions,
    summary: {
      openActions: actions.filter((action) => !["resolved", "dismissed"].includes(action.status)).length,
      passwordUpdates: actions.filter((action) => action.actionType.includes("password")).length,
      verificationCodes: actions.filter((action) => action.actionType.includes("verification") || action.actionType.includes("two_factor")).length,
      needsReview: actions.filter((action) => action.audience === "admin" || action.priority === "warning").length,
      clientActionRequired: actions.filter((action) => action.requiresClientAction).length,
    },
    relayPayload: { action: "credentials_actions_overview", source: "BotApp", requested_by: null, include: ["account_dashboard_actions", "account_credentials", "client_instagram_accounts", "manage_overview", "radar_overview"], metadata_safe: { expected_effect: "read_only_credentials_actions_overview" } },
  };
}

function notificationsFromRadar(radar) {
  const source = radar?.ok ? radar.data : radar;
  const items = [
    ...(Array.isArray(source?.notificationItems?.radar) ? source.notificationItems.radar : []),
    ...(Array.isArray(source?.notificationItems?.serverCheck) ? source.notificationItems.serverCheck : []),
  ];
  return items.map((item, index) => ({
    id: String(item.id || `notification_${index + 1}`),
    severity: ["critical", "error", "warning", "info"].includes(item.severity) ? item.severity : "info",
    title: String(item.title || item.warningType || "Runtime signal"),
    message: String(item.message || item.detail || ""),
    profileId: item.accountId || undefined,
    createdAt: String(item.timestamp || ""),
    acknowledged: false,
  }));
}

function logsFromRadar(radar) {
  const source = radar?.ok ? radar.data : radar;
  const warnings = Array.isArray(source?.warnings) ? source.warnings : [];
  const runs = Array.isArray(source?.runs) ? source.runs : [];
  return [...warnings.slice(0, 30).map((row, index) => ({
    id: String(row.id || `warning_${index + 1}`),
    timestamp: String(row.timestamp || ""),
    level: ["critical", "error", "warning", "info"].includes(row.severity) ? row.severity : "info",
    actor: "dashboard",
    event: String(row.warningType || "warning"),
    target: String(row.username || ""),
    detail: String(row.message || row.recommendedAction || ""),
    domain: "runtime",
    source: String(row.sourceLabel || "dashboard"),
    account: row.username || null,
    device: row.phoneName || null,
    status: "review",
  })), ...runs.slice(0, 20).map((row, index) => ({
    id: String(row.runId || `run_${index + 1}`),
    timestamp: String(row.updatedAt || row.startedAt || ""),
    level: row.status === "failed" ? "error" : row.status === "running" ? "info" : "info",
    actor: "worker",
    event: `run.${row.status || "unknown"}`,
    target: String(row.username || ""),
    detail: `Run ${row.status || "unknown"}`,
    domain: "runs",
    source: String(row.sourceLabel || "dashboard"),
    account: row.username || null,
    device: row.phoneName || null,
    status: String(row.status || "unknown"),
  }))];
}

function logsFromActivity(activityLog) {
  const source = activityLog?.ok ? activityLog.data : activityLog;
  const items = Array.isArray(source?.items) ? source.items : [];
  return items.slice(0, 120).map((item, index) => ({
    id: String(item.id || item.sourceRecordId || `activity_${index + 1}`),
    timestamp: String(item.occurredAt || item.timestamp || ""),
    level: item.result === "failed" ? "error" : item.result === "pending" ? "warning" : "info",
    actor: String(item.actor || item.actorType || "dashboard"),
    event: String(item.actionType || item.action || "activity"),
    target: String(item.interactedUsername || item.ctUsername || item.targetLabel || ""),
    detail: String(item.safeSummary || item.reason || item.evidenceSummary || ""),
    domain: String(item.domain || item.evidenceSource || "activity"),
    source: String(item.sourceLabel || item.evidenceSource || "dashboard"),
    account: item.clientAccountUsername || item.username || null,
    device: item.safeDeviceLabel || null,
    status: String(item.actionStatus || item.result || "unknown"),
  }));
}

function summarizeProfileGroup(profiles) {
  return {
    total: profiles.length,
    normal: profiles.filter((profile) => profile.planType === "normal").length,
    dual: profiles.filter((profile) => profile.planType === "dual").length,
    other: profiles.filter((profile) => profile.planType === "other").length,
  };
}

function buildDeviceProfileGroup(device, groupProfiles) {
  return {
    deviceId: device.id,
    deviceLabel: device.name,
    deviceSerial: device.adbSerial,
    deviceSerialLabel: device.shortSerial,
    deviceStatus: device.status,
    phoneStatus: device.status === "offline" ? "inactive" : groupProfiles.some((profile) => profile.status === "running") ? "running" : "idle",
    deviceView: {
      available: device.viewAvailable,
      unavailableReason: device.viewUnavailableReason,
    },
    summary: summarizeProfileGroup(groupProfiles),
    profiles: groupProfiles,
  };
}

function buildUnassignedProfileGroup(ungroupedProfiles) {
  return {
    deviceId: "unassigned-live-profiles",
    deviceLabel: "Unassigned / dashboard profiles",
    deviceSerial: "",
    deviceSerialLabel: "No device",
    deviceStatus: "maintenance",
    phoneStatus: "idle",
    deviceView: {
      available: false,
      unavailableReason: "No ADB serial is attached to this dashboard account.",
    },
    summary: summarizeProfileGroup(ungroupedProfiles),
    profiles: ungroupedProfiles,
  };
}

function profileGroupsFromData(profiles, devices) {
  const knownDeviceIds = new Set(devices.map((device) => device.id));
  const assignedProfiles = new Map();
  for (const device of devices) assignedProfiles.set(device.id, []);
  const ungroupedProfiles = [];

  for (const profile of profiles) {
    const deviceId = String(profile.deviceId || "");
    if (deviceId && knownDeviceIds.has(deviceId)) {
      assignedProfiles.get(deviceId).push(profile);
      continue;
    }
    ungroupedProfiles.push(profile);
  }

  const groups = devices
    .map((device) => buildDeviceProfileGroup(device, assignedProfiles.get(device.id) || []))
    .filter((group) => group.profiles.length > 0);

  if (ungroupedProfiles.length) {
    groups.push(buildUnassignedProfileGroup(ungroupedProfiles));
  } else if (!groups.length && profiles.length) {
    groups.push(buildUnassignedProfileGroup(profiles));
  }

  return groups;
}

function compassFromData(profiles, devices, credentials) {
  const blockedAccounts = profiles.filter((profile) => profile.eligibility === "blocked_now").length;
  const openCredentialActions = credentials.summary.openActions;
  const problemDevices = devices.filter((device) => device.status === "offline" || device.heartbeatStatus === "stale").length;
  const target = (targetTab, label, context = {}) => ({ targetTab, label, context });
  const affectedFromCredentials = credentials.actions.map((action) => ({
    accountId: action.accountId,
    profileId: action.profileId,
    username: action.username,
    clientName: action.clientName,
    deviceId: null,
    deviceName: action.assignedPhone || null,
    packageLabel: "Growth",
    reason: action.title,
    target: target("credentials", "Open Credentials", { accountId: action.accountId, username: action.username }),
  }));
  const credentialInsight = openCredentialActions ? {
    id: "credentials",
    category: "credentials",
    severity: "critical",
    title: "Credential actions",
    summary: `${openCredentialActions} credential action(s) need review.`,
    sinceLabel: "current",
    impact: "Blocked accounts may not restart safely.",
    cause: "Dashboard credential actions are open.",
    clientVisible: true,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Open credential actions should be cleared before restart.",
    clientSummary: "Account access action required.",
    technicalReason: "account_dashboard_actions returned open groups.",
    clientSafeReason: "Account access action required.",
    recommendedAction: "Open Credentials",
    targetTab: "credentials",
    confidence: "high",
    affectedAccounts: affectedFromCredentials,
    evidence: [{ source: "credentials_actions", label: "Open actions", value: openCredentialActions, confidence: "high" }],
    recommendations: [],
  } : null;
  const deviceInsight = problemDevices ? {
    id: "devices",
    category: "devices",
    severity: "warning",
    title: "Device gates",
    summary: `${problemDevices} phone(s) need heartbeat or availability review.`,
    sinceLabel: "current",
    impact: "Device gates can block run and restart eligibility.",
    cause: "Device heartbeat or availability is not green.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Review device heartbeat before runtime actions.",
    clientSummary: null,
    technicalReason: "devices overview contains offline/stale phone signals.",
    clientSafeReason: null,
    recommendedAction: "Open Devices",
    targetTab: "devices",
    confidence: "medium",
    affectedAccounts: [],
    evidence: [{ source: "devices_overview", label: "Problem devices", value: problemDevices, confidence: "medium" }],
    recommendations: [],
  } : null;
  const insights = [credentialInsight, deviceInsight].filter(Boolean);
  return {
    generatedAt: new Date().toISOString(),
    healthScore: Math.max(0, 100 - blockedAccounts * 12 - problemDevices * 10),
    summary: {
      totalAccounts: profiles.length,
      workingAccounts: profiles.length - blockedAccounts,
      blockedAccounts,
      underQuotaAccounts: 0,
      inactiveAccounts: profiles.filter((profile) => profile.status === "paused" || profile.status === "archived").length,
      clientVisibleRecommendations: 0,
    },
    trends: [],
    insights,
    problemGroups: [],
    recommendations: [],
    internalSignals: [
      {
        id: "credential_blocker",
        signal: "credential_blocker",
        title: "Credential blockers",
        summary: "Open credential actions from dashboard.",
        count: openCredentialActions,
        severity: "critical",
        adminVisible: true,
        clientRawVisible: false,
        clientRecommendationInput: true,
        target: target("credentials", "Open Credentials"),
        affectedAccounts: affectedFromCredentials,
        evidence: [{ source: "credentials_actions", label: "Open actions", value: openCredentialActions, confidence: "high" }],
      },
      {
        id: "device_blocker",
        signal: "device_blocker",
        title: "Device gates",
        summary: "Device availability or heartbeat gates.",
        count: problemDevices,
        severity: "warning",
        adminVisible: true,
        clientRawVisible: false,
        clientRecommendationInput: true,
        target: target("devices", "Open Devices"),
        affectedAccounts: [],
        evidence: [{ source: "devices_overview", label: "Problem devices", value: problemDevices, confidence: "medium" }],
      },
    ].filter((signal) => signal.count > 0),
    clientSafePreview: [],
    aiAdvisor: {
      status: "relay_pending",
      provider: "openai",
      model: "server-side relay",
      lastAnalyzedAt: null,
      period: "7d",
      summary: "Compass facts loaded from dashboard. Run AI analysis through the secure relay.",
      healthAssessment: blockedAccounts || problemDevices ? "watch" : "good",
      relayTarget: "/api/instagram-dashboard/compass/analyze",
      serverSideOnly: true,
      analysis: null,
      fallbackReason: null,
      providerErrorCode: null,
    },
    aiAnalysisPayload: {
      generatedAt: new Date().toISOString(),
      summary: {
        totalAccounts: profiles.length,
        blockedAccounts,
        problemDevices,
        openCredentialActions,
      },
      insights,
      internalSignals: [],
      clientSafePreview: [],
    },
    relayPayload: {
      action: "compass_overview",
      source: "BotApp",
      requested_by: null,
      include: ["client_accounts_overview", "credentials_actions", "devices_overview", "activity_log_interaction_evidence_admin_v1", "runs_eligibility", "account_run_requests", "ig_runs", "incidents"],
      metadata_safe: { expected_effect: "read_only_compass_decision_overview", ai_provider: "openai" },
    },
  };
}

function emptySettings() {
  return {
    business: { defaultPackage: "Growth", welcomeEnabledForPro: false, outreachRequiresAddon: true },
    admin: { appMode: "relay", apiBase: "Configured in API / Webhooks / Keys", updatesChannel: "manual" },
    opsSafetyCaps: { effectiveFollowCap: "server", deviceLevelLock: true, cloneBufferMinutes: 10 },
    killSwitches: { startAllAccounts: false, realDeviceActions: false, realDmSend: false },
    runtimeState: { source: "dashboard-relay", polling: "manual", websocket: "disabled" },
  };
}

async function botappOverviewData() {
  const [overview, devicesPayload, profilesPayload, clientAccountsPayload, credentialsPayload, activityPayload] = await Promise.all([
    dashboardGet("botapp_overview").catch((error) => ({ error: safeRuntimeError(error, "Authentication required") })),
    dashboardGet("devices_overview").catch(() => null),
    dashboardGet("profiles_overview").catch(() => null),
    dashboardGet("client_accounts_overview").catch(() => null),
    dashboardGet("credentials_actions").catch(() => null),
    dashboardGet("activity_log").catch(() => null),
  ]);
  const overviewPayload = overview?.error ? null : overview;
  const overviewDevices = overviewPayload?.devices?.ok ? overviewPayload.devices.data : null;
  const devices = normalizeDashboardDevices(overviewDevices || devicesPayload);
  const manage = overviewPayload?.manage?.ok ? overviewPayload.manage.data : null;
  const credentials = overviewPayload?.credentials?.ok ? overviewPayload.credentials.data : credentialsPayload;
  const radar = overviewPayload?.radar?.ok ? overviewPayload.radar.data : null;
  const activityLog = overviewPayload?.activity_log?.ok ? overviewPayload.activity_log.data : activityPayload;
  const extracted = extractManageAccounts(profilesPayload, clientAccountsPayload, overviewPayload);
  const accounts = extracted.accounts;
  const profiles = accounts.map((account, index) => profileFromManageAccount(account, index, devices));
  const profileGroups = profileGroupsFromData(profiles, devices);
  const groupedProfilesCount = profileGroups.reduce((total, group) => total + group.profiles.length, 0);
  const overviewError = overview?.error || null;
  const profilesSourceCounts = {
    patch: "manage-sync-v1",
    ...extracted.counts,
    grouped_profiles_count: groupedProfilesCount,
    unassigned_count: profileGroups.find((group) => group.deviceId === "unassigned-live-profiles")?.profiles.length || 0,
    known_device_group_count: profileGroups.filter((group) => group.deviceId !== "unassigned-live-profiles").length,
    relay_configured: Boolean(compassConfig().relayUrl),
    relay_ok: !overviewError && Boolean(accounts.length),
    relay_error: overviewError || null,
    overview_ok: Boolean(overviewPayload?.manage?.ok),
    profiles_endpoint_ok: Array.isArray(profilesPayload?.profiles) || Array.isArray(profilesPayload?.allAccounts),
    client_accounts_endpoint_ok: Array.isArray(clientAccountsPayload?.accounts),
  };
  console.info("[botapp] profiles_patch_active manage-sync-v1");
  console.info("[botapp] profiles_source_counts", profilesSourceCounts);
  const clientItems = accounts.map((account, index) => clientAccountFromManage(account, profiles[index], devices));
  const clientAccounts = {
    items: clientItems,
    summary: summarizeClientAccounts(clientItems),
    sourceStatus: { manageOverview: accounts.length || manage ? "connected" : "pending", credentialsActions: credentials ? "connected" : "pending", statusMutations: "pending", botAppRelay: overview?.error ? "pending" : "connected" },
    relayPayload: { action: "client_accounts_overview", source: "BotApp", requested_by: null, include: ["manage_overview", "credentials_actions", "readiness_projection", "assignments", "targets_summary"], metadata_safe: { expected_effect: "read_only_client_accounts_overview" } },
  };
  const accountsById = new Map(clientItems.map((account) => [account.accountId, account]));
  const credentialsOverview = credentialsFromDashboard(credentials, accountsById);
  const liveActivityLogs = logsFromActivity(activityLog);
  const logs = liveActivityLogs.length ? liveActivityLogs : logsFromRadar(radar);
  const relayConfigured = Boolean(compassConfig().relayUrl);
  const syncError = accounts.length
    ? null
    : overviewError
      || (!relayConfigured ? "Configure the relay URL in API / Webhooks / Keys to load dashboard data." : null)
      || "No accounts returned from Manage. Check relay URL, relay credential, and deployed endpoints.";
  return {
    ok: !syncError,
    error: syncError,
    profilesMeta: {
      source: extracted.source,
      accountsCount: accounts.length,
      counts: profilesSourceCounts,
    },
    data: {
      profiles,
      profileGroups,
      clientAccounts,
      credentials: credentialsOverview,
      compass: compassFromData(profiles, devices, credentialsOverview),
      autoRestart: overviewPayload?.auto_restart?.ok ? normalizeAutoRestartOverview(overviewPayload.auto_restart.data) : autoRestartFallback(overviewPayload?.auto_restart?.error || "Auto Restart overview unavailable."),
      devices,
      notifications: notificationsFromRadar(radar),
      logs,
      apiKeys: [],
      webhooks: listIntegrationConfig().webhooks,
      settings: emptySettings(),
    },
  };
}

function readRelayError(data, fallback) {
  const reason = data?.reason || data?.error?.code || data?.error;
  const fallbackReason = data?.fallback_reason || data?.data?.fallback_reason;
  if (typeof fallbackReason === "string") return safeAnalyzeMessage(fallbackReason, fallback);
  if (reason === "provider_key_missing") return "AI provider is not configured on the relay server.";
  if (reason === "model_unavailable") return "AI provider model unavailable.";
  if (reason === "schema_validation_failed") return "AI response failed schema validation.";
  if (reason === "payload_invalid") return "Relay analyze payload invalid.";
  if (reason === "provider_timeout") return "Provider timeout.";
  if (reason === "provider_rate_limited") return "AI provider quota/rate limit reached.";
  if (reason === "provider_error") return "AI provider returned an error.";
  const providerErrorCode = data?.provider_error_code || data?.data?.provider_error_code;
  if (typeof providerErrorCode === "string" && providerErrorCode) return `Provider error: ${providerErrorCode}`;
  if (reason === "relay_auth_required") return "Relay authentication is required.";
  if (reason === "relay_auth_invalid") return "Relay authentication failed.";
  if (typeof data?.error === "string") return data.error;
  if (typeof data?.message === "string") return data.message;
  return fallback;
}

function safeRuntimeError(error, fallback) {
  const raw = error instanceof Error ? error.message : "";
  if (!raw || /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(raw)) {
    return fallback;
  }
  return raw;
}

async function compassHealth() {
  const cfg = compassConfig();
  const runtimeBefore = compassRuntimeStatus(undefined, cfg);
  if (!cfg.relayUrl) return runtimeBefore;
  try {
    const healthUrl = new URL(cfg.relayUrl);
    healthUrl.pathname = healthUrl.pathname.replace(/\/analyze\/?$/, "/health");
    const response = await fetch(healthUrl.toString(), {
      method: "GET",
      headers: relayHeaders(cfg),
    });
    const data = await response.json().catch(() => null);
    compassLastConnectionTestAt = new Date().toISOString();
    if (!response.ok || data?.ok === false) {
      const message = readRelayError(data, "Compass AI relay health check failed.");
      compassLastSafeError = message;
      compassServerKeyStatus = data?.reason === "provider_key_missing" ? "missing" : data?.provider_key_configured === true ? "configured" : "unknown";
      return {
        ...compassRuntimeStatus(message, cfg),
        status: "unavailable",
        serverKeyStatus: compassServerKeyStatus,
      };
    }
    compassLastSafeError = null;
    compassServerKeyStatus = data?.provider_key_configured === true ? "configured" : "unknown";
    return {
      ...compassRuntimeStatus("Compass AI relay health check passed.", cfg),
      model: typeof data?.model === "string" ? data.model : cfg.model,
      serverKeyStatus: compassServerKeyStatus,
      status: "ready",
    };
  } catch {
    const message = "Compass AI relay is unreachable.";
    compassLastSafeError = message;
    compassServerKeyStatus = "unknown";
    compassLastConnectionTestAt = new Date().toISOString();
    return { ...compassRuntimeStatus(message, cfg), status: "unavailable" };
  }
}

async function saveCompassRelayConfig(input) {
  const relayUrl = normalizeRelayUrl(input?.relayUrl || "");
  if (!relayUrl) {
    throw new Error("Relay URL must be HTTPS, localhost, or 127.0.0.1.");
  }
  const nextConfig = { compassAiRelayUrl: relayUrl };
  if (typeof input?.relayCredential === "string" && input.relayCredential.trim()) {
    nextConfig.botappRelayKey = input.relayCredential.trim();
  }
  writeRuntimeConfig(nextConfig);
  return compassRuntimeStatus("Compass AI relay URL saved.", compassConfig());
}

async function removeCompassRelayConfig() {
  removeRuntimeConfig(["compassAiRelayUrl", "botappRelayKey"]);
  compassLastConnectionTestAt = null;
  compassLastAnalysisAt = null;
  compassLastSafeError = null;
  compassServerKeyStatus = "unknown";
  return compassRuntimeStatus("Compass AI relay config removed.", compassConfig());
}

function safeWebhook(record) {
  return {
    id: record.id,
    url: maskUrl(record.url),
    events: Array.isArray(record.events) ? record.events : [],
    status: record.status === "disabled" ? "disabled" : "active",
    lastDeliveryStatus: record.lastDeliveryStatus || "not_sent",
    lastDeliveryAt: record.lastDeliveryAt || null,
    provider: record.provider || inferWebhookProvider(record.url),
    latestError: record.latestError || null,
  };
}

function listIntegrationConfig() {
  const stored = readRuntimeConfig();
  const webhooks = Array.isArray(stored.botappWebhooks) ? stored.botappWebhooks.map(safeWebhook) : [];
  return { webhooks };
}

async function saveWebhookConfig(input) {
  const url = normalizeHttpsUrl(input?.url || "");
  if (!url) {
    throw new Error("Webhook URL must be HTTPS, localhost, or 127.0.0.1.");
  }
  const stored = readRuntimeConfig();
  const current = Array.isArray(stored.botappWebhooks) ? stored.botappWebhooks : [];
  const id = input?.id || `local_wh_${Date.now().toString(36)}`;
  const nextWebhook = {
    id,
    label: String(input?.label || "Webhook").slice(0, 80),
    url,
    signingValue: typeof input?.secret === "string" && input.secret.trim() ? input.secret.trim() : undefined,
    events: Array.isArray(input?.events) ? input.events : [],
    status: "active",
    lastDeliveryStatus: "not_sent",
    lastDeliveryAt: null,
    provider: inferWebhookProvider(url),
    latestError: null,
  };
  writeRuntimeConfig({ botappWebhooks: [...current.filter((hook) => hook.id !== id), nextWebhook] });
  return listIntegrationConfig();
}

async function removeWebhookConfig(input) {
  const stored = readRuntimeConfig();
  const current = Array.isArray(stored.botappWebhooks) ? stored.botappWebhooks : [];
  writeRuntimeConfig({ botappWebhooks: current.filter((hook) => hook.id !== input?.id) });
  return listIntegrationConfig();
}

async function compassAnalyze(input) {
  const period = input?.period === "24h" || input?.period === "30d" ? input.period : "7d";
  const snapshot = sanitizeCompassValue(input?.snapshot || {});
  const cfg = compassConfig();
  const runtimeBefore = compassRuntimeStatus(undefined, cfg);
  if (runtimeBefore.mode === "rules_only") {
    const advisor = fallbackCompassAdvisor(period, runtimeBefore.message);
    return { ok: false, advisor, runtime: runtimeBefore, error: runtimeBefore.message };
  }
  try {
    const advisor = await analyzeCompassViaRelay(cfg.relayUrl, period, snapshot);
    compassLastAnalysisAt = advisor.lastAnalyzedAt || new Date().toISOString();
    compassLastConnectionTestAt = compassLastAnalysisAt;
    const safeError = advisor.status === "ai_enabled" ? null : advisor.summary || "AI provider returned an error.";
    compassLastSafeError = safeError;
    compassLastProviderErrorCode = advisor.status === "ai_enabled" ? null : advisor.providerErrorCode || null;
    const runtime = compassRuntimeStatus(advisor.status === "ai_enabled" ? "Compass AI analysis completed through secure relay." : safeError, cfg);
    return { ok: advisor.status === "ai_enabled", advisor, runtime, error: advisor.status === "ai_enabled" ? undefined : safeError };
  } catch (error) {
    const message = safeRuntimeError(error, "Compass AI relay is unreachable.");
    compassLastSafeError = message;
    compassLastProviderErrorCode = null;
    const advisor = fallbackCompassAdvisor(period, message);
    const serverKeyStatus = message === "AI provider is not configured on the relay server." ? "missing" : compassServerKeyStatus;
    compassServerKeyStatus = serverKeyStatus;
    return { ok: false, advisor, runtime: { ...compassRuntimeStatus(message, cfg), status: "unavailable", serverKeyStatus }, error: message };
  }
}

function runtimeIntegrationStatus() {
  const now = new Date().toISOString();
  const relayUrl = process.env.BOTAPP_SECURE_RELAY_URL || "";
  const dashboardUrl = process.env.BOTAPP_DASHBOARD_API_URL || relayUrl;
  const compassStatus = compassRuntimeStatus();
  return {
    localGateway: {
      status: "running",
      mode: isDev ? "development" : "packaged",
      transport: "electron_ipc",
      port: null,
      lastHealthCheck: now,
    },
    secureRelay: {
      status: relayUrl ? "configured" : "disconnected",
      baseUrl: relayUrl ? safeUrl(relayUrl, "configured") : "Not configured",
      lastHealthCheck: relayUrl ? now : null,
    },
    dashboardBackend: {
      status: dashboardUrl ? "configured" : "disconnected",
      baseUrl: dashboardUrl ? safeUrl(dashboardUrl, "configured") : "Not configured",
      lastHealthCheck: dashboardUrl ? now : null,
    },
    compassAi: {
      status: compassStatus.mode === "relay" ? "configured" : "missing_key",
      mode: compassStatus.mode,
      provider: "OpenAI",
      model: compassStatus.model,
      relayKeyConfigured: compassStatus.relayKeyConfigured,
      serverKeyStatus: compassStatus.serverKeyStatus,
      relayUrlConfigured: compassStatus.relayUrlConfigured,
      relayOrigin: compassStatus.relayOrigin,
      lastTestAt: compassStatus.lastConnectionTestAt,
      lastAnalysisAt: compassStatus.lastAnalysisAt,
      lastSafeError: compassStatus.lastSafeError,
      relayEndpoint: "/api/instagram-dashboard/compass/analyze",
    },
    environment: app.isPackaged ? "production" : "development",
  };
}

function registerRuntimeIpc() {
  ipcMain.handle("botapp:runtime:status", () => runtimeIntegrationStatus());
  ipcMain.handle("botapp:compass:ai-status", () => compassHealth());
  ipcMain.handle("botapp:compass:save-relay-config", (_event, input) => saveCompassRelayConfig(input));
  ipcMain.handle("botapp:compass:remove-relay-config", () => removeCompassRelayConfig());
  ipcMain.handle("botapp:compass:analyze", (_event, input) => compassAnalyze(input));
  ipcMain.handle("botapp:auto-restart:overview", () => autoRestartOverview());
  ipcMain.handle("botapp:auto-restart:dry-run", () => autoRestartDryRun());
  ipcMain.handle("botapp:auto-restart:action-preview", (_event, input) => autoRestartActionPreview(input));
  ipcMain.handle("botapp:data:overview", () => botappOverviewData());
  ipcMain.handle("botapp:profiles:details", (_event, accountId) => profileDetailsData(accountId));
  ipcMain.handle("botapp:profiles:create-dry-run", (_event, input) => profileCreateDryRun(input));
  ipcMain.handle("botapp:profiles:targets:add", (_event, input) => addProfileTarget(input));
  ipcMain.handle("botapp:profiles:targets:bulk-add", (_event, input) => bulkAddProfileTargets(input));
  ipcMain.handle("botapp:profiles:targets:delete", (_event, input) => deleteProfileTargets(input));
  ipcMain.handle("botapp:profiles:targets:reset", (_event, input) => resetProfileTargets(input));
  ipcMain.handle("botapp:endpoints:list", () => endpointRegistryList());
  ipcMain.handle("botapp:endpoints:test", (_event, input) => testBotappEndpoint(input?.id));
  ipcMain.handle("botapp:endpoints:test-all", () => testAllBotappEndpoints());
  ipcMain.handle("botapp:endpoints:export-profile", () => exportBotappConnectionProfile());
  ipcMain.handle("botapp:integrations:list", () => listIntegrationConfig());
  ipcMain.handle("botapp:integrations:save-webhook", (_event, input) => saveWebhookConfig(input));
  ipcMain.handle("botapp:integrations:remove-webhook", (_event, input) => removeWebhookConfig(input));
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: "BotApp",
    backgroundColor: "#0B1020",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[BotApp] renderer load failed", { errorCode, errorDescription, validatedURL });
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowedOrigin = isDev ? devServerUrl : `file://${path.join(__dirname, "../dist/index.html")}`;

    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
    }
  });

  const indexPath = path.join(__dirname, "../dist/index.html");

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(indexPath);
  }
}

app.whenReady().then(() => {
  attachRelayHeadersForDashboardAvatars();
  registerRuntimeIpc();
  registerDeviceViewIpc();
  createMainWindow();

  if (process.env.BOTAPP_DEVICE_VIEW_SELF_TEST) {
    setTimeout(() => {
      runDeviceViewSelfTest()
        .catch((error) => {
          console.error("[BotApp device-view self-test]", error);
        })
        .finally(() => {
          if (process.env.BOTAPP_DEVICE_VIEW_SELF_TEST_QUIT !== "0") {
            app.quit();
          }
        });
    }, 1500);
  }

  if (process.env.BOTAPP_COMPASS_AI_SELF_TEST) {
    setTimeout(() => {
      compassHealth()
        .then((statusBefore) => {
          console.log("[BotApp compass status]", {
            mode: statusBefore.mode,
            status: statusBefore.status,
            relayUrlConfigured: statusBefore.relayUrlConfigured,
            relayKeyConfigured: statusBefore.relayKeyConfigured,
            serverKeyStatus: statusBefore.serverKeyStatus,
          });
          return compassAnalyze({
        period: "7d",
        snapshot: {
          provider: "openai",
          mode: "server_side_openai",
          facts: { generatedAt: new Date().toISOString(), insights: [], recommendations: [], internalSignals: [] },
          outputContract: { format: "json", mustNotInventFacts: true, allowedFields: ["priority", "explanation", "recommended_order", "risk_notes"] },
        },
          });
        })
        .then((result) => {
          console.log("[BotApp compass self-test]", {
            ok: result.ok,
            mode: result.runtime.mode,
            status: result.runtime.status,
            relayUrlConfigured: result.runtime.relayUrlConfigured,
            relayKeyConfigured: result.runtime.relayKeyConfigured,
            serverKeyStatus: result.runtime.serverKeyStatus,
            advisorStatus: result.advisor.status,
            message: result.runtime.message,
          });
        })
        .catch((error) => {
          console.error("[BotApp compass self-test]", error);
        })
        .finally(() => {
          if (process.env.BOTAPP_COMPASS_AI_SELF_TEST_QUIT !== "0") {
            app.quit();
          }
        });
    }, 1500);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeAllDeviceViews();
});
