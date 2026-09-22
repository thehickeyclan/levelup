-- Account deletion request queue (App Store 5.1.1(v) compliance).
-- Requests are recorded by POST /api/mobile/account/delete and worked by
-- admins at /admin/compliance within the 30-day window.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Intentionally NOT a foreign key: this row must survive the auth user's
  -- deletion so the 30-day Apple deadline stays auditable after the purge.
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  role text,
  tenant_slug text NOT NULL DEFAULT 'guild',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'purged', 'anonymized', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_status
  ON public.account_deletion_requests (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user
  ON public.account_deletion_requests (user_id);

-- Service-role only: RLS enabled with no policies. Every read and write goes
-- through admin server code using the service-role client.
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
