'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Users,
  UserPlus,
  Calendar,
  CreditCard,
  DollarSign,
  Wallet,
  TrendingUp,
  TrendingDown,
  Loader2,
  Gauge,
  Eye,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
} from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { cockpitPeriodLabel, type CockpitPeriod } from '@/lib/cockpit-date-ranges';
import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function formatRange(start: string, end: string, period: CockpitPeriod): string {
  const s = new Date(start + 'T12:00:00.000Z');
  const e = new Date(end + 'T12:00:00.000Z');
  if (period === 'month') return formatEST(s, 'MMMM yyyy');
  if (period === 'year') return formatEST(s, 'yyyy');
  if (start === end) return formatEST(s, 'MMMM d, yyyy');
  return `${formatEST(s, 'MMM d')} – ${formatEST(e, 'MMM d, yyyy')}`;
}

const COCKPIT_PERIODS: CockpitPeriod[] = ['today', 'week', 'month', '90d', 'year'];

export type CockpitData = {
  date: string;
  period?: CockpitPeriod;
  range?: 'today' | 'week' | 'month';
  rangeStart?: string;
  rangeEnd?: string;
  newParents: { id: string; email: string; created_at: string }[];
  newCoaches: { id: string; name: string; school: string; created_at: string }[];
  newAthletes: { id: string; name: string; parent_id: string; created_at: string }[];
  sessionsScheduled: {
    id: string;
    scheduled_datetime: string;
    status: string;
    session_type: string;
    session_mode: string;
    coach_name: string;
    facility_name: string;
    participants: string;
  }[];
  bookings: {
    id: string;
    session_id: string;
    amount_paid: number | null;
    created_at: string;
    kid_name: string;
    coach_name: string;
    facility_name: string;
    scheduled_datetime: string;
  }[];
  payoutsPaid: number;
  payoutsPaidAllTime?: number;
  payoutsPaidList: { session_id: string; amount: number; coach_name: string }[];
  revenueThatDay: number;
  bookingEconomics?: {
    bookingCount: number;
    paidBookingCount?: number;
    gross: number;
    coachPayouts: number;
    stripeFees: number;
    guildOrgFees: number;
    remainder: number;
  };
  pageViews?: number;
  visitors?: number;
  periodUniqueDevices?: number;
  visitorsCapped?: boolean;
  analyticsDataSinceMs?: number | null;
  analyticsRowsWithoutKey?: number;
  analyticsSource?: 'vercel_api' | 'drain' | 'none';
  analyticsApiError?: string | null;
  kpiCounts?: {
    bookings: number;
    paidBookings: number;
    parents: number;
    coaches: number;
    athletes: number;
    sessions: number;
    reviews: number;
  };
  // Credits (liability)
  outstandingCredits?: number;
  creditsIssuedInRange?: number;
  creditsUsedInRange?: number;
  trends: {
    parents: number[];
    coaches: number[];
    athletes: number[];
    sessions: number[];
    bookings: number[];
    bookingGross?: number[];
    reviews: number[];
  };
  trendCumulativeTotals?: {
    parents: number[];
    coaches: number[];
    athletes: number[];
    sessions: number[];
    bookings: number[];
    bookingGross?: number[];
    reviews: number[];
  };
  trendDays: string[];
  trendLabels?: string[];
  trendPeriod?: '7d' | '90d' | '3w' | '12m';
  trendDetailParents?: { id: string; email: string; created_at: string }[];
  trendDetailCoaches?: { id: string; name: string; school: string; created_at: string }[];
  trendDetailAthletes?: { id: string; name: string; parent_id: string; created_at: string }[];
  trendDetailReviews?: {
    id: string;
    athlete_id: string;
    coach_name: string;
    reviewed_by: string;
    rating: number;
    comment: string;
    created_at: string;
  }[];
  trendDetailSessions?: {
    id: string;
    scheduled_datetime: string;
    status: string;
    session_type: string;
    session_mode: string;
    coach_name: string;
    facility_name: string;
    participants: string;
  }[];
  trendDetailBookings?: {
    id: string;
    session_id: string;
    amount_paid: number | null;
    created_at: string;
    kid_name: string;
    coach_name: string;
    facility_name: string;
    scheduled_datetime: string;
  }[];
};

