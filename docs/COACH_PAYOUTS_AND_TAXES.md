# Coach payouts and taxes

How money flows today, how to actually pay coaches, and how taxes work (US).

---

## Recommended workflow (July 2026)

1. **Parent pays** → Guild Stripe → Guild BofA. Wrestlers only join the roster after payment (or $0 confirm).
2. **Coach marks session complete** (default) — admin only for exceptions.
3. Session enters **Ready to pay** when: `status = completed`, at least one `session_participants.paid = true`, and `athlete_payout_date` is null.
4. **Admin pays coach** weekly/biweekly from **Guild** (Zelle, ACH, or Guild Venmo — not personal accounts).
5. **Admin → Mark paid** sets `athlete_payout_date` on those sessions.

Coaches see **Payout pending** on completed, parent-paid sessions until step 5. Stripe Connect is deferred until manual volume is painful (~15+ active coaches or weekly payout admin > ~30 min).

---

## Current flow (parent → platform)

1. Parent books and pays via **Stripe Checkout**.
2. Money lands in **your Stripe account** (platform).
3. Webhook marks the session as `scheduled` and `athlete_paid: true` (today this means “parent paid”; see note below).
4. Coaches see “Awaiting payout” for sessions where they haven’t been paid yet.

So: **you hold the cash**; coaches are not paid automatically.

---

## How to actually pay the coaches

You have two main options.

### Option A: Manual payouts (simplest to start) — **use this now**

- **When:** Weekly or biweekly.
- **How:**  
  1. Admin → **Money → Coach payouts → Ready to pay** — completed sessions where parent paid and coach not yet paid (`athlete_payout_date` is null).  
  2. Pay each coach via **ACH**, **Zelle**, or **Guild Venmo** from the **Guild business account** (BofA), using `athlete_payment` (or estimated share) per session.  
  3. Click **Mark paid** — sets `athlete_payout_date` and records the payout amount on each session.
- **Pros:** No Stripe Connect setup; you control timing.  
- **Cons:** Manual work; coaches share payout details in profile.

Sessions marked complete with only **unpaid** roster holds (`paid = false`, e.g. join approved but never checked out) stay out of the payout queue until resolved.

### Option B: Stripe Connect (automated payouts)

- **Idea:** Each coach has a **Stripe Connect** account (Express or Custom). When a parent pays, you can either:  
  - **Destination charge:** Send a share (e.g. coach’s `athlete_payment`) to the coach’s connected account and keep the rest in your account, or  
  - **Separate charges and transfers:** Charge the parent to your account, then create a **Transfer** to the coach’s connected account (on a schedule or after session completion).
- **Flow:**  
  1. Coach onboarding: coach signs up via Stripe Connect (Express onboarding link or Custom form). You store `stripe_account_id` on `athletes`.  
  2. When creating the Checkout Session (or PaymentIntent), you either use `transfer_data.destination` (destination charge) or charge to your account and later call **Transfers API** to send money to the coach.  
  3. When the transfer is created, set `athlete_paid = true`, `athlete_payout_date = today`, `stripe_payout_id = transfer.id`.
- **Pros:** Automated; coach gets paid to their Stripe balance and can payout to their bank; Stripe handles 1099-K if applicable.  
- **Cons:** More integration work; Stripe fees; coach onboarding and support.

For implementation details, see [Stripe Connect](https://stripe.com/docs/connect) and, if you use transfers, [Transfers API](https://stripe.com/docs/transfers).

---

## Important: two payment events

| Field / signal | Meaning |
|----------------|---------|
| Parent paid / entered | `session_participants.paid = true` after register, cart, or $0 confirm |
| Coach paid | Admin **Mark paid** → `athlete_payout_date` set |

**`athlete_paid` on sessions** is set when the parent checkout completes (legacy name — means “parent paid,” not “coach paid”). **Coach payout queue** uses `status = completed`, parent payment received, and `athlete_payout_date IS NULL`.

For clarity long-term, consider adding `payment_received` and reserving `athlete_paid` for coach payouts only — not required for the manual workflow above.

---

## Taxes (US, high level)

- **Coaches as independent contractors:** If coaches are not employees, they are typically **1099 contractors**. You do **not** withhold income or FICA; they are responsible for their own taxes and self-employment tax.
- **Your obligations:**  
  - **1099-NEC:** If you pay a coach **$600 or more** in a calendar year (for services), you must collect a **W-9** and issue a **1099-NEC** by Jan 31.  
  - **1099-K:** If you use a payment processor (e.g. Stripe), they may issue **1099-K** to coaches (and/or you) if IRS thresholds are met. Stripe’s documentation and dashboard describe when they do this.  
  - **Record-keeping:** Keep records of all payments to coaches (date, amount, session/service) for 1099s and in case of audit.
- **Platform fee / withholding:** If you keep a platform fee, you only pay the coach their share (e.g. `athlete_payment`). You don’t withhold tax from that share unless they’re employees (which is a different setup).
- **CPA:** For your entity structure, sales tax (if any), and exact 1099/W-9 workflow, use a **CPA or tax attorney**; this doc is only an overview.

---

## Practical checklist (manual payouts)

1. **W-9:** Before paying a coach over $600 in a year, collect a **W-9** and store it (secure).  
2. **Admin → Coach payouts → Ready to pay:** Completed sessions with parent payment and no `athlete_payout_date`.  
3. **Pay:** Send from **Guild BofA** via Zelle, ACH, or Guild Venmo.  
4. **Record:** Click **Mark paid** per coach (sets `athlete_payout_date` on each session).  
5. **1099:** At year end, if a coach got ≥ $600, issue **1099-NEC** and file with the IRS (and state if required). Use software or a CPA.

---

## Summary

| Topic | Summary |
|-------|--------|
| **Who holds the money today** | Your Stripe (platform) account after parent pays. |
| **Paying coaches** | Manual (ACH, Venmo, etc.) or Stripe Connect; update `athlete_paid` and `athlete_payout_date` when you pay. |
| **Taxes** | Treat coaches as 1099 contractors; collect W-9, issue 1099-NEC if ≥ $600/year; keep records; get a CPA for your situation. |
| **`athlete_paid`** | Consider using it only for “we paid the coach” and a separate field for “parent paid.” |
