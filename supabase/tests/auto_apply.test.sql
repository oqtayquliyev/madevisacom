-- Tests for Auto Apply: migrations 20261204090000_auto_apply.sql and 20261205090000_auto_apply_batch.sql.
-- Run on a scratch database that has every migration applied — never on the live one:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/auto_apply.test.sql
-- Everything happens inside one transaction that is rolled back at the end.
BEGIN;

CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO authenticated, anon, service_role;
CREATE TABLE t.ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON t.ids TO authenticated, anon, service_role;
CREATE FUNCTION t.id(text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM t.ids WHERE k = $1 $$;
-- Become a signed-in person (or the sending function).
CREATE FUNCTION t.as(k text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF k = 'service' THEN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    SET LOCAL ROLE service_role;
  ELSE
    PERFORM set_config('request.jwt.claim.sub', t.id(k)::text, true);
    SET LOCAL ROLE authenticated;
  END IF;
END $$;
-- Back to the database owner, signed in as nobody.
CREATE FUNCTION t.out() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RESET ROLE;
END $$;
CREATE FUNCTION t.items(VARIADIC ks text[]) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_agg(jsonb_build_object('jobId', t.id(k), 'score', 90 - ord, 'rank', 100 - ord, 'priority', 'strong', 'decision', 'auto', 'sponsorship', 'likely') ORDER BY ord)
  FROM unnest(ks) WITH ORDINALITY AS x(k, ord)
$$;
CREATE FUNCTION t.app(u text, j text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT id FROM public.job_applications WHERE user_id = t.id(u) AND job_id = t.id(j) $$;
CREATE FUNCTION t.status(u text, j text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT status FROM public.job_applications WHERE user_id = t.id(u) AND job_id = t.id(j) $$;
CREATE FUNCTION t.events(u text, n text) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT count(*)::int FROM public.application_events WHERE user_id = t.id(u) AND name = n $$;
CREATE FUNCTION t.used(u text) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.apply_used(t.id(u)) $$;

-- People: a free account, a Pro account, an admin.
INSERT INTO t.ids VALUES ('free', gen_random_uuid()), ('pro', gen_random_uuid()), ('admin', gen_random_uuid()), ('other', gen_random_uuid());
INSERT INTO auth.users (id, email, email_confirmed_at) SELECT v, k || '@example.com', now() FROM t.ids;
INSERT INTO public.profiles (id, email) SELECT v, k || '@example.com' FROM t.ids ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET role = 'admin' WHERE id = t.id('admin');
INSERT INTO public.subscriptions (user_id, plan, status) VALUES (t.id('pro'), 'pro', 'active');

-- Companies and jobs.
INSERT INTO t.ids VALUES ('acme', gen_random_uuid()), ('beta', gen_random_uuid());
INSERT INTO public.program_publishers (id, org_type, name, verification_status, website) VALUES
  (t.id('acme'), 'company', 'Acme GmbH', 'verified', 'https://acme.example'), (t.id('beta'), 'company', 'Beta BV', 'verified', 'https://beta.example');
INSERT INTO t.ids SELECT 'j' || g, gen_random_uuid() FROM generate_series(1, 12) g;
INSERT INTO t.ids VALUES ('direct', gen_random_uuid()), ('closed', gen_random_uuid()), ('twinA', gen_random_uuid()), ('twinB', gen_random_uuid());
INSERT INTO public.sponsored_jobs (id, publisher_id, title, category, status, official_url, country_id)
SELECT t.id('j' || g), t.id('beta'), 'Role number ' || g, 'Full time', 'published', 'https://boards.greenhouse.io/beta/jobs/' || (1000 + g), (SELECT id FROM public.countries WHERE iso_code = 'DE')
FROM generate_series(1, 12) g;
INSERT INTO public.sponsored_jobs (id, publisher_id, title, category, status, official_url) VALUES
  (t.id('direct'), t.id('acme'), 'Data Analyst', 'Full time', 'published', NULL),
  (t.id('closed'), t.id('acme'), 'Old role', 'Full time', 'expired', 'https://acme.example/old'),
  (t.id('twinA'), t.id('acme'), 'Senior Engineer (m/f/d) – Berlin', 'Full time', 'published', 'https://acme.example/a'),
  (t.id('twinB'), t.id('acme'), 'Senior Engineer', 'Full time', 'published', 'https://acme.example/b');

\echo '1. only admins switch a job to "applications through MadeVisa"'
DO $$
BEGIN
  PERFORM t.as('free');
  BEGIN
    PERFORM public.apply_set_job_channel(t.id('direct'), true, 'jobs@acme.example');
    RAISE EXCEPTION 'a non-admin switched the channel on';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM t.out();
  PERFORM t.as('admin');
  PERFORM public.apply_set_job_channel(t.id('direct'), true, 'Jobs@Acme.example');
  PERFORM t.out();
  ASSERT (SELECT enabled AND email = 'jobs@acme.example' FROM public.application_channels WHERE job_id = t.id('direct'));
  -- The switch needs an address.
  PERFORM t.as('admin');
  BEGIN
    PERFORM public.apply_set_job_channel(t.id('j1'), true, '  ');
    RAISE EXCEPTION 'switched on without an address';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%email address%' THEN RAISE; END IF;
  END;
  PERFORM t.out();
  -- Nobody but staff can read where applications go: not the public, not a signed-in person.
  PERFORM t.as('free');
  ASSERT (SELECT count(*) FROM public.application_channels) = 0, 'a signed-in person could read the applications address';
  BEGIN
    PERFORM public.apply_channel_email(t.id('direct'));
    RAISE EXCEPTION 'apply_channel_email was callable by a signed-in person';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM t.out();
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM count(*) FROM public.application_channels;
    RAISE EXCEPTION 'the public could read application_channels';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  -- Turning it off keeps the address on file but stops sending.
  PERFORM t.as('admin');
  PERFORM public.apply_set_job_channel(t.id('direct'), false);
  PERFORM t.out();
  ASSERT public.apply_channel_email(t.id('direct')) IS NULL;
  PERFORM t.as('admin');
  PERFORM public.apply_set_job_channel(t.id('direct'), true, 'jobs@acme.example');
  PERFORM t.out();
END $$;


-- Helpers for the batch flow.
-- Prepare one application the way the page does: read the form, tailor the CV, save the answers, ready.
CREATE FUNCTION t.prepare(u text, j text, p_platform text DEFAULT 'greenhouse') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a uuid := t.app(u, j); r jsonb;
BEGIN
  PERFORM t.as(u);
  r := public.apply_move(a, 'analyzing');
  IF NOT (r->>'ok')::boolean THEN PERFORM t.out(); RETURN r; END IF;
  PERFORM public.apply_save_form(a, p_platform, 'ok', jsonb_build_array(jsonb_build_object('id', 'gh:first_name', 'label', 'First Name', 'required', true, 'kind', 'text')));
  r := public.apply_move(a, 'preparing');
  PERFORM public.apply_save(a, jsonb_build_object('name', 'Leyla CV', 'content', 'Leyla…', 'meta', jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('kind', 'name', 'text', 'Leyla')))),
                            NULL,
                            jsonb_build_array(jsonb_build_object('id', 'gh:first_name', 'label', 'First Name', 'value', 'Leyla', 'source', 'you', 'key', 'first_name'),
                                              jsonb_build_object('id', 'gh:email', 'label', 'Email', 'value', u || '@example.com', 'source', 'account', 'key', 'email'),
                                              jsonb_build_object('id', 'gh:sponsor', 'label', 'Will you need sponsorship?', 'value', 'Yes', 'source', 'derived', 'key', 'sponsorship')),
                            jsonb_build_object('first_name', 'Leyla', 'sponsorship', 'Yes'));
  r := public.apply_move(a, 'ready', jsonb_build_object('cvName', 'Leyla CV'));
  PERFORM t.out();
  RETURN r;
END $$;
CREATE FUNCTION t.claim(w text, n int) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM t.as('service'); r := public.apply_worker_claim(w, n); PERFORM t.out(); RETURN r;
END $$;
CREATE FUNCTION t.report(id uuid, w text, st text, d jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM t.as('service'); r := public.apply_worker_report(id, w, st, d); PERFORM t.out(); RETURN r;
END $$;
CREATE FUNCTION t.queue(u text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT id FROM public.application_queues WHERE user_id = t.id(u) ORDER BY created_at DESC LIMIT 1 $$;
CREATE FUNCTION t.qstate(u text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT state FROM public.application_queues WHERE id = t.queue(u) $$;
CREATE FUNCTION t.credit(u text, j text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT state FROM public.application_credits WHERE application_id = t.app(u, j) $$;
CREATE FUNCTION t.confirm(u text, email text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM t.as(u);
  r := public.apply_queue_set(t.queue(u), 'running', NULL, NULL, coalesce(email, u || '@example.com'));
  PERFORM t.out(); RETURN r;
END $$;
-- Each test step starts from a clean clock: nothing held by an earlier step's batch.
CREATE FUNCTION t.reset_day() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.job_applications SET day_started = day_started - 1 WHERE day_started IS NOT NULL $$;

\echo '2. allowance comes with the plan; the worker is reported offline until one checks in'
-- Since 20261209090000 a free account has 3 a month; these tests were written for 5.
UPDATE public.apply_settings SET free_monthly = 5;
DO $$
DECLARE s jsonb;
BEGIN
  PERFORM t.as('free'); s := public.apply_status(); PERFORM t.out();
  ASSERT (s->>'monthly')::int = 5 AND (s->>'left')::int = 5 AND NOT (s->>'pro')::boolean, s::text;
  ASSERT NOT (s->'worker'->>'online')::boolean, 'no worker has checked in';
  PERFORM t.as('pro'); s := public.apply_status(); PERFORM t.out();
  ASSERT (s->>'monthly')::int = 150 AND (s->>'pro')::boolean, s::text;
  -- Only the worker can check in.
  PERFORM t.as('pro');
  BEGIN
    PERFORM public.apply_worker_beat('fake', 'x');
    RAISE EXCEPTION 'a signed-in person checked in as a worker';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM t.out();
  PERFORM t.as('service'); s := public.apply_worker_beat('w1', '1.0.0', jsonb_build_object('host', 'test')); PERFORM t.out();
  ASSERT (s->>'autoSubmit')::boolean AND (s->>'concurrency')::int = 2, s::text;
  PERFORM t.as('pro'); s := public.apply_status(); PERFORM t.out();
  ASSERT (s->'worker'->>'online')::boolean;
  UPDATE public.apply_workers SET seen_at = now() - interval '10 minutes';
  PERFORM t.as('pro'); ASSERT NOT (public.apply_status()->'worker'->>'online')::boolean, 'a worker silent for 10 minutes is not online'; PERFORM t.out();
  UPDATE public.apply_workers SET seen_at = now();
END $$;

\echo '3. a batch starts as "analyzing": duplicates, closed jobs and the same role are left out'
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM t.as('pro');
  INSERT INTO public.application_reports (publisher_id, listing_kind, listing_id, listing_title) VALUES (t.id('beta'), 'job', t.id('j2'), 'Role number 2');
  UPDATE public.application_reports SET status = 'applied' WHERE listing_id = t.id('j2');
  r := public.apply_enqueue(t.items('direct', 'j1', 'j2', 'closed', 'twinA', 'twinB'), '2026-10-07T12:00:00Z');
  PERFORM t.out();
  ASSERT r->'queue'->>'state' = 'analyzing', r::text;
  ASSERT t.status('pro', 'direct') = 'queued' AND t.status('pro', 'j1') = 'queued';
  ASSERT t.status('pro', 'j2') = 'already_applied' AND t.status('pro', 'closed') = 'expired' AND t.status('pro', 'twinB') = 'already_applied';
  ASSERT (SELECT channel FROM public.job_applications WHERE id = t.app('pro', 'direct')) = 'madevisa';
  -- Starting again before confirming replaces the batch being set up — it is not doubled.
  PERFORM t.as('pro');
  r := public.apply_enqueue(t.items('direct', 'j1', 'twinA', 'j3'), NULL);
  PERFORM t.out();
  ASSERT (SELECT count(*) FROM public.application_queues WHERE user_id = t.id('pro') AND state IN ('analyzing', 'awaiting_answers')) = 1;
  ASSERT (SELECT state FROM public.application_queues WHERE user_id = t.id('pro') ORDER BY created_at LIMIT 1) = 'stopped';
  ASSERT (SELECT count(*) FROM public.job_applications WHERE queue_id = t.queue('pro')) = 4, (SELECT count(*) FROM public.job_applications WHERE queue_id = t.queue('pro'))::text;
  ASSERT t.status('pro', 'j3') = 'queued';
END $$;

\echo '4. the allowed moves, and what only the worker may do'
DO $$
DECLARE r jsonb; a uuid := t.app('pro', 'j1');
BEGIN
  ASSERT (SELECT count(*) FROM unnest(ARRAY['queued','analyzing','preparing','ready','submitting','submitted','needs_attention','failed','skipped','blocked','already_applied','expired']) f,
                              unnest(ARRAY['queued','analyzing','preparing','ready','submitting','submitted','needs_attention','failed','skipped','blocked','already_applied','expired']) g
          WHERE public.apply_can_move(f, g)) = 5 + 7 + 8 + 5 + 6 + 5 + 4 + 4 + 1;
  PERFORM t.as('pro');
  r := public.apply_move(a, 'ready');
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'invalid', 'queued → ready must be refused';
  r := public.apply_move(a, 'analyzing'); ASSERT (r->>'ok')::boolean;
  r := public.apply_move(a, 'preparing'); ASSERT (r->>'ok')::boolean;
  -- Ready means the CV it will be sent with is saved.
  r := public.apply_move(a, 'ready');
  ASSERT NOT (r->>'ok')::boolean AND r->>'message' LIKE '%no CV%', r::text;
  PERFORM t.out();
  r := t.prepare('pro', 'j1');
  ASSERT r->>'code' = 'invalid' AND r->'app'->>'status' = 'preparing', 'prepare restarts from analyzing — refused from preparing, as it should be';
  PERFORM t.as('pro');
  PERFORM public.apply_save(a, jsonb_build_object('name', 'CV', 'content', 'Leyla…', 'meta', jsonb_build_object('lines', '[]'::jsonb)), NULL, NULL, jsonb_build_object('sponsorship', 'Yes'));
  r := public.apply_move(a, 'ready'); ASSERT (r->>'ok')::boolean, r::text;
  -- The page can never submit, nor declare a ready application submitted.
  r := public.apply_move(a, 'submitting'); ASSERT r->>'code' = 'invalid';
  r := public.apply_move(a, 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'site', 'id', 'forged')));
  ASSERT r->>'code' = 'invalid', r::text;
  BEGIN
    PERFORM public.apply_worker_claim('me', 5);
    RAISE EXCEPTION 'a signed-in person claimed applications';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.apply_worker_report(a, 'me', 'submitted', '{}'::jsonb);
    RAISE EXCEPTION 'a signed-in person reported a submission';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM t.out();
  ASSERT (SELECT concepts->>'sponsorship' FROM public.job_applications WHERE id = a) = 'Yes';
  -- Someone else sees nothing.
  PERFORM t.as('other');
  ASSERT (SELECT count(*) FROM public.job_applications) = 0 AND (SELECT count(*) FROM public.application_forms) = 0;
  PERFORM t.out();
END $$;

\echo '5. nothing is sent before the person confirms; confirming needs an email'
DO $$
DECLARE r jsonb;
BEGIN
  r := t.prepare('pro', 'direct', 'email');
  ASSERT (r->>'ok')::boolean, r::text;
  r := t.prepare('pro', 'twinA');
  r := t.prepare('pro', 'j3');
  PERFORM t.as('pro');
  r := public.apply_queue_set(t.queue('pro'), 'awaiting_answers', NULL, jsonb_build_object('ask', jsonb_build_array(jsonb_build_object('key', 'salary_expectation')), 'coverage', jsonb_build_object('pct', 92)));
  ASSERT r->>'state' = 'awaiting_answers' AND r->'plan'->'coverage'->>'pct' = '92', r::text;
  PERFORM t.out();
  ASSERT jsonb_array_length(t.claim('w1', 5)) = 0, 'the worker must not take anything before the person confirms';
  PERFORM t.as('pro');
  BEGIN
    PERFORM public.apply_queue_set(t.queue('pro'), 'running');
    RAISE EXCEPTION 'confirmed without an email';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%email address%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.apply_queue_set(t.queue('pro'), 'running', NULL, NULL, 'not-an-email');
    RAISE EXCEPTION 'confirmed with a broken email';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM t.out();
  r := t.confirm('pro', 'Leyla@Example.com');
  ASSERT r->>'state' = 'running' AND r->>'email' = 'leyla@example.com' AND r->>'confirmedAt' IS NOT NULL, r::text;
  -- The page, refreshed, gets the batch back with its plan and email.
  PERFORM t.as('pro');
  r := public.apply_status();
  ASSERT r->'queue'->>'email' = 'leyla@example.com' AND r->'queue'->'plan'->'coverage'->>'pct' = '92', r::text;
  PERFORM t.out();
END $$;

\echo '6. the worker claims, submits with evidence: held, then used once; into the tracker'
DO $$
DECLARE r jsonb; c jsonb; a uuid;
BEGIN
  INSERT INTO public.app_secrets (name, value) VALUES ('resend_api_key', 're_test'), ('email_from', 'MadeVisa <apply@send.madevisa.com>') ON CONFLICT (name) DO UPDATE SET value = excluded.value;
  c := t.claim('w1', 2);
  ASSERT jsonb_array_length(c) = 2, c::text;
  -- Best rank first: direct (rank 99), j1 (rank 98).
  ASSERT c->0->>'id' = t.app('pro', 'direct')::text AND c->1->>'id' = t.app('pro', 'j1')::text, c::text;
  ASSERT c->0->>'channel' = 'madevisa' AND c->0->'mail'->>'to' = 'jobs@acme.example' AND c->0->'mail'->>'key' = 're_test';
  ASSERT c->1->'mail' = 'null'::jsonb, 'an employer-site application carries no mail key';
  -- The email used is the one in the application's answers; without one, the batch's.
  ASSERT c->0->>'email' = 'pro@example.com' AND c->1->>'email' = 'leyla@example.com', c::text;
  ASSERT c->0->'cv'->>'content' = 'Leyla…' AND jsonb_array_length(c->0->'answers') = 3 AND c->0->'concepts'->>'sponsorship' = 'Yes', c::text;
  ASSERT c->0->'form'->>'platform' = 'email' AND (c->0->>'autoSubmit')::boolean;
  ASSERT t.status('pro', 'direct') = 'submitting' AND t.credit('pro', 'direct') = 'held';
  -- Another worker can't take the same ones.
  -- Another worker takes what is left (twinA, j3) — never the two w1 holds.
  ASSERT jsonb_array_length(t.claim('w2', 1)) = 1;
  a := t.app('pro', 'j1');
  PERFORM t.as('service');
  ASSERT public.apply_worker_progress(a, 'w1', 'filling');
  ASSERT NOT public.apply_worker_progress(a, 'w2', 'filling'), 'progress from a worker that doesn''t hold it';
  ASSERT public.apply_worker_progress(a, 'w1', 'submitting');
  PERFORM t.out();
  ASSERT (SELECT progress = 'submitting' AND submit_clicked_at IS NOT NULL FROM public.job_applications WHERE id = a);
  r := t.report(a, 'w2', 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'site', 'id', 'x')));
  ASSERT r->>'code' = 'not_held', r::text;
  r := t.report(a, 'w1', 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'site', 'id', ''), 'sha256', 'abc123', 'cvPath', 'u/a/cv.docx',
                                                     'evidence', jsonb_build_object('url', 'https://boards.greenhouse.io/beta/jobs/1001/confirmation', 'text', 'Thank you for applying.')));
  ASSERT (r->>'ok')::boolean AND (r->'app'->>'verified')::boolean AND r->'app'->'confirmation'->>'kind' = 'site', r::text;
  ASSERT r->'app'->'evidence'->>'text' = 'Thank you for applying.' AND r->'app'->>'emailUsed' = 'leyla@example.com';
  ASSERT t.credit('pro', 'j1') = 'used';
  ASSERT (SELECT cv_sha256 || '|' || cv_path FROM public.job_applications WHERE id = a) = 'abc123|u/a/cv.docx';
  ASSERT (SELECT result || '|' || worker FROM public.application_attempts WHERE application_id = a) = 'sent|w1';
  ASSERT (SELECT status = 'applied' AND confirmed_at IS NOT NULL FROM public.application_reports WHERE user_id = t.id('pro') AND listing_id = t.id('j1'));
  ASSERT (SELECT stage FROM public.application_outcomes WHERE application_id = a) = 'applied';
  -- Reported twice: nothing changes.
  r := t.report(a, 'w1', 'failed', jsonb_build_object('reason', 'x'));
  ASSERT r->>'code' = 'not_held' AND t.status('pro', 'j1') = 'submitted';
  -- The email channel: a message id is the confirmation.
  r := t.report(t.app('pro', 'direct'), 'w1', 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'email', 'id', 'msg_1')));
  ASSERT (r->'app'->>'verified')::boolean AND r->'app'->'confirmation'->>'id' = 'msg_1';
  -- Two used, one still held by w2.
  ASSERT t.used('pro') = 3, t.used('pro')::text;
