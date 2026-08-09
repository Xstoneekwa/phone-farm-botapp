import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyResolveConflict,
  incidentActionErrorMessage,
  isIncidentVersionConflict,
} from "./incident-action-reconciliation.ts";

function detail(patch = {}) {
  return {
    contractVersion: "incident_detail_v1",
    incident: {
      id: "incident-1",
      accountId: "account-1",
      accountUsername: "account_name",
      status: "open",
      displayState: "action_required",
      severity: "critical",
      reason: "actual_logged_in_username_not_detected",
      version: 1,
      operatorReviewStatus: "reviewed",
      ...(patch.incident || {}),
    },
    linked: {},
    operatorReviewAction: null,
    timeline: [],
    notifications: [],
    notificationChannels: {
      slack: { channel: "slack", current: null, history: [] },
      discord: { channel: "discord", current: null, history: [] },
    },
    lifecycle: {
      acknowledgeSupported: true,
      investigatingStateSupported: false,
      resolveSupported: true,
      reopenSupported: false,
      addNoteSupported: true,
      retryFailedNotificationSupported: true,
      ...(patch.lifecycle || {}),
    },
    retention: {},
  };
}

test("only the typed backend lifecycle conflict is retryable", () => {
  assert.equal(isIncidentVersionConflict({ status: 409, code: "INCIDENT_ACTION_CONFLICT" }), true);
  assert.equal(isIncidentVersionConflict({ status: 409, reason: "corrected_worker_runtime_not_certified" }), false);
  assert.equal(isIncidentVersionConflict({ status: 409, error: "slot conflict" }), false);
});

test("a benign version-only advance retries once and material changes fail closed", () => {
  const before = detail();
  assert.equal(classifyResolveConflict(before, detail({ incident: { version: 2, status: "acknowledged" } })), "retry_once");
  assert.equal(classifyResolveConflict(before, detail({ incident: { version: 2, reason: "different_reason" } })), "material_conflict");
  assert.equal(classifyResolveConflict(before, detail({ incident: { version: 2, accountId: "different-account" } })), "material_conflict");
  assert.equal(classifyResolveConflict(before, detail({ incident: { version: 1 } })), "material_conflict");
});

test("a concurrently resolved incident is reconciled as idempotent success", () => {
  assert.equal(classifyResolveConflict(detail(), detail({ incident: { version: 2, status: "resolved" } })), "already_resolved");
});

test("runtime proof and material conflicts keep their exact operator message", () => {
  assert.match(incidentActionErrorMessage({ status: 409, reason: "corrected_worker_runtime_sha_mismatch" }), /runtime identity is not certified/);
  assert.equal(incidentActionErrorMessage({ status: 409, error: "Schedule conflict" }), "Schedule conflict");
});
