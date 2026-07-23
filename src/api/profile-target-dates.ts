type ProfileTargetDateRow = {
  added_at?: unknown;
  created_at?: unknown;
  last_used_at?: unknown;
};

function readDate(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function resolveProfileTargetDates(row: ProfileTargetDateRow) {
  return {
    addedAt: readDate(row.added_at) ?? readDate(row.created_at),
    lastUsedAt: readDate(row.last_used_at),
  };
}
