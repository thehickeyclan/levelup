# The Guild — Activity Feed

**Product Requirements Document v2.1**

**Feature:** Guild Activity Feed — Booking social proof + athlete engagement  
**Stack:** Next.js 15, Supabase, Tailwind CSS  
**Status:** Approved direction — extend `youth_wrestlers`, phased rollout  
**Primary audience:** High school wrestlers (14–18), parents, coaches  

**Related:** `docs/VISION.md`, `docs/GROWTH.md`, session share graphics (`lib/session-share-graphic/`), Guild Market (`app/(market)/market/`)

---

## 1. What is the activity feed

The Activity Feed is proof that Guild coaches are earning sessions and families are coming back. It is **not** a social network — it is a **ledger of coached sessions** with a light social layer that drives repeat bookings and keeps wrestlers engaged between sessions.

**Two jobs:**

1. **Retention** — Parents and wrestlers see training happening. Social proof that the platform is alive nudges rebooking.
2. **Wrestler engagement** — High schoolers want to post session photos and browse Guild Market. Guild becomes a destination, not only a parent booking tool.

**What it is not:** A general sports social feed. Guild wins when **coaches open Guild weekly** and wrestlers engage in ways that drive **bookings and coach retention** — not when the feed becomes another inbox.

**North star tie-in:** Every feed feature must strengthen at least one of: coach weekly habit, repeat bookings, or marketplace liquidity (secondary).

---

## 2. Youth wrestler accounts (extend existing — no new table)

Guild **already has** wrestler identity. Do **not** create `athlete_accounts`.

| Existing | Purpose |
|----------|---------|
| `youth_wrestlers` | Profile: name, school, weight, DOB, photo, parent link |
| `youth_wrestler` auth role | Login, inbox, session register, cart checkout |
| `session_participants.youth_wrestler_id` | Who attended a session |

Extend `youth_wrestlers` for feed permissions and public profile settings.

### Account model (accurate to product today)

| Account | Controls | Notes |
|---------|----------|-------|
| **Parent** | Books, pays, billing, privacy for linked wrestlers | Can post session photos on behalf of wrestlers without wrestler login |
| **Youth wrestler** (`youth_wrestler` role) | Feed, kudos, photo posts (if allowed), profile, market browse/list/sell | **Can self-register** for sessions; parent typically pays via cart |

**Linking:** `youth_wrestlers.parent_id` (+ `youth_wrestler_parents` for multi-parent). When a wrestler has login, auth `users.id` = `youth_wrestlers.id`.

### Age gating (COPPA)

| Age | Login | Photo posts |
|-----|-------|-------------|
| Under 13 | No wrestler login | Parent posts only |
| 13–15 | Wrestler login | Parent approval required (default ON) |
| 16+ | Wrestler login | Full posting; parent can restrict |

- All posts tied to **completed sessions** (no standalone social posts).
- `actor_parent_id` on every post — parent always accountable.

### New columns on `youth_wrestlers`

```sql
can_post_photos boolean default false,
requires_parent_approval boolean default true,
profile_public boolean default true,
show_market_activity_in_feed boolean default false  -- opt-in for market posts
```

`graduation_year` already exists on many wrestler rows; use it for display.

### Wrestler profile (phased)

| Phase | Profile includes |
|-------|------------------|
| 1 | Name, school, weight (from existing wrestler page) |
| 2 | Session photo gallery (session-tied posts only) |
| 3 | Market activity summary (listings, purchases — opt-in) |
| 4+ | Follow coaches/wrestlers (deferred) |

---

## 3. Who sees the feed

| Audience | Access | What they see (phase 1–2) |
|----------|--------|---------------------------|
| **Youth wrestler (logged in)** | Full | Community feed + own posts |
| **Parent (logged in)** | Full | Linked wrestlers’ posts + community |
| **Coach (logged in)** | Full | Activity on their sessions + community |
| **Public (logged out)** | Read only | **Deferred** — ship after 10+ session completions/week locally |
| **Program / workspace** | Scoped | **Deferred** — use `workspace_id` when needed |

**Public feed:** Defer until local density. An empty feed hurts conversion more than no feed.

**Follow / “coaches they follow”:** Deferred to phase 4+. Do not promise in v1 copy.

---

## 4. What triggers an activity post

### Coaching triggers (core)

#### Trigger 1 — Session completed (auto) — Phase 1

**When:** `sessions.status` → `completed`  
**Who:** Platform auto-post per `session_participants` row  
**Attribution:** `youth_wrestler_id` + `actor_parent_id`

```
[Coach photo]  Gavin Hickey completed a session
               Small Group with Liam Hickey · UNC Wrestling Facility
               Today at 10:00 AM · 60 min

               🔥 12 kudos  [Share]
```

