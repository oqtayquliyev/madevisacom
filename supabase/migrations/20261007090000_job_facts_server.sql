/*
# Job facts computed on the server

The job description detector now runs in the `job-facts` Supabase function
instead of the browser, so its code isn't visible to visitors. Its results
are stored per job:

## sponsored_jobs.facts (jsonb)
{ v, facts: { compensation, experience, workArrangement, employmentType,
  visa, schedule, contractTerm, remoteDetail, department, location,
  postedAt }, html: <cleaned description>, contact: { email, phone,
  website, name } }
Empty until the job is first viewed (the page asks the function) or the
admin "Backfill job facts" runs.

## Trigger a_job_facts_guard
- Companies and visitors can't write `facts` themselves (only the server
  function and admins can), so nobody can fake "visa sponsorship offered".
- Editing a job's description or title clears `facts`, so they're
  recomputed from the new text.

## Trigger z_job_facts_keep_updated_at
Saving `facts` alone doesn't change updated_at — otherwise every job would
look "edited" in the admin inbox after being analysed.
*/

ALTER TABLE public.sponsored_jobs ADD COLUMN IF NOT EXISTS facts jsonb;

CREATE OR REPLACE FUNCTION public.job_facts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Signed-in non-admins (companies) can't set facts directly.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.facts := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.facts END;
  END IF;

  -- New text → old results no longer apply.
  IF TG_OP = 'UPDATE'
     AND (NEW.description IS DISTINCT FROM OLD.description OR NEW.title IS DISTINCT FROM OLD.title)
     AND NEW.facts IS NOT DISTINCT FROM OLD.facts THEN
    NEW.facts := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_job_facts_guard ON public.sponsored_jobs;
CREATE TRIGGER a_job_facts_guard
  BEFORE INSERT OR UPDATE ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.job_facts_guard();

CREATE OR REPLACE FUNCTION public.job_facts_keep_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'facts' - 'updated_at') = (to_jsonb(OLD) - 'facts' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

-- Runs after sponsored_jobs_set_updated_at (triggers fire in name order).
DROP TRIGGER IF EXISTS z_job_facts_keep_updated_at ON public.sponsored_jobs;
CREATE TRIGGER z_job_facts_keep_updated_at
  BEFORE UPDATE ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.job_facts_keep_updated_at();
