'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { GuildIndependentContractorAgreement } from '@/components/guild-independent-contractor-agreement';
import { zOptionalCheckbox, zRequiredAgreementCheckbox } from '@/lib/zod-checkbox';

const coachApplicationSchema = z.object({
  // Step 1: Basic Info
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z
    .string()
    .min(1, 'Cell phone is required')
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Enter a valid 10-digit cell number'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  
  // Step 2: Background
  coachType: z.enum(['ncaa_athlete', 'club_hs_coach'], { required_error: 'Please select your coach type' }),
  school: z.string().min(1, 'School or club is required'),
  weightClass: z.string().optional(),
  
  // Step 3: Photo & Bio
  bio: z.string().min(50, 'Bio must be at least 50 characters'),
  
  // Step 4: Safety & Certs (+ optional t-shirt) — attestations optional; never block application (see validateCurrentStep case 4)
  hasSafeSport: zOptionalCheckbox,
  safeSportExpiry: z.string().optional(),
  hasBackgroundCheck: zOptionalCheckbox,
  backgroundCheckDate: z.string().optional(),
  tshirtSize: z.string().optional(),
  
  // Step 5: Payout
  payoutMethod: z.enum(['venmo', 'zelle'], { required_error: 'Please select a payout method' }),
  venmoHandle: z.string().optional(),
  zelleContact: z.string().optional(),
  
  // Step 6: Agreement & Account
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  agreesToTerms: zRequiredAgreementCheckbox('You must accept the Independent Contractor Agreement'),
  agreesToSessionTypes: zRequiredAgreementCheckbox('You must commit to offering all session types'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
}).refine((data) => {
  if (data.payoutMethod === 'venmo' && !data.venmoHandle) return false;
  if (data.payoutMethod === 'zelle' && !data.zelleContact) return false;
  return true;
}, {
  message: 'Please provide your payout contact info',
  path: ['venmoHandle'],
});

type CoachApplicationValues = z.infer<typeof coachApplicationSchema>;

const STEPS = [
  { id: 1, title: 'Basic Info', description: 'Your contact details' },
  { id: 2, title: 'Background', description: 'Wrestling experience' },
  { id: 3, title: 'Profile', description: 'Photo and bio' },
  { id: 4, title: 'Safety', description: 'Certifications' },
  { id: 5, title: 'Payout', description: 'How you get paid' },
  { id: 6, title: 'Agreement', description: 'Terms and account' },
];

export default function CoachApplicationPage() {
  const router = useRouter();
  const tenant = useTenant();
  const supabase = createClient(tenant.slug);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CoachApplicationValues>({
    resolver: zodResolver(coachApplicationSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      coachType: undefined,
      school: '',
      weightClass: '',
      bio: '',
      hasSafeSport: false,
      safeSportExpiry: '',
      hasBackgroundCheck: false,
      backgroundCheckDate: '',
      tshirtSize: '',
      payoutMethod: undefined,
      venmoHandle: '',
      zelleContact: '',
      password: '',
      confirmPassword: '',
      agreesToTerms: false,
      agreesToSessionTypes: false,
    },
    mode: 'onChange',
  });

  const watchPayoutMethod = form.watch('payoutMethod');
  const watchCoachType = form.watch('coachType');

  const validateCurrentStep = async () => {
    let fieldsToValidate: (keyof CoachApplicationValues)[] = [];
    
    switch (currentStep) {
      case 1:
        fieldsToValidate = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth'];
        break;
      case 2:
        fieldsToValidate = ['coachType', 'school'];
        break;
      case 3:
        fieldsToValidate = ['bio'];
        break;
      case 4:
        // Certifications are informational only for this step — do not block Next (Zod used to fail on undefined booleans)
        fieldsToValidate = [];
        break;
      case 5:
        fieldsToValidate = ['payoutMethod'];
        if (watchPayoutMethod === 'venmo') fieldsToValidate.push('venmoHandle');
        if (watchPayoutMethod === 'zelle') fieldsToValidate.push('zelleContact');
        break;
      case 6:
        fieldsToValidate = ['password', 'confirmPassword', 'agreesToTerms', 'agreesToSessionTypes'];
        break;
    }

    if (fieldsToValidate.length === 0) return true;
    return form.trigger(fieldsToValidate);
  };

  const nextStep = async () => {
    const isValid = await validateCurrentStep();
    if (isValid && currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async (values: CoachApplicationValues) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/coach-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Application failed');
        return;
      }

      // Auto-login
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (authError) {
        router.push('/login?message=application_submitted');
        return;
      }

      router.push('/coach-pending');
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    currentStep > step.id
                      ? 'bg-[#D4AF37] text-black'
                      : currentStep === step.id
                      ? 'bg-[#D4AF37] text-black'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`h-0.5 w-8 sm:w-12 mx-1 ${
                      currentStep > step.id ? 'bg-[#D4AF37]' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground">{STEPS[currentStep - 1].title}</h2>
            <p className="text-sm text-muted-foreground">{STEPS[currentStep - 1].description}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Coach Application</CardTitle>
            <CardDescription>
              Complete all steps to submit your application. We review applications within 24-48 hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Step 1: Basic Info */}
                {currentStep === 1 && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Eric" {...field} />
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
                              <Input placeholder="Aponte" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="you@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input type="tel" placeholder="(919) 555-0123" {...field} />
                          </FormControl>
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Step 2: Background */}
                {currentStep === 2 && (
                  <>
                    <FormField
                      control={form.control}
                      name="coachType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>I am an...</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select one" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ncaa_athlete">Active NCAA Athlete</SelectItem>
                              <SelectItem value="club_hs_coach">Club / HS Coach</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="school"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{watchCoachType === 'ncaa_athlete' ? 'School' : 'Club or High School'}</FormLabel>
                          <FormControl>
                            <Input placeholder={watchCoachType === 'ncaa_athlete' ? 'UNC' : 'Triangle Wrestling Club'} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="weightClass"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weight Class (optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select weight class" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {['125', '133', '141', '149', '157', '165', '174', '184', '197', '285'].map((wc) => (
                                <SelectItem key={wc} value={wc}>{wc} lbs</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Step 3: Profile */}
                {currentStep === 3 && (
                  <>
                    <FormField
                      control={form.control}
                      name="bio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bio</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Tell parents about your wrestling background, coaching style, and what makes you a great coach..."
                              className="min-h-[150px]"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Minimum 50 characters. This will be shown on your public profile.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        <strong>Profile Photo:</strong> You can add your photo after your application is approved in your profile settings.
                      </p>
                    </div>
                  </>
                )}

                {/* Step 4: Safety */}
                {currentStep === 4 && (
                  <>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="hasSafeSport"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={(c) => field.onChange(c === true)}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>I have SafeSport Certification</FormLabel>
                              <FormDescription>
                                Optional to submit — you can complete before or after approval. Get certified at{' '}
                                <a href="https://safesport.org" target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] underline">
                                  safesport.org
                                </a>
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      {form.watch('hasSafeSport') && (
                        <FormField
                          control={form.control}
                          name="safeSportExpiry"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>SafeSport Expiration Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="hasBackgroundCheck"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={(c) => field.onChange(c === true)}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>I have a Background Check on file</FormLabel>
                              <FormDescription>
                                Optional to submit — through your school, club, or USA Wrestling
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      {form.watch('hasBackgroundCheck') && (
                        <FormField
                          control={form.control}
                          name="backgroundCheckDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Background Check Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                    <FormField
                      control={form.control}
                      name="tshirtSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>T-Shirt Size (optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select size" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {['S', 'M', 'L', 'XL', '2XL', '3XL'].map((size) => (
                                <SelectItem key={size} value={size}>{size}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>For Guild merchandise and events</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <p className="text-sm text-amber-200">
                        <strong>Note:</strong> You can still apply without these certifications, but you won&apos;t be able to coach until they&apos;re verified. We&apos;ll help you get set up.
                      </p>
                    </div>
                  </>
                )}

                {/* Step 5: Payout */}
                {currentStep === 5 && (
                  <>
                    <FormField
                      control={form.control}
                      name="payoutMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>How would you like to get paid?</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select payout method" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="venmo">Venmo</SelectItem>
                              <SelectItem value="zelle">Zelle</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            We pay coaches weekly on Fridays
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchPayoutMethod === 'venmo' && (
                      <FormField
                        control={form.control}
                        name="venmoHandle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Venmo Handle</FormLabel>
                            <FormControl>
                              <Input placeholder="@yourhandle" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    {watchPayoutMethod === 'zelle' && (
                      <FormField
                        control={form.control}
                        name="zelleContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Zelle Email or Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="you@email.com or (919) 555-0123" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        <strong>Coach Earnings:</strong> Your payout percentage is set for your account and shown after approval. The Guild handles payments, scheduling, and marketing.
                      </p>
                    </div>
                  </>
                )}

                {/* Step 6: Agreement */}
                {currentStep === 6 && (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Independent Contractor Agreement</p>
                      <p className="text-xs text-muted-foreground">
                        Scroll to read the full agreement. Submitting your application records electronic acceptance (Sections
                        11.5 and 12).
                      </p>
                      <div className="rounded-lg border border-border bg-muted/30 p-1">
                        <div className="max-h-[min(50vh,440px)] overflow-y-auto rounded-md bg-background p-4">
                          <GuildIndependentContractorAgreement />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <Link href="/coach-agreement" target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] underline">
                          Open printable version
                        </Link>
                      </p>
                    </div>
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Create Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-4 pt-4">
                      <FormField
                        control={form.control}
                        name="agreesToSessionTypes"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={(c) => field.onChange(c === true)}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>I commit to offering all session types</FormLabel>
                              <FormDescription>
                                Private (1-on-1), Partner (2 athletes), and Small Group (3-6 athletes)
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="agreesToTerms"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={(c) => field.onChange(c === true)}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>I agree to the Independent Contractor Agreement above</FormLabel>
                              <FormDescription>
                                I have read the agreement, am at least 18, and accept all terms including independent contractor
                                status. This check constitutes my electronic signature under Section 11.5.
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </>
                )}

                {/* Navigation Buttons */}
                <div className="flex justify-between pt-6">
                  {currentStep > 1 ? (
                    <Button type="button" variant="outline" onClick={prevStep}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                  ) : (
                    <Link href="/signup/role">
                      <Button type="button" variant="outline">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                    </Link>
                  )}
                  
                  {currentStep < 6 ? (
                    <Button type="button" onClick={nextStep} className="bg-[#D4AF37] hover:bg-[#B8963C] text-black">
                      Next
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button type="submit" disabled={loading} className="bg-[#D4AF37] hover:bg-[#B8963C] text-black">
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Application'
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
