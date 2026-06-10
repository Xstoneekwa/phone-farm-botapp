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

interface Window {
  botappDesktop?: {
    platform: string;
    mode: string;
    deviceViews?: {
      list: () => Promise<BotAppDeviceViewResult>;
      open: (input: { deviceSerial: string; deviceLabel: string }) => Promise<BotAppDeviceViewResult>;
      focus: (deviceSerial: string) => Promise<BotAppDeviceViewResult>;
      close: (deviceSerial: string) => Promise<BotAppDeviceViewResult>;
      subscribe: (callback: (state: BotAppDeviceViewState[]) => void) => () => void;
    };
  };
}
