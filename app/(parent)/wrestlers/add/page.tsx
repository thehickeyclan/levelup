'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent } from '@/components/ui/card';
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
import { OnboardingWizard } from '@/components/onboarding-wizard';
import { Camera, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { isValidUsZipCode } from '@/lib/us-zip';
import { graduationYearOptions } from '@/lib/graduation-year';

const youthWrestlerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().optional(),
  school: z.string().optional(),
  graduationYear: z
    .union([z.string(), z.number()])
    .refine((v) => v !== '' && v != null, 'Graduation year is required')
    .transform((v) => (typeof v === 'string' ? parseInt(v, 10) : v))
    .refine((v) => Number.isFinite(v), 'Graduation year is required'),
  weightClass: z.string().optional(),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced', 'elite']).optional(),
  wrestlingExperience: z.string().optional(),
  goals: z.string().optional(),
  medicalNotes: z.string().optional(),
  phone: z
    .string()
    .min(1, 'Cell phone is required')
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Enter a valid 10-digit cell number'),
  zipCode: z
    .string()
    .min(1, 'Home ZIP code is required')
    .refine(isValidUsZipCode, 'Enter a valid U.S. ZIP code (5 digits or ZIP+4)'),
});

type YouthWrestlerFormValues = z.infer<typeof youthWrestlerSchema>;

const TOTAL_STEPS = 4;

