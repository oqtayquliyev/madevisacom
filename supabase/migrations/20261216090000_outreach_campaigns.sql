/*
# Outreach: contacts, templates, campaigns, Auto Apply email series, per-email dashboard
Run AFTER 20261215090000_emails_and_auto_apply_service.sql. Paste the whole
file once in the Supabase SQL Editor. Safe to run more than once (your edits
to the templates are kept).

1. CONTACTS (email_contacts)
   Everyone you can email: imported lists (email only is enough) and, once a
   campaign goes to them, MadeVisa accounts. Each contact has a status
   (subscribed / unsubscribed / bounced / complained), tags, a country, where
   the address came from, and a token for its unsubscribe link and dashboard.
   An unsubscribed or bounced address is never emailed again by a campaign,
   and importing it again does not resubscribe it.

2. TEMPLATES (email_templates)
   Six to start, editable in Admin → Outreach → Templates:
     promo_cv, promo_auto_apply, promo_fresh_jobs   (anyone)
     nurture_1, nurture_2, nurture_3                (Auto Apply series for free accounts)
   Placeholders: {{first_name}} {{jobs_live}} {{jobs_today}} {{jobs_visa}}
   {{matches}} {{cv_line}} {{country}} {{dashboard_url}}.
   Body: a blank line starts a paragraph, "- " starts a list item, **bold**.

3. CAMPAIGNS (email_campaigns + email_campaign_recipients)
   Pick a template and an audience (imported contacts, accounts, or both;
   by tag, country, no CV / CV / free / Pro; skip anyone emailed in the last
   N days), see the count, send a test, start. Sending is spread out: every
   minute up to `per_minute`, never above the daily cap (shared with every
   other email the site sends, minus a reserve for sign-in codes, job alerts
   and application emails). Pause, resume or cancel at any time.

4. AUTO APPLY SERIES (nurture_state)
   Free accounts with a confirmed email get nurture_1 → nurture_2 → nurture_3,
   12 days apart (setting), once a day at 13:20 Baku time, at most
   `nurture_per_day` a day. Stops for anyone who goes Pro, turns on Auto
   Apply, or turns off "News and tips".

5. EMAIL DASHBOARD (/my?t=<token>)
   Every campaign email links to a small page for that address — no sign-in:
   live jobs, new today, visa sponsorship, and for accounts: CV, matches,
   applications sent, Auto Apply, plan.

6. SENDING FROM ANOTHER ADDRESS
   app_secrets 'email_from_outreach' (e.g. 'Oqtay from MadeVisa <oqtay@news.madevisa.com>')
   and optionally 'resend_api_key_outreach' (a key for a second Resend domain
   or account). Without them campaigns use the normal key and sender.
*/

SET lock_timeout = '5s';

