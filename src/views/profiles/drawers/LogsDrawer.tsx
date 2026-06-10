import { useEffect, useMemo, useState } from "react";
import { mockClient } from "../../../api/mock-client";
import type { BotProfile, ProfileLogEntry } from "../../../api/types";
import { Button, Drawer, Input } from "../../../design/components";
import { redactText } from "../../../security/redaction";

export function LogsDrawer({ profile, onClose }: { profile: BotProfile; onClose: () => void }) {
  const [logs, setLogs] = useState<ProfileLogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<ProfileLogEntry["level"] | "ALL">("ALL");

  useEffect(() => {
    let cancelled = false;
    void mockClient.getProfileLogs(profile.id).then((result) => {
      if (!cancelled && result.ok) setLogs(result.data);
    });
    return () => { cancelled = true; };
  }, [profile.id]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((entry) => {
      if (levelFilter !== "ALL" && entry.level !== levelFilter) return false;
      if (!needle) return true;
      return redactText(`${entry.level} ${entry.message} ${entry.source ?? ""}`).toLowerCase().includes(needle);
    });
  }, [levelFilter, logs, query]);

  return (
    <Drawer title="History" subtitle={profile.username} wide onClose={onClose}>
      <div className="drawer-toolbar-row">
        <Input value={query} onChange={setQuery} placeholder="Search log..." />
        <select className="input" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as ProfileLogEntry["level"] | "ALL")}>
          <option value="ALL">All levels</option>
          <option value="INFO">INFO</option>
          <option value="DEBUG">DEBUG</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>
        <Button variant="ghost">Prev</Button>
        <Button variant="ghost">Next</Button>
      </div>
      <div className="log-viewer" role="log" aria-live="polite">
        {filtered.map((entry) => (
          <div key={`${entry.timestamp}-${entry.message}`} className={`log-line level-${entry.level.toLowerCase()}`}>
            <span className="mono">[{entry.timestamp}]</span>{" "}
            <span className="mono log-level">{entry.level}</span>{" "}
            <span>| {redactText(entry.message)}</span>
            {entry.source ? <span className="mono log-source"> ({entry.source})</span> : null}
          </div>
        ))}
      </div>
    </Drawer>
  );
}
