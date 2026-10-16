/*
  Resend daily budget, split so the important emails always get through.

  With the daily cap at 100 (Admin → Outreach → Sending & limits):
  - 50 always kept for site emails: sign-up and login codes, password resets, receipts, Auto Apply notices,
    "your report is live", the Starter reminder… (reserve = 50). Supabase sign-in codes may go through the
    same Resend account, so this room is kept even when MadeVisa's own log shows space.
  - 25 for outreach (campaigns, the series and the autopilot).
  - 10 for Starter and Pro members' daily job emails (their plan promises them).
  - 15 for free members' job emails ("Jobs for you, Aysel!" and job alerts).
  A person gets at most one job email a day (jobs for you or a job alert), whatever their alerts say.
  Paid members are always served first; when a group's share is used, the rest wait for tomorrow
  (their jobs are not marked as sent, so nothing is lost).

  New sign-ups who aren't on Starter or Pro get one reminder 6 hours after signing up.
*/

ALTER TABLE public.outreach_settings
  ADD COLUMN IF NOT EXISTS quota_outreach integer NOT NULL DEFAULT 25 CHECK (quota_outreach >= 0),
  ADD COLUMN IF NOT EXISTS quota_paid integer NOT NULL DEFAULT 10 CHECK (quota_paid >= 0),
  ADD COLUMN IF NOT EXISTS quota_members integer NOT NULL DEFAULT 15 CHECK (quota_members >= 0);
UPDATE public.outreach_settings SET reserve = 50, quota_outreach = 25, quota_paid = 10, quota_members = 15;

CREATE INDEX IF NOT EXISTS email_log_user_day_idx ON public.email_log (user_id, created_at DESC) WHERE user_id IS NOT NULL;

/* Today (UTC), emails that count against the budget. */
CREATE OR REPLACE FUNCTION public.mv_email_today_start()
RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' $$;

