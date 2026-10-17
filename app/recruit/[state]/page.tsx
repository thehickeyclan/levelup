import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canViewRecruitingPages } from '@/lib/guild-recruiting-access';
import { RECRUIT_LINKS, getRecruitingState } from '@/lib/guild-recruiting';
import { IntegrityRule, RecruitButton, StateMark } from '../recruit-ui';

export const dynamic = 'force-dynamic';

/** Hidden until launch: 404 for everyone but admins, and never indexed. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state: stateParam } = await params;
  const state = getRecruitingState(stateParam);
  return {
    title: state ? `RECRUIT${state.code.toUpperCase()} | by Guild Recruiting` : 'Not found',
    robots: { index: false, follow: false },
  };
}

export default async function RecruitStatePage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state: stateParam } = await params;
  const state = getRecruitingState(stateParam);
  if (!state || !(await canViewRecruitingPages())) notFound();

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="container mx-auto px-4 pt-16 pb-14 text-center">
        <StateMark code={state.code} className="mb-10" />

        {state.live ? (
          <>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-white max-w-2xl mx-auto">
              College recruiting for {state.name} wrestlers, built on verified results.
            </h1>
            <p className="mt-4 text-white/70 max-w-xl mx-auto">
              Every {state.name} wrestler, searchable by college coaches. Families run the process
              from one Command Center.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4">
              <RecruitButton href={RECRUIT_LINKS.athletesByState(state.code)}>
                See {state.code.toUpperCase()} athletes
              </RecruitButton>
              <RecruitButton href={RECRUIT_LINKS.createProfile} variant="outline">
                Wrestlers &amp; parents — find your profile
              </RecruitButton>
              <RecruitButton href={RECRUIT_LINKS.coachSignup} variant="outline">
                College coaches — free account
              </RecruitButton>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              <Link href="/recruit" className="text-accent hover:underline">
                About Guild Recruiting →
              </Link>
            </p>
          </>
        ) : (
          <p className="font-serif text-2xl text-white/80">Coming soon</p>
        )}
      </section>

      <section className="container mx-auto px-4 pb-16 max-w-3xl">
        <IntegrityRule />
      </section>
    </main>
  );
}
