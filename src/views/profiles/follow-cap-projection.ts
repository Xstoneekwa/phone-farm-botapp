export type FollowCapSource = "manual" | "warmup" | "package";

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
