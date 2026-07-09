import type { ShareGraphicTheme, ShareGraphicThemeId } from './themes';

export type SessionShareGraphicContent = {
  firstName: string;
  lastName: string;
  schoolLabel: string;
  sessionTypeLabel: string;
  sessionStatusLabel: string;
  timeLabel: string;
  dateDayLabel: string;
  dateRestLabel: string;
  facilityLine: string;
  footerLeftTitle: string;
  footerLeftValue: string;
  footerCenterTitle: string;
  footerCenterValue: string;
  footerRightTitle: string;
  footerRightValue: string;
};

export const FONT_DISPLAY = 'Bebas Neue';
export const FONT_SCRIPT = 'Kaushan Script';
export const FONT_BODY = 'Inter';

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function truncateUpper(text: string, max: number): string {
  const t = text.trim().toUpperCase();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function buildLeftScrimSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000" stop-opacity="0.78"/>
      <stop offset="50%" stop-color="#000" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${Math.round(width * 0.58)}" height="${height}" fill="url(#scrim)"/>
</svg>`;
}

function ruledLabel(
  x: number,
  y: number,
  width: number,
  label: string,
  color: string,
  fontSize: number
): string {
  const cx = x + width / 2;
  const lineY = y - 6;
  const lineInset = 8;
  const textW = label.length * fontSize * 0.52;
  const gap = 18;
  const leftLineEnd = cx - textW / 2 - gap;
  const rightLineStart = cx + textW / 2 + gap;
  return `
  <line x1="${x + lineInset}" y1="${lineY}" x2="${Math.max(x + lineInset + 40, leftLineEnd)}" y2="${lineY}" stroke="${color}" stroke-width="2.5"/>
  <text x="${cx}" y="${y}" fill="${color}" font-family="${FONT_BODY}" font-weight="700" font-size="${fontSize}" letter-spacing="3" text-anchor="middle">${label}</text>
  <line x1="${Math.min(x + width - lineInset - 40, rightLineStart)}" y1="${lineY}" x2="${x + width - lineInset}" y2="${lineY}" stroke="${color}" stroke-width="2.5"/>
  `;
}

/** Match manual NC State posts — distressed display name, brush last name, ruled day, boxed time. */
function buildSchoolStyleOverlay(
  width: number,
  height: number,
  theme: ShareGraphicTheme,
  content: SessionShareGraphicContent
): string {
  const fn = escapeXml(content.firstName);
  const ln = escapeXml(content.lastName);
  const school = escapeXml(content.schoolLabel);
  const day = escapeXml(content.dateDayLabel);
  const dateRest = escapeXml(content.dateRestLabel);
  const time = escapeXml(content.timeLabel);
  const status = escapeXml(content.sessionStatusLabel);
  const facility = escapeXml(content.facilityLine);

  const boxX = 48;
  const boxY = 598;
  const boxW = 500;
  const boxH = 98;
  const dividerX = boxX + 268;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="grit" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="8" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>

  <text x="52" y="318" fill="${theme.firstNameColor}" font-family="${FONT_DISPLAY}" font-size="118" letter-spacing="5" filter="url(#grit)">${fn}</text>
  <text x="58" y="418" fill="${theme.lastNameColor}" font-family="${FONT_SCRIPT}" font-size="92" letter-spacing="1" transform="rotate(-7 58 418)">${ln}</text>
  <text x="56" y="468" fill="${theme.firstNameColor}" font-family="${FONT_BODY}" font-weight="700" font-size="26" letter-spacing="5">${school}</text>

  ${ruledLabel(boxX, 538, boxW, day, theme.datePrimaryColor, 28)}

  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" fill="none" stroke="${theme.timeBoxStroke}" stroke-width="3.5" rx="1"/>
  <line x1="${dividerX}" y1="${boxY + 14}" x2="${dividerX}" y2="${boxY + boxH - 14}" stroke="${theme.timeBoxStroke}" stroke-width="2.5"/>
  <text x="${boxX + 36}" y="${boxY + 72}" fill="${theme.timeColor}" font-family="${FONT_DISPLAY}" font-size="76" letter-spacing="2">${time}</text>
  <text x="${dividerX + 118}" y="${boxY + 68}" fill="${theme.lastNameColor}" font-family="${FONT_SCRIPT}" font-size="38" letter-spacing="1" text-anchor="middle" transform="rotate(-14 ${dividerX + 118} ${boxY + 68})">${status}</text>

  <text x="56" y="748" fill="${theme.facilityColor}" font-family="${FONT_BODY}" font-weight="700" font-size="26" letter-spacing="2">${facility}</text>
  <text x="56" y="784" fill="${theme.dateSecondaryColor}" font-family="${FONT_BODY}" font-weight="600" font-size="22" letter-spacing="2" opacity="0.9">${dateRest}</text>
</svg>`;
}

function buildGuildFooterOverlay(
  width: number,
  height: number,
  theme: ShareGraphicTheme,
  content: SessionShareGraphicContent
): string {
  const footerH = 132;
  const footerY = height - footerH;
  const flt = escapeXml(content.footerLeftTitle);
  const flv = escapeXml(content.footerLeftValue);
  const fct = escapeXml(content.footerCenterTitle);
  const fcv = escapeXml(content.footerCenterValue);
  const frt = escapeXml(content.footerRightTitle);
  const frv = escapeXml(content.footerRightValue);

  return `
  <rect x="0" y="${footerY}" width="${width}" height="${footerH}" fill="#000" fill-opacity="0.92"/>
  <line x1="360" y1="${footerY + 24}" x2="360" y2="${footerY + footerH - 24}" stroke="${theme.footerDivider}" stroke-width="2"/>
  <line x1="720" y1="${footerY + 24}" x2="720" y2="${footerY + footerH - 24}" stroke="${theme.footerDivider}" stroke-width="2"/>
  <text x="180" y="${footerY + 48}" fill="${theme.footerLabelColor}" font-family="${FONT_BODY}" font-weight="700" font-size="20" letter-spacing="1.5" text-anchor="middle">${flt}</text>
  <text x="180" y="${footerY + 82}" fill="${theme.footerValueColor}" font-family="${FONT_BODY}" font-weight="800" font-size="22" letter-spacing="1" text-anchor="middle">${flv}</text>
  <text x="540" y="${footerY + 48}" fill="${theme.footerLabelColor}" font-family="${FONT_BODY}" font-weight="700" font-size="20" letter-spacing="1.5" text-anchor="middle">${fct}</text>
  <text x="540" y="${footerY + 82}" fill="${theme.footerValueColor}" font-family="${FONT_BODY}" font-weight="800" font-size="22" letter-spacing="1" text-anchor="middle">${fcv}</text>
  <text x="900" y="${footerY + 48}" fill="${theme.footerLabelColor}" font-family="${FONT_BODY}" font-weight="700" font-size="20" letter-spacing="1.5" text-anchor="middle">${frt}</text>
  <text x="900" y="${footerY + 82}" fill="${theme.footerValueColor}" font-family="${FONT_BODY}" font-weight="800" font-size="22" letter-spacing="1" text-anchor="middle">${frv}</text>
  `;
}

export function buildTextOverlaySvg(
  width: number,
  height: number,
  theme: ShareGraphicTheme,
  content: SessionShareGraphicContent
): string {
  const schoolBody = buildSchoolStyleOverlay(width, height, theme, content);

  if (theme.id === 'guild') {
    const fn = escapeXml(content.firstName);
    const ln = escapeXml(content.lastName);
    const type = escapeXml(content.sessionTypeLabel);
    const time = escapeXml(content.timeLabel);
    const day = escapeXml(content.dateDayLabel);
    const dateRest = escapeXml(content.dateRestLabel);
    const facility = escapeXml(content.facilityLine);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="56" y="300" fill="${theme.firstNameColor}" font-family="${FONT_DISPLAY}" font-size="100" letter-spacing="4">${fn}</text>
  <text x="56" y="400" fill="${theme.lastNameColor}" font-family="${FONT_SCRIPT}" font-size="80" transform="rotate(-6 56 400)">${ln}</text>
  <text x="56" y="448" fill="${theme.sessionTypeColor}" font-family="${FONT_BODY}" font-weight="700" font-size="30" letter-spacing="3">${type}</text>
  <rect x="52" y="472" width="420" height="108" fill="none" stroke="${theme.timeBoxStroke}" stroke-width="4" rx="2"/>
  <text x="68" y="548" fill="${theme.timeColor}" font-family="${FONT_DISPLAY}" font-size="88" letter-spacing="1">${time}</text>
  <text x="56" y="612" fill="${theme.datePrimaryColor}" font-family="${FONT_BODY}" font-weight="800" font-size="30" letter-spacing="2">${day}</text>
  <text x="56" y="648" fill="${theme.dateSecondaryColor}" font-family="${FONT_BODY}" font-weight="700" font-size="28" letter-spacing="2">${dateRest}</text>
  <text x="56" y="710" fill="${theme.facilityColor}" font-family="${FONT_BODY}" font-weight="800" font-size="30" letter-spacing="1">${facility}</text>
  ${buildGuildFooterOverlay(width, height, theme, content)}
</svg>`;
  }

  return schoolBody;
}

export function usesSchoolStyleOverlay(themeId: ShareGraphicThemeId): boolean {
  return themeId !== 'guild';
}
