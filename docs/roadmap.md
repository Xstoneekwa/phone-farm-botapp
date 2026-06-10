# BotApp Checkpoint And Roadmap

## Latest checkpoint

**Message:** `feat(botapp): complete settings drawers and developer documentation`

**Branch:** `botapp-mac-foundation`

### Scope delivered

- Profiles phone groups with simplified summary (`profiles · running|ready|idle`)
- Sidebar icon-only layout
- 12-button profile toolbar
- Add Profile six-step wizard
- Stats drawer with follow-back / like-back columns
- Logs / History live console, pause/resume, redacted exports
- Targets drawer admin parity (no horizontal scroll)
- Start / Stop eligibility and payload preview
- Settings tabs: General, Schedule, Follow, DM, Followback, Sources, **Filters**
- **Filters parity:** toolbar Filters = Settings > Filters (`FilterSettingsPanel`)
- UI wording cleanup (no visible “mock” in operator labels)
- `+ New profile` accent button styling
- Full developer docs (`docs/botapp-architecture.md`, README updates)
- Mac packaging + no-leak validation

## Done (foundation)

- Vite / React / TypeScript / Electron
- Mock client + deterministic fixtures
- Design primitives and Profiles module
- Redaction helpers
- Relative Vite assets for packaged Electron

## Still preview-only (by design)

- Add Profile submit
- Stats / logs / targets persistence
- Settings and Filters save
- Start / Stop / Auto Login / Assign / Archive / Delete execution
- Device runtime actions
- Avatar relay and CT validation
- Realtime WebSocket log stream

## Next milestone: Devices tab

Build the Devices screen with admin parity intent:

- phone list and detail
- active session / lock state
- clone slots and buffer windows
- readiness indicators
- preview-only actions until relay exists

Inspect admin dashboard device views before coding.

## Then

1. Polish remaining top-level routes (Overview, global Targets, Settings)
2. BotApp API relay — read-only profiles, stats, logs, targets
3. Guarded write paths (settings, filters, targets, runs)
4. Realtime events through relay
5. Focused tests: filter validation, target export redaction, run-control payloads, avatar sanitizer

## Long-term production goals

- Secure authenticated desktop sessions
- Admin/client contract parity
- Auditable operator actions
- No secrets or raw artifacts in desktop bundles
- Multi-device and multi-clone readiness
- Clear offline and error states