END $$;

\echo '7. partial success: one CAPTCHA and one sign-in don''t stop the batch; credits only for what was submitted'
DO $$
DECLARE r jsonb; held jsonb; n int;
BEGIN
  -- w2 holds one of twinA / j3 from step 6.
  held := (SELECT jsonb_agg(id) FROM public.job_applications WHERE locked_by = 'w2');
  r := t.report((held->>0)::uuid, 'w2', 'needs_attention', jsonb_build_object('code', 'captcha', 'reason', 'The employer’s site asked for a human check (CAPTCHA). Open it to finish.'));
  ASSERT (r->>'ok')::boolean AND r->'app'->>'reasonCode' = 'captcha';
  ASSERT (SELECT state FROM public.application_credits WHERE application_id = (held->>0)::uuid) = 'released', 'a held credit is given back';
  ASSERT t.qstate('pro') = 'running', 'one still to go';
  r := t.claim('w1', 5);
  ASSERT jsonb_array_length(r) = 1;
  r := t.report((r->0->>'id')::uuid, 'w1', 'blocked', jsonb_build_object('code', 'login_required', 'reason', 'This employer requires an account login that MadeVisa cannot complete automatically.'));
  ASSERT r->'app'->>'status' = 'blocked';
  ASSERT t.qstate('pro') = 'done', (SELECT string_agg(status, ',') FROM public.job_applications WHERE queue_id = t.queue('pro')) || ' ' || t.qstate('pro');
  ASSERT t.used('pro') = 2 AND t.events('pro', 'application_credit_refunded') = 2, t.used('pro')::text;
  -- Told once: the bell and one email.
  ASSERT (SELECT title FROM public.notifications WHERE user_id = t.id('pro') AND kind = 'auto_apply_done') = '2 applications submitted';
  SELECT count(*) INTO n FROM net.calls WHERE headers->>'Idempotency-Key' LIKE 'madevisa-batch-%';
  ASSERT n = 1, n::text;
  ASSERT (SELECT headers->>'Idempotency-Key' FROM net.calls WHERE headers->>'Idempotency-Key' LIKE 'madevisa-batch-%') = 'madevisa-batch-' || t.queue('pro');
  ASSERT (SELECT body->>'text' FROM net.calls WHERE headers->>'Idempotency-Key' LIKE 'madevisa-batch-%') LIKE '%2 applications were submitted%using leyla@example.com%';
  PERFORM public.apply_queue_settle(t.queue('pro'));
  ASSERT (SELECT count(*) FROM net.calls WHERE headers->>'Idempotency-Key' LIKE 'madevisa-batch-%') = 1, 'never told twice';
  -- And one "You applied" email for each application MadeVisa submitted, to the email it used.
  ASSERT (SELECT count(*) FROM net.calls WHERE headers->>'Idempotency-Key' LIKE 'madevisa-applied-%') = 2;
  ASSERT (SELECT body->>'subject' FROM net.calls WHERE headers->>'Idempotency-Key' = 'madevisa-applied-' || t.app('pro', 'j1')) = 'You applied: Role number 1 at Beta BV';
  ASSERT (SELECT body->'to'->>0 FROM net.calls WHERE headers->>'Idempotency-Key' = 'madevisa-applied-' || t.app('pro', 'j1')) = 'leyla@example.com';
  ASSERT (SELECT body->>'text' FROM net.calls WHERE headers->>'Idempotency-Key' = 'madevisa-applied-' || t.app('pro', 'j1')) LIKE 'Hey there,%You applied for Role number 1 at Beta BV.%';
  ASSERT (SELECT count(*) FROM public.notifications WHERE user_id = t.id('pro') AND kind = 'application_submitted') = 2;
