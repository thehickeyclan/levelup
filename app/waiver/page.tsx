import { WAIVER_VERSION } from '@/lib/waiver';

export const metadata = { title: 'Participation Waiver' };

/**
 * Parent-facing participation waiver, linked from the checkbox at every
 * session checkout. TEXT IS A DRAFT pending attorney review — the structure
 * (assumption of risk, release, medical authorization) is standard for youth
 * sports, but enforceability language for minors is state-specific and must
 * come from counsel before promotion beyond the launch circle.
 */
export default function WaiverPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Participation Waiver</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Version {WAIVER_VERSION} · Draft pending legal review
        </p>
      </div>

      <div className="space-y-4 text-sm leading-6 text-foreground/90">
        <p>
          By checking the waiver box at booking, I, the parent or legal guardian of the
          participating athlete, agree to the following for each session booked:
        </p>

        <h2 className="font-semibold text-foreground">Assumption of risk</h2>
        <p>
          Wrestling is a contact sport. I understand that participation carries risk of
          injury, including serious injury, concussion, and in rare cases permanent
          disability. I voluntarily allow my athlete to participate with full knowledge of
          these risks.
        </p>

        <h2 className="font-semibold text-foreground">Release</h2>
        <p>
          To the fullest extent permitted by law, I release the platform, the coach
          conducting the session, and the hosting facility from claims arising out of
          ordinary risks inherent in wrestling instruction. This release does not extend
          to conduct the law does not allow to be released.
        </p>

        <h2 className="font-semibold text-foreground">Medical authorization</h2>
        <p>
          If my athlete is injured and I cannot be reached, I authorize the coach to seek
          emergency medical treatment on my athlete&apos;s behalf, at my expense.
        </p>

        <h2 className="font-semibold text-foreground">Fitness to participate</h2>
        <p>
          I confirm my athlete has no medical condition that makes participation unsafe,
          and I will inform the coach of any relevant condition or injury before the
          session.
        </p>
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        Each acceptance is recorded with its date and this waiver version.
      </p>
    </div>
  );
}
