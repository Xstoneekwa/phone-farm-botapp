import { useEffect, useMemo, useState } from "react";
import { mockClient } from "../api/mock-client";
import type { ActivityLogEntry, ApiKeySummary, AppSettings, BotAppClientAccountsOverview, BotAppCredentialsOverview, BotProfile, CompassActionTarget, CompassAnalyzeResult, CompassAiRuntimeStatus, CompassOverview, Device, DeviceProfileGroup, DmTemplate, NotificationItem, Target, WebhookSummary } from "../api/types";
import { Modal, Toasts, type ToastItem } from "../design/components";
import { Sidebar } from "../layout/Sidebar";
import { TopBar } from "../layout/TopBar";
import { Overview } from "../views/Overview";
import { Profiles } from "../views/Profiles";
import { ClientAccounts } from "../views/ClientAccounts";
import { Credentials } from "../views/Credentials";
import { Devices } from "../views/Devices";
import { ActivityLog } from "../views/ActivityLog";
import { Compass } from "../views/Compass";
import { Targets } from "../views/Targets";
import { DMTemplates } from "../views/DMTemplates";
import { Notifications } from "../views/Notifications";
import { APIKeys } from "../views/APIKeys";
import { Settings } from "../views/Settings";
import { routes, type RouteId } from "./routes";
import "./app.css";

type AppData = {
  profiles: BotProfile[];
  profileGroups: DeviceProfileGroup[];
  clientAccounts: BotAppClientAccountsOverview | null;
  credentials: BotAppCredentialsOverview | null;
  compass: CompassOverview | null;
  devices: Device[];
  notifications: NotificationItem[];
  logs: ActivityLogEntry[];
  targets: Target[];
  templates: DmTemplate[];
  apiKeys: ApiKeySummary[];
  webhooks: WebhookSummary[];
  settings: AppSettings | null;
};

const emptyData: AppData = { profiles: [], profileGroups: [], clientAccounts: null, credentials: null, compass: null, devices: [], notifications: [], logs: [], targets: [], templates: [], apiKeys: [], webhooks: [], settings: null };

export function App() {
  const [active, setActive] = useState<RouteId>("overview");
  const [, setSelectedProfileId] = useState("prof_001");
  const [selectedCredentialsAccountId, setSelectedCredentialsAccountId] = useState<string | null>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: string; target: string; danger: boolean } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [profiles, profileGroups, clientAccounts, credentials, compass, devices, notifications, logs, targets, templates, apiKeys, webhooks, settings] = await Promise.all([
        mockClient.listProfiles(), mockClient.listDeviceProfileGroups(), mockClient.listClientAccounts(), mockClient.listCredentialsActions(), mockClient.listCompass(), mockClient.listDevices(), mockClient.listNotifications(), mockClient.listActivityLogs(), mockClient.listTargets(), mockClient.listDmTemplates(), mockClient.listApiKeys(), mockClient.listWebhooks(), mockClient.listSettings(),
      ]);
      if (cancelled) return;
      setData({
        profiles: profiles.ok ? profiles.data : [],
        profileGroups: profileGroups.ok ? profileGroups.data : [],
        clientAccounts: clientAccounts.ok ? clientAccounts.data : null,
        credentials: credentials.ok ? credentials.data : null,
        compass: compass.ok ? compass.data : null,
        devices: devices.ok ? devices.data : [],
        notifications: notifications.ok ? notifications.data : [],
        logs: logs.ok ? logs.data : [],
        targets: targets.ok ? targets.data : [],
        templates: templates.ok ? templates.data : [],
        apiKeys: apiKeys.ok ? apiKeys.data : [],
        webhooks: webhooks.ok ? webhooks.data : [],
        settings: settings.ok ? settings.data : null,
      });
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

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
      setActive("targets");
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

  let view: React.ReactNode;
  if (loading) view = <div className="empty-state"><strong>Loading local data</strong><span>No backend connection is required.</span></div>;
  else if (active === "overview") view = <Overview profiles={data.profiles} devices={data.devices} notifications={data.notifications} logs={data.logs} onAction={requestAction} />;
  else if (active === "profiles") view = <Profiles groups={data.profileGroups} onSelect={(id) => { setSelectedProfileId(id); setActive("account"); }} onAction={requestAction} onMockSubmit={(message) => pushToast(message, "success")} />;
  else if (active === "account") view = data.clientAccounts ? <ClientAccounts overview={data.clientAccounts} onOpenProfile={(id) => { setSelectedProfileId(id); setActive("profiles"); }} onOpenCredentials={(account) => { setSelectedCredentialsAccountId(account.accountId); setActive("credentials"); }} /> : null;
  else if (active === "credentials") view = data.credentials ? <Credentials overview={data.credentials} selectedAccountId={selectedCredentialsAccountId} onOpenProfile={(id) => { setSelectedProfileId(id); setActive("profiles"); }} /> : null;
  else if (active === "devices") view = <Devices devices={data.devices} onAction={requestAction} />;
  else if (active === "activity") view = <ActivityLog logs={data.logs} />;
  else if (active === "compass") view = data.compass ? <Compass overview={data.compass} onNavigate={navigateCompassTarget} onAnalyze={analyzeCompass} /> : null;
  else if (active === "targets") view = <Targets targets={data.targets} onAction={requestAction} />;
  else if (active === "templates") view = <DMTemplates templates={data.templates} onAction={requestAction} />;
  else if (active === "notifications") view = <Notifications notifications={data.notifications} onAction={requestAction} />;
  else if (active === "api") view = <APIKeys apiKeys={data.apiKeys} webhooks={data.webhooks} onAction={requestAction} />;
  else view = data.settings ? <Settings settings={data.settings} onAction={requestAction} /> : null;

  return <div className="app-shell">
    <Sidebar active={active} onNavigate={navigate} counts={counts} />
    <main className="main"><TopBar active={active} onCommand={() => setCommandOpen(true)} /><div className="content">{view}</div></main>
    {commandOpen ? <div className="command-overlay" onClick={() => setCommandOpen(false)}><div className="command-box" onClick={(event) => event.stopPropagation()}><input className="input" placeholder="Jump to screen..." autoFocus />{routes.map((route) => <button key={route.id} onClick={() => navigate(route.id)}><span>{route.label}</span><span className="mono">{route.shortcut}</span></button>)}</div></div> : null}
    {pendingAction ? <Modal title={`${pendingAction.action}?`} danger={pendingAction.danger} confirmLabel="Confirm" onClose={() => setPendingAction(null)} onConfirm={confirmAction}><p><strong>Prepared for secure relay execution.</strong></p><p>This preview will not call Supabase, Instagram, ADB, a worker, a dispatcher, or a real device. Target: <span className="mono">{pendingAction.target}</span>.</p></Modal> : null}
    <Toasts items={toasts} />
  </div>;
}
