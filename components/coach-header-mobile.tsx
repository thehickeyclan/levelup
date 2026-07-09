'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NotificationBell } from '@/components/notification-bell';
import { useNotificationCount } from '@/lib/hooks/use-notification-count';
import { useGuildUnreadCount } from '@/lib/hooks/use-guild-unread-count';
import { IN_APP_MESSAGING_ENABLED } from '@/lib/in-app-messaging';
import { useInboxUnreadCount } from '@/lib/hooks/use-inbox-unread-count';

type Props = {
  onSignOut: () => void | Promise<void>;
};

/**
 * Mobile-only: optional inbox + notifications + overflow menu so coach header matches desktop links.
 */
export function CoachHeaderMobile({ onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const [notificationCount, refreshNotifications] = useNotificationCount(true);
  const [guildUnread, refreshGuildUnread] = useGuildUnreadCount(true);
  const bellCount = notificationCount + guildUnread;
  const refreshBell = () => {
    refreshNotifications();
    refreshGuildUnread();
  };
  const [inboxUnreadCount] = useInboxUnreadCount(IN_APP_MESSAGING_ENABLED);

  const linkClass =
    'block w-full text-left py-3 px-1 text-base font-medium text-foreground border-b border-border/60 last:border-0 hover:text-accent transition-colors';

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {IN_APP_MESSAGING_ENABLED ? (
        <Link
          href="/inbox"
          className="relative flex items-center justify-center min-h-[44px] min-w-[44px] p-1.5 text-white hover:text-accent rounded-md hover:bg-white/10"
          aria-label={inboxUnreadCount > 0 ? `Messages (${inboxUnreadCount} unread)` : 'Messages'}
        >
          <Mail className="h-5 w-5" />
          {inboxUnreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-accent text-black rounded-full">
              {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
            </span>
          )}
        </Link>
      ) : null}
      <NotificationBell count={bellCount} onRefresh={refreshBell} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-[44px] min-w-[44px] text-white hover:text-accent hover:bg-white/10"
        aria-label="More coach links"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-6 w-6" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Coach menu</DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col pt-2" aria-label="Coach pages">
            <Link href="/athlete-dashboard" className={linkClass} onClick={() => setOpen(false)}>
              Schedule
            </Link>
            <Link href="/coach-sessions/create" className={linkClass} onClick={() => setOpen(false)}>
              Create session
            </Link>
            <Link href="/coach-earnings" className={linkClass} onClick={() => setOpen(false)}>
              Earnings
            </Link>
            <Link href="/coach-reviews" className={linkClass} onClick={() => setOpen(false)}>
              Reviews
            </Link>
            <Link href="/coach-help" className={linkClass} onClick={() => setOpen(false)}>
              Coach help
            </Link>
            <Link href="/profile" className={linkClass} onClick={() => setOpen(false)}>
              Profile
            </Link>
            <button
              type="button"
              className={`${linkClass} text-left text-destructive hover:text-destructive`}
              onClick={async () => {
                setOpen(false);
                await onSignOut();
              }}
            >
              Sign out
            </button>
          </nav>
        </DialogContent>
      </Dialog>
    </div>
  );
}
