'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Users, Plus, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WORKSPACES_NAV_ENABLED } from '@/lib/workspaces-feature';

type Group = { id: string; name: string; athleteId: string; createdAt: string };
type DmThread = {
  parentId: string;
  athleteId: string;
  lastBody: string;
  lastAt: string;
  otherName: string;
  unread?: boolean;
};
type WorkspaceItem = {
  id: string;
  youth_wrestlers?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[];
  athletes?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[];
};

function workspaceLabel(ws: WorkspaceItem): string {
  const coach = Array.isArray(ws.athletes) ? ws.athletes[0] : ws.athletes;
  const kid = Array.isArray(ws.youth_wrestlers) ? ws.youth_wrestlers[0] : ws.youth_wrestlers;
  const coachName = coach ? `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim() : 'Coach';
  const kidName = kid ? `${kid.first_name ?? ''} ${kid.last_name ?? ''}`.trim() : 'Wrestler';
  return kidName ? `${coachName} · ${kidName}` : coachName;
}

export function InboxSidebar({ role, className }: { role: 'parent' | 'coach' | 'youth_wrestler'; className?: string }) {
  const pathname = usePathname();
  const [groups, setGroups] = useState<Group[]>([]);
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const workspacesPromise = (role === 'parent' || role === 'coach' || role === 'youth_wrestler')
      ? fetch('/api/workspaces').then((r) => r.json()).then((d) => d.workspaces ?? [])
      : Promise.resolve([]);
    Promise.all([
      fetch('/api/messaging-groups').then((r) => r.json()),
      fetch('/api/coach-inquiries/threads').then((r) => r.json()),
      workspacesPromise,
    ]).then(([groupsRes, threadsRes, wsList]) => {
      if (groupsRes.groups) setGroups(groupsRes.groups);
      if (threadsRes.threads) setThreads(threadsRes.threads);
      if (Array.isArray(wsList)) setWorkspaces(wsList);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [role]);

  const isGroupPath = pathname?.startsWith('/inbox/groups/');
  const groupId = pathname?.match(/^\/inbox\/groups\/([^/]+)/)?.[1];
  const workspaceId = pathname?.match(/^\/workspaces\/([^/]+)/)?.[1];

  return (
    <aside className={cn('w-60 shrink-0 border-r border-border bg-card flex flex-col h-full', className)}>
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Community</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Direct messages first – plus opens "New message" (coach list for parent; groups for athlete) */}
        <section>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Direct messages</span>
            {(role === 'parent' || role === 'coach') && (
              <Link href="/inbox/new" title="New message" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md hover:bg-muted/50">
                <Button variant="ghost" size="icon" className="h-8 w-8 pointer-events-none">
                  <Plus className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>
          {loading ? (
            <p className="text-xs text-muted-foreground px-2 py-2">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-2">No conversations</p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => {
                const href = `/inbox/thread/${t.parentId}/${t.athleteId}`;
                const active = pathname === href || (pathname?.startsWith(href + '/'));
                return (
                  <li key={`${t.parentId}-${t.athleteId}`}>
                    <Link
                      href={href}
                      className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md text-sm transition-colors ${
                        active ? 'bg-accent/20 text-accent border-l-2 border-accent' : 'hover:bg-muted/50'
                      } ${t.unread ? 'font-medium' : ''}`}
                    >
                      <MessageCircle className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1">{t.otherName}</span>
                      {t.unread && (
                        <span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-hidden />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {(role === 'parent' || role === 'coach' || role === 'youth_wrestler') && WORKSPACES_NAV_ENABLED && (
          <section>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 py-1 block">Hubs</span>
            {loading ? (
              <p className="text-xs text-muted-foreground px-2 py-2">Loading…</p>
            ) : workspaces.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-2">No hubs yet</p>
            ) : (
              <ul className="space-y-0.5">
                {workspaces.map((ws) => (
                  <li key={ws.id}>
                    <Link
                      href={`/workspaces/${ws.id}`}
                      className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md text-sm transition-colors ${
                        workspaceId === ws.id
                          ? 'bg-accent/20 text-accent border-l-2 border-accent'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4 shrink-0" />
                      <span className="truncate">{workspaceLabel(ws)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {(role === 'coach' || role === 'parent') && (
          <section>
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Groups</span>
              <Link href="/inbox/groups/new" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md hover:bg-muted/50" title="New group">
                <Button variant="ghost" size="icon" className="h-8 w-8 pointer-events-none">
                  <Plus className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            {loading ? (
              <p className="text-xs text-muted-foreground px-2 py-2">Loading…</p>
            ) : groups.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-2">No groups yet</p>
            ) : (
              <ul className="space-y-0.5">
                {groups.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/inbox/groups/${g.id}`}
                      className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md text-sm transition-colors ${
                        groupId === g.id
                          ? 'bg-accent/20 text-accent border-l-2 border-accent'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <Users className="h-4 w-4 shrink-0" />
                      <span className="truncate">{g.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
