import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const FONT_DIR_CANDIDATES = [
  path.join(process.cwd(), 'public/share-templates/fonts'),
  path.join(process.cwd(), 'lib/session-share-graphic/fonts'),
];

let cachedFontFiles: string[] | null = null;

/** TTF paths for resvg (explicit fonts — sharp/librsvg ignores embedded @font-face on Vercel). */
export function resolveShareGraphicFontFiles(): string[] {
  if (cachedFontFiles) return cachedFontFiles;

  const found: string[] = [];
  const preferred = [
    'BebasNeue-Regular.ttf',
    'KaushanScript-Regular.ttf',
    'Inter-Bold.ttf',
    'Inter-ExtraBold.ttf',
  ];

  for (const dir of FONT_DIR_CANDIDATES) {
    if (!fs.existsSync(dir)) continue;
    for (const name of preferred) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) found.push(candidate);
    }
    // Any extra bundled TTFs (future skins)
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.ttf')) continue;
      const candidate = path.join(dir, name);
      if (!found.includes(candidate)) found.push(candidate);
    }
  }

  cachedFontFiles = found;
  return found;
}

/** Rasterize SVG overlay (with text) to PNG using bundled fonts. */
export function rasterizeShareOverlaySvg(svg: string): Buffer {
  const fontFiles = resolveShareGraphicFontFiles();
  if (fontFiles.length === 0) {
    console.warn('[rasterizeShareOverlaySvg] no font files — text may not render');
  }

  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles,
    },
  });

  return Buffer.from(resvg.render().asPng());
}
