# BotApp — Design System

> Boost My Businesses · macOS Desktop Application

---

## Product Overview

**BotApp** is a macOS desktop application for managing a "phone farm" — a fleet of physical Android devices running automated social media engagement bots for Instagram and TikTok. Operators use it to manage hundreds of social media profiles distributed across many physical phones.

**Company:** Boost My Businesses  
**App Name:** BotApp  
**Backend Platform:** Propulse (bots.propulseachieve.com)  
**App Version (at time of capture):** 1.4.0.0  
**Target OS:** macOS (Electron-style native app)

### Products / Surfaces

| Surface | Description |
|---|---|
| **BotApp (macOS)** | Primary desktop UI — manages phones, profiles, bot schedules, devices |
| **Propulse API** | Backend REST API at `bots.propulseachieve.com/v1` — exposed via Cloudflare tunnel |
| **Web App** | External client connected to the API via scoped API keys |

### Core Screens

1. **Profiles / Accounts** — Main operating table. Phones grouped into sections, each with a list of Instagram/TikTok profiles showing plan, activity times, follower stats, and action controls.
2. **Devices** — Grid of all registered Android devices (43+ devices), showing connection status and profile counts.
3. **Bin / Archive** — Archived profiles with search.
4. **Settings / Config** — Per-platform (Instagram, TikTok) automation config: RapidAPI key, Config YAML, WarmUp, Inject & Ignore, Filter rules. Plus General system settings.
5. **API Gateway** — Cloudflare tunnel management, scoped API keys, webhooks, recent API calls, server settings.
6. **Appearance** (modal) — Theme picker (MacOS Light, MacOS Dark, Legacy, Custom), color overrides, typography settings.
7. **Operators** (modal) — Multi-operator profile management; each operator has their own saved settings.

### Sources

- Screenshots provided at `uploads/Capture d'écran 2026-05-15 à 20.5*.png` (9 screenshots, macOS capture)
- No codebase or Figma link was provided — this design system is reconstructed from screenshots

---

## Content Fundamentals

### Language & Tone

- **Language:** English UI, with French content in user data (profile names, notes, plan labels like "Com'Uniti", "Malou")
- **Tone:** Professional, operator-focused, information-dense. No fluff.
- **Voice:** Third-person for descriptions, second-person for instructions. E.g., "When the bot restarts, the tunnel comes back up automatically — operators don't need to click Start."
- **No emoji** anywhere in the UI
- **Technical precision:** exact numbers, timestamps, IDs everywhere

### Casing

| Element | Case | Example |
|---|---|---|
| Section label | ALL CAPS | `API CONNECTION`, `TODAY`, `PUBLIC API BASE` |
| Page title | Title Case | `API Gateway`, `Devices` |
| Description | Sentence case | "Public access, scoped keys, webhooks, and audit for the stable external API." |
| Button labels | Sentence case | `Save webhook`, `+ API key`, `Disconnect & delete` |
| Status badges | Title Case or All Caps | `Active`, `Running`, `Connected` |

### Copy Patterns

- **Stat summaries:** dot-separated values `43 saved · 39 active · 4 offline`
- **Section descriptions:** concise noun phrases. "Daily run windows." / "Pull pending todo accounts."
- **Empty states:** plain, no-fluff. "No profiles — Backend returned no profiles for this view."
- **Timestamps:** `HH:MM:SS YYYY-MM-DD` format (e.g., `04:00:00 2026-05-15`)
- **Time windows:** `HH:MM–HH:MM` format (e.g., `17:00–20:00`) in dark pills
- **API/ID format:** alphanumeric uppercase IDs, e.g. `R39M10F3EHW`, `ak_live_sVo-2q...`

---

## Visual Foundations

### Colors

**MacOS Light theme (default):**

