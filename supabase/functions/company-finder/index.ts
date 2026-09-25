// supabase/functions/company-finder/index.ts
//
// Admin tool behind Admin → Import & sync → "Find new companies".
// Runs on the server so the method isn't visible in the website code, and
// so it can read company websites (browsers can't, because of CORS).
//
// Actions (POST JSON, admin only — same two-step rule as is_admin()):
//   { action: "top", country: "DE", limit: 100, offset: 0 }
//       Largest companies in a country, from Wikidata: legal name (English
//       Wikipedia title, e.g. "Bayer AG"), website, employees, industry.
//   { action: "lookup", names: ["Bayer", "ASML", ...] }   (max 25)
//       Same details for companies you name (e.g. from a sponsor register).
//   { action: "probe", name, website }
//       Finds career page candidates: job-board links on the company's own
//       website, its careers page, and job boards matching its name
//       (Greenhouse, Lever, Ashby, SmartRecruiters). Plus square icon URLs.
//       The admin page then proves each candidate with the real importer.
//   { action: "logo", icons: [url, ...], name }
//       Downloads the first usable square icon, makes it a 128×128 PNG and
//       stores it in the listing-images bucket. Returns its public URL.
//
// Deploy: supabase functions deploy company-finder

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORS_HEADERS, lookupNames, makeLogo, probe, topCompanies } from './finder.ts';

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: isAdmin } = await asCaller.rpc('is_admin');
    if (isAdmin !== true) return reply({ ok: false, error: 'Admin access (with your two-step code) required.' }, 403);

    const body = await req.json().catch(() => ({}));
    switch (body?.action) {
      case 'top':
        return reply({ ok: true, companies: await topCompanies(String(body.country ?? '').toUpperCase(), Number(body.limit ?? 100), Number(body.offset ?? 0)) });
      case 'lookup':
        return reply({ ok: true, results: await lookupNames(Array.isArray(body.names) ? body.names.map(String) : []) });
      case 'probe': {
        const website = String(body.website ?? '');
        if (!/^https?:\/\//i.test(website)) return reply({ ok: false, error: 'Website must start with http(s)://' }, 400);
        return reply({ ok: true, ...(await probe(String(body.name ?? ''), website)) });
      }
      case 'logo': {
        const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const icons = (Array.isArray(body.icons) ? body.icons : []).map(String).filter((u: string) => /^https?:\/\//i.test(u));
        return reply({ ok: true, logoUrl: await makeLogo(service, icons, String(body.name ?? 'company')) });
      }
      default:
        return reply({ ok: false, error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    return reply({ ok: false, error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
