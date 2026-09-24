/*
# Job facts: work arrangement + explicit visa status

Adds two optional columns to sponsored_jobs, filled automatically by the
importer / "Detect job details" backfill from what the source says:

  work_arrangement  'onsite' | 'hybrid' | 'remote'   (e.g. Netflix "Work Type: Onsite")
  visa_status       'offered' | 'not_offered'        (NULL = source doesn't say)

visa_status exists because the old visa_sponsorship column is a plain
boolean, which can't tell "not offered" apart from "not mentioned".

Safe to run any time: only adds nullable columns, touches no data.
The site keeps working even before this runs (the job page falls back
to reading these facts from the description).
*/

ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS work_arrangement text,
  ADD COLUMN IF NOT EXISTS visa_status text;

ALTER TABLE public.sponsored_jobs DROP CONSTRAINT IF EXISTS sponsored_jobs_work_arrangement_check;
ALTER TABLE public.sponsored_jobs
  ADD CONSTRAINT sponsored_jobs_work_arrangement_check CHECK (work_arrangement IS NULL OR work_arrangement IN ('onsite', 'hybrid', 'remote'));

ALTER TABLE public.sponsored_jobs DROP CONSTRAINT IF EXISTS sponsored_jobs_visa_status_check;
ALTER TABLE public.sponsored_jobs
  ADD CONSTRAINT sponsored_jobs_visa_status_check CHECK (visa_status IS NULL OR visa_status IN ('offered', 'not_offered'));
