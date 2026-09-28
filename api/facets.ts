// GET /api/facets → { total, countries: [{ name, iso, n }], categories: { label: n }, groups: { group: n }, computed_at }
//
// Real job counts for the /jobs filters (country and category), for every
// visitor — computed from ALL live jobs with the site's own category rules
// (src/lib/jobTaxonomy.ts), then cached at the edge for a day. Visitors
// never trigger a recount; at most about once a day per region.
// Node.js runtime (not edge): categorising tens of thousands of titles
// takes a few seconds of CPU.

import { classifyJob } from '../src/lib/jobTaxonomy';

type Row = [title: string, dept: string | null, iso: string | null, country: string | null, n: number];

export async function GET(): Promise<Response> {
  const base = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return Response.json({ error: 'not configured' }, { status: 500 });

  const res = await fetch(`${base}/rest/v1/rpc/job_facet_rows`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) return Response.json({ error: `database ${res.status}` }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  const data = (await res.json()) as { computed_at: string; rows: Row[] };

  let total = 0;
  const countries = new Map<string, { name: string; iso: string | null; n: number }>();
  const categories: Record<string, number> = {};
  const groups: Record<string, number> = {};
  for (const [title, dept, iso, country, n] of data.rows ?? []) {
    total += n;
    if (country) {
      const c = countries.get(country) ?? { name: country, iso, n: 0 };
      c.n += n;
      countries.set(country, c);
    }
    const cat = classifyJob(title ?? '', dept);
    if (cat) {
      categories[cat.label] = (categories[cat.label] ?? 0) + n;
      groups[cat.group] = (groups[cat.group] ?? 0) + n;
    }
  }

  return Response.json(
    { total, countries: [...countries.values()].sort((a, b) => b.n - a.n), categories, groups, computed_at: data.computed_at },
    // Browsers: 1 h. Edge: 1 day, then refreshed in the background.
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } }
  );
}
