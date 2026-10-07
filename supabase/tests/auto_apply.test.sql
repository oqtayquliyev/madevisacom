-- Tests for migration 20261204090000_auto_apply.sql.
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

\echo '2. allowance comes with the plan; nothing is used yet'
DO $$
DECLARE s jsonb;
BEGIN
  PERFORM t.as('free'); s := public.apply_status(); PERFORM t.out();
  ASSERT (s->>'monthly')::int = 5 AND (s->>'left')::int = 5 AND NOT (s->>'pro')::boolean, s::text;
  PERFORM t.as('pro'); s := public.apply_status(); PERFORM t.out();
  ASSERT (s->>'monthly')::int = 150 AND (s->>'pro')::boolean, s::text;
  ASSERT (public.apply_status()->>'signedIn')::boolean = false;
END $$;

\echo '3. preview: channel, closed, and nothing applied yet'
DO $$
DECLARE p jsonb;
BEGIN
  PERFORM t.as('pro');
  p := public.apply_preview(ARRAY[t.id('direct'), t.id('closed'), t.id('j1')]);
  PERFORM t.out();
  ASSERT jsonb_array_length(p) = 3;
  ASSERT (SELECT x->>'channel' FROM jsonb_array_elements(p) x WHERE x->>'id' = t.id('direct')::text) = 'madevisa';
  ASSERT (SELECT x->>'channel' FROM jsonb_array_elements(p) x WHERE x->>'id' = t.id('j1')::text) = 'employer_site';
  ASSERT (SELECT (x->>'closed')::boolean FROM jsonb_array_elements(p) x WHERE x->>'id' = t.id('closed')::text);
  ASSERT (SELECT x->>'url' FROM jsonb_array_elements(p) x WHERE x->>'id' = t.id('j1')::text) = 'https://boards.greenhouse.io/beta/jobs/1001';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p) x WHERE (x->>'applied')::boolean OR (x->>'twin')::boolean);
END $$;

\echo '4. duplicate protection when a batch is queued'
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM t.as('pro');
  -- Applied to j2 by hand before (the existing tracker).
  INSERT INTO public.application_reports (publisher_id, listing_kind, listing_id, listing_title) VALUES (t.id('beta'), 'job', t.id('j2'), 'Role number 2');
  UPDATE public.application_reports SET status = 'applied' WHERE listing_id = t.id('j2');
  r := public.apply_enqueue(t.items('direct', 'j1', 'j2', 'closed', 'twinA', 'twinB'), '2026-10-07T12:00:00Z');
  PERFORM t.out();
  ASSERT r->'queue'->>'state' = 'running';
  ASSERT t.status('pro', 'direct') = 'queued' AND t.status('pro', 'j1') = 'queued';
  ASSERT t.status('pro', 'j2') = 'already_applied', 'a job applied to in the tracker must not be queued';
  ASSERT t.status('pro', 'closed') = 'expired';
  ASSERT t.status('pro', 'twinA') = 'queued' AND t.status('pro', 'twinB') = 'already_applied', 'the same role at the same company is one application';
  ASSERT (SELECT reason FROM public.job_applications WHERE id = t.app('pro', 'twinB')) = 'This role at Acme GmbH is already in your applications.';
  ASSERT (SELECT channel FROM public.job_applications WHERE id = t.app('pro', 'direct')) = 'madevisa';
  -- The job's own facts come from the database, not the page.
  ASSERT (SELECT company || '|' || cc FROM public.job_applications WHERE id = t.app('pro', 'j1')) = 'Beta BV|DE';

  -- The same batch again adds nothing.
  PERFORM t.as('pro');
  r := public.apply_enqueue(t.items('direct', 'j1'), NULL);
  PERFORM t.out();
  ASSERT (SELECT count(*) FROM public.job_applications WHERE user_id = t.id('pro')) = 6;
  ASSERT (SELECT count(*) FROM public.application_queues WHERE user_id = t.id('pro')) = 1, 'an unfinished batch is carried on with, not doubled';
  ASSERT t.events('pro', 'application_duplicate') >= 4;
  ASSERT t.events('pro', 'application_queued') = 3;

  -- And the preview now says so.
  PERFORM t.as('pro');
  r := public.apply_preview(ARRAY[t.id('j1'), t.id('j2'), t.id('twinB'), t.id('j3')]);
  PERFORM t.out();
  ASSERT (SELECT (x->>'applied')::boolean FROM jsonb_array_elements(r) x WHERE x->>'id' = t.id('j1')::text);
  ASSERT (SELECT (x->>'applied')::boolean FROM jsonb_array_elements(r) x WHERE x->>'id' = t.id('j2')::text);
  ASSERT (SELECT (x->>'twin')::boolean FROM jsonb_array_elements(r) x WHERE x->>'id' = t.id('twinB')::text);
  ASSERT (SELECT NOT (x->>'applied')::boolean AND NOT (x->>'twin')::boolean FROM jsonb_array_elements(r) x WHERE x->>'id' = t.id('j3')::text);