- One post per wrestler per session (`UNIQUE` on `session_id + youth_wrestler_id`).
- **Share** reuses existing session graphic API (`/api/sessions/[id]/share-image`) — not a new pipeline.

#### Trigger 2 — Milestone hit (auto) — Phase 1

**When:** `reward_milestones` insert  
**Who:** Platform auto-post  
**Attribution:** parent + primary linked wrestler when applicable

```
[Trophy]  Gavin Hickey hit a milestone!
          🏆 10 sessions completed

          🔥 24 kudos  [Share]
```

#### Trigger 3 — Photo post (manual) — Phase 2

**When:** After session completed — prompt: “Add photos from this session?”  
**Who:** Parent, youth wrestler (if allowed), or coach

```
[Photo 4:3]
Gavin Hickey · Small Group with Liam Hickey
UNC Wrestling Facility · Today
Caption: "Double leg was clicking today 🔥"

🔥 34 kudos  [Share]
```

**Rules:**

- Only after session completed — never standalone
- One photo post per wrestler per session (append up to 4 images to same post)
- Caption max 280 chars
- Coach auto-tagged from session
- Parent approval when `requires_parent_approval = true`
- Viral loop: wrestler posts → shares to IG → teammates see → parents book

#### Trigger 4 — Review posted (auto) — Phase 3

**When:** Parent submits `reviews` row  
**Behavior:** **Append to existing `session_completed` post** (`review_id`, stars, snippet) — do not create a second card

#### Trigger 5 — Booking confirmed (auto, opt-in) — Phase 3

**When:** Checkout completes  
**Default:** OFF (`show_booking_activity` parent privacy toggle)  
**Lightweight:** kudos only, no comments

---

### Guild Market triggers (buy / sell / trade) — Phase 3, all opt-in

Market activity is **included** but **not in phase 1 or 2**. It feeds marketplace liquidity and wrestler engagement without flooding the coaching ledger.

**Global defaults:** OFF. Parent or wrestler (16+) enables per wrestler: `show_market_activity_in_feed`.

| Trigger | When | Who posts | Card (example) |
|---------|------|-----------|----------------|
| **Market purchase** (`market_purchase`) | `market_orders.status` → `paid` or `completed` | Buyer wrestler | "Gavin picked up Nike Inflicts 👟 · Guild Market" |
| **Market sale** (`market_listing_sold`) | Order paid for seller's listing | Seller wrestler | "Gavin sold a pair of Asics · Guild Market" |
| **Market trade** (`market_trade_completed`) | `market_trades` both fees paid | Both wrestlers (one card each, or paired) | "Gavin completed a shoe trade on Guild Market 🤝" |

**Market post rules:**

- **Opt-in only** — default OFF (unlike session completions)
- **No item price** in feed card (avoid flex / safety); link to listing or order
- **No PII** — no shipping address, no parent email
- Youth seller posts attribute to wrestler; payout recipient remains parent per existing `payout_recipient_id` logic
- Max **1 market post per wrestler per day** (prevent listing spam)
- Market posts appear in feed with **lighter card weight** (secondary to session posts)
- **Share:** link to listing or market profile, not session graphic API

**Deferred (phase 4+):**

- New listing published (“Just listed Jordan Burroughs on Guild Market”)
- Offer accepted / countered
- Collection vault flex posts

**Schema:** `trigger_type` includes `market_purchase | market_listing_sold | market_trade_completed`; optional `market_order_id`, `market_listing_id`, `market_trade_id` on `activity_posts`.

---

## 5. Social actions

### Kudos 🔥 — Phase 1

- One tap; wrestlers, parents, coaches
- Logged-out visitors see count only (signup to kudos — phase 4 public feed)
- Notify post owner at 1, 5, 10, 25 kudos
- Coach kudos highlighted: “Liam Hickey gave you 🔥”

### Comments 💬 — Phase 3

- **Defer** standalone comment inbox
- Prefer **deep link to existing session thread** (`guild_threads` / order thread for market posts)
- Coach comments: gold badge when in-thread

### Share — Phase 2+

| Post type | Share behavior |
|-----------|----------------|
| Session completed / milestone | Reuse session graphic pipeline |
| Photo post | Native share sheet (mobile) / download (desktop) |
| Market post | Link to listing or `/market/listing/[id]` |

Share URL: `wrestlingguild.com/activity/[post_id]`  
Attribution: “Train with [Coach] on The Guild” / “Shop Guild Market”

---

## 6. Feed surfaces — ship vs defer

| Surface | Ship | Defer |
|---------|------|-------|
| `/activity` (logged-in) | ✅ Phase 1 | |
| Parent home: last 5 wrestler posts | ✅ Phase 1 | |
| Coach home: activity on your sessions | ✅ Phase 1 | |
| Public homepage embed | | Phase 4 |
| Training page feed | | |
| Program/workspace-scoped feed | | |
| Nav tab for `/activity` | | |
| Wrestler profile market tab | | Phase 3 |

