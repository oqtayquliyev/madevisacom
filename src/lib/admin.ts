import { supabase } from '@/lib/supabase';
import type { OrgType } from '@/lib/programs';
import type { ListingStatus, SalaryStatus, SalaryPeriod, CostStatus } from '@/lib/listingCategories';

export type PendingPublisher = {
  id: string;
  org_type: OrgType;
  name: string;
  website: string | null;
  contact_email: string;
  verification_status: string;
  created_at: string;
  country?: { name: string; iso_code: string } | null;
};

export type PendingProgram = {
  id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  publisher?: { name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

export type PendingSponsoredJob = {
  id: string;
  title: string;
  category: string;
  employment_type: string;
  status: string;
  created_at: string;
  publisher?: { name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

export type PendingAgency = {
  id: string;
  name: string;
  email: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  verification_status: string;
  created_at: string;
};

const publisherColumns =
  'id, org_type, name, website, contact_email, verification_status, created_at, country:countries(name, iso_code)';
const programColumns =
  'id, title, category, status, created_at, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';
const sponsoredJobColumns =
  'id, title, category, employment_type, status, created_at, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';
const agencyColumns = 'id, name, email, country, city, website, verification_status, created_at';

export async function fetchPendingPublishers(): Promise<PendingPublisher[]> {
  const { data, error } = await supabase
    .from('program_publishers')
    .select(publisherColumns)
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingPublishers failed', error);
    return [];
  }
  return (data ?? []) as unknown as PendingPublisher[];
}

export async function fetchVerifiedPublishers(): Promise<PendingPublisher[]> {
  const { data, error } = await supabase
    .from('program_publishers')
    .select(publisherColumns)
    .eq('verification_status', 'verified')
    .order('name', { ascending: true });
  if (error) {
    console.error('fetchVerifiedPublishers failed', error);
    return [];
  }
  return (data ?? []) as unknown as PendingPublisher[];
}

export async function fetchPendingPrograms(): Promise<PendingProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select(programColumns)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingPrograms failed', error);
    return [];
  }
  return (data ?? []) as unknown as PendingProgram[];
}

export async function fetchPendingSponsoredJobs(): Promise<PendingSponsoredJob[]> {
  const { data, error } = await supabase
    .from('sponsored_jobs')
    .select(sponsoredJobColumns)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingSponsoredJobs failed', error);
    return [];
  }
  return (data ?? []) as unknown as PendingSponsoredJob[];
}

export async function fetchPendingAgencies(): Promise<PendingAgency[]> {
  const { data, error } = await supabase
    .from('agencies')
    .select(agencyColumns)
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingAgencies failed', error);
    return [];
  }
  return data ?? [];
}

export async function fetchVerifiedAgencies(): Promise<PendingAgency[]> {
  const { data, error } = await supabase
    .from('agencies')
    .select(agencyColumns)
    .eq('verification_status', 'verified')
    .order('name', { ascending: true });
  if (error) {
    console.error('fetchVerifiedAgencies failed', error);
    return [];
  }
  return data ?? [];
}

export type AdminProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

export type AdminProgram = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: ListingStatus;
  created_at: string;
  country_id: string | null;
  city: string | null;
  duration_text: string | null;
  eligibility_notes: string | null;
  benefits: string | null;
  funding_text: string | null;
  cost_status: CostStatus;
  cost_amount_min: number | null;
  cost_amount_max: number | null;
  cost_currency: string;
  requirements: string | null;
  official_url: string | null;
  application_url: string | null;
  image_url: string | null;
  spots_available: number | null;
  citizenship_any: boolean;
  citizenship_allowed: string[] | null;
  min_age: number | null;
  max_age: number | null;
  applications_open_at: string | null;
  applications_close_at: string | null;
  admin_notes: string | null;
  source_verified: boolean;
  needs_info_message: string | null;
  contact_email: string;
  publisher?: { name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

export type AdminSponsoredJob = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  employment_type: string;
  remote: boolean;
  status: ListingStatus;
  created_at: string;
  country_id: string | null;
  city: string | null;
  compensation_text: string | null;
  salary_status: SalaryStatus;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: SalaryPeriod;
  visa_sponsorship: boolean;
  experience_level: string | null;
  education_level: string | null;
  languages: string[] | null;
  application_deadline: string | null;
  benefits: string | null;
  requirements: string | null;
  official_url: string | null;
  application_url: string | null;
  image_url: string | null;
  citizenship_any: boolean;
  citizenship_allowed: string[] | null;
  min_age: number | null;
  max_age: number | null;
  admin_notes: string | null;
  source_verified: boolean;
  needs_info_message: string | null;
  contact_email: string;
  publisher?: { name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

const adminProgramColumns =
  'id, title, description, category, status, created_at, country_id, city, duration_text, eligibility_notes, benefits, funding_text, cost_status, cost_amount_min, cost_amount_max, cost_currency, requirements, official_url, application_url, image_url, spots_available, citizenship_any, citizenship_allowed, min_age, max_age, applications_open_at, applications_close_at, admin_notes, source_verified, needs_info_message, contact_email, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';
const adminSponsoredJobColumns =
  'id, title, description, category, employment_type, remote, status, created_at, country_id, city, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, visa_sponsorship, experience_level, education_level, languages, application_deadline, benefits, requirements, official_url, application_url, image_url, citizenship_any, citizenship_allowed, min_age, max_age, admin_notes, source_verified, needs_info_message, contact_email, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';

export async function fetchAllPrograms(): Promise<AdminProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select(adminProgramColumns)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchAllPrograms failed', error);
    return [];
  }
  return (data ?? []) as unknown as AdminProgram[];
}

