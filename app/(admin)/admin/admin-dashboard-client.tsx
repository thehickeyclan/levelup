'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Calendar,
  Users,
  DollarSign,
  Search,
  Wallet,
  CreditCard,
  Copy,
  CopyPlus,
  Check,
  Pencil,
  Plus,
  User,
  UserPlus,
  UserX,
  Loader2,
  Trash2,
  Building2,
  ExternalLink,
  Smartphone,
  LayoutDashboard,
  Gauge,
  TrendingUp,
  TrendingDown,
  Star,
  ChevronRight,
  Trophy,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  Phone,
  Bell,
  History,
  Gift,
  Ban,
  CalendarDays,
  ChevronLeft,
  CircleCheck,
} from 'lucide-react';
import Link from 'next/link';
import { ProfileImage } from '@/components/profile-image';
import { CapacityBadge } from '@/components/capacity-badge';
import { SessionTypeBadge } from '@/components/session-type-badge';
import { formatEST, APP_TIMEZONE } from '@/lib/format-date';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { startOfWeek, startOfMonth, startOfYear, subDays, endOfWeek, addWeeks, addDays, parseISO } from 'date-fns';
import { CopySessionPhonesButton } from '@/components/copy-session-phones-button';
import { CoachTextGroupDialog } from '@/components/coach-text-group-dialog';
import { showSessionSmsCopyAndTextGroup } from '@/lib/session-sms-tools';
import { AdminCockpitView } from './admin-cockpit-view';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { coachPayoutUsd, resolveCoachPayoutRate } from '@/lib/coach-session-payout';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { AdminMessageLogSection } from '@/components/admin-message-log-section';
import { isOpenSessionStatus } from '@/lib/session-checkout-shell';
import { formatSlotDisplay } from '@/lib/availability';
import type { RecruitNcCreditTotals } from '@/lib/recruitnc-credit-admin-stats';
import { isCoachSessionEarningsEligible } from '@/lib/coach-earnings-summary-server';

/** Payout history presets use the date stored in athlete_payout_date (Eastern calendar day). */
type PayoutHistoryPeriodPreset = 'week' | 'month' | 'last30' | 'ytd' | 'all' | 'custom';

function payoutDateBoundsForPreset(preset: PayoutHistoryPeriodPreset): { from: string; to: string } | null {
  if (preset === 'all' || preset === 'custom') return null;
  const now = new Date();
  const todayStr = formatInTimeZone(now, APP_TIMEZONE, 'yyyy-MM-dd');
  const zoned = toZonedTime(now, APP_TIMEZONE);
  if (preset === 'week') {
    const ws = startOfWeek(zoned, { weekStartsOn: 0 });
    return { from: formatInTimeZone(ws, APP_TIMEZONE, 'yyyy-MM-dd'), to: todayStr };
  }
  if (preset === 'month') {
    const ms = startOfMonth(zoned);
    return { from: formatInTimeZone(ms, APP_TIMEZONE, 'yyyy-MM-dd'), to: todayStr };
  }
  if (preset === 'last30') {
    const d = subDays(zoned, 29);
    return { from: formatInTimeZone(d, APP_TIMEZONE, 'yyyy-MM-dd'), to: todayStr };
  }
  if (preset === 'ytd') {
    const ys = startOfYear(zoned);
    return { from: formatInTimeZone(ys, APP_TIMEZONE, 'yyyy-MM-dd'), to: todayStr };
  }
  return null;
}

export type AdminSession = {
  id: string;
  athlete_id: string;
  scheduled_datetime: string;
  status: string;
  duration_minutes: number;
  total_price: number;
  athlete_payment: number;
  org_fee: number;
  stripe_fee: number;
  session_type?: string;
  session_mode?: string;
  join_policy?: string;
  focus_area?: string | null;
  focus_area_2?: string | null;
  partner_invite_code?: string | null;
  current_participants: number;
  /** Roster slots that count toward capacity (excludes unpaid pending checkout rows). */
  confirmed_booked_count?: number;
  max_participants: number;
  price_per_participant: number;
  parent_id: string;
  parent_email: string;
  athlete_name: string;
  athlete_school: string;
  facility_id: string;
  facility_name: string;
  /** Sum of session_participants.amount_paid - what parents actually paid (from Stripe) */
  participant_amount_paid_sum: number;
  /** Drop-in amount (participants with null youth_wrestler_id) */
  drop_in_amount?: number;
  /** Number of drop-ins */
  drop_in_count?: number;
  /** Sum of actual Stripe fees from session_participants.stripe_fee */
  stripe_fee_sum?: number;
  /** When the coach was marked paid for this session (YYYY-MM-DD from DB) */
  athlete_payout_date?: string | null;
  /** Snapshot at session creation */
  session_payout_rate?: number | null;
  /** From athletes.payout_rate when needed */
  coach_payout_rate?: number | null;
  /** Parent-initiated booking with no paid roster yet (legacy DB status was `pending_payment`). */
  booking_checkout_shell: boolean;
};

function sessionDateKeyInAppTz(iso: string): string {
  return formatInTimeZone(new Date(iso), APP_TIMEZONE, 'yyyy-MM-dd');
}

function confirmedRosterCountForAdminList(s: AdminSession): number {
  return s.confirmed_booked_count != null
    ? Number(s.confirmed_booked_count) || 0
    : Number(s.current_participants) || 0;
}

function sessionPayoutAmountUsd(s: AdminSession): number {
  const stored = Number(s.athlete_payment ?? 0);
  if (stored > 0) return Math.round(stored * 100) / 100;
  const paidSum = s.participant_amount_paid_sum ?? 0;
  if (s.booking_checkout_shell && paidSum <= 0) return 0;
  return coachPayoutUsd({
    athlete_payment: s.athlete_payment,
    price_per_participant: s.price_per_participant,
    current_participants: s.current_participants,
    participant_amount_paid_sum: paidSum,
    session_payout_rate: s.session_payout_rate ?? null,
    coach_payout_rate: s.coach_payout_rate ?? null,
  });
}

/** Same “realized” window as /api/coach/leaderboard — excludes future open sessions from earnings totals. */
function isAdminSessionEarningsEligible(s: AdminSession, nowIso: string): boolean {
  return isCoachSessionEarningsEligible(
    { status: s.status, scheduled_datetime: s.scheduled_datetime },
    nowIso
  );
}

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type BillingSummary = {
  totalRevenue: number;
  totalOrgFees: number;
  totalStripeFees: number;
  totalAthletePayments: number;
  upcomingOpenRevenue: number;
  upcomingOpenOrgFees: number;
  upcomingOpenStripeFees: number;
  upcomingOpenAthletePayments: number;
  sessionCount: number;
  completedCount: number;
  pendingPaymentCount: number;
  upcomingOpenCount: number;
  /** Youth roster rows tied to `session_participants.youth_wrestler_id` on `upcomingOpenCount` sessions only. */
  upcomingKidsSignedUpCount: number;
};

export type AthleteReport = {
  athlete_id: string;
  athlete_name: string;
  school: string;
  session_count: number;
  total_earnings: number;
  active: boolean;
  completed_count: number;
  average_rating?: number | null;
  review_count?: number;
};

export type CoachPayout = {
  athlete_id: string;
  name: string;
  school: string;
  amount: number;
  venmo_handle?: string | null;
  zelle_email?: string | null;
};

export type CreditRecord = {
  id: string;
  parent_id: string;
  parent_email: string;
  amount: number;
  remaining: number;
  source: string;
  description?: string | null;
  created_at: string;
  expires_at?: string | null;
};

/** Per youth wrestler row on a session (from session_participants.amount_paid). */
export type YouthSessionSpendLine = {
  youth_wrestler_id: string;
  session_id: string;
  amount_paid: number;
  scheduled_datetime: string;
  session_status: string;
  /** Session type (private, group, …) for admin filters. */
  session_type?: string;
  coach_name: string;
  facility_name: string;
};

/** Merged timeline for overview: newest parent/coach accounts + youth wrestler profiles. */
export type RecentSignupRow =
  | { kind: 'coach'; id: string; name: string; email: string; created_at: string }
  | {
      kind: 'parent';
      id: string;
      name: string;
      email: string;
      created_at: string;
      /** Wrestler first/last names when parent has a name on file too (second line in UI). */
      kids_summary?: string | null;
    }
  | {
      kind: 'youth_wrestler';
      id: string;
      name: string;
      parent_name: string;
      parent_email: string;
      created_at: string;
    };

type AdminSortDir = 'asc' | 'desc';

