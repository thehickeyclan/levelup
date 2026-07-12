'use client';

import { useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import type { ShoeModelAbout } from '@/lib/market/shoe-model-content';
import { cn } from '@/lib/utils';

function modelAttributionLabel(about: ShoeModelAbout, kind: 'specs' | 'history'): string {
  if (about.verified) {
    const notes = about.source_notes?.trim();
    if (notes) return `Verified — ${notes}`;
    return 'Verified catalog';
  }
  if (about.ai_generated) {
    return kind === 'specs' ? 'AI-generated model specs' : 'AI-generated model history';
  }
  return '';
}

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
  subtitle,
  titleClassName,
  mobileToggleLabel,
  children,
  attribution,
  attributionLabel = 'AI-generated',
  attributionIcon = 'sparkles',
}: {
  title: string;
  subtitle?: string;
  titleClassName?: string;
  mobileToggleLabel: string;
  children: React.ReactNode;
  attribution?: boolean;
  attributionLabel?: string;
  attributionIcon?: 'sparkles' | 'verified';
}) {
  const [expandedMobile, setExpandedMobile] = useState(false);

  return (
    <section className="border-t border-border/60 pt-6 space-y-3">
      <div>
        <h3
          className={cn(
            'text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground',
            titleClassName
          )}
        >
          {title}
        </h3>
        {subtitle ? <p className="text-xs text-muted-foreground mt-1">{subtitle}</p> : null}
      </div>
      <div className={cn('space-y-3', !expandedMobile && 'hidden md:block')}>{children}</div>
      {attribution && attributionLabel ? (
        <p
          className={cn(
            'inline-flex items-center gap-1.5 text-[10px] text-muted-foreground',
            !expandedMobile && 'hidden md:inline-flex'
          )}
        >
          {attributionIcon === 'verified' ? (
            <CheckCircle2 className="h-3 w-3 text-accent" />
          ) : (
            <Sparkles className="h-3 w-3 text-accent" />
          )}
          {attributionLabel}
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
  const modelLabel = `${about.brand} ${about.model}`.trim();
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
  const modelScope = `Shared on every ${modelLabel} listing — not specific to this pair.`;
  const specsAttribution = modelAttributionLabel(about, 'specs');
  const historyAttribution = modelAttributionLabel(about, 'history');

  if (!hasSpecs && !hasHistory) return null;

  return (
    <div className="space-y-0">
      <div className="border-t border-accent/20 pt-6 pb-2">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.15em] text-accent">
          The shoe model
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          General specs and history for {modelLabel}, not this exact pair.
        </p>
      </div>

      {hasSpecs ? (
        <CollapsibleSection
          title={`About the ${about.model}`}
          subtitle={modelScope}
          mobileToggleLabel="Show model specs"
          attribution={Boolean(specsAttribution)}
          attributionLabel={specsAttribution}
          attributionIcon={about.verified ? 'verified' : 'sparkles'}
        >
          <div className="rounded-xl border border-border bg-card px-4 py-2">
            {specRows.map((row) => (
              <SpecRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </CollapsibleSection>
      ) : null}

      {hasHistory ? (
        <CollapsibleSection
          title={`History of the ${about.model}`}
          subtitle={modelScope}
          mobileToggleLabel="Read model history"
          attribution={Boolean(historyAttribution)}
          attributionLabel={historyAttribution}
          attributionIcon={about.verified ? 'verified' : 'sparkles'}
        >
          <p className="text-sm text-foreground/90 leading-relaxed">{about.history_text}</p>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
