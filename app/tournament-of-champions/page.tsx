import { BackLink } from '@/components/back-link';
import { ShieldCheck, Trophy, Users } from 'lucide-react';
import { VolunteerForm } from './volunteer-form';

export const metadata = {
  title: 'Tournament of Champions | The Guild',
  description:
    'The Guild Tournament of Champions — built to be the best wrestling tournament in North Carolina history. Coaches corner their athletes; the community makes it happen.',
};

const CORNERING_POINTS = [
  'Every athlete is cornered by their own club or high school coach — not tournament staff.',
  'Coaches must be credentialed and present at the mat for their wrestlers.',
  'If your regular coach cannot attend, arrange another approved club or HS coach to corner in advance.',
  'Coaches uphold the standard: positive, respectful, and a model for our young wrestlers.',
] as const;

export default function TournamentOfChampionsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <div className="border-b border-accent/20 bg-zinc-950/80 px-6 py-12 md:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            The Guild
          </p>
          <h1 className="mt-3 font-serif text-3xl font-black uppercase tracking-wide text-white md:text-5xl">
            Tournament of Champions
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-white/70 sm:text-base">
            Our goal is simple: build the best wrestling tournament in North Carolina history — and
            keep it that way for years to come. That only happens when our great community shows up
            and contributes.
          </p>
        </div>
      </div>

      {/* Cornering expectation */}
      <section className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 shrink-0 text-accent" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">
                For coaches & families
              </p>
              <h2 className="font-serif text-xl font-black uppercase tracking-wide text-white md:text-2xl">
                Coaches corner their athletes
              </h2>
            </div>
          </div>
          <p className="text-sm text-white/70 sm:text-base">
            At the Tournament of Champions, athletes are cornered by their <strong className="text-white">club
            or high school coaches</strong>. Please plan ahead so every wrestler has an approved coach
            in their corner on tournament day.
          </p>
          <ul className="mt-6 space-y-3">
            {CORNERING_POINTS.map((point) => (
              <li
                key={point}
                className="flex gap-3 rounded-xl border border-accent/20 bg-zinc-950/60 px-5 py-4 text-sm text-white/85"
              >
                <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Volunteer */}
      <section className="border-t border-accent/20 bg-zinc-950/50 px-6 py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 text-center">
            <Users className="mx-auto h-10 w-10 text-accent" aria-hidden />
            <h2 className="mt-4 font-serif text-2xl font-black uppercase tracking-wide text-white md:text-3xl">
              Volunteer
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">
              Making this the best tournament in North Carolina history — and future — is the goal.
              It won&apos;t happen without our great community contributing. Tell us where you can
              help and we&apos;ll get you plugged in.
            </p>
          </div>
          <VolunteerForm />
        </div>
      </section>

      <div className="px-6 pb-16 pt-8 text-center">
        <BackLink
          fallbackHref="/"
          label="Back to home"
          className="text-sm text-white/50 hover:text-accent hover:underline"
        />
      </div>
    </main>
  );
}
