# BotApp Architecture — Developer Guide

BotApp is the macOS operator application for the Phone Farm Instagram system. It gives operators a dense desktop surface for phones, profiles, runtime state, logs, targets, settings, and safety-gated actions.

This document is the primary developer onboarding reference. It complements `README.md`, `HANDOFF.md`, and `SKILL.md`.

---

## 1. Product vision

### Role in Phone Farm

| Surface | Role |
|---------|------|
| **BotApp (macOS)** | Day-to-day operator UI: profiles, devices, logs, targets, settings, start/stop previews |
| **Dashboard Admin** | Source of truth for account contracts, CT validation, settings, governance |
| **Dashboard Client** | Client-safe status, targets, package configuration |
| **Python worker / runtime** | Device automation, structured logs, runtime events |
| **Future BotApp API relay** | Secure bridge between desktop and admin/client/DB/worker contracts |

### Current state (checkpoint)

BotApp is **not** connected to the real backend. All data flows through a **local projection layer** (`mockClient` + fixtures). Operator-visible labels are product-ready; write actions **prepare payloads only** and do not mutate Supabase, Instagram, ADB, workers, or devices.

### Future API relay

Production sync must follow:

```text
BotApp renderer
  -> secure BotApp API relay (scoped auth, audit, redaction)
  -> admin/client backend routes
  -> Postgres / Supabase (server-side only)
  -> worker runtime + device farm
  -> events/logs streamed back through relay (WebSocket or polling)
```

The renderer must **never** hold service-role keys, direct DB clients, or unrestricted admin URLs.

---

## 2. Technical architecture

### Stack

- **Vite** — dev server (`http://127.0.0.1:5173/`) and production renderer build
- **React + TypeScript** — views, drawers, state
- **Electron** — macOS desktop shell
- **electron-builder** — `npm run package:mac` → `release/mac-arm64/BotApp.app`
- **CSS tokens** — `src/design/tokens.css`, shared component styles

### Repository layout

```text
electron/                 # Main process, window lifecycle
src/
  api/                    # types.ts, mock-client.ts, botapp-client.ts (future)
  app/                    # App shell, routes, global modals/toasts
  data/                   # Deterministic fixtures (profile-mock-data.ts, mock-data.ts)
  design/components/      # Badge, Button, Card, Drawer, Input, Modal, Table, …
  layout/                 # Sidebar, TopBar
  security/               # redaction helpers
  views/                  # Top-level screens
  views/profiles/         # Profiles module (checkpoint focus)
    drawers/              # Stats, Logs, Targets, Settings, Filters, AddProfile
    ProfileToolbar.tsx
    run-control.ts        # Start/Stop payload builders + eligibility
    profiles.css
public/avatars/           # Safe packaged SVG avatars only
docs/                     # Developer documentation
```

### App shell

`src/app/App.tsx` loads fixture data via `mockClient`, renders sidebar + topbar + active route, and handles:

- global action confirmation modals (preview-only)
- command palette navigation
- toast feedback for profile actions

### Profiles module

`ProfilesView.tsx` is the checkpoint centerpiece:

- phone/device groups with compact summary (`N profiles · running|ready|idle`)
- platform filter chips (All / Instagram / TikTok)
- search across username, package, phone, timeslot
- dense **12-button toolbar** per profile row
- local drawer state for Stats, Logs, Targets, Settings, Filters
- Add Profile wizard
- Start/Stop confirmation modals with payload preview

### Shared Filters implementation

**Single source of truth:** `src/views/profiles/drawers/FilterSettingsPanel.tsx`

Used by:

- toolbar **Filters** drawer (`FiltersDrawer.tsx`)
- Settings tab **Filters** (`SettingsDrawer.tsx`)

Shared helpers:

- `sameFiltersDraft` — dirty detection
- `filtersValidationError` — min/max validation
- `buildFiltersSavePayload` — admin PATCH shape for `/settings/follow-filters`

Runtime-ready editable fields: `skipPrivateProfiles`, `minFollowers`, `maxFollowers`, `minPosts`.

Planned/read-only (admin parity): skip follower/following, business filters, private/DM toggles, min/max following, bio/name word lists.

Payload previews strip internal `mock_only` flags from JSON display.

### Local data layer

| Module | Purpose |
|--------|---------|
| `src/api/mock-client.ts` | Implements `BotAppClient`; simulates latency |
| `src/data/profile-mock-data.ts` | Profile rows, stats, logs, targets, settings, filters |
| `src/data/mock-data.ts` | Devices, notifications, global targets, app settings |
| `src/api/botapp-client.ts` | Future relay stub (`notConnectedYet`) |

