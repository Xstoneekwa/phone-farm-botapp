import { useEffect, useMemo, useRef, useState } from "react";
import { mockClient } from "../../../api/mock-client";
import type { BotProfile, ProfileLogEntry, ProfileLogExportFormat, ProfileLogLevel, ProfileLogPhase, ProfileLogStreamState } from "../../../api/types";
import { Button, Drawer, Input } from "../../../design/components";
import { redactText } from "../../../security/redaction";

const levelOptions: Array<ProfileLogLevel | "all"> = ["all", "debug", "info", "success", "warning", "error"];
const phaseOptions: Array<ProfileLogPhase | "all"> = ["all", "preflight", "login", "follow", "mute", "like", "dm", "unfollow", "recovery", "state_machine", "api", "device"];

function formatTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function safeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
}

function createMockLiveEntry(profile: BotProfile, index: number): ProfileLogEntry {
  const templates: Array<Omit<ProfileLogEntry, "id" | "accountId" | "timestamp">> = [
    { level: "info", phase: "preflight", event: "opening_instagram_profile", message: "Opening Instagram profile", actionStatus: "started", source: "worker", runId: "run_mock_live" },
    { level: "success", phase: "follow", event: "follow_tap_sent", message: "Follow tap sent", targetUsername: "sample_target_live", actionStatus: "started", durationMs: 240, source: "worker", runId: "run_mock_live" },
    { level: "success", phase: "follow", event: "follow_verified", message: "Follow verified", targetUsername: "sample_target_live", actionStatus: "succeeded", durationMs: 1180, source: "worker", runId: "run_mock_live" },
    { level: "info", phase: "like", event: "post_opened", message: "Post opened", targetUsername: "sample_target_live", actionStatus: "started", source: "worker", runId: "run_mock_live" },
    { level: "success", phase: "like", event: "like_tap_sent", message: "Like tap sent", targetUsername: "sample_target_live", actionStatus: "started", durationMs: 310, source: "worker", runId: "run_mock_live" },
    { level: "warning", phase: "device", event: "slow_ui_response", message: "Warning: slow UI response", reason: "mock_latency_high", actionStatus: "skipped", durationMs: 1410, source: "device", runId: "run_mock_live" },
    { level: "info", phase: "recovery", event: "recovery_started", message: "Recovery started", reason: "slow_ui_response", actionStatus: "started", source: "worker", runId: "run_mock_live" },
    { level: "success", phase: "recovery", event: "recovery_completed", message: "Recovery completed", reason: "state_restored", actionStatus: "recovered", durationMs: 2200, source: "worker", runId: "run_mock_live" },
    { level: "warning", phase: "follow", event: "action_skipped", message: "Action skipped: eligibility_blocked", reason: "eligibility_blocked", actionStatus: "skipped", source: "worker", runId: "run_mock_live" },
    { level: "error", phase: "device", event: "device_unavailable", message: "Error: device_unavailable", reason: "device_unavailable", actionStatus: "failed", source: "device", runId: "run_mock_live" },
    { level: "success", phase: "state_machine", event: "session_completed", message: "Session completed", actionStatus: "succeeded", durationMs: 820, source: "worker", runId: "run_mock_live" },
  ];
  const template = templates[index % templates.length];
  return {
    ...template,
    id: `${profile.id}_live_${Date.now()}_${index}`,
    accountId: profile.id,
    timestamp: formatTimestamp(),
  };
}

function searchableText(entry: ProfileLogEntry) {
  return redactText([
    entry.level,
    entry.phase,
    entry.event,
    entry.message,
    entry.reason,
    entry.targetUsername,
    entry.actionStatus,
    entry.source,
    entry.runId,
    entry.requestId,
  ].filter(Boolean).join(" "));
}

function safeLogEntry(entry: ProfileLogEntry) {
  return {
    ...entry,
    message: redactText(entry.message),
    reason: entry.reason ? redactText(entry.reason) : undefined,
    targetUsername: entry.targetUsername ? redactText(entry.targetUsername) : undefined,
    runId: entry.runId ? redactText(entry.runId) : undefined,
    requestId: entry.requestId ? redactText(entry.requestId) : undefined,
  };
}

function logLine(entry: ProfileLogEntry) {
  const safe = safeLogEntry(entry);
  return [
    `[${safe.timestamp}]`,
    safe.level.toUpperCase(),
    safe.phase,
    safe.event,
    safe.message,
    safe.targetUsername ? `target=${safe.targetUsername}` : "",
    safe.reason ? `reason=${safe.reason}` : "",
    safe.actionStatus ? `status=${safe.actionStatus}` : "",
    safe.durationMs ? `durationMs=${safe.durationMs}` : "",
    `source=${safe.source}`,
    safe.runId ? `run=${safe.runId}` : "",
    safe.requestId ? `request=${safe.requestId}` : "",
  ].filter(Boolean).join(" ");
}

