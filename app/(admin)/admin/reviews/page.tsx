import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, User, Calendar, MessageSquare } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { formatEST } from '@/lib/format-date';
import { ProfileImage } from '@/components/profile-image';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminReviewsPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    redirect('/');
  }

  const admin = createAdminClient(tenant.slug);

  // Fetch all reviews with coach and parent info
  const { data: reviews, error } = await admin
    .from('reviews')
    .select(`
      id,
      session_id,
      athlete_id,
      parent_id,
      rating,
      comment,
      tags,
      created_at,
      athletes(id, first_name, last_name, school, photo_url),
      sessions(scheduled_datetime)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Admin reviews fetch error:', error);
  }

  // Fetch parent emails
  const parentIds = [...new Set((reviews ?? []).map(r => r.parent_id).filter(Boolean))];
  const { data: parents } = parentIds.length > 0
    ? await admin.from('users').select('id, email').in('id', parentIds)
    : { data: [] };
  const parentEmailMap = new Map((parents ?? []).map(p => [p.id, p.email]));

  // Group reviews by coach
  const reviewsByCoach = new Map<string, {
    coach: { id: string; name: string; school: string; image: string | null };
    reviews: Array<{
      id: string;
      rating: number;
      comment: string | null;
      tags: string[] | null;
      created_at: string;
      parent_email: string;
      session_date: string | null;
    }>;
  }>();

  for (const r of reviews ?? []) {
    const athlete = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes;
    const session = Array.isArray(r.sessions) ? r.sessions[0] : r.sessions;
    
    if (!athlete) continue;

    const coachId = athlete.id;
    const coachName = `${athlete.first_name} ${athlete.last_name}`;
    
    if (!reviewsByCoach.has(coachId)) {
      reviewsByCoach.set(coachId, {
        coach: {
          id: coachId,
          name: coachName,
          school: athlete.school ?? '',
          image: athlete.photo_url ?? null,
        },
        reviews: [],
      });
    }

    reviewsByCoach.get(coachId)!.reviews.push({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      tags: r.tags,
      created_at: r.created_at,
      parent_email: parentEmailMap.get(r.parent_id) ?? 'Unknown',
      session_date: session?.scheduled_datetime ?? null,
    });
  }

  // Sort coaches by review count (most reviewed first)
  const sortedCoaches = Array.from(reviewsByCoach.values()).sort(
    (a, b) => b.reviews.length - a.reviews.length
  );

  // Calculate stats
  const totalReviews = reviews?.length ?? 0;
  const avgRating = totalReviews > 0
    ? (reviews ?? []).reduce((sum, r) => sum + r.rating, 0) / totalReviews
    : 0;
  const withComments = (reviews ?? []).filter(r => r.comment).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <div className="mb-4">
          <BackLink
            fallbackHref="/admin"
            label="Back to Admin"
            className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          />
        </div>
        <h1 className="text-3xl font-bold font-serif text-foreground">Reviews</h1>
        <p className="text-muted-foreground mt-1">
          All coach reviews by parent
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalReviews}</div>
            <p className="text-sm text-muted-foreground">Total Reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold flex items-center gap-1">
              {avgRating.toFixed(1)}
              <Star className="h-5 w-5 text-accent fill-current" />
            </div>
            <p className="text-sm text-muted-foreground">Average Rating</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{withComments}</div>
            <p className="text-sm text-muted-foreground">With Comments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{sortedCoaches.length}</div>
            <p className="text-sm text-muted-foreground">Coaches Reviewed</p>
          </CardContent>
        </Card>
      </div>

      {/* Reviews by Coach */}
      <div className="space-y-8">
        {sortedCoaches.map(({ coach, reviews: coachReviews }) => {
          const coachAvg = coachReviews.reduce((sum, r) => sum + r.rating, 0) / coachReviews.length;
          
          return (
            <Card key={coach.id}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-4">
                  <ProfileImage
                    src={coach.image}
                    alt={coach.name}
                    className="h-14 w-14"
                    rounded="full"
                  />
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Link href={`/athlete/${coach.id}`} className="hover:underline">
                        {coach.name}
                      </Link>
                      {coach.school && (
                        <Badge variant="outline" className="text-xs">
                          {coach.school}
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-accent fill-current" />
                        {coachAvg.toFixed(1)} avg
                      </span>
                      <span>{coachReviews.length} review{coachReviews.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {coachReviews.map((review) => (
                    <div
                      key={review.id}
                      className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < review.rating
                                    ? 'text-accent fill-current'
                                    : 'text-zinc-700'
                                }`}
                              />
                            ))}
                          </div>
                          {review.tags && review.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {review.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 text-right shrink-0">
                          {formatEST(new Date(review.created_at), 'MMM d, yyyy')}
                        </div>
                      </div>
                      
                      {review.comment && (
                        <p className="text-foreground mb-3 whitespace-pre-wrap">
                          {review.comment}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {review.parent_email}
                        </span>
                        {review.session_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Session: {formatEST(new Date(review.session_date), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {sortedCoaches.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-zinc-600 mb-4" />
              <p className="text-muted-foreground">No reviews yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
