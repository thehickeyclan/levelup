import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { CalendarClock, LayoutDashboard, Smartphone, Video } from 'lucide-react';
import { CoachHelpVideoEngagement, type CoachHelpVideoSummary } from '@/components/coach-help-video-engagement';
import { CoachHelpQuestions, type CoachHelpQuestionRow } from '@/components/coach-help-questions';
import { COACH_HELP_FEATURED_HOME_SCREEN_KEY, resourceVideoKey } from '@/lib/coach-help-video-keys';

export const metadata = {
  title: 'Coach help | The Guild',
  description:
    'Quick-start resources for coaches in The Guild: phone shortcut, availability, sessions, and payouts.',
};

/** Curated links; load with service role after authz so coach RLS quirks never hide admin-published how-tos. */
export const dynamic = 'force-dynamic';

/** Guild default: mobile shortcut tutorial (override with NEXT_PUBLIC_COACH_HELP_HOME_SCREEN_VIDEO_URL). */
const DEFAULT_HOME_SCREEN_VIDEO_URL =
  'https://www.loom.com/share/1d60dcd9bcbf4724ad8f3d4039e5b7ab';

function youtubeEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** Loom share URL → embed (in-page player). */
function loomEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 'www.loom.com' && u.hostname !== 'loom.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const shareIdx = parts.indexOf('share');
    if (shareIdx >= 0 && parts[shareIdx + 1]) {
      return `https://www.loom.com/embed/${parts[shareIdx + 1]}`;
    }
    if (parts[0] === 'embed' && parts[1]) {
      return `https://www.loom.com/embed/${parts[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

function videoEmbedSrc(url: string): string | null {
  return youtubeEmbedSrc(url) ?? loomEmbedSrc(url);
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

async function loadVideoEngagementForKey(
  supabase: SupabaseServer,
  userId: string,
  videoKey: string
): Promise<{ summary: CoachHelpVideoSummary; questions: CoachHelpQuestionRow[] }> {
  const summary: CoachHelpVideoSummary = {
    myViewCount: 0,
    upCount: 0,
    downCount: 0,
    myVote: null,
  };
  let questions: CoachHelpQuestionRow[] = [];

  const [vcRes, voteRowRes, voteRpcRes, qRes] = await Promise.all([
    supabase
      .from('coach_help_views')
      .select('*', { count: 'exact', head: true })
      .eq('video_key', videoKey)
      .eq('user_id', userId),
    supabase.from('coach_help_votes').select('vote').eq('video_key', videoKey).eq('user_id', userId).maybeSingle(),
    supabase.rpc('coach_help_vote_summary', { p_video_key: videoKey }),
    supabase
      .from('coach_help_questions')
      .select('id, user_id, video_key, body, created_at, answer_text, answered_at, answered_by')
      .eq('video_key', videoKey)
      .order('created_at', { ascending: false }),
  ]);

  if (!vcRes.error) summary.myViewCount = vcRes.count ?? 0;
  if (!voteRowRes.error && voteRowRes.data && (voteRowRes.data.vote === 1 || voteRowRes.data.vote === -1)) {
    summary.myVote = voteRowRes.data.vote;
  }
  if (!voteRpcRes.error && Array.isArray(voteRpcRes.data) && voteRpcRes.data[0]) {
    const row = voteRpcRes.data[0] as { up_count?: unknown; down_count?: unknown };
    summary.upCount = Number(row.up_count ?? 0);
    summary.downCount = Number(row.down_count ?? 0);
  }
  if (!qRes.error && qRes.data) questions = qRes.data as CoachHelpQuestionRow[];

  return { summary, questions };
}

export default async function CoachHelpPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/coach-help');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = userData?.role === 'admin';

  if (userData?.role !== 'coach' && userData?.role !== 'admin') {
    if (userData?.role === 'parent') redirect('/browse');
    redirect('/login');
  }

  const admin = createAdminClient(tenant.slug);
  const { data: resourceRows, error: coachHelpResourcesError } = await admin
    .from('coach_help_resources')
    .select('id, title, url, created_at')
    .order('created_at', { ascending: false });

  if (coachHelpResourcesError) {
    console.error('coach_help_resources fetch:', coachHelpResourcesError.message);
  }

  const extraResources = (coachHelpResourcesError ? [] : resourceRows ?? []) as {
    id: string;
    title: string;
    url: string;
    created_at: string;
  }[];

  const fk = COACH_HELP_FEATURED_HOME_SCREEN_KEY;
  let featuredSummary = {
    myViewCount: 0,
    upCount: 0,
    downCount: 0,
    myVote: null as number | null,
  };
  let featuredQuestions: CoachHelpQuestionRow[] = [];

  const { count: featuredViewCount, error: featuredViewsErr } = await supabase
    .from('coach_help_views')
    .select('*', { count: 'exact', head: true })
    .eq('video_key', fk)
    .eq('user_id', user.id);
  if (!featuredViewsErr) featuredSummary.myViewCount = featuredViewCount ?? 0;

  const { data: featuredVoteRow, error: featuredVoteErr } = await supabase
    .from('coach_help_votes')
    .select('vote')
    .eq('video_key', fk)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!featuredVoteErr && featuredVoteRow && (featuredVoteRow.vote === 1 || featuredVoteRow.vote === -1)) {
    featuredSummary.myVote = featuredVoteRow.vote;
  }

  const { data: featuredVoteRpc, error: featuredVoteRpcErr } = await supabase.rpc('coach_help_vote_summary', {
    p_video_key: fk,
  });
  if (!featuredVoteRpcErr && Array.isArray(featuredVoteRpc) && featuredVoteRpc[0]) {
    const row = featuredVoteRpc[0] as { up_count?: unknown; down_count?: unknown };
    featuredSummary.upCount = Number(row.up_count ?? 0);
    featuredSummary.downCount = Number(row.down_count ?? 0);
  }

  const { data: featuredQuestionRows, error: featuredQuestionsErr } = await supabase
    .from('coach_help_questions')
    .select('id, user_id, video_key, body, created_at, answer_text, answered_at, answered_by')
    .eq('video_key', fk)
    .order('created_at', { ascending: false });
  if (!featuredQuestionsErr && featuredQuestionRows) {
    featuredQuestions = featuredQuestionRows as CoachHelpQuestionRow[];
  } else if (featuredQuestionsErr) {
    console.error('coach_help_questions fetch:', featuredQuestionsErr.message);
  }

  const extraWithEngagement = await Promise.all(
    extraResources.map(async (r) => {
      const videoKey = resourceVideoKey(r.id);
      const { summary, questions } = await loadVideoEngagementForKey(supabase, user.id, videoKey);
      return { ...r, videoKey, summary, questions };
    })
  );

  const homeScreenVideoUrl =
    process.env.NEXT_PUBLIC_COACH_HELP_HOME_SCREEN_VIDEO_URL?.trim() || DEFAULT_HOME_SCREEN_VIDEO_URL;
  const embedSrc = videoEmbedSrc(homeScreenVideoUrl);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <BackLink fallbackHref="/athlete-dashboard" label="Back to Schedule" />
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground font-serif md:text-3xl">Coach help</h1>
        <p className="text-muted-foreground mt-2 text-sm md:text-base">
          This page is your fast path to getting productive in <strong className="text-foreground font-medium">The Guild</strong>{' '}
          — booking flow, your schedule, and how parents find you. Start with the home-screen shortcut, then watch any
          extra tutorials and skim the written guides below.
        </p>
      </div>

      <div className="space-y-6">
        <Card className="border-accent/40 shadow-sm">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">Start here</p>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-accent" aria-hidden />
              <CardTitle className="text-lg">Add The Guild to your phone</CardTitle>
            </div>
            <CardDescription>
              Put The Guild on your home screen so opening your schedule is one tap — same idea as installing an app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <CoachHelpVideoEngagement
              videoKey={fk}
              embedSrc={embedSrc}
              watchUrl={homeScreenVideoUrl}
              iframeTitle="How to add The Guild to your home screen"
              initialSummary={featuredSummary}
            />
            <CoachHelpQuestions
              videoKey={fk}
              currentUserId={user.id}
              isAdmin={isAdmin}
              initialQuestions={featuredQuestions}
            />
            <p className="text-xs border-t border-border/60 pt-3">
              After you save the shortcut, open The Guild once and sign in so the browser keeps you logged in.
            </p>
          </CardContent>
        </Card>

        {extraWithEngagement.length > 0 ? (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground font-serif">More how-tos</h2>
            {extraWithEngagement.map((r) => {
              const emb = videoEmbedSrc(r.url);
              return (
                <Card key={r.id} className="border-accent/40 shadow-sm">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Video className="h-5 w-5 text-accent" aria-hidden />
                      <CardTitle className="text-lg">{r.title}</CardTitle>
                    </div>
                    <CardDescription>
                      {emb
                        ? 'Watch in the player below or open in a new tab.'
                        : 'Open in a new tab — add a standard Loom share or YouTube link for an in-page player.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-muted-foreground">
                    <CoachHelpVideoEngagement
                      videoKey={r.videoKey}
                      embedSrc={emb}
                      watchUrl={r.url}
                      iframeTitle={r.title}
                      initialSummary={r.summary}
                    />
                    <CoachHelpQuestions
                      videoKey={r.videoKey}
                      currentUserId={user.id}
                      isAdmin={isAdmin}
                      initialQuestions={r.questions}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-accent" aria-hidden />
              <CardTitle className="text-lg">Availability</CardTitle>
            </div>
            <CardDescription>
              Parents book and request you based on the hours you publish (Eastern time).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc pl-5 space-y-2">
              <li>Open <strong className="text-foreground">Availability</strong> and add dated openings (start/end times).</li>
              <li>If a time already appears under <strong className="text-foreground">Upcoming openings</strong>, you do not need to add it again — remove it there if you want to change it.</li>
              <li>Optional: block whole days off at the bottom of that page.</li>
            </ul>
            <Button asChild variant="outline" className="min-h-[44px] w-full sm:w-auto mt-2">
              <Link href="/availability">Go to Availability</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-accent" aria-hidden />
              <CardTitle className="text-lg">Schedule, sessions &amp; earnings</CardTitle>
            </div>
            <CardDescription>Day-to-day coaching workflow in the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">Schedule</strong> — who is booked, pending requests, and today&apos;s sessions.
              </li>
              <li>
                <strong className="text-foreground">Create session</strong> — small-group or partner sessions parents can join.
              </li>
              <li>
                <strong className="text-foreground">Earnings</strong> — payouts, session history, reviews, and growth tips.
              </li>
            </ul>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button asChild variant="outline" className="min-h-[44px]">
                <Link href="/athlete-dashboard">Schedule</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-[44px]">
                <Link href="/coach-sessions">My sessions</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-[44px]">
                <Link href="/coach-earnings">Earnings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profile &amp; payouts</CardTitle>
            <CardDescription>Keep your public coach page and payout details current.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="min-h-[44px]">
              <Link href="/profile">Edit profile</Link>
            </Button>
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card className="border-dashed border-amber-700/40 bg-amber-950/5 dark:bg-amber-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Admin</CardTitle>
              <CardDescription>
                Add or remove extra how-to links, and view engagement stats, on the admin Coach help page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="min-h-[44px]">
                <Link href="/admin/coach-help">Open admin Coach help</Link>
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Reply to coach questions in the <strong className="text-foreground font-medium">Questions</strong> section above on this page.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
