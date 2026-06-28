# BotApp Handoff

This handoff captures the current implementation checkpoint for future developers and agents working on BotApp.

## Project State

- Repository: BotApp workspace root
- Branch: `botapp-mac-foundation`
- Mode: local-data macOS app foundation, prepared for future secure relay
- Current checkpoint: Profiles actions, settings, drawers, Devices inventory, Client Accounts admin parity, Credentials worklist, Activity Log investigation, and phone-level View complete
- Backend posture: no real backend calls, no Supabase direct access, no worker/device mutations

## Completed In This Checkpoint

### Profiles Screen

- Phone-first grouping with profile rows assigned to devices.
- Search across username, display name, package, phone, platform, and timeslot.
- Instagram/TikTok platform marks.
- Compact operator-focused row layout.
- Phone-level View button in each phone group header:
  - opens the live phone mirror for the device serial;
  - focuses the existing phone view if already open;
  - shows Android-style green open indicators.
- Profile toolbar per account:
  - Stats
  - Logs / History
  - Targets
  - Start
  - Auto Login
  - Check Login
  - Stop
  - Settings
  - Filters
  - Assign Now
  - Archive
  - Delete

All write/action operations are prepared for the future secure relay only.

### Activity Log

- Sidebar uses an investigation/search icon, not a generic list symbol.
- Product role: Interaction Investigation Lab for CT-source and interacted-account analysis.
- Modes: Search by CT, Search by Account, Recent interactions, Disputes / Evidence.
- Supported local contracts:
  - search by CT source;
  - search by interacted username;
  - period filters 24h / 7d / 30d;
  - action type and client account filters;
  - safe evidence summary copy/export;
  - relay-ready CT archive/remove payload.
- This tab must not render raw runtime, worker, system, delivery, device diagnostic, or process logs. Those belong in the future Server Check tab.
- Dashboard admin should converge on the same Activity Log concept. Client dashboard reuse must be tenant-scoped and must hide internal device/run details.

### Add Profile Drawer

- Six-step local wizard for adding an Instagram profile.
- Captures package/device/profile metadata in preview mode.
- Does not submit credentials or create real backend records.

### Stats Drawer

- Session rows with follower/following stats.
- Follow-back and like-back state exposed as clear enabled/off badges.
- Existing table retained as local historical stats.

### Logs / History Drawer

- Local live-style console experience.
- Structured log levels, phases, sources, action status, run/request IDs.
- Auto-scroll pause/resume.
- New logs indicator.
- Search, level filter, phase filter, errors-only mode.
- Clear/refresh controls.
- Redacted TXT and JSON export.
- No local log file reads.

### Targets Drawer

- Aligned with the dashboard admin target contract.
- Stats cards: total, valid/eligible, archived, pending/review, rejected.
- Search and list filters:
  - All
  - Active / valid
  - Pending / review
  - Rejected
  - Archived / deleted
- Admin-style columns:
  - checkbox
  - Username with avatar/fallback
  - Verification
  - Eligibility
  - Followers
  - Perf
  - FBR
  - Sent
  - Last used
  - Added
  - Actions
- Local add single, bulk add, archive/delete selected, reset, restore, refresh.
- CSV/JSON export of visible filtered rows with redaction.
- No horizontal table scroll.
- Dark readable hover state fixed for all target rows.
- Avatars use safe relative mock assets only; future real avatars must come through a relay/proxy.

### Packaging

- Vite build works.
- Electron packaging works through `npm run package:mac`.
- Packaged renderer uses relative Vite base to avoid black screen in Electron.
- `release/` and `dist/` remain build artifacts and should not be committed.

### Devices Tab

- Compact Devices workspace matches the target operator layout:
  - `41 saved`, `40 active`, `1 offline`;
  - two-column phone list;
  - phone-style sidebar icon;
  - right-side action panel.
- Phone rows show view icon, phone label, short fixture serial, profile count, latency, status, and per-phone restart.
- Fixtures use fake serials only. Product source must not include personal ADB serials.
- `BOTAPP_DEVICE_SERIAL_MAP` maps local fixture ids to real phones during development.
- `.botapp.devices.local.example.json` is safe to commit; `.botapp.devices.local.json` is gitignored.
- Open All / Close All operate on phone views only, target mapped available phones, and ignore unavailable fixtures.
- Add Phone drawer follows dashboard admin `add_physical_phone` fields.
- Restart All / Restart phone prepare secure relay payloads only.
- History/Edit/Delete are prepared safe UI paths only and do not mutate backend/device state.

