'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  parentId: string;
  parentLabel: string;
  defaultZip?: string | null;
  defaultPhone?: string | null;
};

export function AdminCreateYouthWrestlerForm({
  parentId,
  parentLabel,
  defaultZip,
  defaultPhone,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState(defaultPhone ?? '');
  const [zipCode, setZipCode] = useState(defaultZip ?? '');
  const [weightClass, setWeightClass] = useState('');
  const [school, setSchool] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/youth-wrestlers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId,
          firstName,
          lastName,
          phone,
          zipCode,
          weightClass: weightClass || undefined,
          school: school || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create wrestler');
        return;
      }
      setOpen(false);
      setFirstName('');
      setLastName('');
      setWeightClass('');
      setSchool('');
      router.refresh();
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add wrestler for {parentLabel}
      </Button>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <p className="text-sm font-medium text-foreground">New wrestler on {parentLabel}&apos;s account</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="admin-yw-first">First name</Label>
          <Input id="admin-yw-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-yw-last">Last name</Label>
          <Input id="admin-yw-last" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-yw-phone">Cell phone</Label>
          <Input id="admin-yw-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-yw-zip">Home ZIP</Label>
          <Input id="admin-yw-zip" value={zipCode} onChange={(e) => setZipCode(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-yw-weight">Weight (lbs)</Label>
          <Input id="admin-yw-weight" value={weightClass} onChange={(e) => setWeightClass(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-yw-school">School</Label>
          <Input id="admin-yw-school" value={school} onChange={(e) => setSchool(e.target.value)} />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create wrestler'}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
