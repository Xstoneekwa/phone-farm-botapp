# BotApp — Design Foundation Handoff
> Boost My Businesses · Version 1.0 · May 2026  
> Ready for implementation in Cursor / Codex / Claude Code

---

## 1. Screens Created

### v1 UI Kit (`ui_kits/botapp/`) — macOS compact style
| Screen | File | Description |
|---|---|---|
| Profiles | `ProfilesView.jsx` | Phone farm table — phones grouped, profiles with stats, time slots, actions |
| Devices | `DevicesView.jsx` | Device grid with connection status, profile count, refresh |
| Settings / Config | `SettingsView.jsx` | Instagram + TikTok platform config + General system settings |
| API Gateway | `APIView.jsx` | Tunnel status, scoped keys, webhooks, recent API calls |
| Appearance | (modal in `index.html`) | Theme picker + color overrides |
| Operators | (modal in `index.html`) | Multi-operator profile management |
| Bin | (inline in `index.html`) | Archived profiles with search |

### v2 UI Kit (`ui_kits/botapp-v2/`) — full ops dashboard
| Screen | File | Description |
|---|---|---|
| Overview | `Overview.jsx` | KPI cards, action-required panel, live feed, platform status |
| Profiles | `ProfilesV2.jsx` | Sortable table, device groups, bulk select, status filter |
| Devices | `DevicesV2.jsx` | Grid + list toggle, battery level, model info |
| Activity Log | `ActivityLog.jsx` | Full audit trail, level filter (INFO/WARN/ERROR/DEBUG) |
| Targets | `Targets.jsx` | Follow-target management, quality scores, approve/reject |
| DM Templates | `DMTemplates.jsx` | Template list + editor, reply-rate stats, variable insertion |
| Notifications | `NotificationsView.jsx` | Incident feed, priority filter, inline actions (2FA, reauth) |
| API / Webhooks | `APIKeysView.jsx` | Scoped keys, webhook endpoints, recent calls table |
| Settings | `SettingsV2.jsx` | Section-nav: General / Instagram / TikTok / Appearance / Operators / Advanced |

---

## 2. Design System Components

### Foundations (`Design.jsx` — v2 / `colors_and_type.css` — tokens)
- `DS` — all design tokens object (colors, radii, shadows, font stacks)
- `IP` — full Lucide-compatible SVG path map (40+ icons)
- `Ico` — SVG icon renderer

### Primitives
| Component | Description |
|---|---|
| `Badge` | 20+ preset types: running, idle, offline, error, ok, failed, twofa, checkpoint, connected, disconnected, active, paused, valid, invalid, review, archived, pro, starter, enabled, disabled |
| `Avatar` | Initials avatar, deterministic color from name |
| `Btn` | Variants: `primary`, `secondary`, `ghost`, `danger`, `dangerFill` · Sizes: `xs`, `sm`, `md`, `lg` · Optional icon prop |
| `Card` | White surface, 1px border, 8px radius, configurable padding |
| `SLabel` | All-caps section label (10px / 600 / 0.07em tracking) |
| `Input` | Text input, optional leading icon, focus ring |
| `Toggle` | Animated on/off, sizes `sm` / `md` |
| `Skel` | Skeleton loading pulse |
| `Mono` | JetBrains Mono span for IDs / logs / code |
| `Toasts` | Toast system — `toast.success()` / `.error()` / `.info()` |
| `ConfirmModal` | Confirm dialog with danger variant |
| `EmptyState` | Icon + title + message + optional action |

### Layout
| Component | Description |
|---|---|
| `PageHdr` | Consistent page header: title, subtitle, badge slot, actions slot |
| `Th / Td / TRow` | Styled table primitives with hover state |
| `SidebarV2` | 220px dark sidebar, grouped nav, counters, live dot, operator strip |
| `TopBar` | Breadcrumb + ⌘K command palette button + notification bell |
| `CommandPalette` | Fuzzy-search overlay, keyboard navigation (↑↓ / Enter / Esc) |

---

## 3. Fonts (Final)

```css
/* UI / Interface */
--font-sans:    "Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;

/* Logs, IDs, API paths, code blocks */
--font-mono:    "JetBrains Mono", "SF Mono", Menlo, Monaco, monospace;
```

**Google Fonts import:**
```
Inter: 300 / 400 / 500 / 600 / 700
JetBrains Mono: 400 / 500
```

**Usage rules:**
- All UI text → Inter
- Serials, API keys, endpoints, timestamps, log events → JetBrains Mono
- Numbers in tables → `font-variant-numeric: tabular-nums` with Inter

---

## 4. Colors

