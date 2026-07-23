# New Mac Setup / BotApp + Phone Farm Installation

Status: REQUIRED

This document is the reference checklist for installing and validating BotApp + Phone Farm on a new Mac. Update it at every major checkpoint when a new local dependency, environment variable, backend route, smoke flow, device, runtime dependency, recurring error, or security rule becomes required.

## 0. Architecture And Source Of Truth

Status: DONE

Supabase + shared backend API are the source of truth.

BotApp is a local ops client. Dashboard is a web client. The Python worker is the runtime executor. BotApp must not treat Dashboard UI state as a source of truth. Routes hosted in the Next.js repo under `/api/instagram-dashboard/...` are shared backend APIs backed by Supabase, not a dependency on the Dashboard interface.

Target flow:

```text
BotApp
-> Electron main / backend relay / shared backend API
-> Supabase

Dashboard
-> shared backend API
-> Supabase

Worker Python
-> Supabase / backend runtime
-> writes runs, logs, statuses, incidents
```

## 1. Mac Prerequisites

Status: REQUIRED

Recommended baseline:

- macOS: current supported Apple Silicon macOS. Current validated machine: macOS 25.x.
- Homebrew: required for common local tools.
- Node.js / npm: required for BotApp and shared backend builds. Current validated Node: v22.x.
- Git: required.
- Python 3: required if running the worker locally.
- Android platform-tools / ADB: required for physical phone visibility.
- scrcpy: required for Open phone / phone view.
- Java / Android SDK: required if using Android SDK tooling beyond platform-tools.
- Repo access: BotApp, boost-ai-frontend, and instagram-worker-python.

Baseline verification commands:

```bash
brew --version
node -v
npm -v
git --version
python3 --version
adb version
scrcpy --version
```

Install examples:

```bash
brew install android-platform-tools
brew install scrcpy
```

TODO: Document exact Java / Android Studio requirement if a future runtime path requires it.

## 2. Expected Local Repositories

Status: REQUIRED

Current local paths:

| Component | Path | Role |
| --- | --- | --- |
| BotApp | `/Users/admin/Projects/BotApp` | Electron local ops app |
| Dashboard / shared backend API | `/Users/admin/Projects/boost-ai-frontend` | Next.js app and Supabase-backed API routes |
| Worker Python | `/Users/admin/Projects/instagram-worker-python` | Runtime executor, devices, runs, logs |
| Worker active runtime | `/Users/admin/phonefarm-worker-current` | Symlink to the immutable production release |
| Worker releases | `/Users/admin/phonefarm-worker-releases/<commit>` | Immutable worker release worktrees |
| Runtime controller | `/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl` | Only local service control entrypoint |

For each repo:

```bash
git status --short
git branch --show-current
git log -1 --oneline
```

Rules:

- Keep commits scoped to one checkpoint or fix.
- Do not mix unrelated dirty files into a checkpoint commit.
- Do not revert user or runtime changes unless explicitly requested.
- Do not commit `release/mac-arm64/BotApp.app`, `dist/`, logs, screenshots, XML dumps, `.env`, or runtime artifacts unless an explicit release process says otherwise.
- If the app shows old UI or old behavior, quit all old instances and rebuild/package again.
- Production services must not start from `/Users/admin/instagram-worker-python`.
- BotApp must call `/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl`, not a worker checkout script.
- A clean worktree is not a product baseline by itself. A product baseline is a
  reconciled source commit, pushed, packaged from that commit, visually validated,
  and only then installed to `/Applications/BotApp.app`.
- `release/mac-arm64/BotApp.app` is a build artifact for validation, not the
  daily operator application.
- Rollback bundles under `/Users/admin/phonefarm-botapp-rollbacks/...` are
  read-only forensics/rollback vault copies, not a second official application.

PENDING: Define the expected production branch names for each repo once the release workflow is finalized.

## 3. Environment Variables

Status: REQUIRED

