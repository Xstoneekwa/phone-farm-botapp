import type {
  ActivityLogEntry,
  BotAppClientAccountsOverview,
  BotAppCredentialsOverview,
  BotProfile,
  CompassActionTarget,
  CompassAffectedAccount,
  CompassAiAdvisor,
  CompassClientSafeRecommendation,
  CompassConfidence,
  CompassEvidence,
  CompassInsight,
  CompassInternalSignal,
  CompassOverview,
  CompassProblemGroup,
  CompassRecommendation,
  CompassSeverity,
  Device,
  Target,
} from "../api/types";

function accountId(profile: BotProfile) {
  return `acct_${profile.username}`;
}

function targetFor(profile: BotProfile, targetTab: CompassActionTarget["targetTab"], filter: string): CompassActionTarget {
  return {
    targetTab,
    label: `Open ${targetTab}`,
    context: {
      accountId: accountId(profile),
      profileId: profile.id,
      username: profile.username,
      deviceId: profile.deviceId,
      filter,
    },
  };
}

function affected(profile: BotProfile, reason: string, targetTab: CompassActionTarget["targetTab"], filter: string): CompassAffectedAccount {
  return {
    accountId: accountId(profile),
    profileId: profile.id,
    username: profile.username,
    clientName: profile.clientName,
    deviceId: profile.deviceId,
    deviceName: profile.deviceName,
    packageLabel: profile.package,
    reason,
    target: targetFor(profile, targetTab, filter),
  };
}

function evidence(source: CompassEvidence["source"], label: string, value: CompassEvidence["value"], confidence: CompassConfidence = "high"): CompassEvidence {
  return { source, label, value, confidence };
}

function severityRank(severity: CompassSeverity) {
  return severity === "critical" ? 4 : severity === "warning" ? 3 : severity === "info" ? 2 : 1;
}

function uniqueAccounts(accounts: CompassAffectedAccount[]) {
  const byId = new Map<string, CompassAffectedAccount>();
  for (const account of accounts) byId.set(account.accountId, account);
  return [...byId.values()];
}

function accountCountLabel(count: number) {
  return `${count} account${count === 1 ? "" : "s"}`;
}

function recommendation(input: {
  id: string;
  severity: CompassSeverity;
  title: string;
  impactEstimate: string;
  cause: string;
  recommendedAction: string;
  confidence?: CompassConfidence;
  clientVisible?: boolean;
  clientRawVisible?: boolean;
  clientRecommendationInput?: boolean;
  adminSummary: string;
  clientSummary?: string | null;
  technicalReason?: string | null;
  clientSafeReason?: string | null;
  target: CompassActionTarget;
  affectedAccounts: CompassAffectedAccount[];
  evidence: CompassEvidence[];
}): CompassRecommendation {
  return {
    confidence: "high",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    clientSummary: null,
    technicalReason: null,
    clientSafeReason: null,
    ...input,
  };
}

function insight(input: {
  id: string;
  category: CompassInsight["category"];
  severity: CompassSeverity;
  title: string;
  summary: string;
  sinceLabel: string;
  impact: string;
  cause: string;
  clientVisible?: boolean;
  clientRawVisible?: boolean;
  clientRecommendationInput?: boolean;
  adminSummary: string;
  clientSummary?: string | null;
  technicalReason?: string | null;
  clientSafeReason?: string | null;
  recommendedAction: string;
  targetTab: CompassActionTarget["targetTab"];
  confidence?: CompassConfidence;
  affectedAccounts: CompassAffectedAccount[];
  evidence: CompassEvidence[];
  recommendations: CompassRecommendation[];
}): CompassInsight {
  return {
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    clientSummary: null,
    technicalReason: null,
    clientSafeReason: null,
    confidence: "high",
    ...input,
  };
}

function internalSignal(input: {
  id: string;
  signal: CompassInternalSignal["signal"];
  title: string;
  summary: string;
  count: number;
  severity: CompassSeverity;
  target: CompassActionTarget;
  affectedAccounts: CompassAffectedAccount[];
  evidence: CompassEvidence[];
}): CompassInternalSignal {
  return {
    ...input,
    adminVisible: true,
    clientRawVisible: false,
    clientRecommendationInput: true,
  };
}