END $$;

\echo '8. needs attention: the person submits it themselves (not verified, no credit) or lets MadeVisa try again'
DO $$
DECLARE r jsonb; a uuid; b uuid;
BEGIN
  SELECT id INTO a FROM public.job_applications WHERE user_id = t.id('pro') AND status = 'needs_attention';
  SELECT id INTO b FROM public.job_applications WHERE user_id = t.id('pro') AND status = 'blocked';
  PERFORM t.as('pro');
  r := public.apply_move(b, 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'site', 'id', 'forged')));
  ASSERT (r->>'ok')::boolean AND NOT (r->'app'->>'verified')::boolean AND r->'app'->'confirmation'->>'kind' = 'self', r::text;
  ASSERT (public.apply_status()->>'used')::int = 2, 'self-submitted uses nothing by default';
  PERFORM t.out();
  ASSERT NOT EXISTS (SELECT 1 FROM net.calls WHERE headers->>'Idempotency-Key' = 'madevisa-applied-' || b), 'no "you applied" email for one the person sent themselves';
  PERFORM t.as('pro');
  -- Try again: back to ready, and the batch runs again.
  r := public.apply_move(a, 'ready'); ASSERT (r->>'ok')::boolean;
  r := public.apply_queue_set(t.queue('pro'), 'running');
  ASSERT r->>'state' = 'running';
  PERFORM t.out();
  ASSERT jsonb_array_length(t.claim('w1', 3)) = 1;
  -- With charge_self_sent, "I submitted it" counts.
  UPDATE public.apply_settings SET charge_self_sent = true;
  r := t.report(a, 'w1', 'needs_attention', jsonb_build_object('code', 'captcha', 'reason', 'CAPTCHA'));
  PERFORM t.as('pro');
  r := public.apply_move(a, 'submitted');
  ASSERT (r->>'ok')::boolean AND (public.apply_status()->>'used')::int = 3, public.apply_status()::text;
  PERFORM t.out();
  UPDATE public.apply_settings SET charge_self_sent = false;
