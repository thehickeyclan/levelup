// User types
export type UserRole = 'parent' | 'coach' | 'admin' | 'youth_wrestler';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

// Athlete (Coach) types
export type CoachStatus = 'pending' | 'active' | 'rejected' | 'suspended';

export interface Athlete {
  id: string;
  first_name: string;
  last_name: string;
  school: string;
  facility_id?: string;
  /** Optional second training location; also mirrored in coach_facilities after migration. */
  secondary_facility_id?: string | null;
  year?: 'Freshman' | 'Sophomore' | 'Junior' | 'Senior' | '5th Year';
  weight_class?: string;
  bio?: string;
  photo_url?: string;
  photo_cutout_url?: string;
  photo_focus_x?: number;
  photo_focus_y?: number;
  credentials?: Record<string, any>;
  average_rating: number;
  review_count?: number;
  total_sessions: number;
  ytd_earnings: number;
  commitment_sessions: number;
  commitment_deadline?: string;
  commitment_fulfilled: boolean;
  bank_account_id?: string;
  usa_wrestling_expiration?: string;
  safesport_expiration?: string;
  background_check_expiration?: string;
  certifications_verified: boolean;
  active: boolean;
  created_at: string;
  // New onboarding fields
  status?: CoachStatus;
  date_of_birth?: string;
  coach_type?: 'ncaa_athlete' | 'club_hs_coach';
  payout_method?: 'venmo' | 'zelle';
  venmo_handle?: string;
  zelle_email?: string;
  safesport_certified?: boolean;
  safesport_expiry?: string;
  background_check?: boolean;
  background_check_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  tshirt_size?: string;
  agreement_signed_at?: string;
  admin_notes?: string;
  rejected_reason?: string;
}

// Session types
export type SessionType = '1-on-1' | '2-athlete' | 'group';
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show';
export type SessionMode = 'private' | 'sibling' | 'partner-invite' | 'partner-open';
/**
 * Who can discover the session in Training / small-group browse:
 * - public: listed for all parents; anyone can register
 * - invite_only: not listed; register only via shared session link
 * - private: not listed; only organizer/coach adds wrestlers (no self-serve register for others)
 */
export type JoinPolicy = 'public' | 'private' | 'invite_only';

export interface Session {
  id: string;
  parent_id: string;
  athlete_id: string;
  facility_id: string;
  youth_wrestler_id?: string;
  session_type: SessionType;
  session_mode?: SessionMode;
  join_policy?: JoinPolicy;
  partner_invite_code?: string;
  max_participants?: number;
  current_participants?: number;
  base_price?: number;
  price_per_participant?: number;
  scheduled_datetime: string;
  duration_minutes: number;
  total_price: number;
  athlete_payment: number;
  org_fee: number;
  stripe_fee: number;
  paid_with_credit: boolean;
  status: SessionStatus;
  athlete_paid: boolean;
  athlete_payout_date?: string;
  created_at: string;
  completed_at?: string;
}

export interface SessionParticipant {
  id: string;
  session_id: string;
  youth_wrestler_id: string;
  parent_id: string;
  paid: boolean;
  amount_paid?: number;
  created_at?: string;
}

export interface SessionJoinRequest {
  id: string;
  session_id: string;
  requesting_parent_id: string;
  youth_wrestler_id: string;
  message?: string;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
  responded_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  read_at?: string;
  created_at: string;
}

// Facility types
export interface Facility {
  id: string;
  name: string;
  school: string;
  address?: string;
  created_at: string;
}

// Youth Wrestler types
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'elite';

export interface YouthWrestler {
  id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  age?: number;
  school?: string;
  graduation_year?: number;
  weight_class?: string;
  skill_level?: SkillLevel;
  wrestling_experience?: string;
  goals?: string;
  medical_notes?: string;
  photo_url?: string;
  photo_focus_x?: number;
  photo_focus_y?: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

