/// <reference types="vite/client" />

declare module "*.css";

type BotAppDeviceViewPlacement = {
  botAppBounds?: { x: number; y: number; width: number; height: number };
  workArea?: { x: number; y: number; width: number; height: number };
  botAppFullscreen: boolean;
  sameSpace: "unknown" | "same" | "different";
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
};

type BotAppDeviceViewState = {
  deviceSerial: string;
  deviceLabel: string;
  status: "open" | "failed";
  pid: number | null;
  windowTitle: string;
  startedAt: string;
  lastError: string | null;
  placement?: BotAppDeviceViewPlacement | null;
};

type BotAppLocalToolState = {
  found: boolean;
  path: string | null;
  basename: string | null;
  reason: string;
};

type BotAppLocalToolDiagnostics = {
  adb: BotAppLocalToolState;
  scrcpy: BotAppLocalToolState;
  checkedAt: string;
};

type BotAppDeviceViewResult = {
  ok: boolean;
  data: BotAppDeviceViewState[];
  error?: string;
  reason?: string;
  focusAttempted?: boolean;
  focused?: boolean;
  visibleFrontmost?: boolean;
  processAlive?: boolean;
  focusMethod?: string;
  windowTitle?: string;
  userMessage?: string;
  sameSpace?: "unknown" | "same" | "different";
  botAppFullscreen?: boolean;
  placement?: BotAppDeviceViewPlacement | null;
  tools?: BotAppLocalToolDiagnostics;
};

type BotAppRuntimeIntegrationStatus = import("./api/types").BotAppRuntimeIntegrationStatus;
type BotAppDispatcherHealth = import("./api/types").BotAppDispatcherHealth;
type BotAppDeviceHeartbeatHealth = import("./api/types").BotAppDeviceHeartbeatHealth;
type BotAppSchedulerRuntimeHealth = import("./api/types").BotAppSchedulerRuntimeHealth;
type BotAppRelayHealth = import("./api/types").BotAppRelayHealth;
type BotAppDiagnosticsProvenance = {
  botAppCommit: string;
  packageDate: string | null;
  bundlePath: string;
  appPath: string;
  runtimeRoot: string | null;
  runtimeCommit: string | null;
  runtimeStatus: string | null;
  checkedAt: string;
};
type BotAppDispatcherHealthAction = "status" | "pause" | "resume" | "restart" | "stop" | "logs" | "fix-duplicate";
type BotAppDeviceHeartbeatHealthAction = "status" | "pause" | "resume" | "restart" | "stop" | "logs" | "fix-duplicate";
type CompassAiRuntimeStatus = import("./api/types").CompassAiRuntimeStatus;
type TargetingAiRuntimeStatus = import("./api/types").TargetingAiRuntimeStatus;
type TargetingAiSaveResult = import("./api/types").TargetingAiSaveResult;
type TargetingAiTestResult = import("./api/types").TargetingAiTestResult;
type CompassAiRuntimeAnalyzeRequest = import("./api/types").CompassAiRuntimeAnalyzeRequest;
type CompassAiRuntimeAnalyzeResult = import("./api/types").CompassAiRuntimeAnalyzeResult;
type AutoRestartOverview = import("./api/types").AutoRestartOverview;
type AutoRestartControlAction = import("./api/types").AutoRestartControlAction;
type BotAppOverviewData = import("./app/App").BotAppOverviewData;
type BotAppBackendEndpoint = import("./api/types").BotAppBackendEndpoint;
type BotAppEndpointTestResult = import("./api/types").BotAppEndpointTestResult;
type BotAppConnectionProfile = import("./api/types").BotAppConnectionProfile;
type WebhookEvent = import("./api/types").WebhookEvent;
type WebhookSummary = import("./api/types").WebhookSummary;
type BotAppEmailTemplatesProjection = import("./api/types").BotAppEmailTemplatesProjection;
type BotAppEmailHistoryProjection = import("./api/types").BotAppEmailHistoryProjection;
type BotAppEmailHistoryDetail = import("./api/types").BotAppEmailHistoryDetail;
type BotAppEmailTestDeliveryStatus = import("./api/types").BotAppEmailTestDeliveryStatus;
type BotAppNeedsMoreTargetsLifecyclePreview = import("./api/types").BotAppNeedsMoreTargetsLifecyclePreview;
type BotAppAccountLifecyclePreview = import("./api/types").BotAppAccountLifecyclePreview;
type BotAppOutboxPreview = import("./api/types").BotAppOutboxPreview;
type BotAppEmailDeliverySettingsProjection = import("./api/types").BotAppEmailDeliverySettingsProjection;
type BotAppEmailDeliverySettingsAudit = import("./api/types").BotAppEmailDeliverySettingsAudit;

