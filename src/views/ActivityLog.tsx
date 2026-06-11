import { useMemo, useState } from "react";
import type {
  ActivityLogEntry,
  BotAppActivityInvestigationMode,
  BotAppActivityLogRelayPayload,
  BotAppCtRemovalPayload,
  BotAppInteractionActionType,
  BotAppInteractionRecord,
  BotAppInteractionSearchQuery,
} from "../api/types";
import { redactRecord, redactText } from "../security/redaction";
import "./activity-log.css";

type ActivityLogProps = {
  logs: ActivityLogEntry[];
};

const modes: Array<{ id: BotAppActivityInvestigationMode; label: string; hint: string }> = [
  { id: "search_by_ct", label: "Search by CT", hint: "Find every interaction sourced from a target account." },
  { id: "search_by_account", label: "Search by Account", hint: "Check whether the tool interacted with a username." },
  { id: "recent_interactions", label: "Recent interactions", hint: "Review latest follow, like, DM, story, and unfollow activity." },
  { id: "disputes_evidence", label: "Disputes / Evidence", hint: "Prepare a safe client-facing proof summary." },
];

const actionTypes: Array<BotAppInteractionActionType | "all"> = ["all", "follow", "unfollow", "like", "comment", "dm", "story_view", "profile_visit", "followback"];

const ctHints: Record<string, { ctId: string; ctUsername: string; source: string; qualityStatus: BotAppInteractionRecord["ct"]["qualityStatus"] }> = {
  atelier_lumiere: { ctId: "ct_001", ctUsername: "architectes.paris", source: "curated", qualityStatus: "approved" },
  studio_nord: { ctId: "ct_002", ctUsername: "renovation_lille", source: "import", qualityStatus: "review" },
  old_fashion_ct: { ctId: "ct_003", ctUsername: "old_target_source", source: "legacy", qualityStatus: "low_quality" },
  galerie_vintage: { ctId: "ct_001", ctUsername: "architectes.paris", source: "curated", qualityStatus: "approved" },
  maison_verte: { ctId: "ct_004", ctUsername: "mode_paris_fr", source: "client_seed", qualityStatus: "approved" },
};

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function periodRank(period: BotAppInteractionSearchQuery["period"]) {
  if (period === "24h") return 1;
  if (period === "7d") return 2;
  return 3;
}

function logToRecord(log: ActivityLogEntry, index: number): BotAppInteractionRecord {
  const interactedUsername = normalizeUsername(log.target);
  const ct = ctHints[interactedUsername] ?? {
    ctId: `ct_unknown_${index}`,
    ctUsername: "unknown_ct_source",
    source: "best_effort",
    qualityStatus: "unknown" as const,
  };
  const actionType = actionTypes.includes(log.event as BotAppInteractionActionType) ? log.event as BotAppInteractionActionType : "unknown";
  const periodBucket = index <= 1 ? "24h" : index <= 4 ? "7d" : "30d";

  return {
    id: log.id,
    accountId: `acct_${normalizeUsername(log.account ?? "unknown")}`,
    clientId: "client_entry_2a_test",
    clientAccountUsername: normalizeUsername(log.account ?? "unknown_account"),
    ct: {
      ...ct,
      interactionsCount: 1,
      lastInteractionAt: log.timestamp,
    },
    interactedUsername,
    actionType,
    actionStatus: log.status === "failed" ? "failed" : log.status === "pending" ? "pending" : "success",
    occurredAt: log.timestamp,
    periodBucket,
    runId: `run_${String(index + 1).padStart(3, "0")}`,
    requestId: `req_${String(index + 41).padStart(3, "0")}`,
    deviceIdSafe: log.device ?? null,
    safeDeviceLabel: log.device ?? null,
    result: log.status ?? "success",
    reason: log.status === "failed" ? "action_blocked_by_account_status" : null,
    evidence: {
      evidenceSource: actionType === "follow" || actionType === "unfollow" || actionType === "dm" ? "ig_interacted_users" : "ig_action_logs",
      evidenceSummary: redactText(log.detail),
      sourceRef: log.id,
      confidence: actionType === "follow" || actionType === "unfollow" ? "high" : "medium",
      metadataSafe: {
        source_surface: "activity_investigation_lab",
        source_type: log.source ?? "worker",
      },
    },
  };
}

function recordMatchesQuery(record: BotAppInteractionRecord, query: BotAppInteractionSearchQuery) {
  if (periodRank(record.periodBucket) > periodRank(query.period)) return false;
  if (query.actionType !== "all" && record.actionType !== query.actionType) return false;
  if (query.clientAccountUsername !== "all" && record.clientAccountUsername !== query.clientAccountUsername) return false;

  const term = normalizeUsername(query.query);
  if (!term) return query.mode === "recent_interactions" || query.mode === "disputes_evidence";
  if (query.mode === "search_by_ct") return record.ct.ctUsername.includes(term);
  if (query.mode === "search_by_account") return record.interactedUsername.includes(term);
  return record.ct.ctUsername.includes(term) || record.interactedUsername.includes(term) || record.clientAccountUsername.includes(term);
}

