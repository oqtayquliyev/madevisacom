/* ============================================================================
   1. Email icons load again
      The icons pointed at https://madevisa.com/email/icons/ but the files live
      in public/icons, so every email showed broken images. They now point at
      https://madevisa.com/icons/ and sit on a light-blue tile. If a mail app
      blocks images, the alt text is a blue glyph (entities, so the emoji
      filter keeps them; &#65038; asks phones for the plain text form).

   2. Autopilot "max" mode (on by default)
      Every hour inside the sending window, each sender address sends an equal
      part of what it has left today: left ÷ hours left. The last hour sends
      the rest, so every address reaches its daily limit (when there are
      contacts to write to and the overall daily cap allows it). Job seeker
      addresses write to job seekers, employer addresses to employers, and
      "any" addresses alternate between both. Runs hourly at :05, 00–24 UTC.
   ========================================================================== */

-- ---------------------------------------------------------------------------
-- 1. Icons
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mv_email_glyph(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_name
    WHEN 'target'    THEN '&#9678;'
    WHEN 'zap'       THEN '&#991;'
    WHEN 'globe'     THEN '&#8853;'
    WHEN 'plane'     THEN '&#9992;&#65038;'
    WHEN 'mail'      THEN '&#9993;&#65038;'
    WHEN 'inbox'     THEN '&#9993;&#65038;'
    WHEN 'pause'     THEN '&#8214;'
    WHEN 'file'      THEN '&#8801;'
    WHEN 'list'      THEN '&#9776;'
    WHEN 'bell'      THEN '!'
    WHEN 'sparkles'  THEN '&#10022;'
    WHEN 'chart'     THEN '&#9650;'
    WHEN 'trending'  THEN '&#8599;&#65038;'
    WHEN 'clock'     THEN '&#9719;'
    WHEN 'check'     THEN '&#10003;'
    WHEN 'briefcase' THEN '&#9635;'
    WHEN 'dashboard' THEN '&#9638;'
    WHEN 'calendar'  THEN '&#9636;'
    WHEN 'search'    THEN '&#8981;'
    WHEN 'send'      THEN '&#10140;'
    WHEN 'rocket'    THEN '&#10138;'
    WHEN 'puzzle'    THEN '&#10010;'
    WHEN 'user'      THEN '&#9679;'
    WHEN 'badge'     THEN '&#9670;'
    WHEN 'shield'    THEN '&#9672;'
    WHEN 'new'       THEN '+'
    WHEN 'star'      THEN '&#9733;'
    WHEN 'award'     THEN '&#10026;'
    WHEN 'heart'     THEN '&#9829;&#65038;'
    WHEN 'map'       THEN '&#9873;&#65038;'
    ELSE '&#10003;'
  END;
$$;

CREATE OR REPLACE FUNCTION public.mv_email_icon(p_name text, p_size integer DEFAULT 36)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '<div style="width:' || p_size || 'px;height:' || p_size || 'px;line-height:' || p_size || 'px;'
    || 'border-radius:' || CASE WHEN p_size >= 30 THEN 10 ELSE 6 END || 'px;background:#eaf1ff;text-align:center;overflow:hidden">'
    || '<img src="https://madevisa.com/icons/' || CASE WHEN p_size >= 30 THEN 't-' ELSE 'i-' END
    || CASE WHEN p_name = ANY (ARRAY['target','zap','globe','plane','mail','pause','file','bell','sparkles','chart','clock','check','trending',
             'briefcase','dashboard','search','send','puzzle','user','rocket','badge','list','calendar','shield','new','star','heart','inbox','award','map'])
            THEN p_name ELSE 'check' END
    || '.png" width="' || p_size || '" height="' || p_size || '" alt="' || public.mv_email_glyph(p_name) || '" '
    || 'style="display:block;width:' || p_size || 'px;height:' || p_size || 'px;border:0;outline:none;'
    || 'color:#1d4ed8;font-size:' || greatest(11, round(p_size * 0.5))::integer || 'px;font-weight:700;line-height:' || p_size || 'px;text-align:center;'
    || 'font-family:''Segoe UI Symbol'',''Apple Symbols'',''Noto Sans Symbols 2'',''DejaVu Sans'',Arial,sans-serif">'
    || '</div>';
$$;

-- ---------------------------------------------------------------------------
-- 2. Max mode
-- ---------------------------------------------------------------------------
ALTER TABLE public.outreach_autopilot ADD COLUMN IF NOT EXISTS max_mode boolean NOT NULL DEFAULT true;
-- Spread over the whole day, one part per hour.
UPDATE public.outreach_autopilot SET max_mode = true, hour_from = 0, hour_to = 24, updated_at = now() WHERE id;

/* Today's sending room per audience: dedicated addresses count fully,
   "any" addresses half to each side. */
CREATE OR REPLACE FUNCTION public.outreach_capacity()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', coalesce(sum(e.daily_limit), 0),
    'left', coalesce(sum(greatest(0, e.daily_limit - public.sender_sent_today(e.id))), 0),
    'seeker', coalesce(sum(CASE e.for_audience WHEN 'seeker' THEN e.daily_limit WHEN 'any' THEN e.daily_limit / 2.0 ELSE 0 END), 0)::integer,
    'employer', coalesce(sum(CASE e.for_audience WHEN 'employer' THEN e.daily_limit WHEN 'any' THEN e.daily_limit / 2.0 ELSE 0 END), 0)::integer)
  FROM public.email_senders e WHERE e.active AND e.for_campaigns;
