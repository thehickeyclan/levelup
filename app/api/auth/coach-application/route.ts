import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { hasMinPhoneDigits } from '@/lib/phone';
import {
  buildCoachApplicationAthleteInsert,
  buildCoachApplicationUserInsert,
} from '@/lib/coach-application-signup';
import {
  getCoachApplicationsNotifyEmail,
  sendCoachApplicationSubmittedToAdmin,
  sendCoachApplicationSubmittedToCoach,
} from '@/lib/email/coach-application-emails';
import { getRequestBaseUrl } from '@/lib/request-base-url';

function bodyBool(v: unknown): boolean {
  return v === true || v === 'true';
}

export async function POST(req: NextRequest) {
  try {
    const hostname = req.headers.get('host') || '';
    const tenant = getTenantByDomain(hostname);
    
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      coachType,
      school,
      weightClass,
      bio,
      hasSafeSport,
      safeSportExpiry,
      hasBackgroundCheck,
      backgroundCheckDate,
      tshirtSize,
      payoutMethod,
      venmoHandle,
      zelleContact,
      password,
    } = body;
    // Older native builds collected only a Venmo handle and did not send the
    // payoutMethod field. Infer it so those installed builds can still submit
    // applications while newer builds expose an explicit Venmo/Zelle choice.
    const resolvedPayoutMethod = payoutMethod || (venmoHandle ? 'venmo' : zelleContact ? 'zelle' : null);

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !dateOfBirth || !coachType || !school || !bio || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!hasMinPhoneDigits(String(phone))) {
      return NextResponse.json({ error: 'Enter a valid cell number (at least 10 digits).' }, { status: 400 });
    }

    if (!['ncaa_athlete', 'club_hs_coach'].includes(coachType)) {
      return NextResponse.json({ error: 'Invalid coach type' }, { status: 400 });
    }

    if (!resolvedPayoutMethod || !['venmo', 'zelle'].includes(resolvedPayoutMethod)) {
      return NextResponse.json({ error: 'Invalid payout method' }, { status: 400 });
    }

    if (resolvedPayoutMethod === 'venmo' && !venmoHandle) {
      return NextResponse.json({ error: 'Venmo handle is required' }, { status: 400 });
    }

    if (resolvedPayoutMethod === 'zelle' && !zelleContact) {
      return NextResponse.json({ error: 'Zelle contact is required' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient(tenant.slug);

    // Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create user' },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    const emailNormalized = email.toLowerCase().trim();

    // Insert into users table (columns must match migrations — see lib/coach-application-signup.ts + tests)
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert(
        buildCoachApplicationUserInsert({
          userId,
          emailNormalized,
          firstName,
          lastName,
          phoneDigits: phone.replace(/\D/g, ''),
        })
      );

    if (userError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: `Failed to create user profile: ${userError.message}` },
        { status: 500 }
      );
    }

    const { error: athleteError } = await supabaseAdmin.from('athletes').insert(
      buildCoachApplicationAthleteInsert({
        userId,
        firstName,
        lastName,
        school,
        coachType,
        weightClass: weightClass || null,
        bio,
        dateOfBirth,
        payoutMethod: resolvedPayoutMethod,
        venmoHandle: venmoHandle ?? null,
        zelleContact: zelleContact ?? null,
        hasSafeSport: bodyBool(hasSafeSport),
        safeSportExpiry: safeSportExpiry ?? null,
        hasBackgroundCheck: bodyBool(hasBackgroundCheck),
        backgroundCheckDate: backgroundCheckDate ?? null,
        tshirtSize: tshirtSize ?? null,
      })
    );

    if (athleteError) {
      await supabaseAdmin.from('users').delete().eq('id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: `Failed to create coach profile: ${athleteError.message}` },
        { status: 500 }
      );
    }

    const baseUrl = getRequestBaseUrl(req);
    try {
      await Promise.all([
        sendCoachApplicationSubmittedToCoach({
          to: emailNormalized,
          firstName,
          tenant,
          baseUrl,
        }),
        sendCoachApplicationSubmittedToAdmin({
          adminEmail: getCoachApplicationsNotifyEmail(tenant),
          applicantFirstName: firstName,
          applicantLastName: lastName,
          applicantEmail: emailNormalized,
          tenant,
          baseUrl,
        }),
      ]);
    } catch (e) {
      console.error('[email] coach application notifications failed:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully',
      user: {
        id: userId,
        email,
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('Coach application error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