function ctRemovalPayload(record: BotAppInteractionRecord): BotAppCtRemovalPayload {
  return {
    action: "archive_ct_from_campaign",
    account_id: record.accountId,
    client_id: record.clientId,
    ct_id: record.ct.ctId,
    ct_username: record.ct.ctUsername,
    source: "BotApp",
    requested_by: null,
    idempotency_key: `botapp:ct_archive:${record.accountId}:${record.ct.ctId}`,
    metadata_safe: {
      reason: "operator_marked_low_quality",
      evidence_record_id: record.id,
      expected_effect: "future_secure_relay_archive_ct",
    },
  };
}

function evidenceSummary(record: BotAppInteractionRecord) {
  return `Interaction found: @${record.clientAccountUsername} ${record.actionType.replaceAll("_", " ")} @${record.interactedUsername} on ${record.occurredAt} via CT @${record.ct.ctUsername}.`;
}

export function ActivityLog({ logs }: ActivityLogProps) {
  const records = useMemo(() => logs.map(logToRecord), [logs]);
  const [mode, setMode] = useState<BotAppActivityInvestigationMode>("search_by_ct");
  const [query, setQuery] = useState("@architectes.paris");
  const [period, setPeriod] = useState<BotAppInteractionSearchQuery["period"]>("7d");
  const [actionType, setActionType] = useState<BotAppInteractionActionType | "all">("all");
  const [clientAccount, setClientAccount] = useState<string | "all">("all");
  const [message, setMessage] = useState("");

  const clientAccounts = ["all", ...new Set(records.map((record) => record.clientAccountUsername))];
  const searchQuery: BotAppInteractionSearchQuery = { mode, query, period, actionType, clientAccountUsername: clientAccount };
  const relayPayload: BotAppActivityLogRelayPayload = {
    action: "interaction_investigation_search",
    source: "BotApp",
    requested_by: null,
    query: searchQuery,
    include: ["activity_log_interaction_evidence_admin_v1", "ig_interaction_events", "ig_interacted_users", "ig_targets", "ct_target_audit_events", "ig_action_logs", "ig_runs", "account_run_requests"],
    metadata_safe: {
      expected_effect: "read_only_interaction_investigation",
    },
  };
  const results = records.filter((record) => recordMatchesQuery(record, searchQuery));
  const hasQuery = Boolean(normalizeUsername(query)) || mode === "recent_interactions" || mode === "disputes_evidence";
  const status = results.length ? "found" : "not_found";
  const selectedTerm = normalizeUsername(query) ? `@${normalizeUsername(query)}` : "the selected filters";

  function prepareCtArchive(record: BotAppInteractionRecord) {
    const payload = ctRemovalPayload(record);
    void payload;
    setMessage(`Archive/remove CT prepared for @${record.ct.ctUsername}. This affects only @${record.clientAccountUsername} after secure relay approval.`);
  }

  async function copyEvidence(record: BotAppInteractionRecord) {
    const text = evidenceSummary(record);
    await navigator.clipboard.writeText(text);
    setMessage(`Evidence summary copied for @${record.interactedUsername}.`);
  }

  function clearFilters() {
    setQuery(mode === "search_by_ct" ? "@architectes.paris" : "");
    setPeriod("7d");
    setActionType("all");
    setClientAccount("all");
    setMessage("Filters cleared.");
  }

  function exportEvidence(format: "json" | "csv", record?: BotAppInteractionRecord) {
    const rows = (record ? [record] : results).map((item) => redactRecord({
      id: item.id,
      client_account: item.clientAccountUsername,
      ct_username: item.ct.ctUsername,
      interacted_username: item.interactedUsername,
      action_type: item.actionType,
      status: item.actionStatus,
      occurred_at: item.occurredAt,
      run_id: item.runId,
      request_id: item.requestId,
      device: item.safeDeviceLabel ?? item.deviceIdSafe,
      evidence: item.evidence.evidenceSummary,
      confidence: item.evidence.confidence,
    }));
    const content = format === "json"
      ? JSON.stringify(rows, null, 2)
      : [
        Object.keys(rows[0] ?? {}).join(","),
        ...rows.map((row) => Object.values(row).map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`).join(",")),
      ].join("\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `interaction-evidence-safe.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="activity-log-screen">
      <header className="activity-log-header">
        <div>
          <span>Investigation</span>
          <h2>Activity Log</h2>
          <p>Investigate CT sources and account interactions.</p>
        </div>
        <button type="button" onClick={() => exportEvidence("json")} disabled={!results.length}>Export JSON</button>
      </header>

      <section className="activity-log-search">
        <div className="activity-log-search-main">
          <label>
            <span>Global search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mode === "search_by_ct" ? "@ct_username" : "@interacted_account"}
            />
          </label>
          <button type="button" onClick={() => {
            void relayPayload;
            setMessage(`${status === "found" ? "Interaction found" : "No interaction found"} for ${selectedTerm}. Search payload prepared for secure relay.`);
          }}>
            Search
          </button>
          <button type="button" onClick={clearFilters}>Clear filters</button>
        </div>
        <div className="activity-log-modes" aria-label="Activity investigation modes">
          {modes.map((item) => (
            <button key={item.id} type="button" className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)} title={item.hint}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="activity-log-kpis" aria-label="Investigation summary">
        <Kpi label="Interactions" value={records.length} tone="neutral" />
        <Kpi label="CT sources" value={new Set(records.map((record) => record.ct.ctId)).size} tone="info" />
        <Kpi label="Found now" value={results.length} tone={results.length ? "good" : "warning"} />
        <Kpi label="Best effort" value={records.filter((record) => record.evidence.confidence === "best_effort" || record.evidence.confidence === "medium").length} tone="warning" />
      </section>

      <section className="activity-log-card">
        <div className="activity-log-card-heading">
          <span>{mode.replaceAll("_", " ")}</span>
          <h3>{status === "found" ? "Interaction found" : "No interaction found"}</h3>
          <p>
            {status === "found"
              ? `${results.length} result${results.length === 1 ? "" : "s"} for ${selectedTerm} in ${period}.`
              : `No interaction found for ${selectedTerm} in the selected period.`}
          </p>
        </div>

        <div className="activity-log-filters" aria-label="Interaction filters">
          <Select label="Period" value={period} onChange={(value) => setPeriod(value as BotAppInteractionSearchQuery["period"])} options={["24h", "7d", "30d"]} />
          <Select label="Action type" value={actionType} onChange={(value) => setActionType(value as BotAppInteractionActionType | "all")} options={actionTypes} />
          <Select label="Client account" value={clientAccount} onChange={(value) => setClientAccount(value)} options={clientAccounts} />
        </div>

        {hasQuery && !results.length ? (
          <div className="activity-log-empty">
            <span>No interaction found</span>
            <strong>No interaction found for {selectedTerm} in the selected period.</strong>
            <p>Period: {period}. Interaction types searched: {actionType === "all" ? "follow, unfollow, like, comment, DM, story view, profile visit, followback" : actionType.replaceAll("_", " ")}.</p>
          </div>
        ) : null}

        <div className="activity-log-results">
          {results.map((record) => (
            <article key={record.id} className={`activity-log-result ${record.actionStatus === "failed" ? "danger" : record.evidence.confidence === "medium" ? "warning" : "good"}`}>
              <div className="activity-log-result-main">
                <div>
                  <span>{record.actionType.replaceAll("_", " ")}</span>
                  <h4>@{record.interactedUsername}</h4>
                  <p>{evidenceSummary(record)}</p>
                </div>
                <div className="activity-log-result-badges">
                  <Badge label={record.actionStatus} tone={record.actionStatus === "failed" ? "danger" : "good"} />
                  <Badge label={record.evidence.confidence} tone={record.evidence.confidence === "high" ? "good" : "warning"} />
                </div>
              </div>

              <div className="activity-log-meta">
                <Field label="Client account" value={`@${record.clientAccountUsername}`} />
                <Field label="CT source" value={`@${record.ct.ctUsername}`} />
                <Field label="Occurred" value={record.occurredAt} />
                <Field label="Run / session" value={record.runId ?? "unknown"} />
                <Field label="Device" value={record.deviceIdSafe ?? "unknown"} />
                <Field label="Evidence" value={record.evidence.evidenceSource} />
              </div>

              <div className="activity-log-evidence">
                <span>Evidence summary</span>
                <strong>{record.evidence.evidenceSummary}</strong>
              </div>

              <div className="activity-log-actions">
                <button type="button" onClick={() => setMessage(`Open account prepared for @${record.clientAccountUsername}.`)}>Open account</button>
                <button type="button" onClick={() => setMessage(`Open CT details prepared for @${record.ct.ctUsername}.`)}>Open CT</button>
                <button type="button" onClick={() => prepareCtArchive(record)}>Archive/remove CT</button>
                <button type="button" onClick={() => void copyEvidence(record)}>Copy summary</button>
                <button type="button" onClick={() => exportEvidence("json", record)}>Export JSON</button>
                <button type="button" onClick={() => exportEvidence("csv", record)}>Export CSV</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {message ? <div className="activity-log-message">{message}</div> : null}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`activity-log-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="activity-log-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option === "all" ? "All" : option.replaceAll("_", " ")}</option>)}
      </select>
    </label>
  );
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return <strong className={`activity-log-badge ${tone}`}>{label.replaceAll("_", " ")}</strong>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="activity-log-field">
      <span>{label}</span>
      <strong>{value || "unknown"}</strong>
    </span>
  );
}
