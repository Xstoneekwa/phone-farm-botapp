import { Badge, Button, Card, Td, Th, TRow, Table } from "../design/components";
import { redactText } from "../security/redaction";
import type { ActivityLogEntry, BotProfile, Device, NotificationItem } from "../api/types";

export function Overview({ profiles, devices, notifications, logs, onAction }: { profiles: BotProfile[]; devices: Device[]; notifications: NotificationItem[]; logs: ActivityLogEntry[]; onAction: (action: string, target: string, danger?: boolean) => void }) {
  const running = profiles.filter((profile) => profile.status === "running").length;
  const online = devices.filter((device) => device.status === "connected" || device.status === "online" || device.status === "reserved").length;
  const blocked = profiles.filter((profile) => profile.eligibility === "blocked_now").length;
  return <div className="grid" style={{ gap: 16 }}>
    <div className="grid metrics">
      <Card><span className="subtle">Active profiles</span><div className="metric-value">{running}</div><span className="subtle">{profiles.length} loaded locally</span></Card>
      <Card><span className="subtle">Devices online</span><div className="metric-value">{online}</div><span className="subtle">{devices.length} registered phones</span></Card>
      <Card><span className="subtle">Start blocked now</span><div className="metric-value">{blocked}</div><span className="subtle">Runtime eligibility, not config readiness</span></Card>
      <Card><span className="subtle">Security mode</span><div className="metric-value">Local</div><span className="subtle">Secure relay not connected</span></Card>
    </div>
    <div className="grid two">
      <Card title="Action Required" subtitle="Ready config can still be blocked by runtime gates." actions={<Button variant="danger" onClick={() => onAction("Stop all accounts", "all profiles", true)}>Stop all accounts</Button>}>
        {notifications.filter((item) => !item.acknowledged).map((item) => <div key={item.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: "1px solid #F0F0EE" }}>
          <Badge tone={item.severity === "critical" ? "error" : "warning"}>{item.severity}</Badge><div><strong>{item.title}</strong><div className="subtle">{redactText(item.message)}</div></div>
        </div>)}
      </Card>
      <Card title="Device-level UI locks" subtitle="1 phone = 1 active UI session, even with multiple clones.">
        <Table><thead><tr><Th>Device</Th><Th>Status</Th><Th>Active UI session</Th></tr></thead><tbody>{devices.map((device) => <TRow key={device.id}><Td>{device.name}</Td><Td><Badge tone={device.status === "offline" ? "error" : device.status === "maintenance" ? "warning" : "success"}>{device.status}</Badge></Td><Td>{device.activeSession ? <span className="mono">{device.activeSession.username}</span> : <span className="subtle">none</span>}</Td></TRow>)}</tbody></Table>
      </Card>
    </div>
    <Card title="Recent activity" subtitle="All details pass through redaction before display.">
      <Table><thead><tr><Th>Time</Th><Th>Level</Th><Th>Event</Th><Th>Detail</Th></tr></thead><tbody>{logs.slice(0, 5).map((log) => <TRow key={log.id}><Td mono>{log.timestamp}</Td><Td><Badge tone={log.level === "error" ? "error" : log.level === "warning" ? "warning" : "info"}>{log.level}</Badge></Td><Td mono>{log.event}</Td><Td>{redactText(log.detail)}</Td></TRow>)}</tbody></Table>
    </Card>
  </div>;
}
