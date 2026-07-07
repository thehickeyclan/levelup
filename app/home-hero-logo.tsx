'use client';

import { useState } from 'react';
import Image from 'next/image';

/**
 * Hero section logo with fallback when image is missing (e.g. public/logos/guild-g.png).
 */
export function HomeHeroLogo({
  src,
  alt = 'The Guild — gold G lettermark with wrestlers',
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex items-center justify-center w-full max-w-[320px] sm:max-w-[400px] lg:max-w-[480px] aspect-square rounded-full border-2 border-accent/40 bg-accent/5">
        <span className="font-serif font-bold text-accent text-7xl lg:text-8xl">G</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={480}
      height={480}
      className={
        className ??
        'object-contain w-full max-w-[320px] sm:max-w-[400px] lg:max-w-[480px] h-auto'
      }
      priority
      onError={() => setFailed(true)}
    />
  );
}
