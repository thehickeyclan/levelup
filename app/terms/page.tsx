import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BackLink } from '@/components/back-link';

export const metadata = {
  title: 'Terms of Service | The Guild',
  description: 'The rules for using The Guild — training, messaging, and Guild Market.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Terms of Service</CardTitle>
          <p className="text-sm text-muted-foreground">Last updated: August 13, 2026</p>
        </CardHeader>
        <CardContent className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p>
            These terms are an agreement between you and The Guild covering wrestlingguild.com and
            The Guild iPhone app. By creating an account or using the platform you agree to them.
          </p>

          <Section title="Accounts and eligibility">
            <ul className="list-disc pl-5 space-y-1">
              <li>Parent, coach, and athlete accounts are available. Athlete accounts require the wrestler to be 13 or older; younger wrestlers are added and managed from a parent account.</li>
              <li>You are responsible for your account and for keeping your password private.</li>
              <li>Coach accounts require an application and Guild approval before coach tools unlock.</li>
            </ul>
          </Section>

          <Section title="Training sessions">
            <ul className="list-disc pl-5 space-y-1">
              <li>Coaches offer small groups, privates, and partner sessions. Booking and payment happen through the platform; payments are processed by Stripe.</li>
              <li>Each session shows its price, time, location, and roster before you book. Cancellation and refund handling are shown at booking or arranged through the coach and Guild staff.</li>
              <li>The Guild connects families and coaches — coaches are independent and responsible for the sessions they run.</li>
            </ul>
          </Section>

          <Section title="Guild Market">
            <ul className="list-disc pl-5 space-y-1">
              <li>The marketplace lets members buy, sell, and trade wrestling gear with each other. The Guild is the platform, not the seller.</li>
              <li>Sellers are responsible for accurate listings and photos, and for shipping promptly (within 3 days of a sale) with tracking.</li>
              <li>Buyers pay through Stripe at checkout. The Guild holds the payment and sends the seller their payout — the sale price minus the posted platform fee — after the buyer confirms delivery.</li>
              <li>Trades carry a small posted fee per side once both parties accept, and shipping for trades is arranged directly between the traders.</li>
              <li>AI-generated condition reads, value estimates, and descriptions are estimates to help you list and shop — inspect photos and ask questions before you buy.</li>
              <li>Problems with an order should be reported from the order screen; Guild staff review disputes and may refund, cancel, or take other action.</li>
            </ul>
          </Section>

          <Section title="Community rules">
            <ul className="list-disc pl-5 space-y-1">
              <li>No harassment, hate, explicit content, scams, or off-topic solicitation — in messages, listings, photos, reviews, or anywhere else on the platform.</li>
              <li>Every conversation and listing can be reported in the app. Guild staff review reports within 24 hours and remove content or suspend accounts that break these rules.</li>
              <li>You can block a conversation at any time from the conversation screen.</li>
            </ul>
          </Section>

          <Section title="Content you post">
            <p>
              You own what you post. By posting it you give The Guild permission to display it on the
              platform so the service works (rosters, listings, messages, reviews). We may remove
              content that violates these terms.
            </p>
          </Section>

          <Section title="Disclaimers and liability">
            <p>
              The platform is provided as-is. To the fullest extent allowed by law, The Guild is not
              liable for indirect damages, for the conduct of members, or for items sold between
              members beyond the marketplace protections described above. Nothing in these terms
              limits liability that cannot be limited by law.
            </p>
          </Section>

          <Section title="Changes, termination, and contact">
            <p>
              We may update these terms and will note the date above; continued use means acceptance.
              We may suspend accounts that violate these terms. You can delete your account any time
              in the app. These terms are governed by North Carolina law. Questions: message us in
              the app or email{' '}
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
