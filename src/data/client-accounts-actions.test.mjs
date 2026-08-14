import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClientAccountLifecycleAction,
  buildLifecycleAvailability,
  clientAccountPrimaryStatus,
  clientAccountStatusCopy,
  lifecycleActionCopy,
  lifecycleActionAvailability,
  relayActionsAvailable,
} from "./client-accounts-actions.ts";

function account(overrides = {}) {
  return {
    accountId: "acct_botapp",
    profileId: "prof_botapp",
    clientId: "client_1",
    clientName: "Test Client",
    username: "botapp",
    displayName: "botapp",
    platform: "Instagram",
    createdAtLabel: "Jun 01, 2026",
    accountStatus: "active",
    adminStatus: "active",
    customerStatus: "active",
    subscriptionStatus: "active",
    lifecycleStatus: "active",
    loginStatus: "ready",
    credentialStatus: "active",
    credentialsConfigured: true,
    reauthRequired: false,
    twoFactorStatus: "unknown",
    readiness: "ready",
    eligibility: "can_start",
    eligibilityReason: "ready",
    reasonLabel: "Ready",
    packageLabel: "Growth",
    entitlementSummary: "active",
    entitlements: ["follow"],
    assignment: {
      deviceId: "phone_01",
      deviceName: "PHONE 1",
      deviceStatus: "connected",
      appInstanceLabel: "PHONE 1",
      packageName: "com.instagram.android",
      assignmentStatus: "assigned",
      slotKind: "full_cycle_6h",
      activeWindow: "09:00-12:00",
    },
    lastActivityAt: null,
    targetsCount: 0,
    needsMoreTargets: false,
    eligibleTargetCount: 0,
    actionsNeeded: [],
    safeEmailDisplay: "Not provided",
    clientContactEmailDisplay: "Not provided",
    clientContactEmailSource: "missing",
    clientContactEmailAvailable: false,
    sourceLabel: "supabase_projection:manage_overview",
    profileImageUrl: null,
    instagramVerificationStatus: "verified",
    passwordStatus: "configured",
    twoFactorDisplay: "unknown",
    ...overrides,
  };
}

test("relay unavailable disables lifecycle actions with clear reason", () => {
  const availability = lifecycleActionAvailability(account(), "cancel", false);
  assert.equal(availability.disabled, true);
  assert.match(availability.disabledReason, /Secure relay not connected/);
});

test("relay available exposes cancel confirmation requirement", () => {
  const availability = lifecycleActionAvailability(account(), "cancel", true);
  assert.equal(availability.disabled, false);
  assert.equal(availability.requiresConfirmation, true);
});

test("active run signal disables cancel", () => {
  const availability = lifecycleActionAvailability(
    account({ eligibility: "blocked_now", eligibilityReason: "already_running" }),
    "cancel",
    true,
  );
  assert.equal(availability.disabled, true);
  assert.match(availability.disabledReason, /run/i);
});

test("relayActionsAvailable requires configured relay health", () => {
  assert.equal(relayActionsAvailable({ ok: true, relay_authenticated: true }, { relayUrlConfigured: true, relayKeyConfigured: true }), true);
  assert.equal(relayActionsAvailable({ ok: false }, { relayUrlConfigured: true, relayKeyConfigured: true }), false);
  assert.equal(relayActionsAvailable({ ok: true }, { relayUrlConfigured: false, relayKeyConfigured: false }), false);
});

test("buildLifecycleAvailability returns four lifecycle actions", () => {
  assert.equal(buildLifecycleAvailability(account(), false).length, 4);
});

test("commercial pause outranks assistance and exposes the paused action matrix", () => {
  const paused = account({ accountStatus: "paused", actionsNeeded: ["identity review"] });
  assert.equal(clientAccountPrimaryStatus(paused), "paused");
  const matrix = Object.fromEntries(buildLifecycleAvailability(paused, true).map((item) => [item.action, item.disabled]));
  assert.deepEqual(matrix, {
    pause: true,
    cancel: false,
    mark_needs_assistance: true,
    reactivate: false,
  });
});

test("active and cancelled lifecycle action matrices are deterministic", () => {
  const active = Object.fromEntries(buildLifecycleAvailability(account(), true).map((item) => [item.action, item.disabled]));
  assert.equal(active.pause, false);
  assert.equal(active.reactivate, true);
  assert.equal(active.cancel, false);

  const cancelled = Object.fromEntries(buildLifecycleAvailability(account({ accountStatus: "cancelled" }), true).map((item) => [item.action, item.disabled]));
  assert.equal(cancelled.pause, true);
  assert.equal(cancelled.reactivate, true);
  assert.equal(cancelled.cancel, true);
});

test("lifecycle action copy is complete and never mixes French and English", () => {
  assert.equal(lifecycleActionCopy("pause", "en").label, "Suspend campaign");
  assert.match(lifecycleActionCopy("pause", "en").description, /^Suspends billing/);
  assert.equal(lifecycleActionCopy("pause", "fr").label, "Suspendre la campagne");
  assert.match(lifecycleActionCopy("pause", "fr").description, /^Suspend la facturation/);
  assert.equal(clientAccountStatusCopy("paused", "en"), "paused");
  assert.equal(clientAccountStatusCopy("paused", "fr"), "en pause");
  assert.equal(clientAccountStatusCopy("operator_review_required", "en"), "operator review required");
  assert.equal(clientAccountStatusCopy("operator_review_required", "fr"), "revue opérateur requise");
});

test("applyClientAccountLifecycleAction blocks when relay unavailable", async () => {
  const result = await applyClientAccountLifecycleAction(
    { account: account(), action: "pause" },
    { relayAvailable: false, send: async () => ({ ok: true }) },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /Secure relay not connected/);
});

test("applyClientAccountLifecycleAction requires confirmation for cancel", async () => {
  let sent = false;
  const result = await applyClientAccountLifecycleAction(
    { account: account(), action: "cancel" },
    { relayAvailable: true, send: async () => { sent = true; return { ok: true }; } },
  );
  assert.equal("needsConfirmation" in result && result.needsConfirmation, true);
  assert.equal(sent, false);
});

test("applyClientAccountLifecycleAction sends backend payload after cancel confirmation", async () => {
  let payload = null;
  const result = await applyClientAccountLifecycleAction(
    { account: account(), action: "cancel", confirmed: true },
    {
      relayAvailable: true,
      send: async (input) => {
        payload = input;
        return { ok: true };
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(payload?.action, "cancel");
  assert.equal(payload?.accountId, "acct_botapp");
});

test("applyClientAccountLifecycleAction surfaces backend errors", async () => {
  const result = await applyClientAccountLifecycleAction(
    { account: account(), action: "mark_needs_assistance" },
    {
      relayAvailable: true,
      send: async () => ({ ok: false, error: "Cannot mark while run is active." }),
    },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /Cannot mark while run is active/);
});
