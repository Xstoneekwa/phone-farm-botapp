import type { RouteId } from "../app/routes";
import { routes } from "../app/routes";
import { Badge } from "../design/components";

export function Sidebar({ active, onNavigate, counts }: { active: RouteId; onNavigate: (route: RouteId) => void; counts: { profiles: number; devices: number; notifications: number } }) {
  const groups = [...new Set(routes.map((route) => route.group))];
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">B</div><div><strong>BotApp</strong><span>Phone Farm OS</span></div><i /></div>
    <nav>
      {groups.map((group) => <div key={group} className="nav-group"><div className="nav-label">{group}</div>
        {routes.filter((route) => route.group === group).map((route) => <button key={route.id} className={active === route.id ? "active" : ""} onClick={() => onNavigate(route.id)}>
          <span>{route.label}</span>
          {route.id === "profiles" ? <Badge tone="success">{counts.profiles}</Badge> : null}
          {route.id === "devices" ? <Badge tone="info">{counts.devices}</Badge> : null}
          {route.id === "notifications" ? <Badge tone="warning">{counts.notifications}</Badge> : null}
        </button>)}
      </div>)}
    </nav>
    <div className="operator"><div className="avatar">D</div><div><strong>Default</strong><span>Mock operator</span></div></div>
  </aside>;
}
