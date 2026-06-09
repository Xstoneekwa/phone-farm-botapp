# BotApp macOS Packaging Notes

This UI foundation is safe to package with Electron, Tauri, or another modern macOS wrapper. The packaged app must include only UI code, public assets, API client code, and safe runtime configuration.

Do not bundle Phone Farm source repositories, Python workers, Supabase migrations, local `.env` files, raw logs, screenshots, XML dumps, or developer filesystem paths. Real data must flow through the future BotApp API layer only.
