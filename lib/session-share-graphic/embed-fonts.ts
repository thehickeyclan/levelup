import fs from 'fs';
import path from 'path';

let cachedFontFaceBlock: string | null = null;

function readFirstExistingFont(
  fileNames: string[]
): { buffer: Buffer; mime: string; format: string } | null {
  const dirs = [
    path.join(process.cwd(), 'public/share-templates/fonts'),
    path.join(process.cwd(), 'lib/session-share-graphic/fonts'),
  ];
  for (const fileName of fileNames) {
    for (const dir of dirs) {
      const candidate = path.join(dir, fileName);
      try {
        if (fs.existsSync(candidate)) {
          const buffer = fs.readFileSync(candidate);
          if (fileName.endsWith('.ttf')) {
            return { buffer, mime: 'font/ttf', format: 'truetype' };
          }
          return { buffer, mime: 'font/woff2', format: 'woff2' };
        }
      } catch {
        // try next
      }
    }
  }
  return null;
}

/** Embedded @font-face for sharp/librsvg on Linux (Vercel has no system Arial). */
export function shareGraphicFontFaceBlock(): string {
  if (cachedFontFaceBlock !== null) return cachedFontFaceBlock;

  const bold = readFirstExistingFont(['Inter-Bold.ttf', 'Inter-Bold.woff2']);
  const extraBold = readFirstExistingFont(['Inter-ExtraBold.ttf', 'Inter-ExtraBold.woff2']);

  if (!bold || !extraBold) {
    console.warn('[shareGraphicFontFaceBlock] fonts missing — text may not render');
    cachedFontFaceBlock = '';
    return cachedFontFaceBlock;
  }

  cachedFontFaceBlock = `
  @font-face {
    font-family: 'ShareGraphic';
    font-weight: 700;
    font-style: normal;
    src: url('data:${bold.mime};base64,${bold.buffer.toString('base64')}') format('${bold.format}');
  }
  @font-face {
    font-family: 'ShareGraphic';
    font-weight: 800;
    font-style: normal;
    src: url('data:${extraBold.mime};base64,${extraBold.buffer.toString('base64')}') format('${extraBold.format}');
  }`;

  return cachedFontFaceBlock;
}

export const SHARE_GRAPHIC_FONT_FAMILY = 'ShareGraphic, sans-serif';
