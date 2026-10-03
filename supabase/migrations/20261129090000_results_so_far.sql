/*
# Results so far: what happened to sponsorship documents

The CV match page may show how sponsorship documents have actually done —
"of N documents, X were opened by the employer, Y got a reply" — but only
from MadeVisa's own records, and only once there are enough of them for a
percentage to mean something.

  brief_outcomes()      → { enough, made, opened, replied, interview, offer }
  brief_outcomes_min()  → how many documents are needed before anything is shown (30)

What is counted
  made       documents made at least 7 days ago (time for an employer to answer),
             not withdrawn, not made by staff accounts
  opened     … that someone other than the candidate opened (unique_viewers)
  replied    … the employer answered through the document, or the candidate
             marked it replied / interview / offer / declined
  interview  … marked interview or offer by the candidate
  offer      … marked offer

Below the minimum the function says only { "enough": false } — small numbers
are never published. Safe to run more than once.
*/

CREATE OR REPLACE FUNCTION public.brief_outcomes_min()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 30 $$;

CREATE OR REPLACE FUNCTION public.brief_outcomes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
BEGIN
  SELECT
    count(*)                                                                                              AS made,
    count(*) FILTER (WHERE b.unique_viewers > 0 OR b.reply_count > 0)                                     AS opened,
    count(*) FILTER (WHERE b.reply_count > 0 OR b.status IN ('replied', 'interview', 'offer', 'declined')) AS replied,
    count(*) FILTER (WHERE b.status IN ('interview', 'offer'))                                            AS interview,
    count(*) FILTER (WHERE b.status = 'offer')                                                            AS offer
  INTO v
  FROM public.hiring_briefs b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  WHERE b.status <> 'withdrawn'
    AND b.created_at < now() - interval '7 days'
    AND coalesce(p.role::text, '') <> 'admin';

  IF v.made < public.brief_outcomes_min() THEN
    RETURN jsonb_build_object('enough', false);
  END IF;
  RETURN jsonb_build_object('enough', true, 'made', v.made, 'opened', v.opened, 'replied', v.replied, 'interview', v.interview, 'offer', v.offer);
END;
$$;

REVOKE ALL ON FUNCTION public.brief_outcomes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brief_outcomes() TO anon, authenticated;
