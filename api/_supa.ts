// Small Supabase REST reads for share images and link-preview tags
// (anon key — the same public read access the website has). No heavy
// imports here, so middleware.ts can use it too.

const env = (k: string) => (typeof process !== 'undefined' ? process.env[k] : undefined);
function supa(): { base: string; key: string } | null {
  const base = env('VITE_SUPABASE_URL') ?? env('SUPABASE_URL');
  const key = env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_ANON_KEY');
  return base && key ? { base, key } : null;
}

export async function restGet<T>(path: string): Promise<T | null> {
  const s = supa();
  if (!s) return null;
  try {
    const res = await fetch(`${s.base}/rest/v1/${path}`, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, signal: AbortSignal.timeout(3000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function rpc<T>(name: string, body: Record<string, unknown> = {}): Promise<T | null> {
  const s = supa();
  if (!s) return null;
  try {
    const res = await fetch(`${s.base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Exact row count for a sponsored_jobs filter, e.g. "status=eq.published". Null if unavailable. */
export async function countJobs(filter: string): Promise<number | null> {
  const s = supa();
  if (!s) return null;
  try {
    const res = await fetch(`${s.base}/rest/v1/sponsored_jobs?select=id&${filter}`, {
      method: 'HEAD',
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, Prefer: 'count=exact', Range: '0-0' },
      signal: AbortSignal.timeout(3000),
    });
    const n = Number(res.headers.get('content-range')?.split('/')[1]);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Live (published, not expired) jobs, plus an optional extra filter. */
export const liveFilter = (extra = '') => `status=eq.published&or=(expires_at.is.null,expires_at.gt.${new Date().toISOString()})${extra ? `&${extra}` : ''}`;

export const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- Profiles and companies for share cards ---------------------------------

export type ShareProfile = {
  username: string;
  name: string;
  avatar: string | null;
  headline: string | null;
  intent: 'hiring' | 'looking' | null;
  role: string | null;
  company: string | null;
  companyVerified: boolean;
  tracked: number;
  replies: number;
  interviews: number;
  offers: number;
};

type ProfileRow = {
  full_name: string | null;
  avatar_url: string | null;
  username: string;
  publisher_name: string | null;
  publisher_verification_status: string | null;
  network_role?: string | null;
  network_intent?: 'hiring' | 'looking' | null;
  network_headline?: string | null;
};
type AppRow = { status: string; responded_at: string | null };

export async function fetchShareProfile(username: string): Promise<ShareProfile | null> {
  const u = username.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
  if (!u) return null;
  const [rows, apps] = await Promise.all([
    rpc<ProfileRow[]>('get_public_profile_by_username', { p_username: u }),
    rpc<AppRow[]>('get_public_applications', { p_username: u }),
  ]);
  const p = rows?.[0];
  if (!p) return null;
  const list = apps ?? [];
  return {
    username: p.username,
    name: p.full_name?.trim() || p.username,
    avatar: p.avatar_url,
    headline: p.network_headline ?? null,
    intent: p.network_intent ?? null,
    role: p.network_role ?? null,
    company: p.publisher_name,
    companyVerified: p.publisher_verification_status === 'verified',
    tracked: list.length,
    replies: list.filter((a) => a.responded_at || ['responded', 'interview', 'offer', 'rejected'].includes(a.status)).length,
    interviews: list.filter((a) => a.status === 'interview' || a.status === 'offer').length,
    offers: list.filter((a) => a.status === 'offer').length,
  };
}

export type ShareCompany = {
  id: string;
  name: string;
  logo: string | null;
  verified: boolean;
  country: string | null;
  openJobs: number | null;
  visaJobs: number | null;
  replyRate: number | null;
  tracked: number;
};

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** /companies/<slug>-<8 hex> or a full uuid → the company with live numbers. */
export async function fetchShareCompany(slug: string): Promise<ShareCompany | null> {
  const full = slug.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)?.[0]?.toLowerCase();
  const prefix = full ? null : slug.match(/([0-9a-f]{8})\/?$/i)?.[1]?.toLowerCase();
  if (!full && !prefix) return null;
  const idFilter = full ? `id=eq.${full}` : `id=gte.${prefix}-0000-0000-0000-000000000000&id=lte.${prefix}-ffff-ffff-ffff-ffffffffffff`;
  const rows = await restGet<{ id: string; name: string; logo_url: string | null; verification_status: string | null; country: { name: string } | null }[]>(
    `program_publishers?select=id,name,logo_url,verification_status,country:countries(name)&${idFilter}&limit=5`
  );
  if (!rows?.length) return null;
  const nameSlug = slug.replace(/-?[0-9a-f]{8}\/?$/i, '');
  const c = rows.find((r) => slugify(r.name) === nameSlug) ?? rows[0];
  const [open, visa, rates] = await Promise.all([
    countJobs(liveFilter(`publisher_id=eq.${c.id}`)),
    countJobs(liveFilter(`publisher_id=eq.${c.id}&visa_sponsorship=eq.true`)),
    rpc<{ tracked: number; response_rate: number | null }[]>('company_response_rates', { pids: [c.id] }),
  ]);
  const r = rates?.[0];
  return {
    id: c.id,
    name: c.name,
    logo: c.logo_url,
    verified: c.verification_status === 'verified',
    country: c.country?.name ?? null,
    openJobs: open,
    visaJobs: visa,
    replyRate: r?.response_rate == null ? null : Number(r.response_rate),
    tracked: r?.tracked ?? 0,
  };
}
