// supabase/functions/apply/index.ts
//
// Auto Apply: the one part that runs on the server.
//
// What it does
//   • { action: 'submit', application_id, cv: { name, base64 }, letter, answers }
//       (signed-in people) — sends ONE application to an employer who takes
//       applications through MadeVisa: an email to the address the employer
//       gave for it (application_channels, set by an admin), the tailored CV attached,
//       Reply-To the candidate. Only an application the database has already
//       moved to "submitting" is sent. The mail service's own message id is
//       saved as the confirmation; without one the application is marked
//       "Could not submit", never "Submitted". Repeating the call never sends
//       twice.
//   • { action: 'analyze', application_ids } (signed-in people) — before a
//       batch is confirmed: which hiring system each application's form is on,
//       whether it needs a sign-in, and its questions where the hiring system
//       publishes them (Greenhouse, Lever, Ashby). Kept in application_forms.
//       See forms.ts.
//   • { action: 'kick' } (signed-in people) — ask GitHub to start the
//       application worker now (.github/workflows/apply-worker.yml), at most
//       once a minute. Needs GITHUB_DISPATCH_TOKEN and GITHUB_REPO.
//   • { action: 'questions', job_id } (signed-in people) — reads the public
//       list of application questions for a job, where the employer's hiring
//       system publishes one (Greenhouse today). Read-only.
//
// What it never does: fill in or submit a form on an employer's own site
// (that is the application worker's job — worker/README.md), sign in
// anywhere as the candidate, or get round a human check.
//
// Since migration 20261205090000 the email channel is sent by the worker as
// well; 'submit' stays for applications that were already "submitting".
//
// Mail: uses the Resend key already in the database (app_secrets
// 'resend_api_key', and 'email_from' for the sender) — the same one the job
// alerts use. No new secret.
//
// Deploy: supabase functions deploy apply --no-verify-jwt
// (The function checks who is signed in itself.)
// Needs migration 20261204090000_auto_apply.sql.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { makeHandler } from './core.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const service = createClient(url, serviceKey, { auth: { persistSession: false } });

Deno.serve(
  makeHandler({
    rpc: async (name, args) => {
      const { data, error } = await service.rpc(name, args ?? {});
      return { data, error: error ? { message: error.message } : null };
    },
    getUser: async (authorization) => {
      if (!authorization) return null;
      const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
      const { data } = await asUser.auth.getUser();
      return data?.user ? { id: data.user.id, email: data.user.email ?? null } : null;
    },
    fetch: (input, init) => fetch(input, init),
    // The application worker on GitHub Actions: start a run now. The same two secrets the reels use.
    kick: async () => {
      const token = Deno.env.get('GITHUB_DISPATCH_TOKEN') ?? '';
      const repo = Deno.env.get('GITHUB_REPO') ?? '';
      if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
      const due = await service.rpc('apply_kick_due');
      if (due.error || !due.data) return false;
      const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'madevisa-apply', 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'apply' }),
        signal: AbortSignal.timeout(15_000),
      });
      return res.ok;
    },
  }),
);
