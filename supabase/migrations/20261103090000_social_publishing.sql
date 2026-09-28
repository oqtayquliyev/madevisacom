/*
# Social publishing — automated job posts for Facebook, Instagram, LinkedIn, TikTok

Run AFTER 20261102090000_seo_articles_insights.sql. Safe to run more than once.

## Tables
- social_platforms   one row per network: on/off, image size, minimum gap
                     between posts, max posts a day, connection status.
- social_campaigns   WHAT to post and HOW OFTEN: "Fresh jobs" hourly,
                     "Students & internships" hourly, "Accountant roles"…
                     Each has its platforms, format (one list image, up to 3
                     images, or one job), number of jobs, filters, approval.
- social_posts       every planned post: images, caption, links, jobs,
                     validation result, status and the network's reply.
- social_post_jobs   a job can be posted once per network, ever — and is
                     reserved the moment it's planned, so two campaigns can
                     never pick the same job.

## Flow (no browser needed)
pg_cron → social_tick() every 10 min → auto-pipeline { cron: "social" }:
  plan due campaigns → pick fresh jobs → draw images → write captions →
  validate → queue (awaiting approval, or approved) → publish approved
  posts whose time has come.
Credentials live in Supabase secrets (see auto-pipeline/social.ts). A
network without credentials still gets posts, marked "ready to post by
hand", with the images and caption to download and copy.
*/

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.social_platforms (
  platform text PRIMARY KEY CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'tiktok')),
  enabled boolean NOT NULL DEFAULT false,
  size text NOT NULL DEFAULT 'portrait' CHECK (size IN ('portrait', 'square', 'story')),
  min_gap_minutes integer NOT NULL DEFAULT 50 CHECK (min_gap_minutes BETWEEN 5 AND 1440),
  max_per_day integer NOT NULL DEFAULT 24 CHECK (max_per_day BETWEEN 1 AND 100),
  connected boolean NOT NULL DEFAULT false,
  last_check_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.social_platforms (platform, size) VALUES
  ('linkedin', 'portrait'), ('instagram', 'portrait'), ('facebook', 'portrait'), ('tiktok', 'story')
