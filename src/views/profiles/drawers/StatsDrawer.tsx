import { useEffect, useState } from "react";
import { Button, Drawer } from "../../../design/components";
import type { BotProfile } from "../../../api/types";
import { formatSnapshotMetric, snapshotStatusSummary } from "../stats-snapshot-contract";

type StatsHistoryDay = {
  date: string;
  session_time: string | null;
  followers_count: number | null;
  followings_count: number | null;
  posts_count: number | null;
  followers_snapshot_at?: string | null;
  followers_snapshot_source?: string | null;
  followers_freshness_status?: "available" | "stale" | "no_data";
  followings_freshness_status?: "unavailable" | "available" | "stale" | "no_data";
  followings_snapshot_at?: string | null;
  followings_snapshot_source?: string | null;
  posts_freshness_status?: "available" | "stale" | "no_data";
  posts_snapshot_at?: string | null;
  posts_snapshot_source?: string | null;
  follow_count: number;
  follow_cap: number;
  unfollow_count: number;
  unfollow_cap: number;
  like_count: number;
  like_cap: number;
  comment_count: number;
  comment_cap: number;
  dm_count: number;
  dm_cap: number;
  watch_count: number;
  total_interactions: number;
};

type StatsHistoryPayload = {
  account_id: string;
  days: StatsHistoryDay[];
  source?: Record<string, string>;
  missing_sources?: string[];
  business_timezone?: string;
  generated_at?: string;
  source_status?: {
    followers?: { status?: string; latestAt?: string | null; latest_at?: string | null; source?: string | null };
    followings?: { status?: string; latestAt?: string | null; latest_at?: string | null; source?: string | null; reason?: string };
    posts?: { status?: string; latestAt?: string | null; latest_at?: string | null; source?: string | null; reason?: string };
  };
};

function formatSastTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", " ·");
}

function SnapshotCell({ value, status, capturedAt, source }: { value: number | null | undefined; status?: string; capturedAt?: string | null; source?: string | null }) {
  const formatted = formatSnapshotMetric(value);
  const hasValue = formatted !== "—";
  const title = hasValue
    ? [status, capturedAt ? formatSastTimestamp(capturedAt) : null, source].filter(Boolean).join(" · ")
    : "No persisted value for this observation.";
  return <span title={title}>{formatted}{hasValue && status === "stale" ? <em> · stale</em> : null}</span>;
}

function actionPillClass(kind: "follow" | "unfollow" | "like" | "neutral" | "total", value = 0) {
  if (kind === "total") {
    if (value >= 100) return "stats-pill total good";
    if (value >= 40) return "stats-pill total medium";
    return "stats-pill total low";
  }
  return `stats-pill ${kind}`;
}

function ActionPill({ kind, current, cap }: { kind: "follow" | "unfollow" | "like" | "neutral"; current: number; cap?: number | null }) {
  return <span className={actionPillClass(kind)}>{current}/{typeof cap === "number" ? cap : "—"}</span>;
}

function WatchPill({ value }: { value: number }) {
  return <span className="stats-pill watch">{value}</span>;
}

function TotalPill({ value }: { value: number }) {
  return <span className={actionPillClass("total", value)}>{value}</span>;
}

function emptyPayload(accountId: string): StatsHistoryPayload {
  return { account_id: accountId, days: [], source: {}, missing_sources: [] };
}

export function StatsDrawer({ profile, onClose, onSave }: { profile: BotProfile; onClose: () => void; onSave: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatsHistoryPayload>(() => emptyPayload(profile.id));

  async function loadStatsHistory() {
    const load = window.botappDesktop?.profiles?.statsHistory;
    if (!load) {
      setError("Stats history relay unavailable in this runtime.");
      setData(emptyPayload(profile.id));
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await load({ accountId: profile.id, days: 30 });
    if (!result.ok) {
      setError(result.error ?? "Stats history unavailable.");
      setData(emptyPayload(profile.id));
      setLoading(false);
      return;
    }
    setData((result.data ?? emptyPayload(profile.id)) as StatsHistoryPayload);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatsHistory();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  function refresh() {
    void loadStatsHistory();
    onSave();
  }

  return (
    <Drawer title="Statistics" subtitle={profile.username} wide onClose={onClose} footer={<>
      <span className="subtle">Supabase-backed API · 30 days · social actions</span>
      <Button variant="ghost" onClick={refresh}>Refresh</Button>
    </>}>
      <div className="stats-history-panel">
        <div className="stats-source-line">
          <span>Supabase-backed API · 30 days · social actions · {data.business_timezone ?? "Africa/Johannesburg"}{data.generated_at ? ` · updated ${formatSastTimestamp(data.generated_at)}` : ""}</span>
          <em>{snapshotStatusSummary(data)}</em>
        </div>
        {loading ? <div className="empty-state">Loading statistics from shared backend…</div> : null}
        {!loading && error ? <div className="empty-state"><strong>Statistics unavailable</strong><span>{error}</span></div> : null}
        {!loading && !error ? (
          <div className="stats-history-table-wrap">
            <table className="stats-history-table">
              <thead>
                <tr>
                  <th>SESSION TIME</th>
                  <th>FOLLOWERS</th>
                  <th>FOLLOWINGS</th>
                  <th>POSTS</th>
                  <th>FOLLOW</th>
                  <th>UNFOLLOW</th>
                  <th>LIKE</th>
                  <th>COMMENT</th>
                  <th>DM</th>
                  <th>WATCH</th>
                  <th>TOTAL INT.</th>
                </tr>
              </thead>
              <tbody>
                {data.days.length ? data.days.map((day) => (
                  <tr key={day.date}>
                    <td className="session-time"><span className="clock-icon">◷</span>{day.session_time ?? day.date}</td>
                    <td className="stats-strong"><SnapshotCell value={day.followers_count} status={day.followers_freshness_status} capturedAt={day.followers_snapshot_at} source={day.followers_snapshot_source} /></td>
                    <td className="stats-strong"><SnapshotCell value={day.followings_count} status={day.followings_freshness_status ?? data.source_status?.followings?.status} capturedAt={day.followings_snapshot_at} source={day.followings_snapshot_source} /></td>
                    <td className="stats-strong"><SnapshotCell value={day.posts_count} status={day.posts_freshness_status ?? data.source_status?.posts?.status} capturedAt={day.posts_snapshot_at} source={day.posts_snapshot_source} /></td>
                    <td><ActionPill kind="follow" current={day.follow_count} cap={day.follow_cap} /></td>
                    <td><ActionPill kind="unfollow" current={day.unfollow_count} cap={day.unfollow_cap} /></td>
                    <td><ActionPill kind="like" current={day.like_count} cap={day.like_cap} /></td>
                    <td><ActionPill kind="neutral" current={day.comment_count} cap={day.comment_cap} /></td>
                    <td><ActionPill kind="neutral" current={day.dm_count} cap={day.dm_cap} /></td>
                    <td><WatchPill value={day.watch_count} /></td>
                    <td><TotalPill value={day.total_interactions} /></td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={11} className="stats-empty-cell">No social stats yet for this account.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
