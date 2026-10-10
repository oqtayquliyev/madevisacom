/*
# Outreach: fix "UPDATE requires a WHERE clause" + sender addresses with their own limits
Run AFTER 20261216090000_outreach_campaigns.sql. Paste the whole file once
in the Supabase SQL Editor. Safe to run more than once.

1. THE ERROR
   Supabase refuses an UPDATE without a WHERE when it comes from the website
   (a safety setting on API calls). Two outreach functions had one: the live
   job numbers used in templates, and saving Sending & limits. Both fixed —
   previews, tests, campaigns and the limits form work again.

2. SENDERS (email_senders)
   Ten addresses on news.madevisa.com, each with its own display name and
   daily limit, used for campaigns and/or the Auto Apply series:
     oqtay@ · jobs@ · careers@ · autoapply@ · matches@ · team@ · hello@ ·
     news@ · updates@ · visa@  (all @news.madevisa.com)
   They start switched OFF: they only work once news.madevisa.com is verified
   in Resend. Then switch them on in Admin → Outreach → Senders.
   A campaign sends from one sender, or rotates between all switched-on
   senders (each stops at its own daily limit). Replies go to the sender's
   reply-to (default hello@madevisa.com).
   The overall daily cap in Sending & limits still applies on top.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. The two UPDATEs without WHERE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.outreach_counts()
RETURNS public.outreach_numbers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.outreach_numbers;
BEGIN
  SELECT * INTO r FROM public.outreach_numbers WHERE id;
  IF r.at < now() - interval '10 minutes' THEN
    UPDATE public.outreach_numbers SET
      jobs_live = (SELECT count(*) FROM public.sponsored_jobs WHERE status = 'published' AND NOT awaiting_release AND (expires_at IS NULL OR expires_at > now())),
      jobs_today = (SELECT count(*) FROM public.sponsored_jobs WHERE status = 'published' AND NOT awaiting_release AND coalesce(released_at, created_at) > now() - interval '24 hours'),
      jobs_visa = (SELECT count(*) FROM public.sponsored_jobs WHERE status = 'published' AND NOT awaiting_release AND (expires_at IS NULL OR expires_at > now()) AND (visa_status = 'offered' OR visa_sponsorship)),
      at = now()
    WHERE id
    RETURNING * INTO r;
  END IF;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_counts() FROM PUBLIC, anon, authenticated;

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
  WHERE id
  RETURNING * INTO s;
  RETURN to_jsonb(s);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_outreach_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_outreach_settings(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Senders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_name text NOT NULL CHECK (char_length(from_name) BETWEEN 1 AND 60 AND from_name !~ '[<>"]'),
  from_email text NOT NULL CHECK (char_length(from_email) <= 120),
  reply_to text CHECK (reply_to IS NULL OR char_length(reply_to) <= 120),
  daily_limit integer NOT NULL DEFAULT 50 CHECK (daily_limit BETWEEN 0 AND 100000),
  active boolean NOT NULL DEFAULT false,
  for_campaigns boolean NOT NULL DEFAULT true,
  for_series boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_senders_email_idx ON public.email_senders (lower(from_email));
ALTER TABLE public.email_senders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_senders FROM anon, authenticated;

INSERT INTO public.email_senders (from_name, from_email, reply_to, daily_limit, for_campaigns, for_series, note) VALUES
  ('Oqtay from MadeVisa',  'oqtay@news.madevisa.com',     'hello@madevisa.com', 50, true,  true,  'Personal — best for the Auto Apply series'),
  ('MadeVisa Jobs',        'jobs@news.madevisa.com',      'hello@madevisa.com', 50, true,  false, 'Fresh jobs, job digests'),
  ('MadeVisa Careers',     'careers@news.madevisa.com',   'hello@madevisa.com', 50, true,  false, 'CV Match campaigns'),
  ('MadeVisa Auto Apply',  'autoapply@news.madevisa.com', 'hello@madevisa.com', 50, true,  true,  'Auto Apply campaigns and series'),
  ('MadeVisa Matches',     'matches@news.madevisa.com',   'hello@madevisa.com', 50, true,  false, 'Matching jobs'),
  ('The MadeVisa Team',    'team@news.madevisa.com',      'hello@madevisa.com', 50, true,  true,  'General announcements'),
  ('MadeVisa',             'hello@news.madevisa.com',     'hello@madevisa.com', 50, true,  false, 'Default brand sender'),
  ('MadeVisa News',        'news@news.madevisa.com',      'hello@madevisa.com', 50, true,  false, 'Product news'),
  ('MadeVisa Updates',     'updates@news.madevisa.com',   'hello@madevisa.com', 50, true,  false, 'Feature updates'),
  ('MadeVisa Visa Guide',  'visa@news.madevisa.com',      'hello@madevisa.com', 50, true,  false, 'Visa tips, sponsorship')
ON CONFLICT ((lower(from_email))) DO NOTHING;

ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES public.email_senders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS email_log_sender_day_idx ON public.email_log (sender_id, created_at) WHERE sender_id IS NOT NULL;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES public.email_senders(id) ON DELETE SET NULL;

/* Sent today (UTC) by one sender. */
CREATE OR REPLACE FUNCTION public.sender_sent_today(p_sender uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.email_log
  WHERE sender_id = p_sender AND status <> 'skipped' AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
$$;
REVOKE ALL ON FUNCTION public.sender_sent_today(uuid) FROM PUBLIC, anon, authenticated;

/* Which sender sends the next email. p_for = 'campaign' | 'series'. p_pref = a campaign's chosen sender.
   Rotation: the switched-on sender for that use with the most room left today.
   Returns NULL when none is set up (then the default sender is used) — or the
   string 'full' in .note when senders exist but all reached their limit. */
CREATE OR REPLACE FUNCTION public.outreach_pick_sender(p_for text, p_pref uuid DEFAULT NULL)
RETURNS public.email_senders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s public.email_senders;
BEGIN
  IF p_pref IS NOT NULL THEN
    SELECT * INTO s FROM public.email_senders WHERE id = p_pref AND active;
    IF FOUND THEN
      IF public.sender_sent_today(s.id) >= s.daily_limit THEN s.note := 'full'; END IF;
      RETURN s;
    END IF;
  END IF;
  SELECT * INTO s FROM public.email_senders e
  WHERE e.active AND CASE WHEN p_for = 'series' THEN e.for_series ELSE e.for_campaigns END
    AND public.sender_sent_today(e.id) < e.daily_limit
  ORDER BY (e.daily_limit - public.sender_sent_today(e.id)) DESC, e.created_at
  LIMIT 1;
  IF FOUND THEN RETURN s; END IF;
  IF EXISTS (SELECT 1 FROM public.email_senders e WHERE e.active AND CASE WHEN p_for = 'series' THEN e.for_series ELSE e.for_campaigns END) THEN
    s := NULL;
    s.note := 'full';
    RETURN s;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_pick_sender(text, uuid) FROM PUBLIC, anon, authenticated;

/* Campaign / series email through a chosen sender (or the default one). */
DROP FUNCTION IF EXISTS public.mv_send_outreach(text, jsonb, text, uuid, text);
CREATE OR REPLACE FUNCTION public.mv_send_outreach(p_to text, p_rendered jsonb, p_kind text, p_user uuid DEFAULT NULL, p_idempotency text DEFAULT NULL, p_sender public.email_senders DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key text;
  sender text;
  reply text := 'hello@madevisa.com';
  rid bigint;
  hdr jsonb;
  body jsonb;
BEGIN
  SELECT coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'resend_api_key')) INTO key;
  IF coalesce(key, '') = '' THEN RETURN NULL; END IF;
  IF p_sender.id IS NOT NULL THEN
    sender := p_sender.from_name || ' <' || p_sender.from_email || '>';
    reply := coalesce(nullif(p_sender.reply_to, ''), reply);
  ELSE
    SELECT coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'email_from_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'email_from'), 'MadeVisa <onboarding@resend.dev>') INTO sender;
  END IF;
  hdr := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json');
  IF p_idempotency IS NOT NULL THEN hdr := hdr || jsonb_build_object('Idempotency-Key', left(p_idempotency, 250)); END IF;
  body := jsonb_build_object('from', sender, 'to', jsonb_build_array(p_to), 'subject', p_rendered->>'subject',
                             'html', p_rendered->>'html', 'text', p_rendered->>'text', 'reply_to', reply,
                             'tags', jsonb_build_array(jsonb_build_object('name', 'kind', 'value', p_kind)));
  IF p_rendered->>'unsub' IS NOT NULL THEN
    body := body || jsonb_build_object('headers', jsonb_build_object('List-Unsubscribe', '<' || (p_rendered->>'unsub') || '>', 'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
  END IF;
  SELECT net.http_post(url := 'https://api.resend.com/emails', headers := hdr, body := body, timeout_milliseconds := 10000) INTO rid;
  INSERT INTO public.email_log (user_id, to_email, kind, subject, request_id, sender_id) VALUES (p_user, p_to, p_kind, left(p_rendered->>'subject', 300), rid, p_sender.id);
  RETURN rid;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_send_outreach(text, jsonb, text, uuid, text, public.email_senders) FROM PUBLIC, anon, authenticated;

/* Admin: senders with today's count. */
CREATE OR REPLACE FUNCTION public.admin_senders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(e) || jsonb_build_object(
             'sent_today', public.sender_sent_today(e.id),
             'sent_7d', (SELECT count(*) FROM public.email_log l WHERE l.sender_id = e.id AND l.status <> 'skipped' AND l.created_at > now() - interval '7 days'),
             'failed_7d', (SELECT count(*) FROM public.email_log l WHERE l.sender_id = e.id AND l.status = 'failed' AND l.created_at > now() - interval '7 days'))
           ORDER BY e.created_at, e.from_email)
    FROM public.email_senders e), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_senders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_senders() TO authenticated;

