/*
  The previous version of this trigger used:

    IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN

  Postgres does not guarantee short-circuit evaluation of AND/OR the
  way most programming languages do, and OLD is not a valid reference
  during an INSERT (there is no "old" row). Depending on evaluation
  order this could throw "record \"old\" is not assigned yet" and
  fail the entire INSERT or UPDATE it was attached to — which would
  explain updates (like approving a listing) silently not taking
  effect. Rewritten with an explicit TG_OP branch so OLD is never
  touched during INSERT, removing any ambiguity.
*/

CREATE OR REPLACE FUNCTION public.enforce_review_on_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.status := 'pending';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN
      NEW.approved_at := now();
      NEW.expires_at := now() + interval '1 month';
    END IF;
  ELSE
    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
      NEW.approved_at := now();
      NEW.expires_at := now() + interval '1 month';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
