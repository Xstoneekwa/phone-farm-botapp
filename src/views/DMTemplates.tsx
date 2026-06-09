import { Badge, Button, Card, Table, Td, Th, TRow } from "../design/components";
import type { DmTemplate } from "../api/types";
import { redactText } from "../security/redaction";

export function DMTemplates({ templates, onAction }: { templates: DmTemplate[]; onAction: (action: string, target: string, danger?: boolean) => void }) {
  return <Card title="DM Templates" subtitle="Welcome and Outreach templates. Outreach remains add-on gated.">
    <Table><thead><tr><Th>Name</Th><Th>Type</Th><Th>Status</Th><Th>Reply rate</Th><Th>Body</Th><Th>Action</Th></tr></thead><tbody>{templates.map((template) => <TRow key={template.id}><Td>{template.name}</Td><Td><Badge tone={template.type === "welcome" ? "info" : "accent"}>{template.type}</Badge></Td><Td><Badge tone={template.status === "active" ? "success" : "neutral"}>{template.status}</Badge></Td><Td>{template.sent ? Math.round((template.replies / template.sent) * 100) : 0}%</Td><Td>{redactText(template.body)}</Td><Td><Button onClick={() => onAction("Save DM template", template.name)}>Save</Button></Td></TRow>)}</tbody></Table>
  </Card>;
}
