# BotApp Architecture — Developer Guide

BotApp is the macOS operator application for the Phone Farm Instagram system. It gives operators a dense desktop surface for phones, profiles, runtime state, logs, targets, settings, and safety-gated actions.

This document is the primary developer onboarding reference. It complements `README.md`, `HANDOFF.md`, and `SKILL.md`.

**Relay / dispatcher (runtime packagé) :**

| Document | Usage |
|----------|--------|
| [guide-operateur-liam.md](./guide-operateur-liam.md) | Procédure opérateur sans terminal |
| [botapp-relay-dispatcher-architecture.md](./botapp-relay-dispatcher-architecture.md) | Architecture bootstrap, Keychain, dispatcher |
| [botapp-relay-dispatcher-operations.md](./botapp-relay-dispatcher-operations.md) | Validation, diagnostic, dépannage dev |

L’application opérateur normale est **`release/mac-arm64/BotApp.app`** — pas `npm run electron:start`.

---

## 1. Product vision

### Role in Phone Farm

| Surface | Role |
|---------|------|
| **BotApp (macOS)** | Day-to-day operator UI: profiles, devices, logs, targets, settings, start/stop previews |
| **Shared backend API / relay** | Server-side API layer for BotApp, Dashboard Admin, and Dashboard Client |
| **Supabase** | Source of truth for accounts, CTs, settings, assignments, runs, logs, events, and worker state |
| **Dashboard Admin** | Admin web interface that reads/writes through shared backend APIs |
| **Dashboard Client** | Client-safe web interface that reads/writes through shared backend APIs |
| **Python worker / runtime** | Device automation that writes structured state, runs, logs, and incidents to Supabase/backend runtime |

### Current state (checkpoint)

BotApp is being migrated from local fixtures to a shared backend relay. The product source of truth is **Supabase plus safe backend APIs**, not the Dashboard UI. BotApp and Dashboard are both clients over the same backend data.

### Future API relay

Production sync must follow:

```text
BotApp renderer
  -> secure BotApp API relay (scoped auth, audit, redaction)
  -> shared backend API routes
  -> Postgres / Supabase (server-side only)
  -> worker runtime + device farm
  -> events/logs streamed back through relay (WebSocket or polling)
```

The renderer must **never** hold service-role keys, direct DB clients, or unrestricted admin URLs.

### Runtime integrations

`npm run dev` only serves the Vite renderer during development. It is not an integration runtime and it does not keep local API routes alive after the dev server stops. The packaged Electron app loads `dist/index.html` and must rely on:

- Electron main process for local runtime duties such as safe IPC bridges, local health checks, optional local gateway transport, and OS-secured local configuration.
- Secure relay/backend for sensitive DB/API calls, scoped key generation, webhook delivery, and provider calls.
- Shared backend API routes, currently hosted in the Next.js backend, including Compass AI analysis.

The `API / Webhooks / Keys` tab now reflects that boundary. It reads runtime health through `window.botappDesktop.runtime.status()`, which is exposed by preload as a narrow IPC method. Renderer code receives only safe state: configured/missing flags, masked prefixes, base origins, status labels, and timestamps. It does not receive provider credentials, webhook signing values, service credentials, or raw payload logs.

Compass AI placement:

- Production mode is relay-only. BotApp calls a stable backend relay URL, currently hosted under `/api/instagram-dashboard/...` in the Next.js backend for compatibility.
- The provider key lives only in the relay server environment. BotApp does not store or read it.
- If no relay URL is configured, BotApp shows `Compass AI relay not configured. Add a relay URL to enable AI recommendations.` and keeps Compass rules-only facts available.

Packaged Compass AI runtime:

- `Analyze now` in the Compass tab calls `window.botappDesktop.compass.analyze(...)`.
- Preload forwards the request to Electron main through `botapp:compass:analyze`.
- Electron main selects the runtime mode:
  - `BOTAPP_COMPASS_AI_RELAY_URL` or saved relay URL present: POST the safe Compass snapshot to the stable relay endpoint.
  - No relay URL: return the setup message and keep rules-only recommendations.