END $$;

\echo '9. a site that doesn''t respond: tried again later, at most three times'
DO $$
DECLARE r jsonb; a uuid; i int;
BEGIN
  PERFORM t.as('pro');
  r := public.apply_enqueue(t.items('j4', 'j5'), NULL);
  PERFORM t.out();
  r := t.prepare('pro', 'j4'); r := t.prepare('pro', 'j5');
  r := t.confirm('pro');
  a := t.app('pro', 'j4');
  r := t.claim('w1', 1);
  ASSERT r->0->>'id' = a::text, r::text;
  r := t.report(a, 'w1', 'ready', jsonb_build_object('code', 'timeout', 'reason', 'The site took too long.', 'retryInSeconds', 120));
  ASSERT t.status('pro', 'j4') = 'ready' AND t.credit('pro', 'j4') = 'released';
  ASSERT (SELECT next_try_at > now() + interval '100 seconds' FROM public.job_applications WHERE id = a);
  r := t.claim('w1', 5);
  ASSERT jsonb_array_length(r) = 1 AND r->0->>'id' = t.app('pro', 'j5')::text, 'one waiting to try again is not taken early';
  r := t.report(t.app('pro', 'j5'), 'w1', 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'site')));
  FOR i IN 2..3 LOOP
    UPDATE public.job_applications SET next_try_at = NULL WHERE id = a;
    r := t.claim('w1', 1);
    r := t.report(a, 'w1', 'ready', jsonb_build_object('code', 'timeout', 'retryInSeconds', 1));
  END LOOP;
  ASSERT t.status('pro', 'j4') = 'failed', t.status('pro', 'j4');
  ASSERT (SELECT reason_code FROM public.job_applications WHERE id = a) = 'timeout';
  ASSERT (SELECT count(*) FROM public.application_attempts WHERE application_id = a) = 3;
  ASSERT t.credit('pro', 'j4') = 'released' AND t.qstate('pro') = 'done';
