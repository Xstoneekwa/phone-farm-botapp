"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DEFAULT_RUNTIME_CONTROLLER_PATH = "/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl";
const LEGACY_WORKER_ROOT = "/Users/admin/instagram-worker-python";

function runtimeControllerPathFromEnv(env = process.env) {
  return env.BOTAPP_RUNTIME_CONTROLLER_PATH || DEFAULT_RUNTIME_CONTROLLER_PATH;
}

function runtimeControllerCwd(controllerPath) {
  return path.dirname(path.dirname(controllerPath));
}

function validateRuntimeControllerPath(controllerPath, fsImpl = fs) {
  if (String(controllerPath || "").startsWith(LEGACY_WORKER_ROOT)) {
    return { ok: false, error: "runtime_controller_legacy_path_forbidden" };
  }
  if (!fsImpl.existsSync(controllerPath)) {
    return { ok: false, error: "runtime_controller_missing" };
  }
  try {
    fsImpl.accessSync(controllerPath, fs.constants.X_OK);
  } catch {
    return { ok: false, error: "runtime_controller_not_executable" };
  }
  return { ok: true };
}

function safeRuntimeText(value, maxLength = 4000) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function runRuntimeControllerCommand({
  controllerPath,
  component,
  command,
  args = [],
  cwd = runtimeControllerCwd(controllerPath),
  timeoutMs = 25000,
  spawnImpl = spawn,
  fsImpl = fs,
}) {
  const validation = validateRuntimeControllerPath(controllerPath, fsImpl);
  if (!validation.ok) {
    return Promise.resolve({ ok: false, error: validation.error, stdout: "", stderr: "", exitCode: null, timedOut: false });
  }
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(controllerPath, [component, command, ...args], {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        ok: false,
        error: error instanceof Error ? error.message : "runtime_controller_spawn_failed",
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: false,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // Process may already have exited.
      }
      finish({
        ok: false,
        error: `${component}_command_timeout`,
        stdout: safeRuntimeText(stdout),
        stderr: safeRuntimeText(stderr),
        exitCode: null,
        timedOut: true,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk || "");
      if (stdout.length > 1024 * 1024) stdout = stdout.slice(-1024 * 1024);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
      if (stderr.length > 256 * 1024) stderr = stderr.slice(-256 * 1024);
    });
    child.on("error", (error) => {
      finish({
        ok: false,
        error: error instanceof Error ? error.message : `${component}_command_failed`,
        stdout: safeRuntimeText(stdout),
        stderr: safeRuntimeText(stderr),
        exitCode: null,
        timedOut: false,
      });
    });
    child.on("close", (code) => {
      finish({
        ok: code === 0,
        stdout: String(stdout || ""),
        stderr: safeRuntimeText(stderr),
        exitCode: code ?? 0,
        timedOut: false,
      });
    });
  });
}

module.exports = {
  DEFAULT_RUNTIME_CONTROLLER_PATH,
  LEGACY_WORKER_ROOT,
  runtimeControllerPathFromEnv,
  runtimeControllerCwd,
  validateRuntimeControllerPath,
  runRuntimeControllerCommand,
};
