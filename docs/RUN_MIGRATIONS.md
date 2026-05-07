# Run Migrations on Production Supabase

For collaboration (messages) and video upload to work, you need to run migrations on your **production** Supabase project.

## Quick fix for workspace_messages error

If you see: *"Could not find the table 'public.workspace_messages' in the schema cache"*

### Option 1: Supabase Dashboard (easiest)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Open **SQL Editor**
3. Copy and paste the contents of `supabase/migrations/20240120000000_workspace_messages.sql`
4. Click **Run**

### Option 2: Supabase CLI

```bash
# Link to your production project (if not already)
supabase link --project-ref YOUR_PROJECT_REF

# Push all pending migrations
supabase db push
```

### Option 3: Run migration file directly

```bash
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -f supabase/migrations/20240120000000_workspace_messages.sql
```

Replace `[PASSWORD]` and `[HOST]` with your Supabase project credentials (Project Settings → Database).

## athlete_services (coach rate card)

If you see: *"Could not find the table 'public.athlete_services' in the schema cache"*

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**
2. Open `supabase/migrations/20240140000000_athlete_services.sql` in your repo, copy its full contents, paste into the SQL Editor, and click **Run**.

Or push all pending migrations: `supabase link --project-ref YOUR_REF` then `supabase db push`.

## Admin Users: Last login & archived

If you see: *"column users.last_login_at does not exist"* on Admin → Users, the app will still load (it falls back to a query without those columns). To enable **Last login** and **Archived** in User Management, run:

- `supabase/migrations/20240111000000_add_users_last_login.sql` – adds `last_login_at`
- `supabase/migrations/20240134000000_users_archived_at.sql` – adds `archived_at`

Run each in the Supabase SQL Editor, or use `supabase db push` to apply all pending migrations.

## athlete_availability_slots.facility_id (per-room coach openings)

If you see: *Could not find the 'facility_id' column of 'athlete_availability_slots' in the schema cache*

Production Postgres does not have the column yet — the API cannot read or write `facility_id` until the migration runs.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your **production** project → **SQL Editor**
2. Paste and run the full contents of `supabase/migrations/20260507120000_availability_slots_facility.sql`, then click **Run**

Or: `supabase link --project-ref YOUR_REF` then `supabase db push`.

Until then, deployed code can fall back (openings save without per-room locking); after the migration, per-room choices apply normally.

## Migrations included

- `20240111000000_add_users_last_login.sql` – Admin: last login column on users
- `20240134000000_users_archived_at.sql` – Admin: archived_at on users
- `20240118000000_workspaces.sql` – Workspaces, goals, media, session notes, actions, workspace-media storage bucket
- `20240120000000_workspace_messages.sql` – Collaboration messages table
- `20240121000000_workspace_media_mime_types.sql` – Adds HEIC, M4V, etc. for mobile photo/video uploads
- `20240122000000_workspace_messages_modern.sql` – Edit/delete messages, emoji reactions
- `20240140000000_athlete_services.sql` – Coach rate card (durations, session types, price; platform 10%, coach 90%)
- `20260507120000_availability_slots_facility.sql` – Coach openings: optional `facility_id` on `athlete_availability_slots` (per wrestling room)

If workspace features or video/photo upload fail, ensure all migrations have been run on production.
