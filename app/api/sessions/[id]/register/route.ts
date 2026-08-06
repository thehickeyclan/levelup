import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders, resolveHostnameFromHeaders } from '@/config/tenants';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import { formatEST } from '@/lib/format-date';
import { createRegisterConfirmationToken } from '@/lib/confirmation-token';
import { createNotification } from '@/lib/notifications';
import { notifyCoachAndAdminsNewBooking } from '@/lib/twilio';
import { hasMinPhoneDigits } from '@/lib/phone';
import { parseGraduationYear, GRADUATION_YEAR_REQUIRED_MESSAGE } from '@/lib/graduation-year';
import { maybeBackfillRosterSnapshot } from '@/lib/session-roster-snapshot';
import { finalizeRegisterFromCheckoutSession } from '@/lib/finalize-session-register-from-stripe';
import { getEffectiveFilledCount } from '@/lib/sessions';
import { ensureAutoFamilyDiscountForParent } from '@/lib/family-auto-discount';
import { checkoutAllowSavedAccountPercent, resolveCheckoutPercentOff } from '@/lib/checkout-promo';
import { publicOriginForStripeRedirect } from '@/lib/stripe-redirect-origin';
import {
  buildGuildCheckoutMetadata,
  formatGuildProductName,
  guildPaymentIntentData,
} from '@/lib/stripe/guild-checkout-metadata';
import { applyCredits, getCreditUsageSumForParentSession, getUserCreditBalance } from '@/lib/credits';
import { sessionPricePerParticipantUsd } from '@/lib/session-price';
import {
  isSessionOpenForRegistrationPayment,
  registrationPaymentBlockedMessage,
} from '@/lib/session-payment-open';

