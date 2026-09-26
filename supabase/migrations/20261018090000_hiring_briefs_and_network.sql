/*
# Hiring Briefs + Network

Safe to run more than once. Adds nothing to existing rows except nullable /
defaulted columns on profiles.

## 1. Hiring Briefs (public.hiring_briefs)

A candidate creates a one-page brief for a job that doesn't mention visa
sponsorship, explaining the visa route and what the employer would have to
do, then sends the link themselves. MadeVisa never contacts the company.

- One brief per user per job; at most 5 new briefs per user per 7 days.
- Owner-only access through RLS. Companies read a brief through
  get_hiring_brief(share_id), which returns only what the candidate chose
  to put on it (no user id, email or phone).
- record_hiring_brief_view(share_id) counts opens by anyone except the
  owner; that's the "company viewed it" signal.
- `status` is what the candidate reports back (sent / replied / interview
  / offer / declined / no_reply). It's the foundation for later linking
  briefs to company response statistics.

## 2. Sponsorship proof (hiring_brief_proof)

Aggregate counts only, from published jobs: how many companies in a
country offered visa sponsorship in the last 90 days, overall and for the
job's function. No individual rows are returned.

## 3. Network (profiles.network_*)

People choose to appear in the public Network directory. Nothing is listed
unless network_visible = true AND the person has a username. The
directory function returns display fields only — never email, phone,
nationality or date fields beyond "member since" month.
*/

-- ---------------------------------------------------------------------
-- 1. Hiring briefs
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hiring_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id text NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.sponsored_jobs(id) ON DELETE SET NULL,
  publisher_id uuid REFERENCES public.program_publishers(id) ON DELETE SET NULL,
  -- Snapshot of the job, so the brief still reads correctly if the job closes.
  job_title text NOT NULL CHECK (char_length(job_title) BETWEEN 1 AND 300),
  company_name text NOT NULL CHECK (char_length(company_name) BETWEEN 1 AND 200),
  job_function text,
  job_city text,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  route_id text NOT NULL CHECK (char_length(route_id) BETWEEN 2 AND 60),
  -- What the candidate chose to show.
  candidate_name text NOT NULL CHECK (char_length(candidate_name) BETWEEN 1 AND 120),
  candidate_headline text CHECK (candidate_headline IS NULL OR char_length(candidate_headline) <= 140),
  candidate_linkedin text CHECK (candidate_linkedin IS NULL OR candidate_linkedin ~ '^https://([a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_%.-]{2,100}/?$'),
  candidate_username text,
  covers text[] NOT NULL DEFAULT '{}'
    CHECK (covers <@ ARRAY['visa-fee', 'relocation', 'translations', 'recognition', 'own-adviser']::text[]),
  remote_first boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR char_length(note) <= 600),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'sent', 'replied', 'interview', 'offer', 'declined', 'no_reply', 'withdrawn')),
  view_count integer NOT NULL DEFAULT 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS hiring_briefs_user_idx ON public.hiring_briefs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hiring_briefs_publisher_idx ON public.hiring_briefs (publisher_id);

DROP TRIGGER IF EXISTS hiring_briefs_set_updated_at ON public.hiring_briefs;
CREATE TRIGGER hiring_briefs_set_updated_at
  BEFORE UPDATE ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Rate limit + protected columns + milestone stamps.
CREATE OR REPLACE FUNCTION public.hiring_briefs_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.hiring_briefs
        WHERE user_id = NEW.user_id AND created_at > now() - interval '7 days') >= 5 THEN
      RAISE EXCEPTION 'You can create up to 5 hiring briefs a week. Try again in a few days.'
        USING ERRCODE = 'P0001';
    END IF;
    NEW.view_count := 0;
    NEW.first_viewed_at := NULL;
    NEW.last_viewed_at := NULL;
    NEW.status := 'created';
  ELSE
    -- Owners can't edit view counters or swap the brief's identity.
    IF NOT public.is_admin() THEN
      NEW.view_count := OLD.view_count;
      NEW.first_viewed_at := OLD.first_viewed_at;
      NEW.last_viewed_at := OLD.last_viewed_at;
      NEW.share_id := OLD.share_id;
      NEW.user_id := OLD.user_id;
      NEW.job_id := OLD.job_id;
      NEW.created_at := OLD.created_at;
    END IF;
    IF NEW.status = 'sent' AND OLD.status = 'created' AND NEW.sent_at IS NULL THEN
      NEW.sent_at := now();
    END IF;
    IF NEW.status IN ('replied', 'interview', 'offer', 'declined') AND NEW.responded_at IS NULL THEN
      NEW.responded_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hiring_briefs_guard ON public.hiring_briefs;
