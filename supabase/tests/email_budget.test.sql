-- Tests for 20261228130000_email_budget_split.sql. Scratch database only (psql), never the live one:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/email_budget.test.sql
-- Nothing is sent: emails only go into email_log (the outbox), which the test rolls back.
BEGIN;
CREATE SCHEMA t;
CREATE FUNCTION t.ok(cond boolean, what text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', what; END IF; RAISE NOTICE 'ok: %', what; END $$;
INSERT INTO public.app_secrets (name, value) VALUES ('resend_api_key', 're_test'), ('email_from', 'MadeVisa <hello@madevisa.com>')
ON CONFLICT (name) DO UPDATE SET value = excluded.value;
DELETE FROM public.email_log;
UPDATE public.outreach_settings SET daily_cap = 100, reserve = 50, quota_outreach = 25, quota_paid = 10, quota_members = 15;

CREATE TABLE t.u (k text PRIMARY KEY, id uuid DEFAULT gen_random_uuid(), paid boolean, age interval);
INSERT INTO t.u (k, paid, age) SELECT 'paid' || g, true, interval '30 days' FROM generate_series(1, 12) g;
INSERT INTO t.u (k, paid, age) SELECT 'free' || g, false, interval '30 days' FROM generate_series(1, 18) g;
INSERT INTO t.u (k, paid, age) VALUES ('new7h', false, interval '7 hours'), ('new2h', false, interval '2 hours'), ('newpaid', true, interval '7 hours'), ('newnamed', false, interval '8 hours');
INSERT INTO auth.users (id, email, email_confirmed_at, created_at) SELECT id, k || '@realmail.com', now() - age, now() - age FROM t.u;
INSERT INTO public.profiles (id, email) SELECT id, k || '@realmail.com' FROM t.u ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET full_name = 'Aysel Mammadova' WHERE id = (SELECT id FROM t.u WHERE k = 'newnamed');
INSERT INTO public.subscriptions (user_id, plan, status) SELECT id, 'starter', 'active' FROM t.u WHERE paid;

CREATE FUNCTION t.job(k text, kind text DEFAULT 'for_you') RETURNS boolean LANGUAGE sql AS $$
  SELECT public.mv_send_email(k || '@realmail.com', 'Jobs', '<p>x</p>', 'x', kind, (SELECT id FROM t.u WHERE t.u.k = $1))
$$;

SELECT t.ok(public.mv_email_left('paid') = 10 AND public.mv_email_left('members') = 15 AND public.outreach_budget() = 25, 'fresh day: 10 paid, 15 members, 25 outreach');

-- Paid members: 10 a day.
CREATE TEMP TABLE r AS SELECT k, t.job(k) AS sent FROM t.u WHERE k LIKE 'paid%' ORDER BY k;
SELECT t.ok((SELECT count(*) FILTER (WHERE sent) FROM r) = 10, 'paid members: 10 job emails, then the share is used');
SELECT t.ok((SELECT count(*) FROM public.email_log WHERE status = 'skipped' AND kind = 'for_you') = 2, 'the 2 over the share are logged as skipped, not sent');

-- Free members: 15 a day, counted separately from paid.
CREATE TEMP TABLE r2 AS SELECT k, t.job(k) AS sent FROM t.u WHERE k LIKE 'free%' ORDER BY k;
SELECT t.ok((SELECT count(*) FILTER (WHERE sent) FROM r2) = 15, 'free members: 15 job emails');

-- Never two job emails a day to the same person (a job alert after "jobs for you").
SELECT t.ok(NOT t.job('free1', 'job_alert'), 'no second job email the same day');
SELECT t.ok(public.mv_job_emailed_today((SELECT id FROM t.u WHERE k = 'free1')), 'emailed-today check');

-- Outreach has its own 25.
INSERT INTO public.email_log (to_email, kind, subject, status) SELECT 'c' || g || '@corp.com', CASE WHEN g % 2 = 0 THEN 'campaign' ELSE 'auto_employer_1' END, 'Hi', 'sent' FROM generate_series(1, 20) g;
SELECT t.ok(public.outreach_budget() = 5, 'outreach: 25 minus 20 sent = 5 left');
INSERT INTO public.email_log (to_email, kind, subject, status) SELECT 'a' || g || '@corp.com', 'auto_apply', 'Applied', 'sent' FROM generate_series(1, 3) g;
SELECT t.ok(public.outreach_budget() = 5, 'Auto Apply notices are site emails, not outreach');

-- Site emails always go through, and the room they need is protected.
CREATE TEMP TABLE r3 AS SELECT public.mv_send_email('x' || g || '@realmail.com', 'Your code', '<p>1</p>', '1', 'welcome', NULL) AS sent FROM generate_series(1, 60) g;
SELECT t.ok((SELECT bool_and(sent) FROM r3), 'site emails are never held back by the shares');
SELECT t.ok(public.outreach_budget() = 0, 'site emails above their 50: outreach makes room instead of eating into them');

-- Starter reminder: 6 h after signing up, free only, once.
DELETE FROM public.email_log WHERE kind NOT IN ('for_you', 'job_alert');
SELECT public.run_starter_reminders();
SELECT t.ok(EXISTS (SELECT 1 FROM public.email_log WHERE kind = 'starter_reminder' AND to_email = 'new7h@realmail.com'), 'free sign-up 7 h ago gets the reminder');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.email_log WHERE kind = 'starter_reminder' AND to_email = 'new2h@realmail.com'), 'not before 6 hours');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.email_log WHERE kind = 'starter_reminder' AND to_email = 'newpaid@realmail.com'), 'not for someone already on Starter');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.email_log WHERE kind = 'starter_reminder' AND to_email LIKE 'free%'), 'not for older accounts');
SELECT t.ok((SELECT subject FROM public.email_log WHERE kind = 'starter_reminder' AND to_email = 'newnamed@realmail.com') = 'Aysel, your best job matches are waiting', 'personal subject when the name is known');
SELECT t.ok((SELECT payload->>'html' FROM public.email_log WHERE kind = 'starter_reminder' AND to_email = 'new7h@realmail.com') LIKE '%$2.99 a month%', 'shows the Starter price');
SELECT public.run_starter_reminders();
SELECT t.ok((SELECT count(*) FROM public.email_log WHERE kind = 'starter_reminder' AND to_email = 'new7h@realmail.com') = 1, 'only once');

\echo 'all email budget tests passed'
ROLLBACK;
