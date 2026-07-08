import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';

export const metadata = {
  title: 'Requirements | The Guild',
  description: 'Requirements to join The Guild as an NCAA wrestler or coach.',
};

export default function RequirementsPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Requirements for NCAA Wrestlers & Coaches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
              Current NCAA athlete or qualified club coach
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
              SafeSport & background check certified
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
              Commit to 10 sessions in 6 months
            </li>
          </ul>
          <p>
            <Link href="/coaches" className="text-accent hover:underline">
              Apply to Join The Guild →
            </Link>
          </p>
          <p>
            <BackLink
              fallbackHref="/"
              label="Back to home"
              className="text-muted-foreground hover:text-accent hover:underline text-sm"
            />
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
