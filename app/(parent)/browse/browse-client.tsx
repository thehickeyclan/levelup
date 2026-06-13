'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Calendar, Trash2, Loader2, Heart } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { SchoolLogo } from '@/components/school-logo';
import { CoachSessionBadge } from '@/components/coach-session-badge';
import { ProfileImage } from '@/components/profile-image';
import { StarRating } from '@/components/star-rating';
import { APP_TIMEZONE, formatEST } from '@/lib/format-date';
import { fromZonedTime } from 'date-fns-tz';
import { Athlete } from '@/types';
import { FollowCoachButton } from '@/components/follow-coach-button';
import { getSchoolBadgeColors, schoolBadgeClassName } from '@/lib/school-logos';

interface AthleteWithNext extends Athlete {
  nextAvailable?: { slot_date: string; start_time: string } | null;
}

interface BrowseAthletesClientProps {
  initialAthletes: AthleteWithNext[];
  isAdmin?: boolean;
  /** When set, pass through to athlete profile and book flow so that wrestler is pre-selected when booking. */
  initialYouthWrestlerId?: string;
  /** When true, hide back link and top title (e.g. when embedded in Training tab). */
  embedded?: boolean;
  /** Server-fetched; avoids followed coaches jumping after /api/coach-follows loads. */
  initialFollowedCoachIds?: string[];
}

function formatNextAvailable(slot_date: string, start_time: string): string {
  const ymd = slot_date.split('T')[0];
  const raw = (start_time || '12:00').trim();
  const parts = raw.split(':');
  const hh = Math.min(23, Math.max(0, parseInt(parts[0] ?? '12', 10) || 12));
  const mm = Math.min(59, Math.max(0, parseInt(parts[1] ?? '0', 10) || 0));
  const ss =
    parts[2] != null && parts[2] !== ''
      ? Math.min(59, Math.max(0, parseInt(parts[2], 10) || 0))
      : 0;
  const t = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const instant = fromZonedTime(`${ymd}T${t}`, APP_TIMEZONE);
  return `${formatEST(instant, 'EEE, MMM d')} · ${formatEST(instant, 'h:mm a')}`;
}

/** Avoid duplicating last name when first_name already ends with it (e.g. "Liam Hickey" + "Hickey"). */
function athleteDisplayName(first: string | undefined | null, last: string | undefined | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (!f && !l) return '';
  if (!l) return f;
  if (!f) return l;
  if (f.endsWith(l)) return f;
  return `${f} ${l}`.trim();
}

const WEIGHT_RANGES: { id: string; label: string; classes: readonly string[] }[] = [
  { id: 'all', label: 'All weights', classes: [] },
  { id: 'light', label: 'Light', classes: ['125', '133', '141', '149', '157'] },
  { id: 'middle', label: 'Middle', classes: ['165', '174', '184'] },
  { id: 'heavy', label: 'Heavy', classes: ['197', '285'] },
];

function weightMatchesRanges(weightClass: string | undefined, selectedIds: string[]): boolean {
  if (!selectedIds.length || selectedIds.includes('all')) return true;
  if (!weightClass) return false;
  const w = String(weightClass).trim();
  return selectedIds.some(id => {
    const range = WEIGHT_RANGES.find(r => r.id === id);
    return range ? range.classes.includes(w) : false;
  });
}

