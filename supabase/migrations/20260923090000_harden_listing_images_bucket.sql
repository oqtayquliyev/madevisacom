/*
  Security hardening: the `listing-images` bucket previously had no
  MIME-type or size restriction of its own — enforcement existed only
  in application code (src/lib/uploadImage.ts), which is trivially
  bypassed by anyone calling the Storage API directly rather than
  through the app's upload function. This makes the same restrictions
  real server-side, at the bucket itself.

  Also drops SVG from the allowed types (matching the same change in
  uploadImage.ts) — SVG can carry embedded <script>/event-handler
  content and is unsafe to accept without a dedicated sanitizer.
*/

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'],
  file_size_limit = 4194304 -- 4MB, matches MAX_SIZE_BYTES in uploadImage.ts
WHERE id = 'listing-images';
