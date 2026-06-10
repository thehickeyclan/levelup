import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SessionRegisterClient } from './register-client';
import { SessionRosterList } from '@/components/session-roster-badges';
import {
  buildSessionRosterParticipant,
  type SessionRosterParticipant,
} from '@/lib/wrestler-roster-display';
import { User, Calendar, MapPin, Users } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { SchoolLogo } from '@/components/school-logo';
import { hasMinPhoneDigits } from '@/lib/phone';
import {
  ensureAutoFamilyDiscountForParent,
  effectivePercentOffForCheckout,
} from '@/lib/family-auto-discount';
import {
  checkoutAllowSavedAccountPercent,
  displayPercentForPromoOnlyCheckout,
} from '@/lib/checkout-promo';
import { sessionPricePerParticipantUsd } from '@/lib/session-price';

export default async function SessionRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wrestler?: string; code?: string; invite?: string }>;
}) {
  const { id: sessionId } = await params;
  const sp = await searchParams;
  const preselectedWrestlerId = sp.wrestler?.trim() || '';
  const partnerInviteFromUrl = (sp.code ?? sp.invite ?? '').trim().toUpperCase();
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const registerPath =
      partnerInviteFromUrl !== ''
        ? `/sessions/${sessionId}/register?code=${encodeURIComponent(partnerInviteFromUrl)}`
        : `/sessions/${sessionId}/register`;
    redirect(`/login?redirect=${encodeURIComponent(registerPath)}`);
  }

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = userData?.role;
  if (role !== 'parent' && role !== 'admin' && role !== 'coach' && role !== 'youth_wrestler') redirect('/dashboard');

  const sessionSelect = `
      id,
      parent_id,
      status,
      join_policy,
      partner_invite_code,
      athlete_id,
      session_mode,
      session_type,
      scheduled_datetime,
      current_participants,
      max_participants,
      price_per_participant,
      total_price,
      athletes(id, first_name, last_name, school, photo_url),
      facilities(id, name, address)
    `;

  const admin = createAdminClient(tenant.slug);

  let { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select(sessionSelect)
    .eq('id', sessionId)
    .in('status', ['scheduled', 'completed'])
    .single();

  if (sessionErr || !session) {
    if (partnerInviteFromUrl) {
      const { data: sAdmin } = await admin
        .from('sessions')
        .select(sessionSelect)
        .eq('id', sessionId)
        .eq('partner_invite_code', partnerInviteFromUrl)
        .in('status', ['scheduled', 'completed'])
        .maybeSingle();
      if (sAdmin) {
        session = sAdmin;
        sessionErr = null;
      }
    }
    if (sessionErr || !session) {
      const { data: sLate } = await admin
        .from('sessions')
        .select(sessionSelect)
        .eq('id', sessionId)
        .in('join_policy', ['public', 'invite_only'])
        .in('status', ['scheduled', 'completed'])
        .maybeSingle();
      if (sLate) {
        session = sLate;
        sessionErr = null;
      }
    }
  }

  if (sessionErr || !session) notFound();

  const s = session as {
    parent_id?: string;
    status?: string;
    join_policy?: string;
    partner_invite_code?: string | null;
    session_type?: string;
    scheduled_datetime?: string;
    current_participants?: number;
    max_participants?: number;
    price_per_participant?: number;
    athletes?: { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string } | { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string }[];
    facilities?: { id: string; name?: string; address?: string } | { id: string; name?: string; address?: string }[];
  };

  const current = s.current_participants ?? 1;
  const max = s.max_participants ?? 2;

  // Youth wrestlers this user can add (primary parent or linked parent)
  const { data: primaryIds } = await supabase
    .from('youth_wrestlers')
    .select('id')
    .eq('parent_id', user.id)
    .eq('active', true);
  const { data: linkedRows } = await supabase
    .from('youth_wrestler_parents')
    .select('youth_wrestler_id')
    .eq('parent_id', user.id);
  const linkedIds = [...new Set((linkedRows ?? []).map((r: { youth_wrestler_id: string }) => r.youth_wrestler_id))];
  const allIds = [...new Set([...(primaryIds ?? []).map((r: { id: string }) => r.id), ...linkedIds, user.id])];

  const { data: familyParticipantRows } =
    allIds.length > 0
      ? await admin
          .from('session_participants')
          .select('id, paid, youth_wrestler_id')
          .eq('session_id', sessionId)
          .in('youth_wrestler_id', allIds)
      : { data: [] };

  const unpaidFamilySpot = (familyParticipantRows ?? []).find(
    (r) => (r as { paid?: boolean | null }).paid === false
  ) as { id: string; youth_wrestler_id?: string } | undefined;
  const hasFamilySpot = (familyParticipantRows ?? []).length > 0;

  const isOwner = s.parent_id === user.id;
  const pinv = (s.partner_invite_code ?? '').trim().toUpperCase();
  const inviteVerified = Boolean(partnerInviteFromUrl && pinv === partnerInviteFromUrl);
  if (
    !isOwner &&
    s.join_policy !== 'public' &&
    s.join_policy !== 'invite_only' &&
    !inviteVerified &&
    !hasFamilySpot
  ) {
    notFound();
  }

  if (current >= max && !unpaidFamilySpot) notFound();

  const rawPrice = s.price_per_participant;
  const pricePer = sessionPricePerParticipantUsd(rawPrice);
  const isSmallGroup =
    s.session_type === 'group' ||
    s.session_type === '2-athlete' ||
    s.session_type === 'small_group' ||
    (max >= 2 && s.session_type !== '1-on-1');
  const { data: youthWrestlersRaw } = allIds.length > 0
    ? await supabase
        .from('youth_wrestlers')
        .select('id, first_name, last_name, age, weight_class, skill_level, phone')
        .in('id', allIds)
        .eq('active', true)
        .order('created_at', { ascending: false })
    : { data: [] };
  const youthWrestlers = (youthWrestlersRaw ?? []).map((yw) => {
    const row = yw as { phone?: string | null; id: string; first_name?: string; last_name?: string; age?: number; weight_class?: string; skill_level?: string };
    const { phone, ...rest } = row;
    return { ...rest, hasValidCell: hasMinPhoneDigits(phone) };
  });

  const unpaidWrestlerId = unpaidFamilySpot?.youth_wrestler_id ?? '';
  const defaultWrestlerId =
    preselectedWrestlerId && youthWrestlers.some((yw) => yw.id === preselectedWrestlerId)
      ? preselectedWrestlerId
      : unpaidWrestlerId && youthWrestlers.some((yw) => yw.id === unpaidWrestlerId)
        ? unpaidWrestlerId
        : '';

  const coach = Array.isArray(s.athletes) ? s.athletes[0] : s.athletes;
  const fac = Array.isArray(s.facilities) ? s.facilities[0] : s.facilities;
  const dt = s.scheduled_datetime ? new Date(s.scheduled_datetime) : null;
  const isLatePayment =
    s.status === 'completed' || (dt != null && !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now());

  if (role === 'parent' && checkoutAllowSavedAccountPercent()) {
    await ensureAutoFamilyDiscountForParent(admin, user.id, user.email);
  }
  let percentOff: number | null = null;
  let priceAfterDiscount: number | null = null;
  if (!isOwner) {
    if (checkoutAllowSavedAccountPercent()) {
      const { data: pctDiscount } = await admin
        .from('parent_percentage_discounts')
        .select('percent_off')
        .eq('parent_id', user.id)
        .maybeSingle();
      const effPct = effectivePercentOffForCheckout(pctDiscount?.percent_off, user.email);
      percentOff = effPct >= 1 ? effPct : null;
    } else {
      const implicit = await displayPercentForPromoOnlyCheckout(admin, user.email);
      percentOff = implicit >= 1 ? implicit : null;
    }
    priceAfterDiscount =
      percentOff != null && pricePer > 0 ? pricePer * (1 - percentOff / 100) : null;
  }

  const { data: participants } = await admin
    .from('session_participants')
    .select(
      'youth_wrestlers(id, first_name, last_name, age, weight_class, skill_level, graduation_year)'
    )
    .eq('session_id', sessionId);
  const rosterParticipants = (participants ?? [])
    .map((p) => {
      const raw = (
        p as {
          youth_wrestlers?:
            | {
                first_name?: string;
                last_name?: string;
                age?: number;
                weight_class?: string;
                skill_level?: string;
                graduation_year?: number;
              }
            | Array<{
                first_name?: string;
                last_name?: string;
                age?: number;
                weight_class?: string;
                skill_level?: string;
                graduation_year?: number;
              }>
            | null;
        }
      ).youth_wrestlers;
      const yw = Array.isArray(raw) ? raw[0] : raw;
      return yw ? buildSessionRosterParticipant(yw) : null;
    })
    .filter((r): r is SessionRosterParticipant => r != null);

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <div className="mb-4">
        <BackLink fallbackHref="/find-training" label="Back to Training" />
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            {isOwner
              ? 'Add your wrestler to this session'
              : isLatePayment
                ? 'Complete payment for session'
                : 'Pay & register for session'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? 'Choose a wrestler to add. No extra charge — you’re the session owner.'
              : isLatePayment
                ? 'Choose your wrestler and pay by card or wallet credit.'
                : 'Choose a wrestler and pay to secure the spot. You’ll complete payment on the next screen.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLatePayment && !isOwner && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200/90">
              This session has already taken place. You can still complete payment here if you owe the coach.
            </div>
          )}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              {coach ? `${(coach as { first_name?: string; last_name?: string }).first_name ?? ''} ${(coach as { first_name?: string; last_name?: string }).last_name ?? ''}`.trim() : '—'}
              {coach?.school && (
                <>
                  <SchoolLogo school={(coach as { school?: string }).school ?? ''} size="sm" />
                  <span className="text-muted-foreground text-sm">({(coach as { school?: string }).school})</span>
                </>
              )}
            </p>
            {dt && (
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {formatEST(dt, 'EEEE, MMM d, yyyy')} at {formatEST(dt, 'h:mm a')}
              </p>
            )}
            {fac && (
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {(fac as { name?: string }).name}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {current} / {max} participants
              {!isOwner && pricePer > 0 && (
                <>
                  {' · '}
                  {priceAfterDiscount != null ? (
                    <>
                      <strong>${priceAfterDiscount.toFixed(2)}</strong> per spot
                      <span className="text-muted-foreground/80"> ({(percentOff ?? 0)}% off)</span>
                    </>
                  ) : (
                    <>
                      <strong>${Number(pricePer).toFixed(2)}</strong> per spot
                    </>
                  )}
                </>
              )}
            </p>
            {rosterParticipants.length > 0 && (
              <SessionRosterList participants={rosterParticipants} className="pt-1" />
            )}
          </div>
          <SessionRegisterClient
            sessionId={sessionId}
            isOwner={!!isOwner}
            isSmallGroup={isSmallGroup}
            pricePerParticipant={pricePer}
            priceAfterDiscount={priceAfterDiscount ?? undefined}
            percentOff={percentOff ?? undefined}
            youthWrestlers={youthWrestlers as Array<{ id: string; first_name?: string; last_name?: string; age?: number; weight_class?: string; skill_level?: string; hasValidCell: boolean }>}
            checkoutUsesSavedAccountDiscount={checkoutAllowSavedAccountPercent()}
            initialWrestlerId={defaultWrestlerId}
            partnerInviteCode={partnerInviteFromUrl || undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
