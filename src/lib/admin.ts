import { supabase } from '@/lib/supabase';
import type { OrgType } from '@/lib/programs';

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
  status: string;
  created_at: string;
  funding_text: string | null;
  requirements: string | null;
  official_url: string | null;
  spots_available: number | null;
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
  status: string;
  created_at: string;
  compensation_text: string | null;
  requirements: string | null;
  official_url: string | null;
  publisher?: { name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

const adminProgramColumns =
  'id, title, description, category, status, created_at, funding_text, requirements, official_url, spots_available, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';
const adminSponsoredJobColumns =
  'id, title, description, category, employment_type, remote, status, created_at, compensation_text, requirements, official_url, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';

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

export async function updateProgramAsAdmin(
  id: string,
  patch: Partial<Pick<AdminProgram, 'title' | 'description' | 'category' | 'funding_text' | 'requirements' | 'official_url' | 'spots_available' | 'status'>>
) {
  const { error } = await supabase.from('programs').update(patch).eq('id', id);
  if (error) console.error('updateProgramAsAdmin failed', error);
  return !error;
}

export async function updateSponsoredJobAsAdmin(
  id: string,
  patch: Partial<Pick<AdminSponsoredJob, 'title' | 'description' | 'category' | 'employment_type' | 'remote' | 'compensation_text' | 'requirements' | 'official_url' | 'status'>>
) {
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

export async function setProgramStatus(id: string, status: 'published' | 'rejected') {
  const { error } = await supabase.from('programs').update({ status }).eq('id', id);
  if (error) console.error('setProgramStatus failed', error);
  return !error;
}

export async function setSponsoredJobStatus(id: string, status: 'published' | 'rejected') {
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
