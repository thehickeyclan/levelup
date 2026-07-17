'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Users, Loader2, Search } from 'lucide-react';
import { CoachSessionMessagePanel } from '@/components/guild/coach-session-message-panel';
import { SchoolLogo } from '@/components/school-logo';

type Coach = { id: string; firstName: string; lastName: string; school: string; photoUrl?: string };
type Follow = { coachId: string; coach: Coach | null };
type MessageContact = {
  id: string;
  kind: 'parent' | 'youth';
  name: string;
  email?: string;
  kids?: string[];
};

function CoachRow({
  coach,
  onSelect,
  badge,
}: {
  coach: Coach;
  onSelect: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 text-left transition-colors"
    >
      {coach.photoUrl ? (
        <img src={coach.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
          <MessageCircle className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate flex items-center gap-2">
          {coach.firstName} {coach.lastName}
          {badge && (
            <span className="text-xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{badge}</span>
          )}
        </p>
        {coach.school && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <SchoolLogo school={coach.school} size="sm" />
            {coach.school}
          </p>
        )}
      </div>
    </button>
  );
}

export function NewMessageClient({
  currentUserId,
  role,
}: {
  currentUserId: string;
  role: 'parent' | 'coach' | 'admin';
}) {
  const router = useRouter();
  const [follows, setFollows] = useState<Follow[]>([]);
  const [allCoaches, setAllCoaches] = useState<Coach[]>([]);
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [coachSearch, setCoachSearch] = useState('');
  const isParentView = role === 'parent' || role === 'admin';

  useEffect(() => {
    if (!isParentView) {
      // Coach: only parents/kids who have ever been on this coach's sessions
      fetch('/api/inbox/parents-for-athlete')
        .then((r) => r.json())
        .then((res) => {
          if (Array.isArray(res.contacts)) setContacts(res.contacts);
          else if (Array.isArray(res.parents)) {
            setContacts(
              res.parents.map(
                (p: { id: string; name: string; email?: string; kids?: string[] }) => ({
                  id: p.id,
                  kind: 'parent' as const,
                  name: p.name,
                  email: p.email,
                  kids: p.kids,
                })
              )
            );
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
    Promise.all([
      fetch('/api/coach-follows').then((r) => r.json()),
      fetch('/api/inbox/coaches').then((r) => r.json()),
    ])
      .then(([followsRes, coachesRes]) => {
        if (followsRes.follows) setFollows(followsRes.follows);
        if (coachesRes.coaches) setAllCoaches(coachesRes.coaches);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isParentView]);

  const handleCoachClick = async (coachId: string) => {
    try {
      const res = await fetch('/api/guild/messages/coach-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachUserId: coachId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start conversation');
      router.push(`/messages?thread=${data.threadId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not start conversation');
    }
  };

  const handleParentClick = async (parentId: string) => {
    try {
      const res = await fetch('/api/guild/messages/coach-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start conversation');
      router.push(`/messages?thread=${data.threadId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not start conversation');
    }
  };

  if (!isParentView) {
    const q = contactSearch.trim().toLowerCase();
    const filtered = q
      ? contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.kids ?? []).some((k) => k.toLowerCase().includes(q))
        )
      : contacts;
    const parents = filtered.filter((c) => c.kind === 'parent');
    const youth = filtered.filter((c) => c.kind === 'youth');

    return (
      <div className="space-y-6 max-w-lg">
        <CoachSessionMessagePanel />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Message a parent or athlete
            </h2>
            <p className="text-sm text-muted-foreground">
              Only families who have registered for your sessions (past or upcoming) — not other
              coaches.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by parent, kid, or email…"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No parents or athletes to message yet. Once someone books or joins your session,
                they&apos;ll appear here.
              </p>
            ) : (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                {parents.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Parents
                    </p>
                    <ul className="space-y-2">
                      {parents.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => handleParentClick(p.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 text-left transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <MessageCircle className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{p.name}</p>
                              {p.kids?.length ? (
                                <p className="text-xs text-muted-foreground truncate">
                                  Kids: {p.kids.join(', ')}
                                </p>
                              ) : null}
                              {p.email ? (
                                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {youth.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Athletes with accounts
                    </p>
                    <ul className="space-y-2">
                      {youth.map((y) => (
                        <li key={y.id}>
                          <button
                            type="button"
                            onClick={() => handleParentClick(y.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 text-left transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <MessageCircle className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{y.name}</p>
                              <p className="text-xs text-muted-foreground">Athlete</p>
                              <p className="text-xs text-muted-foreground">
                                Linked guardians can see this conversation.
                              </p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground text-sm">
              Legacy groups are being replaced by session threads and direct messages above.
            </p>
            <Link href="/inbox/groups/new">
              <Button className="gap-2">
                <Users className="h-4 w-4" />
                Create a group
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const followedIds = new Set(follows.filter((f) => f.coach).map((f) => f.coach!.id));
  const followedCoaches = allCoaches.filter((c) => followedIds.has(c.id));
  const otherCoaches = allCoaches.filter((c) => !followedIds.has(c.id));
  const searchLower = coachSearch.trim().toLowerCase();
  const filterCoaches = (list: Coach[]) =>
    searchLower
      ? list.filter(
          (c) =>
            `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchLower) ||
            (c.school && c.school.toLowerCase().includes(searchLower))
        )
      : list;
  const filteredFollowed = filterCoaches(followedCoaches);
  const filteredOther = filterCoaches(otherCoaches);

  return (
    <div className="space-y-6 max-w-lg h-full flex flex-col min-h-0">
      <Card className="flex flex-col min-h-0 flex-1">
        <CardContent className="pt-6 flex flex-col min-h-0 flex-1 flex">
          <h2 className="font-semibold mb-3 flex items-center gap-2 shrink-0">
            <MessageCircle className="h-4 w-4" />
            Message a coach or athlete
          </h2>
          <p className="text-sm text-muted-foreground mb-4 shrink-0">
            Start or continue a conversation with any coach. Use the search or scroll the list below.
          </p>
          <div className="relative mb-4 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or school..."
              value={coachSearch}
              onChange={(e) => setCoachSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="min-h-[200px] max-h-[50vh] overflow-y-auto border rounded-lg bg-muted/20 p-2 space-y-2">
            {filteredFollowed.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide sticky top-0 bg-background/95 py-1">Coaches you follow</p>
                <ul className="space-y-2 mb-4">
                  {filteredFollowed.map((c) => (
                    <li key={c.id}>
                      <CoachRow coach={c} onSelect={() => handleCoachClick(c.id)} badge="Following" />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(filteredOther.length > 0 || (searchLower && filteredFollowed.length === 0)) && (
              <>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide sticky top-0 bg-background/95 py-1">All coaches / athletes</p>
                <ul className="space-y-2">
                  {filteredOther.map((c) => (
                    <li key={c.id}>
                      <CoachRow coach={c} onSelect={() => handleCoachClick(c.id)} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!searchLower && filteredFollowed.length === 0 && filteredOther.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No coaches found. Browse coaches to book sessions.</p>
            )}
          </div>
          <div className="mt-4 pt-4 border-t shrink-0">
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/browse">Browse coaches to book</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        To share a session link with another wrestler or parent, use the &quot;Share link&quot; button on that booking, or paste the link in a group or message.
      </p>
    </div>
  );
}
