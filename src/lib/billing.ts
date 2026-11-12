// Billing helpers for the pricing, checkout and confirmation pages:
//   • the plan catalogue as the SERVER has it (billing_catalog(), migration 20261219090000),
//   • the order summary for a plan,
//   • checkout-funnel events (Vercel Analytics — no personal data, never CV text),
//   • saved jobs (the limit is applied by the database: save_job()).

import { useEffect, useState } from 'react';
// Vercel Analytics was removed with the move to Cloudflare; events still go to the other trackers below.
const vercelTrack = (_event: string, _props?: unknown) => {};
import { supabase } from '@/lib/supabase';
import { fallbackCatalog, type Catalog } from '@/lib/billingCore';

export * from '@/lib/billingCore';

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
let catalogMemo: { at: number; value: Catalog } | null = null;

export async function loadCatalog(force = false): Promise<Catalog> {
  if (!force && catalogMemo && Date.now() - catalogMemo.at < 60_000) return catalogMemo.value;
  try {
    const { data, error } = await supabase.rpc('billing_catalog');
    if (error || !data || !Array.isArray((data as Catalog).plans)) return fallbackCatalog();
    const value = { ...(data as Omit<Catalog, 'source'>), source: 'server' as const };
    catalogMemo = { at: Date.now(), value };
    return value;
  } catch {
    return fallbackCatalog();
  }
}

export function useBillingCatalog(): Catalog | null {
  const [c, setC] = useState<Catalog | null>(catalogMemo?.value ?? null);
  useEffect(() => {
    let alive = true;
    void loadCatalog().then((v) => alive && setC(v));
    return () => {
      alive = false;
    };
  }, []);
  return c;
}

// ---------------------------------------------------------------------------
// Funnel events
// ---------------------------------------------------------------------------
export type BillingEvent =
  | 'pricing_viewed'
  | 'book_promo_shown'
  | 'book_promo_click'
  | 'checkout_viewed'
  | 'plan_selected'
  | 'checkout_started'
  | 'checkout_unavailable'
  | 'payment_confirmed'
  | 'payment_pending'
  | 'payment_failed_shown'
  | 'upgrade_prompt_shown'
  | 'upgrade_prompt_dismissed'
  | 'upgrade_prompt_clicked'
  | 'feature_limit_reached'
  | 'billing_manage_clicked';

/** Plan, source and similar labels only — never names, emails, CV text or payment details. */
export function trackBilling(event: BillingEvent, props: Record<string, string | number | boolean | null> = {}): void {
  try {
    vercelTrack(event, props);
  } catch {
    /* analytics blocked: fine */
  }
}

// ---------------------------------------------------------------------------
// Upgrade prompts: dismissible, and they stay dismissed for a week
// ---------------------------------------------------------------------------
const DISMISS_KEY = 'mv:upgradeDismissed';
const WEEK = 7 * 86_400_000;

export function promptDismissed(id: string): boolean {
  try {
    const all = JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? '{}') as Record<string, number>;
    return Boolean(all[id] && Date.now() - all[id] < WEEK);
  } catch {
    return false;
  }
}

export function dismissPrompt(id: string): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? '{}') as Record<string, number>;
    all[id] = Date.now();
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(all));
  } catch {
    /* private mode: it just shows again next time */
  }
}

// ---------------------------------------------------------------------------
// Saved jobs
// ---------------------------------------------------------------------------
export type SavedJob = { id: string; title: string; company: string | null; logo: string | null; city: string | null; country: string | null; open: boolean; saved_at: string };

let savedMemo: { at: number; ids: Set<string> } | null = null;
const savedListeners = new Set<() => void>();
const pingSaved = () => savedListeners.forEach((l) => l());

export async function loadSavedJobs(): Promise<SavedJob[]> {
  const { data, error } = await supabase.rpc('my_saved_jobs');
  if (error || !Array.isArray(data)) return [];
  const list = data as SavedJob[];
  savedMemo = { at: Date.now(), ids: new Set(list.map((j) => j.id)) };
  return list;
}

export type SaveResult = { ok: true } | { ok: false; limit: boolean; message: string };

export async function saveJob(id: string): Promise<SaveResult> {
  const { error } = await supabase.rpc('save_job', { p_job: id });
  if (error) {
    const limit = /most on the Free plan/i.test(error.message) || /limit:saved_jobs/.test(error.hint ?? '');
    if (limit) trackBilling('feature_limit_reached', { feature: 'saved_jobs' });
    return { ok: false, limit, message: /function|schema cache/i.test(error.message) ? 'Saving jobs isn’t available yet.' : error.message };
  }
  savedMemo?.ids.add(id);
  pingSaved();
  return { ok: true };
}

export async function unsaveJob(id: string): Promise<void> {
  await supabase.rpc('unsave_job', { p_job: id });
  savedMemo?.ids.delete(id);
  pingSaved();
}

/** Is this job saved? (null while loading, or when signed out.) */
export function useIsSaved(id: string | null, signedIn: boolean): boolean | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    savedListeners.add(l);
    if (signedIn && (!savedMemo || Date.now() - savedMemo.at > 60_000)) void loadSavedJobs().then(l);
    return () => {
      savedListeners.delete(l);
    };
  }, [signedIn]);
  if (!signedIn || !id || !savedMemo) return null;
  return savedMemo.ids.has(id);
}

