import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripeInstance, getWebhookSecret } from '@/lib/stripe/webhooks';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain, tenants } from '@/config/tenants';
import { createNotification } from '@/lib/notifications';
import { ensureSessionGuildThread } from '@/lib/guild-messaging';
import { notifyCoachAndAdminsNewBooking } from '@/lib/twilio';
import { formatEST } from '@/lib/format-date';
import { headers } from 'next/headers';
import { maybeBackfillRosterSnapshot } from '@/lib/session-roster-snapshot';
import { maybeBackfillUserNameFromCheckoutSession } from '@/lib/stripe-backfill-user-name';
import {
  countPaidSessionSpotsForParent,
  issueSessionEarnedForCheckoutLines,
  isRewardsProgramEnabled,
} from '@/lib/rewards';
import { isGuildDeferredBookingCheckout } from '@/lib/stripe/guild-checkout-metadata';

/**
 * Fetch the actual Stripe fee from a PaymentIntent's balance transaction.
 * Returns fee in dollars (not cents).
 */
async function getStripeFee(stripe: Stripe, paymentIntentId: string): Promise<number> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    });
    const charge = pi.latest_charge as Stripe.Charge | null;
    const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
    if (bt?.fee) {
      return bt.fee / 100; // Convert cents to dollars
    }
  } catch (e) {
    console.warn('Failed to fetch Stripe fee:', e);
  }
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
    }

    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host) ?? { slug: 'guild' };
    const webhookSecret = getWebhookSecret(tenant.slug);
    const stripe = getStripeInstance(tenant.slug);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook signature verification failed';
      console.error('Stripe webhook signature error:', message);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const app = session.metadata?.app;
      const isCartCheckout = session.metadata?.cart_checkout === 'true';
      const sessionId = session.metadata?.session_id;
      const sessionIds = session.metadata?.session_ids?.split(',').filter(Boolean) || [];
      
      if (app !== 'the-guild') {
        return NextResponse.json({ received: true });
      }
      
      // Handle cart checkout (multiple lines: session + wrestler per line; same session may repeat for two kids)
      if (isCartCheckout) {
        const parentId = session.metadata?.parent_id;
        const sessionPrices = session.metadata?.session_prices?.split(',') || [];
        const creditsUsed = parseFloat(session.metadata?.credits_to_use || '0');
        const cartLinesRaw = session.metadata?.cart_lines as string | undefined;
        const youthWrestlerIdLegacy = session.metadata?.youth_wrestler_id;

        if (!parentId) {
          console.error('Cart checkout webhook: missing parent_id', session.metadata);
          return NextResponse.json({ error: 'Missing parent metadata' }, { status: 500 });
        }

        const rawMetaTenant = (session.metadata?.tenant_slug as string | undefined)?.trim().toLowerCase();
        const tenantSlug = rawMetaTenant && rawMetaTenant in tenants ? rawMetaTenant : 'guild';
        const supabase = createAdminClient(tenantSlug);
        const paidSpotsBeforeCart = isRewardsProgramEnabled()
          ? await countPaidSessionSpotsForParent(supabase, parentId)
          : 0;

        const paymentIntentId =
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        const totalStripeFee = paymentIntentId ? await getStripeFee(stripe, paymentIntentId) : 0;

        type CartLineRow = { sid: string; ywid: string; amountPaid: number };
        let rows: CartLineRow[] = [];

        if (cartLinesRaw && cartLinesRaw.length > 0) {
          rows = cartLinesRaw
            .split(';')
            .filter(Boolean)
            .map((seg) => {
              const [sid, ywid, priceStr] = seg.split('|');
              return {
                sid: sid?.trim() ?? '',
                ywid: ywid?.trim() ?? '',
                amountPaid: parseFloat(priceStr || '0'),
              };
            })
            .filter((r) => r.sid && r.ywid);
        } else if (sessionIds.length > 0 && youthWrestlerIdLegacy) {
          for (const sid of sessionIds) {
            const priceEntry = sessionPrices.find((p) => p.startsWith(`${sid}:`));
            const amountPaid = priceEntry ? parseFloat(priceEntry.split(':')[1]) : 0;
            rows.push({ sid, ywid: youthWrestlerIdLegacy, amountPaid });
          }
        }

        if (rows.length === 0) {
          console.error('Cart checkout webhook: no cart lines', session.metadata);
          return NextResponse.json({ error: 'Missing cart lines' }, { status: 500 });
        }

        const totalPrice = rows.reduce((sum, r) => sum + r.amountPaid, 0);

        const currentBySession = new Map<string, number>();
        const cartNotifyBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

        for (const { sid, ywid, amountPaid } of rows) {
          const sessionStripeFee = totalPrice > 0 ? (amountPaid / totalPrice) * totalStripeFee : 0;

          const { data: existing } = await supabase
            .from('session_participants')
            .select('id, paid')
            .eq('session_id', sid)
            .eq('youth_wrestler_id', ywid)
            .maybeSingle();

          const { data: sess } = await supabase
            .from('sessions')
            .select('current_participants, athlete_id, scheduled_datetime')
            .eq('id', sid)
            .single();

          if (!existing) {
            const currentFromDb = (sess as { current_participants?: number } | null)?.current_participants ?? 0;
            const baseline = currentBySession.has(sid) ? currentBySession.get(sid)! : currentFromDb;

            const { error: insertErr } = await supabase.from('session_participants').insert({
              session_id: sid,
              youth_wrestler_id: ywid,
              parent_id: parentId,
              paid: true,
              amount_paid: amountPaid,
              stripe_payment_intent_id: paymentIntentId,
              stripe_fee: sessionStripeFee,
            });

            if (insertErr) {
              if (insertErr.code === '23505') {
                await supabase
                  .from('session_participants')
                  .update({
                    paid: true,
                    amount_paid: amountPaid,
                    stripe_payment_intent_id: paymentIntentId,
                    stripe_fee: sessionStripeFee,
                  })
                  .eq('session_id', sid)
                  .eq('youth_wrestler_id', ywid);
              } else {
                console.error('Cart webhook: failed to insert participant', insertErr, { sid, ywid });
              }
            } else {
              const next = baseline + 1;
              currentBySession.set(sid, next);
              await supabase
                .from('sessions')
                .update({ current_participants: next, updated_at: new Date().toISOString() })
                .eq('id', sid);

              const coachId = (sess as { athlete_id?: string } | null)?.athlete_id;
              const dt = (sess as { scheduled_datetime?: string } | null)?.scheduled_datetime;
              if (coachId) {
                const dateStr = dt ? formatEST(new Date(dt), 'EEE MMM d, h:mm a') : 'your session';
                await createNotification(supabase, {
                  user_id: coachId,
                  type: 'session_booked',
                  title: 'Someone just booked your session',
                  body: `New booking for ${dateStr}. Check My sessions.`,
                  data: { session_id: sid },
                }).catch((e) => console.warn('Cart webhook: coach notification failed', e));
                await notifyCoachAndAdminsNewBooking(supabase, coachId, dateStr, sid, {
                  parentId,
                  youthWrestlerId: ywid,
                }).catch(() => {});
              }
              void ensureSessionGuildThread(supabase, tenantSlug, sid, parentId, coachId);
            }
          } else {
            const wasAlreadyPaid = (existing as { paid?: boolean } | null)?.paid === true;
            await supabase
              .from('session_participants')
              .update({
                paid: true,
                amount_paid: amountPaid,
                stripe_payment_intent_id: paymentIntentId,
                stripe_fee: sessionStripeFee,
              })
              .eq('session_id', sid)
              .eq('youth_wrestler_id', ywid);

            // Pre-created rows (e.g. coach-approved session requests) skip the insert path — still notify the coach once.
            if (!wasAlreadyPaid) {
              const coachId = (sess as { athlete_id?: string } | null)?.athlete_id;
              const dt = (sess as { scheduled_datetime?: string } | null)?.scheduled_datetime;
              if (coachId) {
                const dateStr = dt ? formatEST(new Date(dt), 'EEE MMM d, h:mm a') : 'your session';
                await createNotification(supabase, {
                  user_id: coachId,
                  type: 'session_booked',
                  title: 'Payment received',
                  body: `A family completed checkout for ${dateStr}. Check My sessions.`,
                  data: { session_id: sid, link: cartNotifyBaseUrl ? `${cartNotifyBaseUrl}/athlete-dashboard` : '/athlete-dashboard' },
                  coachId,
                }).catch((e) => console.warn('Cart webhook: coach notification failed', e));
                await notifyCoachAndAdminsNewBooking(supabase, coachId, dateStr, sid, {
                  parentId,
                  youthWrestlerId: ywid,
                }).catch(() => {});
              }
              void ensureSessionGuildThread(supabase, tenantSlug, sid, parentId, coachId);
            }
          }
        }

        const uniqueCartSessionIds = [...new Set(rows.map((row) => row.sid))];
        const seenPaidRequestIds = new Set<string>();
        for (const sid of uniqueCartSessionIds) {
          const { data: reqRow } = await supabase
            .from('parent_session_requests')
            .select('id')
            .eq('created_session_id', sid)
            .eq('requesting_parent_id', parentId)
            .eq('status', 'approved')
            .maybeSingle();
          const reqId = (reqRow as { id?: string } | null)?.id;
          if (!reqId || seenPaidRequestIds.has(reqId)) continue;
          seenPaidRequestIds.add(reqId);

          const { data: paidSess } = await supabase
            .from('sessions')
            .select('scheduled_datetime')
            .eq('id', sid)
            .maybeSingle();
          const sched = (paidSess as { scheduled_datetime?: string } | null)?.scheduled_datetime;
          const whenStr = sched ? formatEST(new Date(sched), 'EEE MMM d, h:mm a') : 'your session';
          await createNotification(supabase, {
            user_id: parentId,
            type: 'parent_session_request_paid',
            title: 'Booking confirmed',
            body: `Payment received — you're booked for ${whenStr}. View details in My bookings.`,
            data: {
              session_id: sid,
              requestId: reqId,
              link: cartNotifyBaseUrl ? `${cartNotifyBaseUrl}/bookings` : '/bookings',
            },
          }).catch((e) => console.warn('Cart webhook: parent request paid notify failed', e));
        }

        if (creditsUsed > 0) {
          const { applyCredits } = await import('@/lib/credits');
          await applyCredits({
            userId: parentId,
            amount: creditsUsed,
            sessionId: rows[0].sid,
            description: `Cart checkout for ${rows.length} spot(s)`,
            tenantSlug,
          });
        }

        const stripeCashCart = (session.amount_total ?? 0) / 100;
        if (isRewardsProgramEnabled() && rows.length > 0) {
          await issueSessionEarnedForCheckoutLines(supabase, {
            tenantSlug,
            parentId,
            lines: rows.map((r) => ({
              sessionId: r.sid,
              youthWrestlerId: r.ywid,
              catalogLineDollars: r.amountPaid,
            })),
            stripeCashTotalDollars: stripeCashCart,
            paidSpotsBeforeCheckout: paidSpotsBeforeCart,
          });
        }

        await maybeBackfillUserNameFromCheckoutSession(supabase, parentId, session);

        // Remove only the paid cart lines. Keep unrelated sessions in the family's shared web/iPhone cart.
        for (const row of rows) {
          await supabase
            .from('cart_items')
            .delete()
            .eq('user_id', parentId)
            .eq('session_id', row.sid)
            .eq('athlete_id', row.ywid);
        }

        console.log('Cart checkout webhook completed:', { rows: rows.length, parentId, creditsUsed });
        return NextResponse.json({ received: true });
      }
      
      // Single session checkout (original flow)
      if (!sessionId) {
        return NextResponse.json({ received: true });
      }

      /** Prefer Checkout metadata — Host on webhook requests can be wrong / not in getTenantByDomain. */
      const rawMetaTenant = (session.metadata?.tenant_slug as string | undefined)?.trim().toLowerCase();
      const tenantSlug =
        rawMetaTenant && rawMetaTenant in tenants
          ? rawMetaTenant
          : (getTenantByDomain(host) ?? { slug: 'guild' }).slug;
      const supabase = createAdminClient(tenantSlug);
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      const amountTotal = session.amount_total ?? 0;
      const isFreeOrder = amountTotal === 0;
      const earlyAdopterEntitlementId = session.metadata?.early_adopter_entitlement_id;
      const isRegisterPayment = session.metadata?.register === 'true';
      const youthWrestlerId = session.metadata?.youth_wrestler_id;
      const parentId = session.metadata?.parent_id;

      /** Register checkouts MUST NOT fall through to the “private booking” path — that only updates `sessions`, never adds roster rows. */
      if (isRegisterPayment) {
        if (!youthWrestlerId || !parentId) {
          console.error('Stripe webhook: register=true but missing youth_wrestler_id or parent_id', {
            sessionId,
            stripeCheckoutId: session.id,
            metadata: session.metadata,
          });
          return NextResponse.json(
            { error: 'Register checkout missing wrestler/parent metadata' },
            { status: 500 }
          );
        }
        const paidSpotsBeforeRegister = isRewardsProgramEnabled()
          ? await countPaidSessionSpotsForParent(supabase, parentId)
          : 0;
        const stripeCashDollars = amountTotal / 100;
        const creditsUsed =
          Number.parseFloat(String(session.metadata?.credits_to_use ?? '0').replace(/,/g, '')) || 0;
        const catalogFromMeta = Number.parseFloat(
          String(session.metadata?.register_catalog_dollars ?? '').replace(/,/g, '')
        );
        const lineTotal =
          Number.isFinite(catalogFromMeta) && catalogFromMeta > 0
            ? catalogFromMeta
            : stripeCashDollars + creditsUsed;
        const amountPaid = lineTotal;
        // Fetch actual Stripe fee
        const stripeFee = paymentIntentId ? await getStripeFee(stripe, paymentIntentId) : 0;

        const { data: existing } = await supabase
          .from('session_participants')
          .select('id')
          .eq('session_id', sessionId)
          .eq('youth_wrestler_id', youthWrestlerId)
          .maybeSingle();
        if (!existing) {
          const { data: sess } = await supabase
            .from('sessions')
            .select('current_participants')
            .eq('id', sessionId)
            .single();
          const current = (sess as { current_participants?: number } | null)?.current_participants ?? 0;
          const { data: ywSnap } = await supabase
            .from('youth_wrestlers')
            .select('first_name, last_name, photo_url')
            .eq('id', youthWrestlerId)
            .maybeSingle();
          const { error: insertErr } = await supabase.from('session_participants').insert({
            session_id: sessionId,
            youth_wrestler_id: youthWrestlerId,
            parent_id: parentId,
            paid: true,
            amount_paid: amountPaid,
            stripe_payment_intent_id: paymentIntentId,
            stripe_fee: stripeFee,
          });
          if (insertErr) {
            // Concurrent webhook deliveries or Stripe retries: two workers both saw "no row" — second insert loses UNIQUE race.
            if (insertErr.code === '23505') {
              await supabase
                .from('session_participants')
                .update({ paid: true, amount_paid: amountPaid, stripe_payment_intent_id: paymentIntentId, stripe_fee: stripeFee })
                .eq('session_id', sessionId)
                .eq('youth_wrestler_id', youthWrestlerId);
              await maybeBackfillRosterSnapshot(supabase, { session_id: sessionId, youth_wrestler_id: youthWrestlerId }, ywSnap ?? {});
            } else {
              console.error('Webhook: failed to insert session_participant (register)', {
                code: insertErr.code,
                message: insertErr.message,
                details: insertErr.details,
                hint: insertErr.hint,
                sessionId,
                youthWrestlerId,
                parentId,
              });
              return NextResponse.json(
                { error: 'Failed to add participant', code: insertErr.code, message: insertErr.message },
                { status: 500 }
              );
            }
          } else {
            const { error: upErr } = await supabase
              .from('sessions')
              .update({ current_participants: current + 1, updated_at: new Date().toISOString() })
              .eq('id', sessionId);
            if (upErr) {
              console.error('Webhook: failed to increment current_participants', upErr);
            }
            await maybeBackfillRosterSnapshot(supabase, { session_id: sessionId, youth_wrestler_id: youthWrestlerId }, ywSnap ?? {});
          }
        } else {
          await supabase
            .from('session_participants')
            .update({ paid: true, amount_paid: amountPaid, stripe_payment_intent_id: paymentIntentId, stripe_fee: stripeFee })
            .eq('session_id', sessionId)
            .eq('youth_wrestler_id', youthWrestlerId);
          const { data: ywExisting } = await supabase
            .from('youth_wrestlers')
            .select('first_name, last_name, photo_url')
            .eq('id', youthWrestlerId)
            .maybeSingle();
          await maybeBackfillRosterSnapshot(supabase, { session_id: sessionId, youth_wrestler_id: youthWrestlerId }, ywExisting ?? {});
        }
        // Notify coach so they see it (college kids need reminders)
        const { data: sessRow } = await supabase
          .from('sessions')
          .select('athlete_id, scheduled_datetime')
          .eq('id', sessionId)
          .single();
        const coachId = (sessRow as { athlete_id?: string } | null)?.athlete_id;
        const dt = (sessRow as { scheduled_datetime?: string } | null)?.scheduled_datetime;
        if (coachId) {
          const dateStr = dt ? formatEST(new Date(dt), 'EEE MMM d, h:mm a') : 'your session';
          await createNotification(supabase, {
            user_id: coachId,
            type: 'session_booked',
            title: 'Someone just booked your session',
            body: `New booking for ${dateStr}. Check My sessions.`,
            data: { session_id: sessionId },
          }).catch((e) => console.warn('Webhook: coach notification failed', e));
          await notifyCoachAndAdminsNewBooking(supabase, coachId, dateStr, sessionId, {
            parentId,
            youthWrestlerId,
          }).catch(() => {});
        }
        void ensureSessionGuildThread(supabase, tenantSlug, sessionId, parentId, coachId);
        if (creditsUsed > 0) {
          const { applyCredits } = await import('@/lib/credits');
          await applyCredits({
            userId: parentId,
            amount: creditsUsed,
            sessionId,
            description: 'Session registration (Pay & register)',
            tenantSlug,
          });
        }
        if (isRewardsProgramEnabled()) {
          await issueSessionEarnedForCheckoutLines(supabase, {
            tenantSlug,
            parentId,
            lines: [
              {
                sessionId,
                youthWrestlerId,
                catalogLineDollars: lineTotal,
              },
            ],
            stripeCashTotalDollars: stripeCashDollars,
            paidSpotsBeforeCheckout: paidSpotsBeforeRegister,
          });
        }
        return NextResponse.json({ received: true });
      }

      /* --- Private booking checkout: roster rows only after payment (booking_lines metadata) --- */
      const bookingLinesRaw = session.metadata?.booking_lines?.trim();
      const isDeferredPrivateBooking = isGuildDeferredBookingCheckout(session.metadata);

      if (isDeferredPrivateBooking) {
        const parentIdBooking = session.metadata?.parent_id;
        if (!parentIdBooking) {
          console.error('Stripe webhook: booking_lines but missing parent_id', session.metadata);
          return NextResponse.json({ error: 'Missing parent_id for booking checkout' }, { status: 500 });
        }

        const paidSpotsBeforeBooking = isRewardsProgramEnabled()
          ? await countPaidSessionSpotsForParent(supabase, parentIdBooking)
          : 0;

        const lineRows = (bookingLinesRaw as string)
          .split(';')
          .filter(Boolean)
          .map((seg) => {
            const [ywid, priceStr] = seg.split('|');
            return {
              ywid: ywid?.trim() ?? '',
              amountPaid: parseFloat(priceStr || '0'),
            };
          })
          .filter((r) => r.ywid);

        if (lineRows.length === 0) {
          console.error('Stripe webhook: empty booking_lines', session.metadata);
          return NextResponse.json({ error: 'Invalid booking_lines' }, { status: 500 });
        }

        const stripeFeeTotal = paymentIntentId ? await getStripeFee(stripe, paymentIntentId) : 0;
        const totalLineAmount = lineRows.reduce((s, r) => s + r.amountPaid, 0);

        const { data: sessBefore } = await supabase
          .from('sessions')
          .select('status, current_participants, athlete_id, scheduled_datetime')
          .eq('id', sessionId)
          .single();
        const sessStatus = (sessBefore as { status?: string } | null)?.status;
        if (sessStatus === 'cancelled') {
          console.warn(
            'Stripe webhook: deferred booking payment for shell previously auto-cancelled; reactivating',
            sessionId
          );
          await supabase
            .from('sessions')
            .update({ status: 'scheduled', updated_at: new Date().toISOString() })
            .eq('id', sessionId);
        }
        let currentCount =
          (sessBefore as { current_participants?: number } | null)?.current_participants ?? 0;

        for (const { ywid, amountPaid } of lineRows) {
          const lineFee = totalLineAmount > 0 ? (amountPaid / totalLineAmount) * stripeFeeTotal : 0;
          const { data: existing } = await supabase
            .from('session_participants')
            .select('id, paid')
            .eq('session_id', sessionId)
            .eq('youth_wrestler_id', ywid)
            .maybeSingle();

          if (!existing) {
            const { data: ywSnap } = await supabase
              .from('youth_wrestlers')
              .select('first_name, last_name, photo_url')
              .eq('id', ywid)
              .maybeSingle();
            const { error: insertErr } = await supabase.from('session_participants').insert({
              session_id: sessionId,
              youth_wrestler_id: ywid,
              parent_id: parentIdBooking,
              paid: true,
              amount_paid: amountPaid,
              stripe_payment_intent_id: paymentIntentId,
              stripe_fee: lineFee,
            });
            if (insertErr) {
              if (insertErr.code === '23505') {
                await supabase
                  .from('session_participants')
                  .update({
                    paid: true,
                    amount_paid: amountPaid,
                    stripe_payment_intent_id: paymentIntentId,
                    stripe_fee: lineFee,
                  })
                  .eq('session_id', sessionId)
                  .eq('youth_wrestler_id', ywid);
              } else {
                console.error('Webhook: booking_lines insert failed', insertErr, { sessionId, ywid });
                return NextResponse.json(
                  { error: 'Failed to add booking participants', message: insertErr.message },
                  { status: 500 }
                );
              }
            } else {
              currentCount += 1;
              await supabase
                .from('sessions')
                .update({ current_participants: currentCount, updated_at: new Date().toISOString() })
                .eq('id', sessionId);
              await maybeBackfillRosterSnapshot(
                supabase,
                { session_id: sessionId, youth_wrestler_id: ywid },
                ywSnap ?? {}
              );
              const coachId = (sessBefore as { athlete_id?: string } | null)?.athlete_id;
              const dt = (sessBefore as { scheduled_datetime?: string } | null)?.scheduled_datetime;
              if (coachId) {
                const dateStr = dt ? formatEST(new Date(dt), 'EEE MMM d, h:mm a') : 'your session';
                await createNotification(supabase, {
                  user_id: coachId,
                  type: 'session_booked',
                  title: 'New booking',
                  body: `Someone booked ${dateStr}. Check My sessions.`,
                  data: { session_id: sessionId },
                }).catch((e) => console.warn('Webhook: coach notification failed', e));
                await notifyCoachAndAdminsNewBooking(supabase, coachId, dateStr, sessionId, {
                  parentId: parentIdBooking,
                  youthWrestlerId: ywid,
                }).catch(() => {});
              }
              void ensureSessionGuildThread(
                supabase,
                tenantSlug,
                sessionId,
                parentIdBooking,
                coachId
              );
            }
          } else {
            const wasPaid = (existing as { paid?: boolean }).paid === true;
            await supabase
              .from('session_participants')
              .update({
                paid: true,
                amount_paid: amountPaid,
                stripe_payment_intent_id: paymentIntentId,
                stripe_fee: lineFee,
              })
              .eq('session_id', sessionId)
              .eq('youth_wrestler_id', ywid);
            const { data: ywExisting } = await supabase
              .from('youth_wrestlers')
              .select('first_name, last_name, photo_url')
              .eq('id', ywid)
              .maybeSingle();
            await maybeBackfillRosterSnapshot(
              supabase,
              { session_id: sessionId, youth_wrestler_id: ywid },
              ywExisting ?? {}
            );
            if (!wasPaid) {
              const coachId = (sessBefore as { athlete_id?: string } | null)?.athlete_id;
              const dt = (sessBefore as { scheduled_datetime?: string } | null)?.scheduled_datetime;
              if (coachId) {
                const dateStr = dt ? formatEST(new Date(dt), 'EEE MMM d, h:mm a') : 'your session';
                await createNotification(supabase, {
                  user_id: coachId,
                  type: 'session_booked',
                  title: 'New booking',
                  body: `Someone booked ${dateStr}. Check My sessions.`,
                  data: { session_id: sessionId },
                }).catch((e) => console.warn('Webhook: coach notification failed', e));
                await notifyCoachAndAdminsNewBooking(supabase, coachId, dateStr, sessionId, {
                  parentId: parentIdBooking,
                  youthWrestlerId: ywid,
                }).catch(() => {});
              }
              void ensureSessionGuildThread(
                supabase,
                tenantSlug,
                sessionId,
                parentIdBooking,
                coachId
              );
            }
          }
        }

        const { error: sessionFinalizeError } = await supabase
          .from('sessions')
          .update({
            status: 'scheduled',
            athlete_paid: !isFreeOrder,
            ...(paymentIntentId && { stripe_payment_intent_id: paymentIntentId }),
          })
          .eq('id', sessionId);

        if (sessionFinalizeError) {
          console.error(
            'Webhook: failed to finalize deferred booking session',
            sessionId,
            sessionFinalizeError
          );
          return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
        }

        const bookingCreditsUsed = parseFloat(String(session.metadata?.credits_to_use || '0'));
        if (Number.isFinite(bookingCreditsUsed) && bookingCreditsUsed > 0) {
          const { applyCredits } = await import('@/lib/credits');
          await applyCredits({
            userId: parentIdBooking,
            amount: bookingCreditsUsed,
            sessionId,
            description: 'Book-a-coach checkout (credit + card)',
            tenantSlug,
          });
        }

        const stripeCashBooking = (session.amount_total ?? 0) / 100;
        if (isRewardsProgramEnabled() && lineRows.length > 0) {
          await issueSessionEarnedForCheckoutLines(supabase, {
            tenantSlug,
            parentId: parentIdBooking,
            lines: lineRows.map((r) => ({
              sessionId,
              youthWrestlerId: r.ywid,
              catalogLineDollars: r.amountPaid,
            })),
            stripeCashTotalDollars: stripeCashBooking,
            paidSpotsBeforeCheckout: paidSpotsBeforeBooking,
          });
        }

        await maybeBackfillUserNameFromCheckoutSession(supabase, parentIdBooking, session);
        return NextResponse.json({ received: true });
      }

      /* --- Legacy private checkout (participants pre-created before payment) --- */
      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          status: 'scheduled',
          athlete_paid: !isFreeOrder,
          ...(paymentIntentId && { stripe_payment_intent_id: paymentIntentId }),
        })
        .eq('id', sessionId);

      if (updateError) {
        console.error('Webhook: failed to update session', sessionId, updateError);
        return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
      }

      const { error: participantsError } = await supabase
        .from('session_participants')
        .update({ paid: true })
        .eq('session_id', sessionId);

      if (participantsError) {
        console.error('Webhook: failed to update session_participants', participantsError);
      }

      // Notify coach when parent pays for a session (e.g. private booking)
      const { data: sessRow } = await supabase
        .from('sessions')
        .select('athlete_id, scheduled_datetime, parent_id')
        .eq('id', sessionId)
        .single();
      const coachId = (sessRow as { athlete_id?: string } | null)?.athlete_id;
      const dt = (sessRow as { scheduled_datetime?: string } | null)?.scheduled_datetime;
      const bookingParentIdForSms = (sessRow as { parent_id?: string } | null)?.parent_id ?? null;
      const { data: part0 } = await supabase
        .from('session_participants')
        .select('youth_wrestler_id')
        .eq('session_id', sessionId)
        .limit(1)
        .maybeSingle();
      const privateYouthId =
        (part0 as { youth_wrestler_id?: string } | null)?.youth_wrestler_id ?? null;
      if (coachId) {
        const dateStr = dt ? formatEST(new Date(dt), 'EEE MMM d, h:mm a') : 'your session';
        await createNotification(supabase, {
          user_id: coachId,
          type: 'session_booked',
          title: 'New booking',
          body: `Someone booked ${dateStr}. Check My sessions.`,
          data: { session_id: sessionId },
        }).catch((e) => console.warn('Webhook: coach notification failed', e));
        await notifyCoachAndAdminsNewBooking(supabase, coachId, dateStr, sessionId, {
          parentId: bookingParentIdForSms ?? undefined,
          youthWrestlerId: privateYouthId,
        }).catch(() => {});
      }

      if (earlyAdopterEntitlementId) {
        const { data: ent } = await supabase
          .from('early_adopter_entitlements')
          .select('remaining')
          .eq('id', earlyAdopterEntitlementId)
          .single();
        if (ent && (ent.remaining ?? 0) > 0) {
          await supabase
            .from('early_adopter_entitlements')
            .update({ remaining: (ent.remaining ?? 1) - 1 })
            .eq('id', earlyAdopterEntitlementId);
        }
      }

      if (bookingParentIdForSms) {
        await maybeBackfillUserNameFromCheckoutSession(supabase, bookingParentIdForSms, session);
      }
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('Stripe webhook error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
