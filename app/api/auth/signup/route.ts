import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { verifyInviteToken } from '@/lib/invite-parent-token';
import { validateRequiredYouthPhone, validateRequiredCellPhone } from '@/lib/phone';
import { resolveDiscountPercentOff } from '@/lib/discount-codes';
import { family10CodeBlockedForEmail } from '@/lib/family-auto-discount';
import { normalizeUsZipCode } from '@/lib/us-zip';
import { createReferralAttributionOnSignup, isRewardsProgramEnabled } from '@/lib/rewards';
import { isTocGiveawayOpen, normalizeTocCampaign } from '@/lib/toc-giveaway';

export async function POST(req: NextRequest) {
  try {
    const hostname = req.headers.get('host') || '';
    const tenant = getTenantByDomain(hostname);
    
    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      email,
      password,
      role,
      coachType,
      firstName,
      lastName,
      school,
      discountCode,
      inviteToken,
      athletePhone,
      referralCode: referralCodeBody,
      campaign,
    } = body;
    const tocCampaign = normalizeTocCampaign(campaign);

    // Validate required fields
    if (!email || !password || !role) {
      return NextResponse.json(
        { error: 'Email, password, and role are required' },
        { status: 400 }
      );
    }

    // Validate role (admin cannot be self-assigned via signup)
    if (!['parent', 'coach', 'youth_wrestler'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }
    if (inviteToken && role !== 'parent') {
      return NextResponse.json(
        { error: 'Invite links are for parent accounts. Please sign up as Parent.' },
        { status: 400 }
      );
    }
    const invitePayload = typeof inviteToken === 'string' && inviteToken.trim() ? verifyInviteToken(inviteToken.trim()) : null;

    let parentSignupPhone: string | undefined;
    if (role === 'parent') {
      const fn = typeof firstName === 'string' ? firstName.trim() : '';
      const ln = typeof lastName === 'string' ? lastName.trim() : '';
      if (!fn || !ln) {
        return NextResponse.json(
          { error: 'First name and last name are required.' },
          { status: 400 }
        );
      }
      const zipNorm = normalizeUsZipCode(typeof body.zipCode === 'string' ? body.zipCode : '');
      if (!zipNorm) {
        return NextResponse.json(
          { error: 'A valid U.S. home ZIP code is required (5 digits, or ZIP+4).' },
          { status: 400 }
        );
      }
      const pp = validateRequiredCellPhone(body.phone ?? body.cellPhone);
      if (!pp.ok) {
        return NextResponse.json({ error: pp.message }, { status: 400 });
      }
      parentSignupPhone = pp.phone;
    }

    // For athletes (coaches), require additional fields and coach type
    if (role === 'coach') {
      if (!firstName || !lastName || !school?.trim()) {
        return NextResponse.json(
          { error: 'First name, last name, and school/club are required for coaches' },
          { status: 400 }
        );
      }
      if (!['ncaa_athlete', 'club_hs_coach'].includes(coachType)) {
        return NextResponse.json(
          { error: 'Please select whether you are an Active NCAA Athlete or Club/HS Coach' },
          { status: 400 }
        );
      }
    }

    let youthAthletePhone: string | undefined;
    let youthZipNorm: string | undefined;
    if (role === 'youth_wrestler') {
      if (!firstName || !lastName) {
        return NextResponse.json(
          { error: 'First name and last name are required for youth wrestlers' },
          { status: 400 }
        );
      }
      const ph = validateRequiredYouthPhone(athletePhone);
      if (!ph.ok) {
        return NextResponse.json({ error: ph.message }, { status: 400 });
      }
      youthAthletePhone = ph.phone;
      const z = normalizeUsZipCode(typeof body.zipCode === 'string' ? body.zipCode : '');
      if (!z) {
        return NextResponse.json(
          { error: 'A valid U.S. home ZIP code is required (5 digits or ZIP+4).' },
          { status: 400 }
        );
      }
      youthZipNorm = z;
    }

    const supabaseAdmin = createAdminClient(tenant.slug);

    // Discount code: only for parents; percent-off codes only (early-adopter free sessions disabled)
    let discountCodeValid: { id: string; code: string; redemptions: number; percent_off?: number | null } | null = null;
    if (role === 'parent' && typeof discountCode === 'string' && discountCode.trim()) {
      const codeNormalized = discountCode.trim().toUpperCase();
      const { data: row, error: codeErr } = await supabaseAdmin
        .from('discount_codes')
        .select('id, code, max_redemptions, redemptions, active, percent_off')
        .eq('code', codeNormalized)
        .maybeSingle();
      if (codeErr || !row) {
        return NextResponse.json(
          { error: 'Invalid or expired discount code' },
          { status: 400 }
        );
      }
      if (row.active === false) {
        return NextResponse.json(
          { error: 'This discount code is no longer active' },
          { status: 400 }
        );
      }
      const max = row.max_redemptions;
      const current = row.redemptions ?? 0;
      if (max != null && current >= max) {
        return NextResponse.json(
          { error: 'This discount code has reached its limit' },
          { status: 400 }
        );
      }
      const po = resolveDiscountPercentOff(row.code, row.percent_off);
      if (po == null) {
        return NextResponse.json(
          {
            error:
              'This code is not a percent-off discount. Use a family code like FAMILY10, or ask an admin to set "Percent off" on this code.',
          },
          { status: 400 }
        );
      }
      if (family10CodeBlockedForEmail(codeNormalized, email)) {
        return NextResponse.json(
          { error: 'This discount code is not available for your account.' },
          { status: 400 }
        );
      }
      discountCodeValid = { id: row.id, code: row.code, redemptions: current, percent_off: po };
    }

    // Create Supabase admin client (to create user)

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for now (can change later)
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create user' },
        { status: 400 }
      );
    }

    const userId = authData.user.id;
    const emailNormalized = (email ?? '').trim().toLowerCase();

    const usersInsert: Record<string, string> = {
      id: userId,
      email: emailNormalized,
      role,
    };
    if (role === 'parent') {
      usersInsert.first_name = String(firstName).trim();
      usersInsert.last_name = String(lastName).trim();
      usersInsert.zip_code = normalizeUsZipCode(String(body.zipCode ?? ''))!;
      usersInsert.phone = parentSignupPhone!;
    }
    if (role === 'youth_wrestler') {
      usersInsert.first_name = String(firstName).trim();
      usersInsert.last_name = String(lastName).trim();
      usersInsert.zip_code = youthZipNorm!;
      usersInsert.phone = youthAthletePhone!;
    }

    // Insert into users table (one user per email address; store normalized for consistency)
    const { error: userError } = await supabaseAdmin.from('users').insert(usersInsert);

    if (userError) {
      // Rollback: delete auth user if user table insert fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: `Failed to create user profile: ${userError.message}` },
        { status: 500 }
      );
    }

    if (role === 'parent' && isRewardsProgramEnabled()) {
      const referralCodeRaw =
        typeof referralCodeBody === 'string' ? referralCodeBody.trim() : '';
      if (referralCodeRaw) {
        const refRes = await createReferralAttributionOnSignup(supabaseAdmin, {
          referredUserId: userId,
          referredEmailLower: emailNormalized,
          referralCodeRaw,
        });
        if (!refRes.ok) {
          await supabaseAdmin.from('users').delete().eq('id', userId);
          await supabaseAdmin.auth.admin.deleteUser(userId);
          return NextResponse.json({ error: refRes.error }, { status: 400 });
        }
      }
    }

    // If they signed up via invite link, link them to the youth wrestler
    if (invitePayload && role === 'parent') {
      const { error: linkErr } = await supabaseAdmin.from('youth_wrestler_parents').insert({
        youth_wrestler_id: invitePayload.youthWrestlerId,
        parent_id: userId,
      });
      if (linkErr && linkErr.code !== '23505') {
        console.warn('Invite link: failed to link parent to youth wrestler', linkErr);
      }
    }

    // Grant percent-off discount for parents who used a valid code (validated above as 1–100%)
    if (discountCodeValid && role === 'parent') {
      const percentOff = discountCodeValid.percent_off!;
      const { error: pctErr } = await supabaseAdmin.from('parent_percentage_discounts').insert({
        parent_id: userId,
        discount_code_id: discountCodeValid.id,
        percent_off: percentOff,
      });
      if (pctErr) {
        await supabaseAdmin.from('users').delete().eq('id', userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json(
          { error: 'Failed to apply discount code benefits' },
          { status: 500 }
        );
      }
      const { error: incErr } = await supabaseAdmin
        .from('discount_codes')
        .update({ redemptions: discountCodeValid.redemptions + 1, updated_at: new Date().toISOString() })
        .eq('id', discountCodeValid.id);
      if (incErr) {
        console.warn('Discount code redemption count not incremented:', incErr);
      }
    }

    // If athlete, create athlete profile
    if (role === 'coach') {
      const { error: athleteError } = await supabaseAdmin
        .from('athletes')
        .insert({
          id: userId,
          first_name: firstName,
          last_name: lastName,
          school: school.trim(),
          coach_type: coachType,
          active: false, // Will be activated after certification verification
        });

      if (athleteError) {
        // Rollback: delete user and auth user
        await supabaseAdmin.from('users').delete().eq('id', userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json(
          { error: `Failed to create athlete profile: ${athleteError.message}` },
          { status: 500 }
        );
      }
    }

    // If youth_wrestler, create entry in youth_wrestlers table (parent_id can be null for self-managed accounts)
    if (role === 'youth_wrestler') {
      const { error: youthWrestlerError } = await supabaseAdmin
        .from('youth_wrestlers')
        .insert({
          id: userId, // Use the user ID as the youth_wrestler ID
          parent_id: null, // Null for self-managed accounts, can be linked to parent later
          first_name: firstName,
          last_name: lastName,
          phone: youthAthletePhone!,
          zip_code: youthZipNorm!,
          active: true,
        });

      if (youthWrestlerError) {
        // Rollback: delete user and auth user
        await supabaseAdmin.from('users').delete().eq('id', userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json(
          { error: `Failed to create youth wrestler profile: ${youthWrestlerError.message}` },
          { status: 500 }
        );
      }

      if (tocCampaign && isTocGiveawayOpen()) {
        const { error: tocErr } = await supabaseAdmin.from('toc_giveaway_entries').upsert(
          {
            campaign: tocCampaign,
            user_id: userId,
            youth_wrestler_id: userId,
            email: emailNormalized,
            first_name: String(firstName).trim(),
            last_name: String(lastName).trim(),
            phone: youthAthletePhone!,
            zip_code: youthZipNorm!,
            eligible: true,
            source: 'signup',
          },
          { onConflict: 'campaign,user_id' }
        );

        if (tocErr) {
          await supabaseAdmin.from('youth_wrestlers').delete().eq('id', userId);
          await supabaseAdmin.from('users').delete().eq('id', userId);
          await supabaseAdmin.auth.admin.deleteUser(userId);
          return NextResponse.json(
            { error: `Failed to enter Tournament of Champions giveaway: ${tocErr.message}` },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
        role,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
