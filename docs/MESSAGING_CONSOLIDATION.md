# Messaging consolidation (July 2026)

## Direction

**One inbox (`/messages`) on `guild_threads`** for coaching and Guild Market. Workspaces are hidden from nav; auto-create on booking is paused.

## Thread types

| Type | Use |
|------|-----|
| `coach_inquiry` | Parent ↔ coach DM (1 thread per pair) |
| `session` | Messages about a booked session (roster parents merged on small groups) |
| `group_session` | Phase 2 — small-group roster chat |
| `listing_qa`, `offer`, `trade`, `order` | Guild Market (unchanged) |

## Routes

| Path | Purpose |
|------|---------|
| `/messages` | Unified inbox (All / Coaching / Market tabs) |
| `/messages/[sessionId]` | Session thread (guild-backed) |
| `/inbox/new` | Start coach DM → redirects to `/messages?thread=` |
| `/inbox`, `/guild-messages` | Redirect to `/messages` |
| `/workspaces/*` | Redirect to `/messages` when nav disabled |

## Migration required

Run `supabase/migrations/20260710140000_guild_coach_inquiry_and_workspace_pause.sql`:

- Adds `inquiry_parent_id`, `inquiry_coach_id` on `guild_threads`
- Drops workspace auto-create trigger on `session_participants`

## Legacy data

- `coach_inquiries` rows are copied into `guild_messages` on first open of a DM thread.
- `booking_messages` is superseded by `session` guild threads (created at Stripe checkout).

## Phase 2 (not in this PR)

- Implement `group_session` auto-create for small-group / camp sessions
- Migrate `messaging_groups` into guild threads
- Optional: archive workspace tables if unused

## Flags

- `IN_APP_MESSAGING_ENABLED` — `lib/in-app-messaging.ts`
- `WORKSPACES_NAV_ENABLED` — `lib/workspaces-feature.ts`
