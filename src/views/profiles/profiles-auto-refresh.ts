export const PROFILES_IDLE_REFRESH_MS = 4_000;
export const PROFILES_ACTIVE_REFRESH_MS = 2_000;

type TimerHandle = ReturnType<typeof setTimeout>;

export type ProfilesRefreshContext = {
  generation: number;
  full: boolean;
  isLatest: () => boolean;
};

type ProfilesAutoRefreshOptions = {
  refresh: (reason: string, context: ProfilesRefreshContext) => Promise<void> | void;
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
  let automaticInFlight = false;
  let automaticQueued = false;
  let generation = 0;

  const clearTimer = () => {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
  };

  const schedule = () => {
    clearTimer();
    if (!running || automaticInFlight) return;
    const intervalMs = isRuntimeActive() ? PROFILES_ACTIVE_REFRESH_MS : PROFILES_IDLE_REFRESH_MS;
    timer = setTimeoutFn(() => {
      timer = null;
      void triggerAutomatic("poll");
    }, intervalMs);
  };

  const execute = async (reason: string, full: boolean, automatic: boolean) => {
    const requestGeneration = ++generation;
    if (automatic) automaticInFlight = true;
    clearTimer();
    log("profiles_refresh_triggered", { reason, full, generation: requestGeneration, runtimeActive: isRuntimeActive() });
    try {
      await refresh(reason, {
        generation: requestGeneration,
        full,
        isLatest: () => requestGeneration === generation,
      });
    } finally {
      if (automatic) automaticInFlight = false;
      if (running) {
        if (requestGeneration !== generation) {
          if (!automaticInFlight) schedule();
        } else if (automaticQueued) {
          automaticQueued = false;
          void triggerAutomatic("queued");
        } else {
          schedule();
        }
      }
    }
  };

  const triggerAutomatic = async (reason: string) => {
    if (!running) return;
    if (automaticInFlight) {
      automaticQueued = true;
      return;
    }
    await execute(reason, false, true);
  };

  return {
    start(enabled: boolean) {
      if (!enabled || running) return;
      running = true;
      log("profiles_polling_started", { runtimeActive: isRuntimeActive() });
      void triggerAutomatic("profiles_opened");
    },
    stop() {
      if (!running) return;
      running = false;
      automaticQueued = false;
      generation += 1;
      clearTimer();
      log("profiles_polling_stopped");
    },
    requestFullRefresh(reason = "manual_refresh") {
      if (!running) return Promise.resolve();
      return execute(reason, true, false);
    },
    handleVisibilityChange(visible: boolean) {
      if (!visible) {
        clearTimer();
        return;
      }
      if (running) void triggerAutomatic("visible");
    },
    handleFocus() {
      if (running) void triggerAutomatic("focus");
    },
    handleRelayReconnect() {
      if (running) void triggerAutomatic("relay_reconnected");
    },
    isPolling() {
      return running && timer !== null;
    },
    isStarted() {
      return running;
    },
  };
}
