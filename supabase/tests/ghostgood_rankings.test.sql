-- Tests for 20261228120000_ghostgood_monthly_rankings.sql. Scratch database only (psql), never the live one:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/ghostgood_rankings.test.sql
BEGIN;
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO authenticated, anon;
CREATE TABLE t.ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON t.ids TO authenticated, anon;
CREATE FUNCTION t.id(text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM t.ids WHERE k = $1 $$;
CREATE FUNCTION t.as(k text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', t.id(k)::text, true); SET LOCAL ROLE authenticated; END $$;
CREATE FUNCTION t.anon() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '', true); SET LOCAL ROLE anon; END $$;
CREATE FUNCTION t.out() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '', true); RESET ROLE; END $$;
CREATE FUNCTION t.ok(cond boolean, what text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', what; END IF; RAISE NOTICE 'ok: %', what; END $$;

-- Fixed months, far from "now": last month (L) and the month before (P).
CREATE TABLE t.m AS SELECT
  (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '1 month')::date AS l,
  (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '2 month')::date AS p;
GRANT SELECT ON t.m TO authenticated, anon;
CREATE FUNCTION t.at(day int, hh int DEFAULT 12) RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT ((SELECT l FROM t.m) + (day - 1) + make_interval(hours => hh)) AT TIME ZONE 'UTC'
$$;

ALTER TABLE public.company_experience_reports DISABLE TRIGGER company_experience_reports_guard;
ALTER TABLE public.company_experience_reports DISABLE TRIGGER company_experience_published;
ALTER TABLE public.application_reports DISABLE TRIGGER USER;
DELETE FROM public.ghostgood_month_rankings;

INSERT INTO t.ids SELECT 'u' || g, gen_random_uuid() FROM generate_series(1, 12) g;
INSERT INTO t.ids VALUES ('admin', gen_random_uuid()), ('good', gen_random_uuid()), ('bad', gen_random_uuid()), ('small', gen_random_uuid()),
  ('mid', gen_random_uuid()), ('alias1', gen_random_uuid()), ('alias2', gen_random_uuid()), ('org', gen_random_uuid()), ('unver', gen_random_uuid()),
  ('tieA', gen_random_uuid()), ('tieB', gen_random_uuid());
INSERT INTO auth.users (id, email) SELECT v, k || '@test.x' FROM t.ids WHERE k ~ '^u[0-9]+$' OR k = 'admin';
INSERT INTO public.profiles (id) SELECT v FROM t.ids WHERE k ~ '^u[0-9]+$' OR k = 'admin' ON CONFLICT DO NOTHING;
UPDATE public.profiles SET role = 'admin' WHERE id = t.id('admin');
INSERT INTO public.organizations (id, name, org_type) VALUES (t.id('org'), 'Alias Group', 'company');
INSERT INTO public.program_publishers (id, org_type, name, verification_status, organization_id) VALUES
  (t.id('good'), 'company', 'Good Co', 'verified', NULL),
  (t.id('bad'), 'company', 'Bad Co', 'verified', NULL),
  (t.id('small'), 'company', 'Small Co', 'verified', NULL),
  (t.id('mid'), 'company', 'Mid Co', 'verified', NULL),
  (t.id('alias1'), 'company', 'Alias GmbH', 'verified', t.id('org')),
  (t.id('alias2'), 'company', 'Alias Ltd', 'verified', t.id('org')),
  (t.id('unver'), 'company', 'Unverified Co', 'pending', NULL),
  (t.id('tieA'), 'company', 'Tie Alpha', 'verified', NULL),
  (t.id('tieB'), 'company', 'Tie Beta', 'verified', NULL);

CREATE FUNCTION t.rep(u text, pub text, outcome text, at timestamptz, verified boolean DEFAULT true, st text DEFAULT 'approved') RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.company_experience_reports (user_id, company_name, applied_on, channel, outcome, publisher_id, status, email_verified, created_at)
  VALUES (t.id(u), pub, (at - interval '20 days')::date, 'other', outcome, t.id(pub), st, verified, at)
$$;

-- Good Co: 6 people, all heard back.
SELECT t.rep('u' || g, 'good', CASE WHEN g % 2 = 0 THEN 'interview' ELSE 'responded' END, t.at(10)) FROM generate_series(1, 6) g;
-- Bad Co: 6 people reported being ignored; u1 also sent 3 duplicate reports (only the latest counts).
SELECT t.rep('u' || g, 'bad', 'no_response', t.at(11)) FROM generate_series(1, 6) g;
SELECT t.rep('u1', 'bad', 'no_response', t.at(12)), t.rep('u1', 'bad', 'no_response', t.at(13));
-- Small Co: only 3 people (not enough data).
SELECT t.rep('u' || g, 'small', 'offer', t.at(5)) FROM generate_series(1, 3) g;
-- Mid Co: 5 rejections (they replied) = neutral.
SELECT t.rep('u' || g, 'mid', 'rejected', t.at(6)) FROM generate_series(1, 5) g;
-- Alias group: 3 people via one publisher, 2 via the other = one company with 5.
SELECT t.rep('u' || g, 'alias1', 'responded', t.at(7)) FROM generate_series(1, 3) g;
SELECT t.rep('u' || g, 'alias2', 'responded', t.at(7)) FROM generate_series(4, 5) g;
-- Unverified publisher: never listed.
SELECT t.rep('u' || g, 'unver', 'offer', t.at(7)) FROM generate_series(1, 6) g;
-- Pending (unmoderated) reports never count.
SELECT t.rep('u' || g, 'small', 'offer', t.at(8), true, 'pending') FROM generate_series(4, 9) g;
-- Month boundaries: 1 second before the month and exactly at the next month's start are outside.
SELECT t.rep('u7', 'mid', 'offer', ((SELECT l FROM t.m)::timestamp - interval '1 second') AT TIME ZONE 'UTC');
SELECT t.rep('u8', 'mid', 'offer', ((SELECT l FROM t.m)::timestamp + interval '1 month') AT TIME ZONE 'UTC');
-- ...and exactly at 00:00 on the 1st is inside.
SELECT t.rep('u9', 'mid', 'rejected', ((SELECT l FROM t.m)::timestamp) AT TIME ZONE 'UTC');
-- Ties: identical scores and counts → name decides (Tie Alpha before Tie Beta).
SELECT t.rep('u' || g, 'tieA', 'responded', t.at(9)) FROM generate_series(1, 5) g;
SELECT t.rep('u' || g, 'tieB', 'responded', t.at(9)) FROM generate_series(1, 5) g;
-- Tracked applications to Good Co with no update: unanswered, never negative.
INSERT INTO public.application_reports (user_id, publisher_id, listing_kind, listing_id, status, applied_at)
SELECT t.id('u' || g), t.id('good'), 'job', gen_random_uuid(), 'applied', t.at(14) FROM generate_series(7, 10) g;
-- Jobs: two cross-posts of the same title + country count once; another job counts; one from another month doesn't.
INSERT INTO public.sponsored_jobs (publisher_id, title, category, status, released_at) VALUES
  (t.id('good'), 'Nurse', 'Full time', 'published', t.at(2)),
  (t.id('good'), 'nurse ', 'Full time', 'published', t.at(3)),
  (t.id('good'), 'Engineer', 'Full time', 'published', t.at(4)),
  (t.id('good'), 'Old job', 'Full time', 'published', t.at(1) - interval '40 days');

CREATE TEMP TABLE c AS SELECT * FROM public.ghostgood_compute((SELECT l FROM t.m));
SELECT t.ok((SELECT voices FROM c WHERE name = 'Bad Co') = 6, 'duplicate reports by one person count once');
SELECT t.ok((SELECT eligible FROM c WHERE name = 'Small Co') = false, 'fewer than 5 people: not eligible');
SELECT t.ok((SELECT voices FROM c WHERE name = 'Small Co') = 3, 'unmoderated reports are ignored');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM c WHERE name = 'Unverified Co'), 'unverified companies are left out');
SELECT t.ok((SELECT voices FROM c WHERE name = 'Alias Group') = 5 AND (SELECT eligible FROM c WHERE name = 'Alias Group'), 'two publishers of one organisation are one company');
SELECT t.ok((SELECT voices FROM c WHERE name = 'Mid Co') = 6, 'month boundaries: 00:00 on the 1st is in, the second before and the next month are out');
SELECT t.ok((SELECT unanswered FROM c WHERE name = 'Good Co') = 4 AND (SELECT negative FROM c WHERE name = 'Good Co') = 0, 'tracked applications without an update are unanswered, not negative');
SELECT t.ok((SELECT jobs FROM c WHERE name = 'Good Co') = 2, 'jobs that month, cross-posts counted once');
SELECT t.ok((SELECT score FROM c WHERE name = 'Good Co') > (SELECT prior_mean FROM c LIMIT 1)
  AND (SELECT score FROM c WHERE name = 'Bad Co') < (SELECT prior_mean FROM c LIMIT 1), 'good above the month average, bad below');
