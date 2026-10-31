// supabase/functions/gumroad/index.ts
//
// Card payments for the MadeVisa Membership ($12.50 once, lifetime), through Gumroad
// (the seller of record). The membership is the Gumroad membership product
// connected as 'starter'; the retired Pro product is still read so its members
// keep their plan. The product a payment belongs to decides the plan.
//
// What it does
//   • The paywall / pricing page, without an account → { action: 'guest_checkout', source, email? }
//   • Back from Gumroad without an account → { action: 'guest_claim', token } (emails a sign-in code)
//       → { url } — the membership's Gumroad page. When the payment arrives,
//       an account with that email gets it, or one is created (sign-in by email
//       code) and the "account ready" and "welcome" emails go out.
//   • The checkout page → { action: 'checkout', plan, source } (signed-in people)
//       → { url, checkout_id, plan, price_cents, currency }
//       The plan is the only thing the page chooses. The function reads the
//       product from Gumroad first and refuses unless it charges exactly the
//       plan's price (one tier, monthly only, no Gumroad PPP discount). The
//       link carries the person's email and a checkout id (mv=) that says
//       which account the payment is for. A membership that is still being
//       billed is never started twice: { already } or { switch } instead.
//   • Gumroad → this function (…/gumroad?k=<secret>) on every payment, renewal,
//       cancellation, end, restart, refund and dispute. The function answers at
//       once, then asks Gumroad's API what the membership looks like now and
//       applies it (gumroad_apply in the database). A notification is never
//       believed on its own, and applying the same state twice changes nothing.
//   • { action: 'refresh' } (signed-in people): "check my payment now" — reads
//       the person's memberships again; also finds one bought with their
//       verified email directly on Gumroad. Answers { active, plan }.
//   • { action: 'connect', plan, product_url } / { action: 'disconnect', plan }
//       (admins): checks the product and the access token, and asks Gumroad
//       to send its notifications here.
//   The old single "MadeVisa Pro" product (PPP prices) is still read, so its
//   members keep Pro and their renewals, refunds and cancellations still apply.
//
// Secret (Supabase → Edge Functions → Secrets):
//   GUMROAD_ACCESS_TOKEN   Gumroad → Settings → Advanced → Applications →
//                          create an application → Generate access token.
//                          It needs "view_sales" (and "edit_products" for the
//                          old Pro product's discount-code clean-up).
//
// Deploy: supabase functions deploy gumroad --no-verify-jwt
// (Gumroad cannot sign in, so the function checks access itself.)
// Needs migrations 20261203090000_gumroad_checkout.sql, 20261219090000_starter_pro_plans.sql and
// 20261231090000_single_membership_guest_checkout.sql.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { makeHandler } from './core.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const service = createClient(url, serviceKey, { auth: { persistSession: false } });

// deno-lint-ignore no-explicit-any
const runtime = (globalThis as any).EdgeRuntime; // eslint-disable-line @typescript-eslint/no-explicit-any

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
    env: (name) => Deno.env.get(name),
    // A buyer who paid without an account: a MadeVisa account for that email (sign-in by email code).
    createAccount: async (email) => {
      const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, user_metadata: { source: 'gumroad' } });
      if (error || !data?.user) return { error: error?.message ?? 'The account could not be created.' };
      return { id: data.user.id };
    },
    // A sign-in code for a guest buyer's account (the guest_claim action emails it).
    signInCode: async (email) => {
      const { data, error } = await service.auth.admin.generateLink({ type: 'magiclink', email });
      const code = data?.properties?.email_otp;
      return error || !code ? { error: error?.message ?? 'No code.' } : { code };
    },
    // Keeps the function alive until the work is done, after the answer has gone out.
    background: (work) => {
      const safe = work.catch((e) => console.error('gumroad background', e));
      if (runtime?.waitUntil) runtime.waitUntil(safe);
    },
  }),
);
