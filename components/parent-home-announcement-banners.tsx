'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SchoolLogo } from '@/components/school-logo';
import { hasSchoolLogo } from '@/lib/school-logos';

export type ParentHomeAnnouncement = {
  id: string;
  announcement_type: 'new_coach' | 'new_location';
  reference_id: string;
  headline: string;
  cta_label: string;
  cta_path: string;
  /** Coach or facility school — used for college logo when available. */
  school?: string | null;
};

export function ParentHomeAnnouncementBanners({ items }: { items: ParentHomeAnnouncement[] }) {
  const [visible, setVisible] = useState<ParentHomeAnnouncement[]>(items);

  if (visible.length === 0) return null;

  const dismiss = async (a: ParentHomeAnnouncement) => {
    try {
      const res = await fetch('/api/parent/announcements/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          announcementType: a.announcement_type,
          referenceId: a.reference_id,
        }),
      });
      if (!res.ok) return;
    } catch {
      return;
    }
    setVisible((prev) => prev.filter((x) => x.id !== a.id));
  };

  return (
    <div className="px-4 pt-4 space-y-2" aria-label="Announcements">
      {visible.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-3 rounded-xl border-2 border-accent/60 bg-zinc-900/80 px-3 py-3 pr-2"
        >
          <span className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-800/90 border border-accent/25">
            {a.school?.trim() && hasSchoolLogo(a.school.trim()) ? (
              <SchoolLogo school={a.school.trim()} size="sm" className="max-w-[28px] max-h-[28px]" />
            ) : (
              <span className="text-lg leading-none" aria-hidden>
                🆕
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground leading-snug">{a.headline}</p>
            <Button
              variant="link"
              className="h-auto min-h-[44px] p-0 mt-1 text-accent font-semibold"
              asChild
            >
              <Link href={a.cta_path}>{a.cta_label}</Link>
            </Button>
          </div>
          <button
            type="button"
            onClick={() => dismiss(a)}
            className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-foreground touch-manipulation"
            aria-label="Dismiss announcement"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ))}
    </div>
  );
}
