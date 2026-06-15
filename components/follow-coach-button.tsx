'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';
import { Heart } from 'lucide-react';

const FOLLOW_TOAST_KEY = 'guild_follow_sms_toast_shown';

type Props = { coachId: string; className?: string };

export function FollowCoachButton({ coachId, className }: Props) {
  const { user, userRole, loading: authLoading } = useAuth();
  const [following, setFollowing] = useState(false);
  const [checkLoading, setCheckLoading] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canFollow = userRole === 'parent' || userRole === 'admin';
  const hideButton = userRole === 'coach' || !user;

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!user || !canFollow) {
      setCheckLoading(false);
      return;
    }
    let cancelled = false;
    setCheckLoading(true);
    fetch(`/api/coach-follows/check?coachId=${encodeURIComponent(coachId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d.following === 'boolean') setFollowing(d.following);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, canFollow, coachId]);

  const onToggle = async () => {
    if (toggleLoading || !user) return;
    setToggleLoading(true);
    try {
      if (following) {
        const r = await fetch(`/api/coach-follows?coachId=${encodeURIComponent(coachId)}`, {
          method: 'DELETE',
        });
        if (r.ok) setFollowing(false);
      } else {
        const r = await fetch('/api/coach-follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coachId }),
        });
        if (r.ok) {
          setFollowing(true);
          const data = (await r.json()) as { coachName?: string };
          const name = data.coachName?.trim() || 'this coach';
          if (typeof window !== 'undefined' && !window.localStorage.getItem(FOLLOW_TOAST_KEY)) {
            window.localStorage.setItem(FOLLOW_TOAST_KEY, '1');
            setToast(`You'll get a text when ${name} posts a new session.`);
          }
        }
      }
    } finally {
      setToggleLoading(false);
    }
  };

  if (hideButton) return null;

  if (authLoading || !canFollow) {
    return (
      <Button variant="outline" size="sm" className={className} disabled>
        <Heart className="h-4 w-4 mr-1.5" />
        Follow
      </Button>
    );
  }

  if (checkLoading) {
    return (
      <Button variant="outline" size="sm" className={className} disabled>
        <Heart className="h-4 w-4 mr-1.5" />
        Follow
      </Button>
    );
  }

  return (
    <div className="relative inline-flex flex-col items-start">
      {toast && (
        <div
          role="status"
          className="absolute bottom-full left-0 mb-2 z-20 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs text-zinc-200 shadow-lg"
        >
          <p>{toast}</p>
          <Link
            href="/notifications"
            className="mt-2 inline-flex min-h-[44px] items-center text-accent font-medium underline"
          >
            Manage alerts in Notifications
          </Link>
        </div>
      )}
      <Button
      variant={following ? 'default' : 'outline'}
      size="sm"
      className={className}
      onClick={onToggle}
      disabled={toggleLoading}
    >
      <Heart
        className={`h-4 w-4 mr-1.5 ${following ? 'fill-current' : ''}`}
      />
      {following ? 'Following' : 'Follow'}
    </Button>
    </div>
  );
}
