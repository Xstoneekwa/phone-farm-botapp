import type {
  BotAppClientAccount,
  BotAppClientAccountsOverview,
  BotAppClientAccountsSummary,
  BotProfile,
  Device,
} from "../api/types";

const fixtureAccounts = [
  { username: "liam_bel_epee", clientName: "Entry 2A Test Client", createdAt: "Jun 07, 2026, 11:15 PM", profileId: "prof_001" },
  { username: "j_automatise_pour_toi", clientName: "Entry 2A Test Client", createdAt: "Jun 07, 2026, 09:31 PM", profileId: "prof_002" },
  { username: "i_m_your_traker", clientName: "Entry 2A Test Client", createdAt: "Jun 03, 2026, 08:15 PM", profileId: "prof_004" },
  { username: "test_account_ops", clientName: "Entry 2A Test Client", createdAt: "Jun 02, 2026, 04:40 PM", profileId: "prof_005" },
] as const;

function fixtureClientAccount(row: (typeof fixtureAccounts)[number], profiles: BotProfile[], devices: Device[]): BotAppClientAccount {
  const profile = profiles.find((item) => item.id === row.profileId) ?? profiles[0];
  const device = devices.find((item) => item.id === profile?.deviceId);
  return {
    accountId: `acct_${row.username}`,
    profileId: profile?.id ?? row.profileId,
    clientId: "client_entry_2a_test",
    clientName: row.clientName,
    username: row.username,
    displayName: row.username,
    platform: "Instagram",
    createdAtLabel: row.createdAt,
    accountStatus: "active",
    adminStatus: "active",
    customerStatus: "active",
    subscriptionStatus: "active",
    lifecycleStatus: profile.status === "archived" ? "archived" : "active",
    loginStatus: "ready",
    credentialStatus: "active",
    credentialsConfigured: true,
    reauthRequired: false,
    twoFactorStatus: "unknown",
    readiness: "ready",
    eligibility: "can_start",
    eligibilityReason: "ready",
    reasonLabel: "Ready to start",
    packageLabel: profile?.package ?? "Growth",
    entitlementSummary: "active",
    entitlements: profile?.entitlements ?? ["follow"],
    assignment: {
      deviceId: profile?.deviceId ?? "phone_01",
      deviceName: profile?.deviceName ?? "PHONE 1",
      deviceStatus: device?.status ?? "connected",
      appInstanceLabel: `${profile?.deviceName ?? "PHONE 1"} · ${profile?.runtimeProfile ?? "full_cycle"}`,
      packageName: "com.instagram.android",
      assignmentStatus: profile?.assignmentState ?? "assigned",
      slotKind: profile?.slotKind ?? "full_cycle_6h",
      activeWindow: profile?.activeWindow ?? "09:00-12:00",
    },
    lastActivityAt: null,
    targetsCount: 0,
    actionsNeeded: [],
    safeEmailDisplay: "unknown",
    sourceLabel: "local projection",
    profileImageUrl: null,
    instagramVerificationStatus: "verified",
    passwordStatus: "configured",
    twoFactorDisplay: "unknown",
  };
}

function buildSummary(items: BotAppClientAccount[]): BotAppClientAccountsSummary {
  return {
    total: items.length,
    active: items.filter((item) => item.accountStatus === "active").length,
    pending: items.filter((item) => item.accountStatus === "pending").length,
    onboarding: items.filter((item) => item.accountStatus === "onboarding").length,
    paused: items.filter((item) => item.accountStatus === "paused").length,
    cancelled: items.filter((item) => item.accountStatus === "cancelled").length,
    needsAssistance: items.filter((item) => item.actionsNeeded.length > 0).length,
    reauthRequired: items.filter((item) => item.reauthRequired).length,
  };
}

export function buildClientAccountsOverview(profiles: BotProfile[], devices: Device[]): BotAppClientAccountsOverview {
  const items = fixtureAccounts.map((row) => fixtureClientAccount(row, profiles, devices));
  return {
    items,
    summary: buildSummary(items),
    sourceStatus: {
      manageOverview: "pending",
      credentialsActions: "pending",
      statusMutations: "pending",
      botAppRelay: "pending",
    },
    relayPayload: {
      action: "client_accounts_overview",
      source: "BotApp",
      requested_by: null,
      include: ["manage_overview", "credentials_actions", "readiness_projection", "assignments", "targets_summary"],
      metadata_safe: {
        expected_effect: "read_only_client_accounts_overview",
      },
    },
  };
}
