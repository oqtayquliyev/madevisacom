/*
  Two things:

  1. Timing — every listing already has `created_at` (submitted time).
     This adds `approved_at` (set the moment an admin publishes it) and
     `expires_at` (set to approved_at + 1 month automatically, since
     the default is "valid for 1 month"). Combined with the existing
     `enforce_review_on_edit` trigger into one function so trigger
     execution order can't put them out of sync with each other.

  2. Expiry — rather than needing a scheduled job to flip status to
     'expired', the public fetch functions simply stop returning a
     listing once its expires_at has passed (see the app-side query
     changes that accompany this migration) — same effective result,
     no cron needed. Re-approving (editing status back to 'published')
     resets the 1-month clock.
*/

CREATE OR REPLACE FUNCTION public.enforce_review_on_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.status := 'pending';
  END IF;

  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    NEW.approved_at := now();
    NEW.expires_at := now() + interval '1 month';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Re-attach as BEFORE INSERT OR UPDATE (was UPDATE-only before) so a
-- row inserted directly as 'published' also gets timestamps.
DROP TRIGGER IF EXISTS programs_enforce_review_on_edit ON public.programs;
CREATE TRIGGER programs_enforce_review_on_edit
  BEFORE INSERT OR UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_on_edit();

DROP TRIGGER IF EXISTS sponsored_jobs_enforce_review_on_edit ON public.sponsored_jobs;
CREATE TRIGGER sponsored_jobs_enforce_review_on_edit
  BEFORE INSERT OR UPDATE ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_on_edit();

-- Backfill: anything already published gets a 1-month window starting now,
-- so nothing that's currently live disappears immediately after this runs.
UPDATE public.programs SET approved_at = now(), expires_at = now() + interval '1 month'
  WHERE status = 'published' AND expires_at IS NULL;
UPDATE public.sponsored_jobs SET approved_at = now(), expires_at = now() + interval '1 month'
  WHERE status = 'published' AND expires_at IS NULL;
