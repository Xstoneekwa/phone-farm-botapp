import type {
  BotAppClientAccountsOverview,
  BotAppCredentialsAction,
  BotAppCredentialsActionType,
  BotAppCredentialsOverview,
} from "../api/types";

const actionFixtures: Array<{
  username: string;
  actionType: BotAppCredentialsActionType;
  title: string;
  description: string;
  priority: BotAppCredentialsAction["priority"];
  status: BotAppCredentialsAction["status"];
  audience: BotAppCredentialsAction["audience"];
  requiresClientAction: boolean;
  blockingCampaign: boolean;
  createdAtLabel: string;
  updatedAtLabel: string;
  ageLabel: string;
  nextAction: string;
}> = [
  {
    username: "liam_bel_epee",
    actionType: "update_instagram_password",
    title: "Update password / reauth",
    description: "Client password update is required before this account can reconnect safely.",
    priority: "critical",
    status: "pending",
    audience: "client",
    requiresClientAction: true,
    blockingCampaign: true,
    createdAtLabel: "Jun 11, 2026, 09:42 AM",
    updatedAtLabel: "Jun 11, 2026, 09:42 AM",
    ageLabel: "54m",
    nextAction: "Notify client and wait for credentials update",
  },
  {
    username: "j_automatise_pour_toi",
    actionType: "enter_email_verification_code",
    title: "Enter email verification code",
    description: "Instagram is waiting for an email verification code from the client.",
    priority: "critical",
    status: "pending_verification",
    audience: "client",
    requiresClientAction: true,
    blockingCampaign: true,
    createdAtLabel: "Jun 11, 2026, 09:58 AM",
    updatedAtLabel: "Jun 11, 2026, 10:02 AM",
    ageLabel: "34m",
    nextAction: "Enter code through the secure verification flow",
  },
  {
    username: "i_m_your_traker",
    actionType: "review_login_failure",
    title: "Review login failure",
    description: "Login status indicates a problem that needs operator review.",
    priority: "warning",
    status: "acknowledged",
    audience: "admin",
    requiresClientAction: false,
    blockingCampaign: false,
    createdAtLabel: "Jun 11, 2026, 08:20 AM",
    updatedAtLabel: "Jun 11, 2026, 09:15 AM",
    ageLabel: "2h",
    nextAction: "Review account detail and runtime signal",
  },
  {
    username: "test_account_ops",
    actionType: "review_credentials",
    title: "Review credentials",
    description: "Pending dashboard action count is greater than zero.",
    priority: "info",
    status: "pending",
    audience: "admin",
    requiresClientAction: false,
    blockingCampaign: false,
    createdAtLabel: "Jun 10, 2026, 05:48 PM",
    updatedAtLabel: "Jun 11, 2026, 08:10 AM",
    ageLabel: "16h",
    nextAction: "Check credential action history",
  },
];

function isPasswordAction(action: BotAppCredentialsAction) {
  return action.actionType === "update_instagram_password" || action.actionType === "submit_instagram_credentials";
}

function isVerificationAction(action: BotAppCredentialsAction) {
  return action.actionType === "enter_email_verification_code" || action.actionType === "complete_two_factor" || action.actionType === "resolve_checkpoint";
}

export function buildCredentialsActionsOverview(clientAccounts: BotAppClientAccountsOverview): BotAppCredentialsOverview {
  const accountsByUsername = new Map(clientAccounts.items.map((account) => [account.username, account]));
  const actions = actionFixtures.map((fixture): BotAppCredentialsAction => {
    const account = accountsByUsername.get(fixture.username) ?? clientAccounts.items[0];
    return {
      id: `cred_${fixture.username}_${fixture.actionType}`,
      accountId: account.accountId,
      clientId: account.clientId,
      profileId: account.profileId,
      username: account.username,
      clientName: account.clientName,
      actionType: fixture.actionType,
      title: fixture.title,
      description: fixture.description,
      status: fixture.status,
      priority: fixture.priority,
      audience: fixture.audience,
      requiresClientAction: fixture.requiresClientAction,
      blockingCampaign: fixture.blockingCampaign,
      credentialStatus: account.credentialStatus,
      loginStatus: account.loginStatus,
      provisioningStatus: account.readiness,
      sourceLabel: fixture.actionType === "update_instagram_password" ? "account_dashboard_actions" : "derived from shared backend overview",
      assignedPhone: account.assignment.deviceName,
      createdAtLabel: fixture.createdAtLabel,
      updatedAtLabel: fixture.updatedAtLabel,
      ageLabel: fixture.ageLabel,
      nextAction: fixture.nextAction,
    };
  });

  return {
    actions,
    summary: {
      openActions: actions.filter((action) => action.status !== "resolved" && action.status !== "dismissed").length,
      passwordUpdates: actions.filter(isPasswordAction).length,
      verificationCodes: actions.filter(isVerificationAction).length,
      needsReview: actions.filter((action) => action.audience === "admin" || action.priority === "warning").length,
      clientActionRequired: actions.filter((action) => action.requiresClientAction).length,
    },
    relayPayload: {
      action: "credentials_actions_overview",
      source: "BotApp",
      requested_by: null,
      include: ["account_dashboard_actions", "account_credentials", "client_instagram_accounts", "manage_overview", "radar_overview"],
      metadata_safe: {
        expected_effect: "read_only_credentials_actions_overview",
      },
    },
  };
}
