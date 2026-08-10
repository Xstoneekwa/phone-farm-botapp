import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { URL } from "node:url";
import { fileURLToPath } from "node:url";
import emojiRegex from "emoji-regex";

const currentDir = dirname(fileURLToPath(import.meta.url));
const profilesViewSource = readFileSync(resolve(currentDir, "ProfilesView.tsx"), "utf8");
const profileMetricSource = readFileSync(resolve(currentDir, "profile-metric-contract.ts"), "utf8");
const settingsDrawerSource = readFileSync(resolve(currentDir, "drawers/SettingsDrawer.tsx"), "utf8");
const filterSettingsPanelSource = readFileSync(resolve(currentDir, "drawers/FilterSettingsPanel.tsx"), "utf8");
const profilesCssSource = readFileSync(resolve(currentDir, "profiles.css"), "utf8");
const mainSource = readFileSync(resolve(currentDir, "../../../electron/main.cjs"), "utf8");
const packageSource = readFileSync(resolve(currentDir, "../../../package.json"), "utf8");
const twemojiManifestSource = readFileSync(resolve(currentDir, "../../../src/emoji/twemoji-assets.json"), "utf8");

test("connect badge shows saved credentials as ready to connect", () => {
  const growthBadgeSource = readFileSync(resolve(currentDir, "profile-growth-badge.ts"), "utf8");
  assert.match(growthBadgeSource, /profile\.credentialStatus === "saved_pending_verification"[\s\S]*ready to connect/);
});

test("Profiles emphasizes only counter numerators", () => {
  assert.match(profilesViewSource, /<strong className="counter-current">/);
  assert.match(
    profilesCssSource,
    /\.profile-owner-cell strong,\s*\.profile-counters \.counter-current \{ font-family: var\(--font-sans\); font-weight: 700; color: var\(--fg-primary\); letter-spacing: 0; \}/,
  );
  assert.match(profilesViewSource, /<span className="counter-cap">\/{max}<\/span>/);
});

test("unknown follower growth remains null instead of becoming a red zero", () => {
  assert.match(mainSource, /function readNullableNumber\(value\)[\s\S]*value === null \|\| value === undefined \|\| value === ""[\s\S]*return null/);
  assert.match(mainSource, /return readNullableNumber\(account\.followerDelta3d\.value\)/);
  assert.match(mainSource, /const value = readNullableNumber\(source\.value\)/);
  assert.doesNotMatch(mainSource, /const value = Number\(source\.value\)/);
});

