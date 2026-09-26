import { supabase } from '@/lib/supabase';
import type { FoundCompany } from '@/lib/companyFinder';

/**
 * Companies the finder couldn't place yet — kept (admin-only) so you can
 * add their career page by hand later from the Import Center.
 * Table: company_leads (migration 20261015090000).
 */
export type LeadReason = 'nopage' | 'blocked' | 'error' | 'lowconf' | 'nojobs';

export type CompanyLead = {
  id: string;
  qid: string | null;
  name: string;
  website: string | null;
  domain: string | null;
  country_code: string | null;
  employees: number | null;
  industry: string | null;
  icons: string[];
  reason: LeadReason;
  note: string | null;
  candidate_url: string | null;
  created_at: string;
};

export const LEAD_REASON_LABEL: Record<LeadReason, string> = {
  nopage: 'No career page with jobs',
  blocked: 'Website didn’t load',
  error: 'Search failed',
  lowconf: 'Unsure match — check',
  nojobs: 'Added page had no jobs',
};

let tableMissing = false;
export const leadsTableMissing = () => tableMissing;

function missing(error: { message?: string; code?: string } | null) {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || /company_leads/.test(error.message ?? '')));
}

export async function fetchCompanyLeads(): Promise<CompanyLead[]> {
  const out: CompanyLead[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await supabase
      .from('company_leads')
      .select('id, qid, name, website, domain, country_code, employees, industry, icons, reason, note, candidate_url, created_at')
      .order('country_code', { ascending: true })
      .order('employees', { ascending: false, nullsFirst: false })
      .range(from, from + 999);
    if (error) {
      tableMissing = missing(error);
      if (!tableMissing) console.error('fetchCompanyLeads failed', error);
      return out;
    }
    tableMissing = false;
    out.push(...((data ?? []) as CompanyLead[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Saves (or refreshes) leads; the same Wikidata company is stored once. */
export async function saveCompanyLeads(
  items: { company: FoundCompany; name?: string; icons: string[]; reason: LeadReason; note?: string | null; candidateUrl?: string | null }[]
): Promise<{ ok: boolean; error?: string }> {
  if (!items.length || tableMissing) return { ok: !tableMissing, error: tableMissing ? 'Run the company_leads migration first.' : undefined };
  const rows = items.map((i) => ({
    qid: i.company.qid || null,
    name: (i.name ?? i.company.name).trim(),
    website: i.company.website || null,
    domain: i.company.domain || null,
    country_code: i.company.country,
    employees: i.company.employees,
    industry: i.company.industry,
    icons: i.icons.slice(0, 6),
    reason: i.reason,
    note: i.note ?? null,
    candidate_url: i.candidateUrl ?? null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('company_leads').upsert(rows, { onConflict: 'qid' });
  if (error) {
    tableMissing = missing(error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteCompanyLead(id: string) {
  const { error } = await supabase.from('company_leads').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Removes leads for companies that were just added properly. */
export async function deleteCompanyLeadsByQid(qids: string[]) {
  if (!qids.length || tableMissing) return;
  await supabase.from('company_leads').delete().in('qid', qids);
}

/** Leads as the finder's company shape, for re-checking / adding. */
export function leadToCompany(l: CompanyLead): FoundCompany {
  return {
    qid: l.qid ?? l.id,
    name: l.name,
    wikiTitle: null,
    website: l.website ?? '',
    domain: l.domain ?? '',
    employees: l.employees,
    industry: l.industry,
    country: l.country_code,
  };
}
