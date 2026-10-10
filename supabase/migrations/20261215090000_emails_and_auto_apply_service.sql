/*
# Emails (design, settings, log) + Auto Apply service (one file)
Run AFTER 20261214090000_jobs_for_you_contacts.sql. Paste the whole file once
in the Supabase SQL Editor. Safe to run more than once.

1. EMAIL SETTINGS (per account)
   - email_prefs: job alerts on/off, application updates on/off, news on/off,
     "unsubscribe from all", and one token for one-click unsubscribe links.
     "Jobs that match your skills" keeps its daily / weekly / off setting in
     for_you_settings.
   - my_email_prefs() / set_email_prefs(jsonb): the card in Profile → Settings.
   - email_unsubscribe(token, kind): the link in every email (no sign-in).
     kind = foryou | alerts | applications | news | all.

2. EVERY EMAIL GOES THROUGH ONE FUNCTION, AND IS LOGGED
   - mv_send_email(...): checks the person's settings, sends through Resend
     (the key already in app_secrets), and writes a row to email_log.
   - email_log_settle(): copies Resend's answer (accepted / refused) from pg_net
     onto the log. Runs every 5 minutes, and whenever the admin opens Emails.
   - admin_email_stats(tz): Admin → Emails: sent today, by type, by hour, the
     last 14 days, and the latest emails.
   Re-defined to use it: job alerts, "Jobs for you", "You applied" (Auto Apply),
   the batch summary and admin emails. Sign-in codes are sent by Supabase Auth
   and are not in this log.

3. NEW EMAIL DESIGN
   - mv_email_html(...): one layout for every email: header, card, button,
     footer with "Email settings · Unsubscribe · Unsubscribe from all".
   - mv_email_job(...): a job row (logo or initial, title, company · place,
     chips: matched skills, visa sponsorship, salary).
   - "Jobs that match your skills" (run_for_you_emails) and job alerts now use
     it, and show the skills each job matched.

4. AUTO APPLY SERVICE (Pro, one month)
   - auto_apply_requests: one per person while it runs: consent (with the exact
     text agreed to), preferences, answers for application forms, dates.
   - auto_apply_items: the jobs to apply to (from the person's CV matches, or
     added by an admin) and what happened: queued → applying → applied | skipped.
   - Person: auto_apply_me(), auto_apply_start(jsonb), auto_apply_set(status),
     auto_apply_sync(jobs).
   - Admin: admin_auto_apply_list(filter), admin_auto_apply_get(id),
     admin_auto_apply_item(id, status, note, admin_note),
     admin_auto_apply_add(...), admin_auto_apply_update(...).
   - Marking an item "applied" sends the person a bell notification and the
     "You applied" email (once).
   - New request → admin bell + email to hello@madevisa.com.

5. PROFILE
   - my_applied_jobs(): jobs the person applied to (their own Apply clicks and
     the ones MadeVisa applied to), for the simplified profile dashboard.
*/

SET lock_timeout = '5s';

-- ===========================================================================
-- 1. EMAIL SETTINGS
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.email_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  job_alerts boolean NOT NULL DEFAULT true,
  applications boolean NOT NULL DEFAULT true,
  news boolean NOT NULL DEFAULT true,
  all_off boolean NOT NULL DEFAULT false,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_prefs_token_idx ON public.email_prefs (token);
ALTER TABLE public.email_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_prefs FROM anon, authenticated;

