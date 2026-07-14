import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Table, Td, Th, TRow } from "../design/components";
import { createDevicesAutoRefreshController } from "./devices-auto-refresh";
import { IncidentDrawer } from "./IncidentDrawer";
import {
  INCIDENTS_LIST_STATUS,
  INCIDENTS_REFRESH_INTERVAL_MS,
  countIncidents,
  deliveryCopy,
  formatIncidentTimestamp,
  incidentStateCopy,
  normalizeIncidentList,
  severityTone,
  shouldPollIncidents,
  type IncidentRowView,
} from "./incidents-view";

/**
 * Incidents view — canonical runtime incidents (P2), observability only.
 *
 * Every row comes from the backend incident read-model. Clicking a row opens
 * the audited incident drawer; clicking an account jumps to Profiles. Nothing
 * in this view starts, retries or schedules a run.
 */
export function Incidents({
  onOpenProfile,
  onProfilesChanged,
}: {
  onOpenProfile: (accountId: string) => void;
  onProfilesChanged?: () => void;
}) {
  const [rows, setRows] = useState<IncidentRowView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerIncidentId, setDrawerIncidentId] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const result = await window.botappDesktop?.incidents?.list?.({
      status: INCIDENTS_LIST_STATUS,
      limit: 100,
    });
    if (!mountedRef.current) return;
    if (result?.ok) {
      setRows(normalizeIncidentList(result.incidents));
      setLoadError(null);
    } else {
      setLoadError(result?.message || "Incidents unavailable.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = createDevicesAutoRefreshController({
      refresh: () => {
        void refresh();
      },
      intervalMs: INCIDENTS_REFRESH_INTERVAL_MS,
    });
    const onVisibilityChange = () => {
      controller.handleVisibilityChange(document.visibilityState === "visible");
    };
    controller.start(shouldPollIncidents("incidents", document.visibilityState));
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controller.stop();
    };
  }, [refresh]);

  const visibleRows = showTest ? rows : rows.filter((row) => !row.isTest);
  const counters = countIncidents(rows);
  const testCount = rows.length - rows.filter((row) => !row.isTest).length;

  return (
    <div className="incidents-view" data-testid="incidents-view">
      <Card
        title="Incidents"
        subtitle="Canonical runtime incidents — true failure reasons, Slack/Discord delivery state, human review."
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge tone={counters.actionRequired > 0 ? "error" : "neutral"} dot>
              {`Action required: ${counters.actionRequired}`}
            </Badge>
            <Badge tone={counters.open > 0 ? "warning" : "success"} dot>
              {`Open: ${counters.open}`}
            </Badge>
            {counters.deliveryDegraded > 0 ? (
              <Badge tone="error" dot>{`Delivery degraded: ${counters.deliveryDegraded}`}</Badge>
            ) : null}
            {testCount > 0 ? (
              <Button variant="ghost" onClick={() => setShowTest((value) => !value)}>
                {showTest ? "Hide test incidents" : `Show test incidents (${testCount})`}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void refresh()}>Refresh</Button>
          </div>
        }
      >
        {loadError ? (
          <div className="empty-state" role="alert" data-testid="incidents-load-error">
            <strong>Incidents unavailable.</strong>
            <span>{loadError}</span>
            <Button variant="ghost" onClick={() => void refresh()}>Retry</Button>
          </div>
        ) : null}
        {!loadError && loaded && visibleRows.length === 0 ? (
          <EmptyState
            title="No incidents"
            message="No open, acknowledged or recently resolved runtime incidents."
          />
        ) : null}
        {visibleRows.length > 0 ? (
          <Table>
            <thead>
              <TRow>
                <Th>State</Th>
                <Th>Severity</Th>
                <Th>Account</Th>
                <Th>Type</Th>
                <Th>Reason</Th>
                <Th>Last seen</Th>
                <Th>Delivery</Th>
                <Th>Details</Th>
              </TRow>
            </thead>
            <tbody data-testid="incidents-rows">
              {visibleRows.map((row) => {
                const state = incidentStateCopy(row.displayState);
                const delivery = deliveryCopy(row.deliveryState);
                return (
                  <TRow key={row.id}>
                    <Td><Badge tone={state.tone} dot>{state.label}</Badge></Td>
                    <Td><Badge tone={severityTone(row.severity)}>{row.severity}</Badge></Td>
                    <Td>
                      {row.accountId ? (
                        <button
                          type="button"
                          className="link-button"
                          data-testid={`incident-account-${row.id}`}
                          onClick={() => onOpenProfile(row.accountId as string)}
                        >
                          {row.accountUsername || row.accountId}
                        </button>
                      ) : (
                        <span>{row.accountUsername || "—"}</span>
                      )}
                      {row.isTest ? <Badge tone="neutral">test</Badge> : null}
                    </Td>
                    <Td>{row.operatorLabel}</Td>
                    <Td mono>{row.reasonCode}{row.occurrenceCount > 1 ? ` ×${row.occurrenceCount}` : ""}</Td>
                    <Td>{formatIncidentTimestamp(row.lastSeenAt)}</Td>
                    <Td><Badge tone={delivery.tone}>{delivery.label}</Badge></Td>
                    <Td>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        data-testid={`incident-open-${row.id}`}
                        onClick={() => setDrawerIncidentId(row.id)}
                      >
                        Review
                      </button>
                    </Td>
                  </TRow>
                );
              })}
            </tbody>
          </Table>
        ) : null}
      </Card>
      <IncidentDrawer
        open={Boolean(drawerIncidentId)}
        incidentId={drawerIncidentId}
        onClose={() => setDrawerIncidentId(null)}
        onChanged={() => void refresh()}
        onProfilesChanged={onProfilesChanged}
      />
    </div>
  );
}
