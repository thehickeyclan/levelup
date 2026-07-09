import fs from 'fs';
import path from 'path';

const FONT_DIR = path.join(process.cwd(), 'lib/session-share-graphic/fonts');

let cachedFontFaceBlock: string | null = null;

/** Embedded @font-face for sharp/librsvg on Linux (Vercel has no Arial). */
export function shareGraphicFontFaceBlock(): string {
  if (cachedFontFaceBlock) return cachedFontFaceBlock;

  const bold = fs.readFileSync(path.join(FONT_DIR, 'Inter-Bold.woff2'));
  const extraBold = fs.readFileSync(path.join(FONT_DIR, 'Inter-ExtraBold.woff2'));

  cachedFontFaceBlock = `
  @font-face {
    font-family: 'ShareGraphic';
    font-weight: 700;
    font-style: normal;
    src: url('data:font/woff2;base64,${bold.toString('base64')}') format('woff2');
  }
  @font-face {
    font-family: 'ShareGraphic';
    font-weight: 800;
    font-style: normal;
    src: url('data:font/woff2;base64,${extraBold.toString('base64')}') format('woff2');
  }`;

  return cachedFontFaceBlock;
}

export const SHARE_GRAPHIC_FONT_FAMILY = 'ShareGraphic, sans-serif';
