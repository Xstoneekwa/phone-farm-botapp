# Profiles Drawers

The Profiles screen is the main operator workspace. Each profile row exposes a toolbar of preview actions and drawers. This document describes the current drawer behavior and future integration points.

## Add Profile

File: `src/views/profiles/drawers/AddProfileDrawer.tsx`

Current behavior:

- Six-step mock wizard.
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

- Displays mock session stats.
- Shows follower/following, follow/unfollow/like/comment/DM/watch counts.
- Shows follow-back and like-back state as clear enabled/off badges.

Future integration:

- Read paginated profile runtime stats through the relay.
- Keep aggregate values safe for client/operator display.

## Logs / History

File: `src/views/profiles/drawers/LogsDrawer.tsx`

Current behavior:

- Mock-live structured log console.
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
- Stats cards for total, valid/eligible, archived, pending/review, and rejected.
- Search and list filters.
- Mock add single target.
- Mock bulk import.
- Mock archive/delete selected.
- Mock reset to pending verification.
- Mock restore from archived state.
- Redacted CSV/JSON export.
- Safe avatar display with fallback initials.
- No horizontal table scroll.
- Dark readable hover state.

Future integration:

- Read/write through a secure BotApp API relay.
- Mirror admin targets endpoints and payloads.
- Add and bulk add should queue server-side validation.
- Delete should archive, never hard-delete from the desktop.
- Reset should use server-side reset and pending verification.
- Restore should use lifecycle restore logic and queue validation if needed.

## Settings

File: `src/views/profiles/drawers/SettingsDrawer.tsx`

Current behavior:

- Existing mock drawer with tabs and profile settings preview.
- Reads local mock settings.
- Confirmation remains mock-only.

Future integration:

- Audit against dashboard admin/client settings contracts before changing behavior.
- Split read-only operator state from writable settings.
- Route writes through the BotApp relay with audit events.

## Filters

File: `src/views/profiles/drawers/FiltersDrawer.tsx`

Current behavior:

- Existing mock filter form.
- Reads local mock filters.
- Save action is preview-only.

Future integration:

- Audit against admin/client filter semantics.
- Preserve safety around private/business/follower count filters.
- Validate values server-side before persistence.

## Toolbar Actions

Preview-only actions currently include:

- Start
- Auto Login
- Stop
- View
- Assign Now
- Archive
- Delete

Next parity target is Start / Stop. These actions require admin/dashboard contract inspection before implementation because they have runtime and safety implications.