- The renderer never fetches OpenAI and never receives provider credentials.
- The relay URL can be entered in `API / Webhooks / Keys`; Electron main persists it under the app `userData` directory, outside Git and outside the renderer bundle.

For a packaged local smoke test, pass configuration to the Electron process, not to renderer source:

```bash
BOTAPP_COMPASS_AI_RELAY_URL="https://your-backend.example/api/instagram-dashboard/compass/analyze" \
"/Users/admin/Projects/BotApp/release/mac-arm64/BotApp.app/Contents/MacOS/BotApp"
```

Server/relay environment:

- OpenAI provider key on the backend relay server only; see the backend deployment guide for the exact server env name.
- `COMPASS_AI_ENABLED=true` on the relay server.
- `COMPASS_AI_PROVIDER=openai` on the relay server.
- `COMPASS_AI_MODEL=gpt-5.5` on the relay server.
- Optional `BOTAPP_RELAY_API_KEY` on both relay server and BotApp runtime for scoped relay authentication.

BotApp environment:

- `BOTAPP_COMPASS_AI_RELAY_URL` or the saved relay URL from `API / Webhooks / Keys`.
- Optional `BOTAPP_RELAY_API_KEY` for relay authentication.

Final API/Webhooks/Keys production setup:

- Each Mac is configured from the packaged BotApp UI. Operators do not need `npm run dev`, a terminal, or an OpenAI key on the Mac.
- The `API / Webhooks / Keys` tab owns the install-time checklist: relay URL, relay auth token, Compass health, server provider-key status, saved local webhooks, AI modules, and backend-pending API gateway contracts.
- Electron main persists relay config in the app `userData` directory. The relay URL is non-secret. The relay token is accepted by the renderer only as a write-only password field and is never returned in status payloads; status exposes only `relayKeyConfigured`.
- Webhook definitions can be saved locally from Electron main. URLs are returned masked to the renderer; signing values are accepted write-only and not returned. Until Keychain/secure storage is added, these local signing values are stored in the Electron `userData` config file with `0600` permissions.
- Scoped-key metadata is represented as relay-ready contracts. Backend generation/rotation/revocation remains server-owned; BotApp shows an empty/backend-pending state until a real key registry is connected.
- Recent API calls and public access/tunnel controls are product-ready contracts. BotApp shows empty/backend-pending states until a real relay traffic source or tunnel manager is connected.
- Future AI modules such as Comment AI, Targeting AI, DM AI, Caption AI, and Risk AI must be displayed as planned/backend-pending unless their backend relay contracts are live.

Multi-Mac install flow:

1. Install and open packaged BotApp on the Mac.
2. Open `API / Webhooks / Keys`.
3. Enter the production relay analyze URL, for example `https://dashboard.example/api/instagram-dashboard/compass/analyze`.
4. Enter the scoped relay token for that Mac/operator if relay auth is enabled.
5. Click `Save relay config`.
6. Click `Test relay connection`; health must show relay reachable and server provider key configured.
7. Open Compass and run `Analyze now`; BotApp sends the safe snapshot through Electron main to the relay.

Safe integration metadata prepared for future relay calls:

- `machine_id`: safe local machine identifier, never a device serial or hardware secret.
- `operator_id`: safe operator/user id when available.
- `external_user_id`: supplied as `X-External-User-Id` for audit attribution.
- `request_id`: supplied as `X-Request-Id` for every relay request.
- `idempotency_key`: supplied as `X-Idempotency-Key` for writes/retries.

---

## 2. Technical architecture

### Stack

- **Vite** — dev server (`http://127.0.0.1:5173/`) and production renderer build
- **React + TypeScript** — views, drawers, state
- **Electron** — macOS desktop shell
- **electron-builder** — `npm run package:mac` → `release/mac-arm64/BotApp.app`
- **CSS tokens** — `src/design/tokens.css`, shared component styles
- **scrcpy** — external binary used by the phone-level View action on operator Macs