END $$;

\echo '5. state transitions are enforced'
DO $$
DECLARE r jsonb; a uuid := t.app('pro', 'direct');
BEGIN
  PERFORM t.as('pro');
  r := public.apply_move(a, 'submitted');
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'invalid', 'queued → submitted must be refused';
  r := public.apply_move(a, 'submitting');
  ASSERT r->>'code' = 'invalid';
  r := public.apply_move(a, 'preparing');
  ASSERT (r->>'ok')::boolean AND r->'app'->>'status' = 'preparing';
  -- Repeating a call is harmless.
  r := public.apply_move(a, 'preparing');
  ASSERT (r->>'ok')::boolean;
  -- Someone else's application can't be touched.
  PERFORM t.out(); PERFORM t.as('other');
  r := public.apply_move(a, 'skipped');
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'error';
  ASSERT (SELECT count(*) FROM public.job_applications) = 0, 'row security: another person sees none of these';
  PERFORM t.out();
  -- Every pair agrees with the table in src/lib/apply/machine.ts.
  ASSERT (SELECT count(*) FROM unnest(ARRAY['queued','preparing','needs_answer','submitting','submitted','failed','skipped','already_applied','expired','review_required']) f,
                              unnest(ARRAY['queued','preparing','needs_answer','submitting','submitted','failed','skipped','already_applied','expired','review_required']) g
          WHERE public.apply_can_move(f, g)) = 4 + 8 + 3 + 3 + 4 + 2 + 1;
  ASSERT NOT public.apply_can_move('submitted', 'queued') AND NOT public.apply_can_move('needs_answer', 'submitting');
END $$;