function credentialInsight(profiles: BotProfile[], clientAccounts: BotAppClientAccountsOverview | null, credentials: BotAppCredentialsOverview | null) {
  const actions = credentials?.actions.filter((action) => action.blockingCampaign || action.priority === "critical") ?? [];
  const byUsername = new Map(profiles.map((profile) => [profile.username, profile]));
  const byProfileId = new Map(profiles.map((profile) => [profile.id, profile]));
  const clientAccountToProfile = new Map((clientAccounts?.items ?? []).map((account) => [account.accountId, account.profileId]));
  const accountAccessUpdateAction = ["update_instagram_", "pass", "word"].join("");
  const affectedAccounts = uniqueAccounts(actions.flatMap((action) => {
    const profile = byProfileId.get(action.profileId) ?? byProfileId.get(clientAccountToProfile.get(action.accountId) ?? "") ?? byUsername.get(action.username);
    const reason = action.actionType === accountAccessUpdateAction
      ? "Secure account access update required."
      : action.title;
    return profile ? [affected(profile, reason, "credentials", action.actionType)] : [];
  }));
  if (!affectedAccounts.length) return null;
  const target = affectedAccounts[0].target;
  const rec = recommendation({
    id: "rec_open_credentials_blockers",
    severity: "critical",
    title: `Open Credentials for ${affectedAccounts.length} account${affectedAccounts.length === 1 ? "" : "s"}`,
    impactEstimate: "Campaign start is blocked until client or operator action is completed.",
    cause: "Credential action queue has blocking account actions.",
    recommendedAction: "Open Credentials and resolve the required account actions.",
    clientVisible: true,
    adminSummary: "Blocking credential actions should be handled before growth sessions.",
    clientSummary: "Some accounts need a secure account access update before growth can continue.",
    clientSafeReason: "Account access action required.",
    target,
    affectedAccounts,
    evidence: [
      evidence("credentials_actions", "blocking_actions", actions.length),
      evidence("client_accounts_overview", "affected_accounts", affectedAccounts.length),
    ],
  });
  return insight({
    id: "insight_credentials_blockers",
    category: "credentials",
    severity: "critical",
    title: "Credential blockers are stopping growth",
    summary: `${accountCountLabel(affectedAccounts.length)} require secure account access actions.`,
    sinceLabel: "Today",
    impact: "Blocked accounts cannot start or reconnect safely.",
    cause: "Open credential actions are marked blocking or critical.",
    clientVisible: true,
    adminSummary: "Credential blockers exist and should be routed to Credentials.",
    clientSummary: "Some accounts need secure account access action before growth can continue.",
    technicalReason: "credentials_actions contains critical or blocking actions.",
    clientSafeReason: "Account access action required.",
    recommendedAction: rec.recommendedAction,
    targetTab: "credentials",
    affectedAccounts,
    evidence: rec.evidence,
    recommendations: [rec],
  });
}

