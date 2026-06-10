---
name: botapp-mac-foundation
description: Use this skill when working on BotApp, the mock-first macOS operator application for the Phone Farm system.
user-invocable: true
---

# BotApp Development Skill

Before changing BotApp, read:

1. `README.md`
2. `HANDOFF.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. Any drawer-specific doc relevant to the task, especially `docs/profile-drawers.md`

## Operating Principles

- BotApp is mock-first until a secure BotApp API relay exists.
- Keep renderer code free of secrets, service-role keys, raw logs, raw XML, screenshot paths, local artifact paths, and credentials.
- Do not add direct Supabase access to the renderer.
- Do not add real worker, ADB, device, Instagram, or DB mutations behind preview UI.
- Reuse existing design primitives in `src/design/components`.
- Keep new work aligned with the admin/client dashboard contracts when parity is requested.

## Common Workflow

1. Inspect existing code and docs first.
2. Scope changes to the active drawer, screen, or checkpoint.
3. Keep actions preview-only unless the user explicitly asks for real integration and the secure API relay exists.
4. Validate with:

```bash
npm run lint
npm run build
npm run package:mac
git diff --check
```

5. Run no-leak scans on the diff, untracked source/docs/public files, and packaged `app.asar`.
6. Commit only when the user explicitly requests a checkpoint commit.

## Target / CT Work

Targets must follow the dashboard admin contract:

- Add single target maps to future POST target endpoint.
- Bulk add maps to future POST `usernames[]`.
- Delete selected means archive, not hard delete.
- Restore maps to lifecycle PATCH.
- Reset maps to reset PATCH and pending verification.
- CT validation must be admin-backed and queued server-side.
- Avatars must be proxied/sanitized through a safe same-origin source.

Never implement local CT scraping or raw external avatar fetches in BotApp.

## Commit Rules

- No automatic commits.
- No tags unless explicitly requested.
- No merge to main from this repo unless explicitly requested.
- Do not commit `dist/`, `release/`, `.env*`, logs, screenshots, uploads, raw artifacts, or temporary files.
- Checkpoint commits should represent a validated functional milestone.
