/*
# Outreach: "Find emails" + no awkward names when we don't know the name
Run AFTER 20261217120000_email_design_icons.sql. Paste the whole file once in the
Supabase SQL Editor. Safe to run more than once.

1. NAMES
   {{first_name}} is only used when we really know a first name. "info", "HR Team",
   "Acme GmbH", "j.smith@…", "ANNA" etc. are cleaned up or treated as unknown.
   Unknown → the name is taken out of the sentence, so nothing reads oddly:
     "{{first_name}}, 12 new jobs today"     → "12 new jobs today"
     "Thanks, {{first_name}}!"                → "Thanks!"
     "Good news, {{first_name}}: …"           → "Good news: …"
     "Hi {{first_name}},"                     → "Hi there,"
     "{{first_name}}'s matches"               → "Your matches"
   and the "Hi Anna," greeting line is left out of the email.
   Admin → Templates can preview both versions.

2. FIND EMAILS (Admin → Outreach → Find emails)
   One button collects business addresses that are already public:
     • recruiter / HR addresses written in live job ads on MadeVisa,
     • the contact address on company profiles,
     • addresses published on company websites (contact, imprint, careers,
       about pages), read by the edge function `email-finder`.
   You can also paste any websites to scan.
   They are added as contacts with source "found: …", tags found-online + employer,
   and where each one was found. Unsubscribed / bounced addresses stay that way.
   A campaign only includes them when you pick one of their tags — so the
   job-seeker emails never go to them by accident. A new "For employers" template
   is added for them.

Deploy the function too:  supabase functions deploy email-finder
*/

SET lock_timeout = '5s';

-- ===========================================================================
-- 1. Names
-- ===========================================================================

/* Words that are never somebody's first name (role inboxes, titles, placeholders). */
CREATE OR REPLACE FUNCTION public.mv_not_a_name(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(coalesce(p, ''))) = ANY (ARRAY[
    '', 'info', 'infos', 'information', 'hr', 'team', 'admin', 'administrator', 'contact', 'contacts', 'kontakt', 'contacto', 'contatti',
    'office', 'sales', 'support', 'hello', 'hallo', 'hi', 'hey', 'dear', 'jobs', 'job', 'careers', 'career', 'karriere', 'carriere', 'empleo',
    'recruiting', 'recruitment', 'recruiter', 'recruiters', 'talent', 'talents', 'hiring', 'people', 'personal', 'personnel', 'bewerbung', 'bewerbungen',
    'mail', 'email', 'e-mail', 'webmail', 'newsletter', 'news', 'service', 'services', 'marketing', 'press', 'media', 'pr', 'billing', 'accounts',
    'accounting', 'finance', 'invoice', 'invoices', 'orders', 'shop', 'store', 'booking', 'bookings', 'reservations', 'reception', 'front', 'desk',
    'enquiries', 'enquiry', 'inquiries', 'inquiry', 'general', 'main', 'central', 'zentrale', 'secretariat', 'sekretariat', 'management', 'director',
    'ceo', 'hq', 'it', 'tech', 'web', 'website', 'online', 'digital', 'operations', 'ops', 'help', 'helpdesk', 'feedback', 'partners', 'partner',
    'business', 'company', 'corporate', 'group', 'global', 'international', 'customer', 'customers', 'client', 'clients', 'user', 'users', 'member',
    'members', 'guest', 'applicant', 'applicants', 'candidate', 'candidates', 'staff', 'employee', 'employees', 'student', 'students', 'admissions',
    'test', 'testing', 'unknown', 'none', 'null', 'na', 'n/a', 'nobody', 'someone', 'anyone', 'there', 'friend', 'friends', 'all', 'everyone',
    'sir', 'madam', 'madame', 'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'herr', 'frau', 'mme', 'mlle', 'sr', 'sra', 'the', 'my', 'your', 'our', 'me',
    'madevisa', 'noreply', 'no-reply', 'anonymous', 'owner', 'manager', 'office-manager', 'work', 'apply', 'cv', 'resume', 'mailbox', 'postmaster'
  ]);