export default function AddYouthWrestlerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<{ id: string; first_name: string; last_name: string } | null>(null);

  const form = useForm<YouthWrestlerFormValues>({
    resolver: zodResolver(youthWrestlerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      school: '',
      graduationYear: undefined as number | undefined,
      weightClass: '',
      skillLevel: undefined,
      wrestlingExperience: '',
      goals: '',
      medicalNotes: '',
      phone: '',
      zipCode: '',
    },
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleNext = async () => {
    setError(null);

    if (step < TOTAL_STEPS - 1) {
      if (step === 0) {
        const ok = await form.trigger(['firstName', 'lastName']);
        if (!ok) {
          setError('First and last name are required.');
          return;
        }
      }
      if (step === 2) {
        const ok = await form.trigger([
          'phone',
          'zipCode',
          'dateOfBirth',
          'graduationYear',
          'weightClass',
          'skillLevel',
        ]);
        if (!ok) {
          setError('Cell phone, home ZIP, and graduation year are required.');
          return;
        }
      }
      setStep((s) => s + 1);
      return;
    }

    const ok = await form.trigger();
    if (!ok) return;

    setLoading(true);
    setDuplicateOf(null);
    try {
      const values = form.getValues();
      const doCreate = async (allowDuplicate = false) => {
        const res = await fetch('/api/youth-wrestlers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...values, allowDuplicate }),
        });
        return res;
      };

      let createResponse = await doCreate(false);

      if (createResponse.status === 409) {
        const data = await createResponse.json();
        if (data.code === 'DUPLICATE_PROFILE' && data.duplicateOf) {
          setDuplicateOf(data.duplicateOf);
          setLoading(false);
          return;
        }
        throw new Error(data.message || data.error || 'Duplicate profile');
      }

      if (!createResponse.ok) {
        const data = await createResponse.json();
        throw new Error(data.error || 'Failed to create youth wrestler');
      }

      const { youthWrestler } = await createResponse.json();

      if (photoFile) {
        const formData = new FormData();
        formData.append('file', photoFile);
        formData.append('youthWrestlerId', youthWrestler.id);
        const uploadResponse = await fetch('/api/youth-wrestlers/upload-photo', {
          method: 'POST',
          body: formData,
        });
        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          await fetch(`/api/youth-wrestlers/${youthWrestler.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...values, photoUrl: uploadData.photoUrl }),
          });
        }
      }

      const redirectTo = searchParams.get('redirect');
      const safeRedirect =
        redirectTo &&
        redirectTo.startsWith('/') &&
        !redirectTo.startsWith('//') &&
        !redirectTo.includes(':');
      router.push(safeRedirect ? redirectTo : '/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleCreateAnyway = async () => {
    if (!duplicateOf) return;
    setDuplicateOf(null);
    setLoading(true);
    setError(null);
    try {
      const values = form.getValues();
      const createResponse = await fetch('/api/youth-wrestlers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, allowDuplicate: true }),
      });
      if (!createResponse.ok) {
        const data = await createResponse.json();
        throw new Error(data.error || 'Failed to create youth wrestler');
      }
      const { youthWrestler } = await createResponse.json();
      if (photoFile) {
        const formData = new FormData();
        formData.append('file', photoFile);
        formData.append('youthWrestlerId', youthWrestler.id);
        const uploadResponse = await fetch('/api/youth-wrestlers/upload-photo', {
          method: 'POST',
          body: formData,
        });
        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          await fetch(`/api/youth-wrestlers/${youthWrestler.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...values, photoUrl: uploadData.photoUrl }),
          });
        }
      }
      const redirectTo = searchParams.get('redirect');
      const safeRedirect =
        redirectTo &&
        redirectTo.startsWith('/') &&
        !redirectTo.startsWith('//') &&
        !redirectTo.includes(':');
      router.push(safeRedirect ? redirectTo : '/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  const handleSkip = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  };

  const canGoNext = (() => {
    if (step === 0) {
      const v = form.watch();
      return !!(v.firstName?.trim() && v.lastName?.trim());
    }
    return true;
  })();

  const redirectTo = searchParams.get('redirect');
  const safeRedirect =
    redirectTo &&
    redirectTo.startsWith('/') &&
    !redirectTo.startsWith('//') &&
    !redirectTo.includes(':');

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <OnboardingWizard
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        onNext={handleNext}
        onBack={handleBack}
        onSkip={handleSkip}
        canGoNext={canGoNext}
        isLoading={loading}
        nextLabel={step === TOTAL_STEPS - 1 ? 'Done' : 'Continue'}
        showSkip={step === 1}
        skipLabel="Skip"
        wizardTitle="Add wrestler"
        wizardDescription="Quick profile for your athlete"
      >
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {duplicateOf && (
          <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/50 rounded-md">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  A profile for {duplicateOf.first_name} {duplicateOf.last_name} already exists.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Use the existing profile (e.g. from your spouse) or create a second one.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Link href={`/wrestlers/${duplicateOf.id}`}>
                    <Button type="button" variant="default" size="sm">
                      Use existing profile
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCreateAnyway}
                    disabled={loading}
                  >
                    Create another anyway
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <Form {...form}>
          {/* Step 0: Name */}
          {step === 0 && (
            <Card className="border-0 shadow-none">
              <CardContent className="p-0">
                <p className="text-muted-foreground mb-4">
                  What&apos;s their name?
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 1: Photo */}
          {step === 1 && (
            <Card className="border-0 shadow-none">
              <CardContent className="p-0">
                <p className="text-muted-foreground mb-4">
                  Add a photo so coaches recognize them.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <label className="relative cursor-pointer group">
                    <div className="w-32 h-32 rounded-full border-4 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden group-hover:border-accent/50 transition-colors bg-muted/30">
                      {photoPreview ? (
                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="h-12 w-12 text-muted-foreground" />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="absolute inset-0 w-full h-full opacity-0"
                    />
                  </label>
                  <div className="text-center sm:text-left">
                    <p className="text-sm font-medium mb-1">Profile Photo</p>
                    <p className="text-xs text-muted-foreground">Tap to upload (max 5MB)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Basics */}
          {step === 2 && (
            <Card className="border-0 shadow-none">
              <CardContent className="p-0 space-y-4">
                <p className="text-muted-foreground mb-4">
                  Athlete cell, home ZIP, age, weight, and skill level.
                </p>
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Athlete cell phone *</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="e.g. 678-555-0100"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Required so coaches can reach {form.watch('firstName') || 'your athlete'} for session updates (texts).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="zipCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Home ZIP code *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. 27514"
                          autoComplete="postal-code"
                          inputMode="numeric"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Household ZIP for this athlete — required for maps and showing training options near you.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>Optional</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="graduationYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Graduation year *</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(parseInt(v, 10))}
                        value={field.value != null ? String(field.value) : ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select class year" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {graduationYearOptions().map((year) => (
                            <SelectItem key={year} value={String(year)}>
                              Class of {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Required — shows on session rosters (e.g. Class &apos;27).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="weightClass"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weight Class</FormLabel>
                        <FormControl>
                          <Input placeholder="75 lbs" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="skillLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Skill Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                            <SelectItem value="elite">Elite</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Goals + Medical */}
          {step === 3 && (
            <Card className="border-0 shadow-none">
              <CardContent className="p-0 space-y-4">
                <p className="text-muted-foreground mb-4">
                  Anything else coaches should know?
                </p>
                <FormField
                  control={form.control}
                  name="goals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Goals</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., takedowns, conditioning"
                          rows={2}
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="medicalNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medical notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Injuries, allergies – shared with coaches"
                          rows={2}
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}
        </Form>
      </OnboardingWizard>
    </div>
  );
}
