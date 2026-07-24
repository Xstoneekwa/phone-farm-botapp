# BotApp Incidents overview and detail runbook V1

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

## Detail and human review

`Review` forwards the exact incident ID through preload and Electron to
`GET /api/instagram-dashboard/incidents/:incidentId`. The response contract is
`incident_detail_v1`; legacy/incomplete optional fields remain displayable.
The drawer has bounded loading, a manual read-only retry, a 12-second relay
timeout, cancellation on close, and sequence protection when the selected
incident changes.

Safe error states are distinct: invalid ID, relay authentication, forbidden,
not found, lifecycle conflict, invalid contract, backend unavailable and
network failure. A detail GET never invokes the action bridge.

The schema supports acknowledge (shown as acknowledge/mark investigating), add
note, and resolve with a required reason. Reopen is not supported. Actions send
the current lifecycle version and a fresh idempotency key, block double clicks,
and reload canonical detail after success. Linked operator review remains a
separate confirmed action.

Slack and Discord are separate cards with separate history and attempt counts.
Resolution is committed independently of delivery. Only a failed channel below
the three-attempt cap exposes retry; refreshing the drawer sends nothing.

Rollback: quit BotApp, restore the timestamped application backup to
`/Applications/BotApp.app`, verify the ad-hoc signature and launch normally.
Rollback of the UI does not roll back incident rows or migration state.

This is an Incidents/Golden addendum only. Worker, dispatcher, scheduler,
phones, runs, Auto Login, Follow, Welcome DM and Unfollow are outside scope.
