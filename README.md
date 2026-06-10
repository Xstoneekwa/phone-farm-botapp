# BotApp

BotApp is the mock-first macOS operator application for the Phone Farm system at Boost My Businesses. It gives operators a dense desktop control surface for phones, Instagram/TikTok profiles, runtime state, logs, target accounts, and safety-gated actions.

This repository currently contains the Electron/Vite/React foundation and a validated Profiles checkpoint. It is intentionally mock-only: no real backend mutation, no Supabase access from the renderer, no worker dispatch, and no device control.

## Product Vision

BotApp is the desktop companion to the admin and client dashboards:

- **BotApp macOS**: operator app for day-to-day phone farm monitoring and controlled actions.
- **Dashboard Admin**: source of truth for account contracts, targets, CT validation, settings, and operational governance.
- **Dashboard Client**: client-safe surface for approved status, targets, and package configuration.
- **Python worker/runtime**: executes phone/device automation and emits runtime events.
- **Future BotApp API relay**: secure bridge between BotApp and backend contracts.

BotApp must remain a safe operator shell. Future realtime and write flows should pass through a scoped BotApp API relay that mirrors admin-backed contracts. The renderer must never receive secrets, service-role credentials, raw device artifacts, or unrestricted backend access.

## Current Checkpoint

The current checkpoint completes the Profiles toolbar foundation:

- Profiles screen grouped by phone/device.
- Icon-only sidebar with hover labels and counters.
- Dense 12-button profile toolbar.
- Add Profile drawer with a six-step mock wizard.
- Stats drawer cleanup with follow-back and like-back columns.
- Logs / History drawer with mock-live console, pause/resume auto-scroll, search/filter, and redacted TXT/JSON export.
- Targets drawer with admin parity: stats, search, filters, admin-style columns, add, bulk import, archive/delete selected, reset, restore, CSV/JSON export, safe avatars, no horizontal table scroll.
- Mac packaging through Electron Builder.
- Vite/Electron packaged renderer fix using relative asset paths.

Everything above is mock-only and preview-only.

## Tech Stack

- **Vite** for renderer build and local dev server.
- **React** for views, drawers, and stateful UI.
- **TypeScript** for contracts and mock client types.
- **Electron** for macOS packaging.
- **Electron Builder** for `package:mac`.
- **CSS modules by convention** through shared CSS files, not CSS modules syntax.

## Repository Structure

```text
.
├── electron/                 # Electron main process
├── src/
│   ├── api/                  # Type contracts and mock client boundary
│   ├── app/                  # App shell, routes, topbar/sidebar integration
│   ├── data/                 # Mock data fixtures
│   ├── design/               # Shared UI primitives and tokens
│   ├── security/             # Redaction helpers
│   └── views/                # Screens and profile drawers
├── public/avatars/           # Safe packaged mock avatar assets
├── docs/                     # Developer documentation
├── assets/, preview/, ui_kits/
│                              # Original design references
└── electron-builder.json
```

## Core Commands

```bash
npm install
npm run dev
npm run lint
npm run build
npm run package:mac
```

`npm run package:mac` builds the renderer and packages `release/mac-arm64/BotApp.app`. The generated `release/` and `dist/` outputs are build artifacts and should not be committed.

## Developer Onboarding

1. Install Node dependencies with `npm install`.
2. Run `npm run dev` and open `http://127.0.0.1:5173/`.
3. Work inside `src/`; treat `assets/`, `preview/`, and `ui_kits/` as design references unless explicitly asked.
4. Keep all new flows mock-only until a secure BotApp API relay exists.
5. Validate with lint, build, package, diff whitespace check, and no-leak scans before checkpoint commits.

## Safety Rules

Never add any of the following to BotApp:

- Supabase service-role key or direct Supabase client usage in the renderer.
- Password display or local credential dumps.
- Full Vault UUIDs, secret refs, tokens, authorization headers, or API keys in UI/logs/exports.
- Raw XML, screenshots paths, HAR files, raw device logs, or local filesystem artifact paths.
- Direct Instagram scraping/validation from BotApp.
- Direct external avatar fetches from raw provider URLs in the renderer.

Exports and UI strings that may include runtime/account data must pass through redaction helpers.

## Future Sync Model

Future production sync should use this shape:

```text
BotApp renderer
  -> secure BotApp API relay
  -> admin/client backend contracts
  -> DB and worker runtime
  -> realtime events/log streams back through relay
```

Targets/CT validation should reuse the admin contract around `ig_targets`, `ct_target_verification_jobs`, and `ct_target_audit_events`. Avatars should come from a safe proxy/sanitized source, not raw external URLs.

## Contribution Rules

- Keep changes scoped to the active checkpoint.
- Do not commit `dist/`, `release/`, `.env*`, logs, screenshots, raw artifacts, or temp files.
- Do not push tags or merge branches unless explicitly requested.
- Use checkpoint commits only after a functional drawer/tab milestone is validated.
- Before checkpoint commit, run:

```bash
npm run lint
npm run build
npm run package:mac
git diff --check
```

Also run no-leak scans on the diff, untracked source files, and packaged `app.asar`.

## Documentation Map

- `docs/architecture.md` — current technical architecture and future API boundary.
- `docs/profile-drawers.md` — Profiles toolbar drawers and mock behavior.
- `docs/security.md` — no-leak rules and validation checklist.
- `docs/roadmap.md` — checkpoint status and next work.
- `HANDOFF.md` — current state for the next developer/agent.
- `SKILL.md` — agent/developer operating instructions for this repo.
