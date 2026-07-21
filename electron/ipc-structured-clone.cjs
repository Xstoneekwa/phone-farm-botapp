/**
 * Electron IPC payloads must pass the structured clone algorithm (renderer ↔ main).
 * Utilities to detect and sanitize non-cloneable values before ipcMain.handle returns.
 */

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function describeValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "Array";
  if (value instanceof Error) return "Error";
  if (value instanceof Map) return "Map";
  if (value instanceof Set) return "Set";
  if (value instanceof Date) return "Date";
  if (value instanceof RegExp) return "RegExp";
  if (typeof value === "function") return "function";
  if (typeof value === "symbol") return "symbol";
  if (typeof value === "bigint") return "bigint";
  if (typeof Response !== "undefined" && value instanceof Response) return "Response";
  if (typeof Headers !== "undefined" && value instanceof Headers) return "Headers";
  if (typeof Request !== "undefined" && value instanceof Request) return "Request";
  if (typeof Promise !== "undefined" && value instanceof Promise) return "Promise";
  if (!isPlainObject(value) && !Array.isArray(value)) return value.constructor?.name || "object";
  return typeof value;
}

function findNonCloneablePath(value, path = "$", seen = new WeakSet()) {
  if (value === undefined || value === null) return null;
  const kind = describeValue(value);
  if (kind === "function" || kind === "symbol" || kind === "bigint" || kind === "Error"
    || kind === "Map" || kind === "Set" || kind === "Response" || kind === "Headers"
    || kind === "Request" || kind === "Promise") {
    return { path, kind };
  }
  if (typeof value !== "object") {
    try {
      structuredClone(value);
      return null;
    } catch (error) {
      return { path, kind, message: error instanceof Error ? error.message : String(error) };
    }
  }
  if (seen.has(value)) {
    return { path, kind: "circular_reference" };
  }
  seen.add(value);
  try {
    structuredClone(value);
    return null;
  } catch {
    // descend
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findNonCloneablePath(value[index], `${path}[${index}]`, seen);
      if (found) return found;
    }
    return { path, kind: "object", message: "structured_clone_failed_at_array" };
  }
  if (!isPlainObject(value)) {
    return { path, kind };
  }
  for (const key of Object.keys(value)) {
    const found = findNonCloneablePath(value[key], `${path}.${key}`, seen);
    if (found) return found;
  }
  return { path, kind: "object", message: "structured_clone_failed_unknown" };
}

function jsonReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack || null };
  }
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  return value;
}

function serializeIpcPayload(value, depth = 0, ancestors = new WeakSet()) {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return toRedactedIpcError(value, "ipc_error");
  if (depth >= 16) return "[max_depth]";
  if (ancestors.has(value)) return "[circular]";

  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => serializeIpcPayload(item, depth + 1, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (value instanceof Map) {
    const result = serializeIpcPayload(Object.fromEntries(value), depth + 1, ancestors);
    ancestors.delete(value);
    return result;
  }
  if (value instanceof Set) {
    const result = serializeIpcPayload([...value], depth + 1, ancestors);
    ancestors.delete(value);
    return result;
  }

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = serializeIpcPayload(child, depth + 1, ancestors);
  }
  ancestors.delete(value);
  return result;
}

function toIpcSafe(value) {
  return serializeIpcPayload(value);
}

function toRedactedIpcError(error, fallbackCode = "ipc_error") {
  const rawMessage = error instanceof Error ? error.message : String(error || "unknown");
  const message = /could not be cloned|clone/i.test(rawMessage)
    ? "structured_clone_failed"
    : rawMessage.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/(token|key|secret)=\S+/gi, "$1=[redacted]");
  return {
    code: /structured_clone_failed|could not be cloned/i.test(message) ? "structured_clone_failed" : fallbackCode,
    message,
  };
}

function assertIpcCloneable(value, label = "ipc_payload") {
  const found = findNonCloneablePath(value);
  if (found) {
    const detail = `${label}: non-cloneable ${found.kind} at ${found.path}`;
    throw new Error(found.message ? `${detail} (${found.message})` : detail);
  }
  structuredClone(value);
  return value;
}

module.exports = {
  assertIpcCloneable,
  describeValue,
  findNonCloneablePath,
  serializeIpcPayload,
  toRedactedIpcError,
  toIpcSafe,
};
