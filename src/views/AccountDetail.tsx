import { Badge, Button, Card } from "../design/components";
import type { BotProfile } from "../api/types";

export function AccountDetail({ profile, onAction }: { profile: BotProfile | undefined; onAction: (action: string, target: string, danger?: boolean) => void }) {
  if (!profile) return <Card title="Account Detail"><div className="empty-state">Select a profile to inspect details.</div></Card>;
  return <div className="grid two">
    <Card title={profile.username} subtitle="Configuration readiness and run eligibility are separate.">
      <div className="detail-list"><span>Package</span><Badge tone="accent">{profile.package}</Badge><span>Readiness</span><Badge tone="success">{profile.readiness}</Badge><span>Run eligibility</span><Badge tone={profile.eligibility === "can_start" ? "success" : "warning"}>{profile.eligibility}</Badge><span>Primary block</span><code>{profile.eligibilityReason}</code><span>Assigned phone</span><code>{profile.deviceName}</code></div>
    </Card>
    <Card title="Safe actions" subtitle="All actions are preview-only in this foundation.">
      <div className="button-row"><Button onClick={() => onAction("Start profile", profile.username, true)}>Start profile</Button><Button variant="danger" onClick={() => onAction("Stop profile", profile.username, true)}>Stop profile</Button><Button onClick={() => onAction("Archive profile", profile.username, true)}>Archive profile</Button><Button onClick={() => onAction("Restore profile", profile.username, true)}>Restore profile</Button></div>
    </Card>
  </div>;
}
