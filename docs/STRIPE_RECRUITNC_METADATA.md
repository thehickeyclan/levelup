# Stripe checkout metadata (Guild ↔ RecruitNC)

Wrestling Guild and RecruitNC share one Stripe account. RecruitNC’s webhook (`app.ncwrestlingunited.com`) must **not** treat Guild checkouts as NC United Store orders.

Guild is the source of truth for bookings on `https://www.wrestlingguild.com/api/stripe/webhook`.

## Required metadata (every Guild Checkout Session)

Set via `buildGuildCheckoutMetadata()` in `lib/stripe/guild-checkout-metadata.ts`:

| Key | Value |
|-----|--------|
| `channel` | `guild` |
| `business` | `wrestling_guild` |
| `source` | `guild_booking`, `guild_register`, or `guild_cart` (must start with `guild_`) |
| `booking_id` | Session UUID when applicable (also `session_id` for legacy webhook) |
| `product_name` | Human-readable line for admin/receipts |
| `parent_email` | Optional |
| `athlete_name` | Optional |

Also mirror the same keys on `payment_intent_data.metadata` when creating Checkout Sessions.

## Checkout paths in this repo

| Path | `source` |
|------|----------|
| `POST /api/bookings` | `guild_booking` |
| `POST /api/sessions/[id]/register` | `guild_register` |
| `POST /api/cart/checkout` | `guild_cart` |

## Do not set on Guild checkouts

RecruitNC store keys that mis-route payments:

- `items`, `order_id`, `customer_email` (store cart format)
- `channel: recruitnc` or `channel: spartan`
- `source: national_team`, `registration_id`, `drop_in_request_id`

## Acceptance test

1. Complete a Guild checkout (e.g. $30 session).
2. Stripe Dashboard → Checkout Session → Metadata shows `channel=guild`, `business=wrestling_guild`, `source=guild_*`.
3. RecruitNC admin shows category **Guild**, not Apparel; line from `product_name`.
4. No ghost “NC United Store purchase” / `web:nc-united-store-purchase:pi_...` for Guild payments.

## Cancel after Stripe refund

If you refunded in Stripe first, **do not** use Admin **Cancel session** in Guild (it issues wallet credit). See ops notes in product docs / support runbooks.
