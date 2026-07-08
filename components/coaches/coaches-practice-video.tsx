'use client';

import Image from 'next/image';

const POSTER_SRC = '/coaches/practice/guild-coaching.png';

type Props = {
  /** Set when `public/coaches/guild-practice.mp4` exists — avoids 404 until the file is added. */
  videoSrc: string | null;
};

export function CoachesPracticeVideo({ videoSrc }: Props) {
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
          {videoSrc ? (
            <video
              className="aspect-video w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              poster={POSTER_SRC}
            >
              <source src={videoSrc} type="video/mp4" />
            </video>
          ) : (
            <div className="relative aspect-video w-full">
              <Image
                src={POSTER_SRC}
                alt="Guild coach working with athletes on the mat"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 1024px"
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
