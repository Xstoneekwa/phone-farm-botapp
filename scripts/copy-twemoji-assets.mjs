import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(rootDir, "node_modules/@twemoji/svg");
const publicTargetDir = resolve(rootDir, "public/emoji/twemoji");
const manifestTarget = resolve(rootDir, "src/emoji/twemoji-assets.json");

rmSync(publicTargetDir, { recursive: true, force: true });
mkdirSync(publicTargetDir, { recursive: true });
mkdirSync(dirname(manifestTarget), { recursive: true });

const files = readdirSync(sourceDir)
  .filter((file) => file.endsWith(".svg"))
  .sort();

for (const file of files) {
  copyFileSync(join(sourceDir, file), join(publicTargetDir, file));
}

writeFileSync(manifestTarget, `${JSON.stringify(files.map((file) => file.replace(/\.svg$/, "")), null, 2)}\n`);
console.log(`Copied ${files.length} Twemoji SVG assets to public/emoji/twemoji`);
