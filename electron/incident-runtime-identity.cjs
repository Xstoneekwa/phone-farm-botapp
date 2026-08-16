"use strict";

const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const GIT_SHA_PREFIX = /^[0-9a-f]{7,40}$/;

function certifyWorkerRuntimeIdentity(runtime, options = {}) {
  if (!runtime || runtime.processRunning !== true || runtime.duplicateProcess === true || runtime.status !== "running") {
    return { ok: false, reason: "corrected_worker_runtime_not_healthy" };
  }
  if (runtime.runtimeRootOk !== true) {
    return { ok: false, reason: "corrected_worker_runtime_root_not_certified" };
  }

  const activeRoot = String(runtime.activeRoot || "").trim();
  const resolvedRoot = String(runtime.resolvedRoot || "").trim();
  const reportedCommit = String(runtime.runtimeCommit || "").trim().toLowerCase();
  if (!activeRoot || !resolvedRoot || !GIT_SHA_PREFIX.test(reportedCommit)) {
    return { ok: false, reason: "corrected_worker_runtime_identity_missing" };
  }

  const fsImpl = options.fsImpl || fs;
  let activeRealPath;
  let resolvedRealPath;
  try {
    activeRealPath = fsImpl.realpathSync(activeRoot);
    resolvedRealPath = fsImpl.realpathSync(resolvedRoot);
  } catch {
    return { ok: false, reason: "corrected_worker_runtime_root_unreadable" };
  }
  if (activeRealPath !== resolvedRealPath) {
    return { ok: false, reason: "corrected_worker_runtime_root_mismatch" };
  }

  const spawnSyncImpl = options.spawnSyncImpl || spawnSync;
  const gitPath = options.gitPath || "/usr/bin/git";
  const result = spawnSyncImpl(gitPath, [
    "-c",
    `safe.directory=${resolvedRealPath}`,
    "-C",
    resolvedRealPath,
    "rev-parse",
    "--verify",
    "HEAD",
  ], {
    encoding: "utf8",
    shell: false,
    timeout: 5000,
    maxBuffer: 64 * 1024,
  });
  const fullCommit = String(result?.stdout || "").trim().toLowerCase();
  if (result?.status !== 0 || !FULL_GIT_SHA.test(fullCommit)) {
    return { ok: false, reason: "corrected_worker_runtime_full_sha_unavailable" };
  }
  if (!fullCommit.startsWith(reportedCommit)) {
    return { ok: false, reason: "corrected_worker_runtime_sha_mismatch" };
  }
  return {
    ok: true,
    workerSha: fullCommit,
    causeFixedVersion: `worker:${fullCommit}`,
  };
}

module.exports = {
  certifyWorkerRuntimeIdentity,
};
