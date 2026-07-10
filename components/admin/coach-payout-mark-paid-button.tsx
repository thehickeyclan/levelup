'use client';

import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  athleteId: string;
  defaultAmount: number;
  amountOverride?: string;
  markingAthleteId: string | null;
  setMarkingAthleteId: (id: string | null) => void;
  size?: 'sm' | 'default';
  className?: string;
};

export function CoachPayoutMarkPaidButton({
  athleteId,
  defaultAmount,
  amountOverride,
  markingAthleteId,
  setMarkingAthleteId,
  size = 'sm',
  className,
}: Props) {
  const router = useRouter();
  const isLoading = markingAthleteId === athleteId;

  return (
    <Button
      type="button"
      size={size}
      className={className ?? 'bg-[#B89D60] hover:bg-[#9A8550] text-black h-8'}
      disabled={isLoading}
      onClick={async () => {
        setMarkingAthleteId(athleteId);
        const amount = parseFloat(amountOverride ?? defaultAmount.toFixed(2));
        try {
          const res = await fetch('/api/admin/mark-payout-paid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ athlete_id: athleteId, amount }),
          });
          if (res.ok) router.refresh();
          else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'Could not mark payout paid');
          }
        } finally {
          setMarkingAthleteId(null);
        }
      }}
    >
      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Mark paid'}
    </Button>
  );
}
