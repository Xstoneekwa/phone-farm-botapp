import type {
  BotProfile,
  DeviceProfileGroup,
  ProfileEligibility,
  ProfileFilters,
  ProfileLogEntry,
  ProfileSettings,
  ProfileStatsRow,
  ProfileTargetGroup,
} from "../api/types";
import type { Device } from "../api/types";

export const eligibilityCatalog: Record<string, ProfileEligibility> = {
  ready: {
    status: "can_start",
    primary_block_reason: "",
    reason_label: "Ready to start",
    reason_description: "Readiness config is complete and the profile is eligible to start now.",
  },
  assignment_window_closed: {
    status: "blocked_now",
    primary_block_reason: "assignment_window_closed",
    reason_label: "Assignment window closed",
    reason_description: "Profile is ready but cannot start outside its assigned timeslot.",
  },
  welcome_real_send_disabled: {
    status: "blocked_now",
    primary_block_reason: "welcome_real_send_disabled",
    reason_label: "Welcome real send disabled",
    reason_description: "Config is ready, but ops safety blocks real send for this package.",
  },
  login_verification_required: {
    status: "blocked_now",
    primary_block_reason: "login_verification_required",
    reason_label: "Login verification required",
    reason_description: "Profile needs login or challenge resolution before start is allowed.",
  },
  phone_rest_active: {
    status: "blocked_now",
    primary_block_reason: "phone_rest_active",
    reason_label: "Phone rest active",
    reason_description: "Device rest buffer is active. Wait for clone/session buffer to clear.",
  },
  device_level_lock: {
    status: "blocked_now",
    primary_block_reason: "device_level_lock",
    reason_label: "Device session lock",
    reason_description: "Another profile currently holds the single active UI session on this phone.",
  },
};

export function resolveEligibility(reason: string): ProfileEligibility {
  return eligibilityCatalog[reason] ?? {
    status: "blocked_now",
    primary_block_reason: reason,
    reason_label: reason.replaceAll("_", " "),
    reason_description: "Start is blocked in mock mode until eligibility is resolved.",
  };
}

const defaultCounters = (follow: number, unfollow: number, like: number, dm: number) => ({
  follow: { current: follow, max: 120 },
  unfollow: { current: unfollow, max: 160 },
  like: { current: like, max: 500 },
  comment: { current: 0, max: 0 },
  dm: { current: dm, max: 100 },
});

const requirement = (enabled: boolean, reason: "ready" | "missing_credentials" | "assignment_window_closed" | "device_unavailable" | "no_assignment_slot" | "runtime_blocked" | "login_status_not_ready" | "eligibility_blocked", label: string, detail: string) => ({ enabled, reason, label, detail });


