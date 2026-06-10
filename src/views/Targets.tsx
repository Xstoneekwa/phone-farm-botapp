import { Badge, Button, Card, Table, Td, Th, TRow } from "../design/components";
import type { Target } from "../api/types";

export function Targets({ targets, onAction }: { targets: Target[]; onAction: (action: string, target: string, danger?: boolean) => void }) {
  return <Card title="Targets / CT" subtitle="Curated target sources with quality scores. Archive prepares the admin contract only.">
    <Table><thead><tr><Th>Handle</Th><Th>Source</Th><Th>Quality</Th><Th>Status</Th><Th>Notes</Th><Th>Actions</Th></tr></thead><tbody>{targets.map((target) => <TRow key={target.id}><Td mono>{target.handle}</Td><Td>{target.source}</Td><Td>{target.qualityScore}</Td><Td><Badge tone={target.status === "approved" ? "success" : target.status === "review" ? "warning" : "neutral"}>{target.status}</Badge></Td><Td>{target.notes}</Td><Td><Button onClick={() => onAction("Archive target", target.handle, true)}>Archive</Button></Td></TRow>)}</tbody></Table>
  </Card>;
}
