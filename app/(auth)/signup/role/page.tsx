'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, GraduationCap } from 'lucide-react';
import Link from 'next/link';

export default function RoleSelectionPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-screen">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Join The Guild</h1>
        <p className="text-muted-foreground">How will you be using The Guild?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        {/* Parent Card */}
        <button
          onClick={() => router.push('/signup?role=parent')}
          className="text-left"
        >
          <Card className="h-full cursor-pointer transition-all hover:border-accent hover:shadow-lg group">
            <CardHeader className="pb-3">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-3 group-hover:bg-accent/20 transition-colors">
                <Users className="h-6 w-6 text-accent" />
              </div>
              <CardTitle className="text-xl font-serif">I&apos;m a Parent</CardTitle>
              <CardDescription>
                Book training sessions for my wrestler
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Browse and book with elite coaches</li>
                <li>- Manage your wrestler&apos;s schedule</li>
                <li>- Track progress and sessions</li>
              </ul>
            </CardContent>
          </Card>
        </button>

        {/* Coach Card */}
        <button
          onClick={() => router.push('/coaches')}
          className="text-left"
        >
          <Card className="h-full cursor-pointer transition-all hover:border-accent hover:shadow-lg group">
            <CardHeader className="pb-3">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-3 group-hover:bg-accent/20 transition-colors">
                <GraduationCap className="h-6 w-6 text-accent" />
              </div>
              <CardTitle className="text-xl font-serif">I&apos;m a Coach</CardTitle>
              <CardDescription>
                Share my expertise and earn money
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Set your own schedule and rates</li>
                <li>- Offer private and group sessions</li>
                <li>- Get paid weekly via Venmo/Zelle</li>
              </ul>
            </CardContent>
          </Card>
        </button>
      </div>

      <div className="mt-8 text-center text-sm">
        <p className="text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
