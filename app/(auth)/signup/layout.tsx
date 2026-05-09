import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTenantByDomain } from '@/config/tenants';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  const productName = tenant?.productName ?? 'The Guild';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`).replace(/\/$/, '');

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
      images: [{ url: `${baseUrl}/icon-192.png`, width: 192, height: 192, alt: productName }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
