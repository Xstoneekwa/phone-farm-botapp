import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Table, Td, Th, TRow } from "../design/components";
import { createDevicesAutoRefreshController } from "./devices-auto-refresh";
import { IncidentDrawer } from "./IncidentDrawer";
import {
  INCIDENTS_LIST_STATUS,
  INCIDENTS_REFRESH_INTERVAL_MS,
  countIncidents,
  deliveryCopy,
  emptyIncidentCopy,
  formatIncidentTimestamp,
  incidentLoadErrorCopy,
  incidentStateCopy,
  normalizeGlobalIncidentCounters,
  normalizeIncidentList,
  severityTone,
  shouldPollIncidents,
  type IncidentGlobalCounters,
  type IncidentListFilter,
  type IncidentLoadErrorKind,
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
  const [loadError, setLoadError] = useState<IncidentLoadErrorKind | null>(null);
  const [filter, setFilter] = useState<IncidentListFilter>("open");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [globalCounters, setGlobalCounters] = useState<IncidentGlobalCounters | null>(null);
  const [drawerIncidentId, setDrawerIncidentId] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const result = await window.botappDesktop?.incidents?.list?.({
      status: INCIDENTS_LIST_STATUS,
      filter,
      search,
      cursor,
      limit: 50,
    });
    if (!mountedRef.current) return;
    if (result?.ok) {
      const normalizedRows = normalizeIncidentList(result.incidents);
      setRows(normalizedRows);
      setGlobalCounters(normalizeGlobalIncidentCounters(result.globalCounters) ?? countIncidents(normalizedRows));
      setHasMore(result.page?.hasMore === true);
      setNextCursor(typeof result.page?.nextCursor === "string" ? result.page.nextCursor : null);
      setLoadError(null);
    } else {
      setRows([]);
      setGlobalCounters(null);
      setHasMore(false);
      setNextCursor(null);
      setLoadError(result?.errorKind || "backend_unavailable");
    }
    setLoaded(true);
  }, [cursor, filter, search]);

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
  const counters = globalCounters ?? countIncidents(rows);
  const testCount = rows.length - rows.filter((row) => !row.isTest).length;
  const errorCopy = incidentLoadErrorCopy(loadError);
  const emptyCopy = emptyIncidentCopy(filter);

  function chooseFilter(nextFilter: IncidentListFilter) {
    setFilter(nextFilter);
    setCursor(null);
    setPageNumber(1);
  }

  function applySearch() {
    setSearch(searchDraft.trim());
    setCursor(null);
    setPageNumber(1);
  }

  return (
    <div className="incidents-view" data-testid="incidents-view">
      <Card
        title="Incidents"
        subtitle="Canonical runtime incidents — true failure reasons, Slack/Discord delivery state, human review."
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!loadError ? <Badge tone={counters.actionRequired > 0 ? "error" : "neutral"} dot>
              {`Action required: ${counters.actionRequired}`}
            </Badge> : null}
            {!loadError ? <Badge tone={counters.open > 0 ? "warning" : "success"} dot>
              {`Open: ${counters.open}`}
            </Badge> : null}
            {!loadError && counters.deliveryDegraded > 0 ? (
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }} data-testid="incidents-filters">
          {(["open", "action_required", "resolved", "all"] as IncidentListFilter[]).map((value) => (
            <Button key={value} variant={filter === value ? "primary" : "ghost"} onClick={() => chooseFilter(value)}>
              {value === "action_required" ? "Action required" : value[0].toUpperCase() + value.slice(1)}
            </Button>
          ))}
          <input
            type="search"
            value={searchDraft}
            placeholder="Search account or reason"
            aria-label="Search incidents"
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }}
          />
          <Button variant="secondary" onClick={applySearch}>Search</Button>
        </div>
        {loadError ? (
          <div className="empty-state" role="alert" data-testid="incidents-load-error">
            <strong>{errorCopy.title}</strong>
            <span>{errorCopy.message}</span>
            <Button variant="ghost" onClick={() => void refresh()}>Retry</Button>
          </div>
        ) : null}
        {!loadError && loaded && visibleRows.length === 0 ? (
          <EmptyState
            title={emptyCopy.title}
            message={emptyCopy.message}
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
        {!loadError && loaded && (visibleRows.length > 0 || pageNumber > 1) ? (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 12 }} data-testid="incidents-pagination">
            <span>{`Page ${pageNumber}`}</span>
            <Button
              variant="secondary"
              disabled={!hasMore || !nextCursor}
              onClick={() => {
                if (!nextCursor) return;
                setCursor(nextCursor);
                setPageNumber((value) => value + 1);
              }}
            >
              Next page
            </Button>
          </div>
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
