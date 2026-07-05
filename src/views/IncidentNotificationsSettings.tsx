import { useEffect, useMemo, useState } from "react";
import { Card } from "../design/components";

type Channel = "slack" | "discord";

type ChannelSettings = {
  channel: Channel;
  enabled?: boolean;
  configured?: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastErrorRedacted?: string | null;
  lastTestAt?: string | null;
  lastTestStatus?: string | null;
  attemptCount?: number;
  nextRetryAt?: string | null;
};

type OutboxItem = {
  id?: string;
  channel?: string;
  status?: string;
  providerMessageId?: string | null;
  lastErrorRedacted?: string | null;
  deliveredAt?: string | null;
  createdAt?: string | null;
};

const channels: Channel[] = ["slack", "discord"];

function unwrapPayload(payload: unknown): unknown {
  let current = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (current && typeof current === "object" && "data" in current) {
      current = (current as { data?: unknown }).data;
    } else {
      break;
    }
  }
  return current;
}

function readChannels(payload: unknown): ChannelSettings[] {
  const data = unwrapPayload(payload);
  const rows = data && typeof data === "object" && "channels" in data ? (data as { channels?: unknown }).channels : null;
  return Array.isArray(rows) ? rows.filter((row): row is ChannelSettings => Boolean(row && typeof row === "object" && "channel" in row)) : [];
}

function readOutbox(payload: unknown): OutboxItem[] {
  const data = unwrapPayload(payload);
  const rows = data && typeof data === "object" && "items" in data
    ? (data as { items?: unknown }).items
    : data && typeof data === "object" && "rows" in data
      ? (data as { rows?: unknown }).rows
      : null;
  return Array.isArray(rows) ? rows.filter((row): row is OutboxItem => Boolean(row && typeof row === "object")) : [];
}

function formatValue(value: string | null | undefined) {
  return value && value.trim() ? value : "Not configured";
}

function errorMessage(result: { error?: string | null; message?: string | null; reason?: string | null } | undefined, fallback: string) {
  const reason = result?.reason || result?.error || result?.message || fallback;
  return String(reason).replace(/_/g, " ");
}

