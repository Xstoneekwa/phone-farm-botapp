import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import {
  AUTO_RESTART_DECISIONS_NOTE,
  RESUME_PLAN_MISSING_EXPLANATION,
  buildAccountAutoRestartStatusRows,
  isResumePlanMissingDecision,
  preflightBlockedOperatorLabel,
  preflightKeyguardContext,
} from "./scheduler-status.ts";
import { socialBadge } from "./profiles/profile-growth-badge.ts";

test("Daily Scheduler and Auto Restart sections are separated in the view", async () => {
  const { readFileSync } = await import("node:fs");
  const schedulerViewSource = readFileSync(new URL("./Scheduler.tsx", import.meta.url), "utf8");
  assert.match(schedulerViewSource, /Daily Scheduler Pipeline/);
  assert.match(schedulerViewSource, /Scheduled run pipeline — preflight → account session/);
  assert.match(schedulerViewSource, /Auto Restart Engine/);
  assert.match(schedulerViewSource, /Auto Restart decisions only — not scheduled run attempts/);
  assert.match(schedulerViewSource, /Account Auto Restart status/);
  assert.match(schedulerViewSource, /Recent Auto Restart decisions/);
  assert.match(schedulerViewSource, /Last daily cron/);
  assert.match(schedulerViewSource, /Last Auto Restart tick/);
});

test("account auto restart status shows every active scheduled account once", () => {
  const status = {
    recent_decisions: [
      {
        account_id: "acc-1",
        username: "i_m_your_traker",
        action: "auto_restart_candidate_evaluated",
        decision: "blocked",
        reason: "worker_plan:resume_plan_missing",
        reason_code: "resume_plan_missing",
        created_at: "2026-07-10T08:00:00Z",
      },
      {
        account_id: "acc-1",
        username: "i_m_your_traker",
        action: "auto_restart_candidate_evaluated",
        decision: "blocked",
        reason: "worker_plan:resume_plan_missing",
        reason_code: "resume_plan_missing",
        created_at: "2026-07-10T07:00:00Z",
      },
    ],
    daily_scheduler_pipeline: {
      accounts: [
        {
          account_id: "acc-1",
          username: "i_m_your_traker",
          pipeline_status: "account_session_failed",
          account_session: { exists: true, status: "failed" },
          account_session_absent_reason: null,
        },
        {
          account_id: "acc-2",
          username: "mythyl_fitness",
          pipeline_status: "waiting_for_window",
          account_session: { exists: false, status: null },
          account_session_absent_reason: "no session in window",
        },
      ],
    },
  };
  const rows = buildAccountAutoRestartStatusRows(status);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].username, "i_m_your_traker");
  assert.equal(rows[0].decision_count, 2);
  assert.equal(rows[1].username, "mythyl_fitness");
  assert.equal(rows[1].restart_state, "not_needed");
  assert.equal(rows[1].reason, "No restart decision needed");
});

test("resume_plan_missing is labeled as Auto Restart noise", () => {
  const decision = {
    account_id: "acc-1",
    username: "i_m_your_traker",
    action: "auto_restart_candidate_evaluated",
    decision: "blocked",
    reason: "worker_plan:resume_plan_missing",
    reason_code: "resume_plan_missing",
    created_at: "2026-07-10T08:00:00Z",
  };
  assert.equal(isResumePlanMissingDecision(decision), true);
  assert.equal(RESUME_PLAN_MISSING_EXPLANATION.includes("Not a scheduled run failure"), true);
  assert.equal(AUTO_RESTART_DECISIONS_NOTE.includes("resume decisions"), true);
});

test("preflight blocked labels use exact reason codes", () => {
  assert.equal(
    preflightBlockedOperatorLabel({ status: "preflight_blocked", reason_code: "device_locked" }),
    "Preflight blocked · device locked",
  );
  assert.equal(
    preflightBlockedOperatorLabel({ status: "preflight_blocked", reason_code: "device_locked_requires_operator" }),
    "Preflight blocked · secure lock requires operator",
  );
  assert.equal(
    preflightBlockedOperatorLabel({ status: "preflight_blocked", reason_code: "login_screen_detected" }),
    "Preflight blocked · login screen detected",
  );
  assert.equal(preflightBlockedOperatorLabel({ status: "preflight_ready", reason_code: null }), "Preflight ready");
});

test("device keyguard context is surfaced for operators", () => {
  const context = preflightKeyguardContext({
    screen_type: "device_keyguard",
    unlock_result: "secure_lock_required",
  });
  assert.match(context || "", /Android lock screen detected/);
  assert.match(context || "", /operator action needed/);
});

test("profiles badge no longer maps scheduler_launch_blocked to growth waiting slot", () => {
  const profile = {
    loginStatus: "connected",
    eligibility: "blocked_now",
    eligibilityReason: "scheduler_launch_blocked",
    eligibilityDetail: {
      status: "blocked_now",
      primary_block_reason: "scheduler_launch_blocked",
      reason_label: "scheduler launch blocked",
      reason_description: "",
    },
  };
  const badge = socialBadge(profile);
  assert.equal(badge.label, "connected · scheduler blocked");
});

test("operator review dashboard blocker is not shown as social reason required", () => {
  const badge = socialBadge({
    loginStatus: "connected",
    eligibility: "blocked_now",
    eligibilityReason: "operator_review_required",
    eligibilityDetail: {
      status: "blocked_now",
      primary_block_reason: "operator_review_required",
      reason_label: "operator review required",
      reason_description: "",
    },
  });
  assert.equal(badge.label, "operator review required");
});

test("connected account outside window does not show growth ready", () => {
  const profile = {
    loginStatus: "connected",
    eligibility: "blocked_now",
    eligibilityReason: "assignment_window_closed",
    eligibilityDetail: {
      status: "blocked_now",
      primary_block_reason: "assignment_window_closed",
      reason_label: "outside window",
      reason_description: "",
    },
  };
  const badge = socialBadge(profile);
  assert.equal(badge.label, "connected · waiting for slot");
});

test("copy diagnostics includes daily pipeline and auto restart note", async () => {
  const { readFileSync } = await import("node:fs");
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /daily_scheduler/);
  assert.match(appSource, /auto_restart/);
  assert.match(appSource, /scheduler\?\.status/);
});
