import { useEffect, useState } from "react";
import { mockClient } from "../../../api/mock-client";
import type { BotProfile, ProfileTargetGroup } from "../../../api/types";
import { Badge, Button, Drawer, Input } from "../../../design/components";

export function TargetsDrawer({ profile, onClose, onAction }: { profile: BotProfile; onClose: () => void; onAction: (label: string) => void }) {
  const [groups, setGroups] = useState<ProfileTargetGroup[]>([]);

  useEffect(() => {
    let cancelled = false;
    void mockClient.getProfileTargets(profile.id).then((result) => {
      if (!cancelled && result.ok) setGroups(result.data);
    });
    return () => { cancelled = true; };
  }, [profile.id]);

  return (
    <Drawer title="Target accounts" subtitle={profile.username} wide onClose={onClose}>
      {groups.map((group) => (
        <section key={group.id} className="drawer-section">
          <div className="target-group-header">
            <label className="checkbox-row"><input type="checkbox" checked={group.enabled} readOnly /> <strong>{group.label}</strong></label>
            <span className="subtle">{group.sourceType}</span>
          </div>
          <Input value={group.sourceList} readOnly />
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr><th></th><th>Index</th><th>Username</th><th>Date added</th><th>Followers</th><th>Followback ratio</th><th>Total follow</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {group.targets.map((target) => (
                  <tr key={target.username}>
                    <td><input type="checkbox" readOnly /></td>
                    <td className="mono">{target.index}</td>
                    <td>{target.username}</td>
                    <td className="mono">{target.dateAdded ?? "—"}</td>
                    <td className="mono">{target.followers.toLocaleString()}</td>
                    <td className="mono">{target.followbackRatio.toFixed(3)}%</td>
                    <td className="mono">{target.totalFollow}</td>
                    <td><Badge tone={target.status === "approved" ? "success" : target.status === "review" ? "warning" : "neutral"}>{target.status}</Badge></td>
                    <td className="target-actions">
                      <Button variant="ghost" onClick={() => onAction(`Archive target ${target.username}`)}>Archive</Button>
                      <Button variant="ghost" onClick={() => onAction(`Delete target ${target.username}`)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </Drawer>
  );
}
