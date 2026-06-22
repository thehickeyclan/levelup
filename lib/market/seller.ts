import type { SupabaseClient } from '@supabase/supabase-js';

export type SellerProfile = {
  id: string;
  displayName: string;
  role: string;
  school?: string | null;
  photoUrl?: string | null;
};

export function formatSellerDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  school?: string | null
): string {
  const first = firstName?.trim() || 'Guild';
  const lastInitial = lastName?.trim()?.charAt(0);
  const base = lastInitial ? `${first} ${lastInitial}.` : first;
  const s = school?.trim();
  return s ? `${base} · ${s}` : base;
}

/** Possessive heading for a seller's showcase tab, e.g. "Matt's Collection". */
export function sellerCollectionHeading(displayName: string): string {
  const segment = displayName.split(' · ')[0]?.trim() || displayName.trim();
  const firstName = segment.split(/\s+/)[0] || segment;
  if (!firstName) return 'Collection';
  if (/^guild member/i.test(firstName)) return 'Guild member collection';
  return `${firstName}'s Collection`;
}

/** When we cannot load a user row — still show a stable label (includes id tail). */
export function sellerFallbackDisplayName(sellerId: string): string {
  const compact = sellerId.replace(/-/g, '').slice(0, 8);
  return compact ? `Guild member · ${compact}` : 'Guild member';
}

export function resolveSellerDisplayName(
  profile: SellerProfile | null | undefined,
  sellerId: string
): string {
  if (profile?.displayName?.trim()) return profile.displayName.trim();
  return sellerFallbackDisplayName(sellerId);
}

export async function getSellerProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<SellerProfile> {
  const { data: user } = await supabase
    .from('users')
    .select('id, first_name, last_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (!user) {
    return {
      id: userId,
      displayName: sellerFallbackDisplayName(userId),
      role: 'unknown',
      school: null,
      photoUrl: null,
    };
  }

  const role = user.role as string;
  let school: string | null = null;
  let photoUrl: string | null = null;

  if (role === 'coach') {
    const { data: athlete } = await supabase
      .from('athletes')
      .select('school, photo_url')
      .eq('id', userId)
      .maybeSingle();
    school = athlete?.school ?? null;
    photoUrl = athlete?.photo_url ?? null;
  } else if (role === 'youth_wrestler') {
    const { data: yw } = await supabase
      .from('youth_wrestlers')
      .select('school, photo_url')
      .eq('id', userId)
      .maybeSingle();
    school = yw?.school ?? null;
    photoUrl = yw?.photo_url ?? null;
  }

  return {
    id: userId,
    displayName: formatSellerDisplayName(user.first_name, user.last_name, school),
    role,
    school,
    photoUrl,
  };
}

/** Youth seller payouts go to linked parent when possible. */
export async function resolvePayoutRecipientId(
  supabase: SupabaseClient,
  sellerId: string
): Promise<string> {
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('id', sellerId)
    .maybeSingle();

  if (user?.role !== 'youth_wrestler') return sellerId;

  const { data: yw } = await supabase
    .from('youth_wrestlers')
    .select('parent_id')
    .eq('id', sellerId)
    .maybeSingle();

  return yw?.parent_id ?? sellerId;
}
