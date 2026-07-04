import assert from "node:assert/strict";
import test from "node:test";
import {
  applyNeedsMoreTargetsAction,
  needsMoreTargetsActionAvailability,
} from "./needs-more-targets-actions.ts";

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
    eligibleTargetCount: 5,
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

test("relay unavailable disables needs more targets action", () => {
  const availability = needsMoreTargetsActionAvailability(account(), false);
  assert.equal(availability.disabled, true);
  assert.match(availability.disabledReason, /Secure relay not connected/);
});

test("inactive signal exposes mark action with confirmation", () => {
  const availability = needsMoreTargetsActionAvailability(account({ needsMoreTargets: false, eligibleTargetCount: 5 }), true);
  assert.equal(availability.action, "mark");
  assert.equal(availability.requiresConfirmation, true);
  assert.match(availability.label, /Needs more target accounts/);
});

test("active signal exposes clear action", () => {
  const availability = needsMoreTargetsActionAvailability(account({ needsMoreTargets: true, eligibleTargetCount: 3 }), true);
  assert.equal(availability.action, "clear");
  assert.match(availability.label, /Clear needs more targets/);
});

test("applyNeedsMoreTargetsAction requires confirmation before send", async () => {
  let sent = false;
  const result = await applyNeedsMoreTargetsAction(
    { account: account() },
    { relayAvailable: true, send: async () => { sent = true; return { ok: true }; } },
  );
  assert.equal("needsConfirmation" in result && result.needsConfirmation, true);
  assert.equal(sent, false);
});

test("applyNeedsMoreTargetsAction sends mark payload without run or phone side effects", async () => {
  let payload = null;
  const result = await applyNeedsMoreTargetsAction(
    { account: account(), confirmed: true },
    {
      relayAvailable: true,
      send: async (input) => {
        payload = input;
        return { ok: true };
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(payload?.action, "mark");
  assert.equal(payload?.accountId, "acct_botapp");
  assert.equal(payload?.metadata.expected_effect, "needs_more_target_accounts_signal_only");
});

test("applyNeedsMoreTargetsAction sends clear when signal already active", async () => {
  let payload = null;
  const result = await applyNeedsMoreTargetsAction(
    { account: account({ needsMoreTargets: true }), confirmed: true },
    {
      relayAvailable: true,
      send: async (input) => {
        payload = input;
        return { ok: true };
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(payload?.action, "clear");
});