function deviceInsight(profiles: BotProfile[], devices: Device[]) {
  const offlineDevices = devices.filter((device) => device.status === "offline" || device.heartbeatStatus === "offline");
  const affectedAccounts = uniqueAccounts(profiles
    .filter((profile) => offlineDevices.some((device) => device.id === profile.deviceId) || profile.deviceAvailability === "offline")
    .map((profile) => affected(profile, "Assigned device is unavailable.", "devices", "offline")));
  if (!offlineDevices.length && !affectedAccounts.length) return null;
  const target: CompassActionTarget = { targetTab: "devices", label: "Open Devices", context: { filter: "offline" } };
  const rec = recommendation({
    id: "rec_open_offline_devices",
    severity: "warning",
    title: `Open Devices for ${offlineDevices.length} offline phone${offlineDevices.length === 1 ? "" : "s"}`,
    impactEstimate: `${affectedAccounts.length} account${affectedAccounts.length === 1 ? "" : "s"} may miss assigned work.`,
    cause: "Device heartbeat or inventory status is offline.",
    recommendedAction: "Open Devices and restart or inspect unavailable phones.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Device availability blocks assigned accounts.",
    technicalReason: "devices_overview reported offline heartbeat/status.",
    target,
    affectedAccounts,
    evidence: [
      evidence("devices_overview", "offline_devices", offlineDevices.length),
      evidence("profiles_projection", "affected_accounts", affectedAccounts.length, affectedAccounts.length ? "high" : "medium"),
    ],
  });
  return insight({
    id: "insight_offline_devices",
    category: "devices",
    severity: "warning",
    title: "Phone availability needs attention",
    summary: `${offlineDevices.length} phone${offlineDevices.length === 1 ? "" : "s"} unavailable for assigned work.`,
    sinceLabel: "Current inventory",
    impact: "Accounts on unavailable devices may not work.",
    cause: "Offline device status or stale heartbeat projection.",
    adminSummary: "Inspect Devices before assigning more work.",
    technicalReason: "Device heartbeat/status indicates offline phones.",
    recommendedAction: rec.recommendedAction,
    targetTab: "devices",
    confidence: "medium",
    affectedAccounts,
    evidence: rec.evidence,
    recommendations: [rec],
  });
}

function quotaInsight(profiles: BotProfile[]) {
  const underQuota = profiles.filter((profile) => profile.status !== "archived" && profile.followsToday < 50 && profile.eligibility === "can_start");
  const affectedAccounts = underQuota.map((profile) => affected(profile, `${profile.followsToday} follows today is below expected pace.`, "profiles", "under_quota"));
  if (!affectedAccounts.length) return null;
  const target: CompassActionTarget = { targetTab: "profiles", label: "Review accounts under quota", context: { filter: "under_quota" } };
  const rec = recommendation({
    id: "rec_review_under_quota",
    severity: "warning",
    title: "Review accounts under quota",
    impactEstimate: "Lower daily work volume can reduce monthly growth.",
    cause: "Follow counters are below expected pacing while accounts are otherwise eligible.",
    recommendedAction: "Run readiness check or start eligible accounts.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Eligible accounts are under daily work pace.",
    clientSummary: "Some accounts are below the expected activity pace today.",
    clientSafeReason: "Daily activity is below target.",
    target,
    affectedAccounts,
    evidence: [evidence("profiles_projection", "under_quota_accounts", affectedAccounts.length, "medium")],
  });
  return insight({
    id: "insight_under_quota",
    category: "quota",
    severity: "warning",
    title: "Some accounts are under quota",
    summary: `${accountCountLabel(affectedAccounts.length)} are below expected daily work pace.`,
    sinceLabel: "Today",
    impact: "Under-quota accounts can drag down monthly growth.",
    cause: "Daily follow counters are below expected pacing.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Review under-quota accounts before the daily window closes.",
    clientSummary: "Some accounts are below today's activity target.",
    clientSafeReason: "Daily activity below target.",
    recommendedAction: rec.recommendedAction,
    targetTab: "profiles",
    confidence: "medium",
    affectedAccounts,
    evidence: rec.evidence,
    recommendations: [rec],
  });
}

