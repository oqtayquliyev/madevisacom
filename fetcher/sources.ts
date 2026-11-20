// Readers for the free, public job feeds MadeVisa uses. No API keys anywhere.
//
//   Company job boards (one company each, listed in fetcher/companies.json):
//     greenhouse  boards-api.greenhouse.io/v1/boards/<id>/jobs?content=true
//     lever       api.lever.co/v0/postings/<id>?mode=json
//     ashby       api.ashbyhq.com/posting-api/job-board/<id>?includeCompensation=true
//     workable    apply.workable.com/api/v1/widget/accounts/<id>?details=true
//     recruitee   <id>.recruitee.com/api/offers/
//     personio    <id>.jobs.personio.de/xml
//     smartrecruiters api.smartrecruiters.com/v1/companies/<id>/postings (+ one call per new job)
//   Job boards with many companies:
//     arbeitnow   www.arbeitnow.com/api/job-board-api (states visa sponsorship per job)
//     remotive    remotive.com/api/remote-jobs (remote only; their terms ask for a link back)

export type SourceJob = {
  externalId: string;
  title: string;
  company: string;
  locationText: string;
  offices: string[];
  descriptionHtml: string;
  url: string;
  department?: string | null;
  employmentTypeRaw?: string | null;
  postedAt?: string | null;
  remote?: boolean | null;
  workArrangement?: 'onsite' | 'hybrid' | 'remote' | null;
  salaryText?: string | null;
  /** The feed itself says so (arbeitnow's visa_sponsorship flag). */
  visaFlag?: boolean | null;
};

export type CompanyEntry = string | { id: string; name?: string };
export type Platform = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'recruitee' | 'personio' | 'smartrecruiters';
export type Source = { key: string; platform: Platform | 'arbeitnow' | 'remotive'; id: string; name: string | null };
export type FetchResult = { ok: true; jobs: SourceJob[] } | { ok: false; error: string };

const UA = 'MadeVisaBot/2.0 (+https://madevisa.com/about; jobs from public career feeds)';

/** For tests: answers from local files instead of the internet (see fetcher/test.ts). */
let fixture: ((url: string) => Promise<Response | null>) | null = null;
export const useFixtures = (fn: typeof fixture) => (fixture = fn);

export async function get(url: string, kind: 'json' | 'text' = 'json', timeoutMs = 40_000): Promise<any> {
  if (fixture) {
    const res = await fixture(url);
    if (!res) throw new Error('404');
    return kind === 'json' ? res.json() : res.text();
  }
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, Accept: kind === 'json' ? 'application/json' : 'application/xml,text/xml,*/*' },
      });
      if (res.status === 404 || res.status === 410) throw new Error(String(res.status));
      if (!res.ok) {
        lastErr = String(res.status);
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw new Error(lastErr);
      }
      return kind === 'json' ? await res.json() : await res.text();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === '404' || msg === '410' || /^4\d\d$/.test(msg)) throw e;
      lastErr = ctrl.signal.aborted ? 'timeout' : msg;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(lastErr || 'failed');
}

const str = (v: unknown) => (v == null ? '' : String(v)).trim();
const isoOf = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v));
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
};
const arrangementOf = (v: unknown): SourceJob['workArrangement'] => {
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (s.includes('hybrid')) return 'hybrid';
  if (s.includes('remote')) return 'remote';
  if (s.includes('on-site') || s.includes('onsite') || s.includes('in office') || s.includes('office')) return 'onsite';
  return null;
};
const titleCase = (id: string) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Company boards
// ---------------------------------------------------------------------------