const COCKPIT_TIMEZONE = 'America/New_York';

function todayInTz(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

function formatChartCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}k`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function runningSum(values: number[]): number[] {
  let s = 0;
  return values.map((v) => {
    s += v;
    return s;
  });
}

// Chart colors - computed values for Recharts
const CHART_COLORS = {
  gold: '#B89D60',
  goldLight: '#C9B078',
  blue: '#3B82F6',
  emerald: '#10B981',
  violet: '#8B5CF6',
  orange: '#F97316',
  rose: '#F43F5E',
  cyan: '#06B6D4',
  slate: '#64748B',
};

const GROWTH_LINE_SPECS: { id: keyof NonNullable<CockpitData['trendCumulativeTotals']>; label: string; color: string }[] = [
  { id: 'bookings', label: 'Bookings', color: CHART_COLORS.rose },
  { id: 'bookingGross', label: 'Gross ($)', color: CHART_COLORS.emerald },
  { id: 'athletes', label: 'Athletes', color: CHART_COLORS.cyan },
  { id: 'coaches', label: 'Coaches', color: CHART_COLORS.violet },
  { id: 'parents', label: 'Parents', color: CHART_COLORS.blue },
  { id: 'sessions', label: 'Sessions', color: CHART_COLORS.orange },
  { id: 'reviews', label: 'Reviews', color: CHART_COLORS.gold },
];

// Metric KPI card with sparkline-style mini chart
function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
  subtitle,
  sparklineData,
  variant = 'default',
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  subtitle?: string;
  sparklineData?: number[];
  variant?: 'default' | 'highlight' | 'muted';
}) {
  const sparkMax = sparklineData ? Math.max(...sparklineData, 1) : 1;
  
  return (
    <Card className={`relative overflow-hidden transition-all hover:shadow-md ${
      variant === 'highlight' 
        ? 'border-[#B89D60]/30 bg-gradient-to-br from-[#B89D60]/5 to-transparent' 
        : variant === 'muted'
        ? 'border-dashed bg-muted/20'
        : ''
    }`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="text-xs font-medium text-muted-foreground">{label}</CardDescription>
          <span className={`rounded-lg p-2 ${variant === 'highlight' ? 'bg-[#B89D60]/10' : 'bg-muted/50'}`}>
            <Icon className={`h-4 w-4 ${variant === 'highlight' ? 'text-[#B89D60]' : 'text-muted-foreground'}`} />
          </span>
        </div>
        <div className="flex items-end justify-between gap-2 mt-1">
          <CardTitle className="text-2xl font-bold tabular-nums">{value}</CardTitle>
          {trend && trendLabel && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${
              trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-muted-foreground'
            }`}>
              {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : trend === 'down' ? <ArrowDownRight className="h-3 w-3" /> : null}
              {trendLabel}
            </span>
          )}
        </div>
        {subtitle ? (
          <p className="text-[10px] leading-snug text-muted-foreground mt-1">{subtitle}</p>
        ) : null}
      </CardHeader>
      {sparklineData && sparklineData.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-8 opacity-30">
          <svg viewBox={`0 0 ${sparklineData.length * 10} 32`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`spark-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={variant === 'highlight' ? CHART_COLORS.gold : CHART_COLORS.blue} stopOpacity="0.3" />
                <stop offset="100%" stopColor={variant === 'highlight' ? CHART_COLORS.gold : CHART_COLORS.blue} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`M0,32 ${sparklineData.map((v, i) => `L${i * 10},${32 - (v / sparkMax) * 28}`).join(' ')} L${(sparklineData.length - 1) * 10},32 Z`}
              fill={`url(#spark-${label.replace(/\s/g, '')})`}
            />
            <path
              d={`M0,${32 - (sparklineData[0] / sparkMax) * 28} ${sparklineData.map((v, i) => `L${i * 10},${32 - (v / sparkMax) * 28}`).join(' ')}`}
              fill="none"
              stroke={variant === 'highlight' ? CHART_COLORS.gold : CHART_COLORS.blue}
              strokeWidth="1.5"
            />
          </svg>
        </div>
      )}
    </Card>
  );
}

