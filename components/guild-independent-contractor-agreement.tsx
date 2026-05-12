/**
 * Source of truth for The Guild Independent Contractor Agreement shown at coach signup
 * and on /coach-agreement. Update both surfaces together when terms change.
 */
export function GuildIndependentContractorAgreement() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-foreground">
      <header className="space-y-2 border-b border-border pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The Guild</p>
        <h1 className="text-lg font-semibold tracking-tight">Independent Contractor Agreement</h1>
        <p className="text-sm font-medium text-amber-700 dark:text-amber-500">
          IMPORTANT: This is a legal document. Please read it carefully before signing.
        </p>
      </header>

      <p className="text-muted-foreground">
        This Independent Contractor Agreement (&quot;Agreement&quot;) is entered into as of the date of electronic acceptance
        (&quot;Effective Date&quot;) between The Guild, LLC (&quot;Company&quot;), a limited liability company operating The Guild
        wrestling coaching platform and related services, and Coach (&quot;Contractor&quot;), the individual who has applied to and
        been approved to provide coaching services through The Guild platform.
      </p>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">1. INDEPENDENT CONTRACTOR STATUS</h2>
        <div className="space-y-2 pl-0">
          <h3 className="font-medium">1.1 Nature of Relationship</h3>
          <p>
            Contractor is an independent contractor and not an employee, partner, agent, or joint venturer of the Company.
            Nothing in this Agreement shall be construed to create an employment relationship between Contractor and the
            Company.
          </p>
          <h3 className="font-medium">1.2 No Employee Benefits</h3>
          <p>
            Contractor is not entitled to and shall not receive any employee benefits including but not limited to health
            insurance, retirement benefits, workers&apos; compensation, unemployment insurance, paid time off, or any other
            benefits provided to Company employees.
          </p>
          <h3 className="font-medium">1.3 Tax Responsibility</h3>
          <p>
            Contractor is solely responsible for all federal, state, and local taxes on compensation received under this
            Agreement. The Company will issue a Form 1099 to Contractor for any calendar year in which Contractor earns $600
            or more through the platform. Contractor agrees to provide a valid Form W-9 upon request.
          </p>
          <h3 className="font-medium">1.4 Control</h3>
          <p>
            Contractor retains the right to control the manner and means by which coaching services are performed, subject
            to the platform standards and playbook outlined in this Agreement. The Company does not direct the specific
            methods by which Contractor teaches.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">2. SERVICES</h2>
        <div className="space-y-2">
          <h3 className="font-medium">2.1 Coaching Services</h3>
          <p>
            Contractor agrees to provide wrestling technique instruction to youth athletes (&quot;Athletes&quot;) and their
            parents/guardians (&quot;Clients&quot;) through The Guild platform in the following session formats:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Private Session — 1 Coach : 1 Athlete</li>
            <li>Partner Session — 1 Coach : 2 Athletes</li>
            <li>Small Group Session — 1 Coach : up to 6 Athletes</li>
          </ul>
          <p>
            Contractor agrees to offer all three session types through the platform. Contractor may set their own pricing for
            each session type, subject to platform minimums as communicated by the Company from time to time.
          </p>
          <h3 className="font-medium">2.2 Session Standards</h3>
          <p>Contractor agrees to maintain the following standards for every session:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Arrive at the facility before athletes and be fully set up prior to the session start time</li>
            <li>Communicate with athletes and parents/guardians before and after each session</li>
            <li>
              Send a session reminder and agenda to the athlete and parent/guardian no less than 24 hours before each session
            </li>
            <li>
              Provide a post-session follow-up to the athlete and parent/guardian including a recap of what was covered and
              specific homework assignments
            </li>
            <li>Conduct all sessions in a safe, professional, and athlete-centered manner</li>
            <li>Adhere to The Guild Coach Playbook as updated by the Company from time to time</li>
          </ul>
          <h3 className="font-medium">2.3 Minimum Commitment</h3>
          <p>
            Contractor agrees to conduct a minimum of 10 sessions within any rolling 6-month period during the term of this
            Agreement. Failure to meet this minimum may result in suspension or termination of Contractor&apos;s account.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">3. PLATFORM FEE AND COMPENSATION</h2>
        <div className="space-y-2">
          <h3 className="font-medium">3.1 Platform Fee</h3>
          <p>
            The Company retains a percentage of gross session revenue as a platform fee in exchange for providing the
            platform, payment processing, client acquisition, marketing, and administrative services.
          </p>
          <h3 className="font-medium">3.2 Contractor Payout Rate</h3>
          <p>
            Contractor&apos;s payout rate is a percentage of gross session revenue, determined by the Company and assigned to
            Contractor individually. Rates may differ from other coaches. Contractor&apos;s applicable rate is communicated at
            onboarding and shown in their account settings. The payout rate is locked and cannot be modified by the Contractor.
          </p>
          <h3 className="font-medium">3.3 Payment Method</h3>
          <p>
            The Company will pay Contractor via Venmo or Zelle as specified in Contractor&apos;s account settings within 48
            hours of a session being marked complete by the Company administrator.
          </p>
          <h3 className="font-medium">3.4 Price Setting</h3>
          <p>
            Contractor may set their own price for each session they create, subject to any platform minimums established by
            the Company. The platform fee percentage is applied to whatever price Contractor sets. The Company provides
            suggested pricing as a reference only.
          </p>
          <h3 className="font-medium">3.5 No Guaranteed Income</h3>
          <p>
            The Company makes no guarantee of minimum earnings, minimum session bookings, or any specific level of income.
            Contractor&apos;s earnings depend entirely on client demand, session pricing, and Contractor&apos;s own performance.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">4. NON-CIRCUMVENTION AND NON-SOLICITATION</h2>
        <div className="space-y-2">
          <h3 className="font-medium">4.1 Platform Relationships</h3>
          <p>
            Contractor acknowledges that The Guild platform creates and facilitates relationships between Contractor and
            Clients. The Company invests significant resources in client acquisition, marketing, platform development, and
            reputation management to generate these relationships on Contractor&apos;s behalf.
          </p>
          <h3 className="font-medium">4.2 Non-Circumvention</h3>
          <p>
            Contractor agrees that any Client relationship that originated through The Guild platform — including but not
            limited to any Client who discovered Contractor via The Guild website, browse page, coach profile, shared session
            link, referral, social media promotion by The Guild, or any other The Guild marketing channel — shall be
            considered a Guild-Originated Relationship.
          </p>
          <p>
            Contractor agrees that for a period of 24 months following the date of the last session conducted between
            Contractor and any Client through The Guild platform, Contractor shall not:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Conduct private coaching sessions with that Client outside of The Guild platform</li>
            <li>Accept direct payment from that Client for coaching services that bypass the platform</li>
            <li>Solicit that Client to move their coaching relationship off The Guild platform</li>
            <li>Direct that Client to book sessions through any competing platform or directly with Contractor</li>
          </ul>
          <h3 className="font-medium">4.3 Non-Solicitation</h3>
          <p>Contractor shall not directly or indirectly solicit, encourage, or induce any Client to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Terminate or reduce their use of The Guild platform</li>
            <li>Book coaching sessions with Contractor outside of The Guild platform</li>
            <li>Share The Guild&apos;s Client database or contact information with any third party or competing service</li>
          </ul>
          <h3 className="font-medium">4.4 Existing Relationships — Carve-Out</h3>
          <p>Contractor acknowledges that this Agreement shall not apply to Client relationships that existed prior to Contractor joining The Guild platform, provided that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Such pre-existing relationships are disclosed to the Company at the time of onboarding by submitting a list of
              existing clients
            </li>
            <li>The Company has approved the carve-out in writing prior to the Effective Date</li>
            <li>
              Any undisclosed pre-existing relationship discovered after onboarding will be treated as a Guild-Originated
              Relationship
            </li>
          </ul>
          <h3 className="font-medium">4.5 Remedy for Violation</h3>
          <p>
            In the event Contractor conducts sessions with a Guild-Originated Client outside of The Guild platform in
            violation of this Section, Contractor agrees that the Company is entitled to recover:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Amounts the Company would have been entitled to under Contractor&apos;s applicable fee structure, applied to the
              estimated gross value of all sessions conducted outside the platform with that Client
            </li>
            <li>Reasonable attorneys&apos; fees and costs incurred in enforcing this Agreement</li>
            <li>Any other damages the Company can demonstrate resulted from the violation</li>
          </ul>
          <h3 className="font-medium">4.6 Acknowledgment</h3>
          <p>
            Contractor acknowledges that the restrictions in this Section are reasonable, necessary to protect the Company&apos;s
            legitimate business interests, and will not cause undue hardship to Contractor.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">5. SAFETY CERTIFICATIONS</h2>
        <div className="space-y-2">
          <h3 className="font-medium">5.1 SafeSport Certification</h3>
          <p>
            Contractor represents and warrants that they are currently certified under the U.S. Center for SafeSport training
            program and that such certification is valid and not expired. Contractor agrees to maintain active SafeSport
            certification at all times during the term of this Agreement and to provide updated certification upon request.
          </p>
          <h3 className="font-medium">5.2 Background Check</h3>
          <p>
            Contractor represents and warrants that they have a current valid background check on file and that no
            disqualifying events have occurred since the date of that background check. Contractor consents to the Company
            verifying their background check status at any time.
          </p>
          <h3 className="font-medium">5.3 Verification</h3>
          <p>
            The Company reserves the right to verify Contractor&apos;s SafeSport and background check status at any time.
            Failure to maintain valid certifications or providing false certification information is grounds for immediate
            termination of this Agreement.
          </p>
          <h3 className="font-medium">5.4 Reporting Obligation</h3>
          <p>
            Contractor agrees to immediately notify the Company of any SafeSport violation, criminal charge, or disqualifying
            event that occurs during the term of this Agreement.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">6. LIABILITY AND INSURANCE</h2>
        <div className="space-y-2">
          <h3 className="font-medium">6.1 Assumption of Risk</h3>
          <p>
            Contractor acknowledges that wrestling instruction involves physical activity and inherent risk of injury.
            Contractor assumes full responsibility for conducting sessions safely and within the bounds of their coaching
            competency.
          </p>
          <h3 className="font-medium">6.2 Company Not Liable</h3>
          <p>
            The Company shall not be liable for any injury, damage, loss, or claim arising out of or related to coaching
            sessions conducted by Contractor, including but not limited to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Physical injury to athletes or other participants during sessions</li>
            <li>Property damage at training facilities</li>
            <li>Claims arising from Contractor&apos;s coaching methods or instructions</li>
            <li>Any third-party claims related to Contractor&apos;s services</li>
          </ul>
          <h3 className="font-medium">6.3 Indemnification</h3>
          <p>
            Contractor agrees to indemnify, defend, and hold harmless the Company, its officers, directors, employees, and
            agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable
            attorneys&apos; fees) arising out of or related to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Contractor&apos;s performance of services under this Agreement</li>
            <li>Contractor&apos;s breach of any representation, warranty, or obligation in this Agreement</li>
            <li>Any negligent or wrongful act or omission by Contractor</li>
          </ul>
          <h3 className="font-medium">6.4 Insurance</h3>
          <p>
            Contractor is encouraged to maintain personal liability insurance appropriate for athletic instruction. The
            Company does not provide insurance coverage for Contractor&apos;s activities.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">7. INTELLECTUAL PROPERTY AND LIKENESS</h2>
        <div className="space-y-2">
          <h3 className="font-medium">7.1 Content Rights</h3>
          <p>
            Contractor grants the Company a non-exclusive, royalty-free, perpetual license to use Contractor&apos;s name, photo,
            biographical information, credentials, and any content posted to their Guild profile for marketing, promotional,
            and operational purposes including but not limited to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>The Guild website and platform</li>
            <li>Social media channels</li>
            <li>Marketing materials and advertising</li>
            <li>Press releases and media inquiries</li>
          </ul>
          <h3 className="font-medium">7.2 Reviews and Testimonials</h3>
          <p>
            Contractor acknowledges that Client reviews posted on The Guild platform are the property of the Company and may
            be displayed publicly, used in marketing materials, and retained by the Company indefinitely including after
            termination of this Agreement.
          </p>
          <h3 className="font-medium">7.3 Session Content</h3>
          <p>
            Any curricula, training materials, or methods Contractor develops independently outside of The Guild platform
            remain the intellectual property of Contractor. Session-specific content created for Guild sessions may be
            referenced by the Company for promotional purposes.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">8. CONFIDENTIALITY</h2>
        <div className="space-y-2">
          <h3 className="font-medium">8.1 Client Information</h3>
          <p>
            Contractor agrees to keep all Client information (including but not limited to names, contact information, athlete
            information, and payment details) strictly confidential and to use such information solely for the purpose of
            providing coaching services through The Guild platform.
          </p>
          <h3 className="font-medium">8.2 Platform Information</h3>
          <p>
            Contractor agrees not to disclose The Guild&apos;s proprietary business information including platform fee
            structures (other than their own rate), Client lists, business strategies, or technical systems to any third party.
          </p>
          <h3 className="font-medium">8.3 Survival</h3>
          <p>This confidentiality obligation survives termination of this Agreement indefinitely.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">9. TERM AND TERMINATION</h2>
        <div className="space-y-2">
          <h3 className="font-medium">9.1 Term</h3>
          <p>This Agreement begins on the Effective Date and continues until terminated by either party.</p>
          <h3 className="font-medium">9.2 Termination by Contractor</h3>
          <p>
            Contractor may terminate this Agreement at any time with 30 days written notice to the Company. Contractor is
            responsible for honoring all sessions booked prior to the termination date.
          </p>
          <h3 className="font-medium">9.3 Termination by Company</h3>
          <p>The Company may terminate this Agreement:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Immediately and without notice for violation of the Non-Circumvention clause (Section 4), SafeSport or
              background check misrepresentation (Section 5), or any conduct that endangers the safety of athletes
            </li>
            <li>With 14 days notice for failure to meet session minimums (Section 2.3)</li>
            <li>With 14 days notice for repeated failure to follow platform standards (Section 2.2)</li>
            <li>At any time with 30 days notice without cause</li>
          </ul>
          <h3 className="font-medium">9.4 Effect of Termination</h3>
          <p>Upon termination:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Contractor&apos;s platform access is suspended</li>
            <li>All pending session payouts for completed sessions will be paid within 7 days</li>
            <li>The non-circumvention obligations in Section 4 survive termination for the full 24-month period</li>
            <li>The confidentiality obligations in Section 8 survive termination indefinitely</li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">10. DISPUTE RESOLUTION</h2>
        <div className="space-y-2">
          <h3 className="font-medium">10.1 Governing Law</h3>
          <p>
            This Agreement shall be governed by the laws of the State of North Carolina without regard to its conflict of
            law provisions.
          </p>
          <h3 className="font-medium">10.2 Informal Resolution</h3>
          <p>
            Before initiating any formal legal proceeding, the parties agree to attempt to resolve any dispute informally by
            written notice to the other party describing the dispute and proposed resolution. The parties will have 30 days to
            resolve the dispute informally.
          </p>
          <h3 className="font-medium">10.3 Arbitration</h3>
          <p>
            Any dispute not resolved informally shall be submitted to binding arbitration in Wake County, North Carolina under
            the rules of the American Arbitration Association. The decision of the arbitrator shall be final and binding.
          </p>
          <h3 className="font-medium">10.4 Attorneys&apos; Fees</h3>
          <p>
            In any dispute arising from a violation of Section 4 (Non-Circumvention), the prevailing party shall be entitled to
            recover reasonable attorneys&apos; fees and costs.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">11. GENERAL PROVISIONS</h2>
        <div className="space-y-2">
          <h3 className="font-medium">11.1 Entire Agreement</h3>
          <p>
            This Agreement constitutes the entire agreement between the parties with respect to its subject matter and
            supersedes all prior agreements, representations, and understandings.
          </p>
          <h3 className="font-medium">11.2 Amendment</h3>
          <p>
            The Company reserves the right to update this Agreement with 30 days written notice to Contractor. Continued use of
            the platform after the notice period constitutes acceptance of the updated Agreement.
          </p>
          <h3 className="font-medium">11.3 Severability</h3>
          <p>
            If any provision of this Agreement is found to be unenforceable, the remaining provisions shall remain in full
            force and effect.
          </p>
          <h3 className="font-medium">11.4 No Waiver</h3>
          <p>
            Failure by either party to enforce any provision of this Agreement shall not constitute a waiver of that
            party&apos;s right to enforce it in the future.
          </p>
          <h3 className="font-medium">11.5 Electronic Acceptance</h3>
          <p>
            Contractor agrees that clicking &quot;I Agree&quot; or &quot;Submit Application&quot; on The Guild platform constitutes a valid
            electronic signature and acceptance of all terms of this Agreement, with the same legal effect as a handwritten
            signature.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">12. ACKNOWLEDGMENT</h2>
        <p>By electronically accepting this Agreement, Contractor confirms that:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>They have read and understand this Agreement in its entirety</li>
          <li>They agree to be bound by all terms and conditions</li>
          <li>They are at least 18 years of age and legally capable of entering into this Agreement</li>
          <li>All information provided during the application process is truthful and accurate</li>
          <li>They understand their status as an independent contractor and not an employee</li>
        </ul>
        <p className="text-muted-foreground pt-2">
          Accepted electronically by Contractor on: [Date of electronic acceptance]
          <br />
          Contractor Name: [Full name as entered during registration]
          <br />
          Contractor Email: [Email as entered during registration]
        </p>
      </section>
    </article>
  );
}
