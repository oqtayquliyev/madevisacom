import { supabase } from '@/lib/supabase';

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/**
 * Uploads a logo/cover image for a listing to the `listing-images`
 * storage bucket, under a folder named after the uploader's own user
 * id (required by the bucket's RLS policy) and returns its public URL.
 */
export async function uploadListingImage(file: File, userId: string): Promise<{ url: string | null; error?: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, error: 'Please upload a PNG, JPEG, WebP, or SVG image.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { url: null, error: 'Image is too large — please keep it under 4MB.' };
  }

  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from('listing-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    console.error('uploadListingImage failed', error);
    return { url: null, error: error.message };
  }

  const { data } = supabase.storage.from('listing-images').getPublicUrl(path);
  return { url: data.publicUrl };
}
