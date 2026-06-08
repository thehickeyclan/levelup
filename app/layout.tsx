import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Playfair_Display } from 'next/font/google';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { Analytics } from '@vercel/analytics/next';
import { ThemeProvider } from '@/components/theme-provider';
import { PwaInstallProvider, PwaInstallBanner } from '@/components/pwa-install-provider';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { CartProvider } from '@/lib/cart-context';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ParentBottomNavWrapper } from '@/components/parent-bottom-nav-wrapper';
import { MetaPixel } from '@/components/meta-pixel';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-playfair',
  display: 'swap',
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = resolveHostnameFromHeaders(headersList);
  const tenant = getTenantByDomain(host);
  const appleTitle = tenant?.productName ?? 'The Guild';
  const title = tenant
    ? `${tenant.productName} | Youth Wrestling — All Levels`
    : 'The Guild | Youth Wrestling — All Levels';

  return {
    title,
    description:
      'Book NCAA and elite coaches for youth wrestling — beginners through high school. Private sessions on their calendar, or join open groups and partner spots.',
    keywords:
      'the guild wrestling, wrestling lessons, NCAA wrestlers, elite coaches, elite technique, private lessons',
    icons: {
      icon: '/favicon.ico',
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: appleTitle,
    },
    manifest: '/manifest.json',
  };
}

const deploymentSha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
const metaPixelId = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '').trim();

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const host = resolveHostnameFromHeaders(headersList);
  const tenant = getTenantByDomain(host);

  const htmlProps = {
    lang: 'en' as const,
    className: `dark ${playfair.variable}`,
    ...(deploymentSha ? { 'data-deployment-sha': deploymentSha } : {}),
  };

  if (!tenant) {
    return (
      <html {...htmlProps}>
        <body className="font-sans bg-background text-foreground">
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Tenant not found</h1>
              <p className="text-muted-foreground">Unable to resolve tenant for domain: {host}</p>
            </div>
          </div>
          <Analytics />
          {metaPixelId ? <MetaPixel pixelId={metaPixelId} /> : null}
        </body>
      </html>
    );
  }

  return (
    <html {...htmlProps}>
      <body className="flex flex-col min-h-screen font-sans bg-background text-foreground">
        <ThemeProvider tenant={tenant}>
          <PwaInstallProvider>
            <AuthProvider tenantSlug={tenant.slug}>
              <CartProvider>
                <Header />
                <PwaInstallBanner />
                <main className="flex-1 pb-[env(safe-area-inset-bottom)]">
                  <ParentBottomNavWrapper>{children}</ParentBottomNavWrapper>
                </main>
                <Footer />
              </CartProvider>
            </AuthProvider>
          </PwaInstallProvider>
        </ThemeProvider>
        <Analytics />
        {metaPixelId ? <MetaPixel pixelId={metaPixelId} /> : null}
      </body>
    </html>
  );
}

