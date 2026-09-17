import { supabase } from '@/lib/supabase';

/**
 * Permanently deletes the signed-in user's account by calling the
 * `delete-account` Edge Function (see supabase/functions/delete-account) —
 * this can't be done directly from the browser since it requires the
 * service role key.
 */
export async function deleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });

  if (error) {
    console.error('deleteMyAccount failed', error);
    return { ok: false, error: error.message };
  }
  if (data?.error) {
    return { ok: false, error: data.error };
  }
  return { ok: true };
}
