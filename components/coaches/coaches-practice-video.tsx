'use client';

import { useState } from 'react';
import Image from 'next/image';

/** Drop `public/coaches/guild-practice.mp4` to enable autoplay loop. */
const VIDEO_SRC = '/coaches/guild-practice.mp4';
const POSTER_SRC = '/coaches/practice/guild-coaching.png';

export function CoachesPracticeVideo() {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <section className="border-b border-accent/20 bg-black px-6 py-10 md:py-12">
      <div className="mx-auto max-w-5xl">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-accent">
          Real Guild sessions
        </p>
        <h2 className="mt-2 text-center font-serif text-xl font-black uppercase tracking-wide text-white md:text-2xl">
          Parents book. You coach.
        </h2>
        <div className="relative mt-8 overflow-hidden rounded-xl border border-accent/25 bg-zinc-950">
          {!videoFailed ? (
            <video
              className="aspect-video w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              poster={POSTER_SRC}
              onError={() => setVideoFailed(true)}
            >
              <source src={VIDEO_SRC} type="video/mp4" />
            </video>
          ) : (
            <div className="relative aspect-video w-full">
              <Image
                src={POSTER_SRC}
                alt="Guild coach working with athletes on the mat"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 1024px"
                priority={false}
              />
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-sm text-white/55">
          Actual Guild practices — private lessons, partner sessions, and small groups.
        </p>
      </div>
    </section>
  );
}
