import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import { formatEST } from '@/lib/format-date';
import { getEffectiveFilledCount } from '@/lib/sessions';
import { getUserCreditBalance, applyCredits, getCreditUsageSumForParentSession } from '@/lib/credits';
import { ensureAutoFamilyDiscountForParent } from '@/lib/family-auto-discount';
import { checkoutAllowSavedAccountPercent, resolveCheckoutPercentOff } from '@/lib/checkout-promo';
import { createNotification } from '@/lib/notifications';
import { notifyCoachAndAdminsNewBooking } from '@/lib/twilio';
import { publicOriginForStripeRedirect } from '@/lib/stripe-redirect-origin';
import {
  buildGuildCheckoutMetadata,
  formatGuildProductName,
  guildPaymentIntentData,
} from '@/lib/stripe/guild-checkout-metadata';
import { sessionPricePerParticipantUsd } from '@/lib/session-price';
import { verifyWrestlerBelongsToParentOrSelf } from '@/lib/wrestlers-for-parent';
import {
  isSessionOpenForRegistrationPayment,
  registrationPaymentBlockedMessage,
} from '@/lib/session-payment-open';

type CartLine = { sessionId: string; wrestlerId: string };

/**
 * POST - Multi-session checkout: pay for multiple sessions in one Stripe transaction.
 * Each cart line is one spot (session + youth wrestler). The same session may appear twice for two kids.
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    const role = userData?.role;
    if (role !== 'parent' && role !== 'admin' && role !== 'youth_wrestler') {
      return NextResponse.json(
        {
          error:
            'Checkout is only available for parent or wrestler accounts through The Guild.',
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      lines?: CartLine[];
      sessionIds?: string[];
      wrestlerId?: string;
      promoCode?: string;
      /** When false, do not apply wallet credits (card pays full discounted total). Default true. */
      useCredits?: boolean;
    };

    let lines: CartLine[] = [];
    if (body.lines && Array.isArray(body.lines) && body.lines.length > 0) {
      lines = body.lines.filter(
        (l) => l && typeof l.sessionId === 'string' && typeof l.wrestlerId === 'string'
      );
    } else if (body.sessionIds?.length && body.wrestlerId) {
      lines = body.sessionIds.map((sessionId) => ({ sessionId, wrestlerId: body.wrestlerId! }));
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: 'No sessions selected' }, { status: 400 });
    }

    const pairKey = new Set<string>();
    for (const l of lines) {
      const k = `${l.sessionId}:${l.wrestlerId}`;
      if (pairKey.has(k)) {
        return NextResponse.json(
          { error: 'Duplicate booking line for the same session and wrestler' },
          { status: 400 }
        );
      }
      pairKey.add(k);
    }

    const uniqueWrestlerIds = [...new Set(lines.map((l) => l.wrestlerId))];
    for (const wid of uniqueWrestlerIds) {
      if (role === 'youth_wrestler' && wid !== user.id) {
        return NextResponse.json(
          { error: 'Use a parent account to check out for multiple wrestlers.' },
          { status: 403 }
        );
      }
      const ok = await verifyWrestlerBelongsToParentOrSelf(supabase, user.id, wid);
      if (!ok) {
        return NextResponse.json({ error: 'Wrestler not found or not yours' }, { status: 400 });
      }
    }

    const admin = createAdminClient(tenant.slug);
    if (role === 'parent' && checkoutAllowSavedAccountPercent()) {
      await ensureAutoFamilyDiscountForParent(admin, user.id, user.email);
    }

    const sessionIdsUnique = [...new Set(lines.map((l) => l.sessionId))];
    const { data: sessions, error: sessionsErr } = await supabase
      .from('sessions')
      .select(`
        id, parent_id, athlete_id, join_policy, session_mode, session_type,
        current_participants, max_participants, price_per_participant,
        scheduled_datetime, status,
        athletes(first_name, last_name)
      `)
      .in('id', sessionIdsUnique);

    if (sessionsErr || !sessions || sessions.length !== sessionIdsUnique.length) {
      return NextResponse.json({ error: 'Sessions not found' }, { status: 404 });
    }

    const sessionById = new Map(
      sessions.map((s) => [s.id, s as Record<string, unknown> & { id: string }])
    );

    const linesPerSession = new Map<string, number>();
    for (const l of lines) {
      linesPerSession.set(l.sessionId, (linesPerSession.get(l.sessionId) || 0) + 1);
    }

    for (const [sid, needed] of linesPerSession) {
      const s = sessionById.get(sid);
      if (!s) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      const joinPolicy = s.join_policy as string | undefined;
      const status = s.status as string | undefined;
      if (joinPolicy !== 'public' && joinPolicy !== 'invite_only') {
        return NextResponse.json({ error: 'Session is not open for registration' }, { status: 400 });
      }
      if (!isSessionOpenForRegistrationPayment(status)) {
        return NextResponse.json(
          { error: registrationPaymentBlockedMessage(status) },
          { status: 400 }
        );
      }

      const { count: participantRowCount } = await admin
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sid);

      const max = (s.max_participants as number | undefined) ?? 2;
      const filled = getEffectiveFilledCount(
        {
          current_participants: s.current_participants as number | undefined,
          max_participants: s.max_participants as number | undefined,
          session_participants: null,
        },
        participantRowCount ?? 0
      );
      if (filled + needed > max) {
        const dt = s.scheduled_datetime
          ? formatEST(new Date(s.scheduled_datetime as string), 'MMM d')
          : 'a session';
        return NextResponse.json({ error: `Session on ${dt} is full` }, { status: 400 });
      }
    }

    const { data: wrestlerNames } = await admin
      .from('youth_wrestlers')
      .select('id, first_name, last_name')
      .in('id', uniqueWrestlerIds);
    const nameByWrestler = new Map(
      (wrestlerNames ?? []).map((w) => [
        w.id,
        [w.first_name, w.last_name].filter(Boolean).join(' ').trim() || 'Wrestler',
      ])
    );

    for (const line of lines) {
      const { data: existing } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', line.sessionId)
        .eq('youth_wrestler_id', line.wrestlerId)
        .maybeSingle();
      if (existing) {
        const s = sessionById.get(line.sessionId);
        const dt = s?.scheduled_datetime
          ? formatEST(new Date(s.scheduled_datetime as string), 'MMM d')
          : 'a session';
        return NextResponse.json({ error: `Already registered for session on ${dt}` }, { status: 409 });
      }
    }

    type LineItem = {
      quantity: number;
      price_data: {
        currency: string;
        unit_amount: number;
        product_data: { name: string; description: string };
      };
    };

    const lineItems: LineItem[] = [];
    const sessionMetadata: Array<{ session_id: string; wrestler_id: string; price: number }> = [];

    for (const line of lines) {
      const s = sessionById.get(line.sessionId)!;
      const pricePer = sessionPricePerParticipantUsd(
        s.price_per_participant as number | null | undefined
      );
      const amountCents = Math.round(pricePer * 100);

      const dt = s.scheduled_datetime ? new Date(s.scheduled_datetime as string) : null;
      const coach = Array.isArray(s.athletes) ? s.athletes[0] : s.athletes;
      const coachName = coach
        ? [(coach as { first_name?: string }).first_name, (coach as { last_name?: string }).last_name]
            .filter(Boolean)
            .join(' ')
        : 'Coach';
      const kid = nameByWrestler.get(line.wrestlerId) ?? 'Wrestler';
      const desc = dt
        ? `${formatEST(dt, 'EEE, MMM d')} at ${formatEST(dt, 'h:mm a')} with ${coachName} · ${kid}`
        : 'Session registration';

      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: 'The Guild – Session',
            description: desc,
          },
        },
      });

      sessionMetadata.push({ session_id: line.sessionId, wrestler_id: line.wrestlerId, price: pricePer });
    }

    let totalPrice = sessionMetadata.reduce((sum, m) => sum + m.price, 0);

    const { data: discountData } = await admin
      .from('parent_percentage_discounts')
      .select('percent_off')
      .eq('parent_id', user.id)
      .maybeSingle();

    const percentOff = await resolveCheckoutPercentOff(admin, {
      savedPercent: discountData?.percent_off,
      email: user.email,
      promoCode: body.promoCode,
    });
    const discountAmount = percentOff > 0 ? totalPrice * (percentOff / 100) : 0;
    totalPrice = totalPrice - discountAmount;

    if (percentOff > 0) {
      for (const item of lineItems) {
        const discountedAmount = Math.round(item.price_data.unit_amount * (1 - percentOff / 100));
        item.price_data.unit_amount = discountedAmount;
        item.price_data.product_data.description = `${item.price_data.product_data.description} (${percentOff}% off)`;
      }
      for (const meta of sessionMetadata) {
        meta.price = meta.price * (1 - percentOff / 100);
      }
    }

    const applyWalletCredits = body.useCredits !== false;
    const creditBalance = applyWalletCredits ? await getUserCreditBalance(user.id, tenant.slug) : 0;
    const creditsToUse = applyWalletCredits ? Math.min(creditBalance, totalPrice) : 0;
    const amountToPay = totalPrice - creditsToUse;

    const cartLinesMeta = sessionMetadata
      .map((m) => `${m.session_id}|${m.wrestler_id}|${m.price.toFixed(2)}`)
      .join(';');

    if (amountToPay <= 0) {
      const currentCountBySession = new Map<string, number>();
      for (const s of sessions) {
        currentCountBySession.set(
          s.id,
          (s as { current_participants?: number }).current_participants ?? 0
        );
      }
      const cartSessionIds = [...new Set(sessionMetadata.map((m) => m.session_id))];
      const { data: priorParentRows } = await admin
        .from('session_participants')
        .select('session_id')
        .eq('parent_id', user.id)
        .in('session_id', cartSessionIds);
      const priorParentSpotsBySession = new Map<string, number>();
      for (const row of priorParentRows ?? []) {
        const sid = (row as { session_id: string }).session_id;
        priorParentSpotsBySession.set(sid, (priorParentSpotsBySession.get(sid) ?? 0) + 1);
      }
      const parentSpotsAddedThisCheckout = new Map<string, number>();

      const coachNotifySentForSession = new Set<string>();
      for (const meta of sessionMetadata) {
        const prior = priorParentSpotsBySession.get(meta.session_id) ?? 0;
        const inFlight = parentSpotsAddedThisCheckout.get(meta.session_id) ?? 0;
        const parentSpotsBeforeLine = prior + inFlight;
        let needApply = meta.price;
        if (parentSpotsBeforeLine === 0) {
          const usageSum = await getCreditUsageSumForParentSession(
            user.id,
            meta.session_id,
            tenant.slug
          );
          needApply = Math.max(0, meta.price - usageSum);
        }

        const { error: insertErr } = await admin.from('session_participants').insert({
          session_id: meta.session_id,
          youth_wrestler_id: meta.wrestler_id,
          parent_id: user.id,
          amount_paid: meta.price,
          payment_method: 'credit',
          status: 'confirmed',
        });
        if (insertErr) {
          console.error('Cart credit-only: session_participants insert failed', insertErr);
          return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }

        if (needApply > 0.01) {
          const applied = await applyCredits({
            userId: user.id,
            amount: needApply,
            sessionId: meta.session_id,
            description: `Session booking paid with credits`,
            tenantSlug: tenant.slug,
          });
          if (applied.usedAmount + 0.02 < needApply) {
            await admin
              .from('session_participants')
              .delete()
              .eq('session_id', meta.session_id)
              .eq('youth_wrestler_id', meta.wrestler_id)
              .eq('parent_id', user.id);
            console.error('Cart credit-only: applyCredits incomplete', {
              needApply,
              usedAmount: applied.usedAmount,
            });
            return NextResponse.json(
              {
                error:
                  'Could not apply wallet credits for one or more sessions. No card was charged. Please try again.',
              },
              { status: 500 }
            );
          }
        }

        parentSpotsAddedThisCheckout.set(
          meta.session_id,
          (parentSpotsAddedThisCheckout.get(meta.session_id) ?? 0) + 1
        );

        const next = (currentCountBySession.get(meta.session_id) ?? 0) + 1;
        currentCountBySession.set(meta.session_id, next);
        await admin.from('sessions').update({ current_participants: next }).eq('id', meta.session_id);

        if (!coachNotifySentForSession.has(meta.session_id)) {
          coachNotifySentForSession.add(meta.session_id);
          const sRow = sessionById.get(meta.session_id);
          const coachId = sRow?.athlete_id as string | undefined;
          const sched = sRow?.scheduled_datetime as string | undefined;
          if (coachId && coachId !== user.id) {
            const dateStr = sched ? formatEST(new Date(sched), 'EEE MMM d, h:mm a') : 'your session';
            await createNotification(admin, {
              user_id: coachId,
              type: 'session_booked',
              title: 'Someone just booked your session',
              body: `New booking for ${dateStr}. Check My sessions.`,
              data: { session_id: meta.session_id },
            }).catch((e) => console.warn('Cart credits: coach notification failed', e));
            await notifyCoachAndAdminsNewBooking(admin, coachId, dateStr, meta.session_id, {
              parentId: user.id,
              youthWrestlerId: meta.wrestler_id,
            }).catch(() => {});
          }
        }
      }

      return NextResponse.json({
        success: true,
        paidWithCredits: true,
        creditsUsed: creditsToUse,
        redirectUrl: `/cart/success?credits_used=${creditsToUse}&sessions=${lines.length}`,
      });
    }

    const stripeEnabled = process.env.STRIPE_CHECKOUT_ENABLED === 'true';
    if (!stripeEnabled) {
      return NextResponse.json({ error: 'Online payment is not enabled' }, { status: 503 });
    }

    let adjustedLineItems = lineItems;
    if (creditsToUse > 0) {
      let remainingCredit = creditsToUse;
      adjustedLineItems = lineItems
        .map((item) => {
          if (remainingCredit <= 0) return item;
          const originalPrice = item.price_data.unit_amount / 100;
          const discount = Math.min(remainingCredit, originalPrice);
          remainingCredit -= discount;
          const newAmount = Math.round((originalPrice - discount) * 100);
          if (newAmount <= 0) {
            return null;
          }
          return {
            ...item,
            price_data: {
              ...item.price_data,
              unit_amount: newAmount,
              product_data: {
                ...item.price_data.product_data,
                description: `${item.price_data.product_data.description} (Credit applied: $${discount.toFixed(2)})`,
              },
            },
          };
        })
        .filter(Boolean) as LineItem[];
    }

    const stripe = getStripeInstance(tenant.slug);
    const stripeRedirectOrigin = publicOriginForStripeRedirect(host, req);

    const successUrl = `${stripeRedirectOrigin}/cart/success?stripe_cs={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${stripeRedirectOrigin}/cart/checkout`;

    const idemParts = lines.map((l) => `${l.sessionId}:${l.wrestlerId}`).sort();
    const idempotencyKey = `cart-checkout-${user.id}-${idemParts.join(',')}-${Date.now()}`.slice(0, 255);

    const cartSessionTypes = sessionIdsUnique.map((id) =>
      String((sessionById.get(id) as { session_type?: string | null } | undefined)?.session_type ?? '')
    );
    const cartSessionType =
      cartSessionTypes.length > 0 && cartSessionTypes.every((t) => t === cartSessionTypes[0])
        ? cartSessionTypes[0]!
        : 'mixed';

    const stripeLineItems = adjustedLineItems.filter((i) => i.price_data.unit_amount > 0);

    const primarySessionId = sessionIdsUnique[0] ?? '';
    const primaryS = primarySessionId ? sessionById.get(primarySessionId) : undefined;
    const primaryCoach = primaryS
      ? (Array.isArray(primaryS.athletes) ? primaryS.athletes[0] : primaryS.athletes) as
          | { first_name?: string; last_name?: string }
          | undefined
      : undefined;
    const primaryCoachName = primaryCoach
      ? [primaryCoach.first_name, primaryCoach.last_name].filter(Boolean).join(' ').trim()
      : '';
    const cartAthleteNames = uniqueWrestlerIds
      .map((id) => nameByWrestler.get(id))
      .filter(Boolean)
      .join(', ');
    const cartProductName =
      lines.length === 1 && primaryS
        ? formatGuildProductName({
            sessionType: (primaryS.session_type as string) ?? cartSessionType,
            sessionMode: (primaryS.session_mode as string) ?? null,
            scheduledDatetime: (primaryS.scheduled_datetime as string) ?? null,
            coachName: primaryCoachName || undefined,
          })
        : `Cart checkout · ${lines.length} spot${lines.length !== 1 ? 's' : ''}`.slice(0, 500);

    const metadata = buildGuildCheckoutMetadata({
      source: 'guild_cart',
      tenantSlug: tenant.slug,
      parentId: user.id,
      parentEmail: user.email,
      athleteName: cartAthleteNames || undefined,
      bookingId: primarySessionId || undefined,
      productName: cartProductName,
      extras: {
        category: 'booking',
        session_type: cartSessionType,
        platform_fee_pct: '20',
        cart_checkout: 'true',
        cart_lines: cartLinesMeta,
        session_ids: sessionIdsUnique.join(','),
        session_prices: sessionMetadata.map((m) => `${m.session_id}:${m.price}`).join(','),
        credits_to_use: creditsToUse.toString(),
      },
    });

    const stripeSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: stripeLineItems,
        metadata,
        payment_intent_data: guildPaymentIntentData(metadata),
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: user.email ?? undefined,
      },
      { idempotencyKey }
    );

    if (!stripeSession.url) {
      return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
    }

    return NextResponse.json({
      checkoutUrl: stripeSession.url,
      creditsApplied: creditsToUse,
      totalAfterCredits: amountToPay,
    });
  } catch (e) {
    const err = e as Error;
    console.error('Cart checkout API error:', err.message, err.stack);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
