// Supabase Edge Function: delete-account
//
// Deletes the CALLING user's own account. Runs server-side because
// deleting an auth.users row requires the service role key, which
// must never be shipped to the browser.
//
// Deploy with the Supabase CLI:
//   supabase functions deploy delete-account
//
// No extra secrets to set — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are already available to every Edge Function automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ALLOWED_ORIGINS = new Set(['https://madevisa.com', 'https://www.madevisa.com']);

function corsHeadersFor(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://madevisa.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Client scoped to the CALLER's own token — used only to verify
    // who's asking, never to perform the deletion itself.
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin client — only ever deletes the id we just verified above,
    // never anything from the request body, so a forged payload can't
    // be used to delete a different account.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('delete-account failed', deleteError);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // profiles row cascades automatically (profiles.id references
    // auth.users(id) ON DELETE CASCADE). Owned agencies/publisher
    // records intentionally survive with owner_id set to null,
    // matching the rest of the schema's existing behavior.

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('delete-account unexpected error', err);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
