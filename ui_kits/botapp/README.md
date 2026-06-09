# BotApp UI Kit

High-fidelity click-through prototype of the BotApp macOS desktop application.

## Screens

| View | Description |
|---|---|
| **Profiles** (default) | Phone farm table — phones grouped with their bot profiles, stats, time slots |
| **Devices** | Grid of all Android devices with connection status |
| **Settings / Config** | Instagram + TikTok platform config panels; General system settings |
| **API Gateway** | Cloudflare tunnel management, scoped keys, webhooks, recent calls |
| **Appearance** (modal) | Theme picker + color overrides — opens over a blurred background |
| **Operators** (modal) | Operator profile management |
| **Bin** | Archive/trash view with search |

## Navigation

- Click sidebar icons to switch views
- In Profiles/Devices: the main operating views
- Click the gear icon → triggers the Settings sub-nav (Config / API Gateway tabs)
- In Settings header: click **Appearance** button → opens Appearance modal
- Click person icon at bottom → opens Operators modal

## Components

| File | Contents |
|---|---|
| `Shared.jsx` | StatusBadge, TimePill, ChangeBadge, IGIcon, TTIcon, SectionLabel, Card, Toggle, ActionBtn, ProfileDot, Btn |
| `Sidebar.jsx` | Dark nav rail with icon buttons and active state |
| `ProfilesView.jsx` | Full phone farm table with inline editable fields |
| `DevicesView.jsx` | Device grid with connection status, action panel |
| `SettingsView.jsx` | Instagram/TikTok platform config + General settings |
| `APIView.jsx` | Full API Gateway screen |

## Design Notes

- Font: DM Sans (web substitute for macOS SF Pro)
- Background: `#F7F6F2` warm cream canvas
- Nav rail: `#16181B` dark strip, 36px wide
- Accent: `#6558F5` purple-blue
- All components export to `window` for cross-file sharing in Babel

## Caveats

- No real API calls — all data is hardcoded fake data matching the screenshots
- The blob wallpaper background (visible behind modals) uses CSS backdrop-filter blur
- Some icon paths are approximations of the originals
- Font is DM Sans, not the original SF Pro (macOS-only system font)
