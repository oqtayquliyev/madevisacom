import { supabase } from '@/lib/supabase';

/** A company on /network: sponsors visas, and MadeVisa has a contact email for it. */
export type RecruiterCompany = {
  id: string;
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
};

export async function fetchRecruiterCompanies(): Promise<RecruiterCompany[] | null> {
  const { data, error } = await supabase.rpc('recruiter_companies');
  if (error || !Array.isArray(data)) return null;
  return data as RecruiterCompany[];
}
