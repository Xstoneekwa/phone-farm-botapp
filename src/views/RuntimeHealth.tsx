import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Card, type BadgeTone } from "../design/components";
import type { BotAppDeviceHeartbeatHealth, BotAppDeviceHeartbeatOperatorStatus, BotAppDispatcherHealth, BotAppDispatcherStatus, BotAppRelayHealth, BotAppSchedulerRuntimeHealth } from "../api/types";
import "./runtime-health.css";

const fallbackDeviceHeartbeatHealth: BotAppDeviceHeartbeatHealth = {
  ok: false,
  status: "unknown",
  operatorStatus: "degraded",
  operatorLabelFr: "Dégradé",
  serviceId: "device-heartbeat-publisher",
  paused: false,
  processRunning: false,
  pid: null,
  processCount: 0,
  duplicateProcess: false,
  launchdLoaded: false,
  intervalSeconds: 60,
  lastCycleAt: null,
  lastCycleOk: false,
  lastPublishedCount: 0,
  lastObservedCount: 0,
  physicalPhonesSeen: 0,
  youngestBackendHeartbeatAgeSeconds: null,
  physicalPhonesInInventory: null,
  lastError: null,
  logsPath: null,
  checkedAt: new Date().toISOString(),
  message: "Device heartbeat service status unavailable.",
};

const fallbackDispatcherHealth: BotAppDispatcherHealth = {
  ok: false,
  status: "unknown",
  dispatcher_id: "",
  worker_id: "",
  paused: false,
  processRunning: false,
  pid: null,
  processCount: 0,
  duplicateProcess: false,
  launchdLoaded: false,
  launchEnabled: false,
  healthOnly: false,
  allowExistingQueue: false,
  heartbeatAge: null,
  lastSeenAt: null,
  preflightOk: false,
  preflight: null,
  queueActiveCount: null,
  lastError: null,
  logsPath: null,
  supabaseRestStatus: "unknown",
  deviceCountOnline: null,
  checkedAt: new Date().toISOString(),
  message: "Dispatcher status unavailable.",
};

const fallbackRelayHealth: BotAppRelayHealth = {
  ok: false,
  relay_authenticated: false,
  backend_configured: false,
  source: "botapp_local",
  server_time: null,
  reason: "unreachable",
  backend_key: { present: false, length: 0, sha256_prefix: null, environment_scope: "unknown" },
  provided_key: { present: false, length: 0, sha256_prefix: null },
  routes: {},
  message: "BotApp relay health unavailable.",
  checkedAt: new Date().toISOString(),
};

const statusCopy: Record<BotAppDispatcherStatus, { label: string; detail: string; tone: BadgeTone }> = {
  running: { label: "Running", detail: "Dispatcher is healthy and ready.", tone: "success" },
  paused: { label: "Paused", detail: "Dispatcher is paused. Resume it before starting Auto Login or runs.", tone: "warning" },
  stopped: { label: "Stopped", detail: "Dispatcher is stopped.", tone: "error" },
  degraded: { label: "Degraded", detail: "Dispatcher is active but one runtime check is degraded.", tone: "warning" },
  unhealthy: { label: "Unhealthy", detail: "Dispatcher is running but cannot process jobs.", tone: "error" },
  starting: { label: "Starting", detail: "Dispatcher is starting or waiting for launchd.", tone: "info" },
  runtime_root_invalid: { label: "Runtime root invalid", detail: "Active worker root is missing, invalid, or forbidden.", tone: "error" },
  runtime_root_mismatch: { label: "Runtime root mismatch", detail: "A service is running from a different worker root than the active release.", tone: "error" },
  unknown: { label: "Unknown", detail: "Dispatcher status unavailable.", tone: "neutral" },
};

type DispatcherAction = "pause" | "resume" | "restart" | "stop" | "logs" | "fix-duplicate";
type DeviceHeartbeatAction = "pause" | "resume" | "restart" | "stop" | "logs" | "fix-duplicate";

