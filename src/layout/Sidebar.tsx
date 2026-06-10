import type { RouteId } from "../app/routes";
import { routes } from "../app/routes";
import { Badge } from "../design/components";

const navIcons: Record<RouteId, string> = {
  overview: "⌁",
  profiles: "◎",
  account: "◉",
  devices: "▣",
  activity: "⌘",
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