export function IncidentNotificationsSettingsView() {
  const [settings, setSettings] = useState<ChannelSettings[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [drafts, setDrafts] = useState<Record<Channel, string>>({ slack: "", discord: "" });
  const [enabled, setEnabled] = useState<Record<Channel, boolean>>({ slack: false, discord: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [testProof, setTestProof] = useState<Record<Channel, { tone: "success" | "error"; text: string } | null>>({ slack: null, discord: null });

  const byChannel = useMemo(() => new Map(settings.map((row) => [row.channel, row])), [settings]);

  async function load() {
    const [settingsResult, outboxResult] = await Promise.all([
      window.botappDesktop?.incidents?.notificationSettings?.(),
      window.botappDesktop?.incidents?.notificationOutbox?.({ limit: 5 }),
    ]);
    const rows = readChannels(settingsResult);
    setSettings(rows);
    setOutbox(readOutbox(outboxResult));
    setEnabled({
      slack: Boolean(rows.find((row) => row.channel === "slack")?.enabled),
      discord: Boolean(rows.find((row) => row.channel === "discord")?.enabled),
    });
    return rows;
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(channel: Channel) {
    setBusy(`save-${channel}`);
    setMessage(null);
    const webhook = drafts[channel].trim();
    const result = await window.botappDesktop?.incidents?.patchNotificationSettings?.({
      [channel]: {
        enabled: enabled[channel],
        webhook_url: webhook || undefined,
      },
    });
    if (!result?.ok) {
      setMessage({ tone: "error", text: errorMessage(result, `${channel} settings could not be saved.`) });
      setBusy(null);
      return;
    }
    const rows = await load();
    const saved = rows.find((row) => row.channel === channel);
    if (webhook && !saved?.configured) {
      setMessage({ tone: "error", text: `${channel} settings were accepted but not persisted. The webhook was not cleared.` });
      setBusy(null);
      return;
    }
    setDrafts((current) => ({ ...current, [channel]: "" }));
    setMessage({ tone: "success", text: `${channel} settings saved.` });
    setBusy(null);
  }

  async function clear(channel: Channel) {
    if (!window.confirm(`Clear ${channel} webhook and disable channel?`)) return;
    setBusy(`clear-${channel}`);
    setMessage(null);
    const result = await window.botappDesktop?.incidents?.patchNotificationSettings?.({
      [channel]: { clear_webhook: true },
    });
    if (!result?.ok) {
      setMessage({ tone: "error", text: errorMessage(result, `${channel} webhook could not be cleared.`) });
      setBusy(null);
      return;
    }
    await load();
    setDrafts((current) => ({ ...current, [channel]: "" }));
    setMessage({ tone: "success", text: `${channel} webhook cleared.` });
    setBusy(null);
  }

  async function sendTest(channel: Channel) {
    setBusy(`test-${channel}`);
    setMessage(null);
    const result = await window.botappDesktop?.incidents?.testNotification?.({ channel });
    await load();
    const text = result?.ok
      ? `${channel} test notification sent.`
      : errorMessage(result, `${channel} test failed.`);
    const tone = result?.ok ? "success" : "error";
    setTestProof((current) => ({ ...current, [channel]: { tone, text } }));
    setMessage({ tone, text });
    setBusy(null);
  }

  return (
    <div className="incident-notifications-screen" data-testid="botapp-incident-notifications-settings">
      <Card
        title="Notification Settings"
        subtitle="Incident notification settings use write-only webhooks. Saved webhook values are never shown."
      >
        <div className="notification-settings-summary">
          <span data-testid="botapp-incident-notifications-scope">Authorized scope: My Mac</span>
          <span data-testid="botapp-incident-notifications-redaction">Raw webhooks hidden</span>
        </div>
      </Card>

      {channels.map((channel) => {
        const row = byChannel.get(channel);
        const canTest = Boolean(row?.configured && row.enabled);
        return (
          <Card
            key={channel}
            title={channel === "slack" ? "Slack" : "Discord"}
            subtitle={row?.configured ? "Configured" : "Not configured"}
            actions={
              <div className="notification-settings-actions">
                <button type="button" className="btn btn-secondary" onClick={() => void save(channel)} disabled={Boolean(busy)} data-testid={`botapp-incident-notification-${channel}-save`}>{busy === `save-${channel}` ? "Saving..." : "Save"}</button>
                <button type="button" className="btn btn-secondary" onClick={() => void sendTest(channel)} disabled={Boolean(busy) || !canTest} title={canTest ? "Send a redacted test notification." : "Configure and enable this channel before testing."} data-testid={`botapp-incident-notification-${channel}-test`}>{busy === `test-${channel}` ? "Sending..." : "Send test"}</button>
                <button type="button" className="btn btn-ghost" onClick={() => void clear(channel)} disabled={Boolean(busy)}>Clear webhook</button>
              </div>
            }
          >
            <section className="notification-settings-channel" data-testid={`botapp-incident-notification-${channel}`}>
              <label className="notification-settings-inline-label">
                <span>Enabled</span>
                <input
                  type="checkbox"
                  checked={enabled[channel]}
                  onChange={(event) => setEnabled((current) => ({ ...current, [channel]: event.target.checked }))}
                />
              </label>
              <label className="notification-settings-field-label">
                <span>Replace webhook URL</span>
                <input
                  type="password"
                  data-testid={`botapp-incident-notification-${channel}-webhook`}
                  value={drafts[channel]}
                  onChange={(event) => setDrafts((current) => ({ ...current, [channel]: event.target.value }))}
                  placeholder={row?.configured ? "Configured - enter a new URL to rotate" : "https://..."}
                  autoComplete="off"
                />
              </label>
              <dl>
                <div><dt>State</dt><dd data-testid={`botapp-incident-notification-${channel}-state`}>{row?.configured ? "Configured" : "Not configured"}</dd></div>
                <div><dt>Last success</dt><dd>{formatValue(row?.lastSuccessAt)}</dd></div>
                <div><dt>Last test</dt><dd data-testid={`botapp-incident-notification-${channel}-last-test`}>{row?.lastTestAt ? `${row.lastTestAt} (${row.lastTestStatus || "unknown"})` : "Not configured"}</dd></div>
                <div><dt>Last error</dt><dd>{row?.lastErrorRedacted || "None"}</dd></div>
                <div><dt>Retry state</dt><dd>{Number(row?.attemptCount || 0)} attempts</dd></div>
              </dl>
              {!canTest ? <p className="notification-settings-hint">Configure and enable this channel before sending a test.</p> : null}
              {testProof[channel] ? (
                <p className={`notification-settings-test-proof ${testProof[channel]?.tone === "error" ? "error" : "ok"}`} data-testid={`botapp-incident-notification-${channel}-proof`}>{testProof[channel]?.text}</p>
              ) : null}
            </section>
          </Card>
        );
      })}

      <Card title="Outbox state" subtitle="Latest delivery attempts are redacted.">
        <div className="notification-settings-outbox" data-testid="botapp-incident-notification-outbox">
          {outbox.length ? outbox.map((item, index) => (
            <div key={item.id || index} data-testid="botapp-incident-notification-outbox-item">
              <strong>{item.channel || "channel"} · {item.status || "unknown"}</strong>
              <span>{item.lastErrorRedacted || item.providerMessageId || item.deliveredAt || "Redacted delivery attempt recorded"}</span>
            </div>
          )) : <span>No delivery attempts yet.</span>}
        </div>
      </Card>

      {message ? <p className={`notification-settings-message ${message.tone}`} data-testid="botapp-incident-notification-message">{message.text}</p> : null}
    </div>
  );
}