export const mockProfilesExpanded: BotProfile[] = [
  {
    id: "prof_001",
    username: "rareparis.usa",
    displayName: "Lucas",
    platform: "Instagram",
    package: "Pro",
    planType: "normal",
    profileNumber: 3,
    clientName: "Boost Paris",
    status: "running",
    deviceId: "phone_01",
    deviceName: "PHONE 1",
    activeWindow: "14:00-17:00",
    followers: 2009,
    followerDelta: 17,
    followsToday: 72,
    dmsToday: 0,
    counters: defaultCounters(0, 0, 0, 0),
    twoFactorEnabled: true,
    credentialStatus: "active",
    loginStatus: "ready",
    deviceAvailability: "reserved",
    assignmentState: "reserved",
    entitlements: ["follow", "outreach", "unfollow", "welcome"],
    runtimeProfile: "full_cycle",
    slotKind: "full_cycle_6h",
    autoLoginRequirement: requirement(true, "ready", "Ready", "Credential and device prerequisites are satisfied for mock auto login."),
    assignNowRequirement: requirement(false, "eligibility_blocked", "Eligibility blocked", "Assignment is visible but blocked by current runtime eligibility."),
    lastSessionAt: "16:59:16 2026-06-09",
    readiness: "ready",
    eligibility: "blocked_now",
    eligibilityReason: "welcome_real_send_disabled",
    eligibilityDetail: resolveEligibility("welcome_real_send_disabled"),
    runtimeLock: "device_level_lock",
  },
  {
    id: "prof_002",
    username: "hellebore_pau",
    displayName: "Marie",
    platform: "Instagram",
    package: "Growth",
    planType: "normal",
    profileNumber: 1,
    clientName: "Local Growth",
    status: "ready",
    deviceId: "phone_01",
    deviceName: "PHONE 1",
    activeWindow: "09:00-12:00",
    followers: 4521,
    followerDelta: 88,
    followsToday: 41,
    dmsToday: 2,
    counters: defaultCounters(102, 67, 328, 0),
    twoFactorEnabled: false,
    credentialStatus: "active",
    loginStatus: "ready",
    deviceAvailability: "available",
    assignmentState: "assigned",
    entitlements: ["follow", "welcome"],
    runtimeProfile: "follow_only",
    slotKind: "growth_3h",
    autoLoginRequirement: requirement(true, "ready", "Ready", "Mock auto login prerequisites are satisfied."),
    assignNowRequirement: requirement(true, "ready", "Ready", "Device and assignment slot are available in mock mode."),
    lastSessionAt: "11:42:03 2026-06-09",
    readiness: "ready",
    eligibility: "can_start",
    eligibilityReason: "ready",
    eligibilityDetail: resolveEligibility("ready"),
    runtimeLock: "assignment_reserved",
  },
  {
    id: "prof_003",
    username: "cafe_central",
    displayName: "Central Cafe",
    platform: "Instagram",
    package: "Premium",
    planType: "dual",
    profileNumber: 2,
    clientName: "Hospitality",
    status: "paused",
    deviceId: "phone_01",
    deviceName: "PHONE 1",
    activeWindow: "17:00-20:00",
    followers: 31780,
    followerDelta: 0,
    followsToday: 0,
    dmsToday: 0,
    counters: defaultCounters(0, 0, 0, 0),
    twoFactorEnabled: true,
    credentialStatus: "needs_update",
    loginStatus: "challenge_required",
    deviceAvailability: "reserved",
    assignmentState: "reserved",
    entitlements: ["follow", "dm", "welcome"],
    runtimeProfile: "full_cycle",
    slotKind: "premium_6h",
    autoLoginRequirement: requirement(false, "login_status_not_ready", "Login not ready", "Challenge resolution is required before mock auto login can be previewed."),
    assignNowRequirement: requirement(false, "runtime_blocked", "Runtime blocked", "Account needs login verification before assignment preview."),
    lastSessionAt: null,
    readiness: "needs_login",
    eligibility: "blocked_now",
    eligibilityReason: "login_verification_required",
    eligibilityDetail: resolveEligibility("login_verification_required"),
    runtimeLock: "assignment_reserved",
  },
  {
    id: "prof_004",
    username: "atelier_malo",
    displayName: "Malo",
    platform: "Instagram",
    package: "Growth",
    planType: "normal",
    profileNumber: 1,
    clientName: "Atelier",
    status: "ready",
    deviceId: "phone_02",
    deviceName: "PHONE 2",
    activeWindow: "13:00-16:00",
    followers: 9210,
    followerDelta: 12,
    followsToday: 41,
    dmsToday: 0,
    counters: defaultCounters(140, 67, 328, 5),
    twoFactorEnabled: false,
    credentialStatus: "active",
    loginStatus: "ready",
    deviceAvailability: "available",
    assignmentState: "assigned",
    entitlements: ["follow", "welcome"],
    runtimeProfile: "follow_only",
    slotKind: "growth_3h",
    autoLoginRequirement: requirement(true, "ready", "Ready", "Mock auto login prerequisites are satisfied."),
    assignNowRequirement: requirement(false, "assignment_window_closed", "Window closed", "Assignment is blocked until the configured schedule window opens."),
    lastSessionAt: "15:10:22 2026-06-09",
    readiness: "ready",
    eligibility: "blocked_now",
    eligibilityReason: "assignment_window_closed",
    eligibilityDetail: resolveEligibility("assignment_window_closed"),
    runtimeLock: "none",
  },
  {
    id: "prof_005",
    username: "studio_lumiere",
    displayName: "Lumiere",
    platform: "Instagram",
    package: "Pro",
    planType: "normal",
    profileNumber: 2,
    clientName: "Studio",
    status: "ready",
    deviceId: "phone_02",
    deviceName: "PHONE 2",
    activeWindow: "09:00-12:00",
    followers: 18420,
    followerDelta: 24,
    followsToday: 55,
    dmsToday: 3,
    counters: defaultCounters(88, 42, 210, 1),
    twoFactorEnabled: true,
    credentialStatus: "active",
    loginStatus: "ready",
    deviceAvailability: "available",
    assignmentState: "assigned",
    entitlements: ["follow", "unfollow", "welcome"],
    runtimeProfile: "full_cycle",
    slotKind: "pro_3h",
    autoLoginRequirement: requirement(true, "ready", "Ready", "Mock auto login prerequisites are satisfied."),
    assignNowRequirement: requirement(true, "ready", "Ready", "Device and slot are available in mock mode."),
    lastSessionAt: "10:04:22 2026-06-09",
    readiness: "ready",
    eligibility: "can_start",
    eligibilityReason: "ready",
    eligibilityDetail: resolveEligibility("ready"),
    runtimeLock: "none",
  },
  {
    id: "prof_006",
    username: "runclub_paris",
    displayName: "Run Club",
    platform: "TikTok",
    package: "Growth",
    planType: "other",
    profileNumber: 1,
    clientName: "Fitness",
    status: "paused",
    deviceId: "phone_03",
    deviceName: "PHONE 3",
    activeWindow: "20:00-23:00",
    followers: 12880,
    followerDelta: 0,
    followsToday: 18,
    dmsToday: 0,
    counters: defaultCounters(18, 0, 45, 0),
    twoFactorEnabled: false,
    credentialStatus: "missing",
    loginStatus: "missing_credentials",
    deviceAvailability: "maintenance",
    assignmentState: "blocked",
    entitlements: ["follow"],
    runtimeProfile: "watch_only",
    slotKind: "other_3h",
    autoLoginRequirement: requirement(false, "missing_credentials", "Missing credentials", "Credential status must be active before auto login preview."),
    assignNowRequirement: requirement(false, "device_unavailable", "Device unavailable", "Phone is in maintenance/rest buffer."),
    lastSessionAt: "09:47:10 2026-06-09",
    readiness: "ready",
    eligibility: "blocked_now",
    eligibilityReason: "phone_rest_active",
    eligibilityDetail: resolveEligibility("phone_rest_active"),
    runtimeLock: "none",
  },
];

