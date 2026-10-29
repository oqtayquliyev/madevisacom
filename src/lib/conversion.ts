// Everything the membership popup uses to convert better, in one place:
//   - when the popup comes up by itself (not on the first job pages a visitor opens)
//   - one free application per browser (the habit first, the paywall on the second)
//   - the "first month for less" offer when someone leaves the popup (only with a Gumroad offer code)
//   - the money-back line under the button
//   - a member quote from the visitor's own country, else an English one
//   - counting how many people looked at a job today (real numbers, shown from 3 up)
//
// Numbers here are the knobs to tune with Admin → Paywall. Nothing in this file
// unlocks anything on the server: the free application only shows the job's own
// link in this browser, once.

import { supabase } from '@/lib/supabase';
import type { Testimonial } from '@/data/testimonials';

/** The popup comes up by itself from this job page on (earlier ones: only when Apply is pressed). */
export const AUTO_POPUP_FROM_VIEW = 3;
/** Free applications per browser before the paywall. 0 turns it off. */
export const FREE_APPLIES = 1;
/**
 * The "first month for less" offer, shown once a week when someone leaves the popup.
 * Create an offer code on the membership in Gumroad (e.g. FIRST099: $1.30 off, first payment only)
 * and set VITE_GUMROAD_DOWNSELL_CODE (and VITE_GUMROAD_DOWNSELL_PRICE, e.g. "$0.99") in Vercel.
 * Without a code nothing is shown.
 */
export const DOWNSELL_CODE: string | null = (import.meta.env.VITE_GUMROAD_DOWNSELL_CODE as string | undefined)?.trim() || null;
export const DOWNSELL_PRICE: string = (import.meta.env.VITE_GUMROAD_DOWNSELL_PRICE as string | undefined)?.trim() || '$0.99';
/** Under the button. Must match the Subscription Terms (src/data/legalContent.ts → "Sponsor-jobs guarantee"). */
export const GUARANTEE = 'Not 10 visa-sponsor jobs in your field in 14 days? Full refund.';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: defaults apply */
  }
};

// --- Job pages opened by a non-member (distinct jobs, last 30 days) ----------------------
const VIEWS_KEY = 'mv:pwViews';
type Views = Record<string, number>;

/** Counts this job page; answers how many different jobs this browser opened (30 days), this one included. */
export function countJobView(jobId: string): number {
  const now = Date.now();
  const all = Object.fromEntries(Object.entries(read<Views>(VIEWS_KEY, {})).filter(([, at]) => now - at < 30 * 86_400_000));
  if (!(jobId in all)) all[jobId] = now;
  const keep = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 60);
  write(VIEWS_KEY, Object.fromEntries(keep));
  return keep.length;
}

// --- The free application -------------------------------------------------------------
const FREE_KEY = 'mv:freeApply';

/** Jobs this browser used its free application on. */
export function freeAppliedJobs(): string[] {
  const v = read<string[]>(FREE_KEY, []);
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}
export function freeAppliesLeft(): number {
  return Math.max(0, FREE_APPLIES - freeAppliedJobs().length);
}
/** Uses the free application on this job (true), or answers false when none is left. Re-opening the same job is free. */
export function spendFreeApply(jobId: string): boolean {
  const used = freeAppliedJobs();
  if (used.includes(jobId)) return true;
  if (used.length >= FREE_APPLIES) return false;
  write(FREE_KEY, [...used, jobId]);
  return true;
}

// --- The "first month for less" offer -------------------------------------------------
const DOWNSELL_KEY = 'mv:downsellAt';
/** Show the offer now? Once a week per browser, and only when a code is set. */
export function downsellDue(): boolean {
  if (!DOWNSELL_CODE) return false;
  return Date.now() - read<number>(DOWNSELL_KEY, 0) > 7 * 86_400_000;
}
export function markDownsellShown(): void {
  write(DOWNSELL_KEY, Date.now());
}

// --- Member quotes ---------------------------------------------------------------------
const EN_WORDS = new Set('i my me the a an to and of in on for with at it is was wasn’t it’s i’m job jobs work visa got from finally just now this that you your they we our more than not no but so'.split(' '));

/** Roughly: is this English? (A quote in Bahasa shown to someone from Brazil reads as fake.) */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z’']+/g) ?? [];
  if (words.length < 3) return true;
  const hits = words.filter((w) => EN_WORDS.has(w.replace(/'/g, '’'))).length;
  return hits / words.length >= 0.15;
}

/**
 * The quotes to rotate for a visitor: people from their country first (in any language — it's
 * their language too), then English ones. Quotes in other languages are left out.
 */
export function quotesFor<T extends Pick<Testimonial, 'headline' | 'from'>>(all: T[], country: string | null | undefined): T[] {
  const cc = (country ?? '').toUpperCase();
  const own = cc ? all.filter((t) => t.from.code.toUpperCase() === cc) : [];
  const english = all.filter((t) => !own.includes(t) && looksEnglish(t.headline));
  return [...own, ...english];
}

// --- How many people looked at a job today (job_view_ping, migration 20261231120000) ----
const pinged = new Map<string, Promise<number | null>>();

/** Counts this view once per page load and answers today's views (null when unknown). */
export function pingJobView(jobId: string): Promise<number | null> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Promise.resolve(null);
  let p = pinged.get(jobId);
  if (!p) {
    p = Promise.resolve(supabase.rpc('job_view_ping', { p_job: jobId }))
      .then(({ data, error }) => (error || typeof data !== 'number' ? null : data))
      .catch(() => null);
    pinged.set(jobId, p);
  }
  return p;
}

// --- Masking: what the popup shows of a locked detail ----------------------------------
/** "uma.arun@formue.no" → "u••••••@f•••••.no" — enough to see it's real, not enough to use. */
export function maskEmail(email: string | null | undefined): string | null {
  const m = (email ?? '').trim().match(/^([^@\s])[^@\s]*@([^@.\s])[^@\s]*?(\.[a-z]{2,})$/i);
  if (!m) return null;
  return `${m[1]}••••••@${m[2]}•••••${m[3]}`;
}

/** "asif.k@mail.com" → "as***@mail.com": who to write to, without the address (members see it). */
export function maskEmailShort(email: string | null | undefined): string | null {
  const m = (email ?? '').trim().match(/^([^@\s]{1,2})[^@\s]*@([^@\s]+\.[a-z]{2,})$/i);
  if (!m) return null;
  return `${m[1]}***@${m[2]}`;
}