Replace or wrap `mockClient` with a real client when the relay is validated. Keep types in `src/api/types.ts` as the contract boundary.

---

## 3. Checkpoint status (Profiles)

### Done in this checkpoint

| Feature | Notes |
|---------|-------|
| Profiles phone groups | Grouped by device; status badge; simplified summary |
| Sidebar | Icon-only nav with hover labels and counters |
| 12-button toolbar | Stats, Logs, Targets, Settings, Filters, Start, Stop, … |
| Add Profile | Six-step wizard; admin create contract payload |
| Stats drawer | Follow-back / like-back columns; Save Stats |
| Logs drawer | Live console simulation, pause/resume, filters, redacted export |
| Targets drawer | Admin parity: stats, filters, add/bulk, archive, reset, restore, CSV/JSON |
| Start / Stop | Eligibility projection, payload preview, secure-relay copy |
| Settings tabs | General, Schedule, Follow, DM, Followback, Sources, **Filters** |
| Filters parity | Toolbar drawer = Settings Filters tab (shared panel) |
| UI wording | No visible “mock” in operator labels |
| Mac packaging | Electron Builder, relative Vite assets, asar |
| Security | Redaction, no secrets in bundle, no-leak validation |

### Still preview-only (no backend mutation)

- All Save / Create / Start / Stop / Targets mutations
- Realtime log WebSocket
- CT validation and avatar relay
- Device control and worker dispatch

---

## 4. Security

See `docs/security.md` for the full checklist. Non-negotiable rules:

- No Supabase service role in BotApp
- No direct DB from renderer
- No secrets, tokens, or bearer headers in source or bundle
- No password display; credentials write-only in Add Profile flow
- No raw XML, screenshot paths, HAR, or device log paths in UI/exports
- Exports pass through `redactText()` / `redactRecord()`
- Avatars: packaged SVG or future same-origin relay only

Before every checkpoint commit:

```bash
npm run lint
npm run build
npm run package:mac
git diff --check
# no-leak scans: diff additions, untracked src/docs/public, app.asar
```

Never commit: `dist/`, `release/`, `.env*`, logs, screenshots, temp inspection folders.

---

## 5. Future sync

| Domain | Admin contract (target) | BotApp today |
|--------|-------------------------|--------------|
| Profiles list | account APIs | local fixtures |
| Stats | dashboard stats routes | local fixtures |
| Logs | runtime / account run logs via relay | simulated live stream |
| Targets | `ig_targets`, CT jobs | local list + admin-parity UI |
| Settings | `/api/instagram-dashboard/settings` | tabbed drawer + payloads |
| Filters | `/settings/follow-filters` PATCH | shared panel + payload |
| Sources | follow-sources settings | package-aware defaults |
| Start/Stop | run request / stop relay | payload preview only |
| Avatars | sanitized proxy URL | `/avatars/*.svg` |

Sync order recommended: **read-only API** → guarded writes → realtime events.

---

## 6. Developer onboarding

```bash
cd /path/to/BotApp
npm install
npm run dev          # http://127.0.0.1:5173/
npm run lint
npm run build
npm run package:mac  # release/mac-arm64/BotApp.app
```

Workflow:

1. Read `AGENTS.md` / Phone Farm architecture if touching worker-adjacent contracts.
2. Read applicable `docs/` files before editing drawers or API types.
3. Extend existing primitives in `src/design/components` before adding new abstractions.
4. Keep operator UI free of “mock” wording; document preview-only behavior in docs.
5. Run full validation before checkpoint commits.
6. One checkpoint commit per milestone; do not commit build artifacts.

### Never do

- Wire Supabase or admin URLs directly in renderer
- Enable real mutations without relay + audit review
- Commit secrets, `.env`, `release/`, or raw runtime artifacts
- Copy real sensitive target lists or credentials into fixtures

---

## 7. Immediate roadmap

1. **Devices tab** — next UI milestone (phone detail, sessions, locks)
2. Remaining top-level screens polish
3. BotApp API relay — read-only profiles/stats/logs/targets
4. Guarded write actions (settings, filters, targets, runs)
5. Realtime log/event stream through relay
6. Automated tests for filters validation, target export redaction, run-control payloads

---

## Related documents

- `docs/architecture.md` — short technical summary
- `docs/profile-drawers.md` — drawer-by-drawer behavior
- `docs/security.md` — no-leak rules
- `docs/roadmap.md` — checkpoint history and next steps
- `src/desktop/README.md` — packaging notes
