// supabase/functions/gumroad/index.ts
//
// Card payments for MadeVisa Pro, through Gumroad (the seller of record).
//
// What it does
//   • "Get Pro" on the site → { action: 'checkout', billing } (signed-in people)
//       → { url, price_cents, list_cents, country }
//       The link opens Gumroad's checkout with the person's email, the monthly
//       or yearly choice, and — when their country's price is below the list
//       price — a one-time discount code made for this checkout. The country
//       is read from the request here, never taken from the browser.
//   • Gumroad → this function (…/gumroad?k=<secret>) on every payment, renewal,
//       cancellation, end, restart, refund and dispute. The function answers at
//       once, then asks Gumroad's API what the membership looks like now and
//       switches Pro on or off (gumroad_apply in the database). A notification
//       is never believed on its own.
//   • { action: 'refresh' } (signed-in people): "check my payment now" — reads
//       the person's memberships again; also finds one bought with their
//       verified email directly on Gumroad.
//   • { action: 'connect', product_url } / { action: 'disconnect' } (admins):
//       checks the product and the access token, and asks Gumroad to send its
//       notifications here.
//
// Secret (Supabase → Edge Functions → Secrets):
//   GUMROAD_ACCESS_TOKEN   Gumroad → Settings → Advanced → Applications →
//                          create an application → Generate access token.
//                          It needs "view_sales" and "edit_products".
//
// Deploy: supabase functions deploy gumroad --no-verify-jwt
// (Gumroad cannot sign in, so the function checks access itself.)
// Needs migration 20261203090000_gumroad_checkout.sql.

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
    // Keeps the function alive until the work is done, after the answer has gone out.
    background: (work) => {
      const safe = work.catch((e) => console.error('gumroad background', e));
      if (runtime?.waitUntil) runtime.waitUntil(safe);
    },
  }),
);
