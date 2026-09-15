import { supabase } from '@/lib/supabase';
import type { EligibilityCriteria } from '@/lib/personalization';

export const PUBLISHING_CONTACT_EMAIL = 'hello@madevisa.com';

export type OrgType = 'government' | 'company';

export type CountryOption = {
  id: string;
  name: string;
  iso_code: string;
};

export type ProgramPublisher = {
  id: string;
  owner_id: string | null;
  org_type: OrgType;
  name: string;
  description: string | null;
  website: string | null;
  contact_email: string;
  logo_url: string | null;
  country_id: string | null;
  verification_status: 'pending' | 'verified' | 'rejected' | 'suspended';
};

export type SponsoredProgram = {
  id: string;
  publisher_id: string;
  title: string;
  description: string | null;
  category: string;
  country_id: string | null;
  citizenship_any: boolean;
  citizenship_allowed: string[] | null;
  citizenship_excluded: string[] | null;
  min_age: number | null;
  max_age: number | null;
  applications_open_at: string | null; // ISO date
  applications_close_at: string | null; // ISO date
  funding_text: string | null;
  official_url: string | null;
  contact_email: string;
  status: 'pending' | 'published' | 'rejected';
  // joined
  publisher?: Pick<ProgramPublisher, 'id' | 'name' | 'org_type' | 'logo_url' | 'verification_status'>;
  country?: Pick<CountryOption, 'id' | 'name' | 'iso_code'>;
};

/** Converts a program's stored eligibility columns into the shared EligibilityCriteria shape. */
export function toEligibilityCriteria(program: SponsoredProgram): EligibilityCriteria {
  return {
    citizenship: program.citizenship_any ? 'any' : program.citizenship_allowed ?? [],
    excludedCitizenship: program.citizenship_excluded ?? undefined,
    minAge: program.min_age ?? undefined,
    maxAge: program.max_age ?? undefined,
    currentLocation: 'any',
  };
}

export type ApplicationWindowStatus = 'open' | 'upcoming' | 'closed' | 'rolling';

/** Independent of the visitor's profile — just: can anyone apply right now? */
export function getApplicationWindowStatus(program: SponsoredProgram): ApplicationWindowStatus {
  const today = new Date().toISOString().slice(0, 10);

  if (!program.applications_open_at && !program.applications_close_at) return 'rolling';
  if (program.applications_open_at && today < program.applications_open_at) return 'upcoming';
  if (program.applications_close_at && today > program.applications_close_at) return 'closed';
  return 'open';
}

export async function fetchCountries(): Promise<CountryOption[]> {
  const { data, error } = await supabase
    .from('countries')
    .select('id, name, iso_code')
    .order('name');
  if (error) {
    console.error('fetchCountries failed', error);
    return [];
  }
  return data ?? [];
}

export type ProgramFilters = {
  search?: string;
  countryId?: string;
  orgType?: OrgType;
};

export async function fetchSponsoredPrograms(filters: ProgramFilters = {}): Promise<SponsoredProgram[]> {
  let query = supabase
    .from('programs')
    .select(
      'id, publisher_id, title, description, category, country_id, citizenship_any, citizenship_allowed, citizenship_excluded, min_age, max_age, applications_open_at, applications_close_at, funding_text, official_url, contact_email, status, publisher:program_publishers(id, name, org_type, logo_url, verification_status), country:countries(id, name, iso_code)'
    )
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (filters.countryId) query = query.eq('country_id', filters.countryId);
  if (filters.search) query = query.ilike('title', `%${filters.search}%`);

  const { data, error } = await query;
  if (error) {
    console.error('fetchSponsoredPrograms failed', error);
    return [];
  }

  // org_type filter applied client-side (joined column, keeps the query simple)
  const rows = (data ?? []) as unknown as SponsoredProgram[];
  return filters.orgType ? rows.filter((p) => p.publisher?.org_type === filters.orgType) : rows;
}

export async function fetchMyPublisherProfile(userId: string): Promise<ProgramPublisher | null> {
  const { data, error } = await supabase
    .from('program_publishers')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) {
    console.error('fetchMyPublisherProfile failed', error);
    return null;
  }
  return data;
}

export async function createPublisherProfile(input: {
  ownerId: string;
  orgType: OrgType;
  name: string;
  website?: string;
  countryId?: string;
  contactEmail?: string;
}): Promise<ProgramPublisher | null> {
  const { data, error } = await supabase
    .from('program_publishers')
    .insert({
      owner_id: input.ownerId,
      org_type: input.orgType,
      name: input.name,
      website: input.website || null,
      country_id: input.countryId || null,
      contact_email: input.contactEmail || PUBLISHING_CONTACT_EMAIL,
    })
    .select('*')
    .single();

  if (error) {
    console.error('createPublisherProfile failed', error);
    return null;
  }
  return data;
}

export type SubmitProgramInput = {
  publisherId: string;
  title: string;
  description?: string;
  category: string;
  countryId?: string;
  citizenshipAny: boolean;
  citizenshipAllowed?: string[];
  minAge?: number;
  maxAge?: number;
  applicationsOpenAt?: string;
  applicationsCloseAt?: string;
  fundingText?: string;
  officialUrl?: string;
};

/** Submits a program for review. Lands as `status = 'pending'` until an admin publishes it. */
export async function submitSponsoredProgram(input: SubmitProgramInput): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('programs').insert({
    publisher_id: input.publisherId,
    title: input.title,
    description: input.description || null,
    category: input.category,
    country_id: input.countryId || null,
    citizenship_any: input.citizenshipAny,
    citizenship_allowed: input.citizenshipAny ? null : input.citizenshipAllowed ?? [],
    min_age: input.minAge ?? null,
    max_age: input.maxAge ?? null,
    applications_open_at: input.applicationsOpenAt || null,
    applications_close_at: input.applicationsCloseAt || null,
    funding_text: input.fundingText || null,
    official_url: input.officialUrl || null,
    contact_email: PUBLISHING_CONTACT_EMAIL,
    status: 'pending',
  });

  if (error) {
    console.error('submitSponsoredProgram failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