\echo '6. a sent application: held, then used once; verified only from the sending function'
DO $$
DECLARE r jsonb; a uuid := t.app('pro', 'direct'); ctx jsonb;
BEGIN
  PERFORM t.as('pro');
  PERFORM public.apply_save(a, jsonb_build_object('name', 'Leyla Data Analyst CV', 'content', 'Leyla…', 'meta', jsonb_build_object('changes', jsonb_build_array('Moved 3 skills'))),
                            jsonb_build_object('name', 'Cover letter', 'content', 'Dear Acme…'),
                            jsonb_build_array(jsonb_build_object('id', 'basic:email', 'label', 'Email', 'value', 'pro@example.com', 'source', 'account', 'key', 'email')));
  r := public.apply_move(a, 'submitting', jsonb_build_object('cvName', 'Leyla Data Analyst CV', 'coverLetter', true));
  ASSERT (r->>'ok')::boolean, r::text;
  ASSERT (public.apply_status()->>'used')::int = 1, 'one is held while sending';
  -- The page itself cannot declare it submitted.
  r := public.apply_move(a, 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'email', 'id', 'forged')));
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'invalid', 'the page marked a sending application as submitted';
  -- Nor call the sending function's entry points.
  BEGIN
    PERFORM public.apply_finish(a, t.id('pro'), 'submitted', '{}'::jsonb);
    RAISE EXCEPTION 'apply_finish was callable by a signed-in person';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.apply_send_context(a, t.id('pro'));
    RAISE EXCEPTION 'apply_send_context was callable by a signed-in person';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM t.out();

  PERFORM t.as('service');
  ctx := public.apply_send_context(a, t.id('pro'));
  ASSERT ctx->>'to' = 'jobs@acme.example' AND ctx->>'status' = 'submitting' AND (ctx->>'open')::boolean AND ctx->>'candidateEmail' = 'pro@example.com', ctx::text;
  ASSERT ctx->'sentBefore' = 'null'::jsonb;
  r := public.apply_finish(a, t.id('pro'), 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'email', 'id', 'msg_123'), 'sha256', 'abc'));
  ASSERT (r->>'ok')::boolean AND (r->'app'->>'verified')::boolean AND r->'app'->'confirmation'->>'id' = 'msg_123', r::text;
  -- Finishing twice changes nothing.
  r := public.apply_finish(a, t.id('pro'), 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'email', 'id', 'msg_456')));
  ASSERT r->'app'->'confirmation'->>'id' = 'msg_123';
  ASSERT (public.apply_send_context(a, t.id('pro'))->'sentBefore'->>'id') = 'msg_123';
  PERFORM t.out();

  ASSERT t.used('pro') = 1 AND t.events('pro', 'application_credit_used') = 1 AND t.events('pro', 'application_submitted') = 1;
  ASSERT (SELECT state FROM public.application_credits WHERE application_id = a) = 'used';
  ASSERT (SELECT result || '|' || (detail->>'sha256') FROM public.application_attempts WHERE application_id = a) = 'sent|abc';
  -- It is in the existing application tracker, confirmed.
  ASSERT (SELECT status = 'applied' AND confirmed_at IS NOT NULL FROM public.application_reports WHERE user_id = t.id('pro') AND listing_id = t.id('direct'));
  ASSERT (SELECT stage FROM public.application_outcomes WHERE application_id = a) = 'applied';
  -- What was sent is frozen.
  PERFORM t.as('pro');
  BEGIN
    PERFORM public.apply_save(a, jsonb_build_object('name', 'x', 'content', 'changed'));
    RAISE EXCEPTION 'a sent application''s documents were changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%can’t be changed%' THEN RAISE; END IF;
  END;
  ASSERT (SELECT content FROM public.application_documents WHERE application_id = a AND kind = 'cv') = 'Leyla…';
  ASSERT (SELECT value FROM public.application_answers WHERE application_id = a) = 'pro@example.com';
  r := public.apply_move(a, 'queued');
  ASSERT NOT (r->>'ok')::boolean, 'submitted is final';
  PERFORM t.out();
END $$;

\echo '7. a failed send gives the allowance back; a retry is counted once'
DO $$
DECLARE r jsonb; a uuid;
BEGIN
  PERFORM t.as('admin'); PERFORM public.apply_set_job_channel(t.id('j1'), true, 'jobs@beta.example'); PERFORM t.out();
  UPDATE public.job_applications SET channel = 'madevisa' WHERE id = t.app('pro', 'j1');
  a := t.app('pro', 'j1');
  PERFORM t.as('pro');
  r := public.apply_move(a, 'preparing'); r := public.apply_move(a, 'submitting');
  ASSERT (public.apply_status()->>'used')::int = 2;
  r := public.apply_move(a, 'failed', jsonb_build_object('reason', 'The employer’s mailbox refused the message.', 'code', 'bounced'));
  ASSERT (r->>'ok')::boolean AND r->'app'->>'reason' = 'The employer’s mailbox refused the message.' AND NOT (r->'app'->>'verified')::boolean;
  ASSERT (public.apply_status()->>'used')::int = 1, 'the held one must come back';
  r := public.apply_move(a, 'queued'); r := public.apply_move(a, 'preparing'); r := public.apply_move(a, 'submitting');
  PERFORM t.out();
  PERFORM t.as('service');
  r := public.apply_finish(a, t.id('pro'), 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'email', 'id', 'msg_retry')));
  PERFORM t.out();
  ASSERT t.used('pro') = 2;
  ASSERT t.events('pro', 'application_credit_refunded') = 1 AND t.events('pro', 'application_failed') = 1 AND t.events('pro', 'application_credit_used') = 2;
  ASSERT (SELECT count(*) FROM public.application_credits WHERE application_id = a) = 1, 'one entry per application';
  ASSERT (SELECT count(*) FROM public.application_attempts WHERE application_id = a) = 2;
