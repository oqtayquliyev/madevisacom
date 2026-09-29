/*
# Plans, notifications and job alerts

Run AFTER 20261106090000_job_facets.sql. Safe to run more than once.

## Until a payment provider is set up
Someone picks a plan on /pricing → a row in plan_requests →
  - an email to hello@madevisa.com (via Resend, see "Email" below),
  - a notification for admins (bell + Admin → Plans),
  - a "we got your request" notification for the person.
An admin sends the payment link by hand, then clicks "Activate" in
Admin → Plans, which creates the subscription and tells the person.

## Pro
subscriptions holds who has Pro and until when; is_pro() checks it.
Pro-only data is protected in the database (e.g. visa_sponsors_in()),
not just hidden on the page.

## Job alerts (Pro)
job_alerts: keywords + country. Every 30 minutes, jobs published since the
last check that match become notifications (bell).

## Email
Emails go out through Resend (resend.com — free for 3,000 emails/month):
  1. Create a Resend account, verify the madevisa.com domain (DNS records).
  2. In the SQL Editor run, with your own key:
       INSERT INTO public.app_secrets (name, value) VALUES
         ('resend_api_key', 're_…'),
         ('email_from', 'MadeVisa <hello@madevisa.com>')
       ON CONFLICT (name) DO UPDATE SET value = excluded.value;
Without a key, requests still arrive in Admin → Plans and the bell.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  email text NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(email) <= 254),
  name text CHECK (char_length(name) <= 120),
  company text CHECK (char_length(company) <= 160),
  plan text NOT NULL CHECK (plan IN ('pro', 'relocation', 'sponsored_job', 'featured_social', 'employer', 'hiring_brief')),
  billing text NOT NULL DEFAULT 'monthly' CHECK (billing IN ('monthly', 'yearly', 'one_time')),
  price_label text CHECK (char_length(price_label) <= 60),
  region text CHECK (char_length(region) <= 20),
  country_code text CHECK (char_length(country_code) <= 3),
  occupation text CHECK (char_length(occupation) <= 120),
  specialization text CHECK (char_length(specialization) <= 160),
  experience text CHECK (char_length(experience) <= 40),
  target_countries text[] NOT NULL DEFAULT '{}',
  message text CHECK (char_length(message) <= 2000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'active', 'declined')),
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_requests_created_idx ON public.plan_requests (created_at DESC);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'pro',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'user' CHECK (audience IN ('user', 'admin')),
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_admin_idx ON public.notifications (audience, created_at DESC) WHERE audience = 'admin';

CREATE TABLE IF NOT EXISTS public.job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  keywords text NOT NULL CHECK (char_length(keywords) BETWEEN 2 AND 120),
  country_code text,
  label text,
  active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_alerts_user_idx ON public.job_alerts (user_id);

-- ---------------------------------------------------------------------------
-- Pro check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_pro(p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = p_user AND status = 'active' AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Row security
-- ---------------------------------------------------------------------------
ALTER TABLE public.plan_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_requests_insert" ON public.plan_requests;
CREATE POLICY "plan_requests_insert" ON public.plan_requests FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "plan_requests_read" ON public.plan_requests;
CREATE POLICY "plan_requests_read" ON public.plan_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (SELECT public.is_admin()));
DROP POLICY IF EXISTS "plan_requests_admin" ON public.plan_requests;
CREATE POLICY "plan_requests_admin" ON public.plan_requests FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
GRANT INSERT ON public.plan_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON public.plan_requests TO authenticated;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_read" ON public.subscriptions;
CREATE POLICY "subscriptions_read" ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (SELECT public.is_admin()));
DROP POLICY IF EXISTS "subscriptions_admin" ON public.subscriptions;
CREATE POLICY "subscriptions_admin" ON public.subscriptions FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_read" ON public.notifications;
CREATE POLICY "notifications_read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (audience = 'admin' AND (SELECT public.is_admin())));
DROP POLICY IF EXISTS "notifications_mark_read" ON public.notifications;
CREATE POLICY "notifications_mark_read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (audience = 'admin' AND (SELECT public.is_admin())))
  WITH CHECK (user_id = auth.uid() OR (audience = 'admin' AND (SELECT public.is_admin())));
GRANT SELECT, UPDATE (read_at) ON public.notifications TO authenticated;

ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_alerts_own" ON public.job_alerts;
CREATE POLICY "job_alerts_own" ON public.job_alerts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.is_pro());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_alerts TO authenticated;

-- ---------------------------------------------------------------------------
-- Email (Resend) — best effort, never blocks the request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_admin_email(p_subject text, p_text text, p_reply_to text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key text;
  sender text;
BEGIN
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN; END IF;
  SELECT value INTO sender FROM public.app_secrets WHERE name = 'email_from';
  PERFORM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', coalesce(sender, 'MadeVisa <onboarding@resend.dev>'),
      'to', jsonb_build_array('hello@madevisa.com'),
      'subject', p_subject,
      'text', p_text
    ) || CASE WHEN p_reply_to IS NOT NULL THEN jsonb_build_object('reply_to', p_reply_to) ELSE '{}'::jsonb END,
    timeout_milliseconds := 10000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'send_admin_email failed: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.send_admin_email(text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plan_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_name text := CASE NEW.plan
    WHEN 'pro' THEN 'MadeVisa Pro'
    WHEN 'relocation' THEN 'Relocation plan'
    WHEN 'sponsored_job' THEN 'Sponsored job'
    WHEN 'featured_social' THEN 'Featured in social posts'
    WHEN 'employer' THEN 'Employer plan'
    WHEN 'hiring_brief' THEN 'Hiring Brief'
    ELSE NEW.plan END;
BEGIN
  INSERT INTO public.notifications (audience, kind, title, body, link)
  VALUES ('admin', 'plan_request', 'New plan request: ' || plan_name,
          coalesce(NEW.name, NEW.email) || ' · ' || coalesce(NEW.price_label, NEW.billing), '/admin?tab=plans');

  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.user_id, 'plan_request', 'We got your request for ' || plan_name,
            'We''ll email you a secure payment link within one working day.', '/pricing');
  END IF;

  PERFORM public.send_admin_email(
    'New plan request: ' || plan_name || ' — ' || coalesce(NEW.price_label, NEW.billing),
    concat_ws(E'\n',
      'Plan: ' || plan_name,
      'Billing: ' || NEW.billing || coalesce(' (' || NEW.price_label || ')', ''),
      'Region pricing: ' || coalesce(NEW.region, '—'),
      '',
      'Name: ' || coalesce(NEW.name, '—'),
      'Email: ' || NEW.email,
      'Company: ' || coalesce(NEW.company, '—'),
      'Country: ' || coalesce(NEW.country_code, '—'),
      'Role: ' || coalesce(NEW.occupation, '—'),
      'Specialization: ' || coalesce(NEW.specialization, '—'),
      'Experience: ' || coalesce(NEW.experience, '—'),
      'Target countries: ' || coalesce(array_to_string(NEW.target_countries, ', '), '—'),
      'Signed-in account: ' || CASE WHEN NEW.user_id IS NULL THEN 'no' ELSE 'yes' END,
      '',
      'Message:',
      coalesce(NEW.message, '—'),
      '',
      'Send the payment link, then activate it in Admin → Plans: https://madevisa.com/admin?tab=plans'
    ),
    NEW.email
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS plan_request_created ON public.plan_requests;
CREATE TRIGGER plan_request_created AFTER INSERT ON public.plan_requests FOR EACH ROW EXECUTE FUNCTION public.plan_request_created();

-- ---------------------------------------------------------------------------
-- Admin: activate a plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_plan(p_request uuid, p_months integer DEFAULT 1)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.plan_requests;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.plan_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;

  IF r.user_id IS NOT NULL AND r.plan IN ('pro', 'relocation') THEN
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, current_period_end, note)
    VALUES (r.user_id, r.plan, 'active', now(), now() + make_interval(months => greatest(p_months, 1)), 'Request ' || r.id)
    ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, status = 'active',
      current_period_end = greatest(coalesce(public.subscriptions.current_period_end, now()), now()) + make_interval(months => greatest(p_months, 1)),
      note = excluded.note, updated_at = now();
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'plan_active', 'Your MadeVisa Pro is active',
            'Pro insights and job alerts are unlocked. Thank you for supporting MadeVisa!', '/jobs');
  END IF;
  UPDATE public.plan_requests SET status = 'active', handled_at = now() WHERE id = p_request;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.activate_plan(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_plan(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Pro data: companies with visa-sponsored jobs in a country
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.visa_sponsors_in(p_iso text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
DECLARE
  d jsonb;
BEGIN
  IF NOT (public.is_pro() OR public.is_admin()) THEN RAISE EXCEPTION 'Pro only.' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO d FROM (
    SELECT jsonb_build_object('id', p.id, 'name', p.name, 'logo', p.logo_url, 'jobs', count(*)) AS x
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    JOIN public.countries c ON c.id = s.country_id
    WHERE c.iso_code = upper(p_iso) AND (s.visa_status = 'offered' OR s.visa_sponsorship)
      AND s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now())
    GROUP BY p.id, p.name, p.logo_url
    ORDER BY count(*) DESC
    LIMIT 10
  ) t;
  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.visa_sponsors_in(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visa_sponsors_in(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Job alerts → notifications (every 30 minutes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_job_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  a record;
  hits integer;
  first_title text;
  first_id uuid;
  total integer := 0;
BEGIN
  FOR a IN
    SELECT al.* FROM public.job_alerts al
    WHERE al.active AND public.is_pro(al.user_id)
  LOOP
    SELECT count(*), (array_agg(s.title ORDER BY s.released_at DESC))[1], (array_agg(s.id ORDER BY s.released_at DESC))[1]
    INTO hits, first_title, first_id
    FROM public.sponsored_jobs s
    LEFT JOIN public.countries c ON c.id = s.country_id
    WHERE s.released_at > a.last_checked_at AND s.released_at <= now()
      AND s.status = 'published' AND NOT s.awaiting_release
      AND (a.country_code IS NULL OR c.iso_code = a.country_code)
      AND (s.title ILIKE '%' || a.keywords || '%' OR s.job_function ILIKE '%' || a.keywords || '%');
    IF hits > 0 THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (a.user_id, 'job_alert',
              hits || ' new ' || CASE WHEN hits = 1 THEN 'job' ELSE 'jobs' END || ' for “' || coalesce(a.label, a.keywords) || '”',
              first_title || CASE WHEN hits > 1 THEN ' and ' || (hits - 1) || ' more' ELSE '' END,
              '/jobs?q=' || replace(a.keywords, ' ', '+') || coalesce('&country=' || replace((SELECT name FROM public.countries WHERE iso_code = a.country_code), ' ', '+'), ''));
      total := total + 1;
    END IF;
    UPDATE public.job_alerts SET last_checked_at = now() WHERE id = a.id;
  END LOOP;
  -- Keep notifications tidy: 90 days.
  DELETE FROM public.notifications WHERE created_at < now() - interval '90 days';
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.run_job_alerts() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('madevisa-job-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('madevisa-job-alerts', '*/30 * * * *', 'select public.run_job_alerts()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%).', SQLERRM;
END $$;
