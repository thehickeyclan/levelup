import type { ShareGraphicTheme } from './themes';

export type SessionShareGraphicContent = {
  firstName: string;
  lastName: string;
  sessionTypeLabel: string;
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
      <stop offset="0%" stop-color="#000" stop-opacity="0.72"/>
      <stop offset="55%" stop-color="#000" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${Math.round(width * 0.62)}" height="${height}" fill="url(#scrim)"/>
</svg>`;
}

export function buildTextOverlaySvg(
  width: number,
  height: number,
  theme: ShareGraphicTheme,
  content: SessionShareGraphicContent
): string {
  const fn = escapeXml(content.firstName);
  const ln = escapeXml(content.lastName);
  const type = escapeXml(content.sessionTypeLabel);
  const time = escapeXml(content.timeLabel);
  const day = escapeXml(content.dateDayLabel);
  const dateRest = escapeXml(content.dateRestLabel);
  const facility = escapeXml(content.facilityLine);
  const flt = escapeXml(content.footerLeftTitle);
  const flv = escapeXml(content.footerLeftValue);
  const fct = escapeXml(content.footerCenterTitle);
  const fcv = escapeXml(content.footerCenterValue);
  const frt = escapeXml(content.footerRightTitle);
  const frv = escapeXml(content.footerRightValue);

  const footerH = 132;
  const footerY = height - footerH;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .fn { font-family: Arial, Helvetica, sans-serif; font-weight: 800; font-size: 64px; letter-spacing: 2px; }
    .ln { font-family: Arial, Helvetica, sans-serif; font-weight: 900; font-size: 78px; letter-spacing: 1px; }
    .type { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 34px; letter-spacing: 3px; }
    .time { font-family: Arial, Helvetica, sans-serif; font-weight: 900; font-size: 88px; letter-spacing: 1px; }
    .day { font-family: Arial, Helvetica, sans-serif; font-weight: 800; font-size: 30px; letter-spacing: 2px; }
    .date { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 28px; letter-spacing: 2px; }
    .fac { font-family: Arial, Helvetica, sans-serif; font-weight: 800; font-size: 30px; letter-spacing: 1px; }
    .ft { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 20px; letter-spacing: 1.5px; }
    .fv { font-family: Arial, Helvetica, sans-serif; font-weight: 800; font-size: 22px; letter-spacing: 1px; }
    .brand { font-family: Arial, Helvetica, sans-serif; font-weight: 600; font-size: 16px; letter-spacing: 1px; opacity: 0.85; }
  </style>

  <text x="56" y="300" class="fn" fill="${theme.firstNameColor}">${fn}</text>
  <text x="56" y="388" class="ln" fill="${theme.lastNameColor}">${ln}</text>
  <text x="56" y="448" class="type" fill="${theme.sessionTypeColor}">${type}</text>

  <rect x="52" y="472" width="420" height="108" fill="none" stroke="${theme.timeBoxStroke}" stroke-width="4" rx="2"/>
  <text x="68" y="548" class="time" fill="${theme.timeColor}">${time}</text>

  <text x="56" y="612" class="day" fill="${theme.datePrimaryColor}">${day}</text>
  <text x="56" y="648" class="date" fill="${theme.dateSecondaryColor}">${dateRest}</text>
  <text x="56" y="710" class="fac" fill="${theme.facilityColor}">${facility}</text>

  <rect x="0" y="${footerY}" width="${width}" height="${footerH}" fill="#000" fill-opacity="0.92"/>
  <line x1="360" y1="${footerY + 24}" x2="360" y2="${footerY + footerH - 24}" stroke="${theme.footerDivider}" stroke-width="2"/>
  <line x1="720" y1="${footerY + 24}" x2="720" y2="${footerY + footerH - 24}" stroke="${theme.footerDivider}" stroke-width="2"/>

  <text x="180" y="${footerY + 48}" class="ft" fill="${theme.footerLabelColor}" text-anchor="middle">${flt}</text>
  <text x="180" y="${footerY + 82}" class="fv" fill="${theme.footerValueColor}" text-anchor="middle">${flv}</text>

  <text x="540" y="${footerY + 48}" class="ft" fill="${theme.footerLabelColor}" text-anchor="middle">${fct}</text>
  <text x="540" y="${footerY + 82}" class="fv" fill="${theme.footerValueColor}" text-anchor="middle">${fcv}</text>

  <text x="900" y="${footerY + 48}" class="ft" fill="${theme.footerLabelColor}" text-anchor="middle">${frt}</text>
  <text x="900" y="${footerY + 82}" class="fv" fill="${theme.footerValueColor}" text-anchor="middle">${frv}</text>

  <text x="${width - 24}" y="${height - 20}" class="brand" fill="${theme.lastNameColor}" text-anchor="end">THE WRESTLING GUILD</text>
</svg>`;
}
