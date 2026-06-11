# BotApp Architecture — Developer Guide

BotApp is the macOS operator application for the Phone Farm Instagram system. It gives operators a dense desktop surface for phones, profiles, runtime state, logs, targets, settings, and safety-gated actions.

This document is the primary developer onboarding reference. It complements `README.md`, `HANDOFF.md`, and `SKILL.md`.

---

## 1. Product vision

### Role in Phone Farm

| Surface | Role |
|---------|------|
| **BotApp (macOS)** | Day-to-day operator UI: profiles, devices, logs, targets, settings, start/stop previews |
| **Dashboard Admin** | Source of truth for account contracts, CT validation, settings, governance |
| **Dashboard Client** | Client-safe status, targets, package configuration |
| **Python worker / runtime** | Device automation, structured logs, runtime events |
| **Future BotApp API relay** | Secure bridge between desktop and admin/client/DB/worker contracts |

### Current state (checkpoint)

BotApp is **not** connected to the real backend. All data flows through a **local projection layer** (`mockClient` + fixtures). Operator-visible labels are product-ready; write actions **prepare payloads only** and do not mutate Supabase, Instagram, ADB, workers, or devices.

### Future API relay

Production sync must follow:

```text
BotApp renderer
  -> secure BotApp API relay (scoped auth, audit, redaction)
  -> admin/client backend routes
  -> Postgres / Supabase (server-side only)
  -> worker runtime + device farm
  -> events/logs streamed back through relay (WebSocket or polling)
```

The renderer must **never** hold service-role keys, direct DB clients, or unrestricted admin URLs.

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
- No secrets, tokens, or bearer headers in source or bundle
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

Profiles toolbar/settings/drawers, Devices, Client Accounts, and Credentials are complete for this checkpoint. The next large milestone is remaining top-level screen polish and the secure BotApp API relay.

1. Remaining top-level screens polish
2. BotApp API relay — read-only profiles/stats/logs/targets/client accounts/credentials actions
3. Guarded write actions (settings, filters, targets, runs, credential action updates)
4. Dashboard client onboarding email capture/validation and real provider/queue/template wiring
5. Realtime log/event stream through relay
6. Automated tests for filters validation, target export redaction, run-control payloads, avatar sanitizer, credential redaction

Each toolbar action must be inspected first in `boost-ai-frontend` before implementation: role, enabled/disabled states, modals/drawers, endpoints, RPC/tables, payloads, validations, and backend effects. BotApp should prepare future types/payloads but must not execute real mutations until the secure relay is validated.

Auto Login mirrors the admin dashboard's `Connect`/`login_provisioning` contract as a desktop-prepared request: account id, action type, source, idempotency key, device assignment context, and safe metadata. Verification-code payloads are modeled separately and must be sent only through the future secure relay; BotApp must not log codes, passwords, token material, Vault identifiers, raw XML, screenshot paths, Supabase service credentials, worker invocations, or direct device login actions.

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
