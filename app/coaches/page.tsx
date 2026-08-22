import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTenantByDomain, getTenantConfig } from '@/config/tenants';
import { CoachesLanding } from '@/components/coaches/coaches-landing';
import { CoachesStickyCtaWrapper } from '@/components/coaches/coaches-sticky-cta-wrapper';
import {
  buildCoachesEarningsExamples,
  buildCoachesEarningsScenarios,
  fetchCoachesLandingData,
  resolveCoachesPracticeVideoSrc,
} from '@/lib/coaches-landing';
import { fetchHomeReviews } from '@/lib/home/fetch-home-reviews';
import { coachRevenueSharePercentDisplay } from '@/lib/pricing';

/** Live booking stats — always fetch fresh so marketing numbers stay current. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Coach with The Guild | You Coach, We Handle the Rest',
  description:
    'Run your private coaching business with The Wrestling Guild. Publish availability, accept bookings, manage athletes, message families, and share one booking link.',
};

export default async function CoachesPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) {
    redirect('/404');
  }

  const config = getTenantConfig(tenant.slug);
  const [{ coaches, bySchool, stats, recentActivity }, reviews] = await Promise.all([
    fetchCoachesLandingData(tenant.slug),
    fetchHomeReviews(tenant.slug, 3),
  ]);

  const featuredCoaches = [...coaches]
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 8);

  const earningsExamples = buildCoachesEarningsExamples(config.pricing);
  const earningsScenarios = buildCoachesEarningsScenarios(config.pricing);
  const coachSharePercent = coachRevenueSharePercentDisplay(null);
  const practiceVideoSrc = resolveCoachesPracticeVideoSrc();

  return (
    <main className="min-h-screen bg-black pb-16 md:pb-0">
      <CoachesLanding
        coaches={coaches}
        bySchool={bySchool}
        stats={stats}
        recentActivity={recentActivity}
        featuredCoaches={featuredCoaches}
        earningsExamples={earningsExamples}
        earningsScenarios={earningsScenarios}
        reviews={reviews}
        coachSharePercent={coachSharePercent}
        practiceVideoSrc={practiceVideoSrc}
      />
      <CoachesStickyCtaWrapper />
    </main>
  );
}
