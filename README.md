# BotApp

> Current production checkpoint:
> [JULY_16_PRODUCTION_BASELINE](./docs/checkpoints/2026-07-16-production-baseline-botapp.md).
> The official installed application is `/Applications/BotApp.app`.

BotApp is the macOS operator application for the Phone Farm system at Boost My Businesses. It provides a dense desktop control surface for phones, Instagram/TikTok profiles, runtime state, logs, target accounts, settings, and safety-gated actions.

The current checkpoint delivers the complete **Profiles** workspace, the **Devices** phone inventory workspace, the **Client Accounts** admin-parity worklist, the **Credentials** operator worklist, and the **Activity Log** interaction investigation lab with local data only. Operator UI labels are product-ready; write actions prepare admin-backed payloads and do **not** call the real backend until a secure BotApp API relay is validated.

## Product vision

BotApp is the desktop companion to the admin and client dashboards:

- **BotApp macOS** — operator monitoring and controlled actions
- **Dashboard Admin** — account contracts, targets, CT validation, settings, governance
- **Dashboard Client** — client-safe status and configuration
- **Python worker/runtime** — device automation and structured logs
- **Future BotApp API relay** — secure bridge between desktop and backend

The renderer must never receive secrets, service-role credentials, raw device artifacts, or unrestricted backend access.

## Current checkpoint

Profiles, Devices, and Client Accounts foundation (branch `botapp-mac-foundation`):

- Profiles grouped by phone/device with search and platform filters
- Phone-level View mirror through Electron IPC and `scrcpy`
- Icon-only sidebar with hover labels and counters
- Devices tab with phone-style sidebar icon, 41 saved phones, two-column inventory, status/latency/profile badges, and a fixed action panel
- **Add Phone** drawer aligned to the dashboard admin `add_physical_phone` contract
- Device actions: phone view open/focus/close, Open All, Close All, Restart All, Restart phone, History, Edit, Delete
- Device actions are relay-ready only; restarts, edits, deletes, and Add Phone do not perform real mutations from BotApp
- Client Accounts tab renamed from Account Detail with users-group sidebar icon
- Client Accounts strict admin parity: 7 KPIs, 7 status filters, 7 table columns, row action icons, and status menu
- Client Accounts columns: Account, Email, Password, 2FA, Created At, Status, Actions
- Client Accounts actions prepared only: view account, open credentials worklist, request password update, pause/cancel/mark needs assistance/reactivate
- Credentials tab with lock sidebar icon, compact credential action cards, filters, and selected account context from Client Accounts
- Credentials sync contract targets `account_dashboard_actions`, `account_credentials`, `client_instagram_accounts`, manage overview, and radar overview through the future secure relay only
- Credentials action contracts target dashboard admin routes for password update, verification-code submit, and dashboard-action review through the future relay
- Activity Log uses an investigation icon and focuses on CT-source and interacted-account analysis, not runtime/system logs
- Activity Log prepares client-safe evidence export and CT archive/remove payloads; no CT deletion or DB mutation runs from BotApp
- Future Server Check owns technical/runtime/system logs, worker health, incidents, delivery diagnostics, and process events
- Password update email delivery remains relay-ready/pending until client onboarding captures and validates the client email and a real provider/queue/template exists
- Client Accounts future sync via secure relay (`client_accounts_overview`); no direct Supabase/DB access from BotApp
- Complete profile toolbar: Stats, Logs, Targets, Start, Auto Login, Check Login, Stop, Settings, Filters, Assign Now, Archive, Delete
- **Add Profile** — six-step wizard with admin create contract payload
- **Stats** — follow-back / like-back columns, Save Stats
- **Logs / History** — live console simulation, pause/resume, filters, redacted TXT/JSON export
- **Targets** — admin parity: stats, filters, add/bulk, archive, reset, restore, CSV/JSON, safe avatars
- **Start / Stop** — eligibility, confirmation modals, payload preview
- **Auto Login** — progress popup and verification-code popup prepared for `login_provisioning`
- **Assign Now** — current assignment candidate and future relay payload
- **Archive / Delete** — 30-day admin lifecycle policy (`scheduled_trash_at`, `scheduled_delete_at`)
- **Check Login / Readiness** — admin readiness contract prepared for future `login_provisioning` relay
- **Settings** — General, Schedule, Follow, DM, Followback, Sources, **Filters**
- **Filters parity** — toolbar Filters drawer and Settings > Filters share `FilterSettingsPanel`
- UI wording cleanup — no visible “mock” in operator labels
- Mac packaging through Electron Builder
- Developer documentation under `docs/`

