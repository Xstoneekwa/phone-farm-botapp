import { useMemo, useState } from "react";
import type { BotProfile, ProfileAutoLoginProgressStep, ProfileAutoLoginState } from "../../api/types";
import { Button } from "../../design/components";
import { copyableProcessLog } from "./auto-login-flow";

function stepStatusLabel(status: ProfileAutoLoginProgressStep["status"]) {
  if (status === "done") return "Done";
  if (status === "running") return "Running...";
  if (status === "failed") return "Failed";
  if (status === "action_required") return "Action required";
  if (status === "skipped") return "Skipped";
  return "Pending";
}

function globalStatusLabel(state: ProfileAutoLoginState) {
  if (state.globalStatus === "completed") return "Completed";
  if (state.globalStatus === "action_required") return "Action required";
  if (state.globalStatus === "starting") return "Starting";
  if (state.globalStatus === "queued") return "Queued";
  if (state.globalStatus === "claimed") return "Claimed by dispatcher";
  if (state.globalStatus === "stopped") return "Stopped";
  if (state.globalStatus === "blocked") return "Blocked";
  if (state.globalStatus === "failed") return "Failed";
  return "Running";
}

export function AutoLoginFlowModal({
  profile,
  state,
  onOpenPhone,
  onCheckLogin,
  onRetryAutoLogin,
  onStop,
  onClose,
}: {
  profile: BotProfile;
  state: ProfileAutoLoginState;
  onOpenPhone: () => Promise<void> | void;
  onCheckLogin: () => Promise<void> | void;
  onRetryAutoLogin: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [copyLabel, setCopyLabel] = useState("Copy log");

  const logText = useMemo(() => copyableProcessLog(state.processLog), [state.processLog]);
  const actionRequired = state.globalStatus === "action_required" || Boolean(state.challenge);
  const canStop = ["queued", "claimed", "running", "starting"].includes(state.globalStatus);

  async function copyLog() {
    await navigator.clipboard.writeText(logText);
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy log"), 1300);
  }

  return (
    <div className="auto-login-backdrop" role="presentation">
      <div className="auto-login-modal" role="dialog" aria-modal="true" aria-labelledby="auto-login-progress-title">
        <header className="auto-login-header">
          <div>
            <span>{profile.platform}</span>
            <h3 id="auto-login-progress-title">@{state.username} · Auto Login</h3>
            <p>{state.deviceLabel} · {profile.activeWindow}</p>
          </div>
          <div className={`auto-login-global status-${state.globalStatus}`}>{globalStatusLabel(state)}</div>
        </header>

        <section className="auto-login-progress-card" aria-label="Progress">
          <h4>Real backend request</h4>
          <div className="auto-login-run-summary">
            <span>request_id</span><code>{state.requestId ?? "pending"}</code>
            <span>request_status</span><code>{state.requestStatus ?? state.globalStatus}</code>
            <span>run_id</span><code>{state.runId ?? "not linked yet"}</code>
            <span>reason</span><code>{state.safeReason ?? "none"}</code>
          </div>
          <div className="auto-login-step-list">
            {state.steps.map((step) => (
              <div key={step.id} className={`auto-login-step step-${step.status}`}>
                <span className="auto-login-step-icon" aria-hidden="true" />
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
                <em>{stepStatusLabel(step.status)}</em>
              </div>
            ))}
          </div>
        </section>

        {actionRequired ? (
          <section className="auto-login-action-required" aria-label="Action required">
            <strong>Instagram requires a code or confirmation.</strong>
            <span>Open the phone and complete it manually in Instagram. Do not use the web dashboard for this step.</span>
            <span>{state.challenge?.help_text ?? state.safeReason ?? "Complete the Instagram prompt on the assigned phone, then run Check Login or Retry Auto Login."}</span>
          </section>
        ) : null}

        <section className="auto-login-log-section" aria-label="Process log">
          <div className="auto-login-section-title">
            <h4>Process log</h4>
            <Button variant="ghost" onClick={() => void copyLog()}>{copyLabel}</Button>
          </div>
          <pre className="auto-login-process-log">{logText}</pre>
        </section>

        <div className="auto-login-footer">
          <span>Real BotApp relay request. No social action is requested by this login_provisioning flow.</span>
          <div className="auto-login-footer-actions">
            <Button variant="ghost" onClick={() => void onOpenPhone()}>Open Phone</Button>
            <Button variant="secondary" onClick={() => void onCheckLogin()}>Check Login</Button>
            <Button variant="secondary" onClick={() => void onRetryAutoLogin()}>Retry Auto Login</Button>
            {canStop ? <Button variant="danger" onClick={() => void onStop()}>Stop</Button> : null}
          </div>
          <Button onClick={onClose}>{state.globalStatus === "completed" ? "Done" : "Close"}</Button>
        </div>
      </div>
    </div>
  );
}
