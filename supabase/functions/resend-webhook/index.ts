// supabase/functions/resend-webhook/index.ts
//
// Resend → this function on email.delivered, email.bounced, email.complained and
// email.clicked (Resend → Webhooks → Add endpoint:
//   https://<project>.supabase.co/functions/v1/resend-webhook ).
// Each event is matched to the email by Resend's id (email_log.provider_id) and
// applied once by email_provider_event() in the database:
//   hard bounce → the address is suppressed and counts toward the autopilot's bounce brake;
//   complaint   → the address is suppressed, News and tips off for an account, and the
//                 autopilot pauses at 3 complaints in 24 hours.
//
// Secret (Supabase → Edge Functions → Secrets):
//   RESEND_WEBHOOK_SECRET   the endpoint's signing secret from Resend (whsec_…)
//
// Deploy: supabase functions deploy resend-webhook --no-verify-jwt
// (Resend cannot sign in; the function checks Resend's signature instead.)
// Needs migration 20261223090000_email_growth_system.sql.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { makeHandler } from './core.ts';

const service = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });

Deno.serve(
  makeHandler({
    secret: Deno.env.get('RESEND_WEBHOOK_SECRET'),
    rpc: async (name, args) => {
      const { data, error } = await service.rpc(name, args);
      return { data, error: error ? { message: error.message } : null };
    },
  }),
);
