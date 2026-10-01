-- Removes imported "jobs" that were never jobs:
--   * Google Maps / Google consent pages picked up from careers pages
--     ("Before you continue to Google", "Bevor Sie zu Google weitergehen"),
--     whose apply link is consent.google.* or google.*/maps;
--   * blog posts read as jobs, e.g. Gordons Chemist "Father's Day Opt Out"
--     under /blogs/job/ (real jobs posted on a blog are kept).
-- The importer (import-ats-jobs) now filters these out, so they won't come back.
-- Run once in the Supabase SQL editor (one paste, one click).

DELETE FROM public.sponsored_jobs
WHERE origin = 'imported'
  AND (
    official_url ~* '^https?://([^/]*\.)?(consent\.(google|youtube)\.|maps\.google\.|goo\.gl/|maps\.app\.goo\.gl/)'
    OR official_url ~* '^https?://(www\.)?google\.[a-z.]+/(maps|search|url)\M'
    OR title ~* '^\s*(before you continue( to (google|youtube))?|bevor sie (zu (google|youtube) )?weitergehen)\s*$'
    OR description ~* 'deliver and maintain google services'
    OR (
      official_url ~* '/(blogs?|news|articles?)/'
      AND title ~* '\m(opt[- ]?out|opt[- ]?in|unsubscribe|newsletter|gift guide|black friday|cyber monday)\M'
    )
  );