/**
 * POST — register a youth wrestler for a session (public or invite-only).
 * **`price_per_participant = 0`:** no Stripe; confirms like a full discount / credit-only flow.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const headersList = await headers();
    const host = resolveHostnameFromHeaders(headersList);
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    const role = userData?.role;
    if (role !== 'parent' && role !== 'admin' && role !== 'coach' && role !== 'youth_wrestler') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json()) as {
      youthWrestlerId: string;
      promoCode?: string;
      partnerInviteCode?: string;
      /** When false, card pays full discounted total. Default true. */
      useCredits?: boolean;
    };
    const { youthWrestlerId, promoCode, partnerInviteCode, useCredits: useCreditsBody } = body;
    if (!youthWrestlerId) return NextResponse.json({ error: 'Missing youthWrestlerId' }, { status: 400 });
    if (role === 'youth_wrestler' && youthWrestlerId !== user.id) {
      return NextResponse.json({ error: 'Youth wrestlers can only register themselves' }, { status: 403 });
    }

    const partnerInviteCodeNorm = (partnerInviteCode ?? '').trim().toUpperCase();
    const admin = createAdminClient(tenant.slug);

    let { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, parent_id, athlete_id, join_policy, session_mode, session_type, partner_invite_code, current_participants, max_participants, price_per_participant, scheduled_datetime, status')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      if (partnerInviteCodeNorm) {
        const { data: sAdmin } = await admin
          .from('sessions')
          .select('id, parent_id, athlete_id, join_policy, session_mode, session_type, partner_invite_code, current_participants, max_participants, price_per_participant, scheduled_datetime, status')
          .eq('id', sessionId)
          .eq('partner_invite_code', partnerInviteCodeNorm)
          .maybeSingle();
        if (sAdmin) {
          session = sAdmin;
          sessionErr = null;
        }
      }
      if (sessionErr || !session) {
        const { data: sLate } = await admin
          .from('sessions')
          .select('id, parent_id, athlete_id, join_policy, session_mode, session_type, partner_invite_code, current_participants, max_participants, price_per_participant, scheduled_datetime, status')
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

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const s = session as {
      parent_id?: string;
      join_policy?: string;
      session_mode?: string;
      session_type?: string;
      current_participants?: number;
      max_participants?: number;
      price_per_participant?: number;
      scheduled_datetime?: string;
      status?: string;
      partner_invite_code?: string | null;
    };

    if (role === 'parent' && checkoutAllowSavedAccountPercent()) {
      await ensureAutoFamilyDiscountForParent(admin, user.id, user.email);
    }
    const { count: participantRowCount } = await admin
      .from('session_participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    const max = s.max_participants ?? 2;
    const filled = getEffectiveFilledCount(
      {
        current_participants: s.current_participants,
        max_participants: s.max_participants,
        session_participants: null,
      },
      participantRowCount ?? 0
    );

    const { data: existingParticipantEarly } = await admin
      .from('session_participants')
      .select('id, paid, parent_id')
      .eq('session_id', sessionId)
      .eq('youth_wrestler_id', youthWrestlerId)
      .maybeSingle();
    const payingExistingUnpaid =
      existingParticipantEarly != null &&
      existingParticipantEarly.paid === false &&
      existingParticipantEarly.parent_id === user.id;

    if (filled >= max && !payingExistingUnpaid) {
      return NextResponse.json({ error: 'Session is full' }, { status: 400 });
    }

    const current = s.current_participants ?? 1;

    const isOwner = s.parent_id === user.id;

    if (isOwner) {
      const { data: yw } = await supabase
        .from('youth_wrestlers')
        .select('id, parent_id, phone, first_name, last_name, photo_url')
        .eq('id', youthWrestlerId)
        .single();
      const ywParentId = (yw as { parent_id?: string } | null)?.parent_id;
      const isPrimaryParent = yw && ywParentId === user.id;
      const { data: link } = !isPrimaryParent && yw
        ? await supabase.from('youth_wrestler_parents').select('id').eq('youth_wrestler_id', youthWrestlerId).eq('parent_id', user.id).maybeSingle()
        : { data: null };
      if (!yw || (!isPrimaryParent && !link)) {
        return NextResponse.json({ error: 'Youth wrestler not found or not yours' }, { status: 400 });
      }
      if (!hasMinPhoneDigits((yw as { phone?: string | null }).phone)) {
        return NextResponse.json(
          { error: 'Add this athlete’s cell number on their profile (Wrestlers → Edit) before registering.' },
          { status: 400 }
        );
      }
      const { data: existing } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('youth_wrestler_id', youthWrestlerId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: 'This wrestler is already in this session' }, { status: 409 });
      }
      // Organizer is sessions.parent_id; RLS allows this INSERT for that user (no service role).
      const { error: insertErr } = await supabase.from('session_participants').insert({
        session_id: sessionId,
        youth_wrestler_id: youthWrestlerId,
        parent_id: user.id,
        paid: true,
        amount_paid: 0,
      });
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
      await maybeBackfillRosterSnapshot(admin, { session_id: sessionId, youth_wrestler_id: youthWrestlerId }, yw ?? {});
      await supabase.from('sessions').update({ current_participants: current + 1, updated_at: new Date().toISOString() }).eq('id', sessionId);
      const coachId = (session as { athlete_id?: string }).athlete_id;
      const dt = s.scheduled_datetime;
      if (coachId && coachId !== user.id) {
        const dateStr = dt ? formatEST(new Date(dt), 'EEE MMM d, h:mm a') : 'your session';
        await createNotification(admin, {
          user_id: coachId,
          type: 'session_booked',
          title: 'Someone signed up for your session',
          body: `New signup for ${dateStr}. Check My sessions.`,
          data: { session_id: sessionId },
        }).catch((e) => console.warn('Register: coach notification failed', e));
        await notifyCoachAndAdminsNewBooking(admin, coachId, dateStr, sessionId, {
          parentId: user.id,
          youthWrestlerId,
        }).catch(() => {});
      }
      return NextResponse.json({ added: true });
    }

    const pinv = (s.partner_invite_code ?? '').trim().toUpperCase();
    const inviteVerified = Boolean(partnerInviteCodeNorm && pinv === partnerInviteCodeNorm);
    const joinPol = s.join_policy ?? 'private';
    const payingExistingUnpaidForJoinCheck =
      existingParticipantEarly != null &&
      (existingParticipantEarly as { paid?: boolean | null }).paid === false &&
      (existingParticipantEarly as { parent_id?: string | null }).parent_id === user.id;
    if (
      joinPol !== 'public' &&
      joinPol !== 'invite_only' &&
      !inviteVerified &&
      !payingExistingUnpaidForJoinCheck
    ) {
      return NextResponse.json({ error: 'This session is not open for registration' }, { status: 400 });
    }
    if (!isSessionOpenForRegistrationPayment(s.status)) {
      return NextResponse.json(
        { error: registrationPaymentBlockedMessage(s.status) },
        { status: 400 }
      );
    }

    const rawPrice = s.price_per_participant;
    const pricePer = sessionPricePerParticipantUsd(rawPrice);

    const isSelf = role === 'youth_wrestler' && youthWrestlerId === user.id;

    const { data: yw } = await supabase
      .from('youth_wrestlers')
      .select('id, parent_id, phone, first_name, last_name, graduation_year')
      .eq('id', youthWrestlerId)
      .single();
    const ywParentId = (yw as { parent_id?: string } | null)?.parent_id;
    const isPrimaryParent = yw && ywParentId === user.id;
    if (yw && !hasMinPhoneDigits((yw as { phone?: string | null }).phone)) {
      return NextResponse.json(
        { error: 'Add this athlete’s cell number on their profile (Wrestlers → Edit) before registering.' },
        { status: 400 }
      );
    }
    if (yw && parseGraduationYear((yw as { graduation_year?: number | null }).graduation_year) == null) {
      return NextResponse.json(
        { error: `${GRADUATION_YEAR_REQUIRED_MESSAGE} Update their profile under Wrestlers → Edit.` },
        { status: 400 }
      );
    }
    const { data: link } = !isPrimaryParent && !isSelf && yw
      ? await supabase.from('youth_wrestler_parents').select('id').eq('youth_wrestler_id', youthWrestlerId).eq('parent_id', user.id).maybeSingle()
      : { data: null };
    if (!yw || (!isPrimaryParent && !link && !isSelf)) {
      return NextResponse.json({ error: 'Youth wrestler not found or not yours' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('session_participants')
      .select('id, paid, parent_id')
      .eq('session_id', sessionId)
      .eq('youth_wrestler_id', youthWrestlerId)
      .maybeSingle();
    if (existing) {
      const row = existing as { paid?: boolean | null; parent_id?: string | null };
      if (row.paid === false && row.parent_id === user.id) {
        // Late payment: wrestler is on the roster but unpaid — proceed to Stripe without a new insert.
      } else {
        return NextResponse.json({ error: 'This wrestler is already registered for this session' }, { status: 409 });
      }
    }

    // Family / percentage discount (e.g. 10% off)
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
    const priceAfterDiscount = percentOff >= 1 && percentOff <= 100
      ? pricePer * (1 - percentOff / 100)
      : pricePer;

    const applyWalletCredits = useCreditsBody !== false;
    const creditBalance = applyWalletCredits ? await getUserCreditBalance(user.id, tenant.slug) : 0;
    let creditsToUse = applyWalletCredits ? Math.min(creditBalance, priceAfterDiscount) : 0;
    let amountToPay = priceAfterDiscount - creditsToUse;

    if (amountToPay > 1e-6 && amountToPay + 1e-6 < 0.5) {
      const maxCreditTowardMinCard = Math.max(0, priceAfterDiscount - 0.5);
      creditsToUse = applyWalletCredits ? Math.min(creditBalance, maxCreditTowardMinCard) : 0;
      amountToPay = priceAfterDiscount - creditsToUse;
    }

    if (amountToPay > 1e-6 && amountToPay + 1e-6 < 0.5) {
      return NextResponse.json({ error: 'Minimum card charge is $0.50' }, { status: 400 });
    }

    const catalogStr = priceAfterDiscount.toFixed(2);

    if (amountToPay <= 1e-6) {
      const { data: ywSnap } = await supabase
        .from('youth_wrestlers')
        .select('first_name, last_name, photo_url')
        .eq('id', youthWrestlerId)
        .maybeSingle();

      const { count: parentSpotCount } = await admin
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('parent_id', user.id);
      const priorParentSpots = parentSpotCount ?? 0;
      const usageSum = await getCreditUsageSumForParentSession(user.id, sessionId, tenant.slug);
      let needApplyCredits = creditsToUse;
      if (priorParentSpots === 0) {
        needApplyCredits = Math.max(0, creditsToUse - usageSum);
      }

      if (existing) {
        const { error: updateErr } = await admin
          .from('session_participants')
          .update({
            paid: true,
            amount_paid: priceAfterDiscount,
            payment_method: 'credit',
            status: 'confirmed',
          })
          .eq('session_id', sessionId)
          .eq('youth_wrestler_id', youthWrestlerId);
        if (updateErr) {
          console.error('Register credit-only update failed', updateErr);
          return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }
      } else {
        const { error: insertErr } = await admin.from('session_participants').insert({
          session_id: sessionId,
          youth_wrestler_id: youthWrestlerId,
          parent_id: user.id,
          paid: true,
          amount_paid: priceAfterDiscount,
          payment_method: 'credit',
          status: 'confirmed',
        });
        if (insertErr) {
          console.error('Register credit-only insert failed', insertErr);
          return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }
        await admin
          .from('sessions')
          .update({ current_participants: current + 1, updated_at: new Date().toISOString() })
          .eq('id', sessionId);
      }

      if (needApplyCredits > 0.01) {
        const applied = await applyCredits({
          userId: user.id,
          amount: needApplyCredits,
          sessionId,
          description: 'Session registration paid with Guild credits',
          tenantSlug: tenant.slug,
        });
        if (applied.usedAmount + 0.02 < needApplyCredits) {
          if (!existing) {
            await admin
              .from('session_participants')
              .delete()
              .eq('session_id', sessionId)
              .eq('youth_wrestler_id', youthWrestlerId);
          } else {
            await admin
              .from('session_participants')
              .update({ paid: false, amount_paid: null, payment_method: null, status: null })
              .eq('session_id', sessionId)
              .eq('youth_wrestler_id', youthWrestlerId);
          }
          console.error('Register credit-only: applyCredits incomplete', {
            needApplyCredits,
            usedAmount: applied.usedAmount,
          });
          return NextResponse.json(
            { error: 'Could not apply wallet credits. Your card was not charged. Please try again.' },
            { status: 500 }
          );
        }
      }

      await maybeBackfillRosterSnapshot(
        admin,
        { session_id: sessionId, youth_wrestler_id: youthWrestlerId },
        ywSnap ?? {}
      );

      const coachId = (session as { athlete_id?: string }).athlete_id;
      const dtNotify = s.scheduled_datetime;
      if (coachId && coachId !== user.id) {
        const dateStr = dtNotify ? formatEST(new Date(dtNotify), 'EEE MMM d, h:mm a') : 'your session';
        await createNotification(admin, {
          user_id: coachId,
          type: 'session_booked',
          title: 'Someone signed up for your session',
          body: `New signup for ${dateStr}. Check My sessions.`,
          data: { session_id: sessionId },
        }).catch((e) => console.warn('Register credit-only: coach notification failed', e));
        await notifyCoachAndAdminsNewBooking(admin, coachId, dateStr, sessionId, {
          parentId: user.id,
          youthWrestlerId,
        }).catch(() => {});
      }

      const stripeRedirectOrigin = publicOriginForStripeRedirect(host, req);
      const confirmToken = createRegisterConfirmationToken(sessionId);
      const confirmUrl = `${stripeRedirectOrigin}/sessions/${sessionId}/register/confirmed?t=${encodeURIComponent(confirmToken)}`;
      return NextResponse.json({
        url: confirmUrl,
        paidWithCredits: true,
        creditsUsed: creditsToUse,
      });
    }

    const stripeEnabled = process.env.STRIPE_CHECKOUT_ENABLED === 'true';
    if (!stripeEnabled) {
      return NextResponse.json({ error: 'Online payment is not enabled' }, { status: 503 });
    }

    const amountCents = Math.round(amountToPay * 100);
    if (amountCents < 50) {
      return NextResponse.json({ error: 'Minimum card charge is $0.50' }, { status: 400 });
    }

    const stripe = getStripeInstance(tenant.slug);
    const stripeRedirectOrigin = publicOriginForStripeRedirect(host, req);
    const confirmToken = createRegisterConfirmationToken(sessionId);
    // stripe_cs lets the confirmed page finalize the DB row if the webhook is slow (fixes missing Home/bookings).
    const successUrl = `${stripeRedirectOrigin}/sessions/${sessionId}/register/confirmed?t=${encodeURIComponent(confirmToken)}&stripe_cs={CHECKOUT_SESSION_ID}`;
    const cancelUrl = partnerInviteCodeNorm
      ? `${stripeRedirectOrigin}/join/${partnerInviteCodeNorm}`
      : `${stripeRedirectOrigin}/sessions/${sessionId}/register`;

    const dt = s.scheduled_datetime ? new Date(s.scheduled_datetime) : null;
    let desc = dt
      ? `Session on ${formatEST(dt, 'MMM d, yyyy')} at ${formatEST(dt, 'h:mm a')} – register one spot`
      : 'Register for session';
    if (creditsToUse > 0) {
      desc = `${desc} (Credit applied: $${creditsToUse.toFixed(2)})`;
    }

    const sessionForStripe = session as {
      athlete_id?: string | null;
      session_type?: string | null;
      session_mode?: string | null;
      scheduled_datetime?: string | null;
      duration_minutes?: number | null;
    };
    const coachId = sessionForStripe.athlete_id ?? '';
    let coachName = '';
    if (coachId) {
      const { data: coachAth } = await admin
        .from('athletes')
        .select('first_name, last_name')
        .eq('id', coachId)
        .maybeSingle();
      coachName = coachAth
        ? [coachAth.first_name, coachAth.last_name].filter(Boolean).join(' ').trim()
        : '';
    }
    const wrestlerName = yw
      ? [yw.first_name, yw.last_name].filter(Boolean).join(' ').trim()
      : '';
    const productName = formatGuildProductName({
      sessionType: sessionForStripe.session_type,
      sessionMode: sessionForStripe.session_mode,
      durationMinutes: (sessionForStripe as { duration_minutes?: number }).duration_minutes ?? 60,
      scheduledDatetime: sessionForStripe.scheduled_datetime,
      coachName: coachName || undefined,
    });
    const metadata = buildGuildCheckoutMetadata({
      source: 'guild_register',
      tenantSlug: tenant.slug,
      parentId: user.id,
      parentEmail: user.email,
      athleteName: wrestlerName || undefined,
      bookingId: sessionId,
      productName,
      extras: {
        category: 'booking',
        session_type: String(sessionForStripe.session_type ?? ''),
        coach_id: String(coachId),
        platform_fee_pct: '20',
        youth_wrestler_id: String(youthWrestlerId),
        register: 'true',
        credits_to_use: creditsToUse.toString(),
        register_catalog_dollars: catalogStr,
      },
    });

    /**
     * Must include amount (and any discount) in the idempotency key. Stripe rejects reuse of the same key
     * with different parameters — e.g. user applies a promo after a first attempt → 500 without this.
     */
    const idempotencyKey =
      `reg-${sessionId}-${youthWrestlerId}-${user.id}-${amountCents}-c${Math.round(creditsToUse * 100)}-p${Math.round(percentOff)}`.slice(
        0,
        255
      );

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
                name: productName,
                description: desc,
                metadata: { channel: 'guild', business: 'wrestling_guild', app: 'the-guild' },
              },
            },
          },
        ],
        metadata,
        payment_intent_data: guildPaymentIntentData(metadata),
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: user.email ?? undefined,
      },
      { idempotencyKey }
    );

    const paid =
      stripeSession.payment_status === 'paid' ||
      stripeSession.status === 'complete';

    if (paid) {
      await finalizeRegisterFromCheckoutSession(stripeSession.id, tenant.slug).catch((err) =>
        console.error('register: finalize after idempotent paid session', err)
      );
      const confirmUrl = `${stripeRedirectOrigin}/sessions/${sessionId}/register/confirmed?t=${encodeURIComponent(confirmToken)}&stripe_cs=${stripeSession.id}`;
      return NextResponse.json({ url: confirmUrl });
    }

    if (!stripeSession.url) {
      return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
    }

    return NextResponse.json({ url: stripeSession.url });
  } catch (e) {
    const err = e as Error & { type?: string; message?: string };
    console.error('Session register API error:', err?.message ?? e, err);
    const raw =
      typeof err?.message === 'string' && err.message.length > 0 ? err.message : '';
    const isIdempotency =
      raw.includes('idempotent') || raw.includes('Idempotency');
    const isStripeKeyConfig =
      /invalid api key|api key provided|stripe secret key/i.test(raw);
    const msg = isIdempotency
      ? 'Checkout is still processing from your last attempt. Wait a moment and tap Pay again.'
      : isStripeKeyConfig
        ? 'Online payment is temporarily unavailable. Please contact The Guild.'
      : raw.length > 0 && raw.length < 400
        ? raw
        : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: isIdempotency ? 409 : 500 });
  }
}
