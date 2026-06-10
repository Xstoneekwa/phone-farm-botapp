import { useEffect, useState } from "react";
import { mockClient } from "../../../api/mock-client";
import type { BotProfile, ProfileStatsRow } from "../../../api/types";
import { Badge, Button, Drawer } from "../../../design/components";

function enabledBadge(value: boolean) {
  return <Badge tone={value ? "success" : "neutral"}>{value ? "enabled" : "off"}</Badge>;
}

export function StatsDrawer({ profile, onClose, onSave }: { profile: BotProfile; onClose: () => void; onSave: () => void }) {
  const [rows, setRows] = useState<ProfileStatsRow[]>([]);
  const [page, setPage] = useState(1);
  const totalPages = 3;

  useEffect(() => {
    let cancelled = false;
    void mockClient.getProfileStats(profile.id).then((result) => {
      if (!cancelled && result.ok) setRows(result.data);
    });
    return () => { cancelled = true; };
  }, [profile.id]);

  return (
    <Drawer title="Statistics" subtitle={profile.username} wide onClose={onClose} footer={<>
      <div className="drawer-pagination">
        <Button variant="ghost" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Prev</Button>
        <span className="mono">{page} / {totalPages}</span>
        <Button variant="ghost" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>Next</Button>
        <Button variant="ghost" onClick={() => onSave()}>Refresh mock</Button>
      </div>
      <Button onClick={onSave}>Save mock</Button>
    </>}>
      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Session time</th><th>Followers</th><th>Following</th><th>Follow-back</th><th>Like-back</th>
              <th>Follow</th><th>Unfollow</th><th>Like</th><th>Comment</th><th>DM</th><th>Story watch</th><th>Total int.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.sessionDate}-${row.sessionTime}`}>
                <td><div className="mono">{row.sessionTime}</div><div className="subtle mono">{row.sessionDate}</div></td>
                <td className="mono">{row.followers}</td>
                <td className="mono">{row.following}</td>
                <td>{enabledBadge(row.followBackEnabled)}</td>
                <td>{enabledBadge(row.likeBackEnabled)}</td>
                <td><span className="metric-pill follow">{row.follow.current}/{row.follow.target}</span></td>
                <td><span className="metric-pill unfollow">{row.unfollow.current}/{row.unfollow.target}</span></td>
                <td><span className="metric-pill like">{row.like.current}/{row.like.target}</span></td>
                <td><span className="metric-pill comment">{row.comment.current}/{row.comment.target}</span></td>
                <td><span className="metric-pill dm">{row.dm.current}/{row.dm.target}</span></td>
                <td className="mono">{row.watch}</td>
                <td><span className={`metric-pill total ${row.totalInteractions > 100 ? "high" : "low"}`}>{row.totalInteractions}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}
