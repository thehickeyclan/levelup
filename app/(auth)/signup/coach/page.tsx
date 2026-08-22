'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';
import { GuildIndependentContractorAgreement } from '@/components/guild-independent-contractor-agreement';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { zOptionalCheckbox, zRequiredAgreementCheckbox } from '@/lib/zod-checkbox';

const coachSignupSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().refine((v) => v.replace(/\D/g, '').length >= 10, 'Enter a valid cell number'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  coachType: z.enum(['ncaa_athlete', 'former_college_athlete', 'club_hs_coach']),
  school: z.string().min(1, 'School, college, or club is required'),
  weightClass: z.string().optional(),
  bio: z.string().max(800, 'Keep your bio under 800 characters').optional(),
  hasSafeSport: zOptionalCheckbox,
  safeSportExpiry: z.string().optional(),
  hasUsaWrestling: zOptionalCheckbox,
  usaWrestlingExpiry: z.string().optional(),
  hasBackgroundCheck: zOptionalCheckbox,
  backgroundCheckDate: z.string().optional(),
  agreesToTerms: zRequiredAgreementCheckbox('Accept the agreement to create your coach account'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type CoachSignupValues = z.infer<typeof coachSignupSchema>;

const STEPS = [
  { title: 'Account', description: 'Create your login' },
  { title: 'Coaching', description: 'Build your business profile' },
  { title: 'Credentials', description: 'Add what you have today' },
] as const;

export default function CoachSignupPage() {
  const router = useRouter();
  const tenant = useTenant();
  const supabase = createClient(tenant.slug);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CoachSignupValues>({
    resolver: zodResolver(coachSignupSchema),
    defaultValues: {
      firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', password: '', confirmPassword: '',
      coachType: 'ncaa_athlete', school: '', weightClass: '', bio: '', hasSafeSport: false,
      safeSportExpiry: '', hasUsaWrestling: false, usaWrestlingExpiry: '', hasBackgroundCheck: false,
      backgroundCheckDate: '', agreesToTerms: false,
    },
    mode: 'onChange',
  });

  const coachType = form.watch('coachType');
  const next = async () => {
    const fields: (keyof CoachSignupValues)[] = step === 1
      ? ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'password', 'confirmPassword']
      : ['coachType', 'school'];
    if (await form.trigger(fields)) setStep((value) => Math.min(3, value + 1));
  };

  const onSubmit = async (values: CoachSignupValues) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/coach-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create your coach account');
      const { error: authError } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
      if (authError) {
        router.push('/login?message=coach_account_created');
        return;
      }
      router.push('/coach-pending?submitted=1');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create your coach account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Run your coaching business</p>
          <h1 className="mt-3 font-serif text-3xl font-black">Create your coach account</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/65">
            Publish availability, fill privates and small groups, message families, track athletes, and share one booking link.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2">
          {STEPS.map((item, index) => {
            const number = index + 1;
            return (
              <div key={item.title} className={`rounded-lg border p-3 ${step >= number ? 'border-accent/60 bg-accent/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center gap-2">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step > number ? 'bg-accent text-black' : 'border border-accent/50 text-accent'}`}>
                    {step > number ? <Check className="h-3.5 w-3.5" /> : number}
                  </span>
                  <span className="text-xs font-semibold sm:text-sm">{item.title}</span>
                </div>
                <p className="mt-1 hidden text-xs text-white/45 sm:block">{item.description}</p>
              </div>
            );
          })}
        </div>

        <Card className="border-accent/25 bg-zinc-950 text-white">
          <CardHeader>
            <CardTitle className="font-serif">{STEPS[step - 1].title}</CardTitle>
            <CardDescription>{STEPS[step - 1].description}. You can finish your profile, rates, locations, payout, and calendar after signup.</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {step === 1 ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Field form={form} name="firstName" label="First name" placeholder="Jordan" />
                      <Field form={form} name="lastName" label="Last name" placeholder="Smith" />
                    </div>
                    <Field form={form} name="email" label="Email" placeholder="you@email.com" type="email" />
                    <Field form={form} name="phone" label="Cell phone" placeholder="(919) 555-1234" type="tel" />
                    <Field form={form} name="dateOfBirth" label="Date of birth" type="date" />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field form={form} name="password" label="Password" type="password" />
                      <Field form={form} name="confirmPassword" label="Confirm password" type="password" />
                    </div>
                  </>
                ) : null}

                {step === 2 ? (
                  <>
                    <FormField control={form.control} name="coachType" render={({ field }) => (
                      <FormItem><FormLabel>Which best describes you?</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="ncaa_athlete">Active college athlete</SelectItem>
                            <SelectItem value="former_college_athlete">Former college athlete</SelectItem>
                            <SelectItem value="club_hs_coach">Club or high school coach</SelectItem>
                          </SelectContent>
                        </Select><FormMessage />
                      </FormItem>
                    )} />
                    <Field form={form} name="school" label={coachType === 'club_hs_coach' ? 'School or club' : 'College or university'} placeholder={coachType === 'club_hs_coach' ? 'Triangle Wrestling Club' : 'NC State'} />
                    <FormField control={form.control} name="weightClass" render={({ field }) => (
                      <FormItem><FormLabel>College weight class (optional)</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select weight" /></SelectTrigger></FormControl>
                          <SelectContent>{['125','133','141','149','157','165','174','184','197','285'].map((weight) => <SelectItem value={weight} key={weight}>{weight} lbs</SelectItem>)}</SelectContent>
                        </Select><FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="bio" render={({ field }) => (
                      <FormItem><FormLabel>Short introduction (optional)</FormLabel><FormControl><Textarea className="min-h-24" placeholder="What do you coach best? Families can see this on your profile." {...field} /></FormControl><FormDescription>You can improve this later from your profile.</FormDescription><FormMessage /></FormItem>
                    )} />
                  </>
                ) : null}

                {step === 3 ? (
                  <>
                    <p className="text-sm text-white/65">Select anything you already have. These are self-reported until the Guild verifies them, and none are required to create your account.</p>
                    <Credential form={form} name="hasSafeSport" dateName="safeSportExpiry" label="SafeSport trained" />
                    <Credential form={form} name="hasUsaWrestling" dateName="usaWrestlingExpiry" label="USA Wrestling coaching credential" />
                    <Credential form={form} name="hasBackgroundCheck" dateName="backgroundCheckDate" label="Current background check" />
                    <div className="rounded-lg border border-accent/25 bg-accent/10 p-4 text-sm text-white/75">
                      Your account is created immediately. The Guild verifies identity and credentials before enabling paid family bookings.
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Independent Contractor Agreement</p>
                      <div className="max-h-56 overflow-y-auto rounded-md border border-white/10 bg-black p-4"><GuildIndependentContractorAgreement /></div>
                      <Link href="/coach-agreement" target="_blank" className="text-xs text-accent underline">Open printable version</Link>
                    </div>
                    <FormField control={form.control} name="agreesToTerms" render={({ field }) => (
                      <FormItem className="flex flex-row items-start gap-3 rounded-md border border-white/10 p-4 space-y-0">
                        <FormControl><Checkbox checked={!!field.value} onCheckedChange={(value) => field.onChange(value === true)} /></FormControl>
                        <div><FormLabel>I accept the Independent Contractor Agreement</FormLabel><FormMessage /></div>
                      </FormItem>
                    )} />
                  </>
                ) : null}

                <div className="flex gap-3 pt-2">
                  {step > 1 ? <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={() => setStep((value) => value - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button> : null}
                  {step < 3 ? <Button type="button" variant="premium" className="min-h-12 flex-1" onClick={() => void next()}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button> : (
                    <Button type="submit" variant="premium" className="min-h-12 flex-1" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create coach account'}</Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
        <p className="mt-5 text-center text-sm text-white/55">Already have an account? <Link href="/login" className="font-semibold text-accent">Log in</Link></p>
      </div>
    </main>
  );
}

type AnyForm = ReturnType<typeof useForm<CoachSignupValues>>;

function Field({ form, name, label, placeholder, type }: {
  form: AnyForm;
  name: keyof CoachSignupValues;
  label: string;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
}) {
  return <FormField control={form.control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><FormControl><Input placeholder={placeholder} type={type} {...field} value={typeof field.value === 'string' ? field.value : ''} /></FormControl><FormMessage /></FormItem>} />;
}

function Credential({ form, name, dateName, label }: { form: AnyForm; name: 'hasSafeSport' | 'hasUsaWrestling' | 'hasBackgroundCheck'; dateName: 'safeSportExpiry' | 'usaWrestlingExpiry' | 'backgroundCheckDate'; label: string }) {
  const enabled = form.watch(name);
  return (
    <div className="rounded-lg border border-white/10 p-4">
      <FormField control={form.control} name={name} render={({ field }) => (
        <FormItem className="flex flex-row items-center gap-3 space-y-0"><FormControl><Checkbox checked={!!field.value} onCheckedChange={(value) => field.onChange(value === true)} /></FormControl><FormLabel>{label}</FormLabel></FormItem>
      )} />
      {enabled ? <div className="mt-3"><Field form={form} name={dateName} label="Expiration or completion date (optional)" type="date" /></div> : null}
    </div>
  );
}
