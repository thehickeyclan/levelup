import { headers } from 'next/headers';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { HomeHero } from '@/components/home/home-hero';
import { MeetCoachesSection } from '@/components/home/meet-coaches-section';
import { EcosystemSection } from '@/components/home/ecosystem-section';
import { ParentReviewsCarousel } from '@/components/home/parent-reviews-carousel';
import { TrainingPathsSection } from '@/components/home/training-paths-section';
import { CoachMapSection } from '@/components/map/coach-map-section';
import { CoachApplySection } from '@/components/home/coach-apply-section';
import { StickyMobileBar } from '@/components/home/sticky-mobile-bar';
import {
  fetchFeaturedCoachesForHome,
  fetchFeaturedCoachesWithReviews,
} from '@/lib/home/fetch-featured-coaches';
import { fetchHomeReviews, fetchHomeReviewStats } from '@/lib/home/fetch-home-reviews';

export const metadata = {
  title: 'The Wrestling Guild | Division I Wrestling in Your Community',
  description:
    'NCAA athletes and elite coaches from programs you know — training kids where you live. Browse coaches, read parent reviews, and book sessions across North Carolina.',
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>;
}) {
  const sp = await searchParams;
  const openSessionsRowFilter: 'all' | 'partner' | 'small_group' =
    sp.table === 'partner' ? 'partner' : sp.table === 'group' ? 'small_group' : 'all';

  const headersList = await headers();
  const host = resolveHostnameFromHeaders(headersList);
  const tenant = getTenantByDomain(host);

  let stripCoaches: Awaited<ReturnType<typeof fetchFeaturedCoachesForHome>> = [];
  let featuredCoaches: Awaited<ReturnType<typeof fetchFeaturedCoachesWithReviews>> = [];
  let homeReviews: Awaited<ReturnType<typeof fetchHomeReviews>> = [];
  let reviewStats: Awaited<ReturnType<typeof fetchHomeReviewStats>> = {
    sessionCount: 0,
    coachCount: 0,
    stateCount: 0,
    avgRating: 0,
  };

  if (tenant) {
    const [strip, cards, reviews, stats] = await Promise.all([
      fetchFeaturedCoachesForHome(tenant.slug),
      fetchFeaturedCoachesWithReviews(tenant.slug),
      fetchHomeReviews(tenant.slug),
      fetchHomeReviewStats(tenant.slug),
    ]);
    stripCoaches = strip;
    featuredCoaches = cards;
    homeReviews = reviews;
    reviewStats = stats;
  }

  return (
    <main className="min-h-screen bg-black pb-14 md:pb-0">
      <HomeHero coaches={stripCoaches} />
      <MeetCoachesSection coaches={featuredCoaches} />
      <EcosystemSection />
      <ParentReviewsCarousel reviews={homeReviews} stats={reviewStats} />
      <TrainingPathsSection />
      {tenant && (
        <CoachMapSection tenantSlug={tenant.slug} openSessionsRowFilter={openSessionsRowFilter} />
      )}
      <CoachApplySection />
      <StickyMobileBar />
    </main>
  );
}