export function BrowseAthletesClient({
  initialAthletes,
  isAdmin,
  initialYouthWrestlerId,
  embedded,
  initialFollowedCoachIds = [],
}: BrowseAthletesClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedWeightRanges, setSelectedWeightRanges] = useState<string[]>(['all']);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [followedCoachIds, setFollowedCoachIds] = useState<Set<string>>(new Set());

  // Fetch followed coaches to surface them first
  useEffect(() => {
    fetch('/api/coach-follows')
      .then(r => r.json())
      .then(d => {
        if (d.follows) {
          setFollowedCoachIds(new Set(d.follows.map((f: { coachId: string }) => f.coachId)));
        }
      })
      .catch(() => {});
  }, []);

  const handleDeleteCoach = async (e: React.MouseEvent, athleteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Permanently delete this coach? This cannot be undone.')) return;
    setDeletingId(athleteId);
    try {
      const res = await fetch(`/api/admin/athletes/${athleteId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Delete failed');
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  };

  const toggleWeightRange = (id: string) => {
    setSelectedWeightRanges(prev => {
      if (id === 'all') return ['all'];
      const next = prev.filter(x => x !== 'all');
      if (next.includes(id)) {
        const filtered = next.filter(x => x !== id);
        return filtered.length ? filtered : ['all'];
      }
      return [...next, id];
    });
  };

  // Get unique schools from athletes
  const schools = useMemo(() => {
    const uniqueSchools = Array.from(new Set(initialAthletes.map(a => a.school))).sort();
    return uniqueSchools;
  }, [initialAthletes]);

  // Filter athletes and sort followed coaches first
  const filteredAthletes = useMemo(() => {
    const filtered = initialAthletes.filter(athlete => {
      // Search filter
      const fullName = `${athlete.first_name} ${athlete.last_name}`.toLowerCase();
      const matchesSearch = searchQuery === '' || fullName.includes(searchQuery.toLowerCase());

      // School filter
      const matchesSchool = selectedSchool === 'all' || athlete.school === selectedSchool;

      // Weight range filter
      const matchesWeight = weightMatchesRanges(athlete.weight_class, selectedWeightRanges);

      return matchesSearch && matchesSchool && matchesWeight;
    });

    // Sort: followed coaches first, then by review count/rating
    return filtered.sort((a, b) => {
      const aFollowed = followedCoachIds.has(a.id);
      const bFollowed = followedCoachIds.has(b.id);
      if (aFollowed && !bFollowed) return -1;
      if (!aFollowed && bFollowed) return 1;
      const ts = (b.total_sessions ?? 0) - (a.total_sessions ?? 0);
      if (ts !== 0) return ts;
      return a.id.localeCompare(b.id);
    });
  }, [initialAthletes, searchQuery, selectedSchool, selectedWeightRanges, followedCoachIds]);

  return (
    <div className={embedded ? '' : 'container mx-auto px-4 py-8'}>
      {!embedded && (
        <>
          <div className="mb-6">
            <BackLink fallbackHref="/dashboard" label="Back to Home" />
          </div>
          <div className="mb-8">
            <h1 className="text-3xl font-serif font-bold mb-2 text-foreground">Browse Elite Coaches</h1>
            <p className="text-muted-foreground">
              Find NCAA athletes and elite coaches to refine your technique
            </p>
          </div>
        </>
      )}

      {/* Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* School Filter */}
          <div className="flex-1">
            <Select value={selectedSchool} onValueChange={setSelectedSchool}>
              <SelectTrigger>
                <SelectValue placeholder="All Schools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schools</SelectItem>
                {schools.map(school => (
                  <SelectItem key={school} value={school}>
                    {school}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Weight Range Filter - multi-select */}
          <div className="flex-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground shrink-0">Weight:</span>
            {WEIGHT_RANGES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleWeightRange(id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedWeightRanges.includes(id)
                    ? 'bg-accent text-black'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1">
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          Showing {filteredAthletes.length} {filteredAthletes.length === 1 ? 'coach' : 'coaches'}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <Skeleton className="w-24 h-24 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty States */}
      {!loading && initialAthletes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <User className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No athletes available yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Check back soon! We&apos;re working on getting more NCAA athletes and coaches on the platform.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && initialAthletes.length > 0 && filteredAthletes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <User className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No athletes match your filters</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Try adjusting your search criteria or filters to find more athletes.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setSelectedSchool('all');
                setSelectedWeightRanges(['all']);
              }}
            >
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Athlete Grid */}
      {!loading && filteredAthletes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAthletes.map((athlete) => {
            const schoolColors = getSchoolBadgeColors(athlete.school);
            const isFollowed = followedCoachIds.has(athlete.id);
            const bookHref = `/book/${athlete.id}${initialYouthWrestlerId ? `?youthWrestlerId=${encodeURIComponent(initialYouthWrestlerId)}` : ''}`;
            const profileHref = initialYouthWrestlerId
              ? `/athlete/${athlete.id}?youthWrestlerId=${encodeURIComponent(initialYouthWrestlerId)}`
              : `/athlete/${athlete.id}`;
            return (
              <div key={athlete.id} className="relative">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 z-10 h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={(e) => handleDeleteCoach(e, athlete.id)}
                    disabled={deletingId === athlete.id}
                    title="Delete coach (admin only)"
                  >
                    {deletingId === athlete.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                )}
                <Card className={`h-full ${isFollowed ? 'ring-1 ring-accent/30 bg-accent/5' : ''}`}>
                    <CardHeader>
                      <div className="flex items-center gap-4">
                        <ProfileImage
                          src={athlete.photo_url}
                          alt={athleteDisplayName(athlete.first_name, athlete.last_name) || 'Coach'}
                          className="w-24 h-24 border-2 border-accent/30"
                          fallbackIconClassName="h-12 w-12 text-muted-foreground"
                        />
                      <div className="flex-1 min-w-0">
                        <Link href={profileHref} className="hover:underline">
                          <h3 className="text-lg font-semibold truncate">
                            {athleteDisplayName(athlete.first_name, athlete.last_name) || 'Coach'}
                          </h3>
                        </Link>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {isFollowed && (
                            <Badge className="bg-accent/20 text-accent text-xs border-0">
                              <Heart className="h-3 w-3 mr-1 fill-current" />
                              Following
                            </Badge>
                          )}
                          <CoachSessionBadge totalSessions={athlete.total_sessions ?? 0} size="sm" />
                          <SchoolLogo school={athlete.school} size="sm" />
                          <Badge className={schoolBadgeClassName(schoolColors, 'text-xs')}>
                            {athlete.school}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      {athlete.year && `${athlete.year}`}
                      {athlete.year && athlete.weight_class && ' | '}
                      {athlete.weight_class && `${athlete.weight_class} lbs`}
                    </div>

                    <StarRating averageRating={athlete.average_rating} reviewCount={athlete.review_count} />

                    {athlete.nextAvailable && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 shrink-0" />
                        <span>Next available: {formatNextAvailable(athlete.nextAvailable.slot_date, athlete.nextAvailable.start_time)}</span>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button className="flex-1" variant="outline" asChild>
                          <Link href={profileHref}>View Profile</Link>
                        </Button>
                        <FollowCoachButton coachId={athlete.id} />
                      </div>
                      <Button
                        className="w-full min-h-[44px] bg-accent hover:bg-accent-hover text-black font-semibold"
                        size="sm"
                        asChild
                      >
                        <Link href={bookHref}>
                          <Calendar className="h-4 w-4 mr-2 shrink-0" />
                          See availability
                        </Link>
                      </Button>
                      <a
                        href={`/training?tab=sessions&coach=${encodeURIComponent(athlete.id)}${initialYouthWrestlerId ? `&wrestler=${encodeURIComponent(initialYouthWrestlerId)}` : ''}`}
                        className="text-xs text-muted-foreground hover:text-foreground underline text-center block"
                      >
                        View their group sessions
                      </a>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