$$;

/* A first name we can safely greet with, or NULL. "anna müller" → "Anna", "DR. JOHN SMITH" → "John",
   "Lee, Ann" → "Ann", "HR Team" / "Acme GmbH" / "j.smith" / "info" / "x" → NULL. */
CREATE OR REPLACE FUNCTION public.mv_first_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n text := btrim(regexp_replace(coalesce(p_name, ''), '\([^)]*\)|<[^>]*>|["“”]', ' ', 'g'));
  parts text[];
  f text;
  i integer := 1;
BEGIN
  IF n = '' OR n ~ '[@0-9_/\\|#$%&*+=~^{}\[\]]' THEN RETURN NULL; END IF;
  -- Companies and departments, not people.
  IF n ~* '(^|[\s.,])(gmbh|mbh|ltd|llc|inc|plc|corp|sarl|srl|spa|s\.p\.a|oyj|pty|company|group|holding|holdings|recruitment|recruiting|consulting|solutions|services|agency|university|universität|college|school|department|dept|team|office|hr|human resources|talent acquisition|careers|jobs|support)([\s.,]|$)'
     OR n ~ '(^|\s)(AG|AB|AS|SA|SAS|SE|NV|BV|KG|UG|Oy|A/S|S\.A\.|B\.V\.|N\.V\.|e\.V\.|Co\.)(\s|$|,)' THEN
    RETURN NULL;
  END IF;
  -- "Lee, Ann" → "Ann"
  IF n ~ '^[^,]+,\s*[^,\s]' THEN n := btrim(split_part(n, ',', 2)); END IF;
  parts := regexp_split_to_array(n, '\s+');
  -- Skip titles: "Dr. John", "Mrs Anna", "Prof. Dr. Klaus"
  WHILE i <= coalesce(array_length(parts, 1), 0)
        AND lower(rtrim(parts[i], '.')) IN ('mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'sir', 'madam', 'herr', 'frau', 'mme', 'mlle', 'm', 'sr', 'sra', 'srta', 'dott', 'ing', 'dipl', 'mag') LOOP
    i := i + 1;
  END LOOP;
  f := rtrim(coalesce(parts[i], ''), '.,;:!?');
  IF char_length(f) < 2 OR char_length(f) > 25 THEN RETURN NULL; END IF;
  IF f ~ '[.!?,;:()]' OR f ~ '^[''’-]|[''’-]$' THEN RETURN NULL; END IF;
  IF public.mv_not_a_name(f) THEN RETURN NULL; END IF;
  -- Two capital letters with nothing else ("JS") is initials, not a name.
  IF char_length(f) <= 3 AND f = upper(f) THEN RETURN NULL; END IF;
  IF f = lower(f) OR f = upper(f) THEN f := initcap(lower(f)); END IF;
  RETURN f;
END;
$$;

/* A name guessed from the address itself, only for "first.last@…" style personal addresses:
   "anna.mueller@acme.de" → "Anna Mueller". Role inboxes and anything unclear → NULL. */
CREATE OR REPLACE FUNCTION public.mv_name_from_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  l text := lower(split_part(coalesce(p_email, ''), '@', 1));
  m text[];
BEGIN
  m := regexp_match(l, '^([a-z]{3,20})[._-]([a-z]{2,25})$');
  IF m IS NULL OR public.mv_not_a_name(m[1]) OR public.mv_not_a_name(m[2]) THEN RETURN NULL; END IF;
  RETURN initcap(m[1]) || ' ' || initcap(m[2]);
END;
$$;

/* Put the first name into a text, or — when we don't know it — take {{first_name}} out
   so the sentence still reads naturally. */
CREATE OR REPLACE FUNCTION public.mv_fill_name(p text, p_first text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out text := coalesce(p, '');
  pos integer;
  sentence_start constant text := '(^|[.!?]\s+|\n[ \t]*(?:-[ \t]+)?)';
BEGIN
  IF strpos(out, '{{first_name}}') = 0 THEN RETURN out; END IF;
  IF p_first IS NOT NULL AND btrim(p_first) <> '' THEN RETURN replace(out, '{{first_name}}', btrim(p_first)); END IF;

  -- Greetings keep a neutral form.
  out := regexp_replace(out, '\m(Hi|Hello|Hey)[ \t]+\{\{first_name\}\}', '\1 there', 'gi');
  out := regexp_replace(out, '\m(Dear)[ \t]+\{\{first_name\}\}', 'Hello', 'gi');
  -- "for {{first_name}}" → "for you"
  out := regexp_replace(out, '\m(for|to|with)[ \t]+\{\{first_name\}\}(?![''’])', '\1 you', 'gi');
  -- Possessive: "{{first_name}}'s matches" → "Your matches" / "your matches".
  out := regexp_replace(out, sentence_start || '\{\{first_name\}\}[''’]s\M', '\1Your', 'g');
  out := regexp_replace(out, '\{\{first_name\}\}[''’]s\M', 'your', 'g');
  -- Name opening a sentence: "{{first_name}}, your matches…" → "Your matches…"
  out := regexp_replace(out, sentence_start || '\{\{first_name\}\}[ \t]*[,:!–—-]?[ \t]*', '\1' || chr(1), 'g');
  LOOP
    pos := strpos(out, chr(1));
    EXIT WHEN pos = 0;
    out := left(out, pos - 1) || upper(substr(out, pos + 1, 1)) || substr(out, pos + 2);
  END LOOP;
  -- Name in the middle, addressed: "Thanks, {{first_name}}!" / "Good news, {{first_name}}: …"
  out := regexp_replace(out, '[ \t]*,[ \t]*\{\{first_name\}\}(?=[ \t]*([.!?,:;)–—-]|$|\n))', '', 'g');
  out := regexp_replace(out, '[ \t]+\{\{first_name\}\}(?=[ \t]*([.!?,:;)]|$|\n))', '', 'g');
  -- Anything left: drop it and tidy the spacing.
  out := replace(out, '{{first_name}}', '');
  out := regexp_replace(out, '[ \t]{2,}', ' ', 'g');
  out := regexp_replace(out, '[ \t]+([,.!?;:])', '\1', 'g');
  out := regexp_replace(out, '([,;:])\1+', '\1', 'g');
  out := regexp_replace(out, '^[ \t]*[,;:–—-][ \t]*', '', 'g');
  out := regexp_replace(out, '\n[ \t]*[,;:–—][ \t]*', E'\n', 'g');
  RETURN btrim(out, E' \t');
END;
$$;

/* One email from a template, for one address. Returns {subject, html, text, preheader, unsub}.
   Same as before, plus: the name is only used when it is a real first name. */
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
  src text := (SELECT source FROM public.email_contacts WHERE lower(email) = lower(p_email) LIMIT 1);
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
  headline text;
  pre text;
  cta text;
BEGIN
  SELECT * INTO t FROM public.email_templates WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'No template %', p_key; END IF;
  first := coalesce(public.mv_first_name(p_name), public.mv_first_name((SELECT full_name FROM public.profiles WHERE id = uid)));
  IF uid IS NOT NULL THEN
    has_cv := EXISTS (SELECT 1 FROM public.user_cvs WHERE user_id = uid);
    matches := public.mv_match_count(uid);
  END IF;
  cv_line := CASE
    WHEN has_cv AND matches > 0 THEN 'Good news: your CV matches the titles of **' || to_char(matches, 'FM999,999') || ' live jobs** on MadeVisa right now.'
    WHEN has_cv THEN 'Your CV is on MadeVisa, and new jobs that fit it arrive every day.'
    ELSE 'First step: upload your CV. It takes about 10 seconds, and you instantly see the jobs you match best.' END;
  dash := 'https://madevisa.com/my?t=' || coalesce(p_token::text, '');
  v := jsonb_build_object(
    'jobs_live', to_char(n.jobs_live, 'FM999,999'),
    'jobs_today', to_char(n.jobs_today, 'FM999,999'),
    'jobs_visa', to_char(n.jobs_visa, 'FM999,999'),
    'matches', to_char(matches, 'FM999,999'),
    'cv_line', cv_line,
    'country', coalesce(p_country, ''),
    'dashboard_url', dash);
  subject := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.subject, first), v)));
  subject := upper(left(subject, 1)) || substr(subject, 2);
  body := mv_fill(public.mv_fill_name(t.body, first), v);
  headline := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.headline, first), v)));
  headline := upper(left(headline, 1)) || substr(headline, 2);
  pre := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.preheader, first), v)));
  cta := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.cta_label, first), v)));
  unsub := CASE WHEN p_token IS NOT NULL THEN 'https://madevisa.com/alerts/unsubscribe?k=all&t=' || p_token::text END;

  IF t.show_stats THEN
    stats := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr>'
      || (SELECT string_agg('<td width="33%" valign="top" style="padding:0 4px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 12px">'
           || public.mv_email_icon(ic, 22)
           || '<div style="margin-top:10px;font-size:22px;line-height:1.1;font-weight:800;color:#0f172a">' || num || '</div>'
           || '<div style="margin-top:4px;font-size:12px;line-height:1.35;color:#64748b">' || lbl || '</div></div></td>', '' ORDER BY o)
          FROM (VALUES (1, 'globe', to_char(n.jobs_live, 'FM999,999'), 'Live jobs'),
                       (2, 'new', to_char(n.jobs_today, 'FM999,999'), 'New today'),
                       (3, 'plane', to_char(n.jobs_visa, 'FM999,999'), 'Visa sponsorship')) s(o, ic, num, lbl))
      || '</tr></table>';
  END IF;

  RETURN jsonb_build_object(
    'subject', left(subject, 200),
    'preheader', pre,
    'first_name', first,
    'html', public.mv_email_html(
      pre, t.eyebrow, headline,
      -- Greeting only when we know the name; otherwise the email simply starts with the headline.
      CASE WHEN first IS NOT NULL THEN 'Hi ' || mv_esc(first) || ',' END,
      stats || public.mv_body_html(body)
        || CASE WHEN p_token IS NOT NULL AND coalesce(src, '') NOT LIKE 'found%' THEN
             '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr>'
             || '<td valign="middle" style="padding-right:8px">' || public.mv_email_icon('dashboard', 20) || '</td>'
             || '<td valign="middle" style="font-size:13.5px;line-height:1.5;color:#64748b"><a href="' || mv_esc(dash) || '" style="color:#1d4ed8;font-weight:700;text-decoration:none">Your MadeVisa dashboard</a> &middot; your jobs, matches and applications in one place</td>'
             || '</tr></table>'
           ELSE '' END,
      cta, t.cta_url,
      CASE WHEN uid IS NOT NULL THEN 'You get this because you have a MadeVisa account.'
           WHEN src LIKE 'found%' THEN 'You get this because this business address is published as a company or hiring contact. One click below and we won''t email it again.'
           ELSE 'You get this because your address is on the MadeVisa mailing list.' END,
      unsub, NULL),
    'text', public.mv_no_emoji(
            CASE WHEN first IS NOT NULL THEN 'Hi ' || first || E',\n\n' ELSE '' END
            || headline || E'\n\n' || regexp_replace(regexp_replace(body, '\*\*', '', 'g'), '(^|\n)- \[[a-z]+\]\s*', '\1- ', 'g')
            || E'\n\n' || cta || ': ' || t.cta_url
            || CASE WHEN p_token IS NOT NULL AND coalesce(src, '') NOT LIKE 'found%' THEN E'\n\nYour dashboard: ' || dash ELSE '' END
            || CASE WHEN p_token IS NOT NULL THEN E'\nUnsubscribe: ' || unsub ELSE '' END),
    'unsub', unsub
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mv_render_template(text, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

/* Admin preview: p_as = 'named' (with a first name) or 'unknown' (name not known). */
DROP FUNCTION IF EXISTS public.admin_template_preview(text);
CREATE OR REPLACE FUNCTION public.admin_template_preview(p_key text, p_as text DEFAULT 'named')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.email_contacts;
  nm text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  c := public.mv_contact_for((SELECT email FROM auth.users WHERE id = auth.uid()), NULL, auth.uid(), 'admin');
  IF p_as = 'unknown' THEN
    -- Someone we know nothing about: no name, no account.
    RETURN public.mv_render_template(p_key, 'someone@example.com', NULL, NULL, c.token, NULL);
  END IF;
  nm := coalesce(public.mv_first_name(c.name), public.mv_first_name((SELECT full_name FROM public.profiles WHERE id = auth.uid())), 'Anna');
  RETURN public.mv_render_template(p_key, c.email, nm, c.user_id, c.token, c.country);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_preview(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_preview(text, text) TO authenticated;

-- ===========================================================================
-- 2. Find emails
-- ===========================================================================

/* Addresses that aren't worth emailing: no-reply, privacy/legal inboxes, placeholders,
   image file names, tracking services, MadeVisa itself. */
CREATE OR REPLACE FUNCTION public.mv_email_junk(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NOT public.mv_email_ok(p)
    OR lower(p) ~ '(^|[._-])(no-?reply|do-?not-?reply|donotreply|noreply|mailer-daemon|postmaster|hostmaster|abuse|privacy|gdpr|dpo|dataprotection|data-protection|datenschutz|legal|compliance|unsubscribe|security|webmaster|example|test|sentry|bounce|spam|root|nobody)([._-]|@)'
    OR lower(p) ~ '@(.*\.)?(madevisa\.com|example\.(com|org|net)|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|domain\.(com|tld)|email\.com|yourcompany\.com|company\.com|yourdomain\.com|mysite\.com|test\.com|localhost|ingest\.sentry\.io|godaddy\.com|wordpress\.(com|org)|w3\.org|schema\.org|sentry\.wixpress\.com)$'
    OR lower(p) ~ '\.(png|jpe?g|gif|svg|webp|avif|css|js|ico|pdf)$'
    OR lower(split_part(p, '@', 1)) ~ '^[0-9a-f]{20,}$'
    OR char_length(split_part(p, '@', 1)) > 48;
$$;

CREATE OR REPLACE FUNCTION public.mv_domain(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(regexp_replace(lower(split_part(split_part(regexp_replace(btrim(coalesce(p_url, '')), '^[a-z]+://', '', 'i'), '/', 1), '?', 1)), '^www\.', ''), '');
$$;

/* Websites scanned for addresses (one row per domain). */
CREATE TABLE IF NOT EXISTS public.email_finder_sites (
  domain text PRIMARY KEY CHECK (char_length(domain) BETWEEN 3 AND 200),
  url text NOT NULL,
  publisher_id uuid REFERENCES public.program_publishers(id) ON DELETE SET NULL,
  name text,
  country text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'scanning', 'done', 'failed', 'blocked')),
  pages integer NOT NULL DEFAULT 0,
  found integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  error text,
  scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_finder_sites_scanned_idx ON public.email_finder_sites (scanned_at);
ALTER TABLE public.email_finder_sites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_finder_sites FROM anon, authenticated;

/* Add found addresses as contacts. rows: [{email, name?, country?, where?}].
   Never resubscribes anyone; existing contacts keep their source and tags. */
CREATE OR REPLACE FUNCTION public.mv_finder_add(p_rows jsonb, p_source text, p_tags text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.email_contacts (email, name, country, tags, source, consent, user_id)
  SELECT x.email,
         left(coalesce(x.name, public.mv_name_from_email(x.email)), 120),
         left(x.country, 80),
         p_tags,
         left(p_source, 60),
         left('Published publicly: ' || coalesce(x.where_, 'unknown page') || ' (found ' || to_char(now(), 'YYYY-MM-DD') || ')', 300),
         (SELECT id FROM auth.users u WHERE lower(u.email) = x.email LIMIT 1)
  FROM (
    SELECT DISTINCT ON (lower(btrim(r->>'email')))
           lower(btrim(r->>'email')) AS email,
           nullif(btrim(coalesce(r->>'name', '')), '') AS name,
           nullif(btrim(coalesce(r->>'country', '')), '') AS country,
           nullif(btrim(coalesce(r->>'where', '')), '') AS where_
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    WHERE r ? 'email'
  ) x
  WHERE NOT public.mv_email_junk(x.email)
    AND NOT EXISTS (SELECT 1 FROM public.email_contacts c WHERE lower(c.email) = x.email)
  ON CONFLICT ((lower(email))) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_finder_add(jsonb, text, text[]) FROM PUBLIC, anon, authenticated;

/* Numbers for the Find emails tab. */
CREATE OR REPLACE FUNCTION public.admin_finder_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  WITH sites AS (
    SELECT DISTINCT ON (public.mv_domain(p.website)) public.mv_domain(p.website) AS domain
    FROM public.program_publishers p
    WHERE p.website ~* '^https?://' AND coalesce(p.verification_status, '') NOT IN ('rejected', 'suspended')
  )
  SELECT jsonb_build_object(
    'sites_total', (SELECT count(*) FROM sites WHERE domain IS NOT NULL),
    'sites_scanned', (SELECT count(*) FROM public.email_finder_sites f WHERE f.status IN ('done', 'failed', 'blocked')),
    'sites_left', (SELECT count(*) FROM sites s WHERE s.domain IS NOT NULL AND NOT EXISTS (
                     SELECT 1 FROM public.email_finder_sites f WHERE f.domain = s.domain AND f.scanned_at > now() - interval '60 days')),
    'from_ads', (SELECT count(DISTINCT jc.email) FROM public.job_contacts jc JOIN public.sponsored_jobs j ON j.id = jc.job_id
                 WHERE j.status = 'published' AND NOT public.mv_email_junk(jc.email)
                   AND NOT EXISTS (SELECT 1 FROM public.email_contacts c WHERE lower(c.email) = lower(jc.email))),
    'from_profiles', (SELECT count(DISTINCT lower(p.contact_email)) FROM public.program_publishers p
                      WHERE NOT public.mv_email_junk(p.contact_email)
                        AND NOT EXISTS (SELECT 1 FROM public.email_contacts c WHERE lower(c.email) = lower(p.contact_email))),
    'found_total', (SELECT count(*) FROM public.email_contacts WHERE source LIKE 'found%'),
    'found_subscribed', (SELECT count(*) FROM public.email_contacts WHERE source LIKE 'found%' AND status = 'subscribed'),
    'found_named', (SELECT count(*) FROM public.email_contacts WHERE source LIKE 'found%' AND public.mv_first_name(name) IS NOT NULL),
    'recent', coalesce((SELECT jsonb_agg(to_jsonb(f) - 'publisher_id' ORDER BY f.scanned_at DESC)
                        FROM (SELECT * FROM public.email_finder_sites WHERE scanned_at IS NOT NULL AND status <> 'scanning' ORDER BY scanned_at DESC LIMIT 12) f), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_finder_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finder_overview() TO authenticated;

/* Step 1 of the button: addresses already on MadeVisa (job ads, company profiles). Instant. */
CREATE OR REPLACE FUNCTION public.admin_finder_collect()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '110s'
AS $$
DECLARE
  a integer;
  b integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  -- Recruiter / HR addresses written in live job ads (the newest ad wins for name and country).
  SELECT public.mv_finder_add(coalesce(jsonb_agg(jsonb_build_object('email', x.email, 'name', x.name, 'country', x.country, 'where', x.where_)), '[]'::jsonb),
                              'found: job ad', ARRAY['found-online', 'employer', 'job-ad'])
  INTO a
  FROM (
    SELECT DISTINCT ON (lower(jc.email)) lower(jc.email) AS email, jc.name, co.name AS country,
           'job ad "' || left(j.title, 80) || '"' || coalesce(' at ' || left(p.name, 60), '') AS where_
    FROM public.job_contacts jc
    JOIN public.sponsored_jobs j ON j.id = jc.job_id AND j.status = 'published'
    LEFT JOIN public.program_publishers p ON p.id = j.publisher_id
    LEFT JOIN public.countries co ON co.id = coalesce(j.country_id, p.country_id)
    ORDER BY lower(jc.email), (jc.name IS NOT NULL) DESC, coalesce(j.released_at, j.created_at) DESC
  ) x;
  -- The contact address on company profiles.
  SELECT public.mv_finder_add(coalesce(jsonb_agg(jsonb_build_object('email', x.email, 'country', x.country, 'where', x.where_)), '[]'::jsonb),
                              'found: company profile', ARRAY['found-online', 'employer', 'company-profile'])
  INTO b
  FROM (
    SELECT DISTINCT ON (lower(p.contact_email)) lower(p.contact_email) AS email, co.name AS country, 'company profile of ' || left(p.name, 80) AS where_
    FROM public.program_publishers p
    LEFT JOIN public.countries co ON co.id = p.country_id
    WHERE coalesce(p.contact_email, '') <> ''
    ORDER BY lower(p.contact_email), p.created_at DESC
  ) x;
  RETURN jsonb_build_object('from_ads', a, 'from_profiles', b);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_finder_collect() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finder_collect() TO authenticated;

/* Step 2: the next company websites to read (companies with the most live jobs first).
   They are marked "scanning" so a second click / tab doesn't take the same ones. */
CREATE OR REPLACE FUNCTION public.admin_finder_queue(p_limit integer DEFAULT 8)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  WITH cand AS (
    SELECT DISTINCT ON (public.mv_domain(p.website))
           public.mv_domain(p.website) AS domain, btrim(p.website) AS url, p.id AS publisher_id, p.name, co.name AS country,
           (SELECT count(*) FROM public.sponsored_jobs j WHERE j.publisher_id = p.id AND j.status = 'published') AS jobs
    FROM public.program_publishers p
    LEFT JOIN public.countries co ON co.id = p.country_id
    WHERE p.website ~* '^https?://' AND coalesce(p.verification_status, '') NOT IN ('rejected', 'suspended')
    ORDER BY public.mv_domain(p.website), p.created_at
  ),
  pick AS (
    SELECT c.* FROM cand c
    WHERE c.domain IS NOT NULL AND c.domain !~ '(^|\.)(linkedin|facebook|instagram|twitter|x|youtube|google|indeed|glassdoor|greenhouse|lever|workday|myworkdayjobs|smartrecruiters|ashbyhq|personio|recruitee|teamtailor|madevisa)\.'
      AND NOT EXISTS (SELECT 1 FROM public.email_finder_sites f WHERE f.domain = c.domain
                        AND (f.scanned_at > now() - interval '60 days' OR (f.status = 'scanning' AND f.created_at > now() - interval '10 minutes')))
    ORDER BY c.jobs DESC, c.name
    LIMIT least(greatest(coalesce(p_limit, 8), 1), 20)
  ),
  marked AS (
    INSERT INTO public.email_finder_sites AS f (domain, url, publisher_id, name, country, status, created_at)
    SELECT domain, url, publisher_id, name, country, 'scanning', now() FROM pick
    ON CONFLICT (domain) DO UPDATE SET status = 'scanning', url = excluded.url, publisher_id = excluded.publisher_id,
      name = excluded.name, country = excluded.country, created_at = now()
    RETURNING f.domain, f.url, f.name, f.country
  )
  SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) INTO r FROM marked m;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_finder_queue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finder_queue(integer) TO authenticated;

/* Step 3: what the email-finder function read. p: [{url, domain?, name?, country?, pages, error?, blocked?,
   emails: [{email, name?, page?}]}]. Returns {sites, found, added}. */
CREATE OR REPLACE FUNCTION public.admin_finder_save(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  s jsonb;
  d text;
  found_n integer;
  added_n integer;
  tot_found integer := 0;
  tot_added integer := 0;
  n_sites integer := 0;
  site public.email_finder_sites;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p) <> 'array' THEN RAISE EXCEPTION 'Expected a list.'; END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(p) LIMIT 50 LOOP
    d := coalesce(nullif(s->>'domain', ''), public.mv_domain(s->>'url'));
    CONTINUE WHEN d IS NULL;
    INSERT INTO public.email_finder_sites (domain, url, name, country)
    VALUES (d, coalesce(nullif(s->>'url', ''), 'https://' || d), nullif(s->>'name', ''), nullif(s->>'country', ''))
    ON CONFLICT (domain) DO NOTHING;
    SELECT * INTO site FROM public.email_finder_sites WHERE domain = d;

    SELECT count(*) INTO found_n FROM jsonb_array_elements(coalesce(s->'emails', '[]'::jsonb)) e WHERE NOT public.mv_email_junk(e->>'email');
    added_n := public.mv_finder_add(
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'email', e->>'email',
                'name', e->>'name',
                'country', coalesce(nullif(s->>'country', ''), site.country),
                'where', coalesce(nullif(e->>'page', ''), site.url))), '[]'::jsonb)
       FROM jsonb_array_elements(coalesce(s->'emails', '[]'::jsonb)) e),
      'found: website', ARRAY['found-online', 'employer', 'website']);

    UPDATE public.email_finder_sites SET
      status = CASE WHEN (s->>'blocked')::boolean IS TRUE THEN 'blocked' WHEN nullif(s->>'error', '') IS NOT NULL AND found_n = 0 THEN 'failed' ELSE 'done' END,
      pages = coalesce((s->>'pages')::integer, 0),
      found = found_n,
      added = added_n,
      error = left(nullif(s->>'error', ''), 300),
      name = coalesce(nullif(s->>'name', ''), name),
      country = coalesce(nullif(s->>'country', ''), country),
      scanned_at = now()
    WHERE domain = d;
    tot_found := tot_found + found_n;
    tot_added := tot_added + added_n;
    n_sites := n_sites + 1;
  END LOOP;
  RETURN jsonb_build_object('sites', n_sites, 'found', tot_found, 'added', tot_added);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_finder_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finder_save(jsonb) TO authenticated;

-- ===========================================================================
-- 3. Campaign audience: found addresses only when you pick their tag
-- ===========================================================================
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
      -- Addresses found online are business contacts: only when a campaign asks for their tag.
      AND (c.source NOT LIKE 'found%' OR cardinality(v_tags) > 0)
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
    AND (e.user_id IS NULL OR public.email_allowed(e.user_id, 'news'))
    AND (v_skip <= 0 OR NOT EXISTS (
          SELECT 1 FROM public.email_campaign_recipients r
          WHERE lower(r.email) = e.email AND r.status = 'sent' AND r.sent_at > now() - make_interval(days => v_skip)))
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_audience(jsonb) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 4. A template for employers (the found addresses)
-- ===========================================================================
INSERT INTO public.email_templates (key, name, audience, subject, preheader, eyebrow, headline, body, cta_label, cta_url, show_stats) VALUES
('promo_employers', 'For employers: hire from abroad', 'anyone',
 'Candidates ready to relocate for your open roles',
 'Post your jobs on MadeVisa for free and reach people who want to move.',
 'For employers',
 'Reach candidates who are ready to move',
 'MadeVisa is a job board for people who want to work abroad. **{{jobs_live}} live jobs** are on it today, and candidates apply with CVs matched to each role.

- [briefcase] Post a job for free, or we list it from your careers page
- [target] Candidates are matched to your job by their CV
- [plane] Show whether you sponsor visas, so the right people apply

Not the right person for this? Forward it to whoever handles hiring, or use the unsubscribe link below and we won’t write again.',
 'Post a job', 'https://madevisa.com/submit-job', false)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
