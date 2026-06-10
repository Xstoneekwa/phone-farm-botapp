# BotApp

BotApp is the macOS operator application for the Phone Farm system at Boost My Businesses. It provides a dense desktop control surface for phones, Instagram/TikTok profiles, runtime state, logs, target accounts, settings, and safety-gated actions.

The current checkpoint delivers a complete **Profiles** experience with local data only. Operator UI labels are product-ready; write actions prepare admin-backed payloads and do **not** call the real backend until a secure BotApp API relay is validated.

## Product vision

BotApp is the desktop companion to the admin and client dashboards:

- **BotApp macOS** — operator monitoring and controlled actions
- **Dashboard Admin** — account contracts, targets, CT validation, settings, governance
- **Dashboard Client** — client-safe status and configuration
- **Python worker/runtime** — device automation and structured logs
- **Future BotApp API relay** — secure bridge between desktop and backend

The renderer must never receive secrets, service-role credentials, raw device artifacts, or unrestricted backend access.

## Current checkpoint

Profiles foundation (branch `botapp-mac-foundation`):

- Profiles grouped by phone/device with search and platform filters
- Icon-only sidebar with hover labels and counters
- Dense 12-button profile toolbar
- **Add Profile** — six-step wizard with admin create contract payload
- **Stats** — follow-back / like-back columns, Save Stats
- **Logs / History** — live console simulation, pause/resume, filters, redacted TXT/JSON export
- **Targets** — admin parity: stats, filters, add/bulk, archive, reset, restore, CSV/JSON, safe avatars
- **Start / Stop** — eligibility, confirmation modals, payload preview
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

## Core commands

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
5. Validate before checkpoint commits: lint, build, package, `git diff --check`, no-leak scans

## Safety rules

Never add to BotApp:

- Supabase service-role key or direct Supabase client in the renderer
- Password display or credential dumps
- Vault UUIDs, secret refs, tokens, or API keys in UI/logs/exports
- Raw XML, screenshot paths, HAR files, or local device log paths
- Direct Instagram scraping/validation from the desktop app

Use `redactText()` / `redactRecord()` for exports and runtime strings.

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
| `docs/botapp-architecture.md` | Full developer guide (start here) |
| `docs/architecture.md` | Short technical summary |
| `docs/profile-drawers.md` | Profiles toolbar drawers |
| `docs/security.md` | No-leak rules and validation |
| `docs/roadmap.md` | Checkpoint status and roadmap |
| `src/desktop/README.md` | macOS packaging notes |
| `HANDOFF.md` | Current state for the next agent |
| `SKILL.md` | Agent operating instructions |
