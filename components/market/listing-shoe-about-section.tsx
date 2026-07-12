'use client';

import { useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import type { ShoeModelAbout } from '@/lib/market/shoe-model-content';
import { cn } from '@/lib/utils';

function modelAttributionShort(about: ShoeModelAbout): string | null {
  if (about.verified) {
    if (about.source_notes?.toLowerCase().includes('phipps')) {
      return 'Verified from The Wrestling Shoe Handbook';
    }
    return 'Verified catalog';
  }
  if (about.ai_generated) return 'AI-generated model info';
  return null;
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-4 gap-y-1 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function CollapsibleBlock({
  title,
  mobileToggleLabel,
  children,
}: {
  title: string;
  mobileToggleLabel: string;
  children: React.ReactNode;
}) {
  const [expandedMobile, setExpandedMobile] = useState(false);

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
        {title}
      </h3>
      <div className={cn('space-y-3', !expandedMobile && 'hidden md:block')}>{children}</div>
      <button
        type="button"
        onClick={() => setExpandedMobile((v) => !v)}
        className="md:hidden min-h-[44px] text-sm font-medium text-accent hover:text-accent/80 touch-manipulation"
      >
        {expandedMobile ? 'Show less' : mobileToggleLabel}
      </button>
    </div>
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
  const attribution = modelAttributionShort(about);

  if (!hasSpecs && !hasHistory) return null;

  return (
    <div className="border-t border-accent/20 pt-6 space-y-5">
      <div>
        <h2 className="text-[10px] font-medium uppercase tracking-[0.15em] text-accent">
          The shoe model
        </h2>
        {attribution ? (
          <p className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1">
            {about.verified ? (
              <CheckCircle2 className="h-3 w-3 text-accent shrink-0" />
            ) : (
              <Sparkles className="h-3 w-3 text-accent shrink-0" />
            )}
            {attribution}
          </p>
        ) : null}
      </div>

      {hasSpecs ? (
        <CollapsibleBlock title={`About the ${about.model}`} mobileToggleLabel="Show model specs">
          <div className="rounded-xl border border-border bg-card px-4 py-2">
            {specRows.map((row) => (
              <SpecRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </CollapsibleBlock>
      ) : null}

      {hasHistory ? (
        <CollapsibleBlock title={`History of the ${about.model}`} mobileToggleLabel="Read model history">
          <p className="text-sm text-foreground/90 leading-relaxed">{about.history_text}</p>
        </CollapsibleBlock>
      ) : null}
    </div>
  );
}