/* Add or change a sender. p: {id?, from_name, from_email, reply_to, daily_limit, active, for_campaigns, for_series, note}. */
CREATE OR REPLACE FUNCTION public.admin_sender_save(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e public.email_senders;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p ? 'from_email' AND NOT public.mv_email_ok(p->>'from_email') THEN RAISE EXCEPTION 'Check the sender address.'; END IF;
  IF nullif(p->>'reply_to', '') IS NOT NULL AND NOT public.mv_email_ok(p->>'reply_to') THEN RAISE EXCEPTION 'Check the reply-to address.'; END IF;
  IF nullif(p->>'id', '') IS NULL THEN
    INSERT INTO public.email_senders (from_name, from_email, reply_to, daily_limit, active, for_campaigns, for_series, note)
    VALUES (btrim(p->>'from_name'), lower(btrim(p->>'from_email')), nullif(lower(btrim(coalesce(p->>'reply_to', ''))), ''),
            coalesce((p->>'daily_limit')::integer, 50), coalesce((p->>'active')::boolean, false),
            coalesce((p->>'for_campaigns')::boolean, true), coalesce((p->>'for_series')::boolean, false), nullif(btrim(coalesce(p->>'note', '')), ''))
    RETURNING * INTO e;
  ELSE
    UPDATE public.email_senders SET
      from_name = coalesce(nullif(btrim(p->>'from_name'), ''), from_name),
      from_email = coalesce(nullif(lower(btrim(p->>'from_email')), ''), from_email),
      reply_to = CASE WHEN p ? 'reply_to' THEN nullif(lower(btrim(p->>'reply_to')), '') ELSE reply_to END,
      daily_limit = coalesce((p->>'daily_limit')::integer, daily_limit),
      active = coalesce((p->>'active')::boolean, active),
      for_campaigns = coalesce((p->>'for_campaigns')::boolean, for_campaigns),
      for_series = coalesce((p->>'for_series')::boolean, for_series),
      note = CASE WHEN p ? 'note' THEN nullif(btrim(p->>'note'), '') ELSE note END,
      updated_at = now()
    WHERE id = (p->>'id')::uuid
    RETURNING * INTO e;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sender not found.'; END IF;
  END IF;
  RETURN to_jsonb(e);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'That address is already a sender.';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_sender_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sender_save(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_sender_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.email_senders WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_sender_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sender_delete(uuid) TO authenticated;

/* Turn on / off every sender on one domain at once (after verifying it in Resend). */
CREATE OR REPLACE FUNCTION public.admin_senders_domain(p_domain text, p_active boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.email_senders SET active = p_active, updated_at = now() WHERE lower(split_part(from_email, '@', 2)) = lower(btrim(p_domain));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_senders_domain(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_senders_domain(text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Campaigns choose a sender (or rotate); the sender and series use it.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_campaign_save(uuid, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.admin_campaign_save(p_id uuid, p_name text, p_template text, p_audience jsonb, p_sender uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c public.email_campaigns;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_templates WHERE key = p_template) THEN RAISE EXCEPTION 'Choose a template.'; END IF;
  IF p_sender IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.email_senders WHERE id = p_sender) THEN RAISE EXCEPTION 'Choose a sender.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.email_campaigns (name, template_key, audience, created_by, sender_id)
    VALUES (left(coalesce(nullif(btrim(p_name), ''), 'Campaign ' || to_char(now(), 'DD Mon')), 120), p_template, coalesce(p_audience, '{}'::jsonb), auth.uid(), p_sender)
    RETURNING * INTO c;
  ELSE
    UPDATE public.email_campaigns SET name = left(coalesce(nullif(btrim(p_name), ''), name), 120), template_key = p_template, audience = coalesce(p_audience, audience), sender_id = p_sender, updated_at = now()
    WHERE id = p_id AND status = 'draft' RETURNING * INTO c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only a draft can be changed.'; END IF;
  END IF;
  RETURN to_jsonb(c);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_campaign_save(uuid, text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_campaign_save(uuid, text, text, jsonb, uuid) TO authenticated;

/* Test: optionally from a chosen sender. */
DROP FUNCTION IF EXISTS public.admin_template_test(text, text);
CREATE OR REPLACE FUNCTION public.admin_template_test(p_key text, p_email text, p_sender uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.email_contacts;
  r jsonb;
  s public.email_senders;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF NOT public.mv_email_ok(p_email) THEN RAISE EXCEPTION 'Check the email address.'; END IF;
  IF coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') = ''
     AND coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), '') = '' THEN
    RAISE EXCEPTION 'Resend isn’t connected yet (app_secrets resend_api_key).';
  END IF;
  SELECT * INTO c FROM public.email_contacts WHERE lower(email) = lower(btrim(p_email));
  r := public.mv_render_template(p_key, lower(btrim(p_email)), c.name, c.user_id, c.token, c.country);
  r := jsonb_set(r, '{subject}', to_jsonb('[Test] ' || (r->>'subject')));
  IF p_sender IS NOT NULL THEN SELECT * INTO s FROM public.email_senders WHERE id = p_sender; END IF;
  RETURN public.mv_send_outreach(lower(btrim(p_email)), r, 'test', c.user_id, NULL, s) IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_test(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_test(text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_campaign_sends()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '55s'
AS $$
DECLARE
  st public.outreach_settings;
  budget integer;
  r record;
  rendered jsonb;
  snd public.email_senders;
  rid bigint;
  sent integer := 0;
BEGIN
  SELECT * INTO st FROM public.outreach_settings WHERE id;
  IF NOT st.enabled THEN RETURN 0; END IF;
  IF coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') = ''
     AND coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), '') = '' THEN RETURN 0; END IF;
  budget := least(public.outreach_budget(), st.per_minute);

  FOR r IN
    SELECT q.id, q.campaign_id, q.email, q.user_id, c.template_key, c.sender_id, ct.id AS contact_id, ct.status AS contact_status, ct.token, ct.name, ct.country
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
    snd := public.outreach_pick_sender('campaign', r.sender_id);
    -- Every sender for this campaign reached its daily limit: wait for tomorrow (stays queued).
    CONTINUE WHEN snd.note = 'full';
    BEGIN
      rendered := public.mv_render_template(r.template_key, r.email, r.name, r.user_id, r.token, r.country);
      rid := public.mv_send_outreach(r.email, rendered, 'campaign', r.user_id, 'madevisa-cmp-' || r.campaign_id || '-' || r.id, snd);
      UPDATE public.email_campaign_recipients SET status = 'sent', request_id = rid, sent_at = now() WHERE id = r.id;
      UPDATE public.email_contacts SET sent_count = sent_count + 1, last_sent_at = now() WHERE id = r.contact_id;
      sent := sent + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.email_campaign_recipients SET status = 'failed', error = left(SQLERRM, 300) WHERE id = r.id;
    END;
  END LOOP;

  UPDATE public.email_campaigns c SET status = 'done', finished_at = now(), updated_at = now()
  WHERE c.status = 'sending' AND NOT EXISTS (SELECT 1 FROM public.email_campaign_recipients q WHERE q.campaign_id = c.id AND q.status = 'queued');
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.run_campaign_sends() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_auto_apply_series()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '240s'
AS $$
DECLARE
  st public.outreach_settings;
  budget integer;
  u record;
  c public.email_contacts;
  rendered jsonb;
  snd public.email_senders;
  sent integer := 0;
BEGIN
  SELECT * INTO st FROM public.outreach_settings WHERE id;
  IF NOT st.enabled OR NOT st.nurture_enabled THEN RETURN 0; END IF;
  IF coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') = ''
     AND coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), '') = '' THEN RETURN 0; END IF;
  budget := least(public.outreach_budget(), st.nurture_per_day);

  FOR u IN
    SELECT au.id, au.email, coalesce(n.step, 0) AS step
    FROM auth.users au
    LEFT JOIN public.nurture_state n ON n.user_id = au.id
    WHERE au.email_confirmed_at IS NOT NULL AND au.email IS NOT NULL AND au.deleted_at IS NULL
      AND au.created_at < now() - interval '2 days'
      AND coalesce(n.step, 0) < 3
      AND (n.last_sent_at IS NULL OR n.last_sent_at < now() - make_interval(days => st.nurture_gap_days))
      AND NOT public.is_pro(au.id)
      AND NOT EXISTS (SELECT 1 FROM public.auto_apply_requests r WHERE r.user_id = au.id)
      AND public.email_allowed(au.id, 'news')
      AND NOT EXISTS (SELECT 1 FROM public.email_contacts x WHERE lower(x.email) = lower(au.email) AND x.status <> 'subscribed')
      AND NOT EXISTS (SELECT 1 FROM public.email_log l WHERE l.user_id = au.id AND l.kind = 'campaign' AND l.created_at > now() - interval '3 days')
    ORDER BY n.last_sent_at NULLS FIRST, au.created_at
    LIMIT budget
  LOOP
    snd := public.outreach_pick_sender('series', NULL);
    EXIT WHEN snd.note = 'full';
    BEGIN
      c := public.mv_contact_for(u.email, NULL, u.id, 'account');
      rendered := public.mv_render_template('nurture_' || (u.step + 1), c.email, c.name, u.id, c.token, c.country);
      PERFORM public.mv_send_outreach(c.email, rendered, 'series', u.id, 'madevisa-series-' || u.id || '-' || (u.step + 1), snd);
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

/* Campaign list: now with the sender. */
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
    'settings', (SELECT to_jsonb(s) FROM public.outreach_settings s WHERE id),
    'budget_today', public.outreach_budget(),
    'sent_today', (SELECT count(*) FROM public.email_log WHERE status <> 'skipped' AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'),
    'sender', coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'email_from_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'email_from')),
    'separate_key', coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), '') <> '',
    'resend', coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') <> '' OR coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), '') <> '',
    'senders_on', (SELECT count(*) FROM public.email_senders WHERE active),
    'series', (SELECT jsonb_build_object(
        'in_series', count(*) FILTER (WHERE step BETWEEN 1 AND 2),
        'finished', count(*) FILTER (WHERE step >= 3),
        'sent_7d', (SELECT count(*) FROM public.email_log WHERE kind = 'series' AND created_at > now() - interval '7 days'))
      FROM public.nurture_state),
    'campaigns', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'template_key', c.template_key, 'template_name', t.name, 'audience', c.audience, 'status', c.status,
        'sender_id', c.sender_id, 'sender_name', (SELECT from_name || ' <' || from_email || '>' FROM public.email_senders e WHERE e.id = c.sender_id),
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

NOTIFY pgrst, 'reload schema';
