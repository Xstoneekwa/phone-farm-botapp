# BotApp Checkpoint — Follow Warmup Active SAST Days V1

Status: code and documentation checkpoint prepared on the canonical Auto Login
lineage. Production install evidence is recorded by the controlled rollout.
This is not the final Frontend/Stripe handover.

## Operator display contract

Settings > Follow has two distinct sections.

**Configured account limits**

- Follow cap/day;
- Follow cap/session.

These are persistent account settings. The operator may lower them within the
package maxima. Polling and Refresh never replace them with a temporary value.
Save sends configured values only.

**Today effective limits**

- warmup active day;
- warmup cap today;
- package cap;
- effective cap today;
- limiting source;
- limiting reason.

These values are informative and non-editable. Warmup progress is based on
verified Follow activity on distinct SAST dates, not account/package age.

## Status label cleanup

The generic social fallback is `operator review`. The legacy
`social blocked:` prefix is absent from source, active tests and packaged
`app.asar`. Existing badge priorities and specific labels remain unchanged.

## Evidence

- Code: `4606fc29b3717611219a62cc7132e2245647422a`.
- 25 targeted profile/follow tests.
- TypeScript and Vite production build.
- macOS packaging and ad-hoc signature verification.
- No-leak inspection of extracted `app.asar`.
- Six-file code allowlist; no Auto Login file removed or overwritten.
- Zero device, ADB, Instagram, Auto Login or Follow run.

Rollback: reinstall the previous certified official package and verify its
hash, signature, relay and dispatcher projection without launching a run.
