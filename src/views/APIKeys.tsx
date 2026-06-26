import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Card, Input, Modal, type BadgeTone } from "../design/components";
import type { ApiKeySummary, BotAppBackendEndpoint, BotAppRuntimeIntegrationStatus, CompassAiRuntimeStatus, IntegrationStatus, TargetingAiRuntimeStatus, WebhookEvent, WebhookSummary } from "../api/types";
import { redactText } from "../security/redaction";
import { EmailTemplatesSection } from "./EmailTemplatesSection";
import "./api-keys.css";

const noRelayMessage = "Compass AI relay not configured. Add a relay URL to enable AI recommendations.";

const webhookEvents: WebhookEvent[] = [
  "slack.incident",
  "discord.incident",
  "credential.action_required",
  "account.blocked",
  "device.offline",
  "run.failed",
  "compass.critical_recommendation",
  "ct.quality_alert",
  "profile.created",
  "profile.updated",
  "profile.archived",
  "profile.targets.updated",
  "profile.session_status.changed",
];

type AiPromptService = {
  service: "compass_ai" | "comment_ai" | "targeting_ai" | "dm_ai";
  name: string;
  status: "active" | "planned" | "backend pending";
  source: "default" | "custom";
  version: string;
  lastUpdatedAt: string | null;
  backendSyncStatus: "relay/server-side active" | "backend pending" | "relay reachable";
  promptPreview: string;
  defaultPrompt: string;
  guardrails: string[];
};

const compassDefaultPrompt = [
  "You are Compass AI Advisor for an Instagram operations dashboard.",
  "Recommend operator actions that improve Phone Farm reliability, account readiness, CT quality, and safe growth operations.",
  "Prioritize critical blockers first, then operational risks, then quality/pacing opportunities.",
].join(" ");

const targetingDefaultPrompt = [
  "Generate a broad Instagram target discovery strategy for follower-source accounts.",
  "GPT proposes search angles, keywords, hashtag hints, and seed usernames only.",
  "SearchAPI verifies existence and provides followers, avatar, verified, and private flags.",
  "Prefer niche/local/micro-mid accounts; avoid celebrities, verified brands, and mega accounts.",
  "Seed usernames are hypotheses to verify — not guaranteed to exist.",
].join(" ");

const targetingPromptGuardrails = [
  "GPT must not invent follower counts, avatars, verification, privacy, or eligibility.",
  "SearchAPI is the source of truth for account facts and eligibility inputs.",
  "Only SearchAPI-verified accounts are displayed to clients.",
  "Non-eligible verified accounts may appear with explicit reasons but block final validation.",
  "Prompt is code-versioned (targeting_ai_v1) until DB-backed config is enabled.",
];

const lockedPromptGuardrails = [
  "No fact in input = no recommendation.",
  "Use only provided system facts; never invent accounts, CTs, devices, blockers, metrics, actions, causes, or evidence.",
  "Allowed categories are locked to credential, device, CT quality, activity evidence, internal pacing/growth, entitlement, and operational risk.",
  "AI can recommend only; destructive actions require separate human confirmation.",
  "Output schema validation and recommendation filtering remain mandatory after AI response.",
  "Prompt changes affect wording and prioritization only. Guardrails and validation cannot be disabled.",
];

const aiPromptServices: AiPromptService[] = [
  {
    service: "compass_ai",
    name: "Compass AI",
    status: "active",
    source: "default",
    version: "v1",
    lastUpdatedAt: null,
    backendSyncStatus: "relay/server-side active",
    promptPreview: "Facts-only operator recommendations for Compass blockers, CT quality, internal pacing, and operational risks.",
    defaultPrompt: compassDefaultPrompt,
    guardrails: lockedPromptGuardrails,
  },
  {
    service: "comment_ai",
    name: "Comment AI",
    status: "planned",
    source: "default",
    version: "draft",
    lastUpdatedAt: null,
    backendSyncStatus: "backend pending",
    promptPreview: "Future comment drafting and moderation prompt. Not active in production.",
    defaultPrompt: "Backend pending. This service has no active production prompt yet.",
    guardrails: lockedPromptGuardrails,
  },
  {
    service: "targeting_ai",
    name: "Targeting AI",
    status: "active",
    source: "default",
    version: "targeting_ai_v1",
    lastUpdatedAt: "2026-06-15",
    backendSyncStatus: "relay/server-side active",
    promptPreview: "Client dashboard ciblage: GPT generates search strategy and seed usernames; SearchAPI verifies facts.",
    defaultPrompt: targetingDefaultPrompt,
    guardrails: targetingPromptGuardrails,
  },
  {
    service: "dm_ai",
    name: "DM AI",
    status: "planned",
    source: "default",
    version: "draft",
    lastUpdatedAt: null,
    backendSyncStatus: "backend pending",
    promptPreview: "Future DM drafting and response classification prompt. Not active in production.",
    defaultPrompt: "Backend pending. This service has no active production prompt yet.",
    guardrails: lockedPromptGuardrails,
  },
];

function buildTargetingPromptService(runtime: TargetingAiRuntimeStatus): AiPromptService {
  const config = runtime.config;
  const backendPending = config?.backendPending === true;
  const relayReachable = runtime.relayUrlConfigured && runtime.status !== "relay_missing";
  return {
    service: "targeting_ai",
    name: "Targeting AI",
    status: backendPending || !relayReachable ? "planned" : "active",
    source: config?.promptSource === "db_custom" ? "custom" : "default",
    version: config?.promptVersion ?? "targeting_ai_v1",
    lastUpdatedAt: config?.lastUpdated ?? null,
    backendSyncStatus: backendPending
      ? "backend pending"
      : runtime.status === "ready"
        ? "relay/server-side active"
        : relayReachable
          ? "relay reachable"
          : "backend pending",
    promptPreview: config?.userPromptTemplate?.slice(0, 160) || config?.systemPrompt?.slice(0, 160) || targetingDefaultPrompt,
    defaultPrompt: config?.userPromptTemplate || config?.systemPrompt || targetingDefaultPrompt,
    guardrails: targetingPromptGuardrails,
  };
}

type TargetingAiDraft = {
  system_prompt: string;
  user_prompt_template: string;
  model: string;
  max_gpt_candidates: number;
  max_displayed_results: number;
  min_followers: number;
  max_followers: number;
  min_eligible_target: number;
  allow_verified: boolean;
  second_pass_enabled: boolean;
  temperature: number;
  searchapi_concurrency: number;
  max_searchapi_checks: number;
};

