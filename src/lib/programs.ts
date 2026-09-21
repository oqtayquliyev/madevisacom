import { supabase } from '@/lib/supabase';
import type { EligibilityCriteria } from '@/lib/personalization';
import type { CostStatus, ListingStatus } from '@/lib/listingCategories';

export const PUBLISHING_CONTACT_EMAIL = 'hello@madevisa.com';

const programColumns =
  'id, publisher_id, title, description, category, country_id, city, citizenship_any, citizenship_allowed, citizenship_excluded, min_age, max_age, applications_open_at, applications_close_at, duration_text, eligibility_notes, benefits, funding_text, cost_status, cost_amount_min, cost_amount_max, cost_currency, requirements, spots_available, image_url, official_url, application_url, contact_email, status, admin_notes, source_verified, needs_info_message, created_at, approved_at, expires_at, publisher:program_publishers(id, name, org_type, logo_url, verification_status), country:countries(id, name, iso_code)';

export type OrgType = 'government' | 'company' | 'agency' | 'expert';

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
  city: string | null;
  citizenship_any: boolean;
  citizenship_allowed: string[] | null;
  citizenship_excluded: string[] | null;
  min_age: number | null;
  max_age: number | null;
  applications_open_at: string | null; // ISO date
  applications_close_at: string | null; // ISO date
  duration_text: string | null;
  eligibility_notes: string | null;
  benefits: string | null;
  funding_text: string | null;
  cost_status: CostStatus;
  cost_amount_min: number | null;
  cost_amount_max: number | null;
  cost_currency: string;
  requirements: string | null;
  spots_available: number | null;
  image_url: string | null;
  official_url: string | null;
  application_url: string | null;
  contact_email: string;
  status: ListingStatus;
  // Admin-only — never surfaced in public UI.
  admin_notes: string | null;
  source_verified: boolean;
  needs_info_message: string | null;
  created_at: string;
  approved_at: string | null;
  expires_at: string | null;
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
      programColumns
    )
    .eq('status', 'published')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
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

export async function fetchMyPrograms(publisherId: string): Promise<SponsoredProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select(
      programColumns
    )
    .eq('publisher_id', publisherId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchMyPrograms failed', error);
    return [];
  }
  return (data ?? []) as unknown as SponsoredProgram[];
}

export async function updateMyProgram(
  id: string,
  patch: Partial<Pick<SponsoredProgram, 'title' | 'description' | 'funding_text' | 'requirements' | 'official_url' | 'spots_available'>>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('programs').update(patch).eq('id', id);
  if (error) {
    console.error('updateMyProgram failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
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
  logoUrl?: string;
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
      logo_url: input.logoUrl || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('createPublisherProfile failed', error);
    return null;
  }
  return data;
}

/**
 * Re-sends a rejected/suspended publisher for review, reusing their
 * existing row (owners can already update their own row per RLS — see
 * program_publishers_update_owner) instead of inserting a second one,
 * which would break the one-row-per-owner assumption `fetchMyPublisherProfile`
 * relies on (`.maybeSingle()`).
 */
export async function resubmitPublisherProfile(
  id: string,
  updates: { orgType?: OrgType; name?: string; website?: string; countryId?: string; logoUrl?: string }
): Promise<ProgramPublisher | null> {
  const { data, error } = await supabase
    .from('program_publishers')
    .update({
      ...(updates.orgType ? { org_type: updates.orgType } : {}),
      ...(updates.name ? { name: updates.name } : {}),
      website: updates.website || null,
      country_id: updates.countryId || null,
      logo_url: updates.logoUrl || null,
      verification_status: 'pending',
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('resubmitPublisherProfile failed', error);
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
  city?: string;
  citizenshipAny: boolean;
  citizenshipAllowed?: string[];
  minAge?: number;
  maxAge?: number;
  applicationsOpenAt?: string;
  applicationsCloseAt?: string;
  fundingText?: string;
  requirements?: string;
  spotsAvailable?: number;
  officialUrl?: string;
  imageUrl?: string;
  /** The publisher's own contact email — shown to admins on review. */
  contactEmail?: string;
};

/** Submits a program for review. Lands as `status = 'pending'` until an admin publishes it. */
export async function submitSponsoredProgram(input: SubmitProgramInput): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('programs').insert({
    publisher_id: input.publisherId,
    title: input.title,
    description: input.description || null,
    category: input.category,
    country_id: input.countryId || null,
    city: input.city || null,
    citizenship_any: input.citizenshipAny,
    citizenship_allowed: input.citizenshipAny ? null : input.citizenshipAllowed ?? [],
    min_age: input.minAge ?? null,
    max_age: input.maxAge ?? null,
    applications_open_at: input.applicationsOpenAt || null,
    applications_close_at: input.applicationsCloseAt || null,
    funding_text: input.fundingText || null,
    requirements: input.requirements || null,
    spots_available: input.spotsAvailable ?? null,
    image_url: input.imageUrl || null,
    official_url: input.officialUrl || null,
    contact_email: input.contactEmail || PUBLISHING_CONTACT_EMAIL,
    status: 'pending',
  });

  if (error) {
    console.error('submitSponsoredProgram failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Fetches one published program by id — for the public program detail page. */
export async function fetchProgramById(id: string): Promise<SponsoredProgram | null> {
  const { data, error } = await supabase
    .from('programs')
    .select(
      programColumns
    )
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    console.error('fetchProgramById failed', error);
    return null;
  }
  return data as unknown as SponsoredProgram | null;
}

export type VerifiedExpert = Pick<ProgramPublisher, 'id' | 'name' | 'description' | 'website' | 'logo_url'> & {
  country?: Pick<CountryOption, 'id' | 'name' | 'iso_code'>;
};

/** Public-safe (no email/contact info) list of verified independent experts, for the Agencies & Experts marketplace. */
export async function fetchVerifiedExperts(): Promise<VerifiedExpert[]> {
  const { data, error } = await supabase
    .from('program_publishers')
    .select('id, name, description, website, logo_url, country:countries(id, name, iso_code)')
    .eq('org_type', 'expert')
    .eq('verification_status', 'verified')
    .order('name');
  if (error) {
    console.error('fetchVerifiedExperts failed', error);
    return [];
  }
  return (data ?? []) as unknown as VerifiedExpert[];
}

export type PublicAgency = {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  logo_url: string | null;
};

/** Public-safe (no email) list of verified travel agencies, for the Agencies & Experts marketplace. */
export async function fetchVerifiedAgenciesPublic(): Promise<PublicAgency[]> {
  const { data, error } = await supabase
    .from('agencies')
    .select('id, name, description, website, country, city, logo_url')
    .eq('verification_status', 'verified')
    .order('name');
  if (error) {
    console.error('fetchVerifiedAgenciesPublic failed', error);
    return [];
  }
  return data ?? [];
}

export type VerifiedPublisherName = { id: string; name: string; org_type: OrgType; logo_url: string | null };

/** All verified publishers (any org type) — for trust strips/logo grids. */
export async function fetchAllVerifiedPublisherNames(): Promise<VerifiedPublisherName[]> {
  const { data, error } = await supabase
    .from('program_publishers')
    .select('id, name, org_type, logo_url')
    .eq('verification_status', 'verified')
    .order('name');
  if (error) {
    console.error('fetchAllVerifiedPublisherNames failed', error);
    return [];
  }
  return data ?? [];
}
