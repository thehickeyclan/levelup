'use client';

import type { PriceComp } from '@/lib/market/ai/schemas';

function formatCompDate(date?: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 14) return `${diffDays}d ago`;
  if (diffDays < 60) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function CompRow({ comp }: { comp: PriceComp }) {
  const when = formatCompDate(comp.date);
  const meta = [comp.label, when].filter(Boolean).join(' · ');

  return (
    <li className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground truncate" title={meta}>
        {meta}
      </span>
      <span className="font-medium tabular-nums shrink-0">
        ${Math.round(comp.price_cents / 100)}
      </span>
    </li>
  );
}

function CompSection({
  title,
  comps,
  empty,
}: {
  title: string;
  comps: PriceComp[];
  empty: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {comps.length ? (
        <ul className="space-y-1">
          {comps.map((comp, i) => (
            <CompRow key={`${comp.source}-${comp.price_cents}-${comp.label}-${i}`} comp={comp} />
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

export function SimilarSalesGuidance({ comps }: { comps: PriceComp[] }) {
  const soldComps = comps.filter((c) => c.source === 'guild');
  const askingComps = comps.filter((c) => c.source === 'guild_asking');
  const catalogComps = comps.filter((c) => c.source === 'catalog');

  if (!soldComps.length && !askingComps.length && !catalogComps.length) return null;

  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-3 space-y-3">
      <p className="text-[11px] text-muted-foreground">Guild Market pricing guidance</p>
      <CompSection
        title="Sold on Guild"
        comps={soldComps}
        empty="No completed sales for this model yet — yours could set the first market value."
      />
      <CompSection
        title="Listed on Guild now"
        comps={askingComps}
        empty="No other sellers have this model listed right now."
      />
      <CompSection
        title="Documented resale (Instagram, handbook)"
        comps={catalogComps}
        empty="No documented resale comps for this model yet — admin IG sales feed this."
      />
    </div>
  );
}

export function priceGuidanceFooter(comps: PriceComp[]): string {
  const sold = comps.filter((c) => c.source === 'guild').length;
  const asking = comps.filter((c) => c.source === 'guild_asking').length;
  const catalog = comps.filter((c) => c.source === 'catalog').length;
  const ebay = comps.filter((c) => c.source === 'ebay').length;

  const bits: string[] = [];
  if (sold) bits.push(`${sold} Guild sale${sold !== 1 ? 's' : ''}`);
  if (asking) bits.push(`${asking} active listing${asking !== 1 ? 's' : ''}`);
  if (catalog) bits.push(`${catalog} documented resale comp${catalog !== 1 ? 's' : ''}`);
  if (ebay) bits.push('eBay listings');

  if (!bits.length) return 'Limited market data — treat as estimate.';
  return `Based on ${bits.join(' · ')}`;
}