export function buildDeviceProfileGroups(profiles: BotProfile[], devices: Device[]): DeviceProfileGroup[] {
  const deviceMap = new Map(devices.map((device) => [device.id, device]));

  const grouped = new Map<string, BotProfile[]>();
  for (const profile of profiles) {
    const list = grouped.get(profile.deviceId) ?? [];
    list.push(profile);
    grouped.set(profile.deviceId, list);
  }

  return [...grouped.entries()].map(([deviceId, deviceProfiles]) => {
    const device = deviceMap.get(deviceId);
    const phoneStatus: DeviceProfileGroup["phoneStatus"] = device?.activeSession
      ? device.activeSession.state === "active_ui"
        ? "running"
        : "active"
      : device?.status === "offline"
        ? "inactive"
        : "idle";

    return {
      deviceId,
      deviceLabel: device?.name ?? deviceProfiles[0]?.deviceName ?? deviceId,
      deviceSerial: `••••${deviceId.slice(-3).toUpperCase()}`,
      phoneStatus,
      summary: {
        total: deviceProfiles.length,
        normal: deviceProfiles.filter((profile) => profile.planType === "normal").length,
        dual: deviceProfiles.filter((profile) => profile.planType === "dual").length,
        other: deviceProfiles.filter((profile) => profile.planType === "other").length,
      },
      profiles: deviceProfiles.sort((a, b) => a.profileNumber - b.profileNumber),
    };
  });
}

const mockStatsByProfile: Record<string, ProfileStatsRow[]> = {
  prof_001: [
    { sessionTime: "23:59:59", sessionDate: "2026-06-09", followers: 2009, following: 523, followBack: "ok", likeBack: "ok", follow: { current: 140, target: 360 }, unfollow: { current: 67, target: 480 }, like: { current: 328, target: 1500 }, comment: { current: 0, target: 0 }, dm: { current: 0, target: 100 }, watch: 6, totalInteractions: 331 },
    { sessionTime: "18:42:11", sessionDate: "2026-06-08", followers: 1992, following: 521, followBack: "ok", likeBack: "pending", follow: { current: 120, target: 360 }, unfollow: { current: 55, target: 480 }, like: { current: 280, target: 1500 }, comment: { current: 0, target: 0 }, dm: { current: 0, target: 100 }, watch: 4, totalInteractions: 17 },
    { sessionTime: "16:10:03", sessionDate: "2026-06-07", followers: 1980, following: 518, followBack: "none", likeBack: "none", follow: { current: 95, target: 360 }, unfollow: { current: 40, target: 480 }, like: { current: 210, target: 1500 }, comment: { current: 0, target: 0 }, dm: { current: 0, target: 100 }, watch: 2, totalInteractions: 28 },
  ],
};

