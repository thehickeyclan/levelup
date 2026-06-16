'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface YouthWrestlerItem {
  id: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  weight_class?: string;
  skill_level?: string;
  /** False = no 10-digit cell on file; payment API will reject until fixed */
  hasValidCell?: boolean;
  /** False = graduation year missing; registration API will reject until fixed */
  hasGraduationYear?: boolean;
}

interface SessionRegisterClientProps {
  sessionId: string;
  isOwner: boolean;
  isSmallGroup?: boolean;
  pricePerParticipant: number;
  priceAfterDiscount?: number;
  percentOff?: number;
  youthWrestlers: YouthWrestlerItem[];
  initialWrestlerId?: string;
  checkoutUsesSavedAccountDiscount?: boolean;
  /** Partner / invite link code (e.g. ?code= on register URL) — required for some private invite sessions under RLS. */
  partnerInviteCode?: string;
}

export function SessionRegisterClient({
  sessionId,
  isOwner,
  isSmallGroup = false,
  pricePerParticipant,
  priceAfterDiscount,
  percentOff,
  youthWrestlers,
  initialWrestlerId = '',
  checkoutUsesSavedAccountDiscount = false,
  partnerInviteCode = '',
}: SessionRegisterClientProps) {
  const router = useRouter();
  const [selectedWrestlerId, setSelectedWrestlerId] = useState(initialWrestlerId);
  const [promoCode, setPromoCode] = useState('');
  const [codeApplied, setCodeApplied] = useState(false);
  const [localPromoPercent, setLocalPromoPercent] = useState<number | null>(null);
  const [applyingCode, setApplyingCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [useCredits, setUseCredits] = useState(true);

  useEffect(() => {
    if (isOwner) return;
    let cancelled = false;
    fetch('/api/credits')
      .then((r) => r.json())
      .then((data: { balance?: unknown }) => {
        if (cancelled) return;
        const b = Number(data?.balance);
        setCreditBalance(Number.isFinite(b) ? b : 0);
      })
      .catch(() => {
        if (!cancelled) setCreditBalance(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  const displayPrice = useMemo(() => {
    if (isOwner) return pricePerParticipant;
    if (checkoutUsesSavedAccountDiscount) {
      return priceAfterDiscount ?? pricePerParticipant;
    }
    if (codeApplied && localPromoPercent != null && localPromoPercent >= 1) {
      return pricePerParticipant * (1 - localPromoPercent / 100);
    }
    return pricePerParticipant;
  }, [
    isOwner,
    checkoutUsesSavedAccountDiscount,
    priceAfterDiscount,
    pricePerParticipant,
    codeApplied,
    localPromoPercent,
  ]);

  /** Same path we send users back to after add-wrestler / edit profile (keeps invite ?code= when present). */
  const registerReturnPath = useMemo(() => {
    const base = `/sessions/${sessionId}/register`;
    const code = partnerInviteCode.trim();
    if (!code) return base;
    return `${base}?code=${encodeURIComponent(code)}`;
  }, [sessionId, partnerInviteCode]);
  const addWrestlerHref = `/wrestlers/add?redirect=${encodeURIComponent(registerReturnPath)}`;

  const selectedWrestler = youthWrestlers.find((yw) => yw.id === selectedWrestlerId);
  const selectedHasCell = selectedWrestler?.hasValidCell !== false;
  const selectedHasGradYear = selectedWrestler?.hasGraduationYear !== false;

  const editWrestlerHref = selectedWrestlerId
    ? `/wrestlers/${selectedWrestlerId}/edit?redirect=${encodeURIComponent(registerReturnPath)}`
    : null;

  const creditsApplicable = useMemo(() => {
    if (isOwner || !useCredits || creditBalance == null || creditBalance <= 0) return 0;
    return Math.min(creditBalance, displayPrice);
  }, [isOwner, useCredits, creditBalance, displayPrice]);

  const cardPortion = useMemo(() => Math.max(0, displayPrice - creditsApplicable), [displayPrice, creditsApplicable]);

  const handleApplyCode = async () => {
    const codeTrimmed = promoCode.trim();
    if (!codeTrimmed) return;
    setError(null);
    setApplyingCode(true);
    try {
      if (checkoutUsesSavedAccountDiscount) {
        const redeemRes = await fetch('/api/redeem-discount-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeTrimmed }),
        });
        const data = await redeemRes.json();
        if (redeemRes.ok && (data.success || data.alreadyUsed)) {
          setCodeApplied(true);
          router.refresh();
        } else {
          setError(data.error || 'Invalid or expired promo code');
        }
      } else {
        const res = await fetch('/api/checkout/validate-promo-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeTrimmed.toUpperCase() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Invalid or expired promo code');
          return;
        }
        setLocalPromoPercent(data.percent_off);
        setCodeApplied(true);
      }
    } catch {
      setError('Could not apply code. Try again.');
    } finally {
      setApplyingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current || loading) return;
    if (!selectedWrestlerId) {
      setError('Please select a wrestler.');
      return;
    }
    if (selectedWrestler && selectedWrestler.hasValidCell === false) {
      setError('Add this athlete’s cell number on their profile first.');
      return;
    }
    if (selectedWrestler && selectedWrestler.hasGraduationYear === false) {
      setError('Add graduation year (Class of …) on their wrestler profile before registering.');
      return;
    }
    setError(null);
    submitLock.current = true;
    setLoading(true);
    try {
      const codeTrimmed = promoCode.trim();
      if (!isOwner && codeTrimmed && !codeApplied) {
        setError('Click Apply to confirm your promo code before paying.');
        setLoading(false);
        submitLock.current = false;
        return;
      }

      const res = await fetch(`/api/sessions/${sessionId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youthWrestlerId: selectedWrestlerId,
          promoCode: !isOwner && codeApplied ? codeTrimmed.toUpperCase() : undefined,
          partnerInviteCode: partnerInviteCode.trim() ? partnerInviteCode.trim().toUpperCase() : undefined,
          useCredits: !isOwner ? useCredits : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || (isOwner ? 'Failed to add wrestler' : 'Failed to start payment');
        setError(msg);
        submitLock.current = false;
        return;
      }
      if (data.added) {
        router.push(`/sessions/${sessionId}/register/confirmed`);
        router.refresh();
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      router.push(`/sessions/${sessionId}/register/confirmed`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (isOwner ? 'Failed to add wrestler' : 'Payment failed');
      setError(msg);
      submitLock.current = false;
    } finally {
      setLoading(false);
    }
  };

  if (youthWrestlers.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Add a wrestler profile—you’ll return here to pay and register. If you have more than one athlete
          for this session, use <span className="text-foreground font-medium">Add another wrestler</span> on
          the next screen to set up the second before paying, or pay for one and come back for the next.
        </p>
        <Button asChild className="bg-accent text-black hover:bg-accent-hover">
          <Link href={addWrestlerHref}>Add a wrestler</Link>
        </Button>
      </div>
    );
  }

  const showSavedDiscountLine =
    !isOwner && checkoutUsesSavedAccountDiscount && percentOff != null && isSmallGroup;
  const showImplicitAllowlistLine =
    !isOwner && !checkoutUsesSavedAccountDiscount && percentOff != null && isSmallGroup && !codeApplied;
  const showPromoAppliedLine =
    !isOwner && !checkoutUsesSavedAccountDiscount && codeApplied && localPromoPercent != null && isSmallGroup;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="wrestler">{isOwner ? 'Which wrestler do you want to add?' : 'Which wrestler is registering?'}</Label>
        <Select value={selectedWrestlerId} onValueChange={(v) => { setSelectedWrestlerId(v); setError(null); }} required>
          <SelectTrigger id="wrestler">
            <SelectValue placeholder="Select wrestler" />
          </SelectTrigger>
          <SelectContent>
            {youthWrestlers.map((yw) => {
              const name = [yw.first_name, yw.last_name].filter(Boolean).join(' ');
              const extra = [yw.age && `${yw.age} yrs`, yw.weight_class, yw.skill_level].filter(Boolean).join(', ');
              const label = extra ? `${name} (${extra})` : name;
              const needPhone = yw.hasValidCell === false;
              const needGradYear = yw.hasGraduationYear === false;
              return (
                <SelectItem key={yw.id} value={yw.id}>
                  {label}
                  {needPhone ? ' — add cell to register' : ''}
                  {!needPhone && needGradYear ? ' — add class year' : ''}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          <Link href={addWrestlerHref} className="text-accent underline-offset-4 hover:underline font-medium">
            Add another wrestler
          </Link>
          {isOwner
            ? ' if someone else still needs to join.'
            : ' if another athlete needs a profile before you pay.'}
        </p>
        {selectedWrestlerId && !selectedHasCell && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm space-y-2">
            <p className="text-destructive font-medium">
              Cell number required on this athlete’s profile before you can add them or pay.
            </p>
            <p className="text-muted-foreground">
              Add a 10-digit mobile number (Wrestlers → Edit), then return here.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link
                href={`/wrestlers/${selectedWrestlerId}/edit?redirect=${encodeURIComponent(registerReturnPath)}`}
              >
                Edit {selectedWrestler?.first_name ?? 'athlete'} — add cell
              </Link>
            </Button>
          </div>
        )}
        {selectedWrestlerId && selectedHasCell && !selectedHasGradYear && editWrestlerHref && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm space-y-2">
            <p className="text-destructive font-medium">
              Graduation year required before registering (shows on session rosters).
            </p>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link href={editWrestlerHref}>
                Edit {selectedWrestler?.first_name ?? 'athlete'} — add class year
              </Link>
            </Button>
          </div>
        )}
      </div>
      {!isOwner && (
        <div className="space-y-2">
          <Label htmlFor="promo">
            {checkoutUsesSavedAccountDiscount ? 'Promo code (optional)' : 'Promo code (discount only if valid code applied)'}
          </Label>
          <div className="flex gap-2">
            <Input
              id="promo"
              type="text"
              placeholder=""
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase());
                setError(null);
                setCodeApplied(false);
                setLocalPromoPercent(null);
              }}
              className="uppercase flex-1"
              autoComplete="off"
              name="guild-session-register-promo"
              data-lpignore="true"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleApplyCode}
              disabled={!promoCode.trim() || applyingCode}
            >
              {applyingCode ? 'Applying…' : 'Apply'}
            </Button>
          </div>
          {showSavedDiscountLine && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              {codeApplied
                ? `Code applied. You get ${percentOff}% off — pay & register below.`
                : `Your account has a ${percentOff}% family discount — the price below reflects it.`}
            </p>
          )}
          {showImplicitAllowlistLine && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              {`Your approved family rate is included — ${percentOff}% off below. You do not need to enter a promo code.`}
            </p>
          )}
          {showPromoAppliedLine && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              {`Code applied. You get ${localPromoPercent}% off — pay & register below.`}
            </p>
          )}
          {!isOwner && creditBalance !== null && creditBalance > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-2">
              <p className="text-foreground">
                Guild wallet balance: <span className="font-semibold">${creditBalance.toFixed(2)}</span>
                {useCredits && creditsApplicable > 0 ? (
                  <span className="text-muted-foreground">
                    {` · ${creditsApplicable.toFixed(2)} will apply to this spot`}
                  </span>
                ) : null}
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCredits}
                  onChange={(e) => setUseCredits(e.target.checked)}
                  className="rounded border-input"
                />
                <span>Use Guild credits for this registration</span>
              </label>
            </div>
          )}
        </div>
      )}
      <Button
        type="submit"
        disabled={
          loading ||
          (selectedWrestler != null && selectedWrestler.hasValidCell === false) ||
          (selectedWrestler != null && selectedWrestler.hasGraduationYear === false)
        }
        className="w-full"
      >
        {loading
          ? (isOwner ? 'Adding…' : 'Redirecting to payment…')
          : isOwner
            ? 'Add wrestler'
            : cardPortion < 0.005
              ? 'Complete registration'
              : `Pay $${cardPortion.toFixed(2)} & register`}
      </Button>
    </form>
  );
}