END $$;

\echo '10. a worker that disappears: never sent twice'
DO $$
DECLARE r jsonb; a uuid; b uuid; n int;
BEGIN
  PERFORM t.as('pro');
  r := public.apply_enqueue(t.items('j6', 'j7'), NULL);
  PERFORM t.out();
  r := t.prepare('pro', 'j6'); r := t.prepare('pro', 'j7');
  r := t.confirm('pro');
  r := t.claim('w9', 2);
  a := t.app('pro', 'j6'); b := t.app('pro', 'j7');
  PERFORM t.as('service'); PERFORM public.apply_worker_progress(b, 'w9', 'submitting'); PERFORM t.out();
  UPDATE public.job_applications SET locked_at = now() - interval '20 minutes' WHERE id IN (a, b);
  PERFORM t.as('service'); n := public.apply_worker_reap(15); PERFORM t.out();
  ASSERT n = 2;
  ASSERT t.status('pro', 'j6') = 'ready' AND t.credit('pro', 'j6') = 'released', 'not pressed: tried again';
  ASSERT t.status('pro', 'j7') = 'needs_attention' AND (SELECT reason_code FROM public.job_applications WHERE id = b) = 'unconfirmed', 'pressed, no result: the person checks';
  ASSERT (SELECT result FROM public.application_attempts WHERE application_id = a) = 'interrupted';
