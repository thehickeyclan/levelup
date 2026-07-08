# The Guild — Product Vision

**Constitution for product and engineering decisions.**

Read this before proposing or building features. When in doubt, choose the path that helps **wrestling coaches run their business on Guild today** and **scales to every independent coach in every sport tomorrow** — without redesigning the platform.

---

## Company mission

**Empower every athlete to reach their full potential through great coaching and community.**

Inspirational. External. Why we exist.

---

## Product north star

**Every independent coach should run their coaching business on Guild.**

Measurable. Internal. What we optimize the product to achieve.

Guild is not a wrestling lesson marketplace. Guild is the **operating system for independent athletic coaching**.

- **Today:** Wrestling is the beachhead — marketing, coach supply, parent demand, and Guild Market categories stay **wrestling-specific**.
- **Tomorrow:** The same architecture extends nationally and across sports. We build **abstractions in code**, not generic marketing, until we expand.

**Wrestling-specific marketing and defaults; sport-agnostic schema.**

---

## Default tool

Guild should become the **default tool coaches use before every lesson**:

1. Open Guild  
2. Check calendar  
3. See athlete  
4. Run session  
5. Get paid  

Not “marketplace.” Not “social.” **Default tool.**

---

## The one sentence that changes priorities

**Guild succeeds when coaches open Guild every week — not when parents occasionally book a lesson.**

---

## How value compounds

Coach success creates parent trust.  
Parent trust creates bookings.  
Bookings create community.  
Community creates defensibility.

---

## Product flywheel

Every feature should accelerate at least one arrow:

```
Great coaches
      ↓
More parent trust
      ↓
More bookings
      ↓
More coach earnings
      ↓
More great coaches
      ↓
More community activity
      ↓
More marketplace liquidity
      ↓
More daily usage
```

Completed sessions also feed the loop: **session → review / workspace → repeat booking**.

---

## Network effects

Every new coach should increase value for parents.  
Every new parent should increase value for coaches.  
Every completed session should increase trust.  
Every review should improve discovery.  
Every marketplace transaction should increase community engagement.  
Every new feature should strengthen **at least one** network effect.

Optimize for long-term network effects over short-term convenience when the tradeoff is real.

---

## Core platform pillars (priority order)

### 1. Intelligent Coach Platform

**AI is not pillar two. AI is how the coach OS wins.**

Guild replaces every tool coaches currently use — and **automates the admin** inside those workflows:

- texting parents → messaging + AI-drafted follow-ups
- Venmo / informal payments → checkout + weekly payouts
- scheduling through Instagram or DMs → calendar + AI slot suggestions
- Google Calendar, spreadsheets, paper waivers, manual reminders → one default tool

**Core functionality (target state):**

- coach profiles and verification
- availability and calendar
- private, partner, and small-group sessions
- recurring sessions
- payments at checkout and coach payouts
- reviews and reputation
- messaging and notifications
- cancellations and policies
- coach CRM and parent management
- analytics

**AI principles (non-negotiable):**

- AI should **remove work**, not create conversations.
- **Never** force coaches to “chat with AI” as the primary interface.
- Intelligence appears as **suggestions, defaults, and automation** — coach approves and can override.
- If a feature could be manual or AI-assisted, **design for AI-assisted**.

**AI review checklist** — before shipping any AI feature, all four must be **yes**:

- Does it **remove a step** the coach currently does manually?
- Does the coach **see it without being asked** to initiate it?
- Can the coach **override or dismiss** it in one tap?
- Does it use **real Guild data**, not generic suggestions?

**Near-term intelligence (wrestling beachhead):**

- recommend pricing and rate-card defaults
- fill open schedule slots (partner / small-group suggestions)
- suggest recurring sessions for repeat athletes
- draft parent follow-ups and session summaries
- predict cancellations and no-shows
- surface athletes who should rebook
- reduce admin in onboarding, payouts, and calendar management

