import { WAIVER_VERSION } from '@/lib/waiver';

export const metadata = { title: 'Participation Waiver' };

/**
 * Parent-facing participation waiver, linked from the checkbox at every
 * session checkout. TEXT IS A DRAFT, not attorney-reviewed. In North Carolina
 * a parent generally cannot waive a minor's own future negligence claim, so
 * this is built as assumption of risk, informed consent, the parent's own
 * release, and medical authorization — the parts that hold up — rather than
 * pretending to be an ironclad release of the child's claim. Insurance is the
 * real protection; this is the second line.
 */
export default function WaiverPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Waiver, Assumption of Risk &amp; Medical Authorization
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Version {WAIVER_VERSION} · Draft pending legal review
        </p>
      </div>

      <div className="space-y-4 text-sm leading-6 text-foreground/90">
        <p>
          By booking this session, I confirm that I am the parent or legal guardian of the
          athlete named in this booking (&ldquo;Athlete&rdquo;), and I agree to the
          following on behalf of myself and the Athlete:
        </p>

        <h2 className="font-semibold text-foreground">1. The activity</h2>
        <p>
          Wrestling instruction involves physical contact, takedowns, drilling, and live
          wrestling with a coach and, in group sessions, other athletes. Sessions are led
          by the coach identified in this booking, who is an independent coach using The
          Wrestling Guild&apos;s platform for booking, scheduling, and payment — not an
          employee of The Wrestling Guild.
        </p>

        <h2 className="font-semibold text-foreground">2. Inherent risks</h2>
        <p>
          I understand that wrestling carries inherent risks that cannot be eliminated,
          including sprains, fractures, dislocations, skin infections, concussions and
          other head or neck injuries, and in rare cases serious or catastrophic injury. I
          understand that no coach, facility, or platform can guarantee the Athlete&apos;s
          safety.
        </p>

        <h2 className="font-semibold text-foreground">3. Assumption of risk</h2>
        <p>
          I voluntarily accept and assume the inherent risks of the Athlete&apos;s
          participation, and I confirm the Athlete is physically able to participate. I
          will disclose any relevant medical condition, injury, or restriction to the
          coach before the session.
        </p>

        <h2 className="font-semibold text-foreground">4. Release</h2>
        <p>
          To the fullest extent permitted by applicable law, I release The Wrestling
          Guild, Guild Ventures, and their officers and employees from claims arising from
          the Athlete&apos;s participation, except claims arising from gross negligence or
          intentional misconduct. I understand that the law may not permit a parent to
          release a minor&apos;s own claims, and nothing in this document asks me to
          surrender a right the law does not allow me to surrender.
        </p>

        <h2 className="font-semibold text-foreground">5. Medical authorization</h2>
        <p>
          If the Athlete is injured and I cannot be reached, I authorize the coach or
          facility staff to administer basic first aid and, in an emergency, to seek
          emergency medical treatment for the Athlete. I am responsible for the cost of
          medical care not covered by insurance.
        </p>

        <h2 className="font-semibold text-foreground">6. Insurance</h2>
        <p>
          Any liability insurance maintained by The Wrestling Guild or by the coach is
          subject to the policy&apos;s terms, limits, and exclusions, and does not cover
          every incident.
        </p>

        <h2 className="font-semibold text-foreground">7. Conduct</h2>
        <p>
          The Athlete will follow the coach&apos;s instructions and facility rules. The
          coach may end a session for unsafe conduct; sessions ended for cause are not
          refunded.
        </p>

        <h2 className="font-semibold text-foreground">8. Cancellations and packages</h2>
        <p>
          Bookings and prepaid packages are governed by the cancellation and credit terms
          shown at checkout, which form part of this agreement.
        </p>

        <h2 className="font-semibold text-foreground">9. Photos</h2>
        <p>
          Coaches and the platform may photograph or record sessions for coaching review.
          Use of any image of the Athlete in marketing requires my separate consent.
        </p>

        <p>
          By checking the box at checkout, I acknowledge that I have read and agree to
          this document.
        </p>
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        Each acceptance is recorded with its date and this waiver version.
      </p>
    </div>
  );
}