### Repository layout

```text
electron/                 # Main process, window lifecycle
src/
  api/                    # types.ts, local client, future relay client
  app/                    # App shell, routes, global modals/toasts
  data/                   # Deterministic fixtures (profile-mock-data.ts, mock-data.ts)
  desktop/                # Renderer-safe desktop IPC wrappers
  design/components/      # Badge, Button, Card, Drawer, Input, Modal, Table, …
  layout/                 # Sidebar, TopBar
  security/               # redaction helpers
  views/                  # Top-level screens
  views/devices.css       # Compact Devices inventory layout
  views/profiles/         # Profiles module (checkpoint focus)
    drawers/              # Stats, Logs, Targets, Settings, Filters, AddProfile
    ProfileToolbar.tsx
    run-control.ts        # Start/Stop payload builders + eligibility
    profiles.css
public/avatars/           # Safe packaged SVG avatars only
docs/                     # Developer documentation
```

### App shell

`src/app/App.tsx` loads fixture data via `mockClient`, renders sidebar + topbar + active route, and handles:

- global action confirmation modals (preview-only)
- command palette navigation
- toast feedback for profile actions

### Profiles module

`ProfilesView.tsx` is the checkpoint centerpiece:

- phone/device groups with compact summary (`N profiles · running|ready|idle`)
- platform filter chips (All / Instagram / TikTok)
- search across username, package, phone, timeslot
- dense profile toolbar per account row (View is phone-level, not account-level)
- phone-level View button in each phone group header, backed by Electron device-view IPC and `scrcpy`
- open phone views dock with Android-style green indicators
- local drawer state for Stats, Logs, Targets, Settings, Filters
- Add Profile wizard
- Start/Stop confirmation modals with payload preview
- Auto Login progress + verification-code modals
- Assign Now, Archive/Delete lifecycle, and Check Login/Readiness confirmations

### Phone View / scrcpy

The phone mirror is owned by the Electron main process:

- renderer calls `window.botappDesktop.deviceViews.*` through `src/desktop/device-views.ts`
- preload exposes a narrow IPC bridge, not a generic shell bridge
- main process starts one `scrcpy` process per phone serial and focuses the existing window on duplicate opens
- `BOTAPP_SCRCPY_PATH` can point to a custom `scrcpy` binary
- `BOTAPP_DEVICE_SERIAL_MAP` can map fixture phone ids/labels to local serials for development (`phone_01:YOUR_ADB_SERIAL_1,phone_02:YOUR_ADB_SERIAL_2`)
- `.botapp.devices.local.example.json` documents the local override shape; `.botapp.devices.local.json` is gitignored
- no ADB serial is hardcoded into product source; fixture ids are labels only
- process cleanup runs when the phone window closes or the app exits

### Devices module

`src/views/Devices.tsx` mirrors the dashboard admin Devices/Add Phone contract in a compact Mac operator view:

- 41 saved phones with 40 active and 1 offline fixture row
- two-column phone list, phone-style sidebar icon, status/latency/profile-count badges
- right-side action panel: Add, Open All, Close All, Restart All, History, Edit, Delete
- Add Phone drawer follows admin `add_physical_phone` fields: display name, ADB serial, pool, model/product/device, max clones, hub label/port, host label, standard Instagram package set
- Open All / Close All use the phone-view bridge and target only locally mapped available phones
- Restart All and per-phone restart prepare `restart_all_phones` / `restart_phone` payloads for the future secure device-control relay
- History/Edit/Delete are safe drawers/modals only; no real mutation is performed from BotApp

### Shared Filters implementation

**Single source of truth:** `src/views/profiles/drawers/FilterSettingsPanel.tsx`

Used by:

- toolbar **Filters** drawer (`FiltersDrawer.tsx`)
- Settings tab **Filters** (`SettingsDrawer.tsx`)

Shared helpers:

- `sameFiltersDraft` — dirty detection
- `filtersValidationError` — min/max validation
- `buildFiltersSavePayload` — admin PATCH shape for `/settings/follow-filters`

