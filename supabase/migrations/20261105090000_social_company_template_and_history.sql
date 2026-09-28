/*
# Social: company-only template + short history

1. Campaign format "company" — image shows the company logo, name and
   "is hiring"; the role and link are in the caption.
2. Deleting old posts no longer forgets which jobs were posted:
   social_post_jobs keeps its row (post_id becomes null), so a job is still
   never posted twice on the same network.
3. One-off cleanup: keep only the last 3 finished posts. After this the
   auto-pipeline keeps it that way on every run.
Run AFTER 20261104090000_social_images_bucket.sql.
*/

ALTER TABLE public.social_campaigns DROP CONSTRAINT IF EXISTS social_campaigns_format_check;
ALTER TABLE public.social_campaigns ADD CONSTRAINT social_campaigns_format_check CHECK (format IN ('list', 'carousel', 'single', 'company'));

ALTER TABLE public.social_post_jobs ALTER COLUMN post_id DROP NOT NULL;
ALTER TABLE public.social_post_jobs DROP CONSTRAINT IF EXISTS social_post_jobs_post_id_fkey;
ALTER TABLE public.social_post_jobs
  ADD CONSTRAINT social_post_jobs_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE SET NULL;

DELETE FROM public.social_posts
WHERE id IN (
  SELECT id FROM public.social_posts
  WHERE status IN ('published', 'rejected', 'expired', 'failed')
  ORDER BY created_at DESC
  OFFSET 3
);
