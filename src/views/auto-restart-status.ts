import type { AutoRestartControl, AutoRestartOverview } from "../api/types";
import type { BotAppDispatcherHealth, BotAppRelayHealth } from "../api/types";
import type { BadgeTone } from "../design/components";

export type AutoRestartOperationalState = "disabled" | "blocked" | "ready" | "active";

export type AutoRestartTruth = {
  relayOperational: boolean;
  dispatcherOperational: boolean;
  autoRestartEnabled: boolean;
  schedulerExecutable: boolean;
  operationalState: AutoRestartOperationalState;
  blockReasons: string[];
  isBackendPending: boolean;
  relayLabel: string;
  dispatcherLabel: string;
  autoRestartTitle: string;
  autoRestartDetail: string;
  autoRestartTone: BadgeTone;
  heroBadgeLabel: string;
  controlsUnavailableReason: string;
  emptyValueLabel: string;
};

const RUNTIME_MUTATION_ACTIONS = new Set<AutoRestartControl["action"]>([
  "enable_auto_restart",
  "disable_auto_restart",
  "restart_eligible_sessions",
  "resume_quota_paused",
  "pause_device_rest",
  "resume_phone",
]);

function readOperationalState(overview: AutoRestartOverview): AutoRestartOperationalState {
  const raw = (overview as AutoRestartOverview & { operationalState?: AutoRestartOperationalState }).operationalState
    || (overview as AutoRestartOverview & { status?: { operationalState?: AutoRestartOperationalState } }).status?.operationalState;
  if (raw === "active" || raw === "blocked" || raw === "ready" || raw === "disabled") return raw;
  if (!overview.enabled || overview.mode === "disabled") return "disabled";
  if (overview.mode === "active") return "active";
  return "ready";
}

function readBlockReasons(overview: AutoRestartOverview): string[] {
  const fromStatus = (overview as AutoRestartOverview & { status?: { blockReasons?: string[] } }).status?.blockReasons;
  if (Array.isArray(fromStatus) && fromStatus.length) return fromStatus;
  return [];
}

export function projectAutoRestartTruth(input: {
  overview: AutoRestartOverview;
  relayHealth: BotAppRelayHealth | null;
  dispatcherHealth: BotAppDispatcherHealth | null;
}): AutoRestartTruth {
  const { overview } = input;
  const relayOperational = Boolean(input.relayHealth?.ok && input.relayHealth.relay_authenticated);
  const dispatcherOperational = input.dispatcherHealth?.status === "running" && Boolean(input.dispatcherHealth.processRunning);
  const isBackendPending = overview.backendSyncStatus !== "relay_ready";
  const operationalState = isBackendPending ? "blocked" : readOperationalState(overview);
  const blockReasons = isBackendPending
    ? ["auto_restart_backend_not_connected", ...readBlockReasons(overview)]
    : readBlockReasons(overview);

  const autoRestartEnabled = Boolean(overview.enabled);
  const schedulerExecutable = operationalState === "active"
    && relayOperational
    && dispatcherOperational
    && !isBackendPending;

  let autoRestartTitle = "Disabled";
  let autoRestartDetail = "Automatic restart is off.";
  let autoRestartTone: BadgeTone = "neutral";
  let heroBadgeLabel = "disabled";

  if (!relayOperational) {
    autoRestartTitle = "Blocked";
    autoRestartDetail = "Relay is not authenticated.";
    autoRestartTone = "error";
    heroBadgeLabel = "blocked";
  } else if (!dispatcherOperational) {
    autoRestartTitle = "Blocked";
    autoRestartDetail = "Dispatcher is not running.";
    autoRestartTone = "error";
    heroBadgeLabel = "blocked";
  } else if (isBackendPending) {
    autoRestartTitle = "Blocked";
    autoRestartDetail = "Canonical settings are not loaded from backend.";
    autoRestartTone = "warning";
    heroBadgeLabel = "blocked";
  } else if (operationalState === "active") {
    autoRestartTitle = "Active";
    autoRestartDetail = "Backend confirms active automatic restart.";
    autoRestartTone = "success";
    heroBadgeLabel = "active";
  } else if (operationalState === "ready") {
    autoRestartTitle = "Ready to activate";
    autoRestartDetail = "Prerequisites are satisfied. Confirm activation to enable scheduler.";
    autoRestartTone = "success";
    heroBadgeLabel = "ready";
  } else if (operationalState === "blocked") {
    autoRestartTitle = "Blocked";
    autoRestartDetail = blockReasons.length
      ? blockReasons.join(", ")
      : "Activation prerequisites are not satisfied.";
    autoRestartTone = "warning";
    heroBadgeLabel = "blocked";
  }

  const controlsUnavailableReason = !relayOperational
    ? "Relay is not authenticated."
    : !dispatcherOperational
      ? "Dispatcher is not running."
      : isBackendPending
        ? "Backend is not connected."
        : operationalState === "disabled"
          ? "Auto Restart is disabled."
          : operationalState === "blocked"
            ? (blockReasons[0] || "Activation blocked.")
            : operationalState !== "active"
              ? "Enable active mode after prerequisites are satisfied."
              : "";

  return {
    relayOperational,
    dispatcherOperational,
    autoRestartEnabled,
    schedulerExecutable,
    operationalState,
    blockReasons,
    isBackendPending,
    relayLabel: relayOperational ? "Connected" : "Unavailable",
    dispatcherLabel: dispatcherOperational ? "Running" : "Unavailable",
    autoRestartTitle,
    autoRestartDetail,
    autoRestartTone,
    heroBadgeLabel,
    controlsUnavailableReason,
    emptyValueLabel: "Unavailable",
  };
}

export function isRuntimeMutationControl(action: AutoRestartControl["action"]) {
  return RUNTIME_MUTATION_ACTIONS.has(action);
}

export function runtimeControlDisabled(control: AutoRestartControl, truth: AutoRestartTruth) {
  if (!isRuntimeMutationControl(control.action)) return false;
  if (control.dryRun || control.backendStatus !== "relay_ready") return true;
  if (control.action === "enable_auto_restart" || control.action === "disable_auto_restart" || control.action === "pause_device_rest" || control.action === "resume_phone") {
    return !truth.relayOperational;
  }
  return !truth.schedulerExecutable;
}

export function formatAutoRestartValue(value: string | number | null, _truth: AutoRestartTruth) {
  if (value === null || value === "") return "Unavailable";
  return String(value);
}