All write paths remain **preview-only** until the secure relay is connected.

## Tech stack

- **Vite** — dev server and renderer build
- **React + TypeScript** — views and drawers
- **Electron + electron-builder** — macOS packaging
- **CSS design tokens** — shared primitives in `src/design/components`

## Repository structure

```text
.
├── electron/                 # Electron main process
├── src/
│   ├── api/                  # Types, mock client, future relay client
│   ├── app/                  # App shell and routes
│   ├── data/                 # Local fixture data
│   ├── design/               # UI primitives and tokens
│   ├── security/             # Redaction helpers
│   └── views/                # Screens and profile drawers
├── public/avatars/           # Safe packaged avatar assets
├── docs/                     # Developer documentation
└── electron-builder.json
```

## Operator vs developer

| Audience | Application | Documentation |
|----------|-------------|---------------|
| **Liam (opérateur)** | `release/mac-arm64/BotApp.app` only | [docs/guide-operateur-liam.md](./docs/guide-operateur-liam.md) |
| **Developer** | `npm run dev` / `package:mac` | This README + [relay/dispatcher ops](./docs/botapp-relay-dispatcher-operations.md) |

Never use `npm run electron:start` for operator workflows.

```bash
npm install
npm run dev          # http://127.0.0.1:5173/
npm run lint
npm run build
npm run package:mac  # release/mac-arm64/BotApp.app
```

`release/` and `dist/` are build artifacts — do not commit them.

## Developer onboarding

1. Install dependencies: `npm install`
2. Run the dev server: `npm run dev`
3. Work in `src/`; treat `assets/`, `preview/`, and `ui_kits/` as design references
4. Read `docs/botapp-architecture.md` before structural changes
5. For relay/dispatcher runtime: read `docs/botapp-relay-dispatcher-architecture.md` and `docs/botapp-relay-dispatcher-operations.md`
6. Validate before checkpoint commits: lint, build, package, `git diff --check`, no-leak scans

**Operator (Liam):** use only the packaged app — see `docs/guide-operateur-liam.md`. Do not use `npm run electron:start` for operations.

## Safety rules

Never add to BotApp:

- Supabase service-role key or direct Supabase client in the renderer
- Password display or credential dumps
- Vault UUIDs, secret refs, tokens, or API keys in UI/logs/exports
- Raw XML, screenshot paths, HAR files, or local device log paths
- Direct Instagram scraping/validation from the desktop app

Use `redactText()` / `redactRecord()` for exports and runtime strings.

## Phone View

Phone-level View requires `scrcpy` on operator Macs. BotApp resolves it from `BOTAPP_SCRCPY_PATH` first, then the normal `PATH`. Development can map fixture phone ids to local devices with `BOTAPP_DEVICE_SERIAL_MAP`, for example `phone_01:YOUR_ADB_SERIAL_1,phone_02:YOUR_ADB_SERIAL_2`. `.botapp.devices.local.example.json` documents the local-only shape; `.botapp.devices.local.json` is gitignored and must never be committed. The product must not hardcode ADB serials; one phone opens one mirror window, duplicate opens focus the existing view, Open All targets only locally mapped available phones, Close All cleans up open views, and cleanup also happens when the window closes.

## Future sync model

```text
BotApp renderer
  -> secure BotApp API relay
  -> admin/client backend contracts
  -> DB and worker runtime
  -> realtime events/logs back through relay
```

## Contribution rules

- Scope changes to the active checkpoint
- Do not commit `dist/`, `release/`, `.env*`, logs, screenshots, or temp files
- Do not push tags or merge to main unless explicitly requested
- Checkpoint commits only after validation passes

## Documentation map

| Document | Topic |
|----------|--------|
| `docs/guide-operateur-liam.md` | **Opérateur** — procédure BotApp sans terminal (Liam) |
| `docs/botapp-relay-dispatcher-architecture.md` | Relay, dispatcher, bootstrap, sécurité main/preload |
| `docs/botapp-relay-dispatcher-operations.md` | Runbook dev — validation, diagnostic, dépannage |
| `docs/botapp-architecture.md` | Full developer guide (start here) |
| `docs/architecture.md` | Short technical summary |
| `docs/profile-drawers.md` | Profiles toolbar drawers |
| `docs/security.md` | No-leak rules and validation |
| `docs/roadmap.md` | Checkpoint status and roadmap |
| `docs/new-mac-setup.md` | New Mac install and smoke checklist |
| `src/desktop/README.md` | macOS packaging and phone-view notes |
| `HANDOFF.md` | Current state for the next agent |
| `SKILL.md` | Agent operating instructions |