function AdminSortColBtn({
  label,
  active,
  dir,
  onClick,
  className = '',
}: {
  label: string;
  active: boolean;
  dir: AdminSortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-medium text-muted-foreground text-xs uppercase tracking-wider hover:text-foreground transition-colors ${className}`}
    >
      {label}
      {active ? (
        dir === 'asc' ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[#B89D60]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#B89D60]" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-35" />
      )}
    </button>
  );
}

type SectionId = 'overview' | 'bookings' | 'money' | 'people';
type SubSectionId = 
  | 'dashboard' 
  | 'cockpit'
  | 'sessions' 
  | 'payments' 
  | 'payouts' 
  | 'credits' 
  | 'coaches' 
  | 'athletes' 
  | 'parents' 
  | 'requests'
  | 'messages'
  | 'coach_week';

type Props = {
  sessions: AdminSession[];
  users: AdminUser[];
  billing: BillingSummary;
  athleteReports: AthleteReport[];
  coachPayouts: CoachPayout[];
  credits: CreditRecord[];
  usersError?: string | null;
  /** Parent-paid session rows per youth wrestler (Stripe / recorded amounts). */
  youthSessionSpendLines: YouthSessionSpendLine[];
  /** Newest signups (parents, coaches, wrestlers) for overview — names + emails. */
  recentSignups: RecentSignupRow[];
  /** Guild rewards program: show /admin/rewards in Money nav when enabled. */
  rewardsProgramEnabled?: boolean;
  /** RecruitNC → Guild wallet: grant buckets and spend from those buckets at checkout. */
  recruitNcCreditTotals?: RecruitNcCreditTotals;
};

// Sidebar Navigation Item Component
function NavItem({ 
  icon: Icon, 
  label, 
  active, 
  onClick,
  badge,
}: { 
  icon: React.ElementType; 
  label: string; 
  active: boolean; 
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
        active
          ? 'bg-[#B89D60]/15 text-[#B89D60]'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#B89D60]/20 text-[#B89D60]">
          {badge}
        </span>
      )}
      {active && <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />}
    </button>
  );
}

// KPI Card Component
function KpiCard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  prefix = '',
  chartData,
}: {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ElementType;
  prefix?: string;
  chartData?: { value: number }[];
}) {
  const chartColor = trend === 'down' ? '#ef4444' : '#B89D60';
  
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-semibold tabular-nums">
              {prefix}{typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {change && (
              <div className={`flex items-center gap-1 text-xs font-medium ${
                trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
              }`}>
                {trend === 'up' && <TrendingUp className="h-3 w-3" />}
                {trend === 'down' && <TrendingDown className="h-3 w-3" />}
                {change}
              </div>
            )}
          </div>
          <div className="p-2 rounded-lg bg-[#B89D60]/10">
            <Icon className="h-5 w-5 text-[#B89D60]" />
          </div>
        </div>
        {chartData && chartData.length > 0 && (
          <div className="mt-3 h-10 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={chartColor}
                  strokeWidth={1.5}
                  fill={`url(#gradient-${title})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminDashboardClient({
  sessions,
  users,
  billing,
  athleteReports,
  coachPayouts,
  credits,
  usersError,
  youthSessionSpendLines = [],
  recentSignups = [],
  rewardsProgramEnabled = false,
  recruitNcCreditTotals = {
    grantRows: 0,
    totalGrantedUsd: 0,
    remainingInWalletsUsd: 0,
    spentAtCheckoutUsd: 0,
  },
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get('section') as SectionId | null;
  const subParam = searchParams.get('sub') as SubSectionId | null;
  const editAthleteId = searchParams.get('edit');
  
  const [section, setSection] = useState<SectionId>(sectionParam || 'overview');
  const [subSection, setSubSection] = useState<SubSectionId>(subParam || 'dashboard');
  
  const [markingAthleteId, setMarkingAthleteId] = useState<string | null>(null);
  const [recordingAthleteId, setRecordingAthleteId] = useState<string | null>(null);
  const [customPayoutAmount, setCustomPayoutAmount] = useState('');
  const [payoutTotalByAthlete, setPayoutTotalByAthlete] = useState<Record<string, string>>({});
  const payoutListKey = coachPayouts.map((p) => `${p.athlete_id}:${p.amount}`).join('|');
  
  useEffect(() => {
    setPayoutTotalByAthlete(
      Object.fromEntries(coachPayouts.map((p) => [p.athlete_id, p.amount.toFixed(2)]))
    );
  }, [payoutListKey]);
  
  const [sessionDateFrom, setSessionDateFrom] = useState('');
  const [sessionDateTo, setSessionDateTo] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState<'all' | 'open' | 'completed' | 'cancelled_other'>('all');
  const [sessionTypeFilter, setSessionTypeFilter] = useState<string>('all');
  const [sessionCoachFilter, setSessionCoachFilter] = useState<string>('all');
  /** When false (default), past open sessions with zero bookings are hidden if no date range is set. */
  const [showPastEmptyOpenSessions, setShowPastEmptyOpenSessions] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [duplicatingSessionId, setDuplicatingSessionId] = useState<string | null>(null);
  const [bulkDeleteSelection, setBulkDeleteSelection] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  /** Admin bookings table: per-row delete (same rules as bulk DELETE /api/admin/sessions/[id]). */
  const [singleDeleteSession, setSingleDeleteSession] = useState<AdminSession | null>(null);
  const [singleDeleteLoading, setSingleDeleteLoading] = useState(false);
  const [cancelSessionTarget, setCancelSessionTarget] = useState<AdminSession | null>(null);
  const [cancelSessionLoading, setCancelSessionLoading] = useState(false);
  const [completeSessionTarget, setCompleteSessionTarget] = useState<AdminSession | null>(null);
  const [completeSessionLoading, setCompleteSessionLoading] = useState(false);
  const [completePayoutAmount, setCompletePayoutAmount] = useState('');
  /** People → Coach week: Sunday (Eastern) yyyy-MM-dd of the visible week. */
  const [coachWeekStartYmd, setCoachWeekStartYmd] = useState(() => {
    const z = toZonedTime(new Date(), APP_TIMEZONE);
    return formatInTimeZone(startOfWeek(z, { weekStartsOn: 0 }), APP_TIMEZONE, 'yyyy-MM-dd');
  });
  const [coachScheduleCoachId, setCoachScheduleCoachId] = useState('');
  const [coachWeekAvailByDay, setCoachWeekAvailByDay] = useState<
    Record<string, { blocked: boolean; slots: string[] }>
  >({});
  const [coachWeekAvailLoading, setCoachWeekAvailLoading] = useState(false);
  /** Coach calendar: master grid vs single-coach week */
  const [coachCalendarTab, setCoachCalendarTab] = useState<'all' | 'one'>('all');
  const [masterWeekAvail, setMasterWeekAvail] = useState<
    Record<string, Record<string, { blocked: boolean; slots: string[] }>>
  >({});
  const [masterWeekAvailLoading, setMasterWeekAvailLoading] = useState(false);
  const [masterCoachFilter, setMasterCoachFilter] = useState('');
  // Roster modal state
  const [rosterSessionId, setRosterSessionId] = useState<string | null>(null);
  const [rosterData, setRosterData] = useState<Array<{
    id: string;
    wrestlerName: string;
    photoUrl: string | null;
    parentEmail: string | null;
    paid: boolean;
    amountPaid: number;
    isDropIn: boolean;
    /** Manual / drop-in rows without Stripe PI — safe for admin delete */
    canDelete?: boolean;
    /** Card payment on the source session — transfer does not create a new Stripe charge */
    hasStripePayment?: boolean;
    createdAt: string;
  }>>([]);
  const [sessionCompletingId, setSessionCompletingId] = useState<string | null>(null);
  const [textGroupAdminSession, setTextGroupAdminSession] = useState<AdminSession | null>(null);
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');
  const [cockpitEditUser, setCockpitEditUser] = useState<AdminUser | null>(null);
  const [cockpitEditRole, setCockpitEditRole] = useState('');
  const [cockpitEditLoading, setCockpitEditLoading] = useState(false);
  const [cockpitEditError, setCockpitEditError] = useState<string | null>(null);
  const [athleteSearch, setAthleteSearch] = useState('');
  const [leaderboardTimeFilter, setLeaderboardTimeFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [leaderboardTypeFilter, setLeaderboardTypeFilter] = useState<string>('all');
  const [leaderboardSchoolFilter, setLeaderboardSchoolFilter] = useState<string>('all');
  const [leaderboardSort, setLeaderboardSort] = useState<'earnings' | 'sessions' | 'rating' | 'open'>('earnings');
  
  // Financial filters
  const [financeTimeFilter, setFinanceTimeFilter] = useState<'all' | '7d' | '30d' | '90d' | 'ytd'>('all');
  const [financeTypeFilter, setFinanceTypeFilter] = useState<string>('all');
  const [financeSchoolFilter, setFinanceSchoolFilter] = useState<string>('all');

  const [payoutTab, setPayoutTab] = useState<'pending' | 'history'>('pending');
  const [historyCoachFilter, setHistoryCoachFilter] = useState<string>('all');
  const [historyPayoutFrom, setHistoryPayoutFrom] = useState('');
  const [historyPayoutTo, setHistoryPayoutTo] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [payoutHistoryPeriod, setPayoutHistoryPeriod] = useState<PayoutHistoryPeriodPreset>('all');
  const [athletesSubTab, setAthletesSubTab] = useState<'leaderboard' | 'directory' | 'spending'>(
    'leaderboard'
  );
  const [youthLeaderboardTimeFilter, setYouthLeaderboardTimeFilter] = useState<
    'all' | '7d' | '30d' | '90d'
  >('all');
  const [youthLeaderboardTypeFilter, setYouthLeaderboardTypeFilter] = useState<string>('all');
  const [youthLeaderboardSchoolFilter, setYouthLeaderboardSchoolFilter] = useState<string>('all');
  type YouthLbSortKey = 'name' | 'school' | 'open' | 'completed' | 'pending' | 'bookings' | 'spent';
  const [youthLbSort, setYouthLbSort] = useState<{ key: YouthLbSortKey; dir: AdminSortDir }>({
    key: 'spent',
    dir: 'desc',
  });
  const [youthLeaderboardSearch, setYouthLeaderboardSearch] = useState('');
  type YouthDirSortKey = 'name' | 'school' | 'parent' | 'spent' | 'level' | 'joined';
  const [youthDirSort, setYouthDirSort] = useState<{ key: YouthDirSortKey; dir: AdminSortDir }>({
    key: 'name',
    dir: 'asc',
  });
  type WrestlerTotalsSortKey = 'name' | 'sessions' | 'total';
  const [wrestlerTotalsSort, setWrestlerTotalsSort] = useState<{
    key: WrestlerTotalsSortKey;
    dir: AdminSortDir;
  }>({ key: 'total', dir: 'desc' });
  type AthleteSpendLineSortKey = 'date' | 'athlete' | 'coach' | 'facility' | 'status' | 'paid';
  const [athleteSpendLineSort, setAthleteSpendLineSort] = useState<{
    key: AthleteSpendLineSortKey;
    dir: AdminSortDir;
  }>({ key: 'date', dir: 'desc' });
  const [athleteSpendPeriod, setAthleteSpendPeriod] = useState<PayoutHistoryPeriodPreset>('all');
  const [athleteSpendDateFrom, setAthleteSpendDateFrom] = useState('');
  const [athleteSpendDateTo, setAthleteSpendDateTo] = useState('');
  const [athleteSpendWrestlerFilter, setAthleteSpendWrestlerFilter] = useState('all');
  const [athleteSpendSearch, setAthleteSpendSearch] = useState('');

  const toggleYouthLbSort = (key: YouthLbSortKey) => {
    setYouthLbSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      const isNumeric = key !== 'name' && key !== 'school';
      return { key, dir: isNumeric ? 'desc' : 'asc' };
    });
  };
  const toggleYouthDirSort = (key: YouthDirSortKey) => {
    setYouthDirSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      const descFirst = key === 'spent' || key === 'joined';
      return { key, dir: descFirst ? 'desc' : 'asc' };
    });
  };
  const toggleWrestlerTotalsSort = (key: WrestlerTotalsSortKey) => {
    setWrestlerTotalsSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      const isNumeric = key !== 'name';
      return { key, dir: isNumeric ? 'desc' : 'asc' };
    });
  };
  const toggleAthleteSpendLineSort = (key: AthleteSpendLineSortKey) => {
    setAthleteSpendLineSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      const descFirst =
        key === 'date' || key === 'paid';
      return { key, dir: descFirst ? 'desc' : 'asc' };
    });
  };

  // Fetch roster for a session via API
  const [rosterLoading, setRosterLoading] = useState(false);
  const [parentCheckoutCopied, setParentCheckoutCopied] = useState(false);
  const openRoster = async (sessionId: string) => {
    setRosterSessionId(sessionId);
    setRosterLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/roster`);
      const data = await res.json();
      setRosterData(data.roster || []);
    } catch {
      setRosterData([]);
    } finally {
      setRosterLoading(false);
    }
  };
  
  // Transfer registration state
  const [transferringParticipant, setTransferringParticipant] = useState<{
    id: string;
    wrestlerName: string;
    amountPaid: number;
    paid: boolean;
    hasStripePayment?: boolean;
  } | null>(null);
  const [transferTargetSessionId, setTransferTargetSessionId] = useState<string>('');
  const [transferTargetSearch, setTransferTargetSearch] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [deletingParticipantId, setDeletingParticipantId] = useState<string | null>(null);
  const [markPaidParticipant, setMarkPaidParticipant] = useState<{
    id: string;
    wrestlerName: string;
    amountPaid: number;
  } | null>(null);
  const [markPaidAmount, setMarkPaidAmount] = useState('');
  const [markPaidMethod, setMarkPaidMethod] = useState<'cash' | 'check' | 'venmo' | 'zelle' | 'other'>('cash');
  const [markPaidSaving, setMarkPaidSaving] = useState(false);

  const transferTargetOptions = useMemo(() => {
    const q = transferTargetSearch.trim().toLowerCase();
    const now = Date.now();
    const todayEastern = formatEST(new Date(), 'yyyy-MM-dd');
    /** Future sessions, or any session still on today's Eastern calendar (late-night roster moves after start time). */
    const isEligibleTransferTarget = (scheduledDatetime: string) => {
      const t = new Date(scheduledDatetime).getTime();
      if (t > now) return true;
      return formatEST(new Date(scheduledDatetime), 'yyyy-MM-dd') === todayEastern;
    };
    return sessions
      .filter((s) => s.id !== rosterSessionId && isEligibleTransferTarget(s.scheduled_datetime))
      .filter((s) => s.status === 'scheduled')
      .filter((s) => {
        if (!q) return true;
        const hay = `${s.athlete_name} ${s.athlete_school} ${s.facility_name} ${formatEST(
          new Date(s.scheduled_datetime),
          'MMM d yyyy h:mm a'
        )}`.toLowerCase();
        return hay.includes(q);
      })
      .sort(
        (a, b) =>
          new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
      );
  }, [sessions, rosterSessionId, transferTargetSearch]);
  
  const handleTransferRegistration = async () => {
    if (!transferringParticipant || !rosterSessionId || !transferTargetSessionId) return;

    if (transferringParticipant.hasStripePayment) {
      const ok = window.confirm(
        'This wrestler was charged with Stripe on the SOURCE session. Moving them does not send money to the new coach automatically. After the move, use “Copy parent checkout link” on the TARGET session if the parent still needs to pay that coach, or reconcile manually.'
      );
      if (!ok) return;
    }

    setTransferLoading(true);
    try {
      const res = await fetch('/api/admin/sessions/transfer-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: transferringParticipant.id,
          fromSessionId: rosterSessionId,
          toSessionId: transferTargetSessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Transfer failed');
        return;
      }
      alert(
        transferringParticipant.paid
          ? `Successfully transferred ${transferringParticipant.wrestlerName} with $${Number(transferringParticipant.amountPaid).toFixed(2)} payment preserved`
          : `Successfully transferred ${transferringParticipant.wrestlerName} (payment was still pending — parent may need to complete checkout on the new session)`
      );
      setTransferringParticipant(null);
      setTransferTargetSessionId('');
      setTransferTargetSearch('');
      router.refresh();
      openRoster(rosterSessionId);
    } catch (err) {
      alert('Transfer failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTransferLoading(false);
    }
  };

  const handleRemoveRosterParticipant = async (
    participantId: string,
    wrestlerName: string,
    row: { hasStripePayment?: boolean; canDelete?: boolean; isDropIn?: boolean }
  ) => {
    if (!rosterSessionId) return;
    const paidStripe =
      row.hasStripePayment === true ||
      (row.hasStripePayment === undefined && row.canDelete === false && !row.isDropIn);
    if (paidStripe) {
      const ok = window.confirm(
        `Remove ${wrestlerName} from this roster? This signup was paid with Stripe. Deleting only removes the roster row—it does not refund the card. Refund in Stripe separately if needed. Continue?`
      );
      if (!ok) return;
    } else {
      if (!confirm(`Remove ${wrestlerName} from this session?`)) return;
    }
    setDeletingParticipantId(participantId);
    try {
      const res = await fetch(
        `/api/admin/sessions/${rosterSessionId}/participants/${participantId}`,
        paidStripe
          ? {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ acknowledgePaidRemoval: true }),
            }
          : { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((data as { error?: string }).error || 'Remove failed');
        return;
      }
      router.refresh();
      await openRoster(rosterSessionId);
    } catch (err) {
      alert('Remove failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingParticipantId(null);
    }
  };

  const handleMarkRosterParticipantPaid = async () => {
    if (!markPaidParticipant || !rosterSessionId) return;
    const amount = parseFloat(markPaidAmount);
    if (Number.isNaN(amount) || amount < 0) {
      alert('Enter a valid amount');
      return;
    }
    setMarkPaidSaving(true);
    try {
      const res = await fetch(
        `/api/admin/sessions/${rosterSessionId}/participants/${markPaidParticipant.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount_paid: amount,
            payment_method: markPaidMethod,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Could not mark paid');
        return;
      }
      setMarkPaidParticipant(null);
      setMarkPaidAmount('');
      await openRoster(rosterSessionId);
      router.refresh();
    } catch {
      alert('Could not mark paid');
    } finally {
      setMarkPaidSaving(false);
    }
  };

  // Manual payment entry
  const [showManualPaymentDialog, setShowManualPaymentDialog] = useState(false);
  const [manualPaymentForm, setManualPaymentForm] = useState({
    sessionId: '',
    amount: '',
    paymentMethod: 'cash' as 'cash' | 'check' | 'venmo' | 'other',
    notes: '',
  });
  const [savingManualPayment, setSavingManualPayment] = useState(false);
  
  // Drop-in payment entry
  const [showDropInDialog, setShowDropInDialog] = useState(false);
  const [dropInSession, setDropInSession] = useState<AdminSession | null>(null);
  const [dropInForm, setDropInForm] = useState({
    youthWrestlerId: '' as string,
    wrestlerName: '',
    parentName: '',
    parentPhone: '',
    amountPaid: '',
    paymentMethod: 'cash' as 'cash' | 'venmo' | 'zelle' | 'other',
  });
  const [savingDropIn, setSavingDropIn] = useState(false);
  const [wrestlerSearchResults, setWrestlerSearchResults] = useState<Array<{ id: string; first_name: string; last_name: string; photo_url?: string }>>([]);
  const [wrestlerSearchQuery, setWrestlerSearchQuery] = useState('');
  const [searchingWrestlers, setSearchingWrestlers] = useState(false);
  const [editingAthleteId, setEditingAthleteId] = useState<string | null>(null);
  const hasOpenedEditFromUrl = useRef(false);
  
  useEffect(() => {
    if (editAthleteId && section === 'people' && subSection === 'coaches' && !hasOpenedEditFromUrl.current) {
      hasOpenedEditFromUrl.current = true;
      openAthleteEdit(editAthleteId);
    }
  }, [editAthleteId, section, subSection]);
  
  const [athleteEditForm, setAthleteEditForm] = useState<{
    first_name: string;
    last_name: string;
    school: string;
    facility_id: string | null;
    secondary_facility_id: string | null;
    year: string | null;
    weight_class: string | null;
    bio: string | null;
    photo_url: string | null;
    photo_focus_x: number;
    photo_focus_y: number;
    venmo_handle: string | null;
    zelle_email: string | null;
    /** Coach account cell (`users.phone`); same as /profile for coaches. */
    phone: string;
    /** Home ZIP on `users.zip_code`. */
    zip_code: string;
    active: boolean;
  } | null>(null);
  const [facilities, setFacilities] = useState<{ id: string; name: string; school: string }[]>([]);
  const [athleteEditSaving, setAthleteEditSaving] = useState(false);
  const [athletePhotoUploading, setAthletePhotoUploading] = useState(false);
  const [athletePhotoError, setAthletePhotoError] = useState<string | null>(null);
  const [copiedCoachPublicLink, setCopiedCoachPublicLink] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingAthleteId, setDeletingAthleteId] = useState<string | null>(null);
  const athletePhotoInputRef = useRef<HTMLInputElement>(null);
  const [facilityRequests, setFacilityRequests] = useState<Array<{
    id: string;
    requested_by_athlete_id: string;
    name: string;
    school: string;
    address: string | null;
    status: string;
    created_at: string;
    coach_name: string;
    coach_school: string;
  }>>([]);
  const [facilityRequestsLoading, setFacilityRequestsLoading] = useState(false);
  const [facilityRequestActionId, setFacilityRequestActionId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [syncingEmails, setSyncingEmails] = useState(false);
  const [kidsList, setKidsList] = useState<Array<{
    id: string;
    first_name: string;
    last_name: string;
    school: string | null;
    weight_class: string | null;
    skill_level: string | null;
    graduation_year: number | null;
    parent_email: string;
    photo_url: string | null;
    photo_focus_x?: number;
    photo_focus_y?: number;
    created_at: string;
  }>>([]);
  const [kidsLoading, setKidsLoading] = useState(false);
  const [linkingKidId, setLinkingKidId] = useState<string | null>(null);

  const defaultSubForSection = (s: SectionId): SubSectionId => {
    switch (s) {
      case 'overview':
        return 'dashboard';
      case 'bookings':
        return 'sessions';
      case 'money':
        return 'payments';
      case 'people':
        return 'coaches';
    }
  };

  useEffect(() => {
    const s = (sectionParam as SectionId | null) || 'overview';
    const sub = (subParam as SubSectionId | null) || defaultSubForSection(s);
    setSection(s);
    setSubSection(sub);
  }, [sectionParam, subParam]);

  // Navigation change handler — keep URL in sync for mobile bottom nav
  const handleNavChange = (newSection: SectionId, newSubSection?: SubSectionId) => {
    const sub = newSubSection ?? defaultSubForSection(newSection);
    const params = new URLSearchParams();
    params.set('section', newSection);
    params.set('sub', sub);
    router.push(`/admin?${params.toString()}`, { scroll: false });
  };

  const setPresetThisWeek = () => {
    const z = toZonedTime(new Date(), APP_TIMEZONE);
    const start = startOfWeek(z, { weekStartsOn: 0 });
    const end = endOfWeek(z, { weekStartsOn: 0 });
    setSessionDateFrom(formatInTimeZone(start, APP_TIMEZONE, 'yyyy-MM-dd'));
    setSessionDateTo(formatInTimeZone(end, APP_TIMEZONE, 'yyyy-MM-dd'));
  };

  const setPresetNextWeek = () => {
    const z = toZonedTime(addWeeks(new Date(), 1), APP_TIMEZONE);
    const start = startOfWeek(z, { weekStartsOn: 0 });
    const end = endOfWeek(z, { weekStartsOn: 0 });
    setSessionDateFrom(formatInTimeZone(start, APP_TIMEZONE, 'yyyy-MM-dd'));
    setSessionDateTo(formatInTimeZone(end, APP_TIMEZONE, 'yyyy-MM-dd'));
  };

  const clearSessionFilters = () => {
    setSessionDateFrom('');
    setSessionDateTo('');
    setSessionStatusFilter('all');
    setSessionTypeFilter('all');
    setSessionCoachFilter('all');
  };

  const sessionTypesForFilter = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      const t = s.session_type?.trim();
      if (t) set.add(t);
    }
    return [...set].sort();
  }, [sessions]);

  const coachesForFilter = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) {
      const id = s.athlete_id?.trim();
      if (id) map.set(id, s.athlete_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sessions]);

  const coachesScheduleList = useMemo(
    () => [...athleteReports].sort((a, b) => a.athlete_name.localeCompare(b.athlete_name)),
    [athleteReports]
  );

  const coachWeekModel = useMemo(() => {
    const z = toZonedTime(parseISO(`${coachWeekStartYmd}T12:00:00`), APP_TIMEZONE);
    const weekStart = startOfWeek(z, { weekStartsOn: 0 });
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return {
        ymd: formatInTimeZone(d, APP_TIMEZONE, 'yyyy-MM-dd'),
        label: formatInTimeZone(d, APP_TIMEZONE, 'EEE MMM d'),
        dow: formatInTimeZone(d, APP_TIMEZONE, 'EEE'),
      };
    });
    return { weekStart, days, startYmd: days[0].ymd, endYmd: days[6].ymd };
  }, [coachWeekStartYmd]);

  const coachWeekSessions = useMemo(() => {
    if (!coachScheduleCoachId) return [];
    const { startYmd, endYmd } = coachWeekModel;
    return sessions
      .filter((s) => {
        if (s.athlete_id !== coachScheduleCoachId) return false;
        const k = formatInTimeZone(new Date(s.scheduled_datetime), APP_TIMEZONE, 'yyyy-MM-dd');
        return k >= startYmd && k <= endYmd;
      })
      .sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime));
  }, [sessions, coachScheduleCoachId, coachWeekModel]);

  const coachWeekByDay = useMemo(() => {
    const map = new Map<string, AdminSession[]>();
    for (const d of coachWeekModel.days) map.set(d.ymd, []);
    for (const s of coachWeekSessions) {
      const k = formatInTimeZone(new Date(s.scheduled_datetime), APP_TIMEZONE, 'yyyy-MM-dd');
      const arr = map.get(k);
      if (arr) arr.push(s);
    }
    return map;
  }, [coachWeekSessions, coachWeekModel.days]);

  const masterSessionsByCoachDay = useMemo(() => {
    const multimap = new Map<string, AdminSession[]>();
    const { startYmd, endYmd } = coachWeekModel;
    for (const s of sessions) {
      const ymd = formatInTimeZone(new Date(s.scheduled_datetime), APP_TIMEZONE, 'yyyy-MM-dd');
      if (ymd < startYmd || ymd > endYmd) continue;
      const key = `${s.athlete_id}|${ymd}`;
      const arr = multimap.get(key) ?? [];
      arr.push(s);
      multimap.set(key, arr);
    }
    for (const arr of multimap.values()) {
      arr.sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime));
    }
    return multimap;
  }, [sessions, coachWeekModel]);

  const masterCoachesFiltered = useMemo(() => {
    const q = masterCoachFilter.trim().toLowerCase();
    if (!q) return coachesScheduleList;
    return coachesScheduleList.filter(
      (c) =>
        c.athlete_name.toLowerCase().includes(q) || (c.school ?? '').toLowerCase().includes(q)
    );
  }, [coachesScheduleList, masterCoachFilter]);

  useEffect(() => {
    if (section !== 'people' || subSection !== 'coach_week') return;
    if (coachScheduleCoachId) return;
    const first = coachesScheduleList[0]?.athlete_id;
    if (first) setCoachScheduleCoachId(first);
  }, [section, subSection, coachScheduleCoachId, coachesScheduleList]);

  useEffect(() => {
    if (section !== 'people' || subSection !== 'coach_week') return;
    if (coachCalendarTab !== 'one') {
      setCoachWeekAvailByDay({});
      setCoachWeekAvailLoading(false);
      return;
    }
    if (!coachScheduleCoachId) {
      setCoachWeekAvailByDay({});
      setCoachWeekAvailLoading(false);
      return;
    }
    const weekStart = coachWeekModel.startYmd;
    let cancelled = false;
    setCoachWeekAvailLoading(true);
    fetch(
      `/api/admin/coach-week-availability?coachId=${encodeURIComponent(coachScheduleCoachId)}&weekStart=${encodeURIComponent(weekStart)}`,
      { credentials: 'same-origin' }
    )
      .then((r) => r.json())
      .then(
        (data: {
          error?: string;
          days?: Record<string, { blocked: boolean; slots: string[] }>;
        }) => {
          if (cancelled) return;
          if (data.error) setCoachWeekAvailByDay({});
          else setCoachWeekAvailByDay(data.days ?? {});
        }
      )
      .catch(() => {
        if (!cancelled) setCoachWeekAvailByDay({});
      })
      .finally(() => {
        if (!cancelled) setCoachWeekAvailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, subSection, coachCalendarTab, coachScheduleCoachId, coachWeekModel.startYmd]);

  useEffect(() => {
    if (section !== 'people' || subSection !== 'coach_week') return;
    if (coachCalendarTab !== 'all') {
      setMasterWeekAvail({});
      setMasterWeekAvailLoading(false);
      return;
    }
    if (coachesScheduleList.length === 0) {
      setMasterWeekAvail({});
      setMasterWeekAvailLoading(false);
      return;
    }
    let cancelled = false;
    setMasterWeekAvailLoading(true);
    fetch('/api/admin/coaches-week-availability', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekStart: coachWeekModel.startYmd,
        coachIds: coachesScheduleList.map((c) => c.athlete_id),
      }),
    })
      .then((r) => r.json())
      .then(
        (data: {
          error?: string;
          byCoach?: Record<string, Record<string, { blocked: boolean; slots: string[] }>>;
        }) => {
          if (cancelled) return;
          if (data.error) setMasterWeekAvail({});
          else setMasterWeekAvail(data.byCoach ?? {});
        }
      )
      .catch(() => {
        if (!cancelled) setMasterWeekAvail({});
      })
      .finally(() => {
        if (!cancelled) setMasterWeekAvailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, subSection, coachCalendarTab, coachWeekModel.startYmd, coachesScheduleList]);

  const filteredSessions = useMemo(() => {
    const sessionDateKeyLocal = (iso: string) =>
      formatInTimeZone(new Date(iso), APP_TIMEZONE, 'yyyy-MM-dd');
    const todayKey = formatInTimeZone(new Date(), APP_TIMEZONE, 'yyyy-MM-dd');
    const dateRangeActive = Boolean(sessionDateFrom || sessionDateTo);

    return sessions.filter((s) => {
      const d = sessionDateKeyLocal(s.scheduled_datetime);
      if (sessionDateFrom && d < sessionDateFrom) return false;
      if (sessionDateTo && d > sessionDateTo) return false;

      if (sessionStatusFilter === 'open') {
        if (s.status !== 'scheduled') return false;
        if (sessionDateKeyLocal(s.scheduled_datetime) < todayKey) return false;
      } else if (sessionStatusFilter === 'completed') {
        if (s.status !== 'completed') return false;
      } else if (sessionStatusFilter === 'cancelled_other') {
        if (s.status === 'scheduled' || s.status === 'completed') return false;
      }

      if (sessionTypeFilter !== 'all' && (s.session_type ?? '') !== sessionTypeFilter) return false;
      if (sessionCoachFilter !== 'all' && s.athlete_id !== sessionCoachFilter) return false;

      if (
        !showPastEmptyOpenSessions &&
        !dateRangeActive &&
        sessionStatusFilter === 'all' &&
        sessionDateKeyLocal(s.scheduled_datetime) < todayKey &&
        isOpenSessionStatus(s.status) &&
        confirmedRosterCountForAdminList(s) === 0
      ) {
        return false;
      }

      return true;
    });
  }, [
    sessions,
    sessionDateFrom,
    sessionDateTo,
    sessionStatusFilter,
    sessionTypeFilter,
    sessionCoachFilter,
    showPastEmptyOpenSessions,
  ]);

  /** Sum spots and collected $ for the current filter (matches table rows). */
  const sessionListTotals = useMemo(() => {
    let booked = 0;
    let capacity = 0;
    let collected = 0;
    for (const s of filteredSessions) {
      const cur =
        s.confirmed_booked_count != null
          ? Number(s.confirmed_booked_count) || 0
          : Number(s.current_participants) || 0;
      const max = Math.max(1, Number(s.max_participants) || 1);
      booked += cur;
      capacity += max;
      collected += Number(s.participant_amount_paid_sum) || 0;
    }
    const openings = Math.max(0, capacity - booked);
    return { booked, capacity, openings, collected };
  }, [filteredSessions]);

  /** Rows eligible for bulk delete (matches DELETE /api/admin/sessions/[id]). */
  const bulkDeletableFilteredIds = useMemo(
    () =>
      filteredSessions
        .filter((s) => s.status === 'scheduled' || s.status === 'cancelled' || s.status === 'no-show')
        .map((s) => s.id),
    [filteredSessions]
  );

  useEffect(() => {
    const allowed = new Set(bulkDeletableFilteredIds);
    setBulkDeleteSelection((prev) => prev.filter((id) => allowed.has(id)));
  }, [bulkDeletableFilteredIds]);

  const sessionsTotalsScopeLabel =
    sessionStatusFilter === 'all'
      ? 'All statuses'
      : sessionStatusFilter === 'open'
        ? 'Open (scheduled, from today forward)'
        : sessionStatusFilter === 'completed'
          ? 'Completed'
          : 'Cancelled / other';

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const list = users.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (q) {
        const email = u.email.toLowerCase();
        const ln = (u.last_name ?? '').toLowerCase();
        const fn = (u.first_name ?? '').toLowerCase();
        if (!email.includes(q) && !ln.includes(q) && !fn.includes(q)) return false;
      }
      return true;
    });
    // Newest signups first (same as server default; keeps order after filter)
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [users, userRoleFilter, userSearch]);

  // Compute leaderboard data from sessions
  const leaderboardData = useMemo(() => {
    const now = new Date();
    const cutoff = leaderboardTimeFilter === '7d' 
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : leaderboardTimeFilter === '30d'
      ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      : leaderboardTimeFilter === '90d'
      ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      : null;

    // Filter sessions by time and type
    const filteredSess = sessions.filter(s => {
      if (cutoff && new Date(s.scheduled_datetime) < cutoff) return false;
      if (leaderboardTypeFilter !== 'all' && s.session_type !== leaderboardTypeFilter) return false;
      return true;
    });

    // Aggregate by coach
    const coachMap = new Map<string, {
      athlete_id: string;
      athlete_name: string;
      school: string;
      total_earnings: number;
      session_count: number;
      completed_count: number;
      open_count: number;
      pending_payment_count: number;
      average_rating: number | null;
      review_count: number;
      active: boolean;
    }>();

    const nowIso = new Date().toISOString();

    for (const s of filteredSess) {
      const existing = coachMap.get(s.athlete_id) || {
        athlete_id: s.athlete_id,
        athlete_name: s.athlete_name,
        school: s.athlete_school,
        total_earnings: 0,
        session_count: 0,
        completed_count: 0,
        open_count: 0,
        pending_payment_count: 0,
        average_rating: null,
        review_count: 0,
        active: false,
      };
      
      existing.session_count += 1;
      if (isAdminSessionEarningsEligible(s, nowIso)) {
        existing.total_earnings += sessionPayoutAmountUsd(s);
      }
      
      if (s.status === 'completed') existing.completed_count += 1;
      if (s.status === 'scheduled' && !s.booking_checkout_shell) existing.open_count += 1;
      if (s.booking_checkout_shell) existing.pending_payment_count += 1;
      
      coachMap.set(s.athlete_id, existing);
    }

    // Merge with athlete reports for ratings and active status
    for (const report of athleteReports) {
      const existing = coachMap.get(report.athlete_id);
      if (existing) {
        existing.average_rating = report.average_rating ?? null;
        existing.review_count = report.review_count ?? 0;
        existing.active = report.active ?? false;
      } else if (leaderboardTimeFilter === 'all') {
        // Include coaches with no sessions in this period only for 'all'
        coachMap.set(report.athlete_id, {
          athlete_id: report.athlete_id,
          athlete_name: report.athlete_name,
          school: report.school,
          total_earnings: report.total_earnings,
          session_count: report.session_count,
          completed_count: report.completed_count,
          open_count: 0,
          pending_payment_count: 0,
          average_rating: report.average_rating ?? null,
          review_count: report.review_count ?? 0,
          active: report.active ?? false,
        });
      }
    }

    // Convert to array
    let result = Array.from(coachMap.values());

    // Apply school filter
    if (leaderboardSchoolFilter !== 'all') {
      if (leaderboardSchoolFilter === 'non-affiliated') {
        // Non-affiliated = empty school or common non-NCAA indicators
        result = result.filter(a => 
          !a.school || 
          a.school.trim() === '' || 
          a.school.toLowerCase() === 'non-affiliated' ||
          a.school.toLowerCase() === 'independent' ||
          a.school.toLowerCase() === 'n/a'
        );
      } else {
        result = result.filter(a => a.school === leaderboardSchoolFilter);
      }
    }

    // Apply search filter
    if (athleteSearch) {
      const q = athleteSearch.toLowerCase();
      result = result.filter(a => 
        a.athlete_name.toLowerCase().includes(q) ||
        a.school.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (leaderboardSort) {
        case 'earnings': return b.total_earnings - a.total_earnings;
        case 'sessions': return b.session_count - a.session_count;
        case 'rating': return (b.average_rating ?? 0) - (a.average_rating ?? 0);
        case 'open': return b.open_count - a.open_count;
        default: return 0;
      }
    });

    return result;
  }, [sessions, athleteReports, leaderboardTimeFilter, leaderboardTypeFilter, leaderboardSchoolFilter, leaderboardSort, athleteSearch]);
  
  // Get unique schools for the filter dropdown
  const uniqueSchools = useMemo(() => {
    const schools = new Set<string>();
    for (const report of athleteReports) {
      if (report.school && report.school.trim() !== '') {
        schools.add(report.school);
      }
    }
    return Array.from(schools).sort();
  }, [athleteReports]);

  /** Kid (high school) schools for youth leaderboard filter */
  const uniqueYouthSchools = useMemo(() => {
    const schools = new Set<string>();
    for (const k of kidsList) {
      if (k.school && k.school.trim() !== '') schools.add(k.school.trim());
    }
    return Array.from(schools).sort();
  }, [kidsList]);

  /** Youth athlete leaderboard (session lines per kid), mirrors coach leaderboard filters */
  const youthLeaderboardData = useMemo(() => {
    const now = new Date();
    const cutoff =
      youthLeaderboardTimeFilter === '7d'
        ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        : youthLeaderboardTimeFilter === '30d'
          ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          : youthLeaderboardTimeFilter === '90d'
            ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
            : null;

    const lines = youthSessionSpendLines.filter((line) => {
      if (cutoff && new Date(line.scheduled_datetime) < cutoff) return false;
      if (youthLeaderboardTypeFilter !== 'all') {
        const t = (line.session_type ?? '').trim();
        if (t !== youthLeaderboardTypeFilter) return false;
      }
      return true;
    });

    const byYouth = new Map<
      string,
      {
        youth_wrestler_id: string;
        name: string;
        school: string;
        total_spent: number;
        booking_count: number;
        open_count: number;
        pending_payment_count: number;
        completed_count: number;
      }
    >();

    for (const line of lines) {
      const id = line.youth_wrestler_id;
      const kid = kidsList.find((k) => k.id === id);
      const name = kid
        ? `${kid.first_name} ${kid.last_name}`.trim()
        : `Wrestler ${id.slice(0, 8)}…`;
      const school = kid?.school?.trim() ?? '';

      const prev =
        byYouth.get(id) ??
        {
          youth_wrestler_id: id,
          name,
          school,
          total_spent: 0,
          booking_count: 0,
          open_count: 0,
          pending_payment_count: 0,
          completed_count: 0,
        };

      prev.booking_count += 1;
      prev.total_spent = Math.round((prev.total_spent + line.amount_paid) * 100) / 100;
      if (line.session_status === 'completed') prev.completed_count += 1;
      else if (isOpenSessionStatus(line.session_status)) prev.open_count += 1;

      byYouth.set(id, { ...prev, name, school });
    }

    if (youthLeaderboardTimeFilter === 'all') {
      for (const k of kidsList) {
        if (byYouth.has(k.id)) continue;
        byYouth.set(k.id, {
          youth_wrestler_id: k.id,
          name: `${k.first_name} ${k.last_name}`.trim(),
          school: k.school?.trim() ?? '',
          total_spent: 0,
          booking_count: 0,
          open_count: 0,
          pending_payment_count: 0,
          completed_count: 0,
        });
      }
    }

    let result = Array.from(byYouth.values());

    if (youthLeaderboardSchoolFilter !== 'all') {
      if (youthLeaderboardSchoolFilter === 'non-affiliated') {
        result = result.filter(
          (a) =>
            !a.school ||
            a.school.trim() === '' ||
            a.school.toLowerCase() === 'non-affiliated' ||
            a.school.toLowerCase() === 'independent' ||
            a.school.toLowerCase() === 'n/a'
        );
      } else {
        result = result.filter((a) => a.school === youthLeaderboardSchoolFilter);
      }
    }

    if (youthLeaderboardSearch.trim()) {
      const q = youthLeaderboardSearch.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.school.toLowerCase().includes(q) ||
          a.youth_wrestler_id.toLowerCase().includes(q)
      );
    }

    const { key: lbKey, dir: lbDir } = youthLbSort;
    result.sort((a, b) => {
      const tieName = () => a.name.localeCompare(b.name);
      const strCmp = (sa: string, sb: string) => {
        const c = sa.localeCompare(sb);
        return lbDir === 'desc' ? -c : c;
      };
      const numCmp = (na: number, nb: number) => {
        const d = na - nb;
        if (d !== 0) return lbDir === 'desc' ? -d : d;
        return tieName();
      };
      switch (lbKey) {
        case 'name':
          return strCmp(a.name.toLowerCase(), b.name.toLowerCase());
        case 'school':
          return strCmp((a.school || '').toLowerCase(), (b.school || '').toLowerCase());
        case 'open':
          return numCmp(a.open_count, b.open_count);
        case 'completed':
          return numCmp(a.completed_count, b.completed_count);
        case 'pending':
          return numCmp(a.pending_payment_count, b.pending_payment_count);
        case 'bookings':
          return numCmp(a.booking_count, b.booking_count);
        case 'spent':
          return numCmp(a.total_spent, b.total_spent);
        default:
          return 0;
      }
    });

    return result;
  }, [
    youthSessionSpendLines,
    kidsList,
    youthLeaderboardTimeFilter,
    youthLeaderboardTypeFilter,
    youthLeaderboardSchoolFilter,
    youthLbSort,
    youthLeaderboardSearch,
  ]);

  // Computed financial data with filters
  const financeData = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const cutoff = financeTimeFilter === '7d' 
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : financeTimeFilter === '30d'
      ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      : financeTimeFilter === '90d'
      ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      : financeTimeFilter === 'ytd'
      ? yearStart
      : null;

    // Filter sessions by time and type
    const filteredSess = sessions.filter(s => {
      if (cutoff && new Date(s.scheduled_datetime) < cutoff) return false;
      if (financeTypeFilter !== 'all' && s.session_type !== financeTypeFilter) return false;
      if (financeSchoolFilter !== 'all') {
        if (financeSchoolFilter === 'non-affiliated') {
          if (s.athlete_school && s.athlete_school.trim() !== '' && 
              s.athlete_school.toLowerCase() !== 'non-affiliated' &&
              s.athlete_school.toLowerCase() !== 'independent' &&
              s.athlete_school.toLowerCase() !== 'n/a') return false;
        } else {
          if (s.athlete_school !== financeSchoolFilter) return false;
        }
      }
      return true;
    });

    const todayKeyFinance = formatInTimeZone(new Date(), APP_TIMEZONE, 'yyyy-MM-dd');
    const sessionDayKeyFinance = (iso: string) =>
      formatInTimeZone(new Date(iso), APP_TIMEZONE, 'yyyy-MM-dd');

    // Calculate aggregates following GAAP accounting rules:
    // - Revenue = only from COMPLETED sessions (money EARNED)
    // - Deposits = collected for future sessions (liability until delivered)
    // - Coach Payouts = only for COMPLETED sessions (not owed until service delivered)
    let completedRevenue = 0; // Revenue from completed sessions (earned)
    let depositsCollected = 0; // Prepaid for future sessions (liability)
    let coachPayoutsEarned = 0; // Coach payouts for completed sessions only
    let coachPayoutsPending = 0; // What will be owed when scheduled sessions complete
    let actualStripeFees = 0; // Sum of actual Stripe fees from payments
    let openBookings = 0;
    let completedSessions = 0;
    let pendingPayment = 0;
    let cancelledSessions = 0;

    // Group by coach for breakdown
    const coachBreakdown = new Map<string, { name: string; school: string; revenue: number; payout: number; sessions: number; open: number }>();

    for (const s of filteredSess) {
      // participant_amount_paid_sum = line amounts on roster (often list price until Stripe settles)
      // Coach share = sessionPayoutAmountUsd (80% default of paid sum / roster estimate; athlete_payment when set at payout)
      const parentsPaid = Number(s.participant_amount_paid_sum) || 0;
      const coachPaid = sessionPayoutAmountUsd(s);
      
      if (s.status === 'completed') {
        // COMPLETED = Revenue earned, coach payout owed
        completedRevenue += parentsPaid;
        coachPayoutsEarned += coachPaid;
        actualStripeFees += Number(s.stripe_fee_sum ?? 0);
      } else if (s.status === 'scheduled') {
        // FUTURE = Deposits collected (liability), coach payout pending
        depositsCollected += parentsPaid;
        coachPayoutsPending += coachPaid;
      }

      if (
        s.status === 'scheduled' &&
        !s.booking_checkout_shell &&
        sessionDayKeyFinance(s.scheduled_datetime) >= todayKeyFinance
      )
        openBookings += 1;
      if (s.status === 'completed') completedSessions += 1;
      if (
        s.booking_checkout_shell &&
        sessionDayKeyFinance(s.scheduled_datetime) >= todayKeyFinance
      )
        pendingPayment += 1;
      if (s.status === 'cancelled') cancelledSessions += 1;

      // Coach breakdown - only count COMPLETED sessions for earned revenue/payouts
      const existing = coachBreakdown.get(s.athlete_id) || {
        name: s.athlete_name,
        school: s.athlete_school,
        revenue: 0,
        payout: 0,
        sessions: 0,
        open: 0,
      };
      if (s.status === 'completed') {
        existing.revenue += parentsPaid;
        existing.payout += coachPaid;
        existing.sessions += 1;
      }
      if (
        s.status === 'scheduled' &&
        !s.booking_checkout_shell &&
        sessionDayKeyFinance(s.scheduled_datetime) >= todayKeyFinance
      )
        existing.open += 1;
      coachBreakdown.set(s.athlete_id, existing);
    }

    // Gross Revenue = only COMPLETED sessions (earned revenue per GAAP)
    const grossRevenue = completedRevenue;
    // Guild Net = Revenue - Coach Payouts for completed sessions
    const guildNet = grossRevenue - coachPayoutsEarned;
    // Stripe fees are stored from actual balance transactions (fetched at checkout time)
    // We don't use Stripe for payouts - payouts are manual (Zelle/Venmo)
    const stripeFees = actualStripeFees;
    // Guild Profit = Guild Net after Stripe fees
    const guildProfit = guildNet - stripeFees;

    // Sort coach breakdown by revenue
    const coachBreakdownArray = Array.from(coachBreakdown.entries())
      .map(([id, data]) => ({ athlete_id: id, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      grossRevenue, // Earned revenue (completed only)
      stripeRevenue: completedRevenue, // For backward compat
      cashRevenue: 0, // Would need separate tracking
      depositsCollected, // Prepaid for future sessions
      coachPayouts: coachPayoutsEarned, // Payouts for completed sessions
      coachPayoutsPending, // What will be owed for scheduled sessions
      guildNet,
      stripeFees,
      guildProfit,
      openBookings,
      completedSessions,
      pendingPayment,
      cancelledSessions,
      totalSessions: filteredSess.length,
      coachBreakdown: coachBreakdownArray,
    };
  }, [sessions, financeTimeFilter, financeTypeFilter, financeSchoolFilter]);

  const filteredAthletes = athleteReports.filter((a) => {
    if (!athleteSearch) return true;
    const q = athleteSearch.toLowerCase();
    return (
      a.athlete_name.toLowerCase().includes(q) ||
      a.school.toLowerCase().includes(q)
    );
  });

  const openAthleteEdit = async (athleteId: string) => {
    setEditingAthleteId(athleteId);
    setAthleteEditForm(null);
    setAthletePhotoError(null);
    try {
      const [athleteRes, facilitiesRes] = await Promise.all([
        fetch(`/api/admin/athletes/${athleteId}`),
        fetch('/api/admin/facilities'),
      ]);
      const athleteData = await athleteRes.json();
      const facilitiesData = await facilitiesRes.json();
      if (!athleteRes.ok || !athleteData.athlete) {
        setEditingAthleteId(null);
        return;
      }
      const a = athleteData.athlete;
      setAthleteEditForm({
        first_name: a.first_name ?? '',
        last_name: a.last_name ?? '',
        school: a.school ?? '',
        facility_id: a.facility_id ?? null,
        secondary_facility_id: a.secondary_facility_id ?? null,
        year: a.year ?? null,
        weight_class: a.weight_class ?? null,
        bio: a.bio ?? null,
        photo_url: a.photo_url ?? null,
        photo_focus_x: typeof a.photo_focus_x === 'number' ? a.photo_focus_x : 50,
        photo_focus_y: typeof a.photo_focus_y === 'number' ? a.photo_focus_y : 15,
        venmo_handle: a.venmo_handle ?? null,
        zelle_email: a.zelle_email ?? null,
        phone: typeof a.phone === 'string' ? a.phone : '',
        zip_code: typeof a.zip_code === 'string' ? a.zip_code : '',
        active: a.active ?? true,
      });
      setFacilities(facilitiesData.facilities ?? []);
    } catch {
      setEditingAthleteId(null);
    }
  };

  const saveAthleteEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAthleteId || !athleteEditForm) return;
    setAthleteEditSaving(true);
    try {
      const res = await fetch(`/api/admin/athletes/${editingAthleteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: athleteEditForm.first_name.trim(),
          last_name: athleteEditForm.last_name.trim(),
          school: athleteEditForm.school.trim(),
          facility_id: athleteEditForm.facility_id || null,
          secondary_facility_id: athleteEditForm.secondary_facility_id || null,
          year: athleteEditForm.year || null,
          weight_class: athleteEditForm.weight_class || null,
          bio: athleteEditForm.bio || null,
          photo_url: athleteEditForm.photo_url,
          photo_focus_x: athleteEditForm.photo_focus_x,
          photo_focus_y: athleteEditForm.photo_focus_y,
          venmo_handle: athleteEditForm.venmo_handle || null,
          zelle_email: athleteEditForm.zelle_email || null,
          phone: athleteEditForm.phone.trim() === '' ? null : athleteEditForm.phone.trim(),
          zip_code: athleteEditForm.zip_code.trim() === '' ? null : athleteEditForm.zip_code.trim(),
          active: athleteEditForm.active,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        window.alert(typeof errData?.error === 'string' ? errData.error : 'Could not save coach.');
        return;
      }
      setEditingAthleteId(null);
      setAthleteEditForm(null);
      router.refresh();
    } finally {
      setAthleteEditSaving(false);
    }
  };

const handleToggleApproval = async (athleteId: string, currentActive: boolean) => {
    const action = currentActive ? 'unapprove' : 'approve';
    if (!confirm(`${currentActive ? 'Unapprove' : 'Approve'} this coach? ${currentActive ? 'They will be hidden from Browse.' : 'They will be visible on Browse.'}`)) return;
    setApprovingId(athleteId);
    try {
      const res = await fetch(`/api/admin/athletes/${athleteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) router.refresh();
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeactivateAthlete = async (athleteId: string) => {
  if (!confirm('Deactivate this coach? They will be hidden from Browse and cannot receive new bookings.')) return;
  setDeactivatingId(athleteId);
  try {
  const res = await fetch(`/api/admin/athletes/${athleteId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ active: false }),
  });
  if (res.ok) router.refresh();
  } finally {
      setDeactivatingId(null);
    }
  };

  const handleDeleteAthlete = async (athleteId: string) => {
    if (!confirm('Permanently delete this coach? This cannot be undone.')) return;
    setDeletingAthleteId(athleteId);
    try {
      const res = await fetch(`/api/admin/athletes/${athleteId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Delete failed');
        return;
      }
      router.refresh();
    } finally {
      setDeletingAthleteId(null);
    }
  };

  // Duplicate a session (creates new session with same settings, for next week by default)
  const handleDuplicateSession = async (session: AdminSession) => {
    setDuplicatingSessionId(session.id);
    try {
      // Calculate next week's date (same day of week)
      const originalDate = new Date(session.scheduled_datetime);
      const nextWeek = new Date(originalDate);
      nextWeek.setDate(nextWeek.getDate() + 7);
      
      const scheduledDate = nextWeek.toISOString().split('T')[0];
      const scheduledTime = originalDate.toTimeString().slice(0, 5);
      
      const res = await fetch('/api/admin/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId: session.athlete_id,
          facilityId: session.facility_id,
          scheduledDate,
          scheduledTime,
          durationMinutes: session.duration_minutes || 60,
          maxParticipants: session.max_participants || 6,
          pricePerParticipant: session.price_per_participant || 30,
          sessionType: session.session_type === 'group' ? 'small_group' : session.session_type === '2-athlete' ? 'partner' : 'private',
          joinPolicy: session.join_policy || 'public',
          focusArea: session.focus_area || undefined,
          focusArea2: session.focus_area_2 || undefined,
        }),
      });
      
      if (res.ok) {
        router.refresh();
        alert(`Session duplicated for ${nextWeek.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to duplicate session');
      }
    } catch {
      alert('Failed to duplicate session');
    } finally {
      setDuplicatingSessionId(null);
    }
  };

  // Handle drop-in payment recording
  const handleRecordDropIn = async () => {
    if (!dropInSession || (!dropInForm.wrestlerName && !dropInForm.youthWrestlerId) || !dropInForm.amountPaid) {
      alert('Please select or enter a wrestler and amount paid');
      return;
    }
    setSavingDropIn(true);
    try {
      const res = await fetch('/api/admin/drop-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: dropInSession.id,
          youthWrestlerId: dropInForm.youthWrestlerId || null,
          wrestlerName: dropInForm.wrestlerName,
          parentName: dropInForm.parentName,
          parentPhone: dropInForm.parentPhone,
          amountPaid: parseFloat(dropInForm.amountPaid),
          paymentMethod: dropInForm.paymentMethod,
          tenantSlug: 'guild',
        }),
      });
      if (res.ok) {
        router.refresh();
        setShowDropInDialog(false);
        setDropInSession(null);
        setDropInForm({ youthWrestlerId: '', wrestlerName: '', parentName: '', parentPhone: '', amountPaid: '', paymentMethod: 'cash' });
        setWrestlerSearchQuery('');
        setWrestlerSearchResults([]);
        alert('Drop-in recorded successfully!');
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to record drop-in');
      }
    } catch {
      alert('Failed to record drop-in');
    } finally {
      setSavingDropIn(false);
    }
  };

  // Search for existing wrestlers
  const searchWrestlers = async (query: string) => {
    setWrestlerSearchQuery(query);
    if (query.length < 2) {
      setWrestlerSearchResults([]);
      return;
    }
    setSearchingWrestlers(true);
    try {
      const res = await fetch(`/api/admin/search-wrestlers?q=${encodeURIComponent(query)}&tenant=guild`);
      const data = await res.json();
      setWrestlerSearchResults(data.wrestlers || []);
    } catch {
      setWrestlerSearchResults([]);
    } finally {
      setSearchingWrestlers(false);
    }
  };

  const selectWrestler = (wrestler: { id: string; first_name: string; last_name: string }) => {
    setDropInForm({
      ...dropInForm,
      youthWrestlerId: wrestler.id,
      wrestlerName: `${wrestler.first_name} ${wrestler.last_name}`,
    });
    setWrestlerSearchQuery('');
    setWrestlerSearchResults([]);
  };

  const openDropInDialog = (session: AdminSession) => {
    setDropInSession(session);
    setDropInForm({ 
      youthWrestlerId: '',
      wrestlerName: '', 
      parentName: '', 
      parentPhone: '', 
      amountPaid: session.price_per_participant?.toString() || '', 
      paymentMethod: 'cash' 
    });
    setWrestlerSearchQuery('');
    setWrestlerSearchResults([]);
    setShowDropInDialog(true);
  };

  const statusBadge = (status: string) => {
    const isOpen = isOpenSessionStatus(status);
    const isPaid = status === 'completed';
    const isClosed = status === 'cancelled' || status === 'no-show';
    const label = isOpen ? 'Open' : isPaid ? 'Paid' : status;
    return (
      <Badge
        variant={isClosed ? 'destructive' : 'outline'}
        className={
          isOpen
            ? 'border-emerald-600 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/20 hover:text-emerald-400'
            : isPaid
              ? 'border-[#B89D60] bg-[#B89D60]/20 text-[#B89D60] hover:bg-[#B89D60]/20 hover:text-[#B89D60]'
              : undefined
        }
      >
        {label}
      </Badge>
    );
  };

  // Fetch kids when People > Athletes is selected
  useEffect(() => {
    if (section !== 'people' || subSection !== 'athletes') return;
    setKidsLoading(true);
    fetch('/api/admin/youth-wrestlers')
      .then((r) => r.json())
      .then((data) => {
        setKidsList(data.youthWrestlers ?? []);
      })
      .catch(() => setKidsList([]))
      .finally(() => setKidsLoading(false));
  }, [section, subSection]);

  // Fetch facility requests when People > Requests is selected
  useEffect(() => {
    if (section !== 'people' || subSection !== 'requests') return;
    setFacilityRequestsLoading(true);
    fetch('/api/admin/facility-requests')
      .then((r) => r.json())
      .then((data) => {
        setFacilityRequests(data.requests ?? []);
      })
      .catch(() => setFacilityRequests([]))
      .finally(() => setFacilityRequestsLoading(false));
  }, [section, subSection]);

  // Calculate metrics
  const todayKeyForMetrics = formatInTimeZone(new Date(), APP_TIMEZONE, 'yyyy-MM-dd');
  const openSessions = sessions.filter((s) => {
    if (s.status !== 'scheduled' || s.booking_checkout_shell) return false;
    return sessionDateKeyInAppTz(s.scheduled_datetime) >= todayKeyForMetrics;
  }).length;
  const pendingPayments = sessions.filter((s) => {
    if (!s.booking_checkout_shell) return false;
    return sessionDateKeyInAppTz(s.scheduled_datetime) >= todayKeyForMetrics;
  }).length;
  const totalCoachPayoutsDue = coachPayouts.reduce((sum, p) => sum + p.amount, 0);
  const pendingFacilityRequests = facilityRequests.filter(r => r.status === 'pending').length;

  const payoutHistoryCoachOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) {
      if (s.status !== 'completed' || !s.athlete_payout_date) continue;
      if (!m.has(s.athlete_id)) m.set(s.athlete_id, s.athlete_name);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [sessions]);

  const effectivePayoutHistoryBounds = useMemo(() => {
    if (payoutHistoryPeriod === 'custom') {
      return {
        from: historyPayoutFrom || null,
        to: historyPayoutTo || null,
      };
    }
    const b = payoutDateBoundsForPreset(payoutHistoryPeriod);
    return b ? { from: b.from, to: b.to } : { from: null, to: null };
  }, [payoutHistoryPeriod, historyPayoutFrom, historyPayoutTo]);

  const payoutHistoryRows = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const { from: boundFrom, to: boundTo } = effectivePayoutHistoryBounds;
    return sessions
      .filter((s) => s.status === 'completed' && s.athlete_payout_date)
      .filter((s) => {
        if (historyCoachFilter !== 'all' && s.athlete_id !== historyCoachFilter) return false;
        if (q && !(s.athlete_name || '').toLowerCase().includes(q)) return false;
        const pd = (s.athlete_payout_date || '').slice(0, 10);
        if (boundFrom && pd < boundFrom) return false;
        if (boundTo && pd > boundTo) return false;
        return true;
      })
      .map((s) => ({ session: s, payoutAmount: sessionPayoutAmountUsd(s) }))
      .sort((a, b) => {
        const da = a.session.athlete_payout_date || '';
        const db = b.session.athlete_payout_date || '';
        if (da !== db) return db.localeCompare(da);
        return (
          new Date(b.session.scheduled_datetime).getTime() -
          new Date(a.session.scheduled_datetime).getTime()
        );
      });
  }, [sessions, effectivePayoutHistoryBounds, historyCoachFilter, historySearch]);

  const payoutByCoachRows = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const { from: boundFrom, to: boundTo } = effectivePayoutHistoryBounds;
    const map = new Map<
      string,
      { athlete_id: string; name: string; school: string; total: number; sessionCount: number }
    >();
    for (const s of sessions) {
      if (s.status !== 'completed' || !s.athlete_payout_date) continue;
      const pd = (s.athlete_payout_date || '').slice(0, 10);
      if (boundFrom && pd < boundFrom) continue;
      if (boundTo && pd > boundTo) continue;
      if (historyCoachFilter !== 'all' && s.athlete_id !== historyCoachFilter) continue;
      if (q && !(s.athlete_name || '').toLowerCase().includes(q)) continue;
      const amt = sessionPayoutAmountUsd(s);
      const prev = map.get(s.athlete_id);
      if (prev) {
        prev.total = Math.round((prev.total + amt) * 100) / 100;
        prev.sessionCount += 1;
      } else {
        map.set(s.athlete_id, {
          athlete_id: s.athlete_id,
          name: s.athlete_name,
          school: s.athlete_school,
          total: amt,
          sessionCount: 1,
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name)
    );
  }, [sessions, effectivePayoutHistoryBounds, historyCoachFilter, historySearch]);

  const payoutByCoachGrandTotal = useMemo(
    () => payoutByCoachRows.reduce((sum, r) => sum + r.total, 0),
    [payoutByCoachRows]
  );

  const payoutHistoryTotal = useMemo(
    () => payoutHistoryRows.reduce((sum, r) => sum + r.payoutAmount, 0),
    [payoutHistoryRows]
  );

  const paidSessionsCount = useMemo(
    () => sessions.filter((s) => s.status === 'completed' && s.athlete_payout_date).length,
    [sessions]
  );

  const spendByYouthIdAll = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const line of youthSessionSpendLines) {
      const prev = m.get(line.youth_wrestler_id) ?? { total: 0, count: 0 };
      prev.total += line.amount_paid;
      prev.count += 1;
      m.set(line.youth_wrestler_id, {
        total: Math.round(prev.total * 100) / 100,
        count: prev.count,
      });
    }
    return m;
  }, [youthSessionSpendLines]);

  const sortedKidsDirectory = useMemo(() => {
    const list = [...kidsList];
    const { key, dir } = youthDirSort;
    list.sort((ka, kb) => {
      const aggA = spendByYouthIdAll.get(ka.id);
      const aggB = spendByYouthIdAll.get(kb.id);
      const spentA = aggA?.total ?? 0;
      const spentB = aggB?.total ?? 0;
      const nameA = `${ka.first_name} ${ka.last_name}`.toLowerCase();
      const nameB = `${kb.first_name} ${kb.last_name}`.toLowerCase();
      const tieName = () => nameA.localeCompare(nameB);
      const strCmp = (sa: string, sb: string) => {
        const c = sa.localeCompare(sb);
        return dir === 'desc' ? -c : c;
      };
      switch (key) {
        case 'name':
          return strCmp(nameA, nameB);
        case 'school':
          return strCmp((ka.school ?? '').toLowerCase(), (kb.school ?? '').toLowerCase());
        case 'parent':
          return strCmp((ka.parent_email ?? '').toLowerCase(), (kb.parent_email ?? '').toLowerCase());
        case 'spent': {
          const d = spentA - spentB;
          if (d !== 0) return dir === 'desc' ? -d : d;
          return tieName();
        }
        case 'level':
          return strCmp((ka.skill_level ?? '').toLowerCase(), (kb.skill_level ?? '').toLowerCase());
        case 'joined': {
          const t = new Date(ka.created_at).getTime() - new Date(kb.created_at).getTime();
          if (t !== 0) return dir === 'desc' ? -t : t;
          return tieName();
        }
        default:
          return 0;
      }
    });
    return list;
  }, [kidsList, spendByYouthIdAll, youthDirSort]);

  const totalYouthSpendAllTime = useMemo(
    () => Math.round(youthSessionSpendLines.reduce((s, l) => s + l.amount_paid, 0) * 100) / 100,
    [youthSessionSpendLines]
  );

  const effectiveAthleteSpendBounds = useMemo(() => {
    if (athleteSpendPeriod === 'custom') {
      return { from: athleteSpendDateFrom || null, to: athleteSpendDateTo || null };
    }
    const b = payoutDateBoundsForPreset(athleteSpendPeriod);
    return b ? { from: b.from, to: b.to } : { from: null, to: null };
  }, [athleteSpendPeriod, athleteSpendDateFrom, athleteSpendDateTo]);

  const filteredAthleteSpendLines = useMemo(() => {
    const bounds = effectiveAthleteSpendBounds;
    const q = athleteSpendSearch.trim().toLowerCase();
    return youthSessionSpendLines.filter((line) => {
      const sd = formatInTimeZone(new Date(line.scheduled_datetime), APP_TIMEZONE, 'yyyy-MM-dd');
      if (bounds.from && sd < bounds.from) return false;
      if (bounds.to && sd > bounds.to) return false;
      if (athleteSpendWrestlerFilter !== 'all' && line.youth_wrestler_id !== athleteSpendWrestlerFilter)
        return false;
      if (q) {
        const kid = kidsList.find((k) => k.id === line.youth_wrestler_id);
        const name = kid ? `${kid.first_name} ${kid.last_name}`.toLowerCase() : '';
        const hay = `${name} ${line.coach_name} ${line.facility_name} ${line.session_id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    youthSessionSpendLines,
    effectiveAthleteSpendBounds,
    athleteSpendWrestlerFilter,
    athleteSpendSearch,
    kidsList,
  ]);

  const athleteSpendByWrestlerRows = useMemo(() => {
    const map = new Map<string, { name: string; total: number; sessions: number }>();
    for (const line of filteredAthleteSpendLines) {
      const kid = kidsList.find((k) => k.id === line.youth_wrestler_id);
      const name = kid
        ? `${kid.first_name} ${kid.last_name}`.trim()
        : `Wrestler ${line.youth_wrestler_id.slice(0, 8)}…`;
      const prev = map.get(line.youth_wrestler_id);
      if (prev) {
        prev.total = Math.round((prev.total + line.amount_paid) * 100) / 100;
        prev.sessions += 1;
      } else {
        map.set(line.youth_wrestler_id, { name, total: line.amount_paid, sessions: 1 });
      }
    }
    return Array.from(map.entries()).map(([youth_wrestler_id, v]) => ({ youth_wrestler_id, ...v }));
  }, [filteredAthleteSpendLines, kidsList]);

  const sortedAthleteSpendByWrestlerRows = useMemo(() => {
    const rows = [...athleteSpendByWrestlerRows];
    const { key, dir } = wrestlerTotalsSort;
    rows.sort((a, b) => {
      const tieName = () => a.name.localeCompare(b.name);
      const strCmp = (sa: string, sb: string) => {
        const c = sa.localeCompare(sb);
        return dir === 'desc' ? -c : c;
      };
      switch (key) {
        case 'name':
          return strCmp(a.name.toLowerCase(), b.name.toLowerCase());
        case 'sessions': {
          const d = a.sessions - b.sessions;
          if (d !== 0) return dir === 'desc' ? -d : d;
          return tieName();
        }
        case 'total': {
          const d = a.total - b.total;
          if (d !== 0) return dir === 'desc' ? -d : d;
          return tieName();
        }
        default:
          return 0;
      }
    });
    return rows;
  }, [athleteSpendByWrestlerRows, wrestlerTotalsSort]);

  const sortedFilteredAthleteSpendLines = useMemo(() => {
    const lines = [...filteredAthleteSpendLines];
    const { key, dir } = athleteSpendLineSort;
    const athleteName = (line: YouthSessionSpendLine) => {
      const kid = kidsList.find((k) => k.id === line.youth_wrestler_id);
      return kid ? `${kid.first_name} ${kid.last_name}`.trim().toLowerCase() : '';
    };
    lines.sort((a, b) => {
      const tieDate = () =>
        new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime();
      const strCmp = (sa: string, sb: string) => {
        const c = sa.localeCompare(sb);
        return dir === 'desc' ? -c : c;
      };
      switch (key) {
        case 'date': {
          const t = tieDate();
          if (t !== 0) return dir === 'desc' ? -t : t;
          return a.session_id.localeCompare(b.session_id);
        }
        case 'athlete': {
          const c = athleteName(a).localeCompare(athleteName(b));
          if (c !== 0) return dir === 'desc' ? -c : c;
          const t = tieDate();
          return dir === 'desc' ? -t : t;
        }
        case 'coach': {
          const c = (a.coach_name ?? '').toLowerCase().localeCompare((b.coach_name ?? '').toLowerCase());
          if (c !== 0) return dir === 'desc' ? -c : c;
          const t = tieDate();
          return dir === 'desc' ? -t : t;
        }
        case 'facility': {
          const c = (a.facility_name ?? '').toLowerCase().localeCompare((b.facility_name ?? '').toLowerCase());
          if (c !== 0) return dir === 'desc' ? -c : c;
          const t = tieDate();
          return dir === 'desc' ? -t : t;
        }
        case 'status': {
          const c = (a.session_status ?? '').localeCompare(b.session_status ?? '');
          if (c !== 0) return dir === 'desc' ? -c : c;
          const t = tieDate();
          return dir === 'desc' ? -t : t;
        }
        case 'paid': {
          const d = a.amount_paid - b.amount_paid;
          if (d !== 0) return dir === 'desc' ? -d : d;
          const t = tieDate();
          return dir === 'desc' ? -t : t;
        }
        default:
          return 0;
      }
    });
    return lines;
  }, [filteredAthleteSpendLines, athleteSpendLineSort, kidsList]);

  const athleteSpendFilteredTotal = useMemo(
    () => Math.round(filteredAthleteSpendLines.reduce((s, l) => s + l.amount_paid, 0) * 100) / 100,
    [filteredAthleteSpendLines]
  );

  const wrestlerSpendFilterOptions = useMemo(() => {
    const ids = [...new Set(youthSessionSpendLines.map((l) => l.youth_wrestler_id))].sort();
    return ids.map((id) => {
      const kid = kidsList.find((k) => k.id === id);
      const label = kid
        ? `${kid.first_name} ${kid.last_name}`.trim()
        : `Unknown (${id.slice(0, 8)}…)`;
      return { id, label };
    });
  }, [youthSessionSpendLines, kidsList]);

  // Generate chart data from sessions
  const revenueChartData = useMemo(() => {
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return formatInTimeZone(d, APP_TIMEZONE, 'yyyy-MM-dd');
    });
    return last7Days.map(date => {
      const dayRevenue = sessions
        .filter(s => formatInTimeZone(new Date(s.scheduled_datetime), APP_TIMEZONE, 'yyyy-MM-dd') === date && s.status === 'completed')
        .reduce((sum, s) => sum + s.total_price, 0);
      return { value: dayRevenue };
    });
  }, [sessions]);

  const bookingsChartData = useMemo(() => {
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return formatInTimeZone(d, APP_TIMEZONE, 'yyyy-MM-dd');
    });
    return last7Days.map(date => {
      const dayBookings = sessions
        .filter(s => formatInTimeZone(new Date(s.scheduled_datetime), APP_TIMEZONE, 'yyyy-MM-dd') === date)
        .length;
      return { value: dayBookings };
    });
  }, [sessions]);

  // Render section content
  const renderContent = () => {
    // OVERVIEW SECTION
    if (section === 'overview') {
      // Show Cockpit (trends view) if subSection is cockpit
      if (subSection === 'cockpit') {
        return <AdminCockpitView />;
      }
      
      return (
        <div className="space-y-6">
          {/* Hero KPIs - Proper Accounting */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Earned Revenue"
              value={financeData.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              prefix="$"
              icon={DollarSign}
              trend="up"
              change={financeData.depositsCollected > 0 ? `+$${financeData.depositsCollected.toFixed(0)} prepaid` : 'Completed sessions'}
              chartData={revenueChartData}
            />
            <KpiCard
              title="App Net Profit"
              value={financeData.guildProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              prefix="$"
              icon={financeData.guildProfit >= 0 ? TrendingUp : TrendingDown}
              trend={financeData.guildProfit >= 0 ? 'up' : 'down'}
              change={`${((financeData.guildNet / financeData.grossRevenue) * 100 || 0).toFixed(1)}% margin`}
            />
            <KpiCard
              title="Coach Payouts"
              value={financeData.coachPayouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              prefix="$"
              icon={Wallet}
              trend="neutral"
              change={financeData.coachPayoutsPending > 0 ? `+$${financeData.coachPayoutsPending.toFixed(0)} pending` : `${coachPayouts.length} coaches`}
            />
            <KpiCard
              title="Open Bookings"
              value={openSessions}
              icon={Calendar}
              trend={openSessions > 0 ? 'up' : 'neutral'}
              change={`${pendingPayments} incomplete checkout`}
              chartData={bookingsChartData}
            />
          </div>

          {/* Quick Stats Row */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <Users className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Coaches</p>
                    <p className="text-lg font-semibold">{athleteReports.length}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <User className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Parents</p>
                    <p className="text-lg font-semibold">{users.filter(u => u.role === 'parent').length}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Star className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Rating</p>
                    <p className="text-lg font-semibold">
                      {(athleteReports.reduce((sum, a) => sum + (a.average_rating || 0), 0) / athleteReports.filter(a => a.average_rating).length || 0).toFixed(1)}
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <CreditCard className="h-4 w-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Credits</p>
                    <p className="text-lg font-semibold">{credits.filter(c => c.remaining > 0).length}</p>
                  </div>
                </div>
              </Card>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Upcoming/open sessions</CardDescription>
                  <CardTitle className="text-2xl">{billing.upcomingOpenCount} total</CardTitle>
                  <p className="text-sm text-muted-foreground pt-1">
                    Scheduled sessions from today&apos;s date forward (Eastern), including any incomplete checkouts.
                  </p>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Kids on those sessions</CardDescription>
                  <CardTitle className="text-2xl">{billing.upcomingKidsSignedUpCount} rostered</CardTitle>
                  <p className="text-sm text-muted-foreground pt-1">
                    Youth wrestlers with a roster row on those same upcoming scheduled sessions (Eastern-from-today),
                    including unpaid checkout placeholders when a kid is on the signup.
                  </p>
                </CardHeader>
              </Card>
            </div>
          </div>

          {/* Revenue Breakdown & Payouts Due */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Gross Revenue</span>
                    <span className="text-sm font-medium">${financeData.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Coach Payments</span>
                    <span className="text-sm font-medium text-red-400">-${financeData.coachPayouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Stripe Fees <span className="text-xs text-amber-500">(est.)</span></span>
                    <span className="text-sm font-medium text-red-400">-${financeData.stripeFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm font-medium">Net Profit</span>
                    <span className={`text-lg font-semibold ${financeData.guildProfit >= 0 ? 'text-[#B89D60]' : 'text-red-500'}`}>${financeData.guildProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Payouts Due</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#B89D60] hover:text-[#B89D60]"
                  onClick={() => handleNavChange('money', 'payouts')}
                >
                  View all
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent>
                {totalCoachPayoutsDue > 0 ? (
                  <div className="space-y-3">
                    {coachPayouts.slice(0, 4).map((p) => (
                      <div key={p.athlete_id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.school}</p>
                        </div>
                        <span className="text-sm font-medium text-[#B89D60]">${p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total Due</span>
                        <span className="text-lg font-semibold text-[#B89D60]">${totalCoachPayoutsDue.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No payouts due</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Sessions */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Bookings</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-[#B89D60] hover:text-[#B89D60]"
                onClick={() => handleNavChange('bookings', 'sessions')}
              >
                View all
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Coach</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sessions.slice(0, 5).map((s) => (
                      <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium">{formatEST(new Date(s.scheduled_datetime), 'MMM d')}</div>
                          <div className="text-xs text-muted-foreground">{formatEST(new Date(s.scheduled_datetime), 'h:mm a')}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{s.athlete_name}</div>
                        </td>
                        <td className="py-3 px-4">{statusBadge(s.status)}</td>
                        <td className="py-3 px-4 text-right font-medium tabular-nums">${s.total_price.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#B89D60]/30 shadow-sm">
            <CardHeader className="pb-2 flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-[#B89D60] shrink-0" />
                  Recent sign-ups
                </CardTitle>
                <CardDescription>
                  Newest parent & coach accounts and youth wrestler profiles. Names show in the Name column; account email
                  or parent is on the right.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/users">All users</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-[#B89D60]"
                  onClick={() => handleNavChange('people', 'coaches')}
                >
                  Coaches list
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentSignups.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">No sign-ups to show.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-y border-border">
                      <tr>
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          When
                        </th>
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          Type
                        </th>
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          Name
                        </th>
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          Email / parent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentSignups.map((row) => (
                        <tr key={`${row.kind}-${row.id}`} className="hover:bg-muted/15 align-top">
                          <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground">
                            <span className="text-foreground">{formatEST(new Date(row.created_at), 'MMM d, yyyy')}</span>
                            <span className="block text-xs">{formatEST(new Date(row.created_at), 'h:mm a')}</span>
                          </td>
                          <td className="py-2.5 px-4">
                            <Badge variant="secondary" className="text-xs font-normal">
                              {row.kind === 'coach' ? 'Coach' : row.kind === 'parent' ? 'Parent' : 'Wrestler'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-foreground">{row.name}</div>
                            {row.kind === 'coach' && (
                              <Link
                                href={`/admin?section=people&sub=coaches&edit=${row.id}`}
                                className="text-xs text-[#B89D60] hover:underline"
                              >
                                Edit coach
                              </Link>
                            )}
                            {row.kind === 'parent' && (
                              <Link href="/admin/users" className="text-xs text-[#B89D60] hover:underline">
                                Users
                              </Link>
                            )}
                            {row.kind === 'youth_wrestler' && (
                              <Link href={`/wrestlers/${row.id}`} className="text-xs text-[#B89D60] hover:underline">
                                Wrestler profile
                              </Link>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-muted-foreground break-words max-w-md">
                            {row.kind === 'youth_wrestler' ? (
                              <div className="space-y-0.5">
                                <p>
                                  <span className="text-xs text-muted-foreground">Parent: </span>
                                  <span className="text-foreground/90">{row.parent_name}</span>
                                </p>
                                <p className="text-xs">{row.parent_email}</p>
                              </div>
                            ) : (
                              <span>{row.email}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // BOOKINGS SECTION
    if (section === 'bookings') {
      const allBulkSelected =
        bulkDeletableFilteredIds.length > 0 &&
        bulkDeletableFilteredIds.every((id) => bulkDeleteSelection.includes(id));
      const someBulkPartial =
        !allBulkSelected &&
        bulkDeletableFilteredIds.length > 0 &&
        bulkDeletableFilteredIds.some((id) => bulkDeleteSelection.includes(id));

      const handleBulkDeleteConfirm = async () => {
        const ids = [...bulkDeleteSelection];
        if (ids.length === 0) return;
        setBulkDeleteLoading(true);
        const failures: string[] = [];
        for (const id of ids) {
          const res = await fetch(`/api/admin/sessions/${id}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) failures.push(`${id.slice(0, 8)}…: ${data.error ?? res.statusText}`);
        }
        setBulkDeleteLoading(false);
        setBulkDeleteDialogOpen(false);
        setBulkDeleteSelection([]);
        router.refresh();
        if (failures.length > 0) {
          window.alert(
            `Deleted ${ids.length - failures.length} of ${ids.length} session(s).\n\nFailed:\n${failures.join('\n')}`
          );
        } else {
          window.alert(`Deleted ${ids.length} session(s).`);
        }
      };

      const handleSingleDeleteConfirm = async () => {
        if (!singleDeleteSession) return;
        setSingleDeleteLoading(true);
        try {
          const res = await fetch(`/api/admin/sessions/${singleDeleteSession.id}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            window.alert(data.error || 'Failed to delete session');
            return;
          }
          setSingleDeleteSession(null);
          router.refresh();
        } finally {
          setSingleDeleteLoading(false);
        }
      };

      const handleCancelSessionConfirm = async () => {
        if (!cancelSessionTarget) return;
        setCancelSessionLoading(true);
        try {
          const res = await fetch(`/api/sessions/${cancelSessionTarget.id}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ reason: 'Cancelled by admin' }),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          if (!res.ok) {
            window.alert(data.error || 'Failed to cancel session');
            return;
          }
          if (data.message) window.alert(data.message);
          setCancelSessionTarget(null);
          router.refresh();
        } finally {
          setCancelSessionLoading(false);
        }
      };

      const suggestedPayoutForSession = (s: AdminSession) =>
        coachPayoutUsd({
          athlete_payment: s.athlete_payment,
          price_per_participant: s.price_per_participant,
          current_participants: s.current_participants,
          participant_amount_paid_sum: s.participant_amount_paid_sum,
          session_payout_rate: s.session_payout_rate,
          coach_payout_rate: s.coach_payout_rate,
        });

      const handleCompleteSessionConfirm = async () => {
        if (!completeSessionTarget) return;
        const val = parseFloat(completePayoutAmount);
        if (Number.isNaN(val) || val < 0) {
          window.alert('Enter a valid coach payout amount.');
          return;
        }
        setCompleteSessionLoading(true);
        try {
          const completeRes = await fetch(`/api/sessions/${completeSessionTarget.id}/complete`, {
            method: 'POST',
            credentials: 'same-origin',
          });
          const completeData = (await completeRes.json().catch(() => ({}))) as { error?: string };
          if (!completeRes.ok) {
            window.alert(completeData.error || 'Failed to mark session complete');
            return;
          }

          const payoutRes = await fetch('/api/admin/record-session-payout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ sessionIds: [completeSessionTarget.id], amount: val }),
          });
          const payoutData = (await payoutRes.json().catch(() => ({}))) as { error?: string };
          if (!payoutRes.ok) {
            window.alert(
              payoutData.error ||
                'Session marked complete but payout was not recorded. Open Edit to record payout.'
            );
            return;
          }

          setCompleteSessionTarget(null);
          setCompletePayoutAmount('');
          router.refresh();
        } finally {
          setCompleteSessionLoading(false);
        }
      };

      return (
        <>
        <div className="space-y-6">
          {/* Header with Create Button */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Sessions</h2>
              <p className="text-sm text-muted-foreground">{filteredSessions.length} sessions found</p>
            </div>
            <Link href="/admin/sessions/create">
              <Button className="bg-[#B89D60] hover:bg-[#9A8550] text-black">
                <Plus className="h-4 w-4 mr-2" />
                Create Session
              </Button>
            </Link>
          </div>

          {/* Filters */}
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-3">
              <span className="font-medium text-foreground">Filters</span> apply to the table and to the summary totals below (same date range, status, and coach).
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={sessionDateFrom}
                  onChange={(e) => setSessionDateFrom(e.target.value)}
                  className="w-36 h-9 text-sm"
                  placeholder="From"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={sessionDateTo}
                  onChange={(e) => setSessionDateTo(e.target.value)}
                  className="w-36 h-9 text-sm"
                  placeholder="To"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Status</span>
              <Select value={sessionStatusFilter} onValueChange={(v) => setSessionStatusFilter(v as typeof sessionStatusFilter)}>
                <SelectTrigger className="w-[11rem] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open (upcoming)</SelectItem>
                  <SelectItem value="completed">Completed (past)</SelectItem>
                  <SelectItem value="cancelled_other">Cancelled/Other</SelectItem>
                </SelectContent>
              </Select>
              </div>

              <Select value={sessionCoachFilter} onValueChange={setSessionCoachFilter}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue placeholder="Coach" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All coaches</SelectItem>
                  {coachesForFilter.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-past-empty-open-sessions"
                  checked={showPastEmptyOpenSessions}
                  onCheckedChange={(c) => setShowPastEmptyOpenSessions(c === true)}
                  className="translate-y-0.5"
                />
                <label htmlFor="show-past-empty-open-sessions" className="text-xs text-muted-foreground cursor-pointer select-none max-w-[14rem] leading-snug">
                  Show past scheduled sessions with no bookings (cleanup / noise)
                </label>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={setPresetThisWeek}>This week</Button>
                <Button variant="outline" size="sm" onClick={setPresetNextWeek}>Next week</Button>
                <Button variant="ghost" size="sm" onClick={clearSessionFilters}>Clear</Button>
              </div>
            </div>
          </Card>

          {bulkDeleteSelection.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <span className="font-medium text-foreground">{bulkDeleteSelection.length} selected</span>
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete selected
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setBulkDeleteSelection([])}>
                Clear selection
              </Button>
            </div>
          )}

          {sessions.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Summary (matches filters above)
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <span className="text-muted-foreground">Bookings </span>
                  <span className="font-semibold tabular-nums text-foreground">{sessionListTotals.booked}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="font-semibold tabular-nums text-foreground">{sessionListTotals.capacity}</span>
                  <span className="text-muted-foreground"> spots</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Openings </span>
                  <span className="font-semibold tabular-nums text-foreground">{sessionListTotals.openings}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Collected </span>
                  <span className="font-semibold tabular-nums text-foreground">${sessionListTotals.collected.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground border-t border-border/60 mt-3 pt-3 leading-relaxed">
                <span className="font-medium text-foreground">Totals scope: </span>
                {sessionsTotalsScopeLabel}
                {sessionStatusFilter === 'all' ? (
                  <>
                    {' '}
                    · Empty past sessions still marked <span className="text-foreground font-medium">scheduled</span> are hidden by default; check the filter above to surface them for deletion.{' '}
                    Set Status to <span className="text-foreground font-medium">Open (upcoming)</span> for forward capacity, or{' '}
                    <span className="text-foreground font-medium">Completed (past)</span> for history.
                  </>
                ) : sessionStatusFilter === 'open' ? (
                  <> · Scheduled sessions from today&apos;s date forward (Eastern).</>
                ) : sessionStatusFilter === 'completed' ? (
                  <> · Past sessions only (collected is historical).</>
                ) : (
                  <> · Cancelled, no-show, and other non-open states.</>
                )}
              </p>
            </div>
          )}

          {/* Sessions Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-10 py-3 pl-3 pr-0 align-middle">
                      <Checkbox
                        checked={
                          bulkDeletableFilteredIds.length === 0
                            ? false
                            : allBulkSelected
                              ? true
                              : someBulkPartial
                                ? 'indeterminate'
                                : false
                        }
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            setBulkDeleteSelection([...bulkDeletableFilteredIds]);
                          } else {
                            setBulkDeleteSelection([]);
                          }
                        }}
                        disabled={bulkDeletableFilteredIds.length === 0}
                        aria-label="Select all sessions that can be deleted"
                        className="translate-y-0.5"
                      />
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date / Time</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Coach</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Facility</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Spots</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Collected</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Calendar className="h-8 w-8 text-muted-foreground/50" />
                          <p>No sessions found</p>
                          <p className="text-xs">Try adjusting your filters</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSessions.map((s) => {
                      const isInviteOnly = s.join_policy === 'invite_only';
                      const shareUrl = s.partner_invite_code
                        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${s.partner_invite_code}`
                        : null;
                      const handleCopy = async () => {
                        try {
                          if (isInviteOnly) {
                            // Fetch invite link from API for invite-only sessions
                            const res = await fetch(`/api/admin/sessions/${s.id}/invite-link`);
                            const data = await res.json();
                            if (data.inviteUrl) {
                              await navigator.clipboard.writeText(data.inviteUrl);
                              setCopiedSessionId(s.id);
                              setTimeout(() => setCopiedSessionId(null), 2000);
                            }
                          } else if (shareUrl) {
                            await navigator.clipboard.writeText(shareUrl);
                            setCopiedSessionId(s.id);
                            setTimeout(() => setCopiedSessionId(null), 2000);
                          }
                        } catch {
                          // Ignore errors
                        }
                      };
                      const canBulkDelete =
                        s.status === 'scheduled' || s.status === 'cancelled' || s.status === 'no-show';
                      return (
                        <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                          <td className="w-10 py-3 pl-3 pr-0 align-middle">
                            {canBulkDelete ? (
                              <Checkbox
                                checked={bulkDeleteSelection.includes(s.id)}
                                onCheckedChange={(checked) => {
                                  setBulkDeleteSelection((prev) =>
                                    checked === true
                                      ? [...new Set([...prev, s.id])]
                                      : prev.filter((x) => x !== s.id)
                                  );
                                }}
                                aria-label={`Select session ${formatEST(new Date(s.scheduled_datetime), 'MMM d, yyyy')}`}
                                className="translate-y-0.5"
                              />
                            ) : null}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium">{formatEST(new Date(s.scheduled_datetime), 'MMM d, yyyy')}</div>
                            <div className="text-xs text-muted-foreground">{formatEST(new Date(s.scheduled_datetime), 'h:mm a')}</div>
                          </td>
                          <td className="py-3 px-4">
                            <SessionTypeBadge sessionType={s.session_type} sessionMode={s.session_mode} />
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium">{s.athlete_name}</div>
                            <div className="text-xs text-muted-foreground">{s.athlete_school}</div>
                          </td>
                          <td className="py-3 px-4 text-sm">{s.facility_name}</td>
                          <td className="py-3 px-4">{statusBadge(s.status)}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => openRoster(s.id)}
                              className="hover:opacity-80 transition-opacity cursor-pointer"
                              title="View roster"
                            >
                              <CapacityBadge current={s.current_participants} max={s.max_participants ?? 1} label="" />
                            </button>
                          </td>
<td className="py-3 px-4 text-right font-medium tabular-nums">
                                <div className="flex items-center justify-end gap-1.5">
                                  <span>${s.participant_amount_paid_sum.toFixed(2)}</span>
                                  {(s.drop_in_count ?? 0) > 0 && (
                                    <span 
                                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold cursor-help"
                                      title={`${s.drop_in_count} drop-in${(s.drop_in_count ?? 0) > 1 ? 's' : ''}: $${(s.drop_in_amount ?? 0).toFixed(2)}`}
                                    >
                                      $
                                    </span>
                                  )}
                                </div>
                              </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {shareUrl && (
                                <Button variant="ghost" size="sm" className="h-8" onClick={handleCopy} title="Copy share link">
                                  {copiedSessionId === s.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8" 
                                onClick={() => handleDuplicateSession(s)}
                                disabled={duplicatingSessionId === s.id}
                                title="Duplicate session (next week)"
                              >
                                {duplicatingSessionId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
                              </Button>
                              {showSessionSmsCopyAndTextGroup(s) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => setTextGroupAdminSession(s)}
                                >
                                  <Smartphone className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8"
                                onClick={() => openDropInDialog(s)}
                                title="Record drop-in payment"
                              >
                                <DollarSign className="h-3.5 w-3.5" />
                              </Button>
                              {s.status === 'scheduled' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                  title="Close session — mark complete and pay coach"
                                  aria-label={`Close session ${formatEST(new Date(s.scheduled_datetime), 'MMM d, yyyy h:mm a')}`}
                                  onClick={() => {
                                    setCompletePayoutAmount(suggestedPayoutForSession(s).toFixed(2));
                                    setCompleteSessionTarget(s);
                                  }}
                                >
                                  <CircleCheck className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {s.status === 'scheduled' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                  title="Cancel session — wallet credit for paid bookings"
                                  aria-label={`Cancel session ${formatEST(new Date(s.scheduled_datetime), 'MMM d, yyyy h:mm a')}`}
                                  onClick={() => setCancelSessionTarget(s)}
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-[#B89D60]"
                                title="Edit session details"
                                asChild
                              >
                                <Link href={`/admin/sessions/${s.id}/edit`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                              {canBulkDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete session permanently"
                                  aria-label={`Delete session ${formatEST(new Date(s.scheduled_datetime), 'MMM d, yyyy h:mm a')}`}
                                  onClick={() => setSingleDeleteSession(s)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-muted-foreground px-1">
            Mark open sessions with the check icon — enter coach payout and close in one step. Cancel with the ban icon to
            issue wallet credit for paid bookings. Delete scheduled, cancelled, or no-show sessions with the row trash
            icon or checkboxes for bulk delete. Completed sessions are not deletable here. Coaches cannot delete sessions
            that already have paid registrations (cancel those first).
          </p>
        </div>

        <Dialog
          open={!!singleDeleteSession}
          onOpenChange={(open) => {
            if (!open && !singleDeleteLoading) setSingleDeleteSession(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this session?</DialogTitle>
              <DialogDescription>
                {singleDeleteSession ? (
                  <>
                    <span className="block text-foreground font-medium">
                      {formatEST(new Date(singleDeleteSession.scheduled_datetime), 'EEE MMM d, yyyy · h:mm a')}
                    </span>
                    <span className="block mt-1">
                      {singleDeleteSession.athlete_name} · {singleDeleteSession.facility_name}
                    </span>
                    <span className="block mt-2">
                      This permanently removes the session and participant rows. It cannot be undone.
                    </span>
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSingleDeleteSession(null)}
                disabled={singleDeleteLoading}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleSingleDeleteConfirm()} disabled={singleDeleteLoading}>
                {singleDeleteLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Deleting…
                  </>
                ) : (
                  'Delete'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!completeSessionTarget}
          onOpenChange={(open) => {
            if (!open && !completeSessionLoading) {
              setCompleteSessionTarget(null);
              setCompletePayoutAmount('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Close session &amp; pay coach</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground pt-1">
                  {completeSessionTarget ? (
                    <>
                      <p>
                        <span className="block text-foreground font-medium">
                          {formatEST(new Date(completeSessionTarget.scheduled_datetime), 'EEE MMM d, yyyy · h:mm a')}
                        </span>
                        <span className="block mt-1">
                          {completeSessionTarget.athlete_name} · {completeSessionTarget.facility_name}
                        </span>
                      </p>
                      <p>
                        Collected ${completeSessionTarget.participant_amount_paid_sum.toFixed(2)} · suggested coach share{' '}
                        {(
                          resolveCoachPayoutRate({
                            session_payout_rate: completeSessionTarget.session_payout_rate,
                            coach_payout_rate: completeSessionTarget.coach_payout_rate,
                          }) * 100
                        ).toFixed(1)}
                        %
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="complete-payout-amount" className="text-foreground">
                          Coach payout ($)
                        </Label>
                        <Input
                          id="complete-payout-amount"
                          type="number"
                          min={0}
                          step={0.01}
                          value={completePayoutAmount}
                          onChange={(e) => setCompletePayoutAmount(e.target.value)}
                          className="max-w-[160px]"
                        />
                      </div>
                      <p className="text-xs">
                        Marks the session complete and records what you paid the coach. To cancel instead (refund families),
                        use the ban icon on the list.
                      </p>
                    </>
                  ) : null}
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCompleteSessionTarget(null);
                  setCompletePayoutAmount('');
                }}
                disabled={completeSessionLoading}
              >
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => void handleCompleteSessionConfirm()}
                disabled={completeSessionLoading || completePayoutAmount.trim() === ''}
              >
                {completeSessionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving…
                  </>
                ) : (
                  'Close & record payout'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!cancelSessionTarget}
          onOpenChange={(open) => {
            if (!open && !cancelSessionLoading) setCancelSessionTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel this session?</DialogTitle>
              <DialogDescription>
                {cancelSessionTarget ? (
                  <>
                    <span className="block text-foreground font-medium">
                      {formatEST(new Date(cancelSessionTarget.scheduled_datetime), 'EEE MMM d, yyyy · h:mm a')}
                    </span>
                    <span className="block mt-1">
                      {cancelSessionTarget.athlete_name} · {cancelSessionTarget.facility_name}
                    </span>
                    <span className="block mt-2">
                      Families with paid spots receive wallet credit automatically. The session will show as cancelled;
                      you can delete it afterward if you want it removed from lists.
                    </span>
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCancelSessionTarget(null)}
                disabled={cancelSessionLoading}
              >
                Close
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => void handleCancelSessionConfirm()}
                disabled={cancelSessionLoading}
              >
                {cancelSessionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Cancelling…
                  </>
                ) : (
                  'Cancel session'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {bulkDeleteSelection.length} session(s)?</DialogTitle>
              <DialogDescription>
                This permanently removes the selected sessions and their participant rows.                 Completed sessions cannot be
                deleted here. Coaches can only delete sessions with no paid registrations (unpaid placeholders are
                removed). This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkDeleteDialogOpen(false)} disabled={bulkDeleteLoading}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleBulkDeleteConfirm()} disabled={bulkDeleteLoading}>
                {bulkDeleteLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Deleting…
                  </>
                ) : (
                  'Delete'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
      );
    }

    // MONEY SECTION
    if (section === 'money') {
      // Payouts sub-section
      if (subSection === 'payouts') {
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Coach payouts</h2>
              <p className="text-sm text-muted-foreground">
                Pay coaches outside the app (Venmo, Zelle, etc.), then mark paid here. History lists every session
                already marked paid.
              </p>
            </div>

            <Tabs value={payoutTab} onValueChange={(v) => setPayoutTab(v as 'pending' | 'history')} className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="pending" className="gap-2">
                  <Wallet className="h-4 w-4" />
                  Pending
                  {coachPayouts.filter((p) => p.amount > 0).length > 0 && (
                    <span className="ml-1 rounded-full bg-[#B89D60]/25 px-2 py-0.5 text-xs">
                      {coachPayouts.filter((p) => p.amount > 0).length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2">
                  <History className="h-4 w-4" />
                  History
                  {paidSessionsCount > 0 && (
                    <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{paidSessionsCount}</span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total due</p>
                    <p className="text-2xl font-semibold text-[#B89D60]">${totalCoachPayoutsDue.toFixed(2)}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Coaches to pay</p>
                    <p className="text-2xl font-semibold">{coachPayouts.filter((p) => p.amount > 0).length}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Completed sessions (all)</p>
                    <p className="text-2xl font-semibold">{billing.completedCount}</p>
                  </Card>
                </div>

                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Coach
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            School
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Payment info
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {coachPayouts.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-muted-foreground">
                              <Wallet className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                              <p>No payouts due</p>
                              <p className="text-xs mt-2 max-w-sm mx-auto">
                                Completed sessions with no payout date appear here. Mark sessions complete first, then
                                pay the coach and click Mark paid.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          coachPayouts.map((p) => (
                            <tr key={p.athlete_id} className="hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4 font-medium">{p.name}</td>
                              <td className="py-3 px-4 text-muted-foreground">{p.school}</td>
                              <td className="py-3 px-4">
                                {p.venmo_handle && (
                                  <div className="flex items-center gap-1 text-sm">
                                    <span className="text-muted-foreground">Venmo:</span>
                                    <span className="font-medium">{p.venmo_handle}</span>
                                  </div>
                                )}
                                {p.zelle_email && (
                                  <div className="flex items-center gap-1 text-sm">
                                    <span className="text-muted-foreground">Zelle:</span>
                                    <span className="font-medium">{p.zelle_email}</span>
                                  </div>
                                )}
                                {!p.venmo_handle && !p.zelle_email && (
                                  <span className="text-muted-foreground text-xs">No payment info</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="w-24 h-8 text-right ml-auto"
                                  value={payoutTotalByAthlete[p.athlete_id] ?? p.amount.toFixed(2)}
                                  onChange={(e) =>
                                    setPayoutTotalByAthlete((prev) => ({
                                      ...prev,
                                      [p.athlete_id]: e.target.value,
                                    }))
                                  }
                                />
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Button
                                  size="sm"
                                  className="bg-[#B89D60] hover:bg-[#9A8550] text-black h-8"
                                  disabled={markingAthleteId === p.athlete_id}
                                  onClick={async () => {
                                    setMarkingAthleteId(p.athlete_id);
                                    const amount = parseFloat(
                                      payoutTotalByAthlete[p.athlete_id] || p.amount.toString()
                                    );
                                    try {
                                      const res = await fetch('/api/admin/mark-payout-paid', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ athlete_id: p.athlete_id, amount }),
                                      });
                                      if (res.ok) router.refresh();
                                      else {
                                        const data = await res.json().catch(() => ({}));
                                        alert(data.error || 'Could not mark payout paid');
                                      }
                                    } finally {
                                      setMarkingAthleteId(null);
                                    }
                                  }}
                                >
                                  {markingAthleteId === p.athlete_id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    'Mark paid'
                                  )}
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="mt-6 space-y-4">
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                    <div className="lg:col-span-3">
                      <Label className="text-xs text-muted-foreground">Time period</Label>
                      <Select
                        value={payoutHistoryPeriod}
                        onValueChange={(v) => setPayoutHistoryPeriod(v as PayoutHistoryPeriodPreset)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All time</SelectItem>
                          <SelectItem value="week">This week</SelectItem>
                          <SelectItem value="month">This month</SelectItem>
                          <SelectItem value="last30">Last 30 days</SelectItem>
                          <SelectItem value="ytd">Year to date</SelectItem>
                          <SelectItem value="custom">Custom range…</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                        Filter by payout date (when marked paid). Week starts Sunday ({APP_TIMEZONE}).
                      </p>
                    </div>
                    {payoutHistoryPeriod === 'custom' && (
                      <>
                        <div className="lg:col-span-2">
                          <Label className="text-xs text-muted-foreground">Payout date from</Label>
                          <Input
                            type="date"
                            className="mt-1"
                            value={historyPayoutFrom}
                            onChange={(e) => setHistoryPayoutFrom(e.target.value)}
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <Label className="text-xs text-muted-foreground">Payout date to</Label>
                          <Input
                            type="date"
                            className="mt-1"
                            value={historyPayoutTo}
                            onChange={(e) => setHistoryPayoutTo(e.target.value)}
                          />
                        </div>
                      </>
                    )}
                    <div className="lg:col-span-2">
                      <Label className="text-xs text-muted-foreground">Coach</Label>
                      <Select value={historyCoachFilter} onValueChange={setHistoryCoachFilter}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="All coaches" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All coaches</SelectItem>
                          {payoutHistoryCoachOptions.map(([id, name]) => (
                            <SelectItem key={id} value={id}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="lg:col-span-2">
                      <Label className="text-xs text-muted-foreground">Search coach</Label>
                      <Input
                        className="mt-1"
                        placeholder="Name…"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                      />
                    </div>
                    <div className="lg:col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-6 lg:mt-0"
                        onClick={() => {
                          setPayoutHistoryPeriod('all');
                          setHistoryCoachFilter('all');
                          setHistoryPayoutFrom('');
                          setHistoryPayoutTo('');
                          setHistorySearch('');
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Filtered total</p>
                    <p className="text-2xl font-semibold tabular-nums">${payoutHistoryTotal.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {payoutHistoryRows.length} session row(s) · matches detail table below
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">All-time paid sessions</p>
                    <p className="text-2xl font-semibold">{paidSessionsCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">Sessions with a payout date set (not filtered)</p>
                  </Card>
                </div>

                <Card className="overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <h3 className="text-sm font-semibold">Totals by coach</h3>
                    <p className="text-xs text-muted-foreground">
                      Same time period and coach/search filters as below. Grand total ${payoutByCoachGrandTotal.toFixed(2)}.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Coach
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            School
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Sessions
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Total paid
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {payoutByCoachRows.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
                              No payouts in this period for the current filters.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {payoutByCoachRows.map((row) => (
                              <tr key={row.athlete_id} className="hover:bg-muted/30">
                                <td className="py-3 px-4 font-medium">{row.name}</td>
                                <td className="py-3 px-4 text-muted-foreground">{row.school}</td>
                                <td className="py-3 px-4 text-right tabular-nums">{row.sessionCount}</td>
                                <td className="py-3 px-4 text-right tabular-nums font-medium">
                                  ${row.total.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-muted/40 font-medium">
                              <td className="py-3 px-4" colSpan={2}>
                                Total
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums">
                                {payoutByCoachRows.reduce((s, r) => s + r.sessionCount, 0)}
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums">
                                ${payoutByCoachGrandTotal.toFixed(2)}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Paid date
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Coach
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            School
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Session
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {payoutHistoryRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-muted-foreground">
                              <History className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                              <p>No payout history matches the filters</p>
                              <p className="text-xs mt-2 max-w-md mx-auto">
                                Rows appear after you mark a coach paid on the Pending tab. Adjust filters or clear them
                                to see all recorded payouts.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          payoutHistoryRows.map(({ session: s, payoutAmount }) => (
                            <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                                {(s.athlete_payout_date || '').slice(0, 10) || '—'}
                              </td>
                              <td className="py-3 px-4 font-medium">{s.athlete_name}</td>
                              <td className="py-3 px-4 text-muted-foreground">{s.athlete_school}</td>
                              <td className="py-3 px-4">
                                <div className="text-muted-foreground text-xs">
                                  {formatEST(new Date(s.scheduled_datetime), 'MMM d, yyyy h:mm a')}
                                </div>
                                <div className="text-xs text-muted-foreground/80 truncate max-w-[200px]">
                                  {s.facility_name}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums font-medium">
                                ${payoutAmount.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Link href={`/admin/sessions/${s.id}/edit`}>
                                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-[#B89D60]">
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                  </Button>
                                </Link>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        );
      }

      // Credits sub-section
      if (subSection === 'credits') {
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Parent Credits</h2>
              <p className="text-sm text-muted-foreground">View and manage credit balances</p>
            </div>

            <Card className="border-[#B89D60]/30 bg-[#B89D60]/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gift className="h-4 w-4 text-[#B89D60]" />
                  RecruitNC → Guild credits
                </CardTitle>
                <CardDescription>
                  Fundraising dollars moved into Guild wallet. New grants use source <span className="font-mono text-xs">recruitnc_transfer</span>;
                  legacy rows match <span className="font-mono text-xs">[recruitnc_allocation:…]</span> in description.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Grant rows</dt>
                    <dd className="font-semibold tabular-nums">{recruitNcCreditTotals.grantRows}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Total granted</dt>
                    <dd className="font-semibold tabular-nums">${recruitNcCreditTotals.totalGrantedUsd.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Spent at checkout</dt>
                    <dd className="font-semibold tabular-nums text-emerald-700">
                      ${recruitNcCreditTotals.spentAtCheckoutUsd.toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Remaining in wallets</dt>
                    <dd className="font-semibold tabular-nums text-[#B89D60]">
                      ${recruitNcCreditTotals.remainingInWalletsUsd.toFixed(2)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Parent</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Source</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Original</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Remaining</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {credits.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-muted-foreground">
                          <CreditCard className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>No credits found</p>
                        </td>
                      </tr>
                    ) : (
                      credits.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-medium">{c.parent_email}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">{c.source}</Badge>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums">${c.amount.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right tabular-nums font-medium text-[#B89D60]">${c.remaining.toFixed(2)}</td>
                          <td className="py-3 px-4 text-muted-foreground">{formatEST(new Date(c.created_at), 'MMM d, yyyy')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
      }

      // Messages sub-section
      if (subSection === 'messages') {
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/message-log">Full-page log</Link>
              </Button>
            </div>
            <AdminMessageLogSection />
          </div>
        );
      }

      // Default: Payments overview with filters
      return (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#B89D60]/10">
                <DollarSign className="h-5 w-5 text-[#B89D60]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Financial Overview</h2>
                <p className="text-sm text-muted-foreground">Guild revenue, coach payouts, and open bookings</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSubSection('payouts')}
              >
                <Wallet className="h-4 w-4 mr-2" />
                Process Payouts
                {totalCoachPayoutsDue > 0 && (
                  <Badge className="ml-2 bg-[#B89D60]/20 text-[#B89D60]">${totalCoachPayoutsDue.toFixed(0)}</Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase">Time:</span>
                <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1">
                  {(['all', '7d', '30d', '90d', 'ytd'] as const).map((period) => (
                    <button
                      key={period}
                      onClick={() => setFinanceTimeFilter(period)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        financeTimeFilter === period
                          ? 'bg-[#B89D60] text-black'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {period === 'all' ? 'All Time' : period === 'ytd' ? 'YTD' : period}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase">Type:</span>
                <Select value={financeTypeFilter} onValueChange={setFinanceTypeFilter}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {sessionTypesForFilter.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase">School:</span>
                <Select value={financeSchoolFilter} onValueChange={setFinanceSchoolFilter}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder="All schools" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Schools</SelectItem>
                    <SelectItem value="non-affiliated">Non-Affiliated</SelectItem>
                    {uniqueSchools.map((school) => (
                      <SelectItem key={school} value={school}>{school}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(financeTimeFilter !== 'all' || financeTypeFilter !== 'all' || financeSchoolFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setFinanceTimeFilter('all');
                    setFinanceTypeFilter('all');
                    setFinanceSchoolFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </Card>

          {/* Financial Summary */}
          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Revenue Breakdown</h3>
            <div className="space-y-4">
              {/* Gross Revenue */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-[#B89D60]" />
                  <div>
                    <p className="font-medium">Gross Revenue</p>
                    <p className="text-xs text-muted-foreground">Total collected from parents (Stripe + Cash)</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">${financeData.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>Stripe: ${financeData.stripeRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {financeData.cashRevenue > 0 && (
                      <span className="text-emerald-500">Cash: ${financeData.cashRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Coach Payouts */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div className="flex items-center gap-3">
                  <Wallet className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium">Coach Payouts</p>
                    <p className="text-xs text-muted-foreground">Recorded payments to coaches (athlete_payment)</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-blue-400">-${financeData.coachPayouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>

              {/* Guild Net */}
              <div className="flex items-center justify-between py-2 border-b border-border bg-emerald-500/5 -mx-6 px-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="font-medium">Guild Net</p>
                    <p className="text-xs text-muted-foreground">Gross Revenue - Coach Payouts</p>
                  </div>
                </div>
                <p className={`text-xl font-bold ${financeData.guildNet >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  ${financeData.guildNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              {/* Stripe Fees (Estimated) */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-red-400" />
                  <div>
                    <p className="font-medium">Stripe Fees <span className="text-xs text-amber-500 ml-1">(estimated)</span></p>
                    <p className="text-xs text-muted-foreground">~2.9% + $0.30 per transaction on Stripe payments</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-red-400">-${financeData.stripeFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>

              {/* Guild Profit */}
              <div className="flex items-center justify-between py-3 bg-[#B89D60]/10 -mx-6 px-6 rounded-b-lg">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-[#B89D60]" />
                  <div>
                    <p className="font-semibold">Guild Profit</p>
                    <p className="text-xs text-muted-foreground">Guild Net - Stripe Fees (estimated)</p>
                  </div>
                </div>
                <p className={`text-2xl font-bold ${financeData.guildProfit >= 0 ? 'text-[#B89D60]' : 'text-red-500'}`}>
                  ${financeData.guildProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </Card>

          {/* Bookings Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Bookings</p>
              <p className="text-xl font-semibold mt-1 text-emerald-500">{financeData.openBookings}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completed</p>
              <p className="text-xl font-semibold mt-1">{financeData.completedSessions}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Incomplete checkout</p>
              <p className="text-xl font-semibold mt-1 text-amber-500">{financeData.pendingPayment}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cancelled</p>
              <p className="text-xl font-semibold mt-1 text-muted-foreground">{financeData.cancelledSessions}</p>
            </Card>
          </div>

          {/* Revenue Breakdown by Coach */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Revenue by Coach</CardTitle>
              <CardDescription>Top performers based on current filters</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Coach</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">School</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Sessions</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Open</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Revenue</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Coach Payout</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Guild Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {financeData.coachBreakdown.length === 0 ? (
                      <tr>
<td colSpan={8} className="py-12 text-center text-muted-foreground">
                          <DollarSign className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>No financial data for selected filters</p>
                        </td>
                      </tr>
                    ) : (
                      financeData.coachBreakdown.slice(0, 10).map((coach, idx) => (
                        <tr key={coach.athlete_id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {idx < 3 && (
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                                  idx === 0 ? 'bg-[#B89D60] text-black' :
                                  idx === 1 ? 'bg-gray-400 text-black' :
                                  'bg-amber-700 text-white'
                                }`}>
                                  {idx + 1}
                                </div>
                              )}
                              <span className="font-medium">{coach.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{coach.school}</td>
                          <td className="py-3 px-4 text-center tabular-nums">{coach.sessions}</td>
                          <td className="py-3 px-4 text-center">
                            {coach.open > 0 ? (
                              <Badge variant="outline" className="border-emerald-600 bg-emerald-600/20 text-emerald-400">{coach.open}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-medium">
                            ${coach.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-blue-400">
                            ${coach.payout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#B89D60]">
                            ${(coach.revenue - coach.payout).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {financeData.coachBreakdown.length > 0 && (
                    <tfoot className="border-t-2 border-border bg-muted/30">
                      <tr className="font-semibold">
                        <td className="py-3 px-4" colSpan={2}>Total ({financeData.coachBreakdown.length} coaches)</td>
                        <td className="py-3 px-4 text-center tabular-nums">{financeData.completedSessions + financeData.pendingPayment}</td>
                        <td className="py-3 px-4 text-center tabular-nums">{financeData.openBookings}</td>
                        <td className="py-3 px-4 text-right tabular-nums">${financeData.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-blue-400">${financeData.coachPayouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-[#B89D60]">${financeData.guildNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button 
              variant="outline" 
              className="h-auto p-4 justify-start"
              onClick={() => setSubSection('payouts')}
            >
              <Wallet className="h-5 w-5 mr-3 text-[#B89D60]" />
              <div className="text-left">
                <div className="font-medium">Process Coach Payouts</div>
                <div className="text-xs text-muted-foreground">{coachPayouts.filter(p => p.amount > 0).length} coaches awaiting payment</div>
              </div>
              {totalCoachPayoutsDue > 0 && (
                <Badge className="ml-auto bg-[#B89D60]/20 text-[#B89D60]">${totalCoachPayoutsDue.toFixed(0)}</Badge>
              )}
            </Button>
            <Button 
              variant="outline" 
              className="h-auto p-4 justify-start"
              onClick={() => setSubSection('credits')}
            >
              <CreditCard className="h-5 w-5 mr-3 text-blue-500" />
              <div className="text-left">
                <div className="font-medium">Parent Credits</div>
                <div className="text-xs text-muted-foreground">{credits.filter(c => c.remaining > 0).length} active credits</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto p-4 justify-start"
              onClick={() => setSubSection('messages')}
            >
              <MessageSquare className="h-5 w-5 mr-3 text-purple-500" />
              <div className="text-left">
                <div className="font-medium">Message Log</div>
                <div className="text-xs text-muted-foreground">SMS &amp; notifications sent</div>
              </div>
            </Button>
          </div>
        </div>
      );
    }

    // PEOPLE SECTION
    if (section === 'people') {
      if (subSection === 'coach_week') {
        const coachIdx = coachesScheduleList.findIndex((c) => c.athlete_id === coachScheduleCoachId);
        const prevCoachId = coachIdx > 0 ? coachesScheduleList[coachIdx - 1]?.athlete_id : null;
        const nextCoachId =
          coachIdx >= 0 && coachIdx < coachesScheduleList.length - 1
            ? coachesScheduleList[coachIdx + 1]?.athlete_id
            : null;
        const shiftCoachWeek = (deltaWeek: number) => {
          const z = toZonedTime(parseISO(`${coachWeekStartYmd}T12:00:00`), APP_TIMEZONE);
          const shifted = addWeeks(z, deltaWeek);
          const ws = startOfWeek(shifted, { weekStartsOn: 0 });
          setCoachWeekStartYmd(formatInTimeZone(ws, APP_TIMEZONE, 'yyyy-MM-dd'));
        };
        const goThisWeek = () => {
          const z = toZonedTime(new Date(), APP_TIMEZONE);
          setCoachWeekStartYmd(
            formatInTimeZone(startOfWeek(z, { weekStartsOn: 0 }), APP_TIMEZONE, 'yyyy-MM-dd')
          );
        };
        const selectedCoach = coachesScheduleList.find((c) => c.athlete_id === coachScheduleCoachId);
        const weekRangeLabel = `${coachWeekModel.days[0].label} – ${coachWeekModel.days[6].label}`;
        const todayYmdMaster = formatInTimeZone(new Date(), APP_TIMEZONE, 'yyyy-MM-dd');

        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#B89D60]/10">
                  <CalendarDays className="h-5 w-5 text-[#B89D60]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Coach calendar</h2>
                  <p className="text-sm text-muted-foreground">
                    Eastern week · open availability vs booked sessions · any session card opens the editor
                  </p>
                </div>
              </div>
            </div>

            <Tabs value={coachCalendarTab} onValueChange={(v) => setCoachCalendarTab(v as 'all' | 'one')}>
              <TabsList className="grid w-full max-w-lg grid-cols-2 h-11">
                <TabsTrigger value="all" className="text-sm">
                  All coaches
                </TabsTrigger>
                <TabsTrigger value="one" className="text-sm">
                  One coach
                </TabsTrigger>
              </TabsList>

              <Card className="mt-4 p-4 space-y-4 border-border/80 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => shiftCoachWeek(-1)}
                      aria-label="Previous week"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="secondary" size="sm" className="min-h-[40px]" onClick={goThisWeek}>
                      This week
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => shiftCoachWeek(1)}
                      aria-label="Next week"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-semibold text-foreground tabular-nums px-1">{weekRangeLabel}</span>
                  </div>
                  {coachCalendarTab === 'one' ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-1 sm:max-w-md">
                        <span className="text-xs font-medium text-muted-foreground uppercase shrink-0">Coach</span>
                        <Select
                          value={coachScheduleCoachId || undefined}
                          onValueChange={(v) => setCoachScheduleCoachId(v)}
                        >
                          <SelectTrigger className="min-h-[40px] w-full sm:min-w-[220px]">
                            <SelectValue placeholder="Select coach" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[min(60vh,320px)]">
                            {coachesScheduleList.map((c) => (
                              <SelectItem key={c.athlete_id} value={c.athlete_id}>
                                {c.athlete_name}
                                {c.school ? ` · ${c.school}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-[40px] min-w-[40px] px-2"
                          disabled={!prevCoachId}
                          onClick={() => prevCoachId && setCoachScheduleCoachId(prevCoachId)}
                          aria-label="Previous coach"
                          title="Previous coach"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-[40px] min-w-[40px] px-2"
                          disabled={!nextCoachId}
                          onClick={() => nextCoachId && setCoachScheduleCoachId(nextCoachId)}
                          aria-label="Next coach"
                          title="Next coach"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        {selectedCoach ? (
                          <Link href={`/athlete/${selectedCoach.athlete_id}`} target="_blank" rel="noopener noreferrer">
                            <Button type="button" variant="ghost" size="sm" className="min-h-[40px] text-[#B89D60]">
                              Profile
                              <ExternalLink className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>

              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-sky-500/80" aria-hidden />
                  Open availability
                </span>
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#B89D60]" aria-hidden />
                  Booked session → edit
                </span>
              </div>

              <TabsContent value="all" className="mt-4 space-y-4 outline-none">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Filter coaches by name or school…"
                      value={masterCoachFilter}
                      onChange={(e) => setMasterCoachFilter(e.target.value)}
                      className="h-10 pl-9"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground sm:ml-auto tabular-nums">
                    {masterCoachesFiltered.length} coach{masterCoachesFiltered.length === 1 ? '' : 'es'}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border bg-card/40 shadow-sm">
                  <table className="w-full text-sm min-w-[980px] border-collapse">
                    <thead>
                      <tr className="bg-muted/60 border-b border-border">
                        <th className="text-left py-3 px-3 sticky left-0 z-30 bg-muted/95 backdrop-blur-sm min-w-[152px] w-[152px] border-r border-border/80 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Coach
                        </th>
                        {coachWeekModel.days.map((day) => {
                          const isToday = todayYmdMaster === day.ymd;
                          return (
                            <th
                              key={day.ymd}
                              className={`py-3 px-2 text-center align-bottom font-medium border-l border-border/40 min-w-[130px] ${
                                isToday ? 'bg-[#B89D60]/15 text-[#B89D60]' : ''
                              }`}
                            >
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{day.dow}</div>
                              <div className="text-sm tabular-nums text-foreground">
                                {formatEST(`${day.ymd}T12:00:00`, 'MMM d')}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {masterCoachesFiltered.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-16 text-center text-muted-foreground text-sm">
                            No coaches match this filter.
                          </td>
                        </tr>
                      ) : (
                        masterCoachesFiltered.map((coach) => (
                          <tr key={coach.athlete_id} className="border-b border-border/50 hover:bg-muted/15">
                            <td className="py-2.5 px-3 sticky left-0 z-20 bg-card border-r border-border/80 align-top shadow-[4px_0_12px_-4px_rgba(0,0,0,0.25)]">
                              <div className="font-medium text-foreground leading-tight">{coach.athlete_name}</div>
                              {coach.school ? (
                                <div
                                  className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[136px]"
                                  title={coach.school}
                                >
                                  {coach.school}
                                </div>
                              ) : null}
                            </td>
                            {coachWeekModel.days.map((day) => {
                              const avail = masterWeekAvail[coach.athlete_id]?.[day.ymd];
                              const daySessions =
                                masterSessionsByCoachDay.get(`${coach.athlete_id}|${day.ymd}`) ?? [];
                              const isToday = todayYmdMaster === day.ymd;
                              return (
                                <td
                                  key={day.ymd}
                                  className={`align-top py-2 px-2 border-l border-border/30 min-w-[130px] ${
                                    isToday ? 'bg-[#B89D60]/5' : ''
                                  }`}
                                >
                                  <div className="rounded-lg overflow-hidden border border-sky-500/30 bg-sky-950/40 px-1.5 py-1.5 mb-1.5">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-sky-400/95 mb-1">
                                      Open
                                    </p>
                                    {masterWeekAvailLoading ? (
                                      <p className="text-[10px] text-muted-foreground animate-pulse">…</p>
                                    ) : !avail ? (
                                      <p className="text-[10px] text-muted-foreground">—</p>
                                    ) : avail.blocked ? (
                                      <p className="text-[10px] text-amber-500 font-medium leading-snug">Blocked</p>
                                    ) : avail.slots.length === 0 ? (
                                      <p className="text-[10px] text-muted-foreground">None</p>
                                    ) : (
                                      <ul className="text-[10px] text-sky-100/90 space-y-0.5 max-h-24 overflow-y-auto tabular-nums leading-snug">
                                        {avail.slots.map((slot) => (
                                          <li key={slot}>{formatSlotDisplay(slot)}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div className="rounded-lg overflow-hidden border border-[#B89D60]/40 bg-[#B89D60]/12 px-1.5 py-1.5">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#B89D60] mb-1">
                                      Booked
                                    </p>
                                    {daySessions.length === 0 ? (
                                      <p className="text-[10px] text-muted-foreground">—</p>
                                    ) : (
                                      <div className="flex flex-col gap-1">
                                        {daySessions.map((s) => (
                                          <Link
                                            key={s.id}
                                            href={`/admin/sessions/${s.id}/edit`}
                                            className="block rounded border border-[#B89D60]/30 bg-background/95 px-1.5 py-1 text-[10px] leading-snug hover:border-[#B89D60]/70 hover:bg-[#B89D60]/15 transition-colors"
                                          >
                                            <span className="font-semibold tabular-nums text-foreground">
                                              {formatEST(new Date(s.scheduled_datetime), 'h:mm a')}
                                            </span>
                                            <span
                                              className="text-muted-foreground truncate block mt-0.5"
                                              title={s.facility_name}
                                            >
                                              {s.facility_name}
                                            </span>
                                          </Link>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="one" className="mt-4 space-y-4 outline-none">
                {!coachScheduleCoachId ? (
                  <p className="text-sm text-muted-foreground">Choose a coach in the bar above.</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">{selectedCoach?.athlete_name ?? 'Coach'}</span>
                      <span className="text-muted-foreground"> · detailed day columns</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                      {coachWeekModel.days.map((day) => {
                        const daySessions = coachWeekByDay.get(day.ymd) ?? [];
                        const isToday = todayYmdMaster === day.ymd;
                        const avail = coachWeekAvailByDay[day.ymd];
                        return (
                          <div
                            key={day.ymd}
                            className={`rounded-xl border overflow-hidden flex flex-col min-h-[168px] ${
                              isToday ? 'border-[#B89D60]/55 ring-1 ring-[#B89D60]/25' : 'border-border bg-card/20'
                            }`}
                          >
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 px-2 py-1.5 border-b border-border/60">
                              <span className={isToday ? 'text-[#B89D60]' : ''}>{day.dow}</span>
                              <span className="font-normal text-foreground/90 ml-1 tabular-nums">
                                {formatEST(`${day.ymd}T12:00:00`, 'MMM d')}
                              </span>
                            </div>
                            <div className="flex flex-col flex-1 min-h-0">
                              <div className="flex-1 border-b border-sky-500/20 bg-sky-950/35 px-2 py-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400 mb-1.5">
                                  Open availability
                                </p>
                                {coachWeekAvailLoading ? (
                                  <p className="text-[10px] text-muted-foreground animate-pulse">Loading…</p>
                                ) : !avail ? (
                                  <p className="text-[10px] text-muted-foreground">—</p>
                                ) : avail.blocked ? (
                                  <p className="text-[10px] text-amber-500 font-medium">Blocked (day off)</p>
                                ) : avail.slots.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground">None published</p>
                                ) : (
                                  <ul className="text-[10px] text-sky-100/90 space-y-0.5 max-h-32 overflow-y-auto tabular-nums">
                                    {avail.slots.map((slot) => (
                                      <li key={slot}>{formatSlotDisplay(slot)}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="flex-1 bg-[#B89D60]/10 px-2 py-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#B89D60] mb-1.5">
                                  Booked sessions
                                </p>
                                {daySessions.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground">—</p>
                                ) : (
                                  <div className="flex flex-col gap-1.5">
                                    {daySessions.map((s) => (
                                      <Link
                                        key={s.id}
                                        href={`/admin/sessions/${s.id}/edit`}
                                        className="block rounded-lg border border-[#B89D60]/35 bg-background/90 px-2 py-1.5 text-xs hover:border-[#B89D60]/70 hover:bg-[#B89D60]/10 transition-colors"
                                      >
                                        <div className="font-semibold tabular-nums text-foreground">
                                          {formatEST(new Date(s.scheduled_datetime), 'h:mm a')}
                                        </div>
                                        <div className="text-muted-foreground truncate text-[11px]" title={s.facility_name}>
                                          {s.facility_name}
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                          <SessionTypeBadge sessionType={s.session_type} sessionMode={s.session_mode} />
                                          {statusBadge(s.status)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                          {confirmedRosterCountForAdminList(s)}/{s.max_participants ?? 1} booked
                                        </div>
                                      </Link>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        );
      }

      // Coaches Leaderboard sub-section
      if (subSection === 'coaches') {
        const totalOpenBookings = leaderboardData.reduce((sum, c) => sum + c.open_count, 0);
        const totalPendingPayment = leaderboardData.reduce((sum, c) => sum + c.pending_payment_count, 0);
        const totalEarnings = leaderboardData.reduce((sum, c) => sum + c.total_earnings, 0);

        return (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#B89D60]/10">
                  <Trophy className="h-5 w-5 text-[#B89D60]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Coach Leaderboard</h2>
                  <p className="text-sm text-muted-foreground">{leaderboardData.length} coaches</p>
                </div>
              </div>
              <Link
                href="/admin/program-report"
                className="text-sm font-medium text-[#B89D60] hover:underline inline-flex items-center gap-1 shrink-0"
              >
                Program report (print / PDF)
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Earnings</p>
                <p className="text-xl font-semibold mt-1 text-[#B89D60]">${totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Bookings</p>
                <p className="text-xl font-semibold mt-1">{totalOpenBookings}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Incomplete checkout</p>
                <p className="text-xl font-semibold mt-1 text-amber-500">{totalPendingPayment}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Coaches</p>
                <p className="text-xl font-semibold mt-1">{leaderboardData.filter(c => c.open_count > 0).length}</p>
              </Card>
            </div>

            {/* Filters */}
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase">Time:</span>
                  <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1">
                    {(['all', '7d', '30d', '90d'] as const).map((period) => (
                      <button
                        key={period}
                        onClick={() => setLeaderboardTimeFilter(period)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          leaderboardTimeFilter === period
                            ? 'bg-[#B89D60] text-black'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {period === 'all' ? 'All Time' : period}
                      </button>
                    ))}
                  </div>
                </div>

<div className="flex items-center gap-2">
  <span className="text-xs font-medium text-muted-foreground uppercase">Type:</span>
  <Select value={leaderboardTypeFilter} onValueChange={setLeaderboardTypeFilter}>
  <SelectTrigger className="w-36 h-9">
  <SelectValue placeholder="All types" />
  </SelectTrigger>
  <SelectContent>
  <SelectItem value="all">All Types</SelectItem>
  {sessionTypesForFilter.map((t) => (
  <SelectItem key={t} value={t}>{t}</SelectItem>
  ))}
  </SelectContent>
  </Select>
  </div>

  <div className="flex items-center gap-2">
  <span className="text-xs font-medium text-muted-foreground uppercase">School:</span>
  <Select value={leaderboardSchoolFilter} onValueChange={setLeaderboardSchoolFilter}>
  <SelectTrigger className="w-40 h-9">
  <SelectValue placeholder="All schools" />
  </SelectTrigger>
  <SelectContent>
  <SelectItem value="all">All Schools</SelectItem>
  <SelectItem value="non-affiliated">Non-Affiliated</SelectItem>
  {uniqueSchools.map((school) => (
  <SelectItem key={school} value={school}>{school}</SelectItem>
  ))}
  </SelectContent>
  </Select>
  </div>
  
  <div className="flex items-center gap-2">
  <span className="text-xs font-medium text-muted-foreground uppercase">Sort:</span>
                  <Select value={leaderboardSort} onValueChange={(v) => setLeaderboardSort(v as typeof leaderboardSort)}>
                    <SelectTrigger className="w-36 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="earnings">Earnings</SelectItem>
                      <SelectItem value="sessions">Sessions</SelectItem>
                      <SelectItem value="rating">Rating</SelectItem>
                      <SelectItem value="open">Open Bookings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search coaches..."
                    className="pl-9"
                    value={athleteSearch}
                    onChange={(e) => setAthleteSearch(e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* Leaderboard Table */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-10">#</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Coach</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">School</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Rating</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Open</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Completed</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Draft</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Earnings</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {leaderboardData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-muted-foreground">
                          <Trophy className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>No coaches found</p>
                        </td>
                      </tr>
                    ) : (
                      leaderboardData.map((a, idx) => (
                        <tr key={a.athlete_id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            {idx < 3 ? (
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                idx === 0 ? 'bg-[#B89D60] text-black' :
                                idx === 1 ? 'bg-gray-400 text-black' :
                                'bg-amber-700 text-white'
                              }`}>
                                {idx + 1}
                              </div>
                            ) : (
                              <span className="text-muted-foreground pl-1.5">{idx + 1}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium">{a.athlete_name}</td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 px-2 text-xs font-medium ${a.active ? 'text-emerald-500 hover:text-emerald-400' : 'text-amber-500 hover:text-amber-400'}`}
                              disabled={approvingId === a.athlete_id}
                              onClick={() => handleToggleApproval(a.athlete_id, a.active)}
                            >
                              {approvingId === a.athlete_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Badge variant={a.active ? 'default' : 'outline'} className={a.active ? 'bg-emerald-600 hover:bg-emerald-500' : 'border-amber-500 text-amber-500'}>
                                  {a.active ? 'Approved' : 'Pending'}
                                </Badge>
                              )}
                            </Button>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{a.school}</td>
                          <td className="py-3 px-4 text-center">
                            {a.average_rating ? (
                              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10">
                                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                <span className="font-medium">{a.average_rating.toFixed(1)}</span>
                                <span className="text-muted-foreground text-xs">({a.review_count})</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {a.open_count > 0 ? (
                              <Badge variant="outline" className="border-emerald-600 bg-emerald-600/20 text-emerald-400">{a.open_count}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center tabular-nums">{a.completed_count}</td>
                          <td className="py-3 px-4 text-center">
                            {a.pending_payment_count > 0 ? (
                              <Badge variant="outline" className="border-amber-500 bg-amber-500/20 text-amber-400">{a.pending_payment_count}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#B89D60]">
                            ${a.total_earnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-8" onClick={() => openAthleteEdit(a.athlete_id)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Link href={`/coaches/${a.athlete_id}`} target="_blank">
                                <Button variant="ghost" size="sm" className="h-8">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-red-500 hover:text-red-400"
                                disabled={deactivatingId === a.athlete_id}
                                onClick={() => handleDeactivateAthlete(a.athlete_id)}
                              >
                                {deactivatingId === a.athlete_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
      }

      // Athletes (Youth Wrestlers) sub-section
      if (subSection === 'athletes') {
        const youthLbTotalSpent = youthLeaderboardData.reduce((s, a) => s + a.total_spent, 0);
        const youthLbTotalOpen = youthLeaderboardData.reduce((s, a) => s + a.open_count, 0);
        const youthLbTotalPending = youthLeaderboardData.reduce((s, a) => s + a.pending_payment_count, 0);
        const youthLbActiveWithOpen = youthLeaderboardData.filter((a) => a.open_count > 0).length;

        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Youth athletes</h2>
              <p className="text-sm text-muted-foreground">
                Leaderboard shows bookings and parent-paid totals by session date. Directory and Spending are below.
              </p>
            </div>

            <Tabs
              value={athletesSubTab}
              onValueChange={(v) =>
                setAthletesSubTab(v as 'leaderboard' | 'directory' | 'spending')
              }
              className="w-full"
            >
              <TabsList className="grid w-full max-w-2xl grid-cols-3">
                <TabsTrigger value="leaderboard" className="gap-1">
                  <Trophy className="h-3.5 w-3.5" />
                  Leaderboard
                </TabsTrigger>
                <TabsTrigger value="directory">Directory</TabsTrigger>
                <TabsTrigger value="spending" className="gap-2">
                  <DollarSign className="h-4 w-4" />
                  Spending
                  {youthSessionSpendLines.length > 0 && (
                    <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {youthSessionSpendLines.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="leaderboard" className="mt-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#B89D60]/10">
                      <Trophy className="h-5 w-5 text-[#B89D60]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Athlete leaderboard</h3>
                      <p className="text-sm text-muted-foreground">
                        {youthLeaderboardData.length} athlete{youthLeaderboardData.length !== 1 ? 's' : ''} in view
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total spent</p>
                    <p className="text-xl font-semibold mt-1 text-[#B89D60] tabular-nums">
                      ${youthLbTotalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open bookings</p>
                    <p className="text-xl font-semibold mt-1 tabular-nums">{youthLbTotalOpen}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Scheduled session spots</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Incomplete checkout</p>
                    <p className="text-xl font-semibold mt-1 text-amber-500 tabular-nums">{youthLbTotalPending}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">With open spots</p>
                    <p className="text-xl font-semibold mt-1 tabular-nums">{youthLbActiveWithOpen}</p>
                  </Card>
                </div>

                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Time:</span>
                      <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1">
                        {(['all', '7d', '30d', '90d'] as const).map((period) => (
                          <button
                            key={period}
                            type="button"
                            onClick={() => setYouthLeaderboardTimeFilter(period)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                              youthLeaderboardTimeFilter === period
                                ? 'bg-[#B89D60] text-black'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {period === 'all' ? 'All Time' : period}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Type:</span>
                      <Select value={youthLeaderboardTypeFilter} onValueChange={setYouthLeaderboardTypeFilter}>
                        <SelectTrigger className="w-36 h-9">
                          <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          {sessionTypesForFilter.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase">School:</span>
                      <Select value={youthLeaderboardSchoolFilter} onValueChange={setYouthLeaderboardSchoolFilter}>
                        <SelectTrigger className="w-40 h-9">
                          <SelectValue placeholder="All schools" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Schools</SelectItem>
                          <SelectItem value="non-affiliated">Non-Affiliated</SelectItem>
                          {uniqueYouthSchools.map((school) => (
                            <SelectItem key={school} value={school}>
                              {school}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Sort:</span>
                      <Select
                        value={youthLbSort.key}
                        onValueChange={(v) => {
                          const key = v as YouthLbSortKey;
                          const isNumeric = key !== 'name' && key !== 'school';
                          setYouthLbSort({ key, dir: isNumeric ? 'desc' : 'asc' });
                        }}
                      >
                        <SelectTrigger className="w-44 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Athlete (A–Z)</SelectItem>
                          <SelectItem value="school">School</SelectItem>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="bookings">Bookings</SelectItem>
                          <SelectItem value="spent">Total spent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search athletes…"
                        className="pl-9"
                        value={youthLeaderboardSearch}
                        onChange={(e) => setYouthLeaderboardSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-10">
                            #
                          </th>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Athlete"
                              active={youthLbSort.key === 'name'}
                              dir={youthLbSort.dir}
                              onClick={() => toggleYouthLbSort('name')}
                            />
                          </th>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="School"
                              active={youthLbSort.key === 'school'}
                              dir={youthLbSort.dir}
                              onClick={() => toggleYouthLbSort('school')}
                            />
                          </th>
                          <th className="text-center py-3 px-4">
                            <div className="flex justify-center">
                              <AdminSortColBtn
                                label="Open"
                                active={youthLbSort.key === 'open'}
                                dir={youthLbSort.dir}
                                onClick={() => toggleYouthLbSort('open')}
                              />
                            </div>
                          </th>
                          <th className="text-center py-3 px-4">
                            <div className="flex justify-center">
                              <AdminSortColBtn
                                label="Completed"
                                active={youthLbSort.key === 'completed'}
                                dir={youthLbSort.dir}
                                onClick={() => toggleYouthLbSort('completed')}
                              />
                            </div>
                          </th>
                          <th className="text-center py-3 px-4">
                            <div className="flex justify-center">
                              <AdminSortColBtn
                                label="Pending"
                                active={youthLbSort.key === 'pending'}
                                dir={youthLbSort.dir}
                                onClick={() => toggleYouthLbSort('pending')}
                              />
                            </div>
                          </th>
                          <th className="text-center py-3 px-4">
                            <div className="flex justify-center">
                              <AdminSortColBtn
                                label="Bookings"
                                active={youthLbSort.key === 'bookings'}
                                dir={youthLbSort.dir}
                                onClick={() => toggleYouthLbSort('bookings')}
                              />
                            </div>
                          </th>
                          <th className="text-right py-3 px-4">
                            <div className="flex justify-end">
                              <AdminSortColBtn
                                label="Spent"
                                active={youthLbSort.key === 'spent'}
                                dir={youthLbSort.dir}
                                onClick={() => toggleYouthLbSort('spent')}
                              />
                            </div>
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {kidsLoading ? (
                          <tr>
                            <td colSpan={9} className="py-12 text-center">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                            </td>
                          </tr>
                        ) : youthLeaderboardData.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-12 text-center text-muted-foreground">
                              <User className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                              <p>No athletes match these filters</p>
                            </td>
                          </tr>
                        ) : (
                          youthLeaderboardData.map((a, idx) => (
                            <tr key={a.youth_wrestler_id} className="hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4">
                                {idx < 3 ? (
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                      idx === 0
                                        ? 'bg-[#B89D60] text-black'
                                        : idx === 1
                                          ? 'bg-gray-400 text-black'
                                          : 'bg-amber-700 text-white'
                                    }`}
                                  >
                                    {idx + 1}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground pl-1.5">{idx + 1}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-medium">{a.name}</td>
                              <td className="py-3 px-4 text-muted-foreground">{a.school || '—'}</td>
                              <td className="py-3 px-4 text-center">
                                {a.open_count > 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-600 bg-emerald-600/20 text-emerald-400"
                                  >
                                    {a.open_count}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center tabular-nums">{a.completed_count}</td>
                              <td className="py-3 px-4 text-center">
                                {a.pending_payment_count > 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500 bg-amber-500/20 text-amber-400"
                                  >
                                    {a.pending_payment_count}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center tabular-nums">{a.booking_count}</td>
                              <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#B89D60]">
                                ${a.total_spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Link href={`/wrestlers/${a.youth_wrestler_id}`} target="_blank">
                                  <Button variant="ghost" size="sm" className="h-8">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </Link>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="directory" className="mt-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total spent (all kids)</p>
                    <p className="text-2xl font-semibold tabular-nums text-[#B89D60]">
                      ${totalYouthSpendAllTime.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Sum of parent payments on sessions</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Paid session lines</p>
                    <p className="text-2xl font-semibold">{youthSessionSpendLines.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Wrestler rows on sessions with amount</p>
                  </Card>
                </div>

                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Name"
                              active={youthDirSort.key === 'name'}
                              dir={youthDirSort.dir}
                              onClick={() => toggleYouthDirSort('name')}
                            />
                          </th>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="School"
                              active={youthDirSort.key === 'school'}
                              dir={youthDirSort.dir}
                              onClick={() => toggleYouthDirSort('school')}
                            />
                          </th>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Parent"
                              active={youthDirSort.key === 'parent'}
                              dir={youthDirSort.dir}
                              onClick={() => toggleYouthDirSort('parent')}
                            />
                          </th>
                          <th className="text-right py-3 px-4">
                            <div className="flex justify-end">
                              <AdminSortColBtn
                                label="Total spent"
                                active={youthDirSort.key === 'spent'}
                                dir={youthDirSort.dir}
                                onClick={() => toggleYouthDirSort('spent')}
                              />
                            </div>
                          </th>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Level"
                              active={youthDirSort.key === 'level'}
                              dir={youthDirSort.dir}
                              onClick={() => toggleYouthDirSort('level')}
                            />
                          </th>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Joined"
                              active={youthDirSort.key === 'joined'}
                              dir={youthDirSort.dir}
                              onClick={() => toggleYouthDirSort('joined')}
                            />
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {kidsLoading ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                            </td>
                          </tr>
                        ) : kidsList.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-muted-foreground">
                              <User className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                              <p>No athletes found</p>
                            </td>
                          </tr>
                        ) : (
                          sortedKidsDirectory.map((k) => {
                            const agg = spendByYouthIdAll.get(k.id);
                            return (
                              <tr key={k.id} className="hover:bg-muted/30 transition-colors">
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    <ProfileImage
                                      src={k.photo_url}
                                      focusX={k.photo_focus_x}
                                      focusY={k.photo_focus_y}
                                      alt={`${k.first_name} ${k.last_name}`}
                                      className="h-8 w-8 rounded-full"
                                    />
                                    <span className="font-medium">
                                      {k.first_name} {k.last_name}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-muted-foreground">{k.school || '-'}</td>
                                <td className="py-3 px-4 text-muted-foreground">{k.parent_email}</td>
                                <td className="py-3 px-4 text-right tabular-nums font-medium">
                                  ${(agg?.total ?? 0).toFixed(2)}
                                  {agg && agg.count > 0 && (
                                    <span className="block text-[11px] text-muted-foreground font-normal">
                                      {agg.count} session line{agg.count === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  {k.skill_level && <Badge variant="outline">{k.skill_level}</Badge>}
                                </td>
                                <td className="py-3 px-4 text-muted-foreground">
                                  {formatEST(new Date(k.created_at), 'MMM d, yyyy')}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="spending" className="mt-6 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                  <div className="lg:col-span-3">
                    <Label className="text-xs text-muted-foreground">Session date</Label>
                    <Select
                      value={athleteSpendPeriod}
                      onValueChange={(v) => setAthleteSpendPeriod(v as PayoutHistoryPeriodPreset)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All time</SelectItem>
                        <SelectItem value="week">This week</SelectItem>
                        <SelectItem value="month">This month</SelectItem>
                        <SelectItem value="last30">Last 30 days</SelectItem>
                        <SelectItem value="ytd">Year to date</SelectItem>
                        <SelectItem value="custom">Custom range…</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Filters by session date ({APP_TIMEZONE}).
                    </p>
                  </div>
                  {athleteSpendPeriod === 'custom' && (
                    <>
                      <div className="lg:col-span-2">
                        <Label className="text-xs text-muted-foreground">From</Label>
                        <Input
                          type="date"
                          className="mt-1"
                          value={athleteSpendDateFrom}
                          onChange={(e) => setAthleteSpendDateFrom(e.target.value)}
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <Label className="text-xs text-muted-foreground">To</Label>
                        <Input
                          type="date"
                          className="mt-1"
                          value={athleteSpendDateTo}
                          onChange={(e) => setAthleteSpendDateTo(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                  <div className="lg:col-span-2">
                    <Label className="text-xs text-muted-foreground">Athlete</Label>
                    <Select value={athleteSpendWrestlerFilter} onValueChange={setAthleteSpendWrestlerFilter}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All athletes</SelectItem>
                        {wrestlerSpendFilterOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="lg:col-span-2">
                    <Label className="text-xs text-muted-foreground">Search</Label>
                    <Input
                      className="mt-1"
                      placeholder="Name, coach, facility…"
                      value={athleteSpendSearch}
                      onChange={(e) => setAthleteSpendSearch(e.target.value)}
                    />
                  </div>
                  <div className="lg:col-span-1 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-6 lg:mt-0"
                      onClick={() => {
                        setAthleteSpendPeriod('all');
                        setAthleteSpendDateFrom('');
                        setAthleteSpendDateTo('');
                        setAthleteSpendWrestlerFilter('all');
                        setAthleteSpendSearch('');
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Filtered total</p>
                    <p className="text-2xl font-semibold tabular-nums">${athleteSpendFilteredTotal.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {filteredAthleteSpendLines.length} session line(s)
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">All-time total</p>
                    <p className="text-2xl font-semibold tabular-nums">${totalYouthSpendAllTime.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Not affected by filters above</p>
                  </Card>
                </div>

                <Card className="overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <h3 className="text-sm font-semibold">Totals by athlete</h3>
                    <p className="text-xs text-muted-foreground">Same filters as session lines below.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Athlete"
                              active={wrestlerTotalsSort.key === 'name'}
                              dir={wrestlerTotalsSort.dir}
                              onClick={() => toggleWrestlerTotalsSort('name')}
                            />
                          </th>
                          <th className="text-right py-3 px-4">
                            <div className="flex justify-end">
                              <AdminSortColBtn
                                label="Sessions"
                                active={wrestlerTotalsSort.key === 'sessions'}
                                dir={wrestlerTotalsSort.dir}
                                onClick={() => toggleWrestlerTotalsSort('sessions')}
                              />
                            </div>
                          </th>
                          <th className="text-right py-3 px-4">
                            <div className="flex justify-end">
                              <AdminSortColBtn
                                label="Total"
                                active={wrestlerTotalsSort.key === 'total'}
                                dir={wrestlerTotalsSort.dir}
                                onClick={() => toggleWrestlerTotalsSort('total')}
                              />
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sortedAthleteSpendByWrestlerRows.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-8 text-center text-muted-foreground text-sm">
                              No spending in this period for the current filters.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {sortedAthleteSpendByWrestlerRows.map((row) => (
                              <tr key={row.youth_wrestler_id} className="hover:bg-muted/30">
                                <td className="py-3 px-4 font-medium">{row.name}</td>
                                <td className="py-3 px-4 text-right tabular-nums">{row.sessions}</td>
                                <td className="py-3 px-4 text-right tabular-nums font-medium">
                                  ${row.total.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-muted/40 font-medium">
                              <td className="py-3 px-4">Total</td>
                              <td className="py-3 px-4 text-right tabular-nums">
                                {athleteSpendByWrestlerRows.reduce((s, r) => s + r.sessions, 0)}
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums">
                                ${athleteSpendFilteredTotal.toFixed(2)}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <h3 className="text-sm font-semibold">Session lines</h3>
                    <p className="text-xs text-muted-foreground">Each row is one wrestler on one session.</p>
                  </div>
                  <div className="overflow-x-auto max-h-[min(65vh,640px)] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Session date"
                              active={athleteSpendLineSort.key === 'date'}
                              dir={athleteSpendLineSort.dir}
                              onClick={() => toggleAthleteSpendLineSort('date')}
                            />
                          </th>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Athlete"
                              active={athleteSpendLineSort.key === 'athlete'}
                              dir={athleteSpendLineSort.dir}
                              onClick={() => toggleAthleteSpendLineSort('athlete')}
                            />
                          </th>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Coach"
                              active={athleteSpendLineSort.key === 'coach'}
                              dir={athleteSpendLineSort.dir}
                              onClick={() => toggleAthleteSpendLineSort('coach')}
                            />
                          </th>
                          <th className="text-left py-3 px-4">
                            <AdminSortColBtn
                              label="Facility"
                              active={athleteSpendLineSort.key === 'facility'}
                              dir={athleteSpendLineSort.dir}
                              onClick={() => toggleAthleteSpendLineSort('facility')}
                            />
                          </th>
                          <th className="text-center py-3 px-4">
                            <div className="flex justify-center">
                              <AdminSortColBtn
                                label="Status"
                                active={athleteSpendLineSort.key === 'status'}
                                dir={athleteSpendLineSort.dir}
                                onClick={() => toggleAthleteSpendLineSort('status')}
                              />
                            </div>
                          </th>
                          <th className="text-right py-3 px-4">
                            <div className="flex justify-end">
                              <AdminSortColBtn
                                label="Paid"
                                active={athleteSpendLineSort.key === 'paid'}
                                dir={athleteSpendLineSort.dir}
                                onClick={() => toggleAthleteSpendLineSort('paid')}
                              />
                            </div>
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredAthleteSpendLines.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-muted-foreground text-sm">
                              No lines match. Load athletes or widen filters.
                            </td>
                          </tr>
                        ) : (
                          sortedFilteredAthleteSpendLines.map((line) => {
                            const kid = kidsList.find((kk) => kk.id === line.youth_wrestler_id);
                            const aname = kid
                              ? `${kid.first_name} ${kid.last_name}`.trim()
                              : `Unknown (${line.youth_wrestler_id.slice(0, 8)}…)`;
                            return (
                              <tr key={`${line.session_id}-${line.youth_wrestler_id}`} className="hover:bg-muted/30">
                                <td className="py-3 px-4 whitespace-nowrap text-muted-foreground text-xs">
                                  {formatEST(new Date(line.scheduled_datetime), 'MMM d, yyyy h:mm a')}
                                </td>
                                <td className="py-3 px-4 font-medium">{aname}</td>
                                <td className="py-3 px-4 text-muted-foreground">{line.coach_name}</td>
                                <td className="py-3 px-4 text-muted-foreground max-w-[180px] truncate">
                                  {line.facility_name}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <Badge variant="outline" className="text-xs">
                                    {line.session_status}
                                  </Badge>
                                </td>
                                <td className="py-3 px-4 text-right tabular-nums font-medium">
                                  ${line.amount_paid.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <Link href={`/admin/sessions/${line.session_id}/edit`}>
                                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-[#B89D60]">
                                      <Pencil className="h-3.5 w-3.5" />
                                      Edit
                                    </Button>
                                  </Link>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        );
      }

      // Parents sub-section
      if (subSection === 'parents') {
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold">Users</h2>
                <p className="text-sm text-muted-foreground">{filteredUsers.length} users</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="outline" size="sm" className="h-9" asChild>
                  <Link href="/admin/users">Open full user management</Link>
                </Button>
                <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="coach">Coach</SelectItem>
                    <SelectItem value="youth_wrestler">Athlete</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search email or name..."
                    className="pl-9 w-64"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Email</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Last name</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Role</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Created</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Last login</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {usersError ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-red-500">{usersError}</td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-muted-foreground">
                          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>No users found</p>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-medium">{u.email}</td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {u.last_name?.trim() ? u.last_name.trim() : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={u.role === 'admin' ? 'default' : 'outline'}>{u.role}</Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{formatEST(new Date(u.created_at), 'MMM d, yyyy')}</td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {u.last_login_at
                              ? formatEST(new Date(u.last_login_at), 'MMM d, yyyy h:mm a')
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => {
                                setCockpitEditError(null);
                                setCockpitEditUser(u);
                                setCockpitEditRole(u.role);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Edit role
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Dialog
              open={!!cockpitEditUser}
              onOpenChange={(open) => {
                if (!open) {
                  setCockpitEditUser(null);
                  setCockpitEditError(null);
                }
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit user role</DialogTitle>
                  <DialogDescription>
                    {cockpitEditUser?.email}
                    {cockpitEditUser?.last_name?.trim() && (
                      <span className="block mt-1 text-foreground">{cockpitEditUser.last_name.trim()}</span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="cockpit-user-role" className="text-sm font-medium">
                      Role
                    </Label>
                    <Select value={cockpitEditRole} onValueChange={setCockpitEditRole}>
                      <SelectTrigger id="cockpit-user-role" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parent">Parent</SelectItem>
                        <SelectItem value="coach">Coach</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="youth_wrestler">Athlete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Coaches need a profile in Athletes (onboarding or admin). Use{' '}
                    <Link href="/admin/users" className="text-accent underline">
                      full user management
                    </Link>{' '}
                    for archive and more actions.
                  </p>
                  {cockpitEditError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{cockpitEditError}</p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCockpitEditUser(null)}
                    disabled={cockpitEditLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      cockpitEditLoading ||
                      !cockpitEditUser ||
                      cockpitEditRole === cockpitEditUser.role
                    }
                    onClick={async () => {
                      if (!cockpitEditUser) return;
                      setCockpitEditLoading(true);
                      setCockpitEditError(null);
                      try {
                        const res = await fetch(`/api/admin/users/${cockpitEditUser.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ role: cockpitEditRole }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setCockpitEditError(
                            typeof data.error === 'string' ? data.error : 'Could not update role'
                          );
                          return;
                        }
                        setCockpitEditUser(null);
                        router.refresh();
                      } catch {
                        setCockpitEditError('Request failed');
                      } finally {
                        setCockpitEditLoading(false);
                      }
                    }}
                  >
                    {cockpitEditLoading ? 'Saving…' : 'Save'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        );
      }

      // Facility Requests sub-section
      if (subSection === 'requests') {
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Facility Requests</h2>
              <p className="text-sm text-muted-foreground">Review and approve new facility requests</p>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Facility</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Requested By</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {facilityRequestsLoading ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </td>
                      </tr>
                    ) : facilityRequests.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-muted-foreground">
                          <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>No facility requests</p>
                        </td>
                      </tr>
                    ) : (
                      facilityRequests.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-muted-foreground">{r.school}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium">{r.coach_name}</div>
                            <div className="text-xs text-muted-foreground">{r.coach_school}</div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={r.status === 'pending' ? 'outline' : r.status === 'approved' ? 'default' : 'destructive'}>
                              {r.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{formatEST(new Date(r.created_at), 'MMM d, yyyy')}</td>
                          <td className="py-3 px-4 text-right">
                            {r.status === 'pending' && (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  className="h-8 bg-emerald-600 hover:bg-emerald-700"
                                  disabled={facilityRequestActionId === r.id}
                                  onClick={async () => {
                                    setFacilityRequestActionId(r.id);
                                    try {
                                      await fetch(`/api/admin/facility-requests/${r.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ status: 'approved' }),
                                      });
                                      setFacilityRequests(prev => prev.map(req => req.id === r.id ? { ...req, status: 'approved' } : req));
                                    } finally {
                                      setFacilityRequestActionId(null);
                                    }
                                  }}
                                >
                                  {facilityRequestActionId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Approve'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-red-500/50 text-red-500"
                                  disabled={facilityRequestActionId === r.id}
                                  onClick={async () => {
                                    setFacilityRequestActionId(r.id);
                                    try {
                                      await fetch(`/api/admin/facility-requests/${r.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ status: 'rejected' }),
                                      });
                                      setFacilityRequests(prev => prev.map(req => req.id === r.id ? { ...req, status: 'rejected' } : req));
                                    } finally {
                                      setFacilityRequestActionId(null);
                                    }
                                  }}
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
      }
    }

    return null;
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar Navigation — desktop only; mobile uses bottom nav */}
      <aside className="hidden lg:block sticky top-0 w-64 shrink-0 bg-card border-r border-border h-[calc(100vh-4rem)]">
        <div className="p-4 space-y-6 h-full overflow-y-auto">
          {/* Create Session Button */}
          <Link href="/admin/sessions/create" className="block">
            <Button className="w-full bg-[#B89D60] hover:bg-[#9A8550] text-black">
              <Plus className="h-4 w-4 mr-2" />
              Create Session
            </Button>
          </Link>

          {/* Overview Section */}
          <div className="space-y-1">
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Overview</p>
            <NavItem
              icon={LayoutDashboard}
              label="Dashboard"
              active={section === 'overview' && subSection !== 'cockpit'}
              onClick={() => handleNavChange('overview', 'dashboard')}
            />
            <NavItem
              icon={Gauge}
              label="Cockpit"
              active={section === 'overview' && subSection === 'cockpit'}
              onClick={() => handleNavChange('overview', 'cockpit')}
            />
          </div>

          {/* Bookings Section */}
          <div className="space-y-1">
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Bookings</p>
            <NavItem
              icon={Calendar}
              label="Sessions"
              active={section === 'bookings'}
              onClick={() => handleNavChange('bookings')}
              badge={openSessions}
            />
          </div>

          {/* Money Section */}
          <div className="space-y-1">
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Money</p>
            <NavItem
              icon={DollarSign}
              label="Overview"
              active={section === 'money' && subSection === 'payments'}
              onClick={() => handleNavChange('money', 'payments')}
            />
            <NavItem
              icon={Wallet}
              label="Payouts"
              active={section === 'money' && subSection === 'payouts'}
              onClick={() => handleNavChange('money', 'payouts')}
              badge={coachPayouts.filter(p => p.amount > 0).length}
            />
<NavItem
  icon={CreditCard}
  label="Credits"
  active={section === 'money' && subSection === 'credits'}
  onClick={() => handleNavChange('money', 'credits')}
  />
              {rewardsProgramEnabled && (
                <Link
                  href="/admin/rewards"
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                    pathname === '/admin/rewards'
                      ? 'bg-[#B89D60]/15 text-[#B89D60]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Gift className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">Rewards</span>
                  {pathname === '/admin/rewards' && <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />}
                </Link>
              )}
              <NavItem
                icon={MessageSquare}
                label="Messages"
                active={section === 'money' && subSection === 'messages'}
                onClick={() => handleNavChange('money', 'messages')}
              />
          </div>

          {/* People Section */}
          <div className="space-y-1">
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">People</p>
            <NavItem
              icon={Star}
              label="Coaches"
              active={section === 'people' && subSection === 'coaches'}
              onClick={() => handleNavChange('people', 'coaches')}
            />
            <NavItem
              icon={CalendarDays}
              label="Coach calendar"
              active={section === 'people' && subSection === 'coach_week'}
              onClick={() => handleNavChange('people', 'coach_week')}
            />
            <NavItem
              icon={User}
              label="Athletes"
              active={section === 'people' && subSection === 'athletes'}
              onClick={() => handleNavChange('people', 'athletes')}
            />
            <NavItem
              icon={Users}
              label="Users"
              active={section === 'people' && subSection === 'parents'}
              onClick={() => handleNavChange('people', 'parents')}
            />
            <NavItem
              icon={Building2}
              label="Facility Requests"
              active={section === 'people' && subSection === 'requests'}
              onClick={() => handleNavChange('people', 'requests')}
              badge={pendingFacilityRequests}
            />
          </div>

          {/* Quick Links */}
          <div className="space-y-1 pt-4 border-t border-border">
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Quick Links</p>
            <Link href="/admin/coach-applications" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Coach Applications
            </Link>
            <Link href="/admin/facilities" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Facilities
            </Link>
            <Link href="/admin/products" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Products
            </Link>
            <Link href="/admin/discount-codes" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Discount Codes
            </Link>
            <Link href="/admin/focus-areas" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Session Topics
            </Link>
            <Link href="/admin/reviews" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Reviews
            </Link>
            <Link href="/admin/coach-help" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Coach help
            </Link>
            <Link href="/admin/coach-sms" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Text coaches
            </Link>
            <Link href="/admin/message-log" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              SMS &amp; alert log
            </Link>
            <Link href="/admin/parent-announcements" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Parent home announcements
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden min-w-0">
        {textGroupAdminSession && (
          <CoachTextGroupDialog
            sessionId={textGroupAdminSession.id}
            open={!!textGroupAdminSession}
            onOpenChange={(open) => {
              if (!open) setTextGroupAdminSession(null);
            }}
            sessionLabel={`${formatEST(new Date(textGroupAdminSession.scheduled_datetime), 'EEE, MMM d · h:mm a')} · ${textGroupAdminSession.facility_name}`}
            onSent={() => router.refresh()}
          />
        )}
        
        {renderContent()}
      </main>

      {/* Coach Edit Dialog */}
      <Dialog
        open={!!editingAthleteId}
        onOpenChange={(open) => {
          if (!open) {
            setEditingAthleteId(null);
            setAthletePhotoError(null);
            setCopiedCoachPublicLink(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Coach</DialogTitle>
            <DialogDescription>Update coach profile information</DialogDescription>
          </DialogHeader>
          {editingAthleteId ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 space-y-2">
              <Label className="text-foreground">Public sessions link</Label>
              <p className="text-xs text-muted-foreground">
                Lists all upcoming sessions for this coach (no login). Same as on their public profile.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <Input
                  readOnly
                  className="font-mono text-xs sm:text-sm"
                  value={
                    (process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') ||
                      (typeof window !== 'undefined' ? window.location.origin : '')) +
                    `/coach/${editingAthleteId}`
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={async () => {
                    const url =
                      (process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') ||
                        (typeof window !== 'undefined' ? window.location.origin : '')) +
                      `/coach/${editingAthleteId}`;
                    await navigator.clipboard.writeText(url);
                    setCopiedCoachPublicLink(true);
                    setTimeout(() => setCopiedCoachPublicLink(false), 2000);
                  }}
                >
                  {copiedCoachPublicLink ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
          {!athleteEditForm ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form onSubmit={saveAthleteEdit} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-border pb-4">
                {athleteEditForm.photo_url ? (
                  <img
                    src={athleteEditForm.photo_url}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0 border border-dashed border-border">
                    No photo
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input
                    ref={athletePhotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !editingAthleteId) return;
                      setAthletePhotoError(null);
                      setAthletePhotoUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append('file', file);
                        const res = await fetch(`/api/admin/athletes/${editingAthleteId}/upload-photo`, {
                          method: 'POST',
                          body: fd,
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setAthletePhotoError(typeof data.error === 'string' ? data.error : 'Upload failed');
                          return;
                        }
                        if (data.photoUrl) {
                          setAthleteEditForm((prev) => (prev ? { ...prev, photo_url: data.photoUrl } : null));
                        }
                      } catch {
                        setAthletePhotoError('Upload failed');
                      } finally {
                        setAthletePhotoUploading(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    disabled={athletePhotoUploading}
                    onClick={() => athletePhotoInputRef.current?.click()}
                  >
                    {athletePhotoUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Upload photo
                  </Button>
                  <p className="text-xs text-muted-foreground">JPG, PNG, or WebP · max 5MB · replaces current profile photo</p>
                  {athletePhotoError ? (
                    <p className="text-xs text-destructive">{athletePhotoError}</p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={athleteEditForm.first_name}
                    onChange={(e) => setAthleteEditForm({ ...athleteEditForm, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={athleteEditForm.last_name}
                    onChange={(e) => setAthleteEditForm({ ...athleteEditForm, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="school">School</Label>
                <Input
                  id="school"
                  value={athleteEditForm.school}
                  onChange={(e) => setAthleteEditForm({ ...athleteEditForm, school: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight_class">Weight class</Label>
                  <Input
                    id="weight_class"
                    placeholder="e.g. 157 lbs"
                    value={athleteEditForm.weight_class || ''}
                    onChange={(e) =>
                      setAthleteEditForm({ ...athleteEditForm, weight_class: e.target.value || null })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Grad year</Label>
                  <Input
                    id="year"
                    placeholder="e.g. 2024"
                    value={athleteEditForm.year || ''}
                    onChange={(e) => setAthleteEditForm({ ...athleteEditForm, year: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  placeholder="Coaching experience, style, achievements…"
                  maxLength={500}
                  rows={5}
                  value={athleteEditForm.bio || ''}
                  onChange={(e) => setAthleteEditForm({ ...athleteEditForm, bio: e.target.value || null })}
                />
                <p className="text-xs text-muted-foreground">{(athleteEditForm.bio || '').length}/500</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coach_cell_phone">Cell phone</Label>
                <Input
                  id="coach_cell_phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="e.g. (919) 555-0100"
                  value={athleteEditForm.phone}
                  onChange={(e) => setAthleteEditForm({ ...athleteEditForm, phone: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Same field the coach can edit under Profile. Used for SMS and booking alerts; not shown on their public
                  coach page.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coach_home_zip">Home ZIP</Label>
                <Input
                  id="coach_home_zip"
                  autoComplete="postal-code"
                  placeholder="e.g. 27607 or 27607-1234"
                  value={athleteEditForm.zip_code}
                  onChange={(e) => setAthleteEditForm({ ...athleteEditForm, zip_code: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Stored on their account for maps and location features; not shown on the public coach page.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="venmo">Venmo Handle</Label>
                  <Input
                    id="venmo"
                    value={athleteEditForm.venmo_handle || ''}
                    onChange={(e) => setAthleteEditForm({ ...athleteEditForm, venmo_handle: e.target.value })}
                    placeholder="@username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zelle">Zelle Email</Label>
                  <Input
                    id="zelle"
                    value={athleteEditForm.zelle_email || ''}
                    onChange={(e) => setAthleteEditForm({ ...athleteEditForm, zelle_email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="facility">Primary Facility</Label>
                <Select
                  value={athleteEditForm.facility_id || ''}
                  onValueChange={(v) =>
                    setAthleteEditForm({
                      ...athleteEditForm,
                      facility_id: v || null,
                      secondary_facility_id:
                        athleteEditForm.secondary_facility_id === v ? null : athleteEditForm.secondary_facility_id,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name} ({f.school})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondary_facility">Secondary Facility (optional)</Label>
                <Select
                  value={athleteEditForm.secondary_facility_id || '__none__'}
                  onValueChange={(v) =>
                    setAthleteEditForm({
                      ...athleteEditForm,
                      secondary_facility_id: v === '__none__' ? null : v,
                    })
                  }
                >
                  <SelectTrigger id="secondary_facility">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {facilities
                      .filter((f) => f.id !== athleteEditForm.facility_id)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name} ({f.school})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="photo_focus_x">Photo focus X (0–100)</Label>
                  <Input
                    id="photo_focus_x"
                    type="number"
                    min={0}
                    max={100}
                    value={athleteEditForm.photo_focus_x}
                    onChange={(e) =>
                      setAthleteEditForm({
                        ...athleteEditForm,
                        photo_focus_x: Math.min(100, Math.max(0, Number(e.target.value) || 50)),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photo_focus_y">Photo focus Y (0–100)</Label>
                  <Input
                    id="photo_focus_y"
                    type="number"
                    min={0}
                    max={100}
                    value={athleteEditForm.photo_focus_y}
                    onChange={(e) =>
                      setAthleteEditForm({
                        ...athleteEditForm,
                        photo_focus_y: Math.min(100, Math.max(0, Number(e.target.value) || 15)),
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={athleteEditForm.active}
                  onChange={(e) => setAthleteEditForm({ ...athleteEditForm, active: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="active">Active (visible on browse page)</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingAthleteId(null)}>Cancel</Button>
                <Button type="submit" className="bg-[#B89D60] hover:bg-[#9A8550] text-black" disabled={athleteEditSaving}>
                  {athleteEditSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Drop-In Payment Dialog */}
      <Dialog open={showDropInDialog} onOpenChange={(open) => !open && setShowDropInDialog(false)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Record Drop-In Payment</DialogTitle>
            <DialogDescription>
              {dropInSession && (
                <>Record a cash/manual payment for {dropInSession.athlete_name}&apos;s session on {formatEST(new Date(dropInSession.scheduled_datetime), 'MMM d, h:mm a')}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Wrestler Search */}
            <div className="grid gap-2">
              <Label>Search Existing Wrestler</Label>
              <div className="relative">
                <Input
                  placeholder="Type to search wrestlers..."
                  value={wrestlerSearchQuery}
                  onChange={(e) => searchWrestlers(e.target.value)}
                />
                {searchingWrestlers && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-zinc-400" />
                )}
                {wrestlerSearchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-lg max-h-48 overflow-auto">
                    {wrestlerSearchResults.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2"
                        onClick={() => selectWrestler(w)}
                      >
                        {w.photo_url ? (
                          <img src={w.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs">
                            {w.first_name?.[0]}{w.last_name?.[0]}
                          </div>
                        )}
                        <span>{w.first_name} {w.last_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {dropInForm.youthWrestlerId && (
                <p className="text-sm text-emerald-400">Selected: {dropInForm.wrestlerName}</p>
              )}
            </div>

            <div className="relative flex items-center gap-2 py-2">
              <div className="flex-1 border-t border-zinc-700" />
              <span className="text-xs text-zinc-500">OR enter manually</span>
              <div className="flex-1 border-t border-zinc-700" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wrestlerName">Wrestler Name {!dropInForm.youthWrestlerId && '*'}</Label>
              <Input
                id="wrestlerName"
                placeholder="Enter wrestler's name"
                value={dropInForm.wrestlerName}
                onChange={(e) => setDropInForm({ ...dropInForm, wrestlerName: e.target.value, youthWrestlerId: '' })}
                disabled={!!dropInForm.youthWrestlerId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="parentName">Parent Name</Label>
              <Input
                id="parentName"
                placeholder="Enter parent's name (optional for existing wrestlers)"
                value={dropInForm.parentName}
                onChange={(e) => setDropInForm({ ...dropInForm, parentName: e.target.value })}
                disabled={!!dropInForm.youthWrestlerId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="parentPhone">Parent Phone</Label>
              <Input
                id="parentPhone"
                placeholder="(555) 555-5555"
                value={dropInForm.parentPhone}
                onChange={(e) => setDropInForm({ ...dropInForm, parentPhone: e.target.value })}
                disabled={!!dropInForm.youthWrestlerId}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="amountPaid">Amount Paid *</Label>
                <Input
                  id="amountPaid"
                  type="number"
                  placeholder="30.00"
                  value={dropInForm.amountPaid}
                  onChange={(e) => setDropInForm({ ...dropInForm, amountPaid: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select
                  value={dropInForm.paymentMethod}
                  onValueChange={(v) => setDropInForm({ ...dropInForm, paymentMethod: v as 'cash' | 'venmo' | 'zelle' | 'other' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="venmo">Venmo</SelectItem>
                    <SelectItem value="zelle">Zelle</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDropInDialog(false)}>Cancel</Button>
            <Button 
              type="button" 
              className="bg-[#B89D60] hover:bg-[#9A8550] text-black" 
              onClick={handleRecordDropIn}
              disabled={savingDropIn || (!dropInForm.wrestlerName && !dropInForm.youthWrestlerId) || !dropInForm.amountPaid}
            >
              {savingDropIn ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Roster Modal */}
      <Dialog open={!!rosterSessionId} onOpenChange={(open) => !open && setRosterSessionId(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Session Roster
            </DialogTitle>
            <DialogDescription>
              {rosterSessionId && (() => {
                const sess = sessions.find(s => s.id === rosterSessionId);
                return sess ? `${sess.athlete_name} - ${formatEST(new Date(sess.scheduled_datetime), 'MMM d, yyyy h:mm a')}` : '';
              })()}
            </DialogDescription>
          </DialogHeader>
          {rosterSessionId && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-sm">
              <p className="font-medium text-foreground">Collect payment (Stripe or manual)</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {(() => {
                  const sess = sessions.find((s) => s.id === rosterSessionId);
                  if (sess?.status === 'completed') {
                    return 'Session is complete — parents can still pay via the register link below. For cash/Venmo, use Mark paid on each wrestler.';
                  }
                  return 'Parent opens the register link and pays by card, or use Mark paid for cash/check/Venmo on each row.';
                })()}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    const url = `${window.location.origin}/sessions/${rosterSessionId}/register`;
                    try {
                      await navigator.clipboard.writeText(url);
                      setParentCheckoutCopied(true);
                      setTimeout(() => setParentCheckoutCopied(false), 2000);
                    } catch {
                      window.prompt('Copy this URL:', url);
                    }
                  }}
                >
                  {parentCheckoutCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy parent checkout link
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={`/sessions/${rosterSessionId}/register`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open register
                  </a>
                </Button>
              </div>
              <p className="text-muted-foreground text-xs pt-1 border-t border-border/60">
                <strong className="text-foreground">Move a kid to another coach:</strong> use Transfer on a wrestler, then run checkout on the{' '}
                <em>target</em> session if they still need to pay that coach.
              </p>
            </div>
          )}
          <div className="py-4">
            {rosterLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rosterData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No participants registered</p>
            ) : (
              <div className="space-y-3">
                {rosterData.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="font-medium text-muted-foreground w-6">{idx + 1}.</div>
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium">
                        {p.wrestlerName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium flex items-center gap-2">
                        {p.wrestlerName}
                        {p.isDropIn && (
                          <Badge variant="outline" className="text-xs border-amber-600 text-amber-400">Drop-in</Badge>
                        )}
                      </div>
                      {p.parentEmail && (
                        <div className="text-sm text-muted-foreground truncate">{p.parentEmail}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-medium tabular-nums">${Number(p.amountPaid || 0).toFixed(2)}</div>
                        {p.paid ? (
                          <Badge variant="outline" className="text-xs border-emerald-600 bg-emerald-600/20 text-emerald-400">Paid</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-amber-600 bg-amber-600/20 text-amber-400">Unpaid</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        {!p.paid && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-emerald-400 hover:text-emerald-300"
                            onClick={() => {
                              setMarkPaidParticipant({
                                id: p.id,
                                wrestlerName: p.wrestlerName,
                                amountPaid: p.amountPaid,
                              });
                              const sess = sessions.find((s) => s.id === rosterSessionId);
                              const suggested =
                                p.amountPaid > 0
                                  ? p.amountPaid
                                  : sess?.price_per_participant ?? 0;
                              setMarkPaidAmount(suggested > 0 ? String(suggested) : '');
                              setMarkPaidMethod('cash');
                            }}
                          >
                            Mark paid
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-red-400 hover:text-red-300"
                          disabled={deletingParticipantId === p.id}
                          onClick={() => handleRemoveRosterParticipant(p.id, p.wrestlerName, p)}
                        >
                          {deletingParticipantId === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Remove'
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-blue-400 hover:text-blue-300"
                          onClick={() => {
                            setTransferTargetSearch('');
                            setTransferTargetSessionId('');
                            setTransferringParticipant({
                              id: p.id,
                              wrestlerName: p.wrestlerName,
                              amountPaid: p.amountPaid,
                              paid: p.paid,
                              hasStripePayment: p.hasStripePayment,
                            });
                          }}
                        >
                          Transfer
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {markPaidParticipant && (
              <div className="mt-4 p-4 rounded-lg border border-emerald-600/40 bg-emerald-600/10 space-y-3">
                <p className="font-medium text-emerald-400">
                  Mark {markPaidParticipant.wrestlerName} as paid
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Amount ($)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      className="w-28 h-9"
                      value={markPaidAmount}
                      onChange={(e) => setMarkPaidAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Method</Label>
                    <Select value={markPaidMethod} onValueChange={(v) => setMarkPaidMethod(v as typeof markPaidMethod)}>
                      <SelectTrigger className="w-28 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="venmo">Venmo</SelectItem>
                        <SelectItem value="zelle">Zelle</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={markPaidSaving || markPaidAmount.trim() === ''}
                    onClick={() => void handleMarkRosterParticipantPaid()}
                  >
                    {markPaidSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setMarkPaidParticipant(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Transfer participant form */}
            {transferringParticipant && (
              <div className="mt-4 p-4 rounded-lg border border-blue-600/50 bg-blue-600/10">
                <div className="font-medium text-blue-400 mb-2">
                  Transfer {transferringParticipant.wrestlerName} ($
                  {Number(transferringParticipant.amountPaid || 0).toFixed(2)}{' '}
                  {transferringParticipant.paid ? 'paid' : 'due — payment not completed yet'})
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transferTargetSearch">Find session (coach, facility, date)</Label>
                  <Input
                    id="transferTargetSearch"
                    className="bg-zinc-800 border-zinc-700"
                    placeholder={"e.g. O'Neill or Apr 6"}
                    value={transferTargetSearch}
                    onChange={(e) => setTransferTargetSearch(e.target.value)}
                  />
                  <Label htmlFor="transferTarget">Move to Session</Label>
                  <select
                    id="transferTarget"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                    value={transferTargetSessionId}
                    onChange={(e) => setTransferTargetSessionId(e.target.value)}
                  >
                    <option value="">Select a session...</option>
                    {transferTargetOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.athlete_name} — {formatEST(new Date(s.scheduled_datetime), 'MMM d h:mm a')} ·{' '}
                        {s.facility_name} ({s.current_participants}/{s.max_participants})
                      </option>
                    ))}
                  </select>
                  {transferTargetOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No matching sessions from today forward. Search by coach name or date. Past sessions cannot be transfer targets here.
                    </p>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTransferringParticipant(null);
                      setTransferTargetSessionId('');
                      setTransferTargetSearch('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!transferTargetSessionId || transferLoading}
                    onClick={handleTransferRegistration}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {transferLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Transfer'}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRosterSessionId(null); setTransferringParticipant(null); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