-- ===========================================================================
-- Settings
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.outreach_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  daily_cap integer NOT NULL DEFAULT 100 CHECK (daily_cap BETWEEN 0 AND 1000000),
  reserve integer NOT NULL DEFAULT 25 CHECK (reserve BETWEEN 0 AND 100000),
  per_minute integer NOT NULL DEFAULT 20 CHECK (per_minute BETWEEN 1 AND 2000),
  nurture_enabled boolean NOT NULL DEFAULT true,
  nurture_gap_days integer NOT NULL DEFAULT 12 CHECK (nurture_gap_days BETWEEN 3 AND 60),
  nurture_per_day integer NOT NULL DEFAULT 30 CHECK (nurture_per_day BETWEEN 0 AND 100000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.outreach_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.outreach_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_settings FROM anon, authenticated;

-- ===========================================================================
-- 1. Contacts
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.email_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  name text CHECK (name IS NULL OR char_length(name) <= 120),
  country text CHECK (country IS NULL OR char_length(country) <= 80),
  tags text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'import' CHECK (char_length(source) <= 60),
  consent text CHECK (consent IS NULL OR char_length(consent) <= 300),
  status text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed', 'bounced', 'complained')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  sent_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_contacts_email_idx ON public.email_contacts (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS email_contacts_token_idx ON public.email_contacts (token);
CREATE INDEX IF NOT EXISTS email_contacts_user_idx ON public.email_contacts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_contacts_tags_idx ON public.email_contacts USING gin (tags);
ALTER TABLE public.email_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_contacts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.mv_email_ok(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$ SELECT coalesce(p, '') ~* '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$' AND char_length(p) <= 254; $$;

/* The contact row for an address (made the first time). Links it to an account with that email. */
CREATE OR REPLACE FUNCTION public.mv_contact_for(p_email text, p_name text DEFAULT NULL, p_user uuid DEFAULT NULL, p_source text DEFAULT 'user')
RETURNS public.email_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.email_contacts;
  e text := lower(btrim(p_email));
BEGIN
  SELECT * INTO c FROM public.email_contacts WHERE lower(email) = e;
  IF NOT FOUND THEN
    INSERT INTO public.email_contacts (email, name, user_id, source)
    VALUES (e, nullif(left(btrim(coalesce(p_name, '')), 120), ''), coalesce(p_user, (SELECT id FROM auth.users WHERE lower(email) = e LIMIT 1)), p_source)
    ON CONFLICT ((lower(email))) DO NOTHING;
    SELECT * INTO c FROM public.email_contacts WHERE lower(email) = e;
  ELSIF c.user_id IS NULL THEN
    UPDATE public.email_contacts SET user_id = coalesce(p_user, (SELECT id FROM auth.users WHERE lower(email) = e LIMIT 1))
    WHERE id = c.id RETURNING * INTO c;
  END IF;
  RETURN c;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_contact_for(text, text, uuid, text) FROM PUBLIC, anon, authenticated;

/* Import: [{email, name?, country?}] — pasted list or CSV. Unsubscribed / bounced stay that way. */
CREATE OR REPLACE FUNCTION public.admin_contacts_import(p_rows jsonb, p_tags text[] DEFAULT '{}', p_source text DEFAULT 'import', p_consent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_tags text[] := coalesce((SELECT array_agg(DISTINCT lower(left(btrim(t), 40))) FROM unnest(coalesce(p_tags, '{}')) t WHERE btrim(t) <> ''), '{}');
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
         nullif(left(btrim(coalesce(r->>'country', '')), 80), '') AS country
  FROM jsonb_array_elements(p_rows) r
  WHERE r ? 'email';
  SELECT count(*) INTO total FROM _imp;
  DELETE FROM _imp WHERE NOT public.mv_email_ok(email);
  GET DIAGNOSTICS bad = ROW_COUNT;

  SELECT count(*) FILTER (WHERE c.status = 'subscribed'), count(*) FILTER (WHERE c.status <> 'subscribed')
    INTO existing, blocked
    FROM _imp i JOIN public.email_contacts c ON lower(c.email) = i.email;

  -- Existing ones: add the tags, fill a missing name / country. Status never changes here.
  UPDATE public.email_contacts c
  SET tags = (SELECT array_agg(DISTINCT t) FROM unnest(c.tags || v_tags) t),
      name = coalesce(c.name, i.name), country = coalesce(c.country, i.country), updated_at = now()
  FROM _imp i WHERE lower(c.email) = i.email;

  INSERT INTO public.email_contacts (email, name, country, tags, source, consent, user_id)
  SELECT i.email, i.name, i.country, v_tags, left(coalesce(nullif(btrim(p_source), ''), 'import'), 60), nullif(left(btrim(coalesce(p_consent, '')), 300), ''),
         (SELECT id FROM auth.users u WHERE lower(u.email) = i.email LIMIT 1)
  FROM _imp i
  WHERE NOT EXISTS (SELECT 1 FROM public.email_contacts c WHERE lower(c.email) = i.email)
  ON CONFLICT ((lower(email))) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;

  RETURN jsonb_build_object('rows', total, 'invalid', bad, 'added', added, 'already', existing, 'unsubscribed', blocked);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_contacts_import(jsonb, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_contacts_import(jsonb, text[], text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_contacts_list(p_search text DEFAULT NULL, p_status text DEFAULT NULL, p_tag text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := nullif(btrim(coalesce(p_search, '')), '');
  like_q text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  like_q := '%' || replace(replace(coalesce(q, ''), '%', '\%'), '_', '\_') || '%';
  RETURN jsonb_build_object(
    'counts', (SELECT jsonb_build_object(
        'all', count(*),
        'subscribed', count(*) FILTER (WHERE status = 'subscribed'),
        'unsubscribed', count(*) FILTER (WHERE status = 'unsubscribed'),
        'bounced', count(*) FILTER (WHERE status IN ('bounced', 'complained')),
        'accounts', count(*) FILTER (WHERE user_id IS NOT NULL))
      FROM public.email_contacts),
    'tags', coalesce((SELECT jsonb_agg(jsonb_build_object('tag', t, 'n', n) ORDER BY n DESC)
                      FROM (SELECT t, count(*) AS n FROM public.email_contacts, unnest(tags) t GROUP BY t ORDER BY 2 DESC LIMIT 60) x), '[]'::jsonb),
    'total', (SELECT count(*) FROM public.email_contacts c
              WHERE (q IS NULL OR c.email ILIKE like_q OR c.name ILIKE like_q OR c.country ILIKE like_q)
                AND (p_status IS NULL OR p_status = '' OR c.status = p_status OR (p_status = 'bounced' AND c.status = 'complained'))
                AND (p_tag IS NULL OR p_tag = '' OR p_tag = ANY (c.tags))),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'email', c.email, 'name', c.name, 'country', c.country, 'tags', to_jsonb(c.tags),
               'source', c.source, 'status', c.status, 'account', c.user_id IS NOT NULL, 'sent_count', c.sent_count,
               'last_sent_at', c.last_sent_at, 'created_at', c.created_at) ORDER BY c.created_at DESC)
      FROM (SELECT * FROM public.email_contacts c
            WHERE (q IS NULL OR c.email ILIKE like_q OR c.name ILIKE like_q OR c.country ILIKE like_q)
              AND (p_status IS NULL OR p_status = '' OR c.status = p_status OR (p_status = 'bounced' AND c.status = 'complained'))
              AND (p_tag IS NULL OR p_tag = '' OR p_tag = ANY (c.tags))
            ORDER BY c.created_at DESC
            LIMIT greatest(1, least(coalesce(p_limit, 50), 500)) OFFSET greatest(0, coalesce(p_offset, 0))) c), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_contacts_list(text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_contacts_list(text, text, text, integer, integer) TO authenticated;

/* Bulk actions on selected contacts: unsubscribe | resubscribe | delete | add_tag | remove_tag. */
CREATE OR REPLACE FUNCTION public.admin_contacts_update(p_ids uuid[], p_action text, p_tag text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
  t text := lower(left(btrim(coalesce(p_tag, '')), 40));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p_action = 'unsubscribe' THEN
    UPDATE public.email_contacts SET status = 'unsubscribed', unsubscribed_at = now(), updated_at = now() WHERE id = ANY (p_ids) AND status = 'subscribed';
  ELSIF p_action = 'resubscribe' THEN
    -- Only for people who asked you to put them back.
    UPDATE public.email_contacts SET status = 'subscribed', unsubscribed_at = NULL, updated_at = now() WHERE id = ANY (p_ids) AND status = 'unsubscribed';
  ELSIF p_action = 'delete' THEN
    DELETE FROM public.email_contacts WHERE id = ANY (p_ids);
  ELSIF p_action = 'add_tag' AND t <> '' THEN
    UPDATE public.email_contacts SET tags = (SELECT array_agg(DISTINCT x) FROM unnest(tags || t) x), updated_at = now() WHERE id = ANY (p_ids);
  ELSIF p_action = 'remove_tag' AND t <> '' THEN
    UPDATE public.email_contacts SET tags = array_remove(tags, t), updated_at = now() WHERE id = ANY (p_ids);
  ELSE
    RAISE EXCEPTION 'Unknown action.';
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_contacts_update(uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_contacts_update(uuid[], text, text) TO authenticated;

-- ===========================================================================
-- 2. Templates
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.email_templates (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  name text NOT NULL,
  audience text NOT NULL DEFAULT 'anyone' CHECK (audience IN ('anyone', 'accounts', 'series')),
  subject text NOT NULL CHECK (char_length(subject) <= 200),
  preheader text CHECK (preheader IS NULL OR char_length(preheader) <= 200),
  eyebrow text CHECK (eyebrow IS NULL OR char_length(eyebrow) <= 60),
  headline text NOT NULL CHECK (char_length(headline) <= 200),
  body text NOT NULL CHECK (char_length(body) <= 6000),
  cta_label text NOT NULL DEFAULT 'Open MadeVisa' CHECK (char_length(cta_label) <= 60),
  cta_url text NOT NULL DEFAULT 'https://madevisa.com/cv-match' CHECK (cta_url ~ '^https://'),
  show_stats boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_templates FROM anon, authenticated;

INSERT INTO public.email_templates (key, name, audience, subject, preheader, eyebrow, headline, body, cta_label, cta_url, show_stats) VALUES
('promo_cv', 'Upload your CV → CV Match', 'anyone',
 '{{first_name}}, {{jobs_today}} fresh jobs landed today 🚀 Which ones fit you?',
 'Upload your CV once — see your best matches in seconds 🎯',
 'CV Match',
 'Your next job abroad might already be here 🌍',
 'We just added **{{jobs_today}} fresh jobs** 🆕 — **{{jobs_live}}** are live right now, and **{{jobs_visa}}** of them offer visa sponsorship ✈️.

Upload your CV once and CV Match scores you against every one of them:

- 🎯 Your best matches first, with your score on each job
- 🧩 The skills each ad asks for that your CV doesn’t show yet
- ⚡ Auto Apply: MadeVisa applies to your top matches for you

It takes about 10 seconds. No forms, no account needed to see your first matches 🙌',
 'Upload my CV ✨', 'https://madevisa.com/cv-match?s=cmp', true),

('promo_auto_apply', 'Auto Apply: hundreds of jobs, one click', 'anyone',
 '🤖 Stop applying one by one — let MadeVisa apply for you',
 'Your CV + your answers → applications sent every day for a month 📬',
 'Auto Apply',
 'Hundreds of jobs. One click. ⚡',
 'Job hunting abroad is a numbers game 🎲 — the more good applications you send, the more replies you get.

With **Auto Apply**, MadeVisa sends applications to the jobs your CV matches best, **every day for a month**, using your CV and the answers you give once:

- 📬 An email the moment each application is sent
- 🎯 Only jobs your CV matches well — you choose the minimum match
- 🌍 The countries and roles you pick
- ⏸️ Pause or stop any time

**{{jobs_live}} live jobs** are waiting to be matched with your CV 👀',
 'Start with my CV 🚀', 'https://madevisa.com/cv-match?s=cmp#auto-apply', true),

('promo_fresh_jobs', 'Fresh jobs today — be an early applicant', 'anyone',
 '🔥 {{jobs_today}} new jobs today — be one of the first to apply',
 'Early applications get read first ⏰',
 'Fresh today',
 'Early applicants get noticed first ⏰',
 'Recruiters often read the first applications most closely 👀 Here’s what’s new on MadeVisa:

- 🆕 **{{jobs_today}}** jobs added in the last 24 hours
- ✈️ **{{jobs_visa}}** live jobs with visa sponsorship
- 🌍 **{{jobs_live}}** live jobs from company career pages

Upload your CV and we’ll show you the ones you match — then Auto Apply can send your applications while you sleep 😴💼',
 'Show my matches 🎯', 'https://madevisa.com/cv-match?s=cmp', true),

('nurture_1', 'Auto Apply series · 1 — Meet Auto Apply', 'series',
 '{{first_name}}, let MadeVisa apply to jobs for you this month ⚡',
 'Your best matches, applied to every day — you just watch the replies come in 📬',
 'Auto Apply',
 'Meet Auto Apply 🤖',
 '{{cv_line}}

Here’s how Auto Apply works:

- 1️⃣ Pick your job titles, countries and the lowest match you’d accept
- 2️⃣ Answer the usual application questions **once**
- 3️⃣ MadeVisa applies to your best matches every day for a month 🚀

You get an email for every application, and employers reply straight to you 💌',
 'Turn on Auto Apply ⚡', 'https://madevisa.com/cv-match?s=aa1#auto-apply', false),

('nurture_2', 'Auto Apply series · 2 — More applications, on autopilot', 'series',
 '📈 More applications, more interviews — on autopilot',
 'Applying takes hours. Auto Apply takes 2 minutes to set up ⏱️',
 'Auto Apply',
 'You prepare for interviews. We send the applications 💼',
 'Most people stop after a handful of applications — it simply takes too long ⏳

{{cv_line}}

With Auto Apply you set it up once (about 2 minutes), and MadeVisa keeps applying to your best matches every day:

- 🎯 Only jobs your CV matches well
- ✈️ Includes jobs with visa sponsorship
- 📬 One email per application, so you always know what went out',
 'See my matches 🎯', 'https://madevisa.com/cv-match?s=aa2#auto-apply', false),

('nurture_3', 'Auto Apply series · 3 — Your shortlist is waiting', 'series',
 '⏳ {{first_name}}, your best matches won’t stay open forever',
 'Jobs close fast — let Auto Apply get your applications in early 🏃',
 'Last reminder',
 'Your shortlist is waiting 🎯',
 '{{cv_line}}

New jobs arrive every day, and the good ones close fast 🏃 MadeVisa Pro includes:

- ⚡ **Auto Apply** for one month — applications sent for you, every day
- 📊 The full CV match report on every job
- 📄 Sponsorship documents for employers who need a nudge

This is the last email in this series — we won’t keep nudging you 🙂',
 'Get Pro & Auto Apply 🚀', 'https://madevisa.com/pricing?s=aa3#pro', false)
ON CONFLICT (key) DO NOTHING;

/* Numbers for {{placeholders}} — cached for 10 minutes (counting the whole catalogue for every email would be slow). */
CREATE TABLE IF NOT EXISTS public.outreach_numbers (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  jobs_live integer NOT NULL DEFAULT 0,
  jobs_today integer NOT NULL DEFAULT 0,
  jobs_visa integer NOT NULL DEFAULT 0,
  at timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO public.outreach_numbers (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.outreach_numbers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_numbers FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.outreach_counts()
RETURNS public.outreach_numbers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.outreach_numbers;
BEGIN
  SELECT * INTO r FROM public.outreach_numbers;
  IF r.at < now() - interval '10 minutes' THEN
    UPDATE public.outreach_numbers SET
      jobs_live = (SELECT count(*) FROM public.sponsored_jobs WHERE status = 'published' AND NOT awaiting_release AND (expires_at IS NULL OR expires_at > now())),
      jobs_today = (SELECT count(*) FROM public.sponsored_jobs WHERE status = 'published' AND NOT awaiting_release AND coalesce(released_at, created_at) > now() - interval '24 hours'),
      jobs_visa = (SELECT count(*) FROM public.sponsored_jobs WHERE status = 'published' AND NOT awaiting_release AND (expires_at IS NULL OR expires_at > now()) AND (visa_status = 'offered' OR visa_sponsorship)),
      at = now()
    RETURNING * INTO r;
  END IF;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_counts() FROM PUBLIC, anon, authenticated;

/* Live jobs whose title fits the person's CV / profile titles. */
CREATE OR REPLACE FUNCTION public.mv_match_count(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE titles text[];
BEGIN
  IF p_user IS NULL THEN RETURN 0; END IF;
  SELECT coalesce(array_agg(x), '{}') INTO titles FROM jsonb_array_elements_text(public.for_you_terms(p_user)->'titles') x;
  IF coalesce(array_length(titles, 1), 0) = 0 THEN RETURN 0; END IF;
  RETURN (SELECT count(*) FROM public.sponsored_jobs s
          WHERE s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now())
            AND lower(s.title || ' ' || coalesce(s.job_function, '')) LIKE ANY (SELECT '%' || t || '%' FROM unnest(titles) t));
EXCEPTION WHEN OTHERS THEN RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_match_count(uuid) FROM PUBLIC, anon, authenticated;

/* Body markup → HTML: blank line = paragraph, "- " = list item, **bold**. Escapes everything else. */
CREATE OR REPLACE FUNCTION public.mv_body_html(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  blk text;
  ln text;
  out text := '';
  items text;
  para text;
BEGIN
  FOREACH blk IN ARRAY regexp_split_to_array(btrim(coalesce(p, ''), E' \n\r\t'), E'\\n\\s*\\n') LOOP
    blk := btrim(blk, E' \n\r\t');
    CONTINUE WHEN blk = '';
    items := '';
    para := '';
    FOREACH ln IN ARRAY regexp_split_to_array(blk, E'\\n') LOOP
      ln := btrim(ln);
      CONTINUE WHEN ln = '';
      IF ln LIKE '- %' THEN
        IF para <> '' THEN
          out := out || '<p style="margin:0 0 16px;font-size:15.5px;line-height:1.65;color:#334155">' || para || '</p>';
          para := '';
        END IF;
        items := items || '<tr><td style="padding:9px 14px;font-size:15px;line-height:1.5;color:#0f172a;border-bottom:1px solid #eef2f7">'
                 || regexp_replace(mv_esc(substr(ln, 3)), '\*\*(.+?)\*\*', '<b>\1</b>', 'g') || '</td></tr>';
      ELSE
        IF items <> '' THEN
          out := out || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px">' || items || '</table>';
          items := '';
        END IF;
        para := para || CASE WHEN para <> '' THEN '<br>' ELSE '' END || regexp_replace(mv_esc(ln), '\*\*(.+?)\*\*', '<b style="color:#0f172a">\1</b>', 'g');
      END IF;
    END LOOP;
    IF items <> '' THEN
      out := out || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px">' || items || '</table>';
    END IF;
    IF para <> '' THEN
      out := out || '<p style="margin:0 0 16px;font-size:15.5px;line-height:1.65;color:#334155">' || para || '</p>';
    END IF;
  END LOOP;
  RETURN out;
END;
$$;

/* Fill {{placeholders}} (plain text in, plain text out). */
CREATE OR REPLACE FUNCTION public.mv_fill(p text, v jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  out text := coalesce(p, '');
BEGIN
  FOR k IN SELECT jsonb_object_keys(v) LOOP
    out := replace(out, '{{' || k || '}}', coalesce(v->>k, ''));
  END LOOP;
  RETURN regexp_replace(out, '\{\{[a-z_]+\}\}', '', 'g');
END;
$$;

/* One email from a template, for one address. Returns {subject, html, text, preheader}. */
CREATE OR REPLACE FUNCTION public.mv_render_template(p_key text, p_email text, p_name text DEFAULT NULL, p_user uuid DEFAULT NULL, p_token uuid DEFAULT NULL, p_country text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.email_templates;
  n public.outreach_numbers := public.outreach_counts();
  uid uuid := coalesce(p_user, (SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1));
  first text;
  matches integer := 0;
  has_cv boolean := false;
  cv_line text;
  dash text;
  unsub text;
  v jsonb;
  stats text := '';
  subject text;
  body text;
BEGIN
  SELECT * INTO t FROM public.email_templates WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'No template %', p_key; END IF;
  first := nullif(split_part(btrim(coalesce(nullif(p_name, ''), (SELECT full_name FROM public.profiles WHERE id = uid), '')), ' ', 1), '');
  IF uid IS NOT NULL THEN
    has_cv := EXISTS (SELECT 1 FROM public.user_cvs WHERE user_id = uid);
    matches := public.mv_match_count(uid);
  END IF;
  cv_line := CASE
    WHEN has_cv AND matches > 0 THEN 'Good news 🎉 Your CV matches the titles of **' || to_char(matches, 'FM999,999') || ' live jobs** on MadeVisa right now.'
    WHEN has_cv THEN 'Your CV is on MadeVisa ✅ — new jobs that fit it arrive every day.'
    ELSE 'First step: upload your CV 📄 — it takes about 10 seconds, and you instantly see the jobs you match best.' END;
  dash := 'https://madevisa.com/my?t=' || coalesce(p_token::text, '');
  v := jsonb_build_object(
    'first_name', coalesce(first, 'Hi there'),
    'jobs_live', to_char(n.jobs_live, 'FM999,999'),
    'jobs_today', to_char(n.jobs_today, 'FM999,999'),
    'jobs_visa', to_char(n.jobs_visa, 'FM999,999'),
    'matches', to_char(matches, 'FM999,999'),
    'cv_line', cv_line,
    'country', coalesce(p_country, ''),
    'dashboard_url', dash);
  -- "Hi there, …" reads oddly in a subject; drop the name part when there's no name.
  subject := mv_fill(CASE WHEN first IS NULL THEN regexp_replace(t.subject, '^\{\{first_name\}\},\s*', '') ELSE t.subject END, v);
  subject := upper(left(subject, 1)) || substr(subject, 2);
  body := mv_fill(t.body, v);
  unsub := CASE WHEN p_token IS NOT NULL THEN 'https://madevisa.com/alerts/unsubscribe?k=all&t=' || p_token::text END;

  IF t.show_stats THEN
    stats := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr>'
      || (SELECT string_agg('<td width="33%" style="padding:0 4px"><div style="background:' || c || ';border-radius:14px;padding:14px 10px;text-align:center">'
           || '<div style="font-size:22px;line-height:1.1;font-weight:800;color:#0f172a">' || num || '</div>'
           || '<div style="margin-top:4px;font-size:12px;color:#475569">' || lbl || '</div></div></td>', '' ORDER BY o)
          FROM (VALUES (1, '#eff6ff', to_char(n.jobs_live, 'FM999,999'), '🌍 Live jobs'),
                       (2, '#ecfdf5', to_char(n.jobs_today, 'FM999,999'), '🆕 New today'),
                       (3, '#fef3c7', to_char(n.jobs_visa, 'FM999,999'), '✈️ Visa sponsorship')) s(o, c, num, lbl))
      || '</tr></table>';
  END IF;

  RETURN jsonb_build_object(
    'subject', left(subject, 200),
    'preheader', mv_fill(t.preheader, v),
    'html', public.mv_email_html(
      mv_fill(t.preheader, v), t.eyebrow, mv_fill(t.headline, v),
      'Hi ' || mv_esc(coalesce(first, 'there')) || ' 👋',
      stats || public.mv_body_html(body)
        || CASE WHEN p_token IS NOT NULL THEN '<p style="margin:6px 0 0;font-size:13.5px;color:#64748b">📊 <a href="' || mv_esc(dash) || '" style="color:#1d4ed8;font-weight:600">Your MadeVisa dashboard</a> — your jobs, matches and applications in one place.</p>' ELSE '' END,
      t.cta_label, t.cta_url,
      CASE WHEN uid IS NOT NULL THEN 'You get this because you have a MadeVisa account.' ELSE 'You get this because your address is on the MadeVisa mailing list.' END,
      unsub, NULL),
    'text', mv_fill(t.headline, v) || E'\n\n' || regexp_replace(body, '\*\*', '', 'g') || E'\n\n' || t.cta_label || ': ' || t.cta_url
            || CASE WHEN p_token IS NOT NULL THEN E'\n\nYour dashboard: ' || dash || E'\nUnsubscribe: ' || unsub ELSE '' END,
    'unsub', unsub
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mv_render_template(text, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

/* Campaign / series email: the outreach sender when set, logged like every other email. */
CREATE OR REPLACE FUNCTION public.mv_send_outreach(p_to text, p_rendered jsonb, p_kind text, p_user uuid DEFAULT NULL, p_idempotency text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key text;
  sender text;
  rid bigint;
  hdr jsonb;
  body jsonb;
BEGIN
  SELECT coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'resend_api_key')) INTO key;
  IF coalesce(key, '') = '' THEN RETURN NULL; END IF;
  SELECT coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'email_from_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'email_from'), 'MadeVisa <onboarding@resend.dev>') INTO sender;
  hdr := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json');
  IF p_idempotency IS NOT NULL THEN hdr := hdr || jsonb_build_object('Idempotency-Key', left(p_idempotency, 250)); END IF;
  body := jsonb_build_object('from', sender, 'to', jsonb_build_array(p_to), 'subject', p_rendered->>'subject',
                             'html', p_rendered->>'html', 'text', p_rendered->>'text', 'reply_to', 'hello@madevisa.com',
                             'tags', jsonb_build_array(jsonb_build_object('name', 'kind', 'value', p_kind)));
  IF p_rendered->>'unsub' IS NOT NULL THEN
    body := body || jsonb_build_object('headers', jsonb_build_object('List-Unsubscribe', '<' || (p_rendered->>'unsub') || '>', 'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
  END IF;
  SELECT net.http_post(url := 'https://api.resend.com/emails', headers := hdr, body := body, timeout_milliseconds := 10000) INTO rid;
  INSERT INTO public.email_log (user_id, to_email, kind, subject, request_id) VALUES (p_user, p_to, p_kind, left(p_rendered->>'subject', 300), rid);
  RETURN rid;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_send_outreach(text, jsonb, text, uuid, text) FROM PUBLIC, anon, authenticated;

/* Emails still allowed today for campaigns and the series (cap − reserve − already sent today, UTC). */
CREATE OR REPLACE FUNCTION public.outreach_budget()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(0, s.daily_cap - s.reserve
         - (SELECT count(*) FROM public.email_log WHERE status <> 'skipped' AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')::integer)
  FROM public.outreach_settings s;
$$;
REVOKE ALL ON FUNCTION public.outreach_budget() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_templates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.audience DESC, t.key) FROM public.email_templates t), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_templates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_templates() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_template_save(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.email_templates;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.email_templates (key, name, audience, subject, preheader, eyebrow, headline, body, cta_label, cta_url, show_stats)
  VALUES (lower(p->>'key'), coalesce(nullif(p->>'name', ''), p->>'key'), coalesce(nullif(p->>'audience', ''), 'anyone'), p->>'subject', nullif(p->>'preheader', ''), nullif(p->>'eyebrow', ''),
          p->>'headline', p->>'body', coalesce(nullif(p->>'cta_label', ''), 'Open MadeVisa'), coalesce(nullif(p->>'cta_url', ''), 'https://madevisa.com/cv-match'), coalesce((p->>'show_stats')::boolean, true))
  ON CONFLICT (key) DO UPDATE SET
    name = excluded.name, subject = excluded.subject, preheader = excluded.preheader, eyebrow = excluded.eyebrow,
    headline = excluded.headline, body = excluded.body, cta_label = excluded.cta_label, cta_url = excluded.cta_url,
    show_stats = excluded.show_stats, updated_at = now()
  RETURNING * INTO t;
  RETURN to_jsonb(t);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_save(jsonb) TO authenticated;

/* What the template looks like for the admin (preview) — rendered for the admin's own address. */
CREATE OR REPLACE FUNCTION public.admin_template_preview(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c public.email_contacts;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  c := public.mv_contact_for((SELECT email FROM auth.users WHERE id = auth.uid()), NULL, auth.uid(), 'admin');
  RETURN public.mv_render_template(p_key, c.email, c.name, c.user_id, c.token, c.country);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_preview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_preview(text) TO authenticated;

/* Send one template now to one address (a test). Doesn't count against a campaign. */
CREATE OR REPLACE FUNCTION public.admin_template_test(p_key text, p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.email_contacts;
  r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF NOT public.mv_email_ok(p_email) THEN RAISE EXCEPTION 'Check the email address.'; END IF;
  -- A test never adds the address to the mailing list: an existing contact's links are used, otherwise none.
  SELECT * INTO c FROM public.email_contacts WHERE lower(email) = lower(btrim(p_email));
  r := public.mv_render_template(p_key, lower(btrim(p_email)), c.name, c.user_id, c.token, c.country);
  r := jsonb_set(r, '{subject}', to_jsonb('[Test] ' || (r->>'subject')));
  RETURN public.mv_send_outreach(lower(btrim(p_email)), r, 'test', c.user_id) IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_test(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_test(text, text) TO authenticated;

-- ===========================================================================
-- 3. Campaigns
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  template_key text NOT NULL REFERENCES public.email_templates(key) ON UPDATE CASCADE,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'paused', 'done', 'cancelled')),
  total integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_campaigns FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.email_contacts(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  error text,
  request_id bigint,
  sent_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_recipients_one_idx ON public.email_campaign_recipients (campaign_id, lower(email));
CREATE INDEX IF NOT EXISTS email_campaign_recipients_queue_idx ON public.email_campaign_recipients (campaign_id, id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS email_campaign_recipients_req_idx ON public.email_campaign_recipients (request_id) WHERE request_id IS NOT NULL;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_campaign_recipients FROM anon, authenticated;

/* Who an audience is. p:
   {source: 'contacts' | 'accounts' | 'both',
    tags: [..]            contacts with ANY of these tags (contacts only),
    country: 'Germany'    contacts' country, or accounts living in / citizens of it,
    accounts: 'all' | 'no_cv' | 'cv' | 'free' | 'pro',
    skip_days: 14         skip anyone a campaign emailed in the last N days,
    limit: 5000}
   Unsubscribed / bounced contacts, accounts with "News and tips" or all emails off,
   and unconfirmed accounts are always left out. */
CREATE OR REPLACE FUNCTION public.outreach_audience(p jsonb)
RETURNS TABLE (email text, name text, user_id uuid, contact_id uuid, country text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
#variable_conflict use_column
DECLARE
  src text := coalesce(nullif(p->>'source', ''), 'contacts');
  acc text := coalesce(nullif(p->>'accounts', ''), 'all');
  v_tags text[] := coalesce((SELECT array_agg(lower(x)) FROM jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) x WHERE btrim(x) <> ''), '{}');
  v_country text := nullif(btrim(coalesce(p->>'country', '')), '');
  v_skip integer := coalesce(nullif(p->>'skip_days', '')::integer, 0);
  v_limit integer := least(greatest(coalesce(nullif(p->>'limit', '')::integer, 100000), 1), 200000);
BEGIN
  RETURN QUERY
  WITH contacts AS (
    SELECT lower(c.email) AS email, c.name, c.user_id, c.id AS contact_id, c.country
    FROM public.email_contacts c
    WHERE src IN ('contacts', 'both') AND c.status = 'subscribed'
      AND (cardinality(v_tags) = 0 OR c.tags && v_tags)
      AND (v_country IS NULL OR lower(c.country) = lower(v_country))
  ),
  accounts AS (
    SELECT lower(u.email) AS email, pr.full_name AS name, u.id AS user_id, c.id AS contact_id, coalesce(c.country, co.name) AS country
    FROM auth.users u
    LEFT JOIN public.profiles pr ON pr.id = u.id
    LEFT JOIN public.countries co ON co.id = pr.country_id
    LEFT JOIN public.email_contacts c ON lower(c.email) = lower(u.email)
    WHERE src IN ('accounts', 'both')
      AND u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND coalesce(c.status, 'subscribed') = 'subscribed'
      AND public.email_allowed(u.id, 'news')
      AND (v_country IS NULL OR lower(co.name) = lower(v_country)
           OR lower((SELECT name FROM public.countries WHERE id = pr.nationality_country_id)) = lower(v_country))
      AND CASE acc
            WHEN 'no_cv' THEN NOT EXISTS (SELECT 1 FROM public.user_cvs x WHERE x.user_id = u.id)
            WHEN 'cv' THEN EXISTS (SELECT 1 FROM public.user_cvs x WHERE x.user_id = u.id)
            WHEN 'free' THEN NOT public.is_pro(u.id)
            WHEN 'pro' THEN public.is_pro(u.id)
            ELSE true END
  ),
  everyone AS (
    SELECT DISTINCT ON (x.email) x.* FROM (SELECT * FROM accounts UNION ALL SELECT * FROM contacts) x ORDER BY x.email, x.user_id NULLS LAST
  )
  SELECT e.email, e.name, e.user_id, e.contact_id, e.country
  FROM everyone e
  WHERE public.mv_email_ok(e.email)
    -- A user who turned off emails is left out even when imported as a contact.
    AND (e.user_id IS NULL OR public.email_allowed(e.user_id, 'news'))
    AND (v_skip <= 0 OR NOT EXISTS (
          SELECT 1 FROM public.email_campaign_recipients r
          WHERE lower(r.email) = e.email AND r.status = 'sent' AND r.sent_at > now() - make_interval(days => v_skip)))
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_audience(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_audience_count(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'total', count(*),
      'accounts', count(*) FILTER (WHERE a.user_id IS NOT NULL),
      'contacts', count(*) FILTER (WHERE a.user_id IS NULL),
      'sample', coalesce((SELECT jsonb_agg(s.email) FROM (SELECT b.email FROM public.outreach_audience(p) b LIMIT 5) s), '[]'::jsonb),
      'budget_today', public.outreach_budget(),
      'per_minute', (SELECT per_minute FROM public.outreach_settings))
    FROM public.outreach_audience(p) a);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_audience_count(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audience_count(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_campaign_save(p_id uuid, p_name text, p_template text, p_audience jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c public.email_campaigns;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_templates WHERE key = p_template) THEN RAISE EXCEPTION 'Choose a template.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.email_campaigns (name, template_key, audience, created_by)
    VALUES (left(coalesce(nullif(btrim(p_name), ''), 'Campaign ' || to_char(now(), 'DD Mon')), 120), p_template, coalesce(p_audience, '{}'::jsonb), auth.uid())
    RETURNING * INTO c;
  ELSE
    UPDATE public.email_campaigns SET name = left(coalesce(nullif(btrim(p_name), ''), name), 120), template_key = p_template, audience = coalesce(p_audience, audience), updated_at = now()
    WHERE id = p_id AND status = 'draft' RETURNING * INTO c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only a draft can be changed.'; END IF;
  END IF;
  RETURN to_jsonb(c);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_campaign_save(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_campaign_save(uuid, text, text, jsonb) TO authenticated;

/* Start: the audience is fixed into the recipient list, then sent a few at a time by run_campaign_sends(). */
CREATE OR REPLACE FUNCTION public.admin_campaign_start(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  c public.email_campaigns;
  n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.email_campaigns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be started.'; END IF;

  -- Every recipient gets a contact row (it holds their unsubscribe link and dashboard).
  INSERT INTO public.email_contacts (email, name, user_id, source, country)
  SELECT a.email, a.name, a.user_id, 'account', a.country FROM public.outreach_audience(c.audience) a WHERE a.contact_id IS NULL
  ON CONFLICT ((lower(email))) DO NOTHING;

  INSERT INTO public.email_campaign_recipients (campaign_id, contact_id, user_id, email)
  SELECT c.id, coalesce(a.contact_id, (SELECT id FROM public.email_contacts x WHERE lower(x.email) = a.email)), a.user_id, a.email
  FROM public.outreach_audience(c.audience) a
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Nobody in this audience can be emailed.'; END IF;

  UPDATE public.email_campaigns SET status = 'sending', total = n, started_at = now(), updated_at = now() WHERE id = c.id RETURNING * INTO c;
  RETURN to_jsonb(c);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_campaign_start(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_campaign_start(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_campaign_set(p_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c public.email_campaigns;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p_status = 'delete' THEN
    DELETE FROM public.email_campaigns WHERE id = p_id AND status IN ('draft', 'cancelled', 'done');
    RETURN NULL;
  END IF;
  IF p_status NOT IN ('sending', 'paused', 'cancelled') THEN RAISE EXCEPTION 'Unknown status.'; END IF;
  UPDATE public.email_campaigns
  SET status = p_status, updated_at = now(), finished_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE finished_at END
  WHERE id = p_id AND status IN ('sending', 'paused') RETURNING * INTO c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a running or paused campaign can be changed.'; END IF;
  IF p_status = 'cancelled' THEN
    UPDATE public.email_campaign_recipients SET status = 'skipped', error = 'Cancelled' WHERE campaign_id = p_id AND status = 'queued';
  END IF;
  RETURN to_jsonb(c);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_campaign_set(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_campaign_set(uuid, text) TO authenticated;

/* The sender: every minute. Takes the oldest queued recipients of running campaigns, checks each
   address again (it may have unsubscribed since), renders and sends. */
CREATE OR REPLACE FUNCTION public.run_campaign_sends()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '55s'
AS $$
DECLARE
  s public.outreach_settings;
  budget integer;
  r record;
  rendered jsonb;
  rid bigint;
  sent integer := 0;
BEGIN
  SELECT * INTO s FROM public.outreach_settings;
  IF NOT s.enabled THEN RETURN 0; END IF;
  IF coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') = ''
     AND coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), '') = '' THEN RETURN 0; END IF;
  budget := least(public.outreach_budget(), s.per_minute);

  FOR r IN
    SELECT q.id, q.campaign_id, q.email, q.user_id, c.template_key, ct.id AS contact_id, ct.status AS contact_status, ct.token, ct.name, ct.country
    FROM public.email_campaign_recipients q
    JOIN public.email_campaigns c ON c.id = q.campaign_id AND c.status = 'sending'
    LEFT JOIN public.email_contacts ct ON ct.id = q.contact_id
    WHERE q.status = 'queued'
    ORDER BY c.started_at, q.id
    LIMIT budget
    FOR UPDATE OF q SKIP LOCKED
  LOOP
    IF coalesce(r.contact_status, 'subscribed') <> 'subscribed' OR (r.user_id IS NOT NULL AND NOT public.email_allowed(r.user_id, 'news')) THEN
      UPDATE public.email_campaign_recipients SET status = 'skipped', error = 'Unsubscribed' WHERE id = r.id;
      CONTINUE;
    END IF;
    BEGIN
      rendered := public.mv_render_template(r.template_key, r.email, r.name, r.user_id, r.token, r.country);
      rid := public.mv_send_outreach(r.email, rendered, 'campaign', r.user_id, 'madevisa-cmp-' || r.campaign_id || '-' || r.id);
      UPDATE public.email_campaign_recipients SET status = 'sent', request_id = rid, sent_at = now() WHERE id = r.id;
      UPDATE public.email_contacts SET sent_count = sent_count + 1, last_sent_at = now() WHERE id = r.contact_id;
      sent := sent + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.email_campaign_recipients SET status = 'failed', error = left(SQLERRM, 300) WHERE id = r.id;
    END;
  END LOOP;

  -- Finished campaigns.
  UPDATE public.email_campaigns c SET status = 'done', finished_at = now(), updated_at = now()
  WHERE c.status = 'sending' AND NOT EXISTS (SELECT 1 FROM public.email_campaign_recipients q WHERE q.campaign_id = c.id AND q.status = 'queued');
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.run_campaign_sends() FROM PUBLIC, anon, authenticated;

/* Resend refused an address (invalid, or on its suppression list) → the recipient shows "failed"
   and the contact is marked bounced so no campaign tries it again. */
CREATE OR REPLACE FUNCTION public.campaign_settle()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer := 0;
BEGIN
  PERFORM public.email_log_settle();
  WITH bad AS (
    UPDATE public.email_campaign_recipients q SET status = 'failed', error = l.error
    FROM public.email_log l
    WHERE q.status = 'sent' AND q.request_id IS NOT NULL AND l.request_id = q.request_id AND l.status = 'failed'
      AND q.sent_at > now() - interval '2 days'
    RETURNING q.contact_id, l.status_code
  )
  UPDATE public.email_contacts c SET status = 'bounced', updated_at = now()
  FROM bad WHERE c.id = bad.contact_id AND c.status = 'subscribed' AND bad.status_code IN (422);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.campaign_settle() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_campaigns()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  PERFORM public.campaign_settle();
  RETURN jsonb_build_object(
    'settings', (SELECT to_jsonb(s) FROM public.outreach_settings s),
    'budget_today', public.outreach_budget(),
    'sent_today', (SELECT count(*) FROM public.email_log WHERE status <> 'skipped' AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'),
    'sender', coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'email_from_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'email_from')),
    'separate_key', coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), '') <> '',
    'series', (SELECT jsonb_build_object(
        'in_series', count(*) FILTER (WHERE step BETWEEN 1 AND 2),
        'finished', count(*) FILTER (WHERE step >= 3),
        'sent_7d', (SELECT count(*) FROM public.email_log WHERE kind = 'series' AND created_at > now() - interval '7 days'))
      FROM public.nurture_state),
    'campaigns', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'template_key', c.template_key, 'template_name', t.name, 'audience', c.audience, 'status', c.status,
        'total', c.total, 'created_at', c.created_at, 'started_at', c.started_at, 'finished_at', c.finished_at,
        'queued', (SELECT count(*) FROM public.email_campaign_recipients q WHERE q.campaign_id = c.id AND q.status = 'queued'),
        'sent', (SELECT count(*) FROM public.email_campaign_recipients q WHERE q.campaign_id = c.id AND q.status = 'sent'),
        'failed', (SELECT count(*) FROM public.email_campaign_recipients q WHERE q.campaign_id = c.id AND q.status = 'failed'),
        'skipped', (SELECT count(*) FROM public.email_campaign_recipients q WHERE q.campaign_id = c.id AND q.status = 'skipped'),
        'unsubscribed', (SELECT count(*) FROM public.email_campaign_recipients q JOIN public.email_contacts x ON x.id = q.contact_id
                         WHERE q.campaign_id = c.id AND q.status = 'sent' AND x.status = 'unsubscribed' AND x.unsubscribed_at > q.sent_at),
        'opened_dashboard', (SELECT count(*) FROM public.email_campaign_recipients q JOIN public.email_contacts x ON x.id = q.contact_id
                             WHERE q.campaign_id = c.id AND q.status = 'sent' AND x.dashboard_seen_at > q.sent_at)
      ) ORDER BY c.created_at DESC)
      FROM (SELECT * FROM public.email_campaigns ORDER BY created_at DESC LIMIT 100) c
      LEFT JOIN public.email_templates t ON t.key = c.template_key), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_campaigns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_campaigns() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_outreach_settings(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s public.outreach_settings;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.outreach_settings SET
    enabled = coalesce((p->>'enabled')::boolean, enabled),
    daily_cap = coalesce((p->>'daily_cap')::integer, daily_cap),
    reserve = coalesce((p->>'reserve')::integer, reserve),
    per_minute = coalesce((p->>'per_minute')::integer, per_minute),
    nurture_enabled = coalesce((p->>'nurture_enabled')::boolean, nurture_enabled),
    nurture_gap_days = coalesce((p->>'nurture_gap_days')::integer, nurture_gap_days),
    nurture_per_day = coalesce((p->>'nurture_per_day')::integer, nurture_per_day),
    updated_at = now()
  RETURNING * INTO s;
  RETURN to_jsonb(s);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_outreach_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_outreach_settings(jsonb) TO authenticated;

-- ===========================================================================
-- 4. Auto Apply series for free accounts
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.nurture_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  step integer NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 3),
  last_sent_at timestamptz,
  stopped_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nurture_state_due_idx ON public.nurture_state (last_sent_at) WHERE step < 3;
ALTER TABLE public.nurture_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nurture_state FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_auto_apply_series()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '240s'
AS $$
DECLARE
  s public.outreach_settings;
  budget integer;
  u record;
  c public.email_contacts;
  rendered jsonb;
  sent integer := 0;
BEGIN
  SELECT * INTO s FROM public.outreach_settings;
  IF NOT s.enabled OR NOT s.nurture_enabled THEN RETURN 0; END IF;
  IF coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') = ''
     AND coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), '') = '' THEN RETURN 0; END IF;
  budget := least(public.outreach_budget(), s.nurture_per_day);

  FOR u IN
    SELECT au.id, au.email, coalesce(n.step, 0) AS step
    FROM auth.users au
    LEFT JOIN public.nurture_state n ON n.user_id = au.id
    WHERE au.email_confirmed_at IS NOT NULL AND au.email IS NOT NULL AND au.deleted_at IS NULL
      AND au.created_at < now() - interval '2 days'
      AND coalesce(n.step, 0) < 3
      AND (n.last_sent_at IS NULL OR n.last_sent_at < now() - make_interval(days => s.nurture_gap_days))
      AND NOT public.is_pro(au.id)
      AND NOT EXISTS (SELECT 1 FROM public.auto_apply_requests r WHERE r.user_id = au.id)
      AND public.email_allowed(au.id, 'news')
      AND NOT EXISTS (SELECT 1 FROM public.email_contacts x WHERE lower(x.email) = lower(au.email) AND x.status <> 'subscribed')
      -- Not on the same day as a campaign email.
      AND NOT EXISTS (SELECT 1 FROM public.email_log l WHERE l.user_id = au.id AND l.kind = 'campaign' AND l.created_at > now() - interval '3 days')
    ORDER BY n.last_sent_at NULLS FIRST, au.created_at
    LIMIT budget
  LOOP
    BEGIN
      c := public.mv_contact_for(u.email, NULL, u.id, 'account');
      rendered := public.mv_render_template('nurture_' || (u.step + 1), c.email, c.name, u.id, c.token, c.country);
      PERFORM public.mv_send_outreach(c.email, rendered, 'series', u.id, 'madevisa-series-' || u.id || '-' || (u.step + 1));
      INSERT INTO public.nurture_state (user_id, step, last_sent_at) VALUES (u.id, u.step + 1, now())
      ON CONFLICT (user_id) DO UPDATE SET step = excluded.step, last_sent_at = now(), updated_at = now();
      sent := sent + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'run_auto_apply_series %: %', u.id, SQLERRM;
    END;
  END LOOP;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.run_auto_apply_series() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 5. Unsubscribe (now also for imported contacts) + the email dashboard
-- ===========================================================================
ALTER TABLE public.email_contacts ADD COLUMN IF NOT EXISTS dashboard_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.email_unsubscribe(p_token uuid, p_kind text DEFAULT 'all')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  ct public.email_contacts;
  k text := lower(coalesce(p_kind, 'all'));
BEGIN
  -- A campaign / series link: the contact token. Unsubscribes the address from all marketing.
  SELECT * INTO ct FROM public.email_contacts WHERE token = p_token;
  IF FOUND THEN
    UPDATE public.email_contacts SET status = CASE WHEN status = 'subscribed' THEN 'unsubscribed' ELSE status END,
           unsubscribed_at = coalesce(unsubscribed_at, now()), updated_at = now() WHERE id = ct.id;
    IF ct.user_id IS NOT NULL THEN
      PERFORM public.email_token(ct.user_id);
      UPDATE public.email_prefs SET news = false, updated_at = now() WHERE user_id = ct.user_id;
      UPDATE public.nurture_state SET step = 3, stopped_reason = 'unsubscribed', updated_at = now() WHERE user_id = ct.user_id;
    END IF;
    RETURN 'MadeVisa news and offers';
  END IF;

  SELECT user_id INTO uid FROM public.email_prefs WHERE token = p_token;
  IF uid IS NULL THEN SELECT user_id INTO uid FROM public.for_you_settings WHERE unsub_token = p_token; END IF;
  IF uid IS NULL THEN RETURN ''; END IF;
  PERFORM public.email_token(uid);
  IF k IN ('foryou', 'for_you', 'matches') THEN
    INSERT INTO public.for_you_settings (user_id, frequency) VALUES (uid, 'off')
    ON CONFLICT (user_id) DO UPDATE SET frequency = 'off', updated_at = now();
    RETURN 'Jobs that match your skills';
  ELSIF k IN ('alerts', 'job_alert', 'job_alerts') THEN
    UPDATE public.email_prefs SET job_alerts = false, updated_at = now() WHERE user_id = uid;
    RETURN 'Job alerts';
  ELSIF k IN ('applications', 'application', 'apply') THEN
    UPDATE public.email_prefs SET applications = false, updated_at = now() WHERE user_id = uid;
    RETURN 'Application updates';
  ELSIF k = 'news' THEN
    UPDATE public.email_prefs SET news = false, updated_at = now() WHERE user_id = uid;
    RETURN 'News and tips';
  END IF;
  UPDATE public.email_prefs SET all_off = true, job_alerts = false, applications = false, news = false, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.for_you_settings (user_id, frequency) VALUES (uid, 'off')
  ON CONFLICT (user_id) DO UPDATE SET frequency = 'off', updated_at = now();
  UPDATE public.email_contacts SET status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now()), updated_at = now()
  WHERE user_id = uid AND status = 'subscribed';
  RETURN 'All MadeVisa emails';
END;
$$;
REVOKE ALL ON FUNCTION public.email_unsubscribe(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_unsubscribe(uuid, text) TO anon, authenticated;

/* /my?t=<token>: a small dashboard for one address — no sign-in. Shows nothing private
   beyond counts (no CV text, no job titles applied to). */
CREATE OR REPLACE FUNCTION public.email_dashboard(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ct public.email_contacts;
  uid uuid;
  n public.outreach_numbers := public.outreach_counts();
  sub_plan text;
  sub_until timestamptz;
  aa public.auto_apply_requests;
  masked text;
  country_jobs integer;
BEGIN
  SELECT * INTO ct FROM public.email_contacts WHERE token = p_token;
  IF NOT FOUND THEN
    SELECT user_id INTO uid FROM public.email_prefs WHERE token = p_token;
    IF uid IS NULL THEN RETURN NULL; END IF;
    ct := public.mv_contact_for((SELECT email FROM auth.users WHERE id = uid), NULL, uid, 'account');
  END IF;
  UPDATE public.email_contacts SET dashboard_seen_at = now() WHERE id = ct.id;
  uid := coalesce(ct.user_id, (SELECT id FROM auth.users WHERE lower(email) = lower(ct.email) LIMIT 1));
  masked := left(split_part(ct.email, '@', 1), 2) || '•••@' || split_part(ct.email, '@', 2);
  IF ct.country IS NOT NULL THEN
    SELECT count(*) INTO country_jobs FROM public.sponsored_jobs s JOIN public.countries c ON c.id = s.country_id
    WHERE s.status = 'published' AND NOT s.awaiting_release AND lower(c.name) = lower(ct.country);
  END IF;
  IF uid IS NOT NULL THEN
    SELECT plan, current_period_end INTO sub_plan, sub_until FROM public.subscriptions
    WHERE user_id = uid AND status = 'active' AND (current_period_end IS NULL OR current_period_end > now()) ORDER BY current_period_end DESC NULLS FIRST LIMIT 1;
    SELECT * INTO aa FROM public.auto_apply_requests WHERE user_id = uid ORDER BY created_at DESC LIMIT 1;
  END IF;
  RETURN jsonb_build_object(
    'email', masked,
    'name', nullif(split_part(btrim(coalesce(ct.name, (SELECT full_name FROM public.profiles WHERE id = uid), '')), ' ', 1), ''),
    'subscribed', ct.status = 'subscribed',
    'jobs', jsonb_build_object('live', n.jobs_live, 'today', n.jobs_today, 'visa', n.jobs_visa, 'country', ct.country, 'in_country', country_jobs),
    'account', uid IS NOT NULL,
    'cv', CASE WHEN uid IS NULL THEN NULL ELSE (SELECT jsonb_build_object('uploaded', true, 'at', c.updated_at, 'titles', coalesce(c.profile->'titles', '[]'::jsonb) -> 0) FROM public.user_cvs c WHERE c.user_id = uid) END,
    'matches', CASE WHEN uid IS NULL THEN NULL ELSE public.mv_match_count(uid) END,
    'applications', CASE WHEN uid IS NULL THEN NULL ELSE jsonb_build_object(
        'by_madevisa', (SELECT count(*) FROM public.auto_apply_items WHERE user_id = uid AND status = 'applied'),
        'by_you', (SELECT count(*) FROM public.application_reports WHERE user_id = uid),
        'in_queue', (SELECT count(*) FROM public.auto_apply_items WHERE user_id = uid AND status IN ('queued', 'applying'))) END,
    'auto_apply', CASE WHEN aa.id IS NULL THEN NULL ELSE jsonb_build_object('status', CASE WHEN aa.status IN ('active', 'paused') AND aa.ends_at <= now() THEN 'ended' ELSE aa.status END, 'ends_at', aa.ends_at) END,
    'plan', CASE WHEN uid IS NULL THEN NULL WHEN sub_plan IS NOT NULL THEN jsonb_build_object('name', 'MadeVisa Pro', 'pro', true, 'until', sub_until) ELSE jsonb_build_object('name', 'Free', 'pro', false) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.email_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_dashboard(uuid) TO anon, authenticated;

-- Admin → Emails: show campaign and series emails by their own names.
-- (No change needed: email_log.kind is 'campaign', 'series' or 'test'.)

-- ===========================================================================
-- Schedules
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('madevisa-campaign-sends', 'madevisa-campaign-settle', 'madevisa-auto-apply-series');
    PERFORM cron.schedule('madevisa-campaign-sends', '* * * * *', $c$select public.run_campaign_sends()$c$);
    PERFORM cron.schedule('madevisa-campaign-settle', '*/10 * * * *', $c$select public.campaign_settle()$c$);
    -- 09:20 UTC = 13:20 in Baku.
    PERFORM cron.schedule('madevisa-auto-apply-series', '20 9 * * *', $c$select public.run_auto_apply_series()$c$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
