import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import {
  INCIDENTS_LIST_STATUS,
  INCIDENTS_REFRESH_INTERVAL_MS,
  countIncidents,
  deliveryCopy,
  emptyIncidentCopy,
  incidentLoadErrorCopy,
  incidentStateCopy,
  isArmedOrPendingRecovery,
  normalizeIncidentList,
  normalizeGlobalIncidentCounters,
  normalizeIncidentRow,
  recoveryReasonCopy,
  resolveButtonLabel,
  severityTone,
  shouldPollIncidents,
  shouldShowAcknowledge,
  shouldShowKeepPaused,
  shouldShowReadyToResume,
  shouldShowResolve,
} from "./incidents-view.ts";

const viewSource = readFileSync(new URL("./Incidents.tsx", import.meta.url), "utf8");
const incidentsViewSource = readFileSync(new URL("./incidents-view.ts", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("./IncidentDrawer.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
const routesSource = readFileSync(new URL("../app/routes.tsx", import.meta.url), "utf8");
const electronMainSource = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf8");
const operatorReviewActionSource = readFileSync(new URL("../../electron/operator-review-action.cjs", import.meta.url), "utf8");

const mythylLikeIncident = {
  id: "inc-1",
  status: "open",
  displayState: "action_required",
  severity: "error",
  incidentType: "run_identity_verification_failed",
  reasonCode: "actual_logged_in_username_not_detected",
  operatorLabel: "Identité Instagram non vérifiable",
  actionRequired: "human_verification_required",
  accountId: "acc-1",
  accountUsername: "client_account",
  runId: "run-1",
  occurrenceCount: 3,
  lastSeenAt: "2026-07-06T22:00:00Z",
  deliveryState: "delivered",
  isTest: false,
};

test("normalizeIncidentRow keeps the true stable reason code", () => {
  const row = normalizeIncidentRow(mythylLikeIncident);
  assert.equal(row.reasonCode, "actual_logged_in_username_not_detected");
  assert.equal(row.incidentType, "run_identity_verification_failed");
  assert.equal(row.displayState, "action_required");
  assert.equal(row.occurrenceCount, 3);
});

test("normalizeIncidentRow accepts snake_case fallbacks from the bridge", () => {
  const row = normalizeIncidentRow({
    id: "inc-2",
    status: "open",
    incident_type: "run_worker_failure",
    reason: "worker_exit_nonzero",
    account_id: "acc-9",
    account_username: "someone",
    occurrence_count: "2",
    last_seen_at: "2026-07-06T21:00:00Z",
  });
  assert.equal(row.incidentType, "run_worker_failure");
  assert.equal(row.reasonCode, "worker_exit_nonzero");
  assert.equal(row.accountId, "acc-9");
  assert.equal(row.occurrenceCount, 2);
});

test("normalizeIncidentRow translates known legacy French incident copy", () => {
  const row = normalizeIncidentRow({
    id: "legacy-worker-failure",
    incident_type: "run_worker_failure",
    operatorLabel: "Échec worker sans raison structurée",
    action_required: "Le worker s'est terminé en erreur sans raison structurée. Vérifier les logs internes du run.",
  });
  assert.equal(row.operatorLabel, "Worker process failure");
  assert.equal(
    row.actionRequired,
    "The worker exited with an error and no structured reason. Review the internal run logs.",
  );
});

test("normalizeIncidentRow derives action_required from open + action", () => {
  const row = normalizeIncidentRow({
    id: "inc-3",
    status: "open",
    incident_type: "run_identity_verification_failed",
    action_required: "human_verification_required",
  });
  assert.equal(row.displayState, "action_required");
});

test("normalizeIncidentList drops rows without id and never throws", () => {
  const rows = normalizeIncidentList([mythylLikeIncident, {}, null, { id: "" }]);
  assert.equal(rows.length, 1);
  assert.equal(normalizeIncidentList(undefined).length, 0);
});

test("countIncidents: open includes acknowledged, action_required separate, tests excluded", () => {
  const rows = normalizeIncidentList([
    mythylLikeIncident,
    { id: "a", status: "open", incident_type: "run_worker_failure" },
    { id: "b", status: "acknowledged", incident_type: "run_worker_failure" },
    { id: "c", status: "resolved", incident_type: "run_worker_failure" },
    { id: "d", status: "open", incident_type: "system_test_incident", isTest: true, deliveryState: "delivery_degraded" },
  ]);
  const counters = countIncidents(rows);
  assert.equal(counters.actionRequired, 1);
  assert.equal(counters.open, 2);
  assert.equal(counters.resolved, 1);
  assert.equal(counters.deliveryDegraded, 0);
  assert.equal(counters.total, 4);
});

test("empty, permission, contract and unavailable states are distinct", () => {
  assert.equal(emptyIncidentCopy("open").title, "No open incidents");
  assert.match(incidentLoadErrorCopy("permission").title, /access denied/i);
  assert.match(incidentLoadErrorCopy("invalid_contract").title, /contract is invalid/i);
  assert.match(incidentLoadErrorCopy("backend_unavailable").title, /backend unavailable/i);
});

test("global counters are validated independently from the loaded page", () => {
  assert.deepEqual(normalizeGlobalIncidentCounters({
    open: 22,
    actionRequired: 3,
    resolved: 9,
    deliveryDegraded: 1,
    total: 34,
  }), { open: 22, actionRequired: 3, resolved: 9, deliveryDegraded: 1, total: 34 });
  assert.equal(normalizeGlobalIncidentCounters({ open: -1 }), null);
  assert.equal(normalizeGlobalIncidentCounters(null), null);
});

test("Incidents view uses default page size 50, four filters, search and cursor pagination", () => {
  assert.match(viewSource, /limit: 50/);
  assert.match(viewSource, /action_required/);
  assert.match(viewSource, /Search account or reason/);
  assert.match(viewSource, /nextCursor/);
  assert.match(viewSource, /Next page/);
});

test("Incidents view never shows operational counters with a load error", () => {
  assert.match(viewSource, /!loadError \? <Badge/);
  assert.match(incidentsViewSource, /No incident count is shown/);
});

test("delivery degraded is surfaced with a readable label and error tone", () => {
  const degraded = deliveryCopy("delivery_degraded");
  assert.equal(degraded.tone, "error");
  assert.match(degraded.label, /degraded/i);
  assert.equal(deliveryCopy("delivered").tone, "success");
  assert.equal(deliveryCopy("none").tone, "neutral");
});

test("state and severity copy are stable", () => {
  assert.equal(incidentStateCopy("action_required").tone, "error");
  assert.equal(incidentStateCopy("reviewed").label, "Reviewed");
  assert.equal(incidentStateCopy("reviewed").tone, "success");
  assert.equal(incidentStateCopy("resolved").tone, "success");
  assert.equal(incidentStateCopy("unexpected_state").label, "unexpected_state");
  assert.equal(severityTone("critical"), "error");
  assert.equal(severityTone("warning"), "warning");
  assert.equal(severityTone("info"), "neutral");
});

test("polling is gated to the active incidents view and visible window", () => {
  assert.equal(shouldPollIncidents("incidents", "visible"), true);
  assert.equal(shouldPollIncidents("incidents", "hidden"), false);
  assert.equal(shouldPollIncidents("devices", "visible"), false);
  assert.equal(INCIDENTS_REFRESH_INTERVAL_MS >= 15_000, true);
});

test("view requests open, acknowledged and resolved incidents explicitly", () => {
  assert.equal(INCIDENTS_LIST_STATUS, "open,acknowledged,resolved");
  assert.match(viewSource, /INCIDENTS_LIST_STATUS/);
});

test("Incidents view stops polling on unmount and listens to visibility", () => {
  assert.match(viewSource, /createDevicesAutoRefreshController/);
  assert.match(viewSource, /controller\.stop\(\)/);
  assert.match(viewSource, /visibilitychange/);
});

test("Incidents view never exposes a run-relaunch action (P2)", () => {
  assert.doesNotMatch(viewSource, /manual_retry|resume_scheduling|runs\/start|Start run/i);
});

test("IncidentDrawer no longer offers manual retry in P2", () => {
  assert.doesNotMatch(drawerSource, /botapp-incident-action-manual-retry/);
  assert.doesNotMatch(drawerSource, /runAction\("manual_retry"\)/);
});

test("P3.2 recovery display states have exact English operator labels", () => {
  assert.equal(
    incidentStateCopy("ready_to_resume").label,
    "Resume authorized — awaiting next tick",
  );
  assert.equal(incidentStateCopy("resume_requested").label, "Resume requested");
  assert.equal(incidentStateCopy("reintervention_required").label, "New intervention required");
  assert.equal(incidentStateCopy("action_required").label, "Action required");
  assert.equal(incidentStateCopy("resolved").label, "Resolved");
});

test("P3 recovery states are counted as active incidents", () => {
  const rows = normalizeIncidentList([
    { id: "a", status: "open", displayState: "ready_to_resume", incident_type: "run_identity_verification_failed" },
    { id: "b", status: "open", displayState: "resume_requested", incident_type: "run_identity_verification_failed" },
    { id: "c", status: "open", displayState: "reintervention_required", incident_type: "run_identity_verification_failed" },
  ]);
  const counters = countIncidents(rows);
  assert.equal(counters.open, 2);
  assert.equal(counters.actionRequired, 1);
});

test("P3.2 recovery action visibility helpers", () => {
  const eligible = { state: "awaiting_human_resume_authorization", eligible: true };
  const armed = { state: "ready_to_resume", eligible: false, authorizationStatus: "armed" };
  const expired = { state: "reintervention_required", eligible: false, reason: "resume_window_closed" };
  assert.equal(shouldShowReadyToResume(eligible), true);
  assert.equal(shouldShowReadyToResume(armed), false);
  assert.equal(isArmedOrPendingRecovery(armed), true);
  assert.equal(shouldShowAcknowledge(armed, true), false);
  assert.equal(shouldShowKeepPaused(armed), false);
  assert.equal(shouldShowResolve(armed, true), false);
  assert.equal(shouldShowResolve(expired, true), true);
  assert.equal(resolveButtonLabel(expired), "Resolve without resuming");
  assert.equal(resolveButtonLabel(undefined), "Resolve after verification");
});

test("P3.2 recovery reasons map to safe English operator copy", () => {
  assert.match(recoveryReasonCopy("awaiting_next_scheduler_tick"), /awaiting the next Auto Restart tick/i);
  assert.match(recoveryReasonCopy("resume_authorization_expired"), /Recovery window expired/i);
  assert.match(recoveryReasonCopy("resume_retry_window_exhausted"), /consum/i);
  assert.equal(recoveryReasonCopy("unknown_reason_code"), "unknown_reason_code");
  assert.equal(recoveryReasonCopy(""), null);
});

test("drawer shows 'Ready to resume' only for backend-proven eligible incidents", () => {
  assert.match(drawerSource, /Ready to resume/);
  assert.match(drawerSource, /shouldShowReadyToResume/);
  assert.match(drawerSource, /runAction\("ready_to_resume"/);
  assert.doesNotMatch(drawerSource, /runs\/start|Start run|forceTick|auto-restart\/tick/i);
});

test("P3.2 drawer hides ambiguous actions when recovery is armed or pending", () => {
  assert.match(drawerSource, /isArmedOrPendingRecovery/);
  assert.match(drawerSource, /shouldShowAcknowledge/);
  assert.match(drawerSource, /shouldShowKeepPaused/);
  assert.match(drawerSource, /shouldShowResolve/);
  assert.match(drawerSource, /resolveButtonLabel/);
  assert.match(drawerSource, /\{showAcknowledge \?/);
  assert.match(drawerSource, /\{showResolve \?/);
  assert.match(drawerSource, /\{showKeepPaused \?/);
});

test("drawer displays the recovery window and authorization states in English", () => {
  assert.match(drawerSource, /incident-recovery-window/);
  assert.match(drawerSource, /authorizationStatusCopy/);
  assert.match(incidentsViewSource, /Authorization consumed/);
  assert.match(incidentsViewSource, /Recovery window expired/);
  assert.match(incidentsViewSource, /Armed — awaiting next tick/);
  assert.match(drawerSource, /Controlled recovery/);
});

test("P3.2 incidents UI has no forbidden French operator strings in view or drawer", () => {
  const forbidden = [
    "Prêt à relancer",
    "Reprise autorisée",
    "Reprise contrôlée",
    "Fenêtre de reprise",
    "Armée — en attente",
    "Nouvelle intervention requise",
  ];
  for (const phrase of forbidden) {
    assert.doesNotMatch(viewSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(incidentsViewSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(drawerSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("drawer keeps a simple resolve action and drops the dead resume flag", () => {
  assert.match(drawerSource, /runAction\("resolve"/);
  // resume_scheduling was ignored by the backend; the canonical resume
  // authorization now goes through ready_to_resume only.
  assert.doesNotMatch(drawerSource, /resume_scheduling/);
});

test("drawer exposes linked operator review as a separate confirmed workflow", () => {
  assert.match(drawerSource, /operatorReviewAction/);
  assert.match(drawerSource, /Mark reviewed/);
  assert.match(drawerSource, /Confirm review/);
  assert.match(drawerSource, /Review note \(optional\)/);
  assert.match(drawerSource, /incidents\?\.markReviewed/);
  assert.match(drawerSource, /onProfilesChanged\?\.\(\)/);
  assert.match(drawerSource, /resolveButtonLabel/);
  assert.match(drawerSource, /operatorReviewStatus === "reviewed" \? "Reviewed"/);
  assert.match(drawerSource, /incidentStateCopy\(incident\?\.displayState/);
});

test("operator review uses the canonical backend endpoint through IPC", () => {
  assert.match(electronMainSource, /id: "dashboard_action_review"/);
  assert.match(electronMainSource, /path: "\/api\/instagram-dashboard\/dashboard-actions\/review"/);
  assert.match(electronMainSource, /review_status: "reviewed"/);
  assert.match(electronMainSource, /source: "botapp_relay"/);
  assert.match(electronMainSource, /operator_id: botappOperatorId\(\)/);
  assert.match(electronMainSource, /extractOperatorReviewActionId/);
  assert.match(electronMainSource, /BOTAPP_OPERATOR_ID/);
  assert.match(electronMainSource, /botapp:incidents:mark-reviewed/);
  assert.match(preloadSource, /markReviewed/);
  assert.doesNotMatch(drawerSource, /\.update\(/);
});

test("operator review backend errors remain visible without a false resolution", () => {
  const handler = drawerSource.slice(
    drawerSource.indexOf("async function markOperatorReviewed"),
    drawerSource.indexOf("const incident = detail?.incident"),
  );
  assert.match(handler, /if \(!result\?\.ok\)/);
  assert.match(handler, /setError\(message\)/);
  assert.match(handler, /setActionProof\(\{ action: "mark_reviewed", ok: false, message \}\)/);
  assert.match(handler, /return;/);
  assert.match(handler, /message: "Operator review recorded\."/);
  assert.match(electronMainSource, /dashboardRequestResult\("POST", "dashboard_action_review"/);
  assert.match(electronMainSource, /errorKind: "already_terminal"/);
  assert.match(electronMainSource, /errorKind: "not_reviewable"/);
  assert.match(electronMainSource, /errorKind: "incident_still_blocking"/);
  assert.match(electronMainSource, /errorKind: "unauthorized"/);
  assert.match(electronMainSource, /errorKind: "backend_unavailable"/);
  assert.match(electronMainSource, /errorKind: "unknown_error"/);
  assert.match(drawerSource, /result\?\.message \|\| result\?\.error/);
  assert.doesNotMatch(handler, /exc instanceof Error \? exc\.message/);
  assert.match(operatorReviewActionSource, /value\.id/);
  assert.doesNotMatch(operatorReviewActionSource, /JSON\.stringify/);
});

test("P3.1: the main process always requests test incidents for the toggle", () => {
  // Without include_test=1 the backend filters test incidents server-side,
  // testCount stays 0 and the renderer's "Show test incidents" toggle can
  // never appear (dead toggle). Operational counters still exclude tests.
  const mainSource = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
  const overviewSlice = mainSource.slice(
    mainSource.indexOf("async function incidentsOverview"),
    mainSource.indexOf("async function incidentsDetail"),
  );
  assert.match(overviewSlice, /include_test: "1"/);
});

test("App routes the incidents view with account navigation to Profiles", () => {
  assert.match(routesSource, /id: "incidents", label: "Incidents", group: "Monitoring"/);
  assert.match(appSource, /active === "incidents"/);
  assert.match(appSource, /<Incidents onOpenProfile=/);
});
