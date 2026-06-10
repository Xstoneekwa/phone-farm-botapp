# BotApp Checkpoint And Roadmap

## Latest checkpoint

**Message:** `feat(botapp): complete profiles actions settings and device view checkpoint`

**Branch:** `botapp-mac-foundation`

### Scope delivered

- Profiles phone groups with simplified summary (`profiles · running|ready|idle`)
- Sidebar icon-only layout
- Complete profile toolbar
- Add Profile six-step wizard
- Stats drawer with follow-back / like-back columns
- Logs / History live console, pause/resume, redacted exports
- Targets drawer admin parity (no horizontal scroll)
- Start / Stop eligibility and payload preview
- View phone-level live mirror via Electron + `scrcpy`
- Auto Login confirmation, progress modal, and verification-code modal
- Assign Now assignment candidate and payload preview
- Archive / Delete lifecycle confirmations with 30-day scheduled Trash/Delete policy
- Check Login / Readiness confirmation and `login_provisioning` relay payload
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
- Start / Stop / Auto Login / Assign / Archive / Delete / Check Login execution
- Device runtime actions
- Avatar relay and CT validation
- Realtime WebSocket log stream

## Next milestone

Profiles toolbar/settings/drawers are now checkpoint-complete. The next large chantier is **Devices tab**.

Required order from here:

1. Devices tab
2. Polish remaining top-level routes (Overview, global Targets, Settings)
3. BotApp API relay — read-only profiles, stats, logs, targets
4. Guarded write paths (settings, filters, targets, runs)
5. Realtime events through relay
6. Focused tests: filter validation, target export redaction, run-control payloads, avatar sanitizer

Future write/action implementation rules remain:

- inspect `boost-ai-frontend` first for admin/client contract parity;
- route real reads/writes only through a secure BotApp API relay;
- keep service-role credentials, DB access, worker dispatch, and device internals server-side;
- keep operator UI free of “mock”, “mock only”, and “no backend action” wording;
- preserve redaction for exports, logs, payload previews, and verification-code flows.

## Long-term production goals

- Secure authenticated desktop sessions
- Admin/client contract parity
- Auditable operator actions
- No secrets or raw artifacts in desktop bundles
- Multi-device and multi-clone readiness
- Clear offline and error states
