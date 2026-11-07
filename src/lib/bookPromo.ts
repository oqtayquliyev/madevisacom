// The book promotion content (Admin → Book edits it), the visitor's profession, frequency
// controls and analytics. Analytics reuse the paywall counter (Admin → Paywall, "by source"):
// sources look like "book_<placement>_<profession>", so clicks and views can be compared by
// placement and by profession.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { trackPaywall, type PaywallKind } from '@/lib/paywallStats';
import { trackBilling } from '@/lib/billing';
import { readLastSearch } from '@/lib/lastSearch';
import { DEFAULT_BOOK_PROMO, matchProfession, type BookPromoContent, type ProfessionInsight } from '@/data/bookPromo';

let cache: BookPromoContent | null = null;
const listeners = new Set<(c: BookPromoContent) => void>();

export async function loadBookPromo(force = false): Promise<BookPromoContent> {
  if (cache && !force) return cache;
  try {
    const { data } = await supabase.from('book_promo').select('content').maybeSingle();
    const saved = (data?.content ?? {}) as Partial<BookPromoContent>;
    cache = { ...DEFAULT_BOOK_PROMO, ...saved, placements: { ...DEFAULT_BOOK_PROMO.placements, ...(saved.placements ?? {}) } };
  } catch {
    cache = DEFAULT_BOOK_PROMO;
  }
  listeners.forEach((f) => f(cache!));
  return cache;
}

export function useBookPromo(): BookPromoContent {
  const [c, setC] = useState<BookPromoContent>(cache ?? DEFAULT_BOOK_PROMO);
  useEffect(() => {
    listeners.add(setC);
    void loadBookPromo();
    return () => {
      listeners.delete(setC);
    };
  }, []);
  return c;
}

export async function saveBookPromo(content: BookPromoContent): Promise<string | null> {
  const { error } = await supabase.from('book_promo').upsert({ id: true, content, updated_at: new Date().toISOString() });
  if (error) return /book_promo|schema cache|does not exist/i.test(error.message) ? 'Run migration 20261231290000_book_promo.sql first.' : error.message;
  await loadBookPromo(true);
  return null;
}

// --- The visitor's profession ------------------------------------------------------------------
const PICK_KEY = 'mv:bookProfession';

/** Picked by the visitor, else guessed from their last job search. `source` says which. */
export function useProfession(insights: ProfessionInsight[]): { pick: ProfessionInsight | null; source: 'picked' | 'search' | null; choose: (id: string) => void } {
  const [id, setId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(PICK_KEY);
    } catch {
      return null;
    }
  });
  const picked = id ? insights.find((p) => p.id === id) ?? null : null;
  const searched = picked ? null : matchProfession(readLastSearch()?.q, insights);
  const choose = (v: string) => {
    setId(v || null);
    try {
      if (v) localStorage.setItem(PICK_KEY, v);
      else localStorage.removeItem(PICK_KEY);
    } catch {
      /* private mode */
    }
    if (v) trackBook('click', 'pick', v);
  };
  return { pick: picked ?? searched, source: picked ? 'picked' : searched ? 'search' : null, choose };
}

// --- Frequency ---------------------------------------------------------------------------------
const seenKey = (placement: string) => `mv:bookPromo:${placement}`;

/** May this placement show now? (Not within `days` of being shown or dismissed.) */
export function promoDue(placement: string, days: number): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(seenKey(placement)) ?? 0) > days * 86_400_000;
  } catch {
    return true;
  }
}
export function markPromo(placement: string): void {
  try {
    localStorage.setItem(seenKey(placement), String(Date.now()));
  } catch {
    /* private mode */
  }
}

// --- Analytics ---------------------------------------------------------------------------------
export function trackBook(kind: PaywallKind, placement: string, profession?: string | null): void {
  const source = ['book', placement, profession].filter(Boolean).join('_').replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 40);
  trackPaywall(kind, source);
  trackBilling(kind === 'shown' ? 'book_promo_shown' : 'book_promo_click', { placement, profession: profession ?? null });
}