| Token | Hex | Usage |
|---|---|---|
| Accent | `#6558F5` | Buttons, toggles, links, focus rings |
| Background (canvas) | `#F7F6F2` | App background — warm off-white/cream |
| Sidebar panel | `#EBEBEE` | Secondary sidebar backgrounds |
| Foreground | `#1F2328` | Primary text, nav rail background |
| Surface / Card | `#FFFFFF` | Card and panel backgrounds |
| Muted text | `#6B7280` | Secondary labels, descriptions |
| Border | `#E5E7EB` | Dividers and card borders |
| Input bg | `#F0F0EB` | Inline text input backgrounds |
| Code bg | `#1A1A2E` | Dark code block background |

**Status colors:**

| State | Color | Badge bg |
|---|---|---|
| Connected / Active | `#16A34A` | `#DCFCE7` |
| Disconnected / Error | `#EF4444` | `#FEE2E2` |
| Warning / Empty | `#D97706` | `#FEF3C7` |
| Change / Growth | `#0D9488` | `#CCFBF1` |

**Additional themes documented:**
- `MacOS Dark` — near-black canvas with white text, same purple accent
- `Legacy` — blue-grey canvas, purple + teal accents
- `Custom` — user-defined overrides

### Typography

- **Primary font:** System UI stack — SF Pro on macOS (`system-ui, -apple-system, BlinkMacSystemFont`)
- **Monospace font:** SF Mono / Menlo (code blocks, IDs, API endpoints)
- **Web substitute:** DM Sans (Google Fonts) for SF Pro Text — **flagged, see Iconography note below**

| Role | Size | Weight | Color |
|---|---|---|---|
| Page title | 18–20px | 600 | fg-primary |
| Section label (ALL CAPS) | 10–11px | 500 | fg-secondary, letter-spacing 0.05em |
| Body text | 13px | 400 | fg-primary |
| Secondary description | 13px | 400 | fg-secondary |
| Data / numbers | 13px | 500 | fg-primary, tabular-nums |
| Code / IDs | 12px | 400 | monospace |
| Badge text | 11px | 500 | varies by badge color |

### Spacing & Layout

- **Nav rail width:** 36px (dark, icon-only)
- **Content padding:** 16–24px from edge
- **Card padding:** 16–20px internal
- **Row height (table):** ~40px
- **Section gap:** 16–20px between sections

### Cards & Surfaces

- White (`#FFFFFF`) background
- Very subtle border: `1px solid #E5E7EB`
- Border radius: `8px` (cards), `4–6px` (small elements), `9999px` (pills/badges)
- Shadow: minimal — `0 1px 2px rgba(0,0,0,0.06)` on cards; `0 8px 24px rgba(0,0,0,0.12)` on modals
- Section labels (ALL CAPS) sit above content with a divider or subtle background shift

### Backgrounds & Wallpaper

- Main app background: `#F7F6F2` (warm cream) — distinctive, not pure white
- **Blob wallpaper:** Organic amoeba-shaped blobs in muted pastel colors (dusty rose, sage teal, lavender, warm off-white) visible behind modals and on the "home" overlay. Functions as decorative wallpaper when content panels are not present. See `assets/wallpaper.svg`.

### Animation & Interaction

- **Transitions:** Fast and subtle — `150ms ease` for hover/focus states
- **Hover states:** Slight background tint (`rgba(0,0,0,0.04)`) on rows and buttons
- **Press states:** Brief opacity reduction; buttons go slightly darker
- **Toggles:** Smooth slide with accent color when ON
- **No decorative animations** — purely functional transitions

### Border Radius System

| Element | Radius |
|---|---|
| Modal/large card | 12px |
| Card/panel | 8px |
| Button (default) | 6px |
| Badge/pill | 9999px (fully rounded) |
| Input field | 4–6px |
| Small tag | 4px |

### Shadows

| Level | Value |
|---|---|
| Card | `0 1px 2px rgba(0,0,0,0.06)` |
| Modal | `0 8px 24px rgba(0,0,0,0.12)` |
| Large modal | `0 16px 48px rgba(0,0,0,0.16)` |

