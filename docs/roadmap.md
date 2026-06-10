# BotApp Checkpoint And Roadmap

## Latest Checkpoint

Checkpoint name:

`feat(botapp): complete profile drawers and documentation checkpoint`

Scope:

- Profiles phone groups.
- Sidebar icon-only layout.
- 12-button profile toolbar.
- Add Profile mock wizard.
- Stats drawer cleanup.
- Logs / History mock-live drawer and redacted exports.
- Targets drawer admin parity.
- Targets layout fixes: no horizontal scroll, readable dark hover.
- Safe mock avatars and fallback behavior.
- README, handoff, skill, architecture, drawer, security, and roadmap docs.

## Done

- Vite/React/TypeScript foundation.
- Electron macOS packaging.
- Relative asset base for packaged renderer.
- Mock client and deterministic data fixtures.
- Core design primitives.
- Profiles module with drawers.
- Redaction helpers for display/export surfaces.

## Still Mock-Only

- Add Profile submit.
- Stats source.
- Logs stream.
- Targets add/import/archive/reset/restore.
- Settings save.
- Filters save.
- Start / Stop / Auto Login / Assign Now / Archive / Delete.
- Device/runtime actions.
- Avatar relay.
- CT validation.

## Next Recommended Milestone

### Start / Stop Parity

Inspect dashboard admin/client behavior before coding:

- eligibility checks;
- account readiness;
- device availability;
- assignment windows;
- runtime locks;
- confirmation copy;
- audit events;
- failure reasons;
- recovery/cancel behavior.

BotApp should remain preview-only unless a secure relay contract is explicitly introduced.

### Settings / Filters Inspection

After Start / Stop, inspect:

- `SettingsDrawer.tsx`
- `FiltersDrawer.tsx`
- admin/client settings source of truth
- package entitlements
- safe writable fields
- validation and audit requirements

### Tests

Add focused tests for:

- target list filter classification;
- FBR/performance label logic;
- redacted target export rows;
- avatar source sanitizer;
- log export redaction.

### API Relay Contract

Define a BotApp relay contract for:

- profile list/detail;
- profile stats;
- log stream;
- targets list/add/bulk/archive/reset/restore;
- avatar proxy;
- settings read/write;
- filters read/write;
- runtime action previews and later controlled execution.

## Long-Term Production Goals

- Secure authenticated desktop sessions.
- Realtime event/log streams.
- Device/session observability.
- Admin/client contract parity.
- Auditable operator actions.
- No secrets or sensitive raw artifacts in desktop bundles.
- Clear offline/error states.
- Multi-device and multi-clone readiness.
