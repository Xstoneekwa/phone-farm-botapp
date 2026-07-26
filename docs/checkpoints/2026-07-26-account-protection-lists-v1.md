# BotApp account protection lists V1 — 2026-07-26

Status: implementation and automated verification complete; packaging/install evidence is recorded only after the final cross-task collision check and backend deployment.

Settings → Sources renders two compact account-scoped cards immediately below Target accounts / Sources:

- Unfollow whitelist — never automatically unfollowed; other interactions remain allowed unless also blacklisted.
- Interaction blacklist — blocks automated Follow, Like, Comment, Welcome DM, Outreach DM and Story Watch; it does not block Unfollow.

Both cards load canonical versioned data, show counts/source/version/update time, support add, multi-add, remove and search, and reload after ETag conflicts. Changes apply to the next session. The renderer uses only preload IPC; Electron main performs the relay-authenticated API request with `If-Match` and `Idempotency-Key`. BotApp stores no local copy and receives no Supabase service credential.

Verification: Node 22 production build, focused renderer/IPC tests and exact placement/copy checks. Packaging and a read-only drawer smoke must not start runs, touch ADB, log in, or operate a phone.

Rollback: restore the previous signed BotApp bundle. Do not mutate backend or Worker state as part of the application rollback.
