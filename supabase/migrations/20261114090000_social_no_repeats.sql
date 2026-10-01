/*
# Social: no repeated roles

The same role at the same company is often listed under several job ids
(one per location, or re-imported by the ATS). Each id was "new", so the
same card could be posted again. Each posted job now stores a fingerprint
(company + cleaned title); the pipeline skips any role whose fingerprint was
posted on that network in the last 30 days.

Run once in the Supabase SQL Editor, then redeploy:
  supabase functions deploy auto-pipeline --no-verify-jwt
*/

ALTER TABLE public.social_post_jobs ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE INDEX IF NOT EXISTS social_post_jobs_fp_idx
  ON public.social_post_jobs (platform, fingerprint, created_at DESC)
  WHERE fingerprint IS NOT NULL;

-- Backfill what was already posted, so history counts from day one.
UPDATE public.social_post_jobs x
SET fingerprint = lower(btrim(p.name)) || '|' ||
  btrim(regexp_replace(lower(s.title), '[^a-z0-9]+', ' ', 'g'))
FROM public.sponsored_jobs s
JOIN public.program_publishers p ON p.id = s.publisher_id
WHERE x.job_id = s.id AND x.fingerprint IS NULL;
