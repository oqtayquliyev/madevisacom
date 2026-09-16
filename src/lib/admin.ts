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

export type PendingAgency = {
  id: string;
  name: string;
  country: string | null;
  city: string | null;
  website: string | null;
  verification_status: string;
  created_at: string;
};

export async function fetchPendingPublishers(): Promise<PendingPublisher[]> {
  const { data, error } = await supabase
    .from('program_publishers')
    .select('id, org_type, name, website, contact_email, verification_status, created_at, country:countries(name, iso_code)')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingPublishers failed', error);
    return [];
  }
  return (data ?? []) as unknown as PendingPublisher[];
}

export async function fetchPendingPrograms(): Promise<PendingProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('id, title, category, status, created_at, publisher:program_publishers(name, org_type), country:countries(name, iso_code)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingPrograms failed', error);
    return [];
  }
  return (data ?? []) as unknown as PendingProgram[];
}

export async function fetchPendingAgencies(): Promise<PendingAgency[]> {
  const { data, error } = await supabase
    .from('agencies')
    .select('id, name, country, city, website, verification_status, created_at')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingAgencies failed', error);
    return [];
  }
  return data ?? [];
}

export async function setPublisherStatus(id: string, status: 'verified' | 'rejected') {
  const { error } = await supabase.from('program_publishers').update({ verification_status: status }).eq('id', id);
  if (error) console.error('setPublisherStatus failed', error);
  return !error;
}

export async function setProgramStatus(id: string, status: 'published' | 'rejected') {
  const { error } = await supabase.from('programs').update({ status }).eq('id', id);
  if (error) console.error('setProgramStatus failed', error);
  return !error;
}

export async function setAgencyStatus(id: string, status: 'verified' | 'rejected') {
  const { error } = await supabase.from('agencies').update({ verification_status: status }).eq('id', id);
  if (error) console.error('setAgencyStatus failed', error);
  return !error;
}