/* The person's unsubscribe token (creates their settings row the first time). */
CREATE OR REPLACE FUNCTION public.email_token(p_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t uuid;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  SELECT token INTO t FROM public.email_prefs WHERE user_id = p_user;
  IF t IS NULL THEN
    INSERT INTO public.email_prefs (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT token INTO t FROM public.email_prefs WHERE user_id = p_user;
  END IF;
  RETURN t;
END;
$$;
REVOKE ALL ON FUNCTION public.email_token(uuid) FROM PUBLIC, anon, authenticated;

/* May this person get this kind of email? Kinds: for_you, job_alert, application, news.
   Anything else (admin, account) is always allowed. */
CREATE OR REPLACE FUNCTION public.email_allowed(p_user uuid, p_kind text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e public.email_prefs;
BEGIN
  IF p_user IS NULL OR p_kind NOT IN ('for_you', 'job_alert', 'application', 'news') THEN RETURN true; END IF;
  SELECT * INTO e FROM public.email_prefs WHERE user_id = p_user;
  IF FOUND AND e.all_off THEN RETURN false; END IF;
  RETURN CASE p_kind
    WHEN 'for_you' THEN coalesce((SELECT frequency <> 'off' FROM public.for_you_settings WHERE user_id = p_user), true)
    WHEN 'job_alert' THEN coalesce(e.job_alerts, true)
    WHEN 'application' THEN coalesce(e.applications, true)
    WHEN 'news' THEN coalesce(e.news, true)
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.email_allowed(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_email_prefs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  e public.email_prefs;
BEGIN
  IF me IS NULL THEN RETURN NULL; END IF;
  PERFORM public.email_token(me);
  SELECT * INTO e FROM public.email_prefs WHERE user_id = me;
  RETURN jsonb_build_object(
    'email', (SELECT email FROM auth.users WHERE id = me),
    'for_you', coalesce((SELECT frequency FROM public.for_you_settings WHERE user_id = me), 'daily'),
    'job_alerts', e.job_alerts,
    'applications', e.applications,
    'news', e.news,
    'all_off', e.all_off,
    'alerts_count', (SELECT count(*) FROM public.job_alerts WHERE user_id = me AND active)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_email_prefs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_email_prefs() TO authenticated;

/* Change one or more settings: {"for_you":"weekly","job_alerts":false,"applications":true,"news":false,"all_off":false}.
   Turning anything on also lifts "unsubscribe from all". */
CREATE OR REPLACE FUNCTION public.set_email_prefs(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  turned_on boolean := false;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  PERFORM public.email_token(me);
  IF p ? 'for_you' THEN
    IF (p->>'for_you') NOT IN ('daily', 'weekly', 'off') THEN RAISE EXCEPTION 'Choose daily, weekly or off.'; END IF;
    INSERT INTO public.for_you_settings (user_id, frequency) VALUES (me, p->>'for_you')
    ON CONFLICT (user_id) DO UPDATE SET frequency = excluded.frequency, updated_at = now();
    turned_on := turned_on OR (p->>'for_you') <> 'off';
  END IF;
  IF p ? 'job_alerts' THEN
    UPDATE public.email_prefs SET job_alerts = (p->>'job_alerts')::boolean WHERE user_id = me;
    turned_on := turned_on OR (p->>'job_alerts')::boolean;
  END IF;
  IF p ? 'applications' THEN
    UPDATE public.email_prefs SET applications = (p->>'applications')::boolean WHERE user_id = me;
    turned_on := turned_on OR (p->>'applications')::boolean;
  END IF;
  IF p ? 'news' THEN
    UPDATE public.email_prefs SET news = (p->>'news')::boolean WHERE user_id = me;
    turned_on := turned_on OR (p->>'news')::boolean;
  END IF;
  IF p ? 'all_off' THEN
    UPDATE public.email_prefs SET all_off = (p->>'all_off')::boolean WHERE user_id = me;
    IF (p->>'all_off')::boolean THEN
      UPDATE public.for_you_settings SET frequency = 'off', updated_at = now() WHERE user_id = me;
      UPDATE public.email_prefs SET job_alerts = false, applications = false, news = false WHERE user_id = me;
    END IF;
  ELSIF turned_on THEN
    UPDATE public.email_prefs SET all_off = false WHERE user_id = me;
  END IF;
  UPDATE public.email_prefs SET updated_at = now() WHERE user_id = me;
  RETURN public.my_email_prefs();
END;
$$;
REVOKE ALL ON FUNCTION public.set_email_prefs(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_email_prefs(jsonb) TO authenticated;

/* One-click unsubscribe from an email link. Returns what was switched off ('' = bad link). */
CREATE OR REPLACE FUNCTION public.email_unsubscribe(p_token uuid, p_kind text DEFAULT 'all')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  k text := lower(coalesce(p_kind, 'all'));
BEGIN
  SELECT user_id INTO uid FROM public.email_prefs WHERE token = p_token;
  -- Older "Jobs for you" emails carry the for_you_settings token.
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
  RETURN 'All MadeVisa emails';
END;
$$;
REVOKE ALL ON FUNCTION public.email_unsubscribe(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_unsubscribe(uuid, text) TO anon, authenticated;

-- ===========================================================================
-- 2. EMAIL LOG + ONE SENDING FUNCTION
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.email_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  kind text NOT NULL,
  subject text NOT NULL,
  request_id bigint,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  status_code integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_at_idx ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_pending_idx ON public.email_log (request_id) WHERE status = 'queued';
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.mv_esc(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'); $$;

/* Send one email through Resend and log it. Returns true when it was handed to Resend.
   p_kind: for_you | job_alert | application | auto_apply | news | admin | account.
   The person's email settings are checked here (p_user given). */
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
  rid bigint;
  hdr jsonb;
  body jsonb;
  pref_kind text := CASE WHEN p_kind = 'auto_apply' THEN 'application' ELSE p_kind END;
BEGIN
  IF coalesce(btrim(p_to), '') = '' THEN RETURN false; END IF;
  IF p_user IS NOT NULL AND NOT public.email_allowed(p_user, pref_kind) THEN
    INSERT INTO public.email_log (user_id, to_email, kind, subject, status, error)
    VALUES (p_user, p_to, p_kind, left(p_subject, 300), 'skipped', 'Turned off in email settings');
    RETURN false;
  END IF;
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN false; END IF;
  SELECT value INTO sender FROM public.app_secrets WHERE name = 'email_from';

  hdr := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json');
  IF p_idempotency IS NOT NULL THEN hdr := hdr || jsonb_build_object('Idempotency-Key', left(p_idempotency, 250)); END IF;
  body := jsonb_build_object(
    'from', coalesce(sender, 'MadeVisa <onboarding@resend.dev>'),
    'to', jsonb_build_array(p_to),
    'subject', left(p_subject, 300),
    'tags', jsonb_build_array(jsonb_build_object('name', 'kind', 'value', regexp_replace(p_kind, '[^a-zA-Z0-9_-]', '_', 'g')))
  );
  IF p_html IS NOT NULL THEN body := body || jsonb_build_object('html', p_html); END IF;
  IF p_text IS NOT NULL THEN body := body || jsonb_build_object('text', p_text); END IF;
  IF p_reply_to IS NOT NULL THEN body := body || jsonb_build_object('reply_to', p_reply_to); END IF;
  IF p_unsub_url IS NOT NULL THEN
    body := body || jsonb_build_object('headers', jsonb_build_object('List-Unsubscribe', '<' || p_unsub_url || '>', 'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
  END IF;

  SELECT net.http_post(url := 'https://api.resend.com/emails', headers := hdr, body := body, timeout_milliseconds := 10000) INTO rid;
  INSERT INTO public.email_log (user_id, to_email, kind, subject, request_id) VALUES (p_user, p_to, p_kind, left(p_subject, 300), rid);
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

/* Resend's answer (from pg_net, kept there for ~6 hours) onto the log. */
CREATE OR REPLACE FUNCTION public.email_log_settle()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer := 0;
BEGIN
  BEGIN
    EXECUTE $q$
      UPDATE public.email_log l
      SET status = CASE WHEN r.status_code BETWEEN 200 AND 299 THEN 'sent' ELSE 'failed' END,
          status_code = r.status_code,
          error = CASE WHEN r.status_code BETWEEN 200 AND 299 THEN NULL ELSE left(coalesce(r.error_msg, r.content, 'No answer'), 300) END
      FROM net._http_response r
      WHERE l.status = 'queued' AND l.request_id = r.id AND l.created_at > now() - interval '1 day'
    $q$;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'email_log_settle: %', SQLERRM;
  END;
  -- pg_net forgets answers after a while: older ones without an answer are counted as sent (Resend took them).
  UPDATE public.email_log SET status = 'sent' WHERE status = 'queued' AND created_at < now() - interval '12 hours';
  DELETE FROM public.email_log WHERE created_at < now() - interval '180 days';
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.email_log_settle() FROM PUBLIC, anon, authenticated;

/* Admin → Emails. p_tz: the admin's time zone, so "today" is their today. */
CREATE OR REPLACE FUNCTION public.admin_email_stats(p_tz text DEFAULT 'UTC')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz text := coalesce(nullif(p_tz, ''), 'UTC');
  d0 timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  BEGIN
    PERFORM now() AT TIME ZONE tz;
  EXCEPTION WHEN OTHERS THEN tz := 'UTC';
  END;
  PERFORM public.email_log_settle();
  d0 := date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz;

  RETURN jsonb_build_object(
    'tz', tz,
    'configured', EXISTS (SELECT 1 FROM public.app_secrets WHERE name = 'resend_api_key' AND coalesce(value, '') <> ''),
    'sender', (SELECT value FROM public.app_secrets WHERE name = 'email_from'),
    'today', (
      SELECT jsonb_build_object(
        'total', count(*) FILTER (WHERE status <> 'skipped'),
        'sent', count(*) FILTER (WHERE status = 'sent'),
        'queued', count(*) FILTER (WHERE status = 'queued'),
        'failed', count(*) FILTER (WHERE status = 'failed'),
        'skipped', count(*) FILTER (WHERE status = 'skipped'),
        'people', count(DISTINCT lower(to_email)) FILTER (WHERE status <> 'skipped'))
      FROM public.email_log WHERE created_at >= d0),
    'yesterday', (SELECT count(*) FROM public.email_log WHERE created_at >= d0 - interval '1 day' AND created_at < d0 AND status <> 'skipped'),
    'by_kind', coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', kind, 'n', n, 'failed', f) ORDER BY n DESC)
      FROM (SELECT kind, count(*) FILTER (WHERE status <> 'skipped') AS n, count(*) FILTER (WHERE status = 'failed') AS f
            FROM public.email_log WHERE created_at >= d0 GROUP BY kind) k WHERE n > 0), '[]'::jsonb),
    'by_hour', (
      SELECT jsonb_agg(coalesce(c.n, 0) ORDER BY h.h)
      FROM generate_series(0, 23) h(h)
      LEFT JOIN (SELECT extract(hour FROM created_at AT TIME ZONE tz)::int AS h, count(*) AS n
                 FROM public.email_log WHERE created_at >= d0 AND status <> 'skipped' GROUP BY 1) c ON c.h = h.h),
    'days', (
      SELECT jsonb_agg(jsonb_build_object('d', to_char(d.d, 'YYYY-MM-DD'), 'n', coalesce(c.n, 0)) ORDER BY d.d)
      FROM generate_series((d0 AT TIME ZONE tz)::date - 13, (d0 AT TIME ZONE tz)::date, interval '1 day') d(d)
      LEFT JOIN (SELECT (created_at AT TIME ZONE tz)::date AS d, count(*) AS n
                 FROM public.email_log WHERE created_at >= d0 - interval '14 days' AND status <> 'skipped' GROUP BY 1) c ON c.d = d.d::date),
    'recent', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', l.created_at, 'to', l.to_email, 'kind', l.kind, 'subject', l.subject, 'status', l.status,
                                          'code', l.status_code, 'error', l.error, 'name', p.full_name) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.email_log ORDER BY created_at DESC LIMIT 150) l
      LEFT JOIN public.profiles p ON p.id = l.user_id), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_email_stats(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_email_stats(text) TO authenticated;

-- ===========================================================================
-- 3. EMAIL DESIGN
-- ===========================================================================

/* The layout every email uses.
   p_title, p_preheader, p_cta_label, p_reason: plain text (escaped here).
   p_intro, p_body: HTML (callers escape what they put in). */
CREATE OR REPLACE FUNCTION public.mv_email_html(
  p_preheader text,
  p_eyebrow text,
  p_title text,
  p_intro text,
  p_body text,
  p_cta_label text DEFAULT NULL,
  p_cta_url text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_unsub_url text DEFAULT NULL,
  p_unsub_all_url text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
SELECT
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  || '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' || mv_esc(p_title) || '</title></head>'
  || '<body style="margin:0;padding:0;background:#f1f4f9;-webkit-text-size-adjust:100%">'
  || '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f4f9">' || mv_esc(coalesce(p_preheader, '')) || '&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f4f9"><tr><td align="center" style="padding:28px 12px">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">'
  -- header
  || '<tr><td style="padding:0 6px 18px">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
  || '<td style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">'
  || '<a href="https://madevisa.com/?s=em" style="text-decoration:none;color:#0f172a;font-size:22px;letter-spacing:-0.4px">'
  || '<span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;background:#1d4ed8;color:#ffffff;border-radius:9px;font-size:16px;vertical-align:middle">&#9992;</span>'
  || '<span style="vertical-align:middle;padding-left:8px">made<b>visa</b></span></a></td>'
  || CASE WHEN p_eyebrow IS NOT NULL THEN '<td align="right" style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#64748b;letter-spacing:0.2px">' || mv_esc(p_eyebrow) || '</td>' ELSE '' END
  || '</tr></table></td></tr>'
  -- card
  || '<tr><td style="background:#ffffff;border-radius:18px;border:1px solid #e2e8f0;padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">'
  || '<h1 style="margin:0 0 10px;font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.4px;color:#0f172a">' || mv_esc(p_title) || '</h1>'
  || CASE WHEN coalesce(p_intro, '') <> '' THEN '<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#475569">' || p_intro || '</p>' ELSE '' END
  || coalesce(p_body, '')
  || CASE WHEN p_cta_url IS NOT NULL THEN
       '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px"><tr><td style="border-radius:999px;background:#1d4ed8">'
       || '<a href="' || mv_esc(p_cta_url) || '" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">' || mv_esc(coalesce(p_cta_label, 'Open MadeVisa')) || ' &rarr;</a>'
       || '</td></tr></table>'
     ELSE '' END
  || '</td></tr>'
  -- footer
  || '<tr><td style="padding:22px 10px 0;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center">'
  || '<p style="margin:0 0 6px;color:#64748b;font-weight:600">MadeVisa &middot; Find your path to a new life abroad</p>'
  || CASE WHEN p_reason IS NOT NULL THEN '<p style="margin:0 0 8px">' || mv_esc(p_reason) || '</p>' ELSE '' END
  || '<p style="margin:0 0 8px">'
  || '<a href="https://madevisa.com/profile?tab=settings#emails" style="color:#64748b;text-decoration:underline">Email settings</a>'
  || CASE WHEN p_unsub_url IS NOT NULL THEN ' &nbsp;&middot;&nbsp; <a href="' || mv_esc(p_unsub_url) || '" style="color:#64748b;text-decoration:underline">Unsubscribe</a>' ELSE '' END
  || CASE WHEN p_unsub_all_url IS NOT NULL THEN ' &nbsp;&middot;&nbsp; <a href="' || mv_esc(p_unsub_all_url) || '" style="color:#64748b;text-decoration:underline">Unsubscribe from all</a>' ELSE '' END
  || '</p>'
  || '<p style="margin:0">&copy; ' || extract(year FROM now())::int || ' MadeVisa &middot; <a href="https://madevisa.com/?s=em" style="color:#94a3b8;text-decoration:none">madevisa.com</a> &middot; <a href="mailto:hello@madevisa.com" style="color:#94a3b8;text-decoration:none">hello@madevisa.com</a></p>'
  || '</td></tr>'
  || '</table></td></tr></table></body></html>';
$$;

/* A chip: tone = green | blue | gray | amber. Text is escaped. */
CREATE OR REPLACE FUNCTION public.mv_email_chip(p_text text, p_tone text DEFAULT 'gray')
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
SELECT '<span style="display:inline-block;margin:6px 6px 0 0;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;line-height:18px;'
  || CASE p_tone
       WHEN 'green' THEN 'background:#ecfdf5;color:#047857'
       WHEN 'blue' THEN 'background:#eff6ff;color:#1d4ed8'
       WHEN 'amber' THEN 'background:#fffbeb;color:#b45309'
       ELSE 'background:#f1f5f9;color:#334155' END
  || '">' || mv_esc(p_text) || '</span>';
$$;

/* One job, as a row: logo (or the company's first letter), title, company · place, chips, "View". p_chips is HTML from mv_email_chip. */
CREATE OR REPLACE FUNCTION public.mv_email_job(p_url text, p_title text, p_company text, p_logo text, p_place text, p_chips text DEFAULT '')
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
SELECT '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:14px;margin:0 0 12px"><tr>'
  || '<td width="48" valign="top" style="padding:16px 0 16px 16px">'
  || CASE WHEN coalesce(p_logo, '') ~ '^https://' THEN
       '<img src="' || mv_esc(p_logo) || '" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:10px;border:1px solid #e2e8f0;object-fit:contain;background:#ffffff">'
     ELSE
       '<div style="width:44px;height:44px;line-height:44px;border-radius:10px;background:#eef2ff;color:#1d4ed8;text-align:center;font-size:18px;font-weight:700">' || mv_esc(upper(left(coalesce(nullif(btrim(p_company), ''), '•'), 1))) || '</div>'
     END
  || '</td>'
  || '<td valign="top" style="padding:14px 16px 16px 14px;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">'
  || '<a href="' || mv_esc(p_url) || '" style="font-size:16px;line-height:1.35;font-weight:700;color:#0f172a;text-decoration:none">' || mv_esc(p_title) || '</a>'
  || '<div style="margin-top:3px;font-size:13.5px;line-height:1.45;color:#64748b">' || mv_esc(p_company) || CASE WHEN coalesce(p_place, '') <> '' THEN ' &middot; ' || mv_esc(p_place) ELSE '' END || '</div>'
  || CASE WHEN coalesce(p_chips, '') <> '' THEN '<div style="margin-top:4px">' || p_chips || '</div>' ELSE '' END
  || '<div style="margin-top:10px"><a href="' || mv_esc(p_url) || '" style="font-size:13.5px;font-weight:700;color:#1d4ed8;text-decoration:none">View job &rarr;</a></div>'
  || '</td></tr></table>';
$$;

/* "Reason" footer links for one person. */
CREATE OR REPLACE FUNCTION public.mv_unsub_url(p_user uuid, p_kind text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT 'https://madevisa.com/alerts/unsubscribe?k=' || p_kind || '&t=' || public.email_token(p_user)::text; $$;
REVOKE ALL ON FUNCTION public.mv_unsub_url(uuid, text) FROM PUBLIC, anon, authenticated;

/* Admin emails (plan requests, Auto Apply requests…), now logged too. */
CREATE OR REPLACE FUNCTION public.send_admin_email(p_subject text, p_text text, p_reply_to text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.mv_send_email('hello@madevisa.com', p_subject, NULL, p_text, 'admin', NULL, NULL, NULL, p_reply_to);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'send_admin_email failed: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.send_admin_email(text, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- "Jobs that match your skills" — now with the matched skills and logos.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.for_you_matches(uuid, timestamptz, integer);
CREATE FUNCTION public.for_you_matches(p_user uuid, p_since timestamptz, p_limit integer DEFAULT 40)
RETURNS TABLE (job_id uuid, title text, company text, logo text, city text, country text, visa boolean, salary text, score integer, why text, hit text, skills text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  terms jsonb := public.for_you_terms(p_user);
  titles text[];
  skills text[];
  countries text[];
BEGIN
  SELECT coalesce(array_agg(x), '{}') INTO titles FROM jsonb_array_elements_text(terms->'titles') x;
  SELECT coalesce(array_agg(x), '{}') INTO skills FROM jsonb_array_elements_text(terms->'skills') x;
  SELECT coalesce(array_agg(x), '{}') INTO countries FROM jsonb_array_elements_text(terms->'countries') x;
  IF coalesce(array_length(titles, 1), 0) = 0 THEN RETURN; END IF;
  RETURN QUERY
  WITH cand AS (
    SELECT s.id, s.title, p.name AS company, p.logo_url AS logo, s.city, co.name AS country, co.iso_code AS iso,
           (s.visa_status = 'offered' OR s.visa_sponsorship) AS visa,
           CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END AS salary,
           lower(s.title || ' ' || coalesce(s.job_function, '')) AS head,
           lower(left(coalesce(s.requirements, '') || ' ' || coalesce(s.description, ''), 5000)) AS body,
           coalesce(s.released_at, s.created_at) AS at
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE coalesce(s.released_at, s.created_at) > p_since AND coalesce(s.released_at, s.created_at) <= now()
      AND s.status = 'published' AND NOT s.awaiting_release
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND NOT EXISTS (SELECT 1 FROM public.for_you_sent x WHERE x.user_id = p_user AND x.job_id = s.id)
      AND lower(s.title || ' ' || coalesce(s.job_function, '')) LIKE ANY (SELECT '%' || t || '%' FROM unnest(titles) t)
  ),
  scored AS (
    SELECT c.*,
           (SELECT t FROM unnest(titles) WITH ORDINALITY u(t, o) WHERE c.head LIKE '%' || t || '%' ORDER BY o LIMIT 1) AS hit_t,
           (SELECT array_agg(k) FROM unnest(skills) k WHERE c.head ~ ('\m' || regexp_replace(k, '([.+#*?()\[\]\\^$|])', '\\\1', 'g') || '\M')
              OR c.body ~ ('\m' || regexp_replace(k, '([.+#*?()\[\]\\^$|])', '\\\1', 'g') || '\M')) AS sk
    FROM cand c
  )
  SELECT s.id, s.title, s.company, s.logo, s.city, s.country, s.visa, s.salary,
         (10 + least(coalesce(array_length(s.sk, 1), 0), 6) * 3 + CASE WHEN s.iso = ANY (countries) THEN 4 ELSE 0 END + CASE WHEN s.visa THEN 2 ELSE 0 END)::integer AS score,
         concat_ws(' · ', 'matches “' || s.hit_t || '”', CASE WHEN array_length(s.sk, 1) > 0 THEN array_to_string(s.sk[1:3], ', ') END) AS why,
         s.hit_t,
         coalesce(s.sk, '{}'::text[])
  FROM scored s
  ORDER BY score DESC, s.at DESC
  LIMIT greatest(1, least(p_limit, 100));
END;
$$;
REVOKE ALL ON FUNCTION public.for_you_matches(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;

/* "python" → "Python", "machine learning" → "Machine learning" (skills are stored lower-case). */
CREATE OR REPLACE FUNCTION public.mv_skill_label(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(p) IN ('sql', 'aws', 'gcp', 'api', 'apis', 'ui', 'ux', 'seo', 'crm', 'erp', 'sap', 'php', 'css', 'html', 'etl', 'qa', 'hr', 'it', 'ai', 'ml', 'bi', 'kpi', 'b2b', 'b2c', 'ci', 'cd', 'iot', 'nlp') THEN upper(p)
    ELSE upper(left(p, 1)) || substr(p, 2) END;
$$;

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
    ORDER BY f.last_checked_at NULLS FIRST
  LOOP
    EXIT WHEN sent >= FOR_YOU_PER_RUN OR clock_timestamp() - started > interval '240 seconds';

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
    subject := left(title || CASE WHEN p_mode = 'weekly' THEN ' this week' ELSE ' today' END || ' — ' || (shown->0->>'title'), 120);
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

    PERFORM public.mv_send_email(
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

-- ---------------------------------------------------------------------------
-- Job alerts — same design, logged, respects the settings.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_job_alert_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  ALERT_EMAILS_PER_RUN constant integer := 90;
  key text;
  a record;
  jobs jsonb;
  hits integer;
  rows_html text;
  rows_text text;
  subject text;
  unsub text;
  sent integer := 0;
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
    ORDER BY al.last_emailed_at NULLS FIRST
  LOOP
    EXIT WHEN sent >= ALERT_EMAILS_PER_RUN;

    SELECT count(*), coalesce(jsonb_agg(j) FILTER (WHERE rn <= 5), '[]'::jsonb)
    INTO hits, jobs
    FROM (
      SELECT jsonb_build_object('id', s.id, 'title', s.title, 'company', p.name, 'logo', p.logo_url, 'city', s.city, 'country', co.name,
               'visa', (s.visa_status = 'offered' OR s.visa_sponsorship),
               'salary', CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END) AS j,
             row_number() OVER (ORDER BY (s.visa_status = 'offered' OR s.visa_sponsorship) DESC, s.released_at DESC) AS rn
      FROM public.sponsored_jobs s
      JOIN public.program_publishers p ON p.id = s.publisher_id
      LEFT JOIN public.countries co ON co.id = s.country_id
      WHERE s.released_at > coalesce(a.last_emailed_at, a.created_at) AND s.released_at <= now()
        AND s.status = 'published' AND NOT s.awaiting_release
        AND (a.country_code IS NULL OR co.iso_code = a.country_code)
        AND (a.keywords = '' OR s.title ILIKE '%' || a.keywords || '%' OR s.job_function ILIKE '%' || a.keywords || '%')
    ) t;

    CONTINUE WHEN hits = 0;

    -- This alert only (one click), as before; "unsubscribe from all" uses the person's token.
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

    PERFORM public.mv_send_email(
      a.email, subject,
      public.mv_email_html(
        (jobs->0->>'title') || ' at ' || (jobs->0->>'company'),
        'Job alert',
        subject,
        'New since your last alert' || CASE WHEN hits > 5 THEN ' — the 5 most relevant are below' ELSE '' END || '.',
        rows_html
          || CASE WHEN hits > 5 THEN '<p style="margin:14px 0 0;font-size:14px"><a href="https://madevisa.com/jobs?s=em" style="color:#1d4ed8;font-weight:700;text-decoration:none">See all ' || hits || ' on MadeVisa &rarr;</a></p>' ELSE '' END
          || '<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#475569">Job doesn’t mention a visa? <a href="https://madevisa.com/offers?s=em" style="color:#1d4ed8;font-weight:600">Send them a Visa Plan</a> — your first one is free.</p>',
        'Check your match', 'https://madevisa.com/cv-match?s=em',
        'You get this because you set a job alert on MadeVisa.',
        unsub, public.mv_unsub_url(a.user_id, 'all')),
      subject || E'\n\n' || rows_text || E'\n\nUnsubscribe from this alert: ' || unsub,
      'job_alert', a.user_id, unsub);
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

-- ---------------------------------------------------------------------------
-- The earlier Auto Apply's "You applied" email — same design, logged, settings.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_notify_submitted(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.job_applications;
  to_email text;
  first text;
  conf text;
  at_text text;
  subject text;
  details text;
  closing text;
  link text := 'https://madevisa.com/cv-match#applications';
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id = p_id;
  IF NOT FOUND OR a.status <> 'submitted' OR NOT a.verified THEN RETURN; END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (a.user_id, 'application_submitted', 'You applied: ' || a.title || ' at ' || a.company,
          concat_ws(' · ', 'Submitted by MadeVisa', CASE WHEN a.email_used IS NOT NULL THEN 'using ' || a.email_used END), '/cv-match#applications');

  IF NOT (SELECT notify_each FROM public.apply_settings) THEN RETURN; END IF;
  to_email := coalesce(nullif(a.email_used, ''), (SELECT email FROM auth.users WHERE id = a.user_id));
  IF coalesce(to_email, '') = '' THEN RETURN; END IF;

  first := nullif(split_part(trim(coalesce(
    (SELECT answers->'first_name'->>'value' FROM public.application_profiles WHERE user_id = a.user_id),
    (SELECT answers->'full_name'->>'value' FROM public.application_profiles WHERE user_id = a.user_id),
    (SELECT full_name FROM public.profiles WHERE id = a.user_id), '')), ' ', 1), '');
  conf := CASE WHEN a.confirmation->>'id' IS NOT NULL AND a.confirmation->>'id' <> a.id::text THEN a.confirmation->>'id' END;
  at_text := to_char(coalesce(a.submitted_at, now()) AT TIME ZONE 'utc', 'DD Mon YYYY, HH24:MI') || ' UTC';
  subject := 'You applied: ' || a.title || ' at ' || a.company;
  closing := CASE WHEN a.channel = 'madevisa' THEN a.company || ' received your application by email. Replies come straight to you.'
                  ELSE 'MadeVisa submitted it on ' || a.company || '’s careers site. Their confirmation email, and any reply, will come to ' || coalesce(a.email_used, to_email) || '.' END;
  details := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;font-size:14px;line-height:1.5">'
    || '<tr><td style="padding:8px 0;color:#64748b;width:130px;border-top:1px solid #f1f5f9">When</td><td style="padding:8px 0;border-top:1px solid #f1f5f9">' || mv_esc(at_text) || '</td></tr>'
    || '<tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Email used</td><td style="padding:8px 0;border-top:1px solid #f1f5f9">' || mv_esc(coalesce(a.email_used, to_email)) || '</td></tr>'
    || CASE WHEN conf IS NOT NULL THEN '<tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Confirmation</td><td style="padding:8px 0;border-top:1px solid #f1f5f9">' || mv_esc(conf) || '</td></tr>' ELSE '' END
    || '<tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Match</td><td style="padding:8px 0;border-top:1px solid #f1f5f9">' || a.score || '%</td></tr>'
    || '</table>'
    || '<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#475569">' || mv_esc(closing) || ' Good luck!</p>';

  PERFORM public.mv_send_email(
    to_email, subject,
    public.mv_email_html(closing, 'Application sent', 'You applied for ' || a.title || ' at ' || a.company,
      'Hi ' || mv_esc(coalesce(first, 'there')) || ', your application is out.',
      public.mv_email_job('https://madevisa.com/jobs/sponsored-' || a.job_id || '?s=ap', a.title, a.company, NULL, NULL, public.mv_email_chip(a.score || '% match', 'green')) || details,
      'See what was sent', link,
      'You get this because MadeVisa applied to a job for you.',
      public.mv_unsub_url(a.user_id, 'applications'), public.mv_unsub_url(a.user_id, 'all')),
    concat_ws(E'\n', 'Hi ' || coalesce(first, 'there') || ',', '', 'You applied for ' || a.title || ' at ' || a.company || '.', '',
      'When: ' || at_text, 'Email used: ' || coalesce(a.email_used, to_email), CASE WHEN conf IS NOT NULL THEN 'Confirmation: ' || conf END, '',
      closing, '', 'See exactly what was sent: ' || link),
    'application', a.user_id, public.mv_unsub_url(a.user_id, 'applications'), 'madevisa-applied-' || a.id);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_notify_submitted(uuid) FROM PUBLIC, anon, authenticated;

/* The earlier Auto Apply's end-of-batch summary — unchanged, but sent through mv_send_email (logged). */
CREATE OR REPLACE FUNCTION public.apply_queue_settle(p_queue uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.application_queues;
  sent int;
  attention int;
  skipped int;
  body text;
BEGIN
  IF p_queue IS NULL THEN RETURN; END IF;
  SELECT * INTO q FROM public.application_queues WHERE id = p_queue;
  IF q.state <> 'running' OR EXISTS (SELECT 1 FROM public.job_applications x WHERE x.queue_id = q.id AND public.apply_pending(x.status)) THEN RETURN; END IF;
  UPDATE public.application_queues SET state = 'done', pause_reason = NULL, finished_at = now(), updated_at = now() WHERE id = q.id AND state = 'running';
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.apply_log(q.user_id, 'auto_apply_completed', NULL, q.id, NULL);

  SELECT count(*) FILTER (WHERE status = 'submitted'),
         count(*) FILTER (WHERE status IN ('needs_attention', 'blocked', 'failed')),
         count(*) FILTER (WHERE status IN ('skipped', 'already_applied', 'expired'))
    INTO sent, attention, skipped
    FROM public.job_applications WHERE queue_id = q.id;
  IF q.notified_at IS NOT NULL OR sent + attention = 0 THEN RETURN; END IF;
  IF attention = 0 AND (SELECT notify_each FROM public.apply_settings) THEN
    UPDATE public.application_queues SET notified_at = now() WHERE id = q.id;
    RETURN;
  END IF;
  UPDATE public.application_queues SET notified_at = now() WHERE id = q.id;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (q.user_id, 'auto_apply_done',
          CASE WHEN sent > 0 THEN sent || CASE WHEN sent = 1 THEN ' application submitted' ELSE ' applications submitted' END ELSE 'Your applications need your attention' END,
          concat_ws(' · ', CASE WHEN q.email IS NOT NULL THEN 'Using ' || q.email END, CASE WHEN attention > 0 THEN attention || ' need your attention' END),
          '/cv-match#applications');

  IF coalesce(q.email, '') = '' THEN RETURN; END IF;
  body := concat_ws(E'\n',
    'Your applications are out.',
    '',
    sent || CASE WHEN sent = 1 THEN ' application was' ELSE ' applications were' END || ' submitted on the employers’ career sites using ' || q.email || '.',
    CASE WHEN attention > 0 THEN attention || CASE WHEN attention = 1 THEN ' application needs' ELSE ' applications need' END || ' your attention — for example an employer that asks you to sign in.' END,
    CASE WHEN skipped > 0 THEN skipped || ' skipped (already applied, or no longer open).' END,
    '',
    'Employers reply to ' || q.email || ' directly. Confirmation emails from them will arrive there too.',
    '',
    'See every application, with the CV and answers used: https://madevisa.com/cv-match#applications');
  PERFORM public.mv_send_email(
    q.email,
    CASE WHEN sent > 0 THEN sent || CASE WHEN sent = 1 THEN ' application submitted' ELSE ' applications submitted' END || ' — MadeVisa' ELSE 'Your MadeVisa applications need your attention' END,
    NULL, body, 'application', q.user_id, public.mv_unsub_url(q.user_id, 'applications'), 'madevisa-batch-' || q.id);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_queue_settle(uuid) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 4. AUTO APPLY SERVICE (Pro, one month; applications made by the MadeVisa team)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.auto_apply_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped', 'ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  per_day integer NOT NULL DEFAULT 5 CHECK (per_day BETWEEN 1 AND 25),
  min_score integer NOT NULL DEFAULT 60 CHECK (min_score BETWEEN 0 AND 100),
  roles text[] NOT NULL DEFAULT '{}',
  countries text[] NOT NULL DEFAULT '{}',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_email text CHECK (contact_email IS NULL OR char_length(contact_email) <= 200),
  consent_text text NOT NULL,
  consent_at timestamptz NOT NULL DEFAULT now(),
  admin_note text,
  welcomed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auto_apply_requests_open_idx ON public.auto_apply_requests (user_id) WHERE status IN ('active', 'paused');
CREATE INDEX IF NOT EXISTS auto_apply_requests_user_idx ON public.auto_apply_requests (user_id, created_at DESC);
ALTER TABLE public.auto_apply_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auto_apply_requests_own" ON public.auto_apply_requests;
CREATE POLICY "auto_apply_requests_own" ON public.auto_apply_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
REVOKE ALL ON public.auto_apply_requests FROM anon, authenticated;
GRANT SELECT ON public.auto_apply_requests TO authenticated;

CREATE TABLE IF NOT EXISTS public.auto_apply_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.auto_apply_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.sponsored_jobs(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) <= 300),
  company text NOT NULL CHECK (char_length(company) <= 200),
  location text CHECK (location IS NULL OR char_length(location) <= 200),
  url text CHECK (url IS NULL OR char_length(url) <= 1000),
  score integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'applying', 'applied', 'skipped')),
  source text NOT NULL DEFAULT 'match' CHECK (source IN ('match', 'admin')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 2000),
  applied_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auto_apply_items_job_idx ON public.auto_apply_items (request_id, job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS auto_apply_items_req_idx ON public.auto_apply_items (request_id, status);
CREATE INDEX IF NOT EXISTS auto_apply_items_user_idx ON public.auto_apply_items (user_id, applied_at DESC);
ALTER TABLE public.auto_apply_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auto_apply_items_own" ON public.auto_apply_items;
CREATE POLICY "auto_apply_items_own" ON public.auto_apply_items FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
REVOKE ALL ON public.auto_apply_items FROM anon, authenticated;
GRANT SELECT ON public.auto_apply_items TO authenticated;

/* A month is over → ended (run lazily and once a day). */
CREATE OR REPLACE FUNCTION public.auto_apply_expire()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.auto_apply_requests SET status = 'ended', updated_at = now()
  WHERE status IN ('active', 'paused') AND ends_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_expire() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auto_apply_item_json(i public.auto_apply_items)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', i.id, 'job_id', i.job_id, 'title', i.title, 'company', i.company, 'location', i.location,
    'score', i.score, 'status', i.status, 'note', i.note, 'applied_at', i.applied_at, 'created_at', i.created_at, 'updated_at', i.updated_at,
    'logo', (SELECT p.logo_url FROM public.sponsored_jobs j JOIN public.program_publishers p ON p.id = j.publisher_id WHERE j.id = i.job_id));
$$;
REVOKE ALL ON FUNCTION public.auto_apply_item_json(public.auto_apply_items) FROM PUBLIC, anon, authenticated;

/* Everything the CV match page shows. */
CREATE OR REPLACE FUNCTION public.auto_apply_me()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.auto_apply_requests;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('signed_in', false, 'pro', false, 'request', NULL, 'items', '[]'::jsonb); END IF;
  UPDATE public.auto_apply_requests SET status = 'ended', updated_at = now() WHERE user_id = me AND status IN ('active', 'paused') AND ends_at <= now();
  SELECT * INTO r FROM public.auto_apply_requests WHERE user_id = me ORDER BY (status IN ('active', 'paused')) DESC, created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'signed_in', true,
    'pro', public.is_pro(me),
    'email', (SELECT email FROM auth.users WHERE id = me),
    'request', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', r.id, 'status', r.status, 'started_at', r.started_at, 'ends_at', r.ends_at, 'per_day', r.per_day, 'min_score', r.min_score,
      'roles', to_jsonb(r.roles), 'countries', to_jsonb(r.countries), 'answers', r.answers, 'contact_email', r.contact_email, 'consent_at', r.consent_at) END,
    'items', CASE WHEN r.id IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(public.auto_apply_item_json(i) ORDER BY (i.status = 'applying') DESC, (i.status = 'queued') DESC, coalesce(i.applied_at, i.created_at) DESC)
      FROM public.auto_apply_items i WHERE i.request_id = r.id AND i.status <> 'skipped'), '[]'::jsonb) END,
    'stats', CASE WHEN r.id IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object(
        'applied', count(*) FILTER (WHERE status = 'applied'),
        'queued', count(*) FILTER (WHERE status = 'queued'),
        'applying', count(*) FILTER (WHERE status = 'applying'),
        'applied_today', count(*) FILTER (WHERE status = 'applied' AND applied_at > now() - interval '24 hours'),
        'last_applied_at', max(applied_at))
      FROM public.auto_apply_items WHERE request_id = r.id) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_apply_me() TO authenticated;

/* Turn Auto Apply on (or update the answers while it runs).
   p: {consent: true, consent_text, roles: [], countries: [], per_day, min_score, contact_email, answers: {...}} */
CREATE OR REPLACE FUNCTION public.auto_apply_start(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.auto_apply_requests;
  v_roles text[];
  v_countries text[];
  v_email text := nullif(btrim(coalesce(p->>'contact_email', '')), '');
  v_answers jsonb := coalesce(p->'answers', '{}'::jsonb);
  v_per_day integer := least(greatest(coalesce((p->>'per_day')::integer, 5), 1), 25);
  v_min integer := least(greatest(coalesce((p->>'min_score')::integer, 60), 0), 100);
  is_new boolean := false;
  who text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF NOT public.is_pro(me) THEN RAISE EXCEPTION 'Auto Apply comes with MadeVisa Pro.'; END IF;
  IF NOT coalesce((p->>'consent')::boolean, false) OR coalesce(btrim(p->>'consent_text'), '') = '' THEN
    RAISE EXCEPTION 'Please agree that MadeVisa may apply for you.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_cvs WHERE user_id = me) THEN RAISE EXCEPTION 'Upload your CV first.'; END IF;
  IF v_email IS NOT NULL AND v_email !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN RAISE EXCEPTION 'Check the email address.'; END IF;
  IF jsonb_typeof(v_answers) <> 'object' OR length(v_answers::text) > 8000 THEN RAISE EXCEPTION 'Your answers are too long.'; END IF;
  SELECT coalesce(array_agg(left(btrim(x), 80)) FILTER (WHERE btrim(x) <> ''), '{}') INTO v_roles
    FROM (SELECT jsonb_array_elements_text(coalesce(p->'roles', '[]'::jsonb)) x LIMIT 8) t;
  SELECT coalesce(array_agg(left(btrim(x), 60)) FILTER (WHERE btrim(x) <> ''), '{}') INTO v_countries
    FROM (SELECT jsonb_array_elements_text(coalesce(p->'countries', '[]'::jsonb)) x LIMIT 12) t;

  UPDATE public.auto_apply_requests SET status = 'ended', updated_at = now() WHERE user_id = me AND status IN ('active', 'paused') AND ends_at <= now();
  SELECT * INTO r FROM public.auto_apply_requests WHERE user_id = me AND status IN ('active', 'paused');
  IF FOUND THEN
    UPDATE public.auto_apply_requests
    SET roles = v_roles, countries = v_countries, per_day = v_per_day, min_score = v_min, answers = v_answers,
        contact_email = v_email, consent_text = p->>'consent_text', consent_at = now(), updated_at = now()
    WHERE id = r.id RETURNING * INTO r;
  ELSE
    INSERT INTO public.auto_apply_requests (user_id, roles, countries, per_day, min_score, answers, contact_email, consent_text)
    VALUES (me, v_roles, v_countries, v_per_day, v_min, v_answers, v_email, p->>'consent_text')
    RETURNING * INTO r;
    is_new := true;
  END IF;

  IF is_new THEN
    SELECT coalesce(nullif(full_name, ''), email) INTO who FROM public.profiles WHERE id = me;
    INSERT INTO public.notifications (audience, kind, title, body, link)
    VALUES ('admin', 'auto_apply_request', 'New Auto Apply: ' || coalesce(who, 'a Pro member'),
            concat_ws(' · ', nullif(array_to_string(v_roles, ', '), ''), v_per_day || ' a day', 'until ' || to_char(r.ends_at, 'DD Mon')), '/admin?tab=autoapply');
    PERFORM public.send_admin_email(
      'New Auto Apply request — ' || coalesce(who, 'Pro member'),
      concat_ws(E'\n',
        coalesce(who, '—') || ' turned on Auto Apply.',
        '',
        'Roles: ' || coalesce(nullif(array_to_string(v_roles, ', '), ''), '—'),
        'Countries: ' || coalesce(nullif(array_to_string(v_countries, ', '), ''), 'any'),
        'Up to ' || v_per_day || ' applications a day, matches from ' || v_min || '%',
        'Contact email for employers: ' || coalesce(v_email, (SELECT email FROM auth.users WHERE id = me)),
        'Runs until ' || to_char(r.ends_at AT TIME ZONE 'utc', 'DD Mon YYYY'),
        '',
        'Open it: https://madevisa.com/admin?tab=autoapply&r=' || r.id),
      coalesce(v_email, (SELECT email FROM auth.users WHERE id = me)));
    PERFORM public.auto_apply_welcome(r.id);
  END IF;
  RETURN public.auto_apply_me();
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_start(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_apply_start(jsonb) TO authenticated;

/* Pause / resume / stop. */
CREATE OR REPLACE FUNCTION public.auto_apply_set(p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.auto_apply_requests;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF p_status NOT IN ('active', 'paused', 'stopped') THEN RAISE EXCEPTION 'Unknown status.'; END IF;
  UPDATE public.auto_apply_requests SET status = 'ended', updated_at = now() WHERE user_id = me AND status IN ('active', 'paused') AND ends_at <= now();
  SELECT * INTO r FROM public.auto_apply_requests WHERE user_id = me AND status IN ('active', 'paused');
  IF NOT FOUND THEN RAISE EXCEPTION 'Auto Apply isn’t running.'; END IF;
  IF p_status = 'active' AND NOT public.is_pro(me) THEN RAISE EXCEPTION 'Auto Apply comes with MadeVisa Pro.'; END IF;
  UPDATE public.auto_apply_requests SET status = p_status, updated_at = now() WHERE id = r.id;
  IF p_status = 'stopped' THEN
    UPDATE public.auto_apply_items SET status = 'skipped', note = 'Stopped by you', updated_at = now() WHERE request_id = r.id AND status = 'queued';
  END IF;
  RETURN public.auto_apply_me();
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_set(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_apply_set(text) TO authenticated;

/* The person's current CV matches → the queue (only while Auto Apply runs).
   p_jobs: [{id, score}] — titles, companies and links come from the job itself. At most 40 waiting. */
CREATE OR REPLACE FUNCTION public.auto_apply_sync(p_jobs jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.auto_apply_requests;
  waiting integer;
  added integer := 0;
BEGIN
  IF me IS NULL OR jsonb_typeof(p_jobs) <> 'array' THEN RETURN 0; END IF;
  SELECT * INTO r FROM public.auto_apply_requests WHERE user_id = me AND status = 'active' AND ends_at > now();
  IF NOT FOUND OR NOT public.is_pro(me) THEN RETURN 0; END IF;
  SELECT count(*) INTO waiting FROM public.auto_apply_items WHERE request_id = r.id AND status IN ('queued', 'applying');
  IF waiting >= 40 THEN RETURN 0; END IF;

  WITH given AS (
    SELECT DISTINCT ON (id) id, score FROM (
      SELECT (x->>'id')::uuid AS id, least(greatest(coalesce((x->>'score')::integer, 0), 0), 100) AS score
      FROM (SELECT x FROM jsonb_array_elements(p_jobs) x LIMIT 100) t
      WHERE (x->>'id') ~* '^[0-9a-f-]{36}$'
    ) g ORDER BY id, score DESC
  ), fresh AS (
    SELECT g.id, g.score, s.title, p.name AS company, nullif(concat_ws(', ', s.city, co.name), '') AS location, s.official_url
    FROM given g
    JOIN public.sponsored_jobs s ON s.id = g.id AND s.status = 'published'
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE g.score >= r.min_score
      AND NOT EXISTS (SELECT 1 FROM public.auto_apply_items i WHERE i.user_id = me AND i.job_id = g.id)
      AND NOT EXISTS (SELECT 1 FROM public.application_reports a WHERE a.user_id = me AND a.listing_kind = 'job' AND a.listing_id = g.id)
    ORDER BY g.score DESC
    LIMIT 40 - waiting
  ), ins AS (
    INSERT INTO public.auto_apply_items (request_id, user_id, job_id, title, company, location, url, score)
    SELECT r.id, me, f.id, left(f.title, 300), left(f.company, 200), left(f.location, 200), left(f.official_url, 1000), f.score FROM fresh f
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO added FROM ins;
  RETURN added;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_sync(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_apply_sync(jsonb) TO authenticated;

/* "Auto Apply is on" — the first email after turning it on. */
CREATE OR REPLACE FUNCTION public.auto_apply_welcome(p_request uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.auto_apply_requests;
  to_email text;
  first text;
  until_text text;
  body text;
BEGIN
  SELECT * INTO r FROM public.auto_apply_requests WHERE id = p_request;
  IF NOT FOUND OR r.welcomed_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.auto_apply_requests SET welcomed_at = now() WHERE id = r.id;
  to_email := (SELECT email FROM auth.users WHERE id = r.user_id);
  first := nullif(split_part(btrim(coalesce((SELECT full_name FROM public.profiles WHERE id = r.user_id), '')), ' ', 1), '');
  until_text := to_char(r.ends_at AT TIME ZONE 'utc', 'FMDD FMMonth YYYY');

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (r.user_id, 'auto_apply_on', 'Auto Apply is on', 'MadeVisa applies to your best matches until ' || until_text || '. You get an email for each application.', '/cv-match#auto-apply');

  body := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.55;color:#334155">'
    || '<tr><td width="36" valign="top" style="padding:10px 0"><div style="width:26px;height:26px;line-height:26px;border-radius:999px;background:#eff6ff;color:#1d4ed8;text-align:center;font-weight:700;font-size:13px">1</div></td>'
    || '<td style="padding:10px 0"><b style="color:#0f172a">Your best matches go in the queue.</b><br>Jobs that match your CV at ' || r.min_score || '% or more' || CASE WHEN array_length(r.roles, 1) > 0 THEN ', for ' || mv_esc(array_to_string(r.roles, ', ')) ELSE '' END || '.</td></tr>'
    || '<tr><td width="36" valign="top" style="padding:10px 0"><div style="width:26px;height:26px;line-height:26px;border-radius:999px;background:#eff6ff;color:#1d4ed8;text-align:center;font-weight:700;font-size:13px">2</div></td>'
    || '<td style="padding:10px 0"><b style="color:#0f172a">MadeVisa applies — up to ' || r.per_day || ' a day.</b><br>With your CV and the answers you gave, on each employer’s own application page.</td></tr>'
    || '<tr><td width="36" valign="top" style="padding:10px 0"><div style="width:26px;height:26px;line-height:26px;border-radius:999px;background:#eff6ff;color:#1d4ed8;text-align:center;font-weight:700;font-size:13px">3</div></td>'
    || '<td style="padding:10px 0"><b style="color:#0f172a">You get an email for every application.</b><br>Employers reply to ' || mv_esc(coalesce(r.contact_email, to_email)) || '.</td></tr>'
    || '</table>'
    || '<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#475569">You can pause or stop it any time on the CV match page.</p>';

  PERFORM public.mv_send_email(
    to_email, 'Auto Apply is on — until ' || until_text,
    public.mv_email_html('MadeVisa now applies to your best matches until ' || until_text || '.', 'Auto Apply',
      'Auto Apply is on', 'Hi ' || mv_esc(coalesce(first, 'there')) || ', MadeVisa now applies to your best job matches for you, until <b style="color:#0f172a">' || mv_esc(until_text) || '</b>.',
      body, 'See your applications', 'https://madevisa.com/cv-match?s=aa#auto-apply',
      'You get this because you turned on Auto Apply.', public.mv_unsub_url(r.user_id, 'applications'), public.mv_unsub_url(r.user_id, 'all')),
    'Auto Apply is on.' || E'\n\n' || 'MadeVisa now applies to your best matches until ' || until_text || ', up to ' || r.per_day || ' a day, and emails you for each application.'
      || E'\n\nSee your applications: https://madevisa.com/cv-match#auto-apply',
    'auto_apply', r.user_id, public.mv_unsub_url(r.user_id, 'applications'), 'madevisa-aa-on-' || r.id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'auto_apply_welcome: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_welcome(uuid) FROM PUBLIC, anon, authenticated;

/* "You applied for X at Y" — once per item, when an admin marks it applied. */
CREATE OR REPLACE FUNCTION public.auto_apply_notify(p_item uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.auto_apply_items;
  r public.auto_apply_requests;
  to_email text;
  reply_email text;
  first text;
  at_text text;
  n_applied integer;
  n_queued integer;
  logo text;
  job_url text;
  subject text;
  details text;
BEGIN
  SELECT * INTO i FROM public.auto_apply_items WHERE id = p_item;
  IF NOT FOUND OR i.status <> 'applied' OR i.notified_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.auto_apply_items SET notified_at = now() WHERE id = i.id;
  SELECT * INTO r FROM public.auto_apply_requests WHERE id = i.request_id;
  to_email := (SELECT email FROM auth.users WHERE id = i.user_id);
  reply_email := coalesce(r.contact_email, to_email);
  first := nullif(split_part(btrim(coalesce((SELECT full_name FROM public.profiles WHERE id = i.user_id), '')), ' ', 1), '');
  at_text := to_char(coalesce(i.applied_at, now()) AT TIME ZONE 'utc', 'FMDD Mon YYYY, HH24:MI') || ' UTC';
  SELECT count(*) FILTER (WHERE status = 'applied'), count(*) FILTER (WHERE status IN ('queued', 'applying'))
    INTO n_applied, n_queued FROM public.auto_apply_items WHERE request_id = i.request_id;
  SELECT p.logo_url INTO logo FROM public.sponsored_jobs j JOIN public.program_publishers p ON p.id = j.publisher_id WHERE j.id = i.job_id;
  job_url := CASE WHEN i.job_id IS NOT NULL THEN 'https://madevisa.com/jobs/sponsored-' || i.job_id || '?s=aa' ELSE coalesce(i.url, 'https://madevisa.com/cv-match#auto-apply') END;
  subject := 'You applied: ' || i.title || ' at ' || i.company;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (i.user_id, 'auto_apply_applied', subject, concat_ws(' · ', 'Applied by MadeVisa Auto Apply', CASE WHEN i.score IS NOT NULL THEN i.score || '% match' END), '/cv-match#auto-apply');

  details := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;font-size:14px;line-height:1.5">'
    || '<tr><td style="padding:9px 0;color:#64748b;width:140px;border-top:1px solid #f1f5f9">Applied</td><td style="padding:9px 0;border-top:1px solid #f1f5f9;color:#0f172a">' || mv_esc(at_text) || '</td></tr>'
    || '<tr><td style="padding:9px 0;color:#64748b;border-top:1px solid #f1f5f9">Replies go to</td><td style="padding:9px 0;border-top:1px solid #f1f5f9;color:#0f172a">' || mv_esc(reply_email) || '</td></tr>'
    || CASE WHEN i.note IS NOT NULL THEN '<tr><td style="padding:9px 0;color:#64748b;border-top:1px solid #f1f5f9">Note</td><td style="padding:9px 0;border-top:1px solid #f1f5f9;color:#0f172a">' || mv_esc(i.note) || '</td></tr>' ELSE '' END
    || '<tr><td style="padding:9px 0;color:#64748b;border-top:1px solid #f1f5f9">This month</td><td style="padding:9px 0;border-top:1px solid #f1f5f9;color:#0f172a">'
    || n_applied || ' applied' || CASE WHEN n_queued > 0 THEN ' &middot; ' || n_queued || ' in the queue' ELSE '' END || '</td></tr>'
    || '</table>'
    || '<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#475569">If ' || mv_esc(i.company) || ' gets back to you, it will be at ' || mv_esc(reply_email) || '. Keep an eye on that inbox — and your spam folder. Good luck!</p>';

  PERFORM public.mv_send_email(
    to_email, subject,
    public.mv_email_html('MadeVisa applied for ' || i.title || ' at ' || i.company || ' for you.', 'Auto Apply',
      'You applied for ' || i.title || ' at ' || i.company,
      'Hi ' || mv_esc(coalesce(first, 'there')) || ', Auto Apply just sent your application.',
      public.mv_email_job(job_url, i.title, i.company, logo, i.location,
        CASE WHEN i.score IS NOT NULL THEN public.mv_email_chip(i.score || '% match', 'green') ELSE '' END || public.mv_email_chip('✓ Applied', 'blue'))
        || details,
      'See all your applications', 'https://madevisa.com/cv-match?s=aa#auto-apply',
      'You get this because Auto Apply is on for your account.',
      public.mv_unsub_url(i.user_id, 'applications'), public.mv_unsub_url(i.user_id, 'all')),
    concat_ws(E'\n', 'Hi ' || coalesce(first, 'there') || ',', '', 'Auto Apply sent your application for ' || i.title || ' at ' || i.company || '.', '',
      'Applied: ' || at_text, 'Replies go to: ' || reply_email, CASE WHEN i.note IS NOT NULL THEN 'Note: ' || i.note END,
      'This month: ' || n_applied || ' applied' || CASE WHEN n_queued > 0 THEN ', ' || n_queued || ' in the queue' ELSE '' END, '',
      'All your applications: https://madevisa.com/cv-match#auto-apply'),
    'application', i.user_id, public.mv_unsub_url(i.user_id, 'applications'), 'madevisa-aa-applied-' || i.id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'auto_apply_notify: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_notify(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auto_apply_items_applied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'applied' AND NEW.notified_at IS NULL AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'applied') THEN
    PERFORM public.auto_apply_notify(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'auto_apply_items_applied: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS auto_apply_items_applied ON public.auto_apply_items;
CREATE TRIGGER auto_apply_items_applied
  AFTER INSERT OR UPDATE OF status ON public.auto_apply_items
  FOR EACH ROW EXECUTE FUNCTION public.auto_apply_items_applied();

-- ---- Admin ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_auto_apply_list(p_filter text DEFAULT 'open')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  PERFORM public.auto_apply_expire();
  RETURN jsonb_build_object(
    'counts', (SELECT jsonb_build_object(
        'open', count(*) FILTER (WHERE status IN ('active', 'paused')),
        'active', count(*) FILTER (WHERE status = 'active'),
        'all', count(*),
        'queued', (SELECT count(*) FROM public.auto_apply_items i JOIN public.auto_apply_requests q ON q.id = i.request_id WHERE q.status = 'active' AND i.status IN ('queued', 'applying')),
        'applied_today', (SELECT count(*) FROM public.auto_apply_items WHERE status = 'applied' AND applied_at > now() - interval '24 hours'))
      FROM public.auto_apply_requests),
    'rows', coalesce((
      SELECT jsonb_agg(row ORDER BY (row->>'sort')::int, row->>'started_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', r.id, 'user_id', r.user_id, 'status', r.status, 'started_at', r.started_at, 'ends_at', r.ends_at, 'per_day', r.per_day,
          'min_score', r.min_score, 'roles', to_jsonb(r.roles), 'countries', to_jsonb(r.countries),
          'name', p.full_name, 'email', coalesce(p.email, u.email), 'avatar', p.avatar_url, 'pro', public.is_pro(r.user_id),
          'has_cv', EXISTS (SELECT 1 FROM public.user_cvs c WHERE c.user_id = r.user_id),
          'queued', (SELECT count(*) FROM public.auto_apply_items i WHERE i.request_id = r.id AND i.status IN ('queued', 'applying')),
          'applied', (SELECT count(*) FROM public.auto_apply_items i WHERE i.request_id = r.id AND i.status = 'applied'),
          'applied_today', (SELECT count(*) FROM public.auto_apply_items i WHERE i.request_id = r.id AND i.status = 'applied' AND i.applied_at > now() - interval '24 hours'),
          'last_applied_at', (SELECT max(applied_at) FROM public.auto_apply_items i WHERE i.request_id = r.id),
          'sort', CASE r.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END
        ) AS row
        FROM public.auto_apply_requests r
        LEFT JOIN public.profiles p ON p.id = r.user_id
        LEFT JOIN auth.users u ON u.id = r.user_id
        WHERE CASE coalesce(p_filter, 'open')
                WHEN 'open' THEN r.status IN ('active', 'paused')
                WHEN 'active' THEN r.status = 'active'
                ELSE true END
        ORDER BY r.created_at DESC
        LIMIT 300
      ) t), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_auto_apply_list(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_auto_apply_list(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_auto_apply_get(p_request uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.auto_apply_requests;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.auto_apply_requests WHERE id = p_request;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'request', to_jsonb(r),
    'person', (
      SELECT jsonb_build_object('id', p.id, 'name', p.full_name, 'email', coalesce(p.email, u.email), 'phone', p.phone, 'avatar', p.avatar_url,
        'linkedin', p.linkedin_url, 'username', p.username, 'occupation', p.occupation, 'specialization', p.specialization,
        'education', p.education, 'experience', p.experience, 'languages', to_jsonb(p.languages),
        'lives_in', (SELECT name FROM public.countries WHERE id = p.country_id),
        'citizenship', (SELECT name FROM public.countries WHERE id = p.nationality_country_id),
        'pro', public.is_pro(p.id), 'joined', u.created_at)
      FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE p.id = r.user_id),
    'cv', (
      SELECT jsonb_build_object('file_name', c.file_name, 'storage_path', c.storage_path, 'text', c.text, 'updated_at', c.updated_at,
        'titles', coalesce(c.profile->'titles', '[]'::jsonb), 'years', c.profile->'years')
      FROM public.user_cvs c WHERE c.user_id = r.user_id),
    'items', coalesce((
      SELECT jsonb_agg(public.auto_apply_item_json(i) || jsonb_build_object('url', coalesce(i.url, s.official_url), 'admin_note', i.admin_note, 'source', i.source,
               'live', s.status = 'published', 'notified_at', i.notified_at)
             ORDER BY CASE i.status WHEN 'applying' THEN 0 WHEN 'queued' THEN 1 WHEN 'applied' THEN 2 ELSE 3 END, i.score DESC NULLS LAST, coalesce(i.applied_at, i.created_at) DESC)
      FROM public.auto_apply_items i LEFT JOIN public.sponsored_jobs s ON s.id = i.job_id
      WHERE i.request_id = r.id), '[]'::jsonb),
    'history', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', h.id, 'status', h.status, 'started_at', h.started_at, 'ends_at', h.ends_at) ORDER BY h.created_at DESC)
      FROM public.auto_apply_requests h WHERE h.user_id = r.user_id AND h.id <> r.id), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_auto_apply_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_auto_apply_get(uuid) TO authenticated;

/* Set one job's status: applying | applied | skipped | queued. "applied" emails the person (once). */
CREATE OR REPLACE FUNCTION public.admin_auto_apply_item(p_item uuid, p_status text, p_note text DEFAULT NULL, p_admin_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.auto_apply_items;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('queued', 'applying', 'applied', 'skipped') THEN RAISE EXCEPTION 'Unknown status.'; END IF;
  UPDATE public.auto_apply_items
  SET status = p_status,
      applied_at = CASE WHEN p_status = 'applied' THEN coalesce(applied_at, now()) WHEN p_status IN ('queued', 'applying') THEN NULL ELSE applied_at END,
      note = CASE WHEN p_note IS NULL THEN note ELSE nullif(left(btrim(p_note), 500), '') END,
      admin_note = CASE WHEN p_admin_note IS NULL THEN admin_note ELSE nullif(left(btrim(p_admin_note), 2000), '') END,
      updated_at = now()
  WHERE id = p_item
  RETURNING * INTO i;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found.'; END IF;
  SELECT * INTO i FROM public.auto_apply_items WHERE id = p_item;
  RETURN public.auto_apply_item_json(i) || jsonb_build_object('notified_at', i.notified_at, 'admin_note', i.admin_note);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_auto_apply_item(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_auto_apply_item(uuid, text, text, text) TO authenticated;

/* Add a job to someone's Auto Apply: a MadeVisa job (p_job) or any job (title, company, link). */
CREATE OR REPLACE FUNCTION public.admin_auto_apply_add(
  p_request uuid,
  p_job uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_company text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_status text DEFAULT 'queued',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.auto_apply_requests;
  i public.auto_apply_items;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_loc text := nullif(btrim(coalesce(p_location, '')), '');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('queued', 'applying', 'applied') THEN RAISE EXCEPTION 'Unknown status.'; END IF;
  SELECT * INTO r FROM public.auto_apply_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
  IF p_job IS NOT NULL THEN
    SELECT coalesce(v_title, s.title), coalesce(v_company, p.name), coalesce(v_url, s.official_url), coalesce(v_loc, nullif(concat_ws(', ', s.city, co.name), ''))
      INTO v_title, v_company, v_url, v_loc
      FROM public.sponsored_jobs s JOIN public.program_publishers p ON p.id = s.publisher_id LEFT JOIN public.countries co ON co.id = s.country_id
      WHERE s.id = p_job;
    IF NOT FOUND THEN RAISE EXCEPTION 'No MadeVisa job with that id.'; END IF;
    IF EXISTS (SELECT 1 FROM public.auto_apply_items WHERE request_id = r.id AND job_id = p_job) THEN RAISE EXCEPTION 'That job is already on the list.'; END IF;
  END IF;
  IF v_title IS NULL OR v_company IS NULL THEN RAISE EXCEPTION 'Give the job title and the company.'; END IF;
  IF v_url IS NOT NULL AND v_url !~* '^https?://' THEN RAISE EXCEPTION 'The link must start with https://'; END IF;
  INSERT INTO public.auto_apply_items (request_id, user_id, job_id, title, company, location, url, status, source, note, applied_at)
  VALUES (r.id, r.user_id, p_job, left(v_title, 300), left(v_company, 200), left(v_loc, 200), left(v_url, 1000), p_status, 'admin',
          nullif(left(btrim(coalesce(p_note, '')), 500), ''), CASE WHEN p_status = 'applied' THEN now() END)
  RETURNING * INTO i;
  SELECT * INTO i FROM public.auto_apply_items WHERE id = i.id;
  RETURN public.auto_apply_item_json(i) || jsonb_build_object('url', i.url, 'source', i.source, 'notified_at', i.notified_at);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_auto_apply_add(uuid, uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_auto_apply_add(uuid, uuid, text, text, text, text, text, text) TO authenticated;

/* Change a request: status (active | paused | stopped | ended), add days, per day, private note. */
CREATE OR REPLACE FUNCTION public.admin_auto_apply_update(
  p_request uuid,
  p_status text DEFAULT NULL,
  p_extend_days integer DEFAULT NULL,
  p_per_day integer DEFAULT NULL,
  p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.auto_apply_requests;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.auto_apply_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'paused', 'stopped', 'ended') THEN RAISE EXCEPTION 'Unknown status.'; END IF;
  IF p_status IN ('active', 'paused') AND r.status NOT IN ('active', 'paused')
     AND EXISTS (SELECT 1 FROM public.auto_apply_requests x WHERE x.user_id = r.user_id AND x.id <> r.id AND x.status IN ('active', 'paused')) THEN
    RAISE EXCEPTION 'This person already has another Auto Apply running.';
  END IF;
  UPDATE public.auto_apply_requests
  SET ends_at = CASE WHEN coalesce(p_extend_days, 0) <> 0 THEN greatest(ends_at, now()) + make_interval(days => p_extend_days) ELSE ends_at END,
      status = coalesce(p_status, CASE WHEN coalesce(p_extend_days, 0) > 0 AND status = 'ended' THEN 'active' ELSE status END),
      per_day = coalesce(least(greatest(p_per_day, 1), 25), per_day),
      admin_note = CASE WHEN p_admin_note IS NULL THEN admin_note ELSE nullif(left(btrim(p_admin_note), 4000), '') END,
      updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;
  RETURN to_jsonb(r);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_auto_apply_update(uuid, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_auto_apply_update(uuid, text, integer, integer, text) TO authenticated;

-- ===========================================================================
-- 5. PROFILE: jobs you applied to
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.my_applied_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  made AS (
    SELECT i.job_id, i.title, i.company, p.logo_url AS logo, i.location, i.applied_at AS at, 'madevisa'::text AS via, 'job'::text AS kind,
           s.status = 'published' AS live, i.url
    FROM public.auto_apply_items i
    LEFT JOIN public.sponsored_jobs s ON s.id = i.job_id
    LEFT JOIN public.program_publishers p ON p.id = s.publisher_id
    WHERE i.user_id = (SELECT id FROM me) AND i.status = 'applied'
  ),
  own AS (
    SELECT r.listing_id AS job_id, coalesce(r.listing_title, s.title, pr.title, 'Job') AS title, coalesce(p.name, '') AS company, p.logo_url AS logo,
           nullif(concat_ws(', ', s.city, co.name), '') AS location, r.applied_at AS at, 'you'::text AS via, r.listing_kind AS kind,
           coalesce(s.status, pr.status) = 'published' AS live, NULL::text AS url
    FROM public.application_reports r
    LEFT JOIN public.sponsored_jobs s ON r.listing_kind = 'job' AND s.id = r.listing_id
    LEFT JOIN public.programs pr ON r.listing_kind = 'program' AND pr.id = r.listing_id
    LEFT JOIN public.program_publishers p ON p.id = r.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE r.user_id = (SELECT id FROM me)
      AND NOT EXISTS (SELECT 1 FROM made m WHERE m.job_id = r.listing_id)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.at DESC), '[]'::jsonb)
  FROM (SELECT * FROM made UNION ALL SELECT * FROM own ORDER BY at DESC LIMIT 300) x;
$$;
REVOKE ALL ON FUNCTION public.my_applied_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_applied_jobs() TO authenticated;

-- ===========================================================================
-- Schedules
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('madevisa-email-log', 'madevisa-auto-apply-expire');
    PERFORM cron.schedule('madevisa-email-log', '*/5 * * * *', $c$select public.email_log_settle()$c$);
    PERFORM cron.schedule('madevisa-auto-apply-expire', '15 0 * * *', $c$select public.auto_apply_expire()$c$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
