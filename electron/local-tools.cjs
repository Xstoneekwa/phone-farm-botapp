/* global module */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PATH_PROBE_TIMEOUT_MS = 1500;

function safePath(value) {
  return String(value || "").trim();
}

function isExecutable(filePath) {
  if (!filePath.includes(path.sep)) return true;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function candidateExists(candidate) {
  return !candidate.includes(path.sep) || fs.existsSync(candidate);
}

function adbCandidates() {
  return [
    process.env.ADB,
    process.env.BOTAPP_ADB_PATH,
    path.join(process.env.ANDROID_HOME || "", "platform-tools", "adb"),
    path.join(process.env.ANDROID_SDK_ROOT || "", "platform-tools", "adb"),
    path.join(os.homedir(), "Library", "Android", "sdk", "platform-tools", "adb"),
    "/opt/homebrew/bin/adb",
    "/usr/local/bin/adb",
    "adb",
  ].map(safePath).filter(Boolean);
}

function scrcpyCandidates() {
  return [
    process.env.SCRCPY,
    process.env.BOTAPP_SCRCPY_PATH,
    "/opt/homebrew/bin/scrcpy",
    "/usr/local/bin/scrcpy",
    "scrcpy",
  ].map(safePath).filter(Boolean);
}

function probeTool(candidate, args) {
  if (!candidateExists(candidate)) {
    return { ok: false, reason: "missing" };
  }
  if (!isExecutable(candidate)) {
    return { ok: false, reason: "not_executable" };
  }
  const result = spawnSync(candidate, args, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: PATH_PROBE_TIMEOUT_MS,
  });
  if (result.error) return { ok: false, reason: result.error.code || "probe_error" };
  if (result.status !== 0) return { ok: false, reason: `exit_${result.status}` };
  return { ok: true, reason: "found" };
}

function resolveLocalTool(name, candidates, args) {
  const attempts = [];
  for (const candidate of candidates) {
    const probe = probeTool(candidate, args);
    attempts.push({ path: candidate, ok: probe.ok, reason: probe.reason });
    if (probe.ok) {
      console.log(`[BotApp local tools] ${name} resolved: ${candidate}`);
      return { ok: true, path: candidate, reason: "found", attempts };
    }
  }
  console.warn(`[BotApp local tools] ${name} missing. Checked: ${attempts.map((item) => item.path).join(", ")}`);
  return { ok: false, path: null, reason: "not_found", attempts };
}

function resolveAdbPath() {
  return resolveLocalTool("adb", adbCandidates(), ["version"]);
}

function resolveScrcpyPath() {
  return resolveLocalTool("scrcpy", scrcpyCandidates(), ["--version"]);
}

function publicToolResult(result) {
  return {
    found: Boolean(result?.ok),
    path: result?.path || null,
    basename: result?.path ? path.basename(result.path) : null,
    reason: result?.reason || "not_found",
  };
}

function localToolDiagnostics() {
  return {
    adb: publicToolResult(resolveAdbPath()),
    scrcpy: publicToolResult(resolveScrcpyPath()),
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  localToolDiagnostics,
  resolveAdbPath,
  resolveScrcpyPath,
};
