import type {
  BotProfile,
  ProfileAutoLoginChallenge,
  ProfileAutoLoginCodePayload,
  ProfileAutoLoginPayload,
  ProfileAutoLoginProcessLogEntry,
  ProfileAutoLoginState,
} from "../../api/types";

const STEP_IDS: Array<ProfileAutoLoginState["steps"][number]["id"]> = ["templates", "placement", "provision", "persist", "sync"];

function timestamp() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date());
}

function logEntry(phase: ProfileAutoLoginProcessLogEntry["phase"], message: string): ProfileAutoLoginProcessLogEntry {
  return {
    id: `${Date.now()}-${phase}-${message}`,
    timestamp: timestamp(),
    phase,
    message,
  };
}

function idempotencyKey(prefix: "auto-login" | "code", profileOrId: BotProfile | string) {
  const id = typeof profileOrId === "string" ? profileOrId : profileOrId.id;
  return `botapp:${prefix}:${id}:preview`;
}

export function buildAutoLoginPayload(profile: BotProfile): ProfileAutoLoginPayload {
  return {
    account_id: profile.id,
    action_type: "connect_now",
    requested_by: null,
    source: "BotApp",
    device_id: profile.deviceId,
    idempotency_key: idempotencyKey("auto-login", profile),
    reason: profile.autoLoginRequirement.reason,
    metadata_safe: {
      account_username: profile.username,
      platform: profile.platform,
      device_label: profile.deviceName,
      assignment_state: profile.assignmentState,
      credential_status: profile.credentialStatus,
      login_status: profile.loginStatus,
      timeslot: profile.activeWindow,
    },
  };
}

function stepDetail(profile: BotProfile, stepId: ProfileAutoLoginState["steps"][number]["id"]) {
  if (stepId === "templates") return `${profile.package} package · ${profile.runtimeProfile}`;
  if (stepId === "placement") return `${profile.deviceName} · ${profile.activeWindow} · ${profile.assignmentState}`;
  if (stepId === "provision") return `profile: ${profile.profileNumber}`;
  if (stepId === "persist") return `profile: ${profile.profileNumber} · tag: ${profile.deviceName}`;
  return `profile: ${profile.profileNumber}`;
}

function stepLabel(stepId: ProfileAutoLoginState["steps"][number]["id"]) {
  if (stepId === "templates") return "Templates";
  if (stepId === "placement") return "Placement";
  if (stepId === "provision") return "Provision profile";
  if (stepId === "persist") return "Save metadata";
  return "Sync targets & settings";
}

export function createAutoLoginState(profile: BotProfile): ProfileAutoLoginState {
  return {
    profileId: profile.id,
    username: profile.username,
    platform: profile.platform,
    deviceLabel: profile.deviceName,
    globalStatus: "running",
    payload: buildAutoLoginPayload(profile),
    steps: STEP_IDS.map((id) => ({
      id,
      label: stepLabel(id),
      detail: stepDetail(profile, id),
      status: id === "templates" ? "running" : "pending",
    })),
    processLog: [logEntry("TEMPLATES", "Starting templates...")],
    challenge: null,
  };
}

export function autoLoginChallengeForProfile(profile: BotProfile): ProfileAutoLoginChallenge | null {
  if (profile.loginStatus === "checkpoint") {
    return {
      challenge_id: `challenge_${profile.id}`,
      account_id: profile.id,
      account_username: profile.username,
      code_type: "checkpoint",
      title: "Checkpoint required",
      help_text: "Instagram requires checkpoint confirmation before the login can continue.",
    };
  }
  if (profile.loginStatus === "needs_2fa" || profile.twoFactorEnabled) {
    return {
      challenge_id: `challenge_${profile.id}`,
      account_id: profile.id,
      account_username: profile.username,
      code_type: "2fa",
      title: "Two-factor authentication required",
      help_text: "Enter the verification code from Instagram. The code is sent only to the future secure relay.",
    };
  }
  return null;
}

