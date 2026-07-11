'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Users, MessageCircle, Smartphone, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CoachTextGroupDialog } from '@/components/coach-text-group-dialog';
import { cn } from '@/lib/utils';

type SessionOption = {
  id: string;
  label: string;
  facility_name: string;
  roster_preview: string;
  current_participants: number;
  can_sms: boolean;
  session_type: string | null;
};

export function CoachSessionMessagePanel({ className }: { className?: string }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsTarget, setSmsTarget] = useState('broadcast:parents');

  const query = search.trim();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = query
      ? `/api/coach/messaging-sessions?q=${encodeURIComponent(query)}`
      : '/api/coach/messaging-sessions';
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSessions(d.sessions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId]
  );

  const openSms = (target: string) => {
    if (!selected) return;
    setSmsTarget(target);
    setSmsOpen(true);
  };

  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      <div className="p-4 border-b border-border bg-muted/30 space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          Message a session
        </h2>
        <p className="text-xs text-muted-foreground">
          Search small groups and partner sessions — in-app group chat or SMS to parents and athletes.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by date, facility, athlete…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="max-h-[220px] overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">
            {query ? 'No sessions match your search.' : 'No upcoming group sessions in the next 60 days.'}
          </p>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={cn(
                'w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors',
                selectedId === s.id && 'bg-accent/5'
              )}
            >
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.facility_name} · {s.current_participants} signed up
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.roster_preview}</p>
            </button>
          ))
        )}
      </div>

      {selected ? (
        <div className="p-4 border-t border-border space-y-2 bg-muted/20">
          <p className="text-xs font-medium text-foreground">Send to everyone on this session</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start gap-2 min-h-[44px]"
              onClick={() => router.push(`/messages/${selected.id}`)}
            >
              <MessageCircle className="h-4 w-4 shrink-0 text-accent" />
              In-app group message
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start gap-2 min-h-[44px]"
              disabled={!selected.can_sms}
              onClick={() => openSms('broadcast:parents')}
            >
              <Smartphone className="h-4 w-4 shrink-0" />
              SMS parents
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start gap-2 min-h-[44px]"
              disabled={!selected.can_sms}
              onClick={() => openSms('broadcast:athletes')}
            >
              <Smartphone className="h-4 w-4 shrink-0" />
              SMS athletes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start gap-2 min-h-[44px]"
              disabled={!selected.can_sms}
              onClick={() => openSms('broadcast:both')}
            >
              <Smartphone className="h-4 w-4 shrink-0" />
              SMS parents + athletes
            </Button>
          </div>
          {!selected.can_sms ? (
            <p className="text-[11px] text-muted-foreground">
              SMS unlocks when someone signs up. You can still use in-app group message.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              SMS sends from The Guild&apos;s number. In-app reaches parent accounts in the session thread.
            </p>
          )}
          <Link href="/athlete-dashboard" className="text-xs text-accent hover:underline inline-block">
            Open full schedule
          </Link>
        </div>
      ) : null}

      {selected ? (
        <CoachTextGroupDialog
          sessionId={selected.id}
          open={smsOpen}
          onOpenChange={setSmsOpen}
          sessionLabel={selected.label}
          initialTarget={smsTarget}
        />
      ) : null}
    </div>
  );
}