END $$;

\echo '8. the employer''s own site: never "submitting"; submitted only when the person says so — and never verified'
DO $$
DECLARE r jsonb; a uuid := t.app('pro', 'twinA');
BEGIN
  PERFORM t.as('pro');
  r := public.apply_move(a, 'preparing');
  r := public.apply_move(a, 'submitting');
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'invalid';
  r := public.apply_move(a, 'review_required', jsonb_build_object('reason', 'Ready to send on the employer’s site.', 'code', 'employer_site', 'cvName', 'CV'));
  ASSERT (r->>'ok')::boolean;
  ASSERT (public.apply_status()->>'used')::int = 3, 'a prepared application handed over ready to send counts once';
  r := public.apply_move(a, 'submitted', jsonb_build_object('confirmation', jsonb_build_object('kind', 'email', 'id', 'forged')));
  ASSERT (r->>'ok')::boolean AND NOT (r->'app'->>'verified')::boolean AND r->'app'->'confirmation'->>'kind' = 'self', r::text;
  ASSERT (public.apply_status()->>'used')::int = 3, 'saying it was sent must not count it again';
  PERFORM t.out();
  ASSERT t.events('pro', 'application_requires_review') = 1;
  -- The batch has nothing left to work on.
  ASSERT (SELECT state FROM public.application_queues WHERE user_id = t.id('pro')) = 'done';
  ASSERT t.events('pro', 'auto_apply_completed') = 1;
END $$;

\echo '9. a question only the person can answer; pause, resume and stop'
DO $$
DECLARE r jsonb; q uuid; a uuid; b uuid;
BEGIN
  PERFORM t.as('pro');
  r := public.apply_enqueue(t.items('j3', 'j4', 'j5'), NULL);
  q := (r->'queue'->>'id')::uuid;
  a := t.app('pro', 'j3'); b := t.app('pro', 'j4');
  ASSERT (SELECT count(*) FROM public.application_queues WHERE user_id = t.id('pro')) = 2, 'a finished batch is not reopened';
  r := public.apply_move(a, 'preparing');
  r := public.apply_move(a, 'needs_answer', jsonb_build_object('needs', jsonb_build_array(jsonb_build_object('id', 'q1', 'label', 'Why us?')), 'reason', 'The employer asked a question that MadeVisa cannot safely answer automatically.', 'code', 'question'));
  ASSERT r->'app'->'needs'->0->>'label' = 'Why us?';
  r := public.apply_move(a, 'review_required');
  ASSERT NOT (r->>'ok')::boolean, 'an unanswered application cannot go on';
  -- Pause while the next one is being prepared: it goes back in the queue.
  r := public.apply_move(b, 'preparing');
  r := public.apply_queue_set(q, 'paused');
  ASSERT r->>'state' = 'paused' AND r->>'reason' = 'you';
  PERFORM t.out();
  ASSERT t.status('pro', 'j4') = 'queued' AND t.status('pro', 'j3') = 'needs_answer' AND t.status('pro', 'j5') = 'queued';
  PERFORM t.as('pro');
  r := public.apply_queue_set(q, 'running');
  ASSERT r->>'state' = 'running' AND r->>'reason' IS NULL;
  -- Answered: back in the queue with nothing asked.
  r := public.apply_move(a, 'queued');
  ASSERT r->'app'->'needs' = '[]'::jsonb AND r->'app'->>'reason' IS NULL;
  r := public.apply_queue_set(q, 'stopped');
  PERFORM t.out();
  ASSERT (SELECT state FROM public.application_queues WHERE id = q) = 'stopped';
  ASSERT (SELECT count(*) FROM public.job_applications WHERE queue_id = q AND status = 'queued') = 3, 'stopping loses nothing';
  ASSERT t.events('pro', 'auto_apply_paused') = 1 AND t.events('pro', 'auto_apply_resumed') = 1 AND t.events('pro', 'auto_apply_stopped') = 1;
  ASSERT t.used('pro') = 3;
