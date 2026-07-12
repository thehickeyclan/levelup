'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { useNotificationCount } from '@/lib/hooks/use-notification-count';
import { useInboxUnreadCount } from '@/lib/hooks/use-inbox-unread-count';
import { NotificationBell } from '@/components/notification-bell';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Bell, Mail, User } from 'lucide-react';
import { useTenant } from '@/components/theme-provider';
import { BrandLogo } from '@/components/brand-logo';
import { CartDropdown } from '@/components/cart-dropdown';
import { createClient } from '@/lib/supabase/client';
import { CoachHeaderMobile } from '@/components/coach-header-mobile';
import { PublicHeaderMobile } from '@/components/public-header-mobile';
import { isMarketingRoute } from '@/lib/marketing-routes';
import { IN_APP_MESSAGING_ENABLED } from '@/lib/in-app-messaging';
import { WORKSPACES_NAV_ENABLED } from '@/lib/workspaces-feature';
import { activityNavHref } from '@/lib/activity-feed/activity-nav-href';

type Coach = { id: string; first_name: string; last_name: string; school: string | null };

/** Logged-out mobile header links: omit on auth flows (redundant with page). Home included. */
function showLoggedOutMobileHeaderLinks(pathname: string): boolean {
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/auth/confirm') ||
    pathname.startsWith('/invite-parent')
  ) {
    return false;
  }
  return true;
}

