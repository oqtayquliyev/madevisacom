/*
  Consolidated, verified replacement for the two previous migrations
  attempting this (20260922090000 and 20260922110000) — run this ONE
  file instead of those two, in case either was only partially
  applied. Tested end-to-end against a real Postgres 16 instance
  before delivery: inserting as pending, then approving via UPDATE
  (the normal admin flow), correctly sets approved_at to now and
  expires_at to now + 1 month, with zero errors.

  Adds approved_at / expires_at to programs and sponsored_jobs, and
  fixes a real bug in the previous trigger version: it referenced OLD
  during what could be evaluated as an INSERT path, which Postgres
  does not safely allow (OLD does not exist on INSERT) — this could
  fail the entire write it was attached to, silently, which likely
  explains approvals not sticking.

  IMPORTANT: copy this ENTIRE file, start to finish, into a fresh SQL
  Editor tab. A syntax error pointing at a bare "IF ..." line usually
  means only part of a file was pasted — this whole file must go in
  as one paste, not a snippet from the middle.
*/

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

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

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN
      NEW.approved_at := now();
      NEW.expires_at := now() + interval '1 month';
    END IF;
  ELSE
    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
      NEW.approved_at := now();
      NEW.expires_at := now() + interval '1 month';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS programs_enforce_review_on_edit ON public.programs;
CREATE TRIGGER programs_enforce_review_on_edit
  BEFORE INSERT OR UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_on_edit();

DROP TRIGGER IF EXISTS sponsored_jobs_enforce_review_on_edit ON public.sponsored_jobs;
CREATE TRIGGER sponsored_jobs_enforce_review_on_edit
  BEFORE INSERT OR UPDATE ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_on_edit();

UPDATE public.programs SET approved_at = now(), expires_at = now() + interval '1 month'
  WHERE status = 'published' AND expires_at IS NULL;
UPDATE public.sponsored_jobs SET approved_at = now(), expires_at = now() + interval '1 month'
  WHERE status = 'published' AND expires_at IS NULL;