/* How many of a group's emails are left today: 'outreach', 'paid' or 'members'. */
CREATE OR REPLACE FUNCTION public.mv_email_left(p_group text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (SELECT * FROM public.outreach_settings LIMIT 1),
  today AS (
    SELECT l.kind, l.user_id FROM public.email_log l
    WHERE l.status <> 'skipped' AND l.created_at >= public.mv_email_today_start()
  ),
  used AS (
    SELECT
      count(*) FILTER (WHERE kind IN ('campaign', 'series') OR (kind LIKE 'auto\_%' AND kind NOT LIKE 'auto\_apply%'))::int AS outreach,
      count(*) FILTER (WHERE kind IN ('for_you', 'job_alert') AND public.plan_tier(user_id) IN ('starter', 'pro'))::int AS paid,
      count(*) FILTER (WHERE kind IN ('for_you', 'job_alert') AND public.plan_tier(user_id) NOT IN ('starter', 'pro'))::int AS members,
      count(*)::int AS total
    FROM today
  )
  SELECT greatest(0, least(
    CASE p_group WHEN 'outreach' THEN s.quota_outreach - u.outreach WHEN 'paid' THEN s.quota_paid - u.paid WHEN 'members' THEN s.quota_members - u.members ELSE 0 END,
    -- Never into the room kept for site emails (and if site emails already used more than that room, less for everyone else).
    s.daily_cap - (u.outreach + u.paid + u.members) - greatest(s.reserve, u.total - (u.outreach + u.paid + u.members))))
  FROM s, used u;
$$;
REVOKE ALL ON FUNCTION public.mv_email_left(text) FROM PUBLIC, anon, authenticated;

/* Already got a job email (or the Starter reminder) today? */
CREATE OR REPLACE FUNCTION public.mv_job_emailed_today(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.email_log
    WHERE user_id = p_user AND status <> 'skipped' AND created_at >= public.mv_email_today_start()
      AND kind IN ('for_you', 'job_alert', 'starter_reminder'));
$$;
REVOKE ALL ON FUNCTION public.mv_job_emailed_today(uuid) FROM PUBLIC, anon, authenticated;

/* May this person get a job email now? Their group's share left, and none today yet. */
CREATE OR REPLACE FUNCTION public.mv_job_email_room(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.mv_job_emailed_today(p_user)
    AND public.mv_email_left(CASE WHEN public.plan_tier(p_user) IN ('starter', 'pro') THEN 'paid' ELSE 'members' END) > 0;
$$;
REVOKE ALL ON FUNCTION public.mv_job_email_room(uuid) FROM PUBLIC, anon, authenticated;

/* Outreach (campaigns, series, autopilot): its own share, and never into the site-email room. */
CREATE OR REPLACE FUNCTION public.outreach_budget()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.mv_email_left('outreach') $$;
REVOKE ALL ON FUNCTION public.outreach_budget() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mv_send_email(
  p_to text,
  p_subject text,
  p_html text,
  p_text text,
  p_kind text,
  p_user uuid DEFAULT NULL,
  p_unsub_url text DEFAULT NULL,
  p_idempotency text DEFAULT NULL,
  p_reply_to text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key text;
  sender text;
  body jsonb;
  pref_kind text := CASE WHEN p_kind = 'auto_apply' THEN 'application' ELSE p_kind END;
BEGIN
  IF coalesce(btrim(p_to), '') = '' THEN RETURN false; END IF;
  -- Job emails to members: their own daily budget (paid / free), and never two in one day per person.
  IF p_kind IN ('for_you', 'job_alert') AND p_user IS NOT NULL AND NOT public.mv_job_email_room(p_user) THEN
    INSERT INTO public.email_log (user_id, to_email, kind, subject, status, error)
    VALUES (p_user, p_to, p_kind, left(p_subject, 300), 'skipped', 'Today''s job-email budget is used, or this person already got a job email today');
    RETURN false;
  END IF;
  IF p_user IS NOT NULL AND NOT public.email_allowed(p_user, pref_kind) THEN
    INSERT INTO public.email_log (user_id, to_email, kind, subject, status, error)
    VALUES (p_user, p_to, p_kind, left(p_subject, 300), 'skipped', 'Turned off in email settings');
    RETURN false;
  END IF;
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN false; END IF;
  SELECT value INTO sender FROM public.app_secrets WHERE name = 'email_from';

  body := jsonb_build_object(
    'from', coalesce(sender, 'MadeVisa <onboarding@resend.dev>'),
    'to', jsonb_build_array(p_to),
    'subject', left(p_subject, 300),
    'tags', jsonb_build_array(jsonb_build_object('name', 'kind', 'value', regexp_replace(p_kind, '[^a-zA-Z0-9_-]', '_', 'g')))
  );
  IF p_html IS NOT NULL THEN body := body || jsonb_build_object('html', p_html); END IF;
  IF p_text IS NOT NULL THEN
    body := body || jsonb_build_object('text', p_text || CASE WHEN p_text ILIKE '%Sumgayit%' THEN '' ELSE E'\n\n—\n' || public.mv_contact_line() END);
  END IF;
  IF p_reply_to IS NOT NULL THEN body := body || jsonb_build_object('reply_to', p_reply_to); END IF;
  IF p_unsub_url IS NOT NULL THEN
    body := body || jsonb_build_object('headers', jsonb_build_object('List-Unsubscribe', '<' || p_unsub_url || '>', 'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
  END IF;

  INSERT INTO public.email_log (user_id, to_email, kind, subject, payload, key_name, idem)
  VALUES (p_user, p_to, p_kind, left(p_subject, 300), body, 'main', left(p_idempotency, 240));
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.email_log (user_id, to_email, kind, subject, status, error) VALUES (p_user, p_to, p_kind, left(coalesce(p_subject, ''), 300), 'failed', left(SQLERRM, 300));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE NOTICE 'mv_send_email: %', SQLERRM;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_send_email(text, text, text, text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_for_you_emails(p_mode text DEFAULT 'daily')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '280s'
AS $$
DECLARE
  FOR_YOU_PER_RUN constant integer := 150;
  started timestamptz := clock_timestamp();
  key text;
  u record;
  since timestamptz;
  cap integer;
  hits integer;
  shown jsonb;
  rows_html text;
  rows_text text;
  subject text;
  title text;
  intro text;
  more_html text;
  unsub text;
  unsub_all text;
  manage text := 'https://madevisa.com/profile?tab=settings#emails';
  sources text;
  src_arr text[];
  top_skills text;
  sent integer := 0;
  ok boolean;
  fname text;
  is_paid_u boolean;
  paid_left integer := public.mv_email_left('paid');
  members_left integer := public.mv_email_left('members');
BEGIN
  IF p_mode NOT IN ('daily', 'weekly') THEN RAISE EXCEPTION 'p_mode must be daily or weekly'; END IF;
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN 0; END IF;

  FOR u IN
    SELECT au.id, au.email, f.last_sent_at, f.last_checked_at, pr.full_name
    FROM auth.users au
    LEFT JOIN public.for_you_settings f ON f.user_id = au.id
    LEFT JOIN public.email_prefs ep ON ep.user_id = au.id
    LEFT JOIN public.profiles pr ON pr.id = au.id
    WHERE au.email_confirmed_at IS NOT NULL AND au.email IS NOT NULL AND au.deleted_at IS NULL
      AND coalesce(f.frequency, 'daily') = p_mode
      AND NOT coalesce(ep.all_off, false)
      AND (f.last_sent_at IS NULL OR f.last_sent_at < now() - CASE WHEN p_mode = 'daily' THEN interval '20 hours' ELSE interval '6 days' END)
      AND (f.last_checked_at IS NULL OR f.last_checked_at < now() - interval '6 hours')
    -- Starter and Pro first (their daily email is part of the plan), then whoever waited longest.
    ORDER BY (public.plan_tier(au.id) IN ('starter', 'pro')) DESC, f.last_sent_at NULLS FIRST, f.last_checked_at NULLS FIRST
  LOOP
    EXIT WHEN sent >= FOR_YOU_PER_RUN OR clock_timestamp() - started > interval '240 seconds';
    EXIT WHEN paid_left <= 0 AND members_left <= 0;
    is_paid_u := public.plan_tier(u.id) IN ('starter', 'pro');
    -- Budget for this group used up, or already emailed today: leave them for the next run (not marked as checked).
    CONTINUE WHEN (is_paid_u AND paid_left <= 0) OR (NOT is_paid_u AND members_left <= 0) OR public.mv_job_emailed_today(u.id);

    INSERT INTO public.for_you_settings (user_id) VALUES (u.id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.for_you_settings SET last_checked_at = now() WHERE user_id = u.id;

    since := coalesce(u.last_sent_at, now() - CASE WHEN p_mode = 'daily' THEN interval '1 day' ELSE interval '7 days' END);
    cap := CASE WHEN public.is_pro(u.id) THEN 10 ELSE 5 END;

    -- Best first, one per company.
    WITH m AS (SELECT * FROM public.for_you_matches(u.id, since, 60)),
         one AS (SELECT DISTINCT ON (company) * FROM m ORDER BY company, score DESC),
         ranked AS (SELECT *, row_number() OVER (ORDER BY score DESC, job_id) AS rn FROM one)
    SELECT count(*), coalesce(jsonb_agg(to_jsonb(ranked) ORDER BY rn) FILTER (WHERE rn <= cap), '[]'::jsonb)
    INTO hits, shown FROM ranked;

    CONTINUE WHEN hits = 0;

    SELECT array_agg(x ORDER BY o) INTO src_arr FROM jsonb_array_elements_text(public.for_you_terms(u.id)->'from') WITH ORDINALITY t(x, o);
    sources := CASE WHEN coalesce(array_length(src_arr, 1), 0) <= 1 THEN src_arr[1]
                    ELSE array_to_string(src_arr[1:array_length(src_arr, 1) - 1], ', ') || ' and ' || src_arr[array_length(src_arr, 1)] END;
    unsub := public.mv_unsub_url(u.id, 'foryou');
    unsub_all := public.mv_unsub_url(u.id, 'all');

    -- The skills these jobs matched most, for the intro ("Python, SQL and Tableau").
    SELECT string_agg(public.mv_skill_label(s), ', ') INTO top_skills FROM (
      SELECT s, count(*) AS n FROM jsonb_array_elements(shown) j, jsonb_array_elements_text(coalesce(j->'skills', '[]'::jsonb)) s
      GROUP BY s ORDER BY n DESC, s LIMIT 3) x;

    SELECT string_agg(
             public.mv_email_job(
               'https://madevisa.com/jobs/sponsored-' || (j->>'job_id') || '?s=fy',
               j->>'title', j->>'company', j->>'logo',
               nullif(concat_ws(', ', j->>'city', j->>'country'), ''),
               coalesce((SELECT string_agg(public.mv_email_chip('✓ ' || public.mv_skill_label(s), 'green'), '' ORDER BY o)
                         FROM jsonb_array_elements_text(coalesce(j->'skills', '[]'::jsonb)) WITH ORDINALITY q(s, o) WHERE o <= 4), '')
               || CASE WHEN (j->>'visa')::boolean THEN public.mv_email_chip('Visa sponsorship', 'blue') ELSE '' END
               || CASE WHEN j->>'salary' IS NOT NULL THEN public.mv_email_chip(j->>'salary', 'gray') ELSE '' END
             ), '' ORDER BY (j->>'rn')::int),
           string_agg('• ' || (j->>'title') || ' — ' || (j->>'company')
                      || CASE WHEN jsonb_array_length(coalesce(j->'skills', '[]'::jsonb)) > 0
                              THEN ' (matches ' || (SELECT string_agg(public.mv_skill_label(s), ', ') FROM (SELECT s FROM jsonb_array_elements_text(j->'skills') s LIMIT 3) z) || ')' ELSE '' END
                      || E'\n  https://madevisa.com/jobs/sponsored-' || (j->>'job_id') || '?s=fy', E'\n' ORDER BY (j->>'rn')::int)
    INTO rows_html, rows_text
    FROM jsonb_array_elements(shown) j;

    title := hits || ' new ' || CASE WHEN hits = 1 THEN 'job matches' ELSE 'jobs match' END || ' your skills';
    fname := nullif(split_part(btrim(coalesce(u.full_name, '')), ' ', 1), '');
    subject := left(CASE WHEN fname IS NOT NULL THEN 'Jobs for you, ' || fname || '! ' ELSE '' END || title || CASE WHEN p_mode = 'weekly' THEN ' this week' ELSE ' today' END || ' — ' || (shown->0->>'title'), 120);
    intro := 'Hi ' || mv_esc(coalesce(nullif(split_part(btrim(coalesce(u.full_name, '')), ' ', 1), ''), 'there')) || ', '
             || CASE WHEN top_skills IS NOT NULL THEN 'these roles ask for <b style="color:#0f172a">' || mv_esc(top_skills) || '</b> — skills on your CV. ' ELSE '' END
             || 'Posted ' || CASE WHEN p_mode = 'weekly' THEN 'this week' ELSE 'since your last email' END
             || ' and picked from ' || mv_esc(coalesce(sources, 'your account')) || '.';
    more_html := CASE WHEN hits > cap THEN
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 0"><tr><td style="background:#eff6ff;border-radius:14px;padding:16px 18px;font-size:14px;line-height:1.5;color:#1e3a8a">'
        || '<b>+' || (hits - cap) || ' more ' || CASE WHEN hits - cap = 1 THEN 'job matches' ELSE 'jobs match' END || ' you.</b> '
        || CASE WHEN cap < 10 THEN '<a href="https://madevisa.com/pricing?s=fy#pro" style="color:#1d4ed8;font-weight:700">See them all with MadeVisa Pro &rarr;</a>'
                ELSE '<a href="https://madevisa.com/cv-match?s=fy" style="color:#1d4ed8;font-weight:700">See all your matches &rarr;</a>' END
        || '</td></tr></table>'
      ELSE '' END;

    ok := public.mv_send_email(
      u.email, subject,
      public.mv_email_html(
        concat_ws(' · ', top_skills, (shown->0->>'title') || ' at ' || (shown->0->>'company')),
        'Jobs that match your skills',
        title,
        intro,
        rows_html || more_html
          || '<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#475569">Open your matches to see your score on each job, and the skills an ad asks for that your CV doesn’t show yet.</p>',
        'See all your matches', 'https://madevisa.com/cv-match?s=fy',
        'You get this ' || p_mode || ' because you have a MadeVisa account. You never get the same job twice.',
        unsub, unsub_all),
      title || E'\n\n' || rows_text
        || CASE WHEN hits > cap THEN E'\n\n+' || (hits - cap) || ' more: https://madevisa.com/pricing#pro' ELSE '' END
        || E'\n\nAll your matches: https://madevisa.com/cv-match?s=fy'
        || E'\n\nEmail settings: ' || manage || E'\nUnsubscribe: ' || unsub,
      'for_you', u.id, unsub);
    -- Not sent (budget, or turned off): the jobs stay unsent for next time.
    CONTINUE WHEN NOT ok;
    IF is_paid_u THEN paid_left := paid_left - 1; ELSE members_left := members_left - 1; END IF;

    INSERT INTO public.for_you_sent (user_id, job_id)
    SELECT u.id, (j->>'job_id')::uuid FROM jsonb_array_elements(shown) j
    ON CONFLICT DO NOTHING;
    UPDATE public.for_you_settings SET last_sent_at = now() WHERE user_id = u.id;
    sent := sent + 1;
  END LOOP;

  DELETE FROM public.for_you_sent WHERE sent_at < now() - interval '400 days';
  RETURN sent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'run_for_you_emails: %', SQLERRM;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.run_for_you_emails(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_job_alert_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  ALERT_EMAILS_PER_RUN constant integer := 90;
  SHOWN constant integer := 3;
  key text;
  a record;
  jobs jsonb;
  hits integer;
  rows_html text;
  rows_text text;
  subject text;
  unsub text;
  since timestamptz;
  list_url text;
  count_html text;
  what_html text;
  sent integer := 0;
  ok boolean;
  is_paid_u boolean;
  paid_left integer := public.mv_email_left('paid');
  members_left integer := public.mv_email_left('members');
BEGIN
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN 0; END IF;

  FOR a IN
    SELECT al.*, u.email, coalesce(c.name, '') AS country_name
    FROM public.job_alerts al
    JOIN auth.users u ON u.id = al.user_id AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
    LEFT JOIN public.countries c ON c.iso_code = al.country_code
    LEFT JOIN public.email_prefs ep ON ep.user_id = al.user_id
    WHERE al.active AND al.email_enabled
      AND NOT coalesce(ep.all_off, false) AND coalesce(ep.job_alerts, true)
      AND (al.last_emailed_at IS NULL OR al.last_emailed_at < now() - interval '20 hours')
    ORDER BY (public.plan_tier(al.user_id) IN ('starter', 'pro')) DESC, al.last_emailed_at NULLS FIRST
  LOOP
    EXIT WHEN sent >= ALERT_EMAILS_PER_RUN;
    EXIT WHEN paid_left <= 0 AND members_left <= 0;
    is_paid_u := public.plan_tier(a.user_id) IN ('starter', 'pro');
    CONTINUE WHEN (is_paid_u AND paid_left <= 0) OR (NOT is_paid_u AND members_left <= 0) OR public.mv_job_emailed_today(a.user_id);
    since := coalesce(a.last_emailed_at, a.created_at);

    SELECT count(*), coalesce(jsonb_agg(j ORDER BY rn) FILTER (WHERE rn <= SHOWN), '[]'::jsonb)
    INTO hits, jobs
    FROM (
      SELECT jsonb_build_object('id', s.id, 'title', s.title, 'company', p.name, 'logo', p.logo_url, 'city', s.city, 'country', co.name,
               'visa', (s.visa_status = 'offered' OR s.visa_sponsorship),
               'salary', CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END) AS j,
             row_number() OVER (ORDER BY (s.visa_status = 'offered' OR s.visa_sponsorship) DESC, s.released_at DESC) AS rn
      FROM public.sponsored_jobs s
      JOIN public.program_publishers p ON p.id = s.publisher_id
      LEFT JOIN public.countries co ON co.id = s.country_id
      WHERE s.released_at > since AND s.released_at <= now()
        AND s.status = 'published' AND NOT s.awaiting_release
        AND (a.country_code IS NULL OR co.iso_code = a.country_code)
        AND (a.keywords = '' OR s.title ILIKE '%' || a.keywords || '%' OR s.job_function ILIKE '%' || a.keywords || '%')
    ) t;

    CONTINUE WHEN hits = 0;

    -- The full list on /jobs: the alert's words, its country and the time since the last alert.
    list_url := 'https://madevisa.com/jobs?s=em'
      || CASE WHEN a.keywords <> '' THEN '&q=' || public.mv_urlencode(a.keywords) ELSE '' END
      || CASE WHEN a.country_name <> '' THEN '&country=' || public.mv_urlencode(a.country_name) ELSE '' END
      || '&posted=' || public.mv_urlencode(CASE WHEN since > now() - interval '26 hours' THEN 'Past 24 hours' WHEN since > now() - interval '3 days' THEN 'Past 3 days' WHEN since > now() - interval '7 days' THEN 'Past week' ELSE 'Past 2 weeks' END);

    unsub := 'https://madevisa.com/alerts/unsubscribe?t=' || a.unsub_token::text;
    SELECT string_agg(
             public.mv_email_job('https://madevisa.com/jobs/sponsored-' || (j->>'id') || '?s=em', j->>'title', j->>'company', j->>'logo',
               nullif(concat_ws(', ', j->>'city', j->>'country'), ''),
               CASE WHEN (j->>'visa')::boolean THEN public.mv_email_chip('Visa sponsorship', 'blue') ELSE '' END
               || CASE WHEN j->>'salary' IS NOT NULL THEN public.mv_email_chip(j->>'salary', 'gray') ELSE '' END), ''),
           string_agg('• ' || (j->>'title') || ' — ' || (j->>'company') || E'\n  https://madevisa.com/jobs/sponsored-' || (j->>'id') || '?s=em', E'\n')
    INTO rows_html, rows_text
    FROM jsonb_array_elements(jobs) j;

    subject := hits || ' new ' || CASE WHEN hits = 1 THEN 'job' ELSE 'jobs' END
               || CASE WHEN a.keywords <> '' THEN ' for “' || a.keywords || '”' ELSE '' END
               || CASE WHEN a.country_name <> '' THEN ' in ' || a.country_name ELSE '' END;
    count_html := '<a href="' || mv_esc(list_url) || '" style="color:#1d4ed8;font-weight:800;text-decoration:underline">'
                  || hits || ' new ' || CASE WHEN hits = 1 THEN 'job' ELSE 'jobs' END || '</a>';
    what_html := CASE WHEN a.keywords <> '' THEN ' for <b style="color:#0f172a">“' || mv_esc(a.keywords) || '”</b>' ELSE '' END
                 || CASE WHEN a.country_name <> '' THEN ' in ' || mv_esc(a.country_name) ELSE '' END;

    ok := public.mv_send_email(
      a.email, subject,
      public.mv_email_html(
        (jobs->0->>'title') || ' at ' || (jobs->0->>'company'),
        'Job alert',
        subject,
        count_html || what_html || ' since your last alert.'
          || CASE WHEN hits > SHOWN THEN ' Here are ' || SHOWN || ' of them — the rest are one click away.' ELSE '' END,
        rows_html
          || CASE WHEN hits > SHOWN THEN '<p style="margin:14px 0 0;font-size:15px"><a href="' || mv_esc(list_url) || '" style="color:#1d4ed8;font-weight:700;text-decoration:underline">See all ' || hits || ' jobs &rarr;</a></p>' ELSE '' END,
        'See all ' || hits || CASE WHEN hits = 1 THEN ' job' ELSE ' jobs' END, list_url,
        'You get this because you set a job alert on MadeVisa.',
        unsub, public.mv_unsub_url(a.user_id, 'all')),
      subject || E'\n\n' || rows_text
        || CASE WHEN hits > SHOWN THEN E'\n\nSee all ' || hits || ': ' || list_url ELSE '' END
        || E'\n\nUnsubscribe from this alert: ' || unsub,
      'job_alert', a.user_id, unsub);
    CONTINUE WHEN NOT ok;
    IF is_paid_u THEN paid_left := paid_left - 1; ELSE members_left := members_left - 1; END IF;
    UPDATE public.job_alerts SET last_emailed_at = now() WHERE id = a.id;
    sent := sent + 1;
  END LOOP;
  RETURN sent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'run_job_alert_emails: %', SQLERRM;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.run_job_alert_emails() FROM PUBLIC, anon, authenticated;


/* 6 hours after signing up, not on Starter or Pro yet: one reminder of what Starter unlocks. */
CREATE OR REPLACE FUNCTION public.run_starter_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  u record;
  fname text;
  n_matches integer;
  body text;
  sent integer := 0;
BEGIN
  IF coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') = '' THEN RETURN 0; END IF;
  FOR u IN
    SELECT au.id, au.email, pr.full_name,
      EXISTS (SELECT 1 FROM public.user_cvs c WHERE c.user_id = au.id) AS has_cv
    FROM auth.users au
    LEFT JOIN public.profiles pr ON pr.id = au.id
    WHERE au.email_confirmed_at IS NOT NULL AND au.email IS NOT NULL AND au.deleted_at IS NULL
      AND au.created_at <= now() - interval '6 hours' AND au.created_at > now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.email_log l WHERE l.user_id = au.id AND l.kind = 'starter_reminder')
    ORDER BY au.created_at
    LIMIT 40
  LOOP
    CONTINUE WHEN public.plan_tier(u.id) IN ('starter', 'pro');
    CONTINUE WHEN NOT public.email_allowed(u.id, 'news') OR public.mv_job_emailed_today(u.id);
    fname := nullif(split_part(btrim(coalesce(u.full_name, '')), ' ', 1), '');
    n_matches := 0;
    IF u.has_cv THEN
      BEGIN
        SELECT count(*) INTO n_matches FROM public.for_you_matches(u.id, now() - interval '14 days', 60);
      EXCEPTION WHEN OTHERS THEN n_matches := 0;
      END;
    END IF;
    body := '<p style="margin:0;font-size:15px;line-height:1.6;color:#334155">'
      || CASE WHEN n_matches > 0
           THEN 'We found <b style="color:#0f172a">' || n_matches || ' jobs</b> that match your CV. On the free plan you see your top matches; '
           ELSE 'Upload your CV and MadeVisa ranks every job for you. On the free plan you see your top matches; ' END
      || '<b style="color:#0f172a">Starter shows every match, best first, with the full report on each job</b> — what you have, what’s missing, and the experience they want.</p>'
      || '<p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#334155">Starter is <b style="color:#0f172a">$2.99 a month</b>. Cancel any time.</p>';
    PERFORM public.mv_send_email(
      u.email,
      CASE WHEN fname IS NOT NULL THEN fname || ', your best job matches are waiting' ELSE 'Your best job matches are waiting' END,
      public.mv_email_html(
        'Every match, best first, for $2.99 a month.', 'MadeVisa Starter',
        'See all your best matches',
        'Hi ' || mv_esc(coalesce(fname, 'there')) || ', thanks for joining MadeVisa.',
        body, 'See my matches with Starter', 'https://madevisa.com/pricing?s=st6h#starter',
        'You get this once, because you signed up for MadeVisa today.', public.mv_unsub_url(u.id, 'news'), public.mv_unsub_url(u.id, 'all')),
      'Hi ' || coalesce(fname, 'there') || E',\n\n'
        || CASE WHEN n_matches > 0 THEN 'We found ' || n_matches || ' jobs that match your CV. ' ELSE '' END
        || 'Starter shows every match, best first, with the full report on each job, for $2.99 a month.'
        || E'\n\nSee my matches: https://madevisa.com/pricing?s=st6h#starter',
      'starter_reminder', u.id, public.mv_unsub_url(u.id, 'news'), 'madevisa-st6h-' || u.id);
    sent := sent + 1;
  END LOOP;
  RETURN sent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'run_starter_reminders: %', SQLERRM;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.run_starter_reminders() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('madevisa-starter-reminders');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('madevisa-starter-reminders', '17 * * * *', 'select public.run_starter_reminders()');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
