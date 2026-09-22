/*
  Adds source_posted_at to sponsored_jobs: the date the job was originally
  posted on the source career site (Roche, Philips, etc.), as opposed to
  created_at which is when MadeVisa imported/inserted the row. Nullable —
  not every source page exposes a posted date, and the ATS import tool
  (supabase/functions/import-ats-jobs) only fills it in when it found one.
*/

ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS source_posted_at timestamptz;