### Brand
| Token | Value | Usage |
|---|---|---|
| `--accent` | `#6558F5` | Buttons, toggles, focus rings, links, active nav |
| `--accent-hover` | `#5548E0` | Button hover |
| `--accent-light` | `#EDE9FE` | Tinted backgrounds, selected rows, active badge bg |
| `--accent-muted` | `#A89FF8` | Disabled accent text |
| `--bg-canvas` | `#F7F7F6` | App background — warm off-white |
| `--bg-surface` | `#FFFFFF` | Cards, modals, panels |
| `--bg-input` | `#F2F2F0` | Text input backgrounds |
| `--bg-sidebar` | `#111213` | Dark nav sidebar |
| `--fg-primary` | `#0F1117` | Main body text |
| `--fg-secondary` | `#5C6070` | Secondary / muted text |
| `--fg-tertiary` | `#9EA3B0` | Placeholders, timestamps, metadata |
| `--border` | `#E6E6E4` | Dividers, card borders |

### Semantic / Status
| State | Text | Background | Dot |
|---|---|---|---|
| Success / Connected / Running | `#166534` | `#DCFCE7` | `#22C55E` |
| Error / Disconnected / Failed | `#991B1B` | `#FEE2E2` | `#F87171` |
| Warning / Paused / Checkpoint | `#92400E` | `#FEF3C7` | `#FBBF24` |
| Growth / Change | `#134E4A` | `#CCFBF1` | — |
| Info / API | `#1E40AF` | `#DBEAFE` | — |
| Neutral / Idle / Zero | `#6B7280` | `#F3F4F6` | — |
| Accent / Pro / Selected | `#4338CA` | `#EDE9FE` | — |

### IG × BotApp Gradient (icon + decorative use)
```css
background: linear-gradient(135deg, #F58529, #DD2A7B, #8134AF, #6558F5);
```

---

## 5. Component Variants

### Buttons
```
primary     → #6558F5 bg, white text
secondary   → white bg, #0F1117 text, #E6E6E4 border
ghost       → transparent bg, #5C6070 text, #E6E6E4 border
danger      → white bg, #DC2626 text, #FECACA border
dangerFill  → #DC2626 bg, white text

Sizes: xs (3px/8px, r4), sm (5px/10px, r5), md (6px/14px, r6), lg (8px/18px, r7)
```

### Badges (all fully rounded, `border-radius: 9999px`)
```
running      → #DCFCE7 bg / #166534 text / #22C55E dot
idle         → #F3F4F6 bg / #6B7280 text
offline      → #FEE2E2 bg / #991B1B text / #F87171 dot
error        → #FEE2E2 bg / #991B1B text / #F87171 dot
twofa        → #FEF3C7 bg / #92400E text
checkpoint   → #FFEDD5 bg / #9A3412 text
connected    → #DCFCE7 bg / #166534 text / #22C55E dot
disconnected → #FEE2E2 bg / #991B1B text / #F87171 dot
active       → #DCFCE7 bg / #166534 text
paused       → #FEF3C7 bg / #92400E text
valid        → #DCFCE7 bg / #166534 text
invalid      → #FEE2E2 bg / #991B1B text
review       → #FEF3C7 bg / #92400E text
archived     → #F3F4F6 bg / #6B7280 text
pro          → #EDE9FE bg / #4338CA text
enabled      → #DCFCE7 bg / #166534 text
disabled     → #F3F4F6 bg / #6B7280 text
```

### Cards
```
Default  → white bg, 1px solid #E6E6E4 border, 8px radius, 14px/16px padding
Modal    → white bg, 12px radius, shadow: 0 16px 48px rgba(0,0,0,0.14)
Code     → #1A1A2C bg, JetBrains Mono, #CBD5E1 text
```

### Tables
```
Header row  → #FAFAF9 bg, 10px/500/uppercase/0.05em, #9EA3B0, 32px height
Data row    → 38–40px height, hover → #FAFAF8, 1px solid #F0F0EE bottom border
Group header → #F7F7F6 bg, 1px solid #E6E6E4 top/bottom, 32px height
```

### Toggles
```
ON  → #6558F5 track, white thumb, left: w-thumb-offset
OFF → #D1D5DB track, white thumb, left: 2px
Sizes: sm (28×16), md (34×20)
Transition: 150ms ease
```

### Time Pills (profile slots)
```
Background: #111213 (dark)
Text: white, JetBrains Mono, 11px/500
Padding: 4px 10px, border-radius: 9999px
Format: HH:MM–HH:MM  e.g. "17:00–20:00"
```

