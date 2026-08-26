# BotApp Checkpoint And Roadmap

## Latest checkpoint

**Message:** `feat(botapp): enable client password update requests`

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
- Devices tab with phone-style sidebar icon
- 41 saved devices, 40 active, 1 offline
- Two-column phone inventory with latency, status, profile-count badges, and per-phone view/restart actions
- Right action panel: Add, Open All, Close All, Restart All, History, Edit, Delete
- Add Phone drawer aligned to dashboard admin `add_physical_phone`
- Local phone view mapping via `BOTAPP_DEVICE_SERIAL_MAP`; `.botapp.devices.local.json` is gitignored and only `.botapp.devices.local.example.json` is committed
- Open All / Close All target phone views only and ignore unavailable fixtures
- Restart All / Restart phone, History/Edit/Delete are relay-ready only
- Client Accounts tab renamed from Account Detail with users-group sidebar icon
- Client Accounts strict admin parity: 7 KPIs, 7 status filters, 7 table columns
- Client Accounts columns: Account, Email, Password, 2FA, Created At, Status, Actions
- Client Accounts row actions: view account, open credentials worklist, request password update, status menu
- Client Accounts status actions prepared: pause, cancel, mark_needs_assistance, reactivate
- Client Accounts future sync via secure relay; no direct DB access from BotApp
- Credentials tab with lock icon, focused operator worklist, selected account context from Client Accounts, and relay-ready mappings for safe credential actions
- Credentials actions map to dashboard admin routes for password update, verification-code submit, and dashboard-action review through the future BotApp relay
- Activity Log repositioned as an Interaction Investigation Lab: search by CT, search by interacted account, recent interactions, evidence summaries, and CT archive/remove relay payloads
- Server Check will own technical/runtime/system logs later: runtime events, worker health, heartbeats, incidents, notification deliveries, and process diagnostics
- Password update notification/email contract remains pending backend until dashboard client onboarding captures/validates client email and a real provider/queue/template exists

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
- Device runtime mutations
- Avatar relay and CT validation
- Realtime WebSocket log stream

## Next milestone

Profiles toolbar/settings/drawers, Devices, Client Accounts, Credentials, and Activity Log investigation are now checkpoint-ready pending validation. The next large chantier is dashboard/admin parity for interaction search and the secure BotApp API relay.

Required order from here:

1. Replace dashboard admin Activity Log with the same interaction investigation concept once backend projections are ready.
2. Add read-only interaction investigation relay: `ig_interacted_users`, `ig_targets`, `ct_target_audit_events`, `ig_runs`, `account_run_requests`, and safe account labels.
3. Add client-safe Activity Log variant with tenant scoping and CT archive/remove actions.
4. BotApp API relay — read-only profiles, stats, targets, client accounts, credentials actions, and interaction evidence.
5. Guarded write paths (settings, filters, targets, runs, credential action updates, CT archive/remove).
6. Build future Server Check for runtime/system/worker logs currently out of Activity Log scope.

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

## Safety gate added 2026-08-12

Before any Device UI gains uninstall, reprovision or clone replacement authority, implement the canonical app-instance lifecycle: immutable pre-migration registry, exact device/app/account tuple confirmation, runtime freeze preflight, server-side rebind with old/new lineage, Identity Guard certification and a central app-version compatibility gate. Local labels and serial mappings must remain non-authoritative.

Current state is documentation only and `NO_GO_SAFETY_GAP`; no destructive BotApp control is approved.
