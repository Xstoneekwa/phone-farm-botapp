# BotApp Architecture

Short summary. For the full developer guide see **`docs/botapp-architecture.md`**.

BotApp is a macOS Electron application built with Vite, React, and TypeScript. It is currently a local-preview operator shell for the Phone Farm system.

## Surfaces

- **Renderer**: React UI under `src/`.
- **Electron main**: desktop shell under `electron/`.
- **Mock client**: local API-shaped client in `src/api/mock-client`.
- **Mock data**: deterministic fixtures in `src/data/profile-mock-data.ts`.
- **Future API client**: should replace or sit beside the mock client and call only a secure BotApp API relay.

## App Shell

`src/app/App.tsx` owns:

- route selection
- sidebar and topbar
- command palette
- global preview modals
- toasts
- mock action confirmation

The app is designed around dense operator views rather than consumer-style flows.

## Design System

Shared primitives live in `src/design/components`:

- `Badge`
- `Button`
- `Card`
- `Drawer`
- `Input`
- `Modal`
- `Table`
- `Toast`
- `Toggle`
- `EmptyState`

Global tokens and app styles live in:

- `src/design/tokens.css`
- `src/app/app.css`
- `src/views/profiles/profiles.css`

Prefer extending existing primitives and CSS patterns before adding new abstractions.

## Views

Top-level views live in `src/views/`:

- `Overview`
- `Profiles`
- `AccountDetail`
- `Devices`
- `ActivityLog`
- `Notifications`
- `Targets`
- `DMTemplates`
- `APIKeys`
- `Settings`

The current checkpoint focuses on `Profiles` and its drawers.

## Profiles Module

`src/views/profiles/ProfilesView.tsx` renders phone groups and profile rows. Drawer state is local to the Profiles module. Drawers live in `src/views/profiles/drawers/`.

Important profile contracts live in `src/api/types.ts`:

- `BotProfile`
- `DeviceProfileGroup`
- `ProfileToolbarAction`
- `ProfileStatsRow`
- `ProfileLogEntry`
- `ProfileTarget`
- `ProfileSettings`
- `ProfileFilters`

## Future API Boundary

Production BotApp should not call admin routes directly from the renderer. Use a secure relay:

```text
Renderer mock/API client
  -> BotApp API relay
  -> admin/client backend contracts
  -> DB + worker runtime
```

The relay should enforce:

- scoped desktop auth
- account/device authorization
- payload redaction
- rate limits
- audit logging
- no service-role exposure to desktop
- safe avatar proxying

## Local Runtime Boundary

Production BotApp controls local worker services through one stable entrypoint:

```text
Electron main
  -> /Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl
  -> /Users/admin/phonefarm-worker-current
  -> /Users/admin/phonefarm-worker-releases/<commit>
```

BotApp must not hardcode `/Users/admin/instagram-worker-python`, guess a release
hash, or silently fall back to a mutable checkout. Runtime root failures are
explicit states: `runtime_root_invalid` and `runtime_root_mismatch`.

Runtime service calls from UI paths must be asynchronous and timeout-bounded in
Electron main. `Start dispatcher`, `Retry`, runtime status and heartbeat actions
must not use synchronous child processes or legacy worker wrappers.

## Electron Packaging

Packaging is configured in `electron-builder.json`.

Important constraints:

- `asar` is enabled.
- mac target is `dir` for local validation.
- `dist/` and `release/` are build outputs.
- `.env*`, logs, XML, screenshots, uploads, runs, Supabase folders, and migrations are excluded.

The renderer build uses relative Vite assets so packaged Electron does not black-screen when loading local files.

`release/mac-arm64/BotApp.app` is a build artifact. The only official daily app
is `/Applications/BotApp.app`, and it may be replaced only after source commit,
tests/build/package, `app.asar` verification, packaged UI validation, and
explicit user visual approval.
