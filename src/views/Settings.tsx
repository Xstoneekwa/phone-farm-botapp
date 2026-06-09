import { Button, Card, Toggle } from "../design/components";
import type { AppSettings } from "../api/types";

function SettingsSection({ title, rows }: { title: string; rows: Record<string, string | boolean | number> }) {
  return <Card title={title}>{Object.entries(rows).map(([key, value]) => <div key={key} className="settings-row"><div><strong>{key}</strong><span>Runtime editable state is read-only until API wiring is proven.</span></div>{typeof value === "boolean" ? <Toggle checked={value} disabled /> : <code>{String(value)}</code>}</div>)}</Card>;
}

export function Settings({ settings, onAction }: { settings: AppSettings; onAction: (action: string, target: string, danger?: boolean) => void }) {
  return <div className="grid two">
    <SettingsSection title="Business settings" rows={settings.business} />
    <SettingsSection title="Admin settings" rows={settings.admin} />
    <SettingsSection title="Ops safety caps" rows={settings.opsSafetyCaps} />
    <SettingsSection title="Kill switches" rows={settings.killSwitches} />
    <SettingsSection title="Read-only runtime state" rows={settings.runtimeState} />
    <Card title="Save settings"><p className="subtle">Save is mock-only. Real settings will use If-Match and dry_run support through the API layer.</p><Button onClick={() => onAction("Save settings", "BotApp settings", true)}>Save settings</Button></Card>
  </div>;
}