// Modern Area Chart component
function ModernAreaChart({
  data,
  dataKey,
  label,
  valueFormat = 'number',
  color = CHART_COLORS.gold,
}: {
  data: { label: string; value: number }[];
  dataKey: string;
  label: string;
  valueFormat?: 'number' | 'currency';
  color?: string;
}) {
  return (
    <ChartContainer
      config={{
        [dataKey]: {
          label,
          color,
        },
      }}
      className="h-[280px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis 
            dataKey="label" 
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => valueFormat === 'currency' ? formatChartCurrency(v) : v}
            width={48}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <span className="font-semibold">
                    {valueFormat === 'currency' ? formatChartCurrency(Number(value)) : value}
                  </span>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#gradient-${dataKey})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: color, fill: 'hsl(var(--background))' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

// Modern Bar Chart component
function ModernBarChart({
  data,
  dataKey,
  label,
  valueFormat = 'number',
  color = CHART_COLORS.gold,
}: {
  data: { label: string; value: number }[];
  dataKey: string;
  label: string;
  valueFormat?: 'number' | 'currency';
  color?: string;
}) {
  return (
    <ChartContainer
      config={{
        [dataKey]: {
          label,
          color,
        },
      }}
      className="h-[280px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => valueFormat === 'currency' ? formatChartCurrency(v) : v}
            width={48}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <span className="font-semibold">
                    {valueFormat === 'currency' ? formatChartCurrency(Number(value)) : value}
                  </span>
                )}
              />
            }
          />
          <Bar
            dataKey="value"
            fill={color}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

