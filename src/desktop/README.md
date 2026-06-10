# BotApp macOS Packaging Notes

BotApp Packaging V1 uses Electron + electron-builder. The app is a Vite/React UI wrapped for local macOS operator testing.

## Commands

| Command | Output |
|---------|--------|
| `npm run dev` | Vite dev server at `http://127.0.0.1:5173/` |
| `npm run build` | Production renderer in `dist/` |
| `npm run lint` | ESLint |
| `npm run package:mac` | Unsigned `release/mac-arm64/BotApp.app` |

## Preview-only contract

This build is UI-first with **local fixture data**. It does not call Supabase, Instagram, ADB, devices, workers, or runtime actions directly.

Start, stop, settings save, targets mutations, and Add Profile prepare admin-backed payloads and show confirmation/toast feedback only. Real execution requires a future **secure BotApp API relay**.

## Phone View / scrcpy

The phone-level View action is the one desktop integration in this checkpoint. It opens a live mirror window for the selected phone through Electron main-process IPC and `scrcpy`.

Runtime rules:

- `scrcpy` must be installed on operator Macs.
- `BOTAPP_SCRCPY_PATH=/absolute/path/to/scrcpy` overrides PATH resolution.
- `BOTAPP_DEVICE_SERIAL_MAP='{"phone_01":"adb-serial"}'` can map local fixture phone ids/labels to development devices.
- Product source must not hardcode real ADB serials.
- One phone opens one mirror view; duplicate opens focus the existing view.
- Multiple phones can be mirrored at once.
- Closing a mirror window cleans up the associated process.
- The renderer only calls the narrow `botappDeviceViews` preload bridge; it does not spawn processes or access ADB directly.

## Bundle safety

The packaged app must include only:

- built renderer (`dist/`)
- Electron wrapper
- safe public assets (e.g. `/avatars/*.svg`)

Do **not** bundle:

- Phone Farm Python repos or workers
- Supabase migrations or service keys
- `.env` files
- raw logs, screenshots, XML dumps
- developer filesystem paths

Real data must flow through the BotApp API layer: read-only first, then guarded writes.

## Validation before release testing

```bash
npm run lint && npm run build && npm run package:mac
git diff --check
# no-leak scan on diff, untracked src/docs/public, and app.asar
```

Confirm `release/`, `dist/`, and secrets are not staged for commit.

## Renderer packaging fix

Vite uses relative asset paths so the packaged Electron window loads local files correctly (no black screen on `file://`).
