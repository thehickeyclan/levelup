import { headers } from 'next/headers';
import { BackLink } from '@/components/back-link';
import { getTenantByDomain } from '@/config/tenants';
import { ServiceBuilder } from '@/components/service-builder';

export default async function RateCardPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  const recommendedRates = tenant?.pricing
    ? {
        oneOnOne: tenant.pricing.oneOnOne,
        twoAthlete: tenant.pricing.twoAthlete,
        groupRate: tenant.pricing.groupRate,
      }
    : undefined;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <BackLink fallbackHref="/athlete-dashboard" label="Back to Schedule" />
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Pricing & Session Types</h1>
        <p className="text-muted-foreground mt-1">
          Build what you offer: duration (30m, 1hr, 1:30, 2hr), type (private, partner, small group), and price per person. Guild share is 15% of what the parent pays; you keep 85%.
        </p>
      </div>
      <ServiceBuilder recommendedRates={recommendedRates} />
    </div>
  );
}
