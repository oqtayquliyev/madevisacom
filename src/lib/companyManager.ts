// Company managers: people an admin gave access to one company (e.g.
// hr@netflix.com → Netflix). What they can do is enforced in the database
// (see the 20260924090000 migration): RLS limits them to their company's
// rows, and triggers decide whether their changes publish immediately
// (`can_publish`) or go to MadeVisa review.

import { supabase } from '@/lib/supabase';
import type { OrgType } from '@/lib/programs';
import type { ListingStatus } from '@/lib/listingCategories';

export type ManagedPublisher = {
  id: string;
  name: string;
  org_type: OrgType;
  logo_url: string | null;
  website: string | null;
  description: string | null;
  contact_email: string;
  verification_status: string;
  is_owner: boolean;
  can_publish: boolean;
};

let cache: { userId: string; data: ManagedPublisher[] } | null = null;

export async function fetchMyManagedPublishers(force = false): Promise<ManagedPublisher[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  if (!force && cache?.userId === userId) return cache.data;
  const { data, error } = await supabase.rpc('my_managed_publishers');
  if (error) {
    // Before the migration runs the RPC doesn't exist — just show nothing.
    console.warn('my_managed_publishers failed', error.message);
    return [];
  }
  cache = { userId, data: (data ?? []) as ManagedPublisher[] };
  return cache.data;
}

export async function updateManagedPublisher(
  id: string,
  patch: Partial<Pick<ManagedPublisher, 'description' | 'website' | 'logo_url' | 'contact_email'>>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('program_publishers').update(patch).eq('id', id);
  cache = null;
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type CompanyJobInput = {
  title: string;
  description: string;
  employment_type: string;
  job_function: string;
  country_id: string;
  city: string;
  remote: boolean;
  visa_sponsorship: boolean;
  compensation_text: string;
  application_deadline: string;
  official_url: string;
};

export type CompanyProgramInput = {
  title: string;
  description: string;
  category: string;
  country_id: string;
  city: string;
  applications_open_at: string;
  applications_close_at: string;
  funding_text: string;
  official_url: string;
  spots_available: string;
};

const blankToNull = (v: string) => (v.trim() ? v.trim() : null);

/** Creates or updates a job. Asks for 'published'; the database turns that into 'pending' unless this manager can publish directly. */
export async function saveCompanyJob(publisherId: string, input: CompanyJobInput, id?: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const row = {
    publisher_id: publisherId,
    title: input.title.trim(),
    description: input.description || null,
    category: input.employment_type,
    employment_type: input.employment_type,
    job_function: blankToNull(input.job_function),
    country_id: blankToNull(input.country_id),
    city: blankToNull(input.city),
    remote: input.remote,
    visa_sponsorship: input.visa_sponsorship,
    compensation_text: blankToNull(input.compensation_text),
    salary_status: input.compensation_text.trim() ? 'disclosed' : 'not_disclosed',
    application_deadline: blankToNull(input.application_deadline),
    official_url: blankToNull(input.official_url),
    status: 'published' as ListingStatus,
  };
  const q = id
    ? supabase.from('sponsored_jobs').update(row).eq('id', id).select('status').single()
    : supabase.from('sponsored_jobs').insert(row).select('status').single();
  const { data, error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true, status: data?.status };
}

export async function saveCompanyProgram(publisherId: string, input: CompanyProgramInput, id?: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const spots = parseInt(input.spots_available, 10);
  const row = {
    publisher_id: publisherId,
    title: input.title.trim(),
    description: input.description || null,
    category: input.category,
    country_id: blankToNull(input.country_id),
    city: blankToNull(input.city),
    applications_open_at: blankToNull(input.applications_open_at),
    applications_close_at: blankToNull(input.applications_close_at),
    funding_text: blankToNull(input.funding_text),
    official_url: blankToNull(input.official_url),
    spots_available: Number.isFinite(spots) ? spots : null,
    status: 'published' as ListingStatus,
  };
  const q = id
    ? supabase.from('programs').update(row).eq('id', id).select('status').single()
    : supabase.from('programs').insert(row).select('status').single();
  const { data, error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true, status: data?.status };
}

export async function setCompanyListingStatus(kind: 'job' | 'program', id: string, status: ListingStatus): Promise<{ ok: boolean; status?: string; error?: string }> {
  const { data, error } = await supabase
    .from(kind === 'job' ? 'sponsored_jobs' : 'programs')
    .update({ status })
    .eq('id', id)
    .select('status')
    .single();
  return error ? { ok: false, error: error.message } : { ok: true, status: data?.status };
}

export async function deleteCompanyListing(kind: 'job' | 'program', id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from(kind === 'job' ? 'sponsored_jobs' : 'programs').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