// Multi-line growth chart
function MultiLineGrowthChart({
  data,
  visible,
  onToggle,
}: {
  data: { label: string; [key: string]: string | number }[];
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const activeLines = GROWTH_LINE_SPECS.filter(s => visible[s.id] !== false);
  
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {GROWTH_LINE_SPECS.map((spec) => (
          <button
            key={spec.id}
            type="button"
            onClick={() => onToggle(spec.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
              visible[spec.id] !== false 
                ? 'border-[#B89D60]/50 bg-[#B89D60]/10 text-foreground' 
                : 'border-border bg-muted/30 text-muted-foreground opacity-60 hover:opacity-100'
            }`}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: spec.color }} />
            {spec.label}
          </button>
        ))}
      </div>
      
      <ChartContainer
        config={Object.fromEntries(GROWTH_LINE_SPECS.map(s => [s.id, { label: s.label, color: s.color }]))}
        className="h-[320px] w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
            />
            {activeLines.map((spec) => (
              <Line
                key={spec.id}
                type="monotone"
                dataKey={spec.id}
                name={spec.label}
                stroke={spec.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: spec.color, fill: 'hsl(var(--background))' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}

// Loading skeleton for the dashboard
function CockpitSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[360px] w-full rounded-lg" />
      <Skeleton className="h-[360px] w-full rounded-lg" />
    </div>
  );
}

export function AdminCockpitView() {
  const today = todayInTz(COCKPIT_TIMEZONE);
  const [date, setDate] = useState(today);
  const [period, setPeriod] = useState<CockpitPeriod>('today');
  const [trendMetric, setTrendMetric] = useState<
    'parents' | 'coaches' | 'athletes' | 'sessions' | 'bookings' | 'bookingGross' | 'reviews'
  >('bookings');
  const [reviewCoachFilter, setReviewCoachFilter] = useState<string>('');
  const [reviewStarFilter, setReviewStarFilter] = useState<number | 'all'>('all');
  const [trendChartStyle, setTrendChartStyle] = useState<'area' | 'bar'>('area');
  const [activityMode, setActivityMode] = useState<'runningTotal' | 'perPeriod'>('perPeriod');
  const [growthLineVisible, setGrowthLineVisible] = useState<Record<string, boolean>>(() => {
    const o = Object.fromEntries(GROWTH_LINE_SPECS.map((s) => [s.id, true])) as Record<string, boolean>;
    o.bookingGross = false;
    return o;
  });
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/cockpit?date=${date}&period=${period}&timezone=${encodeURIComponent(COCKPIT_TIMEZONE)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch(() => {
        setError('Failed to load cockpit data');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [date, period]);

  const reviewsAll = data?.trendDetailReviews ?? [];
  const filteredReviews = useMemo(() => {
    return reviewsAll.filter((r) => {
      if (reviewCoachFilter && r.athlete_id !== reviewCoachFilter) return false;
      if (reviewStarFilter !== 'all' && r.rating !== reviewStarFilter) return false;
      return true;
    });
  }, [reviewsAll, reviewCoachFilter, reviewStarFilter]);

  const reviewCoachOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reviewsAll) {
      if (r.athlete_id) map.set(r.athlete_id, r.coach_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [reviewsAll]);

  useEffect(() => {
    if (trendMetric !== 'reviews') {
      setReviewCoachFilter('');
      setReviewStarFilter('all');
    }
  }, [trendMetric]);

  if (loading && !data) {
    return <CockpitSkeleton />;
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
            <TrendingDown className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-destructive font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const d = data!;
  const trends = d.trends ?? {
    parents: [], coaches: [], athletes: [], sessions: [], bookings: [], bookingGross: [], reviews: [],
  };
  const trendDays = d.trendDays ?? [];
  const trendLabels = d.trendLabels ?? trendDays.map((ds) => formatEST(new Date(ds + 'T12:00:00'), 'M/d'));

  const trendMetrics = [
    { id: 'parents' as const, label: 'Parents', values: trends.parents ?? [], icon: UserPlus },
    { id: 'coaches' as const, label: 'Coaches', values: trends.coaches ?? [], icon: Users },
    { id: 'athletes' as const, label: 'Athletes', values: trends.athletes ?? [], icon: Users },
    { id: 'sessions' as const, label: 'Sessions', values: trends.sessions ?? [], icon: Calendar },
    { id: 'bookings' as const, label: 'Bookings', values: trends.bookings ?? [], icon: CreditCard },
    { id: 'bookingGross' as const, label: 'Booking $', values: trends.bookingGross ?? [], icon: DollarSign },
    { id: 'reviews' as const, label: 'Reviews', values: trends.reviews ?? [], icon: Star },
  ];

  const be = d.bookingEconomics;
  const kpi = d.kpiCounts;
  const bookingN = kpi?.bookings ?? be?.bookingCount ?? d.bookings.length;
  const paidBookingN = kpi?.paidBookings ?? be?.paidBookingCount ?? bookingN;
  const parentN = kpi?.parents ?? d.newParents.length;
  const coachN = kpi?.coaches ?? d.newCoaches.length;
  const athleteN = kpi?.athletes ?? d.newAthletes.length;
  const sessionN = kpi?.sessions ?? d.sessionsScheduled.length;

  // Prepare chart data for activity
  const selectedMetric = trendMetrics.find((m) => m.id === trendMetric);
  const rawValues = selectedMetric?.values.slice(0, trendLabels.length) ?? [];
  const chartValues = activityMode === 'runningTotal' ? runningSum(rawValues) : rawValues;
  const activityChartData = trendLabels.map((label, i) => ({
    label,
    value: chartValues[i] ?? 0,
  }));

  // Prepare growth chart data
  const growthChartData = trendLabels.map((label, i) => {
    const row: { label: string; [key: string]: string | number } = { label };
    for (const spec of GROWTH_LINE_SPECS) {
      const cumulative = d.trendCumulativeTotals?.[spec.id] ?? [];
      row[spec.id] = cumulative[i] ?? 0;
    }
    return row;
  });

  return (
    <div className="space-y-6">
      {/* Modern filter bar */}
      <Card className="border-[#B89D60]/20 bg-gradient-to-r from-[#B89D60]/5 via-transparent to-transparent">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#B89D60]/10">
                <Gauge className="h-5 w-5 text-[#B89D60]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Command Center</h2>
                <p className="text-xs text-muted-foreground">Real-time business insights</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
              <div className="flex items-center rounded-lg border border-border bg-background p-1 overflow-x-auto">
                {COCKPIT_PERIODS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPeriod(p);
                      if (p === 'today') setDate(todayInTz(COCKPIT_TIMEZONE));
                    }}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-all ${
                      period === p
                        ? 'bg-[#B89D60] text-black shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {cockpitPeriodLabel(p)}
                  </button>
                ))}
              </div>

              {period !== 'today' && (
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-40 bg-background"
                  aria-label="End date for selected period"
                />
              )}

              {data?.rangeStart && data?.rangeEnd && (
                <span className="text-sm font-medium text-muted-foreground">
                  {formatRange(data.rangeStart, data.rangeEnd, period)}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 border-[#B89D60]/30 bg-gradient-to-br from-[#B89D60]/10 via-[#B89D60]/5 to-transparent">
          <CardContent className="py-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  {cockpitPeriodLabel(period)} Revenue
                </p>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold tabular-nums">${d.revenueThatDay.toFixed(0)}</span>
                  {paidBookingN > 0 && d.revenueThatDay > 0 && (
                    <span className="text-lg text-muted-foreground">
                      ~${(d.revenueThatDay / paidBookingN).toFixed(0)}/paid signup
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums">{bookingN}</p>
                  <p className="text-muted-foreground">Bookings</p>
                  {paidBookingN !== bookingN && (
                    <p className="text-[10px] text-muted-foreground">{paidBookingN} paid</p>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums">{parentN}</p>
                  <p className="text-muted-foreground">New Parents</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums">{sessionN}</p>
                  <p className="text-muted-foreground">Sessions created</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {be && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm pb-2 border-b border-border">
                <span className="font-medium text-foreground">Gross revenue</span>
                <span className="font-semibold tabular-nums">${be.gross.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Coach payouts</span>
                <span className="font-medium tabular-nums">${be.coachPayouts.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stripe fees</span>
                <span className="font-medium tabular-nums">${be.stripeFees.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Guild net (after Stripe)</span>
                <span className="font-medium tabular-nums text-[#B89D60]">${be.guildOrgFees.toFixed(2)}</span>
              </div>
              {Math.abs(be.remainder) >= 0.01 && (
                <div className="border-t border-border pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Unallocated</span>
                    <span className="font-medium tabular-nums">${be.remainder.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Metric cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <MetricCard
          label="Gross Revenue"
          value={`$${d.revenueThatDay.toFixed(0)}`}
          icon={DollarSign}
          sparklineData={trends.bookingGross}
          variant="highlight"
        />
        <MetricCard
          label="Bookings"
          value={bookingN}
          icon={CreditCard}
          sparklineData={trends.bookings}
          subtitle={paidBookingN !== bookingN ? `${paidBookingN} paid` : undefined}
        />
        <MetricCard
          label="New Parents"
          value={parentN}
          icon={UserPlus}
          sparklineData={trends.parents}
        />
        <MetricCard
          label="New Coaches"
          value={coachN}
          icon={Users}
          sparklineData={trends.coaches}
        />
        <MetricCard
          label="New wrestlers"
          value={athleteN}
          icon={Users}
          sparklineData={trends.athletes}
        />
        <MetricCard
          label="Visitors"
          value={typeof d.visitors === 'number' ? d.visitors.toLocaleString() : '—'}
          icon={Eye}
          variant="muted"
          subtitle={(() => {
            const parts: string[] = [];
            if (d.analyticsApiError && d.analyticsSource !== 'vercel_api') {
              parts.push(d.analyticsApiError);
            } else if (d.analyticsSource === 'vercel_api') {
              parts.push('Vercel Analytics');
            } else if (d.analyticsSource === 'drain') {
              parts.push('Partial drain data');
            }
            if (typeof d.pageViews === 'number') {
              parts.push(`${d.pageViews.toLocaleString()} page views`);
            }
            if (d.analyticsSource === 'drain' && typeof d.periodUniqueDevices === 'number' && d.periodUniqueDevices > 0) {
              parts.push(`${d.periodUniqueDevices.toLocaleString()} devices`);
            }
            if (d.visitorsCapped) parts.push('partial (range too large)');
            if (d.analyticsDataSinceMs != null && d.rangeStart && d.analyticsSource === 'drain') {
              const dataSinceYmd = formatEST(new Date(d.analyticsDataSinceMs), 'yyyy-MM-dd');
              if (dataSinceYmd > d.rangeStart) {
                parts.push(`since ${formatEST(new Date(d.analyticsDataSinceMs), 'MMM d')}`);
              }
            }
            if (parts.length === 0) {
              return 'Add VERCEL_ACCESS_TOKEN for Vercel dashboard numbers';
            }
            return parts.join(' · ');
          })()}
        />
      </div>

      {/* Activity Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#B89D60]" />
                Activity Trends
              </CardTitle>
              <CardDescription className="mt-1">
                {activityMode === 'runningTotal' 
                  ? 'Cumulative values over the selected period' 
                  : 'New records per period'}
              </CardDescription>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Metric selector */}
              <div className="flex items-center rounded-lg border border-border bg-background p-1 overflow-x-auto">
                {trendMetrics.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTrendMetric(m.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all ${
                      trendMetric === m.id 
                        ? 'bg-[#B89D60] text-black' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <m.icon className="h-3 w-3" />
                    {m.label}
                  </button>
                ))}
              </div>
              
              {/* Chart style */}
              <div className="flex items-center rounded-lg border border-border bg-background p-1">
                <button
                  type="button"
                  onClick={() => setTrendChartStyle('area')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    trendChartStyle === 'area' 
                      ? 'bg-foreground text-background' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  Area
                </button>
                <button
                  type="button"
                  onClick={() => setTrendChartStyle('bar')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    trendChartStyle === 'bar' 
                      ? 'bg-foreground text-background' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  Bar
                </button>
              </div>
              
              {/* Mode toggle */}
              <div className="flex items-center rounded-lg border border-border bg-background p-1">
                <button
                  type="button"
                  onClick={() => setActivityMode('runningTotal')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activityMode === 'runningTotal' 
                      ? 'bg-foreground text-background' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  Cumulative
                </button>
                <button
                  type="button"
                  onClick={() => setActivityMode('perPeriod')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activityMode === 'perPeriod' 
                      ? 'bg-foreground text-background' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  Per Period
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {trendChartStyle === 'area' ? (
            <ModernAreaChart
              data={activityChartData}
              dataKey={trendMetric}
              label={selectedMetric?.label ?? ''}
              valueFormat={trendMetric === 'bookingGross' ? 'currency' : 'number'}
              color={CHART_COLORS.gold}
            />
          ) : (
            <ModernBarChart
              data={activityChartData}
              dataKey={trendMetric}
              label={selectedMetric?.label ?? ''}
              valueFormat={trendMetric === 'bookingGross' ? 'currency' : 'number'}
              color={CHART_COLORS.gold}
            />
          )}
        </CardContent>
      </Card>

      {/* Platform Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Platform Growth (All-Time)
          </CardTitle>
          <CardDescription>
            Cumulative totals showing how the platform has grown over time. Toggle metrics to compare different growth curves.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {d.trendCumulativeTotals ? (
            <MultiLineGrowthChart
              data={growthChartData}
              visible={growthLineVisible}
              onToggle={(id) =>
                setGrowthLineVisible((prev) => ({
                  ...prev,
                  [id]: !(prev[id] !== false),
                }))
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Growth data not available. Update the API to enable this feature.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {trendMetric === 'parents' && <UserPlus className="h-4 w-4" />}
            {trendMetric === 'coaches' && <Users className="h-4 w-4" />}
            {trendMetric === 'athletes' && <Users className="h-4 w-4" />}
            {trendMetric === 'sessions' && <Calendar className="h-4 w-4" />}
            {trendMetric === 'bookings' && <CreditCard className="h-4 w-4" />}
            {trendMetric === 'bookingGross' && <DollarSign className="h-4 w-4" />}
            {trendMetric === 'reviews' && <Star className="h-4 w-4" />}
            {selectedMetric?.label ?? ''} Details
          </CardTitle>
          <CardDescription>
            {data?.rangeStart && data?.rangeEnd
              ? formatRange(data.rangeStart, data.rangeEnd, period)
              : cockpitPeriodLabel(period)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trendMetric === 'parents' && (d.trendDetailParents ?? []).length > 0 && (
            <div className="space-y-2">
              {(d.trendDetailParents ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                  <a href={`mailto:${p.email}`} className="text-sm text-[#B89D60] hover:underline truncate">{p.email}</a>
                  <span className="text-xs text-muted-foreground shrink-0">{formatEST(new Date(p.created_at), 'MMM d h:mm a')}</span>
                </div>
              ))}
            </div>
          )}
          
          {trendMetric === 'coaches' && (d.trendDetailCoaches ?? []).length > 0 && (
            <div className="space-y-2">
              {(d.trendDetailCoaches ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                  <Link href={`/athlete/${c.id}`} className="text-sm text-[#B89D60] hover:underline">{c.name}</Link>
                  <span className="text-xs text-muted-foreground shrink-0">{c.school} · {formatEST(new Date(c.created_at), 'MMM d')}</span>
                </div>
              ))}
            </div>
          )}
          
          {trendMetric === 'athletes' && (d.trendDetailAthletes ?? []).length > 0 && (
            <div className="space-y-2">
              {(d.trendDetailAthletes ?? []).map((y) => (
                <div key={y.id} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                  <Link href={`/wrestlers/${y.id}`} className="text-sm text-[#B89D60] hover:underline">{y.name}</Link>
                  <span className="text-xs text-muted-foreground shrink-0">{formatEST(new Date(y.created_at), 'MMM d h:mm a')}</span>
                </div>
              ))}
            </div>
          )}
          
          {trendMetric === 'sessions' && (d.trendDetailSessions ?? []).length > 0 && (
            <div className="space-y-2">
              {(d.trendDetailSessions ?? []).map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                  <Link href={`/admin/sessions/${s.id}/edit`} className="text-sm text-[#B89D60] hover:underline">{s.coach_name} · {s.facility_name}</Link>
                  <span className="text-xs text-muted-foreground">{formatEST(new Date(s.scheduled_datetime), 'MMM d h:mm a')} · {s.participants}</span>
                </div>
              ))}
            </div>
          )}
          
          {trendMetric === 'bookingGross' && (
            <p className="text-sm text-muted-foreground py-4">
              See the chart above for totals. For individual signup details, switch to <strong className="text-foreground">Bookings</strong>.
            </p>
          )}
          
          {trendMetric === 'bookings' && (d.trendDetailBookings ?? []).length > 0 && (
            <div className="space-y-2">
              {(d.trendDetailBookings ?? []).map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                  <span className="text-sm">{b.kid_name ?? '—'} · {b.coach_name} · {b.facility_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.amount_paid != null ? `$${b.amount_paid.toFixed(2)}` : '—'}
                    {b.created_at ? ` · ${formatEST(new Date(b.created_at), 'MMM d')}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {trendMetric === 'reviews' && (d.trendDetailReviews ?? []).length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5 min-w-[180px]">
                  <label htmlFor="cockpit-review-coach" className="text-xs font-medium text-muted-foreground">
                    Coach
                  </label>
                  <Select
                    value={reviewCoachFilter || 'all'}
                    onValueChange={(v) => setReviewCoachFilter(v === 'all' ? '' : v)}
                  >
                    <SelectTrigger id="cockpit-review-coach" className="h-9 w-[min(100%,220px)]">
                      <SelectValue placeholder="All coaches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All coaches</SelectItem>
                      {reviewCoachOptions.map(([id, name]) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 min-w-[140px]">
                  <label htmlFor="cockpit-review-stars" className="text-xs font-medium text-muted-foreground">
                    Stars
                  </label>
                  <Select
                    value={reviewStarFilter === 'all' ? 'all' : String(reviewStarFilter)}
                    onValueChange={(v) =>
                      setReviewStarFilter(v === 'all' ? 'all' : (Number(v) as 1 | 2 | 3 | 4 | 5))
                    }
                  >
                    <SelectTrigger id="cockpit-review-stars" className="h-9 w-[min(100%,180px)]">
                      <SelectValue placeholder="All ratings" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ratings</SelectItem>
                      {[5, 4, 3, 2, 1].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} star{n === 1 ? '' : 's'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {filteredReviews.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No reviews match your filters.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Coach</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Reviewed by</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rating</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReviews.map((r) => (
                        <tr key={r.id} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-medium">{r.coach_name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{r.reviewed_by}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex gap-0.5" aria-label={`${r.rating} stars`}>
                              {[1, 2, 3, 4, 5].map((i) => (
                                <Star
                                  key={i}
                                  className={`h-4 w-4 ${i <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
                                />
                              ))}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">
                            {r.comment || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          
          {(
            (trendMetric === 'parents' && (d.trendDetailParents ?? []).length === 0) ||
            (trendMetric === 'coaches' && (d.trendDetailCoaches ?? []).length === 0) ||
            (trendMetric === 'athletes' && (d.trendDetailAthletes ?? []).length === 0) ||
            (trendMetric === 'sessions' && (d.trendDetailSessions ?? []).length === 0) ||
            (trendMetric === 'bookings' && (d.trendDetailBookings ?? []).length === 0) ||
            (trendMetric === 'reviews' && (d.trendDetailReviews ?? []).length === 0)
          ) && (
            <p className="text-sm text-muted-foreground py-8 text-center">No records in this period.</p>
          )}
        </CardContent>
      </Card>

      {/* Payouts section */}
      {(d.payoutsPaidList.length > 0 || d.payoutsPaid > 0 || (d.payoutsPaidAllTime ?? 0) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-500" />
              Payouts This Period
            </CardTitle>
            <CardDescription>
              Period total: <span className="font-semibold text-foreground">${d.payoutsPaid.toFixed(2)}</span>
              {d.payoutsPaidAllTime != null && (
                <span className="ml-2">
                  · All-time: <span className="font-semibold text-foreground">${d.payoutsPaidAllTime.toFixed(2)}</span>
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {d.payoutsPaidList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No individual session breakdown.</p>
            ) : (
              <div className="space-y-2">
                {d.payoutsPaidList.map((p) => (
                  <div key={p.session_id} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm">{p.coach_name}</span>
                    <span className="font-medium tabular-nums">${p.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <Link href="/admin?tab=payouts" className="inline-flex items-center gap-1 mt-4 text-sm text-[#B89D60] hover:underline">
              Manage all payouts
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Credits (Liability) */}
      {(d.outstandingCredits ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-amber-500" />
              Outstanding Credits
            </CardTitle>
            <CardDescription>
              Credits owed to parents (from reschedules/cancellations)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total outstanding</span>
              <span className="font-medium tabular-nums text-amber-500">${(d.outstandingCredits ?? 0).toFixed(2)}</span>
            </div>
            {(d.creditsIssuedInRange ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Issued this period</span>
                <span className="font-medium tabular-nums">+${(d.creditsIssuedInRange ?? 0).toFixed(2)}</span>
              </div>
            )}
            {(d.creditsUsedInRange ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Redeemed this period</span>
                <span className="font-medium tabular-nums text-emerald-500">-${(d.creditsUsedInRange ?? 0).toFixed(2)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {d.newParents.length === 0 &&
        d.newCoaches.length === 0 &&
        d.newAthletes.length === 0 &&
        d.sessionsScheduled.length === 0 &&
        d.bookings.length === 0 &&
        d.payoutsPaidList.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                <Calendar className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                No activity {d.rangeStart && d.rangeEnd ? `for ${formatRange(d.rangeStart, d.rangeEnd, period)}` : `for ${cockpitPeriodLabel(period).toLowerCase()}`}.
              </p>
              <p className="text-sm text-muted-foreground mt-1">Change the period or check back later.</p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
