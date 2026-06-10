import type {
  BotProfile,
  ProfileAssignmentCandidate,
  ProfileAssignmentGate,
  ProfileAssignmentSlot,
  ProfileAssignNowPayload,
  ProfileAssignNowState,
} from "../../api/types";

function idempotencyKey(profile: BotProfile) {
  return `botapp:assign-now:${profile.id}:preview`;
}

function slotWindow(profile: BotProfile): ProfileAssignmentSlot {
  const [startsAt, endsAt] = profile.activeWindow.split("-");
  return {
    starts_at: startsAt?.trim() || "pending",
    ends_at: endsAt?.trim() || "pending",
    slot_kind: profile.slotKind,
    slot_kind_label: profile.slotKind.replaceAll("_", " "),
    available: profile.assignNowRequirement.enabled,
    reason: profile.assignNowRequirement.enabled ? null : profile.assignNowRequirement.reason,
  };
}

function scheduleGate(profile: BotProfile): ProfileAssignmentGate {
  if (profile.assignNowRequirement.enabled) {
    return {
      ok: true,
      reason: profile.assignNowRequirement.reason,
      label: "Ready to assign",
      detail: "The current assignment window can be created or repaired now.",
    };
  }
  return {
    ok: false,
    reason: profile.assignNowRequirement.reason,
    label: profile.assignNowRequirement.label,
    detail: profile.assignNowRequirement.detail,
  };
}

function appInstanceLabel(profile: BotProfile) {
  if (profile.assignNowRequirement.reason === "app_instance_missing") return "No app instance available";
  if (profile.deviceAvailability === "offline" || profile.deviceAvailability === "maintenance") return "Unavailable";
  return `${profile.platform} app · ${profile.profileNumber}`;
}

function cloneSlot(profile: BotProfile) {
  if (profile.assignNowRequirement.reason === "app_instance_missing") return "pending";
  if (profile.slotKind.includes("6h")) return "full-cycle clone";
  if (profile.slotKind.includes("3h")) return "growth clone";
  return "standard clone";
}

function warnings(profile: BotProfile) {
  const output: string[] = [];
  if (profile.assignmentState === "assigned" || profile.assignmentState === "reserved") {
    output.push("Existing assignment will be treated as already assigned or repaired by the secure relay.");
  }
  if (profile.runtimeLock !== "none") {
    output.push("A runtime lock is visible; the relay must re-check active runs and requests before saving.");
  }
  if (!profile.assignNowRequirement.enabled) {
    output.push(profile.assignNowRequirement.detail);
  }
  return output;
}

export function buildAssignNowCandidate(profile: BotProfile): ProfileAssignmentCandidate {
  const slot = slotWindow(profile);
  const assigned = profile.assignmentState === "assigned" || profile.assignmentState === "reserved";
  return {
    account_id: profile.id,
    account_username: profile.username,
    platform: profile.platform,
    device_id: profile.deviceId,
    device_label: profile.deviceName,
    safe_device_serial: `••••${profile.deviceId.slice(-3).toUpperCase()}`,
    app_instance_label: appInstanceLabel(profile),
    clone_slot: cloneSlot(profile),
    current_slot: assigned ? slot : null,
    candidate_slot: profile.assignNowRequirement.enabled ? slot : null,
    schedule_gate: scheduleGate(profile),
    warnings: warnings(profile),
  };
}

function slotLabel(slot: ProfileAssignmentSlot | null) {
  if (!slot) return "none";
  return `${slot.starts_at}-${slot.ends_at} · ${slot.slot_kind_label}`;
}

export function buildAssignNowPayload(profile: BotProfile): ProfileAssignNowPayload {
  const candidate = buildAssignNowCandidate(profile);
  return {
    account_id: profile.id,
    device_id: profile.deviceId,
    app_instance_id: null,
    starts_at: candidate.candidate_slot?.starts_at ?? null,
    ends_at: candidate.candidate_slot?.ends_at ?? null,
    slot_kind: candidate.candidate_slot?.slot_kind ?? null,
    runtime_profile: profile.runtimeProfile,
    requested_by: null,
    source: "BotApp",
    idempotency_key: idempotencyKey(profile),
    metadata_safe: {
      account_username: profile.username,
      platform: profile.platform,
      device_label: profile.deviceName,
      safe_device_serial: candidate.safe_device_serial,
      app_instance_label: candidate.app_instance_label,
      clone_slot: candidate.clone_slot,
      current_slot: slotLabel(candidate.current_slot),
      candidate_slot: slotLabel(candidate.candidate_slot),
      schedule_gate_reason: candidate.schedule_gate.reason,
      assignment_state: profile.assignmentState,
    },
  };
}

export function createAssignNowState(profile: BotProfile): ProfileAssignNowState {
  return {
    profileId: profile.id,
    candidate: buildAssignNowCandidate(profile),
    payload: buildAssignNowPayload(profile),
    result: "prepared",
  };
}
