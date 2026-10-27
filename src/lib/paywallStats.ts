// Counts for Admin → Paywall: the membership popup being shown, and "Subscribe now"
// being pressed (paywall_track(), migration 20261231100000). No names or emails —
// only a random id kept in this browser, so people can be counted as well as views.

import { supabase } from '@/lib/supabase';

const KEY = 'mv:pwVisitor';

function visitorId(): string {
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `s${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

export type PaywallKind = 'shown' | 'click' | 'checkout_open' | 'downsell_shown' | 'downsell_click' | 'free_apply';

export function trackPaywall(kind: PaywallKind, source: string): void {
  try {
    void Promise.resolve(supabase.rpc('paywall_track', { p_visitor: visitorId(), p_kind: kind, p_source: source })).catch(() => undefined);
  } catch {
    /* counting must never break the page */
  }
}

export type PaywallDay = {
  day: string;
  shown: number;
  people: number;
  clicks: number;
  clickers: number;
  paid: number;
  /** Added by migration 20261231120000 (0 before it ran). */
  checkouts?: number;
  downsell_shown?: number;
  downsell_clicks?: number;
  free_applies?: number;
};
export type PaywallSource = { source: string; shown: number; people: number; clicks: number; clickers: number };

export async function fetchPaywallStats(days = 30): Promise<{ days: PaywallDay[]; by_source: PaywallSource[] } | { error: string }> {
  const { data, error } = await supabase.rpc('admin_paywall_stats', { p_days: days });
  if (error) return { error: /admin_paywall_stats|schema cache|does not exist/i.test(error.message) ? 'Run migration 20261231100000_paywall_stats.sql first.' : error.message };
  return (data ?? { days: [], by_source: [] }) as { days: PaywallDay[]; by_source: PaywallSource[] };
}
