// Sponsor Proof: a company's visa-sponsor record from official government data,
// shown on every job — not a promise in an ad, a public record.
//   UK  Home Office register of licensed sponsors        (public.uk_sponsors, daily)
//   NL  IND public register of recognised sponsors        (public.sponsor_registers, daily)
//   US  USCIS H-1B Employer Data Hub: approvals per year  (public.sponsor_registers, daily)
// sponsor_proof_for_publisher() (migration 20261231120000) matches the company by
// its normalised name. A match is reliable; no match only means "not found under
// this name", never "doesn't sponsor" — the page never claims that.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type SponsorRecord = {
  country: 'GB' | 'NL' | 'US' | string;
  /** The name as the register writes it. */
  name: string;
  city: string | null;
  /** UK: routes. NL: the IND category. US: approvals and the fiscal year. */
  detail: { routes?: string[]; rating?: string | null; category?: string | null; approvals?: number; new_approvals?: number; year?: number | null };
  source_url: string;
  checked: string | null;
};

export const REGISTER_NAME: Record<string, string> = {
  GB: 'UK Home Office register of licensed sponsors',
  NL: 'IND register of recognised sponsors (Netherlands)',
  US: 'USCIS H-1B Employer Data Hub',
};

/** One line per record: "UK licensed sponsor · Skilled Worker" / "US: 37 H-1B approvals (FY2024)". */
export function recordLine(r: SponsorRecord): string {
  if (r.country === 'US') {
    const n = r.detail.approvals ?? 0;
    return `US: ${n.toLocaleString('en-US')} H-1B approval${n === 1 ? '' : 's'}${r.detail.year ? ` (FY${r.detail.year})` : ''}`;
  }
  if (r.country === 'NL') return `Netherlands: recognised sponsor${r.detail.category ? ` · ${r.detail.category}` : ''}`;
  if (r.country === 'GB') {
    const routes = (r.detail.routes ?? []).filter(Boolean).slice(0, 2).join(', ');
    return `UK: licensed sponsor${routes ? ` · ${routes}` : ''}`;
  }
  return `${r.country}: ${r.name}`;
}

const cache = new Map<string, Promise<SponsorRecord[]>>();

export function fetchSponsorProof(publisherId: string): Promise<SponsorRecord[]> {
  let p = cache.get(publisherId);
  if (!p) {
    p = Promise.resolve(supabase.rpc('sponsor_proof_for_publisher', { p_publisher: publisherId }))
      .then(({ data, error }) => (error || !Array.isArray(data) ? [] : (data as SponsorRecord[])))
      .catch(() => []);
    cache.set(publisherId, p);
  }
  return p;
}

/** undefined while loading, [] when nothing was found. */
export function useSponsorProof(publisherId: string | null | undefined): SponsorRecord[] | undefined {
  const [v, setV] = useState<SponsorRecord[] | undefined>(publisherId ? undefined : []);
  useEffect(() => {
    if (!publisherId) return setV([]);
    let alive = true;
    setV(undefined);
    fetchSponsorProof(publisherId).then((r) => alive && setV(r));
    return () => {
      alive = false;
    };
  }, [publisherId]);
  return v;
}