test("real zero follower growth uses a neutral tone while losses remain red", () => {
  assert.match(profileMetricSource, /if \(value === 0\) return "zero"/);
  assert.match(profilesCssSource, /\.delta-pill\.zero\s*\{[^}]*#F3F4F6[^}]*#374151/s);
  assert.match(profilesCssSource, /\.delta-pill\.down\s*\{[^}]*#FEE2E2[^}]*#991B1B/s);
});

test("social badge separates login and target blocks", async () => {
  const growthBadgeSource = readFileSync(resolve(currentDir, "profile-growth-badge.ts"), "utf8");
  assert.match(growthBadgeSource, /profile\.loginStatus !== "connected"/);
  assert.match(growthBadgeSource, /login required/);
  assert.match(growthBadgeSource, /code\.includes\("needs_more_targets"\)[\s\S]*code\.includes\("target_accounts_missing"\)[\s\S]*growth needs targets/);
});

test("social badge explains real blocking reasons and preserves growth-ready state", () => {
  const growthBadgeSource = readFileSync(resolve(currentDir, "profile-growth-badge.ts"), "utf8");
  assert.match(growthBadgeSource, /export function socialBlockLabel/);
  assert.match(growthBadgeSource, /review_login_package_mismatch/);
  assert.match(growthBadgeSource, /social review: account mismatch/);
  assert.match(growthBadgeSource, /profile\.readiness === "ready"[\s\S]*growth ready/);
  assert.doesNotMatch(growthBadgeSource, /profile\.eligibility === "can_start"[\s\S]*growth ready/);
  assert.match(growthBadgeSource, /return "operator review"/);
  assert.match(growthBadgeSource, /connected · device locked/);
  assert.match(growthBadgeSource, /connected · preflight blocked/);
  assert.match(growthBadgeSource, /connected · waiting for slot/);
  assert.match(growthBadgeSource, /connected · scheduler blocked/);
  assert.doesNotMatch(growthBadgeSource, /reason\.includes\("schedule"\)/);
});

test("BotApp profile normalization blocks social eligibility until login is connected", () => {
  assert.match(mainSource, /loginStatus && loginStatus !== "connected"[\s\S]*blocked_now/);
  assert.match(mainSource, /loginStatus && loginStatus !== "connected"[\s\S]*login_not_connected/);
  assert.match(mainSource, /readEligibility\(account, blocked, loginStatus\)/);
});

test("BotApp does not treat CP4 scheduled_session_preflight pending as social blocked", () => {
  assert.match(mainSource, /const blocked = Boolean\([\s\S]*account\?\.blockingCampaign[\s\S]*hardLoginBlock/);
  assert.doesNotMatch(mainSource, /pendingActionsCount > 0 && !loginVerificationPending/);
});

test("BotApp relay consumes backend primaryBlockReason instead of stale generic social blocked", () => {
  assert.match(mainSource, /primaryBlockReason/);
  assert.match(mainSource, /primary_block_reason/);
  assert.match(mainSource, /reason_label: eligibility === "blocked_now" \? eligibilityReason\.replaceAll/);
});

test("BotApp profiles surface assignment health instead of fake unassigned state", () => {
  assert.match(mainSource, /function readAssignmentHealth\(account\)/);
  assert.match(mainSource, /assignmentHealth/);
  assert.match(mainSource, /assignmentHealthReason/);
  assert.match(mainSource, /buildProfileBackedDeviceGroup/);
  assert.match(mainSource, /Affectation à vérifier/);
  assert.match(mainSource, /Device\/app instance requires review/);
});

test("BotApp blocks Start and Auto Login when assignment requires attention", () => {
  const runControlSource = readFileSync(resolve(currentDir, "run-control.ts"), "utf8");
  assert.match(runControlSource, /assignment_requires_attention/);
  assert.match(runControlSource, /ok_to_start: false/);
  assert.match(mainSource, /assignmentState === "requires_attention"[\s\S]*Auto Login/);
  assert.match(mainSource, /assignmentState === "requires_attention"[\s\S]*refreshing readiness/);
  assert.match(mainSource, /Assignment\/device\/app instance state is inconsistent/);
});

test("Settings drawer saves runtime settings through backend relay", () => {
  assert.match(mainSource, /botapp:profiles:settings:save/);
  assert.match(mainSource, /settings_account/);
  assert.match(mainSource, /settings_follow_filters/);
  assert.match(mainSource, /settings_dm/);
  assert.match(mainSource, /settings_unfollow/);
  assert.match(mainSource, /settings_follow_sources/);
  assert.match(mainSource, /Backend auth failed for \$\{mode\} settings save/);
  assert.match(settingsDrawerSource, /saveFollowSettings\(\)[\s\S]*mode: "follow"/);
  assert.match(settingsDrawerSource, /saveFilterSettings\(\)[\s\S]*mode: "filters"/);
  assert.match(settingsDrawerSource, /saveDmSettings\(\)[\s\S]*mode: "dm"/);
  assert.match(settingsDrawerSource, /saveFollowbackSettings\(\)[\s\S]*mode: "followback"/);
  assert.match(settingsDrawerSource, /saveSourcesSettings\(\)[\s\S]*mode: "sources"/);
  assert.doesNotMatch(settingsDrawerSource, /Future Follow payload/);
  assert.doesNotMatch(settingsDrawerSource, /Future DM payload/);
  assert.doesNotMatch(settingsDrawerSource, /Future Unfollow payload/);
  assert.doesNotMatch(settingsDrawerSource, /Future Sources payload/);
  assert.doesNotMatch(filterSettingsPanelSource, /Future Filters payload/);
});

test("Settings drawer loads runtime follow settings defaults", () => {
  assert.match(settingsDrawerSource, /readBoolean\(filters, \["skip_private_profiles", "dont_follow_private_accounts"\], true\)/);
  assert.match(settingsDrawerSource, /readOptionalNumber\(contractFollowDay, \["db"\]\)/);
  assert.match(settingsDrawerSource, /readOptionalNumber\(contractFollowSession, \["db"\]\)/);
  assert.match(settingsDrawerSource, /label="Follow cap\/day"/);
  assert.match(settingsDrawerSource, /label="Follow cap\/session"/);
  assert.match(settingsDrawerSource, /label="Effective cap\/day"/);
  assert.match(settingsDrawerSource, /label="Effective cap\/session"/);
  assert.match(settingsDrawerSource, /label="Warmup cap today"/);
  assert.match(settingsDrawerSource, /title="Effective runtime limits"/);
  assert.match(settingsDrawerSource, /Persistent account value\. It may be lowered but cannot exceed the package maximum\./);
  assert.match(settingsDrawerSource, /Persistent account value\. Warmup never replaces this field\./);
  assert.doesNotMatch(settingsDrawerSource, /Draft override cap/);
});

test("Settings drawer persists and reloads the canonical Follow session cap", () => {
  assert.match(settingsDrawerSource, /manual_follow_session_cap:\s*follow\.manualFollowSessionCap/);
  assert.match(settingsDrawerSource, /readOptionalNumber\(contractFollowSession, \["db"\]\)/);
  assert.match(settingsDrawerSource, /manualFollowSessionCap:\s*followCapProjection\.configuredSessionCap/);
  assert.match(settingsDrawerSource, /title="Configured account limits"/);
  assert.doesNotMatch(settingsDrawerSource, /patch:\s*\{[\s\S]{0,500}day_1_follow_cap/);
  assert.match(settingsDrawerSource, /await refreshSettingsFromBackend\("Supabase-backed API · Follow settings saved"\)/);
});

test("Settings drawer DM save becomes ready when backend DM settings are connected", () => {
  assert.match(settingsDrawerSource, /saveReady: readString\(settings, \["dm_settings_status"\]/);
  assert.doesNotMatch(settingsDrawerSource, /dm:[\s\S]{0,500}saveReady: false,/);
});

test("Settings drawer DM dirty-state compares draft against loaded baseline", () => {
  assert.match(settingsDrawerSource, /DM_DRAWER_PATCH_ID = "dm-drawer-emoji-assets-v10"/);
  assert.match(settingsDrawerSource, /dmBaseline/);
  assert.match(settingsDrawerSource, /const dmDirty = !sameDmDraft\(dm, dmBaselineState\)/);
  assert.match(settingsDrawerSource, /function resolveDmSaveDisabledReason/);
  assert.match(settingsDrawerSource, /not_dirty/);
  assert.match(settingsDrawerSource, /No DM changes\./);
  assert.match(settingsDrawerSource, /if \(dm\.coldDmEnabled && unsupportedDmVariables\(outreachMessage\)/);
});

test("Settings drawer preserves and renders emoji DM text", () => {
  const emojiMatrix = "Emoji matrix: ✅ ❤️ 🔄 🔥 🚀 🙏 😄 ✨ 👍 🥰 👨‍💻 👩‍💻 ❤️‍🔥 👍🏽 🙏🏾 🇫🇷 🇺🇸 👋 🎀";
  assert.match(settingsDrawerSource, /countDmCharacters/);
  assert.match(settingsDrawerSource, /emojiRegex/);
  assert.match(settingsDrawerSource, /DmMessageTextarea/);
  assert.match(settingsDrawerSource, /className="input settings-textarea dm-message-textarea"/);
  assert.match(settingsDrawerSource, /onChange=\{\(event\) => onChange\(event\.currentTarget\.value\)\}/);
  assert.match(settingsDrawerSource, /RichEmojiText/);
  assert.match(settingsDrawerSource, /data-emoji=\{emoji\}/);
  assert.match(settingsDrawerSource, /DmEmojiImg/);
  assert.match(settingsDrawerSource, /from "\.\.\/\.\.\/\.\.\/emoji\/dm-emoji-asset-resolver"/);
  assert.match(settingsDrawerSource, /DM_EMOJI_MISSING_ASSET_SRC/);
  assert.match(profilesCssSource, /dm-message-textarea/);
  assert.match(profilesCssSource, /dm-emoji-img/);
  assert.match(packageSource, /copy:emoji-assets/);
  assert.match(packageSource, /verify-emoji-bundle/);
  assert.match(packageSource, /@twemoji\/svg/);
  assert.match(twemojiManifestSource, /"2705"/);
  assert.match(twemojiManifestSource, /"2764"/);
  assert.match(twemojiManifestSource, /"1f504"/);
  assert.match(twemojiManifestSource, /"1f44b"/);
  assert.match(twemojiManifestSource, /"1f380"/);
  assert.doesNotMatch(settingsDrawerSource, /\/emoji\/twemoji\//);
  assert.doesNotMatch(settingsDrawerSource, /twemoji-missing\.svg/);
  assert.doesNotMatch(settingsDrawerSource, /EmojiAssetFixture/);
  assert.doesNotMatch(settingsDrawerSource, /EmojiAssetLoadDiagnostic/);
  assert.doesNotMatch(settingsDrawerSource, /contentEditable/);
  assert.doesNotMatch(settingsDrawerSource, /document\.execCommand/);
  assert.doesNotMatch(settingsDrawerSource, /DM save diagnostics/);
  assert.doesNotMatch(settingsDrawerSource, /Emoji codepoints/);
  assert.doesNotMatch(settingsDrawerSource, /Debug emoji/);
  assert.doesNotMatch(profilesCssSource, /dm-deterministic-emoji-code/);
  assert.doesNotMatch(settingsDrawerSource, /DeterministicEmojiText/);
  assert.doesNotMatch(settingsDrawerSource, /NativeEmojiText/);
  assert.doesNotMatch(settingsDrawerSource, /DmRichEmojiEditor/);
  assert.doesNotMatch(profilesCssSource, /font-family: var\(--font-sans\), "Apple Color Emoji"/);
  assert.doesNotMatch(settingsDrawerSource, /https:\/\/twemoji|twemoji\.maxcdn|cdnjs|cdn/i);
  assert.doesNotMatch(settingsDrawerSource, /[^A-Za-z]replace\([^)]*[^\\]x00-[^)]*7F/);
  for (const emoji of ["✅", "❤️", "🔄", "🔥", "🚀", "🙏", "😄", "✨", "👍", "🥰", "👨‍💻", "👩‍💻", "❤️‍🔥", "👍🏽", "🙏🏾", "🇫🇷", "🇺🇸", "👋", "🎀"]) {
    assert.ok(emojiMatrix.includes(emoji));
  }
});

test("Emoji renderer parser detects full DM emoji matrix", () => {
  const message = "Emoji matrix: ✅ ❤️ 🔄 🔥 🚀 🙏 😄 ✨ 👍 🥰 👨‍💻 👩‍💻 ❤️‍🔥 👍🏽 🙏🏾 🇫🇷 🇺🇸 👋 🎀";
  const detected = Array.from(message.matchAll(emojiRegex()), (match) => match[0]);

  assert.deepEqual(detected, ["✅", "❤️", "🔄", "🔥", "🚀", "🙏", "😄", "✨", "👍", "🥰", "👨‍💻", "👩‍💻", "❤️‍🔥", "👍🏽", "🙏🏾", "🇫🇷", "🇺🇸", "👋", "🎀"]);
  assert.equal(message, "Emoji matrix: ✅ ❤️ 🔄 🔥 🚀 🙏 😄 ✨ 👍 🥰 👨‍💻 👩‍💻 ❤️‍🔥 👍🏽 🙏🏾 🇫🇷 🇺🇸 👋 🎀");
});

test("Stop account run and dispatcher stop are separated", () => {
  const mainSource = readFileSync(new URL("../../../electron/main.cjs", import.meta.url), "utf8");
  assert.match(mainSource, /profiles_run_start/);
  assert.match(mainSource, /botapp:profiles:run-start/);
  assert.match(mainSource, /requested_run_type: "account_session"/);
  assert.match(mainSource, /trigger: "manual_botapp"/);
  assert.match(mainSource, /source: "botapp_manual_play"/);
  assert.match(profilesViewSource, /startAccountRun/);
  assert.match(profilesViewSource, /\/api\/instagram-dashboard\/runs\/start/);
  assert.match(profilesViewSource, /Start account run for/);
  assert.doesNotMatch(profilesViewSource, /Reactivate account/);
  assert.doesNotMatch(profilesViewSource, /It reactivates the account admin status/);
  assert.match(mainSource, /profiles_run_stop/);
  assert.match(mainSource, /path: "\/api\/instagram-dashboard\/stop"/);
  assert.match(profilesViewSource, /stopAccountRun/);
  assert.match(profilesViewSource, /botapp_manual_stop/);
  assert.doesNotMatch(profilesViewSource, /Pause account/);
  assert.doesNotMatch(profilesViewSource, /It writes account admin status only/);
  assert.match(mainSource, /profiles_account_status/);
  assert.match(mainSource, /path: "\/api\/instagram-dashboard\/accounts\/status"/);
  assert.match(mainSource, /dispatcherAllowedActions = new Set\(\["status", "install", "pause", "resume", "restart", "stop", "logs", "fix-duplicate"\]\)/);
});
