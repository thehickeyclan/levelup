import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export type SellerProfile = {
  id: string;
  displayName: string;
  role: string;
  school?: string | null;
  photoUrl?: string | null;
};

export type SellerPublicMeta = {
  displayName: string;
  school: string | null;
  photoUrl: string | null;
};

export function formatSellerDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  school?: string | null
): string {
  const first = firstName?.trim() || '';
  const last = lastName?.trim() || '';
  let base: string;
  if (first && last) {
    const lastInitial = last.charAt(0);
    base = lastInitial ? `${first} ${lastInitial}.` : first;
  } else if (first) {
    base = first;
  } else if (last) {
    base = last;
  } else {
    return '';
  }
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

async function loadSellerRoleExtras(
  supabase: SupabaseClient,
  userId: string,
  role: string
): Promise<{ school: string | null; photoUrl: string | null }> {
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

  return { school, photoUrl };
}

/** Public seller labels for market browse — bypasses users RLS (own-profile only). */
export async function fetchSellerPublicMetaBatch(
  tenantSlug: string,
  sellerIds: string[]
): Promise<Map<string, SellerPublicMeta>> {
  const map = new Map<string, SellerPublicMeta>();
  if (!sellerIds.length) return map;

  const admin = createAdminClient(tenantSlug);
  const { data: users } = await admin
    .from('users')
    .select('id, first_name, last_name, role')
    .in('id', sellerIds);

  const coachIds = (users ?? []).filter((u) => u.role === 'coach').map((u) => u.id as string);
  const youthIds = (users ?? []).filter((u) => u.role === 'youth_wrestler').map((u) => u.id as string);

  const schoolMap = new Map<string, string>();
  const photoMap = new Map<string, string>();

  if (coachIds.length) {
    const { data: athletes } = await admin
      .from('athletes')
      .select('id, school, photo_url')
      .in('id', coachIds);
    for (const a of athletes ?? []) {
      if (a.school) schoolMap.set(a.id as string, a.school as string);
      if (a.photo_url) photoMap.set(a.id as string, a.photo_url as string);
    }
  }

  if (youthIds.length) {
    const { data: youths } = await admin
      .from('youth_wrestlers')
      .select('id, school, photo_url')
      .in('id', youthIds);
    for (const y of youths ?? []) {
      if (y.school) schoolMap.set(y.id as string, y.school as string);
      if (y.photo_url) photoMap.set(y.id as string, y.photo_url as string);
    }
  }

  for (const u of users ?? []) {
    const id = u.id as string;
    const school = schoolMap.get(id) ?? null;
    const displayName =
      formatSellerDisplayName(u.first_name as string, u.last_name as string, school) ||
      sellerFallbackDisplayName(id);
    map.set(id, {
      displayName,
      school,
      photoUrl: photoMap.get(id) ?? null,
    });
  }

  return map;
}

export async function getSellerProfile(
  tenantSlug: string,
  userId: string
): Promise<SellerProfile> {
  const admin = createAdminClient(tenantSlug);
  const { data: user } = await admin
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
  const { school, photoUrl } = await loadSellerRoleExtras(admin, userId, role);

  const displayName =
    formatSellerDisplayName(user.first_name, user.last_name, school) ||
    sellerFallbackDisplayName(userId);

  return {
    id: userId,
    displayName,
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
