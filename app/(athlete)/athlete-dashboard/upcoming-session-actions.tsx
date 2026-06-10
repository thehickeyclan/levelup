'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MessageCircle, CalendarClock, X, Pencil } from 'lucide-react';
type Props = {
  sessionId: string;
  scheduledDatetime: string;
  totalPrice: number;
};

export function UpcomingSessionActions({ sessionId, scheduledDatetime, totalPrice }: Props) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by coach' }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to cancel session');
        return;
      }
      alert(data.message);
      router.refresh();
    } catch (e) {
      console.error('Cancel error:', e);
      alert('Failed to cancel session');
    } finally {
      setCancelling(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/sessions/${sessionId}/reschedule`}>
        <Button variant="outline" size="sm">
          <CalendarClock className="h-4 w-4 mr-1" />
          Reschedule
        </Button>
      </Link>
      <Link href={`/coach-sessions/${sessionId}/edit`}>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-1" />
          Edit
        </Button>
      </Link>
      <Link href={`/messages/${sessionId}`}>
        <Button variant="ghost" size="sm">
          <MessageCircle className="h-4 w-4 mr-1" />
          Message
        </Button>
      </Link>
      {!showConfirm ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfirm(true)}
          className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border p-3 bg-muted/50 w-full sm:w-auto">
          <p className="text-xs text-muted-foreground">
            Parents receive wallet credit for what they paid (about $
            {Number(totalPrice).toFixed(2)} for the booking parent). Credit works on any coach.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)} disabled={cancelling}>
              Back
            </Button>
            <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel session'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