const deviceHeartbeatOperatorCopy: Record<BotAppDeviceHeartbeatOperatorStatus, { tone: BadgeTone }> = {
  operational: { tone: "success" },
  degraded: { tone: "warning" },
  stopped: { tone: "error" },
  no_phones_detected: { tone: "info" },
};

function formatDate(value: string | null) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return date.toLocaleString();
}

function formatAge(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "unknown";
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function boolLabel(value: boolean) {
  return value ? "true" : "false";
}

function statusTone(status: BotAppDispatcherStatus): BadgeTone {
  return statusCopy[status]?.tone ?? "neutral";
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="runtime-detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function RuntimeHealth() {
  const [health, setHealth] = useState<BotAppDispatcherHealth>(fallbackDispatcherHealth);
  const [deviceHeartbeatHealth, setDeviceHeartbeatHealth] = useState<BotAppDeviceHeartbeatHealth>(fallbackDeviceHeartbeatHealth);
  const [relayHealth, setRelayHealth] = useState<BotAppRelayHealth>(fallbackRelayHealth);
  const [schedulerRuntimeHealth, setSchedulerRuntimeHealth] = useState<BotAppSchedulerRuntimeHealth>({
    ok: false,
    status: "unknown",
    worker_id: "",
    runtime_host: "",
    scheduler_available: false,
    voluntary_shutdown: false,
    dispatcher_observed_status: "",
    lastPublishedAt: null,
    lastError: null,
    message: "Scheduler runtime status unavailable.",
    checkedAt: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(true);
  const [deviceHeartbeatLoading, setDeviceHeartbeatLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<DispatcherAction | DeviceHeartbeatAction | "refresh" | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    setBusyAction("refresh");
    try {
      const [result, relayResult, heartbeatResult, schedulerResult] = await Promise.all([
        window.botappDesktop?.dispatcher?.status?.(),
        window.botappDesktop?.relay?.health?.(),
        window.botappDesktop?.deviceHeartbeat?.status?.(),
        window.botappDesktop?.schedulerRuntime?.status?.(),
      ]);
      setHealth(result ?? fallbackDispatcherHealth);
      setRelayHealth(relayResult ?? fallbackRelayHealth);
      setDeviceHeartbeatHealth(heartbeatResult ?? fallbackDeviceHeartbeatHealth);
      if (schedulerResult) setSchedulerRuntimeHealth(schedulerResult);
      setMessage(result?.message ?? fallbackDispatcherHealth.message);
    } catch {
      setHealth(fallbackDispatcherHealth);
      setRelayHealth(fallbackRelayHealth);
      setDeviceHeartbeatHealth(fallbackDeviceHeartbeatHealth);
      setMessage("Dispatcher status unavailable.");
    } finally {
      setLoading(false);
      setDeviceHeartbeatLoading(false);
      setBusyAction(null);
    }
  }

  async function runDeviceHeartbeatAction(action: DeviceHeartbeatAction) {
    setBusyAction(action);
    try {
      const result = await window.botappDesktop?.deviceHeartbeat?.action?.(action);
      setDeviceHeartbeatHealth(result ?? fallbackDeviceHeartbeatHealth);
      setMessage(result?.message ?? "Device heartbeat action completed.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      setMessage(`Device heartbeat action failed safely (${detail}).`);
    } finally {
      setBusyAction(null);
    }
  }

  async function runAction(action: DispatcherAction) {
    setBusyAction(action);
    try {
      const result = await window.botappDesktop?.dispatcher?.action?.(action);
      setHealth(result ?? fallbackDispatcherHealth);
      setMessage(result?.message ?? "Dispatcher action completed.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      setMessage(`Dispatcher action failed safely (${detail}).`);
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const copy = statusCopy[health.status] ?? statusCopy.unknown;
  const deviceHeartbeatTone = deviceHeartbeatOperatorCopy[deviceHeartbeatHealth.operatorStatus]?.tone ?? "neutral";
  const preflightReason = useMemo(() => {
    const preflight = health.preflight ?? {};
    const reason = preflight.reason ?? preflight.error;
    return typeof reason === "string" && reason.trim() ? reason : "none";
  }, [health.preflight]);

  return (
    <div className="runtime-health-screen">
      <section className={`runtime-health-hero ${health.status}`}>
        <div>
          <span>Runtime / Dispatcher Health</span>
          <h2>Run Control Dispatcher</h2>
          <p>The dispatcher runs in the background and starts jobs requested from BotApp.</p>
          <p>Run manually accounts start only when you click Start or Auto Login.</p>
          <p>If dispatcher is paused or unhealthy, Auto Login and runs cannot start.</p>
        </div>
        <div className="runtime-health-status">
          <Badge tone={statusTone(health.status)} dot={health.status === "running"}>{copy.label}</Badge>
          <strong>{health.message || copy.detail}</strong>
          {message ? <small>{message}</small> : null}
        </div>
      </section>

      <Card
        title="Local dispatcher control"
        subtitle="Actions are executed only by Electron main through an allowlisted wrapper. The renderer cannot run arbitrary commands."
        actions={
          <div className="runtime-actions">
            <Button variant="ghost" onClick={() => void refresh()} disabled={Boolean(busyAction)}>{busyAction === "refresh" ? "Refreshing..." : "Refresh"}</Button>
            <Button variant="primary" onClick={() => void runAction("resume")} disabled={Boolean(busyAction)}>{health.status === "paused" || health.status === "stopped" ? "Start / Resume" : "Resume"}</Button>
            <Button variant="secondary" onClick={() => void runAction("pause")} disabled={Boolean(busyAction) || health.status === "paused"}>Pause</Button>
            <Button variant="secondary" onClick={() => void runAction("restart")} disabled={Boolean(busyAction)}>Restart</Button>
            {health.duplicateProcess ? <Button variant="primary" onClick={() => void runAction("fix-duplicate")} disabled={Boolean(busyAction)}>Fix duplicate</Button> : null}
            <Button variant="danger" onClick={() => void runAction("stop")} disabled={Boolean(busyAction)}>Stop</Button>
            <Button variant="ghost" onClick={() => void runAction("logs")} disabled={Boolean(busyAction)}>Open logs</Button>
          </div>
        }
      >
        {loading ? (
          <div className="empty-state"><strong>Loading dispatcher status</strong><span>Reading local launchd and preflight state.</span></div>
        ) : (
          <div className="runtime-health-grid">
            <Detail label="dispatcher_id" value={health.dispatcher_id || "unknown"} />
            <Detail label="worker_id" value={health.worker_id || "unknown"} />
            <Detail label="heartbeat age" value={formatAge(health.heartbeatAge)} />
            <Detail label="last_seen_at" value={formatDate(health.lastSeenAt)} />
            <Detail label="launch_enabled" value={boolLabel(health.launchEnabled)} />
            <Detail label="paused" value={boolLabel(health.paused)} />
            <Detail label="process pid" value={health.pid ?? "none"} />
            <Detail label="process count" value={health.processCount} />
            <Detail label="launchd loaded" value={boolLabel(health.launchdLoaded)} />
            <Detail label="preflight" value={health.preflightOk ? "ok" : preflightReason} />
            <Detail label="queue active count" value={health.queueActiveCount ?? "unknown"} />
            <Detail label="Supabase REST" value={health.supabaseRestStatus} />
            <Detail label="device count online" value={health.deviceCountOnline ?? "unknown"} />
            <Detail label="last error / reason" value={health.lastError || "none"} />
          </div>
        )}
      </Card>

      <Card
        title="Scheduler runtime"
        subtitle="Published only while BotApp is open. Server-side schedule-session cron enqueues growth runs only when this runtime is active."
        actions={
          <div className="runtime-actions">
            <Button variant="ghost" onClick={() => void refresh()} disabled={Boolean(busyAction)}>Refresh</Button>
            <Button variant="primary" onClick={() => void window.botappDesktop?.schedulerRuntime?.ensure?.().then((result: BotAppSchedulerRuntimeHealth | undefined) => {
              if (result) setSchedulerRuntimeHealth(result);
              setMessage(result?.message || "Scheduler runtime refreshed.");
            })} disabled={Boolean(busyAction)}>Ensure runtime</Button>
          </div>
        }
      >
        <div className={`runtime-device-heartbeat-banner ${schedulerRuntimeHealth.status === "active" ? "operational" : "degraded"}`}>
          <div>
            <strong>{schedulerRuntimeHealth.status}</strong>
            <span>{schedulerRuntimeHealth.message}</span>
          </div>
          <Badge tone={schedulerRuntimeHealth.scheduler_available ? "success" : "warning"} dot={schedulerRuntimeHealth.scheduler_available}>
            {schedulerRuntimeHealth.scheduler_available ? "active" : "unavailable"}
          </Badge>
        </div>
        <div className="runtime-health-grid">
          <Detail label="runtime_host" value={schedulerRuntimeHealth.runtime_host || "unknown"} />
          <Detail label="worker_id" value={schedulerRuntimeHealth.worker_id || "unknown"} />
          <Detail label="scheduler_available" value={boolLabel(schedulerRuntimeHealth.scheduler_available)} />
          <Detail label="voluntary_shutdown" value={boolLabel(schedulerRuntimeHealth.voluntary_shutdown)} />
          <Detail label="dispatcher observed" value={schedulerRuntimeHealth.dispatcher_observed_status || "unknown"} />
          <Detail label="last published at" value={formatDate(schedulerRuntimeHealth.lastPublishedAt)} />
          <Detail label="last error" value={schedulerRuntimeHealth.lastError || "none"} />
        </div>
      </Card>

      <Card
        title="Device heartbeat service"
        subtitle="Publie les heartbeats ADB vers le backend pour garder les téléphones physiques assignables. Ce service ne lance ni login Instagram, ni runs, ni actions sociales."
        actions={
          <div className="runtime-actions">
            <Button variant="ghost" onClick={() => void refresh()} disabled={Boolean(busyAction)}>Refresh</Button>
            <Button variant="primary" onClick={() => void runDeviceHeartbeatAction("resume")} disabled={Boolean(busyAction)}>
              {deviceHeartbeatHealth.status === "paused" || deviceHeartbeatHealth.status === "stopped" ? "Start / Resume" : "Resume"}
            </Button>
            <Button variant="secondary" onClick={() => void runDeviceHeartbeatAction("restart")} disabled={Boolean(busyAction)}>Restart</Button>
            {deviceHeartbeatHealth.duplicateProcess ? (
              <Button variant="primary" onClick={() => void runDeviceHeartbeatAction("fix-duplicate")} disabled={Boolean(busyAction)}>Fix duplicate</Button>
            ) : null}
            <Button variant="ghost" onClick={() => void runDeviceHeartbeatAction("logs")} disabled={Boolean(busyAction)}>Open logs</Button>
          </div>
        }
      >
        <div className={`runtime-device-heartbeat-banner ${deviceHeartbeatHealth.operatorStatus}`}>
          <div>
            <strong>{deviceHeartbeatHealth.operatorLabelFr}</strong>
            <span>{deviceHeartbeatHealth.message}</span>
          </div>
          <Badge tone={deviceHeartbeatTone} dot={deviceHeartbeatHealth.operatorStatus === "operational"}>
            {deviceHeartbeatHealth.operatorLabelFr}
          </Badge>
        </div>
        {deviceHeartbeatLoading ? (
          <div className="empty-state"><strong>Loading device heartbeat service</strong><span>Reading local launchd and last publish cycle.</span></div>
        ) : (
          <div className="runtime-health-grid">
            <Detail label="service status" value={deviceHeartbeatHealth.status} />
            <Detail label="process running" value={boolLabel(deviceHeartbeatHealth.processRunning)} />
            <Detail label="process pid" value={deviceHeartbeatHealth.pid ?? "none"} />
            <Detail label="process count" value={deviceHeartbeatHealth.processCount} />
            <Detail label="launchd loaded" value={boolLabel(deviceHeartbeatHealth.launchdLoaded)} />
            <Detail label="publish interval" value={`${deviceHeartbeatHealth.intervalSeconds}s`} />
            <Detail label="last cycle at" value={formatDate(deviceHeartbeatHealth.lastCycleAt)} />
            <Detail label="last cycle ok" value={boolLabel(deviceHeartbeatHealth.lastCycleOk)} />
            <Detail label="physical phones seen (ADB)" value={deviceHeartbeatHealth.physicalPhonesSeen} />
            <Detail label="youngest backend heartbeat age" value={formatAge(deviceHeartbeatHealth.youngestBackendHeartbeatAgeSeconds)} />
            <Detail label="physical phones in inventory" value={deviceHeartbeatHealth.physicalPhonesInInventory ?? "unknown"} />
            <Detail label="last published count" value={deviceHeartbeatHealth.lastPublishedCount} />
            <Detail label="last error / reason" value={deviceHeartbeatHealth.lastError || "none"} />
          </div>
        )}
      </Card>

      <Card
        title="BotApp relay auth"
        subtitle="This checks the secure BotApp relay without creating account_run_requests, ig_runs, accounts, or social actions."
        actions={
          <div className="runtime-actions">
            <Button variant="primary" onClick={() => void window.botappDesktop?.relay?.repair?.().then((result) => {
              if (result?.relay) setRelayHealth(result.relay);
              setMessage(result?.message || "Réparation relay terminée.");
            })} disabled={Boolean(busyAction)}>
              Réparer la connexion
            </Button>
            <Button variant="ghost" onClick={() => void refresh()} disabled={Boolean(busyAction)}>Retry</Button>
          </div>
        }
      >
        <div className={relayHealth.ok ? "runtime-relay-banner ok" : "runtime-relay-banner error"}>
          <div>
            <strong>{relayHealth.ok ? "Relay OK" : "BotApp relay auth is not configured. Backend cannot accept local BotApp requests."}</strong>
            <span>{relayHealth.message}</span>
          </div>
          <Badge tone={relayHealth.ok ? "success" : "error"} dot={relayHealth.ok}>
            {relayHealth.reason ?? "relay_ok"}
          </Badge>
        </div>
        <div className="runtime-health-grid">
          <Detail label="relay_authenticated" value={boolLabel(relayHealth.relay_authenticated)} />
          <Detail label="backend_configured" value={boolLabel(relayHealth.backend_configured)} />
          <Detail label="backend key length" value={relayHealth.backend_key.length} />
          <Detail label="backend sha256 prefix" value={relayHealth.backend_key.sha256_prefix ?? "none"} />
          <Detail label="BotApp key present" value={boolLabel(relayHealth.provided_key.present)} />
          <Detail label="BotApp key length" value={relayHealth.provided_key.length} />
          <Detail label="BotApp sha256 prefix" value={relayHealth.provided_key.sha256_prefix ?? "none"} />
          <Detail label="environment scope" value={relayHealth.backend_key.environment_scope} />
          <Detail label="server time" value={relayHealth.server_time ?? "unknown"} />
          <Detail label="checked at" value={relayHealth.checkedAt} />
        </div>
        {Object.keys(relayHealth.routes).length ? (
          <div className="runtime-route-grid">
            {Object.entries(relayHealth.routes).map(([route, status]) => (
              <div key={route}>
                <span>{route}</span>
                <strong>{status}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card title="Operational guardrails" subtitle="BotApp is a local control panel. Dashboard Admin remains the remote read-only ops view.">
        <div className="runtime-guardrails">
          <div><strong>No duplicate dispatcher</strong><span>The wrapper checks existing dispatcher processes before starting.</span></div>
          <div><strong>No shell from renderer</strong><span>Only status, pause, resume, restart, stop, and logs are accepted by Electron main.</span></div>
          <div><strong>No secrets in UI</strong><span>Environment files, service keys, relay keys, and passwords are never returned to the renderer.</span></div>
          <div><strong>No run side effect</strong><span>Runtime Health controls only the dispatcher service. It does not create account_run_requests or ig_runs.</span></div>
        </div>
      </Card>
    </div>
  );
}
