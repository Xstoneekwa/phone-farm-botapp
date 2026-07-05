/**
 * Auto-refresh scheduling for the Devices view.
 *
 * Backend heartbeats advance every ~60s (device heartbeat publisher) and the
 * relay serves fresh `devices_overview` data on every call. The UI must
 * therefore poll while — and only while — the Devices view is active and the
 * window is visible, and recompute the relative "Dernier signal" label locally
 * between fetches. No polling may survive when the view is closed or hidden.
 */

export const DEVICES_REFRESH_INTERVAL_MS = 15_000;
export const DEVICES_RELATIVE_TICK_MS = 15_000;

export function shouldPollDevices(activeRoute: string, visibilityState: string) {
  return activeRoute === "devices" && visibilityState === "visible";
}

type TimerFns = {
  setIntervalFn?: (handler: () => void, ms: number) => number;
  clearIntervalFn?: (id: number) => void;
};

export type DevicesAutoRefreshController = {
  /** Begin a polling session. Refreshes immediately when visible. */
  start(visible: boolean): void;
  /** Stop polling and drop the session (view closed / unmounted). */
  stop(): void;
  /** Window/view visibility changed. Visible => immediate refresh + resume. */
  handleVisibilityChange(visible: boolean): void;
  isPolling(): boolean;
};

export function createDevicesAutoRefreshController(options: {
  refresh: () => void;
  intervalMs?: number;
} & TimerFns): DevicesAutoRefreshController {
  const intervalMs = options.intervalMs ?? DEVICES_REFRESH_INTERVAL_MS;
  const setIntervalFn = options.setIntervalFn ?? ((handler, ms) => window.setInterval(handler, ms));
  const clearIntervalFn = options.clearIntervalFn ?? ((id) => window.clearInterval(id));
  let intervalId: number | null = null;
  let started = false;

  function schedule() {
    if (intervalId !== null) return;
    intervalId = setIntervalFn(() => options.refresh(), intervalMs);
  }

  function unschedule() {
    if (intervalId === null) return;
    clearIntervalFn(intervalId);
    intervalId = null;
  }

  return {
    start(visible: boolean) {
      started = true;
      if (!visible) return;
      options.refresh();
      schedule();
    },
    stop() {
      started = false;
      unschedule();
    },
    handleVisibilityChange(visible: boolean) {
      if (!started) return;
      if (visible) {
        options.refresh();
        schedule();
        return;
      }
      unschedule();
    },
    isPolling() {
      return intervalId !== null;
    },
  };
}
