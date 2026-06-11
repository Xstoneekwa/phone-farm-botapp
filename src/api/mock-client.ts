import {
  buildDeviceProfileGroups,
  getMockProfileFilters,
  getMockProfileLogs,
  getMockProfileSettings,
  getMockProfileStats,
  getMockProfileTargets,
} from "../data/profile-mock-data";
import { buildClientAccountsOverview } from "../data/client-accounts-data";
import { buildCompassOverview } from "../data/compass-data";
import { buildAutoRestartOverview } from "../data/auto-restart-data";
import { buildCredentialsActionsOverview } from "../data/credentials-actions-data";
import { mockActivityLogs, mockApiKeys, mockDevices, mockNotifications, mockProfiles, mockSettings, mockTargets, mockWebhooks } from "../data/mock-data";
import type { ActionPreview, ApiResult, BotAppClient, CompassAiAdvisor, CompassAiRecommendedAction, CompassAiSourceFact, CompassAiTargetTab, CompassActionTarget, CompassOverview } from "./types";

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data, request_id: `mock_${Date.now().toString(36)}` };
}

function delay<T>(value: T, ms = 80): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}

function fixturesAllowed() {
  return window.botappDesktop?.mode !== "packaged";
}

export const mockClient: BotAppClient = {
  listProfiles: () => delay(ok(fixturesAllowed() ? mockProfiles : [])),
  getProfileDetail: (profileId) => delay(ok(fixturesAllowed() ? (mockProfiles.find((profile) => profile.id === profileId) ?? mockProfiles[0]) : mockProfiles[0])),
  listDeviceProfileGroups: () => delay(ok(fixturesAllowed() ? buildDeviceProfileGroups(mockProfiles, mockDevices) : [])),
  getProfileStats: (profileId) => {
    if (!fixturesAllowed()) return delay(ok([]));
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileStats(profile)));
  },
  getProfileLogs: (profileId) => {
    if (!fixturesAllowed()) return delay(ok([]));
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileLogs(profile)));
  },
  getProfileTargets: (profileId) => {
    if (!fixturesAllowed()) return delay(ok([]));
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileTargets(profile)));
  },
  getProfileSettings: (profileId) => {
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileSettings(profile)));
  },
  getProfileFilters: (profileId) => {
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileFilters(profile)));
  },
  listClientAccounts: () => delay(ok(buildClientAccountsOverview(fixturesAllowed() ? mockProfiles : [], fixturesAllowed() ? mockDevices : []))),
  listCredentialsActions: () => delay(ok(buildCredentialsActionsOverview(buildClientAccountsOverview(fixturesAllowed() ? mockProfiles : [], fixturesAllowed() ? mockDevices : [])))),
  listCompass: () => {
    const clientAccounts = buildClientAccountsOverview(mockProfiles, mockDevices);
    const credentials = buildCredentialsActionsOverview(clientAccounts);
    return delay(ok(buildCompassOverview({
      profiles: mockProfiles,
      devices: mockDevices,
      clientAccounts,
      credentials,
      activityLogs: mockActivityLogs,
      targets: mockTargets,
    })));
  },
  analyzeCompass: (overview: CompassOverview, period) => {
    const targetFromAi = (targetTab: CompassAiTargetTab, label: string, filter: string, accountId?: string, username?: string): CompassActionTarget => {
      const route = targetTab === "activity_log"
        ? "activity"
        : targetTab === "client_accounts"
          ? "account"
          : targetTab;
      return { targetTab: route, label, context: { accountId, username, filter } };
    };
    const action = (label: string, targetTab: CompassAiTargetTab, filter: string): CompassAiRecommendedAction => ({
      label,
      target: targetFromAi(targetTab, label, filter),
      actionType: "open_tab",
    });
    const topCredential = overview.insights.find((item) => item.category === "credentials")?.affectedAccounts[0];
    const targetQuality = overview.insights.find((item) => item.category === "targets");
    const advisor: CompassAiAdvisor = {
      status: "relay_pending",
      provider: "openai",
      model: "server-side relay",
      lastAnalyzedAt: "2026-06-11T11:37:00.000Z",
      period,
      summary: "Relay contract preview: prioritize account access blockers first, then review CT quality before scaling activity. OpenAI must run server-side in the dashboard relay when configured.",
      healthAssessment: overview.summary.blockedAccounts > 4 ? "risk" : "watch",
      relayTarget: "/api/instagram-dashboard/compass/analyze",
      serverSideOnly: true,
      analysis: {
        analysisId: "local_contract_preview",
        period,
        overallSummary: "Prioritize proven blockers, then review CT quality inputs. Internal no-work and pacing facts are kept as admin-only signals.",
        healthAssessment: overview.summary.blockedAccounts > 4 ? "risk" : "watch",
        recommendations: [
          ...(topCredential ? [{
            id: "ai_rec_credentials_first",
            severity: "critical" as const,
            confidence: "high" as const,
            title: "Resolve account access blockers before running more sessions",
            summary: "Credential blockers are proven system facts and should be handled before new work is started.",
            recommendationType: "credential_blocker" as const,
            adminSummary: "Credential blockers are proven and should be handled before new work is started.",
            clientSummary: "A secure account access action is needed before campaign activity can continue.",
            clientVisible: true,
            clientRawVisible: false,
            clientRecommendationInput: true,
            technicalReason: "Credentials worklist contains blocking account actions.",
            clientSafeReason: "Account access action required.",
            affectedAccounts: overview.insights.find((item) => item.category === "credentials")?.affectedAccounts.map((account) => ({
              accountId: account.accountId,
              username: account.username,
              clientId: account.accountId.replace(/^acct_/, "client_"),
              reason: account.reason,
              target: targetFromAi("credentials", "Open Credentials", "credentials", account.accountId, account.username),
            })) ?? [],
            recommendedActions: [action("Open Credentials", "credentials", "credentials")],
            evidence: [{ source: "credentials_actions", summary: "Blocking account actions are present.", confidence: "high" as const }],
            sourceFacts: ["credential_blockers", "account_dashboard_actions"] as CompassAiSourceFact[],
            target: targetFromAi("credentials", "Open Credentials", "credentials"),
            recommendedAction: "Review credential actions before restarting campaigns.",
            whyThisMatters: "Blocked credentials prevent sessions from running correctly.",
            whatNotToAssume: "Do not assume the password is wrong unless the action says password_update_required.",
          }] : []),
          ...(targetQuality ? [{
            id: "ai_rec_ct_quality_review",
            severity: "warning" as const,
            confidence: "medium" as const,
            title: "Review CT quality before increasing volume",
            summary: "Targets projection includes CT quality facts that should be reviewed before scaling.",
            recommendationType: "ct_quality" as const,
            adminSummary: "CT quality signals should be reviewed with Activity Log evidence before scaling.",
            clientSummary: "We found opportunities to improve audience quality.",
            clientVisible: true,
            clientRawVisible: false,
            clientRecommendationInput: true,
            technicalReason: "Targets projection has low-quality or review CT inputs.",
            clientSafeReason: "Audience source quality can be improved.",
            affectedAccounts: targetQuality.affectedAccounts.map((account) => ({
              accountId: account.accountId,
              username: account.username,
              clientId: account.accountId.replace(/^acct_/, "client_"),
              reason: "Audience source quality review recommended.",
              target: targetFromAi("targets", "Open Targets", "low_quality", account.accountId, account.username),
            })),
            recommendedActions: [
              action("Open Targets", "targets", "low_quality"),
              action("Open Activity Log", "activity_log", "ct_quality"),
            ],
            evidence: [{ source: "targets_projection", summary: "Low-quality CT facts are present.", confidence: "medium" as const }],
            sourceFacts: ["ct_quality_alerts"] as CompassAiSourceFact[],
            target: targetFromAi("targets", "Open Targets", "low_quality"),
            recommendedAction: "Suggest archive CT review.",
            whyThisMatters: "Low-quality CT sources can reduce followable profile discovery.",
            whatNotToAssume: "Do not assume a CT should be archived without human review.",
          }] : []),
        ],
        filteredRecommendationsCount: 0,
        filteredReasons: [],
        internalSignals: overview.internalSignals.map((signal) => ({
          signal: signal.signal,
          adminVisible: true,
          clientRawVisible: false,
          clientRecommendationInput: true,
          count: signal.count,
          summary: signal.summary,
        })),
      },
    };
    return delay(ok(advisor));
  },
  listAutoRestart: () => delay(ok(fixturesAllowed() ? buildAutoRestartOverview() : buildAutoRestartOverview())),
  listDevices: () => delay(ok(fixturesAllowed() ? mockDevices : [])),
  listNotifications: () => delay(ok(fixturesAllowed() ? mockNotifications : [])),
  listActivityLogs: () => delay(ok(fixturesAllowed() ? mockActivityLogs : [])),
  listTargets: () => delay(ok(fixturesAllowed() ? mockTargets : [])),
  listApiKeys: () => delay(ok(fixturesAllowed() ? mockApiKeys : [])),
  listWebhooks: () => delay(ok(fixturesAllowed() ? mockWebhooks : [])),
  listSettings: () => delay(ok(mockSettings)),
  previewAction: (action, target) => delay(ok<ActionPreview>({
    action,
    target,
    dry_run: true,
    message: "Action prepared. No backend mutation executed yet.",
  })),
};