$$;
REVOKE ALL ON FUNCTION public.outreach_capacity() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_outreach_autopilot(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '280s'
AS $$
DECLARE
  a public.outreach_autopilot;
  st public.outreach_settings;
  hr integer := extract(hour FROM now() AT TIME ZONE 'utc')::integer;
  runs_left integer;
  hours_left integer;
  aud text;
  target integer;
  sent_today integer;
  chunk integer;
  budget integer;
  ct public.email_contacts;
  snd public.email_senders;
  rendered jsonb;
  key text;
  n_sent jsonb := jsonb_build_object('seeker', 0, 'employer', 0);
  n integer;
  full_stop boolean := false;
  cap_stop boolean := false;
  idle integer := 0;
  due integer;
  fresh integer;
  cap jsonb;
  cap_left integer;
  bounced integer;
  share integer;
  sent_by jsonb := '{}'::jsonb;
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

  cap := public.outreach_capacity();

  IF a.max_mode THEN
    -- Every address sends its part for this hour: what it has left ÷ hours left (the last hour sends the rest).
    hours_left := greatest(1, a.hour_to - hr);
    FOR snd IN
      SELECT e.* FROM public.email_senders e
      WHERE e.active AND e.for_campaigns
      ORDER BY e.for_audience = 'any', e.created_at
    LOOP
      budget := public.outreach_budget();
      IF budget <= 0 THEN cap_stop := true; EXIT; END IF;
      share := greatest(0, snd.daily_limit - public.sender_sent_today(snd.id));
      IF NOT p_force THEN share := ceil(share::numeric / hours_left)::integer; END IF;
      share := least(share, budget, 400);
      CONTINUE WHEN share <= 0;
      n := 0;
      FOR ct IN
        -- "any" addresses alternate: seeker, employer, seeker, employer … (one side runs out → the other fills in).
        SELECT d.* FROM (
          SELECT * FROM public.outreach_due('seeker', share) WHERE snd.for_audience IN ('any', 'seeker')
          UNION ALL
          SELECT * FROM public.outreach_due('employer', share) WHERE snd.for_audience IN ('any', 'employer')) d
        ORDER BY row_number() OVER (PARTITION BY d.audience ORDER BY d.auto_step DESC, d.created_at), d.audience DESC
        LIMIT share
      LOOP
        key := 'auto_' || ct.audience || '_' || (ct.auto_step + 1);
        BEGIN
          rendered := public.mv_render_auto(key, ct);
          PERFORM public.mv_send_outreach(ct.email, rendered, 'auto_' || ct.audience, NULL, 'mv-auto-' || ct.id || '-' || (ct.auto_step + 1), snd);
          UPDATE public.email_contacts SET auto_step = auto_step + 1, auto_last_at = now(), sent_count = sent_count + 1, last_sent_at = now(), updated_at = now() WHERE id = ct.id;
          n := n + 1;
          n_sent := jsonb_set(n_sent, ARRAY[ct.audience], to_jsonb((n_sent->>ct.audience)::integer + 1));
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'run_outreach_autopilot %: %', ct.email, SQLERRM;
        END;
      END LOOP;
      sent_by := sent_by || jsonb_build_object(split_part(snd.from_email, '@', 1), n);
      IF n < share THEN idle := idle + (share - n); END IF;
    END LOOP;
  ELSE
    -- Fixed numbers a day, spread over the window (runs every hour).
    runs_left := greatest(1, a.hour_to - hr);
    FOREACH aud IN ARRAY ARRAY['seeker', 'employer'] LOOP
      EXIT WHEN full_stop;
      target := CASE aud WHEN 'seeker' THEN a.seeker_per_day ELSE a.employer_per_day END;
      SELECT count(*) INTO sent_today FROM public.email_log WHERE kind = 'auto_' || aud AND created_at >= d0 AND status <> 'skipped';
      budget := public.outreach_budget();
      chunk := least(greatest(0, target - sent_today), ceil(greatest(0, target - sent_today)::numeric / runs_left)::integer, budget, 400);
      IF p_force THEN chunk := least(greatest(0, target - sent_today), budget, 400); END IF;
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
    END LOOP;
  END IF;

  -- Running low on people to write to? (A day's need = the daily number, or the addresses' room in max mode.)
  FOREACH aud IN ARRAY ARRAY['seeker', 'employer'] LOOP
    target := CASE WHEN a.max_mode THEN (cap->>aud)::integer
                   ELSE CASE aud WHEN 'seeker' THEN a.seeker_per_day ELSE a.employer_per_day END END;
    CONTINUE WHEN target <= 0;
    SELECT count(*) INTO fresh FROM public.email_contacts
    WHERE status = 'subscribed' AND audience = aud AND user_id IS NULL AND auto_step = 0;
    IF fresh = 0 THEN
      PERFORM public.outreach_alert('empty_' || aud, 'Outreach: no new ' || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' contacts left',
        'The autopilot has started every ' || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' contact, so the '
        || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' addresses cannot reach their limit. Import more emails in Admin → Outreach → Contacts.');
    ELSIF fresh < target * 3 THEN
      PERFORM public.outreach_alert('low_' || aud, 'Outreach: ' || fresh || ' new ' || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' contacts left',
        'About ' || greatest(1, fresh / target) || ' day(s) left at ' || target || ' a day. Import more emails to keep every address sending its full limit.');
    END IF;
  END LOOP;

  -- More due than the senders can send?
  cap_left := (public.outreach_capacity()->>'left')::integer;
  SELECT count(*) INTO due FROM public.email_contacts c, public.outreach_autopilot x
  WHERE x.id AND c.status = 'subscribed' AND c.user_id IS NULL AND c.audience IS NOT NULL
    AND c.auto_step < CASE WHEN c.audience = 'employer' THEN x.employer_steps ELSE x.seeker_steps END
    AND (c.auto_last_at IS NULL OR c.auto_last_at < now() - make_interval(days => x.gap_days));
  IF full_stop OR (hr >= a.hour_to - 1 AND due > (cap->>'total')::integer * 5) THEN
    PERFORM public.outreach_alert('capacity', 'Outreach: senders are full',
      to_char(due, 'FM999,999') || ' contacts are waiting, and the sender addresses can send ' || to_char((cap->>'total')::integer, 'FM999,999')
      || ' a day. Add more sender addresses or raise their daily limits (slowly: +10–20 a day per address keeps you out of spam).');
  END IF;

  -- The overall daily cap (Sending & limits) stops it before the senders do?
  IF due > 0 AND (cap_stop OR public.outreach_budget() <= 0) THEN
    PERFORM public.outreach_alert('cap', 'Outreach: the daily email cap is reached',
      'The autopilot stopped at the daily cap in Admin → Outreach → Sending & limits (' || st.daily_cap || ' emails a day for everything MadeVisa sends), before every address reached its limit. Raise it if your Resend plan allows more.');
  END IF;

  UPDATE public.outreach_autopilot SET last_run_at = now(),
    last_note = 'Sent ' || ((n_sent->>'seeker')::integer + (n_sent->>'employer')::integer) || ' (' || (n_sent->>'seeker') || ' job seekers, ' || (n_sent->>'employer') || ' employers)'
      || CASE WHEN idle > 0 THEN ' · ' || idle || ' slots unused: no contacts due' ELSE '' END
      || CASE WHEN full_stop THEN ' · senders full' ELSE '' END
      || CASE WHEN cap_stop THEN ' · daily cap reached' ELSE '' END
  WHERE id;
  RETURN jsonb_build_object('sent', n_sent, 'by_sender', sent_by, 'unused', idle, 'senders_full', full_stop OR (cap_left = 0), 'cap_reached', cap_stop, 'due', due, 'capacity_left', cap_left);
END;
$$;
REVOKE ALL ON FUNCTION public.run_outreach_autopilot(boolean) FROM PUBLIC, anon, authenticated;

-- Admin: max_mode setting.
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
    max_mode = coalesce((p->>'max_mode')::boolean, max_mode),
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

/* The Autopilot tab: everything from before, plus today's capacity and this hour's part. */
DO $do$
BEGIN
  IF to_regprocedure('public.admin_autopilot_base()') IS NULL THEN
    ALTER FUNCTION public.admin_autopilot() RENAME TO admin_autopilot_base;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.admin_autopilot_base() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_autopilot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  a public.outreach_autopilot;
  cap jsonb;
  hr integer := extract(hour FROM now() AT TIME ZONE 'utc')::integer;
  hours_left integer;
  next_part integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.outreach_autopilot WHERE id;
  cap := public.outreach_capacity();
  -- The next run is at :05; when it is already past that, it is the next hour.
  hours_left := greatest(0, a.hour_to - greatest(a.hour_from, hr + CASE WHEN extract(minute FROM now()) >= 5 THEN 1 ELSE 0 END));
  SELECT coalesce(sum(CASE WHEN hours_left > 0 THEN ceil(greatest(0, e.daily_limit - public.sender_sent_today(e.id))::numeric / hours_left) ELSE 0 END), 0)::integer
    INTO next_part FROM public.email_senders e WHERE e.active AND e.for_campaigns;
  RETURN public.admin_autopilot_base() || jsonb_build_object(
    'capacity', cap || jsonb_build_object('hours_left', hours_left, 'next_part', least(next_part, public.outreach_budget())));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_autopilot() TO authenticated;

-- Every hour at :05 (one part per hour).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('madevisa-outreach-autopilot');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('madevisa-outreach-autopilot', '5 * * * *', $c$select public.run_outreach_autopilot()$c$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
