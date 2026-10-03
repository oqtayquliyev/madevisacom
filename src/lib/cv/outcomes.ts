// What has happened to sponsorship documents made on MadeVisa — counted from
// the site's own records (migration 20261129090000), never estimated.
//
// The server only answers once there are enough documents for the shares to
// mean something; until then (or before the migration is run) this is null
// and the pages simply don't show a results line.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type Outcomes = {
  /** Documents made at least a week ago (staff and withdrawn ones left out). */
  made: number;
  /** Opened by someone other than the candidate. */
  opened: number;
  /** The employer answered (through the document, or the candidate marked a reply). */
  replied: number;
  /** The candidate marked an interview or an offer. */
  interview: number;
  offer: number;
};

let memo: Promise<Outcomes | null> | null = null;

function load(): Promise<Outcomes | null> {
  memo ??= (async () => {
    try {
      const { data, error } = await supabase.rpc('brief_outcomes');
      const v = data as (Partial<Outcomes> & { enough?: boolean }) | null;
      if (error || !v || !v.enough || !v.made) return null;
      return { made: v.made, opened: v.opened ?? 0, replied: v.replied ?? 0, interview: v.interview ?? 0, offer: v.offer ?? 0 };
    } catch {
      return null;
    }
  })();
  return memo;
}

export function useOutcomes(): Outcomes | null {
  const [v, setV] = useState<Outcomes | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((x) => alive && setV(x));
    return () => {
      alive = false;
    };
  }, []);
  return v;
}