interface Window {
  botappDesktop?: {
    platform: string;
    mode: string;
    runtime?: {
      status: () => Promise<BotAppRuntimeIntegrationStatus>;
    };
    diagnostics?: {
      provenance: () => Promise<BotAppDiagnosticsProvenance>;
    };
  dispatcher?: {
    status: () => Promise<BotAppDispatcherHealth>;
    action: (action: BotAppDispatcherHealthAction) => Promise<BotAppDispatcherHealth>;
    ensure: () => Promise<BotAppDispatcherHealth>;
  };
  deviceHeartbeat?: {
    status: () => Promise<BotAppDeviceHeartbeatHealth>;
    action: (action: BotAppDeviceHeartbeatHealthAction) => Promise<BotAppDeviceHeartbeatHealth>;
    ensure: () => Promise<BotAppDeviceHeartbeatHealth>;
  };
  schedulerRuntime?: {
    status: () => Promise<BotAppSchedulerRuntimeHealth>;
    ensure: () => Promise<BotAppSchedulerRuntimeHealth>;
  };
  scheduler?: {
    status: () => Promise<{ ok: boolean; data?: import("./api/types").BotAppSchedulerStatus; error?: string }>;
    setEnabled: (input: { enabled: boolean }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
  };
    compass?: {
      status: () => Promise<CompassAiRuntimeStatus>;
      saveRelayConfig: (input: { relayUrl: string; relayCredential?: string }) => Promise<CompassAiRuntimeStatus>;
      removeRelayConfig: () => Promise<CompassAiRuntimeStatus>;
      analyze: (input: CompassAiRuntimeAnalyzeRequest) => Promise<CompassAiRuntimeAnalyzeResult>;
    };
    targetingAi?: {
      status: () => Promise<TargetingAiRuntimeStatus>;
      saveConfig: (input: Record<string, unknown>) => Promise<TargetingAiSaveResult>;
      resetConfig: () => Promise<TargetingAiSaveResult>;
      testConfig: (input?: { niche?: string; locationLabel?: string }) => Promise<TargetingAiTestResult>;
    };
    autoRestart?: {
      overview: () => Promise<AutoRestartOverview>;
      dryRun: () => Promise<{ ok: boolean; overview: AutoRestartOverview; error?: string; dryRun?: true }>;
      actionPreview: (input: { action: AutoRestartControlAction; requestId?: string; target?: Record<string, unknown> }) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
      loadSettings?: () => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
      saveSettings?: (patch: Record<string, unknown>) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
      execute?: (input: { action: AutoRestartControlAction; requestId?: string; target?: Record<string, unknown>; confirmed?: boolean }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string; overview?: AutoRestartOverview }>;
    };
    data?: {
      overview: () => Promise<{ ok: boolean; data: BotAppOverviewData; error?: string | null; profilesMeta?: { source: string; accountsCount: number; counts: Record<string, number> } | null }>;
      profilesLive: (input: { accountIds: string[] }) => Promise<{
        ok: boolean;
        data: { profiles: import("./views/profiles/profiles-live-merge").ProfilesLivePatch[]; generatedAt: string; source: string; queryCount: number };
        error?: string | null;
      }>;
    };
    relay?: {
      health: () => Promise<BotAppRelayHealth>;
      repair: () => Promise<{
        ok: boolean;
        message: string;
        profilesReloaded?: boolean;
        accountsCount?: number;
        relay?: BotAppRelayHealth | null;
      }>;
    };
    clientAccounts?: {
      applyStatus: (input: {
        accountId: string;
        action: "pause" | "cancel" | "mark_needs_assistance" | "reactivate";
        reason?: string;
        metadata?: Record<string, string>;
        dryRun?: boolean;
      }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null; dryRun?: boolean; code?: string }>;
      applyNeedsMoreTargets?: (input: {
        accountId: string;
        action: "mark" | "clear";
        reason?: string;
        metadata?: Record<string, string>;
        dryRun?: boolean;
      }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null; dryRun?: boolean; code?: string }>;
    };
    devices?: {
      list: (input?: { format?: "raw" | "normalized" }) => Promise<{ ok: boolean; data?: Record<string, unknown>[]; error?: string | null }>;
      deletePreflight?: (input: { deviceId: string } | string) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null; status?: number }>;
      delete?: (input: { deviceId: string; confirmationName: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null; status?: number }>;
      restartHeartbeatPublisher?: () => Promise<{
        ok: boolean;
        started?: boolean;
        stage?: string;
        message?: string;
        error?: string | null;
        published_count?: number;
        skipped_count?: number;
        data?: Record<string, unknown>[];
      }>;
      subscribeHeartbeatRecovery?: (callback: (result: Record<string, unknown>) => void) => (() => void) | undefined;
    };
    profiles?: {
      details: (accountId: string) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      protectionLists?: {
        get: (input: { accountId: string; listKind: "interaction_blacklist" | "unfollow_whitelist" }) => Promise<{ ok: boolean; data?: Record<string, unknown>; etag?: string | null; status?: number; error?: string | null }>;
        mutate: (input: { accountId: string; listKind: "interaction_blacklist" | "unfollow_whitelist"; add?: string[]; remove?: string[]; etag: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; etag?: string | null; status?: number; error?: string | null }>;
      };
      statsHistory?: (input: { accountId: string; days?: number }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      createDryRun: (input: Record<string, unknown>) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      create: (input: Record<string, unknown>) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null; partial?: Record<string, unknown> }>;
      scheduleSlots?: (input: { device_id: string; app_instance_id: string; runtime_mode: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      schedule?: {
        get: (accountId: string) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
        save: (input: Record<string, unknown>) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      };
      verifyUsername?: (input: { username: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      credentials?: {
        submit: (input: { accountId: string; username: string; password: string; dryRun?: boolean }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      };
      settings?: {
        save: (input: { mode: "follow" | "filters" | "dm" | "followback" | "sources"; patch: Record<string, unknown> }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      };
      actions?: {
        perform: (input: { accountId: string; action: "start" | "stop" | "archive" | "trash" | "restore"; reason?: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      };
      assignNow?: (input: { accountId: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      readinessNow?: (input: { accountId: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      autoLogin?: (input: { accountId: string; username: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      submitVerificationCode?: (input: { accountId: string; actionId: string; verificationCode: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      restoreLoginScreen?: (input: { accountId: string; username: string; assignment_id?: string | null; app_instance_id?: string | null }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      startRun?: (input: { accountId: string; username: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      stopRun?: (input: { accountId: string; reason?: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      runProgress?: (input: { accountId: string; requestId?: string | null }) => Promise<{ ok: boolean; data?: import("./api/types").ProfileRunProgressSnapshot; error?: string | null }>;
      addTarget: (input: { accountId: string; username: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      bulkAddTargets: (input: { accountId: string; usernames: string[] }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      deleteTargets: (input: { accountId: string; ids: string[] }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      resetTargets: (input: { accountId: string; ids: string[]; mode?: "reset_state_only" | "reset_and_requeue_verification" }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
    };
    endpoints?: {
      list: () => Promise<BotAppBackendEndpoint[]>;
      test: (input: { id: string }) => Promise<BotAppEndpointTestResult>;
      testAll: () => Promise<{ endpoints: BotAppBackendEndpoint[]; results: BotAppEndpointTestResult[] }>;
      exportProfile: () => Promise<BotAppConnectionProfile>;
    };
    integrations?: {
      list: () => Promise<{ webhooks: WebhookSummary[] }>;
      saveWebhook: (input: { label: string; url: string; secret?: string; events: WebhookEvent[] }) => Promise<{ webhooks: WebhookSummary[] }>;
      removeWebhook: (input: { id: string }) => Promise<{ webhooks: WebhookSummary[] }>;
    };
    email?: {
      listTemplates: () => Promise<{ ok: boolean; data?: BotAppEmailTemplatesProjection; error?: string | null }>;
      saveTemplate: (input: { category: string; subject: string; bodyText: string }) => Promise<{ ok: boolean; data?: { template?: BotAppEmailTemplatesProjection["templates"][number]; created_new_version?: boolean }; error?: string | null }>;
      previewTemplate: (input: { subject: string; bodyText: string }) => Promise<{ ok: boolean; data?: { preview?: { subject: string; bodyText: string; bodyHtml: string } }; error?: string | null }>;
      listHistory: (input?: Record<string, string | number | undefined>) => Promise<{ ok: boolean; data?: BotAppEmailHistoryProjection; error?: string | null }>;
      historyDetail: (intentId: string) => Promise<{ ok: boolean; data?: { detail?: BotAppEmailHistoryDetail }; error?: string | null }>;
      testDeliveryStatus: () => Promise<{ ok: boolean; data?: BotAppEmailTestDeliveryStatus; error?: string | null }>;
      sendTestDelivery: (input: { category: string }) => Promise<{ ok: boolean; data?: { action?: string; intentId?: string; providerMessageId?: string | null }; error?: string | null; reason?: string | null }>;
      needsMoreTargetsPreview: () => Promise<{ ok: boolean; data?: BotAppNeedsMoreTargetsLifecyclePreview; error?: string | null }>;
      accountLifecyclePreview: () => Promise<{ ok: boolean; data?: BotAppAccountLifecyclePreview; error?: string | null }>;
      outboxPreview: () => Promise<{ ok: boolean; data?: BotAppOutboxPreview; error?: string | null }>;
      deliverySettings: () => Promise<{ ok: boolean; data?: BotAppEmailDeliverySettingsProjection; error?: string | null }>;
      deliverySettingsAudit: () => Promise<{ ok: boolean; data?: BotAppEmailDeliverySettingsAudit; error?: string | null }>;
      refreshDeliverySenders: () => Promise<{ ok: boolean; data?: { projection?: BotAppEmailDeliverySettingsProjection; refreshedAt?: string; confirmedSenderCount?: number }; error?: string | null }>;
      saveDeliverySettings: (input: { supportEmail?: string; activeFromEmail?: string; configVersion?: number; confirmed?: boolean }) => Promise<{ ok: boolean; data?: { projection?: BotAppEmailDeliverySettingsProjection }; error?: string | null }>;
    };
    incidents?: {
      list: (input?: { status?: string; filter?: string; search?: string; cursor?: string | null; limit?: number }) => Promise<{
        ok: boolean;
        openCount?: number;
        incidents?: Array<Record<string, unknown>>;
        message?: string;
        errorKind?: "permission" | "invalid_contract" | "backend_unavailable";
        authorizedHostMachine?: string | null;
        scopeMode?: string | null;
        globalCounters?: Record<string, number>;
        page?: { pageSize?: number; filteredTotal?: number; hasMore?: boolean; nextCursor?: string | null };
      }>;
      detail: (incidentId: string, requestId?: string) => Promise<{ ok: boolean; status?: number; data?: Record<string, unknown>; message?: string; errorKind?: string }>;
      cancelDetail: (requestId: string) => Promise<{ ok: boolean; cancelled?: boolean }>;
      action: (input: Record<string, unknown>) => Promise<{ ok: boolean; status?: number; data?: Record<string, unknown>; error?: string }>;
      markReviewed: (input: { action_id: string; account_id: string; note?: string | null }) => Promise<{ ok: boolean; status?: number; data?: Record<string, unknown>; error?: string; errorKind?: string; reason?: string; message?: string }>;
      notificationSettings: () => Promise<{ ok: boolean; data?: Record<string, unknown>; message?: string }>;
      patchNotificationSettings: (input: Record<string, unknown>) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
      testNotification: (input: { channel: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
      notificationOutbox: (input?: { channel?: string; limit?: number; offset?: number }) => Promise<{ ok: boolean; data?: Record<string, unknown>; message?: string }>;
    };
    deviceViews?: {
      list: () => Promise<BotAppDeviceViewResult>;
      open: (input: { deviceSerial: string; deviceLabel: string; windowIndex?: number }) => Promise<BotAppDeviceViewResult>;
      focus: (deviceSerial: string) => Promise<BotAppDeviceViewResult>;
      close: (deviceSerial: string) => Promise<BotAppDeviceViewResult>;
      subscribe: (callback: (state: BotAppDeviceViewState[]) => void) => () => void;
    };
  };
}