async function greenhouse(id: string, name: string | null): Promise<SourceJob[]> {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(id)}`;
  const data = await get(`${base}/jobs?content=true`);
  let company = name;
  if (!company) company = str((await get(base).catch(() => null))?.name) || titleCase(id);
  return ((data?.jobs ?? []) as any[]).map((j) => {
    const offices = ((j.offices ?? []) as any[]).map((o) => str(o?.name)).filter(Boolean);
    const locationText = str(j.location?.name);
    const meta = (j.metadata ?? []) as { name?: string; value?: unknown }[];
    const metaValue = (re: RegExp) => {
      const f = meta.find((m) => m.name && re.test(m.name));
      const v = f?.value;
      return v == null || v === '' || typeof v === 'object' ? null : String(v);
    };
    return {
      externalId: str(j.id),
      title: str(j.title) || 'Untitled role',
      company: str(j.company_name) || company!,
      locationText,
      offices,
      descriptionHtml: str(j.content),
      url: str(j.absolute_url),
      department: str(j.departments?.[0]?.name) || null,
      employmentTypeRaw: metaValue(/employment.?type|job.?type/i),
      postedAt: isoOf(j.first_published) ?? isoOf(j.updated_at),
      remote: [locationText, ...offices].some((s) => /\bremote\b/i.test(s)) || null,
      salaryText: metaValue(/salary|pay.?range|compensation/i),
    };
  });
}

async function lever(id: string, name: string | null): Promise<SourceJob[]> {
  // The EU instance answers for companies hosted there.
  let data: any;
  try {
    data = await get(`https://api.lever.co/v0/postings/${encodeURIComponent(id)}?mode=json`);
  } catch (e) {
    if (!/404/.test(String(e))) throw e;
    data = await get(`https://api.eu.lever.co/v0/postings/${encodeURIComponent(id)}?mode=json`);
  }
  const company = name || titleCase(id);
  return ((Array.isArray(data) ? data : []) as any[]).map((j) => {
    const lists = ((j.lists ?? []) as any[]).map((l) => `<h3>${str(l.text)}</h3><ul>${str(l.content)}</ul>`).join('');
    const all = ((j.categories?.allLocations ?? []) as unknown[]).map(str).filter(Boolean);
    const loc = str(j.categories?.location);
    const salary = j.salaryRange && j.salaryRange.min ? `${j.salaryRange.currency ?? ''} ${j.salaryRange.min}–${j.salaryRange.max ?? ''} ${j.salaryRange.interval ?? ''}`.trim() : null;
    return {
      externalId: str(j.id),
      title: str(j.text) || 'Untitled role',
      company,
      locationText: loc,
      offices: all.length ? all : loc ? [loc] : [],
      descriptionHtml: `${str(j.description)}${lists}${str(j.additional)}`,
      url: str(j.hostedUrl),
      department: str(j.categories?.team) || str(j.categories?.department) || null,
      employmentTypeRaw: str(j.categories?.commitment) || null,
      postedAt: isoOf(j.createdAt),
      remote: str(j.workplaceType) === 'remote' || /\bremote\b/i.test(loc) || null,
      workArrangement: arrangementOf(j.workplaceType),
      salaryText: salary,
    };
  });
}

async function ashby(id: string, name: string | null): Promise<SourceJob[]> {
  const data = await get(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(id)}?includeCompensation=true`);
  const company = name || titleCase(id);
  return ((data?.jobs ?? []) as any[])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const loc = str(j.location);
      const more = ((j.secondaryLocations ?? []) as any[]).map((l) => str(l?.location)).filter(Boolean);
      return {
        externalId: str(j.id),
        title: str(j.title) || 'Untitled role',
        company,
        locationText: loc,
        offices: [loc, ...more].filter(Boolean),
        descriptionHtml: str(j.descriptionHtml),
        url: str(j.jobUrl) || str(j.applyUrl),
        department: str(j.department) || str(j.team) || null,
        employmentTypeRaw: str(j.employmentType) || null,
        postedAt: isoOf(j.publishedAt),
        remote: j.isRemote === true || null,
        workArrangement: arrangementOf(j.workplaceType) ?? (j.isRemote ? 'remote' : null),
        salaryText: str(j.compensation?.compensationTierSummary) || str(j.compensation?.scrapeableCompensationSalarySummary) || null,
      };
    });
}

async function workable(id: string, name: string | null): Promise<SourceJob[]> {
  const data = await get(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(id)}?details=true`);
  const company = name || str(data?.name) || titleCase(id);
  return ((data?.jobs ?? []) as any[]).map((j) => {
    const locs = ((j.locations ?? []) as any[]).map((l) => [str(l.city), str(l.region), str(l.country)].filter(Boolean).join(', ')).filter(Boolean);
    const one = [str(j.city), str(j.state), str(j.country)].filter(Boolean).join(', ');
    return {
      externalId: str(j.shortcode) || str(j.id),
      title: str(j.title) || 'Untitled role',
      company,
      locationText: one || locs[0] || '',
      offices: locs.length ? locs : one ? [one] : [],
      descriptionHtml: `${str(j.description)}${str(j.requirements)}${str(j.benefits)}`,
      url: str(j.url) || str(j.shortlink) || str(j.application_url),
      department: str(j.department) || null,
      employmentTypeRaw: str(j.employment_type) || null,
      postedAt: isoOf(j.published_on) ?? isoOf(j.created_at),
      remote: j.telecommuting === true || null,
      workArrangement: j.telecommuting === true ? 'remote' : null,
    };
  });
}

