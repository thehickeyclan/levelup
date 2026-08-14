import { SchoolLogo } from '@/components/school-logo';
import { MapPin, Users } from 'lucide-react';

const BEATS = [
  {
    title: 'NCAA athletes and elite coaches',
    body: 'Real programs. Real credentials. Wrestling backgrounds young wrestlers look up to.',
    icon: 'schools' as const,
  },
  {
    title: 'Training where you live',
    body: 'Clubs, schools, and facilities across North Carolina — one platform to connect them all.',
    icon: 'map' as const,
  },
  {
    title: 'Private sessions, partner training, small groups',
    body: 'One platform. Every format. Your schedule.',
    icon: 'people' as const,
  },
];

const FEATURED_SCHOOLS = ['UNC', 'NC State', 'App State'];

export function EcosystemSection() {
  return (
    <section className="border-t border-accent/20 bg-black px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-serif text-xl font-black uppercase tracking-wide text-accent md:text-2xl">
          One ecosystem
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-white/60">
          Youth and HS wrestlers meet elite coaches locally — backed by Division I experience.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {BEATS.map((beat) => (
            <div
              key={beat.title}
              className="rounded-xl border border-accent/25 bg-zinc-950/80 p-6"
            >
              <div className="mb-4 flex h-12 items-center">
                {beat.icon === 'schools' && (
                  <div className="flex items-center gap-2">
                    {FEATURED_SCHOOLS.map((school) => (
                      <SchoolLogo key={school} school={school} size="lg" />
                    ))}
                  </div>
                )}
                {beat.icon === 'map' && (
                  <MapPin className="h-10 w-10 text-accent" aria-hidden />
                )}
                {beat.icon === 'people' && (
                  <Users className="h-10 w-10 text-accent" aria-hidden />
                )}
              </div>
              <h3 className="mb-2 font-semibold text-white">{beat.title}</h3>
              <p className="text-sm text-white/60">{beat.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