END $$;

\echo '11. the monthly allowance pauses a batch before submitting; a grant tops it up'
DO $$
DECLARE r jsonb; g int;
BEGIN
  PERFORM t.as('free');
  r := public.apply_enqueue(t.items('j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'), NULL);
  PERFORM t.out();
  FOR g IN 1..7 LOOP r := t.prepare('free', 'j' || g); END LOOP;
  r := t.confirm('free');
  -- Other people's batches are older and come first; take them all.
  FOR g IN 1..10 LOOP
    r := t.claim('w1', 3);
    EXIT WHEN jsonb_array_length(r) = 0;
    FOR i IN 0..jsonb_array_length(r) - 1 LOOP
      PERFORM t.report((r->i->>'id')::uuid, 'w1', 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'site')));
    END LOOP;
  END LOOP;
  ASSERT t.used('free') = 5, t.used('free')::text;
  ASSERT t.qstate('free') = 'paused' AND (SELECT pause_reason FROM public.application_queues WHERE id = t.queue('free')) = 'allowance';
  ASSERT (SELECT count(*) FROM public.job_applications WHERE queue_id = t.queue('free') AND status = 'ready') = 2;
  ASSERT NOT EXISTS (SELECT 1 FROM public.application_credits c JOIN public.job_applications a ON a.id = c.application_id WHERE a.queue_id = t.queue('free') AND a.status = 'ready' AND c.state <> 'released');
  -- An admin gives 2 more this month; the person continues.
  PERFORM t.as('free');
  BEGIN
    PERFORM public.apply_grant(t.id('free'), 100);
    RAISE EXCEPTION 'a person granted themselves applications';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM t.out();
  PERFORM t.as('admin'); r := public.apply_grant(t.id('free'), 2, 'Goodwill'); PERFORM t.out();
  ASSERT (r->>'limit')::int = 7, r::text;
  PERFORM t.as('free'); r := public.apply_queue_set(t.queue('free'), 'running'); PERFORM t.out();
  r := t.claim('w1', 5);
  ASSERT jsonb_array_length(r) = 2, r::text;