SELECT t.ok((SELECT score FROM c WHERE name = 'Good Co') < 100 AND (SELECT score FROM c WHERE name = 'Bad Co') > 0, 'small samples are pulled toward the average (no 0 or 100 from 6 reports)');
SELECT t.ok((SELECT count(DISTINCT prior_mean) FROM c) = 1, 'one month average for everyone');

-- Public read (anonymous visitor), last month computed live before any snapshot.
SELECT t.anon();
CREATE TEMP TABLE r1 AS SELECT public.ghostgood_rankings((SELECT l FROM t.m)) AS j;
SELECT t.out();
SELECT t.ok((SELECT (j->>'final')::boolean FROM r1) = false, 'no snapshot yet: marked not final');
SELECT t.ok((SELECT j->'best'->0->>'name' FROM r1) = 'Good Co', 'best: Good Co first');
SELECT t.ok((SELECT j->'worst'->0->>'name' FROM r1) = 'Bad Co', 'needs improvement: Bad Co first');
SELECT t.ok(NOT (SELECT j::text FROM r1) LIKE '%Small Co%', 'not-enough-data companies are never published');
SELECT t.ok((SELECT (j->'best'->0->>'per100')::numeric FROM r1) = 300.0, 'reports per 100 jobs shown (6 voices / 2 jobs)');
SELECT t.ok((SELECT position('"Tie Alpha"' IN (j->'best')::text) < position('"Tie Beta"' IN (j->'best')::text) FROM r1), 'ties: same score and count, ordered by name');
SELECT t.ok((SELECT j->'most'->0->>'name' FROM r1) IN ('Good Co', 'Bad Co', 'Mid Co'), 'most reviewed: a 6-voice company first');
SELECT t.ok((SELECT jsonb_array_length(j->'best') + jsonb_array_length(j->'worst') FROM r1) = (SELECT (j->>'companies_ranked')::int FROM r1), 'every eligible company is in best or needs improvement');

