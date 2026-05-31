'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

type Props = {
  sessionId: string;
  className?: string;
};

type PrefetchState =
  | { status: 'loading' }
  | { status: 'error'; message?: string }
  | { status: 'ready'; text: string };

/** Coach/admin: copy 10-digit US cells, one per line (better for Mac Messages than comma-separated). */
export function CopySessionPhonesButton({ sessionId, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [prefetch, setPrefetch] = useState<PrefetchState>({ status: 'loading' });

  // Prefetch so the click handler can copy without await(fetch) first — WebKit often blocks clipboard after async network.
  useEffect(() => {
    let cancelled = false;
    setPrefetch({ status: 'loading' });
    void (async () => {
      try {
        const r = await fetch(`/api/sessions/${sessionId}/sms-phones`);
        const data = (await r.json()) as { commaParents?: string; error?: string };
        if (cancelled) return;
        if (!r.ok) {
          setPrefetch({ status: 'error', message: data.error });
          return;
        }
        setPrefetch({ status: 'ready', text: (data.commaParents ?? '').trim() });
      } catch {
        if (!cancelled) setPrefetch({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const onClick = async () => {
    setLoading(true);
    try {
      let text = prefetch.status === 'ready' ? prefetch.text : '';

      if (prefetch.status === 'loading' || prefetch.status === 'error') {
        const r = await fetch(`/api/sessions/${sessionId}/sms-phones`);
        const data = (await r.json()) as { commaParents?: string; error?: string };
        if (!r.ok) {
          window.alert(data.error || 'Could not load numbers.');
          return;
        }
        text = (data.commaParents ?? '').trim();
        setPrefetch({ status: 'ready', text });
      }

      if (!text) {
        window.alert('No phone numbers on file for this session yet.');
        return;
      }

      const ok = await copyTextToClipboard(text);
      if (!ok) {
        window.alert(
          'Could not copy automatically. Select the numbers in Text the group → Copy Cell #s, or try Chrome/Safari on desktop.'
        );
        return;
      }
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={onClick}
      disabled={loading}
      title="Copies one number per line — paste into Messages To (Mac: use line breaks; commas often don’t split recipients)"
    >
      {done ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
      {done ? 'Copied' : loading ? 'Working…' : 'Copy Cell #s'}
    </Button>
  );
}
