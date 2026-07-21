"use strict";

const MAX_STRING_LENGTH = 4000;
const MAX_DEPTH = 16;

function kindOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value instanceof Error) return "error";
  return typeof value;
}

function findNonCloneablePath(value, path = "$", seen = new WeakSet()) {
  const kind = kindOf(value);
  if (
    value === null
    || kind === "undefined"
    || kind === "string"
    || kind === "number"
    || kind === "boolean"
    || kind === "bigint"
    || kind === "date"
  ) {
    return null;
  }
  if (kind === "function" || kind === "symbol") return { path, kind };
  if (kind !== "object" && kind !== "array" && kind !== "error") return { path, kind };
  if (seen.has(value)) return null;
  seen.add(value);

  if (kind === "error") {
    return null;
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
  for (const [key, child] of entries) {
    const next = findNonCloneablePath(child, `${path}.${key}`, seen);
    if (next) return next;
  }
  return null;
}

function serializeIpcPayload(value, depth = 0, ancestors = new WeakSet()) {
  const kind = kindOf(value);
  if (value === null || kind === "undefined" || kind === "number" || kind === "boolean") return value;
  if (kind === "bigint") return String(value);
  if (kind === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }
  if (kind === "date") return value.toISOString();
  if (kind === "function" || kind === "symbol") return `[${kind}]`;
  if (kind === "error") return toRedactedIpcError(value, "ipc_error");
  if (depth >= MAX_DEPTH) return "[max_depth]";
  if (ancestors.has(value)) return "[circular]";
  if (kind !== "array" && kind !== "object") return String(value);

  ancestors.add(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => serializeIpcPayload(item, depth + 1, ancestors));
    ancestors.delete(value);
    return items;
  }

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = serializeIpcPayload(child, depth + 1, ancestors);
  }
  ancestors.delete(value);
  return out;
}

function redactErrorMessage(message) {
  return String(message || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(service_role|supabase_service_role_key|password|secret|token)=?[^,\s]*/gi, "$1=[redacted]")
    .slice(0, 600);
}

function toRedactedIpcError(error, fallback = "ipc_error") {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return {
    name: error instanceof Error && error.name ? error.name : "Error",
    message: redactErrorMessage(message || fallback),
  };
}

module.exports = {
  findNonCloneablePath,
  serializeIpcPayload,
  toRedactedIpcError,
};
