import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTenantByDomain } from '@/config/tenants';
import { resolveSiteBaseUrl } from '@/lib/site-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  const productName = tenant?.productName ?? 'The Guild';
  const baseUrl = resolveSiteBaseUrl(host);
  const logoPath = tenant?.logo ?? '/logos/guild-mark.png';

  const title = `Join ${productName}`;
  const description = `A friend invited you to train with NCAA wrestlers and elite coaches. Create your account and book technique sessions in your community.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/signup`,
      siteName: productName,
      type: 'website',
      images: [{ url: logoPath, alt: productName }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [logoPath],
    },
  };
}

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