Runtime-ready editable fields: `skipPrivateProfiles`, `minFollowers`, `maxFollowers`, `minPosts`.

Planned/read-only (admin parity): skip follower/following, business filters, private/DM toggles, min/max following, bio/name word lists.

Payload previews strip internal `mock_only` flags from JSON display.

### Local data layer

| Module | Purpose |
|--------|---------|
| `src/api/mock-client.ts` | Implements `BotAppClient`; simulates latency |
| `src/data/profile-mock-data.ts` | Profile rows, stats, logs, targets, settings, filters |
| `src/data/mock-data.ts` | Devices, notifications, global targets, app settings |
| `src/api/botapp-client.ts` | Future relay stub (`notConnectedYet`) |

Replace or wrap `mockClient` with a real client when the relay is validated. Keep types in `src/api/types.ts` as the contract boundary.

---

## 3. Checkpoint status (Profiles + Devices + Client Accounts + Credentials)

### Done in this checkpoint

| Feature | Notes |
|---------|-------|
| Profiles phone groups | Grouped by device; status badge; simplified summary |
| Sidebar | Icon-only nav with hover labels, counters, phone icon for Devices |
| Devices inventory | Two-column phone table, 41 saved / 40 active / 1 offline |
| Devices actions | Add Phone, Open All, Close All, Restart All, History, Edit, Delete |
| Client Accounts | Renamed tab; strict admin parity worklist with users-group sidebar icon |
| Client Accounts KPIs | Total, Active, Pending, Onboarding, Paused, Cancelled, Needs assistance |
| Client Accounts filters | All, Active, Pending, Onboarding, Paused, Cancelled, Needs assistance |
| Client Accounts table | Account, Email, Password, 2FA, Created At, Status, Actions |
| Client Accounts actions | View account, open credentials worklist, request password update, status menu |
| Credentials worklist | Lock-icon tab with compact cards for password, verification, credentials, and review actions |
| Credentials data contract | Future relay reads from `account_dashboard_actions`, `account_credentials`, `client_instagram_accounts`, manage overview, and radar overview |
| Credentials action contract | Password update, submit verification code, and mark reviewed map to dashboard admin routes through the secure relay |
| Activity Log investigation | Search by CT, search by interacted account, recent interactions, evidence summary, and CT archive/remove relay payload |
| Activity Log evidence contract | Future relay should read admin projection `activity_log_interaction_evidence_admin_v1` / `get_activity_log_interaction_evidence_admin`; BotApp never opens Supabase directly |
| Server Check boundary | Future owner of technical/runtime/system logs; Activity Log must not become a raw worker log table |
| Add Phone | Admin parity with `add_physical_phone`; relay-ready only |
| Local device mapping | `BOTAPP_DEVICE_SERIAL_MAP`, gitignored `.botapp.devices.local.json`, example placeholders only |
| Complete toolbar | Stats, Logs, Targets, Start, Auto Login, Check Login, Stop, Settings, Filters, Assign Now, Archive, Delete |
| Add Profile | Six-step wizard; admin create contract payload |
| Stats drawer | Follow-back / like-back columns; Save Stats |
| Logs drawer | Live console simulation, pause/resume, filters, redacted export |
| Targets drawer | Admin parity: stats, filters, add/bulk, archive, reset, restore, CSV/JSON |
| Start / Stop | Eligibility projection, payload preview, secure-relay copy |
| Settings tabs | General, Schedule, Follow, DM, Followback, Sources, **Filters** |
| Filters parity | Toolbar drawer = Settings Filters tab (shared panel) |
| UI wording | No visible “mock” in operator labels |
| Mac packaging | Electron Builder, relative Vite assets, asar |
| Security | Redaction, no secrets in bundle, no-leak validation |

### Still preview-only (no backend mutation)

- All Save / Create / Start / Stop / Targets mutations
- Realtime log WebSocket
- CT validation and avatar relay
- Device control and worker dispatch
- Devices Add/Edit/Delete/Restart execution
- Client Accounts status mutations (`/api/instagram-dashboard/accounts/status` PATCH equivalent)

