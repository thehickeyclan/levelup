import { describe, expect, it } from 'vitest';
import { resolveShareGraphicTheme, parseShareGraphicThemeId } from './themes';

describe('session share graphic themes', () => {
  it('maps schools to skins', () => {
    expect(resolveShareGraphicTheme('NC State')).toBe('nc-state');
    expect(resolveShareGraphicTheme('NCSU')).toBe('nc-state');
    expect(resolveShareGraphicTheme('UNC')).toBe('unc');
    expect(resolveShareGraphicTheme('Appalachian State')).toBe('app-state');
    expect(resolveShareGraphicTheme('Triangle Wrestling Club')).toBe('guild');
  });

  it('honors override', () => {
    expect(resolveShareGraphicTheme('UNC', 'guild')).toBe('guild');
  });

  it('parses theme query param', () => {
    expect(parseShareGraphicThemeId('nc-state')).toBe('nc-state');
    expect(parseShareGraphicThemeId('invalid')).toBe(null);
  });
});
