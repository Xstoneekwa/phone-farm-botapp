import type { RouteId } from "../app/routes";
import { routes } from "../app/routes";
import { Button } from "../design/components";

export function TopBar({ active, onCommand }: { active: RouteId; onCommand: () => void }) {
  const route = routes.find((item) => item.id === active);
  return <header className="topbar">
    <div><span className="crumb">BotApp / {route?.group}</span><h1>{route?.label}</h1></div>
    <div className="topbar-actions"><Button variant="secondary" onClick={onCommand}>Command palette</Button></div>
  </header>;
}