-- Snapshots: anonymous and normal users can't write; admin and cron can.
SELECT t.anon();
DO $$ BEGIN PERFORM public.ghostgood_snapshot((SELECT l FROM t.m)); RAISE EXCEPTION 'anon could snapshot'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: anon cannot snapshot'; END $$;
SELECT t.out();
SELECT t.as('u1');
DO $$ BEGIN PERFORM public.ghostgood_snapshot((SELECT l FROM t.m)); RAISE EXCEPTION 'user could snapshot'; EXCEPTION WHEN others THEN IF SQLERRM NOT LIKE '%Admin%' THEN RAISE; END IF; RAISE NOTICE 'ok: a normal user cannot snapshot'; END $$;
SELECT t.out();
DO $$ BEGIN PERFORM public.ghostgood_snapshot((date_trunc('month', now() AT TIME ZONE 'UTC'))::date); RAISE EXCEPTION 'current month stored'; EXCEPTION WHEN others THEN IF SQLERRM NOT LIKE '%finished months%' THEN RAISE; END IF; RAISE NOTICE 'ok: the current month cannot be stored'; END $$;
SELECT t.ok(public.ghostgood_snapshot((SELECT l FROM t.m)) > 0, 'cron stores last month');
SELECT t.ok(public.ghostgood_snapshot((SELECT l FROM t.m)) = 0, 'a stored month is not overwritten');

-- A late report (approved after the snapshot) does not change the stored month.
SELECT t.rep('u11', 'bad', 'offer', t.at(20));
SELECT t.rep('u12', 'bad', 'offer', t.at(20));
CREATE TEMP TABLE r2 AS SELECT public.ghostgood_rankings((SELECT l FROM t.m)) AS j;
SELECT t.ok((SELECT (j->>'final')::boolean FROM r2), 'stored month is final');
SELECT t.ok((SELECT j->'worst' FROM r2) = (SELECT j->'worst' FROM r1), 'late reports do not change a stored month');
SELECT t.as('admin');
SELECT t.ok(public.ghostgood_snapshot((SELECT l FROM t.m), true) > 0, 'admin can recompute on purpose');
SELECT t.out();
CREATE TEMP TABLE r3 AS SELECT public.ghostgood_rankings((SELECT l FROM t.m)) AS j;
SELECT t.ok((SELECT (j->'worst'->0->>'voices')::int FROM r3) = 8, 'after a forced recompute the late reports count');

-- Country filter, empty months, future months.
UPDATE public.program_publishers SET country_id = (SELECT id FROM public.countries WHERE iso_code = 'DE' LIMIT 1) WHERE id = t.id('good');
SELECT public.ghostgood_snapshot((SELECT l FROM t.m), true);
SELECT t.ok((SELECT jsonb_array_length(public.ghostgood_rankings((SELECT l FROM t.m), 'de')->'best')) = 1, 'country filter (case-insensitive)');
SELECT t.ok((SELECT (public.ghostgood_rankings((SELECT p FROM t.m))->>'companies_ranked')::int) = 0, 'a month without reports: nothing ranked, no error');
SELECT t.ok((SELECT public.ghostgood_rankings((now() + interval '3 months')::date)->>'month') = (date_trunc('month', now() AT TIME ZONE 'UTC'))::date::text, 'future months fall back to this month');
SELECT t.ok((SELECT public.ghostgood_rankings()->'months'->0) IS NOT NULL, 'months list for the picker');

\echo 'all ghostgood ranking tests passed'
ROLLBACK;
