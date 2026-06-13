# BotApp Security And No-Leak Rules

BotApp is a desktop operator UI. Desktop bundles are inspectable, so secrets and sensitive raw artifacts must never enter the renderer or packaged app.

## Hard Prohibitions

Do not add:

- Supabase service-role keys.
- Supabase direct clients in renderer code.
- Backend credentials, API keys, auth headers, webhook signing values, or vault refs.
- Passwords or full credential records.
- Full Vault UUIDs or secret reference IDs.
- Raw XML, raw screenshots, local screenshot paths, HAR files, ADB dumps, or raw device logs.
- Direct worker dispatch from preview UI.
- Direct Instagram scraping or CT validation in BotApp.
- Direct external avatar fetches from raw provider URLs in the renderer.

## Display Rules

- Use `redactText()` for strings that might contain runtime/account metadata.
- Use `redactRecord()` for object export surfaces.
- Keep exports limited to safe, user-facing fields.
- Do not export raw payloads, debug provider metadata, local paths, or raw event blobs.
- Use stable, explicit status/reason strings instead of opaque raw errors.

## Avatar Safety

Current Targets mock behavior:

- Accepts packaged mock assets under `/avatars/*.svg`.
- Accepts future same-origin relay paths matching `/api/botapp/instagram-dashboard/avatar?kind=target&...`.
- Rejects raw external URLs and falls back to initials.
- Uses `onError` fallback to avoid broken images and layout shift.

Future behavior:

- Store/admin source may be `ig_targets.avatar_url`.
- BotApp should receive a safe relay/proxy URL only.
- Relay should sanitize URL, fetch server-side, validate image content type, and apply safe cache headers.

## CT Validation Safety

CT validation belongs server-side. BotApp should:

- submit target usernames to a relay;
- receive admin-safe target rows;
- display validation status and quality;
- never scrape Instagram directly;
- never run provider credentials from desktop;
- never expose provider metadata containing secrets or raw responses.

## Required Validation Before Checkpoint Commit

Run:

```bash
npm run lint
npm run build
npm run package:mac
git diff --check
```

Run no-leak scans on:

- added diff lines;
- untracked source/docs/public files that will be committed;
- packaged `release/mac-arm64/BotApp.app/Contents/Resources/app.asar`.

Recommended high-confidence patterns:

- Supabase service-role values
- `supabase_url`
- `supabase_key`
- `authorization`
- `bearer`
- `password`
- `secret`
- `token`
- `/Users/`
- raw XML tags
- screenshot/log artifact extensions in exported content

Review any match manually. Documentation that says "do not include secrets" is acceptable; actual secret-like values are not.

## Files That Must Not Be Committed

- `dist/`
- `release/`
- `.env`
- `.env.*`
- logs
- screenshots
- XML dumps
- HAR files
- uploads containing user artifacts
- temporary inspection folders
- raw worker/runtime outputs
