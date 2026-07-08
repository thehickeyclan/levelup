import type { Metadata } from 'next';

const DEFAULT_LOGO_PATH = '/logos/guild-bronze.jpg';

/** Canonical site origin for absolute OG URLs (metadataBase, share links). */
export function resolveSiteBaseUrl(host: string): string {
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return (process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`).replace(/\/$/, '');
}

/** Open Graph / Twitter image — same brand mark as the homepage hero. */
export function siteShareImageMetadata(
  productName: string,
  logoPath: string = DEFAULT_LOGO_PATH
): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: {
      siteName: productName,
      type: 'website',
      images: [
        {
          url: logoPath,
          alt: productName,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      images: [logoPath],
    },
  };
}
