# BotApp v2 UI Kit

Redesigned operations dashboard — Inter + JetBrains Mono, full sidebar, real-time patterns.

## Screens

| View | File | Description |
|---|---|---|
| **Overview** | Overview.jsx | Ops dashboard — metrics, action required panel, live feed, platform status |
| **Profiles** | ProfilesV2.jsx | Phone farm table — grouped by device, inline filters, bulk actions |
| **Devices** | DevicesV2.jsx | Grid + list view, battery levels, connection status |
| **Activity Log** | ActivityLog.jsx | Full audit trail — level filter, event/account/detail columns |
| **Targets** | Targets.jsx | Follow target management — quality scores, approve/reject, add targets |
| **DM Templates** | DMTemplates.jsx | Message templates with stats (sent, replied, reply rate) and editor |
| **Notifications** | NotificationsView.jsx | Incident feed — unread, high priority, dismiss, inline actions |
| **API / Webhooks** | APIKeysView.jsx | Scoped keys, webhook endpoints, recent calls table |
| **Settings** | SettingsV2.jsx | Section-nav settings: General, Instagram, TikTok, Appearance, Operators, Advanced |

## Navigation

- **Sidebar** — full 220px nav with group labels, counters, live status dot, operator strip
- **Top bar** — breadcrumb + `⌘K` command palette + notification bell
- **Command palette** — fuzzy search across all sections, keyboard-navigable

## Components (Design.jsx)

| Component | Description |
|---|---|
| `DS` | All design tokens (colors, fonts, radii, shadows) |
| `Ico` | SVG icon renderer (Lucide-compatible paths via `IP` map) |
| `Badge` | Status badges — 20+ preset types |
| `Avatar` | Initials avatar with deterministic color |
| `Btn` | Button — primary / secondary / ghost / danger / dangerFill, sizes xs–lg |
| `Card` | White surface card with border |
| `SLabel` | All-caps section label |
| `Input` | Text input with optional icon |
| `Toggle` | Animated on/off toggle |
| `Skel` | Skeleton loading pulse |
| `Mono` | Monospace text span |
| `Toasts` | Toast notification system |
| `ConfirmModal` | Confirm dialog |
| `EmptyState` | Empty state with icon + message |
| `PageHdr` | Consistent page header pattern |
| `Th / Td / TRow` | Styled table primitives |

## Design Decisions

- **Font:** Inter (UI) + JetBrains Mono (IDs, logs, code)
- **Canvas:** `#F7F7F6` warm off-white
- **Sidebar:** `#111213` dark, 220px, grouped nav
- **Accent:** `#6558F5` purple-blue (unchanged from v1)
- **Icons:** Lucide-compatible inline SVG paths
- **No external icon CDN** — all paths inlined in `Design.jsx`
