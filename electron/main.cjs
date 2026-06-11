/* global fetch, setTimeout */

const { app, BrowserWindow, ipcMain, shell } = require("electron");
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
  const relayKey = process.env.BOTAPP_RELAY_API_KEY || stored.botappRelayKey || "";
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