**Architecture:** Sport-agnostic **coach workflows**; train and tune on **wrestling data first**.

Guild Market listing AI (condition, pricing hints, descriptions) follows the **same pattern** — quiet assistance inside a workflow — but coach OS intelligence is **higher priority** than market intelligence.

Related docs: `docs/COACH_RATE_CARD_AND_SESSIONS.md`, `docs/COACH_PAYOUTS_AND_TAXES.md`, `docs/SIMPLICITY_AND_COACH_SCOPE_REVIEW.md`

---

### 2. Community

Guild becomes the **daily operating system for the wrestling community** — athletes, parents, coaches, clubs, and eventually events and camps — **inside one product**.

Examples of the loop:

- A coach opens private sessions.
- A parent books and pays.
- Coach and family collaborate in workspace between sessions.
- A wrestler sells shoes on Guild Market.
- A club promotes a camp.

Community creates marketplace liquidity. Marketplace does not create community from zero.

Related docs: `docs/COMMUNITY_VISION.md`, `docs/WORKSPACE_AND_COLLABORATION.md`, `docs/MESSAGING_AND_HUBS_VISION.md`

---

### 3. Guild Market

**Guild Market** is buy / sell / trade — an extension of the Guild community, **not** a separate business.

- **Near term:** Wrestling equipment — shoes, singlets, headgear, apparel, collectibles.
- **Long term:** Sport-agnostic product categories; wrestling is the first catalog, not the only data model.

**Target capabilities (phased):** fixed price, offers, local pickup, shipping, seller ratings, saved searches — auctions only after liquidity is proven.

Market is **live and valuable** but **lower priority than the Intelligent Coach Platform and community depth** for engineering attention.

---

## Current state (July 2026)

**Honest snapshot** — update this section when the product materially changes.

We have built a **credible wrestling booking and payout platform**, not yet the **weekly default-tool coach OS** this document describes.

| Area | Shipped | Gap vs vision |
|------|---------|----------------|
| **Intelligent Coach Platform** | Profiles, approval, rate card, availability, session create/edit, book → pay → payout → review, earnings dashboard, schedule, roster, playbook, leaderboard | Coach usage is still **booking-event driven** (post session, create slots, respond to bookings) — not yet **weekly habit**. Schedule and “growth” are split across surfaces. Roster still supports **weekly SMS blasts** outside Guild — a signal the OS isn’t fully default. **No coach-facing AI** yet (pricing, schedule fill, rebook nudges, follow-ups). |
| **Community** | Workspaces, messaging, guild threads — infrastructure exists | Not yet the **daily operating system** for most coaches and families. |
| **Guild Market** | Live buy / sell / trade; **seller-side AI** (photos → condition, pricing, description) | Ahead of coach OS on AI — useful proof of “quiet automation,” but **priority inversion** vs pillar #1. |

**What this means for prioritization:**

1. Unify **one coach home** (schedule + earnings + roster + next actions) — not dashboard vs schedule as separate mental models.  
2. Ship **first coach OS intelligence** in a real workflow (e.g. open-slot suggestions or rebook nudges) — not a standalone chatbot.  
3. Track **weekly active coaches** as a headline metric alongside bookings per coach.  
4. Deepen community **after** coaches open Guild weekly, not before.

**North star honesty:** Parent bookings and live GMV are real; **coach weekly retention** is the flywheel we are still building toward.

---

## Near term vs long term

### Now — wrestling beachhead

- Curated coach supply (approval required).
- Book → pay → payout → review as the core loop.
- **AI-assisted** scheduling, pricing, and coach admin where it ships real time savings.
- Private, partner, and small-group sessions.
- Community / workspace for relationships beyond the session hour.
- Guild Market: wrestling gear with trusted community buyers and sellers.
- Premium brand and coach recruitment (`/coaches`, homepage, real photography).

### Next

- Recurring sessions and coach CRM-lite (AI-suggested where possible).
- Deeper community adoption and coach weekly active usage.
- Marketplace depth (offers, shipping, trust at scale).
- Stronger coach analytics and repeat parent booking loops.

