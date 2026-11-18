-- After restoring the database on the new server: replace the old Supabase address everywhere it
-- was saved in the data (company logos and images in Storage, the job-facts / auto-pipeline /
-- search-ping function URLs in the settings rows, social media links, …).
--
-- Run with psql against the NEW database:
--   psql "$NEW_DB_URL" -v old=https://fduetqpklyoxeqqdhozg.supabase.co -v new=https://api.madevisa.com \
--        -f supabase/move/rewrite-project-url.sql
--
-- Looks at every text, varchar and jsonb column in the public schema. Safe to run again.

SELECT set_config('mv.old_url', :'old', false), set_config('mv.new_url', :'new', false);

DO $$
DECLARE
  v_old text := rtrim(current_setting('mv.old_url'), '/');
  v_new text := rtrim(current_setting('mv.new_url'), '/');
  r record;
  n bigint;
  total bigint := 0;
BEGIN
  IF v_old = '' OR v_new = '' OR v_old = v_new THEN
    RAISE EXCEPTION 'Give -v old=... and -v new=... (different addresses).';
  END IF;
  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('text', 'character varying', 'jsonb')
  LOOP
    IF r.data_type = 'jsonb' THEN
      EXECUTE format(
        'UPDATE public.%I SET %I = replace(%I::text, $1, $2)::jsonb WHERE strpos(%I::text, $1) > 0',
        r.table_name, r.column_name, r.column_name, r.column_name) USING v_old, v_new;
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET %I = replace(%I, $1, $2) WHERE strpos(%I, $1) > 0',
        r.table_name, r.column_name, r.column_name, r.column_name) USING v_old, v_new;
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE '%.%: % rows', r.table_name, r.column_name, n;
      total := total + n;
    END IF;
  END LOOP;
  RAISE NOTICE 'Done: % values changed.', total;
END $$;
