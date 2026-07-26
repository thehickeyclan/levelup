import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { normalizeCoachRevenueShareRate } from '@/lib/pricing';
import {
  fetchPastSessionsForCoachEarnings,
  summarizeCoachEarningsFromPastSessions,
} from '@/lib/coach-earnings-summary-server';

export const dynamic = 'force-dynamic';

function startOfWeek(now: Date): number {
  const date = new Date(now);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export async function GET() {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userRow } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (userRow?.role !== 'coach' && userRow?.role !== 'admin') {
      return NextResponse.json({ error: 'Coach access required' }, { status: 403 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: coach } = await admin
      .from('athletes')
      .select('payout_rate')
      .eq('id', user.id)
      .maybeSingle();
    const payoutRate = normalizeCoachRevenueShareRate(
      coach?.payout_rate != null ? Number(coach.payout_rate) : null
    );
    const now = new Date();
    const nowIso = now.toISOString();
    const past = await fetchPastSessionsForCoachEarnings(admin, user.id, nowIso);
    const summary = summarizeCoachEarningsFromPastSessions(past, payoutRate, nowIso);
    const weekStart = startOfWeek(now);
    const thisWeekEarnings = summary.thisMonthSessions.reduce((total, session) => {
      const anchor = session.completed_at ?? session.scheduled_datetime;
      if (!anchor || new Date(anchor).getTime() < weekStart) return total;
      return total + summary.getSessionPayout(session);
    }, 0);

    return NextResponse.json({
      earnings: {
        thisWeek: Math.round(thisWeekEarnings * 100) / 100,
        thisMonth: Math.round(summary.thisMonthEarnings * 100) / 100,
        allTime: Math.round(summary.allTimeEarnings * 100) / 100,
        pending: Math.round(summary.pendingPayoutAmount * 100) / 100,
        pendingSessions: summary.pendingPayoutSessionCount,
      },
    });
  } catch (error) {
    console.error('mobile coach overview:', error);
    return NextResponse.json({ error: 'Could not load coach overview' }, { status: 500 });
  }
}
