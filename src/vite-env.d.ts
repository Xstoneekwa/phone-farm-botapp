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
