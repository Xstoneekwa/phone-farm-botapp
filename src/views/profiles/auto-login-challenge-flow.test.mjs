import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  autoLoginStateFromStartResult,
  createAutoLoginStartingState,
  mergeAutoLoginProgressSnapshot,
  sanitizeAutoLoginText,
} from "./auto-login-flow.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const profilesViewSource = readFileSync(resolve(currentDir, "ProfilesView.tsx"), "utf8");
const modalSource = readFileSync(resolve(currentDir, "AutoLoginFlowModal.tsx"), "utf8");
const autoLoginFlowSource = readFileSync(resolve(currentDir, "auto-login-flow.ts"), "utf8");
const credentialsSource = readFileSync(resolve(currentDir, "../Credentials.tsx"), "utf8");

const REQUEST_ID = "9566321d-bc00-422f-ae5a-edf712b569e8";
const RUN_ID = "08ef6e89-f9da-4dca-a8cc-d0a46ba7207b";
const ACTION_ID = "action-email-code-001";

function profile(overrides = {}) {
  return {
    id: "871c5836-0fb4-4afb-a5c7-b8bb3fc6b74c",
    username: "growth_with_bmb",
    platform: "Instagram",
    deviceName: "Pixel Farm 01",
    activeWindow: "09-18",
    twoFactorEnabled: false,
    ...overrides,
  };
}

function activeSnapshot(overrides = {}) {
  return {
    account_id: profile().id,
    request_id: REQUEST_ID,
    request_status: "running",
    requested_run_type: "login_provisioning",
    run_id: RUN_ID,
    run_status: "running",
    status: "running",
    reason: null,
    action_required: null,
    steps: [
      { id: "queue_request", label: "Queued", subtitle: "Request created", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "dispatcher_claim", label: "Claimed", subtitle: "Dispatcher claimed request", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "open_instagram", label: "Worker started", subtitle: "Opening Instagram", status: "running", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "enter_credentials", label: "Checking login", subtitle: "Submitting credentials", status: "running", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "save_login_status", label: "Result", subtitle: "Waiting for outcome", status: "pending", started_at: null, completed_at: null, metadata_safe: {} },
    ],
    process_log: [
      { id: "log-1", timestamp: "2026-06-24T12:00:10.000Z", phase: "worker", message: "Worker started login_provisioning." },
    ],
    generated_at: "2026-06-24T12:00:20.000Z",
    metadata_safe: {},
    ...overrides,
  };
}

function challengeSnapshot(overrides = {}) {
  return activeSnapshot({
    status: "action_required",
    reason: "email_verification_code_required",
    action_required: {
      id: ACTION_ID,
      action_type: "enter_email_verification_code",
      status: "pending_verification",
      title: "Email verification code required",
      message: "Instagram is waiting for an email verification code.",
    },
    process_log: [
      { id: "log-1", timestamp: "2026-06-24T12:00:10.000Z", phase: "worker", message: "Worker started login_provisioning." },
      { id: "log-2", timestamp: "2026-06-24T12:00:40.000Z", phase: "verification", message: "Email verification challenge detected after post-submit observation." },
    ],
    ...overrides,
  });
}

test("Auto Login starts with an active backend request", () => {
  const botProfile = profile();
  const starting = createAutoLoginStartingState(botProfile);
  assert.equal(starting.globalStatus, "starting");
  assert.equal(starting.challenge, null);

  const queued = autoLoginStateFromStartResult(botProfile, {
    request_id: REQUEST_ID,
    status: "queued",
    run_id: RUN_ID,
    message: "Login provisioning queued.",
  });
  assert.equal(queued.requestId, REQUEST_ID);
  assert.equal(queued.requestStatus, "queued");
  assert.equal(queued.runId, RUN_ID);
  assert.equal(queued.challenge, null);
});

test("delayed challenge moves BotApp modal to action_required with verification UI", () => {
  const botProfile = profile();
  const queued = autoLoginStateFromStartResult(botProfile, {
    request_id: REQUEST_ID,
    status: "running",
    run_id: RUN_ID,
  });
  const running = mergeAutoLoginProgressSnapshot(queued, activeSnapshot());
  assert.equal(running.globalStatus, "running");
  assert.equal(running.requestId, REQUEST_ID);

  const challenged = mergeAutoLoginProgressSnapshot(running, challengeSnapshot());
  assert.equal(challenged.globalStatus, "action_required");
  assert.equal(challenged.requestId, REQUEST_ID);
  assert.equal(challenged.challenge?.challenge_id, ACTION_ID);
  assert.equal(challenged.challenge?.code_type, "2fa");
  assert.match(modalSource, /actionRequired[\s\S]*action_required[\s\S]*challenge/);
});