export function Header() {
  const tenant = useTenant();
  const pathname = usePathname();
  const { user, userRole, viewAsRole, effectiveRole, viewAsCoachId, setViewAsRole, setViewAsCoachId, loading, signOut } = useAuth();
  const router = useRouter();
  const [notificationCount, refreshNotifications] = useNotificationCount(!!user);
  const [messagesUnread, refreshMessagesUnread] = useInboxUnreadCount(
    !!user &&
      (effectiveRole === 'parent' ||
        effectiveRole === 'coach' ||
        effectiveRole === 'youth_wrestler' ||
        effectiveRole === 'admin')
  );
  const bellCount = notificationCount;
  const refreshBell = () => {
    refreshNotifications();
    refreshMessagesUnread();
  };
  const showMessagesIcon =
    IN_APP_MESSAGING_ENABLED &&
    (effectiveRole === 'parent' ||
      effectiveRole === 'coach' ||
      effectiveRole === 'youth_wrestler' ||
      (effectiveRole === 'admin' && viewAsRole !== null));
  
  // Coach picker state
  const [showCoachPicker, setShowCoachPicker] = useState(false);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachName, setSelectedCoachName] = useState<string | null>(null);

  // Fetch coaches list when admin
  useEffect(() => {
    if (userRole === 'admin') {
      const supabase = createClient(tenant.slug);
      supabase
        .from('athletes')
        .select('id, first_name, last_name, school')
        .eq('active', true)
        .order('last_name')
        .then(({ data }) => {
          if (data) setCoaches(data);
        });
    }
  }, [userRole, tenant.slug]);

  // Update selected coach name when viewAsCoachId changes
  useEffect(() => {
    if (viewAsCoachId && coaches.length > 0) {
      const coach = coaches.find((c) => c.id === viewAsCoachId);
      if (coach) setSelectedCoachName(`${coach.first_name} ${coach.last_name}`);
    } else {
      setSelectedCoachName(null);
    }
  }, [viewAsCoachId, coaches]);

  const handleViewAsChange = (value: string) => {
    if (value === 'coach') {
      // Show coach picker dialog instead of navigating directly
      setShowCoachPicker(true);
      return;
    }
    setViewAsRole(value === 'admin' ? null : (value as 'coach' | 'parent' | 'youth_wrestler'));
    setViewAsCoachId(null);
    if (value === 'admin') router.push('/admin');
    else if (value === 'parent') router.push('/dashboard');
    else if (value === 'youth_wrestler') router.push('/youth-dashboard');
  };

  const handleSelectCoach = (coach: Coach) => {
    setViewAsRole('coach');
    setViewAsCoachId(coach.id);
    setShowCoachPicker(false);
    router.push('/athlete-dashboard');
  };

  const goToAdmin = () => {
    setViewAsRole(null);
    router.push('/admin');
  };

  const isAdmin = userRole === 'admin';
  const onMarketingPage = isMarketingRoute(pathname);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  return (
    <>
      <header className="bg-primary text-white border-b border-accent/20 sticky top-0 z-50 pt-[env(safe-area-inset-top,0px)]">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="flex items-center group shrink-0">
              <BrandLogo
                src={tenant.logo}
                alt={tenant.productName}
                width={40}
                height={40}
                className="h-9 w-9 sm:h-10 sm:w-10 object-contain"
                textFallback={tenant.productName}
              />
            </Link>
          </div>

          {user ? (
            <>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {effectiveRole === 'coach' && (
                <div className="md:hidden">
                  <CoachHeaderMobile onSignOut={handleSignOut} />
                </div>
              )}
              {(effectiveRole === 'parent' ||
                effectiveRole === 'admin' ||
                effectiveRole === 'youth_wrestler') && (
                <div className="md:hidden">
                  {onMarketingPage ? (
                    <PublicHeaderMobile variant="logged-in" />
                  ) : (
                    <Link
                      href="/coaches"
                      className="inline-flex min-h-[44px] items-center rounded-md border border-accent/50 px-3 text-xs font-semibold text-accent hover:bg-accent/10 transition-colors whitespace-nowrap"
                    >
                      For Coaches
                    </Link>
                  )}
                </div>
              )}
            {/* Post-login: nav aligned to profile (athlete = coach, parent, youth_wrestler, admin) */}
            <nav className="hidden md:flex items-center gap-6">
              {effectiveRole === 'coach' && (
                <>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={goToAdmin}
                        className="text-accent font-semibold hover:text-accent/90 transition-colors"
                      >
                        Back to Admin
                      </button>
                      <Select
                        value={viewAsRole ?? 'admin'}
                        onValueChange={handleViewAsChange}
                      >
                        <SelectTrigger className="w-[120px] min-h-[44px] h-9 border-white/30 bg-white/10 text-white hover:bg-white/20 [&>span]:line-clamp-1">
                          <SelectValue placeholder="Preview as" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="coach">Coach</SelectItem>
                          <SelectItem value="parent">Parent</SelectItem>
                          <SelectItem value="youth_wrestler">Athlete</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  <Link
                    href="/athlete-dashboard"
                    className="text-white hover:text-accent transition-colors font-medium"
                  >
                    Schedule
                  </Link>
                  <Link
                    href="/coach-sessions/create"
                    className="text-accent hover:text-accent-light transition-colors font-semibold"
                  >
                    Create
                  </Link>
                  <Link
                    href="/coach-earnings"
                    className="text-white hover:text-accent transition-colors font-medium"
                  >
                    Earnings
                  </Link>
                  <Link
                    href={activityNavHref('coach')}
                    className={
                      pathname.startsWith('/activity')
                        ? 'text-accent font-semibold'
                        : 'text-white hover:text-accent transition-colors font-medium'
                    }
                  >
                    Activity
                  </Link>
                  <Link
                    href="/profile"
                    className="text-white hover:text-accent transition-colors font-medium"
                  >
                    Profile
                  </Link>
                  {showMessagesIcon ? (
                  <Link
                    href="/messages"
                    className="relative flex items-center justify-center min-h-[44px] min-w-[44px] p-1.5 text-white hover:text-accent transition-colors font-medium rounded hover:bg-white/10"
                    aria-label={messagesUnread > 0 ? `Messages (${messagesUnread} unread)` : 'Messages'}
                    title="Messages"
                  >
                    <Mail className="h-5 w-5" />
                    {messagesUnread > 0 && (
                      <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-accent text-black rounded-full -translate-y-0.5 translate-x-0.5">
                        {messagesUnread > 99 ? '99+' : messagesUnread}
                      </span>
                    )}
                  </Link>
                  ) : null}
                  <NotificationBell count={bellCount} onRefresh={refreshBell} />
                </>
              )}
              {effectiveRole === 'youth_wrestler' && (
                <>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={goToAdmin}
                        className="text-accent font-semibold hover:text-accent/90 transition-colors"
                      >
                        Back to Admin
                      </button>
                      <Select
                        value={viewAsRole ?? 'admin'}
                        onValueChange={handleViewAsChange}
                      >
                        <SelectTrigger className="w-[120px] min-h-[44px] h-9 border-white/30 bg-white/10 text-white hover:bg-white/20 [&>span]:line-clamp-1">
                          <SelectValue placeholder="Preview as" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="coach">Coach</SelectItem>
                          <SelectItem value="parent">Parent</SelectItem>
                          <SelectItem value="youth_wrestler">Athlete</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  <Link
                    href="/youth-dashboard"
                    className="text-white hover:text-accent transition-colors font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href={activityNavHref('youth_wrestler')}
                    className={
                      pathname.startsWith('/activity')
                        ? 'text-accent font-semibold'
                        : 'text-white hover:text-accent transition-colors font-medium'
                    }
                  >
                    Activity
                  </Link>
                  {WORKSPACES_NAV_ENABLED ? (
                  <Link
                    href="/workspaces"
                    className="text-white hover:text-accent transition-colors font-medium"
                  >
                    Workspaces
                  </Link>
                  ) : null}
                  <Link
                    href="/small-group-sessions"
                    className="text-white hover:text-accent transition-colors font-medium"
                  >
                    Group & partner
                  </Link>
                  {showMessagesIcon ? (
                  <Link
                    href="/messages"
                    className="relative flex items-center justify-center min-h-[44px] min-w-[44px] p-1.5 text-white hover:text-accent transition-colors font-medium rounded hover:bg-white/10"
                    aria-label={messagesUnread > 0 ? `Messages (${messagesUnread} unread)` : 'Messages'}
                    title="Messages"
                  >
                    <Mail className="h-5 w-5" />
                    {messagesUnread > 0 && (
                      <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-accent text-black rounded-full -translate-y-0.5 translate-x-0.5">
                        {messagesUnread > 99 ? '99+' : messagesUnread}
                      </span>
                    )}
                  </Link>
                  ) : null}
                  <NotificationBell count={bellCount} onRefresh={refreshBell} />
                </>
              )}
              {effectiveRole === 'admin' && (
                <>
                  <Link
                    href="/market"
                    className="text-accent font-semibold hover:text-accent/90 transition-colors"
                  >
                    Guild Market
                  </Link>
                  <Link
                    href="/dashboard"
                    className="text-white hover:text-accent transition-colors font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href={activityNavHref('admin')}
                    className={
                      pathname.startsWith('/activity')
                        ? 'text-accent font-semibold'
                        : 'text-white hover:text-accent transition-colors font-medium'
                    }
                  >
                    Activity
                  </Link>
                  <button
                    type="button"
                    onClick={goToAdmin}
                    className="text-white hover:text-accent transition-colors font-medium"
                  >
                    Admin
                  </button>
<Select
                        value={viewAsRole ?? 'admin'}
                        onValueChange={handleViewAsChange}
                      >
                        <SelectTrigger className="w-[140px] min-h-[44px] h-9 border-white/30 bg-white/10 text-white hover:bg-white/20 [&>span]:line-clamp-1">
                          {viewAsRole === 'coach' && selectedCoachName ? (
                            <span className="truncate">{selectedCoachName}</span>
                          ) : (
                            <SelectValue placeholder="Preview as" />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="coach">{selectedCoachName ? `Coach: ${selectedCoachName}` : 'Select Coach...'}</SelectItem>
                          <SelectItem value="parent">Parent</SelectItem>
                          <SelectItem value="youth_wrestler">Athlete</SelectItem>
                        </SelectContent>
                      </Select>
                </>
              )}
              {effectiveRole === 'parent' && (
                <>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={goToAdmin}
                        className="text-accent font-semibold hover:text-accent/90 transition-colors"
                      >
                        Back to Admin
                      </button>
                      <Select
                        value={viewAsRole ?? 'admin'}
                        onValueChange={handleViewAsChange}
                      >
                        <SelectTrigger className="w-[120px] min-h-[44px] h-9 border-white/30 bg-white/10 text-white hover:bg-white/20 [&>span]:line-clamp-1">
                          <SelectValue placeholder="Preview as" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="coach">Coach</SelectItem>
                          <SelectItem value="parent">Parent</SelectItem>
                          <SelectItem value="youth_wrestler">Athlete</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  <Link href="/dashboard" className="text-white hover:text-accent transition-colors font-medium">Home</Link>
                  <Link href="/training" className="text-white hover:text-accent transition-colors font-medium">Training</Link>
                  <Link
                    href={activityNavHref('parent')}
                    className={
                      pathname.startsWith('/activity')
                        ? 'text-accent font-semibold'
                        : 'text-white hover:text-accent transition-colors font-medium'
                    }
                  >
                    Activity
                  </Link>
                  {showMessagesIcon ? (
                  <Link
                    href="/messages"
                    className="relative flex items-center justify-center min-h-[44px] min-w-[44px] p-1.5 text-white hover:text-accent transition-colors font-medium rounded hover:bg-white/10"
                    aria-label={messagesUnread > 0 ? `Messages (${messagesUnread} unread)` : 'Messages'}
                    title="Messages"
                  >
                    <Mail className="h-5 w-5" />
                    {messagesUnread > 0 && (
                      <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-accent text-black rounded-full -translate-y-0.5 translate-x-0.5">
                        {messagesUnread > 99 ? '99+' : messagesUnread}
                      </span>
                    )}
                  </Link>
                  ) : null}
                  <CartDropdown />
                  <Link href="/account" className="text-white hover:text-accent transition-colors font-medium">Account</Link>
                  <NotificationBell count={bellCount} onRefresh={refreshBell} />
                </>
              )}
              <div className="flex items-center gap-3 pl-4 border-l border-white/20">
                <span className="text-white/80 text-sm">{user.email}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:text-accent hover:bg-white/10"
                  onClick={handleSignOut}
                >
                  Sign Out
                </Button>
              </div>
            </nav>
            </div>

            {/* Mobile logged-in admin: same “Preview as” as desktop (bottom nav doesn’t include role switch) */}
            {isAdmin && (
              <div className="md:hidden flex items-center justify-end shrink-0 max-w-[min(100%,11rem)]">
                <Select
                  value={viewAsRole ?? 'admin'}
                  onValueChange={(value) => {
                    handleViewAsChange(value);
                  }}
                >
                  <SelectTrigger
                    aria-label="View site as"
                    className="w-[min(100%,11rem)] min-h-[40px] h-9 border-white/30 bg-white/10 text-white text-xs hover:bg-white/20 [&>span]:line-clamp-1"
                  >
                    <SelectValue placeholder="View as" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="coach">Coach</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="youth_wrestler">Athlete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Mobile logged-in: primary nav is bottom nav; header adds admin role switch above */}
            </>
          ) : (
            <>
            {/* Pre-login: public menu (matches signup flow: parent = Browse / Book; coach = For Coaches) */}
            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/training?tab=coaches"
                className="text-white hover:text-accent transition-colors font-medium"
              >
                Browse Coaches
              </Link>
              <Link
                href="/coaches"
                className="text-white hover:text-accent transition-colors font-medium"
              >
                For Coaches
              </Link>
              <Link
                href="/how-it-works"
                className="text-white hover:text-accent transition-colors font-medium"
              >
                How It Works
              </Link>
              <Link
                href="/login"
                className="text-white hover:text-accent transition-colors font-medium"
              >
                Login
              </Link>
              <Button asChild variant="premium" size="default">
                <Link href="/signup">Book Training</Link>
              </Button>
            </nav>

            {showLoggedOutMobileHeaderLinks(pathname) && (
              <nav
                className="md:hidden flex items-center justify-end gap-1 min-[400px]:gap-2 shrink-0"
                aria-label="Log in, sign up, and coach application"
              >
                <Link
                  href="/login"
                  className="inline-flex min-h-[44px] items-center px-2 text-[11px] min-[400px]:text-xs font-medium text-white/90 hover:text-accent transition-colors whitespace-nowrap"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex min-h-[44px] items-center px-2 text-[11px] min-[400px]:text-xs font-semibold text-accent hover:text-accent-light transition-colors whitespace-nowrap"
                >
                  Sign up
                </Link>
                <Link
                  href="/coaches"
                  className="inline-flex min-h-[44px] items-center rounded-md border border-accent/50 px-2.5 min-[400px]:px-3 text-[11px] min-[400px]:text-xs font-semibold text-accent hover:bg-accent/10 transition-colors whitespace-nowrap"
                >
                  Coaches
                </Link>
              </nav>
            )}
            </>
)}
  </div>
  </div>
      </header>

      {/* Coach Picker Dialog */}
      <Dialog open={showCoachPicker} onOpenChange={setShowCoachPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select a Coach to View As</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {coaches.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No coaches found</p>
            ) : (
              coaches.map((coach) => (
                <button
                  key={coach.id}
                  onClick={() => handleSelectCoach(coach)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                    viewAsCoachId === coach.id
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium">{coach.first_name} {coach.last_name}</div>
                    {coach.school && (
                      <div className="text-sm text-muted-foreground">{coach.school}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