END $$;

\echo '12. the daily limit holds the rest until tomorrow, without stopping the batch'
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM t.reset_day();
  PERFORM t.as('other');
  INSERT INTO public.application_preferences (prefs) VALUES (jsonb_build_object('maxPerDay', 2));
  r := public.apply_enqueue(t.items('j8', 'j9', 'j10'), NULL);
  PERFORM t.out();
  r := t.prepare('other', 'j8'); r := t.prepare('other', 'j9'); r := t.prepare('other', 'j10');
  r := t.confirm('other');
  -- Clear what other batches still have waiting.
  UPDATE public.application_queues SET state = 'paused' WHERE user_id <> t.id('other') AND state = 'running';
  r := t.claim('w1', 5);
  ASSERT jsonb_array_length(r) = 2, r::text;
  ASSERT t.qstate('other') = 'running';
  ASSERT (SELECT next_try_at > now() FROM public.job_applications WHERE id = t.app('other', 'j10'));
  ASSERT t.credit('other', 'j10') IS NULL;
END $$;

\echo '13. pause stops the worker taking more; stop skips what wasn''t submitted'
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM t.as('pro');
  r := public.apply_enqueue(t.items('j8', 'j9', 'j10', 'j11'), NULL);
  PERFORM t.out();
  r := t.prepare('pro', 'j8'); r := t.prepare('pro', 'j9');
  r := t.confirm('pro');
  PERFORM t.as('pro'); r := public.apply_queue_set(t.queue('pro'), 'paused'); PERFORM t.out();
  ASSERT r->>'state' = 'paused' AND r->>'reason' = 'you';
  ASSERT jsonb_array_length(t.claim('w1', 5)) = 0;
  PERFORM t.as('pro'); r := public.apply_queue_set(t.queue('pro'), 'stopped'); PERFORM t.out();
  ASSERT t.status('pro', 'j8') = 'skipped' AND t.status('pro', 'j10') = 'skipped' AND (SELECT reason_code FROM public.job_applications WHERE id = t.app('pro', 'j8')) = 'stopped';
  -- A stopped job can join a later batch.
  PERFORM t.as('pro'); r := public.apply_enqueue(t.items('j8'), NULL); PERFORM t.out();
  ASSERT t.status('pro', 'j8') = 'queued' AND (SELECT queue_id FROM public.job_applications WHERE id = t.app('pro', 'j8')) = t.queue('pro');
END $$;

\echo '14. dry-run mode is passed to the worker'
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM t.as('admin'); r := public.apply_configure(p_auto_submit => false); PERFORM t.out();
  ASSERT NOT (r->>'auto_submit')::boolean;
  UPDATE public.application_queues SET state = 'paused' WHERE state = 'running';
  r := t.prepare('pro', 'j8'); r := t.confirm('pro');
  r := t.claim('w1', 1);
  ASSERT NOT (r->0->>'autoSubmit')::boolean, r::text;
  PERFORM t.as('admin'); r := public.apply_configure(p_auto_submit => true); PERFORM t.out();
  BEGIN
    PERFORM t.as('free');
    PERFORM public.apply_configure(p_charge_self_sent => true);
    RAISE EXCEPTION 'a non-admin changed billing';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM t.out();
  END;
END $$;

\echo '15. outcomes and learning still work on submitted applications'
DO $$
DECLARE r jsonb; a uuid := t.app('pro', 'j1');
BEGIN
  PERFORM t.as('pro');
  r := public.apply_outcome(a, 'interview');
  ASSERT jsonb_array_length(r) = 2;
  PERFORM t.out();
  PERFORM t.as('admin');
  r := public.apply_funnel(30);
  ASSERT (r->'steps'->'application_submitted'->>'people')::int >= 2, r::text;
  PERFORM t.out();
END $$;

\echo '16. verified can never be set without a confirmation; nobody writes directly'
DO $$
BEGIN
  BEGIN
    UPDATE public.job_applications SET verified = true WHERE id = t.app('pro', 'twinA') AND status <> 'submitted';
    IF FOUND THEN RAISE EXCEPTION 'verified was set on an unsubmitted application'; END IF;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM t.as('free');
  BEGIN
    UPDATE public.job_applications SET status = 'submitted', verified = true;
    RAISE EXCEPTION 'a person wrote to job_applications directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.application_forms (application_id, user_id, status) VALUES (t.app('free', 'j1'), t.id('free'), 'ok');
    RAISE EXCEPTION 'a person wrote to application_forms directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM public.apply_workers;
    RAISE EXCEPTION 'a person read the workers';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM t.out();
END $$;