**One feed route + two widgets** beats six surfaces.

---

## 7. Coach-first engagement — Phase 1 required

Coach home widget (ship with phase 1):

```
ACTIVITY ON YOUR SESSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 47 kudos on your sessions this week
📸 12 photos posted by athletes      (phase 2+)
⭐ 3 new reviews                     (phase 3+)

[See all activity →]
```

This is what keeps coaches opening Guild weekly.

---

## 8. Marketplace integration summary

| Integration | Phase | Default |
|-------------|-------|---------|
| Feed posts: buy, sell, trade | 3 | Opt-in OFF |
| Wrestler profile: market history | 3 | Opt-in |
| Listing → wrestler profile link | 3 | Existing seller profiles |
| Market browse as wrestler destination | — | Already exists at `/market` |

Market posts **supplement** the feed; they do not replace session proof. Coaching cards stay primary sort weight; market cards visually lighter.

---

## 9. Privacy & controls

### Parent (Account → Privacy)

| Toggle | Default |
|--------|---------|
| Show wrestler activity in community feed | ON |
| Show wrestler name publicly (phase 4 public feed) | OFF |
| Allow wrestler to post photos | ON (16+), OFF (&lt;16) |
| Require parent approval for photo posts | ON (&lt;16) |
| Show booking activity | OFF |
| Show market activity (buy/sell/trade) | OFF |

### Youth wrestler (Account → Privacy) — Phase 2+

| Toggle | Default |
|--------|---------|
| Show my profile publicly | ON |
| Show market activity in feed | OFF |

### Moderation & safety (required before photo posts)

- Admin delete any post/photo
- Report post → admin alert (v1)
- Storage: private bucket `activity-photos`; signed URLs for display
- Max 4 photos × 5MB; JPEG/PNG/WebP
- Rate limit photo edits per session
- Parent approval: signed token link, 24h expiry, approve/deny without full login

---

## 10. Supabase schema

```sql
-- Extend existing wrestler profiles
ALTER TABLE public.youth_wrestlers
  ADD COLUMN IF NOT EXISTS can_post_photos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_parent_approval boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS profile_public boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_market_activity_in_feed boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.activity_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'session_completed', 'milestone_hit', 'photo_post', 'review_posted',
    'booking_confirmed', 'market_purchase', 'market_listing_sold', 'market_trade_completed'
  )),
  actor_parent_id uuid REFERENCES auth.users(id),
  youth_wrestler_id uuid REFERENCES public.youth_wrestlers(id),
  coach_id uuid REFERENCES public.athletes(id),
  session_id uuid REFERENCES public.sessions(id),
  milestone_id uuid REFERENCES public.reward_milestones(id),
  review_id uuid REFERENCES public.reviews(id),
  market_order_id uuid REFERENCES public.market_orders(id),
  market_listing_id uuid REFERENCES public.market_listings(id),
  market_trade_id uuid REFERENCES public.market_trades(id),
  workspace_id uuid REFERENCES public.workspaces(id),
  caption text CHECK (char_length(caption) <= 280),
  is_public boolean DEFAULT true,
  athlete_name_public boolean DEFAULT false,
  parent_approved boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_session_completed
  ON public.activity_posts (session_id, youth_wrestler_id)
  WHERE trigger_type = 'session_completed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_photo_per_session
  ON public.activity_posts (session_id, youth_wrestler_id)
  WHERE trigger_type = 'photo_post';

CREATE TABLE IF NOT EXISTS public.activity_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.activity_posts(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  display_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_kudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.activity_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

-- Phase 3 — prefer session/order thread deep links over heavy comment UI
CREATE TABLE IF NOT EXISTS public.activity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.activity_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 280),
  is_coach_comment boolean DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_posts_created
  ON public.activity_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_posts_youth_wrestler
  ON public.activity_posts (youth_wrestler_id);
CREATE INDEX IF NOT EXISTS idx_activity_posts_coach
  ON public.activity_posts (coach_id);
CREATE INDEX IF NOT EXISTS idx_activity_posts_session
  ON public.activity_posts (session_id);
CREATE INDEX IF NOT EXISTS idx_activity_posts_market_order
  ON public.activity_posts (market_order_id) WHERE market_order_id IS NOT NULL;
```

**RLS:** Posts readable by logged-in users when `is_public = true` and parent privacy allows; wrestlers/parents see own posts always; service role for trigger inserts.

---

## 11. Photo upload flow (phase 2)

```
Session marked completed
        ↓
"Add photos from this session?" (parent + wrestler app)
        ↓
Select up to 4 photos
        ↓
Upload → activity-photos/[session_id]/[uuid].jpg
        ↓
If requires_parent_approval:
  parent_approved = false → notify parent → approve/deny link
        ↓
Post live in feed
```

