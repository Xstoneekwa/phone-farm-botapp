# BotApp macOS Packaging Notes

BotApp Packaging V1 uses Electron + electron-builder because the app is already a Vite/React UI and this keeps the first local macOS package simple.

## Commands

- Dev UI: `npm run dev`
- Web build: `npm run build`
- Lint: `npm run lint`
- Local macOS app package: `npm run package:mac`

The package output is written to `release/` and currently generates an unsigned local `.app` directory for testing.

## Mock-only contract

This build remains UI-only and mock-first. It does not call a backend, Supabase, Instagram, ADB, devices, workers, or runtime actions. Start, stop, restart, archive, API key, webhook, template, and settings actions stay as confirmation modals plus mock toasts.

## Bundle safety

The packaged app must include only the built UI, the Electron wrapper, and safe runtime metadata. Do not bundle Phone Farm source repositories, Python workers, Supabase migrations, local `.env` files, raw logs, screenshots, XML dumps, or developer filesystem paths.

Real data must flow later through the BotApp API layer only, starting read-only before any guarded write operations.