### Modals
```
Backdrop: rgba(0,0,0,0.3) + backdrop-filter: blur(4–8px)
Box: white, 12px radius, 0 16px 48px rgba(0,0,0,0.14) shadow
Animation: scale(0.97)+translateY(-8px) → scale(1)+translateY(0), 150–200ms
Width: 400–560px depending on content
```

---

## 6. Approximations to Replace Later

| Item | Current state | To replace with |
|---|---|---|
| **App icon** | Temporary SVG — IG gradient + bolt shape | Real SVG/PNG from designer |
| **Wallpaper blobs** | Hand-drawn SVG ellipses with blur filters | Real brand illustration |
| **Instagram icon** | Inline SVG gradient rectangle | Official IG brand asset (if licensed) |
| **TikTok icon** | Unicode ♪ on black square | Official TT brand asset |
| **Profile avatar images** | None — color dot only | Real profile photo thumbnails from API |
| **Device model data** | Hardcoded Samsung A32/A52 | Real from Android ADB `getprop ro.product.model` |
| **Battery level** | Hardcoded fake values | Real from ADB `dumpsys battery` |
| **Live feed** | Static fake data | WebSocket / SSE stream from backend |
| **Activity log** | Hardcoded 20 entries | Paginated API endpoint |
| **Follower/follow stats** | Hardcoded snapshot values | Real from bot session data |
| **Target quality scores** | Fake 12–92 range | Real scoring algorithm output |

---

## 7. Developer Recommendations

### Tech stack fit
This design system is optimized for **Electron + React** (macOS) or a **React web dashboard**. All components are written as plain React with inline styles — no CSS framework dependency. Easy to port to:
- **Tailwind CSS** — map tokens to Tailwind config
- **shadcn/ui** — use as a style reference; replace primitives with shadcn equivalents
- **Electron** — drop `index.html` directly, swap Google Fonts for local Inter/JetBrains Mono

### Token migration
Copy `colors_and_type.css` CSS custom properties into your framework's token system:
```js
// tailwind.config.js
colors: {
  accent:   '#6558F5',
  canvas:   '#F7F7F6',
  surface:  '#FFFFFF',
  fg1:      '#0F1117',
  fg2:      '#5C6070',
  fg3:      '#9EA3B0',
  border:   '#E6E6E4',
  // ... etc
}
```

### Icon system
All icons are inlined Lucide paths in `Design.jsx` (`IP` object). In production:
```bash
npm install lucide-react
```
Replace `<Ico n="users"/>` with `<Users size={14}/>` — same visual output.

### Font loading (production)
```html
<!-- Self-hosted recommended for Electron / offline use -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```
Or install locally:
```bash
npm install @fontsource/inter @fontsource/jetbrains-mono
```
```js
import '@fontsource/inter/variable.css';
import '@fontsource/jetbrains-mono';
```

### State management
The prototypes use local React state only. For production:
- **Bot session data** → Zustand or Jotai store, polling every 5–10s
- **Notifications/incidents** → WebSocket or SSE, store in Zustand with `unread` counter
- **Devices** → ADB bridge polling, reconnect logic with exponential backoff
- **Activity log** → Paginated REST, virtualized list (react-virtual) for 10k+ rows

### Component file structure (suggested)
```
src/
├── design/
│   ├── tokens.ts          ← CSS vars → JS constants
│   ├── icons.tsx          ← Lucide icon re-exports
│   └── components/
│       ├── Badge.tsx
│       ├── Btn.tsx
│       ├── Card.tsx
│       ├── Toggle.tsx
│       ├── Input.tsx
│       ├── Table.tsx      ← Th, Td, TRow
│       ├── Modal.tsx
│       ├── Toast.tsx
│       └── EmptyState.tsx
├── layout/
│   ├── Sidebar.tsx
│   └── TopBar.tsx
└── views/
    ├── Overview.tsx
    ├── Profiles.tsx
    ├── Devices.tsx
    ├── ActivityLog.tsx
    ├── Targets.tsx
    ├── DMTemplates.tsx
    ├── Notifications.tsx
    ├── APIKeys.tsx
    └── Settings.tsx
```

### Passing to Cursor / Claude Code
The most effective prompt:
> "Read `README.md` and `SKILL.md` in this design system project, then implement [screen name] using the tokens from `colors_and_type.css`, the component patterns from `ui_kits/botapp-v2/Design.jsx`, and the layout from `ui_kits/botapp-v2/[ViewFile].jsx`. Use Inter + JetBrains Mono. Replace fake data with real API calls to `[your endpoint]`."

Give the agent access to:
1. `README.md` — product context
2. `colors_and_type.css` — all tokens
3. `ui_kits/botapp-v2/Design.jsx` — component API
4. The specific `*View.jsx` being implemented — layout reference
