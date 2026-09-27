/*
# Faster access rules ("Auth RLS Initialization Plan" advisor)

Rules that call auth.uid() / auth.jwt() / auth.role() directly are
re-evaluated for EVERY row. Wrapped as (select auth.uid()) Postgres runs
them once per query. This rewrites every public rule that still uses the
bare form — same meaning, less work per request.

Changes rule definitions only (no data). Stops after 5 s if a table is busy;
just run again. Safe to run more than once.
*/
SET lock_timeout = '5s';

DO $$
DECLARE
  p record;
  q text;
  c text;
  fix constant text[] := ARRAY['auth.uid()', 'auth.jwt()', 'auth.role()'];
  f text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~ 'auth\.(uid|jwt|role)\(\)' OR coalesce(with_check, '') ~ 'auth\.(uid|jwt|role)\(\)')
  LOOP
    q := p.qual;
    c := p.with_check;
    FOREACH f IN ARRAY fix LOOP
      -- Leave already-wrapped calls alone: mark them, wrap the rest, unmark.
      q := replace(replace(replace(q, '( SELECT ' || f, '(SELECT_WRAPPED ' || f), f, '(select ' || f || ')'), '(SELECT_WRAPPED (select ' || f || ')', '( SELECT ' || f);
      c := replace(replace(replace(c, '( SELECT ' || f, '(SELECT_WRAPPED ' || f), f, '(select ' || f || ')'), '(SELECT_WRAPPED (select ' || f || ')', '( SELECT ' || f);
    END LOOP;
    IF q IS DISTINCT FROM p.qual OR c IS DISTINCT FROM p.with_check THEN
      BEGIN
        IF q IS NOT NULL AND c IS NOT NULL THEN
          EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, q, c);
        ELSIF q IS NOT NULL THEN
          EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, q);
        ELSE
          EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, c);
        END IF;
        RAISE NOTICE 'Updated %.%', p.tablename, p.policyname;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipped %.% (%)', p.tablename, p.policyname, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;