export function advanceAutoLoginState(
  state: ProfileAutoLoginState,
  profile: BotProfile,
): ProfileAutoLoginState {
  if (state.globalStatus !== "running") return state;

  const runningIndex = state.steps.findIndex((step) => step.status === "running");
  if (runningIndex < 0) return state;

  const runningStep = state.steps[runningIndex];
  const nextSteps = state.steps.map((step, index) => {
    if (index < runningIndex) return { ...step, status: "done" as const };
    if (index === runningIndex) return { ...step, status: "done" as const };
    if (index === runningIndex + 1) return { ...step, status: "running" as const };
    return step;
  });

  const phaseByStep: Record<ProfileAutoLoginState["steps"][number]["id"], ProfileAutoLoginProcessLogEntry["phase"]> = {
    templates: "TEMPLATES",
    placement: "DEVICE",
    provision: "PROVISION",
    persist: "PERSIST",
    sync: "SYNC",
  };
  const logNameByStep: Record<ProfileAutoLoginState["steps"][number]["id"], string> = {
    templates: "templates",
    placement: "device",
    provision: "provision",
    persist: "persist",
    sync: "sync",
  };
  const phase = phaseByStep[runningStep.id];
  const processLog = [...state.processLog, logEntry(phase, `Completed ${logNameByStep[runningStep.id]}`)];

  if (runningStep.id === "placement") {
    processLog.push(logEntry("PROVISION", "Starting provision..."));
  } else if (runningStep.id === "templates") {
    processLog.push(logEntry("DEVICE", "Starting device..."));
  } else if (runningStep.id === "provision") {
    const challenge = autoLoginChallengeForProfile(profile);
    if (challenge) {
      return {
        ...state,
        globalStatus: "code_required",
        steps: nextSteps.map((step) => step.id === "persist" ? { ...step, status: "pending" } : step),
        processLog: [...processLog, logEntry("CODE", "Code required. Waiting for secure submission.")],
        challenge,
      };
    }
    processLog.push(logEntry("PERSIST", "Starting persist..."));
  } else if (runningStep.id === "persist") {
    processLog.push(logEntry("SYNC", "Starting sync..."));
  } else if (runningStep.id === "sync") {
    processLog.push(logEntry("DONE", "Auto-login complete"));
    return {
      ...state,
      globalStatus: "completed",
      steps: nextSteps,
      processLog,
      challenge: null,
    };
  }

  return {
    ...state,
    steps: nextSteps,
    processLog,
    challenge: null,
  };
}

export function resumeAutoLoginAfterCode(state: ProfileAutoLoginState): ProfileAutoLoginState {
  return {
    ...state,
    globalStatus: "running",
    challenge: null,
    steps: state.steps.map((step) => {
      if (step.id === "provision") return { ...step, status: "done" };
      if (step.id === "persist") return { ...step, status: "running" };
      return step;
    }),
    processLog: [
      ...state.processLog,
      logEntry("CODE", "Verification code submitted securely."),
      logEntry("PERSIST", "Starting persist..."),
    ],
  };
}

export function cancelAutoLoginChallenge(state: ProfileAutoLoginState): ProfileAutoLoginState {
  return {
    ...state,
    globalStatus: "blocked",
    challenge: null,
    steps: state.steps.map((step) => step.id === "provision" ? { ...step, status: "failed" } : step),
    processLog: [
      ...state.processLog,
      logEntry("ERROR", "Verification challenge cancelled."),
    ],
  };
}

export function buildAutoLoginCodePayload(
  challenge: ProfileAutoLoginChallenge,
  code: string,
): ProfileAutoLoginCodePayload {
  return {
    account_id: challenge.account_id,
    challenge_id: challenge.challenge_id,
    code,
    code_type: challenge.code_type,
    source: "BotApp",
    requested_by: null,
    idempotency_key: idempotencyKey("code", challenge.challenge_id),
  };
}

export function copyableProcessLog(entries: ProfileAutoLoginProcessLogEntry[]) {
  return entries.map((entry) => `${entry.timestamp} · ${entry.phase} · ${entry.message}`).join("\n");
}