Never write real secret values in this document. Document names, owners, and verification only.

### BotApp

Status: REQUIRED

Configure in the packaged Electron main process environment or BotApp runtime config, never in renderer code:

- `BOTAPP_COMPASS_AI_RELAY_URL`: backend relay URL / shared backend origin.
- `BOTAPP_RELAY_API_KEY`: relay credential for Electron main only.
- `ADB`: optional absolute ADB path override.
- `ANDROID_HOME`: optional Android SDK root.
- `ANDROID_SDK_ROOT`: optional Android SDK root.
- `SCRCPY`: optional absolute scrcpy path override.
- `BOTAPP_ADB_PATH`: legacy / local override accepted by BotApp.
- `BOTAPP_SCRCPY_PATH`: legacy / local override accepted by BotApp.
- `BOTAPP_DEVICE_SERIAL_MAP`: optional serial remapping for local device view debugging.

Rules:

- No relay key in renderer.
- No service-role key in BotApp bundle.
- No SearchAPI key in BotApp bundle.
- No phone/account password in BotApp source or docs.

Verification:

```bash
env | rg 'BOTAPP|ADB|ANDROID|SCRCPY'
```

Review output manually and do not paste secrets into commits or logs.

### Dashboard / Shared Backend API

Status: REQUIRED

Server-side only:

- Supabase project URL.
- Supabase service role key.
- SearchAPI provider:
  - `INSTAGRAM_PUBLIC_PROFILE_LOOKUP_PROVIDER`
  - `INSTAGRAM_PUBLIC_PROFILE_LOOKUP_URL`
  - `INSTAGRAM_PUBLIC_PROFILE_LOOKUP_API_KEY`
- Credentials service:
  - `INSTAGRAM_CREDENTIALS_API_URL`
  - internal bearer/token for server-to-server calls.
- Any route-specific relay/internal auth variables required by `/api/instagram-dashboard/...`.

Rules:

- Keep service role and API keys server-side only.
- Do not expose these variables in client components, renderer bundles, logs, DOM, screenshots, or docs.

PENDING: Maintain the authoritative production env list in the deployment platform docs.

### Worker Python

Status: PENDING

Document and validate worker environment before running local runtime:

- Supabase URL and server-side credential variables.
- Device/runtime variables.
- Publish flags.
- Dispatcher flags.
- Run-control flags.
- ADB/device selection variables.

Production runtime env files live outside releases:

- `/Users/admin/phonefarm-runtime/env/run-control-dispatcher.env`
- `/Users/admin/phonefarm-runtime/env/device-heartbeat.env`

Do not copy these files from a mutable checkout. Provision or rotate them through
the approved secret process.

NO-GO: Do not run login/provisioning/follow automation during a new Mac setup smoke unless the runtime checkpoint explicitly authorizes it.

## 4. ADB / scrcpy Installation And Path Resolution

Status: DONE

Important issue encountered:

```text
Terminal adb devices saw the phones, but packaged BotApp did not find adb.
```

Cause: a packaged macOS app does not necessarily inherit the terminal PATH. BotApp must not depend on calling `adb` or `scrcpy` by name only.

BotApp local tool resolver must support these candidates.

ADB candidates, in order:

1. `process.env.ADB`
2. `process.env.BOTAPP_ADB_PATH`
3. `process.env.ANDROID_HOME/platform-tools/adb`
4. `process.env.ANDROID_SDK_ROOT/platform-tools/adb`
5. `~/Library/Android/sdk/platform-tools/adb`
6. `/opt/homebrew/bin/adb`
7. `/usr/local/bin/adb`
8. fallback `adb`

scrcpy candidates, in order:

1. `process.env.SCRCPY`
2. `process.env.BOTAPP_SCRCPY_PATH`
3. `/opt/homebrew/bin/scrcpy`
4. `/usr/local/bin/scrcpy`
5. fallback `scrcpy`

BotApp Open phone must:

