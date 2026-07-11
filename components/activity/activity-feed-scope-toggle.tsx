'use client';

import Link from 'next/link';
import type { ActivityFeedScope } from '@/lib/activity-feed/types';
import type { ActivityScopeOption } from '@/lib/activity-feed/activity-scope-config';
import { cn } from '@/lib/utils';

type Props = {
  options: ActivityScopeOption[];
  activeScope: ActivityFeedScope;
};

function scopeHref(scope: ActivityFeedScope): string {
  return scope === 'community' ? '/activity' : `/activity?scope=${scope}`;
}

export function ActivityFeedScopeToggle({ options, activeScope }: Props) {
  if (options.length < 2) return null;

  return (
    <div
      className="flex rounded-lg border border-border bg-muted/40 p-1"
      role="tablist"
      aria-label="Activity feed scope"
    >
      {options.map((option) => {
        const active = option.scope === activeScope;
        return (
          <Link
            key={option.scope}
            href={scopeHref(option.scope)}
            role="tab"
            aria-selected={active}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors touch-manipulation',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
