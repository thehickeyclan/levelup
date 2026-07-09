'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/lib/auth/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RequestFacilityBlock } from '@/components/request-facility-block';
import { Check, Copy, DollarSign, Globe, Lock, QrCode, Share2 } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import Link from 'next/link';
import { IN_APP_MESSAGING_ENABLED } from '@/lib/in-app-messaging';
import { isValidUsZipCode } from '@/lib/us-zip';

const profileSchema = z.object({
  weightClass: z.string().optional(),
  bio: z.string().max(500, 'Bio must be 500 characters or less').optional(),
  facilityId: z.string().optional(),
  secondaryFacilityId: z.string().optional(),
  phone: z
    .string()
    .min(1, 'Cell phone is required')
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Enter a valid 10-digit cell number'),
  zipCode: z
    .string()
    .optional()
    .refine((v) => !v || v.trim() === '' || isValidUsZipCode(v.trim()), 'Enter a valid U.S. ZIP (5 digits or ZIP+4)'),
  venmoHandle: z.string().max(30).optional(),
  zelleEmail: z.string().optional().refine((v) => !v || v.trim() === '' || (v.includes('@') ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) : v.replace(/\D/g, '').length >= 7), 'Use a valid email or phone (7+ digits) for Zelle'),
  photo: z.instanceof(File).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const router = useRouter();
  const { user, userRole, effectiveRole, viewAsCoachId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<Array<{ id: string; name: string; school: string }>>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoFocusX, setPhotoFocusX] = useState(50);
  const [photoFocusY, setPhotoFocusY] = useState(50);
  const [isPublic, setIsPublic] = useState(true);
  const [copiedPublicSessionsLink, setCopiedPublicSessionsLink] = useState(false);
  const visibilityModalRef = useRef<HTMLDialogElement>(null);
  const photoContainerRef = useRef<HTMLDivElement>(null);
  const photoImgRef = useRef<HTMLImageElement>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      weightClass: '',
      bio: '',
      facilityId: '',
      secondaryFacilityId: '',
      phone: '',
      zipCode: '',
      venmoHandle: '',
      zelleEmail: '',
    },
  });

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/api/athletes/profile');
        const contentType = response.headers.get('content-type') ?? '';
        let data: {
          athlete?: any;
          facilities?: any[];
          error?: string;
          needsCoachSelection?: boolean;
        } = {};
        if (contentType.includes('application/json')) {
          try {
            data = await response.json();
          } catch {
            setError('Failed to load profile data');
            return;
          }
        }

        if (data.needsCoachSelection && data.error) {
          setError(data.error);
        } else if (!response.ok && data.error) {
          setError(data.error);
        } else if (data.error && !data.athlete) {
          setError(data.error);
        }

        if (data.athlete) {
          form.reset({
            weightClass: data.athlete.weight_class || '',
            bio: data.athlete.bio || '',
            facilityId: data.athlete.facility_id || '',
            secondaryFacilityId: data.athlete.secondary_facility_id || '',
            phone: data.athlete.phone || '',
            zipCode: data.athlete.zip_code || '',
            venmoHandle: data.athlete.venmo_handle || '',
            zelleEmail: data.athlete.zelle_email || '',
          });

          if (data.athlete.photo_url) {
            setPhotoPreview(data.athlete.photo_url);
          }
          const fx = data.athlete.photo_focus_x;
          const fy = data.athlete.photo_focus_y;
          if (typeof fx === 'number' && fx >= 0 && fx <= 100) setPhotoFocusX(fx);
          if (typeof fy === 'number' && fy >= 0 && fy <= 100) setPhotoFocusY(fy);

          setIsPublic(data.athlete.active === true);
        }

        setFacilities(data.facilities || []);
      } catch (err) {
        setError('Failed to load profile data');
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      loadData();
    }
  }, [user, form]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoPositionClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = photoContainerRef.current;
      const img = photoImgRef.current;
      if (!container || !img || !img.complete || !img.naturalWidth) return;
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const W = rect.width;
      const H = rect.height;
      const Iw = img.naturalWidth;
      const Ih = img.naturalHeight;
      const s = Math.max(W / Iw, H / Ih);
      const px = (cx - W / 2) / s + (photoFocusX / 100) * Iw;
      const py = (cy - H / 2) / s + (photoFocusY / 100) * Ih;
      const newX = Math.min(100, Math.max(0, (px / Iw) * 100));
      const newY = Math.min(100, Math.max(0, (py / Ih) * 100));
      setPhotoFocusX(Math.round(newX));
      setPhotoFocusY(Math.round(newY));
    },
    [photoFocusX, photoFocusY]
  );

  const doSave = async (makePublic: boolean) => {
    setSubmitting(true);
    setError(null);
    setSaveSuccess(null);

    try {
      const values = form.getValues();
      let photoUrl = photoPreview;

      if (photoFile) {
        const formData = new FormData();
        formData.append('file', photoFile);

        const uploadResponse = await fetch('/api/athletes/upload-photo', {
          method: 'POST',
          body: formData,
        });

        const uploadCt = uploadResponse.headers.get('content-type') ?? '';
        let uploadData: { error?: string; photoUrl?: string } = {};
        if (uploadCt.includes('application/json')) {
          try {
            uploadData = await uploadResponse.json();
          } catch {
            throw new Error('Invalid response from server. Please try again.');
          }
        }
        if (!uploadResponse.ok) {
          throw new Error(uploadData.error || 'Failed to upload photo');
        }
        if (uploadData.photoUrl) photoUrl = uploadData.photoUrl;
      }

      const response = await fetch('/api/athletes/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weightClass: values.weightClass,
          bio: values.bio,
          credentials: {},
          photoUrl,
          photoFocusX: photoFocusX,
          photoFocusY: photoFocusY,
          facilityId: values.facilityId,
          secondaryFacilityId: values.secondaryFacilityId || undefined,
          phone: (values.phone ?? '').trim() === '' ? null : (values.phone ?? '').trim(),
          zipCode: (values.zipCode ?? '').trim() === '' ? null : (values.zipCode ?? '').trim(),
          venmoHandle: values.venmoHandle?.trim() || undefined,
          zelleEmail: values.zelleEmail?.trim() || undefined,
          active: makePublic,
        }),
      });

      const contentType = response.headers.get('content-type') ?? '';
      let data: { error?: string } = {};
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          throw new Error('Invalid response from server. Please try again.');
        }
      }
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      visibilityModalRef.current?.close();

      if (makePublic) {
        setIsPublic(true);
        router.push('/athlete-dashboard');
        router.refresh();
      } else {
        setIsPublic(false);
        setSaveSuccess('Profile saved. It stays private—you can keep editing.');
        setSubmitting(false);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setSubmitting(false);
    }
  };

  const onSubmit = () => {
    setError(null);
    setSaveSuccess(null);
    visibilityModalRef.current?.showModal();
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const isCoachProfile = effectiveRole === 'coach' || userRole === 'coach';
  /** Public /coach/[id] is the athlete row id — use impersonation target when admin previews as coach */
  const coachPublicId =
    userRole === 'coach' ? user?.id ?? null : userRole === 'admin' && viewAsCoachId ? viewAsCoachId : null;
  const publicSessionsLink =
    coachPublicId &&
    (process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') ||
      (typeof window !== 'undefined' ? window.location.origin : '')) +
      `/coach/${coachPublicId}`;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <BackLink fallbackHref="/athlete-dashboard" label="Back to Schedule" />
        {IN_APP_MESSAGING_ENABLED ? (
          <Link href="/inbox" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            Inbox
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Messages (web paused)</span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
          <CardDescription>
            Update your profile information
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
              <p className="text-sm text-destructive">{error}</p>
              {userRole === 'admin' && effectiveRole === 'coach' && !viewAsCoachId && (
                <p className="text-xs text-destructive/90 mt-2">
                  Open the header menu, choose Preview as → Coach, and pick the coach whose profile you want to edit.
                </p>
              )}
            </div>
          )}

          {saveSuccess && (
            <div className="mb-4 p-3 bg-accent/10 border border-accent rounded-md">
              <p className="text-sm text-foreground">{saveSuccess}</p>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="photo"
                render={() => (
                  <FormItem>
                    <FormLabel>Profile Photo</FormLabel>
                    <div className="flex items-center gap-4">
                      {photoPreview && (
                        <img
                          src={photoPreview}
                          alt="Profile preview"
                          className="w-24 h-24 rounded-full object-cover border"
                          style={{ objectPosition: `${photoFocusX}% ${photoFocusY}%` }}
                        />
                      )}
                      <div>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoChange}
                          className="cursor-pointer"
                        />
                        <FormDescription>
                          Upload a professional photo (max 5MB)
                        </FormDescription>
                      </div>
                    </div>
                    {photoPreview && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">Position photo</p>
                        <p className="text-xs text-muted-foreground mb-2">
                          Click where your face is so it isn&apos;t cut off on your profile.
                        </p>
                        <div
                          ref={photoContainerRef}
                          role="button"
                          tabIndex={0}
                          onClick={handlePhotoPositionClick}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).click()}
                          className="relative w-full max-w-[280px] h-36 rounded-lg overflow-hidden border bg-muted cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
                          aria-label="Click to set focal point"
                        >
                          <img
                            ref={photoImgRef}
                            src={photoPreview}
                            alt=""
                            className="w-full h-full object-cover pointer-events-none"
                            style={{ objectPosition: `${photoFocusX}% ${photoFocusY}%` }}
                            draggable={false}
                          />
                        </div>
                      </div>
                    )}
                  </FormItem>
                )}
              />

          {isCoachProfile && coachPublicId && publicSessionsLink && (
            <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Share2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="text-sm font-medium">Public sessions link</p>
                  <p className="text-xs text-muted-foreground">
                    Share this URL to show everyone your upcoming sessions (no login). It does not change when you edit
                    your profile.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <Input readOnly className="font-mono text-xs sm:text-sm" value={publicSessionsLink} />
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(publicSessionsLink);
                      setCopiedPublicSessionsLink(true);
                      setTimeout(() => setCopiedPublicSessionsLink(false), 2000);
                    }}
                  >
                    {copiedPublicSessionsLink ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" asChild>
                    <Link href={`/coach/${coachPublicId}`} target="_blank" rel="noopener noreferrer">
                      Open
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href={`/qr/coach/${coachPublicId}`} target="_blank" rel="noopener noreferrer">
                      <QrCode className="h-4 w-4 mr-1" />
                      QR
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isCoachProfile && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Availability</CardTitle>
                <CardDescription>
                  Your bookable hours and blocking full days off live on one page so they stay in sync—manage them on
                  your availability calendar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="outline" className="min-h-[44px] touch-manipulation">
                  <Link href="/availability">Manage availability</Link>
                </Button>
                <p className="text-sm text-muted-foreground">
                  <Link href="/coach-help" className="text-accent font-medium underline">
                    Coach help
                  </Link>
                  {' — '}start with The Guild home-screen video, then availability and sessions.
                </p>
              </CardContent>
            </Card>
          )}

              {/* Weight Class */}
              <FormField
                control={form.control}
                name="weightClass"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight Class</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 157 lbs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Bio */}
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell parents about your wrestling experience, achievements, and coaching style..."
                        maxLength={500}
                        rows={5}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value?.length || 0}/500 characters
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Profile visibility: Public (bookable) vs Private (hidden, keep editing) */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Profile visibility</label>
                <p className="text-sm text-muted-foreground mb-2">
                  Public profiles appear in Browse and can receive bookings. Private profiles are hidden while you edit.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={isPublic ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={async () => {
                      if (isPublic) return;
                      try {
                        const r = await fetch('/api/athletes/profile/visibility', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ active: true }),
                        });
                        if (r.ok) setIsPublic(true);
                      } catch {
                        setError('Failed to update visibility');
                      }
                    }}
                  >
                    <Globe className="h-4 w-4 mr-1.5" />
                    Public
                  </Button>
                  <Button
                    type="button"
                    variant={!isPublic ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={async () => {
                      if (!isPublic) return;
                      try {
                        const r = await fetch('/api/athletes/profile/visibility', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ active: false }),
                        });
                        if (r.ok) setIsPublic(false);
                      } catch {
                        setError('Failed to update visibility');
                      }
                    }}
                  >
                    <Lock className="h-4 w-4 mr-1.5" />
                    Private
                  </Button>
                </div>
              </div>

              {/* Facility Selection */}
              {facilities.length > 0 && (
                <>
                  <FormField
                    control={form.control}
                    name="facilityId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Facility</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            if (form.getValues('secondaryFacilityId') === val) form.setValue('secondaryFacilityId', '');
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a facility" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {facilities.map((facility) => (
                              <SelectItem key={facility.id} value={facility.id}>
                                {facility.name} - {facility.school}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="secondaryFacilityId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Secondary Facility (optional)</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)} value={field.value || '__none__'}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {facilities
                              .filter((f) => f.id !== form.watch('facilityId'))
                              .map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.name} - {f.school}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="mt-3">
                    <RequestFacilityBlock />
                  </div>
                </>
              )}
              {facilities.length === 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">No facilities set up yet. Request one and we&apos;ll add it after review.</p>
                  <RequestFacilityBlock />
                </div>
              )}

              {/* Cell phone + Payout */}
              <div className="space-y-4 rounded-lg border p-4">
                <p className="text-sm font-medium text-foreground">Contact & payout</p>
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cell phone</FormLabel>
                      <FormControl>
                        <Input placeholder="5551234567" inputMode="tel" autoComplete="tel" {...field} />
                      </FormControl>
                      <FormDescription>We text you when someone signs up for your session.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="zipCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Home ZIP</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 27607" autoComplete="postal-code" {...field} />
                      </FormControl>
                      <FormDescription>
                        Used for maps and distance features (same as parent accounts). Not shown on your public profile.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="text-sm text-muted-foreground pt-2">
                  We pay coaches via Venmo or Zelle. Add at least one so we can send your earnings.
                </p>
                <FormField
                  control={form.control}
                  name="venmoHandle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Venmo username</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. jake-miller" {...field} />
                      </FormControl>
                      <FormDescription>Your Venmo handle (without @)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="zelleEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zelle (email or phone)</FormLabel>
                      <FormControl>
                        <Input placeholder="email@example.com or 5551234567" {...field} />
                      </FormControl>
                      <FormDescription>Email or phone linked to your Zelle account</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit" className="flex-1" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/athlete-dashboard')}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <dialog
        ref={visibilityModalRef}
        className="rounded-lg border bg-background p-6 shadow-lg max-w-md w-[calc(100%-2rem)]"
      >
        <h3 className="font-semibold text-lg mb-2">Save profile</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Would you like to make your profile public and ready for bookings, or keep it private to continue editing?
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            className="flex-1"
            onClick={() => doSave(true)}
            disabled={submitting}
          >
            <Globe className="h-4 w-4 mr-2" />
            Make Public
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => doSave(false)}
            disabled={submitting}
          >
            <Lock className="h-4 w-4 mr-2" />
            Keep Private
          </Button>
        </div>
        <form method="dialog" className="mt-3">
          <Button type="submit" variant="ghost" size="sm">
            Cancel
          </Button>
        </form>
      </dialog>
    </div>
  );
}

