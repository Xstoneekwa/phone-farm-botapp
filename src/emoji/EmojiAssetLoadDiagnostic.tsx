import { useEffect, useState } from "react";
import {
  DM_EMOJI_CRITICAL_PROBE_SET,
  emojiAssetFilename,
  emojiAssetKey,
  emojiAssetSrc,
} from "./dm-emoji-asset-resolver";

const TWEMOJI_ASSET_BASE = `${import.meta.env.BASE_URL}emoji/twemoji/`;

type AssetProbeRow = {
  emoji: string;
  filename: string;
  src: string;
  currentSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  complete: boolean;
  onError: boolean;
};

function emptyProbe(emoji: string): AssetProbeRow {
  const key = emojiAssetKey(emoji);
  return {
    emoji,
    filename: `${key}.svg`,
    src: emojiAssetSrc(emoji),
    currentSrc: "",
    naturalWidth: 0,
    naturalHeight: 0,
    complete: false,
    onError: false,
  };
}

export function EmojiAssetLoadDiagnostic() {
  const [rows, setRows] = useState<AssetProbeRow[]>(() => DM_EMOJI_CRITICAL_PROBE_SET.map(emptyProbe));

  useEffect(() => {
    const controllers = DM_EMOJI_CRITICAL_PROBE_SET.map((emoji, index) => {
      const img = new Image();
      const src = emojiAssetSrc(emoji);
      const filename = emojiAssetFilename(emoji);

      const commit = (patch: Partial<AssetProbeRow>) => {
        setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
      };

      img.onload = () => {
        commit({
          filename,
          src,
          currentSrc: img.currentSrc || img.src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          onError: false,
        });
      };

      img.onerror = () => {
        commit({
          filename,
          src,
          currentSrc: img.currentSrc || img.src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          onError: true,
        });
      };

      img.src = src;
      return img;
    });

    return () => {
      for (const img of controllers) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, []);

  return (
    <div className="dm-emoji-asset-probe-grid">
      <div className="dm-emoji-asset-probe-base">
        <span>asset base URL</span>
        <code>{TWEMOJI_ASSET_BASE}</code>
      </div>
      {rows.map((row) => (
        <div key={row.emoji} className={`dm-emoji-asset-probe-row${row.onError || row.naturalWidth === 0 ? " failed" : " ok"}`}>
          <div className="dm-emoji-asset-probe-head">
            <img className="dm-emoji-img" src={row.src} alt={row.emoji} title={row.emoji} draggable={false} />
            <strong>{row.emoji}</strong>
          </div>
          <dl className="dm-emoji-asset-probe-meta">
            <div><dt>filename</dt><dd>{row.filename}</dd></div>
            <div><dt>src</dt><dd>{row.src}</dd></div>
            <div><dt>currentSrc</dt><dd>{row.currentSrc || "pending"}</dd></div>
            <div><dt>naturalWidth</dt><dd>{row.naturalWidth}</dd></div>
            <div><dt>naturalHeight</dt><dd>{row.naturalHeight}</dd></div>
            <div><dt>complete</dt><dd>{row.complete ? "true" : "false"}</dd></div>
            <div><dt>onError</dt><dd>{row.onError ? "true" : "false"}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  );
}
