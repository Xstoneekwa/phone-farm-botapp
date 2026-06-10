import { useEffect, useMemo, useState } from "react";
import type { BotProfile, ProfileAutoLoginProgressStep, ProfileAutoLoginState } from "../../api/types";
import { Button } from "../../design/components";
import {
  advanceAutoLoginState,
  buildAutoLoginCodePayload,
  cancelAutoLoginChallenge,
  copyableProcessLog,
  resumeAutoLoginAfterCode,
} from "./auto-login-flow";

function stepStatusLabel(status: ProfileAutoLoginProgressStep["status"]) {
  if (status === "done") return "Done";
  if (status === "running") return "Running...";
  if (status === "failed") return "Failed";
  return "Pending";
}

function globalStatusLabel(state: ProfileAutoLoginState) {
  if (state.globalStatus === "completed") return "Completed";
  if (state.globalStatus === "code_required") return "Code required";
  if (state.globalStatus === "blocked") return "Blocked";
  if (state.globalStatus === "failed") return "Failed";
  return "Running";
}

function challengeCodeLabel(type: NonNullable<ProfileAutoLoginState["challenge"]>["code_type"]) {
  if (type === "2fa" || type === "authenticator") return "Two-factor authentication required";
  if (type === "checkpoint") return "Checkpoint required";
  return "Code required";
}

export function AutoLoginFlowModal({
  profile,
  state,
  onStateChange,
  onClose,
}: {
  profile: BotProfile;
  state: ProfileAutoLoginState;
  onStateChange: (state: ProfileAutoLoginState) => void;
  onClose: () => void;
}) {
  const [copyLabel, setCopyLabel] = useState("Copy log");

  useEffect(() => {
    if (state.globalStatus !== "running") return undefined;
    const timer = window.setTimeout(() => {
      onStateChange(advanceAutoLoginState(state, profile));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [onStateChange, profile, state]);

  const logText = useMemo(() => copyableProcessLog(state.processLog), [state.processLog]);

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
          <h4>Progress</h4>
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

        <section className="auto-login-log-section" aria-label="Process log">
          <div className="auto-login-section-title">
            <h4>Process log</h4>
            <Button variant="ghost" onClick={() => void copyLog()}>{copyLabel}</Button>
          </div>
          <pre className="auto-login-process-log">{logText}</pre>
        </section>

        <div className="auto-login-footer">
          <span>Prepared for the future secure BotApp relay. No device action is executed from this screen.</span>
          <Button onClick={onClose}>{state.globalStatus === "completed" ? "Done" : "Close"}</Button>
        </div>

        {state.challenge ? (
          <AutoLoginCodeModal
            state={state}
            onCancel={() => onStateChange(cancelAutoLoginChallenge(state))}
            onSubmit={() => onStateChange(resumeAutoLoginAfterCode(state))}
          />
        ) : null}
      </div>
    </div>
  );
}

function AutoLoginCodeModal({
  state,
  onCancel,
  onSubmit,
}: {
  state: ProfileAutoLoginState;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const challenge = state.challenge;
  if (!challenge) return null;
  const activeChallenge = challenge;

  function submitCode() {
    const cleanCode = code.trim();
    if (!/^[A-Za-z0-9-]{4,32}$/.test(cleanCode)) {
      setError("Enter a valid verification code.");
      return;
    }
    setSubmitting(true);
    setError("");
    const payload = buildAutoLoginCodePayload(activeChallenge, cleanCode);
    void payload;
    window.setTimeout(() => {
      setSubmitting(false);
      setCode("");
      onSubmit();
    }, 450);
  }

  return (
    <div className="auto-login-code-backdrop" role="presentation">
      <div className="auto-login-code-modal" role="dialog" aria-modal="true" aria-labelledby="auto-login-code-title">
        <header>
          <span>{challengeCodeLabel(activeChallenge.code_type)}</span>
          <h4 id="auto-login-code-title">Enter verification code</h4>
          <p>@{activeChallenge.account_username} · {activeChallenge.help_text}</p>
        </header>
        <label className="auto-login-code-field">
          Verification code
          <input
            className="input"
            value={code}
            inputMode="text"
            autoComplete="one-time-code"
            onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 32))}
            placeholder="Enter code"
          />
        </label>
        <p className="auto-login-code-hint">The code is not added to the process log and is not retained in profile data.</p>
        {error ? <p className="auto-login-code-error">{error}</p> : null}
        <div className="auto-login-code-actions">
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button onClick={submitCode} disabled={submitting}>{submitting ? "Submitting..." : "Submit code"}</Button>
        </div>
      </div>
    </div>
  );
}