---

## 12. Trigger implementation notes

### Session completed (phase 1)

Fire from session completion handler (admin mark complete, coach complete, or automated rule):

```typescript
for (const participant of session.participants) {
  const prefs = await getParentPrivacyPrefs(participant.parent_id);
  await admin.from('activity_posts').insert({
    trigger_type: 'session_completed',
    youth_wrestler_id: participant.youth_wrestler_id,
    actor_parent_id: participant.parent_id,
    coach_id: session.athlete_id,
    session_id: session.id,
    is_public: prefs.show_activity_publicly ?? true,
    athlete_name_public: prefs.show_athlete_name ?? false,
  });
}
```

### Market purchase / sale (phase 3)

Fire from `/api/market/webhook` on `checkout.session.completed` when `metadata.app === 'guild-market'`:

```typescript
if (!wrestler.show_market_activity_in_feed) return;

await admin.from('activity_posts').insert({
  trigger_type: isBuyer ? 'market_purchase' : 'market_listing_sold',
  youth_wrestler_id: wrestler.id,
  actor_parent_id: wrestler.parent_id,
  market_order_id: order.id,
  market_listing_id: order.listing_id,
  is_public: true,
  parent_approved: true,
});
```

### Market trade (phase 3)

Fire when `market_trades.status` → `completed` (both fees paid):

- One post per side if each wrestler opted in
- `market_trade_id` on both posts

---

## 13. API

| Route | Purpose |
|-------|---------|
| `GET /api/activity/feed` | Paginated feed (`cursor`, `limit=20`) |
| `POST /api/activity/posts/[id]/kudos` | Toggle kudos |
| `POST /api/activity/posts/[id]/photos` | Add photos (phase 2) |
| `POST /api/activity/posts/[id]/approve` | Parent approve photo (token or auth) |
| `GET /api/activity/posts/[id]` | Single post (share deep link) |

Feed query joins: sessions, athletes (coach), youth_wrestlers, kudos count, optional review snippet, market listing title (no price).

---

## 14. Notifications

| Event | Recipient | Message |
|-------|-----------|---------|
| Kudos 1, 5, 10, 25 | Post owner | “Your post got 🔥 N kudos!” |
| Coach kudos | Wrestler + parent | “Liam Hickey gave your session 🔥” |
| Photo approval needed | Parent | “Gavin wants to post a photo from today's session” |
| Photo approved | Wrestler | “Your photo is live 🔥” |
| Milestone post | Parent + wrestler | “Gavin hit 10 sessions — celebrating!” |
| Market post live (opt-in) | Wrestler | “Your Guild Market activity is in the feed” |

---

## 15. Beta ship order

### Phase 1 — Core proof (4–6 weeks)

- Migration: `activity_posts`, `activity_kudos`
- Triggers: `session_completed`, `milestone_hit`
- `GET /api/activity/feed`, `POST` kudos
- `/activity` page (logged-in)
- Parent home widget (linked wrestlers)
- **Coach home widget** (kudos this week)
- **No photos, no market, no new accounts**

### Phase 2 — Photo posts

- `youth_wrestlers` permission columns
- `activity_photos` + upload + parent approval
- Share on completion cards (existing graphic API)

### Phase 3 — Social + market depth

- Review appended to completion card
- Booking post (opt-in)
- **Market: buy / sell / trade posts (opt-in)**
- Comments → session / order thread deep links
- Wrestler profile: session gallery + optional market summary

### Phase 4 — Public + graph

- Public anonymized `/activity` (10+ completions/week gate)
- Follow coaches/wrestlers (if justified by metrics)
- Homepage feed embed

---

## 16. Mobile-first rules

- Full-width cards, infinite scroll
- Photo cards: 4:3, swipeable gallery (≤4 images)
- Kudos: 44px tap target, instant feedback
- Photo upload: camera roll, no crop v1
- Share: native share sheet on mobile
- Coach widget: summary card → tap opens `/activity`
- Parent photo approval: push + one-tap approve link

---

## 17. Vision alignment checklist

Before shipping each phase, confirm:

1. **Coach weekly habit** — phase 1 coach widget ships with feed
2. **Repeat bookings** — session proof + share graphics, not vanity metrics
3. **Not a social network** — session-tied posts only; market opt-in; no follow in v1–3
4. **Identity** — one graph via `youth_wrestlers`, not parallel accounts
5. **Market** — buy/sell/trade posts drive liquidity without overpowering coaching ledger

---

## Document history

| Version | Date | Notes |
|---------|------|-------|
| v1 | — | Initial Strava-style PRD (superseded) |
| v2 | — | Booking social proof reframe + photo posts |
| v2.1 | Jul 2026 | `youth_wrestlers` extension, market buy/sell/trade phase 3, schema fixes |