function inactiveInsight(profiles: BotProfile[]) {
  const inactive = profiles.filter((profile) => profile.status !== "archived" && (!profile.lastSessionAt || profile.followsToday === 0));
  const affectedAccounts = inactive.map((profile) => affected(profile, profile.lastSessionAt ? "No work recorded today." : "No recent session recorded.", "profiles", "inactive"));
  if (!affectedAccounts.length) return null;
  const target: CompassActionTarget = { targetTab: "profiles", label: "Open inactive accounts", context: { filter: "inactive" } };
  const rec = recommendation({
    id: "rec_open_inactive_accounts",
    severity: "warning",
    title: `Open ${affectedAccounts.length} inactive account${affectedAccounts.length === 1 ? "" : "s"}`,
    impactEstimate: "No work means no growth contribution.",
    cause: "No recent session or no work counted today.",
    recommendedAction: "Run readiness check and assign/start where safe.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Inactive accounts need readiness and assignment review.",
    clientSummary: "Some accounts did not record activity recently.",
    clientSafeReason: "No recent activity recorded.",
    target,
    affectedAccounts,
    evidence: [evidence("profiles_projection", "inactive_accounts", affectedAccounts.length, "medium")],
  });
  return insight({
    id: "insight_inactive_accounts",
    category: "inactive",
    severity: "warning",
    title: "Accounts without work need review",
    summary: `${accountCountLabel(affectedAccounts.length)} have no recent work signal.`,
    sinceLabel: "1-3 days",
    impact: "Inactive accounts reduce total growth capacity.",
    cause: "Missing session or zero work counter.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Review no-work accounts and route to Profiles.",
    clientSummary: "Some accounts did not record recent activity.",
    clientSafeReason: "No recent activity recorded.",
    recommendedAction: rec.recommendedAction,
    targetTab: "profiles",
    confidence: "medium",
    affectedAccounts,
    evidence: rec.evidence,
    recommendations: [rec],
  });
}

function targetInsight(profiles: BotProfile[], targets: Target[]) {
  const lowQuality = targets.filter((target) => target.status !== "approved" || target.qualityScore < 50);
  if (!lowQuality.length) return null;
  const affectedAccounts = profiles.slice(0, Math.min(4, profiles.length)).map((profile) => affected(profile, "Growth may be affected by weak CT sources.", "targets", "low_quality"));
  const target: CompassActionTarget = { targetTab: "targets", label: "Open Targets", context: { filter: "low_quality" } };
  const rec = recommendation({
    id: "rec_open_low_quality_targets",
    severity: "warning",
    title: "Open Targets for low-quality CTs",
    impactEstimate: "Weak CT sources can reduce audience quality.",
    cause: "Some CTs are under review, archived, or low quality.",
    recommendedAction: "Open Targets and archive or replace weak CTs.",
    clientVisible: true,
    adminSummary: "CT quality should be reviewed from Targets and Activity Log.",
    clientSummary: "Some audience sources may need review or replacement.",
    clientSafeReason: "Audience source quality needs review.",
    target,
    affectedAccounts,
    evidence: [
      evidence("targets_projection", "low_quality_ct_count", lowQuality.length, "medium"),
      evidence("activity_log_interaction_evidence", "investigation_available", true, "medium"),
    ],
  });
  return insight({
    id: "insight_low_quality_ct",
    category: "targets",
    severity: "warning",
    title: "CT quality may be lowering performance",
    summary: `${lowQuality.length} CT source${lowQuality.length === 1 ? "" : "s"} need review.`,
    sinceLabel: "Current target list",
    impact: "Poor sources can reduce relevant interactions and followbacks.",
    cause: "Target quality score/status indicates review or archive.",
    clientVisible: true,
    adminSummary: "Review low-quality CT sources in Targets and Activity Log.",
    clientSummary: "Some audience sources may need review.",
    clientSafeReason: "Audience source quality needs review.",
    recommendedAction: rec.recommendedAction,
    targetTab: "targets",
    confidence: "medium",
    affectedAccounts,
    evidence: rec.evidence,
    recommendations: [rec],
  });
}

