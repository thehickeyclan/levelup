import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { kudosReactionEmojiStrip } from '@/lib/activity-feed/kudos-reactions';

export function CoachActivityWidget({ kudosThisWeek }: { kudosThisWeek: number }) {
  return (
    <Card className="mb-4 border-border/80">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Activity on your sessions
        </p>
        <p className="text-sm text-foreground flex items-center gap-2">
          <span className="text-base leading-none shrink-0 tracking-tight" aria-hidden>
            {kudosReactionEmojiStrip()}
          </span>
          <span>
            <span className="font-semibold tabular-nums">{kudosThisWeek}</span> on your sessions
            this week
          </span>
        </p>
        <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" asChild>
          <Link href="/activity?scope=coach">See all activity →</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
