/*
# Book promotion content (Admin → Book)

Run AFTER 20261231280000_book_membership_bundle.sql. Safe to run more than once.

One row holding the book promotion as JSON: the six reviews (masked names, profession, text,
stars, published), the displayed rating, profession insights, how often promos show and where.
Everyone may read it (the public /book page); only admins may change it.
Empty until an admin saves: the site then uses the defaults in src/data/bookPromo.ts.
*/

CREATE TABLE IF NOT EXISTS public.book_promo (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.book_promo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_promo_read ON public.book_promo;
CREATE POLICY book_promo_read ON public.book_promo FOR SELECT USING (true);

DROP POLICY IF EXISTS book_promo_admin ON public.book_promo;
CREATE POLICY book_promo_admin ON public.book_promo FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.book_promo TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.book_promo TO authenticated;

NOTIFY pgrst, 'reload schema';
