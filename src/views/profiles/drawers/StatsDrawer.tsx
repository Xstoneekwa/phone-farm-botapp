import { Badge, Button, Drawer } from "../../../design/components";
import type { BotProfile } from "../../../api/types";
import { sourceLabel, useProfileDetails } from "../use-profile-details";

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="settings-field"><span>{label}</span><strong className="mono">{value === null || value === undefined || value === "" ? "—" : String(value)}</strong></div>;
}

export function StatsDrawer({ profile, onClose, onSave }: { profile: BotProfile; onClose: () => void; onSave: () => void }) {
  const { loading, error, data } = useProfileDetails(profile.id);
  const summary = data?.stats?.summary ?? {};

  return (
    <Drawer title="Statistics" subtitle={profile.username} wide onClose={onClose} footer={<>
      <span className="subtle">{sourceLabel(data, "stats")}</span>
      <Button variant="ghost" onClick={onSave}>Refresh</Button>
    </>}>
      {loading ? <div className="empty-state">Loading statistics from Manage…</div> : null}
      {!loading && error ? <div className="empty-state"><strong>Statistics unavailable</strong><span>{error}</span></div> : null}
      {!loading && !error && data?.stats?.status === "backend_pending" ? (
        <div className="empty-state"><strong>Backend endpoint pending</strong><span>{data.stats.error ?? "ig_runs / ig_action_logs"}</span></div>
      ) : null}
      {!loading && !error && data?.stats?.status !== "backend_pending" ? (
        <div className="detail-list">
          <Field label="Runs loaded" value={summary.runs_count as number | undefined} />
          <Field label="Log events" value={summary.logs_count as number | undefined} />
          <Field label="Latest run status" value={summary.latest_run_status as string | undefined} />
          <Field label="Latest run started" value={summary.latest_run_started_at as string | undefined} />
          <Field label="Follow events today" value={summary.follows_today as number | undefined} />
          <Field label="Unfollow events today" value={summary.unfollows_today as number | undefined} />
          <Field label="Like events today" value={summary.likes_today as number | undefined} />
          <div className="settings-field"><span>Current run status</span><Badge tone="neutral">{profile.status}</Badge></div>
        </div>
      ) : null}
    </Drawer>
  );
}
