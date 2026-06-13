import { useEffect, useState } from "react";
import { Button, Drawer } from "../../../design/components";
import type { BotProfile } from "../../../api/types";

type StatsHistoryDay = {
  date: string;
  session_time: string | null;
  followers_count: number | null;
  followings_count: number | null;
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
};

function numberOrDash(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US") : "—";
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
  return <span className={actionPillClass(kind)}>{current}/{typeof cap === "number" ? cap : 0}</span>;
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
          <span>Supabase-backed API · 30 days · social actions</span>
          {data.missing_sources?.length ? <em>Followers/followings snapshots pending</em> : null}
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
                    <td className="stats-strong">{numberOrDash(day.followers_count)}</td>
                    <td className="stats-strong">{numberOrDash(day.followings_count)}</td>
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
                    <td colSpan={10} className="stats-empty-cell">No social stats yet for this account.</td>
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
