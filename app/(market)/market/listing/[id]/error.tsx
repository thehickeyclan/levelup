'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ListingDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-4 py-8 max-w-4xl mx-auto bg-background min-h-screen space-y-4">
      <Link
        href="/market/my-listings"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        My pairs
      </Link>
      <h1 className="text-lg font-semibold text-foreground">Could not open this listing</h1>
      <p className="text-sm text-muted-foreground">
        {error.message || 'Something went wrong loading the product page.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/market/my-listings">Back to my pairs</Link>
        </Button>
      </div>
    </div>
  );
}
