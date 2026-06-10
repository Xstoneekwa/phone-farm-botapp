# BotApp Handoff

This handoff captures the current implementation checkpoint for future developers and agents working on BotApp.

## Project State

- Repository: BotApp workspace root
- Branch: `botapp-mac-foundation`
- Mode: mock-first macOS app foundation
- Current checkpoint: Profiles toolbar drawers and developer documentation
- Backend posture: no real backend calls, no Supabase direct access, no worker/device mutations

## Completed In This Checkpoint

### Profiles Screen

- Phone-first grouping with profile rows assigned to devices.
- Search across username, display name, package, phone, platform, and timeslot.
- Instagram/TikTok platform marks.
- Compact operator-focused row layout.
- 12-button toolbar per profile:
  - Stats
  - Logs / History
  - Targets
  - Start
  - Auto Login
  - Stop
  - View
  - Settings
  - Filters
  - Assign Now
  - Archive
  - Delete

All dangerous operations are preview-only.

### Add Profile Drawer

- Six-step mock wizard for adding an Instagram profile.
- Captures package/device/profile metadata in preview mode.
- Does not submit credentials or create real backend records.

### Stats Drawer

- Session rows with follower/following stats.
- Follow-back and like-back state exposed as clear enabled/off badges.
- Existing table retained as mock historical stats.

### Logs / History Drawer

- Mock-live console experience.
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
- Mock add single, bulk add, archive/delete selected, reset, restore, refresh.
- CSV/JSON export of visible filtered rows with redaction.
- No horizontal table scroll.
- Dark readable hover state fixed for all target rows.
- Avatars use safe relative mock assets only; future real avatars must come through a relay/proxy.

### Packaging

- Vite build works.
- Electron packaging works through `npm run package:mac`.
- Packaged renderer uses relative Vite base to avoid black screen in Electron.
- `release/` and `dist/` remain build artifacts and should not be committed.

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

- Some mock confirmation actions still trigger the global preview modal/toast behavior, which can close a drawer. This is pre-existing.
- Global `src/views/Targets.tsx` is still a simpler mock route and is separate from the per-profile Targets drawer.
- Richest target mock data is currently on `prof_002`; other profiles use fallback target rows.
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

## Next Work

Recommended next milestone:

1. Start / Stop parity with dashboard admin safety semantics.
2. Inspect Settings drawer against admin/client contracts.
3. Inspect Filters drawer against admin/client contracts.
4. Add unit tests for target filtering, FBR/performance labels, and redacted exports.
5. Define the future BotApp API relay contract.

## Files Most Relevant To This Checkpoint

- `src/views/profiles/ProfilesView.tsx`
- `src/views/profiles/drawers/AddProfileDrawer.tsx`
- `src/views/profiles/drawers/StatsDrawer.tsx`
- `src/views/profiles/drawers/LogsDrawer.tsx`
- `src/views/profiles/drawers/TargetsDrawer.tsx`
- `src/views/profiles/profiles.css`
- `src/api/types.ts`
- `src/data/profile-mock-data.ts`
- `src/security/redaction.ts`
- `electron-builder.json`
- `vite.config.ts`
