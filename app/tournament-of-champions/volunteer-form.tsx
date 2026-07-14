'use client';

import { useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  TOURNAMENT_VOLUNTEER_AVAILABILITY,
  TOURNAMENT_VOLUNTEER_ROLES,
} from '@/lib/tournament/volunteer-roles';

const inputClass =
  'mt-1.5 bg-white/10 border-white/30 text-white placeholder:text-white/50 focus-visible:ring-accent';

const selectClass =
  'w-full mt-1.5 rounded-md border bg-white/10 border-white/30 text-white focus:ring-accent focus:border-accent min-h-[44px] px-3';

export function VolunteerForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [clubOrSchool, setClubOrSchool] = useState('');
  const [primaryRole, setPrimaryRole] = useState('');
  const [additionalRoles, setAdditionalRoles] = useState<string[]>([]);
  const [availability, setAvailability] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const toggleAdditionalRole = (role: string) => {
    setAdditionalRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !primaryRole) return;
    setStatus('loading');
    setErrorMessage('');
    try {
      const res = await fetch('/api/tournament-volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          club_or_school: clubOrSchool.trim() || undefined,
          primary_role: primaryRole,
          additional_roles: additionalRoles.filter((r) => r !== primaryRole),
          availability: availability || undefined,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('idle');
        setName('');
        setEmail('');
        setPhone('');
        setClubOrSchool('');
        setPrimaryRole('');
        setAdditionalRoles([]);
        setAvailability('');
        setMessage('');
        setShowSuccess(true);
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
    }
  };

  const loading = status === 'loading';

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl text-left">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="vol-name" className="text-white/90">
            Name *
          </Label>
          <Input
            id="vol-name"
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
            className={inputClass}
          />
        </div>
        <div>
          <Label htmlFor="vol-email" className="text-white/90">
            Email *
          </Label>
          <Input
            id="vol-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className={inputClass}
          />
        </div>
        <div>
          <Label htmlFor="vol-phone" className="text-white/90">
            Cell phone
          </Label>
          <Input
            id="vol-phone"
            type="tel"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
            className={inputClass}
          />
        </div>
        <div>
          <Label htmlFor="vol-club" className="text-white/90">
            Club / school (optional)
          </Label>
          <Input
            id="vol-club"
            type="text"
            placeholder="Club or school name"
            value={clubOrSchool}
            onChange={(e) => setClubOrSchool(e.target.value)}
            disabled={loading}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="vol-primary-role" className="text-white/90">
            Where can you help most? *
          </Label>
          <select
            id="vol-primary-role"
            value={primaryRole}
            onChange={(e) => setPrimaryRole(e.target.value)}
            required
            disabled={loading}
            className={selectClass}
          >
            <option value="" className="bg-gray-900">
              Select an area…
            </option>
            {TOURNAMENT_VOLUNTEER_ROLES.map((role) => (
              <option key={role} value={role} className="bg-gray-900">
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <Label className="mb-2 block text-white/90">
            Also open to helping with (optional)
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOURNAMENT_VOLUNTEER_ROLES.filter((role) => role !== primaryRole).map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white/85 hover:border-accent/40 hover:text-white"
              >
                <input
                  type="checkbox"
                  checked={additionalRoles.includes(role)}
                  onChange={() => toggleAdditionalRole(role)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-white/40 bg-white/10 text-accent focus:ring-accent"
                />
                {role}
              </label>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="vol-availability" className="text-white/90">
            Availability
          </Label>
          <select
            id="vol-availability"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            disabled={loading}
            className={selectClass}
          >
            <option value="" className="bg-gray-900">
              Select…
            </option>
            {TOURNAMENT_VOLUNTEER_AVAILABILITY.map((opt) => (
              <option key={opt} value={opt} className="bg-gray-900">
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="vol-message" className="text-white/90">
            Anything else? (optional)
          </Label>
          <Textarea
            id="vol-message"
            placeholder="Skills, connections for sponsors, group of volunteers you can bring, etc."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={loading}
            rows={3}
            className={inputClass}
          />
        </div>
      </div>

      {errorMessage ? <p className="mt-6 text-sm text-red-300">{errorMessage}</p> : null}

      <Button
        type="submit"
        size="lg"
        variant="premium"
        disabled={loading}
        className="mt-6 w-full gold-glow-hover"
      >
        {loading ? (
          'Signing up…'
        ) : (
          <>
            <HeartHandshake className="mr-2 h-4 w-4" />
            Sign up to volunteer
          </>
        )}
      </Button>

      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>You&apos;re in — thank you</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Thanks for stepping up for the Tournament of Champions. We&apos;ll reach out with next
            steps and your role details.
          </p>
          <DialogFooter>
            <Button onClick={() => setShowSuccess(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
