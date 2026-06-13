import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { Card, CardContent } from '@/components/ui/card';
import { Star } from 'lucide-react';
import { BackLink } from '@/components/back-link';

export const dynamic = 'force-dynamic';

export default async function CoachReviewsPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'coach' && userData?.role !== 'admin') {
    redirect('/login');
  }

  // For admins viewing as a specific coach, use the viewAsCoachId
  const cookieStore = await cookies();
  const viewAsCoachId = userData?.role === 'admin' 
    ? cookieStore.get('levelup_view_as_coach_id')?.value 
    : null;
  
  const coachId = viewAsCoachId || user.id;

  // Get coach info
  const { data: athlete } = await supabase
    .from('athletes')
    .select('first_name, last_name, average_rating')
    .eq('id', coachId)
    .single();

  // Get all reviews
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, users(first_name, last_name)')
    .eq('athlete_id', coachId)
    .order('created_at', { ascending: false });

  const reviewsList = reviews ?? [];

  return (
    <div className="container mx-auto px-4 py-5 pb-24 md:py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <BackLink fallbackHref="/athlete-dashboard" label="Back" />
        <div>
          <h1 className="text-xl font-bold">Reviews</h1>
          <p className="text-sm text-muted-foreground">
            {athlete?.first_name} {athlete?.last_name}
          </p>
        </div>
      </div>

      {/* Summary */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Star className="h-8 w-8 fill-accent text-accent" />
              <span className="text-3xl font-bold">
                {athlete?.average_rating?.toFixed(1) ?? '—'}
              </span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">{reviewsList.length}</span> review{reviewsList.length !== 1 ? 's' : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reviews list */}
      {reviewsList.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Star className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">No reviews yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Reviews will appear here after parents rate their sessions
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviewsList.map((review) => {
            const reviewerName = Array.isArray(review.users) 
              ? review.users[0]?.first_name 
              : (review.users as { first_name?: string; last_name?: string } | null)?.first_name;
            const reviewerLastName = Array.isArray(review.users) 
              ? review.users[0]?.last_name 
              : (review.users as { first_name?: string; last_name?: string } | null)?.last_name;
            
            return (
              <Card key={review.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${i < review.rating ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="text-sm font-medium mb-1">
                    {reviewerName} {reviewerLastName ? reviewerLastName.charAt(0) + '.' : ''}
                  </div>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground">{review.comment}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
