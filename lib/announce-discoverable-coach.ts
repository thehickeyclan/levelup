import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';

const NEARBY_MILES = 50;

type Point = { latitude: number; longitude: number };

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceMiles(a: Point, b: Point): number {
  const earthMiles = 3958.8;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(h));
}

async function geocodeZip(zip: string): Promise<Point | null> {
  const token = process.env.MAPBOX_SECRET_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return null;
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zip)}.json`);
  url.searchParams.set('country', 'US');
  url.searchParams.set('types', 'postcode');
  url.searchParams.set('limit', '1');
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return null;
  const json = (await response.json()) as { features?: { center?: [number, number] }[] };
  const center = json.features?.[0]?.center;
  return center ? { longitude: center[0], latitude: center[1] } : null;
}

function wantsNearbyCoachAlert(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (raw as Record<string, unknown>).nearby_coaches_push === true;
}

/**
 * Announce an active coach once at their first mapped location. Nearby alerts are
 * push/in-app only, ZIP-centroid based, opt-in, and deduplicated per parent/coach.
 */
export async function announceDiscoverableCoach(admin: SupabaseClient, coachId: string): Promise<void> {
  try {
    const { data: coach } = await admin
      .from('athletes')
      .select('id, first_name, last_name, active, facility_id, secondary_facility_id')
      .eq('id', coachId)
      .maybeSingle();
    if (!coach?.active) return;

    const facilityIds = [coach.facility_id, coach.secondary_facility_id].filter(Boolean) as string[];
    if (facilityIds.length === 0) return;
    const { data: facilities } = await admin
      .from('facilities')
      .select('id, name, latitude, longitude')
      .in('id', facilityIds)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);
    const facility = facilities?.find((row) => row.id === coach.facility_id) ?? facilities?.[0];
    if (facility?.latitude == null || facility.longitude == null) return;

    const coachName = `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim() || 'A new coach';
    const { data: existingPost } = await admin
      .from('activity_posts')
      .select('id')
      .eq('trigger_type', 'coach_joined')
      .eq('coach_id', coachId)
      .maybeSingle();
    if (!existingPost) {
      await admin.from('activity_posts').insert({
        trigger_type: 'coach_joined',
        coach_id: coachId,
        caption: `${coachName} is now available at ${facility.name ?? 'a Guild location'}.`,
        is_public: true,
        parent_approved: true,
      });
    }

    const { data: parents } = await admin
      .from('users')
      .select('id, zip_code, notification_preferences')
      .eq('role', 'parent')
      .not('zip_code', 'is', null);
    const optedIn = (parents ?? []).filter((parent) => wantsNearbyCoachAlert(parent.notification_preferences));
    if (optedIn.length === 0) return;

    const { data: sent } = await admin
      .from('nearby_coach_alerts')
      .select('parent_id')
      .eq('coach_id', coachId);
    const alreadySent = new Set((sent ?? []).map((row) => row.parent_id));
    const zipPoints = new Map<string, Point | null>();
    const coachPoint = { latitude: Number(facility.latitude), longitude: Number(facility.longitude) };

    for (const parent of optedIn) {
      if (alreadySent.has(parent.id) || !parent.zip_code) continue;
      const zip = String(parent.zip_code).slice(0, 5);
      if (!zipPoints.has(zip)) zipPoints.set(zip, await geocodeZip(zip));
      const parentPoint = zipPoints.get(zip);
      if (!parentPoint) continue;
      const miles = distanceMiles(parentPoint, coachPoint);
      if (miles > NEARBY_MILES) continue;

      const { error: logError } = await admin.from('nearby_coach_alerts').insert({
        coach_id: coachId,
        parent_id: parent.id,
        distance_miles: Number(miles.toFixed(2)),
      });
      if (logError) continue;
      await createNotification(admin, {
        user_id: parent.id,
        type: 'nearby_coach_joined',
        title: 'New Guild coach near you',
        body: `${coachName} is now available at ${facility.name ?? 'a nearby location'}.`,
        coachId,
        data: { coach_id: coachId, link: `/athlete/${coachId}`, distance_miles: Math.round(miles) },
      });
    }
  } catch (error) {
    console.warn('announceDiscoverableCoach failed:', error);
  }
}
