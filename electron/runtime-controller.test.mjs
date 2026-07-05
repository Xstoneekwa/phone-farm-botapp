import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  LEGACY_WORKER_ROOT,
  runRuntimeControllerCommand,
  validateRuntimeControllerPath,
} = require("./runtime-controller.cjs");

const executableFs = {
  constants: { X_OK: 1 },
  existsSync: () => true,
  accessSync: () => undefined,
};

function fakeSpawnFactory({ code = 0, stdout = "", stderr = "", delayMs = 0, error = null, calls = [] } = {}) {
  return (bin, args, options) => {
    calls.push({ bin, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killedWith = null;
    child.kill = (signal) => {
      child.killedWith = signal;
      child.emit("killed", signal);
      return true;
    };
    setTimeout(() => {
      if (error) {
        child.emit("error", error);
        return;
      }
      if (stdout) child.stdout.emit("data", stdout);
      if (stderr) child.stderr.emit("data", stderr);
      child.emit("close", code);
    }, delayMs);
    return child;
  };
}

test("runtime controller status returns fast structured stdout", async () => {
  const payload = { ok: true, status: "running", processRunning: true, resolvedRoot: "/Users/admin/phonefarm-worker-current" };
  const calls = [];
  const result = await runRuntimeControllerCommand({
    controllerPath: "/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl",
    component: "dispatcher",
    command: "status",
    args: ["--json"],
    timeoutMs: 100,
    spawnImpl: fakeSpawnFactory({ stdout: `${JSON.stringify(payload)}\n`, calls }),
    fsImpl: executableFs,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0].args, ["dispatcher", "status", "--json"]);
  assert.equal(JSON.parse(result.stdout).status, "running");
});

test("runtime controller slow status does not block the event loop", async () => {
  let ticked = false;
  const promise = runRuntimeControllerCommand({
    controllerPath: "/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl",
    component: "dispatcher",
    command: "status",
    timeoutMs: 100,
    spawnImpl: fakeSpawnFactory({ stdout: "{\"ok\":true}\n", delayMs: 20 }),
    fsImpl: executableFs,
  });
  setTimeout(() => {
    ticked = true;
  }, 0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ticked, true);
  assert.equal((await promise).ok, true);
});

test("runtime controller timeout is bounded and structured", async () => {
  let killed = false;
  const spawnImpl = (bin, args, options) => {
    void bin; void args; void options;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (signal) => {
      killed = signal === "SIGTERM";
      return true;
    };
    return child;
  };
  const result = await runRuntimeControllerCommand({
    controllerPath: "/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl",
    component: "dispatcher",
    command: "status",
    timeoutMs: 5,
    spawnImpl,
    fsImpl: executableFs,
  });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.error, "dispatcher_command_timeout");
  assert.equal(killed, true);
});

test("runtime controller spawn error is returned without throwing", async () => {
  const result = await runRuntimeControllerCommand({
    controllerPath: "/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl",
    component: "dispatcher",
    command: "status",
    timeoutMs: 100,
    spawnImpl: fakeSpawnFactory({ error: new Error("simulated controller failure") }),
    fsImpl: executableFs,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /simulated controller failure/);
});

test("dispatcher start and retry invoke the canonical controller asynchronously", async () => {
  const calls = [];
  const spawnImpl = fakeSpawnFactory({ stdout: "{\"ok\":true,\"status\":\"running\"}\n", calls });
  await runRuntimeControllerCommand({
    controllerPath: "/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl",
    component: "dispatcher",
    command: "resume",
    timeoutMs: 100,
    spawnImpl,
    fsImpl: executableFs,
  });
  await runRuntimeControllerCommand({
    controllerPath: "/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl",
    component: "dispatcher",
    command: "restart",
    timeoutMs: 100,
    spawnImpl,
    fsImpl: executableFs,
  });
  assert.deepEqual(calls.map((call) => call.args), [
    ["dispatcher", "resume"],
    ["dispatcher", "restart"],
  ]);
});

test("legacy worker controller path is refused before spawn", async () => {
  const calls = [];
  const controllerPath = `${LEGACY_WORKER_ROOT}/scripts/run_control_dispatcher_service.sh`;
  assert.deepEqual(validateRuntimeControllerPath(controllerPath, executableFs), {
    ok: false,
    error: "runtime_controller_legacy_path_forbidden",
  });
  const result = await runRuntimeControllerCommand({
    controllerPath,
    component: "dispatcher",
    command: "status",
    spawnImpl: fakeSpawnFactory({ calls }),
    fsImpl: executableFs,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "runtime_controller_legacy_path_forbidden");
  assert.equal(calls.length, 0);
});

test("root mismatch and running payloads remain readable", async () => {
  for (const status of ["runtime_root_mismatch", "running"]) {
    const result = await runRuntimeControllerCommand({
      controllerPath: "/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl",
      component: "dispatcher",
      command: "status",
      args: ["--json"],
      timeoutMs: 100,
      spawnImpl: fakeSpawnFactory({
        stdout: `${JSON.stringify({ ok: status === "running", status, activeRoot: "/Users/admin/phonefarm-worker-current", runtimeCommit: "88f7f0a" })}\n`,
      }),
      fsImpl: executableFs,
    });
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, status);
    assert.equal(parsed.activeRoot, "/Users/admin/phonefarm-worker-current");
    assert.equal(parsed.runtimeCommit, "88f7f0a");
  }
});