function targetingDraftFromRuntime(runtime: TargetingAiRuntimeStatus): TargetingAiDraft {
  const config = runtime.config;
  return {
    system_prompt: config?.systemPrompt || config?.defaultSystemPrompt || targetingDefaultPrompt,
    user_prompt_template: config?.userPromptTemplate || config?.defaultUserPromptTemplate || "",
    model: config?.model || "gpt-4.1-mini",
    max_gpt_candidates: config?.maxGptCandidates ?? 50,
    max_displayed_results: config?.maxDisplayedResults ?? 20,
    min_followers: config?.minFollowers ?? 500,
    max_followers: config?.maxFollowers ?? 50000,
    min_eligible_target: config?.minEligibleTarget ?? 8,
    allow_verified: config?.allowVerified ?? false,
    second_pass_enabled: config?.secondPassEnabled ?? true,
    temperature: config?.temperature ?? 0.5,
    searchapi_concurrency: config?.searchapiConcurrency ?? 4,
    max_searchapi_checks: config?.maxSearchapiChecks ?? 55,
  };
}

export function APIKeys({
  onAction,
}: {
  apiKeys: ApiKeySummary[];
  webhooks: WebhookSummary[];
  onAction: (action: string, target: string, danger?: boolean) => void;
}) {
  const [runtime, setRuntime] = useState<BotAppRuntimeIntegrationStatus>(() => fallbackRuntimeStatus());
  const [compassRuntime, setCompassRuntime] = useState<CompassAiRuntimeStatus>(() => fallbackCompassRuntimeStatus());
  const [targetingAiRuntime, setTargetingAiRuntime] = useState<TargetingAiRuntimeStatus>(() => fallbackTargetingAiRuntimeStatus());
  const [targetingDraft, setTargetingDraft] = useState<TargetingAiDraft>(() => targetingDraftFromRuntime(fallbackTargetingAiRuntimeStatus()));
  const [targetingTestNiche, setTargetingTestNiche] = useState("coffee shop");
  const [targetingSaving, setTargetingSaving] = useState(false);
  const [relayUrlDraft, setRelayUrlDraft] = useState("");
  const [relayCredentialDraft, setRelayCredentialDraft] = useState("");
  const [webhookDraft, setWebhookDraft] = useState({ label: "Web app", url: "", secret: "" });
  const [savedWebhooks, setSavedWebhooks] = useState<WebhookSummary[]>([]);
  const [backendEndpoints, setBackendEndpoints] = useState<BotAppBackendEndpoint[]>([]);
  const [pendingDestructive, setPendingDestructive] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    action: () => Promise<void> | void;
  } | null>(null);
  const [promptPanel, setPromptPanel] = useState<{ service: AiPromptService; mode: "view" | "edit" } | null>(null);
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadRuntime() {
      const [status, compassStatus, targetingStatus, integrations] = await Promise.all([
        window.botappDesktop?.runtime?.status?.(),
        window.botappDesktop?.compass?.status?.(),
        window.botappDesktop?.targetingAi?.status?.(),
        window.botappDesktop?.integrations?.list?.(),
      ]);
      if (!cancelled && status) setRuntime(status);
      if (!cancelled && compassStatus) {
        setCompassRuntime(compassStatus);
        setRelayUrlDraft(compassStatus.relayOrigin ?? "");
      }
      if (!cancelled && targetingStatus) {
        setTargetingAiRuntime(targetingStatus);
        setTargetingDraft(targetingDraftFromRuntime(targetingStatus));
      }
      if (!cancelled && integrations?.webhooks) setSavedWebhooks(integrations.webhooks);
      const endpoints = await window.botappDesktop?.endpoints?.list?.();
      if (!cancelled && endpoints) setBackendEndpoints(endpoints);
    }
    void loadRuntime();
    return () => { cancelled = true; };
  }, []);

  const activeWebhooks = useMemo(() => savedWebhooks.filter((hook) => hook.status === "active").length, [savedWebhooks]);
  const relayConfigured = compassRuntime.relayUrlConfigured;
  const compassReady = compassRuntime.status === "ready" && compassRuntime.serverKeyStatus === "configured";
  const targetingReady = targetingAiRuntime.status === "ready"
    && targetingAiRuntime.openaiKeyConfigured
    && targetingAiRuntime.searchapiKeyConfigured
    && targetingAiRuntime.config?.enabled === true;
  const targetingConfigReady = Boolean(
    relayConfigured
    && targetingAiRuntime.config
    && targetingAiRuntime.config.backendPending !== true
    && targetingAiRuntime.config.editable !== false,
  );
  const checklist = [
    { label: "Relay URL configured", ok: relayConfigured },
    { label: "Relay reachable", ok: compassRuntime.status === "ready" },
    { label: "Relay credential configured", ok: compassRuntime.relayKeyConfigured },
    { label: "Compass health ready", ok: compassReady },
    { label: "Server OpenAI key configured", ok: compassRuntime.serverKeyStatus === "configured" },
    { label: "Latest successful analysis", ok: Boolean(compassRuntime.lastAnalysisAt) },
  ];

  function prepare(action: string, target: string, danger = false) {
    onAction(action, target, danger);
    setMessage(`${action} is relay-ready. Backend execution is not enabled from this screen yet.`);
  }

  function scrollToRelay() {
    document.getElementById("compass-ai-relay")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function requestDestructive(input: { title: string; message: string; confirmLabel: string; action: () => Promise<void> | void }) {
    setPendingDestructive(input);
  }

  async function confirmDestructive() {
    const action = pendingDestructive?.action;
    setPendingDestructive(null);
    await action?.();
  }

  async function refreshRuntime() {
    const [status, compassStatus, targetingStatus] = await Promise.all([
      window.botappDesktop?.runtime?.status?.(),
      window.botappDesktop?.compass?.status?.(),
      window.botappDesktop?.targetingAi?.status?.(),
    ]);
    if (status) setRuntime(status);
    if (compassStatus) setCompassRuntime(compassStatus);
    if (targetingStatus) setTargetingAiRuntime(targetingStatus);
    setMessage(targetingStatus?.message ?? compassStatus?.message ?? noRelayMessage);
  }

  async function useLocalRelayForTargetingAi() {
    const localRelay = "http://localhost:3000/api/instagram-dashboard/compass/analyze";
    setRelayUrlDraft(localRelay);
    try {
      const status = await window.botappDesktop?.compass?.saveRelayConfig?.({
        relayUrl: localRelay,
        relayCredential: relayCredentialDraft || undefined,
      });
      if (status) {
        setCompassRuntime(status);
        setMessage("Relay URL switched to local backend for Targeting AI validation.");
        await refreshTargetingAi();
        return;
      }
      setMessage("Switch relay URL in the packaged BotApp runtime to validate Targeting AI locally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not switch relay URL.");
    }
  }

  async function refreshTargetingAi() {
    const targetingStatus = await window.botappDesktop?.targetingAi?.status?.();
    if (targetingStatus) {
      setTargetingAiRuntime(targetingStatus);
      setTargetingDraft(targetingDraftFromRuntime(targetingStatus));
      setMessage(targetingStatus.message);
    }
  }

  async function saveTargetingAiConfigNow() {
    setTargetingSaving(true);
    try {
      const result = await window.botappDesktop?.targetingAi?.saveConfig?.(targetingDraft);
      if (result?.runtime) {
        setTargetingAiRuntime(result.runtime);
        setTargetingDraft(targetingDraftFromRuntime(result.runtime));
      }
      setMessage(result?.ok
        ? "Targeting AI config saved to backend. Client searches will use the active prompt."
        : (result?.error ?? "Targeting AI config could not be saved."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Targeting AI config could not be saved.");
    } finally {
      setTargetingSaving(false);
    }
  }

  function saveTargetingAiConfig() {
    if (!relayConfigured) {
      setMessage("Configure the relay before saving targeting AI config.");
      return;
    }
    void saveTargetingAiConfigNow();
  }

  async function resetTargetingAiConfigNow() {
    setTargetingSaving(true);
    try {
      const result = await window.botappDesktop?.targetingAi?.resetConfig?.();
      if (result?.runtime) {
        setTargetingAiRuntime(result.runtime);
        setTargetingDraft(targetingDraftFromRuntime(result.runtime));
      }
      setMessage(result?.ok
        ? "Targeting AI config reset to code default."
        : (result?.error ?? "Targeting AI config could not be reset."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Targeting AI config could not be reset.");
    } finally {
      setTargetingSaving(false);
    }
  }

  function resetTargetingAiConfig() {
    requestDestructive({
      title: "Reset Targeting AI config?",
      message: "This removes the saved DB prompt/config and restores the code default targeting_ai_v1 prompt on the backend.",
      confirmLabel: "Reset to default",
      action: resetTargetingAiConfigNow,
    });
  }

  async function testTargetingAiConfig() {
    const result = await window.botappDesktop?.targetingAi?.testConfig?.({
      niche: targetingTestNiche,
      locationLabel: "Paris, France",
    });
    if (!result) {
      setMessage("Targeting AI test is available only in the packaged app runtime.");
      return;
    }
    if (!result.ok) {
      setMessage(result.error ?? "Targeting AI test failed.");
      return;
    }
    setMessage(`Dry-run OK · ${result.data?.gpt_candidates_count ?? 0} GPT seeds · ${result.data?.prompt_source ?? "unknown"} · ${result.data?.prompt_version ?? "unknown"}.`);
  }

  async function refreshEndpoints() {
    const endpoints = await window.botappDesktop?.endpoints?.list?.();
    if (endpoints) setBackendEndpoints(endpoints);
  }

  async function testEndpoint(id: string) {
    const result = await window.botappDesktop?.endpoints?.test?.({ id });
    await refreshEndpoints();
    setMessage(result?.ok ? `${id}: connected.` : `${id}: ${result?.lastSafeError ?? "Endpoint test failed."}`);
  }

  async function testAllEndpoints() {
    const result = await window.botappDesktop?.endpoints?.testAll?.();
    if (result?.endpoints) setBackendEndpoints(result.endpoints);
    const notConnected = result?.results.filter((item) => item.status !== "connected").length ?? 0;
    setMessage(notConnected ? `${notConnected} endpoint(s) need attention.` : "All tested endpoints connected.");
  }

  async function copyEndpointList() {
    const lines = backendEndpoints.map((endpoint) => `${endpoint.method} ${endpoint.path} · ${endpoint.usedBy.join(", ")} · ${endpoint.testStatus}`);
    await navigator.clipboard?.writeText(lines.join("\n"));
    setMessage("Endpoint list copied.");
  }

  async function exportConnectionProfile() {
    const profile = await window.botappDesktop?.endpoints?.exportProfile?.();
    if (!profile) {
      setMessage("Connection profile export is available only in the packaged app runtime.");
      return;
    }
    await navigator.clipboard?.writeText(JSON.stringify(profile, null, 2));
    setMessage("Connection profile copied.");
  }

  async function saveRelayConfig() {
    try {
      const status = await window.botappDesktop?.compass?.saveRelayConfig?.({
        relayUrl: relayUrlDraft,
        relayCredential: relayCredentialDraft,
      });
      if (status) {
        setCompassRuntime(status);
        setRelayUrlDraft(status.relayOrigin ?? relayUrlDraft);
        setRelayCredentialDraft("");
        setMessage(status.message);
        return;
      }
      setMessage("Relay config can be saved only from the packaged app runtime.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Relay config could not be saved.");
    }
  }

  async function removeRelayConfigNow() {
    const status = await window.botappDesktop?.compass?.removeRelayConfig?.();
    if (status) {
      setCompassRuntime(status);
      setRelayUrlDraft("");
      setRelayCredentialDraft("");
      setMessage(status.message);
      return;
    }
    setMessage("Relay config can be removed only from the packaged app runtime.");
  }

  function removeRelayConfig() {
    requestDestructive({
      title: "Remove Compass AI relay config?",
      message: "This will remove the saved relay URL and auth token for this Mac. Compass AI recommendations will stop working until the relay is configured again.",
      confirmLabel: "Remove config",
      action: removeRelayConfigNow,
    });
  }

  async function analyzeSampleSafely() {
    const result = await window.botappDesktop?.compass?.analyze?.({
      period: "7d",
      snapshot: {
        provider: "openai",
        mode: "server_side_openai",
        facts: { generatedAt: new Date().toISOString(), insights: [], recommendations: [], internalSignals: [] },
        outputContract: { format: "json", mustNotInventFacts: true, allowedFields: ["priority", "explanation", "recommended_order", "risk_notes"] },
      },
    });
    if (result) {
      setCompassRuntime(result.runtime);
      setMessage(result.ok ? "AI recommendations generated through secure relay." : (result.error ?? result.runtime.message));
      return;
    }
    setMessage(noRelayMessage);
  }

  async function saveWebhook() {
    try {
      const result = await window.botappDesktop?.integrations?.saveWebhook?.({
        label: webhookDraft.label,
        url: webhookDraft.url,
        secret: webhookDraft.secret,
        events: webhookEvents,
      });
      if (result?.webhooks) {
        setSavedWebhooks(result.webhooks);
        setWebhookDraft({ label: "Web app", url: "", secret: "" });
        setMessage("Webhook saved locally. Delivery testing remains backend pending.");
        return;
      }
      prepare("Save webhook", webhookDraft.label || "Webhook");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Webhook could not be saved.");
    }
  }

  async function removeWebhookNow(id: string) {
    const result = await window.botappDesktop?.integrations?.removeWebhook?.({ id });
    if (result?.webhooks) {
      setSavedWebhooks(result.webhooks);
      setMessage("Webhook removed from local BotApp config.");
      return;
    }
    prepare("Remove webhook", id, true);
  }

  function removeWebhook(id: string) {
    requestDestructive({
      title: "Remove webhook?",
      message: "This will remove the saved webhook configuration for this Mac. Delivery will stay disabled until the webhook is added again.",
      confirmLabel: "Remove webhook",
      action: () => removeWebhookNow(id),
    });
  }

  function previewDestructive(action: string, target: string, confirmLabel: string) {
    requestDestructive({
      title: `${action}?`,
      message: "This is a destructive integration action. It will require backend relay support and should only be confirmed when you understand the impact. No secret value will be shown.",
      confirmLabel,
      action: () => prepare(action, target, true),
    });
  }

  function viewPrompt(service: AiPromptService) {
    setPromptPanel({ service, mode: "view" });
  }

  function editPrompt(service: AiPromptService) {
    setPromptDrafts((drafts) => ({
      ...drafts,
      [service.service]: drafts[service.service] ?? service.defaultPrompt,
    }));
    setPromptPanel({ service, mode: "edit" });
  }

  function savePromptDraft(service: AiPromptService) {
    setPromptPanel(null);
    setMessage(`${service.name} prompt draft saved locally for review only. It is not active until future server activation.`);
  }

  function restorePromptDefault(service: AiPromptService) {
    setPromptDrafts((drafts) => ({ ...drafts, [service.service]: service.defaultPrompt }));
    setMessage(`${service.name} default prompt restored in the local draft. Server activation is backend pending.`);
  }

  return (
    <div className="integrations-screen">
      <header className="integrations-header">
        <div>
          <span>{relayConfigured ? "Relay configured" : "Setup required"}</span>
          <h2>API / Webhooks / Keys</h2>
          <p>Configure the secure relay for this Mac. Compass AI is live only after relay health succeeds; future API keys, webhooks, and public tunnel features are clearly marked when backend support is pending.</p>
        </div>
        <div className="hero-actions">
          <Badge tone={compassRuntime.status === "ready" ? "success" : compassRuntime.status === "unavailable" ? "error" : "warning"} dot>{gatewayLabel(compassRuntime)}</Badge>
          <Button variant="primary" onClick={scrollToRelay}>Configure Compass AI relay</Button>
          <Button onClick={() => prepare("Open setup instructions", "Compass AI relay setup")}>Open setup instructions</Button>
        </div>
      </header>

      <section className="integrations-kpis" aria-label="Gateway status summary">
        <Kpi label="Gateway" value={relayConfigured ? "Configured" : "Setup required"} detail={runtime.environment} tone={relayConfigured ? "success" : "warning"} />
        <Kpi label="Relay" value={compassRuntime.status === "ready" ? "Connected" : "Not connected"} detail={compassRuntime.relayOrigin ?? "Relay URL missing"} tone={compassRuntime.status === "ready" ? "success" : "warning"} />
        <Kpi label="Compass AI" value={compassReady ? "Ready" : "Not ready"} detail={`Server key ${compassRuntime.serverKeyStatus}`} tone={compassReady ? "success" : "warning"} />
        <Kpi label="Webhooks" value={String(activeWebhooks)} detail={activeWebhooks ? "configured locally" : "none configured"} tone={activeWebhooks ? "success" : "neutral"} />
        <Kpi label="Scoped Keys" value="0" detail="backend pending" tone="neutral" />
      </section>

      <section className="gateway-grid compact">
        <Card title="Connection checklist" subtitle="Actionable setup state for this Mac.">
          <div className="checklist">
            {checklist.map((item) => <CheckRow key={item.label} label={item.label} ok={item.ok} />)}
          </div>
        </Card>

        <Card title="Gateway status" subtitle="Only configured values are shown as active.">
          <div className="status-stack">
            <StatusTile label="Local gateway" status={runtime.localGateway.status} detail={`${runtime.localGateway.transport} · ${runtime.localGateway.mode}`} />
            <StatusTile label="Secure relay" status={relayIntegrationStatus(compassRuntime)} detail={compassRuntime.relayOrigin ?? "Not configured"} />
            <StatusTile label="Shared backend" status={runtime.dashboardBackend.status} detail={runtime.dashboardBackend.baseUrl} />
          </div>
        </Card>

        <Card title="Public Access / Relay Endpoint" subtitle="Tunnel controls stay inactive until a real endpoint is configured.">
          <div className="public-access">
            <Badge tone={relayConfigured ? "success" : "neutral"}>{relayConfigured ? "Relay URL available" : "Public tunnel not configured yet."}</Badge>
            <label>
              <span>Relay origin</span>
              <code>{relayConfigured ? redactText(compassRuntime.relayOrigin) : "Not configured"}</code>
            </label>
            <div className="button-row">
              <Button disabled={!relayConfigured} onClick={() => prepare("Copy relay URL", compassRuntime.relayOrigin ?? "relay")}>Copy relay URL</Button>
              <Button disabled={!relayConfigured} onClick={() => prepare("Export connection profile", "connection-profile")}>Export connection profile</Button>
              <Button onClick={() => prepare("Setup public tunnel later", "public-access")}>Setup later</Button>
            </div>
          </div>
        </Card>
      </section>

      <Card title="BotApp Backend Endpoints" subtitle="Central registry of backend routes used or expected by BotApp. No secrets, raw headers, or payloads are shown.">
        <div className="endpoint-registry-actions">
          <Button onClick={() => prepare("Add endpoint", "botapp-endpoint-registry")}>Add endpoint</Button>
          <Button onClick={testAllEndpoints}>Test all endpoints</Button>
          <Button onClick={copyEndpointList}>Copy endpoint list</Button>
          <Button onClick={exportConnectionProfile}>Export connection profile</Button>
          <Button onClick={refreshEndpoints}>Refresh registry</Button>
        </div>
        <div className="endpoint-registry-table-wrap">
          <table className="endpoint-registry-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Used by</th>
                <th>Purpose</th>
                <th>Auth</th>
                <th>Status</th>
                <th>Last test</th>
                <th>Last code</th>
                <th>Last safe error</th>
                <th>Test</th>
              </tr>
            </thead>
            <tbody>
              {backendEndpoints.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td><code>{endpoint.method}</code></td>
                  <td><code>{endpoint.path}</code></td>
                  <td>{endpoint.usedBy.join(", ")}</td>
                  <td>{endpoint.purpose}</td>
                  <td>{endpoint.authRequired ? "Yes" : "No"}</td>
                  <td><EndpointStatus endpoint={endpoint} /></td>
                  <td>{endpoint.lastTestAt ?? "Never"}</td>
                  <td>{endpoint.lastStatusCode ?? "N/A"}</td>
                  <td>{endpoint.lastSafeError ?? "None"}</td>
                  <td><Button disabled={endpoint.status !== "active"} onClick={() => testEndpoint(endpoint.id)}>Test</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Compass AI Relay" subtitle="Primary setup for production AI recommendations." id="compass-ai-relay">
        <div className="relay-console">
          <label>
            <span>Relay URL</span>
            <Input value={relayUrlDraft} onChange={setRelayUrlDraft} placeholder="https://your-backend.example/api/instagram-dashboard/compass/analyze" mono type="url" />
          </label>
          <label>
            <span>Relay credential</span>
            <Input value={relayCredentialDraft} onChange={setRelayCredentialDraft} placeholder={compassRuntime.relayKeyConfigured ? "Configured. Enter a new credential to rotate." : "Paste scoped relay credential"} mono type="password" />
            <small>Write-only from renderer. Electron main stores it and returns only configured/missing state.</small>
          </label>
          <div className="relay-status-grid">
            <StatusPill label="Relay URL" value={relayConfigured ? "configured" : "missing"} tone={relayConfigured ? "success" : "warning"} />
            <StatusPill label="Relay" value={compassRuntime.status === "ready" ? "connected" : "disconnected"} tone={compassRuntime.status === "ready" ? "success" : "warning"} />
            <StatusPill label="Server OpenAI key" value={compassRuntime.serverKeyStatus} tone={compassRuntime.serverKeyStatus === "configured" ? "success" : compassRuntime.serverKeyStatus === "missing" ? "error" : "warning"} />
            <StatusPill label="Relay credential" value={compassRuntime.relayKeyConfigured ? "configured" : "missing"} tone={compassRuntime.relayKeyConfigured ? "success" : "warning"} />
          </div>
          <div className="relay-meta">
            <span>Last relay health check: {compassRuntime.lastConnectionTestAt ?? "Not tested"}</span>
            <span>Last AI analysis: {compassRuntime.lastAnalysisAt ?? "Not analyzed"}</span>
            <span>Last safe error: {compassRuntime.lastSafeError ?? "None"}</span>
          </div>
          <div className="button-row">
            <Button variant="primary" onClick={saveRelayConfig}>Save relay config</Button>
            <Button onClick={refreshRuntime}>Test relay connection</Button>
            <Button onClick={analyzeSampleSafely}>Test AI through relay</Button>
            <Button variant="danger" onClick={removeRelayConfig}>Remove config</Button>
          </div>
          {!relayConfigured ? <EmptyState title="Relay not configured." detail={noRelayMessage} /> : null}
        </div>
      </Card>

      <Card title="Targeting AI" subtitle="Editable server-side prompt for client dashboard ciblage. GPT proposes seeds; SearchAPI verifies account facts." id="targeting-ai">
        <div className="relay-console targeting-ai-editor">
          <div className="relay-status-grid">
            <StatusPill label="Enabled" value={targetingAiRuntime.config?.enabled ? "yes" : "no"} tone={targetingAiRuntime.config?.enabled ? "success" : "warning"} />
            <StatusPill label="Provider" value={targetingAiRuntime.config?.provider ?? "openai"} tone="neutral" />
            <StatusPill label="Model" value={targetingDraft.model} tone="neutral" />
            <StatusPill label="Prompt version" value={targetingAiRuntime.config?.promptVersion ?? "targeting_ai_v1"} tone="success" />
            <StatusPill label="Prompt source" value={targetingAiRuntime.config?.promptSource ?? "code_default"} tone={targetingAiRuntime.config?.promptSource === "db_custom" ? "success" : "neutral"} />
            <StatusPill label="OpenAI key" value={targetingAiRuntime.openaiKeyConfigured ? "configured" : "missing"} tone={targetingAiRuntime.openaiKeyConfigured ? "success" : "error"} />
            <StatusPill label="SearchAPI key" value={targetingAiRuntime.searchapiKeyConfigured ? "configured" : "missing"} tone={targetingAiRuntime.searchapiKeyConfigured ? "success" : "error"} />
          </div>
          <div className="prompt-notice">
            <strong>GPT-4.1-mini</strong>
            <span>generates strategy, search angles, and seed usernames only.</span>
            <strong>SearchAPI</strong>
            <span>verifies real accounts and provides followers, avatar, verified/private, and eligibility inputs.</span>
          </div>
          {targetingAiRuntime.config?.backendPending ? (
            <EmptyState title="Backend migration pending." detail="Apply migration supabase/migrations/20260615_ig_system_settings.sql before saving custom prompts." />
          ) : null}
          {!targetingConfigReady && relayConfigured && targetingAiRuntime.status === "unavailable" ? (
            <EmptyState
              title="Targeting AI routes unavailable on current relay."
              detail={`${targetingAiRuntime.message} Use the local backend while frontend changes are not deployed to production.`}
            />
          ) : null}
          {!relayConfigured ? (
            <EmptyState title="Relay not configured." detail="Configure the Compass relay before editing targeting AI config." />
          ) : null}
          <label>
            <span>System prompt</span>
            <textarea
              value={targetingDraft.system_prompt}
              onChange={(event) => setTargetingDraft((draft) => ({ ...draft, system_prompt: event.target.value }))}
              rows={6}
            />
          </label>
          <label>
            <span>User prompt template</span>
            <textarea
              value={targetingDraft.user_prompt_template}
              onChange={(event) => setTargetingDraft((draft) => ({ ...draft, user_prompt_template: event.target.value }))}
              rows={14}
            />
            <small>Required placeholders: {"{{niche}}"}, {"{{max_candidates}}"}, {"{{min_followers}}"} · Optional: {"{{location_line}}"}, {"{{pass_instruction}}"}, {"{{max_followers}}"}, {"{{verified_rule}}"}</small>
          </label>
          <div className="targeting-limits-grid">
            <label><span>Max GPT candidates</span><Input value={String(targetingDraft.max_gpt_candidates)} onChange={(value) => setTargetingDraft((draft) => ({ ...draft, max_gpt_candidates: Number(value) || draft.max_gpt_candidates }))} mono /></label>
            <label><span>Max displayed results</span><Input value={String(targetingDraft.max_displayed_results)} onChange={(value) => setTargetingDraft((draft) => ({ ...draft, max_displayed_results: Number(value) || draft.max_displayed_results }))} mono /></label>
            <label><span>Min followers</span><Input value={String(targetingDraft.min_followers)} onChange={(value) => setTargetingDraft((draft) => ({ ...draft, min_followers: Number(value) || draft.min_followers }))} mono /></label>
            <label><span>Max followers</span><Input value={String(targetingDraft.max_followers)} onChange={(value) => setTargetingDraft((draft) => ({ ...draft, max_followers: Number(value) || draft.max_followers }))} mono /></label>
            <label><span>Min eligible target</span><Input value={String(targetingDraft.min_eligible_target)} onChange={(value) => setTargetingDraft((draft) => ({ ...draft, min_eligible_target: Number(value) || draft.min_eligible_target }))} mono /></label>
            <label><span>Temperature</span><Input value={String(targetingDraft.temperature)} onChange={(value) => setTargetingDraft((draft) => ({ ...draft, temperature: Number(value) || draft.temperature }))} mono /></label>
            <label><span>SearchAPI concurrency</span><Input value={String(targetingDraft.searchapi_concurrency)} onChange={(value) => setTargetingDraft((draft) => ({ ...draft, searchapi_concurrency: Number(value) || draft.searchapi_concurrency }))} mono /></label>
            <label><span>Max SearchAPI checks</span><Input value={String(targetingDraft.max_searchapi_checks)} onChange={(value) => setTargetingDraft((draft) => ({ ...draft, max_searchapi_checks: Number(value) || draft.max_searchapi_checks }))} mono /></label>
          </div>
          <div className="targeting-toggle-row">
            <label><input type="checkbox" checked={targetingDraft.allow_verified} onChange={(event) => setTargetingDraft((draft) => ({ ...draft, allow_verified: event.target.checked }))} /> Allow verified accounts in prompt hints</label>
            <label><input type="checkbox" checked={targetingDraft.second_pass_enabled} onChange={(event) => setTargetingDraft((draft) => ({ ...draft, second_pass_enabled: event.target.checked }))} /> Second pass enabled</label>
          </div>
          <div className="relay-meta">
            <span>Last updated: {targetingAiRuntime.config?.lastUpdated ?? "Default code prompt"}</span>
            <span>Updated by: {targetingAiRuntime.config?.updatedBy ?? "n/a"}</span>
            <span>Last config check: {targetingAiRuntime.lastCheckedAt ?? "Not tested"}</span>
          </div>
          <label>
            <span>Dry-run test niche</span>
            <Input value={targetingTestNiche} onChange={setTargetingTestNiche} placeholder="coffee shop" />
          </label>
          <div className="button-row">
            <Button variant="primary" onClick={saveTargetingAiConfig} disabled={!targetingConfigReady || targetingSaving}>Save active config</Button>
            <Button onClick={resetTargetingAiConfig} disabled={!targetingConfigReady || targetingSaving}>Reset to default</Button>
            <Button onClick={refreshTargetingAi} disabled={!relayConfigured || targetingSaving}>Refresh</Button>
            <Button onClick={testTargetingAiConfig} disabled={!targetingConfigReady || targetingSaving}>Test config</Button>
            <Button onClick={useLocalRelayForTargetingAi} disabled={targetingSaving}>Use local relay</Button>
            <Button onClick={() => testEndpoint("targeting_ai_health")} disabled={!relayConfigured}>Test health</Button>
          </div>
          {relayConfigured && !targetingReady ? <EmptyState title="Targeting AI not fully ready." detail={targetingAiRuntime.message} /> : null}
        </div>
      </Card>

      <Card title="AI Modules" subtitle="Compass AI is relay-backed now. Targeting AI config is visible when relay health succeeds.">
        <div className="module-grid">
          <AiModuleCard title="Compass AI" badge={compassReady ? "Active" : relayConfigured ? "Configured" : "Not configured"} tone={compassReady ? "success" : relayConfigured ? "warning" : "neutral"} detail="Account health analysis and operator recommendations through the secure relay." meta={`${compassRuntime.provider} through relay · ${compassRuntime.model} · Last analysis ${compassRuntime.lastAnalysisAt ?? "not available"}`} actions={<><Button onClick={scrollToRelay}>Configure</Button><Button onClick={analyzeSampleSafely}>Test</Button><Button onClick={() => prepare("Open Compass", "compass")}>Open Compass</Button></>} />
          <AiModuleCard title="Comment AI" badge="Planned" tone="neutral" detail="Future comment generation and moderation support." meta="Backend pending" actions={<Button disabled>Setup later</Button>} />
          <AiModuleCard title="Targeting AI" badge={targetingReady ? "Active" : relayConfigured ? "Configured" : "Not configured"} tone={targetingReady ? "success" : relayConfigured ? "warning" : "neutral"} detail="Client dashboard ciblage: GPT search strategy + SearchAPI verification." meta={`${targetingAiRuntime.config?.provider ?? "openai"} · ${targetingAiRuntime.config?.model ?? "gpt-4.1-mini"} · ${targetingAiRuntime.config?.promptVersion ?? "targeting_ai_v1"}`} actions={<><Button onClick={() => document.getElementById("targeting-ai")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Configure</Button><Button onClick={refreshTargetingAi}>Test</Button></>} />
          <AiModuleCard title="DM AI" badge="Planned" tone="neutral" detail="Future DM drafting and response classification." meta="Backend pending" actions={<Button disabled>Setup later</Button>} />
        </div>
      </Card>

      <Card title="AI Prompts" subtitle="View prompt configuration. Active prompts live server-side; BotApp can prepare drafts but cannot bypass locked guardrails.">
        <div className="prompt-notice">
          <strong>Prompt changes affect wording and prioritization only.</strong>
          <span>Facts-only grounding, category allowlists, schema validation, destructive-action blocks, and client-safe/internal split cannot be disabled.</span>
        </div>
        <div className="prompt-grid">
          {aiPromptServices.map((service) => {
            const card = service.service === "targeting_ai"
              ? buildTargetingPromptService(targetingAiRuntime)
              : service;
            const isTargeting = card.service === "targeting_ai";
            return (
            <article key={card.service} className={`prompt-card ${card.status === "active" ? "active" : "planned"}`}>
              <div className="prompt-card-header">
                <div>
                  <span>{card.service}</span>
                  <h3>{card.name}</h3>
                </div>
                <Badge tone={card.status === "active" ? "success" : "neutral"}>{card.status}</Badge>
              </div>
              <p>{isTargeting ? (targetingAiRuntime.config?.promptSource === "db_custom" ? "Custom prompt active on relay backend." : card.promptPreview) : card.promptPreview}</p>
              <div className="prompt-meta">
                <StatusPill label="Prompt source" value={card.source} tone={card.source === "default" ? "neutral" : "success"} />
                <StatusPill label="Active version" value={card.version} tone={card.status === "active" ? "success" : "neutral"} />
                <StatusPill label="Last updated" value={card.lastUpdatedAt ?? "Default"} tone="neutral" />
                <StatusPill label="Backend sync" value={card.backendSyncStatus} tone={card.backendSyncStatus === "backend pending" ? "warning" : "success"} />
              </div>
              {card.service === "compass_ai" ? (
                <small>Relay/server-side prompt. The facts-only validator still filters every recommendation after AI output.</small>
              ) : isTargeting ? (
                <small>Edit the live prompt in the Targeting AI card above. GPT proposes seeds only; SearchAPI verifies followers, avatar, and eligibility inputs.</small>
              ) : (
                <small>Planned module. UI contract is prepared, but no prompt is active in production.</small>
              )}
              <div className="button-row compact">
                {isTargeting ? (
                  <>
                    <Button onClick={() => document.getElementById("targeting-ai")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Open editor</Button>
                    <Button onClick={refreshTargetingAi}>Refresh</Button>
                    <Button onClick={testTargetingAiConfig} disabled={!targetingConfigReady}>Test config</Button>
                  </>
                ) : (
                  <>
                    <Button onClick={() => viewPrompt(card)}>View prompt</Button>
                    <Button onClick={() => editPrompt(card)}>Edit prompt</Button>
                    <Button onClick={() => restorePromptDefault(card)}>Restore default</Button>
                    <Button disabled>Activate prompt · Backend pending</Button>
                    <Button disabled>Test prompt · Backend pending</Button>
                  </>
                )}
              </div>
            </article>
          )})}
        </div>
      </Card>

      <Card title="Scoped API Keys" subtitle="Generation is backend pending. This screen does not pretend keys exist before the relay exposes them.">
        <div className="truthful-section">
          {compassRuntime.relayKeyConfigured ? (
            <article className="local-config-card">
              <div>
                <span>Relay credential</span>
                <strong>Configured locally</strong>
                <small>Prefix and usage are not available until the backend key registry is connected.</small>
              </div>
              <Badge tone="warning">Local config</Badge>
            </article>
          ) : (
            <EmptyState title="No scoped keys configured yet." detail="Create or connect a relay key. Backend key generation is not live in BotApp yet." />
          )}
          <div className="button-row">
            <Button onClick={scrollToRelay}>Add relay credential</Button>
            <Button onClick={saveRelayConfig}>Save</Button>
            <Button onClick={refreshRuntime}>Test</Button>
            <Button variant="danger" onClick={removeRelayConfig}>Remove</Button>
            <Button disabled>Generate key · Backend pending</Button>
          </div>
        </div>
      </Card>

      <EmailTemplatesSection />

      <Card title="External Webhooks" subtitle="Local configuration is available. Real delivery, testing, and retries remain backend pending.">
        <div className="webhook-form">
          <Input value={webhookDraft.label} onChange={(label) => setWebhookDraft((draft) => ({ ...draft, label }))} placeholder="Webhook label" />
          <Input value={webhookDraft.url} onChange={(url) => setWebhookDraft((draft) => ({ ...draft, url }))} placeholder="https://your-app.example/api/bot-events" mono type="url" />
          <Input value={webhookDraft.secret} onChange={(secret) => setWebhookDraft((draft) => ({ ...draft, secret }))} placeholder="Optional signing value" mono type="password" />
          <div className="event-chip-grid">{webhookEvents.map((event) => <span key={event}>{event}</span>)}</div>
          <Button onClick={saveWebhook}>Save webhook</Button>
        </div>
        {savedWebhooks.length ? (
          <div className="webhook-grid">
            {savedWebhooks.map((hook) => (
              <article key={hook.id} className="webhook-card">
                <div>
                  <span>{hook.provider}</span>
                  <strong>{redactText(hook.url)}</strong>
                  <small>{hook.events.join(", ")}</small>
                </div>
                <div className="webhook-status">
                  <Badge tone={hook.status === "active" ? "success" : "neutral"}>{hook.status}</Badge>
                  <Badge tone="warning">Delivery backend pending</Badge>
                  <small>{hook.lastDeliveryAt ?? "No delivery yet"} · {hook.latestError ?? "No error"}</small>
                </div>
                <div className="button-row compact">
                  <Button disabled>Test · Backend pending</Button>
                  <Button disabled>Retry · Backend pending</Button>
                  <Button disabled onClick={() => previewDestructive("Disable webhook", hook.id, "Disable webhook")}>Disable · Backend pending</Button>
                  <Button variant="danger" onClick={() => removeWebhook(hook.id)}>Remove</Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No webhooks configured yet." detail="Add your first webhook. Delivery testing will be enabled when the relay webhook backend is connected." />
        )}
      </Card>

      <Card title="Recent API Calls" subtitle="Only real safe request summaries should appear here.">
        <EmptyState title="No recent API calls yet." detail="Safe request summaries will appear here once the relay receives traffic." />
      </Card>

      <Card title="Security conventions" subtitle="Contracts every integration should follow.">
        <div className="conventions-grid">
          <Convention label="Request id" value="X-Request-Id on every relay call" />
          <Convention label="Idempotency" value="X-Idempotency-Key for writes and retries" />
          <Convention label="External user" value="X-External-User-Id for audit attribution" />
          <Convention label="Dry run" value="dry_run=true for tests and previews" />
          <Convention label="Response" value="{ ok: true, data } / { ok: false, error }" />
          <Convention label="Redaction" value="No full keys, provider credentials, raw logs, XML, artifact paths, or webhook signing values in UI" />
        </div>
      </Card>

      {message ? <div className="integrations-message" role="status">{message}</div> : null}
      {pendingDestructive ? (
        <Modal
          title={pendingDestructive.title}
          confirmLabel={pendingDestructive.confirmLabel}
          danger
          onClose={() => setPendingDestructive(null)}
          onConfirm={confirmDestructive}
        >
          <p>{pendingDestructive.message}</p>
        </Modal>
      ) : null}
      {promptPanel ? (
        <Modal
          title={`${promptPanel.mode === "edit" ? "Edit" : "View"} ${promptPanel.service.name} prompt`}
          confirmLabel={promptPanel.mode === "edit" ? "Save draft" : "Close"}
          onClose={() => setPromptPanel(null)}
          onConfirm={() => {
            if (promptPanel.mode === "edit") savePromptDraft(promptPanel.service);
          }}
        >
          <div className="prompt-modal">
            <Badge tone={promptPanel.service.status === "active" ? "success" : "neutral"}>{promptPanel.service.backendSyncStatus}</Badge>
            <p>Active prompt storage is relay/server-side. Local drafts are not active until future server activation.</p>
            <label>
              <span>Prompt text</span>
              {promptPanel.mode === "edit" ? (
                <textarea
                  value={promptDrafts[promptPanel.service.service] ?? promptPanel.service.defaultPrompt}
                  onChange={(event) => setPromptDrafts((drafts) => ({ ...drafts, [promptPanel.service.service]: event.target.value }))}
                />
              ) : (
                <pre>{promptDrafts[promptPanel.service.service] ?? promptPanel.service.defaultPrompt}</pre>
              )}
            </label>
            <div className="prompt-guardrails">
              <span>Locked guardrails</span>
              {promptPanel.service.guardrails.map((guardrail) => <small key={guardrail}>{guardrail}</small>)}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function fallbackRuntimeStatus(): BotAppRuntimeIntegrationStatus {
  const now = new Date().toISOString();
  return {
    localGateway: { status: "running", mode: "browser", transport: "electron_ipc", port: null, lastHealthCheck: now },
    secureRelay: { status: "disconnected", baseUrl: "Not configured", lastHealthCheck: null },
    dashboardBackend: { status: "disconnected", baseUrl: "Not configured", lastHealthCheck: null },
    compassAi: {
      status: "missing_key",
      mode: "rules_only",
      provider: "OpenAI",
      model: "gpt-5.5",
      relayKeyConfigured: false,
      serverKeyStatus: "unknown",
      relayUrlConfigured: false,
      relayOrigin: null,
      lastTestAt: null,
      lastAnalysisAt: null,
      lastSafeError: null,
      lastProviderErrorCode: null,
      relayEndpoint: "/api/instagram-dashboard/compass/analyze",
    },
    environment: "local",
  };
}

function fallbackCompassRuntimeStatus(): CompassAiRuntimeStatus {
  return {
    mode: "rules_only",
    status: "relay_missing",
    provider: "OpenAI",
    model: "gpt-5.5",
    relayUrlConfigured: false,
    relayOrigin: null,
    relayKeyConfigured: false,
    serverKeyStatus: "unknown",
    lastConnectionTestAt: null,
    lastAnalysisAt: null,
    lastSafeError: null,
    lastProviderErrorCode: null,
    message: noRelayMessage,
  };
}

function fallbackTargetingAiRuntimeStatus(): TargetingAiRuntimeStatus {
  return {
    status: "relay_missing",
    message: "Configure the Compass relay to load targeting AI configuration.",
    relayUrlConfigured: false,
    openaiKeyConfigured: false,
    searchapiKeyConfigured: false,
    config: {
      enabled: false,
      provider: "openai",
      model: "gpt-4.1-mini",
      promptVersion: "targeting_ai_v1",
      promptSource: "code_default",
      systemPrompt: targetingDefaultPrompt,
      userPromptTemplate: "",
      maxGptCandidates: 50,
      maxDisplayedResults: 20,
      minFollowers: 500,
      maxFollowers: 50000,
      minEligibleTarget: 8,
      allowVerified: false,
      secondPassEnabled: true,
      temperature: 0.5,
      searchapiConcurrency: 4,
      maxSearchapiChecks: 55,
      editable: false,
      backendPending: false,
      defaultSystemPrompt: targetingDefaultPrompt,
      defaultUserPromptTemplate: "",
      lastUpdated: null,
      updatedBy: null,
    },
    lastCheckedAt: new Date(0).toISOString(),
  };
}

function gatewayLabel(runtime: CompassAiRuntimeStatus) {
  if (runtime.status === "ready") return "Relay active";
  if (runtime.status === "unavailable") return "Relay disconnected";
  return "Setup required";
}

function toneForStatus(status: IntegrationStatus): BadgeTone {
  if (status === "connected" || status === "running" || status === "configured") return "success";
  if (status === "missing_key" || status === "pending" || status === "unavailable") return "warning";
  return "error";
}

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: BadgeTone }) {
  return <article className={`integrations-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function StatusTile({ label, status, detail }: { label: string; status: IntegrationStatus; detail: string }) {
  return <article className="status-tile"><div><span>{label}</span><strong>{detail}</strong></div><Badge tone={toneForStatus(status)}>{status}</Badge></article>;
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: BadgeTone }) {
  return <div className="status-pill"><span>{label}</span><Badge tone={tone}>{value}</Badge></div>;
}

function EndpointStatus({ endpoint }: { endpoint: BotAppBackendEndpoint }) {
  const tone: BadgeTone = endpoint.testStatus === "connected"
    ? "success"
    : endpoint.testStatus === "failing" || endpoint.testStatus === "not_deployed"
      ? "error"
      : endpoint.testStatus === "auth_protected" || endpoint.testStatus === "planned" || endpoint.testStatus === "untested"
        ? "warning"
        : "neutral";
  const labels: Record<BotAppBackendEndpoint["testStatus"], string> = {
    untested: "Not tested",
    connected: "Connected",
    failing: "Failing",
    auth_protected: "Auth protected",
    not_deployed: "Not deployed",
    planned: "Planned",
    wiring_missing: "Wiring missing",
  };
  const label = labels[endpoint.testStatus] ?? endpoint.testStatus.replaceAll("_", " ");
  return <Badge tone={tone}>{label}</Badge>;
}

function relayIntegrationStatus(runtime: CompassAiRuntimeStatus): IntegrationStatus {
  if (runtime.status === "ready") return "connected";
  if (runtime.mode === "relay") return "unavailable";
  return "missing_key";
}

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return <div className={`check-row ${ok ? "ok" : "pending"}`}><span>{ok ? "OK" : "--"}</span><strong>{label}</strong></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{detail}</span></div>;
}

function AiModuleCard({ title, badge, tone, detail, meta, actions }: { title: string; badge: string; tone: BadgeTone; detail: string; meta: string; actions: ReactNode }) {
  return <article className="module-card"><div><Badge tone={tone}>{badge}</Badge><h3>{title}</h3><p>{detail}</p><small>{meta}</small></div><div className="button-row compact">{actions}</div></article>;
}

function Convention({ label, value }: { label: string; value: string }) {
  return <div className="convention"><span>{label}</span><strong>{value}</strong></div>;
}
