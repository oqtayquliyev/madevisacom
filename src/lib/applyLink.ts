// The company's apply address for one job, from the server (job_apply_link, migration
// 20261231160000_free_accounts_apply.sql). Any signed-in account gets it (free or paid), as do
// the job's own company and admins. Signed-out visitors are asked to sign up first. The address
// is never in the page for anyone else — not in the HTML, not in the data.

import { supabase } from '@/lib/supabase';
import { visitorId } from '@/lib/paywallStats';

export type ApplyLink =
  | { kind: 'open'; url: string | null; contact: string | null; why: 'member' | 'owner' | 'free' }
  | { kind: 'locked'; freeLeft: number }
  | { kind: 'error' };

/**
 * `spend: true` uses the free application when there is one (pressing Apply);
 * without it, this only answers whether the link is already open to this person.
 */
export async function fetchApplyLink(jobId: string, opts: { spend?: boolean } = {}): Promise<ApplyLink> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { kind: 'error' };
  try {
    const { data, error } = await supabase.rpc('job_apply_link', { p_job: jobId, p_visitor: visitorId(), p_free: Boolean(opts.spend) });
    if (error || !data || typeof data !== 'object') return { kind: 'error' };
    const d = data as { url?: string | null; contact?: string | null; why?: string; locked?: boolean; free_left?: number };
    if (d.locked) return { kind: 'locked', freeLeft: Number(d.free_left ?? 0) };
    const url = typeof d.url === 'string' && /^https?:\/\//i.test(d.url) ? d.url : null;
    return { kind: 'open', url, contact: d.contact ?? null, why: d.why === 'owner' ? 'owner' : d.why === 'free' ? 'free' : 'member' };
  } catch {
    return { kind: 'error' };
  }
}
