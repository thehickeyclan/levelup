import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTenantByDomain, getTenantConfig } from '@/config/tenants';
import { CoachesLanding } from '@/components/coaches/coaches-landing';
import {
  buildCoachesEarningsExamples,
  fetchCoachesLandingData,
} from '@/lib/coaches-landing';
import { fetchHomeReviews } from '@/lib/home/fetch-home-reviews';
import { coachRevenueSharePercentDisplay } from '@/lib/pricing';

export const metadata = {
  title: 'Coach with The Guild | We Handle the Business',
  description:
    'Apply to coach on The Wrestling Guild. We review every application — NCAA wrestlers, former college athletes, and elite club coaches welcome, any location. Keep ~80% of session fees.',
};

export default async function CoachesPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) {
    redirect('/404');
  }

  const config = getTenantConfig(tenant.slug);
  const [{ coaches, bySchool, stats, heroCoachIds }, reviews] = await Promise.all([
    fetchCoachesLandingData(tenant.slug),
    fetchHomeReviews(tenant.slug, 3),
  ]);

  const heroCoaches = heroCoachIds
    .map((id) => coaches.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const earningsExamples = buildCoachesEarningsExamples(config.pricing);
  const coachSharePercent = coachRevenueSharePercentDisplay(null);

  return (
    <main className="min-h-screen bg-black">
      <CoachesLanding
        coaches={coaches}
        bySchool={bySchool}
        stats={stats}
        heroCoaches={heroCoaches}
        earningsExamples={earningsExamples}
        reviews={reviews}
        coachSharePercent={coachSharePercent}
      />
    </main>
  );
}
