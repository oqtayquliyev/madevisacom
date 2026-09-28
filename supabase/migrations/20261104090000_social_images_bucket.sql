/*
# Public bucket for Instagram images

Instagram only accepts JPEG, so the auto-pipeline converts each post image
and stores it here (public read; only the service key can write).
Run AFTER 20261103090000_social_publishing.sql.
*/
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('social-images', 'social-images', true, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg'];
