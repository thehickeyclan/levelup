import Link from 'next/link';
import { Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function CoachActivityWidget({ kudosThisWeek }: { kudosThisWeek: number }) {
  return (
    <Card className="mb-4 border-border/80">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Activity on your sessions
        </p>
        <p className="text-sm text-foreground flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">{kudosThisWeek}</span>{' '}
            {kudosThisWeek === 1 ? 'kudo' : 'kudos'} on your sessions this week
          </span>
        </p>
        <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" asChild>
          <Link href="/activity?scope=coach">See all activity →</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
