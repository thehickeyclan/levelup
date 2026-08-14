import Link from 'next/link';

/** Compact homepage band for Guild Market — secondary to training, browsable without an account. */
export function MarketSection() {
  return (
    <section className="border-t border-accent/20 bg-black py-10 px-4">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-center md:text-left">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Guild Market</p>
          <h2 className="font-serif text-xl md:text-2xl text-white">
            Buy, sell, and trade wrestling shoes.
          </h2>
          <p className="text-sm text-muted-foreground">
            Snap photos, AI lists the shoe. Browse without an account.
          </p>
        </div>
        <Link
          href="/market"
          className="inline-flex items-center justify-center self-center md:self-auto rounded-full border border-accent/60 px-6 py-2.5 text-sm font-semibold text-accent hover:bg-accent hover:text-black transition-colors whitespace-nowrap"
        >
          Browse the Market
        </Link>
      </div>
    </section>
  );
}