test("closing BotApp Auto Login modal does not stop the backend request", () => {
  assert.match(profilesViewSource, /onClose=\{\(\) => setAutoLoginFlow\(null\)\}/);
  assert.doesNotMatch(profilesViewSource, /onClose=\{\(\) => stopAutoLogin/);
  assert.match(profilesViewSource, /stopAutoLogin\(autoLoginFlow\.profile\)/);
  assert.match(profilesViewSource, /progress\(\{ accountId, requestId \}\)/);
});

test("rehydrating BotApp Auto Login from runProgress restores the same challenge and request", () => {
  const botProfile = profile();
  const queued = autoLoginStateFromStartResult(botProfile, {
    request_id: REQUEST_ID,
    status: "running",
    run_id: RUN_ID,
  });
  const challenged = mergeAutoLoginProgressSnapshot(queued, challengeSnapshot());
  const closedState = null;
  assert.equal(closedState, null);

  const reopened = mergeAutoLoginProgressSnapshot(
    autoLoginStateFromStartResult(botProfile, {
      request_id: REQUEST_ID,
      status: "running",
      run_id: RUN_ID,
    }),
    challengeSnapshot(),
  );
  assert.equal(reopened.requestId, REQUEST_ID);
  assert.equal(reopened.challenge?.challenge_id, ACTION_ID);
  assert.equal(reopened.globalStatus, "action_required");
  assert.equal(challenged.requestId, reopened.requestId);
});

test("BotApp verification code submit uses canonical write-only relay contract", () => {
  assert.match(credentialsSource, /submit_verification_code/);
  assert.match(credentialsSource, /\/api\/instagram-dashboard\/dashboard-actions\/submit-verification-code/);
  assert.match(credentialsSource, /code_is_never_logged: true/);
  assert.match(credentialsSource, /The code is not logged or shown in the action payload preview/);
  assert.equal(credentialsSource.includes("verificationCode"), true);
  assert.equal(credentialsSource.includes("verification_code:"), false);
});

test("resume after code submission keeps the same login_provisioning request active", () => {
  const botProfile = profile();
  const queued = autoLoginStateFromStartResult(botProfile, {
    request_id: REQUEST_ID,
    status: "running",
    run_id: RUN_ID,
  });
  const resumeQueued = mergeAutoLoginProgressSnapshot(queued, challengeSnapshot({
    request_status: "running",
    status: "running",
    action_required: {
      id: ACTION_ID,
      action_type: "enter_email_verification_code",
      status: "code_submitted",
      title: "Email verification code required",
      message: "Code submitted. Login resume queued.",
    },
    process_log: [
      { id: "log-3", timestamp: "2026-06-24T12:01:10.000Z", phase: "verification", message: "Verification code submitted. Resume queued." },
    ],
  }));
  assert.equal(resumeQueued.requestId, REQUEST_ID);
  assert.equal(resumeQueued.requestStatus, "running");
});

test("terminal Auto Login failure stays failed and does not masquerade as verification", () => {
  const botProfile = profile();
  const queued = autoLoginStateFromStartResult(botProfile, {
    request_id: REQUEST_ID,
    status: "running",
    run_id: RUN_ID,
  });
  const failed = mergeAutoLoginProgressSnapshot(queued, activeSnapshot({
    status: "failed",
    reason: "worker_exit_nonzero",
    action_required: null,
  }));
  assert.equal(failed.globalStatus, "failed");
  assert.equal(failed.challenge, null);
  assert.equal(failed.nextAction, "retry_auto_login");
  assert.equal(failed.steps.find((step) => step.id === "result")?.status, "failed");
});

test("Auto Login retry is explicit and progress polling binds to the existing request id", () => {
  assert.match(profilesViewSource, /onRetryAutoLogin=\{\(\) => startAutoLogin\(autoLoginFlow\.profile\)\}/);
  assert.match(profilesViewSource, /const requestId = autoLoginFlow\.state\.requestId/);
  assert.match(autoLoginFlowSource, /requested_run_type: "login_provisioning"/);
  assert.match(profilesViewSource, /window\.botappDesktop\?\.profiles\?\.autoLogin/);
  assert.match(profilesViewSource, /previousState\.processLog/);
  assert.match(profilesViewSource, /Retry Auto Login requested after previous attempt/);
  assert.match(profilesViewSource, /Retry request accepted by backend/);
});

test("Auto Login progression redacts secrets and never emits an empty operator reason", () => {
  const redacted = sanitizeAutoLoginText("password=hunter2 token=abc code=123456");
  assert.match(redacted, /password=<redacted>/);
  assert.match(redacted, /token=<redacted>/);
  assert.match(redacted, /code=<redacted>/);
  assert.doesNotMatch(redacted, /hunter2|abc|123456/);
  assert.equal(sanitizeAutoLoginText("", "safe fallback"), "safe fallback");

  const queued = autoLoginStateFromStartResult(profile(), {
    request_id: REQUEST_ID,
    status: "running",
    run_id: RUN_ID,
  });
  const failed = mergeAutoLoginProgressSnapshot(queued, activeSnapshot({
    status: "failed",
    reason: "worker_exit_nonzero password=hunter2",
    process_log: [
      { id: "log-secret", timestamp: "2026-06-24T12:00:50.000Z", phase: "error", message: "verification_code=123456 rejected" },
    ],
  }));

  assert.equal(failed.globalStatus, "failed");
  assert.match(failed.safeReason ?? "", /password=<redacted>/);
  assert.doesNotMatch(failed.safeReason ?? "", /hunter2/);
  assert.equal(failed.processLog.some((entry) => /verification_code=<redacted>/.test(entry.message)), true);
});

test("Auto Login modal shows next action and failed-state retry copy", () => {
  assert.match(modalSource, /nextActionLabel/);
  assert.match(modalSource, /Retry Auto Login is available/);
  assert.match(modalSource, /No backend reason yet/);
  assert.match(modalSource, /Auto Login failed before connection was confirmed/);
});

test("stale-session replacement progress keeps canonical ordered stages", () => {
  const queued = autoLoginStateFromStartResult(profile({ username: "j_automatise_pour_toi" }), {
    request_id: REQUEST_ID,
    status: "running",
    run_id: RUN_ID,
  });
  const replaced = mergeAutoLoginProgressSnapshot(queued, activeSnapshot({
    status: "connected",
    reason: "stale_session_replacement_completed",
    steps: [
      { id: "queue_request", label: "Préparation du compte", subtitle: "Request created", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "dispatcher_claim", label: "Dispatcher", subtitle: "Dispatcher claimed request", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "open_instagram", label: "Ouverture Instagram", subtitle: "Opening Instagram", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "detect_different_account", label: "Compte Instagram différent détecté", subtitle: "Current session: @growth_with_bmb.", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "verify_clone_assignment", label: "Vérification de l’affectation du clone", subtitle: "Exact app instance verified.", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "verify_replacement_safety", label: "Vérification de la sécurité du remplacement", subtitle: "No protected ownership or active runtime.", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "detect_unassigned_account", label: "Compte non attribué détecté", subtitle: "Previous account is unmanaged.", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "controlled_logout_previous", label: "Déconnexion du compte précédent", subtitle: "Controlled logout completed.", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "login_target_account", label: "Connexion à @j_automatise_pour_toi", subtitle: "Target login completed.", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "verify_final_identity", label: "Vérification de l’identité finale", subtitle: "Target identity verified.", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
      { id: "save_login_status", label: "Connexion réussie", subtitle: "Login status saved.", status: "done", started_at: null, completed_at: null, metadata_safe: {} },
    ],
  }));

  assert.equal(replaced.globalStatus, "completed");
  assert.deepEqual(
    replaced.steps.map((step) => step.id),
    ["queued", "claimed", "worker", "stale_detected", "clone_assignment", "replacement_safety", "stale_account", "controlled_logout", "target_login", "login", "final_identity", "result"],
  );
  assert.equal(replaced.steps.find((step) => step.id === "controlled_logout")?.status, "done");
  assert.equal(replaced.steps.find((step) => step.id === "final_identity")?.status, "done");
  assert.doesNotMatch(replaced.processLog.map((entry) => entry.message).join("\n"), /password|token|verification_code=\d/i);
});

test("sixty second post-submit window does not alter BotApp Auto Login progression contract", () => {
  assert.doesNotMatch(profilesViewSource, /post_submit_timeout_ms|post-submit-timeout-ms|10000/);
  assert.doesNotMatch(autoLoginFlowSource, /post_submit_timeout_ms|post-submit-timeout-ms|10000/);
  assert.doesNotMatch(modalSource, /post_submit_timeout_ms|post-submit-timeout-ms|10000/);
  assert.match(profilesViewSource, /mergeAutoLoginProgressSnapshot/);
});
