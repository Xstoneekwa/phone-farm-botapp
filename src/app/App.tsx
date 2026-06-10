import { useEffect, useMemo, useState } from "react";
import { mockClient } from "../api/mock-client";
import type { ActivityLogEntry, ApiKeySummary, AppSettings, BotProfile, Device, DeviceProfileGroup, DmTemplate, NotificationItem, Target, WebhookSummary } from "../api/types";
import { Modal, Toasts, type ToastItem } from "../design/components";
import { Sidebar } from "../layout/Sidebar";
import { TopBar } from "../layout/TopBar";
import { Overview } from "../views/Overview";
import { Profiles } from "../views/Profiles";
import { AccountDetail } from "../views/AccountDetail";
import { Devices } from "../views/Devices";
import { ActivityLog } from "../views/ActivityLog";
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
  devices: Device[];
  notifications: NotificationItem[];
  logs: ActivityLogEntry[];
  targets: Target[];
  templates: DmTemplate[];
  apiKeys: ApiKeySummary[];
  webhooks: WebhookSummary[];
  settings: AppSettings | null;
};

const emptyData: AppData = { profiles: [], profileGroups: [], devices: [], notifications: [], logs: [], targets: [], templates: [], apiKeys: [], webhooks: [], settings: null };

export function App() {
  const [active, setActive] = useState<RouteId>("overview");
  const [selectedProfileId, setSelectedProfileId] = useState("prof_001");
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: string; target: string; danger: boolean } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [profiles, profileGroups, devices, notifications, logs, targets, templates, apiKeys, webhooks, settings] = await Promise.all([
        mockClient.listProfiles(), mockClient.listDeviceProfileGroups(), mockClient.listDevices(), mockClient.listNotifications(), mockClient.listActivityLogs(), mockClient.listTargets(), mockClient.listDmTemplates(), mockClient.listApiKeys(), mockClient.listWebhooks(), mockClient.listSettings(),
      ]);
      if (cancelled) return;
      setData({
        profiles: profiles.ok ? profiles.data : [],
        profileGroups: profileGroups.ok ? profileGroups.data : [],
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

  const selectedProfile = data.profiles.find((profile) => profile.id === selectedProfileId) ?? data.profiles[0];
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

  let view: React.ReactNode;
  if (loading) view = <div className="empty-state"><strong>Loading mock data</strong><span>No backend connection is required.</span></div>;
  else if (active === "overview") view = <Overview profiles={data.profiles} devices={data.devices} notifications={data.notifications} logs={data.logs} onAction={requestAction} />;
  else if (active === "profiles") view = <Profiles groups={data.profileGroups} onSelect={(id) => { setSelectedProfileId(id); setActive("account"); }} onAction={requestAction} />;
  else if (active === "account") view = <AccountDetail profile={selectedProfile} onAction={requestAction} />;
  else if (active === "devices") view = <Devices devices={data.devices} onAction={requestAction} />;
  else if (active === "activity") view = <ActivityLog logs={data.logs} />;
  else if (active === "targets") view = <Targets targets={data.targets} onAction={requestAction} />;
  else if (active === "templates") view = <DMTemplates templates={data.templates} onAction={requestAction} />;
  else if (active === "notifications") view = <Notifications notifications={data.notifications} onAction={requestAction} />;
  else if (active === "api") view = <APIKeys apiKeys={data.apiKeys} webhooks={data.webhooks} onAction={requestAction} />;
  else view = data.settings ? <Settings settings={data.settings} onAction={requestAction} /> : null;

  return <div className="app-shell">
    <Sidebar active={active} onNavigate={navigate} counts={counts} />
    <main className="main"><TopBar active={active} onCommand={() => setCommandOpen(true)} /><div className="content">{view}</div></main>
    {commandOpen ? <div className="command-overlay" onClick={() => setCommandOpen(false)}><div className="command-box" onClick={(event) => event.stopPropagation()}><input className="input" placeholder="Jump to screen..." autoFocus />{routes.map((route) => <button key={route.id} onClick={() => navigate(route.id)}><span>{route.label}</span><span className="mono">{route.shortcut}</span></button>)}</div></div> : null}
    {pendingAction ? <Modal title={`${pendingAction.action}?`} danger={pendingAction.danger} confirmLabel="Preview only" onClose={() => setPendingAction(null)} onConfirm={confirmAction}><p><strong>Mock only — no backend action executed.</strong></p><p>This preview will not call Supabase, Instagram, ADB, a worker, a dispatcher, or a real device. Target: <span className="mono">{pendingAction.target}</span>.</p></Modal> : null}
    <Toasts items={toasts} />
  </div>;
}
