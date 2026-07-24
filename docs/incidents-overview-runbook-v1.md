# BotApp Incidents overview runbook V1

BotApp Incidents is a read-only operational projection. It uses
`window.botappDesktop.incidents.list`, preload IPC, Electron endpoint ID
`incidents_overview`, and authenticated `GET /api/instagram-dashboard/incidents`.

Expected states:

- HTTP 200 + empty `incidents`: `No open incidents`;
- HTTP 200 + rows: page of 50, newest first, global counters;
- HTTP 401/403: `Incident access denied`;
- HTTP 404/5xx/network: `Incident backend unavailable`;
- HTTP 200 with an unsafe/unrecognized payload: `Incident data contract is invalid`.

Never show an `Open: 0` badge during an error. Filters are Open, Action
required, Resolved and All. Search is limited to account/reason fields. `Next
page` consumes the server cursor; it never creates a run, request, lock, phone
action, or incident mutation.

The installed `app.asar` must contain the exact error-state copy, filter labels,
page size 50, and `nextCursor`. Package verification also scans for secrets and
confirms that only the official signed BotApp bundle is installed.
