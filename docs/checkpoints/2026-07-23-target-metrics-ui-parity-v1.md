# BotApp Checkpoint — Targets Metrics UI Parity V1

Status: code pushed on the canonical Follow Warmup lineage. Package/install and
production validation remain pending the single consolidated rollout.

## Lineage

- Canonical BotApp Warmup base: `261afcf5858d17fac2e3ddded2d6d31c2cf4a8d0`.
- Targets code commit: `5f5b6a8ba97ce6af73482fc05767a3c4efb81f50`
  (`fix(botapp): show canonical target added date`).
- Branch: `feature/targets-ui-parity-v1-20260723`.

The base contains the restored canonical lineage, Social Profile Snapshots,
Auto Login reliability and Follow Warmup display changes. None were removed or
replaced.

## Display contract

- Targets are loaded through `botapp:profiles:details` and the safe Profile
  Details relay projection.
- Added resolves `added_at || created_at`; `updated_at` is never a fallback.
- Missing Added renders `—` and exports as `null` in JSON / blank in CSV.
- Last used remains sourced only from `last_used_at`.
- Sent preserves null versus zero through the existing number-or-dash renderer.
- Existing Perf and FBR display logic is unchanged.

## Verification

- 21 targeted date, Refresh, Last Used, FBR and profile metric tests pass.
- TypeScript, Vite production build and emoji bundle verification pass.
- `git diff --check` and scoped no-leak/account-specific scan pass.
- macOS package/install is intentionally deferred to the consolidated rollout.

## Explicitly unchanged

No Worker file, backend migration, target row, account setting, device command,
ADB command or Instagram run was created or modified.
