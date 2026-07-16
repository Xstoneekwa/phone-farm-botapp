export type FollowCapSource = "manual" | "warmup" | "package";

type WarmupPresentationInput = {
  warmupEnabled: boolean;
  warmupApplied: boolean;
  warmupStatus: string;
  warmupDay: number;
  packageStartedAt: string;
};

export function resolveWarmupPresentation(input: WarmupPresentationInput) {
  const warmupDay = Math.max(0, Math.floor(input.warmupDay));
  const normalizedStatus = input.warmupStatus.trim().toLowerCase();
  const hasPackageStart = Boolean(input.packageStartedAt.trim())
    && input.packageStartedAt !== "not_available";

  if (!input.warmupEnabled) {
    return { title: "Warmup disabled", badge: "disabled", tone: "warning" } as const;
  }
  if (normalizedStatus === "pending_package_start" || !hasPackageStart || warmupDay < 1) {
    return { title: "Warmup pending", badge: "pending", tone: "warning" } as const;
  }
  if (warmupDay >= 4 && input.warmupApplied) {
    return {
      title: `Warmup completed — Day ${warmupDay}`,
      badge: "completed",
      tone: "success",
    } as const;
  }
  return {
    title: `Warmup — Day ${warmupDay}`,
    badge: "in progress",
    tone: "info",
  } as const;
}

type FollowCapProjectionInput = {
  packageDayCap: number;
  packageSessionCap: number;
  manualDayCap: number | null;
  manualSessionCap: number | null;
  warmupApplied: boolean;
  warmupDayCap: number | null;
};

export function resolveFollowCapProjection(input: FollowCapProjectionInput) {
  const packageDayCap = Math.max(0, input.packageDayCap);
  const packageSessionCap = Math.max(0, input.packageSessionCap);
  const manualDayCap = input.manualDayCap === null ? packageDayCap : Math.max(0, input.manualDayCap);
  const warmupDayCap = input.warmupApplied && input.warmupDayCap !== null
    ? Math.max(0, input.warmupDayCap)
    : packageDayCap;
  const effectiveDayCap = Math.min(packageDayCap, manualDayCap, warmupDayCap);
  const configuredSessionCap = input.manualSessionCap === null
    ? packageSessionCap
    : Math.max(0, input.manualSessionCap);
  const effectiveSessionCap = Math.min(packageSessionCap, configuredSessionCap, effectiveDayCap);

  let capSource: FollowCapSource = "package";
  if (input.warmupApplied && warmupDayCap < packageDayCap && warmupDayCap <= manualDayCap) {
    capSource = "warmup";
  } else if (input.manualDayCap !== null && manualDayCap < packageDayCap) {
    capSource = "manual";
  } else if (input.manualSessionCap !== null && configuredSessionCap < packageSessionCap) {
    capSource = "manual";
  }

  return {
    effectiveDayCap,
    effectiveSessionCap,
    capSource,
    limitingReason: capSource === "manual"
      ? "admin_override_active"
      : capSource === "warmup"
        ? "limited_by_warmup"
        : "package_default",
  } as const;
}
