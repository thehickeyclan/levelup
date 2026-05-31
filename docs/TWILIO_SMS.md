# Twilio SMS for coach alerts

When someone books or signs up for a coach’s session, the coach gets:

1. **In-app notification** (always) — “Someone signed up for your session … Check My sessions.”
2. **SMS** (optional) — if Twilio is configured and the coach has a phone on file.

## Env vars

Add to `.env.local` (and your host’s env, e.g. Vercel):

- `TWILIO_ACCOUNT_SID` — from Twilio console
- `TWILIO_AUTH_TOKEN` — from Twilio console  
- **`TWILIO_MESSAGING_SERVICE_SID`** (recommended for production US messaging) — a [Messaging Service](https://console.twilio.com/us1/develop/sms/services) **MG…** SID. Attach your registered **long code pool** or **verified toll‑free number** here. When this is set, the app sends SMS with **Messaging Service** only — you **do not** send `TWILIO_FROM_NUMBER` alone for that path (Twilio: use **either** Messaging Service SID **or** `From`, not both). If both env vars exist, **`TWILIO_MESSAGING_SERVICE_SID` wins**.
- **`TWILIO_FROM_NUMBER`** — Twilio phone number in E.164 (e.g. `+1XXXXXXXXXX`). Use when you **are not** using a Messaging Service; the number itself must already be compliant for your traffic type (see **US regulation** below).
- **`ADMIN_BOOKING_ALERT_PHONES`** (optional) — comma-separated cell numbers (10-digit US or E.164) that receive an **ops** copy of every booking/signup SMS (in addition to the coach). Same number as the coach is only texted once (coach copy).

## US regulation (why SMS “stopped working”)

US carriers filter application traffic. If messages fail with Twilio REST errors mentioning **registration**, **A2P**, **10DLC**, **campaign**, or **verified toll‑free**, the fix is **in Twilio / carrier compliance**, not in this codebase.

Rough map:

| Your sender | What Twilio/console usually needs |
|-------------|-----------------------------------|
| **US local long code (-10-digit)** | [A2P 10DLC](https://www.twilio.com/docs/sms/a2p-10dlc): Business profile **+** Brand **+** **approved** Messaging Campaign linked to your numbers (often via a **Messaging Service**). |
| **Toll‑free (+1‑8xx)** | [Toll‑free verification](https://support.twilio.com/hc/en-us/articles/360045061934); until verified or approved, outbound to many handsets can fail. |
| **Short code** | Short code provisioning and carrier approval — separate workflow. |

**Recommended setup:** Create a Messaging Service (**MG…**), add only numbers that already meet the row above, set **`TWILIO_MESSAGING_SERVICE_SID`** in production (see env vars).

### Debug failures

1. **Admin UI** → **Message log** (if your deployment logs Twilio failures) — entries often include `Twilio HTTP …` and the REST body Twilio returned.
2. **Twilio Console** → **Monitor** → **Logs** → **Messaging** → open the failed message and read Twilio **error code** (e.g. unregistered toll‑free traffic, inactive campaign).

Common codes worth searching Twilio docs for: **21610**, **30034**, **30035**, **60200** ranges (Messaging / compliance).


You can also omit that env and rely on **`users.phone`** for every user with **`role = admin`** — those numbers get the same ops copy (deduped with the env list).

## Coach phone

We look for a coach phone in this order:

1. **`users.phone`** — cell number from coach onboarding / profile (migration `20240320000000_users_phone.sql`). Same column parents use on Account.
2. **`athletes.zelle_email`** — Zelle field accepts “email or phone”. If the value looks like a phone (e.g. 10+ digits), we use it for SMS so coaches who already entered their cell for Zelle get alerts without a second field.

If neither is set or neither looks like a valid phone, we only send the in-app notification.

## Where SMS is sent

- **Coach** — same as before: `users.phone` or phone-shaped `athletes.zelle_email`.
- **Ops / admin** — on the same events, a second message goes to `ADMIN_BOOKING_ALERT_PHONES` and to every admin user with `users.phone` (see `notifyCoachAndAdminsNewBooking` in `lib/twilio.ts`).

- **Stripe webhook** — after a paid booking or signup (`checkout.session.completed`): private booking, register path, and cart checkout; in-app notification + SMS if phone set.
- **Register API** — after a free/direct signup (session owner add, or free small group): in-app notification + SMS if phone set.
- **Cart checkout (credits only)** — when the cart is fully paid with credits (no Stripe): in-app notification + SMS if phone set (one SMS per session per checkout).
- **Private booking API** — when the charge is below Stripe’s minimum and the session is confirmed without card payment: SMS in addition to the existing in-app notification at booking time.

## Testing

1. Set Twilio env vars and ensure `users.phone` exists (see migration `20240320000000_users_phone.sql`).
2. Set a coach’s phone via onboarding, coach profile, or SQL on `users.phone`.
3. Have a parent (or you) sign up for that coach’s session; coach should get in-app notification and an SMS.
