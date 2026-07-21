# 2026-07-22 Wrong BotApp Lineage Installed Provenance

Verdict: `WRONG_BOTAPP_LINEAGE_DEPLOYED`

This record was captured before replacing `/Applications/BotApp.app`.

- Installed bundle: `/Applications/BotApp.app`
- Installed `app.asar` SHA-256: `83c5b1f37db67a823b34984d075c8ccd449d4cffd8e8fc3dc562e4619f23e85b`
- Installed build marker: `botapp-white-screen-hotfix-20260721`
- Installed `app.asar` timestamp: `2026-07-21 22:37:44` local
- Source branch used for that package: `codex/botapp-white-screen-hotfix-20260721`
- Source tip: `4b81a48429b28e76f88d9253fb02aa3b0d3b13c8`
- Lineage root for the recent stats commit: `3e44d6ff91ee9e9906641dd360db62f7331e770c`

Observed UI provenance before replacement:

- `Incidents` route and warning icon were absent.
- Only the reduced `Incident Notifications` placeholder route remained.
- Profiles exposed the regressed literal `social blocked:` state.
- Canonical Devices heartbeat/refresh projection was missing from this lineage.

The package was archived by hash and marker only. No backend, Worker, phone,
account, incident, heartbeat, scheduler, dispatcher, Supabase, or device state
was changed while collecting this record.