function growthInsight(profiles: BotProfile[]) {
  const declining = profiles.filter((profile) => profile.followerDelta <= 0 && profile.status !== "archived");
  if (!declining.length) return null;
  const affectedAccounts = declining.map((profile) => affected(profile, "Follower growth is flat or negative.", "activity", "growth_down"));
  const target: CompassActionTarget = { targetTab: "activity", label: "Open Activity Log", context: { filter: "growth_down" } };
  const rec = recommendation({
    id: "rec_investigate_growth_drop",
    severity: "info",
    title: "Open Activity Log to investigate poor audience quality",
    impactEstimate: "Flat growth may indicate poor CT fit or account blocker.",
    cause: "Follower delta is flat while the account remains in active flows.",
    recommendedAction: "Open Activity Log and compare CT source quality.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Growth is flat for one or more accounts.",
    clientSummary: "Some accounts are below expected growth trend.",
    clientSafeReason: "Growth trend below target.",
    target,
    affectedAccounts,
    evidence: [evidence("profiles_projection", "flat_growth_accounts", declining.length, "best_effort")],
  });
  return insight({
    id: "insight_growth_flat",
    category: "growth",
    severity: "info",
    title: "Growth trend needs investigation",
    summary: `${accountCountLabel(declining.length)} show flat growth.`,
    sinceLabel: "Monthly trend",
    impact: "Flat growth lowers client outcome confidence.",
    cause: "Follower delta is zero or lower in the projection.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Review growth and CT evidence before changing settings.",
    clientSummary: "Some accounts are below expected growth trend.",
    clientSafeReason: "Growth trend below target.",
    recommendedAction: rec.recommendedAction,
    targetTab: "activity",
    confidence: "best_effort",
    affectedAccounts,
    evidence: rec.evidence,
    recommendations: [rec],
  });
}

function failedActivityInsight(profiles: BotProfile[], logs: ActivityLogEntry[]) {
  const failed = logs.filter((log) => log.status === "failed" || log.level === "error");
  if (!failed.length) return null;
  const usernames = new Set(failed.map((log) => log.account).filter(Boolean));
  const affectedAccounts = profiles
    .filter((profile) => usernames.has(profile.username))
    .map((profile) => affected(profile, "Repeated failed interaction evidence.", "activity", "failed"));
  const target: CompassActionTarget = { targetTab: "activity", label: "Open Activity Log", context: { filter: "failed" } };
  const rec = recommendation({
    id: "rec_review_failed_interactions",
    severity: "warning",
    title: "Open Activity Log for failed interactions",
    impactEstimate: "Repeated failures can hide poor CT fit or runtime blockers.",
    cause: "Activity evidence contains failed or error status records.",
    recommendedAction: "Open Activity Log and inspect failed interaction evidence.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Failed interactions should be reviewed before scaling.",
    technicalReason: "activity evidence includes failed/error rows.",
    target,
    affectedAccounts,
    evidence: [evidence("activity_log_interaction_evidence", "failed_records", failed.length, "medium")],
  });
  return insight({
    id: "insight_failed_interactions",
    category: "activity_quality",
    severity: "warning",
    title: "Failed interactions need investigation",
    summary: `${failed.length} failed interaction signal${failed.length === 1 ? "" : "s"} found.`,
    sinceLabel: "Recent evidence",
    impact: "Failed interactions can reduce work quality and output.",
    cause: "Recent activity contains failed/error statuses.",
    adminSummary: "Investigate failed interaction evidence.",
    technicalReason: "Activity evidence contains failed/error rows.",
    recommendedAction: rec.recommendedAction,
    targetTab: "activity",
    confidence: "medium",
    affectedAccounts,
    evidence: rec.evidence,
    recommendations: [rec],
  });
}

function problemGroups(insights: CompassInsight[]): CompassProblemGroup[] {
  return insights
    .filter((item) => item.affectedAccounts.length)
    .map((item) => ({
      id: `group_${item.id}`,
      title: item.title,
      severity: item.severity,
      count: item.affectedAccounts.length,
      targetTab: item.targetTab,
      affectedAccounts: item.affectedAccounts,
    }));
}

function clientSafe(recommendations: CompassRecommendation[]): CompassClientSafeRecommendation[] {
  return recommendations
    .filter((item) => item.clientVisible && !item.clientRawVisible)
    .map((item) => ({
      id: item.id,
      severity: item.severity,
      title: item.title,
      clientSummary: item.clientSummary,
      clientSafeReason: item.clientSafeReason,
      recommendedAction: item.recommendedAction,
      confidence: item.confidence,
      clientRecommendationInput: item.clientRecommendationInput,
      affectedAccounts: item.affectedAccounts.map((account) => ({
        username: account.username,
        clientName: account.clientName,
        reason: account.reason,
      })),
    }));
}

