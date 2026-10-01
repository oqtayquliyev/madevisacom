// Is a company on the UK Home Office register of licensed sponsors?
// Data: public.uk_sponsors, refreshed daily (migration 20261117090000).
// Matching is exact on a normalised company name, so a match is reliable;
// no match only means "not found under this name", never "doesn't sponsor".

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type UkSponsor = { name: string; city: string | null; rating: string | null; routes: string[]; checked: string | null };

export const UK_REGISTER_URL = 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';

const cache = new Map<string, Promise<UkSponsor | null>>();

export function fetchUkSponsor(publisherId: string): Promise<UkSponsor | null> {
  let p = cache.get(publisherId);
  if (!p) {
    p = Promise.resolve(supabase.rpc('uk_sponsor_for_publisher', { p_publisher: publisherId })).then(({ data, error }) => (error || !data ? null : (data as UkSponsor)));
    cache.set(publisherId, p);
  }
  return p;
}

/** undefined while loading, null when not on the register (or unknown). */
export function useUkSponsor(publisherId: string | null | undefined): UkSponsor | null | undefined {
  const [v, setV] = useState<UkSponsor | null | undefined>(publisherId ? undefined : null);
  useEffect(() => {
    if (!publisherId) return setV(null);
    let alive = true;
    setV(undefined);
    fetchUkSponsor(publisherId).then((s) => alive && setV(s));
    return () => {
      alive = false;
    };
  }, [publisherId]);
  return v;
}
