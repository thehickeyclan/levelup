'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MapPin } from 'lucide-react';

export type CoachLocationOption = {
  id: string;
  name: string;
  school: string;
  address?: string | null;
  directions?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (facility: CoachLocationOption) => void;
  /** When an admin creates a session on behalf of a coach */
  coachId?: string;
};

export function CoachNewLocationDialog({ open, onOpenChange, onCreated, coachId }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [directions, setDirections] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setAddress('');
    setDirections('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/coaches/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          directions: directions.trim() || undefined,
          ...(coachId ? { coachId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save location');
        return;
      }
      const facility = data.facility as CoachLocationOption;
      if (!facility?.id) {
        setError('Unexpected response from server');
        return;
      }
      onCreated(facility);
      resetForm();
      onOpenChange(false);
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#B89D60]" />
            New location
          </DialogTitle>
          <DialogDescription>
            Add a wrestling room or travel venue for this session. Parents will see the address and any notes you add.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="coach-loc-name">Location name</Label>
            <Input
              id="coach-loc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Triangle Wrestling Club"
              required
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coach-loc-address">Street address</Label>
            <Input
              id="coach-loc-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Raleigh, NC 27601"
              required
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coach-loc-directions">Special instructions (optional)</Label>
            <Textarea
              id="coach-loc-directions"
              value={directions}
              onChange={(e) => setDirections(e.target.value)}
              placeholder="Parking in lot B, enter door 3, mat room upstairs…"
              rows={3}
              disabled={submitting}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim() || !address.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save location'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