export function LogsDrawer({ profile, onClose }: { profile: BotProfile; onClose: () => void }) {
  const [logs, setLogs] = useState<ProfileLogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<ProfileLogLevel | "all">("all");
  const [phaseFilter, setPhaseFilter] = useState<ProfileLogPhase | "all">("all");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newLogCount, setNewLogCount] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<ProfileLogStreamState>("mock_live");
  const [liveIndex, setLiveIndex] = useState(0);
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const levelLabel = (level: ProfileLogLevel | "all") => level === "all" ? "All levels" : level[0].toUpperCase() + level.slice(1);
  const phaseLabel = (phase: ProfileLogPhase | "all") => phase === "all" ? "All phases" : phase.replace("_", " ");

  useEffect(() => {
    let cancelled = false;
    void mockClient.getProfileLogs(profile.id).then((result) => {
      if (!cancelled && result.ok) {
        setLogs(result.data);
        setLastUpdatedAt(formatTimestamp());
      }
    });
    return () => { cancelled = true; };
  }, [profile.id]);

  useEffect(() => {
    if (streamState !== "mock_live") return undefined;
    const id = window.setInterval(() => {
      setLogs((current) => [...current, createMockLiveEntry(profile, liveIndex)].slice(-250));
      setLastUpdatedAt(formatTimestamp());
      setLiveIndex((value) => value + 1);
      if (!autoScroll) setNewLogCount((value) => value + 1);
    }, 2800);
    return () => window.clearInterval(id);
  }, [autoScroll, liveIndex, profile, streamState]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((entry) => {
      if (errorsOnly && entry.level !== "error") return false;
      if (levelFilter !== "all" && entry.level !== levelFilter) return false;
      if (phaseFilter !== "all" && entry.phase !== phaseFilter) return false;
      if (!needle) return true;
      return searchableText(entry).toLowerCase().includes(needle);
    });
  }, [errorsOnly, levelFilter, logs, phaseFilter, query]);

  const counts = useMemo(() => ({
    error: logs.filter((entry) => entry.level === "error").length,
    warning: logs.filter((entry) => entry.level === "warning").length,
    info: logs.filter((entry) => entry.level === "info" || entry.level === "success").length,
  }), [logs]);

  useEffect(() => {
    if (!autoScroll) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.scrollTop = viewer.scrollHeight;
    setNewLogCount(0);
  }, [autoScroll, filtered.length, logs.length]);

  function clearView() {
    setLogs([]);
    setNewLogCount(0);
    setLastUpdatedAt(formatTimestamp());
  }

  function refreshMock() {
    void mockClient.getProfileLogs(profile.id).then((result) => {
      if (result.ok) {
        setLogs(result.data);
        setNewLogCount(0);
        setLastUpdatedAt(formatTimestamp());
      }
    });
  }

  function exportLogs(format: ProfileLogExportFormat) {
    const safeRows = filtered.map(safeLogEntry);
    const content = format === "json"
      ? JSON.stringify(safeRows, null, 2)
      : safeRows.map(logLine).join("\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `botapp-logs-${safeFilePart(profile.username)}-${new Date().toISOString().slice(0, 10)}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Drawer title="History" subtitle={profile.username} wide onClose={onClose}>
      <div className="logs-console-shell">
        <div className="logs-status-row">
          <div className="logs-live-stack">
            <span className={`logs-live-badge state-${streamState}`}>{streamState === "mock_live" ? "Live mock" : streamState}</span>
            <span className="subtle">Last update: <span className="mono">{lastUpdatedAt ?? "loading"}</span></span>
          </div>
          <div className="logs-counts">
            <span>errors <strong>{counts.error}</strong></span>
            <span>warnings <strong>{counts.warning}</strong></span>
            <span>info <strong>{counts.info}</strong></span>
          </div>
        </div>

        <div className="logs-toolbar-grid">
          <Input value={query} onChange={setQuery} placeholder="Search message, event, reason, target, phase, level..." />
          <select className="input" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as ProfileLogLevel | "all")}>
            {levelOptions.map((level) => <option key={level} value={level}>{levelLabel(level)}</option>)}
          </select>
          <select className="input" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value as ProfileLogPhase | "all")}>
            {phaseOptions.map((phase) => <option key={phase} value={phase}>{phaseLabel(phase)}</option>)}
          </select>
          <label className="checkbox-row"><input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} /> Errors only</label>
        </div>

        <div className="logs-actions-row">
          <Button variant="ghost" onClick={() => setAutoScroll((value) => !value)}>{autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}</Button>
          <Button variant="ghost" onClick={() => setStreamState((value) => value === "mock_live" ? "paused" : "mock_live")}>{streamState === "mock_live" ? "Pause mock live" : "Resume mock live"}</Button>
          <Button variant="ghost" onClick={clearView}>Clear view mock</Button>
          <Button variant="ghost" onClick={refreshMock}>Refresh mock</Button>
          <Button variant="ghost" onClick={() => exportLogs("txt")}>Export TXT</Button>
          <Button variant="ghost" onClick={() => exportLogs("json")}>Export JSON</Button>
        </div>

        {!autoScroll && newLogCount ? <button type="button" className="logs-new-indicator" onClick={() => setAutoScroll(true)}>{newLogCount} new logs - resume auto-scroll</button> : null}

        <div className="log-viewer log-viewer-live" role="log" aria-live="polite" ref={viewerRef}>
          {filtered.length ? filtered.map((entry) => {
            const safe = safeLogEntry(entry);
            return (
              <div key={entry.id} className={`log-line level-${entry.level}`}>
                <span className="mono log-time">[{safe.timestamp}]</span>
                <span className="mono log-level">{safe.level.toUpperCase()}</span>
                <span className="mono log-phase">{safe.phase}</span>
                <span className="mono log-event">{safe.event}</span>
                <span>{safe.message}</span>
                {safe.targetUsername ? <span className="mono log-meta">target={safe.targetUsername}</span> : null}
                {safe.reason ? <span className="mono log-meta">reason={safe.reason}</span> : null}
                {safe.actionStatus ? <span className="mono log-status">status={safe.actionStatus}</span> : null}
                {safe.durationMs ? <span className="mono log-meta">{safe.durationMs}ms</span> : null}
              </div>
            );
          }) : <div className="log-line level-info">No visible logs. Adjust filters or refresh mock.</div>}
        </div>

        <p className="logs-future-note">
          Realtime-ready mock only. Future live data should come through a secure API/WebSocket relay for runtime events, account run logs, and worker structured logs. BotApp must not read local log files or hold Supabase secrets.
        </p>
      </div>
    </Drawer>
  );
}
