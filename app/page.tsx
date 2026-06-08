import Link from 'next/link';
import { headers } from 'next/headers';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Star, ChevronDown } from 'lucide-react';
import { HomeHeroLogo } from '@/app/home-hero-logo';
import { CoachMapSection } from '@/components/map/coach-map-section';
import { TrainingPathCards } from '@/components/home/training-path-cards';

export const metadata = {
  title: 'The Wrestling Guild | Youth Wrestling — All Levels',
  description:
    'Book NCAA and elite coaches for youth wrestling — beginners through high school. Private sessions on their calendar, or join open small groups and partner spots.',
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
  const logoSrc = tenant?.logo ?? '/logos/guild-bronze.jpg';

  // Fetch reviews for social proof
  let featuredReviews: { id: string; rating: number; comment: string | null; coach_name: string }[] = [];
  if (tenant) {
    const supabase = await createClient(tenant.slug);
    const { data: reviews } = await supabase
      .from('reviews_anonymous')
      .select('id, athlete_id, rating, comment')
      .gte('rating', 4)
      .not('comment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3);
    if (reviews && reviews.length > 0) {
      const athleteIds = [...new Set(reviews.map((r) => r.athlete_id))];
      const { data: athletes } = await supabase
        .from('athletes')
        .select('id, first_name, last_name')
        .in('id', athleteIds);
      const coachById = new Map((athletes ?? []).map((a) => [a.id, `${a.first_name} ${a.last_name}`]));
      featuredReviews = reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        coach_name: coachById.get(r.athlete_id) ?? 'Coach',
      }));
    }
  }

  return (
    <main className="min-h-screen bg-black">
      <section className="relative flex min-h-[100svh] flex-col items-center justify-center bg-black px-6 py-12">
        <div className="mb-5">
          <HomeHeroLogo src={logoSrc} alt="The Wrestling Guild" />
        </div>
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-accent/80">
          The Wrestling Guild
        </p>
        <h1 className="mb-2 text-center font-serif text-3xl font-black uppercase tracking-wide text-accent sm:text-4xl md:text-5xl">
          Youth wrestling coaching — all levels
        </h1>
        <p className="mb-3 max-w-2xl text-center text-sm text-white/70 sm:text-base md:text-lg">
          Book a coach on their calendar anytime, or join an open small group or partner session.
          Division I and elite coaches — beginners through high school.
        </p>
        <p className="mb-8 text-center text-base text-white/75 sm:text-lg">How do you want to train?</p>

        <TrainingPathCards />

        <p className="mx-auto mt-8 max-w-xl text-center text-xs text-white/50">
          Coaches update availability weekly — you can book privates and partners even when no open group is posted.
          Open sessions refresh as coaches add them.
        </p>

        <div className="mt-8 flex w-full max-w-[280px] flex-col gap-3">
          <Button
            size="lg"
            variant="secondary"
            asChild
            className="w-full border border-white/20 bg-white/10 text-white hover:bg-white/15"
          >
            <Link href="/login">Log in</Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="w-full border-2 border-accent/60 text-accent hover:bg-accent/10">
            <Link href="/signup">Sign up</Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="w-full border border-white/25 bg-transparent text-white/90 hover:bg-white/5">
            <Link href="/signup/coach">Apply as a coach</Link>
          </Button>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="h-6 w-6 text-accent/40" />
        </div>
      </section>

      {featuredReviews.length > 0 && (
        <section className="border-t border-accent/20 bg-black px-6 py-12">
          <p className="mb-6 text-center text-xs uppercase tracking-widest text-white/40">What Parents Say</p>
          <div className="mx-auto max-w-lg space-y-6">
            {featuredReviews.slice(0, 2).map((r) => (
              <div key={r.id} className="text-center">
                <div className="mb-2 flex justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i <= r.rating ? 'fill-accent text-accent' : 'text-white/20'}`}
                    />
                  ))}
                </div>
                {r.comment && (
                  <p className="mb-1 text-sm italic text-white/80">&ldquo;{r.comment}&rdquo;</p>
                )}
                <p className="text-xs text-white/40">Session with {r.coach_name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {tenant && (
        <CoachMapSection tenantSlug={tenant.slug} openSessionsRowFilter={openSessionsRowFilter} />
      )}

      <section id="how-it-works" className="border-t border-accent/20 bg-black px-6 py-12">
        <p className="mb-8 text-center text-xs uppercase tracking-widest text-white/40">How It Works</p>
        <div className="mx-auto max-w-sm space-y-8">
          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/20">
              <span className="text-sm font-bold text-accent">1</span>
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-white">Book a coach or join open</h3>
              <p className="text-sm text-white/60">
                <strong className="font-medium text-white/80">Book a coach</strong> for a private or partner session on
                their calendar. Or <strong className="font-medium text-white/80">join open</strong> partner and small-group
                spots already posted — with athlete age, weight, and level on each card.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/20">
              <span className="text-sm font-bold text-accent">2</span>
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-white">Map, calendar, or open list</h3>
              <p className="text-sm text-white/60">
                Pick a coach on the map and book their next open slot, or scroll to{' '}
                <Link href="#open-sessions" className="text-accent underline-offset-2 hover:underline">
                  open sessions
                </Link>{' '}
                to join a spot someone already started.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/20">
              <span className="text-sm font-bold text-accent">3</span>
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-white">Book and train</h3>
              <p className="text-sm text-white/60">
                Confirm details and check out securely. Elite instruction at partner facilities.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Button size="lg" variant="premium" asChild className="w-full max-w-[280px]">
            <Link href="/login?redirect=%2Ftraining%3Ftab%3Dcoaches">Find training</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-accent/20 bg-black px-6 py-10">
        <div className="mx-auto max-w-sm space-y-3 text-center">
          <p className="text-sm text-white/60">Division I wrestler or elite coach?</p>
          <Button size="lg" variant="outline" asChild className="w-full max-w-[280px] border-accent/60 text-accent hover:bg-accent/10">
            <Link href="/signup/coach">Apply to join The Guild</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
