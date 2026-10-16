import { supabase } from '@/lib/supabase';

/** A company on /network: MadeVisa has a contact email for it (company address, its job ads, or Outreach employer contacts). */
export type RecruiterCompany = {
  /** The company id, or "c:…" for an Outreach contact not linked to a MadeVisa company. */
  id: string;
  /** Set when it's a company on MadeVisa (has a page and maybe jobs). */
  publisher_id: string | null;
  name: string;
  logo_url: string | null;
  website: string | null;
  country: string | null;
  country_code: string | null;
  /** Live jobs on MadeVisa, and how many of them offer visa sponsorship. */
  jobs: number;
  sponsored: number;
  /** Countries of the sponsored jobs (ISO codes, up to 6). */
  countries: string[];
  /** Up to 3 contact emails: the company's own address first, then ones from its job ads. */
  emails: string[];
  /** All addresses known for it (only the first 3 are shown). */
  email_count: number;
};

export async function fetchRecruiterCompanies(): Promise<RecruiterCompany[] | null> {
  const { data, error } = await supabase.rpc('recruiter_companies');
  if (error || !Array.isArray(data)) return null;
  return data as RecruiterCompany[];
}
