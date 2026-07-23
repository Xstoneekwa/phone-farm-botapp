# Profiles Drawers

The Profiles screen is the main operator workspace. Each profile row exposes a toolbar of preview actions and drawers. This document describes the current drawer behavior and future integration points.

## Add Profile

File: `src/views/profiles/drawers/AddProfileDrawer.tsx`

Current behavior:

- Six-step local wizard.
- Collects profile/platform/package/device metadata for preview.
- Does not write backend data.
- Does not store or expose credentials.

Future integration:

- Submit through a secure BotApp API relay.
- Reuse admin/client account creation contracts.
- Keep credential handling outside the renderer.

## Stats

File: `src/views/profiles/drawers/StatsDrawer.tsx`

Current behavior:

- Displays local fixture session stats.
- Shows follower/following, follow/unfollow/like/comment/DM/watch counts.
- Shows follow-back and like-back state as clear enabled/off badges.

Future integration:

- Read paginated profile runtime stats through the relay.
- Keep aggregate values safe for client/operator display.

## Logs / History

File: `src/views/profiles/drawers/LogsDrawer.tsx`

Current behavior:

- Local live-style structured log console.
- Auto-scroll with pause/resume.
- New log indicator.
- Level, phase, and errors-only filters.
- Redacted TXT/JSON export.
- No local filesystem log reads.

Future integration:

- Subscribe to realtime worker/runtime events through the BotApp relay.
- Keep event payloads structured and already redacted.
- Avoid raw XML, screenshots, local paths, device serials, or secrets in renderer logs.

## Targets

File: `src/views/profiles/drawers/TargetsDrawer.tsx`

Current behavior:

- Admin parity table for CT/target accounts.
- Packaged runtime reads safe target rows through `botapp:profiles:details` and
  `/api/instagram-dashboard/profiles/:account_id/details`; development keeps a
  local fixture fallback only when the desktop relay is unavailable.
- Stats cards for total, valid/eligible, archived, pending/review, and rejected.
- Search and list filters.
- Local add single target.
- Local bulk import.
- Local archive/delete selected.
- Local reset to pending verification.
- Local restore from archived state.
- Redacted CSV/JSON export.
- Safe avatar display with fallback initials.
- No horizontal table scroll.
- Dark readable hover state.
- Added is `added_at || created_at`, where the backend projection guarantees
  `added_at = ig_targets.created_at`; `updated_at` is never used as Added.
- Missing Added renders `—`; Refresh cannot move the date. Last used remains
  `last_used_at`.
- Sent renders a numeric zero as `0` and missing data as `—`.
- FBR keeps `Not measured` distinct from a certified `0%`. Perf keeps Pending,
  Insufficient, Bad, Average and Good as distinct states.

Canonical metric details and the Admin/Client/BotApp parity matrix are mirrored
from the backend `docs/target-metrics-contract.md` checkpoint.

Future integration:

- Keep every read/write on the secure BotApp API relay.
- Preserve the shared admin targets payload and null/zero semantics.
- Add and bulk add should queue server-side validation.
- Delete should archive, never hard-delete from the desktop.
- Reset should use server-side reset and pending verification.
- Restore should use lifecycle restore logic and queue validation if needed.

## Settings

File: `src/views/profiles/drawers/SettingsDrawer.tsx`

Current behavior:

- Existing drawer with tabs and profile settings preview.
- Reads local settings fixtures.
- Confirmation prepares a future relay payload.

Future integration:

- Audit against dashboard admin/client settings contracts before changing behavior.
- Split read-only operator state from writable settings.
- Route writes through the BotApp relay with audit events.

## Filters

Files:

- `src/views/profiles/drawers/FilterSettingsPanel.tsx` — shared UI + validation + payload
- `src/views/profiles/drawers/FiltersDrawer.tsx` — toolbar entry
- `SettingsDrawer.tsx` — Settings > Filters tab (same panel)

Current behavior:

- Single shared panel for toolbar Filters and Settings Filters.
- Runtime-ready editable: skip private, min/max followers, min posts.
- Planned read-only fields mirror admin (follower/following, business, word lists).
- Save Filters prepares admin PATCH payload; no backend mutation.

Future integration:

- Audit against admin/client filter semantics.
- Preserve safety around private/business/follower count filters.
- Validate values server-side through BotApp relay before persistence.

## Toolbar Actions

Phone-level action:

- View — lives in each phone group header, opens or focuses the phone mirror for that device serial through Electron device-view IPC and `scrcpy`.

Account toolbar actions currently include:

- Start
- Auto Login — prepares the admin `Connect`/`login_provisioning` contract, opens a confirmation modal, then shows a progress modal with redacted process logs and a verification-code challenge modal when required.
- Stop
- Assign Now — prepares the admin `assignments/now` contract, opens a single confirmation modal, and previews the current assignment candidate without starting a run.
- Archive — prepares the admin account lifecycle `archive` contract, shows the 30-day scheduled Trash policy, and previews the future relay payload without mutating `ig_accounts`.
- Delete — prepares the admin account lifecycle `trash` contract, explains restore availability for 30 days and the pending permanent-delete cleanup, and previews the future relay payload without mutating `ig_accounts`.
- Check Login — prepares the admin `readiness/now` contract for `login_provisioning`, shows safe readiness/client status, and previews the future relay payload without starting a Growth session.

Each action requires dashboard admin contract inspection before implementation because these buttons have different states, modals, payloads, validations, and backend effects. BotApp must prepare future secure-relay payloads without executing real mutations.

Auto Login uses reusable UI/data concepts that can move later to the client dashboard: progress steps, process-log entries, code challenges, code-submit payloads, and final status are modeled separately from the BotApp screen. The current desktop flow does not call Supabase, does not launch workers, and does not execute device actions; the real branch must go through a secure relay.

Assign Now mirrors the admin dashboard's one-click assignment repair path: no slot picker, no progress modal, and no run start. The future relay must call the admin-equivalent assignment endpoint/RPC chain and return only safe status/message data.

Archive/Delete mirror the admin dashboard's account lifecycle route: `archive` writes an archived state and `scheduled_trash_at = now + 30 days`; `trash` writes a trashed state and `scheduled_delete_at = now + 30 days`; `restore` clears lifecycle timestamps. The current admin dashboard stores and displays the 30-day timestamps but does not expose a working permanent-delete action or cleanup job yet.

Check Login / Readiness mirrors the admin dashboard's `readiness/now` route. The current desktop flow prepares an admin-audience payload for a future secure relay, keeps `requested_run_type = "login_provisioning"`, and displays only safe status, reason, next action, assignment availability, and expected preflight behavior. It does not call Supabase, create account run requests, launch workers, or read phone/device internals from the renderer.

## Settings > Follow — Active SAST Days V1

Configured account limits remain editable and persistent:

- Follow cap/day;
- Follow cap/session.

Today effective limits are read-only:

- active warmup day and cap;
- package cap;
- effective day/session cap;
- limiting source and reason.

Refresh/polling updates only the projection. Save cannot persist warmup day
caps. The fallback badge label is exactly `operator review`; specific identity,
quota, device, preflight and scheduler labels keep their existing priority.
