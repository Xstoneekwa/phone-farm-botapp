import type { ReactNode } from "react";
import type { RouteId } from "../app/routes";
import { routes } from "../app/routes";
import { Badge } from "../design/components";

function DeviceNavIcon() {
  return (
    <svg className="nav-phone-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2.4" />
      <path d="M10.5 5.5h3" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

function ClientAccountsNavIcon() {
  return (
    <svg className="nav-users-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M20 20v-1.2a3 3 0 0 0-2.4-2.9" />
      <path d="M15.8 4.3a3.2 3.2 0 0 1 0 6.2" />
    </svg>
  );
}

function LockNavIcon() {
  return (
    <svg className="nav-lock-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10" width="13" height="10" rx="2.5" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
      <path d="M12 14v2.5" />
    </svg>
  );
}

function ActivityInvestigationNavIcon() {
  return (
    <svg className="nav-activity-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3.5h8l4 4V13" />
      <path d="M14 3.5v4h4" />
      <path d="M8 11h5" />
      <path d="M8 14h3" />
      <circle cx="15.5" cy="16.5" r="3" />
      <path d="m18 19 2.5 2.5" />
    </svg>
  );
}

const navIcons: Record<RouteId, ReactNode> = {
  overview: "⌁",
  profiles: "◎",
  account: <ClientAccountsNavIcon />,
  credentials: <LockNavIcon />,
  devices: <DeviceNavIcon />,
  activity: <ActivityInvestigationNavIcon />,
  targets: "◇",
  templates: "✉",
  notifications: "!",
  api: "{}",
  settings: "⚙",
};

export function Sidebar({ active, onNavigate, counts }: { active: RouteId; onNavigate: (route: RouteId) => void; counts: { profiles: number; devices: number; notifications: number } }) {
  const groups = [...new Set(routes.map((route) => route.group))];
  return <aside className="sidebar">
    <div className="brand" title="BotApp · Phone Farm OS" aria-label="BotApp · Phone Farm OS"><div className="brand-mark">B</div><div className="brand-copy"><strong>BotApp</strong><span>Phone Farm OS</span></div><i /></div>
    <nav>
      {groups.map((group) => <div key={group} className="nav-group"><div className="nav-label">{group}</div>
        {routes.filter((route) => route.group === group).map((route) => <button key={route.id} className={active === route.id ? "active" : ""} title={route.label} aria-label={route.label} onClick={() => onNavigate(route.id)}>
          <span className="nav-icon" aria-hidden="true">{navIcons[route.id]}</span>
          <span className="nav-tooltip">{route.label}</span>
          <span className="nav-badge">
            {route.id === "profiles" ? <Badge tone="success">{counts.profiles}</Badge> : null}
            {route.id === "devices" ? <Badge tone="info">{counts.devices}</Badge> : null}
            {route.id === "notifications" ? <Badge tone="warning">{counts.notifications}</Badge> : null}
          </span>
        </button>)}
      </div>)}
    </nav>
    <div className="operator" title="Default operator" aria-label="Default operator"><div className="avatar">D</div><div className="operator-copy"><strong>Default</strong><span>Operator</span></div></div>
  </aside>;
}