ON CONFLICT (platform) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.social_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'fresh' CHECK (kind IN ('fresh', 'student', 'category', 'company')),
  platforms text[] NOT NULL DEFAULT ARRAY['linkedin', 'instagram', 'facebook'],
  every_minutes integer NOT NULL DEFAULT 60 CHECK (every_minutes BETWEEN 15 AND 10080),
  format text NOT NULL DEFAULT 'list' CHECK (format IN ('list', 'carousel', 'single')),
  jobs_count integer NOT NULL DEFAULT 5 CHECK (jobs_count BETWEEN 1 AND 5),
  min_jobs integer NOT NULL DEFAULT 3 CHECK (min_jobs BETWEEN 1 AND 5),
  categories text[] NOT NULL DEFAULT '{}',   -- job functions or title words, e.g. {accountant, finance}
  countries text[] NOT NULL DEFAULT '{}',    -- ISO codes, empty = all
  salary_only boolean NOT NULL DEFAULT false,
  require_approval boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  next_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.social_campaigns(id) ON DELETE SET NULL,
  platform text NOT NULL REFERENCES public.social_platforms(platform),
  status text NOT NULL DEFAULT 'awaiting_approval'
    CHECK (status IN ('awaiting_approval', 'approved', 'publishing', 'published', 'manual', 'failed', 'rejected', 'expired')),
  format text NOT NULL,
  headline text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ url, width, height }]
  image_key text NOT NULL,                     -- same jobs + layout = same key (no repeated images)
  job_ids uuid[] NOT NULL DEFAULT '{}',
  links jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{ job_id, title, url }]
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  external_id text,
  external_url text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS social_posts_image_once ON public.social_posts (platform, image_key) WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS social_posts_queue_idx ON public.social_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS social_posts_platform_time_idx ON public.social_posts (platform, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS public.social_post_jobs (
  platform text NOT NULL,
  job_id uuid NOT NULL REFERENCES public.sponsored_jobs(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, job_id)
);

-- Admin only (the pipeline uses the service key).
ALTER TABLE public.social_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_jobs ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['social_platforms', 'social_campaigns', 'social_posts', 'social_post_jobs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_admin" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_admin" ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()))', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- Rejecting a post frees its jobs for another post.
CREATE OR REPLACE FUNCTION public.social_posts_release_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('rejected', 'expired') AND OLD.status NOT IN ('rejected', 'expired') THEN
    DELETE FROM public.social_post_jobs WHERE post_id = NEW.id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS social_posts_release_jobs ON public.social_posts;
CREATE TRIGGER social_posts_release_jobs BEFORE UPDATE ON public.social_posts FOR EACH ROW EXECUTE FUNCTION public.social_posts_release_jobs();

-- Starter campaigns (off until you switch them on).
INSERT INTO public.social_campaigns (name, kind, platforms, every_minutes, format, jobs_count, min_jobs, enabled)
SELECT * FROM (VALUES
  ('Fresh jobs', 'fresh', ARRAY['linkedin', 'instagram', 'facebook', 'tiktok'], 60, 'list', 5, 3, false),
  ('Students & internships', 'student', ARRAY['linkedin', 'instagram', 'facebook', 'tiktok'], 60, 'list', 5, 2, false),
  ('Top pick with salary', 'fresh', ARRAY['linkedin', 'facebook'], 240, 'carousel', 3, 3, false)
) AS v(name, kind, platforms, every_minutes, format, jobs_count, min_jobs, enabled)
WHERE NOT EXISTS (SELECT 1 FROM public.social_campaigns);

-- ---------------------------------------------------------------------------
-- Picking jobs
-- ---------------------------------------------------------------------------
-- Fresh (live on MadeVisa in the last 24 h), still open, complete, never
-- posted on this network, one per company; salary first, then logo.
CREATE OR REPLACE FUNCTION public.social_pick_jobs(
  p_platform text, p_count integer, p_kind text DEFAULT 'fresh',
  p_categories text[] DEFAULT '{}', p_countries text[] DEFAULT '{}', p_salary_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
  WITH c AS (
    SELECT s.id, s.title, s.publisher_id, p.name AS company, coalesce(s.image_url, p.logo_url) AS logo,
           s.city, co.name AS country, co.iso_code AS iso, s.remote, s.work_arrangement, s.employment_type, s.experience_level, s.job_function,
           CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END AS salary,
           (s.visa_status = 'offered' OR s.visa_sponsorship) AS visa,
           (s.employment_type IN ('Internship', 'Apprenticeship') OR s.experience_level ILIKE ANY (ARRAY['%intern%', '%entry%', '%student%', '%graduate%', '%junior%'])
             OR s.title ~* '(intern|internship|student|graduate|trainee|werkstudent|apprentice|praktik|stagiaire|junior)') AS student,
           coalesce(s.released_at, s.created_at) AS added_at
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE s.status = 'published' AND NOT s.awaiting_release
      AND (s.expires_at IS NULL OR s.expires_at > now() + interval '2 days')
      AND coalesce(s.released_at, s.created_at) > now() - interval '24 hours'
      AND length(btrim(s.title)) BETWEEN 4 AND 140
      AND (s.city IS NOT NULL OR s.country_id IS NOT NULL OR s.remote OR s.work_arrangement = 'remote')
      AND NOT EXISTS (SELECT 1 FROM public.social_post_jobs x WHERE x.platform = p_platform AND x.job_id = s.id)
      AND (coalesce(array_length(p_countries, 1), 0) = 0 OR co.iso_code = ANY (p_countries))
      AND (coalesce(array_length(p_categories, 1), 0) = 0
           OR s.job_function ILIKE ANY (SELECT '%' || x || '%' FROM unnest(p_categories) x)
           OR s.title ILIKE ANY (SELECT '%' || x || '%' FROM unnest(p_categories) x))
  ),
  f AS (
    SELECT * FROM c
    WHERE (p_kind <> 'student' OR student)
      AND (NOT p_salary_only OR salary IS NOT NULL)
  ),
  one AS (
    SELECT DISTINCT ON (publisher_id) * FROM f
    ORDER BY publisher_id, (salary IS NOT NULL) DESC, (logo IS NOT NULL) DESC, added_at DESC
  )
  SELECT coalesce(jsonb_agg(to_jsonb(one) - 'publisher_id' ORDER BY (salary IS NOT NULL) DESC, (logo IS NOT NULL) DESC, added_at DESC), '[]'::jsonb)
  FROM (SELECT * FROM one ORDER BY (salary IS NOT NULL) DESC, (logo IS NOT NULL) DESC, added_at DESC LIMIT least(greatest(p_count, 1), 5)) one;
$$;
REVOKE ALL ON FUNCTION public.social_pick_jobs(text, integer, text, text[], text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_pick_jobs(text, integer, text, text[], text[], boolean) TO authenticated, service_role;

-- Public job fields for drawing images (/api/og/social). Only live jobs.
CREATE OR REPLACE FUNCTION public.social_image_jobs(p_prefixes text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY array_position(p_prefixes, left(x->>'id', 8))), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'title', s.title, 'company', p.name, 'logo', coalesce(s.image_url, p.logo_url),
      'city', s.city, 'country', co.name, 'iso', co.iso_code, 'remote', s.remote, 'work_arrangement', s.work_arrangement,
      'employment_type', s.employment_type, 'experience', s.experience_level,
      'salary', CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END,
      'visa', (s.visa_status = 'offered' OR s.visa_sponsorship),
      'student', (s.employment_type IN ('Internship', 'Apprenticeship') OR s.title ~* '(intern|internship|student|graduate|trainee|werkstudent|apprentice)'),
      'posted', public.job_posted_at(s.source_posted_at, s.created_at)
    ) AS x
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE left(s.id::text, 8) = ANY (p_prefixes) AND s.status = 'published' AND NOT s.awaiting_release
    LIMIT 5
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.social_image_jobs(text[]) TO anon, authenticated;

-- Still live? (checked again right before publishing)
CREATE OR REPLACE FUNCTION public.social_jobs_still_live(p_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(id), '{}') FROM public.sponsored_jobs
  WHERE id = ANY (p_ids) AND status = 'published' AND NOT awaiting_release AND (expires_at IS NULL OR expires_at > now());
$$;
REVOKE ALL ON FUNCTION public.social_jobs_still_live(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_jobs_still_live(uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.social_platforms WHERE enabled)
     OR (NOT EXISTS (SELECT 1 FROM public.social_campaigns WHERE enabled AND next_at <= now())
         AND NOT EXISTS (SELECT 1 FROM public.social_posts WHERE status = 'approved' AND scheduled_at <= now())) THEN
    RETURN 'nothing due';
  END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'social'));
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.social_tick() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.social_run_now()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'social', 'force', true));
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.social_run_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_run_now() TO authenticated;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('madevisa-social'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('madevisa-social', '*/10 * * * *', 'select public.social_tick()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%).', SQLERRM;
END $$;
