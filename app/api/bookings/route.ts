import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { generateInviteCode } from '@/lib/sessions';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import { createNotification } from '@/lib/notifications';
import type { SessionMode, JoinPolicy } from '@/types';
import { easternWallDateTimeToUtcIso, formatEST } from '@/lib/format-date';
import { hasMinPhoneDigits } from '@/lib/phone';
import { maybeBackfillRosterSnapshot } from '@/lib/session-roster-snapshot';
import { ensureAutoFamilyDiscountForParent } from '@/lib/family-auto-discount';
import { checkoutAllowSavedAccountPercent, resolveCheckoutPercentOff } from '@/lib/checkout-promo';
import { normalizeCoachOrWrestlerId, verifyCoachForParentBooking } from '@/lib/server-booking-coach';
import { isPennyTestPricingEnabled } from '@/lib/penny-test-pricing';
import { resolveCoachPayoutRate } from '@/lib/coach-session-payout';
import { notifyCoachAndAdminsNewBooking } from '@/lib/twilio';
import { COACH_SESSION_OVERLAP_ERROR, findCoachSessionTimeOverlap } from '@/lib/coach-session-overlap';
import { applyCredits, getUserCreditBalance } from '@/lib/credits';
import { publicOriginForStripeRedirect } from '@/lib/stripe-redirect-origin';
import { getCoachFacilityIds } from '@/lib/coach-facilities';
import { fetchCoachDaySlotsMerged } from '@/lib/fetch-coach-day-slots';
import { normalizeRequestSlotHHmm } from '@/lib/availability';

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'parent' && userData?.role !== 'admin') {
      return NextResponse.json(
        {
          error:
            'Booking is only available for parent accounts. Sign in with a parent login, or contact us if you signed up under the wrong account type.',
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      athleteId: string;
      facilityId: string | null;
      youthWrestlerIds: string[];
      sessionMode: SessionMode;
      partnerOption?: 'invite' | 'open';
      joinPolicy?: JoinPolicy;
      scheduledDate: string;
      scheduledTime: string;
      totalPrice: number;
      pricePerParticipant?: number;
      productId?: string;
      promoCode?: string;
      /** When false, do not apply wallet credits. Default true. */
      useCredits?: boolean;
    };
    const {
      athleteId,
      facilityId,
      youthWrestlerIds,
      sessionMode,
      joinPolicy: joinPolicyFromBody,
      scheduledDate,
      scheduledTime,
      totalPrice,
      pricePerParticipant,
      productId,
      promoCode,
      useCredits,
    } = body;

    if (!athleteId || !youthWrestlerIds?.length || !scheduledDate || !scheduledTime || totalPrice == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const athleteIdNorm = normalizeCoachOrWrestlerId(athleteId);
    if (!athleteIdNorm) {
      return NextResponse.json({ error: 'Invalid coach id.' }, { status: 400 });
    }
    const youthWrestlerIdsNorm: string[] = [];
    for (const id of youthWrestlerIds) {
      const n = normalizeCoachOrWrestlerId(id);
      if (!n) {
        return NextResponse.json({ error: 'Invalid wrestler id.' }, { status: 400 });
      }
      youthWrestlerIdsNorm.push(n);
    }

    const admin = createAdminClient(tenant.slug);
    const coachCheck = await verifyCoachForParentBooking(admin, athleteIdNorm);
    if (!coachCheck.ok) {
      return NextResponse.json({ error: coachCheck.error }, { status: coachCheck.status });
    }

    let facility_id: string | null =
      facilityId != null && String(facilityId).trim() !== ''
        ? normalizeCoachOrWrestlerId(facilityId)
        : null;
    if (!facility_id) {
      facility_id = coachCheck.coach.facility_id ?? null;
    }
    if (!facility_id) {
      return NextResponse.json({ error: 'Facility required' }, { status: 400 });
    }

    const allowedFacilityIds = new Set(await getCoachFacilityIds(admin, athleteIdNorm));
    if (!allowedFacilityIds.has(facility_id)) {
      return NextResponse.json(
        {
          error: 'That location is not linked to this coach. Pick one of their training locations.',
        },
        { status: 400 }
      );
    }

    try {
      const merged = await fetchCoachDaySlotsMerged(admin, athleteIdNorm, scheduledDate);
      const slotKey = normalizeRequestSlotHHmm(scheduledTime);
      const slotRow = merged.find((s) => s.time === slotKey);
      if (slotRow?.facilityId != null && String(slotRow.facilityId).trim() !== '') {
        if (facility_id !== slotRow.facilityId) {
          return NextResponse.json(
            {
              error:
                'That time slot is only open at one specific facility — pick the wrestling room listed for it on the date/time step, or choose another slot.',
            },
            { status: 400 }
          );
        }
      }
    } catch (slotFacilityErr) {
      console.warn('[bookings] slot facility constraint skipped', slotFacilityErr);
    }
    if (userData?.role === 'parent' && checkoutAllowSavedAccountPercent()) {
      await ensureAutoFamilyDiscountForParent(admin, user.id, user.email);
    }

    const { data: ywPhoneRows } = await admin
      .from('youth_wrestlers')
      .select('id, phone, first_name, last_name, photo_url')
      .in('id', youthWrestlerIdsNorm);
    if (!ywPhoneRows || ywPhoneRows.length !== youthWrestlerIdsNorm.length) {
      return NextResponse.json({ error: 'One or more athletes not found' }, { status: 400 });
    }
    for (const row of ywPhoneRows) {
      if (!hasMinPhoneDigits(row.phone)) {
        return NextResponse.json(
          { error: 'Each athlete must have a cell number on file. Open Wrestlers and edit their profile.' },
          { status: 400 }
        );
      }
    }

    const numParticipants = youthWrestlerIdsNorm.length;
    const isPartner = sessionMode === 'partner-invite' || sessionMode === 'partner-open';
    const maxParticipants = isPartner ? 2 : Math.max(1, numParticipants);
    const sessionType = sessionMode === 'private' ? '1-on-1' : '2-athlete';

    // Family / percentage discount (e.g. 10% off). Early-adopter $0 sessions are disabled.
    const { data: pctDiscount } = await admin
      .from('parent_percentage_discounts')
      .select('percent_off')
      .eq('parent_id', user.id)
      .maybeSingle();
    const percentOff = await resolveCheckoutPercentOff(admin, {
      savedPercent: pctDiscount?.percent_off,
      email: user.email,
      promoCode,
    });
    const priceAfterPct = percentOff >= 1 && percentOff <= 100
      ? totalPrice * (1 - percentOff / 100)
      : totalPrice;

    const scheduledDatetime = easternWallDateTimeToUtcIso(scheduledDate, scheduledTime);
    
    const testModePenny = isPennyTestPricingEnabled();
    const coachShareRate = resolveCoachPayoutRate({
      coach_payout_rate: coachCheck.coach.payout_rate ?? null,
    });
    const basePrice = testModePenny ? 0.50 : priceAfterPct;
    const applyWalletCredits = useCredits !== false;
    const creditBalance = applyWalletCredits && basePrice > 0
      ? await getUserCreditBalance(user.id, tenant.slug)
      : 0;
    const creditsToUse = applyWalletCredits ? Math.min(creditBalance, basePrice) : 0;
    const amountToPay = Math.max(0, basePrice - creditsToUse);
    const orgFee = 0;
    const stripeFee = 0;

    const join_policy: JoinPolicy =
      joinPolicyFromBody ??
      (sessionMode === 'partner-invite' ? 'invite_only' : sessionMode === 'partner-open' ? 'public' : 'private');

    let partner_invite_code: string | null = null;
    if (join_policy === 'invite_only') {
      let code = generateInviteCode();
      let { data: existing } = await supabase.from('sessions').select('id').eq('partner_invite_code', code).maybeSingle();
      while (existing) {
        code = generateInviteCode();
        const r = await supabase.from('sessions').select('id').eq('partner_invite_code', code).maybeSingle();
        existing = r.data;
      }
      partner_invite_code = code;
    }

    let sessionProductId: string | undefined;
    let sessionServiceId: string | undefined;
    let durationMinutes = 60;
    if (productId) {
      const { data: product } = await admin.from('products').select('id').eq('id', productId).maybeSingle();
      const { data: service } = await admin
        .from('athlete_services')
        .select('id, duration_minutes')
        .eq('id', productId)
        .eq('athlete_id', athleteIdNorm)
        .maybeSingle();
      if (product) {
        sessionProductId = productId;
      } else if (service) {
        sessionServiceId = productId;
        durationMinutes = service.duration_minutes ?? 60;
      }
    }

    try {
      const conflict = await findCoachSessionTimeOverlap(admin, {
        coachAthleteId: athleteIdNorm,
        scheduledStartIso: scheduledDatetime,
        durationMinutes,
      });
      if (conflict) {
        return NextResponse.json({ error: COACH_SESSION_OVERLAP_ERROR }, { status: 409 });
      }
    } catch (overlapErr) {
      console.error('[bookings] coach overlap check', overlapErr);
      return NextResponse.json({ error: 'Could not verify schedule availability' }, { status: 500 });
    }

    const useDeferredStripe =
      process.env.STRIPE_CHECKOUT_ENABLED === 'true' && amountToPay >= 0.5;
    const paidWithCreditsOnly =
      !useDeferredStripe && basePrice > 0 && amountToPay <= 0 && creditsToUse > 0;

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        parent_id: user.id,
        athlete_id: athleteIdNorm,
        facility_id,
        product_id: sessionProductId ?? undefined,
        athlete_service_id: sessionServiceId ?? undefined,
        session_type: sessionType,
        session_mode: sessionMode,
        join_policy,
        partner_invite_code: partner_invite_code ?? undefined,
        max_participants: maxParticipants,
        /** Roster + capacity apply only after payment; deferred Stripe / full-credit paths fill later */
        current_participants: useDeferredStripe || paidWithCreditsOnly ? 0 : numParticipants,
        base_price: basePrice,
        price_per_participant: testModePenny ? 0.50 : (pricePerParticipant ?? undefined),
        scheduled_datetime: scheduledDatetime,
        duration_minutes: durationMinutes,
        total_price: basePrice,
        /** Coach share is derived via session_payout_rate × roster / amount_paid (see coachPayoutUsd); never store 100% of gross here */
        athlete_payment: 0,
        session_payout_rate: coachShareRate,
        org_fee: orgFee,
        stripe_fee: stripeFee,
        paid_with_credit: false,
        status: 'scheduled',
        athlete_paid: false,
      })
      .select('id, partner_invite_code, session_mode')
      .single();

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    if (!useDeferredStripe && !paidWithCreditsOnly) {
      try {
        await createNotification(admin, {
          user_id: athleteIdNorm,
          type: 'new_session',
          title: 'New session booked',
          body: `Session on ${formatEST(new Date(scheduledDatetime), 'MMM d, yyyy')} at ${formatEST(new Date(scheduledDatetime), 'h:mm a')}. View your dashboard.`,
          data: { link: '/athlete-dashboard', session_id: session.id },
        });
      } catch (notifErr) {
        console.warn('Notify coach of new session failed:', notifErr);
      }

      for (const ywId of youthWrestlerIdsNorm) {
        const ywRow = ywPhoneRows?.find((r) => r.id === ywId);
        const { error: partError } = await supabase.from('session_participants').insert({
          session_id: session.id,
          youth_wrestler_id: ywId,
          parent_id: user.id,
          paid: false,
          amount_paid: testModePenny ? 0.5 / numParticipants : pricePerParticipant ?? totalPrice / numParticipants,
        });
        if (partError) {
          await supabase.from('sessions').delete().eq('id', session.id);
          return NextResponse.json({ error: 'Failed to add participants' }, { status: 500 });
        }
        await maybeBackfillRosterSnapshot(admin, { session_id: session.id, youth_wrestler_id: ywId }, ywRow ?? {});
      }
    }

    // Paid entirely with wallet credit (no card)
    if (paidWithCreditsOnly) {
      await applyCredits({
        userId: user.id,
        amount: creditsToUse,
        sessionId: session.id,
        description: 'Book-a-coach session',
        tenantSlug: tenant.slug,
      });
      const partAmt = testModePenny
        ? 0.5 / numParticipants
        : pricePerParticipant ?? totalPrice / numParticipants;
      for (const ywId of youthWrestlerIdsNorm) {
        const ywRow = ywPhoneRows?.find((r) => r.id === ywId);
        const { error: insErr } = await admin.from('session_participants').insert({
          session_id: session.id,
          youth_wrestler_id: ywId,
          parent_id: user.id,
          paid: true,
          amount_paid: partAmt,
          payment_method: 'credit',
          status: 'confirmed',
        });
        if (insErr) {
          console.error('[bookings] full-credit participant insert', insErr);
          await admin.from('sessions').delete().eq('id', session.id);
          return NextResponse.json({ error: 'Failed to complete credit booking' }, { status: 500 });
        }
        await maybeBackfillRosterSnapshot(admin, { session_id: session.id, youth_wrestler_id: ywId }, ywRow ?? {});
      }
      await admin
        .from('sessions')
        .update({
          status: 'scheduled',
          athlete_paid: true,
          current_participants: numParticipants,
          paid_with_credit: true,
        })
        .eq('id', session.id);
      const dateStrCredit = formatEST(new Date(scheduledDatetime), 'EEE MMM d, h:mm a');
      await notifyCoachAndAdminsNewBooking(admin, athleteIdNorm, dateStrCredit, session.id, {
        parentId: user.id,
        youthWrestlerId: youthWrestlerIdsNorm[0] ?? null,
      }).catch(() => {});

      return NextResponse.json({
        sessionId: session.id,
        partnerInviteCode: session.partner_invite_code ?? undefined,
        sessionMode: session.session_mode,
      });
    }

    // Stripe Checkout: enable by setting STRIPE_CHECKOUT_ENABLED=true (and keys + webhook).
    let checkoutUrl: string | undefined;
    console.log('[Bookings API] STRIPE_CHECKOUT_ENABLED:', process.env.STRIPE_CHECKOUT_ENABLED);
    console.log('[Bookings API] Amount due after credits:', amountToPay, 'credits:', creditsToUse);
    console.log('[Bookings API] Tenant slug:', tenant.slug);

    if (useDeferredStripe) {
      try {
        console.log('[Bookings API] Attempting to create Stripe checkout session...');
        const stripe = getStripeInstance(tenant.slug);
        const stripeRedirectOrigin = publicOriginForStripeRedirect(host, req);
        const successParams = new URLSearchParams({ sessionId: session.id });
        if (session.partner_invite_code) successParams.set('code', session.partner_invite_code);
        if (session.session_mode) successParams.set('mode', session.session_mode);

        const amountCents = Math.round(amountToPay * 100);
        const perWrestlerAmount = testModePenny
          ? 0.5 / numParticipants
          : pricePerParticipant ?? totalPrice / numParticipants;
        const bookingLines = youthWrestlerIdsNorm
          .map((ywId) => `${ywId}|${perWrestlerAmount}`)
          .join(';');
        const metadata: Record<string, string> = {
          business: 'guild',
          channel: 'bookings',
          category: 'booking',
          session_type: sessionType,
          coach_id: athleteIdNorm,
          platform_fee_pct: '20',
          session_id: session.id,
          app: 'the-guild',
          tenant_slug: tenant.slug,
          test_mode: testModePenny ? 'true' : 'false',
          parent_id: user.id,
          booking_lines: bookingLines,
          ...(creditsToUse > 0 && { credits_to_use: creditsToUse.toFixed(2) }),
        };

        const stripeSession = await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: 'usd',
                  unit_amount: amountCents,
                  product_data: {
                    name: 'The Guild – Wrestling Session',
                    description: testModePenny
                      ? `TEST MODE: Session on ${scheduledDate} at ${scheduledTime} (actual price: $${totalPrice.toFixed(2)})`
                      : `Session on ${scheduledDate} at ${scheduledTime}`,
                    metadata: { app: 'the-guild', test_mode: testModePenny ? 'true' : 'false' },
                  },
                },
              },
            ],
            metadata,
            success_url: `${stripeRedirectOrigin}/book/${athleteIdNorm}/confirmed?${successParams.toString()}`,
            cancel_url: `${stripeRedirectOrigin}/book/${athleteIdNorm}`,
            customer_email: user.email ?? undefined,
          },
          { idempotencyKey: `book-${session.id}-${user.id}-${amountCents}`.slice(0, 255) }
        );
        checkoutUrl = stripeSession.url ?? undefined;
        console.log('[Bookings API] Stripe checkout URL created:', checkoutUrl);
      } catch (stripeErr) {
        console.error('[Bookings API] Stripe Checkout ERROR:', stripeErr);
        console.error('[Bookings API] Error details:', JSON.stringify(stripeErr, null, 2));
      }
    } else if (amountToPay < 0.5 && amountToPay > 0) {
      // Below Stripe minimum; confirm without card (credits may cover part of basePrice)
      if (creditsToUse > 0) {
        await applyCredits({
          userId: user.id,
          amount: creditsToUse,
          sessionId: session.id,
          description: 'Book-a-coach session (sub-minimum card)',
          tenantSlug: tenant.slug,
        });
      }
      await admin
        .from('sessions')
        .update({ status: 'scheduled', athlete_paid: true, paid_with_credit: creditsToUse > 0 })
        .eq('id', session.id);
      await admin
        .from('session_participants')
        .update({ paid: true })
        .eq('session_id', session.id);

      const dateStr = formatEST(new Date(scheduledDatetime), 'EEE MMM d, h:mm a');
      await notifyCoachAndAdminsNewBooking(admin, athleteIdNorm, dateStr, session.id, {
        parentId: user.id,
        youthWrestlerId: youthWrestlerIdsNorm[0] ?? null,
      }).catch(() => {});

      return NextResponse.json({
        sessionId: session.id,
        partnerInviteCode: session.partner_invite_code ?? undefined,
        sessionMode: session.session_mode,
      });
    } else {
      console.log('[Bookings API] Stripe checkout is DISABLED or no charge needed');
    }

    return NextResponse.json({
      sessionId: session.id,
      partnerInviteCode: session.partner_invite_code ?? undefined,
      sessionMode: session.session_mode,
      ...(checkoutUrl && { url: checkoutUrl }),
    });
  } catch (e) {
    console.error('Bookings API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
