-- "N of 200 left" on the launch offer: an admin can set the number by hand
-- (Admin → Plans → Gumroad → Places left). Empty = the real count (200 minus one-time buyers).

ALTER TABLE public.gumroad_settings ADD COLUMN IF NOT EXISTS places_left_shown integer
  CHECK (places_left_shown IS NULL OR places_left_shown BETWEEN 0 AND 200);

-- The real count, for the admin card.
CREATE OR REPLACE FUNCTION public.membership_places_real()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(0, 200 - (
    SELECT count(*)::integer FROM public.gumroad_subscriptions
    WHERE subscription_id LIKE 'sale:%' AND NOT coalesce(test, false) AND ended_at IS NULL
  ));
$$;
REVOKE ALL ON FUNCTION public.membership_places_real() FROM PUBLIC;

-- What the site shows: the admin's number when set, otherwise the real count.
CREATE OR REPLACE FUNCTION public.membership_places_left()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT places_left_shown FROM public.gumroad_settings WHERE id), public.membership_places_real());
$$;
REVOKE ALL ON FUNCTION public.membership_places_left() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.membership_places_left() TO anon, authenticated;

-- Admin: read both numbers.
CREATE OR REPLACE FUNCTION public.admin_membership_places()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'shown', public.membership_places_left(),
    'manual', (SELECT places_left_shown FROM public.gumroad_settings WHERE id),
    'real', public.membership_places_real()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_membership_places() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_membership_places() TO authenticated;

-- Admin: set the number shown (NULL = back to the real count).
CREATE OR REPLACE FUNCTION public.admin_set_membership_places(p_left integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE = '42501'; END IF;
  IF p_left IS NOT NULL AND (p_left < 0 OR p_left > 200) THEN RAISE EXCEPTION 'between 0 and 200'; END IF;
  INSERT INTO public.gumroad_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
  UPDATE public.gumroad_settings SET places_left_shown = p_left WHERE id;
  RETURN public.admin_membership_places();
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_membership_places(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_membership_places(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