### Iconography

- **Style:** Stroke icons, ~1.5px stroke weight, rounded caps, 16–18px rendered size
- **Closest CDN match:** Lucide Icons (`lucide.dev`) — matches the style exactly
- **Usage:** SVG inline or via Lucide React; no icon font
- **No emoji** used as icons
- See `assets/` for the app icon SVG

> ⚠️ **Font substitution:** The app uses SF Pro (system font on macOS), which is not available on the web. UI kits use `DM Sans` from Google Fonts as a visual substitute. For production macOS/Electron use, revert to `system-ui, -apple-system, BlinkMacSystemFont`.

---

## File Index

```
/
├── README.md                     ← You are here
├── SKILL.md                      ← Agent skill definition
├── colors_and_type.css           ← All design tokens as CSS custom properties
├── assets/
│   ├── app-icon.svg              ← BotApp icon (IG × bot gradient)
│   └── wallpaper.svg             ← Blob wallpaper background
├── preview/
│   ├── colors-brand.html         ← Brand color palette
│   ├── colors-semantic.html      ← Semantic / status colors
│   ├── colors-themes.html        ← Theme presets
│   ├── type-scale.html           ← Typography scale
│   ├── type-labels.html          ← Section label & data type styles
│   ├── status-badges.html        ← Status badge components
│   ├── time-pills.html           ← Time slot pills
│   ├── buttons.html              ← Button variants
│   ├── data-row.html             ← Profile table row
│   ├── device-card.html          ← Device grid card
│   ├── sidebar-nav.html          ← Navigation rail (v1, 36px dark rail)
│   ├── form-inputs.html          ← Input fields and toggles
│   ├── modal-card.html           ← Modal / card pattern
│   ├── brand.html                ← App icon (IG × automation) + brand mark
│   ├── v2-sidebar.html           ← v2 full sidebar (220px, grouped nav)
│   ├── v2-metrics.html           ← v2 metric cards
│   └── v2-table.html             ← v2 table row patterns
└── ui_kits/
    ├── botapp/                   ← v1 UI Kit (macOS-native style)
    │   ├── README.md
    │   ├── index.html            ← Click-through prototype
    │   ├── Shared.jsx            ← Common components
    │   ├── Sidebar.jsx           ← 36px icon rail
    │   ├── ProfilesView.jsx      ← Phone farm table
    │   ├── DevicesView.jsx       ← Device grid
    │   ├── SettingsView.jsx      ← Platform & general settings
    │   └── APIView.jsx           ← API Gateway screen
    └── botapp-v2/                ← v2 UI Kit (full ops dashboard)
        ├── README.md
        ├── index.html            ← Full dashboard + ⌘K command palette
        ├── Design.jsx            ← All tokens, icons, base components
        ├── Sidebar.jsx           ← 220px grouped sidebar
        ├── Overview.jsx          ← Ops dashboard (metrics, incidents, feed)
        ├── ProfilesV2.jsx        ← Profiles table with filters & bulk actions
        ├── DevicesV2.jsx         ← Device grid + list view with battery
        ├── ActivityLog.jsx       ← Full audit log with level filter
        ├── Targets.jsx           ← Target management with quality scores
        ├── DMTemplates.jsx       ← DM template editor with reply stats
        ├── NotificationsView.jsx ← Incident feed with inline actions
        ├── APIKeysView.jsx       ← Scoped keys, webhooks, API calls
        └── SettingsV2.jsx        ← Section-nav settings panel
```

### Font Usage

| Context | Fonts |
|---|---|
| v1 UI Kit (macOS) | DM Sans + DM Mono (SF Pro substitute) |
| v2 UI Kit (dashboard) | Inter + JetBrains Mono |
| Production macOS app | system-ui / SF Pro (OS native) |