export async function fetchAllSponsoredJobs(): Promise<AdminSponsoredJob[]> {
  const { data, error } = await supabase
    .from('sponsored_jobs')
    .select(adminSponsoredJobColumns)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchAllSponsoredJobs failed', error);
    return [];
  }
  return (data ?? []) as unknown as AdminSponsoredJob[];
}

export async function updateProgramAsAdmin(id: string, patch: Partial<AdminProgram>) {
  const { error } = await supabase.from('programs').update(patch).eq('id', id);
  if (error) console.error('updateProgramAsAdmin failed', error);
  return !error;
}

export async function updateSponsoredJobAsAdmin(id: string, patch: Partial<AdminSponsoredJob>) {
  const { error } = await supabase.from('sponsored_jobs').update(patch).eq('id', id);
  if (error) console.error('updateSponsoredJobAsAdmin failed', error);
  return !error;
}

export async function deleteProgram(id: string) {
  const { error } = await supabase.from('programs').delete().eq('id', id);
  if (error) console.error('deleteProgram failed', error);
  return !error;
}

export async function deleteSponsoredJob(id: string) {
  const { error } = await supabase.from('sponsored_jobs').delete().eq('id', id);
  if (error) console.error('deleteSponsoredJob failed', error);
  return !error;
}

export async function fetchAdmins(): Promise<AdminProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'admin')
    .order('full_name', { ascending: true });
  if (error) {
    console.error('fetchAdmins failed', error);
    return [];
  }
  return data ?? [];
}

export async function grantAdminByEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('grant_admin_by_email', { target_email: email.trim().toLowerCase() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function revokeAdminByEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('revoke_admin_by_email', { target_email: email.trim().toLowerCase() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setPublisherStatus(id: string, status: 'verified' | 'rejected' | 'suspended' | 'pending') {
  const { error } = await supabase.from('program_publishers').update({ verification_status: status }).eq('id', id);
  if (error) console.error('setPublisherStatus failed', error);
  return !error;
}

export async function updatePublisherName(id: string, name: string) {
  const { error } = await supabase.from('program_publishers').update({ name }).eq('id', id);
  if (error) console.error('updatePublisherName failed', error);
  return !error;
}

export async function updatePublisherContactEmail(id: string, contactEmail: string) {
  const { error } = await supabase.from('program_publishers').update({ contact_email: contactEmail }).eq('id', id);
  if (error) console.error('updatePublisherContactEmail failed', error);
  return !error;
}

export async function setProgramStatus(id: string, status: ListingStatus) {
  const { error } = await supabase.from('programs').update({ status }).eq('id', id);
  if (error) console.error('setProgramStatus failed', error);
  return !error;
}

export async function setSponsoredJobStatus(id: string, status: ListingStatus) {
  const { error } = await supabase.from('sponsored_jobs').update({ status }).eq('id', id);
  if (error) console.error('setSponsoredJobStatus failed', error);
  return !error;
}

export async function setAgencyStatus(id: string, status: 'verified' | 'rejected' | 'pending') {
  const { error } = await supabase.from('agencies').update({ verification_status: status }).eq('id', id);
  if (error) console.error('setAgencyStatus failed', error);
  return !error;
}

export async function updateAgencyName(id: string, name: string) {
  const { error } = await supabase.from('agencies').update({ name }).eq('id', id);
  if (error) console.error('updateAgencyName failed', error);
  return !error;
}
