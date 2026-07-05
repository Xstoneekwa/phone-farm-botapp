import { Card } from "../design/components";

export function IncidentNotificationsSettingsView() {
  return (
    <div className="grid one">
      <Card title="Incident Notifications">
        <p className="subtle">
          Incident notification settings are read-only in this BotApp build. Use the backend incident notification relay for verified changes.
        </p>
      </Card>
    </div>
  );
}
