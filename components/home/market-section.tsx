import Link from 'next/link';

/** Homepage band introducing Guild Market — browsable without an account. */
export function MarketSection() {
  return (
    <section className="border-t border-accent/20 bg-black py-16 px-4">
      <div className="max-w-4xl mx-auto text-center space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Guild Market</p>
        <h2 className="font-serif text-3xl md:text-4xl text-white">
          Buy, sell, and trade wrestling shoes.
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          The community marketplace for wrestling gear. Snap photos and AI identifies the shoe, reads
          condition, and suggests a fair price. Offers, order tracking, and seller ratings — like
          eBay, built for wrestlers. Browse without an account.
        </p>
        <div className="pt-2">
          <Link
            href="/market"
            className="inline-flex items-center justify-center rounded-full bg-accent px-8 py-3 font-semibold text-black hover:bg-accent/90 transition-colors"
          >
            Browse the Market
          </Link>
        </div>
      </div>
    </section>
  );
}
