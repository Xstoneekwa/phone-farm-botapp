/// <reference types="vite/client" />

declare module "*.css";

type BotAppDeviceViewState = {
  deviceSerial: string;
  deviceLabel: string;
  status: "open" | "failed";
  pid: number | null;
  windowTitle: string;
  startedAt: string;
  lastError: string | null;
};

type BotAppDeviceViewResult = {
  ok: boolean;
  data: BotAppDeviceViewState[];
  error?: string;
};

type BotAppRuntimeIntegrationStatus = import("./api/types").BotAppRuntimeIntegrationStatus;
type CompassAiRuntimeStatus = import("./api/types").CompassAiRuntimeStatus;
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

interface Window {
  botappDesktop?: {
    platform: string;
    mode: string;
    runtime?: {
      status: () => Promise<BotAppRuntimeIntegrationStatus>;
    };
    compass?: {
      status: () => Promise<CompassAiRuntimeStatus>;
      saveRelayConfig: (input: { relayUrl: string; relayCredential?: string }) => Promise<CompassAiRuntimeStatus>;
      removeRelayConfig: () => Promise<CompassAiRuntimeStatus>;
      analyze: (input: CompassAiRuntimeAnalyzeRequest) => Promise<CompassAiRuntimeAnalyzeResult>;
    };
    autoRestart?: {
      overview: () => Promise<AutoRestartOverview>;
      dryRun: () => Promise<{ ok: boolean; overview: AutoRestartOverview; error?: string; dryRun?: true }>;
      actionPreview: (input: { action: AutoRestartControlAction; requestId?: string; target?: Record<string, unknown> }) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
    };
    data?: {
      overview: () => Promise<{ ok: boolean; data: BotAppOverviewData; error?: string | null; profilesMeta?: { source: string; accountsCount: number; counts: Record<string, number> } | null }>;
    };
    profiles?: {
      details: (accountId: string) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      createDryRun: (input: Record<string, unknown>) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      addTarget: (input: { accountId: string; username: string }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      bulkAddTargets: (input: { accountId: string; usernames: string[] }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      deleteTargets: (input: { accountId: string; ids: string[] }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
      resetTargets: (input: { accountId: string; ids: string[] }) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string | null }>;
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
    deviceViews?: {
      list: () => Promise<BotAppDeviceViewResult>;
      open: (input: { deviceSerial: string; deviceLabel: string }) => Promise<BotAppDeviceViewResult>;
      focus: (deviceSerial: string) => Promise<BotAppDeviceViewResult>;
      close: (deviceSerial: string) => Promise<BotAppDeviceViewResult>;
      subscribe: (callback: (state: BotAppDeviceViewState[]) => void) => () => void;
    };
  };
}
