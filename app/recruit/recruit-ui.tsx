import Link from 'next/link';
import { RECRUITING_INTEGRITY_RULE } from '@/lib/guild-recruiting';

/** RECRUIT in white + state code in gold — the same treatment for every state. */
export function StateMark({ code, className }: { code: string; className?: string }) {
  return (
    <div className={className}>
      <p className="font-serif font-bold tracking-tight leading-none text-4xl sm:text-6xl">
        <span className="text-white">RECRUIT</span>
        <span className="text-accent">{code.toUpperCase()}</span>
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
        by Guild Recruiting
      </p>
    </div>
  );
}

export function IntegrityRule() {
  return (
    <section className="border border-accent/40 rounded-lg bg-accent/5 p-6 sm:p-8">
      <h2 className="font-serif text-lg font-bold text-accent mb-3">The integrity rule</h2>
      <p className="text-sm sm:text-base text-white/90 leading-relaxed">{RECRUITING_INTEGRITY_RULE}</p>
    </section>
  );
}

export function RecruitButton({
  href,
  children,
  variant = 'solid',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'solid' | 'outline';
}) {
  const base =
    'inline-flex items-center justify-center rounded-md px-6 py-3 font-semibold transition-colors min-h-[48px]';
  const styles =
    variant === 'solid'
      ? 'bg-accent text-black hover:bg-accent/90'
      : 'border border-accent text-accent hover:bg-accent hover:text-black';
  return (
    <Link href={href} className={`${base} ${styles}`}>
      {children}
    </Link>
  );
}
