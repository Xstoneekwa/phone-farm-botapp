export type WarmupCapDraft = {
  day1: number;
  day2: number;
  day3: number;
  day4Plus: number;
  packageDayCap: number;
  packageSessionCap: number;
};

export function warmupPackageMaximum(input: Pick<WarmupCapDraft, "packageDayCap" | "packageSessionCap">) {
  return Math.min(input.packageDayCap, input.packageSessionCap);
}

export function warmupCapsValidationError(input: WarmupCapDraft) {
  const fields = [
    ["Day 1", input.day1],
    ["Day 2", input.day2],
    ["Day 3", input.day3],
    ["Day 4+", input.day4Plus],
  ] as const;
  for (const [label, value] of fields) {
    if (!Number.isInteger(value) || value <= 0) {
      return `${label} Follow warmup cap must be a positive integer.`;
    }
  }

  const packageMaximum = warmupPackageMaximum(input);
  if (Math.max(input.day1, input.day2, input.day3, input.day4Plus) > packageMaximum) {
    return `Follow warmup caps cannot exceed the package maximum (${packageMaximum}).`;
  }
  if (!(input.day1 <= input.day2 && input.day2 <= input.day3 && input.day3 <= input.day4Plus)) {
    return "Follow warmup progression must satisfy Day 1 <= Day 2 <= Day 3 <= Day 4+.";
  }
  return "";
}
