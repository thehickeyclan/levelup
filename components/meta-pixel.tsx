'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function isLikelyMetaPixelId(id: string): boolean {
  return /^\d{8,}$/.test(id.trim());
}

/**
 * Meta (Facebook) Pixel — PageView on first paint (bootstrap) and on SPA navigations.
 * Set `NEXT_PUBLIC_META_PIXEL_ID` in Vercel / .env.local to your Dataset / Pixel ID.
 */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  const id = pixelId.trim();
  const pathname = usePathname();
  const prevPathRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isLikelyMetaPixelId(id) || typeof window === 'undefined' || !window.fbq) return;

    if (prevPathRef.current === undefined) {
      prevPathRef.current = pathname;
      return;
    }
    if (prevPathRef.current === pathname) return;

    prevPathRef.current = pathname;
    window.fbq('track', 'PageView');
  }, [id, pathname]);

  if (!isLikelyMetaPixelId(id)) {
    if (process.env.NODE_ENV === 'development' && id) {
      console.warn('[MetaPixel] NEXT_PUBLIC_META_PIXEL_ID must be a numeric pixel ID.');
    }
    return null;
  }

  return (
    <>
      <Script
        id={`fb-pixel-bootstrap-${id}`}
        strategy="afterInteractive"
      >
        {`
!(function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
})(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${id}');
fbq('track','PageView');
        `.trim()}
      </Script>
      <noscript>
        <img
          height={1}
          width={1}
          className="hidden"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(id)}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
