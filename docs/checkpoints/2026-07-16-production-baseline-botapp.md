# 2026-07-16 Production Baseline - BotApp

Short name: `JULY_16_PRODUCTION_BASELINE`

Human name: **2026-07-16 Production Baseline - Warmup, Unfollow, Welcome,
Multi-device, Live Counters, Follow Caps, Like Evidence Reuse**

This is the installed BotApp rollback and comparison baseline before worker
performance optimization. The reference business commit is
`fa427ace11b294d3765f4a6e0dda2522770ed70e`. The official application is
`/Applications/BotApp.app`; its installed and packaged `app.asar` SHA-256 is
`6731836948accc1a1ae65838ad0795b41f7f9ba08f6bece6a876d9d5489fe77e`.

Related checkpoints use the same filename date across repositories:

- Backend: `docs/checkpoints/2026-07-16-production-baseline-backend.md`
- Worker: `docs/checkpoints/2026-07-16-production-baseline-runtime.md`
- Worker cross-repository summary:
  `docs/checkpoints/2026-07-16-production-baseline-cross-repo.md`

## Operator projection

- Profiles has one polling controller and one timer: approximately 4 seconds
  idle and 2 seconds active.
- Active/idle follows canonical backend request/run state for Play and Scheduler;
  Electron presence is not scheduler launch authority.
- Follow and Like live counters use existing asynchronous backend projections.
  Settings values and stale renderer fallbacks are not counted as business
  actions.
- Counter numerators use the same typography token and weight as usernames.
- Follow cap/day and Follow cap/session are editable through the authenticated,
  transactional settings path. Package, warmup, account limits, effective cap
  and limiting source remain separately visible.
- Warmup labels are calendar based: `Warmup - Day N` with `in progress` for
  Days 1-3, and `Warmup completed - Day N` with `completed` for Day 4+.

> Historical note: this calendar rule is superseded for current policy by
> [Follow Warmup Active SAST Days V1](2026-07-23-follow-warmup-active-sast-days-v1.md).

## Incidents and actions

- Every drawer resolves the exact linked action by incident, run, request and
  account identity; it never chooses an historical action by account alone.
- Pending human review shows `Mark reviewed`. A successful authenticated relay
  transition removes the button, projects `Reviewed`, preserves audit and
  incident history, and refreshes Incidents and Profiles.
- Canonical states are `Action required`, `Reviewed`, `Acknowledged`, `Resolved`
  and `Open`.
- Slack and Discord use the shared English-only notification pipeline and hidden
  `Open Incidents/Actions` hyperlink.

## Security and operations

- The renderer has no service-role token and no direct privileged Supabase path.
- Sensitive calls stay in Electron main/relay and use the canonical authenticated
  backend boundary with operator identity.
- One phone owns one UI session. Separate phones may be displayed and dispatched
  independently; simultaneous business execution remains pending physical proof.
- Operator tests never alter caps, settings, schedules or packages. A retry needs
  explicit approval.

## PHYSICALLY VALIDATED IN PRODUCTION

- Official package installation with packaged/installed `app.asar` equality.
- Profiles polling, active-to-idle transition, Follow live and Like live display
  during the observed Mythyl run.
- Warmup completion and effective Follow cap source projection.
- Human `Mark reviewed` for linked Tracker actions, including automatic refresh.
- Slack and Discord creation/resolution notifications with the canonical CTA.

## TEST-VALIDATED ONLY

- Polling cadence remains 4 seconds idle / 2 seconds active with one timer.
- Follow settings transactional save/re-read and limiting-source rendering.
- Generic incident states across accounts and idempotent reviewed actions.
- Dispatcher/device health rendering while Electron is not scheduler authority.

## PENDING PHYSICAL OBSERVATION

- Natural scheduling while BotApp is completely closed.
- Two simultaneous business runs on separate phones.
- Tracker complete Welcome recovery, verified outbound bubble and handoff to
  Follow after the latest worker changes.
- Mythyl displaying 20 verified follows under the new resolver.
- Physical performance gain from Like evidence reuse.

## KNOWN RISKS / LIMITS

- The macOS application is ad-hoc signed rather than distributed with a stable
  notarized identity.
- ScreenCaptureKit and duplicate/ambiguous bundle identifiers can prevent
  reliable Computer Use capture even when the app itself is healthy.
- Historical noncanonical app bundles and clone worktrees may remain on disk;
  `/Applications/BotApp.app` is the official operator application.
- Runtime heartbeat `git_sha` can be unknown, so the active release root remains
  required provenance.

## OPEN PERFORMANCE WORK AFTER JULY_16_PRODUCTION_BASELINE

BotApp must remain outside the critical path for:

1. Pre-Follow.
2. Post-Mute to post open.
3. CT stable to next candidate.

No future counter or status change may add synchronous renderer/relay/backend
work between worker actions. The Mythyl 2026-07-16 run is the physical comparison
baseline, and active/idle plus live counters are non-regression criteria.

`Any commit after this checkpoint touching these paths must be compared against JULY_16_PRODUCTION_BASELINE.`
