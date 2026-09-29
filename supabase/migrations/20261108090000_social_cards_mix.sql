/*
# Social: "cards" and "mix" formats, bigger job pool

- format 'cards': one image with a white card per job (logo, title,
  company · place, salary on the right).
- format 'mix': rotates cards → list → company, a different design than the
  network's previous post each time.
- social_pick_jobs returns up to 15 candidates, so the planner can skip
  companies used in the last 3 posts on that network.
- A starter "New jobs this week" cards campaign (off), and "Fresh jobs"
  switched to mix.
Run AFTER 20261107090000_plans_notifications.sql.
*/

ALTER TABLE public.social_campaigns DROP CONSTRAINT IF EXISTS social_campaigns_format_check;
ALTER TABLE public.social_campaigns ADD CONSTRAINT social_campaigns_format_check CHECK (format IN ('list', 'carousel', 'single', 'company', 'cards', 'mix'));

UPDATE public.social_campaigns SET format = 'mix' WHERE name = 'Fresh jobs' AND format = 'list';

INSERT INTO public.social_campaigns (name, kind, platforms, every_minutes, format, jobs_count, min_jobs, salary_only, enabled)
SELECT 'New jobs this week (cards)', 'fresh', ARRAY['linkedin', 'facebook', 'instagram'], 240, 'cards', 4, 3, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.social_campaigns WHERE format = 'cards');

-- Same rules as before; only the limit changes (5 → 15).
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.social_pick_jobs(text, integer, text, text[], text[], boolean)'::regprocedure) INTO def;
  IF def LIKE '%least(greatest(p_count, 1), 5)%' THEN
    EXECUTE replace(def, 'least(greatest(p_count, 1), 5)', 'least(greatest(p_count, 1), 15)');
  END IF;
END $$;
