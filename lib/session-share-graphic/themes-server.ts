import fs from 'fs';
import path from 'path';
import { SHARE_GRAPHIC_THEMES, type ShareGraphicThemeId } from './themes';

export function shareGraphicBackgroundPath(themeId: ShareGraphicThemeId): string | null {
  const file = SHARE_GRAPHIC_THEMES[themeId].backgroundFile;
  const abs = path.join(process.cwd(), 'public', file);
  return fs.existsSync(abs) ? abs : null;
}
