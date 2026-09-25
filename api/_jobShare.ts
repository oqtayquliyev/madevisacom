// Shared by api/og/job.ts (share image) and middleware.ts (share tags).
// Reads one PUBLISHED job via Supabase's public REST API (anon key — the
// same read access the website itself has).

export type ShareJob = {
  id: string;
  title: string;
  company: string;
  logo: string | null;
  location: string | null;
  countryCode: string | null;
  salary: string | null;
  type: string | null;
  workArrangement: string | null;
  experience: string | null;
  visa: boolean;
  postedAt: string | null;
};

/** /jobs/<company>/<title>-<8 hex>  or  /jobs/sponsored-<uuid>  →  id prefix / uuid */
export function jobIdFromPath(pathname: string): string | null {
  const uuid = pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (uuid) return uuid.toLowerCase();
  return pathname.match(/-([0-9a-f]{8})\/?$/i)?.[1]?.toLowerCase() ?? null;
}

export function isMeaningfulSalary(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (!t || t === '[object Object]' || /^(n\/?a|none|null|tbd|-+)$/i.test(t)) return false;
  return /[1-9]/.test(t);
}

const env = (k: string) => (typeof process !== 'undefined' ? process.env[k] : undefined);

export async function fetchShareJob(id: string): Promise<ShareJob | null> {
  const base = env('VITE_SUPABASE_URL') ?? env('SUPABASE_URL');
  const key = env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_ANON_KEY');
  if (!base || !key) return null;
  const idFilter = id.length === 36 ? `id=eq.${id}` : `id=gte.${id}-0000-0000-0000-000000000000&id=lte.${id}-ffff-ffff-ffff-ffffffffffff`;
  const cols = (extra: boolean) =>
    `id,title,compensation_text,salary_status,employment_type,remote,city,source_posted_at,approved_at,experience_level,image_url,visa_sponsorship${
      extra ? ',work_arrangement,visa_status' : ''
    },publisher:program_publishers(name,logo_url),country:countries(name,iso_code)`;
  const get = (extra: boolean) =>
    fetch(`${base}/rest/v1/sponsored_jobs?select=${cols(extra)}&status=eq.published&${idFilter}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  let res = await get(true);
  if (!res.ok) res = await get(false); // before the work_arrangement migration
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = ((await res.json()) as any[])[0];
  if (!row) return null;
  const location = [row.city, row.country?.name].filter(Boolean).join(', ') || (row.remote ? 'Remote' : null);
  const wa = row.work_arrangement as string | null;
  return {
    id: row.id,
    title: row.title,
    company: row.publisher?.name ?? 'Company',
    logo: row.image_url ?? row.publisher?.logo_url ?? null,
    location,
    countryCode: row.country?.iso_code ?? null,
    salary: isMeaningfulSalary(row.compensation_text) ? String(row.compensation_text) : null,
    type: row.employment_type && row.employment_type !== 'Other' ? row.employment_type : null,
    workArrangement: wa === 'onsite' ? 'On-site' : wa === 'hybrid' ? 'Hybrid' : wa === 'remote' || row.remote ? 'Remote' : null,
    experience: row.experience_level ?? null,
    visa: row.visa_status === 'offered' || row.visa_sponsorship === true,
    postedAt: row.source_posted_at ?? row.approved_at ?? null,
  };
}

export function postedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `Posted ${months} month${months === 1 ? '' : 's'} ago` : `Posted over a year ago`;
}

export function shareDescription(j: ShareJob): string {
  return [j.company, j.location, j.salary, j.type, j.workArrangement, j.visa ? 'Visa sponsorship' : null]
    .filter(Boolean)
    .join(' · ')
    .concat(' — apply on MadeVisa.');
}
