import { Badge, Card, Table, Td, Th, TRow } from "../design/components";
import type { ActivityLogEntry } from "../api/types";
import { redactText } from "../security/redaction";

export function ActivityLog({ logs }: { logs: ActivityLogEntry[] }) {
  return <Card title="Activity Log / Audit" subtitle="Local audit stream. Raw sensitive fields are redacted before rendering.">
    <Table><thead><tr><Th>Timestamp</Th><Th>Level</Th><Th>Actor</Th><Th>Event</Th><Th>Target</Th><Th>Detail</Th></tr></thead><tbody>{logs.map((log) => <TRow key={log.id}><Td mono>{log.timestamp}</Td><Td><Badge tone={log.level === "error" || log.level === "critical" ? "error" : log.level === "warning" ? "warning" : "info"}>{log.level}</Badge></Td><Td>{redactText(log.actor)}</Td><Td mono>{log.event}</Td><Td>{redactText(log.target)}</Td><Td>{redactText(log.detail)}</Td></TRow>)}</tbody></Table>
  </Card>;
}
