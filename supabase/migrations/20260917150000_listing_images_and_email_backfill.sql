/*
# Listing images + fix existing wrong contact emails

## 1. image_url on programs / sponsored_jobs
Lets a verified publisher attach a logo/cover image to their listing
(uploaded to the new `listing-images` storage bucket below).

## 2. `listing-images` storage bucket
Public read (so the image displays on the public listing page),
authenticated users may upload into a folder named after their own
user id (`<uid>/...`) — mirrors a common, simple Supabase Storage
pattern; no separate migration needed for this to work with the
existing auth setup.

## 3. Backfill: existing publishers with the wrong contact email
Some publisher rows created via the "Become a partner" flow before
this was fixed in code got `contact_email = 'hello@madevisa.com'`
instead of the actual signed-up user's email. This one-time backfill
corrects any of those still sitting at that placeholder value by
pulling the real email from `auth.users`. Safe to re-run — it only
touches rows still at the placeholder.
*/

ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.sponsored_jobs ADD COLUMN IF NOT EXISTS image_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "listing_images_public_read" ON storage.objects;
CREATE POLICY "listing_images_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'listing-images');

DROP POLICY IF EXISTS "listing_images_owner_write" ON storage.objects;
CREATE POLICY "listing_images_owner_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "listing_images_owner_update" ON storage.objects;
CREATE POLICY "listing_images_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "listing_images_owner_delete" ON storage.objects;
CREATE POLICY "listing_images_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- One-time backfill for publisher rows created before the contact
-- email fix — pulls each owner's real signup email from auth.users.
UPDATE public.program_publishers pp
SET contact_email = u.email
FROM auth.users u
WHERE pp.owner_id = u.id
  AND pp.contact_email = 'hello@madevisa.com'
  AND u.email IS NOT NULL;
