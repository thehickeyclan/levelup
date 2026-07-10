import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { CoachMilestoneStep } from '@/lib/coach-milestone-steps';
import { cn } from '@/lib/utils';

type Props = {
  icon: ReactNode;
  title: string;
  description: string;
  steps: CoachMilestoneStep[];
  /** Index of the current / highlighted step (0-based). Steps before are done; at and after vary by tone. */
  activeStepIndex: number;
  tips?: string[];
  tipsTitle?: string;
  footer?: ReactNode;
  className?: string;
};

export function CoachMilestoneScreen({
  icon,
  title,
  description,
  steps,
  activeStepIndex,
  tips,
  tipsTitle = 'While you wait',
  footer,
  className,
}: Props) {
  return (
    <div className={cn('container mx-auto px-4 py-12 md:py-16 flex items-center justify-center min-h-[80vh]', className)}>
      <Card className="w-full max-w-lg border-[#B89D60]/25 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 rounded-full bg-[#B89D60]/15 flex items-center justify-center mx-auto mb-4">
            {icon}
          </div>
          <CardTitle className="font-serif text-2xl">{title}</CardTitle>
          <CardDescription className="text-base mt-2">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ol className="space-y-3">
            {steps.map((step, index) => {
              const done = index < activeStepIndex;
              const current = index === activeStepIndex;
              const Icon = step.icon;
              const inner = (
                <>
                  <div
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      done && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                      current && 'bg-[#B89D60]/20 text-[#B89D60]',
                      !done && !current && 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        done && 'text-muted-foreground line-through',
                        current && 'text-foreground',
                        !done && !current && 'text-muted-foreground'
                      )}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                  </div>
                </>
              );

              return (
                <li key={step.id}>
                  {step.href && !done ? (
                    <Link
                      href={step.href}
                      className={cn(
                        'flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40',
                        current ? 'border-[#B89D60]/40 bg-[#B89D60]/5' : 'border-border'
                      )}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      className={cn(
                        'flex gap-3 rounded-lg border p-3',
                        current ? 'border-[#B89D60]/40 bg-[#B89D60]/5' : 'border-transparent'
                      )}
                    >
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {tips && tips.length > 0 ? (
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {tipsTitle}
              </p>
              <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
                {tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {footer}
        </CardContent>
      </Card>
    </div>
  );
}

export function CoachMilestoneFooterActions({
  primary,
  secondary,
}: {
  primary: { label: string; href?: string; onClick?: () => void; disabled?: boolean };
  secondary?: { label: string; href?: string; onClick?: () => void; disabled?: boolean };
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
      {primary.href ? (
        <Button asChild className="flex-1 bg-accent hover:bg-accent-hover text-black">
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
      ) : (
        <Button
          type="button"
          className="flex-1 bg-accent hover:bg-accent-hover text-black"
          onClick={primary.onClick}
          disabled={primary.disabled}
        >
          {primary.label}
        </Button>
      )}
      {secondary ? (
        secondary.href ? (
          <Button asChild variant="outline" className="flex-1">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={secondary.onClick}
            disabled={secondary.disabled}
          >
            {secondary.label}
          </Button>
        )
      ) : null}
    </div>
  );
}
