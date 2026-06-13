'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import { cn } from '@/lib/utils';

export type SessionPhoneLists = {
  commaParents: string;
  commaAthletes: string;
  commaBoth: string;
};

type PrefetchState =
  | { status: 'loading' }
  | { status: 'error'; message?: string }
  | { status: 'ready'; lists: SessionPhoneLists };

function lineCount(multiline: string): number {
  if (!multiline.trim()) return 0;
  return multiline.split(/\r?\n/).filter(Boolean).length;
}

type Props = {
  sessionId: string;
  className?: string;
  /** Stack vertically on narrow screens (default). */
  layout?: 'stack' | 'row';
  disabled?: boolean;
};

/** Coach/admin: copy parent, kid, or both cell lists — one 10-digit US number per line. */
export function SessionPhonesCopyButtons({
  sessionId,
  className,
  layout = 'stack',
  disabled = false,
}: Props) {
  const [loadingKind, setLoadingKind] = useState<'parents' | 'athletes' | 'both' | null>(null);
  const [copiedKind, setCopiedKind] = useState<'parents' | 'athletes' | 'both' | null>(null);
  const [prefetch, setPrefetch] = useState<PrefetchState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setPrefetch({ status: 'loading' });
    void (async () => {
      try {
        const r = await fetch(`/api/sessions/${sessionId}/sms-phones`);
        const data = (await r.json()) as SessionPhoneLists & { error?: string };
        if (cancelled) return;
        if (!r.ok) {
          setPrefetch({ status: 'error', message: data.error });
          return;
        }
        setPrefetch({
          status: 'ready',
          lists: {
            commaParents: (data.commaParents ?? '').trim(),
            commaAthletes: (data.commaAthletes ?? '').trim(),
            commaBoth: (data.commaBoth ?? '').trim(),
          },
        });
      } catch {
        if (!cancelled) setPrefetch({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const lists = prefetch.status === 'ready' ? prefetch.lists : null;
  const nParents = lists ? lineCount(lists.commaParents) : 0;
  const nKids = lists ? lineCount(lists.commaAthletes) : 0;
  const nBoth = lists ? lineCount(lists.commaBoth) : 0;

  const onCopy = async (kind: 'parents' | 'athletes' | 'both') => {
    setLoadingKind(kind);
    try {
      let activeLists = lists;

      if (prefetch.status === 'loading' || prefetch.status === 'error' || !activeLists) {
        const r = await fetch(`/api/sessions/${sessionId}/sms-phones`);
        const data = (await r.json()) as SessionPhoneLists & { error?: string };
        if (!r.ok) {
          window.alert(data.error || 'Could not load numbers.');
          return;
        }
        activeLists = {
          commaParents: (data.commaParents ?? '').trim(),
          commaAthletes: (data.commaAthletes ?? '').trim(),
          commaBoth: (data.commaBoth ?? '').trim(),
        };
        setPrefetch({ status: 'ready', lists: activeLists });
      }

      const text =
        kind === 'parents'
          ? activeLists.commaParents
          : kind === 'athletes'
            ? activeLists.commaAthletes
            : activeLists.commaBoth;

      if (!text) {
        const label = kind === 'parents' ? 'parent' : kind === 'athletes' ? 'kid / athlete' : '';
        window.alert(`No ${label || 'phone'} numbers on file for this session yet.`);
        return;
      }

      const ok = await copyTextToClipboard(text);
      if (!ok) {
        window.alert(
          'Could not copy automatically. Paste into Messages To — one number per line (not commas).'
        );
        return;
      }
      setCopiedKind(kind);
      window.setTimeout(() => setCopiedKind(null), 2000);
    } finally {
      setLoadingKind(null);
    }
  };

  const btnClass = 'min-h-[40px] touch-manipulation justify-start';
  const wrapClass =
    layout === 'row'
      ? 'flex flex-wrap gap-2'
      : 'flex flex-col gap-2 sm:flex-row sm:flex-wrap';

  return (
    <div className={cn(wrapClass, className)}>
      <Button
        type="button"
        variant="default"
        size="sm"
        className={cn(btnClass, 'bg-accent hover:bg-accent-hover text-black font-medium')}
        disabled={disabled || loadingKind !== null || (prefetch.status === 'ready' && nParents === 0)}
        onClick={() => void onCopy('parents')}
        title="Copy all parent cells — paste into Messages To, one line per number"
      >
        {copiedKind === 'parents' ? (
          <Check className="h-4 w-4 mr-1 shrink-0" />
        ) : (
          <Copy className="h-4 w-4 mr-1 shrink-0" />
        )}
        {copiedKind === 'parents'
          ? 'Copied parents'
          : loadingKind === 'parents'
            ? 'Working…'
            : `Copy parents${nParents ? ` (${nParents})` : ''}`}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={btnClass}
        disabled={disabled || loadingKind !== null || (prefetch.status === 'ready' && nKids === 0)}
        onClick={() => void onCopy('athletes')}
        title="Copy all wrestler / athlete cells on this session"
      >
        {copiedKind === 'athletes' ? (
          <Check className="h-4 w-4 mr-1 shrink-0 text-emerald-500" />
        ) : (
          <Copy className="h-4 w-4 mr-1 shrink-0" />
        )}
        {copiedKind === 'athletes'
          ? 'Copied kids'
          : loadingKind === 'athletes'
            ? 'Working…'
            : `Copy kids${nKids ? ` (${nKids})` : ''}`}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={btnClass}
        disabled={disabled || loadingKind !== null || (prefetch.status === 'ready' && nBoth === 0)}
        onClick={() => void onCopy('both')}
        title="Copy every unique parent + kid cell for this session"
      >
        {copiedKind === 'both' ? (
          <Check className="h-4 w-4 mr-1 shrink-0 text-emerald-500" />
        ) : (
          <Copy className="h-4 w-4 mr-1 shrink-0" />
        )}
        {copiedKind === 'both'
          ? 'Copied both'
          : loadingKind === 'both'
            ? 'Working…'
            : `Copy both${nBoth ? ` (${nBoth})` : ''}`}
      </Button>
    </div>
  );
}

/** @deprecated Use SessionPhonesCopyButtons — kept for imports that expect a single button. */
export function CopySessionPhonesButton(props: Omit<Props, 'layout'>) {
  return <SessionPhonesCopyButtons {...props} layout="row" />;
}
