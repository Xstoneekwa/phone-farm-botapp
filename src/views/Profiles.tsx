import { Badge, Button, Card, Table, Td, Th, TRow } from "../design/components";
import type { BotProfile } from "../api/types";

export function Profiles({ profiles, onSelect, onAction }: { profiles: BotProfile[]; onSelect: (id: string) => void; onAction: (action: string, target: string, danger?: boolean) => void }) {
  return <Card title="Profiles / Accounts" subtitle="Mock phone farm table. Actions open previews only." actions={<><Button onClick={() => onAction("Start all accounts", "all profiles", true)}>Start all accounts</Button><Button variant="danger" onClick={() => onAction("Stop all accounts", "all profiles", true)}>Stop all accounts</Button></>}>
    <Table><thead><tr><Th>Profile</Th><Th>Package</Th><Th>Status</Th><Th>Readiness</Th><Th>Eligibility</Th><Th>Device</Th><Th>Today</Th><Th>Actions</Th></tr></thead><tbody>{profiles.map((profile) => <TRow key={profile.id}>
      <Td><button className="link-button" onClick={() => onSelect(profile.id)}>{profile.username}</button><div className="subtle">{profile.platform} · {profile.activeWindow}</div></Td>
      <Td><Badge tone="accent">{profile.package}</Badge></Td>
      <Td><Badge tone={profile.status === "blocked" ? "error" : profile.status === "paused" ? "warning" : "success"}>{profile.status}</Badge></Td>
      <Td><Badge tone={profile.readiness === "ready" ? "success" : "warning"}>{profile.readiness}</Badge></Td>
      <Td><span className="mono">{profile.eligibilityReason}</span></Td>
      <Td>{profile.deviceName}<div className="subtle">{profile.runtimeLock}</div></Td>
      <Td>{profile.followsToday} follows · {profile.dmsToday} DMs</Td>
      <Td><Button onClick={() => onAction("Start profile", profile.username, true)}>Start</Button> <Button variant="danger" onClick={() => onAction("Stop profile", profile.username, true)}>Stop</Button></Td>
    </TRow>)}</tbody></Table>
  </Card>;
}
