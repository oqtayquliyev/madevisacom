-- Tests for 20261215090000_emails_and_auto_apply_service.sql.
-- Run on a scratch database with every migration applied — never on the live one:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/emails_auto_apply_service.test.sql
-- Everything happens in one transaction that is rolled back at the end.
BEGIN;

CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO authenticated, anon, service_role;
CREATE TABLE t.ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON t.ids TO authenticated, anon, service_role;
CREATE FUNCTION t.id(text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM t.ids WHERE k = $1 $$;
CREATE FUNCTION t.as(k text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', t.id(k)::text, true);
  SET LOCAL ROLE authenticated;
END $$;
CREATE FUNCTION t.out() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RESET ROLE;
END $$;
CREATE FUNCTION t.ok(cond boolean, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', what; END IF;
  RAISE NOTICE 'ok: %', what;
END $$;
CREATE FUNCTION t.mails(kind text) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT count(*)::int FROM public.email_log WHERE email_log.kind = $1 AND status <> 'skipped' $$;

INSERT INTO public.app_secrets (name, value) VALUES ('resend_api_key', 're_test'), ('email_from', 'MadeVisa <hello@mail.madevisa.com>')
ON CONFLICT (name) DO UPDATE SET value = excluded.value;

INSERT INTO t.ids VALUES ('free', gen_random_uuid()), ('pro', gen_random_uuid()), ('admin', gen_random_uuid());
INSERT INTO auth.users (id, email, email_confirmed_at) SELECT v, k || '@example.com', now() FROM t.ids;
INSERT INTO public.profiles (id, email, full_name) SELECT v, k || '@example.com', initcap(k) || ' Person' FROM t.ids ON CONFLICT (id) DO UPDATE SET full_name = excluded.full_name;
UPDATE public.profiles SET role = 'admin' WHERE id = t.id('admin');
UPDATE public.profiles SET specialization = 'Data Analyst' WHERE id = t.id('pro');
INSERT INTO public.subscriptions (user_id, plan, status) VALUES (t.id('pro'), 'pro', 'active');
INSERT INTO public.user_cvs (user_id, text, profile) VALUES
  (t.id('pro'), 'Data analyst with Python and SQL', '{"titles": ["Data Analyst"], "skills": {"python": 3, "sql": 2, "tableau": 1}}'),
  (t.id('free'), 'Designer', '{"titles": ["Designer"]}');

INSERT INTO t.ids VALUES ('acme', gen_random_uuid());
INSERT INTO public.program_publishers (id, org_type, name, verification_status, website, logo_url) VALUES (t.id('acme'), 'company', 'Acme GmbH', 'verified', 'https://acme.example', 'https://acme.example/logo.png');
INSERT INTO t.ids SELECT 'j' || g, gen_random_uuid() FROM generate_series(1, 6) g;
INSERT INTO public.sponsored_jobs (id, publisher_id, title, category, status, official_url, country_id, description, released_at, visa_sponsorship)
SELECT t.id('j' || g), t.id('acme'), 'Data Analyst ' || g, 'Full time', 'published', 'https://acme.example/jobs/' || g, (SELECT id FROM public.countries WHERE iso_code = 'DE'),
       'We need Python and SQL and Tableau.', now() - interval '1 hour', g % 2 = 0
FROM generate_series(1, 6) g;

\echo '1. email settings'
SELECT t.as('pro');
SELECT t.ok((public.my_email_prefs()->>'applications')::boolean AND public.my_email_prefs()->>'for_you' = 'daily', 'defaults: everything on, daily matches');
SELECT t.ok(public.set_email_prefs('{"for_you":"weekly","news":false}')->>'for_you' = 'weekly', 'set weekly');
SELECT t.ok(NOT (public.my_email_prefs()->>'news')::boolean, 'news off');
SELECT t.ok((public.set_email_prefs('{"all_off":true}')->>'all_off')::boolean AND public.my_email_prefs()->>'for_you' = 'off', 'unsubscribe from all');
SELECT t.ok(NOT (public.set_email_prefs('{"for_you":"daily","applications":true}')->>'all_off')::boolean, 'turning one on lifts all-off');
SELECT t.out();

\echo '2. one-click unsubscribe (no sign-in)'
SET LOCAL ROLE anon;
SELECT t.ok(public.email_unsubscribe(gen_random_uuid(), 'all') = '', 'bad token does nothing');
RESET ROLE;
SELECT t.ok(public.email_unsubscribe((SELECT token FROM public.email_prefs WHERE user_id = t.id('pro')), 'news') = 'News and tips', 'news link');
SELECT t.ok(public.email_unsubscribe((SELECT token FROM public.email_prefs WHERE user_id = t.id('pro')), 'foryou') = 'Jobs that match your skills', 'for-you link');
SELECT t.ok((SELECT frequency FROM public.for_you_settings WHERE user_id = t.id('pro')) = 'off', 'for-you is off');
SELECT t.out();
SELECT t.as('pro');
SELECT public.set_email_prefs('{"for_you":"daily","job_alerts":true}');
SELECT t.out();

\echo '3. Auto Apply: free account refused, Pro turns it on'
SELECT t.as('free');
DO $$ BEGIN PERFORM public.auto_apply_start('{"consent":true,"consent_text":"I agree"}'); RAISE EXCEPTION 'should fail'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Pro%' THEN RAISE; END IF; END $$;
SELECT t.out();
SELECT t.as('pro');
DO $$ BEGIN PERFORM public.auto_apply_start('{"consent":false,"consent_text":"I agree"}'); RAISE EXCEPTION 'should fail'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%agree%' THEN RAISE; END IF; END $$;
SELECT t.ok(public.auto_apply_start('{"consent":true,"consent_text":"I authorise MadeVisa","roles":["Data Analyst"],"countries":["Germany"],"per_day":5,"min_score":60,"answers":{"phone":"+49 1"}}')->'request'->>'status' = 'active', 'started');
SELECT t.ok((public.auto_apply_start('{"consent":true,"consent_text":"I authorise MadeVisa","per_day":7}')->'request'->>'per_day')::int = 7, 'second start updates, no second request');
SELECT t.out();
SELECT t.ok((SELECT count(*) FROM public.auto_apply_requests WHERE user_id = t.id('pro')) = 1, 'one request');
SELECT t.ok((SELECT count(*) FROM public.notifications WHERE audience = 'admin' AND kind = 'auto_apply_request') = 1, 'admin bell once');
SELECT t.ok(t.mails('admin') = 1 AND t.mails('auto_apply') = 1, 'admin email + welcome email');

\echo '4. sync matches into the queue'
SELECT t.as('pro');
SELECT t.ok(public.auto_apply_sync(jsonb_build_array(
  jsonb_build_object('id', t.id('j1'), 'score', 90), jsonb_build_object('id', t.id('j2'), 'score', 80),
  jsonb_build_object('id', t.id('j3'), 'score', 40), jsonb_build_object('id', 'not-a-uuid', 'score', 99))) = 2, 'two above 60% added');
SELECT t.ok(public.auto_apply_sync(jsonb_build_array(jsonb_build_object('id', t.id('j1'), 'score', 90))) = 0, 'never twice');
SELECT t.ok(jsonb_array_length(public.auto_apply_me()->'items') = 2 AND (public.auto_apply_me()->'stats'->>'queued')::int = 2, 'person sees the queue');
SELECT t.out();

\echo '5. admin: list, open, applying, applied → bell + email once'
SELECT t.as('free');
DO $$ BEGIN PERFORM public.admin_auto_apply_list('open'); RAISE EXCEPTION 'should fail'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%admins%' THEN RAISE; END IF; END $$;
SELECT t.out();
SELECT t.as('admin');
SELECT t.ok(jsonb_array_length(public.admin_auto_apply_list('open')->'rows') = 1, 'admin lists it');
SELECT t.ok(public.admin_auto_apply_get((SELECT id FROM public.auto_apply_requests WHERE user_id = t.id('pro')))->'person'->>'name' = 'Pro Person', 'admin opens it');
SELECT public.admin_auto_apply_item((SELECT id FROM public.auto_apply_items WHERE job_id = t.id('j1')), 'applying');
SELECT t.ok(public.admin_auto_apply_item((SELECT id FROM public.auto_apply_items WHERE job_id = t.id('j1')), 'applied', 'Applied on the careers site')->>'status' = 'applied', 'marked applied');
SELECT public.admin_auto_apply_item((SELECT id FROM public.auto_apply_items WHERE job_id = t.id('j1')), 'applied');
SELECT t.ok((public.admin_auto_apply_add((SELECT id FROM public.auto_apply_requests WHERE user_id = t.id('pro')), NULL, 'Analyst', 'Other Co', 'https://other.example/job', 'Berlin', 'applied'))->>'status' = 'applied', 'admin adds an outside job as applied');
DO $$ BEGIN PERFORM public.admin_auto_apply_add((SELECT id FROM public.auto_apply_requests WHERE user_id = t.id('pro')), t.id('j2')); RAISE EXCEPTION 'should fail'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%already%' THEN RAISE; END IF; END $$;
SELECT t.ok((public.admin_auto_apply_update((SELECT id FROM public.auto_apply_requests WHERE user_id = t.id('pro')), NULL, 10)->>'ends_at')::timestamptz > now() + interval '35 days', 'extend by 10 days');
SELECT t.out();
SELECT t.ok(t.mails('application') = 2, 'one email per applied job (2)');
SELECT t.ok((SELECT count(*) FROM public.notifications WHERE user_id = t.id('pro') AND kind = 'auto_apply_applied') = 2, 'two bells');
SELECT t.ok((SELECT body->>'subject' FROM net.requests_log ORDER BY id DESC LIMIT 1) LIKE 'You applied: Analyst at Other Co', 'subject');
SELECT t.ok((SELECT body->>'html' FROM net.requests_log ORDER BY id DESC LIMIT 1) LIKE '%Unsubscribe from all%', 'footer has unsubscribe');

\echo '6. applications email off → no email, still a bell'
SELECT t.as('pro');
SELECT public.set_email_prefs('{"applications":false}');
SELECT t.out();
SELECT t.as('admin');
SELECT public.admin_auto_apply_item((SELECT id FROM public.auto_apply_items WHERE job_id = t.id('j2')), 'applied');
SELECT t.out();
SELECT t.ok(t.mails('application') = 2, 'no third email');
SELECT t.ok((SELECT count(*) FROM public.email_log WHERE kind = 'application' AND status = 'skipped') = 1, 'logged as skipped');
SELECT t.ok((SELECT count(*) FROM public.notifications WHERE user_id = t.id('pro') AND kind = 'auto_apply_applied') = 3, 'bell still there');

\echo '7. profile: jobs you applied to'
SELECT t.as('pro');
SELECT t.ok(jsonb_array_length(public.my_applied_jobs()) = 3, 'three applied jobs');
SELECT t.ok((SELECT count(*) FROM jsonb_array_elements(public.my_applied_jobs()) x WHERE x->>'via' = 'madevisa') = 3, 'all by MadeVisa');
SELECT t.out();

\echo '8. Jobs that match your skills + job alerts: new design, logged'
UPDATE public.sponsored_jobs SET awaiting_release = false;
SELECT t.ok(public.run_for_you_emails('daily') >= 1, 'for-you sent');
SELECT t.ok((SELECT body->>'html' FROM net.requests_log WHERE body->>'subject' LIKE '%your skills%' ORDER BY id DESC LIMIT 1) LIKE '%✓ Python%', 'shows matched skills');
INSERT INTO public.job_alerts (user_id, keywords, country_code, label, last_checked_at, created_at) VALUES (t.id('pro'), 'Data', 'DE', 'Data · Germany', now(), now() - interval '2 days');
SELECT t.ok(public.run_job_alert_emails() = 1, 'job alert sent');
SELECT t.ok(t.mails('job_alert') = 1 AND t.mails('for_you') >= 1, 'both logged');

\echo '9. admin email dashboard'
UPDATE public.email_log SET request_id = 999999 WHERE id = (SELECT min(id) FROM public.email_log WHERE status = 'queued');
INSERT INTO net._http_response (id, status_code, content) VALUES (999999, 422, '{"message":"Invalid to"}');
SELECT t.as('admin');
SELECT t.ok((public.admin_email_stats('Asia/Baku')->'today'->>'total')::int >= 5, 'today total');
SELECT t.ok((public.admin_email_stats('Asia/Baku')->'today'->>'failed')::int = 1, 'a refused email shows as failed');
SELECT t.ok(jsonb_array_length(public.admin_email_stats('Not/AZone')->'days') = 14, '14 days, bad time zone falls back to UTC');
SELECT t.out();

\echo '10. stop and month end'
SELECT t.as('pro');
SELECT public.auto_apply_sync(jsonb_build_array(jsonb_build_object('id', t.id('j4'), 'score', 95)));
SELECT t.ok(public.auto_apply_set('paused')->'request'->>'status' = 'paused', 'paused');
SELECT t.ok(public.auto_apply_sync(jsonb_build_array(jsonb_build_object('id', t.id('j5'), 'score', 95))) = 0, 'no sync while paused');
SELECT t.ok(public.auto_apply_set('stopped')->'request'->>'status' = 'stopped', 'stopped');
SELECT t.out();
SELECT t.ok((SELECT status FROM public.auto_apply_items WHERE job_id = t.id('j4')) = 'skipped', 'queued ones skipped on stop');
UPDATE public.auto_apply_requests SET status = 'active', ends_at = now() - interval '1 minute' WHERE user_id = t.id('pro');
SELECT t.as('pro');
SELECT t.ok(public.auto_apply_me()->'request'->>'status' = 'ended', 'month over → ended');
SELECT t.out();

\echo 'ALL PASSED'
ROLLBACK;