---

## 4. Security

See `docs/security.md` for the full checklist. Non-negotiable rules:

- No Supabase service role in BotApp
- No direct DB from renderer
- No secrets or credential headers in source or bundle
- No password display; credentials write-only in Add Profile flow
- No raw XML, screenshot paths, HAR, or device log paths in UI/exports
- Exports pass through `redactText()` / `redactRecord()`
- Avatars: packaged SVG or future same-origin relay only

Before every checkpoint commit:

```bash
npm run lint
npm run build
npm run package:mac
git diff --check
# no-leak scans: diff additions, untracked src/docs/public, app.asar
```

Never commit: `dist/`, `release/`, `.env*`, logs, screenshots, temp inspection folders.

---

## 5. Future sync

| Domain | Admin contract (target) | BotApp today |
|--------|-------------------------|--------------|
| Profiles list | account APIs | local fixtures |
| Stats | dashboard stats routes | local fixtures |
| Logs | runtime / account run logs via relay | simulated live stream |
| Targets | `ig_targets`, CT jobs | local list + admin-parity UI |
| Settings | `/api/instagram-dashboard/settings` | tabbed drawer + payloads |
| Filters | `/settings/follow-filters` PATCH | shared panel + payload |
| Sources | follow-sources settings | package-aware defaults |
| Start/Stop | run request / stop relay | payload preview only |
| Auto Login | `connect/now` / `login_provisioning` | progress and code UI, payload preview only |
| Assign Now | `assignments/now` | candidate and payload preview only |
| Archive/Delete | account lifecycle route | 30-day archive/trash policy preview only |
| Check Login / Readiness | `readiness/now` / `login_provisioning` | readiness projection and payload preview only |
| Devices overview | `devices_overview`, `phone_devices`, `phone_app_instances` | local 41-phone inventory |
| Add Phone | `add_physical_phone` via admin-dashboard relay | drawer + payload preview only |
| Device control | future secure device-control relay | phone view IPC only; restart payload preview only |
| Credentials actions | `account_dashboard_actions`, `account_credentials`, `client_instagram_accounts` | focused worklist + relay-ready action payloads only |
| Activity investigation | `ig_interacted_users`, `ig_targets`, `ct_target_audit_events`, `ig_runs`, `account_run_requests` | local interaction evidence projection + safe exports only |
| Compass AI Advisor | `/api/instagram-dashboard/compass/analyze` | safe snapshot + relay contract preview only; no provider call from renderer |
| Server Check | `runtime_events`, `ig_action_logs`, heartbeats, incidents, delivery/process logs | future tab; not rendered in Activity Log |
| Operational email | dashboard client onboarding + future provider/queue/template | pending relay contract only; no real send claim |
| Avatars | sanitized proxy URL | `/avatars/*.svg` |

Sync order recommended: **read-only API** → guarded writes → realtime events.

---

## 6. Developer onboarding

```bash
cd /path/to/BotApp
npm install
npm run dev          # http://127.0.0.1:5173/
npm run lint
npm run build
npm run package:mac  # release/mac-arm64/BotApp.app
```

Workflow:

1. Read `AGENTS.md` / Phone Farm architecture if touching worker-adjacent contracts.
2. Read applicable `docs/` files before editing drawers or API types.
3. Extend existing primitives in `src/design/components` before adding new abstractions.
4. Keep operator UI free of “mock” wording; document preview-only behavior in docs.
5. Run full validation before checkpoint commits.
6. One checkpoint commit per milestone; do not commit build artifacts.

### Never do

- Wire Supabase or admin URLs directly in renderer
- Enable real mutations without relay + audit review
- Commit secrets, `.env`, `release/`, or raw runtime artifacts
- Copy real sensitive target lists or credentials into fixtures

---

## 7. Immediate roadmap

