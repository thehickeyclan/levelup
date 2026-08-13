import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BackLink } from '@/components/back-link';

export const metadata = {
  title: 'Privacy Policy | The Guild',
  description: 'How The Guild collects, uses, and protects your information.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Privacy Policy</CardTitle>
          <p className="text-sm text-muted-foreground">Last updated: August 13, 2026</p>
        </CardHeader>
        <CardContent className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p>
            The Guild connects wrestling families with coaches for training and gives the community a
            marketplace for wrestling gear. This policy explains what information we collect, how we
            use it, and the choices you have. It applies to wrestlingguild.com and The Guild iPhone
            app.
          </p>

          <Section title="What we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="text-foreground">Account details</span> — name, email, cell phone,
                home ZIP code, and a password you choose.
              </li>
              <li>
                <span className="text-foreground">Wrestler profiles</span> — your wrestler&apos;s
                name, age, weight class, skill level, graduation year, and photos you choose to add.
                Wrestler profiles are created and managed by a parent or guardian.
              </li>
              <li>
                <span className="text-foreground">Coach applications</span> — date of birth, school
                or club, coaching background, and a payout handle (such as Venmo) used to pay you for
                sessions.
              </li>
              <li>
                <span className="text-foreground">Content you create</span> — messages, session
                photos, marketplace listings and photos, offers, questions, and reviews.
              </li>
              <li>
                <span className="text-foreground">Transactions</span> — bookings, purchases, and
                payouts. Card payments are processed by Stripe; The Guild never sees or stores your
                card number.
              </li>
            </ul>
          </Section>

          <Section title="How we use it">
            <ul className="list-disc pl-5 space-y-1">
              <li>To run the platform: bookings, rosters, messaging, the marketplace, and payouts.</li>
              <li>
                To send alerts you expect — booking confirmations, session changes, messages, and
                marketplace activity — by app notification, email, or text message.
              </li>
              <li>
                To keep the community safe: reviewing reported content, preventing fraud, and
                enforcing our Terms.
              </li>
              <li>
                Marketplace photos you upload may be processed by AI services to identify the shoe,
                assess condition, and suggest pricing. These results are shown to you and never used
                to build advertising profiles.
              </li>
            </ul>
          </Section>

          <Section title="What other members can see">
            <p>
              Coaches and families on the same session can see the session roster (wrestler first and
              last name, age, weight class, skill level). Marketplace listings, seller name, reviews,
              and Q&amp;A are visible to the community. Messages are visible only to the people in the
              conversation and to Guild staff when content is reported.
            </p>
          </Section>

          <Section title="Who we share it with">
            <p>
              We share data only with the service providers that run the platform: Stripe (payments),
              Supabase (secure hosting and database), Twilio (text messages), Expo (app
              notifications), and image/AI processing services for marketplace listings. Each
              receives only what it needs to do its job. We do not sell your information, and we do
              not run third-party advertising or tracking.
            </p>
          </Section>

          <Section title="Children">
            <p>
              Athlete accounts are for wrestlers 13 and older. Younger wrestlers do not have their
              own accounts — their profiles are created and managed by a parent or guardian, and the
              information in them comes from the parent.
            </p>
          </Section>

          <Section title="Deleting your account">
            <p>
              You can delete your account any time in the app (More → Delete account) or by
              contacting us. Your account is locked immediately and personal data is removed within
              30 days. Records of completed transactions that involve other families (orders,
              bookings) are retained as required for their records and ours.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Data is encrypted in transit, stored with a professional cloud provider, and protected
              by row-level access controls so members only see what they are meant to see. No system
              is perfectly secure; if a breach affects your data we will notify you.
            </p>
          </Section>

          <Section title="Changes and contact">
            <p>
              If this policy changes materially, we will update this page and note the date above.
              Questions or requests: message us in the app or email{' '}
              <a className="text-accent hover:underline" href="mailto:info@ncwrestlingunited.com">
                info@ncwrestlingunited.com
              </a>
              .
            </p>
          </Section>

          <p>
            <BackLink fallbackHref="/" label="Back to home" className="text-accent hover:underline" />
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
