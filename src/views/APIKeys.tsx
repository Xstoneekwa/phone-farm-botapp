import { Badge, Button, Card, Table, Td, Th, TRow } from "../design/components";
import type { ApiKeySummary, WebhookSummary } from "../api/types";
import { futureApiConventions } from "../api/botapp-client";
import { redactText } from "../security/redaction";

export function APIKeys({ apiKeys, webhooks, onAction }: { apiKeys: ApiKeySummary[]; webhooks: WebhookSummary[]; onAction: (action: string, target: string, danger?: boolean) => void }) {
  return <div className="grid">
    <Card title="Future API conventions" subtitle="Documented only. This UI does not call a backend.">
      <div className="api-grid">{Object.entries(futureApiConventions).map(([key, value]) => <div key={key}><span className="subtle">{key}</span><code>{redactText(value)}</code></div>)}</div>
    </Card>
    <Card title="API Keys" subtitle="Prefixes only. Full keys are never displayed."><Table><thead><tr><Th>Name</Th><Th>Prefix</Th><Th>Scopes</Th><Th>Status</Th><Th>Actions</Th></tr></thead><tbody>{apiKeys.map((key) => <TRow key={key.id}><Td>{key.name}</Td><Td mono>{redactText(key.prefix)}</Td><Td>{key.scopes.join(", ")}</Td><Td><Badge tone={key.status === "active" ? "success" : "neutral"}>{key.status}</Badge></Td><Td><Button onClick={() => onAction("Generate API key", key.name, true)}>Generate</Button> <Button variant="danger" onClick={() => onAction("Revoke API key", key.name, true)}>Revoke</Button></Td></TRow>)}</tbody></Table></Card>
    <Card title="Webhooks" subtitle="Endpoints use safe example domains."><Table><thead><tr><Th>URL</Th><Th>Events</Th><Th>Status</Th><Th>Delivery</Th><Th>Actions</Th></tr></thead><tbody>{webhooks.map((hook) => <TRow key={hook.id}><Td mono>{redactText(hook.url)}</Td><Td>{hook.events.join(", ")}</Td><Td><Badge tone={hook.status === "active" ? "success" : "neutral"}>{hook.status}</Badge></Td><Td>{hook.lastDeliveryStatus}</Td><Td><Button onClick={() => onAction("Save webhook", hook.url)}>Save</Button> <Button onClick={() => onAction("Retry webhook delivery", hook.url)}>Retry</Button></Td></TRow>)}</tbody></Table></Card>
  </div>;
}
