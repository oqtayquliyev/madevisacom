import { supabase } from '@/lib/supabase';

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

// SVG intentionally excluded: it's an XML format that can carry <script>
// tags and event-handler attributes. If a raw SVG's public storage URL is
// ever opened directly in a browser tab (rather than only referenced via
// <img>, which does not execute embedded scripts), any embedded script
// runs in the storage domain's origin. Re-add only alongside a real
// server-side SVG sanitizer if vector-logo support is needed later.
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

// Extension is derived from a fixed map keyed by the (now allowlist-
// checked) MIME type — never from the user-supplied file.name — so
// there is no way for a crafted filename (e.g. containing "/" or "..")
// to influence the resulting storage object path.
const EXTENSION_BY_TYPE: Record<(typeof ALLOWED_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Uploads a logo/cover image for a listing to the `listing-images`
 * storage bucket, under a folder named after the uploader's own user
 * id (required by the bucket's RLS policy) and returns its public URL.
 *
 * Client-side checks here (type, size) are a UX convenience only — they
 * are trivially bypassable by anyone calling the API directly, so the
 * storage bucket itself also enforces allowed_mime_types and
 * file_size_limit server-side (see the accompanying migration). Treat
 * this function's checks as "fail fast with a friendly message", not
 * as the actual security boundary.
 */
export async function uploadListingImage(file: File, userId: string): Promise<{ url: string | null; error?: string }> {
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { url: null, error: 'Please upload a PNG, JPEG, or WebP image.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { url: null, error: 'Image is too large — please keep it under 4MB.' };
  }

  const ext = EXTENSION_BY_TYPE[file.type as (typeof ALLOWED_TYPES)[number]];
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from('listing-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type, // pin the served Content-Type to the validated type, not whatever the client claims at serve-time
  });

  if (error) {
    console.error('uploadListingImage failed', error);
    return { url: null, error: error.message };
  }

  const { data } = supabase.storage.from('listing-images').getPublicUrl(path);
  return { url: data.publicUrl };
}
