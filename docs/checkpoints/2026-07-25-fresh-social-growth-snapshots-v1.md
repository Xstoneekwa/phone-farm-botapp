# Fresh social growth snapshots V1 — BotApp checkpoint

## Lineage and release scope

Parent BotApp: `a7e4d4311c8346b66c827faba2e758fbd7a62eae`. This is the
latest combined Scheduler/Profiles/Incidents lineage available at integration.
Exactly six product/test files change: the API type, Profiles row renderer,
metric contract/test, status regression test and Profiles CSS. No Electron,
relay, dispatcher, runtime control, Auto Login, device or write path changes.

## UI contract

- Fresh: current snapshot age <=36 h.
- Aging: age >36 h and <=72 h.
- Stale: age >72 h, explicitly dimmed/labelled rather than current-looking.
- Insufficient/unavailable: no exploitable value; `— · 3d`.
- Positive, negative and true zero are preserved.
- Tooltip includes current/baseline values and timestamps, age, requested
  72-hour window, actual coverage, status and canonical source/provider.
- Manual is a scheduler state and remains independent from organic growth.

The renderer trusts the safe backend projection and does not derive counts from
Worker actions. It receives no provider secret, raw snapshot row, avatar CDN URL
or credential.

## Combined validation and Golden addendum

The targeted Profiles metric/status tests, full BotApp tests, TypeScript/Vite
build, macOS arm64 packaging, `app.asar` inspection and signature verification
are delivery gates. Scheduler and Incidents tests must remain at their parent
behavior. This data-label change does not touch Golden phone navigation and is
validated without ADB or a run.

## Rollback

Restore the timestamped backup of `/Applications/BotApp.app`. Backend freshness
fields are additive and safe for older clients; no database or Worker rollback
is required. Never edit `app.asar` or the installed app in place.