END $$;

\echo '10. the monthly allowance stops a free account at 5, before sending'
DO $$
DECLARE r jsonb; g int; a uuid;
BEGIN
  PERFORM t.as('free');
  r := public.apply_enqueue(t.items('j1', 'j2', 'j3', 'j4', 'j5', 'j6'), NULL);
  FOR g IN 1..5 LOOP
    a := t.app('free', 'j' || g);
    r := public.apply_move(a, 'preparing');
    r := public.apply_move(a, 'review_required', jsonb_build_object('code', 'employer_site'));
    r := public.apply_move(a, 'submitted');
    ASSERT (r->>'ok')::boolean, r::text;
  END LOOP;
  ASSERT (public.apply_status()->>'left')::int = 0;
  a := t.app('free', 'j6');
  r := public.apply_move(a, 'preparing');
  r := public.apply_move(a, 'review_required', jsonb_build_object('code', 'employer_site'));
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'allowance', r::text;
  PERFORM t.out();
  ASSERT t.status('free', 'j6') = 'preparing' AND t.used('free') = 5;
  -- Skipping one that was never finished uses nothing; nor does one that is waiting for an answer.
  ASSERT NOT EXISTS (SELECT 1 FROM public.application_credits WHERE application_id = a);
  -- With Pro the same application goes through.
  INSERT INTO public.subscriptions (user_id, plan, status) VALUES (t.id('free'), 'pro', 'active');
  PERFORM t.as('free');
  r := public.apply_move(a, 'review_required', jsonb_build_object('code', 'employer_site'));
  ASSERT (r->>'ok')::boolean;
  r := public.apply_move(a, 'submitted');
  ASSERT (r->>'ok')::boolean;
  ASSERT (public.apply_status()->>'used')::int = 6;
  PERFORM t.out();
  DELETE FROM public.subscriptions WHERE user_id = t.id('free');
  -- A sending channel checks before it sends.
  UPDATE public.job_applications SET channel = 'madevisa', status = 'preparing' WHERE id = t.app('pro', 'j5');
  UPDATE public.apply_settings SET pro_monthly = 3;
  PERFORM t.as('pro');
  r := public.apply_move(t.app('pro', 'j5'), 'submitting');
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'allowance', r::text;
  PERFORM t.out();
  ASSERT t.status('pro', 'j5') = 'preparing' AND NOT EXISTS (SELECT 1 FROM public.application_credits WHERE application_id = t.app('pro', 'j5'));
  UPDATE public.apply_settings SET pro_monthly = 150;
  UPDATE public.job_applications SET channel = 'employer_site', status = 'queued' WHERE id = t.app('pro', 'j5');
END $$;

\echo '11. a new month starts a new allowance'
DO $$
BEGIN
  UPDATE public.application_credits SET period = '2026-01' WHERE user_id = t.id('free');
  ASSERT t.used('free') = 0;
END $$;