Profiles toolbar/settings/drawers, Devices, Client Accounts, Credentials, and Activity Log investigation are complete for this checkpoint pending validation. The next large milestone is dashboard/admin parity for interaction search and the secure BotApp API relay.

1. Dashboard admin Activity Log replacement with the same Interaction Investigation Lab UX.
2. BotApp API relay — read-only profiles/stats/targets/client accounts/credentials actions/interaction evidence.
3. Guarded write actions (settings, filters, targets, runs, credential action updates, CT archive/remove).
4. Dashboard client onboarding email capture/validation and real provider/queue/template wiring.
5. Future Server Check for runtime/system logs and health signals.
6. Automated tests for filters validation, target export redaction, run-control payloads, avatar sanitizer, credential redaction, and activity evidence redaction.

Each toolbar action must be inspected first in `boost-ai-frontend` before implementation: role, enabled/disabled states, modals/drawers, endpoints, RPC/tables, payloads, validations, and backend effects. BotApp should prepare future types/payloads but must not execute real mutations until the secure relay is validated.

Auto Login mirrors the admin dashboard's `Connect`/`login_provisioning` contract as a desktop-prepared request: account id, action type, source, idempotency key, device assignment context, and safe metadata. Verification-code payloads are modeled separately and must be sent only through the future secure relay; BotApp must not log codes, passwords, token material, Vault identifiers, raw XML, screenshot paths, Supabase service credentials, worker invocations, or direct device login actions.

### Client Connect — open phone via BotApp only

When the client dashboard shows `verification_required`, the browser never opens scrcpy. It creates a bounded `open_device_view` intent and hands off `botapp://open-device-view?intent=…`. BotApp (relay-authenticated) redeems the intent through `POST /api/instagram-dashboard/botapp/open-device-view`, receives the **already assigned** phone serial, and opens/focuses the local scrcpy view. No run start, assignment, or arbitrary device selection is allowed on this path. IPC: `botapp:connect:open-device-view`.

Assign Now mirrors the admin dashboard's `assignments/now` contract as a desktop-prepared request: account id, target device label, safe serial label, candidate slot, schedule gate, runtime profile, idempotency key, and safe metadata. The real relay must keep `assign_account_slot`, app instance identifiers, phone device identifiers, and Supabase credentials server-side.

Archive/Delete mirror the admin dashboard's account lifecycle contract as desktop-prepared requests. Archive maps to `action: "archive"` with `status = archived` and `scheduled_trash_at = now + 30 days`; Delete maps to `action: "trash"` with `status = trashed` and `scheduled_delete_at = now + 30 days`. Restore and permanent delete are modeled in types for future relay work, but BotApp does not call Supabase directly and the current admin permanent-delete action remains disabled/pending.

Check Login / Readiness mirrors the admin dashboard's `readiness/now` contract as a desktop-prepared request: account id, admin audience, `login_provisioning` requested run type, idempotency key, and safe metadata. BotApp displays only safe readiness/client status, reason, next action, assignment availability, and future relay payload; the real backend must re-check credentials, lifecycle, assignment, phone/app availability, active runs, idempotency, and enqueue the preflight server-side.

---

## Related documents

- `docs/architecture.md` — short technical summary
- `docs/profile-drawers.md` — drawer-by-drawer behavior
- `docs/security.md` — no-leak rules
- `docs/roadmap.md` — checkpoint history and next steps
- `src/desktop/README.md` — packaging notes

## App instance reprovision/rebind contract

BotApp may display and prepare this workflow, but must never infer a DB identity from a friendly phone label or a local serial alias. The canonical tuple is `phone_devices.id + adb_serial + phone_app_instances.id + instance_index + package_name + account_id`.

Any future destructive action must call a server-side preflight that proves zero active work, captures the immutable old mapping, creates a new app-instance lineage, and requires Identity Guard plus app-version compatibility before scheduler rearm. Local device mappings remain convenience-only. Canonical protocol: `/Users/admin/Projects/boost-ai-frontend/docs/PHONE_FARM_APP_INSTANCE_REPROVISION_AND_REBIND_PROTOCOL.md`.
