import { Badge, Button, Card } from "../design/components";
import type { NotificationItem } from "../api/types";
import { redactText } from "../security/redaction";

export function Notifications({ notifications, onAction }: { notifications: NotificationItem[]; onAction: (action: string, target: string, danger?: boolean) => void }) {
  return <div className="grid">{notifications.map((item) => <Card key={item.id} title={item.title} subtitle={item.createdAt} actions={<Badge tone={item.severity === "critical" ? "error" : item.severity === "warning" ? "warning" : "info"}>{item.severity}</Badge>}>
    <p>{redactText(item.message)}</p><div className="button-row"><Button onClick={() => onAction("Acknowledge notification", item.title)}>Acknowledge</Button><Button onClick={() => onAction("Resolve notification", item.title, true)}>Resolve</Button></div>
  </Card>)}</div>;
}