- resolve absolute `adbPath`;
- run `adbPath start-server`;
- run `adbPath devices -l`;
- resolve absolute `scrcpyPath`;
- spawn `scrcpyPath`;
- inject `ADB=<adbPath>` into the scrcpy process environment;
- pass the real ADB serial such as `RFGL145VCKE`;
- avoid launching Instagram automation.

New Mac commands:

```bash
which adb
which scrcpy
adb kill-server
adb start-server
adb devices -l
```

Expected:

```text
RFGL... device
RFGL... device
```

If `unauthorized`:

- unlock phone;
- accept the RSA debugging prompt;
- if prompt does not appear, revoke USB debugging authorizations on the phone and reconnect;
- restart ADB server.

If no phones:

- verify data-capable cable;
- verify hub/port;
- enable USB debugging;
- set USB mode to File Transfer / Transferring files if needed;
- restart ADB server;
- reconnect phones with screens unlocked.

Current validated terminal paths:

| Tool | Terminal path |
| --- | --- |
| ADB | `/opt/homebrew/bin/adb` |
| scrcpy | `/opt/homebrew/bin/scrcpy` |

Current validated BotApp packaged resolver:

| Tool | Packaged BotApp path |
| --- | --- |
| ADB | `/Users/admin/Library/Android/sdk/platform-tools/adb` |
| scrcpy | `/opt/homebrew/bin/scrcpy` |

## 5. Physical Phone Configuration

Status: REQUIRED

For each physical phone:

- Enable Developer Options.
- Enable USB debugging.
- Connect to Mac with screen unlocked.
- Accept the Mac RSA prompt.
- Set USB mode to File Transfer / Transferring files if required.
- Verify `adb devices -l`.
- Verify BotApp Devices shows Local ADB status `device`.
- Verify Open phone / scrcpy.

Inventory template:

| Phone label | Serial | Model | Expected role | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Samsung A16-01 | `RFGL145VCKE` | SM-A165F | Physical phone / full-cycle pool | DONE | Local ADB `device`; Open phone validated programmatically |
| Samsung A16-02 | `RFGL145LZHE` | SM-A165F | Physical phone / full-cycle pool | DONE | Local ADB `device`; Open phone validated programmatically |
| Emulator | `emulator-5554` | Android emulator | Optional local dev | PENDING | Only if emulator flows are required |

TODO: Update this table whenever a phone is added, retired, renamed, or assigned a new role.

## 6. BotApp Build / Package / Run

Status: REQUIRED

Commands:

```bash
cd /Users/admin/Projects/BotApp-clean
node --test electron/runtime-controller.test.mjs electron/ipc-structured-clone.test.mjs
npm run build
npm run lint
npm run package:mac
node scripts/verify-electron-main-local-requires.mjs
node scripts/sign-and-verify-macos-bundle.mjs
```

macOS signing prerequisites (this Mac):

- No Developer ID / Apple Development identity exists in the Keychain, so
  `electron-builder` runs with `identity: null` and `npm run package:mac`
  applies an **inside-out ad-hoc signature** via
  `scripts/sign-and-verify-macos-bundle.mjs` (dylibs → frameworks → helpers →
  root bundle). The gate fails the build if any component is unsigned, if the
  binary is not arm64, or if `codesign --verify --deep --strict` fails.
- Never bypass macOS security: no SIP/Gatekeeper/AMFI disabling, no
  `xattr -cr` as a product fix, no certificate/private-key export.
- This ad-hoc model is only valid for local use on this Mac. Distributing
  BotApp to other Macs requires a Developer ID identity plus notarization
  (separate, not implemented). Set `BOTAPP_MAC_SIGN_IDENTITY` once a real
  identity is available.

Release gate before installing the canonical packaged app:

1. Source committed and pushed.
2. Targeted tests and build are green.
3. Package is built from the committed source.
4. `app.asar` verification passes for local `require("./...")` dependencies.
5. Bundle signature gate passes (`sign-and-verify-macos-bundle.mjs`).
6. Candidate is opened from `release/mac-arm64/BotApp.app` or a temporary copy
   outside `/Applications`.
