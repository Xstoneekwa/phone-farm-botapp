import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import emojiRegex from "emoji-regex";

const currentDir = dirname(fileURLToPath(import.meta.url));
const profilesViewSource = readFileSync(resolve(currentDir, "ProfilesView.tsx"), "utf8");
const settingsDrawerSource = readFileSync(resolve(currentDir, "drawers/SettingsDrawer.tsx"), "utf8");
const filterSettingsPanelSource = readFileSync(resolve(currentDir, "drawers/FilterSettingsPanel.tsx"), "utf8");
const profilesCssSource = readFileSync(resolve(currentDir, "profiles.css"), "utf8");
const mainSource = readFileSync(resolve(currentDir, "../../../electron/main.cjs"), "utf8");
const packageSource = readFileSync(resolve(currentDir, "../../../package.json"), "utf8");
const twemojiManifestSource = readFileSync(resolve(currentDir, "../../../src/emoji/twemoji-assets.json"), "utf8");

test("connect badge shows saved credentials as ready to connect", () => {
  assert.match(profilesViewSource, /profile\.credentialStatus === "saved_pending_verification"[\s\S]*ready to connect/);
});

test("social badge separates login and target blocks", () => {
  assert.match(profilesViewSource, /reason\.includes\("login"\)[\s\S]*social needs login/);
  assert.match(profilesViewSource, /reason\.includes\("target"\)[\s\S]*growth needs targets/);
});

test("BotApp profile normalization blocks social eligibility until login is connected", () => {
  assert.match(mainSource, /loginStatus && loginStatus !== "connected"[\s\S]*blocked_now/);
  assert.match(mainSource, /loginStatus && loginStatus !== "connected"[\s\S]*login_not_connected/);
  assert.match(mainSource, /readEligibility\(account, blocked, loginStatus\)/);
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
  assert.match(settingsDrawerSource, /\["manual_follow_day_cap", "max_actions_per_day"\]/);
  assert.match(settingsDrawerSource, /\["manual_follow_session_cap", "follow_limit"\]/);
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
  assert.match(mainSource, /profiles_run_stop/);
  assert.match(mainSource, /path: "\/api\/instagram-dashboard\/stop"/);
  assert.match(mainSource, /profiles_account_status/);
  assert.match(mainSource, /path: "\/api\/instagram-dashboard\/accounts\/status"/);
  assert.match(mainSource, /dispatcherAllowedActions = new Set\(\["status", "pause", "resume", "restart", "stop", "logs", "fix-duplicate"\]\)/);
});