async function recruitee(id: string, name: string | null): Promise<SourceJob[]> {
  const data = await get(`https://${encodeURIComponent(id)}.recruitee.com/api/offers/`);
  return ((data?.offers ?? []) as any[]).map((j) => {
    const loc = str(j.location) || [str(j.city), str(j.country)].filter(Boolean).join(', ');
    const salary = j.salary && (j.salary.min || j.salary.max) ? `${j.salary.currency ?? ''} ${j.salary.min ?? ''}–${j.salary.max ?? ''} ${j.salary.period ?? ''}`.trim() : null;
    return {
      externalId: str(j.id),
      title: str(j.title) || 'Untitled role',
      company: name || str(j.company_name) || titleCase(id),
      locationText: loc,
      offices: loc ? [loc] : [],
      descriptionHtml: `${str(j.description)}${str(j.requirements)}`,
      url: str(j.careers_url) || str(j.url),
      department: str(j.department) || null,
      employmentTypeRaw: str(j.employment_type_code) || null,
      postedAt: isoOf(j.published_at) ?? isoOf(j.created_at),
      remote: j.remote === true || null,
      workArrangement: j.hybrid ? 'hybrid' : j.remote ? 'remote' : j.on_site ? 'onsite' : null,
      salaryText: salary,
    };
  });
}

function xmlTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return '';
  return m[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
}

async function personio(id: string, name: string | null): Promise<SourceJob[]> {
  const xml: string = await get(`https://${encodeURIComponent(id)}.jobs.personio.de/xml?language=en`, 'text');
  const positions = xml.match(/<position>[\s\S]*?<\/position>/g) ?? [];
  return positions.map((p) => {
    const jid = xmlTag(p, 'id');
    const offices = [xmlTag(p, 'office'), ...((p.match(/<additionalOffice>([\s\S]*?)<\/additionalOffice>/g) ?? []).map((o) => xmlTag(o, 'additionalOffice')))].filter(Boolean);
    const desc = (p.match(/<jobDescription>[\s\S]*?<\/jobDescription>/g) ?? [])
      .map((d) => `<h3>${xmlTag(d, 'name')}</h3>${xmlTag(d, 'value')}`)
      .join('');
    return {
      externalId: jid,
      title: xmlTag(p, 'name') || 'Untitled role',
      company: name || xmlTag(p, 'subcompany') || titleCase(id),
      locationText: offices[0] ?? '',
      offices,
      descriptionHtml: desc,
      url: `https://${id}.jobs.personio.de/job/${jid}?language=en`,
      department: xmlTag(p, 'department') || null,
      employmentTypeRaw: [xmlTag(p, 'employmentType'), xmlTag(p, 'schedule')].filter(Boolean).join(', ') || null,
      postedAt: isoOf(xmlTag(p, 'createdAt')),
      remote: /remote/i.test(offices.join(' ')) || null,
    };
  });
}

/** SmartRecruiters lists jobs without their text; the text is fetched for new jobs only (see run.ts). */
async function smartrecruiters(id: string, name: string | null): Promise<SourceJob[]> {
  const out: SourceJob[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const data = await get(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(id)}/postings?limit=100&offset=${offset}`);
    const list = (data?.content ?? []) as any[];
    for (const j of list) {
      const loc = [str(j.location?.city), str(j.location?.region), str(j.location?.country)?.toUpperCase()].filter(Boolean).join(', ');
      out.push({
        externalId: str(j.id),
        title: str(j.name) || 'Untitled role',
        company: name || str(j.company?.name) || titleCase(id),
        locationText: loc,
        offices: loc ? [loc] : [],
        descriptionHtml: '',
        url: `https://jobs.smartrecruiters.com/${encodeURIComponent(id)}/${str(j.id)}`,
        department: str(j.department?.label) || null,
        employmentTypeRaw: str(j.typeOfEmployment?.label) || null,
        postedAt: isoOf(j.releasedDate),
        remote: j.location?.remote === true || null,
        workArrangement: j.location?.hybrid ? 'hybrid' : j.location?.remote ? 'remote' : null,
      });
    }
    if (list.length < 100) break;
  }
  return out;
}

