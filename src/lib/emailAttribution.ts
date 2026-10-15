// Email attribution, without personal data in links.
//
// Campaign, series and autopilot emails put two parameters on their links:
//   mc=<template>.<variant>   e.g. mc=nurture_1.a
//   mt=<token>                a random token for that one email (20 hex characters)
// On arrival the site reports the click once (email_click), removes both from the
// address bar (so they are not shared or bookmarked), and keeps the token for
// 30 days. After sign-in the token is linked to the account (email_attr_claim);
// anonymous steps such as an employer's listing are noted with noteEmailEvent().
// Purchases are credited on the server from confirmed Gumroad checkouts.
//
// Milestones (CV match viewed, pricing viewed, Pro prompt clicked) feed the
// lifecycle segments: noteMilestone(). Only the fact and the time are stored.

import { supabase } from '@/lib/supabase';

const KEY = 'mv:emailTouch';
const DAYS_30 = 30 * 86_400_000;

export type EmailTouch = { mt: string; mc: string | null; at: number; claimedBy?: string | null };

/** Read mc/mt from a URL. Exported for tests. */
export function readEmailParams(href: string): { mt: string | null; mc: string | null } {
  try {
    const u = new URL(href);
    const mt = u.searchParams.get('mt');
    const mc = u.searchParams.get('mc');
    return {
      mt: mt && /^[a-f0-9]{8,40}$/.test(mt) ? mt : null,
      mc: mc && /^[a-z0-9_]{1,60}\.[ab]$/.test(mc) ? mc : null,
    };
  } catch {
    return { mt: null, mc: null };
  }
}

/** The URL without mc/mt (everything else, including s= and #anchors, kept). Exported for tests. */
export function stripEmailParams(href: string): string {
  try {
    const u = new URL(href);
    if (!u.searchParams.has('mt') && !u.searchParams.has('mc')) return href;
    u.searchParams.delete('mt');
    u.searchParams.delete('mc');
    return u.pathname + (u.searchParams.toString() ? `?${u.searchParams.toString()}` : '') + u.hash;
  } catch {
    return href;
  }
}

function load(): EmailTouch | null {
  try {
    const t = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as EmailTouch | null;
    if (!t || typeof t.mt !== 'string' || Date.now() - t.at > DAYS_30) return null;
    return t;
  } catch {
    return null;
  }
}

function save(t: EmailTouch | null): void {
  try {
    if (t) window.localStorage.setItem(KEY, JSON.stringify(t));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode: attribution simply stays in this page view */
  }
}

let current: EmailTouch | null = null;

/** Call once on start. */
export function captureEmailClick(): void {
  if (typeof window === 'undefined') return;
  const { mt, mc } = readEmailParams(window.location.href);
  current = load();
  if (mt) {
    const unsub = window.location.pathname.startsWith('/alerts/unsubscribe');
    if (unsub) {
      // An unsubscribe is not a click: keep the token only for noting the unsubscribe.
      current = { mt, mc, at: Date.now(), claimedBy: null };
    } else {
      current = { mt, mc, at: Date.now(), claimedBy: null };
      save(current);
      void supabase.rpc('email_click', { p_track: mt, p_path: window.location.pathname }).then(() => undefined, () => undefined);
    }
    const clean = stripEmailParams(window.location.href);
    if (clean !== window.location.href) window.history.replaceState(window.history.state, '', clean);
  }
}

/** After sign-in or sign-up: link the email that brought this person (once per account). */
export function claimEmailTouch(userId: string | null | undefined): void {
  if (!userId) return;
  const t = current ?? load();
  if (!t || t.claimedBy === userId) return;
  current = { ...t, claimedBy: userId };
  save(current);
  void supabase.rpc('email_attr_claim', { p_track: t.mt }).then(() => undefined, () => undefined);
}

/** Something that happened after an email, without an account. */
export function noteEmailEvent(event: 'listing_submitted' | 'plan_request' | 'unsubscribed', track?: string | null): void {
  const mt = track && /^[a-f0-9]{8,40}$/.test(track) ? track : (current ?? load())?.mt;
  if (!mt) return;
  void supabase.rpc('email_touch_event', { p_track: mt, p_event: event }).then(() => undefined, () => undefined);
}

const noted = new Set<string>();
/** For the lifecycle segments; signed-in people only, once per page load. */
export function noteMilestone(key: 'cv_match_viewed' | 'pricing_viewed' | 'pro_prompt_clicked' | 'auto_apply_viewed' | 'paid_feature_used'): void {
  if (noted.has(key)) return;
  noted.add(key);
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) void supabase.rpc('note_milestone', { p_key: key }).then(() => undefined, () => undefined);
  });
}
