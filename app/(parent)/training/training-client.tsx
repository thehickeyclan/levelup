'use client';

import { useState, useEffect } from 'react';
import { FindTrainingClient } from '@/app/(parent)/find-training/find-training-client';
import { TrainingCoachesGrid } from '@/app/(parent)/training/training-coaches-grid';
import type { Athlete } from '@/types';
import type { CoachDateFilterData, CoachSessionTypeFilter } from '@/lib/training-coach-date-filter';

function mapUrlTypeToCoachFilter(t: string): CoachSessionTypeFilter {
  const x = (t || 'all').toLowerCase();
  if (x === 'group' || x === 'small_group') return 'small_group';
  if (x === 'private') return 'private';
  if (x === 'partner') return 'partner';
  if (x === 'partner_private') return 'partner_private';
  return 'all';
}

type TabId = 'sessions' | 'coaches';

interface AthleteWithNext extends Athlete {
  nextAvailable?: { slot_date: string; start_time: string } | null;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'coaches', label: 'Coaches' },
  { id: 'sessions', label: 'Sessions' },
];

type Props = {
  initialTab: string;
  athletesWithNext: AthleteWithNext[];
  facilities: { id: string; name?: string; school?: string; address?: string | null }[];
  availabilitySessions: Array<{
    id: string;
    scheduled_datetime: string;
    status?: string | null;
    session_type: string | null;
    session_mode: string | null;
    join_policy?: string | null;
    focus_area: string | null;
    current_participants: number | null;
    max_participants: number | null;
    total_price: number | null;
    price_per_participant: number | null;
    athlete_id: string;
    facility_id: string;
    athletes?: { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string; average_rating?: number | null; review_count?: number | null } | null;
    facilities?: { id: string; name?: string; address?: string } | null;
    session_participants?: Array<{
      id?: string;
      youth_wrestler_id?: string | null;
      roster_first_name?: string | null;
      roster_last_name?: string | null;
      roster_photo_url?: string | null;
      youth_wrestlers?: { id: string; first_name?: string; last_name?: string; photo_url?: string } | { id: string; first_name?: string; last_name?: string; photo_url?: string }[] | null;
    } | null>;
  }>;
  availabilityDate: string;
  availabilityTime: string;
  availabilityLocation: string;
  availabilityCoach: string;
  coaches: { id: string; first_name?: string; last_name?: string; school?: string }[];
  preselectedWrestlerId?: string;
  parentWrestlerIds?: string[];
  availabilitySessionType?: string;
  coachIdsWithPublicOpen?: string[];
  serviceTypesByCoach?: Record<string, string[]>;
  requestSessionCoaches?: Array<{
    id: string;
    first_name?: string;
    last_name?: string;
    school?: string;
    photo_url?: string | null;
  }>;
  /** Facilities that have at least one active coach (coach_facilities); sorted by name. */
  coachFilterLocations?: Array<{ id: string; name: string }>;
  /** When a facility is selected, these coach ids match that location. */
  coachIdsByFacilityId?: Record<string, string[]>;
  coachDateFilterData: CoachDateFilterData;
  coachDateFilterBounds: { minYmd: string; maxYmd: string };
  /** Server-fetched so coach grid sort matches before client follow fetch completes. */
  initialFollowedCoachIds?: string[];
};

export function TrainingClient({
  initialTab,
  athletesWithNext,
  facilities,
  availabilitySessions,
  availabilityDate,
  availabilityTime,
  availabilityLocation,
  availabilityCoach,
  coaches,
  preselectedWrestlerId = '',
  parentWrestlerIds = [],
  availabilitySessionType = 'all',
  coachIdsWithPublicOpen = [],
  serviceTypesByCoach = {},
  requestSessionCoaches = [],
  coachFilterLocations = [],
  coachIdsByFacilityId = {},
  coachDateFilterData,
  coachDateFilterBounds,
  initialFollowedCoachIds = [],
}: Props) {
  const tab = (initialTab === 'sessions' ? 'sessions' : 'coaches') as TabId;
  const [activeTab, setActiveTab] = useState<TabId>(tab);

  // Sync tab state when URL changes (e.g. "View their group sessions" → ?tab=sessions&coach=xxx)
  useEffect(() => {
    setActiveTab(tab);
  }, [tab]);

  return (
    <>
      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`min-h-[44px] px-5 py-2.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
              activeTab === t.id
                ? 'bg-[#D4AF37] text-black'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'sessions' && (
        <FindTrainingClient
          facilities={facilities}
          initialSessions={availabilitySessions}
          initialDate={availabilityDate}
          initialTime={availabilityTime}
          initialLocation={availabilityLocation}
          initialCoach={availabilityCoach}
          coaches={coaches}
          searchBasePath="/training"
          defaultRangeLabel="Next 14 days"
          preselectedWrestlerId={preselectedWrestlerId}
          parentWrestlerIds={parentWrestlerIds}
          initialSessionType={availabilitySessionType}
          requestSessionCoaches={requestSessionCoaches}
          serviceTypesByCoach={serviceTypesByCoach}
        />
      )}

      {activeTab === 'coaches' && (
        <TrainingCoachesGrid
          athletes={athletesWithNext}
          serviceTypesByCoach={serviceTypesByCoach}
          coachIdsWithOpen={coachIdsWithPublicOpen}
          preselectedWrestlerId={preselectedWrestlerId}
          locationFacilities={coachFilterLocations}
          coachIdsByFacilityId={coachIdsByFacilityId}
          coachDateFilterData={coachDateFilterData}
          coachDateFilterBounds={coachDateFilterBounds}
          initialSessionType={mapUrlTypeToCoachFilter(availabilitySessionType)}
          initialFollowedCoachIds={initialFollowedCoachIds}
          initialFacilityId={availabilityLocation}
        />
      )}
    </>
  );
}
