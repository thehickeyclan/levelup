'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ShoeModelAbout } from '@/lib/market/shoe-model-content';
import { cn } from '@/lib/utils';

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-4 gap-y-1 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function CollapsibleSection({
  title,
  titleClassName,
  mobileToggleLabel,
  children,
  attribution,
}: {
  title: string;
  titleClassName?: string;
  mobileToggleLabel: string;
  children: React.ReactNode;
  attribution?: boolean;
}) {
  const [expandedMobile, setExpandedMobile] = useState(false);

  return (
    <section className="border-t border-accent/20 pt-6 space-y-3">
      <h3
        className={cn(
          'text-[10px] font-medium uppercase tracking-[0.15em] text-accent',
          titleClassName
        )}
      >
        {title}
      </h3>
      <div className={cn('space-y-3', !expandedMobile && 'hidden md:block')}>{children}</div>
      {attribution ? (
        <p
          className={cn(
            'inline-flex items-center gap-1.5 text-[10px] text-muted-foreground',
            !expandedMobile && 'hidden md:inline-flex'
          )}
        >
          <Sparkles className="h-3 w-3 text-accent" />
          AI-generated
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setExpandedMobile((v) => !v)}
        className="md:hidden min-h-[44px] text-sm font-medium text-accent hover:text-accent/80 touch-manipulation"
      >
        {expandedMobile ? 'Show less' : mobileToggleLabel}
      </button>
    </section>
  );
}

export function ListingShoeAboutSections({ about }: { about: ShoeModelAbout }) {
  const specRows = [
    about.release_year ? { label: 'Released', value: String(about.release_year) } : null,
    about.shoe_type ? { label: 'Type', value: about.shoe_type } : null,
    about.upper_material ? { label: 'Upper', value: about.upper_material } : null,
    about.sole_type ? { label: 'Sole', value: about.sole_type } : null,
    about.closure_type ? { label: 'Closure', value: about.closure_type } : null,
    about.fit_notes ? { label: 'Fit', value: about.fit_notes } : null,
    about.notable_features ? { label: 'Notable', value: about.notable_features } : null,
    { label: 'Brand', value: about.brand },
  ].filter(Boolean) as { label: string; value: string }[];

  const hasSpecs = specRows.length > 1;
  const hasHistory = Boolean(about.history_text?.trim());
  const storyTitle = `The ${about.model} story`;

  if (!hasSpecs && !hasHistory) return null;

  return (
    <div className="space-y-0">
      {hasSpecs ? (
        <CollapsibleSection title="About this shoe" mobileToggleLabel="Show specs" attribution>
          <div className="rounded-xl border border-border bg-card px-4 py-2">
            {specRows.map((row) => (
              <SpecRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </CollapsibleSection>
      ) : null}

      {hasHistory ? (
        <CollapsibleSection
          title={storyTitle}
          titleClassName="uppercase"
          mobileToggleLabel="Read the story"
          attribution
        >
          <p className="text-sm text-foreground/85 leading-relaxed italic">{about.history_text}</p>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
