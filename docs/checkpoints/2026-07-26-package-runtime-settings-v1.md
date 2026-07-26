# Package runtime settings V1 — 2026-07-26

BotApp Profiles > Settings now consumes the backend
`packageRuntimeContract` projection for all critical package values. The UI
separates:

- configured package/account limits persisted in Supabase;
- temporary warmup limits;
- effective runtime limits after package, warmup and operations hard caps.

Follow day/session, Unfollow day/session, target rotation and package/runtime
identity are not inferred from package labels. Missing contract data is shown
as `Configuration incomplete`, and critical saves are disabled until the
contract is ready. Legacy `follow_limit` and `max_follow_per_run` remain visible
only as read-only diagnostic evidence.

This checkpoint does not start a run, issue an Auto Login request, use ADB or
touch a phone. Packaging must use the canonical clean BotApp lineage, pass the
Node test/build suite, verify local Electron requires, sign/verify the arm64 app,
scan the bundle for secrets and preserve a recoverable backup of the installed
application.
