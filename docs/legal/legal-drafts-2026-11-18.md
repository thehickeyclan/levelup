# Guild Training — Legal Drafts (Muse-drafted, no counsel review)
Drafted 2026-11-18 at Matt's direction (no legal budget; Guild revenue ~$150/mo). These are working drafts written to be accurate and plain — they are NOT attorney-reviewed. Honest limits, stated once: in North Carolina a parent generally cannot waive a minor's own future negligence claim, so the waiver below is built as assumption-of-risk, informed consent, the parent's own release, and medical authorization — the documents that do hold up — rather than pretending to be an ironclad release of the child's claim. The insurance policy is the real protection; this paper is the second line. If revenue ever allows one legal spend, an attorney review of Document 1 is the purchase.

---

## Document 1 — Parent Waiver, Assumption of Risk & Medical Authorization
*(Shown at booking checkout; acceptance stored with timestamp. Parent/guardian accepts on behalf of the athlete.)*

**Wrestling Instruction — Waiver, Assumption of Risk, and Consent**

By booking this session, I confirm that I am the parent or legal guardian of the athlete named in this booking ("Athlete"), and I agree to the following on behalf of myself and the Athlete:

**1. The activity.** Wrestling instruction involves physical contact, takedowns, drilling, and live wrestling with a coach and, in group sessions, other athletes. Sessions are led by the coach identified in this booking, who is an independent coach using The Wrestling Guild's platform for booking, scheduling, and payment — not an employee of The Wrestling Guild.

**2. Inherent risks.** I understand that wrestling carries inherent risks that cannot be eliminated, including sprains, fractures, dislocations, skin infections, concussions and other head or neck injuries, and in rare cases serious or catastrophic injury. I understand that no coach, facility, or platform can guarantee the Athlete's safety.

**3. Assumption of risk.** I voluntarily accept and assume the inherent risks of the Athlete's participation, and I confirm the Athlete is physically able to participate. I will disclose any relevant medical condition, injury, or restriction to the coach before the session.

**4. Release.** To the fullest extent permitted by applicable law, I release The Wrestling Guild, Guild Ventures, and their officers and employees from claims arising from the Athlete's participation, except claims arising from gross negligence or intentional misconduct. I understand that the law may not permit a parent to release a minor's own claims, and nothing in this document asks me to surrender a right the law does not allow me to surrender.

**5. Medical authorization.** If the Athlete is injured and I cannot be reached, I authorize the coach or facility staff to administer basic first aid and, in an emergency, to seek emergency medical treatment for the Athlete. I am responsible for the cost of medical care not covered by insurance.

**6. Insurance.** The Wrestling Guild maintains liability insurance for platform-booked sessions. Coverage is subject to the policy's terms, limits, and exclusions, and does not cover every incident. Coaches may carry their own additional coverage.

**7. Conduct.** The Athlete will follow the coach's instructions and facility rules. The coach may end a session for unsafe conduct; sessions ended for cause are not refunded.

**8. Cancellations and packages.** Bookings and prepaid packages are governed by the cancellation and credit terms shown at checkout, which form part of this agreement.

**9. Photos.** Coaches and the platform may photograph or record sessions for coaching review. Use of any image of the Athlete in marketing requires my separate consent.

By checking the box at checkout, I acknowledge that I have read and agree to this document.

---

## Document 2 — Private-Link Lane Terms
*(Parent-facing, shown on /c/ booking pages and in the platform terms.)*

Coaches on The Wrestling Guild are independent instructors, not employees of The Wrestling Guild. A coach's booking page may be shared directly by the coach before the coach has completed platform verification. Pages and profiles marked **Verified** indicate the coach has completed the platform's verification requirements, which include a current USA Wrestling Leader membership (background screening and SafeSport training administered by USA Wrestling). The absence of a Verified badge means the platform has not completed that verification; it is not a statement about the coach's ability or character. The Wrestling Guild provides booking, scheduling, payment processing, and insurance for platform-booked sessions; instruction itself is provided solely by the coach.

---

## Document 3 — Coach Platform Terms (key clauses)
*(Accepted by the coach at signup; supplements the general terms.)*

1. **Independent contractor.** Coach is an independent contractor, sets Coach's own rates, schedule, curriculum, and clientele, and is solely responsible for Coach's instruction and conduct during sessions.
2. **Platform fee.** The Wrestling Guild charges a flat 15% of the session or package price, deducted before payout. The remaining 85% is paid to Coach through Stripe Connect once the session is marked complete. Coach is responsible for Coach's own taxes; Stripe issues applicable tax forms.
3. **On-platform bookings.** Bookings that originate through the platform — including Coach's booking link, packages, and repeat bookings by platform clients — are processed through the platform. Directing platform clients to pay off-platform for platform-originated bookings is grounds for removal.
4. **Conduct standards.** Coach will follow USA Wrestling SafeSport principles for all sessions with minors: no session communications or meetings outside the platform's booking structure that are not visible to the parent, no physical contact beyond what instruction requires, and immediate reporting of any injury to the parent and through the app.
5. **Verification.** Directory and map listing requires a current USA Wrestling Leader membership and any additional verification the platform requires. Loss or lapse of that membership suspends directory listing automatically.
6. **Insurance.** Coach will cooperate with the platform's insurance program, including completing any required roster or session records, and understands coverage applies only to sessions booked and recorded through the platform.
7. **Removal.** The Wrestling Guild may suspend or remove any coach at its discretion, including following a parent complaint or a safety concern, pending review.

---

## Deployment notes (added on commit, 18 Nov 2026)

Document 1 is live at /waiver (version 2026-11-18b-draft) with one change:
§6 rewritten — the platform does not yet hold a liability policy (quotes
requested 18 Nov, not bound), so the live text says "any liability insurance
maintained…" instead of claiming coverage exists. Restore Muse's wording when
the policy binds.

Documents 2 and 3 are NOT live anywhere. Before they ship, two claims must
become true or be amended: Doc 3 §2 says payout is "through Stripe Connect"
(today coaches are paid same-day by Venmo; Connect is built but dark), and
Doc 2 / Doc 3 §5 make the Verified badge and directory listing depend on a
current USA Wrestling Leader membership, which is not enforced in code yet
and is Matt's call.