\echo '12. the daily limit pauses the day''s work, not the batch'
DO $$
DECLARE r jsonb; g int;
BEGIN
  PERFORM t.as('pro');
  INSERT INTO public.application_preferences (prefs) VALUES (jsonb_build_object('maxPerDay', 7));
  ASSERT (public.apply_status()->>'daily')::int = 7;
  r := public.apply_enqueue(t.items('j6', 'j7', 'j8', 'j9', 'j10'), NULL);
  -- 3 started earlier today (direct, j1, twinA) + j3 and j4 = 5; two more are allowed.
  ASSERT (public.apply_status()->>'today')::int = 5, public.apply_status()::text;
  r := public.apply_move(t.app('pro', 'j6'), 'preparing'); ASSERT (r->>'ok')::boolean;
  r := public.apply_move(t.app('pro', 'j7'), 'preparing'); ASSERT (r->>'ok')::boolean;
  r := public.apply_move(t.app('pro', 'j8'), 'preparing');
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'daily_limit', r::text;
  -- One already started today can be picked up again.
  r := public.apply_move(t.app('pro', 'j6'), 'queued'); r := public.apply_move(t.app('pro', 'j6'), 'preparing');
  ASSERT (r->>'ok')::boolean;
  PERFORM t.out();
  ASSERT t.status('pro', 'j8') = 'queued';
  -- Tomorrow it goes on.
  UPDATE public.job_applications SET day_started = day_started - 1 WHERE user_id = t.id('pro');
  PERFORM t.as('pro');
  r := public.apply_move(t.app('pro', 'j8'), 'preparing');
  ASSERT (r->>'ok')::boolean;
  -- The person's own number can never exceed the site's.
  UPDATE public.application_preferences SET prefs = jsonb_build_object('maxPerDay', 500);
  ASSERT (public.apply_status()->>'daily')::int = 30;
  PERFORM t.out();
END $$;

\echo '13. a job that closes, or is applied to elsewhere, after it was queued'
DO $$
DECLARE r jsonb;
BEGIN
  UPDATE public.sponsored_jobs SET status = 'expired' WHERE id = t.id('j9');
  PERFORM t.as('pro');
  INSERT INTO public.application_reports (publisher_id, listing_kind, listing_id, listing_title) VALUES (t.id('beta'), 'job', t.id('j10'), 'Role number 10');
  UPDATE public.application_reports SET status = 'applied' WHERE listing_id = t.id('j10');
  r := public.apply_move(t.app('pro', 'j9'), 'preparing');
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'expired' AND r->'app'->>'status' = 'expired', r::text;
  r := public.apply_move(t.app('pro', 'j10'), 'preparing');
  ASSERT NOT (r->>'ok')::boolean AND r->>'code' = 'duplicate' AND r->'app'->>'status' = 'already_applied', r::text;
  PERFORM t.out();
END $$;

\echo '14. outcomes: from the person, and from the existing tracker'
DO $$
DECLARE r jsonb; a uuid := t.app('pro', 'direct');
BEGIN
  PERFORM t.as('pro');
  r := public.apply_outcome(a, 'assessment');
  ASSERT jsonb_array_length(r) = 2;
  BEGIN
    PERFORM public.apply_outcome(t.app('pro', 'j8'), 'interview');
    RAISE EXCEPTION 'an outcome was recorded for an application that was not submitted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%Only a submitted%' THEN RAISE; END IF;
  END;
  UPDATE public.application_reports SET status = 'interview' WHERE listing_id = t.id('direct');
  PERFORM t.out();
  ASSERT (SELECT array_agg(stage ORDER BY stage) FROM public.application_outcomes WHERE application_id = a) = ARRAY['applied', 'assessment', 'interview', 'response'];
  ASSERT (SELECT source FROM public.application_outcomes WHERE application_id = a AND stage = 'interview') = 'tracker';
  ASSERT t.events('pro', 'application_outcome_updated') = 2;
END $$;

