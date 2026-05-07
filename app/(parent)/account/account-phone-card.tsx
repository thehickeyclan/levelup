'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, ChevronRight, Check, X } from 'lucide-react';

export function AccountPhoneCard({ initialPhone, compact }: { initialPhone: string | null; compact?: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<'success' | 'error' | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setErrorDetail(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (!res.ok) {
        let msg = 'Failed to save';
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        setErrorDetail(msg);
        setMessage('error');
        return;
      }
      setMessage('success');
      setEditing(false);
      router.refresh();
    } catch {
      setMessage('error');
    } finally {
      setSaving(false);
    }
  };

  if (compact) {
    return (
      <div className="px-4 py-3.5 hover:bg-zinc-800/50 transition-colors">
        <div className="flex items-center gap-3">
          <Phone className="h-5 w-5 text-zinc-400" />
          {editing ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                type="tel"
                placeholder="555-123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-9 flex-1"
                autoFocus
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-2 text-green-500 hover:bg-green-500/10 rounded-lg transition-colors"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setEditing(false); setPhone(initialPhone ?? ''); }}
                className="p-2 text-zinc-500 hover:bg-zinc-700/50 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setEditing(true)}
              className="flex-1 flex items-center justify-between text-left"
            >
              <span className="font-medium">Phone Number</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-500">{initialPhone || 'Add'}</span>
                <ChevronRight className="h-4 w-4 text-zinc-600" />
              </div>
            </button>
          )}
        </div>
        {message === 'error' && (
          <p className="text-xs text-destructive mt-2 pl-8">{errorDetail ?? 'Failed to save'}</p>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Contact
        </CardTitle>
        <CardDescription>Your cell phone (required). Used for session alerts and coach contact.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="account-phone">Cell phone</Label>
          <Input
            id="account-phone"
            type="tel"
            placeholder="e.g. 555-123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {message === 'success' && (
          <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>
        )}
        {message === 'error' && (
          <p className="text-sm text-destructive">{errorDetail ?? 'Failed to save. Try again.'}</p>
        )}
      </CardContent>
    </Card>
  );
}
