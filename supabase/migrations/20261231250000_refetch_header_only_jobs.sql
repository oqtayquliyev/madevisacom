-- Jobs whose "description" is only the page header ("Team Lead III_Forklift Driver Location Wuxi …
-- Date Posted … Apply By … Contract Type … Requisition ID R0000402467") — Caterpillar-style
-- career pages, read before the importer learned to take the text under "Description".
-- They are removed so the next sync imports them again, this time with the full description.
-- (The importer matches existing jobs by id/URL and never re-reads their text.)
--
-- Also: job_function values that are really the page title
-- ("Lead III_Forklift Driver, Wuxi, Jiangsu, China | Caterpillar Careers") are cleared.

DELETE FROM public.sponsored_jobs j
WHERE j.origin = 'imported'
  AND j.status IN ('published', 'pending')
  AND length(regexp_replace(coalesce(j.description, ''), '<[^>]+>', '', 'g')) < 700
  AND j.description ~* 'requisition id|req(uisition)? ?#|job id'
  AND j.description ~* 'date posted|posted on|apply by'
  AND j.description ~* 'contract type|job type|location';

UPDATE public.sponsored_jobs
SET job_function = NULL
WHERE job_function IS NOT NULL
  AND (job_function ~ '\|' OR job_function ~* '\mcareers?\M' OR length(job_function) > 60);
