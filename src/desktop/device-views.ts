export type DeviceViewStatus = "open" | "failed";

export type DeviceViewPlacement = {
  botAppBounds?: { x: number; y: number; width: number; height: number };
  workArea?: { x: number; y: number; width: number; height: number };
  botAppFullscreen: boolean;
  sameSpace: "unknown" | "same" | "different";
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
};

export type DeviceViewState = {
  deviceSerial: string;
  deviceLabel: string;
  status: DeviceViewStatus;
  pid: number | null;
  windowTitle: string;
  startedAt: string;
  lastError: string | null;
  placement?: DeviceViewPlacement | null;
};

export type LocalToolState = {
  found: boolean;
  path: string | null;
  basename: string | null;
  reason: string;
};

export type LocalToolDiagnostics = {
  adb: LocalToolState;
  scrcpy: LocalToolState;
  checkedAt: string;
};

export type DeviceViewResult = {
  ok: boolean;
  data: DeviceViewState[];
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
  placement?: DeviceViewPlacement | null;
  tools?: LocalToolDiagnostics;
};

export type DeviceViewNativeWindowProbeEntry = {
  deviceSerial: string;
  childPid: number | null;
  requestedWindowTitle: string | null;
  processAlive: boolean;
  nativeWindowOwnerPid: number | null;
  nativeWindowId: number | null;
  nativeWindowTitle: string | null;
  nativeOwnerName: string | null;
};

export type DeviceViewNativeWindowProbeResult = {
  ok: boolean;
  data: DeviceViewNativeWindowProbeEntry[];
  error?: string;
  reason?: string;
  permissionRequired?: boolean;
  method?: string;
  platform?: string;
};

type DeviceViewBridge = {
  list: () => Promise<DeviceViewResult>;
  open: (input: { deviceSerial: string; deviceLabel: string; windowIndex?: number }) => Promise<DeviceViewResult>;
  focus: (deviceSerial: string) => Promise<DeviceViewResult>;
  close: (deviceSerial: string) => Promise<DeviceViewResult>;
  probeNativeWindowState?: () => Promise<DeviceViewNativeWindowProbeResult>;
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

export async function openDeviceView(input: { deviceSerial: string; deviceLabel: string; windowIndex?: number }) {
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

export async function closeDeviceView(deviceSerial: string) {
  const api = bridge();
  if (!api) return { ok: true, data: [] } satisfies DeviceViewResult;
  return api.close(deviceSerial);
}

export async function probeNativeDeviceViews() {
  const api = bridge();
  if (!api?.probeNativeWindowState) return { ok: false, reason: "probe_unavailable", data: [] } satisfies DeviceViewNativeWindowProbeResult;
  return api.probeNativeWindowState();
}

export async function closeAllDeviceViews(deviceSerials: string[]) {
  const api = bridge();
  if (!api) return { ok: true, data: [] } satisfies DeviceViewResult;
  let lastResult: DeviceViewResult = { ok: true, data: [] };
  for (const deviceSerial of deviceSerials) {
    lastResult = await api.close(deviceSerial);
  }
  return lastResult;
}

export function subscribeDeviceViewState(callback: (state: DeviceViewState[]) => void) {
  const api = bridge();
  if (!api) return () => undefined;
  return api.subscribe(callback);
}
