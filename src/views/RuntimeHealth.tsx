import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Card, type BadgeTone } from "../design/components";
import type { BotAppDispatcherHealth, BotAppDispatcherStatus, BotAppRelayHealth } from "../api/types";
import "./runtime-health.css";

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
  unhealthy: { label: "Unhealthy", detail: "Dispatcher is running but cannot process jobs.", tone: "error" },
  starting: { label: "Starting", detail: "Dispatcher is starting or waiting for launchd.", tone: "info" },
  unknown: { label: "Unknown", detail: "Dispatcher status unavailable.", tone: "neutral" },
};

type DispatcherAction = "pause" | "resume" | "restart" | "stop" | "logs" | "fix-duplicate";

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
  const [relayHealth, setRelayHealth] = useState<BotAppRelayHealth>(fallbackRelayHealth);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<DispatcherAction | "refresh" | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    setBusyAction("refresh");
    try {
      const [result, relayResult] = await Promise.all([
        window.botappDesktop?.dispatcher?.status?.(),
        window.botappDesktop?.relay?.health?.(),
      ]);
      setHealth(result ?? fallbackDispatcherHealth);
      setRelayHealth(relayResult ?? fallbackRelayHealth);
      setMessage(result?.message ?? fallbackDispatcherHealth.message);
    } catch {
      setHealth(fallbackDispatcherHealth);
      setRelayHealth(fallbackRelayHealth);
      setMessage("Dispatcher status unavailable.");
    } finally {
      setLoading(false);
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
        title="BotApp relay auth"
        subtitle="This checks the secure BotApp relay without creating account_run_requests, ig_runs, accounts, or social actions."
        actions={<Button variant="ghost" onClick={() => void refresh()} disabled={Boolean(busyAction)}>Retry</Button>}
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
