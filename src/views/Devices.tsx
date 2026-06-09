import { Badge, Button, Card } from "../design/components";
import type { Device } from "../api/types";

export function Devices({ devices, onAction }: { devices: Device[]; onAction: (action: string, target: string, danger?: boolean) => void }) {
  return <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>{devices.map((device) => <Card key={device.id} title={device.name} subtitle={device.model} actions={<Badge tone={device.status === "offline" ? "error" : device.status === "maintenance" ? "warning" : "success"}>{device.status}</Badge>}>
    <div className="device-card"><div><span className="subtle">Battery</span><strong>{device.battery}%</strong></div><div><span className="subtle">Clones</span><strong>{device.cloneCount}</strong></div><div><span className="subtle">Lock</span><strong>{device.lockReason ?? "none"}</strong></div></div>
    <p className="subtle">Active UI session: {device.activeSession ? <span className="mono">{device.activeSession.username}</span> : "none"}</p>
    <Button variant="danger" onClick={() => onAction("Restart phone", device.name, true)}>Restart phone</Button>
  </Card>)}</div>;
}