\echo '17. auto-apply with Pro: who is due, new jobs, and acting for the person with the same rules'
DO $$
DECLARE r jsonb; d jsonb; q jsonb; a uuid;
BEGIN
  UPDATE public.apply_settings SET daily_max = 40;
  -- Only Pro members with it switched on and a CV.
  INSERT INTO public.user_cvs (user_id, file_name, text) VALUES (t.id('pro'), 'cv.pdf', 'Leyla CV'), (t.id('free'), 'cv.pdf', 'CV');
  INSERT INTO public.application_preferences (user_id, prefs) VALUES (t.id('pro'), '{"autoNew": true, "autoConsent": true, "minScore": 80}')
  ON CONFLICT (user_id) DO UPDATE SET prefs = application_preferences.prefs || excluded.prefs;
  INSERT INTO public.application_preferences (user_id, prefs) VALUES (t.id('free'), '{"autoNew": true}') ON CONFLICT (user_id) DO UPDATE SET prefs = excluded.prefs;
  UPDATE public.application_queues SET state = 'stopped' WHERE user_id = t.id('pro') AND state IN ('analyzing', 'awaiting_answers');
  PERFORM t.as('service'); d := public.apply_auto_due(10); PERFORM t.out();
  ASSERT jsonb_array_length(d) = 1 AND d->0->>'userId' = t.id('pro')::text, d::text || (SELECT jsonb_build_object('prefs', (SELECT prefs FROM application_preferences WHERE user_id = t.id('pro')), 'cv', (SELECT count(*) FROM user_cvs WHERE user_id = t.id('pro')), 'pro', public.is_pro(t.id('pro')), 'used', public.apply_used(t.id('pro')), 'lim', public.apply_limit(t.id('pro')), 'enabled', (SELECT enabled FROM apply_settings))::text);
  ASSERT (d->0->'prefs'->>'autoConsent')::boolean;
  -- New jobs: published, not applied to.
  PERFORM t.as('service'); r := public.apply_auto_jobs(t.id('pro'), now() - interval '1 day'); PERFORM t.out();
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r) x WHERE (x->>'id')::uuid IN (SELECT job_id FROM public.job_applications WHERE user_id = t.id('pro'))), 'a job applied to before came back';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r) x WHERE (x->>'id')::uuid = t.id('j12')), r::text;
  -- The worker queues and prepares for the person: the batch runs straight away, with the email given.
  PERFORM t.as('service');
  q := public.apply_auto_enqueue(t.id('pro'), t.items('j12'), 'pro-auto@example.com', '{"consent": "Yes"}');
  a := (q->'applications'->0->>'id')::uuid;
  ASSERT q->'queue'->>'state' = 'running' AND q->'queue'->>'email' = 'pro-auto@example.com' AND (q->'queue'->'plan'->>'auto')::boolean, q::text;
  r := public.apply_auto_move(t.id('pro'), a, 'analyzing'); ASSERT (r->>'ok')::boolean, r::text;
  r := public.apply_auto_move(t.id('pro'), a, 'preparing'); ASSERT (r->>'ok')::boolean, r::text;
  PERFORM public.apply_auto_save(t.id('pro'), a, jsonb_build_object('name', 'CV', 'content', 'Leyla…', 'meta', '{}'::jsonb), NULL, NULL, '{"consent": "Yes"}');
  r := public.apply_auto_move(t.id('pro'), a, 'ready'); ASSERT (r->>'ok')::boolean, r::text;
  -- The same rules as the page: it can't call it submitted.
  r := public.apply_auto_move(t.id('pro'), a, 'submitted');
  ASSERT r->>'code' = 'invalid', r::text;
  PERFORM public.apply_auto_mark(t.id('pro'), now(), 1);
  d := public.apply_auto_due(10);
  PERFORM t.out();
  ASSERT jsonb_array_length(d) = 0, 'checked just now: not due again';
  ASSERT (SELECT applied FROM public.apply_auto_state WHERE user_id = t.id('pro')) = 1;
  -- Nobody but the worker.
  PERFORM t.as('pro');
  BEGIN
    PERFORM public.apply_auto_enqueue(t.id('free'), t.items('j11'), 'x@example.com');
    RAISE EXCEPTION 'a person queued applications for someone else';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT (public.apply_auto_status()->>'on')::boolean;
  PERFORM t.out();
END $$;

-- 18. "Apply now": a ready application in a stopped batch, waiting for a retry, goes straight away.
DO $$
DECLARE a uuid; q uuid; r jsonb;
BEGIN
  SELECT id, queue_id INTO a, q FROM public.job_applications WHERE user_id = t.id('pro') AND status = 'ready' LIMIT 1;
  ASSERT a IS NOT NULL, 'a ready application to send';
  UPDATE public.job_applications SET next_try_at = now() + interval '1 hour' WHERE id = a;
  UPDATE public.application_queues SET state = 'stopped', finished_at = now() WHERE id = q;
  PERFORM t.as('free');
  r := public.apply_send_now(ARRAY[a]);
  PERFORM t.out();
  ASSERT coalesce((r->>'ready')::int, 0) = 0, 'someone else''s application was touched: ' || r::text;
  ASSERT (SELECT state FROM public.application_queues WHERE id = q) = 'stopped';
  PERFORM t.as('pro');
  r := public.apply_send_now(ARRAY[a]);
  PERFORM t.out();
  ASSERT (r->>'ok')::boolean AND (r->>'ready')::int = 1, r::text;
  ASSERT (SELECT next_try_at FROM public.job_applications WHERE id = a) IS NULL;
  ASSERT (SELECT state FROM public.application_queues WHERE id = q) = 'running';
END $$;

\echo 'ALL AUTO APPLY DATABASE TESTS PASSED'
ROLLBACK;
