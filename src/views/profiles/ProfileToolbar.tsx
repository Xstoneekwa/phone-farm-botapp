import type { BotProfile, ProfileToolbarAction, ProfileRequirementState } from "../../api/types";

const toolbarActions: Array<{ id: ProfileToolbarAction; label: string; danger?: boolean }> = [
  { id: "stats", label: "Stats" },
  { id: "logs", label: "Logs / History" },
  { id: "targets", label: "Targets" },
  { id: "play", label: "Start" },
  { id: "auto_login", label: "Auto Login" },
  { id: "check_readiness", label: "Check Login" },
  { id: "stop", label: "Stop", danger: true },
  { id: "settings", label: "Settings" },
  { id: "filters", label: "Filters" },
  { id: "assign_now", label: "Assign Now" },
  { id: "archive", label: "Archive", danger: true },
  { id: "delete", label: "Delete", danger: true },
];

function Icon({ action }: { action: ProfileToolbarAction }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4 };
  if (action === "stats") return <svg {...common}><path d="M2 12V8M6 12V5M10 12V7M14 12V3" strokeLinecap="round" /></svg>;
  if (action === "logs") return <svg {...common}><path d="M3 4h10M3 8h7M3 12h8" strokeLinecap="round" /><path d="M12 11l2 1-2 1v-2z" /></svg>;
  if (action === "targets") return <svg {...common}><circle cx="8" cy="8" r="5.2" /><circle cx="8" cy="8" r="2" /><path d="M8 1.4v2M8 12.6v2M1.4 8h2M12.6 8h2" strokeLinecap="round" /></svg>;
  if (action === "play") return <svg {...common}><path d="M6 4l7 4-7 4V4z" fill="currentColor" stroke="none" /></svg>;
  if (action === "auto_login") return <svg {...common}><path d="M4 5a4 4 0 1 1 0 6" /><path d="M1.5 8h7M6 5.5 8.5 8 6 10.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (action === "check_readiness") return <svg {...common}><path d="M3 8.5 6.2 12 13 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M2.5 4.5h4M2.5 12.5h3" strokeLinecap="round" /></svg>;
  if (action === "stop") return <svg {...common}><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2" fill="currentColor" stroke="none" /></svg>;
  if (action === "settings") return <svg {...common} strokeLinejoin="round"><path d="M8 2.1 9.1 3l1.4-.3.9 1.5-.5 1.3.9 1.1v1.8l-.9 1.1.5 1.3-.9 1.5-1.4-.3-1.1.9-1.1-.9-1.4.3-.9-1.5.5-1.3-.9-1.1V6.6l.9-1.1-.5-1.3.9-1.5 1.4.3L8 2.1z" /><circle cx="8" cy="8" r="2.1" /></svg>;
  if (action === "filters") return <svg {...common}><path d="M2 3h12l-4.5 5.2V13l-3-1.5V8.2L2 3z" /></svg>;
  if (action === "assign_now") return <svg {...common}><circle cx="5.5" cy="5" r="2" /><path d="M2.5 12c.6-2 1.7-3 3-3s2.4 1 3 3" /><path d="M11 5v6M8 8h6" strokeLinecap="round" /></svg>;
  if (action === "archive") return <svg {...common}><path d="M2.8 4.2h10.4l-.7 2H3.5l-.7-2z" /><path d="M3.8 6.2h8.4v6.2a1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1V6.2z" /><path d="M6.5 8.5h3" strokeLinecap="round" /></svg>;
  if (action === "delete") return <svg {...common}><path d="M4 5h8M6 5V3h4v2M5 7l.5 6h5L11 7" /><path d="M7 8.5v3M9 8.5v3" strokeLinecap="round" /></svg>;
  return <svg {...common}><path d="M4 4h9l-1 2H5L4 4zM5 7h7l-1 2H6L5 7zM6 10h5l-1 2H7L6 10z" /><path d="M3 13h2M3 4v9" /></svg>;
}

function disabledReason(profile: BotProfile, action: ProfileToolbarAction): ProfileRequirementState | null {
  if (action === "auto_login" && !profile.autoLoginRequirement.enabled) return profile.autoLoginRequirement;
  if (action === "assign_now" && !profile.assignNowRequirement.enabled) return profile.assignNowRequirement;
  return null;
}

function runControlDisabledReason(profile: BotProfile, action: ProfileToolbarAction) {
  void profile;
  void action;
  return null;
}

function tooltipText(profile: BotProfile, action: ProfileToolbarAction, label: string) {
  const requirementReason = disabledReason(profile, action);
  const runControlReason = runControlDisabledReason(profile, action);
  if (runControlReason) return `${label} · ${runControlReason}`;
  if (requirementReason) return `${label} · ${requirementReason.label}: ${requirementReason.detail}`;
  if (action === "play") return "Reactivate account status through secure BotApp relay. Does not start a run.";
  if (action === "check_readiness") return "Check login/readiness now without starting a Growth session.";
  if (action === "stop") return "Pause account status through secure BotApp relay. Does not stop worker runtime.";
  return label;
}

export function ProfileToolbar({ profile, onAction }: { profile: BotProfile; onAction: (action: ProfileToolbarAction) => void }) {
  return (
    <div className="profile-toolbar" role="toolbar" aria-label="Profile actions">
      {toolbarActions.map((item) => {
        const disabled = Boolean(disabledReason(profile, item.id) || runControlDisabledReason(profile, item.id));
        return (
          <span
            key={item.id}
            className="tooltip-wrap"
            data-tooltip={tooltipText(profile, item.id, item.label)}
          >
            <button
              type="button"
              className={`profile-toolbar-btn${item.danger ? " danger" : ""}`}
              aria-label={item.label}
              disabled={disabled}
              onClick={() => onAction(item.id)}
            >
              <Icon action={item.id} />
            </button>
          </span>
        );
      })}
    </div>
  );
}