### Client Accounts Tab

- Sidebar label renamed to `Client Accounts` with users-group icon.
- Strict dashboard admin parity — no extra search, no detail drawer, no extra columns.
- KPIs: Total, Active, Pending, Onboarding, Paused, Cancelled, Needs assistance.
- Filters: All, Active, Pending, Onboarding, Paused, Cancelled, Needs assistance.
- Table columns: Account, Email, Password, 2FA, Created At, Status, Actions.
- Row actions: view account, open credentials worklist, request password update, status menu.
- Status menu actions prepared: pause, cancel, mark_needs_assistance, reactivate.
- Local projection in `src/data/client-accounts-data.ts`; future sync via secure relay only.
- No direct Supabase/DB access; no secrets, passwords, tokens, or raw artifacts in UI/bundle.

### Credentials Tab

- Sidebar tab `Credentials` uses a lock icon.
- Mirrors the useful operator subset of admin `/instagram-dashboard/credentials-actions`:
  - KPIs: Open actions, Password updates, Verification codes, Needs review, Client action required.
  - Filters: All, Password, Verification code, Credentials, Needs review, Completed.
  - Cards show account, client, action type, status, priority, safe credential/login status, assigned phone, age/update labels, source, and recommended next action.
- Client Accounts key icon opens this tab with the selected account context.
- Actions are prepared for a future secure relay only: open account, request password update, enter verification code, mark reviewed, refresh.
- Relay targets:
  - password update: `/api/instagram-dashboard/client-accounts/password-update-request`;
  - verification code: `/api/instagram-dashboard/dashboard-actions/submit-verification-code`;
  - mark reviewed: `/api/instagram-dashboard/dashboard-actions/review`.
- The UI never displays passwords, full secret refs, Vault UUIDs, tokens, verification codes, raw payloads, XML, screenshot paths, or ADB serials.
- Future real reads should come through the secure relay from `account_dashboard_actions`, `account_credentials`, `client_instagram_accounts`, `ig_accounts`, manage overview, and radar overview.
- Real email sending is intentionally out of scope here. Client onboarding in the dashboard client should capture/validate the client email and later provide the provider/queue/template used by password update and operational notifications. Until then, email delivery stays relay-ready/pending.

### Phone-Level View

- `electron/device-view-manager.cjs` owns `scrcpy` processes in the Electron main process.
- `electron/preload.cjs` exposes a narrow `botappDeviceViews` IPC bridge.
- `src/desktop/device-views.ts` is the renderer wrapper for opening/focusing/listing phone views.
- `BOTAPP_SCRCPY_PATH` can point to a custom `scrcpy` binary.
- `BOTAPP_DEVICE_SERIAL_MAP` can map local fixture phones to dev serials.
- Product code must not hardcode ADB serials; duplicate opens focus the existing phone view.

## Contracts To Preserve

### Target / CT Contract

BotApp types intentionally mirror the dashboard admin target model:

- `status`
- `verification`
- `eligibility` / quality
- `performance`
- `archivedAt`
- `deletedAt`
- reset to `pending_verification`
- restore from archived state

Future real CT validation must use the admin-backed flow:

- `ig_targets`
- `ct_target_verification_jobs`
- `ct_target_audit_events`
- admin route equivalent of `/api/instagram-dashboard/targets`
- admin route equivalent of `/api/instagram-dashboard/targets/reset`

BotApp should call a secure BotApp API relay. The renderer must not validate CTs directly, scrape Instagram, or connect to Supabase.

### Avatar Contract

- BotApp type field: `ProfileTarget.avatarUrl`.
- Admin equivalent: `avatar_url`.
- Current mock accepts `/avatars/*.svg`.
- Future production should use a same-origin relay endpoint such as `/api/botapp/instagram-dashboard/avatar?kind=target&id=...`.
- Raw external avatar URLs must not be fetched directly by the renderer.

## Security Invariants

Never introduce:

- Supabase service role in desktop app.
- Direct Supabase client in renderer.
- Password display.
- Full Vault UUIDs or secret refs.
- Raw XML, screenshots, local artifact paths, HAR content, or raw logs in UI/export.
- Real backend mutations from mock buttons.
- Direct worker dispatch or ADB/device operations from these preview flows.

