import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  INCIDENTS_LIST_STATUS,
  INCIDENTS_REFRESH_INTERVAL_MS,
  countIncidents,
  deliveryCopy,
  incidentStateCopy,
  normalizeIncidentList,
  normalizeIncidentRow,
  recoveryReasonCopy,
  severityTone,
  shouldPollIncidents,
} from "./incidents-view.ts";

const viewSource = readFileSync(new URL("./Incidents.tsx", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("./IncidentDrawer.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
const routesSource = readFileSync(new URL("../app/routes.tsx", import.meta.url), "utf8");

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
  assert.equal(counters.deliveryDegraded, 0);
  assert.equal(counters.total, 4);
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

test("P3 recovery display states have exact French operator labels", () => {
  assert.equal(incidentStateCopy("ready_to_resume").label, "Prêt à relancer");
  assert.equal(incidentStateCopy("resume_requested").label, "Reprise demandée");
  assert.equal(incidentStateCopy("reintervention_required").label, "Nouvelle intervention requise");
  assert.equal(incidentStateCopy("reintervention_required").tone, "error");
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

test("recovery reasons map to safe operator copy", () => {
  assert.match(recoveryReasonCopy("awaiting_next_scheduler_tick"), /prochain tick/);
  assert.match(recoveryReasonCopy("resume_authorization_expired"), /expirée?/i);
  assert.match(recoveryReasonCopy("resume_retry_window_exhausted"), /consommé/);
  assert.equal(recoveryReasonCopy("unknown_reason_code"), "unknown_reason_code");
  assert.equal(recoveryReasonCopy(""), null);
});

test("drawer shows 'Prêt à relancer' only for backend-proven eligible incidents", () => {
  // Exact visible label, gated on recovery.eligible from the detail endpoint.
  assert.match(drawerSource, /Prêt à relancer/);
  assert.match(drawerSource, /recovery\?\.eligible === true/);
  assert.match(drawerSource, /runAction\("ready_to_resume"/);
  // The button never starts anything locally: no run/tick primitives.
  assert.doesNotMatch(drawerSource, /runs\/start|Start run|forceTick|auto-restart\/tick/i);
});

test("drawer displays the resume window and authorization states", () => {
  assert.match(drawerSource, /incident-recovery-window/);
  assert.match(drawerSource, /Autorisation consommée/);
  assert.match(drawerSource, /Fenêtre expirée/);
  assert.match(drawerSource, /en attente du prochain tick/);
});

test("drawer keeps a simple resolve action and drops the dead resume flag", () => {
  assert.match(drawerSource, /runAction\("resolve"/);
  // resume_scheduling was ignored by the backend; the canonical resume
  // authorization now goes through ready_to_resume only.
  assert.doesNotMatch(drawerSource, /resume_scheduling/);
});

test("App routes the incidents view with account navigation to Profiles", () => {
  assert.match(routesSource, /id: "incidents", label: "Incidents", group: "Monitoring"/);
  assert.match(appSource, /active === "incidents"/);
  assert.match(appSource, /<Incidents onOpenProfile=/);
});