### Later

- Additional sports (same coach OS + AI patterns, new sport config).
- Camps, clinics, and events as first-class objects.
- Advanced marketplace mechanics.
- Recruiting and institutional adjacency where it strengthens the network.

---

## Product philosophy

Before building, answer **yes** to at least one:

1. **Does this help coaches run their business on Guild?**
2. **Does this increase parent trust and repeat booking?**
3. **Does this strengthen the wrestling community (and later, the athletic community on Guild)?**
4. **Does this use AI to remove coach or parent work (not add noise)?**

If the answer to all four is **no**, do not build it.

---

## Do this, not that

Common decisions — **Cursor and engineers should default to the left column.**

| Situation | **Do** | **Don't** |
|-----------|--------|-----------|
| A coach workflow is manual today | Design for **AI-assisted with coach override** | Ship the manual version and “add AI later” |
| Adding a new surface | Ask if it belongs on the **unified coach home** | Create another tab or separate dashboard |
| Parents need something | Check if it also helps **coach retention** | Build parent features that don’t feed the flywheel |

When in doubt, re-read **Current state (July 2026)** — we are still closing the gap to weekly coach habit, not expanding surface area.

---

## Design philosophy

Guild is **premium**, **minimal**, and **dark** — luxury athletic brand.

**Visual language:** black and charcoal, gold accent `#B89D60` (see `config/tenants.ts`), bronze brand assets, large real photography, subtle animation only where it adds clarity.

**Avoid:** cartoon graphics, dashboard clutter, flashy animation, generic SaaS gradients.

**Reference:** Apple clarity meets Nike athletic credibility. User-facing name is always **The Guild** (see `.cursor/rules/guild-branding.mdc`).

AI surfaces should feel **native and quiet** — not a glowing chat widget on every screen.

---

## Architecture philosophy

**Schema rule:** Default to **sport-agnostic field names** even when shipping wrestling-specific UI — `sport_type`, not `wrestling_level`.

**Near term:** Wrestling-specific GTM, copy, categories, and coach eligibility.

**Long term:** Sport-agnostic data models when abstraction is straightforward.

Prefer abstractions: `Sport`, `Discipline`, `SkillLevel`, `EquipmentCategory`, `CoachCertification`.

A baseball coach should eventually fit the same architecture as a wrestling coach.

---

## Anti-goals (what Guild is not)

- Not an open marketplace for any coach with no vetting.
- Not a generic sports social network without booking and payouts at the center.
- Not a separate eBay-style business.
- Not multi-sport in **marketing** before wrestling density and coach OS reliability.
- Not “AI” as a gimmick chatbot coaches must learn to prompt.
- Not feature parity with every incumbent on day one — **simplicity wins**.
- Not desktop-only — mobile-first coaches and parents.

**We do not optimize for:** page views, raw downloads, followers, or signups without activation.

---

## Success metrics

We optimize for:

- **weekly active coaches**
- coach retention
- coach earnings
- bookings per coach
- repeat parent bookings
- time to first booking
- coach NPS
- marketplace transactions (secondary)
- community participation (workspace / message activity)

Every employee should know these.

---

## How to use this document

- **Product:** Prioritize backlog against **Current state** gaps, **Now**, and pillar #1 (Intelligent Coach Platform).
- **Engineering:** Prefer scalable models; ship wrestling-specific UI freely; **never ship manual-only coach workflows** when AI-assisted design is feasible in the same sprint.
- **Design:** Filter through design philosophy; AI stays invisible until useful.
- **Cursor / AI sessions:** Read this file at the start of substantial feature work. Check the **four questions**, **Do this, not that**, **anti-goals**, and the **schema rule** before writing code. For AI features, run the **AI review checklist** before shipping.

When this doc conflicts with a one-off request, **update this doc** or explicitly label the request as a temporary exception.

---

*Last updated: July 2026*
