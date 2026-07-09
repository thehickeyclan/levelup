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

  const names = ['Inter-Bold.ttf', 'Inter-ExtraBold.ttf'];
  const found: string[] = [];

  for (const name of names) {
    for (const dir of FONT_DIR_CANDIDATES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        found.push(candidate);
        break;
      }
    }
  }

  cachedFontFiles = found;
  return found;
}

/** Rasterize SVG overlay (with text) to PNG using bundled Inter fonts. */
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

export const SHARE_GRAPHIC_FONT_FAMILY = 'Inter';
