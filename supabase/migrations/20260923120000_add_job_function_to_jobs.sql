/*
  sponsored_jobs.category has always meant EMPLOYMENT TYPE in this app
  (Full time / Part time / Internship / ... — see JOB_CATEGORIES in
  src/lib/listingCategories.ts), kept identical to employment_type
  everywhere in the admin tooling. That's a different concept from a
  job's actual function/department (Design, Engineering, Legal &
  Public Affairs, ...), which never had anywhere real to live — it was
  being fed into the employment-type normalizer and silently discarded
  as "Other". job_function is that missing, separate column.
*/

ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS job_function text;
