'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import Link from 'next/link';
import { User, Clock, CheckCircle, Link2, Users, Wallet, Sparkles, ChevronDown } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { SchoolLogo } from '@/components/school-logo';
import { CoachSessionBadge } from '@/components/coach-session-badge';
import { ProfileImage } from '@/components/profile-image';
import { startOfDay } from 'date-fns';
import { formatEST } from '@/lib/format-date';
import { YouthWrestler } from '@/types';
import type { SessionMode } from '@/types';
import { getSessionPrice } from '@/lib/sessions';
import { COACH_REVENUE_FRACTION } from '@/lib/pricing';
import { formatSlotDisplay, getDayOfWeek } from '@/lib/availability';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const creditsFetcher = (url: string) => fetch(url).then((r) => r.json());

/** Unselected = neutral; selected = gold accent (same pattern for session-type cards). */
function sessionTypeChoiceClass(selected: boolean) {
  return cn(
    'cursor-pointer transition-all border bg-background',
    selected
      ? 'ring-2 ring-accent border-accent bg-accent/10 shadow-sm'
      : 'border-border shadow-none hover:border-accent/30 hover:bg-muted/20'
  );
}

/** 8am–9pm fallback when coach has no availability */
const TIME_SLOTS_24H = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
];

function timeTo24h(s: string): string {
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return '09:00';
  let h = parseInt(m[1], 10);
  const isPm = (m[3] || '').toUpperCase() === 'PM';
  if (isPm && h !== 12) h += 12;
  if (!isPm && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function is24h(s: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(s) && !s.match(/\s*(AM|PM)/i);
}

/** Slot from API — may lock booking to one facility when `facilityId` is set */
export interface BookingSlotOption {
  time: string;
  facilityId: string | null;
}

function slotOptKey(s: BookingSlotOption): string {
  return `${s.time}\t${s.facilityId ?? ''}`;
}

/** Local calendar day for yyyy-MM-dd (matches date picker). */
function parseYmdLocal(ymd: string): Date | undefined {
  const parts = ymd.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
  const [y, m, d] = parts;
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return new Date(y, m - 1, d);
}

interface Athlete {
  id: string;
  first_name: string;
  last_name: string;
  school: string;
  photo_url?: string;
  photo_focus_x?: number;
  photo_focus_y?: number;
  total_sessions?: number;
}

interface Facility {
  id: string;
  name: string;
  address?: string | null;
  school: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description?: string;
  parent_price: number;
  athlete_payout: number;
  min_participants: number;
  max_participants: number;
}

interface BookingFlowProps {
  athlete: Athlete;
  /** Wrestling rooms linked to this coach (primary, secondary, `coach_facilities`). */
  coachFacilities: Facility[];
  youthWrestlers: YouthWrestler[];
  tenantPricing: { oneOnOne: number; twoAthlete: number; groupRate: number };
  products?: Product[];
  /** When set, pre-select this wrestler so the parent doesn't have to choose again (e.g. from Home "Book session" for a specific kid). */
  preselectedYouthWrestlerId?: string | null;
  /** When false (default), percent discount only if user applies a valid promo on this flow. */
  checkoutUsesSavedAccountDiscount?: boolean;
  /** Deep-link from training / shared links: yyyy-MM-dd and HH:mm as returned by availability slots API. */
  initialBookingDate?: string | null;
  initialBookingTime?: string | null;
  /** From coach profile: pre-select private vs partner (partner defaults to invite). */
  initialBookIntent?: 'private' | 'partner' | null;
}

type AvailabilityByDay = { day_of_week: number; start_time: string; end_time: string }[];

export function BookingFlow({
  athlete,
  coachFacilities,
  youthWrestlers,
  tenantPricing,
  products = [],
  preselectedYouthWrestlerId = null,
  checkoutUsesSavedAccountDiscount = false,
  initialBookingDate = null,
  initialBookingTime = null,
  initialBookIntent = null,
}: BookingFlowProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedWrestlers, setSelectedWrestlers] = useState<YouthWrestler[]>(() => {
    if (preselectedYouthWrestlerId && youthWrestlers.length > 0) {
      const found = youthWrestlers.find((w) => w.id === preselectedYouthWrestlerId);
      if (found) return [found];
    }
    return [];
  });
  const [sessionChoice, setSessionChoice] = useState<'1-on-1' | 'partner' | 'sibling' | null>(null);
  const [partnerOption, setPartnerOption] = useState<'invite' | 'open' | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availability, setAvailability] = useState<AvailabilityByDay | null>(null);
  const [availabilityDates, setAvailabilityDates] = useState<Set<string>>(new Set());
  const [slotsOptions, setSlotsOptions] = useState<BookingSlotOption[]>([]);
  /** Selected hourly slot — may impose a locked facility via `facilityId`. */
  const [selectedSlotBooking, setSelectedSlotBooking] = useState<BookingSlotOption | null>(null);
  /** When chosen slot leaves venue open (`facilityId` null) and coach has multiple sites. */
  const [chosenOpenVenueId, setChosenOpenVenueId] = useState<string>('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [percentOff, setPercentOff] = useState<number | null>(null);
  /** Session-only checkout: validated code + percent (sent on POST /api/bookings). */
  const [bookingPromoApplied, setBookingPromoApplied] = useState(false);
  const [bookingPromoPercent, setBookingPromoPercent] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [initialSlotSeeded, setInitialSlotSeeded] = useState(false);
  const [useCredits, setUseCredits] = useState(true);
  const [attendingPickerOpen, setAttendingPickerOpen] = useState(false);

  const sessionMode: SessionMode | null =
    sessionChoice === '1-on-1' ? 'private'
    : sessionChoice === 'sibling' ? 'sibling'
    : sessionChoice === 'partner' && partnerOption === 'invite' ? 'partner-invite'
    : sessionChoice === 'partner' && partnerOption === 'open' ? 'partner-open'
    : null;

  // Use product pricing if available, fall back to tenant pricing
  const getProductPrice = () => {
    if (selectedProduct) {
      const participants = selectedWrestlers.length;
      return {
        total: selectedProduct.parent_price * participants,
        pricePerParticipant: selectedProduct.parent_price,
        athletePayout: selectedProduct.athlete_payout * participants,
      };
    }
    // Fall back to legacy tenant pricing
    const priceInfo = sessionMode
      ? getSessionPrice(sessionMode, selectedWrestlers.length, tenantPricing)
      : null;
    return priceInfo ? { 
      total: priceInfo.total, 
      pricePerParticipant: priceInfo.pricePerParticipant,
      athletePayout: priceInfo.total * COACH_REVENUE_FRACTION,
    } : null;
  };

  const priceInfo = getProductPrice();
  const totalPrice = priceInfo?.total ?? 0;
  const pricePerParticipant = priceInfo?.pricePerParticipant;
  const effectivePercentOff = checkoutUsesSavedAccountDiscount
    ? percentOff
    : bookingPromoApplied && bookingPromoPercent != null
      ? bookingPromoPercent
      : null;
  const displayPrice =
    effectivePercentOff != null && effectivePercentOff >= 1 && effectivePercentOff <= 100
      ? totalPrice * (1 - effectivePercentOff / 100)
      : totalPrice;
  const hasPercentDiscount =
    effectivePercentOff != null && effectivePercentOff >= 1 && effectivePercentOff <= 100;

  const partnerPerPersonFallback = Math.round(tenantPricing.twoAthlete / 2);
  const firstPrivateProduct = products.find(p => p.slug === 'private' || (p.min_participants === 1 && p.max_participants === 1));
  const firstPartnerProduct = products.find(p => p.slug === 'partner' || (p.min_participants <= 2 && p.max_participants >= 2));
  const numParticipants = selectedWrestlers.length;
  const firstSiblingProduct = numParticipants >= 2
    ? products.find(p => p.min_participants <= numParticipants && p.max_participants >= numParticipants)
    : null;

  // Auto-select product based on session type if products available
  useEffect(() => {
    if (products.length > 0 && sessionMode) {
      const numParticipants = selectedWrestlers.length;
      // Find matching product
      let product: Product | undefined;
      if (sessionMode === 'private') {
        product = products.find(p => p.slug === 'private' || (p.min_participants === 1 && p.max_participants === 1));
      } else if (sessionMode === 'partner-invite' || sessionMode === 'partner-open') {
        product = products.find(p => p.slug === 'partner' || (p.min_participants <= 2 && p.max_participants >= 2));
      } else if (sessionMode === 'sibling') {
        // Sibling uses partner pricing for 2 people
        product = products.find(p => p.slug === 'partner' || (p.min_participants <= numParticipants && p.max_participants >= numParticipants));
      }
      setSelectedProduct(product || null);
    }
  }, [sessionMode, selectedWrestlers.length, products]);

  const numSelected = numParticipants;
  const oneWrestler = numSelected === 1;
  const twoPlusWrestlers = numSelected >= 2;
  const isPartner = sessionChoice === 'partner';
  const needsPartnerOption = isPartner && partnerOption === null && oneWrestler;

  const { data: creditsData } = useSWR('/api/credits', creditsFetcher);
  const creditBalance = typeof creditsData?.balance === 'number' ? creditsData.balance : 0;
  const creditsToApplyBooking =
    useCredits ? Math.min(creditBalance, displayPrice) : 0;
  const amountAfterCredits = Math.max(0, displayPrice - creditsToApplyBooking);

  useEffect(() => {
    if (youthWrestlers.length === 1) {
      setSelectedWrestlers([youthWrestlers[0]]);
      setCurrentStep(2);
    }
  }, [youthWrestlers]);

  useEffect(() => {
    if (!initialBookIntent) return;
    if (initialBookIntent === 'private') {
      setSessionChoice('1-on-1');
      setPartnerOption(null);
    } else {
      setSessionChoice('partner');
      setPartnerOption('invite');
    }
  }, [initialBookIntent]);

  useEffect(() => {
    (async () => {
      try {
        if (checkoutUsesSavedAccountDiscount) {
          const pctRes = await fetch('/api/account/percentage-discount');
          if (pctRes.ok) {
            const p = await pctRes.json();
            const n = p.percent_off != null ? Number(p.percent_off) : null;
            setPercentOff(n != null && n >= 1 && n <= 100 ? n : null);
          }
        } else {
          setPercentOff(null);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [checkoutUsesSavedAccountDiscount]);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const r = await fetch(`/api/availability?athleteId=${encodeURIComponent(athlete.id)}`);
        if (!ok) return;
        const data = await r.json();
        if (r.ok) {
          if (Array.isArray(data.availability)) setAvailability(data.availability);
          if (Array.isArray(data.availabilityDates)) setAvailabilityDates(new Set(data.availabilityDates));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { ok = false; };
  }, [athlete.id]);

  useEffect(() => {
    if (!initialBookingDate) return;
    const d = parseYmdLocal(initialBookingDate);
    if (!d) return;
    setSelectedDate(d);
  }, [initialBookingDate]);

  useEffect(() => {
    if (initialSlotSeeded || !initialBookingTime || !selectedDate || slotsLoading) return;
    const ymd = formatEST(selectedDate, 'yyyy-MM-dd');
    if (initialBookingDate && ymd !== initialBookingDate) return;
    const match = slotsOptions.find((s) => s.time === initialBookingTime);
    if (match) {
      setSelectedSlotBooking(match);
      setInitialSlotSeeded(true);
    }
  }, [
    initialBookingDate,
    initialBookingTime,
    selectedDate,
    slotsOptions,
    slotsLoading,
    initialSlotSeeded,
  ]);

  const hasAvailability =
    (availability?.length ?? 0) > 0 || (availabilityDates?.size ?? 0) > 0;
  const daysWithSlots = new Set(availability?.map((a) => a.day_of_week) ?? []);

  useEffect(() => {
    if (!selectedDate) {
      setSlotsOptions([]);
      setSelectedSlotBooking(null);
      setChosenOpenVenueId('');
      return;
    }
    setSelectedSlotBooking(null);
    setChosenOpenVenueId('');
    if (!hasAvailability) {
      const now = new Date();
      const isToday =
        selectedDate.getFullYear() === now.getFullYear() &&
        selectedDate.getMonth() === now.getMonth() &&
        selectedDate.getDate() === now.getDate();
      const currentHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const fallback = isToday ? TIME_SLOTS_24H.filter((s) => s > currentHHmm) : TIME_SLOTS_24H;
      setSlotsOptions(fallback.map((time) => ({ time, facilityId: null })));
      return;
    }
    let ok = true;
    setSlotsLoading(true);
    const dateStr = formatEST(selectedDate, 'yyyy-MM-dd');
    fetch(`/api/availability/slots?athleteId=${encodeURIComponent(athlete.id)}&date=${dateStr}`)
      .then((r) => r.json())
      .then((data) => {
        if (!ok) return;
        const raw = Array.isArray(data.slots) ? data.slots : [];
        const normalized: BookingSlotOption[] = raw
          .map((item: unknown) => {
            if (typeof item === 'string') return { time: item, facilityId: null };
            const o = item as { time?: unknown; facilityId?: unknown };
            const tm = typeof o.time === 'string' ? o.time.trim() : '';
            if (!tm) return null;
            let facilityId: string | null = null;
            const fid = o.facilityId;
            if (typeof fid === 'string' && fid.trim()) facilityId = fid.trim();
            return { time: tm, facilityId };
          })
          .filter((x: BookingSlotOption | null): x is BookingSlotOption => x !== null);
        setSlotsOptions(normalized);
      })
      .catch(() => {
        if (ok) setSlotsOptions([]);
      })
      .finally(() => {
        if (ok) setSlotsLoading(false);
      });
    return () => { ok = false; };
  }, [athlete.id, selectedDate, hasAvailability]);

  const selectedTime = selectedSlotBooking?.time ?? null;

  const needsVenueChoice =
    Boolean(selectedSlotBooking) &&
    !selectedSlotBooking?.facilityId &&
    coachFacilities.length > 1;

  const resolvedBookingFacilityId = useMemo(() => {
    if (!selectedSlotBooking) return null;
    if (selectedSlotBooking.facilityId) return selectedSlotBooking.facilityId;
    if (coachFacilities.length === 1) return coachFacilities[0]?.id ?? null;
    const v = chosenOpenVenueId.trim();
    return v || null;
  }, [selectedSlotBooking, coachFacilities, chosenOpenVenueId]);

  const resolvedBookingFacility =
    resolvedBookingFacilityId != null
      ? coachFacilities.find((f) => f.id === resolvedBookingFacilityId) ?? null
      : null;

  const facilityLabelShort = (fid: string | null) =>
    fid ? coachFacilities.find((f) => f.id === fid)?.name ?? 'Site' : 'Any linked room';

  const toggleWrestler = (w: YouthWrestler) => {
    setSelectedWrestlers((prev) =>
      prev.some((x) => x.id === w.id)
        ? prev.filter((x) => x.id !== w.id)
        : [...prev, w]
    );
  };

  /** Min/max athletes on the final review step (and enforced before pay). */
  const wrestlerBounds = useMemo(() => {
    if (!sessionMode) return { min: 1, max: Math.max(1, youthWrestlers.length) };
    if (sessionMode === 'private') return { min: 1, max: 1 };
    if (sessionMode === 'partner-invite' || sessionMode === 'partner-open') {
      return { min: 1, max: Math.min(2, Math.max(1, youthWrestlers.length)) };
    }
    if (sessionMode === 'sibling') {
      return { min: 2, max: Math.max(2, youthWrestlers.length) };
    }
    return { min: 1, max: Math.max(1, youthWrestlers.length) };
  }, [sessionMode, youthWrestlers.length]);

  const toggleWrestlerOnReview = (w: YouthWrestler) => {
    setSelectedWrestlers((prev) => {
      const sel = prev.some((x) => x.id === w.id);
      if (sel) {
        if (prev.length <= wrestlerBounds.min) return prev;
        return prev.filter((x) => x.id !== w.id);
      }
      if (prev.length >= wrestlerBounds.max) return prev;
      return [...prev, w];
    });
  };

  useEffect(() => {
    if (currentStep !== 4 || !sessionMode) return;
    if (sessionMode === 'private' && selectedWrestlers.length > 1) {
      setSelectedWrestlers((prev) => (prev[0] ? [prev[0]] : prev.slice(0, 1)));
    }
    if (
      (sessionMode === 'partner-invite' || sessionMode === 'partner-open') &&
      selectedWrestlers.length > 2
    ) {
      setSelectedWrestlers((prev) => prev.slice(0, 2));
    }
  }, [currentStep, sessionMode, selectedWrestlers.length]);

  const venueChoiceComplete = !needsVenueChoice || Boolean(chosenOpenVenueId.trim());

  const handleContinue = () => {
    if (currentStep === 1 && numSelected > 0) setCurrentStep(2);
    else if (currentStep === 2) {
      if (isPartner && oneWrestler && !partnerOption) return; // must pick partner option
      if (sessionChoice && (!isPartner || partnerOption)) setCurrentStep(3);
    } else if (currentStep === 3 && selectedDate && selectedTime && venueChoiceComplete) setCurrentStep(4);
  };

  const handleBack = () => {
    if (currentStep === 2 && isPartner && partnerOption) {
      setPartnerOption(null);
      return;
    }
    setCurrentStep((s) => Math.max(1, s - 1));
  };

  const canContinue =
    (currentStep === 1 && numSelected > 0) ||
    (currentStep === 2 && sessionChoice && (!isPartner || partnerOption)) ||
    (currentStep === 3 && !!selectedDate && !!selectedTime && venueChoiceComplete);

  const refreshPercentDiscount = async () => {
    const pctRes = await fetch('/api/account/percentage-discount');
    if (!pctRes.ok) return;
    const p = await pctRes.json();
    const n = p.percent_off != null ? Number(p.percent_off) : null;
    setPercentOff(n != null && n >= 1 && n <= 100 ? n : null);
  };

  /** One field: redeem to account (saved %) or validate for this booking only, depending on tenant flag. */
  const handleApplyPromo = async () => {
    const trimmed = promoCode.trim();
    if (!trimmed) return;
    setPromoApplying(true);
    setPromoFeedback(null);
    try {
      if (checkoutUsesSavedAccountDiscount) {
        const res = await fetch('/api/redeem-discount-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmed }),
        });
        const data = await res.json();
        if (!res.ok && !data.alreadyUsed) {
          setPromoFeedback({ type: 'error', text: data.error || 'Could not apply code' });
          return;
        }
        await refreshPercentDiscount();
        setPromoFeedback({ type: 'success', text: data.message || 'Code applied to your account.' });
        setPromoCode('');
      } else {
        const res = await fetch('/api/checkout/validate-promo-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmed.toUpperCase() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPromoFeedback({ type: 'error', text: data.error || 'Invalid code' });
          return;
        }
        setBookingPromoPercent(data.percent_off);
        setBookingPromoApplied(true);
        setPromoFeedback({
          type: 'success',
          text: `${data.percent_off}% off applied for this booking.`,
        });
      }
    } catch {
      setPromoFeedback({ type: 'error', text: 'Could not apply code. Try again.' });
    } finally {
      setPromoApplying(false);
    }
  };

  const handlePay = async () => {
    if (!sessionMode || !selectedDate || !selectedTime || totalPrice <= 0) {
      alert('Please complete all steps.');
      return;
    }
    const n = selectedWrestlers.length;
    if (n < wrestlerBounds.min || n > wrestlerBounds.max) {
      alert(
        sessionMode === 'sibling'
          ? `Sibling sessions need at least ${wrestlerBounds.min} wrestlers selected.`
          : sessionMode === 'private'
            ? 'Private sessions include one wrestler only.'
            : `Select between ${wrestlerBounds.min} and ${wrestlerBounds.max} wrestler(s) for this session.`
      );
      return;
    }
    if (
      !checkoutUsesSavedAccountDiscount &&
      promoCode.trim() &&
      !bookingPromoApplied
    ) {
      alert('Click Apply to confirm your promo code before paying, or clear the promo field.');
      return;
    }
    if (!resolvedBookingFacilityId) {
      alert(
        needsVenueChoice
          ? 'Choose which wrestling room you want — this coach lists more than one site.'
          : 'Could not resolve a wrestling room for this booking. Refresh and pick your date/time again.'
      );
      return;
    }
    setLoading(true);
    try {
      const dateStr = formatEST(selectedDate, 'yyyy-MM-dd');
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId: athlete.id,
          facilityId: resolvedBookingFacilityId,
          youthWrestlerIds: selectedWrestlers.map((w) => w.id),
          sessionMode,
          joinPolicy:
            partnerOption === 'invite' ? 'invite_only' : partnerOption === 'open' ? 'public' : undefined,
          scheduledDate: dateStr,
          scheduledTime: is24h(selectedTime) ? selectedTime : timeTo24h(selectedTime),
          totalPrice,
          pricePerParticipant: pricePerParticipant ?? undefined,
          productId: selectedProduct?.id ?? undefined,
          promoCode:
            !checkoutUsesSavedAccountDiscount && bookingPromoApplied && promoCode.trim()
              ? promoCode.trim().toUpperCase()
              : undefined,
          useCredits,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      const params = new URLSearchParams({
        sessionId: data.sessionId,
        ...(data.partnerInviteCode && { code: data.partnerInviteCode }),
        ...(data.sessionMode && { mode: data.sessionMode }),
      });
      router.push(`/book/${athlete.id}/confirmed?${params.toString()}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  const skillLabel = (w: YouthWrestler) =>
    w.skill_level ? w.skill_level.charAt(0).toUpperCase() + w.skill_level.slice(1) : 'Skill not set';

  const totalSteps = 4;
  const progressPct = (currentStep / totalSteps) * 100;

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8 max-w-7xl">
      <div className="mb-6">
        <div className="mb-4">
          <BackLink
            fallbackHref={`/athlete/${athlete.id}`}
            label="Back to Profile"
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-2">
          <ProfileImage
            src={athlete.photo_url}
            alt={`${athlete.first_name} ${athlete.last_name}`}
            focusX={athlete.photo_focus_x}
            focusY={athlete.photo_focus_y}
            className="w-16 h-16 shrink-0"
            fallbackIconClassName="h-8 w-8 text-muted-foreground"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-2xl font-bold">
              Book with {athlete.first_name} {athlete.last_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              When this coach has posted join-in sessions, they show in the list above. To book a new private or partner
              session, use the steps below
              {' '}
              <a href="#schedule-new-session" className="text-accent font-medium underline underline-offset-2">
                (jump to steps)
              </a>
              .
            </p>
            <p className="text-muted-foreground flex items-center gap-2 flex-wrap">
              <SchoolLogo school={athlete.school} size="sm" />
              {athlete.school}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div
          id="schedule-new-session"
          className={cn(
            'order-2 lg:order-1 space-y-6 scroll-mt-24',
            currentStep === 4 ? 'lg:col-span-2' : 'lg:col-span-3'
          )}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Step {currentStep} of {totalSteps}</span>
                <span className="text-sm text-muted-foreground">{Math.round(progressPct)}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </CardContent>
          </Card>

          {/* Step 1: Select Wrestler(s) — or prompt to add one */}
          {currentStep === 1 && youthWrestlers.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Add your wrestler to book</CardTitle>
                <p className="text-sm text-muted-foreground">
                  You need at least one wrestler on your account to book a session with {athlete.first_name} {athlete.last_name}. Add one below and you’ll return here to continue.
                </p>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href={`/wrestlers/add?redirect=${encodeURIComponent('/book/' + athlete.id)}`}>
                    Add wrestler
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
          {currentStep === 1 && youthWrestlers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Wrestler(s)</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Choose one or more youth wrestlers for this session.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {youthWrestlers.map((w) => {
                    const sel = selectedWrestlers.some((x) => x.id === w.id);
                    return (
                      <Card
                        key={w.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleWrestler(w)}
                        onKeyDown={(e) => e.key === 'Enter' && toggleWrestler(w)}
                        className={sessionTypeChoiceClass(sel)}
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <ProfileImage
                            src={w.photo_url}
                            alt={`${w.first_name} ${w.last_name}`}
                            focusX={w.photo_focus_x}
                            focusY={w.photo_focus_y}
                            className="w-14 h-14 shrink-0"
                            fallbackIconClassName="h-7 w-7 text-muted-foreground"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold">{w.first_name} {w.last_name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {w.age != null ? `${w.age} yrs` : '—'} • {w.weight_class ? `${w.weight_class} lbs` : '—'} • {skillLabel(w)}
                            </p>
                          </div>
                          {sel && <CheckCircle className="h-5 w-5 text-accent shrink-0" />}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                {numSelected > 0 && (
                  <p className="text-sm text-muted-foreground mt-4">
                    {numSelected} wrestler{numSelected !== 1 ? 's' : ''} selected
                  </p>
                )}
                <Button onClick={handleContinue} disabled={numSelected === 0} className="w-full mt-6">
                  Continue
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Session Type (+ Partner option when Partner chosen) */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Choose Session Type</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {oneWrestler ? (
                    <>
                      <strong className="font-medium text-foreground">Private</strong> — one athlete with the coach for
                      the whole session.{' '}
                      <strong className="font-medium text-foreground">Partner</strong> — two athletes with the same
                      coach; you&apos;ll invite or find the second wrestler after you continue.
                    </>
                  ) : (
                    'Sibling session for multiple wrestlers.'
                  )}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {oneWrestler && (
                  <>
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSessionChoice('1-on-1'); setPartnerOption(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && (setSessionChoice('1-on-1'), setPartnerOption(null))}
                      className={sessionTypeChoiceClass(sessionChoice === '1-on-1')}
                    >
                      <CardContent className="p-5">
                        <h3 className="font-semibold text-lg">{firstPrivateProduct?.name ?? '1-on-1 Private Session'}</h3>
                        <p className="text-muted-foreground text-sm mb-2">Just your wrestler and the coach—no second athlete.</p>
                        <p className="text-2xl font-bold">
                          ${firstPrivateProduct ? firstPrivateProduct.parent_price.toFixed(0) : tenantPricing.oneOnOne}
                        </p>
                      </CardContent>
                    </Card>
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => setSessionChoice('partner')}
                      onKeyDown={(e) => e.key === 'Enter' && setSessionChoice('partner')}
                      className={cn(
                        'relative',
                        sessionTypeChoiceClass(sessionChoice === 'partner')
                      )}
                    >
                      {firstPartnerProduct && !firstPrivateProduct && <Badge className="absolute top-4 right-4 bg-accent text-black text-xs">BEST VALUE</Badge>}
                      <CardContent className="p-5 pr-24">
                        <h3 className="font-semibold text-lg">{firstPartnerProduct?.name ?? 'Partner Session'}</h3>
                        <p className="text-muted-foreground text-sm mb-2">
                          Two athletes, one coach—you line up the second wrestler (invite someone or post an open spot).
                        </p>
                        <p className="text-2xl font-bold">
                          ${firstPartnerProduct ? firstPartnerProduct.parent_price.toFixed(0) : partnerPerPersonFallback}{' '}
                          <span className="text-base font-normal text-muted-foreground">per person</span>
                        </p>
                      </CardContent>
                    </Card>
                  </>
                )}
                {twoPlusWrestlers && (
                  <Card
                    role="button"
                    tabIndex={0}
                    onClick={() => { setSessionChoice('sibling'); setPartnerOption(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && (setSessionChoice('sibling'), setPartnerOption(null))}
                    className={sessionTypeChoiceClass(sessionChoice === 'sibling')}
                  >
                    <CardContent className="p-5">
                      <h3 className="font-semibold text-lg">{firstSiblingProduct?.name ?? 'Sibling Session'}</h3>
                      <p className="text-muted-foreground text-sm mb-2">Train together with one coach</p>
                      <p className="text-2xl font-bold">
                        ${(firstSiblingProduct?.parent_price ?? partnerPerPersonFallback).toFixed(0)} per wrestler (Total: $
                        {((firstSiblingProduct?.parent_price ?? partnerPerPersonFallback) * numSelected).toFixed(0)})
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Step 2.5: How find partner? */}
                {needsPartnerOption && (
                  <div className="pt-4 border-t space-y-3">
                    <h4 className="font-semibold">How would you like to find a partner?</h4>
                    {[
                      { id: 'invite' as const, Icon: Link2, title: 'Invite only', desc: 'Share a link with someone you know. Only they can pay & register.', sub: "They'll pay when they use the link." },
                      { id: 'open' as const, Icon: Users, title: 'Public', desc: 'Anyone can find this session and pay to register.', sub: 'Shows in Find training and Group & partner as a join-in option.' },
                    ].map(({ id, Icon, title, desc, sub }) => (
                      <Card
                        key={id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setPartnerOption(id)}
                        onKeyDown={(e) => e.key === 'Enter' && setPartnerOption(id)}
                        className={sessionTypeChoiceClass(partnerOption === id)}
                      >
                        <CardContent className="p-4 flex items-start gap-4">
                          <Icon className="h-5 w-5 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-medium">{title}</h4>
                            <p className="text-sm text-muted-foreground">{desc}</p>
                            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                          </div>
                          {partnerOption === id && <CheckCircle className="h-5 w-5 text-accent shrink-0" />}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="flex gap-4 mt-6">
                  <Button variant="outline" onClick={handleBack} className="flex-1">Back</Button>
                  <Button onClick={handleContinue} disabled={!canContinue} className="flex-1">Continue</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Date & Time */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Pick Date & Time</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Choose a future date and time (8am–9pm).
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => {
                      if (date < startOfDay(new Date())) return true;
                      const dateStr = formatEST(date, 'yyyy-MM-dd');
                      if (availabilityDates.has(dateStr)) return false;
                      if (daysWithSlots.has(getDayOfWeek(date))) return false;
                      return hasAvailability;
                    }}
                    className="rounded-md border"
                  />
                </div>
                {selectedDate && (
                  <div>
                    <h3 className="font-semibold mb-3">Time</h3>
                    {slotsLoading ? (
                      <p className="text-sm text-muted-foreground">Loading slots…</p>
                    ) : slotsOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No times available this day.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {slotsOptions.map((slot) => {
                          const sel =
                            !!selectedSlotBooking &&
                            selectedSlotBooking.time === slot.time &&
                            slotOptKey(selectedSlotBooking) === slotOptKey(slot);
                          return (
                            <button
                              key={slotOptKey(slot)}
                              type="button"
                              onClick={() => {
                                setSelectedSlotBooking(slot);
                                setChosenOpenVenueId('');
                              }}
                              className={`min-h-[56px] p-2 rounded-lg border text-left text-sm transition-all touch-manipulation flex flex-col justify-center gap-0.5 ${
                                sel
                                  ? 'border-accent bg-accent text-black'
                                  : 'border-border hover:border-accent/50'
                              }`}
                            >
                              <span className="font-medium">{formatSlotDisplay(slot.time)}</span>
                              <span className={`text-[11px] leading-tight ${sel ? 'text-black/75' : 'text-muted-foreground'}`}>
                                {facilityLabelShort(slot.facilityId)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {needsVenueChoice ? (
                  <div className="space-y-2">
                    <Label htmlFor="book-venue-choice">Wrestling room</Label>
                    <Select value={chosenOpenVenueId} onValueChange={setChosenOpenVenueId}>
                      <SelectTrigger id="book-venue-choice">
                        <SelectValue placeholder={`Choose venue (${coachFacilities.length} linked)`} />
                      </SelectTrigger>
                      <SelectContent>
                        {coachFacilities.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Your coach trains at multiple sites — pick where this session will run.
                    </p>
                  </div>
                ) : null}
                {selectedDate && selectedSlotBooking?.facilityId ? (
                  <p className="text-sm font-medium text-foreground rounded-md border border-accent/35 bg-accent/10 px-3 py-2">
                    This time is booked at{' '}
                    <span className="underline decoration-accent">{facilityLabelShort(selectedSlotBooking.facilityId)}</span>{' '}
                    only.
                  </p>
                ) : null}
                {selectedDate && selectedTime && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {formatEST(selectedDate, 'EEEE, MMMM d, yyyy')} at{' '}
                    {formatSlotDisplay(selectedTime)}
                    {resolvedBookingFacility && !needsVenueChoice ? (
                      <span className="block mt-1 text-foreground">{resolvedBookingFacility.name}</span>
                    ) : null}
                  </p>
                )}
                <div className="flex gap-4 mt-6">
                  <Button variant="outline" onClick={handleBack} className="flex-1">Back</Button>
                  <Button onClick={handleContinue} disabled={!canContinue} className="flex-1">Continue</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Review & Confirm */}
          {currentStep === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Review & Confirm</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Confirm details and pay to book.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Coach</p>
                  <div className="flex items-center gap-3 mt-1">
                    <ProfileImage
                      src={athlete.photo_url}
                      alt={`${athlete.first_name} ${athlete.last_name}`}
                      focusX={athlete.photo_focus_x}
                      focusY={athlete.photo_focus_y}
                      className="w-12 h-12 shrink-0"
                      fallbackIconClassName="h-6 w-6 text-muted-foreground"
                    />
                    <span className="font-medium flex items-center gap-2">
                      <CoachSessionBadge totalSessions={athlete.total_sessions ?? 0} size="sm" />
                      {athlete.first_name} {athlete.last_name}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <SchoolLogo school={athlete.school} size="sm" />
                      ({athlete.school})
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Who&apos;s attending?</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Select every wrestler included in this booking. Total updates automatically
                      {sessionMode === 'private'
                        ? ' (private = one athlete).'
                        : sessionMode === 'sibling'
                          ? ` (sibling = at least ${wrestlerBounds.min}).`
                          : sessionMode === 'partner-invite' || sessionMode === 'partner-open'
                            ? ' (partner = up to two from your account).'
                            : '.'}
                    </p>
                  </div>
                  <Popover open={attendingPickerOpen} onOpenChange={setAttendingPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full min-h-[44px] justify-between font-normal text-left touch-manipulation"
                        id="review-attending-select"
                      >
                        <span className="truncate pr-2">
                          {selectedWrestlers.length === 0
                            ? 'Select wrestlers…'
                            : selectedWrestlers.length === 1
                              ? `${selectedWrestlers[0].first_name} ${selectedWrestlers[0].last_name}`
                              : `${selectedWrestlers.length} wrestlers: ${selectedWrestlers
                                  .map((w) => `${w.first_name} ${w.last_name}`)
                                  .join(', ')}`}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] max-h-[min(24rem,calc(100vh-8rem))] overflow-hidden p-0"
                      align="start"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                        {youthWrestlers.map((w) => {
                          const isSelected = selectedWrestlers.some((x) => x.id === w.id);
                          const atMax = selectedWrestlers.length >= wrestlerBounds.max;
                          const atMinRemove =
                            isSelected && selectedWrestlers.length <= wrestlerBounds.min;
                          const disabled = (!isSelected && atMax) || atMinRemove;
                          return (
                            <label
                              key={w.id}
                              className={cn(
                                'flex items-center gap-3 rounded-md px-2 py-2 cursor-pointer touch-manipulation',
                                disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/60'
                              )}
                            >
                              <Checkbox
                                checked={isSelected}
                                disabled={disabled}
                                onCheckedChange={() => {
                                  if (!disabled) toggleWrestlerOnReview(w);
                                }}
                                className="shrink-0"
                              />
                              <ProfileImage
                                src={w.photo_url}
                                alt=""
                                focusX={w.photo_focus_x}
                                focusY={w.photo_focus_y}
                                className="w-9 h-9 shrink-0"
                                fallbackIconClassName="h-4 w-4 text-muted-foreground"
                              />
                              <span className="text-sm font-medium">
                                {w.first_name} {w.last_name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                        Choose {wrestlerBounds.min === wrestlerBounds.max
                          ? `${wrestlerBounds.min}`
                          : `${wrestlerBounds.min}–${wrestlerBounds.max}`}{' '}
                        for this session. Linked kids on your account appear here too.
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Session Type</p>
                  <p className="mt-1">
                    {sessionMode === 'private' && '1-on-1 Private'}
                    {sessionMode === 'sibling' && 'Sibling Session'}
                    {sessionMode === 'partner-invite' && 'Partner Session (invite link)'}
                    {sessionMode === 'partner-open' && 'Partner Session (open to join requests)'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Date & Time</p>
                  <p className="mt-1">
                    {selectedDate && selectedTime && `${formatEST(selectedDate, 'EEEE, MMMM d, yyyy')} at ${formatSlotDisplay(selectedTime)}`}
                  </p>
                </div>
                {resolvedBookingFacility ? (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Location</p>
                    <p className="mt-1">{resolvedBookingFacility.name}</p>
                    {resolvedBookingFacility.address && (
                      <p className="text-sm text-muted-foreground">{resolvedBookingFacility.address}</p>
                    )}
                  </div>
                ) : null}
                {(!checkoutUsesSavedAccountDiscount || !hasPercentDiscount) && (
                    <div className="space-y-2 rounded-lg border p-4">
                      <Label htmlFor="booking-promo">Promo code</Label>
                      <p className="text-sm text-muted-foreground">
                        {checkoutUsesSavedAccountDiscount
                          ? 'Redeem a valid code to save a discount on your account. Apply before you pay — Stripe checkout does not include a promo field.'
                          : 'Apply a valid code before you pay. Stripe checkout does not include a promo field.'}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <Input
                          id="booking-promo"
                          className="max-w-xs uppercase"
                          placeholder="Enter code"
                          value={promoCode}
                          onChange={(e) => {
                            const v = e.target.value.toUpperCase();
                            setPromoCode(v);
                            setPromoFeedback(null);
                            if (!checkoutUsesSavedAccountDiscount) {
                              setBookingPromoApplied(false);
                              setBookingPromoPercent(null);
                            }
                          }}
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleApplyPromo()}
                          disabled={promoApplying || !promoCode.trim()}
                        >
                          {promoApplying ? 'Applying…' : 'Apply'}
                        </Button>
                      </div>
                      {promoFeedback && (
                        <p
                          className={
                            promoFeedback.type === 'success'
                              ? 'text-sm text-green-600 dark:text-green-400'
                              : 'text-sm text-destructive'
                          }
                        >
                          {promoFeedback.text}
                        </p>
                      )}
                    </div>
                  )}
                {creditBalance > 0 && (
                  <div className="space-y-2 rounded-lg border border-accent/25 bg-accent/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/20">
                          <Wallet className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Apply earned credits</p>
                          <p className="text-sm text-muted-foreground">
                            ${creditBalance.toFixed(2)} available — applies automatically up to this booking&apos;s total
                            (same as cart checkout).
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={useCredits}
                        onCheckedChange={setUseCredits}
                        className="data-[state=checked]:bg-accent"
                      />
                    </div>
                    {useCredits && creditsToApplyBooking > 0 && (
                      <div className="flex items-center gap-2 border-t border-accent/20 pt-3 text-accent">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          -${creditsToApplyBooking.toFixed(2)} from your wallet
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="pt-4 border-t flex justify-between items-center">
                  <span className="font-semibold">Price</span>
                  <span className="text-2xl font-bold">
                    {hasPercentDiscount ? (
                      <span>
                        {effectivePercentOff}% off · you pay ${amountAfterCredits.toFixed(2)}
                      </span>
                    ) : creditsToApplyBooking > 0 ? (
                      <span>
                        <span className="text-lg font-normal text-muted-foreground line-through mr-2">
                          ${displayPrice.toFixed(2)}
                        </span>
                        ${amountAfterCredits.toFixed(2)}
                      </span>
                    ) : (
                      `$${displayPrice.toFixed(2)}`
                    )}
                  </span>
                </div>
                {hasPercentDiscount && (
                  <p className="text-sm text-muted-foreground">
                    {effectivePercentOff}% discount applied.
                    {creditsToApplyBooking > 0
                      ? ` Credits cover $${creditsToApplyBooking.toFixed(2)}; you pay $${amountAfterCredits.toFixed(2)}.`
                      : ` You'll pay $${displayPrice.toFixed(2)}.`}
                  </p>
                )}
                {(sessionMode === 'partner-invite' || sessionMode === 'partner-open') &&
                  numSelected === 1 && (
                  <p className="text-sm text-muted-foreground">
                    Second spot: another family pays $
                    {(firstPartnerProduct?.parent_price ?? partnerPerPersonFallback).toFixed(0)} when they join.
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4">
                  <Button variant="outline" onClick={handleBack} className="flex-1 w-full sm:w-auto">Back</Button>
                  <Button
                    onClick={handlePay}
                    disabled={
                      loading ||
                      selectedWrestlers.length < wrestlerBounds.min ||
                      selectedWrestlers.length > wrestlerBounds.max
                    }
                    className="flex-1 w-full sm:w-auto"
                  >
                    {loading
                      ? 'Booking…'
                      : `Book Session ($${amountAfterCredits.toFixed(2)})`}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Payment is arranged directly with your coach.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary only on final step — avoids empty “Not selected” sidebar on steps 1–3 */}
        {currentStep === 4 && (
          <div className="order-1 lg:order-2 lg:col-span-1">
            <Card className="lg:sticky lg:top-4">
              <CardHeader>
                <CardTitle>Booking Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b">
                  <ProfileImage
                    src={athlete.photo_url}
                    alt={`${athlete.first_name} ${athlete.last_name}`}
                    focusX={athlete.photo_focus_x}
                    focusY={athlete.photo_focus_y}
                    className="w-12 h-12 shrink-0"
                    fallbackIconClassName="h-6 w-6 text-muted-foreground"
                  />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <CoachSessionBadge totalSessions={athlete.total_sessions ?? 0} size="sm" />
                      {athlete.first_name} {athlete.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <SchoolLogo school={athlete.school} size="sm" />
                      {athlete.school}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Wrestler(s)</p>
                  {numSelected > 0 ? (
                    <div className="space-y-1">
                      {selectedWrestlers.map((w) => (
                        <div key={w.id} className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {w.first_name} {w.last_name}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not selected</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Session Type</p>
                  <p className="text-sm">
                    {sessionMode === 'private' && '1-on-1 Private'}
                    {sessionMode === 'sibling' && 'Sibling Session'}
                    {sessionMode === 'partner-invite' && 'Partner (invite)'}
                    {sessionMode === 'partner-open' && 'Partner (open)'}
                    {!sessionMode && 'Not selected'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Date & Time</p>
                  {selectedDate && selectedTime ? (
                    <p className="text-sm flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatEST(selectedDate, 'MMM d, yyyy')} at {formatSlotDisplay(selectedTime)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not selected</p>
                  )}
                </div>
                {resolvedBookingFacility ? (
                  <div>
                    <p className="text-sm font-medium mb-2">Location</p>
                    <p className="text-sm">{resolvedBookingFacility.name}</p>
                  </div>
                ) : null}
                <div className="pt-4 border-t flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-xl font-bold">
                    {sessionMode ? (hasPercentDiscount ? `$${displayPrice.toFixed(2)} (${effectivePercentOff}% off)` : `$${totalPrice.toFixed(2)}`) : '—'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
