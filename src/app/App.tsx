import { useEffect, useMemo, useState } from "react";
import { mockClient } from "../api/mock-client";
import type { ActivityLogEntry, ApiKeySummary, AppSettings, AutoRestartControl, AutoRestartOverview, BotAppClientAccountsOverview, BotAppCredentialsOverview, BotAppDispatcherHealth, BotAppRelayHealth, BotProfile, CompassActionTarget, CompassAnalyzeResult, CompassAiRuntimeStatus, CompassOverview, Device, DeviceProfileGroup, NotificationItem, WebhookSummary } from "../api/types";
import { Modal, Toasts, type ToastItem } from "../design/components";
import { Sidebar } from "../layout/Sidebar";
import { TopBar } from "../layout/TopBar";
import { Overview } from "../views/Overview";
import { Profiles } from "../views/Profiles";
import { ClientAccounts } from "../views/ClientAccounts";
import { Credentials } from "../views/Credentials";
import { Devices } from "../views/Devices";
import { ActivityLog } from "../views/ActivityLog";
import { RuntimeHealth } from "../views/RuntimeHealth";
import { IncidentNotificationsSettingsView } from "../views/IncidentNotificationsSettings";
import { Compass } from "../views/Compass";
import { AutoRestart } from "../views/AutoRestart";
import { EmailHistory } from "../views/EmailHistory";
import { APIKeys } from "../views/APIKeys";
import { Settings } from "../views/Settings";
import { routes, type RouteId } from "./routes";
import { shouldPollProfilesLiveCounters } from "../views/profiles/run-control";
import "./app.css";

type AppData = {
  profiles: BotProfile[];
  profileGroups: DeviceProfileGroup[];
  clientAccounts: BotAppClientAccountsOverview | null;
  credentials: BotAppCredentialsOverview | null;
  compass: CompassOverview | null;
  autoRestart: AutoRestartOverview | null;
  devices: Device[];
  notifications: NotificationItem[];
  logs: ActivityLogEntry[];
  apiKeys: ApiKeySummary[];
  webhooks: WebhookSummary[];
  settings: AppSettings | null;
};

export type BotAppOverviewData = AppData;

const emptyData: AppData = { profiles: [], profileGroups: [], clientAccounts: null, credentials: null, compass: null, autoRestart: null, devices: [], notifications: [], logs: [], apiKeys: [], webhooks: [], settings: null };