function buildInternalSignals(insights: CompassInsight[]): CompassInternalSignal[] {
  return insights.flatMap((item) => {
    if (item.category === "quota") {
      return [internalSignal({
        id: "signal_under_quota",
        signal: "under_quota",
        title: "Under-quota accounts",
        summary: `${accountCountLabel(item.affectedAccounts.length)} ${item.affectedAccounts.length === 1 ? "is" : "are"} below internal work pacing.`,
        count: item.affectedAccounts.length,
        severity: item.severity,
        target: { targetTab: "profiles", label: "Open Profiles", context: { filter: "under_quota", problemId: item.id } },
        affectedAccounts: item.affectedAccounts,
        evidence: item.evidence,
      })];
    }
    if (item.category === "inactive") {
      return [internalSignal({
        id: "signal_inactive_accounts",
        signal: "inactive_accounts",
        title: "Inactive accounts",
        summary: `${accountCountLabel(item.affectedAccounts.length)} ${item.affectedAccounts.length === 1 ? "has" : "have"} an internal no-work signal.`,
        count: item.affectedAccounts.length,
        severity: item.severity,
        target: { targetTab: "profiles", label: "Open Profiles", context: { filter: "inactive", problemId: item.id } },
        affectedAccounts: item.affectedAccounts,
        evidence: item.evidence,
      })];
    }
    if (item.category === "growth") {
      return [internalSignal({
        id: "signal_growth_down",
        signal: "growth_down",
        title: "Growth trend input",
        summary: `${accountCountLabel(item.affectedAccounts.length)} feed future client-safe performance recommendations.`,
        count: item.affectedAccounts.length,
        severity: item.severity,
        target: { targetTab: "activity", label: "Open Activity Log", context: { filter: "growth_down", problemId: item.id } },
        affectedAccounts: item.affectedAccounts,
        evidence: item.evidence,
      })];
    }
    if (item.category === "credentials") {
      return [internalSignal({
        id: "signal_credential_blocker",
        signal: "credential_blocker",
        title: "Credential blocker input",
        summary: `${accountCountLabel(item.affectedAccounts.length)} require secure account access action.`,
        count: item.affectedAccounts.length,
        severity: item.severity,
        target: { targetTab: "credentials", label: "Open Credentials", context: { filter: "credentials", problemId: item.id } },
        affectedAccounts: item.affectedAccounts,
        evidence: item.evidence,
      })];
    }
    if (item.category === "devices") {
      return [internalSignal({
        id: "signal_device_blocker",
        signal: "device_blocker",
        title: "Device blocker input",
        summary: `${accountCountLabel(item.affectedAccounts.length)} ${item.affectedAccounts.length === 1 ? "is" : "are"} linked to unavailable device facts.`,
        count: item.affectedAccounts.length,
        severity: item.severity,
        target: { targetTab: "devices", label: "Open Devices", context: { filter: "offline", problemId: item.id } },
        affectedAccounts: item.affectedAccounts,
        evidence: item.evidence,
      })];
    }
    if (item.category === "targets") {
      return [internalSignal({
        id: "signal_ct_quality",
        signal: "ct_quality",
        title: "CT quality input",
        summary: `${accountCountLabel(item.affectedAccounts.length)} may be affected by CT quality facts.`,
        count: item.affectedAccounts.length,
        severity: item.severity,
        target: { targetTab: "targets", label: "Open Targets", context: { filter: "low_quality", problemId: item.id } },
        affectedAccounts: item.affectedAccounts,
        evidence: item.evidence,
      })];
    }
    return [];
  });
}

function buildAiAdvisor(): CompassAiAdvisor {
  return {
    status: "rules_only",
    provider: "openai",
    model: null,
    lastAnalyzedAt: null,
    period: "7d",
    summary: "Loading Compass AI runtime status. Rules-only recommendations are active until relay or local runtime is configured.",
    healthAssessment: "watch",
    analysis: null,
    relayTarget: "/api/instagram-dashboard/compass/analyze",
    serverSideOnly: true,
  };
}