All exports or potentially sensitive display strings should go through `src/security/redaction.ts`.

## Known Quirks

- Some confirmation actions still trigger the global preview modal/toast behavior, which can close a drawer. This is pre-existing.
- Global `src/views/Targets.tsx` is still a simpler local route and is separate from the per-profile Targets drawer.
- Richest target fixture data is currently on `prof_002`; other profiles use fallback target rows.
- No unit tests have been added for target FBR/filter logic yet.

## Validation Checklist

Before any checkpoint commit:

- `npm run lint`
- `npm run build`
- `npm run package:mac`
- `git diff --check`
- no-leak scan on added diff lines
- no-leak scan on untracked source/docs/public files
- no-leak scan on packaged `app.asar`
- UI smoke test:
  - Profiles loads
  - Add Profile opens
  - Stats opens
  - Logs opens and exports safely
  - Targets opens, has no horizontal scroll, hover is readable, avatars/fallback render
  - Auto Login progress and code popup paths render
  - Check Login confirmation shows safe readiness status and payload only

## Device Heartbeat Service — Lifecycle, Monitoring and Recovery

### Why `ADB Connected` is not enough

A phone can appear **Connected** in BotApp Devices because local `adb devices -l` sees it on the Mac. Assignment readiness on the backend uses **`device_heartbeats.last_seen_at`** with a freshness gate of **15 minutes** (`ASSIGNMENT_HEARTBEAT_STALE_MS`). If the canonical publisher stops, ADB can stay green while the backend marks the phone stale and **blocks new client account assignment**.

### Three distinct signals

| Signal | Meaning | Source |
|--------|---------|--------|
| **ADB local** | USB/network link from Mac to phone | Local `adb devices -l` in BotApp Devices |
| **Heartbeat backend** | Last publish to Supabase `device_heartbeats` | Canonical `device_heartbeat_publisher.py` via worker env |
| **Client assignability** | Backend allows slot assignment for onboarding | Fresh `online` heartbeat + assignment capacity rules |

Devices UI shows **Connected** and **Heartbeat backend** as separate indicators. Runtime Health shows the **Device heartbeat service** supervisor state.

### Architecture

```
BotApp (Electron main)
  └─ ensureDeviceHeartbeatAutostart() on app ready
       └─ scripts/device_heartbeat_service.sh  (install / resume / restart / status)
            └─ launchd: com.boost.phonefarm.device-heartbeat (KeepAlive + RunAtLoad)
                 └─ device_heartbeat_publisher.py --serve --interval-seconds 60
                      └─ adb devices -l → runtime_heartbeat.heartbeat_device() → Supabase
```

- **No synthetic DB heartbeats** — only the publisher that reads real ADB state may write.
- **No Instagram login, runs, assignment, or phone restarts** in this path.
- **Duplicate guard** — wrapper lock + PID file + `fix-duplicate` action.

### Normal publish frequency

- **Immediate** publish on service start.
- Then every **60 seconds** (configurable via `DEVICE_HEARTBEAT_INTERVAL_SECONDS`, max 300, min 15).
- Target: stay well under the **15 minute** backend stale threshold.

### Autostart

