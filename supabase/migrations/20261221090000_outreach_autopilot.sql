/*
# Outreach autopilot: emails to job seekers by role and to employers, every day, by itself
Run AFTER 20261220090000_emails_docs_cvmatch_social.sql. Paste the whole file once
in the Supabase SQL Editor. Safe to run more than once (your edits to the
templates and settings are kept).

1. CONTACTS KNOW WHO THEY ARE
   email_contacts gets: audience (seeker | employer), role (job title, e.g. "Senior
   Product Designer"), role_key (its core: "product designer"), company, and the
   autopilot's step and last send. Import reads email, name, title/role/position,
   company and country columns (a Consulti / Apollo export works as it is).
   Existing contacts: tagged employer or found online → employer, the rest → seeker.

2. TEMPLATES WRITTEN FOR EACH ROLE
   Five editable templates (Admin → Outreach → Templates, "Autopilot"):
     auto_seeker_1  "Anna, 214 product designer jobs abroad on MadeVisa" + the 3 newest
                    product designer jobs, link to /jobs?q=product designer
     auto_seeker_2  CV match: "how well does your CV fit 214 product designer roles?"
     auto_seeker_3  jobs that state visa sponsorship, for that role
     auto_employer_1  "Bosch: find talent faster on MadeVisa" — post jobs, free
     auto_employer_2  sponsored listing + the employer inbox
   Extra placeholders: {{role}} {{role_title}} {{role_jobs}} {{role_url}} {{role_visa}}
   {{company}}; a line [[jobs]] becomes the 3 newest matching jobs. The numbers and
   jobs are live for each role (cached for 6 hours).
   Every email says why it was sent, has a one-click unsubscribe (also in the email
   headers), the sender's name, and the address and phone in the footer.

3. AUTOPILOT (run_outreach_autopilot, every 10 minutes, 07:00–17:00 UTC)
   Seekers get step 1 → 2 → 3, employers 1 → 2, `gap_days` apart (default 7).
   Daily targets per audience (default 150 seekers, 40 employers), spread over the
   day, never above: each sender's own daily limit, the overall daily cap in
   Sending & limits, and Resend's speed (the outbox sends 8 every 5 seconds).
   Nobody is emailed twice within 3 days by anything, unsubscribed / bounced
   addresses never again, and accounts on MadeVisa are left to the site's emails.

4. SENDERS ON madevisa.com
   oqtay@ · jobs@ · careers@ (job seekers) · talent@ · team@ (employers) · hello@
   at 30 a day each to start (raise them slowly). If the Resend key can't send from
   madevisa.com yet, each email goes out from the main address instead (still
   delivered) — verify the domain in Resend to use them for real.

5. ADMIN NOTIFICATIONS (bell, at most once a day each)
   - More due than the senders can send → "add sender addresses or raise limits".
   - Fewer than 3 days of new contacts left, or none → "add more emails".
   - Many bounces in a day → the autopilot pauses itself and tells you.
*/

SET lock_timeout = '5s';

-- ===========================================================================
-- 1. Contacts: audience, role, company, autopilot state
-- ===========================================================================
ALTER TABLE public.email_contacts ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE public.email_contacts ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.email_contacts ADD COLUMN IF NOT EXISTS role_key text;
ALTER TABLE public.email_contacts ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.email_contacts ADD COLUMN IF NOT EXISTS auto_step integer NOT NULL DEFAULT 0;
ALTER TABLE public.email_contacts ADD COLUMN IF NOT EXISTS auto_last_at timestamptz;
DO $$
BEGIN
  ALTER TABLE public.email_contacts ADD CONSTRAINT email_contacts_audience_check CHECK (audience IS NULL OR audience IN ('seeker', 'employer'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS email_contacts_auto_idx ON public.email_contacts (audience, auto_step, auto_last_at) WHERE status = 'subscribed';
CREATE INDEX IF NOT EXISTS email_contacts_role_idx ON public.email_contacts (role_key);

/* "Senior Product Designer (Payments) at Spotify" → "product designer". */
CREATE OR REPLACE FUNCTION public.mv_role_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(left(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           lower(split_part(split_part(split_part(split_part(regexp_replace(coalesce(p, ''), '\([^)]*\)|\[[^]]*\]', ' ', 'g'), ' at ', 1), ' @ ', 1), '|', 1), ' - ', 1)),
           '[,/&].*$', ''),
           '\m(senior|sr|junior|jr|lead|principal|staff|chief|head of|head|associate|assistant to the|intern|internship|trainee|graduate|entry level|mid level|mid-level|level [0-9]+|i{1,3}|iv|[0-9]+)\M\.?', ' ', 'g'),
           '[^a-z0-9+#. -]', ' ', 'g'),
           '\s+', ' ', 'g'),
           '^[ .-]+|[ .-]+$', '', 'g')), 60), '');
$$;

