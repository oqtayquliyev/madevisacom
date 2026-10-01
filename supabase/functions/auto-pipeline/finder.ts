// The finder: every ~20 minutes, ONE new company — next country in the
// list, next company down that country's Wikidata ranking (biggest first)
// that isn't on MadeVisa yet. Same steps as Admin → "Find new companies":
// probe the website for career pages, prove one with the real importer,
// then add the company + its source. Its jobs are NOT imported here: the
// conveyor picks the new company up on its next pass through that country
// and adds its jobs a few at a time.

import { companyDetails, coreName, listCompanies, logoCandidates, makeLogo, probe } from '../company-finder/finder.ts';
import { callImporter, countryIds, fetchGreenhouse, allRows, type Service } from './shared.ts';

type Candidate = { qid: string; name: string; website: string; domain: string; employees: number | null; industry: string | null; country: string | null };
type CareerCandidate = { kind: 'greenhouse' | 'careers_url'; url: string; token?: string; platform: string | null; evidence: 'website' | 'name' | 'guess'; jobs: number | null };
type Proven = { kind: 'greenhouse' | 'careers_url'; url: string; token?: string; platform: string | null; jobs: number; resolvedUrl?: string | null; strategy?: string | null; confidence: 'high' | 'medium' | 'low' };

const LIST_MAX_AGE_MS = 30 * 86_400_000;

const hostOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

/** Same as proveCareerSource in src/lib/companyFinder.ts: nothing counts unless the importer reads jobs from it. */
async function prove(service: Service, candidates: CareerCandidate[], deadline: number): Promise<Proven | null> {
  for (const c of candidates) {
    if (Date.now() > deadline) return null;
    const confidence = c.evidence === 'website' ? 'high' : c.evidence === 'name' ? 'medium' : 'low';
    if (c.kind === 'greenhouse' && c.token) {
      const gh = await fetchGreenhouse(c.token);
      if (gh.ok && gh.jobs.length) return { kind: 'greenhouse', url: c.url, token: c.token, platform: 'Greenhouse', jobs: gh.jobs.length, confidence };
      continue;
    }
    const res = await callImporter(service, { url: c.url }, 100_000);
    if (res?.ok && Array.isArray(res.jobs) && res.jobs.length) {
      const jobs = Math.max(res.jobs.length, Number(res.totalHits) || 0);
      const weak = jobs < 5 && /job links|sitemap|generic/i.test(`${res.source ?? ''} ${res.strategy ?? ''}`);
      return {
        kind: 'careers_url',
        url: c.url,
        platform: res.source ?? c.platform,
        jobs,
        resolvedUrl: res.resolvedUrl ?? null,
        strategy: res.strategy ?? null,
        confidence: weak ? 'low' : confidence,
      };
    }
  }
  return null;
}

async function saveLead(service: Service, c: Candidate, code: string, icons: string[], reason: string, note: string | null, candidateUrl: string | null = null) {
  await service.from('company_leads').upsert(
    {
      qid: c.qid,
      name: c.name.trim(),
      website: c.website || null,
      domain: c.domain || null,
      country_code: c.country ?? code,
      employees: c.employees,
      industry: c.industry,
      icons: icons.slice(0, 6),
      reason,
      note,
      candidate_url: candidateUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'qid' }
  );
}

