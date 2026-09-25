// "Post a job" requests from people without a company on MadeVisa yet.
// Stored through the submit_listing_request() database function, which
// checks a proof of work, a honeypot, time on page and rate limits (see
// migration 20261004090000). Admins read them in the admin inbox.

import { supabase } from '@/lib/supabase';

export const SPONSORED_JOB_PRICE = 299;
export const SPONSORED_JOB_DAYS = 30;
export const TERMS_PATH = '/sponsored-listing-terms';

export type ListingPlan = 'sponsored_job' | 'free_job';

export type ListingRequest = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  company_name: string;
  job_url: string | null;
  plan: ListingPlan;
  price_usd: number;
  status: 'new' | 'contacted' | 'converted' | 'closed' | 'spam';
  admin_notes: string | null;
  user_id: string | null;
};

// ---------------------------------------------------------------------------
// Proof of work ("verifying you're human")
// ---------------------------------------------------------------------------

export type PowSolution = { ts: number; nonce: string };

const DIFFICULTY_PREFIX = '0000'; // must match the migration

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Finds a nonce so sha256("<ts>:<nonce>") starts with "0000" — about 65k
 * attempts, 1–2 seconds in a browser. Runs while the person fills the
 * form. Hashes in small parallel batches so the page stays responsive.
 */
export async function solveProofOfWork(signal?: { cancelled: boolean }): Promise<PowSolution | null> {
  const ts = Date.now();
  const BATCH = 256;
  for (let start = 0; start < 5_000_000; start += BATCH) {
    if (signal?.cancelled) return null;
    const hashes = await Promise.all(Array.from({ length: BATCH }, (_, i) => sha256Hex(`${ts}:${start + i}`)));
    const hit = hashes.findIndex((h) => h.startsWith(DIFFICULTY_PREFIX));
    if (hit >= 0) return { ts, nonce: String(start + hit) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export type ListingRequestInput = {
  fullName: string;
  email: string;
  company: string;
  jobUrl: string;
  plan: ListingPlan;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  website: string; // honeypot
  startedAt: number;
  pow: PowSolution;
};

export async function submitListingRequest(input: ListingRequestInput): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('submit_listing_request', {
    p_full_name: input.fullName,
    p_email: input.email,
    p_company: input.company,
    p_job_url: input.jobUrl,
    p_plan: input.plan,
    p_accept_terms: input.acceptTerms,
    p_accept_privacy: input.acceptPrivacy,
    p_website: input.website,
    p_started_at: input.startedAt,
    p_pow_ts: input.pow.ts,
    p_pow_nonce: input.pow.nonce,
  });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message)) {
      return { ok: false, error: 'The form is being set up. Please email hello@madevisa.com in the meantime.' };
    }
    return { ok: false, error: error.message };
  }
  const res = (data ?? {}) as { ok?: boolean; duplicate?: boolean };
  return { ok: Boolean(res.ok), duplicate: res.duplicate };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function fetchListingRequests(): Promise<ListingRequest[]> {
  const { data, error } = await supabase
    .from('listing_requests')
    .select('id, created_at, full_name, email, company_name, job_url, plan, price_usd, status, admin_notes, user_id')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    // Before the migration runs the table doesn't exist — show nothing.
    console.warn('fetchListingRequests failed', error.message);
    return [];
  }
  return (data ?? []) as ListingRequest[];
}

export async function setListingRequestStatus(id: string, status: ListingRequest['status']): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('listing_requests').update({ status }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