\echo '15. learning says nothing until there is enough to say'
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM t.as('pro');
  BEGIN
    PERFORM public.apply_learning();
    RAISE EXCEPTION 'apply_learning was open to everyone';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM t.out();
  PERFORM t.as('admin');
  r := public.apply_learning();
  ASSERT r->>'enough' = 'false' AND (r->>'needed')::int = 30, r::text;
  r := public.apply_funnel(30);
  ASSERT (r->'steps'->'application_submitted'->>'events')::int >= 9 AND (r->'steps'->'application_submitted'->>'people')::int >= 2, r::text;
  PERFORM t.out();
  -- With enough old applications the rates appear, and small groups are left out.
  INSERT INTO t.ids SELECT 'old' || g, gen_random_uuid() FROM generate_series(1, 40) g;
  INSERT INTO public.job_applications (id, user_id, job_id, title, company, score, status, submitted_at, cc, cover_letter, confirmation)
  SELECT t.id('old' || g), t.id('other'), gen_random_uuid(), 'Old ' || g, 'Co', CASE WHEN g <= 25 THEN 88 ELSE 70 END, 'submitted', now() - interval '30 days', CASE WHEN g <= 34 THEN 'DE' ELSE 'NL' END, g % 2 = 0, '{"kind":"self"}'
  FROM generate_series(1, 40) g;
  INSERT INTO public.application_outcomes (application_id, user_id, stage, source) SELECT t.id('old' || g), t.id('other'), 'response', 'you' FROM generate_series(1, 10) g;
  INSERT INTO public.application_outcomes (application_id, user_id, stage, source) SELECT t.id('old' || g), t.id('other'), 'interview', 'you' FROM generate_series(1, 5) g;
  PERFORM t.as('admin');
  r := public.apply_learning();
  PERFORM t.out();
  ASSERT (r->>'enough')::boolean AND (r->>'applications')::int = 40, r::text;
  ASSERT (SELECT (x->>'response_rate')::int FROM jsonb_array_elements(r->'by'->'match_range') x WHERE x->>'value' = '85+') = 40, r::text;
  ASSERT (SELECT (x->>'interview_rate')::int FROM jsonb_array_elements(r->'by'->'match_range') x WHERE x->>'value' = '85+') = 20;
  ASSERT (SELECT (x->>'response_rate')::int FROM jsonb_array_elements(r->'by'->'match_range') x WHERE x->>'value' = '65-74') = 0;
  ASSERT jsonb_array_length(r->'by'->'cc') = 1, 'a group of 6 applications must not get a rate';
END $$;

\echo '16. page events: only the known ones; settings are admin-only'
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM t.as('free');
  PERFORM public.apply_event('auto_apply_opened', jsonb_build_object('auto', 3));
  PERFORM public.apply_event('application_submitted', NULL);
  BEGIN
    PERFORM public.apply_configure(NULL, 9999);
    RAISE EXCEPTION 'a non-admin changed the allowance';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.job_applications SET status = 'submitted', verified = true;
    RAISE EXCEPTION 'a person wrote to job_applications directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.application_credits (application_id, user_id, state, period) VALUES (gen_random_uuid(), t.id('free'), 'released', '2026-10');
    RAISE EXCEPTION 'a person wrote to application_credits directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM t.out();
  ASSERT t.events('free', 'auto_apply_opened') = 1;
  ASSERT (SELECT count(*) FROM public.application_events WHERE user_id = t.id('free') AND name = 'application_submitted') = 6, 'a page must not be able to log a submission';
  ASSERT (SELECT count(*) FROM public.application_events WHERE user_id = t.id('free') AND name = 'application_credit_used') = 6, 'one count per application, however many steps it took';
  PERFORM t.as('admin');
  r := public.apply_configure(false);
  PERFORM t.out();
  PERFORM t.as('free');
  ASSERT (public.apply_status()->>'monthly')::int = 0 AND NOT (public.apply_status()->>'enabled')::boolean;
  BEGIN
    PERFORM public.apply_enqueue(t.items('j11'), NULL);
    RAISE EXCEPTION 'queued while switched off';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%switched off%' THEN RAISE; END IF;
  END;
  PERFORM t.out();
END $$;

\echo '17. verified can never be set without a confirmation'
DO $$
BEGIN
  BEGIN
    UPDATE public.job_applications SET verified = true WHERE id = t.app('pro', 'twinA');
    RAISE EXCEPTION 'verified was set on a self-confirmed application';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT public.apply_norm_title('Senior Data Analyst (m/f/d) – Berlin') = 'senior data analyst';
  ASSERT public.apply_norm_title('Senior Engineer') = public.apply_norm_title('Senior Engineer (m/f/d) – Berlin');
END $$;

\echo 'ALL AUTO APPLY DATABASE TESTS PASSED'
ROLLBACK;