/** The text of one SmartRecruiters job (called only for jobs that will be added). */
export async function smartrecruitersDetail(companyId: string, jobId: string): Promise<string> {
  const d = await get(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings/${encodeURIComponent(jobId)}`);
  const s = d?.jobAd?.sections ?? {};
  return ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
    .map((k) => (s[k]?.text ? `<h3>${str(s[k].title)}</h3>${str(s[k].text)}` : ''))
    .join('');
}

// ---------------------------------------------------------------------------
// Multi-company boards
// ---------------------------------------------------------------------------

async function arbeitnow(maxPages: number): Promise<SourceJob[]> {
  const out: SourceJob[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await get(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    const list = (data?.data ?? []) as any[];
    for (const j of list) {
      const loc = str(j.location);
      out.push({
        externalId: str(j.slug),
        title: str(j.title) || 'Untitled role',
        company: str(j.company_name) || 'Unknown company',
        locationText: loc,
        offices: loc ? [loc] : [],
        descriptionHtml: str(j.description),
        url: str(j.url),
        employmentTypeRaw: ((j.job_types ?? []) as unknown[]).map(str).join(', ') || null,
        postedAt: isoOf(j.created_at),
        remote: j.remote === true || null,
        workArrangement: j.remote === true ? 'remote' : null,
        visaFlag: j.visa_sponsorship === true ? true : null,
      });
    }
    if (!data?.links?.next || list.length === 0) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  return out;
}

async function remotive(): Promise<SourceJob[]> {
  const data = await get('https://remotive.com/api/remote-jobs?limit=500');
  return ((data?.jobs ?? []) as any[]).map((j) => {
    const loc = str(j.candidate_required_location) || 'Remote';
    return {
      externalId: str(j.id),
      title: str(j.title) || 'Untitled role',
      company: str(j.company_name) || 'Unknown company',
      locationText: loc,
      offices: [loc],
      descriptionHtml: str(j.description),
      url: str(j.url),
      department: str(j.category) || null,
      employmentTypeRaw: str(j.job_type) || null,
      postedAt: isoOf(j.publication_date),
      remote: true,
      workArrangement: 'remote',
      salaryText: str(j.salary) || null,
    };
  });
}

export async function fetchSource(src: Source, opts: { arbeitnowPages: number }): Promise<FetchResult> {
  try {
    let jobs: SourceJob[];
    switch (src.platform) {
      case 'greenhouse': jobs = await greenhouse(src.id, src.name); break;
      case 'lever': jobs = await lever(src.id, src.name); break;
      case 'ashby': jobs = await ashby(src.id, src.name); break;
      case 'workable': jobs = await workable(src.id, src.name); break;
      case 'recruitee': jobs = await recruitee(src.id, src.name); break;
      case 'personio': jobs = await personio(src.id, src.name); break;
      case 'smartrecruiters': jobs = await smartrecruiters(src.id, src.name); break;
      case 'arbeitnow': jobs = await arbeitnow(opts.arbeitnowPages); break;
      case 'remotive': jobs = await remotive(); break;
      default: return { ok: false, error: `unknown platform ${src.platform}` };
    }
    return { ok: true, jobs: jobs.filter((j) => j.externalId && j.url && j.title) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg === '404' ? 'not found (wrong id, or the company left this platform)' : msg };
  }
}

export function sourcesFrom(config: Record<string, unknown>): Source[] {
  const out: Source[] = [];
  const platforms: Platform[] = ['greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'personio', 'smartrecruiters'];
  for (const p of platforms) {
    for (const e of ((config[p] ?? []) as CompanyEntry[])) {
      const id = typeof e === 'string' ? e : e.id;
      const name = typeof e === 'string' ? null : e.name ?? null;
      if (!id) continue;
      out.push({ key: `${p}:${id.toLowerCase()}`, platform: p, id, name });
    }
  }
  const feeds = (config.feeds ?? {}) as Record<string, boolean>;
  if (feeds.arbeitnow) out.push({ key: 'arbeitnow', platform: 'arbeitnow', id: 'arbeitnow', name: null });
  if (feeds.remotive) out.push({ key: 'remotive', platform: 'remotive', id: 'remotive', name: null });
  return out;
}