/** Adds one company (or saves it for later). Returns a line for the log. */
async function handleCompany(service: Service, c: Candidate, code: string, deadline: number): Promise<{ added: boolean; text: string }> {
  let icons: string[] = [];
  try {
    const p = await probe(c.name, c.website, false);
    icons = p.icons ?? [];
    const proven = p.candidates.length ? await prove(service, p.candidates as CareerCandidate[], deadline) : null;
    if (!proven) {
      const reason = p.websiteReachable ? 'nopage' : 'blocked';
      await saveLead(service, c, code, icons, reason, reason === 'nopage' ? 'No career page with jobs found' : 'Website didn’t load');
      return { added: false, text: `${c.name} (${code}): ${reason === 'nopage' ? 'no career page with jobs' : 'website didn’t load'} — saved for later` };
    }
    if (proven.confidence === 'low') {
      await saveLead(service, c, code, icons, 'lowconf', `${proven.jobs} jobs at ${hostOf(proven.url)}`, proven.url);
      return { added: false, text: `${c.name} (${code}): unsure match (${hostOf(proven.url)}) — saved to check` };
    }

    let logoUrl = icons.length ? await makeLogo(service, icons, c.name).catch(() => null) : null;
    // Nothing usable on the homepage: Wikipedia logo, the careers page's icon, favicon services.
    if (!logoUrl) {
      const more = await logoCandidates({ name: c.name, website: c.website, pages: [proven.url, proven.resolvedUrl] }).catch(() => [] as string[]);
      logoUrl = more.length ? await makeLogo(service, more, c.name).catch(() => null) : null;
    }
    const byIso = await countryIds(service);
    const { data: pub, error } = await service
      .from('program_publishers')
      .insert({
        owner_id: null,
        org_type: 'company',
        name: c.name.trim(),
        website: c.website,
        logo_url: logoUrl,
        country_id: byIso.get(c.country ?? code) ?? byIso.get(code) ?? null,
        verification_status: 'verified',
        contact_email: 'hello@madevisa.com',
      })
      .select('id')
      .single();
    if (error || !pub) throw new Error(error?.message ?? 'Could not create the company.');
    const sourceUrl = proven.kind === 'greenhouse' ? proven.token!.trim().toLowerCase() : proven.url.trim();
    const { error: srcErr } = await service.from('import_sources').upsert(
      {
        publisher_id: pub.id,
        kind: proven.kind,
        source_url: sourceUrl,
        resolved_url: proven.resolvedUrl ?? null,
        strategy: proven.strategy ?? null,
        detected_platform: proven.platform,
        auto_publish: true,
      },
      { onConflict: 'publisher_id,kind,source_url' }
    );
    if (srcErr) throw new Error(srcErr.message);
    return { added: true, text: `Added ${c.name} (${code}) — ${proven.jobs.toLocaleString()} jobs on ${proven.platform ?? hostOf(proven.url)}${logoUrl ? '' : ', no logo'}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Search failed';
    await saveLead(service, c, code, icons, 'error', msg).catch(() => undefined);
    return { added: false, text: `${c.name} (${code}): ${msg} — saved for later` };
  }
}

export async function runFinder(service: Service): Promise<void> {
  const deadline = Date.now() + 280_000;
  const { data: claimed } = await service.rpc('pipeline_claim', { p_kind: 'find', p_minutes: 8 });
  if (claimed !== true) return;

  let summary = 'Nothing new to add';
  let ok = true;
  const detail: Record<string, unknown> = {};
  try {
    const { data: cfg } = await service.from('auto_release_settings').select('country_order, finder_country_idx').eq('id', true).maybeSingle();
    const codes = ((cfg?.country_order ?? []) as string[]).filter((c) => c !== 'OTHER');
    const startIdx = Number(cfg?.finder_country_idx ?? 0);
    if (!codes.length) throw new Error('No countries in the list.');

    // Who's already on MadeVisa (names and website domains).
    const pubs = await allRows<{ name: string; website: string | null }>((f, t) => service.from('program_publishers').select('name, website').range(f, t));
    const srcs = await allRows<{ source_url: string }>((f, t) => service.from('import_sources').select('source_url').range(f, t));
    const names = new Set(pubs.map((p) => coreName(p.name)).filter(Boolean));
    const hosts = new Set([...pubs.map((p) => hostOf(p.website)), ...srcs.map((s) => hostOf(s.source_url))].filter(Boolean));
    const known = (c: Candidate) => names.has(coreName(c.name)) || Boolean(c.domain && hosts.has(c.domain));

    let tried = 0;
    let done = false;
    for (; tried < codes.length && !done && Date.now() < deadline - 60_000; tried++) {
      const code = codes[(startIdx + tried) % codes.length];
      const { data: prog } = await service.from('finder_country_progress').select('*').eq('country', code).maybeSingle();
      let list = (prog?.list ?? []) as string[];
      let next = Number(prog?.next_index ?? 0);
      if (!list.length || !prog?.list_at || Date.now() - Date.parse(prog.list_at) > LIST_MAX_AGE_MS) {
        try {
          list = (await listCompanies(code)).map((r: { qid: string }) => r.qid);
        } catch (e) {
          detail[`list_${code}`] = e instanceof Error ? e.message : 'Wikidata failed';
          continue; // Wikidata busy — try the next country
        }
        await service.from('finder_country_progress').upsert({ country: code, list, list_at: new Date().toISOString(), next_index: next, updated_at: new Date().toISOString() });
      }
      if (next >= list.length) continue; // this country is done

      // Walk down the ranking, 10 at a time, to the first company that's new.
      for (let pages = 0; pages < 6 && next < list.length && !done && Date.now() < deadline - 60_000; pages++) {
        const batch = list.slice(next, next + 10);
        const details = (await companyDetails(batch)) as Candidate[];
        const byQid = new Map(details.map((d) => [d.qid, d]));
        const { data: leadRows } = await service.from('company_leads').select('qid').in('qid', batch);
        const leads = new Set(((leadRows ?? []) as { qid: string }[]).map((l) => l.qid));
        for (const qid of batch) {
          next++;
          const c = byQid.get(qid);
          if (!c || known(c) || leads.has(qid)) continue;
          const r = await handleCompany(service, { ...c, country: c.country ?? code }, code, deadline);
          summary = r.text;
          detail.country = code;
          detail.added = r.added;
          if (r.added) await service.from('finder_country_progress').update({ added: Number(prog?.added ?? 0) + 1 }).eq('country', code);
          done = true;
          break;
        }
      }
      await service.from('finder_country_progress').update({ next_index: next, updated_at: new Date().toISOString() }).eq('country', code);
    }
    // Next run starts at the following country.
    await service.from('auto_release_settings').update({ finder_country_idx: (startIdx + Math.max(tried, 1)) % codes.length }).eq('id', true);
  } catch (e) {
    ok = false;
    summary = `Finder failed: ${e instanceof Error ? e.message : 'unknown error'}`;
  }
  await service.rpc('pipeline_finished', { p_kind: 'find', p_ok: ok, p_summary: summary, p_detail: detail });
}
