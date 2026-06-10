export type DeviceViewStatus = "open" | "failed";

export type DeviceViewState = {
  deviceSerial: string;
  deviceLabel: string;
  status: DeviceViewStatus;
  pid: number | null;
  windowTitle: string;
  startedAt: string;
  lastError: string | null;
};

export type DeviceViewResult = {
  ok: boolean;
  data: DeviceViewState[];
  error?: string;
};

type DeviceViewBridge = {
  list: () => Promise<DeviceViewResult>;
  open: (input: { deviceSerial: string; deviceLabel: string }) => Promise<DeviceViewResult>;
  focus: (deviceSerial: string) => Promise<DeviceViewResult>;
  close: (deviceSerial: string) => Promise<DeviceViewResult>;
  subscribe: (callback: (state: DeviceViewState[]) => void) => () => void;
};

function bridge(): DeviceViewBridge | null {
  return window.botappDesktop?.deviceViews ?? null;
}

export function hasDeviceViewBridge() {
  return Boolean(bridge());
}

export async function listOpenDeviceViews() {
  const api = bridge();
  if (!api) return { ok: true, data: [] } satisfies DeviceViewResult;
  return api.list();
}

export async function openDeviceView(input: { deviceSerial: string; deviceLabel: string }) {
  const api = bridge();
  if (!api) {
    return {
      ok: false,
      data: [],
      error: "Desktop bridge is unavailable. Open BotApp in the Electron app to use phone views.",
    } satisfies DeviceViewResult;
  }
  return api.open(input);
}

export async function focusDeviceView(deviceSerial: string) {
  const api = bridge();
  if (!api) {
    return {
      ok: false,
      data: [],
      error: "Desktop bridge is unavailable. Open BotApp in the Electron app to use phone views.",
    } satisfies DeviceViewResult;
  }
  return api.focus(deviceSerial);
}

export function subscribeDeviceViewState(callback: (state: DeviceViewState[]) => void) {
  const api = bridge();
  if (!api) return () => undefined;
  return api.subscribe(callback);
}