/* The role as written in a sentence: "product designer", "UX researcher". */
CREATE OR REPLACE FUNCTION public.mv_role_label(p_key text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  w text;
  out text := '';
BEGIN
  IF coalesce(btrim(p_key), '') = '' THEN RETURN NULL; END IF;
  FOREACH w IN ARRAY regexp_split_to_array(btrim(p_key), '\s+') LOOP
    out := out || CASE WHEN out = '' THEN '' ELSE ' ' END
      || CASE WHEN w IN ('ux', 'ui', 'hr', 'it', 'qa', 'seo', 'sql', 'aws', 'bi', 'ai', 'ml', 'crm', 'erp', 'sap', 'php', 'cfo', 'cto', 'ceo', 'coo', 'cmo', 'vp', 'b2b', 'b2c', 'etl', 'gis', 'ppc', 'sem', 'hse', 'hvac', 'rn', 'ehs')
              THEN upper(w)
              WHEN w = 'ios' THEN 'iOS' WHEN w = 'devops' THEN 'DevOps' WHEN w = 'javascript' THEN 'JavaScript' WHEN w = 'typescript' THEN 'TypeScript'
              WHEN w IN ('net', '.net') THEN '.NET'
              ELSE w END;
  END LOOP;
  RETURN out;
END;
$$;

DROP FUNCTION IF EXISTS public.mv_contact_audience(text[], text, text);
/* Who a contact is: employer when tagged so (or found online as a company address), else a job seeker. */
CREATE OR REPLACE FUNCTION public.mv_contact_audience(p_tags text[], p_source text, p_role text, p_email text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- A team inbox (jobs@, hr@, careers@ …) belongs to a company.
    WHEN lower(coalesce(p_email, '')) ~ '^(jobs?|hr|careers?|recruit(ing|ment|er)?|talent|hiring|people|info|contact|office|hello|team|admin|sales|support|work|vacanc(y|ies)|apply|cv|bewerbung|karriere)[._-]?[a-z0-9]*@' THEN 'employer'
    WHEN p_tags && ARRAY['employer', 'employers', 'company', 'companies', 'hiring', 'hr', 'recruiter', 'recruiters', 'talent'] THEN 'employer'
    WHEN coalesce(p_source, '') LIKE 'found%' THEN 'employer'
    WHEN p_tags && ARRAY['seeker', 'seekers', 'job-seeker', 'job-seekers', 'candidate', 'candidates'] THEN 'seeker'
    WHEN coalesce(p_role, '') ~* '\m(recruit|talent acquisition|hiring manager|hr business partner|people partner|head of people|chro)' THEN 'employer'
    ELSE 'seeker' END;
$$;

UPDATE public.email_contacts SET audience = public.mv_contact_audience(tags, source, role, email) WHERE audience IS NULL;
UPDATE public.email_contacts SET role_key = public.mv_role_key(role) WHERE role IS NOT NULL AND role_key IS NULL;

/* Import: [{email, name?, country?, role?, company?}]. p_audience = seeker | employer | auto. */
DROP FUNCTION IF EXISTS public.admin_contacts_import(jsonb, text[], text, text);
CREATE OR REPLACE FUNCTION public.admin_contacts_import(p_rows jsonb, p_tags text[] DEFAULT '{}', p_source text DEFAULT 'import', p_consent text DEFAULT NULL, p_audience text DEFAULT 'auto')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_tags text[] := coalesce((SELECT array_agg(DISTINCT lower(left(btrim(t), 40))) FROM unnest(coalesce(p_tags, '{}')) t WHERE btrim(t) <> ''), '{}');
  v_src text := left(coalesce(nullif(btrim(p_source), ''), 'import'), 60);
  v_aud text := CASE WHEN p_audience IN ('seeker', 'employer') THEN p_audience END;
  total integer;
  bad integer;
  added integer;
  existing integer;
  blocked integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Expected a list.'; END IF;
  IF jsonb_array_length(p_rows) > 50000 THEN RAISE EXCEPTION 'At most 50,000 at a time.'; END IF;

  DROP TABLE IF EXISTS _imp;
  CREATE TEMP TABLE _imp ON COMMIT DROP AS
  SELECT DISTINCT ON (lower(btrim(r->>'email')))
         lower(btrim(r->>'email')) AS email,
         nullif(left(btrim(coalesce(r->>'name', '')), 120), '') AS name,
         nullif(left(btrim(coalesce(r->>'country', '')), 80), '') AS country,
         nullif(left(btrim(coalesce(r->>'role', '')), 120), '') AS role,
         nullif(left(btrim(coalesce(r->>'company', '')), 120), '') AS company
  FROM jsonb_array_elements(p_rows) r
  WHERE r ? 'email';
  SELECT count(*) INTO total FROM _imp;
  DELETE FROM _imp WHERE NOT public.mv_email_ok(email) OR public.mv_email_junk(email);
  GET DIAGNOSTICS bad = ROW_COUNT;

  SELECT count(*) FILTER (WHERE c.status = 'subscribed'), count(*) FILTER (WHERE c.status <> 'subscribed')
    INTO existing, blocked
    FROM _imp i JOIN public.email_contacts c ON lower(c.email) = i.email;

  -- Existing ones: add the tags, fill what is missing. Status never changes here.
  UPDATE public.email_contacts c
  SET tags = (SELECT array_agg(DISTINCT t) FROM unnest(c.tags || v_tags) t),
      name = coalesce(c.name, i.name), country = coalesce(c.country, i.country),
      role = coalesce(c.role, i.role), role_key = coalesce(c.role_key, public.mv_role_key(i.role)),
      company = coalesce(c.company, i.company),
      audience = coalesce(v_aud, c.audience, public.mv_contact_audience(c.tags || v_tags, c.source, coalesce(c.role, i.role), c.email)),
      updated_at = now()
  FROM _imp i WHERE lower(c.email) = i.email;

  INSERT INTO public.email_contacts (email, name, country, tags, source, consent, user_id, role, role_key, company, audience)
  SELECT i.email, i.name, i.country, v_tags, v_src, nullif(left(btrim(coalesce(p_consent, '')), 300), ''),
         (SELECT id FROM auth.users u WHERE lower(u.email) = i.email LIMIT 1),
         i.role, public.mv_role_key(i.role), i.company,
         coalesce(v_aud, public.mv_contact_audience(v_tags, v_src, i.role, i.email))
  FROM _imp i
  WHERE NOT EXISTS (SELECT 1 FROM public.email_contacts c WHERE lower(c.email) = i.email)
  ON CONFLICT ((lower(email))) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;

  RETURN jsonb_build_object('rows', total, 'invalid', bad, 'added', added, 'already', existing, 'unsubscribed', blocked);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_contacts_import(jsonb, text[], text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_contacts_import(jsonb, text[], text, text, text) TO authenticated;

/* Contacts with every filter: p = {search, status, tag, audience, role, country, step, limit, offset}. */
CREATE OR REPLACE FUNCTION public.admin_contacts_find(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  q text := nullif(btrim(coalesce(p->>'search', '')), '');
  like_q text;
  v_status text := nullif(p->>'status', '');
  v_tag text := nullif(p->>'tag', '');
  v_aud text := nullif(p->>'audience', '');
  v_role text := nullif(lower(btrim(coalesce(p->>'role', ''))), '');
  v_country text := nullif(btrim(coalesce(p->>'country', '')), '');
  v_step text := nullif(p->>'step', '');
  v_limit integer := greatest(1, least(coalesce(nullif(p->>'limit', '')::integer, 50), 500));
  v_offset integer := greatest(0, coalesce(nullif(p->>'offset', '')::integer, 0));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  like_q := '%' || replace(replace(coalesce(q, ''), '%', '\%'), '_', '\_') || '%';
  DROP TABLE IF EXISTS _hits;
  CREATE TEMP TABLE _hits ON COMMIT DROP AS
  SELECT c.* FROM public.email_contacts c
  WHERE (q IS NULL OR c.email ILIKE like_q OR c.name ILIKE like_q OR c.country ILIKE like_q OR c.role ILIKE like_q OR c.company ILIKE like_q)
    AND (v_status IS NULL OR c.status = v_status OR (v_status = 'bounced' AND c.status = 'complained'))
    AND (v_tag IS NULL OR v_tag = ANY (c.tags))
    AND (v_aud IS NULL OR c.audience = v_aud)
    AND (v_role IS NULL OR c.role_key = v_role OR c.role_key LIKE '%' || v_role || '%')
    AND (v_country IS NULL OR lower(c.country) = lower(v_country))
    AND (v_step IS NULL OR (v_step = 'new' AND c.auto_step = 0) OR (v_step = 'started' AND c.auto_step > 0) OR (v_step ~ '^[0-9]$' AND c.auto_step = v_step::integer));
  RETURN jsonb_build_object(
    'counts', (SELECT jsonb_build_object(
        'all', count(*),
        'subscribed', count(*) FILTER (WHERE status = 'subscribed'),
        'unsubscribed', count(*) FILTER (WHERE status = 'unsubscribed'),
        'bounced', count(*) FILTER (WHERE status IN ('bounced', 'complained')),
        'accounts', count(*) FILTER (WHERE user_id IS NOT NULL),
        'seekers', count(*) FILTER (WHERE audience = 'seeker'),
        'employers', count(*) FILTER (WHERE audience = 'employer'),
        'with_role', count(*) FILTER (WHERE role_key IS NOT NULL))
      FROM public.email_contacts),
    'tags', coalesce((SELECT jsonb_agg(jsonb_build_object('tag', t, 'n', n) ORDER BY n DESC)
                      FROM (SELECT t, count(*) AS n FROM public.email_contacts, unnest(tags) t GROUP BY t ORDER BY 2 DESC LIMIT 80) x), '[]'::jsonb),
    'roles', coalesce((SELECT jsonb_agg(jsonb_build_object('role', role_key, 'label', public.mv_role_label(role_key), 'n', n) ORDER BY n DESC)
                       FROM (SELECT role_key, count(*) AS n FROM public.email_contacts WHERE role_key IS NOT NULL GROUP BY role_key ORDER BY 2 DESC LIMIT 300) x), '[]'::jsonb),
    'countries', coalesce((SELECT jsonb_agg(jsonb_build_object('country', country, 'n', n) ORDER BY n DESC)
                           FROM (SELECT country, count(*) AS n FROM public.email_contacts WHERE country IS NOT NULL GROUP BY country ORDER BY 2 DESC LIMIT 120) x), '[]'::jsonb),
    'total', (SELECT count(*) FROM _hits),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'email', c.email, 'name', c.name, 'country', c.country, 'tags', to_jsonb(c.tags),
               'source', c.source, 'status', c.status, 'account', c.user_id IS NOT NULL, 'sent_count', c.sent_count,
               'last_sent_at', c.last_sent_at, 'created_at', c.created_at, 'audience', c.audience, 'role', c.role,
               'company', c.company, 'auto_step', c.auto_step, 'auto_last_at', c.auto_last_at) ORDER BY c.created_at DESC)
      FROM (SELECT * FROM _hits ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) c), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_contacts_find(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_contacts_find(jsonb) TO authenticated;

/* Bulk: set audience or role on selected contacts (besides admin_contacts_update's actions). */
CREATE OR REPLACE FUNCTION public.admin_contacts_set(p_ids uuid[], p jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.email_contacts SET
    audience = CASE WHEN p->>'audience' IN ('seeker', 'employer') THEN p->>'audience' ELSE audience END,
    role = CASE WHEN p ? 'role' THEN nullif(left(btrim(p->>'role'), 120), '') ELSE role END,
    role_key = CASE WHEN p ? 'role' THEN public.mv_role_key(p->>'role') ELSE role_key END,
    auto_step = CASE WHEN (p->>'restart')::boolean IS TRUE THEN 0 ELSE auto_step END,
    auto_last_at = CASE WHEN (p->>'restart')::boolean IS TRUE THEN NULL ELSE auto_last_at END,
    updated_at = now()
  WHERE id = ANY (p_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_contacts_set(uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_contacts_set(uuid[], jsonb) TO authenticated;

-- ===========================================================================
-- 2. Live jobs for a role (cached) and the role templates
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.outreach_role_cache (
  role_key text PRIMARY KEY,
  jobs integer NOT NULL DEFAULT 0,
  visa integer NOT NULL DEFAULT 0,
  query text,
  top jsonb NOT NULL DEFAULT '[]'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.outreach_role_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_role_cache FROM anon, authenticated;

/* Live jobs for "product designer": count, how many state sponsorship, the 3 newest, and the search used.
   When the full role finds nothing, its last word is tried ("payments designer" → "designer"). */
CREATE OR REPLACE FUNCTION public.mv_role_jobs(p_role_key text)
RETURNS public.outreach_role_cache
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  r public.outreach_role_cache;
  k text := nullif(btrim(lower(coalesce(p_role_key, ''))), '');
  q text;
  tries text[];
  n integer := 0;
  v integer := 0;
  t jsonb := '[]'::jsonb;
  generic constant text[] := ARRAY['manager', 'specialist', 'officer', 'assistant', 'associate', 'consultant', 'executive', 'coordinator', 'director', 'lead', 'worker', 'staff', 'partner', 'advisor', 'representative', 'agent', 'member', 'owner', 'founder'];
BEGIN
  IF k IS NULL THEN k := ''; END IF;
  SELECT * INTO r FROM public.outreach_role_cache WHERE role_key = k;
  IF FOUND AND r.at > now() - interval '6 hours' THEN RETURN r; END IF;
  tries := ARRAY[k];
  IF k LIKE '% %' AND NOT (regexp_replace(k, '^.* ', '') = ANY (generic)) THEN tries := tries || regexp_replace(k, '^.* ', ''); END IF;
  FOREACH q IN ARRAY tries LOOP
    SELECT count(*), count(*) FILTER (WHERE s.visa_status = 'offered' OR s.visa_sponsorship) INTO n, v
    FROM public.sponsored_jobs s
    WHERE s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now())
      AND (q = '' OR s.title ILIKE '%' || q || '%');
    EXIT WHEN n > 0;
  END LOOP;
  SELECT coalesce(jsonb_agg(j ORDER BY o), '[]'::jsonb) INTO t FROM (
    SELECT jsonb_build_object('id', s.id, 'title', s.title, 'company', p.name, 'logo', p.logo_url, 'city', s.city, 'country', co.name,
             'visa', (s.visa_status = 'offered' OR s.visa_sponsorship),
             'salary', CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END) AS j,
           row_number() OVER (ORDER BY (s.visa_status = 'offered' OR s.visa_sponsorship) DESC, coalesce(s.released_at, s.created_at) DESC) AS o
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now())
      AND (q = '' OR s.title ILIKE '%' || q || '%')
    ORDER BY (s.visa_status = 'offered' OR s.visa_sponsorship) DESC, coalesce(s.released_at, s.created_at) DESC
    LIMIT 3) x;
  INSERT INTO public.outreach_role_cache AS c (role_key, jobs, visa, query, top, at)
  VALUES (k, n, v, nullif(q, ''), t, now())
  ON CONFLICT (role_key) DO UPDATE SET jobs = excluded.jobs, visa = excluded.visa, query = excluded.query, top = excluded.top, at = now()
  RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_role_jobs(text) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_audience_check;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_audience_check CHECK (audience IN ('anyone', 'accounts', 'series', 'autopilot'));

INSERT INTO public.email_templates (key, name, audience, subject, preheader, eyebrow, headline, body, cta_label, cta_url, show_stats) VALUES
('auto_seeker_1', 'Autopilot · seekers 1 — jobs for your role', 'autopilot',
 '{{first_name}}, {{role_jobs}} {{role}} jobs abroad on MadeVisa',
 'The newest {{role}} roles at companies hiring internationally, straight from their career pages.',
 'Jobs for you',
 '{{role_jobs}} {{role}} jobs, live right now',
 'MadeVisa collects jobs from company career pages in 30+ countries and shows which ones offer visa sponsorship. Right now there are **{{role_jobs}} live {{role}} jobs** on it. The newest:

[[jobs]]

- [search] See every {{role}} job, filtered by country, remote and visa
- [target] Upload your CV and see your match score on each one
- [bell] Set a free job alert so new {{role}} roles reach you first',
 'See {{role}} jobs', 'https://madevisa.com/jobs', false),
('auto_seeker_2', 'Autopilot · seekers 2 — CV match', 'autopilot',
 '{{first_name}}, how well does your CV fit {{role_jobs}} {{role}} roles?',
 'Upload your CV once and see your match score on every {{role}} job.',
 'CV match',
 'Your CV against every {{role}} job',
 'Recruiters read your CV next to their job ad. CV match on MadeVisa does the same for you, on every **{{role}}** job at once:

- [target] Your match score on each job, best first
- [puzzle] The skills each ad asks for that your CV doesn’t show yet
- [file] A sponsorship document for jobs abroad, ready to send

It takes a minute: create a free account and upload your CV.',
 'Check my CV', 'https://madevisa.com/cv-match', false),
('auto_seeker_3', 'Autopilot · seekers 3 — visa sponsorship', 'autopilot',
 '{{role_visa}} {{role}} jobs that state visa sponsorship',
 'Roles where the ad itself says the company sponsors visas.',
 'Visa sponsorship',
 '{{role_title}} jobs with visa sponsorship',
 'Most job ads don’t mention visas. These do: **{{role_visa}} live {{role}} jobs** on MadeVisa say in writing that the company sponsors.

[[jobs]]

New ones arrive every day. This is our last email unless you ask for more — set a free job alert and only the jobs you choose will reach you.',
 'See visa-sponsored jobs', 'https://madevisa.com/jobs?visa=1', false),
('auto_employer_1', 'Autopilot · employers 1 — find talent faster', 'autopilot',
 '{{company}}: find candidates for your open roles faster',
 'Post your jobs on MadeVisa for free and reach people ready to relocate.',
 'For employers',
 'Find the right candidates faster',
 'MadeVisa is a job board for people who want to work in another country. **{{jobs_live}} live jobs** are on it today, and candidates apply with CVs matched to each role.

- [briefcase] Post a job for free, or we list it from your careers page
- [target] Candidates see how well their CV matches your job before they apply
- [plane] Say whether you sponsor visas, so the right people apply
- [rocket] Need it fast? A Sponsored listing sits at the top of /jobs for 30 days

Not the right person? Forward this to whoever handles hiring, or unsubscribe below.',
 'Post a job — free', 'https://madevisa.com/submit-job', false),
('auto_employer_2', 'Autopilot · employers 2 — sponsored listing', 'autopilot',
 'Put a {{company}} role in front of candidates this week',
 'A Sponsored listing: top of the jobs page, the homepage and our social posts.',
 'For employers',
 'Get your role seen first',
 'If you have a role that is hard to fill, a **Sponsored listing** puts it at the top of MadeVisa’s jobs page and homepage for 30 days, labelled Sponsored, and in our job posts on social media.

- [award] Reviewed within a day, nothing charged before approval
- [inbox] Candidates who need a visa can send you a ready-made sponsorship proposal
- [chart] Paying never changes company scores or rankings

This is our last email to this address.',
 'See employer options', 'https://madevisa.com/pricing#employers', false)
ON CONFLICT (key) DO NOTHING;

/* One autopilot email for one contact: {subject, html, text, unsub, preheader}. */
CREATE OR REPLACE FUNCTION public.mv_render_auto(p_key text, c public.email_contacts)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.email_templates;
  n public.outreach_numbers := public.outreach_counts();
  rj public.outreach_role_cache;
  first text := public.mv_first_name(c.name);
  role_key text := coalesce(c.role_key, public.mv_role_key(c.role));
  role text;
  role_q text;
  company text := nullif(btrim(coalesce(c.company, '')), '');
  dom text := split_part(lower(c.email), '@', 2);
  labels text[] := string_to_array(split_part(lower(c.email), '@', 2), '.');
  v jsonb;
  subject text;
  headline text;
  pre text;
  body text;
  cta text;
  cta_url text;
  cards text := '';
  cards_text text := '';
  unsub text := 'https://madevisa.com/alerts/unsubscribe?k=all&t=' || c.token::text;
  why text;
BEGIN
  SELECT * INTO t FROM public.email_templates WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'No template %', p_key; END IF;
  rj := public.mv_role_jobs(role_key);
  -- No role, or nothing live for it: speak about jobs abroad in general.
  -- (empty: the sentences read "18,400 jobs abroad", "See jobs").
  role := CASE WHEN role_key IS NOT NULL AND rj.jobs > 0 THEN public.mv_role_label(role_key) ELSE '' END;
  role_q := CASE WHEN role_key IS NOT NULL AND rj.jobs > 0 THEN coalesce(rj.query, role_key) END;
  IF company IS NULL AND dom <> '' AND dom !~ '^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|mail|aol|proton|protonmail|gmx|yandex|ymail|msn|zoho)\.' THEN
    -- jobs@nl.bosch.com → Bosch, hr@acme.co.uk → Acme
    company := initcap(replace(CASE WHEN cardinality(labels) >= 3 AND labels[cardinality(labels) - 1] IN ('co', 'com', 'org', 'net', 'ac', 'gov', 'edu')
                                    THEN labels[cardinality(labels) - 2] ELSE labels[greatest(1, cardinality(labels) - 1)] END, '-', ' '));
  END IF;
  cta_url := t.cta_url
    || CASE WHEN t.cta_url ~ '/jobs' AND role_q IS NOT NULL THEN CASE WHEN t.cta_url LIKE '%?%' THEN '&' ELSE '?' END || 'q=' || public.mv_urlencode(role_q) ELSE '' END;
  cta_url := cta_url || CASE WHEN cta_url LIKE '%?%' THEN '&' ELSE '?' END || 's=auto';
  v := jsonb_build_object(
    'role', role,
    'role_title', upper(left(role, 1)) || substr(role, 2),
    'role_a', CASE WHEN role ~* '^[aeiou]' THEN 'an ' ELSE 'a ' END || role,
    'role_jobs', to_char(CASE WHEN role_q IS NOT NULL THEN rj.jobs ELSE n.jobs_live END, 'FM999,999'),
    'role_visa', to_char(CASE WHEN role_q IS NOT NULL THEN rj.visa ELSE n.jobs_visa END, 'FM999,999'),
    'role_url', cta_url,
    'company', coalesce(company, 'Your team'),
    'jobs_live', to_char(n.jobs_live, 'FM999,999'),
    'jobs_today', to_char(n.jobs_today, 'FM999,999'),
    'jobs_visa', to_char(n.jobs_visa, 'FM999,999'),
    'country', coalesce(c.country, ''));
  subject := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.subject, first), v)));
  subject := btrim(regexp_replace(subject, '[ \t]{2,}', ' ', 'g'));
  subject := upper(left(subject, 1)) || substr(subject, 2);
  headline := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.headline, first), v)));
  headline := btrim(regexp_replace(headline, '[ \t]{2,}', ' ', 'g'));
  headline := upper(left(headline, 1)) || substr(headline, 2);
  pre := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(coalesce(t.preheader, ''), first), v)));
  pre := btrim(regexp_replace(pre, '[ \t]{2,}', ' ', 'g'));
  cta := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.cta_label, first), v)));
  cta := btrim(regexp_replace(cta, '[ \t]{2,}', ' ', 'g'));
  body := regexp_replace(mv_fill(public.mv_fill_name(t.body, first), v), '[ \t]{2,}', ' ', 'g');

  -- [[jobs]] → the newest jobs for this role.
  IF strpos(body, '[[jobs]]') > 0 THEN
    SELECT coalesce(string_agg(public.mv_email_job('https://madevisa.com/jobs/sponsored-' || (j->>'id') || '?s=auto', j->>'title', j->>'company', j->>'logo',
             nullif(concat_ws(', ', j->>'city', j->>'country'), ''),
             CASE WHEN (j->>'visa')::boolean THEN public.mv_email_chip('Visa sponsorship', 'blue') ELSE '' END
             || CASE WHEN j->>'salary' IS NOT NULL THEN public.mv_email_chip(j->>'salary', 'gray') ELSE '' END), ''), ''),
           coalesce(string_agg('• ' || (j->>'title') || ' — ' || (j->>'company') || E'\n  https://madevisa.com/jobs/sponsored-' || (j->>'id'), E'\n'), '')
      INTO cards, cards_text
    FROM jsonb_array_elements(CASE WHEN role_q IS NOT NULL THEN rj.top ELSE (public.mv_role_jobs('')).top END) j;
  END IF;

  why := CASE c.audience
    WHEN 'employer' THEN 'You get this because ' || c.email || ' is published as a business contact' || CASE WHEN company IS NOT NULL THEN ' for ' || company ELSE '' END || ', and MadeVisa helps companies hire internationally. We send at most two emails; unsubscribe and we never write again.'
    ELSE 'You get this because your professional profile' || CASE WHEN role_key IS NOT NULL THEN CASE WHEN role_key ~* '^[aeiou]' THEN ' as an ' ELSE ' as a ' END || public.mv_role_label(role_key) ELSE '' END || ' is public, and MadeVisa helps people find jobs abroad. We send at most three emails; unsubscribe and we never write again.' END;

  RETURN jsonb_build_object(
    'subject', left(subject, 200),
    'preheader', pre,
    'html', public.mv_email_html(
      pre, t.eyebrow, headline,
      CASE WHEN first IS NOT NULL THEN 'Hi ' || mv_esc(first) || ',' END,
      regexp_replace(public.mv_body_html(body), '<p[^>]*>\[\[jobs\]\]</p>', replace(cards, '\', '\\'), 'g'),
      cta, cta_url, why, unsub, NULL),
    'text', public.mv_no_emoji(
      CASE WHEN first IS NOT NULL THEN 'Hi ' || first || E',\n\n' ELSE '' END
      || headline || E'\n\n'
      || replace(regexp_replace(regexp_replace(body, '\*\*', '', 'g'), '(^|\n)- \[[a-z]+\]\s*', '\1- ', 'g'), '[[jobs]]', cards_text)
      || E'\n\n' || cta || ': ' || cta_url
      || E'\n\n' || why || E'\nUnsubscribe: ' || unsub),
    'unsub', unsub
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mv_render_auto(text, public.email_contacts) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 3. Senders on madevisa.com, each for job seekers, employers or both
-- ===========================================================================
ALTER TABLE public.email_senders ADD COLUMN IF NOT EXISTS for_audience text NOT NULL DEFAULT 'any';
DO $$
BEGIN
  ALTER TABLE public.email_senders ADD CONSTRAINT email_senders_for_audience_check CHECK (for_audience IN ('any', 'seeker', 'employer'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.email_senders (from_name, from_email, reply_to, daily_limit, active, for_campaigns, for_series, for_audience, note) VALUES
  ('Oqtay from MadeVisa', 'oqtay@madevisa.com',   'hello@madevisa.com', 30, true, true, true,  'any',      'Personal — job seekers and employers'),
  ('MadeVisa Jobs',       'jobs@madevisa.com',    'hello@madevisa.com', 30, true, true, false, 'seeker',   'Job seekers'),
  ('MadeVisa Careers',    'careers@madevisa.com', 'hello@madevisa.com', 30, true, true, false, 'seeker',   'Job seekers'),
  ('MadeVisa Talent',     'talent@madevisa.com',  'hello@madevisa.com', 30, true, true, false, 'employer', 'Employers'),
  ('The MadeVisa Team',   'team@madevisa.com',    'hello@madevisa.com', 30, true, true, false, 'employer', 'Employers'),
  ('MadeVisa',            'hello@madevisa.com',   'hello@madevisa.com', 30, true, true, true,  'any',      'Default brand sender')
ON CONFLICT ((lower(from_email))) DO NOTHING;

/* The sender with the most room left today for this audience, or NULL when all are full. */
CREATE OR REPLACE FUNCTION public.outreach_pick_sender_for(p_audience text)
RETURNS public.email_senders
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.* FROM public.email_senders e
  WHERE e.active AND e.for_campaigns AND e.for_audience IN ('any', p_audience)
    AND public.sender_sent_today(e.id) < e.daily_limit
  ORDER BY (e.daily_limit - public.sender_sent_today(e.id)) DESC, e.for_audience = p_audience DESC, e.created_at
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.outreach_pick_sender_for(text) FROM PUBLIC, anon, authenticated;

/* Admin → Senders: the audience too. */
CREATE OR REPLACE FUNCTION public.admin_sender_audience(p_id uuid, p_audience text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.email_senders SET for_audience = CASE WHEN p_audience IN ('seeker', 'employer') THEN p_audience ELSE 'any' END, updated_at = now() WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_sender_audience(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sender_audience(uuid, text) TO authenticated;

-- ===========================================================================
-- 4. The autopilot
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.outreach_autopilot (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  seeker_per_day integer NOT NULL DEFAULT 150 CHECK (seeker_per_day BETWEEN 0 AND 100000),
  employer_per_day integer NOT NULL DEFAULT 40 CHECK (employer_per_day BETWEEN 0 AND 100000),
  seeker_steps integer NOT NULL DEFAULT 3 CHECK (seeker_steps BETWEEN 1 AND 3),
  employer_steps integer NOT NULL DEFAULT 2 CHECK (employer_steps BETWEEN 1 AND 2),
  gap_days integer NOT NULL DEFAULT 7 CHECK (gap_days BETWEEN 2 AND 60),
  hour_from integer NOT NULL DEFAULT 7 CHECK (hour_from BETWEEN 0 AND 23),
  hour_to integer NOT NULL DEFAULT 17 CHECK (hour_to BETWEEN 1 AND 24),
  paused_reason text,
  alerts jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  last_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.outreach_autopilot (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.outreach_autopilot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_autopilot FROM anon, authenticated;

/* A bell notification for admins, at most once a day per kind. */
CREATE OR REPLACE FUNCTION public.outreach_alert(p_kind text, p_title text, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE last timestamptz;
BEGIN
  SELECT (alerts->>p_kind)::timestamptz INTO last FROM public.outreach_autopilot WHERE id;
  IF last IS NOT NULL AND last > now() - interval '20 hours' THEN RETURN; END IF;
  UPDATE public.outreach_autopilot SET alerts = alerts || jsonb_build_object(p_kind, now()) WHERE id;
  BEGIN
    INSERT INTO public.notifications (audience, kind, title, body, link) VALUES ('admin', 'outreach_' || p_kind, left(p_title, 200), left(p_body, 1000), '/admin?tab=outreach');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'outreach_alert: %', SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_alert(text, text, text) FROM PUBLIC, anon, authenticated;

/* Contacts the autopilot may email now, for one audience. */
CREATE OR REPLACE FUNCTION public.outreach_due(p_audience text, p_limit integer)
RETURNS SETOF public.email_contacts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.* FROM public.email_contacts c, public.outreach_autopilot a
  WHERE a.id AND c.status = 'subscribed' AND c.audience = p_audience AND c.user_id IS NULL
    AND c.auto_step < CASE WHEN p_audience = 'employer' THEN a.employer_steps ELSE a.seeker_steps END
    AND (c.auto_last_at IS NULL OR c.auto_last_at < now() - make_interval(days => a.gap_days))
    AND (c.last_sent_at IS NULL OR c.last_sent_at < now() - interval '3 days')
    AND public.mv_email_ok(c.email) AND NOT public.mv_email_junk(c.email)
  ORDER BY c.auto_step DESC, c.created_at
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.outreach_due(text, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_outreach_autopilot(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '240s'
AS $$
DECLARE
  a public.outreach_autopilot;
  st public.outreach_settings;
  hr integer := extract(hour FROM now() AT TIME ZONE 'utc')::integer;
  runs_left integer;
  aud text;
  target integer;
  sent_today integer;
  chunk integer;
  budget integer;
  ct public.email_contacts;
  snd public.email_senders;
  rendered jsonb;
  key text;
  n_sent jsonb := '{}'::jsonb;
  n integer;
  full_stop boolean := false;
  due integer;
  fresh integer;
  cap_left integer;
  bounced integer;
  d0 timestamptz := date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
BEGIN
  SELECT * INTO a FROM public.outreach_autopilot WHERE id;
  SELECT * INTO st FROM public.outreach_settings WHERE id;
  IF NOT a.enabled OR NOT st.enabled THEN RETURN jsonb_build_object('skipped', 'off'); END IF;
  IF NOT p_force AND (hr < a.hour_from OR hr >= a.hour_to) THEN RETURN jsonb_build_object('skipped', 'outside hours'); END IF;
  IF coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') = '' THEN RETURN jsonb_build_object('skipped', 'no Resend key'); END IF;

  -- Bounces from the autopilot: never again. Many at once: stop and tell the admin.
  UPDATE public.email_contacts c SET status = 'bounced', updated_at = now()
  FROM public.email_log l
  WHERE l.kind LIKE 'auto_%' AND l.status = 'failed' AND l.status_code = 422 AND l.created_at > now() - interval '2 days'
    AND lower(l.to_email) = lower(c.email) AND c.status = 'subscribed';
  SELECT count(*) INTO bounced FROM public.email_log WHERE kind LIKE 'auto_%' AND status = 'failed' AND status_code = 422 AND created_at >= d0;
  IF bounced >= 25 AND bounced::numeric / greatest(1, (SELECT count(*) FROM public.email_log WHERE kind LIKE 'auto_%' AND created_at >= d0)) > 0.08 THEN
    UPDATE public.outreach_autopilot SET enabled = false, paused_reason = 'Paused: ' || bounced || ' bounced today (over 8%). Clean the list, then switch it on again.', updated_at = now() WHERE id;
    PERFORM public.outreach_alert('bounces', 'Outreach autopilot paused: too many bounces', bounced || ' autopilot emails bounced today. Remove bad addresses (Contacts → status Bounced) and switch the autopilot on again.');
    RETURN jsonb_build_object('skipped', 'bounces');
  END IF;

  runs_left := greatest(1, (a.hour_to - hr) * 6);
  FOREACH aud IN ARRAY ARRAY['seeker', 'employer'] LOOP
    EXIT WHEN full_stop;
    target := CASE aud WHEN 'seeker' THEN a.seeker_per_day ELSE a.employer_per_day END;
    SELECT count(*) INTO sent_today FROM public.email_log WHERE kind = 'auto_' || aud AND created_at >= d0 AND status <> 'skipped';
    budget := public.outreach_budget();
    -- Spread over the rest of the sending window, and never above the overall cap.
    chunk := least(greatest(0, target - sent_today), ceil(greatest(0, target - sent_today)::numeric / runs_left)::integer + 2, budget, 60);
    IF p_force THEN chunk := least(greatest(0, target - sent_today), budget, 60); END IF;
    n := 0;
    FOR ct IN SELECT * FROM public.outreach_due(aud, greatest(chunk, 0)) LOOP
      snd := public.outreach_pick_sender_for(aud);
      IF snd.id IS NULL THEN full_stop := true; EXIT; END IF;
      key := 'auto_' || aud || '_' || (ct.auto_step + 1);
      BEGIN
        rendered := public.mv_render_auto(key, ct);
        PERFORM public.mv_send_outreach(ct.email, rendered, 'auto_' || aud, NULL, 'mv-auto-' || ct.id || '-' || (ct.auto_step + 1), snd);
        UPDATE public.email_contacts SET auto_step = auto_step + 1, auto_last_at = now(), sent_count = sent_count + 1, last_sent_at = now(), updated_at = now() WHERE id = ct.id;
        n := n + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'run_outreach_autopilot %: %', ct.email, SQLERRM;
      END;
    END LOOP;
    n_sent := n_sent || jsonb_build_object(aud, n);

    -- Running low on people to write to?
    SELECT count(*) INTO fresh FROM public.email_contacts
    WHERE status = 'subscribed' AND audience = aud AND user_id IS NULL AND auto_step = 0;
    IF target > 0 AND fresh = 0 THEN
      PERFORM public.outreach_alert('empty_' || aud, 'Outreach: no new ' || aud || ' contacts left',
        'The autopilot has started every ' || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' contact. Import more emails in Admin → Outreach → Contacts to keep it going.');
    ELSIF target > 0 AND fresh < target * 3 THEN
      PERFORM public.outreach_alert('low_' || aud, 'Outreach: ' || fresh || ' new ' || aud || ' contacts left',
        'About ' || greatest(1, fresh / greatest(1, target)) || ' day(s) of new ' || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' contacts left at ' || target || ' a day. Import more emails to keep the autopilot going.');
    END IF;
  END LOOP;

  -- More due than the senders can send?
  SELECT coalesce(sum(greatest(0, e.daily_limit - public.sender_sent_today(e.id))), 0) INTO cap_left FROM public.email_senders e WHERE e.active AND e.for_campaigns;
  SELECT count(*) INTO due FROM public.email_contacts c, public.outreach_autopilot x
  WHERE x.id AND c.status = 'subscribed' AND c.user_id IS NULL AND c.audience IS NOT NULL
    AND c.auto_step < CASE WHEN c.audience = 'employer' THEN x.employer_steps ELSE x.seeker_steps END
    AND (c.auto_last_at IS NULL OR c.auto_last_at < now() - make_interval(days => x.gap_days));
  IF full_stop OR (hr >= a.hour_to - 1 AND due > (SELECT sum(daily_limit) FROM public.email_senders WHERE active AND for_campaigns) * 5) THEN
    PERFORM public.outreach_alert('capacity', 'Outreach: senders are full',
      to_char(due, 'FM999,999') || ' contacts are waiting, and the sender addresses can send ' || to_char((SELECT coalesce(sum(daily_limit), 0) FROM public.email_senders WHERE active AND for_campaigns), 'FM999,999')
      || ' a day. Add more sender addresses or raise their daily limits (slowly: +10–20 a day per address keeps you out of spam).');
  END IF;

  -- The overall daily cap (Sending & limits) stops it before the senders do?
  IF due > 0 AND public.outreach_budget() <= 0 THEN
    PERFORM public.outreach_alert('cap', 'Outreach: the daily email cap is reached',
      'The autopilot stopped for today at the daily cap in Admin → Outreach → Sending & limits (' || st.daily_cap || ' emails a day for everything MadeVisa sends). Raise it if your Resend plan allows more.');
  END IF;

  UPDATE public.outreach_autopilot SET last_run_at = now(), last_note = n_sent::text || CASE WHEN full_stop THEN ' · senders full' ELSE '' END WHERE id;
  RETURN jsonb_build_object('sent', n_sent, 'senders_full', full_stop, 'due', due, 'capacity_left', cap_left);
END;
$$;
REVOKE ALL ON FUNCTION public.run_outreach_autopilot(boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin: the Autopilot tab
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_autopilot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  a public.outreach_autopilot;
  d0 timestamptz := date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  PERFORM public.email_log_settle();
  SELECT * INTO a FROM public.outreach_autopilot WHERE id;
  RETURN jsonb_build_object(
    'settings', to_jsonb(a) - 'alerts' - 'id',
    'budget_today', public.outreach_budget(),
    'today', (SELECT jsonb_build_object(
        'seeker', count(*) FILTER (WHERE kind = 'auto_seeker'),
        'employer', count(*) FILTER (WHERE kind = 'auto_employer'),
        'failed', count(*) FILTER (WHERE status = 'failed'))
      FROM public.email_log WHERE kind LIKE 'auto_%' AND created_at >= d0 AND status <> 'skipped'),
    'days', (SELECT coalesce(jsonb_agg(jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'), 'seeker', s, 'employer', e) ORDER BY d), '[]'::jsonb) FROM (
        SELECT g::date AS d,
               (SELECT count(*) FROM public.email_log WHERE kind = 'auto_seeker' AND created_at::date = g::date AND status <> 'skipped') AS s,
               (SELECT count(*) FROM public.email_log WHERE kind = 'auto_employer' AND created_at::date = g::date AND status <> 'skipped') AS e
        FROM generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') g) x),
    'audiences', (SELECT jsonb_object_agg(aud, jsonb_build_object(
        'contacts', total, 'new', fresh, 'in_progress', mid, 'done', done, 'unsubscribed', unsub, 'bounced', bounced))
      FROM (SELECT c.audience AS aud,
                   count(*) AS total,
                   count(*) FILTER (WHERE c.status = 'subscribed' AND c.user_id IS NULL AND c.auto_step = 0) AS fresh,
                   count(*) FILTER (WHERE c.status = 'subscribed' AND c.auto_step > 0 AND c.auto_step < CASE WHEN c.audience = 'employer' THEN a.employer_steps ELSE a.seeker_steps END) AS mid,
                   count(*) FILTER (WHERE c.auto_step >= CASE WHEN c.audience = 'employer' THEN a.employer_steps ELSE a.seeker_steps END) AS done,
                   count(*) FILTER (WHERE c.status = 'unsubscribed') AS unsub,
                   count(*) FILTER (WHERE c.status IN ('bounced', 'complained')) AS bounced
            FROM public.email_contacts c WHERE c.audience IS NOT NULL GROUP BY c.audience) x),
    'roles', coalesce((SELECT jsonb_agg(jsonb_build_object('role', role_key, 'label', public.mv_role_label(role_key), 'contacts', n, 'emailed', e, 'waiting', w, 'jobs', (SELECT jobs FROM public.outreach_role_cache r WHERE r.role_key = x.role_key)) ORDER BY n DESC)
      FROM (SELECT role_key, count(*) AS n, count(*) FILTER (WHERE auto_step > 0) AS e, count(*) FILTER (WHERE status = 'subscribed' AND auto_step = 0) AS w
            FROM public.email_contacts WHERE audience = 'seeker' AND role_key IS NOT NULL GROUP BY role_key ORDER BY 2 DESC LIMIT 60) x), '[]'::jsonb),
    'senders', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.from_name, 'email', e.from_email, 'audience', e.for_audience, 'limit', e.daily_limit, 'today', public.sender_sent_today(e.id), 'active', e.active) ORDER BY e.for_audience, e.created_at)
      FROM public.email_senders e WHERE e.for_campaigns), '[]'::jsonb),
    'alerts', coalesce((SELECT jsonb_agg(jsonb_build_object('title', title, 'body', body, 'at', created_at) ORDER BY created_at DESC)
      FROM (SELECT * FROM public.notifications WHERE audience = 'admin' AND kind LIKE 'outreach_%' AND created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 6) n), '[]'::jsonb),
    'recent', coalesce((SELECT jsonb_agg(jsonb_build_object('at', l.created_at, 'to', l.to_email, 'kind', l.kind, 'subject', l.subject, 'status', l.status, 'error', l.error,
                                                            'from', (SELECT from_email FROM public.email_senders s WHERE s.id = l.sender_id)) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.email_log WHERE kind LIKE 'auto_%' ORDER BY created_at DESC LIMIT 40) l), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_autopilot() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_autopilot_set(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a public.outreach_autopilot;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.outreach_autopilot SET
    enabled = coalesce((p->>'enabled')::boolean, enabled),
    seeker_per_day = coalesce((p->>'seeker_per_day')::integer, seeker_per_day),
    employer_per_day = coalesce((p->>'employer_per_day')::integer, employer_per_day),
    seeker_steps = coalesce((p->>'seeker_steps')::integer, seeker_steps),
    employer_steps = coalesce((p->>'employer_steps')::integer, employer_steps),
    gap_days = coalesce((p->>'gap_days')::integer, gap_days),
    hour_from = coalesce((p->>'hour_from')::integer, hour_from),
    hour_to = coalesce((p->>'hour_to')::integer, hour_to),
    paused_reason = CASE WHEN (p->>'enabled')::boolean IS TRUE THEN NULL ELSE paused_reason END,
    updated_at = now()
  WHERE id
  RETURNING * INTO a;
  RETURN to_jsonb(a) - 'alerts';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot_set(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_autopilot_set(jsonb) TO authenticated;

/* Preview one autopilot email as a made-up contact: p = {key, name, role, company, email}. */
CREATE OR REPLACE FUNCTION public.admin_autopilot_preview(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c public.email_contacts;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  c.id := gen_random_uuid();
  c.token := gen_random_uuid();
  c.email := coalesce(nullif(p->>'email', ''), 'anna.lee@example.com');
  c.name := nullif(p->>'name', '');
  c.role := nullif(p->>'role', '');
  c.role_key := public.mv_role_key(c.role);
  c.company := nullif(p->>'company', '');
  c.audience := CASE WHEN coalesce(p->>'key', '') LIKE 'auto_employer%' THEN 'employer' ELSE 'seeker' END;
  RETURN public.mv_render_auto(coalesce(nullif(p->>'key', ''), 'auto_seeker_1'), c);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot_preview(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_autopilot_preview(jsonb) TO authenticated;

/* Send one autopilot email to yourself: p = {key, name, role, company, to}. */
CREATE OR REPLACE FUNCTION public.admin_autopilot_test(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  to_email text := lower(btrim(coalesce(p->>'to', '')));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF NOT public.mv_email_ok(to_email) THEN RAISE EXCEPTION 'Check the email address.'; END IF;
  r := public.admin_autopilot_preview(p || jsonb_build_object('email', to_email));
  r := jsonb_set(r, '{subject}', to_jsonb('[Test] ' || (r->>'subject')));
  RETURN public.mv_send_outreach(to_email, r, 'test', NULL, NULL, public.outreach_pick_sender_for(CASE WHEN coalesce(p->>'key', '') LIKE 'auto_employer%' THEN 'employer' ELSE 'seeker' END)) IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot_test(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_autopilot_test(jsonb) TO authenticated;

/* "Send a round now" (ignores the hours, keeps every limit). */
CREATE OR REPLACE FUNCTION public.admin_autopilot_run()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN public.run_outreach_autopilot(true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot_run() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_autopilot_run() TO authenticated;

-- Every 10 minutes; the function itself keeps to the sending hours.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('madevisa-outreach-autopilot');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('madevisa-outreach-autopilot', '*/10 * * * *', $c$select public.run_outreach_autopilot()$c$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