const mockLogsByProfile: Record<string, ProfileLogEntry[]> = {
  prof_001: [
    { timestamp: "06/09 16:59:16", level: "DEBUG", message: "Checking profile..", source: "botapp.core.interaction:253" },
    { timestamp: "06/09 16:59:17", level: "INFO", message: "Total Watched: OK (2/50)", source: "botapp.core.watch:88" },
    { timestamp: "06/09 16:59:19", level: "INFO", message: "Story appears to have closed quickly for @sample_user.", source: "botapp.core.story:112" },
    { timestamp: "06/09 17:00:00", level: "INFO", message: "PAUSED: 17:00:00", source: "botapp.core.scheduler:41" },
    { timestamp: "06/09 17:00:01", level: "WARN", message: "Mock eligibility block preview only. token=[REDACTED]", source: "botapp.core.guard:19" },
  ],
};

const mockTargetsByProfile: Record<string, ProfileTargetGroup[]> = {
  prof_002: [
    {
      id: "tg_001",
      label: "Target Followers",
      sourceType: "main-target",
      enabled: true,
      sourceList: "1805leclosdesmaries, _mamasparty, atelierfloralfleuriste, boutique_mode",
      targets: [
        { index: 0, username: "1805leclosdesmaries", dateAdded: "2026-05-12", followers: 1111, followbackRatio: 13.725, totalFollow: 102, status: "approved" },
        { index: 1, username: "_mamasparty", dateAdded: "2026-05-14", followers: 631, followbackRatio: 17.222, totalFollow: 180, status: "approved" },
        { index: 2, username: "atelierfloralfleuriste", dateAdded: null, followers: 5962, followbackRatio: 19.311, totalFollow: 668, status: "review" },
      ],
    },
  ],
};

const mockSettingsByProfile: Record<string, ProfileSettings> = {};

const mockFiltersByProfile: Record<string, ProfileFilters> = {
  prof_001: {
    skipFollower: true,
    skipFollowing: true,
    skipNonBusiness: false,
    skipBusiness: false,
    followPrivate: false,
    followOnlyPrivate: false,
    dmPrivate: false,
    minFollowers: 1,
    maxFollowers: 1_000_000,
    minFollowing: 1,
    maxFollowing: 1_000_000,
    minPosts: 1,
    blacklistedWords: "spam, fake, bot, giveaway, crypto",
    mandatoryWords: "",
    templateName: "FILTRE 2025",
  },
};

function fallbackStats(profile: BotProfile): ProfileStatsRow[] {
  return mockStatsByProfile[profile.id] ?? [
    {
      sessionTime: profile.lastSessionAt ?? "—",
      sessionDate: "2026-06-09",
      followers: profile.followers,
      following: 420,
      followBack: "ok",
      likeBack: "pending",
      follow: profile.counters.follow,
      unfollow: profile.counters.unfollow,
      like: profile.counters.like,
      comment: profile.counters.comment,
      dm: profile.counters.dm,
      watch: 3,
      totalInteractions: profile.counters.follow.current + profile.counters.like.current,
    },
  ];
}

function fallbackLogs(profile: BotProfile): ProfileLogEntry[] {
  return mockLogsByProfile[profile.id] ?? [
    { timestamp: "06/09 10:00:00", level: "INFO", message: `Mock session loaded for ${profile.username}`, source: "botapp.mock.loader:1" },
    { timestamp: "06/09 10:00:02", level: "DEBUG", message: "No backend connection. Preview logs only.", source: "botapp.mock.loader:2" },
  ];
}

function fallbackTargets(profile: BotProfile): ProfileTargetGroup[] {
  return mockTargetsByProfile[profile.id] ?? [
    {
      id: `tg_${profile.id}`,
      label: "Target Followers",
      sourceType: "main-target",
      enabled: true,
      sourceList: "sample_target_a, sample_target_b",
      targets: [
        { index: 0, username: "sample_target_a", dateAdded: "2026-05-01", followers: 2400, followbackRatio: 12.4, totalFollow: 45, status: "approved" },
        { index: 1, username: "sample_target_b", dateAdded: null, followers: 890, followbackRatio: 8.1, totalFollow: 12, status: "review" },
      ],
    },
  ];
}