export function App() {
  const [active, setActive] = useState<RouteId>("overview");
  const [, setSelectedProfileId] = useState("prof_001");
  const [selectedCredentialsAccountId, setSelectedCredentialsAccountId] = useState<string | null>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [profilesMeta, setProfilesMeta] = useState<{ source: string; accountsCount: number; counts: Record<string, number> } | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: string; target: string; danger: boolean } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dispatcherHealth, setDispatcherHealth] = useState<BotAppDispatcherHealth | null>(null);
  const [relayHealth, setRelayHealth] = useState<BotAppRelayHealth | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [dispatcherEnsureBusy, setDispatcherEnsureBusy] = useState(false);

  async function loadOverviewData() {
    if (window.botappDesktop?.data?.overview) {
      const result = await window.botappDesktop.data.overview();
      const nextData = result.data;
      const hasUsableProjection = Boolean(
        data.profiles.length
        || data.profileGroups.length
        || data.devices.length
      );
      if (result.ok || !hasUsableProjection) {
        setData(nextData);
      }
      setSyncError(result.error ?? null);
      setProfilesMeta(result.profilesMeta ?? null);
      void loadDispatcherHealth();
      void loadRelayHealth();
      if (!result.ok && result.error) pushToast(result.error, "info");
      return;
    }
    const [profiles, profileGroups, clientAccounts, credentials, compass, autoRestart, devices, notifications, logs, apiKeys, webhooks, settings] = await Promise.all([
      mockClient.listProfiles(), mockClient.listDeviceProfileGroups(), mockClient.listClientAccounts(), mockClient.listCredentialsActions(), mockClient.listCompass(), mockClient.listAutoRestart(), mockClient.listDevices(), mockClient.listNotifications(), mockClient.listActivityLogs(), mockClient.listApiKeys(), mockClient.listWebhooks(), mockClient.listSettings(),
    ]);
    setData({
      profiles: profiles.ok ? profiles.data : [],
      profileGroups: profileGroups.ok ? profileGroups.data : [],
      clientAccounts: clientAccounts.ok ? clientAccounts.data : null,
      credentials: credentials.ok ? credentials.data : null,
      compass: compass.ok ? compass.data : null,
      autoRestart: autoRestart.ok ? autoRestart.data : null,
      devices: devices.ok ? devices.data : [],
      notifications: notifications.ok ? notifications.data : [],
      logs: logs.ok ? logs.data : [],
      apiKeys: apiKeys.ok ? apiKeys.data : [],
      webhooks: webhooks.ok ? webhooks.data : [],
      settings: settings.ok ? settings.data : null,
    });
    setSyncError(null);
    setProfilesMeta(null);
    void loadDispatcherHealth();
    void loadRelayHealth();
  }

  async function loadDispatcherHealth() {
    const result = await window.botappDesktop?.dispatcher?.status?.();
    if (result) setDispatcherHealth(result);
  }

  async function loadRelayHealth() {
    const result = await window.botappDesktop?.relay?.health?.();
    if (result) setRelayHealth(result);
  }

  async function repairConnection() {
    if (repairBusy) return;
    setRepairBusy(true);
    try {
      const result = await window.botappDesktop?.relay?.repair?.();
      if (result?.relay) setRelayHealth(result.relay);
      await loadOverviewData();
      await loadDispatcherHealth();
      pushToast(result?.message || (result?.ok ? "BotApp connection operational." : "Repair unavailable."), result?.ok ? "success" : "error");
    } finally {
      setRepairBusy(false);
    }
  }

  async function ensureDispatcher() {
    if (dispatcherEnsureBusy) return;
    setDispatcherEnsureBusy(true);
    try {
      const result = await window.botappDesktop?.dispatcher?.ensure?.();
      if (result) setDispatcherHealth(result);
      pushToast(
        result?.status === "running" ? "Dispatcher: running." : (result?.message || "Dispatcher unavailable."),
        result?.status === "running" ? "success" : "error",
      );
    } finally {
      setDispatcherEnsureBusy(false);
    }
  }

  async function copyRelayDiagnostics() {
    if (!relayHealth) return;
    const provenance = await window.botappDesktop?.diagnostics?.provenance?.().catch(() => null);
    const payload = {
      ok: relayHealth.ok,
      reason: relayHealth.reason,
      relay_authenticated: relayHealth.relay_authenticated,
      backend_configured: relayHealth.backend_configured,
      backend_key: relayHealth.backend_key,
      provided_key: relayHealth.provided_key,
      routes: relayHealth.routes,
      checkedAt: relayHealth.checkedAt,
      provenance,
    };
    void navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
    pushToast("Relay diagnostics copied.", "success");
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await loadOverviewData();
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const profilesNeedLiveCounters = useMemo(
    () => data.profiles.some((profile) => shouldPollProfilesLiveCounters(profile)),
    [data.profiles],
  );

  useEffect(() => {
    if (!profilesNeedLiveCounters) return;
    const interval = window.setInterval(() => {
      void loadOverviewData();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [profilesNeedLiveCounters]);

  const counts = useMemo(() => ({ profiles: data.profiles.length, devices: data.devices.length, notifications: data.notifications.filter((item) => !item.acknowledged).length }), [data]);

  function pushToast(message: string, tone: ToastItem["tone"] = "info") {
    const id = Date.now();
    setToasts((items) => [...items, { id, tone, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3800);
  }

  function requestAction(action: string, target: string, danger = false) {
    setPendingAction({ action, target, danger });
  }

  async function confirmAction() {
    if (!pendingAction) return;
    const result = await mockClient.previewAction(pendingAction.action, pendingAction.target);
    pushToast(result.ok ? result.data.message : result.error.message, pendingAction.danger ? "error" : "success");
  }

  function navigate(route: RouteId) {
    setActive(route);
    setCommandOpen(false);
  }

  useEffect(() => {
    function onCaptureNavigate(event: Event) {
      const route = (event as CustomEvent<{ route?: RouteId }>).detail?.route;
      if (route) navigate(route);
    }
    window.addEventListener("botapp-capture-nav", onCaptureNavigate as EventListener);
    return () => window.removeEventListener("botapp-capture-nav", onCaptureNavigate as EventListener);
  }, []);

  function navigateCompassTarget(target: CompassActionTarget) {
    if (target.context.profileId) setSelectedProfileId(target.context.profileId);
    if (target.targetTab === "credentials") {
      setSelectedCredentialsAccountId(target.context.accountId ?? null);
      setActive("credentials");
      return;
    }
    if (target.targetTab === "profiles") {
      setActive("profiles");
      return;
    }
    if (target.targetTab === "account") {
      setActive("account");
      return;
    }
    if (target.targetTab === "devices") {
      setActive("devices");
      return;
    }
    if (target.targetTab === "activity") {
      setActive("activity");
      return;
    }
    if (target.targetTab === "targets") {
      setActive("compass");
      return;
    }
    setActive("compass");
  }

  async function analyzeCompass(period: "24h" | "7d" | "30d"): Promise<CompassAnalyzeResult> {
    if (!data.compass) {
      throw new Error("Compass facts are not loaded.");
    }
    const rulesOnlyRuntime: CompassAiRuntimeStatus = {
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
      message: "Compass AI relay not configured. Add a relay URL to enable AI recommendations.",
    };
    const result = await window.botappDesktop?.compass?.analyze?.({
      period,
      snapshot: data.compass.aiAnalysisPayload,
    });
    if (result) {
      return { advisor: result.advisor, runtime: result.runtime };
    }
    return {
      advisor: {
        ...data.compass.aiAdvisor,
        status: "ai_unavailable",
        period,
        summary: rulesOnlyRuntime.message,
      },
      runtime: rulesOnlyRuntime,
    };
  }

  async function refreshAutoRestart() {
    const result = await (window.botappDesktop?.autoRestart?.overview
      ? window.botappDesktop.autoRestart.overview().then((overview) => ({ ok: true as const, data: overview })).catch((error) => ({ ok: false as const, error }))
      : mockClient.listAutoRestart());
    if (result.ok) {
      setData((current) => ({ ...current, autoRestart: result.data }));
      pushToast("Auto Restart overview refreshed.", "success");
      return;
    }
    pushToast("Auto Restart overview unavailable.", "error");
  }

  async function runAutoRestartDryRun() {
    const result = await window.botappDesktop?.autoRestart?.dryRun?.();
    if (result?.ok) {
      setData((current) => ({ ...current, autoRestart: result.overview }));
      pushToast("Auto Restart dry-run preview refreshed.", "success");
      return;
    }
    await refreshAutoRestart();
  }

  async function executeAutoRestartControl(control: AutoRestartControl) {
    const result = await window.botappDesktop?.autoRestart?.execute?.({
      action: control.action,
      requestId: control.requestId,
      target: {
        targetAccountId: control.targetAccountId,
        targetDeviceId: control.targetDeviceId,
        device_id: control.targetDeviceId,
      },
      confirmed: true,
    });
    if (result?.ok) {
      pushToast(`${control.label} : action exécutée.`, "success");
      await refreshAutoRestart();
      return;
    }
    pushToast(result?.error ?? `${control.label} : échec backend.`, "error");
  }

  async function previewAutoRestartControl(control: AutoRestartControl) {
    const preview = await window.botappDesktop?.autoRestart?.actionPreview?.({
      action: control.action,
      requestId: control.requestId,
      target: {
        targetAccountId: control.targetAccountId,
        targetDeviceId: control.targetDeviceId,
      },
    });
    pushToast(preview?.ok ? `${control.label}: preview ready.` : (preview?.error ?? `${control.label}: backend pending.`), preview?.ok ? "success" : "info");
  }

  function navigateAutoRestartTarget(target: "accounts" | "devices" | "credentials" | "activity" | "compass" | "safety" | "candidates") {
    if (target === "devices") setActive("devices");
    else if (target === "credentials") setActive("credentials");
    else if (target === "activity") setActive("activity");
    else if (target === "compass") setActive("compass");
    else if (target === "accounts") setActive("account");
    else setActive("auto-restart");
  }

  let view: React.ReactNode;
  if (loading) view = <div className="empty-state"><strong>Loading backend data</strong><span>BotApp is syncing through the shared backend relay.</span></div>;
  else if (active === "overview") view = <Overview profiles={data.profiles} devices={data.devices} notifications={data.notifications} logs={data.logs} onAction={requestAction} />;
  else if (active === "profiles") view = <Profiles profiles={data.profiles} groups={data.profileGroups} dispatcherHealth={dispatcherHealth} syncError={syncError} profilesMeta={profilesMeta} loading={loading} onRefresh={() => loadOverviewData()} onSelect={(id) => { setSelectedProfileId(id); setActive("account"); }} onAction={requestAction} onMockSubmit={(message, tone) => pushToast(message, tone ?? "success")} />;
  else if (active === "account") view = data.clientAccounts ? <ClientAccounts overview={data.clientAccounts} onOpenProfile={(id) => { setSelectedProfileId(id); setActive("profiles"); }} onOpenCredentials={(account) => { setSelectedCredentialsAccountId(account.accountId); setActive("credentials"); }} onRefresh={() => loadOverviewData()} /> : null;
  else if (active === "credentials") view = data.credentials ? <Credentials overview={data.credentials} selectedAccountId={selectedCredentialsAccountId} onOpenProfile={(id) => { setSelectedProfileId(id); setActive("profiles"); }} /> : null;
  else if (active === "devices") view = <Devices devices={data.devices} onAction={requestAction} onRefresh={() => loadOverviewData()} />;
  else if (active === "activity") view = <ActivityLog logs={data.logs} />;
  else if (active === "email-history") view = <EmailHistory />;
  else if (active === "runtime") view = <RuntimeHealth />;
  else if (active === "incident-notifications") view = <IncidentNotificationsSettingsView />;
  else if (active === "compass") view = data.compass ? <Compass overview={data.compass} onNavigate={navigateCompassTarget} onAnalyze={analyzeCompass} /> : null;
  else if (active === "auto-restart") view = data.autoRestart ? <AutoRestart overview={data.autoRestart} relayHealth={relayHealth} dispatcherHealth={dispatcherHealth} onRefresh={refreshAutoRestart} onDryRun={runAutoRestartDryRun} onNavigate={navigateAutoRestartTarget} onAction={requestAction} /> : null;
  else if (active === "api") view = <APIKeys apiKeys={data.apiKeys} webhooks={data.webhooks} onAction={requestAction} />;
  else view = data.settings ? <Settings settings={data.settings} onAction={requestAction} /> : null;

  const relayOperational = Boolean(relayHealth?.ok && relayHealth.relay_authenticated);
  const dispatcherOperational = dispatcherHealth?.status === "running" && Boolean(dispatcherHealth.processRunning);
  const connectionBlocked = !relayOperational || !dispatcherOperational;

  return <div className="app-shell">
    <Sidebar active={active} onNavigate={navigate} counts={counts} />
    <main className="main" data-testid={`botapp-active-view-${active}`}>
      <TopBar active={active} onCommand={() => setCommandOpen(true)} />
      <div className={`relay-auth-banner${connectionBlocked ? " relay-auth-banner-blocked" : " relay-auth-banner-ok"}`}>
        <div>
          {connectionBlocked ? (
            <>
              <strong>
                {!relayOperational
                  ? "BotApp connection unavailable."
                  : "Dispatcher stopped."}
              </strong>
              <span>
                {!relayOperational
                  ? (relayHealth?.message || "Local relay is not authenticated.")
                  : (dispatcherHealth?.message || "Dispatcher is not active.")}
              </span>
            </>
          ) : (
            <>
              <strong>BotApp connection: operational</strong>
              <span>
                {dispatcherOperational
                  ? "Relay authenticated · dispatcher confirmed running."
                  : "Relay authenticated · dispatcher is not confirmed running."}
                {active === "auto-restart" ? " This does not mean Auto Restart is enabled." : ""}
              </span>
            </>
          )}
        </div>
        <div className="relay-auth-actions">
          {!relayOperational ? (
            <button type="button" disabled={repairBusy} onClick={() => void repairConnection()}>
              {repairBusy ? "Repairing..." : "Repair connection"}
            </button>
          ) : null}
          {relayOperational && !dispatcherOperational ? (
            <button type="button" disabled={dispatcherEnsureBusy} onClick={() => void ensureDispatcher()}>
              {dispatcherEnsureBusy ? "Starting..." : "Start dispatcher"}
            </button>
          ) : null}
          {connectionBlocked ? (
            <button type="button" onClick={() => void loadRelayHealth()}>Retry</button>
          ) : null}
          <button type="button" onClick={copyRelayDiagnostics}>Copy diagnostics</button>
        </div>
      </div>
      <div className="content">{view}</div>
    </main>
    {commandOpen ? <div className="command-overlay" onClick={() => setCommandOpen(false)}><div className="command-box" onClick={(event) => event.stopPropagation()}><input className="input" placeholder="Jump to screen..." autoFocus />{routes.map((route) => <button key={route.id} onClick={() => navigate(route.id)}><span>{route.label}</span><span className="mono">{route.shortcut}</span></button>)}</div></div> : null}
    {pendingAction ? <Modal title={`${pendingAction.action}?`} danger={pendingAction.danger} confirmLabel="Confirm" onClose={() => setPendingAction(null)} onConfirm={confirmAction}><p><strong>Action preview.</strong></p><p>No live runtime or device action will run from this confirmation. Target: <span className="mono">{pendingAction.target}</span>.</p></Modal> : null}
    <Toasts items={toasts} />
  </div>;
}
