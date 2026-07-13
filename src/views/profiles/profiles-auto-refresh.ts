export const PROFILES_IDLE_REFRESH_MS = 4_000;
export const PROFILES_ACTIVE_REFRESH_MS = 2_000;

type TimerHandle = ReturnType<typeof setTimeout>;

type ProfilesAutoRefreshOptions = {
  refresh: (reason: string) => Promise<void> | void;
  isRuntimeActive: () => boolean;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  log?: (event: string, detail?: Record<string, unknown>) => void;
};

export function shouldPollProfiles(route: string, visibilityState: string) {
  return route === "profiles" && visibilityState === "visible";
}

export function createProfilesAutoRefreshController({
  refresh,
  isRuntimeActive,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  log = () => undefined,
}: ProfilesAutoRefreshOptions) {
  let timer: TimerHandle | null = null;
  let running = false;
  let inFlight = false;
  let refreshQueued = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
  };

  const schedule = () => {
    clearTimer();
    if (!running) return;
    const intervalMs = isRuntimeActive() ? PROFILES_ACTIVE_REFRESH_MS : PROFILES_IDLE_REFRESH_MS;
    timer = setTimeoutFn(() => {
      timer = null;
      void trigger("poll");
    }, intervalMs);
  };

  const trigger = async (reason: string) => {
    if (!running) return;
    if (inFlight) {
      refreshQueued = true;
      return;
    }
    clearTimer();
    inFlight = true;
    log("profiles_auto_refresh_triggered", { reason, runtimeActive: isRuntimeActive() });
    try {
      await refresh(reason);
    } finally {
      inFlight = false;
      if (refreshQueued) {
        refreshQueued = false;
        void trigger("queued");
      } else {
        schedule();
      }
    }
  };

  return {
    start(enabled: boolean) {
      if (!enabled) return;
      if (running) return;
      running = true;
      log("profiles_polling_started", { runtimeActive: isRuntimeActive() });
      void trigger("profiles_opened");
    },
    stop() {
      if (!running) return;
      running = false;
      refreshQueued = false;
      clearTimer();
      log("profiles_polling_stopped");
    },
    handleVisibilityChange(visible: boolean) {
      if (!visible) {
        clearTimer();
        return;
      }
      if (running) void trigger("visible");
    },
    handleFocus() {
      if (running) void trigger("focus");
    },
    handleRelayReconnect() {
      if (running) void trigger("relay_reconnected");
    },
    isPolling() {
      return running && timer !== null;
    },
    isStarted() {
      return running;
    },
  };
}
