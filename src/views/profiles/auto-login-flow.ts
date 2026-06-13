import type {
  BotProfile,
  ProfileAutoLoginChallenge,
  ProfileAutoLoginPayload,
  ProfileAutoLoginProcessLogEntry,
  ProfileRunProgressSnapshot,
  ProfileAutoLoginState,
} from "../../api/types";

const STEP_IDS: Array<ProfileAutoLoginState["steps"][number]["id"]> = ["queued", "claimed", "worker", "login", "result"];

function timestamp() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date());
}

export function autoLoginLogEntry(phase: ProfileAutoLoginProcessLogEntry["phase"], message: string): ProfileAutoLoginProcessLogEntry {
  return {
    id: `${Date.now()}-${phase}-${message}`,
    timestamp: timestamp(),
    phase,
    message,
  };
}

function idempotencyKey(profile: BotProfile) {
  return `botapp:${profile.username}:login_provisioning:${Date.now()}`;
}

export function buildAutoLoginPayload(profile: BotProfile): ProfileAutoLoginPayload {
  return {
    account_id: profile.id,
    requested_run_type: "login_provisioning",
    trigger: "manual",
    source: "BotApp",
    idempotency_key: idempotencyKey(profile),
  };
}

function stepDetail(profile: BotProfile, stepId: ProfileAutoLoginState["steps"][number]["id"]) {
  if (stepId === "queued") return "Create account_run_request for login_provisioning.";
  if (stepId === "claimed") return "Wait for the dispatcher to claim the request.";
  if (stepId === "worker") return `${profile.deviceName} · open Instagram on the assigned phone.`;
  if (stepId === "login") return "Worker verifies login and enters credentials if needed.";
  return "Connected, action required, failed, or stopped.";
}

function stepLabel(stepId: ProfileAutoLoginState["steps"][number]["id"]) {
  if (stepId === "queued") return "Queued";
  if (stepId === "claimed") return "Claimed by dispatcher";
  if (stepId === "worker") return "Worker started";
  if (stepId === "login") return "Checking login";
  return "Result";
}

export function createAutoLoginStartingState(profile: BotProfile): ProfileAutoLoginState {
  return {
    profileId: profile.id,
    username: profile.username,
    platform: profile.platform,
    deviceLabel: profile.deviceName,
    globalStatus: "starting",
    payload: buildAutoLoginPayload(profile),
    steps: STEP_IDS.map((id) => ({
      id,
      label: stepLabel(id),
      detail: stepDetail(profile, id),
      status: id === "queued" ? "running" : "pending",
    })),
    processLog: [autoLoginLogEntry("REQUEST", "Creating real login_provisioning request through BotApp relay.")],
    challenge: null,
    requestId: null,
    requestStatus: null,
    runId: null,
    safeReason: null,
    nextAction: "none",
  };
}

export function autoLoginChallengeForProfile(profile: BotProfile, reason?: string): ProfileAutoLoginChallenge | null {
  const normalized = `${profile.loginStatus} ${reason || ""}`.toLowerCase();
  if (normalized.includes("checkpoint") || normalized.includes("suspicious") || normalized.includes("challenge")) {
    return {
      challenge_id: `challenge_${profile.id}`,
      account_id: profile.id,
      account_username: profile.username,
      code_type: "checkpoint",
      title: "Checkpoint required",
      help_text: "Instagram requires checkpoint confirmation before the login can continue.",
    };
  }
  if (normalized.includes("2fa") || normalized.includes("two_factor") || normalized.includes("verification") || normalized.includes("code") || profile.twoFactorEnabled) {
    return {
      challenge_id: `challenge_${profile.id}`,
      account_id: profile.id,
      account_username: profile.username,
      code_type: "2fa",
      title: "Two-factor authentication required",
      help_text: "Open the phone and complete the code or confirmation directly on Instagram.",
    };
  }
  return null;
}

export function autoLoginStateFromStartResult(
  profile: BotProfile,
  result: Record<string, unknown>,
): ProfileAutoLoginState {
  const requestId = typeof result.request_id === "string" ? result.request_id : null;
  const requestStatus = typeof result.status === "string" ? result.status : "queued";
  const runId = typeof result.run_id === "string" ? result.run_id : null;
  return {
    profileId: profile.id,
    username: profile.username,
    platform: profile.platform,
    deviceLabel: profile.deviceName,
    globalStatus: requestStatus === "claimed" || requestStatus === "running" ? "claimed" : "queued",
    payload: buildAutoLoginPayload(profile),
    steps: STEP_IDS.map((id) => ({
      id,
      label: stepLabel(id),
      detail: stepDetail(profile, id),
      status: id === "queued" ? "running" : "pending",
    })),
    processLog: [
      autoLoginLogEntry("REQUEST", `Run request accepted (${requestId ? requestId.slice(0, 8) : "unknown"}).`),
      autoLoginLogEntry("QUEUE", `account_run_request status=${requestStatus}.`),
      autoLoginLogEntry("DISPATCHER", "Waiting for dispatcher claim and worker start."),
    ],
    challenge: null,
    requestId,
    requestStatus,
    runId,
    safeReason: typeof result.message === "string" ? result.message : null,
    nextAction: "none",
  };
}

