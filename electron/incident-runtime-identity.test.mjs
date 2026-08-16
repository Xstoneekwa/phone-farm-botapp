import assert from "node:assert/strict";
import test from "node:test";
import runtimeIdentity from "./incident-runtime-identity.cjs";

const { certifyWorkerRuntimeIdentity } = runtimeIdentity;
const fullSha = "361b3fec0a97c0facca9fcb2cdd69e9f7273effe";
const healthy = {
  status: "running",
  processRunning: true,
  duplicateProcess: false,
  runtimeRootOk: true,
  activeRoot: "/Users/admin/phonefarm-worker-current",
  resolvedRoot: "/Users/admin/phonefarm-worker-releases/361b3fe-release",
  runtimeCommit: "361b3fe",
};
const fsImpl = {
  realpathSync(value) {
    if (value === healthy.activeRoot || value === healthy.resolvedRoot) return healthy.resolvedRoot;
    throw new Error("missing");
  },
};

test("certifies the full immutable HEAD when runtimectl reports a matching short SHA", () => {
  const calls = [];
  const result = certifyWorkerRuntimeIdentity(healthy, {
    fsImpl,
    spawnSyncImpl(command, args) {
      calls.push({ command, args });
      return { status: 0, stdout: `${fullSha}\n` };
    },
  });
  assert.deepEqual(result, {
    ok: true,
    workerSha: fullSha,
    causeFixedVersion: `worker:${fullSha}`,
  });
  assert.deepEqual(calls, [{
    command: "/usr/bin/git",
    args: [
      "-c",
      `safe.directory=${healthy.resolvedRoot}`,
      "-C",
      healthy.resolvedRoot,
      "rev-parse",
      "--verify",
      "HEAD",
    ],
  }]);
});

test("scopes the Git ownership exception to the exact certified immutable root", () => {
  let observedArgs;
  const result = certifyWorkerRuntimeIdentity(healthy, {
    fsImpl,
    spawnSyncImpl(_command, args) {
      observedArgs = args;
      return { status: 0, stdout: `${fullSha}\n` };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(observedArgs[0], "-c");
  assert.equal(observedArgs[1], `safe.directory=${healthy.resolvedRoot}`);
  assert.equal(observedArgs.includes("safe.directory=*"), false);
});

test("fails closed on unhealthy runtime, root mismatch, or SHA mismatch", () => {
  assert.equal(certifyWorkerRuntimeIdentity({ ...healthy, processRunning: false }, { fsImpl }).ok, false);
  assert.equal(certifyWorkerRuntimeIdentity({ ...healthy, runtimeRootOk: false }, { fsImpl }).ok, false);
  assert.equal(certifyWorkerRuntimeIdentity(healthy, {
    fsImpl: { realpathSync: (value) => value },
  }).reason, "corrected_worker_runtime_root_mismatch");
  assert.equal(certifyWorkerRuntimeIdentity(healthy, {
    fsImpl,
    spawnSyncImpl: () => ({ status: 0, stdout: `${"a".repeat(40)}\n` }),
  }).reason, "corrected_worker_runtime_sha_mismatch");
});