function fallbackSettings(profile: BotProfile): ProfileSettings {
  return mockSettingsByProfile[profile.id] ?? {
    general: {
      deviceId: profile.deviceId,
      deviceLabel: `${profile.deviceName} · mock`,
      displayName: profile.displayName,
      username: profile.username,
      credentialStatus: profile.credentialStatus,
      credentialSource: profile.credentialStatus === "missing" ? "unknown" : "Vault",
      twoFactorEnabled: profile.twoFactorEnabled,
      commercialPackage: profile.package,
      entitlements: profile.entitlements,
      runtimeProfile: profile.runtimeProfile,
      slotKind: profile.slotKind,
      readinessStatus: profile.readiness,
      eligibilityStatus: profile.eligibilityDetail.status,
      assignmentStatus: profile.assignmentState,
    },
    schedule: {
      currentSlot: profile.activeWindow.replace("-", " - "),
      businessWindow: profile.activeWindow.replace("-", " - "),
      assignmentStatus: profile.assignmentState,
      slotKind: profile.slotKind,
      deviceLock: profile.runtimeLock,
      cloneBufferMinutes: profile.runtimeLock === "device_level_lock" ? 10 : 0,
      phoneRest: profile.eligibilityReason === "phone_rest_active" ? "active" : "clear",
      scheduleSource: "mock dashboard sync contract",
    },
    follow: {
      timeslot: profile.activeWindow.replace("-", " - "),
      endIfLimitReached: true,
      endIfLimitType: "Follow",
      turnOffFollow: false,
      followPerDay: profile.counters.follow.max,
      muteAfterFollow: true,
      doFollowsFirst: true,
      maxFollowPerSession: Math.min(profile.counters.follow.max, 60),
      effectiveFollowLimit: `min(${profile.counters.follow.max}, ops_hard_cap)`,
      source: "business setting / admin / ops cap",
    },
    dm: {
      welcomeDmEnabled: profile.entitlements.includes("welcome"),
      coldDmEnabled: profile.entitlements.includes("outreach"),
      aiCommentPrompt: "Write your message here",
      welcomeDmBody: "Thanks for following. Mock welcome message only — no real send in this build.",
      coldDmBody: "Write your message here",
      templateName: null,
      outreachEnabled: profile.entitlements.includes("outreach"),
      welcomeEnabled: profile.entitlements.includes("welcome"),
      safeDmLimit: profile.counters.dm.max,
    },
    followback: {
      unfollowPerDay: profile.counters.unfollow.max,
      unfollowAfterDays: 3,
      stopAfterUnfollowSkipped: 3000,
      unfollowSort: "default",
      followbackRatioSummary: "mock ratio: healthy",
      effectiveUnfollowLimit: `min(${profile.counters.unfollow.max}, ops_hard_cap)`,
    },
    sources: {
      mainSource: "Target Followers",
      sourceGroups: ["main-target", "quality-review", "buffer"],
      targetAccountRefs: ["sample_target_a", "sample_target_b"],
      ctQualitySummary: "2 approved · 1 review · synced with Targets drawer",
      syncReadiness: profile.readiness === "ready" ? "ready" : "review",
    },
    filters: fallbackFilters(profile),
    advanced: {
      appMode: "da_normal",
      apkClonerSlot: "APK Cloner #1",
      turnOffLiking: false,
      startupTimeout: null,
      likePerDay: profile.counters.like.max,
      likesPerFollow: "2-3",
      feedLikes: false,
      watchStories: false,
      aiCommentPerDay: 0,
      aiCommentsPerFollow: 0,
    },
  };
}


function fallbackFilters(profile: BotProfile): ProfileFilters {
  return mockFiltersByProfile[profile.id] ?? {
    skipFollower: true,
    skipFollowing: true,
    skipNonBusiness: false,
    skipBusiness: false,
    followPrivate: false,
    followOnlyPrivate: false,
    dmPrivate: false,
    minFollowers: 1,
    maxFollowers: 1_000_000,
    minFollowing: 1,
    maxFollowing: 1_000_000,
    minPosts: 1,
    blacklistedWords: "spam, fake, bot",
    mandatoryWords: "",
    templateName: null,
  };
}

export function getMockProfileStats(profile: BotProfile) {
  return fallbackStats(profile);
}

export function getMockProfileLogs(profile: BotProfile) {
  return fallbackLogs(profile);
}

export function getMockProfileTargets(profile: BotProfile) {
  return fallbackTargets(profile);
}

export function getMockProfileSettings(profile: BotProfile) {
  return fallbackSettings(profile);
}

export function getMockProfileFilters(profile: BotProfile) {
  return fallbackFilters(profile);
}