function normalizeSnapshotStepId(id: string): ProfileAutoLoginState["steps"][number]["id"] | null {
  if (id === "queue_request") return "queued";
  if (id === "dispatcher_claim") return "claimed";
  if (id === "open_instagram") return "worker";
  if (id === "check_session" || id === "enter_credentials" || id === "verify_identity") return "login";
  if (id === "save_login_status") return "result";
  return null;
}

function globalStatusFromSnapshot(status: ProfileRunProgressSnapshot["status"]): ProfileAutoLoginState["globalStatus"] {
  if (status === "connected") return "completed";
  if (status === "action_required") return "action_required";
  if (status === "status_sync_missing" || status === "run_link_missing" || status === "completed") return "failed";
  if (status === "failed") return "failed";
  if (status === "stopped") return "stopped";
  if (status === "claimed") return "claimed";
  if (status === "running") return "running";
  if (status === "queued") return "queued";
  return "running";
}

function phaseFromLog(phase: string): ProfileAutoLoginProcessLogEntry["phase"] {
  const normalized = phase.toLowerCase();
  if (normalized.includes("request") || normalized.includes("manual_run")) return "REQUEST";
  if (normalized.includes("queue")) return "QUEUE";
  if (normalized.includes("dispatch")) return "DISPATCHER";
  if (normalized.includes("login") || normalized.includes("credential")) return "LOGIN";
  if (normalized.includes("challenge") || normalized.includes("verification") || normalized.includes("checkpoint")) return "ACTION";
  if (normalized.includes("fail") || normalized.includes("error")) return "ERROR";
  if (normalized.includes("complete") || normalized.includes("connected")) return "DONE";
  return "WORKER";
}

export function mergeAutoLoginProgressSnapshot(
  state: ProfileAutoLoginState,
  snapshot: ProfileRunProgressSnapshot,
): ProfileAutoLoginState {
  const stepById = new Map(state.steps.map((step) => [step.id, step]));
  for (const backendStep of snapshot.steps) {
    const id = normalizeSnapshotStepId(backendStep.id);
    if (!id) continue;
    const current = stepById.get(id);
    if (!current) continue;
    stepById.set(id, {
      ...current,
      label: backendStep.label || current.label,
      detail: backendStep.subtitle || current.detail,
      status: backendStep.status,
    });
  }

  const seenLogs = new Set(state.processLog.map((entry) => entry.id || `${entry.timestamp}:${entry.phase}:${entry.message}`));
  const nextLogs = [...state.processLog];
  for (const item of snapshot.process_log) {
    const phase = phaseFromLog(item.phase);
    const message = item.message || "runtime event";
    const key = item.id || `${item.timestamp}:${phase}:${message}`;
    if (seenLogs.has(key)) continue;
    seenLogs.add(key);
    nextLogs.push({
      id: item.id || key,
      timestamp: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : autoLoginLogEntry(phase, message).timestamp,
      phase,
      message,
    });
  }

  const action = snapshot.action_required;
  const challenge: ProfileAutoLoginChallenge | null = action ? {
    challenge_id: action.id,
    account_id: snapshot.account_id,
    account_username: state.username,
    code_type: action.action_type.includes("checkpoint") || action.action_type.includes("challenge") ? "checkpoint" : "2fa",
    title: action.title || "Instagram requires action",
    help_text: action.message || "Open the phone and complete the Instagram code, 2FA, checkpoint, or confirmation manually.",
  } : null;

  const reason = snapshot.reason || state.safeReason;
  return {
    ...state,
    globalStatus: globalStatusFromSnapshot(snapshot.status),
    steps: state.steps.map((step) => stepById.get(step.id) ?? step),
    challenge,
    requestId: snapshot.request_id || state.requestId,
    requestStatus: snapshot.request_status || state.requestStatus,
    runId: snapshot.run_id || state.runId,
    safeReason: reason,
    nextAction: challenge ? "open_phone"
      : reason?.toLowerCase().includes("password") ? "update_credentials"
        : reason?.toLowerCase().includes("mismatch") ? "review_mismatch"
          : state.nextAction,
    processLog: nextLogs.slice(-80),
  };
}

export function copyableProcessLog(entries: ProfileAutoLoginProcessLogEntry[]) {
  return entries.map((entry) => `${entry.timestamp} · ${entry.phase} · ${entry.message}`).join("\n");
}