7. User visually validates Profiles, Devices, Client Accounts, Runtime, one
   non-destructive drawer, and navigation/back flow.
8. Only then install the official app:

```bash
ditto /Users/admin/Projects/BotApp-clean/release/mac-arm64/BotApp.app /Applications/BotApp.app
open /Applications/BotApp.app
```

Before smoke:

- Quit all previous BotApp instances.
- Confirm package was rebuilt after the latest code changes.
- If old UI appears, quit BotApp and run `npm run package:mac` again.
- Confirm packaged app logs show the expected build marker if available.
- Confirm Copy diagnostics includes safe provenance: BotApp commit/marker,
  package date, bundle path, runtime root and runtime commit.
- Confirm Start dispatcher / Retry stay responsive and call only
  `/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl` asynchronously.
- Launchd plists must call `phonefarm-runtimectl dispatcher serve` /
  `heartbeat serve` (long-lived exec, no timed parent). BotApp and operators
  only use the short `status` / `start` / `stop` commands; never run `serve`
  manually.

No-leak validation:

- Scan app.asar.
- Confirm relay key is absent from renderer bundle.
- Confirm no Supabase service role key.
- Confirm no SearchAPI key.
- Confirm no bearer token.
- Confirm no account password.
- Confirm no Vault secret.

Example no-leak pattern set:

```bash
ASAR="/Users/admin/Projects/BotApp/release/mac-arm64/BotApp.app/Contents/Resources/app.asar"
rm -rf /tmp/botapp-asar-scan
npx --yes asar extract "$ASAR" /tmp/botapp-asar-scan
rg -i 'service_role|supabase_url|supabase_key|authorization|bearer|password|secret|token|eyJ[A-Za-z0-9_-]{20,}' /tmp/botapp-asar-scan
```

Review matches manually. Source code that redacts or blocks secrets may match by keyword; actual secret-like values are NO-GO.

## 7. Dashboard / Shared Backend Build / Deploy

Status: REQUIRED

Repo:

```bash
cd /Users/admin/Projects/boost-ai-frontend
npm run build
git diff --check
```

Run targeted tests according to scope. Examples:

```bash
npm test -- --runInBand path/to/test
```

Deployment rules:

- Deploy production only when the backend/shared API change is intentionally scoped.
- Do not deploy a complete dirty local tree.
- Prefer a scoped commit before deploy.
- Verify production routes on `https://www.boostmybusinesses.com`.
- Keep Dashboard UI changes separate from shared backend API fixes when possible.

Critical shared backend routes used by BotApp:

- `/api/instagram-dashboard/profiles`
- `/api/instagram-dashboard/profiles/[accountId]/details`
- `/api/instagram-dashboard/profiles/verify-username`
- `/api/instagram-dashboard/targets`
- `/api/instagram-dashboard/targets/reset`
- `/api/instagram-dashboard/avatar`
- `/api/instagram-dashboard/accounts/create`
- `/api/instagram-dashboard/credentials/submit`
- `/api/instagram-dashboard/assignments/now`
- `/api/instagram-dashboard/readiness/now`
- `/api/instagram-dashboard/accounts/status`
- `/api/instagram-dashboard/accounts/lifecycle`
- `/api/instagram-dashboard/devices`

Note: these routes are historically under `/instagram-dashboard`, but they are shared Supabase-backed backend APIs.

PENDING: Add health route name if/when standardized.

## 8. Supabase / Source Of Truth

Status: REQUIRED

Supabase is the source of truth. BotApp and Dashboard should read/write through safe APIs. The worker writes runtime statuses, runs, logs, incidents, and action results.

Tables/data sets to verify during setup or debugging:

- `ig_accounts`
- `ig_account_settings`
- `ig_account_filters`
- `ig_account_dm_settings`
- `ig_targets`
- `account_assignments`
- `phone_devices`
- `phone_app_instances`
- `account_credentials`
- `account_dashboard_actions`
- `ig_action_logs`
- `account_run_requests`
- `ig_runs`

Rules:

- Do not include secret SQL, credentials, tokens, service role values, or account passwords in this document.
- Prefer server-side APIs for BotApp/Dashboard.
- Use direct Supabase access only for authorized admin diagnostics or migrations.

## 9. New Mac Smoke Tests

Status: REQUIRED

### A. Backend / Shared API

Status: REQUIRED

- Health route returns 200 if available.
- `/api/instagram-dashboard/profiles` returns 200.
- `/api/instagram-dashboard/devices` returns 200.
- `/api/instagram-dashboard/profiles/verify-username` returns 200 and uses SearchAPI provider.
- `/api/instagram-dashboard/avatar` returns 200 for existing avatar, or a safe expected fallback.

### B. BotApp Profiles

Status: REQUIRED

- Profiles loads.
- Accounts are visible.
- No stuck `Loading dashboard data`.
- Source label indicates shared backend / Supabase-backed API.
- Account details drawer loads.
- No secret values appear in DOM, logs, or screenshots.

### C. Devices

Status: DONE for current machine, REQUIRED for every new Mac

- Samsung A16-01 and A16-02 visible.
- Local ADB status is `device`.
- Clones are visible.
- Occupants are displayed.
- Open phone Samsung A16-01.
- Open phone Samsung A16-02.
- Open All opens both phone views.
- Window titles are distinct.
- Windows are stable, movable, minimizable, and closable beside BotApp in windowed mode.
- BotApp does not blink or disappear while opening phone views.
- No run/login/provisioning automation starts.

### D. Add Profile Backend-Only

Status: REQUIRED / NO-GO for automation

- Click `+ New Profile`.
- Verify username.
- Create backend-only account.
- Confirm profile appears in Profiles.
- Submit credentials through safe backend route.
- Assign device/app instance.
- Add CT.
- Run readiness check.
- Do not click Auto Login / Connect now until that runtime checkpoint is explicitly validated.

### E. CT

Status: REQUIRED

- Add public CT.
- Avatar resolves.
- Followers resolve.
- Eligibility is calculated.
- Add nonexistent CT.
- Confirm `rejected_not_found`.
- Bulk add.
- Reset/delete target.

### F. No-Leak

Status: REQUIRED

- Logs do not contain secrets.
- DOM does not contain secrets.
- app.asar does not contain secrets.
- Response bodies do not expose server credentials.
- Screenshots/XML dumps are not committed.

## 10. Known Errors And Fixes

Status: REQUIRED

### `profiles_verify_username unavailable`

Possible causes:

- production route not deployed;
- IPC missing in packaged app;
- old app instance open;
- endpoint registry incomplete.

Fix:

- verify shared backend route in production;
- rebuild/package BotApp;
- quit old app instances;
- verify endpoint registry.

### `ADB does not see this phone serial` / `Command not found adb`

Cause:

- packaged BotApp cannot find ADB because it does not inherit terminal PATH;
- ADB server unavailable;
- phone not visible to the resolved ADB binary.

Fix:

- use the absolute path resolver;
- verify `which adb`;
- verify `ADB`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT`;
- run `adb kill-server && adb start-server && adb devices -l`;
- confirm BotApp local tools diagnostic.

### `device unauthorized`

Fix:

- unlock phone;
- accept RSA prompt;
- revoke USB debugging authorizations;
- reconnect cable;
- restart ADB server.

### Open phone toast says opened but no visible window

Possible causes:

- scrcpy process was not verified;
- window opened behind BotApp;
- scrcpy path missing;
- scrcpy launched without absolute ADB path;
- BotApp is in macOS fullscreen or a separate Space.

Fix:

- verify process stays alive after launch;
- use clear `--window-title`;
- use `--window-x`, `--window-y`, `--window-width`, `--window-height` relative to BotApp bounds;
- inject `ADB=<absolute adb path>` into scrcpy environment;
- capture stderr and show safe failure reason;
- use BotApp in normal windowed mode for Open phone / Open All.

### macOS fullscreen / separate Space limit for scrcpy

Status: DONE

scrcpy is a separate native SDL application. It cannot be guaranteed as an overlay above BotApp when BotApp is in macOS fullscreen or running in a separate Space.

Accepted behavior:

- BotApp in normal windowed mode: scrcpy opens beside BotApp with stable placement.
- BotApp in fullscreen: scrcpy may open on the desktop or another Space.
- BotApp must not blink or disappear while opening phone views.

Recommendation:

- Use BotApp in windowed mode for Devices Open phone / Open All.
- Do not rely on aggressive focus retries that make BotApp flicker.

### CT pending / reason unavailable

Possible causes:

- SearchAPI route not deployed;
- old BotApp mapping;
- async jobs not processed;
- `/targets`, `/details`, or `/avatar` path mismatch.

Fix:

- verify `/api/instagram-dashboard/targets`;
- verify account details route;
- verify avatar proxy;
- verify SearchAPI env on server;
- rebuild/package BotApp if client mapping changed.

## 11. Documentation Update Policy

Status: DONE

This document must be updated at every major checkpoint when any of these changes:

- new local tool required;
- new environment variable;
- new critical backend route;
- new build/package/deploy command;
- new smoke flow;
- new phone/device;
- new runtime dependency;
- new recurring error;
- new security/no-leak rule.

Every major checkpoint must answer:

```text
Should docs/new-mac-setup.md be updated? yes/no, and why.
```

If the answer is yes, update this document in the same checkpoint or explicitly mark the missing update as TODO/NO-GO.

## 12. Current Checkpoint Notes

Status: DONE

Current checkpoint added after fixing packaged BotApp local tool resolution:

- BotApp can resolve ADB without relying on terminal PATH.
- BotApp can resolve scrcpy without relying on terminal PATH.
- BotApp injects absolute `ADB` path into scrcpy process environment.
- Devices Refresh and Open phone use local tool resolution.
- BotApp Devices shows a safe local tools diagnostic.

Current known validated devices:

- Samsung A16-01: `RFGL145VCKE`
- Samsung A16-02: `RFGL145LZHE`

Current packager target:

- source artifact: `/Users/admin/Projects/BotApp-clean/release/mac-arm64/BotApp.app`
- daily operator app: `/Applications/BotApp.app`

Operator procedure (no terminal): `docs/guide-operateur-liam.md`

Relay / dispatcher architecture and runbook:

- `docs/botapp-relay-dispatcher-architecture.md`
- `docs/botapp-relay-dispatcher-operations.md`

Packaged BotApp is the only normal operator application. Do not use `npm run electron:start` for Liam or production operator validation.

Runtime controller checkpoint:

- Active worker root is `/Users/admin/phonefarm-worker-current`.
- Dispatcher, heartbeat and scheduler diagnostics are resolved through
  `/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl`.
- `runtime_root_invalid` and `runtime_root_mismatch` are explicit STOP states.
- Heartbeat logs rotate outside immutable releases under
  `/Users/admin/phonefarm-runtime/logs/device-heartbeat-service`.

## Follow Warmup Active SAST Days V1 package gate

For this checkpoint, build with the repository's supported Node runtime, run
TypeScript and Vite, then `npm run package:mac`. Verify the generated
`release/mac-arm64/BotApp.app` signature and SHA-256 of
`Contents/Resources/app.asar`. Extract the archive offline and confirm:

- no secret-shaped values;
- no `social blocked:` string;
- configured/effective Follow labels are present.

After copying to `/Applications/BotApp.app`, built and installed `app.asar`
hashes must match. Open only the official application; do not use Electron dev
for operator certification.