CREATE TRIGGER hiring_briefs_guard
  BEFORE INSERT OR UPDATE ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.hiring_briefs_guard();

ALTER TABLE public.hiring_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hiring_briefs_select_own" ON public.hiring_briefs;
CREATE POLICY "hiring_briefs_select_own" ON public.hiring_briefs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "hiring_briefs_insert_own" ON public.hiring_briefs;
CREATE POLICY "hiring_briefs_insert_own" ON public.hiring_briefs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "hiring_briefs_update_own" ON public.hiring_briefs;
CREATE POLICY "hiring_briefs_update_own" ON public.hiring_briefs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "hiring_briefs_delete_own" ON public.hiring_briefs;
CREATE POLICY "hiring_briefs_delete_own" ON public.hiring_briefs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Public read of one brief by its share id. Only what the candidate chose to show.
DROP FUNCTION IF EXISTS public.get_hiring_brief(text);
CREATE FUNCTION public.get_hiring_brief(p_share_id text)
RETURNS TABLE (
  share_id text,
  job_id uuid,
  publisher_id uuid,
  job_title text,
  company_name text,
  job_function text,
  job_city text,
  country_code text,
  route_id text,
  candidate_name text,
  candidate_headline text,
  candidate_linkedin text,
  candidate_username text,
  covers text[],
  remote_first boolean,
  note text,
  created_at timestamptz,
  is_owner boolean,
  status text,
  view_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    b.share_id, b.job_id, b.publisher_id, b.job_title, b.company_name, b.job_function, b.job_city,
    b.country_code, b.route_id, b.candidate_name, b.candidate_headline, b.candidate_linkedin,
    b.candidate_username, b.covers, b.remote_first, b.note, b.created_at,
    (b.user_id = auth.uid()) AS is_owner,
    -- Status and views are the candidate's own tracking: only the owner sees them.
    CASE WHEN b.user_id = auth.uid() THEN b.status ELSE NULL END,
    CASE WHEN b.user_id = auth.uid() THEN b.view_count ELSE NULL END
  FROM public.hiring_briefs b
  WHERE b.share_id = p_share_id
    AND b.status <> 'withdrawn'
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_hiring_brief(text) TO anon, authenticated;

-- Counts an open by anyone other than the owner.
CREATE OR REPLACE FUNCTION public.record_hiring_brief_view(p_share_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.hiring_briefs
  SET view_count = view_count + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now()
  WHERE share_id = p_share_id
    AND status <> 'withdrawn'
    AND (auth.uid() IS NULL OR user_id <> auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.record_hiring_brief_view(text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Sponsorship proof — aggregate counts only
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hiring_brief_proof(p_country_code text, p_function text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH recent AS (
    SELECT j.publisher_id, j.job_function
    FROM public.sponsored_jobs j
    JOIN public.countries c ON c.id = j.country_id
    WHERE c.iso_code = upper(p_country_code)
      AND j.status = 'published'
      AND (j.visa_sponsorship OR j.visa_status = 'offered')
      AND coalesce(j.source_posted_at, j.approved_at, j.created_at) > now() - interval '90 days'
  )
  SELECT jsonb_build_object(
    'companies', (SELECT count(DISTINCT publisher_id) FROM recent),
    'jobs', (SELECT count(*) FROM recent),
    'function_companies', (SELECT count(DISTINCT publisher_id) FROM recent WHERE p_function IS NOT NULL AND job_function = p_function),
    'function_jobs', (SELECT count(*) FROM recent WHERE p_function IS NOT NULL AND job_function = p_function)
  );
$$;
GRANT EXECUTE ON FUNCTION public.hiring_brief_proof(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Network
-- ---------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS network_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS network_role text,
  ADD COLUMN IF NOT EXISTS network_intent text,
  ADD COLUMN IF NOT EXISTS network_headline text,
  ADD COLUMN IF NOT EXISTS has_sponsored boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_network_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_network_role_check
  CHECK (network_role IS NULL OR network_role IN ('job_seeker', 'hiring_manager', 'recruiter', 'visa_expert'));
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_network_intent_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_network_intent_check
  CHECK (network_intent IS NULL OR network_intent IN ('hiring', 'looking'));
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_network_headline_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_network_headline_check
  CHECK (network_headline IS NULL OR char_length(network_headline) <= 120);

CREATE INDEX IF NOT EXISTS profiles_network_idx ON public.profiles (network_visible) WHERE network_visible;

-- Public directory: display fields only, opted-in people only.
DROP FUNCTION IF EXISTS public.network_directory(text, text, text, integer, integer);
CREATE FUNCTION public.network_directory(
  p_role text DEFAULT NULL,
  p_intent text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 60,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  username text,
  full_name text,
  avatar_url text,
  headline text,
  network_role text,
  network_intent text,
  has_sponsored boolean,
  linkedin_url text,
  lives_in_code text,
  lives_in_name text,
  company_name text,
  company_verified boolean,
  public_applications integer,
  member_since timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.username,
    p.full_name,
    p.avatar_url,
    p.network_headline,
    p.network_role,
    p.network_intent,
    p.has_sponsored,
    p.linkedin_url,
    c.iso_code,
    c.name,
    pub.name,
    (pub.verification_status = 'verified'),
    (SELECT count(*)::int FROM public.application_reports r
      WHERE r.user_id = p.id AND r.is_public AND r.status NOT IN ('clicked', 'withdrawn')),
    date_trunc('month', p.created_at)
  FROM public.profiles p
  LEFT JOIN public.countries c ON c.id = p.country_id
  LEFT JOIN LATERAL (
    SELECT name, verification_status FROM public.program_publishers WHERE owner_id = p.id LIMIT 1
  ) pub ON true
  WHERE p.network_visible
    AND p.username IS NOT NULL
    AND (p_role IS NULL OR p.network_role = p_role)
    AND (p_intent IS NULL OR p.network_intent = p_intent)
    AND (
      p_search IS NULL OR p_search = ''
      OR p.full_name ILIKE '%' || p_search || '%'
      OR p.username ILIKE '%' || p_search || '%'
      OR p.network_headline ILIKE '%' || p_search || '%'
    )
  ORDER BY (p.network_intent IS NOT NULL) DESC, p.created_at DESC
  LIMIT least(greatest(p_limit, 1), 100)
  OFFSET greatest(p_offset, 0);
$$;
GRANT EXECUTE ON FUNCTION public.network_directory(text, text, text, integer, integer) TO anon, authenticated;

-- Headline figures for the Network page header.
CREATE OR REPLACE FUNCTION public.network_counts()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'people', count(*),
    'hiring', count(*) FILTER (WHERE network_intent = 'hiring'),
    'looking', count(*) FILTER (WHERE network_intent = 'looking'),
    'hiring_managers', count(*) FILTER (WHERE network_role = 'hiring_manager'),
    'recruiters', count(*) FILTER (WHERE network_role IN ('recruiter', 'visa_expert'))
  )
  FROM public.profiles
  WHERE network_visible AND username IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION public.network_counts() TO anon, authenticated;

-- Public profile now also returns the Network fields (only when opted in).
DROP FUNCTION IF EXISTS public.get_public_profile_by_username(text);
CREATE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  role text,
  username text,
  linkedin_url text,
  publisher_name text,
  publisher_org_type text,
  publisher_verification_status text,
  network_role text,
  network_intent text,
  network_headline text,
  has_sponsored boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.role,
    p.username,
    p.linkedin_url,
    pub.name,
    pub.org_type::text,
    pub.verification_status,
    CASE WHEN p.network_visible THEN p.network_role END,
    CASE WHEN p.network_visible THEN p.network_intent END,
    CASE WHEN p.network_visible THEN p.network_headline END,
    CASE WHEN p.network_visible THEN p.has_sponsored ELSE false END
  FROM public.profiles p
  LEFT JOIN public.program_publishers pub ON pub.owner_id = p.id
  WHERE p.username = lower(p_username)
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO authenticated, anon;
