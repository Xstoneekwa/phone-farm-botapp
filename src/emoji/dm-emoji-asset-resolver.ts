import emojiRegex from "emoji-regex";
import twemojiAssetKeys from "./twemoji-assets.json";

const TWEMOJI_STRIP_VARIATION_SELECTORS = /-fe0f|-fe0e/g;
const TWEMOJI_ASSET_KEYS = new Set<string>(twemojiAssetKeys);
const TWEMOJI_ASSET_BASE = `${import.meta.env.BASE_URL}emoji/twemoji/`;

const MISSING_EMOJI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" role="img" aria-label="emoji"><circle cx="36" cy="36" r="31" fill="#FFF7ED" stroke="#FDBA74" stroke-width="4"/><circle cx="25" cy="30" r="4" fill="#9A3412"/><circle cx="47" cy="30" r="4" fill="#9A3412"/><path fill="none" stroke="#9A3412" stroke-linecap="round" stroke-width="4" d="M24 48c6-5 18-5 24 0"/></svg>`;

export const DM_EMOJI_MISSING_ASSET_SRC = `data:image/svg+xml,${encodeURIComponent(MISSING_EMOJI_SVG)}`;

export const TWEMOJI_PACKAGED_ASSET_COUNT = TWEMOJI_ASSET_KEYS.size;

export function emojiCodepointKey(emoji: string) {
  return Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16).toLowerCase())
    .filter(Boolean)
    .join("-");
}

export function emojiAssetFilename(emoji: string) {
  return `${emojiAssetKey(emoji)}.svg`;
}

export function emojiAssetKey(emoji: string) {
  const exact = emojiCodepointKey(emoji);
  if (TWEMOJI_ASSET_KEYS.has(exact)) return exact;
  const withoutVariationSelectors = exact.replace(TWEMOJI_STRIP_VARIATION_SELECTORS, "");
  if (TWEMOJI_ASSET_KEYS.has(withoutVariationSelectors)) return withoutVariationSelectors;
  return exact;
}

export function emojiAssetSrc(emoji: string) {
  const key = emojiAssetKey(emoji);
  if (!TWEMOJI_ASSET_KEYS.has(key)) return DM_EMOJI_MISSING_ASSET_SRC;
  return `${TWEMOJI_ASSET_BASE}${key}.svg`;
}

export function emojiAssetResolved(emoji: string) {
  return TWEMOJI_ASSET_KEYS.has(emojiAssetKey(emoji));
}

export function dmEmojiList(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return Array.from(normalized.matchAll(emojiRegex()), (match) => match[0]);
}

export function missingEmojiAssets(value: string) {
  const missing = new Set<string>();
  for (const emoji of dmEmojiList(value)) {
    if (!emojiAssetResolved(emoji)) missing.add(emoji);
  }
  return Array.from(missing);
}

export const DM_EMOJI_CRITICAL_PROBE_SET = ["❤️", "✅", "🔄", "👋", "🎀", "🇫🇷"] as const;

export const DM_EMOJI_MATRIX =
  "Emoji matrix: ✅ ❤️ 🔄 🔥 🚀 🙏 😄 ✨ 👍 🥰 👨‍💻 👩‍💻 ❤️‍🔥 👍🏽 🙏🏾 🇫🇷 🇺🇸 👋 🎀";
