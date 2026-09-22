-- Content report queue (App Store 1.2 — UGC review within 24 hours).
-- Reports are recorded by POST /api/mobile/report and worked by admins at
-- /admin/compliance. Previously reports existed only as one admin
-- notification per admin; the backfill below recovers them (deduplicated).

CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL DEFAULT 'guild',
  target_type text NOT NULL CHECK (target_type IN ('listing', 'thread', 'message', 'user', 'activity')),
  target_id text NOT NULL,
  reason text NOT NULL DEFAULT '',
  -- 'Blocked by user' reports: FYI-only preference signals, not incidents.
  is_block boolean NOT NULL DEFAULT false,
  -- Intentionally NOT a foreign key: the report must survive the reporter's
  -- account deletion.
  reported_by uuid,
  reporter_email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status
  ON public.content_reports (status, created_at);
CREATE INDEX IF NOT EXISTS idx_content_reports_target
  ON public.content_reports (target_type, target_id);

-- Service-role only: RLS enabled with no policies. Every read and write goes
-- through admin server code using the service-role client.
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Backfill from the admin notifications that were the only record until now.
-- Each report produced one notification per admin, so deduplicate on
-- (target, reporter, minute). Reason and reporter email are parsed back out
-- of the notification body (best effort; '' when absent).
INSERT INTO public.content_reports
  (tenant_slug, target_type, target_id, reason, is_block, reported_by, reporter_email, status, created_at)
SELECT DISTINCT ON (n.data->>'target_type', n.data->>'target_id', n.data->>'reported_by', date_trunc('minute', n.created_at))
  'guild',
  n.data->>'target_type',
  n.data->>'target_id',
  COALESCE(substring(n.body from '— "(.*)"'), ''),
  COALESCE((n.data->>'is_block')::boolean, false),
  NULLIF(n.data->>'reported_by', '')::uuid,
  CASE
    WHEN COALESCE((n.data->>'is_block')::boolean, false)
      THEN COALESCE(split_part(n.body, ' blocked a ', 1), '')
    ELSE COALESCE(split_part(n.body, ' reported a ', 1), '')
  END,
  'pending',
  n.created_at
FROM public.notifications n
WHERE n.type = 'content_report'
  AND n.data->>'target_type' IN ('listing', 'thread', 'message', 'user', 'activity')
  AND COALESCE(n.data->>'target_id', '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.content_reports c
    WHERE c.target_id = n.data->>'target_id'
      AND c.target_type = n.data->>'target_type'
      AND COALESCE(c.reported_by::text, '') = COALESCE(n.data->>'reported_by', '')
      AND date_trunc('minute', c.created_at) = date_trunc('minute', n.created_at)
  )
ORDER BY n.data->>'target_type', n.data->>'target_id', n.data->>'reported_by',
  date_trunc('minute', n.created_at), n.created_at;

-- Precedent case: thread reported 2026-09-11, reviewed 2026-09-22 and found
-- to be an empty thread (accidental tap). Close it as resolved, no action.
UPDATE public.content_reports
SET status = 'resolved',
    resolved_at = '2026-09-22T00:00:00Z',
    resolution_notes = 'Empty thread — accidental tap. Reviewed 2026-09-22; no action needed.'
WHERE target_type = 'thread'
  AND target_id = '5472e806-1bd5-42d9-bd19-7f68e9f55ddb'
  AND status = 'pending';