- **BotApp open** → `ensureDeviceHeartbeatAutostart()` installs/resumes LaunchAgent if needed.
- **Mac login** → launchd `RunAtLoad` + `KeepAlive` restarts the wrapper if the process exits.
- **Independent of relay auth** — uses worker `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

### Self-heal after crash

- launchd `KeepAlive` relaunches `device_heartbeat_service.sh start`.
- BotApp reopen re-runs `ensureDeviceHeartbeatAutostart()`.
- Duplicate publishers trigger `fix-duplicate` (kill extras, kickstart LaunchAgent).

### Manual button: `Relancer les heartbeats`

- **Recovery only** — not required in normal operation.
- Calls the **canonical supervisor** (`restart` or `fix-duplicate`), never a second standalone publisher process.
- Success is declared only after a **real backend heartbeat** is confirmed via Devices inventory polling.

### Devices UI states (backend heartbeat)

| Label FR | Meaning |
|----------|---------|
| **Actif** | Fresh backend heartbeat within 15 min, status `online` |
| **Expiré** | Stale or non-online — assignment blocked |
| **Inconnu** | No backend timestamp available |
| **En attente** | Recovery poll in progress after manual restart |

### Runtime Health — Device heartbeat service

| Operator label | Meaning |
|----------------|---------|
| **Opérationnel** | Process running, last cycle OK, phones seen |
| **Dégradé** | Running but backend/cycle issue, duplicate process, or stale backend age |
| **Arrêté** | Service not running / paused |
| **Aucun téléphone détecté** | Service OK but zero ADB phones in last cycle |

### Operator checklist before adding a client account

1. Phone **Connected** in Devices (local ADB).
2. **Heartbeat backend: Actif** on each physical phone.
3. Runtime Health **Device heartbeat service: Opérationnel**.
4. **Clone available** on the target phone.

### Recovery if heartbeat expires

1. Wait ~1–2 minutes — autostart/KeepAlive may recover alone.
2. Open **Runtime Health** → Device heartbeat service → **Restart** or **Fix duplicate**.
3. If still stale: Devices → **Relancer les heartbeats** (supervisor recovery).
4. Confirm **Actif** on all Samsung/physical phones before adding accounts.

### Never do

- Write fake rows to `device_heartbeats` in SQL or scripts.
- Restart phones unnecessarily to “fix” heartbeat.
- Run Instagram login to test assignability.
- Ignore **Expiré** while onboarding clients.

### Dependencies and limits

- Worker repo path (default `/Users/admin/instagram-worker-python`).
- Worker `.env` with Supabase service credentials.
- `adb` on PATH or `ADB_PATH`.
- Registered phone rows in DB (`adb_serial` mapping) — unregistered serials are skipped honestly.
- Backend outage → degraded state, retries on next cycle; no silent success.

### Validation after BotApp install or update

1. Open BotApp — service starts without manual click.
2. Runtime Health shows **Opérationnel** (or honest **Aucun téléphone détecté** if unplugged).
3. Devices shows **Heartbeat backend: Actif** within ~60s for connected phones.
4. Wait several cycles (~5 min) — heartbeats stay fresh without clicking.
5. Quit and reopen BotApp — service resumes automatically.
6. Optional: `launchctl kickstart -k gui/$UID/com.boost.phonefarm.device-heartbeat` after controlled stop — process returns.

Logs: `logs/device-heartbeat-service/heartbeat.log` (paths redacted in UI).

## Next Work

Recommended next milestone:

`Top-level polish + BotApp API relay`

Profiles toolbar/settings/drawers, Devices, and Client Accounts are complete for this checkpoint. For future real actions, inspect `boost-ai-frontend` first and document admin role, enabled/disabled states, modals/drawers, endpoints/API/RPC/tables, payloads, validations, and backend effects. BotApp should replicate the operator UX, prepare future relay payloads, and keep execution preview-only until the secure BotApp relay is validated.

Archive/Delete are now modeled from the admin lifecycle route: archive schedules Trash after 30 days, delete means move to Trash with restore available for 30 days, and permanent delete remains pending/disabled in the admin dashboard.

Check Login / Readiness is modeled from the admin readiness route: admin audience, safe readiness/client status, `login_provisioning` future run type, idempotency key, and no Growth session start.

## Files Most Relevant To This Checkpoint

- `src/views/profiles/ProfilesView.tsx`
- `src/views/profiles/drawers/AddProfileDrawer.tsx`
- `src/views/profiles/drawers/StatsDrawer.tsx`
- `src/views/profiles/drawers/LogsDrawer.tsx`
- `src/views/profiles/drawers/TargetsDrawer.tsx`
- `src/views/profiles/AutoLoginFlowModal.tsx`
- `src/views/profiles/auto-login-flow.ts`
- `src/views/profiles/assign-now-flow.ts`
- `src/views/profiles/lifecycle-flow.ts`
- `src/views/profiles/readiness-now-flow.ts`
- `src/views/profiles/profiles.css`
- `src/views/Devices.tsx`
- `src/views/devices.css`
- `src/views/ClientAccounts.tsx`
- `src/views/client-accounts.css`
- `src/data/client-accounts-data.ts`
- `src/desktop/device-views.ts`
- `electron/device-view-manager.cjs`
- `src/api/types.ts`
- `src/data/profile-mock-data.ts`
- `src/security/redaction.ts`
- `electron-builder.json`
- `vite.config.ts`