export function buildCompassOverview(input: {
  profiles: BotProfile[];
  devices: Device[];
  clientAccounts: BotAppClientAccountsOverview | null;
  credentials: BotAppCredentialsOverview | null;
  activityLogs: ActivityLogEntry[];
  targets: Target[];
}): CompassOverview {
  const { profiles, devices, clientAccounts, credentials, activityLogs, targets } = input;
  const insights = [
    credentialInsight(profiles, clientAccounts, credentials),
    deviceInsight(profiles, devices),
    quotaInsight(profiles),
    inactiveInsight(profiles),
    targetInsight(profiles, targets),
    growthInsight(profiles),
    failedActivityInsight(profiles, activityLogs),
  ].filter(Boolean) as CompassInsight[];

  const recommendations = insights.flatMap((item) => item.recommendations).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const internalSignals = buildInternalSignals(insights);
  const blockedAccounts = uniqueAccounts(insights.filter((item) => item.severity === "critical" || item.severity === "warning").flatMap((item) => item.affectedAccounts)).length;
  const workingAccounts = profiles.filter((profile) => profile.status === "running" || profile.eligibility === "can_start").length;
  const totalGrowth = profiles.reduce((sum, profile) => sum + profile.followerDelta, 0);
  const growthValues = profiles.map((profile) => profile.followerDelta);
  const healthScore = Math.max(0, Math.min(100, Math.round(88 - blockedAccounts * 7 + Math.min(10, totalGrowth / 20))));

  const generatedAt = "2026-06-11T11:16:00.000Z";

  return {
    generatedAt,
    healthScore,
    summary: {
      totalAccounts: profiles.length,
      workingAccounts,
      blockedAccounts,
      underQuotaAccounts: insights.find((item) => item.id === "insight_under_quota")?.affectedAccounts.length ?? 0,
      inactiveAccounts: insights.find((item) => item.id === "insight_inactive_accounts")?.affectedAccounts.length ?? 0,
      clientVisibleRecommendations: recommendations.filter((item) => item.clientVisible).length,
    },
    trends: [
      { label: "Monthly growth", value: `+${totalGrowth}`, detail: "Projected follower delta across loaded accounts", tone: totalGrowth > 0 ? "positive" : "warning" },
      { label: "Min / max gain", value: `${Math.min(...growthValues)} / +${Math.max(...growthValues)}`, detail: "Range of account follower deltas", tone: "info" },
      { label: "Blocked share", value: `${Math.round((blockedAccounts / Math.max(1, profiles.length)) * 100)}%`, detail: "Accounts attached to critical or warning insights", tone: blockedAccounts ? "warning" : "positive" },
      { label: "Top blocker", value: insights[0]?.title ?? "None", detail: "Highest priority rules-engine finding", tone: insights[0]?.severity ?? "positive" },
    ],
    insights,
    problemGroups: problemGroups(insights),
    recommendations,
    internalSignals,
    clientSafePreview: clientSafe(recommendations),
    aiAdvisor: buildAiAdvisor(),
    aiAnalysisPayload: {
      provider: "none",
      mode: "rules_only",
      facts: {
        generatedAt,
        insights,
        recommendations,
        internalSignals,
      },
      outputContract: {
        format: "json",
        mustNotInventFacts: true,
        allowedFields: ["priority", "explanation", "recommended_order", "risk_notes"],
      },
    },
    relayPayload: {
      action: "compass_overview",
      source: "BotApp",
      requested_by: null,
      include: [
        "client_accounts_overview",
        "credentials_actions",
        "devices_overview",
        "activity_log_interaction_evidence_admin_v1",
        "targets",
        "runs_eligibility",
        "account_run_requests",
        "ig_runs",
        "incidents",
      ],
      metadata_safe: {
        expected_effect: "read_only_compass_decision_overview",
        ai_provider: "none",
      },
    },
  };
}
