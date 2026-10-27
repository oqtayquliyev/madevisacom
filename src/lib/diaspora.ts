// "7 people from Azerbaijan applied here through MadeVisa" — how many MadeVisa
// members with the visitor's nationality tracked an application to this company.
// diaspora_count() (migration 20261231120000) answers null below 3 people, so
// nobody can be singled out.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const cache = new Map<string, Promise<number | null>>();

export function useDiaspora(publisherId: string | null | undefined, country: string | null | undefined): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    setN(null);
    if (!publisherId || !country || !/^[A-Z]{2}$/i.test(country)) return;
    const key = `${publisherId}:${country.toUpperCase()}`;
    let p = cache.get(key);
    if (!p) {
      p = Promise.resolve(supabase.rpc('diaspora_count', { p_publisher: publisherId, p_country: country.toUpperCase() }))
        .then(({ data, error }) => (error || typeof data !== 'number' ? null : data))
        .catch(() => null);
      cache.set(key, p);
    }
    let alive = true;
    p.then((v) => alive && setN(v));
    return () => {
      alive = false;
    };
  }, [publisherId, country]);
  return n;
}
