/* Refunds (Subscription Terms): a full refund within 14 days of first starting Starter or Pro, as long as
   none of the plan's paid features has been used yet. This records the first use, so a refund request can be
   answered at a glance in Admin → Plans:
     • the website notes 'paid_feature_used' when a paying member sees a full CV match report or their
       ranked list of matches (note_milestone, paying members only);
     • a sponsorship document beyond the month's free one, and Auto Apply items or applications,
       are read from their own tables. */

ALTER TABLE public.user_milestones DROP CONSTRAINT IF EXISTS user_milestones_key_check;
ALTER TABLE public.user_milestones ADD CONSTRAINT user_milestones_key_check
  CHECK (key IN ('cv_match_viewed', 'pricing_viewed', 'pro_prompt_clicked', 'auto_apply_viewed', 'paid_feature_used'));

CREATE OR REPLACE FUNCTION public.note_milestone(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_key NOT IN ('cv_match_viewed', 'pricing_viewed', 'pro_prompt_clicked', 'auto_apply_viewed', 'paid_feature_used') THEN RETURN; END IF;
  -- Using a paid feature only counts for someone who is paying.
  IF p_key = 'paid_feature_used' AND NOT public.is_paid(auth.uid()) THEN RETURN; END IF;
  INSERT INTO public.user_milestones (user_id, key) VALUES (auth.uid(), p_key)
  ON CONFLICT (user_id, key) DO UPDATE SET last_at = now(), times = least(public.user_milestones.times + 1, 100000)
  WHERE public.user_milestones.last_at < now() - interval '1 minute';
END;
$$;
REVOKE ALL ON FUNCTION public.note_milestone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.note_milestone(text) TO authenticated;

/* Admin → Plans: for each card membership, when it started, whether a paid feature has been used since
   (when, and which), and until when a refund is due under the terms. */
CREATE OR REPLACE FUNCTION public.admin_plan_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'subscription_id', x.subscription_id,
      'started_at', x.first_start,
      'used_at', x.used_at,
      'what', x.what,
      'refundable_until', CASE WHEN x.used_at IS NULL THEN x.first_start + interval '14 days' END))
    FROM (
      SELECT g.subscription_id, f.first_start, u.used_at, u.what
      FROM public.gumroad_subscriptions g
      -- 14 days from the first time this person started a plan (not each renewal).
      CROSS JOIN LATERAL (SELECT min(g2.created_at) AS first_start FROM public.gumroad_subscriptions g2 WHERE g2.user_id = g.user_id) f
      LEFT JOIN LATERAL (
        SELECT min(at) AS used_at, (array_agg(what ORDER BY at))[1] AS what FROM (
          SELECT CASE WHEN m.first_at >= f.first_start THEN m.first_at ELSE m.last_at END AS at, 'Full CV match report or ranked matches' AS what
          FROM public.user_milestones m WHERE m.user_id = g.user_id AND m.key = 'paid_feature_used' AND m.last_at >= f.first_start
          UNION ALL
          -- A document beyond the free one of its month.
          SELECT b.created_at, 'Sponsorship document' FROM (
            SELECT h.created_at, row_number() OVER (PARTITION BY date_trunc('month', h.created_at) ORDER BY h.created_at) AS n
            FROM public.hiring_briefs h WHERE h.user_id = g.user_id AND h.created_at >= date_trunc('month', f.first_start)) b
          WHERE b.n > 1 AND b.created_at >= f.first_start
          UNION ALL
          SELECT min(a.created_at), 'Auto Apply' FROM public.auto_apply_items a WHERE a.user_id = g.user_id AND a.created_at >= f.first_start
          UNION ALL
          SELECT min(j.created_at), 'Auto Apply' FROM public.job_applications j WHERE j.user_id = g.user_id AND j.created_at >= f.first_start
        ) e WHERE e.at IS NOT NULL) u ON true
      WHERE g.user_id IS NOT NULL) x), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_plan_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_plan_usage() TO authenticated;

NOTIFY pgrst, 'reload schema';
