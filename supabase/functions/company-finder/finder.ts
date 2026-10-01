// Logic for the company-finder function (see index.ts).
import { PNG } from 'npm:pngjs@7.0.0';
import jpeg from 'npm:jpeg-js@0.4.4';
import { Buffer } from 'node:buffer';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UA = 'MadeVisaCompanyFinder/1.0 (+https://madevisa.com; hello@madevisa.com)';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Wikidata ids for countries offered in the admin tool.
const COUNTRY_QID: Record<string, string> = {
  GB: 'Q145', NL: 'Q55', DE: 'Q183', IE: 'Q27',
  US: 'Q30', CA: 'Q16', AU: 'Q408',
  FR: 'Q142', ES: 'Q29', IT: 'Q38', CH: 'Q39', AT: 'Q40', BE: 'Q31', LU: 'Q32', PT: 'Q45',
  SE: 'Q34', NO: 'Q20', DK: 'Q35', FI: 'Q33', PL: 'Q36', CZ: 'Q213',
  AE: 'Q878', SG: 'Q334', JP: 'Q17', KR: 'Q884',
};

// Kinds of organisation that count as an employer here.
const COMPANY_TYPES = ['Q4830453', 'Q891723', 'Q6881511', 'Q783794', 'Q1589009', 'Q219577', 'Q161726', 'Q18388277'];

type Candidate = {
  qid: string;
  name: string;
  wikiTitle: string | null;
  website: string;
  domain: string;
  employees: number | null;
  industry: string | null;
  country: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** "Bayer_AG" / "Siemens (company)" → "Bayer AG" / "Siemens". */
function titleFromArticle(article: string | null): string | null {
  if (!article) return null;
  const t = decodeURIComponent(article.split('/wiki/')[1] ?? '').replace(/_/g, ' ').trim();
  return t.replace(/\s*\((company|corporation|business|firm|brand|bank|group)\)\s*$/i, '').trim() || null;
}

const LEGAL_FORMS = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|ag|se|sa|nv|bv|gmbh|kg|kgaa|mbh|spa|s\.?p\.?a|ab|asa|as|oyj|oy|a\/s|group|holding|holdings|international|the)\b\.?/gi;
/** "Deutsche Bank AG" → "deutsche bank" (for matching and slug guesses). */
export function coreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    // Dotted legal forms: N.V., B.V., S.A., S.E., A.G., P.L.C., S.p.A., K.K.
    .replace(/(^|\s)(n\.\s?v|b\.\s?v|s\.\s?a|s\.\s?e|a\.\s?g|p\.\s?l\.\s?c|s\.\s?p\.\s?a|k\.\s?k)\.?(?=\s|,|$)/g, ' ')
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function sparql(query: string): Promise<Record<string, { value: string }>[]> {
  // Wikidata is shared and sometimes busy: retry twice, waiting if it asks us to.
  let status = 'timeout';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchWithTimeout(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } },
      45000
    );
    if (res?.ok) {
      const json = await res.json();
      return json?.results?.bindings ?? [];
    }
    status = res ? String(res.status) : 'timeout';
    if (res && res.status < 429 && res.status !== 408) break; // a real error, not "busy"
    const wait = Number(res?.headers.get('retry-after')) || 3 * (attempt + 1);
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
  }
  throw new Error(`Wikidata is busy right now (${status}). Wait a minute and click again.`);
}

// How legal forms are usually written, for official names stored in CAPITALS.
const FORM_CASE: Record<string, string> = {
  plc: 'plc', ltd: 'Ltd', limited: 'Limited', inc: 'Inc.', corporation: 'Corporation', corp: 'Corp.', llc: 'LLC',
  ag: 'AG', se: 'SE', sa: 'S.A.', nv: 'N.V.', bv: 'B.V.', gmbh: 'GmbH', kgaa: 'KGaA', spa: 'S.p.A.', ab: 'AB', asa: 'ASA', as: 'A/S', oyj: 'Oyj',
};

/**
 * The name to show: the legal name when Wikidata has one that is the same
 * company plus its legal form ("Tesco" + "Tesco PLC" → "Tesco plc",
 * "HSBC" + "HSBC Holdings plc" → "HSBC Holdings plc"), else the English
 * Wikipedia title ("Bayer AG" already is one).
 */
export function legalName(wikiTitle: string | null, official: string | null): string | null {
  if (!official || !wikiTitle) return wikiTitle ?? official;
  const o = official.trim();
  const latin = /^[A-Za-z0-9\u00C0-\u024F\s&.,'’()\-/+]+$/.test(o);
  const plain = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const hasForm = (x: string) => coreName(x) !== plain(x);
  if (!latin || o.length > 80 || coreName(o) !== coreName(wikiTitle) || !hasForm(o) || hasForm(wikiTitle)) return wikiTitle;
  if (o !== o.toUpperCase()) return o;
  // "TESCO PLC": keep Wikipedia's spelling and add the form, written normally.
  const last = plain(o).split(' ').pop() ?? '';
  const form = FORM_CASE[last.replace(/\s/g, '')];
  return form ? `${wikiTitle} ${form}` : wikiTitle;
}

function rowsToCandidates(rows: Record<string, { value: string }>[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const qid = r.item?.value.split('/').pop() ?? '';
    const website = r.website?.value ?? '';
    const domain = hostOf(website);
    if (!qid || !domain || seen.has(qid)) continue;
    seen.add(qid);
    const wikiTitle = titleFromArticle(r.article?.value ?? null);
    const name = legalName(wikiTitle, r.officialName?.value ?? null) ?? r.label?.value ?? '';
    if (!name || /^Q\d+$/.test(name)) continue;
    out.push({
      qid,
      name,
      wikiTitle,
      website,
      domain,
      employees: r.employees ? Math.round(Number(r.employees.value)) : null,
      industry: r.industry?.value ?? null,
      country: r.countryCode?.value ?? null,
    });
  }
  return out;
}

const SELECT_FIELDS = `
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  OPTIONAL { ?item wdt:P1448 ?officialName . FILTER(lang(?officialName) = "en" || lang(?officialName) = "") }
  OPTIONAL { ?item rdfs:label ?label . FILTER(lang(?label) = "en") }
  OPTIONAL { ?item wdt:P452 ?ind . ?ind rdfs:label ?industry . FILTER(lang(?industry) = "en") }
  OPTIONAL { ?item wdt:P17 ?c . ?c wdt:P297 ?countryCode . }`;

export async function topCompanies(country: string, limit: number, offset: number): Promise<Candidate[]> {
  const qid = COUNTRY_QID[country];
  if (!qid) throw new Error('Unsupported country.');
  const query = `
SELECT ?item (MAX(?emp) AS ?employees) (SAMPLE(?web) AS ?website) (SAMPLE(?article) AS ?article)
       (SAMPLE(?officialName) AS ?officialName) (SAMPLE(?label) AS ?label) (SAMPLE(?industry) AS ?industry) (SAMPLE(?countryCode) AS ?countryCode)
WHERE {
  VALUES ?type { ${COMPANY_TYPES.map((t) => `wd:${t}`).join(' ')} }
  ?item wdt:P31 ?type ; wdt:P17 wd:${qid} ; wdt:P856 ?web ; wdt:P1128 ?emp .
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved . }
  ${SELECT_FIELDS}
}
GROUP BY ?item
ORDER BY DESC(?employees)
LIMIT ${Math.min(Math.max(limit, 1), 200)} OFFSET ${Math.max(offset, 0)}`;
  return rowsToCandidates(await sparql(query));
}

export type RankedCompany = { qid: string; employees: number | null };

/**
 * Every company in a country that has a website on Wikidata, biggest first
 * (by employees; ones without an employee count after, by how well known
 * they are). Just ids — cheap, so the admin page knows the total and can
 * page through it without asking Wikidata to re-sort each time.
 */
export async function listCompanies(country: string): Promise<RankedCompany[]> {
  const qid = COUNTRY_QID[country];
  if (!qid) throw new Error('Unsupported country.');
  const types = COMPANY_TYPES.map((t) => `wd:${t}`).join(' ');
  const full = `
SELECT ?item (MAX(?emp) AS ?employees) (MAX(?links) AS ?sitelinks) WHERE {
  { SELECT DISTINCT ?item WHERE {
      VALUES ?type { ${types} }
      ?item wdt:P31 ?type ; wdt:P17 wd:${qid} ; wdt:P856 ?web .
      FILTER NOT EXISTS { ?item wdt:P576 ?dissolved . }
    } LIMIT 6000 }
  OPTIONAL { ?item wdt:P1128 ?emp . }
  OPTIONAL { ?item wikibase:sitelinks ?links . }
}
GROUP BY ?item`;
  let rows: Record<string, { value: string }>[];
  try {
    rows = await sparql(full);
  } catch {
    // Big countries can be too much for Wikidata: fall back to companies with an employee count.
    rows = await sparql(`
SELECT ?item (MAX(?emp) AS ?employees) WHERE {
  VALUES ?type { ${types} }
  ?item wdt:P31 ?type ; wdt:P17 wd:${qid} ; wdt:P856 ?web ; wdt:P1128 ?emp .
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved . }
}
GROUP BY ?item ORDER BY DESC(?employees) LIMIT 3000`);
  }
  const list = rows
    .map((r) => ({
      qid: r.item?.value.split('/').pop() ?? '',
      employees: r.employees ? Math.round(Number(r.employees.value)) || null : null,
      links: r.sitelinks ? Number(r.sitelinks.value) || 0 : 0,
    }))
    .filter((r) => /^Q\d+$/.test(r.qid));
  list.sort((a, b) => (b.employees ?? -1) - (a.employees ?? -1) || b.links - a.links);
  return list.slice(0, 3000).map(({ qid, employees }) => ({ qid, employees }));
}

/** Names, websites and details for up to 100 companies, in the order given. */
export async function companyDetails(qids: string[]): Promise<Candidate[]> {
  const ids = qids.filter((q) => /^Q\d+$/.test(q)).slice(0, 100);
  if (!ids.length) return [];
  const rows = await sparql(`
SELECT ?item (MAX(?emp) AS ?employees) (SAMPLE(?web) AS ?website) (SAMPLE(?article) AS ?article)
       (SAMPLE(?officialName) AS ?officialName) (SAMPLE(?label) AS ?label) (SAMPLE(?industry) AS ?industry) (SAMPLE(?countryCode) AS ?countryCode)
WHERE {
  VALUES ?item { ${ids.map((i) => `wd:${i}`).join(' ')} }
  ?item wdt:P856 ?web .
  OPTIONAL { ?item wdt:P1128 ?emp . }
  ${SELECT_FIELDS}
}
GROUP BY ?item`);
  const byId = new Map(rowsToCandidates(rows).map((c) => [c.qid, c]));
  return ids.map((i) => byId.get(i)).filter((c): c is Candidate => Boolean(c));
}

export async function lookupNames(names: string[]): Promise<{ query: string; match: Candidate | null }[]> {
  const out: { query: string; match: Candidate | null }[] = [];
  for (const raw of names.slice(0, 25)) {
    const q = raw.trim().slice(0, 120);
    if (!q) continue;
    const res = await fetchWithTimeout(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA } }
    );
    const ids: string[] = res && res.ok ? ((await res.json())?.search ?? []).map((s: { id: string }) => s.id) : [];
    let match: Candidate | null = null;
    if (ids.length) {
      // Of the search hits, the first that is a company with a website.
      const rows = await sparql(`
SELECT ?item (MAX(?emp) AS ?employees) (SAMPLE(?web) AS ?website) (SAMPLE(?article) AS ?article)
       (SAMPLE(?officialName) AS ?officialName) (SAMPLE(?label) AS ?label) (SAMPLE(?industry) AS ?industry) (SAMPLE(?countryCode) AS ?countryCode)
WHERE {
  VALUES ?item { ${ids.map((i) => `wd:${i}`).join(' ')} }
  ?item wdt:P856 ?web .
  FILTER EXISTS { ?item wdt:P31/wdt:P279? ?t . VALUES ?t { ${COMPANY_TYPES.map((t) => `wd:${t}`).join(' ')} } }
  OPTIONAL { ?item wdt:P1128 ?emp . }
  ${SELECT_FIELDS}
}
GROUP BY ?item`);
      const byId = new Map(rowsToCandidates(rows).map((c) => [c.qid, c]));
      match = ids.map((i) => byId.get(i)).find(Boolean) ?? null;
    }
    out.push({ query: q, match });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Career page search
// ---------------------------------------------------------------------------

type CareerCandidate = {
  /** 'greenhouse' = board token; 'careers_url' = anything the importer reads. */
  kind: 'greenhouse' | 'careers_url';
  url: string;
  token?: string;
  platform: string | null;
  /** How we know it belongs to this company. */
  evidence: 'website' | 'name' | 'guess';
  /** Jobs counted by the job board itself (when it tells us). */
  jobs: number | null;
};

const CAREER_WORDS = /(career|careers|jobs|job-search|join-us|joinus|work-with-us|workwithus|vacanc|karriere|stellenangebote|stellen|jobboerse|vacatures|werken-bij|werkenbij|emplois|carriere|carrieres|empleo|trabaja|lavora|carriera|jobb|karriar|praca|kariera)/i;
/** Account / session / asset links on a jobs host — never a job listing. */
const NOT_A_LISTING_RE = /\/(services\/security|logout\w*|log-out|signout|sign-out|login|log-in|signin|sign-in|register|account|profile|cookie\w*|privacy|static|assets?)(\/|\?|$)|\.(js|css|png|jpe?g|svg|ico)(\?|$)/i;

const ATS_RE =
  /https?:\/\/(?:[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[^\s"'<>?#]*|[a-z0-9.-]*myworkdaysite\.com\/[^\s"'<>?#]*|(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/[a-z0-9_-]+|jobs\.(?:eu\.)?lever\.co\/[a-z0-9_.-]+|jobs\.ashbyhq\.com\/[a-z0-9_.%-]+|(?:jobs|careers)\.smartrecruiters\.com\/[a-z0-9_-]+|[a-z0-9-]+\.(?:fa\.[a-z0-9-]+\.)?oraclecloud\.com\/hcmUI\/CandidateExperience\/[^\s"'<>]*|[a-z0-9-]+\.eightfold\.ai\/careers[^\s"'<>]*|[a-z0-9-]+\.jobs\.personio\.(?:de|com)[^\s"'<>]*|career\d*\.successfactors\.(?:com|eu)\/[^\s"'<>]*|jobs\.[a-z0-9-]+\.[a-z.]+\/[^\s"'<>]*)/gi;

function platformOf(url: string): string | null {
  const h = hostOf(url);
  if (/myworkdayjobs|myworkdaysite/.test(h)) return 'Workday';
  if (/greenhouse\.io/.test(h)) return 'Greenhouse';
  if (/lever\.co/.test(h)) return 'Lever';
  if (/ashbyhq/.test(h)) return 'Ashby';
  if (/smartrecruiters/.test(h)) return 'SmartRecruiters';
  if (/oraclecloud/.test(h)) return 'Oracle';
  if (/eightfold/.test(h)) return 'Eightfold';
  if (/personio/.test(h)) return 'Personio';
  if (/successfactors/.test(h)) return 'SuccessFactors';
  return null;
}

export function slugGuesses(name: string, domain: string): string[] {
  const core = coreName(name);
  const root = domain.split('.')[0];
  const words = core.split(' ').filter(Boolean);
  const set = new Set<string>([root, words.join(''), words.join('-'), words[0] ?? ''].filter((s) => s && s.length >= 3 && s.length <= 40));
  return [...set].slice(0, 4);
}

async function jsonOrNull(url: string): Promise<unknown> {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 7000);
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Names match closely enough to trust a job board found by guessing its slug. */
function sameCompany(a: string, b: string): boolean {
  const x = coreName(a);
  const y = coreName(b);
  return Boolean(x && y && (x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ')));
}

async function probeBoards(name: string, domain: string): Promise<CareerCandidate[]> {
  const out: CareerCandidate[] = [];
  await Promise.all(
    slugGuesses(name, domain).flatMap((slug) => [
      (async () => {
        const board = (await jsonOrNull(`https://boards-api.greenhouse.io/v1/boards/${slug}`)) as { name?: string } | null;
        if (!board?.name) return;
        const jobs = (await jsonOrNull(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)) as { jobs?: unknown[] } | null;
        const n = jobs?.jobs?.length ?? 0;
        if (n) out.push({ kind: 'greenhouse', url: `https://boards.greenhouse.io/${slug}`, token: slug, platform: 'Greenhouse', evidence: sameCompany(board.name, name) ? 'name' : 'guess', jobs: n });
      })(),
      (async () => {
        const res = (await jsonOrNull(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`)) as {
          totalFound?: number;
          content?: { company?: { name?: string } }[];
        } | null;
        const n = res?.totalFound ?? 0;
        if (!n) return;
        const cname = res?.content?.[0]?.company?.name ?? '';
        out.push({ kind: 'careers_url', url: `https://jobs.smartrecruiters.com/${slug}`, platform: 'SmartRecruiters', evidence: cname && sameCompany(cname, name) ? 'name' : 'guess', jobs: n });
      })(),
      (async () => {
        for (const host of ['api.lever.co', 'api.eu.lever.co']) {
          const list = (await jsonOrNull(`https://${host}/v0/postings/${slug}?mode=json&limit=200`)) as unknown[] | null;
          if (Array.isArray(list) && list.length) {
            out.push({ kind: 'careers_url', url: `https://jobs.lever.co/${slug}`, platform: 'Lever', evidence: 'guess', jobs: list.length });
            return;
          }
        }
      })(),
      (async () => {
        const res = (await jsonOrNull(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)) as { jobs?: unknown[] } | null;
        const n = res?.jobs?.length ?? 0;
        if (n) out.push({ kind: 'careers_url', url: `https://jobs.ashbyhq.com/${slug}`, platform: 'Ashby', evidence: 'guess', jobs: n });
      })(),
    ])
  );
  return out;
}

async function readPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en' } }, 10000);
  if (!res || !res.ok || !/html/i.test(res.headers.get('content-type') ?? 'text/html')) return null;
  const html = (await res.text()).slice(0, 1_500_000);
  return { html, finalUrl: res.url || url };
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(href.replace(/&amp;/g, '&'), base);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function findIcons(html: string, base: string): string[] {
  const icons: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !/icon/.test(rel)) continue;
    const url = absolute(href, base);
    if (!url || /\.svg(\?|$)/i.test(url)) continue;
    const size = Number(/sizes=["'](\d+)x\d+/i.exec(tag)?.[1] ?? 0);
    const score = (rel.includes('apple-touch') ? 1000 : 0) + (size || (/\.ico(\?|$)/i.test(url) ? 32 : 100));
    icons.push({ url, score });
  }
  icons.sort((a, b) => b.score - a.score);
  const origin = (() => {
    try {
      return new URL(base).origin;
    } catch {
      return '';
    }
  })();
  // Meta tags that name an image the site uses as its logo/icon.
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/(name|property|itemprop)=["'](msapplication-TileImage|og:logo|logo)["']/i.test(tag)) continue;
    const href = /content=["']([^"']+)["']/i.exec(tag)?.[1];
    const url = href ? absolute(href, base) : null;
    if (url && !/\.svg(\?|$)/i.test(url)) icons.push({ url, score: 500 });
  }
  icons.sort((a, b) => b.score - a.score);
  const list = icons.map((i) => i.url);
  if (origin) list.push(`${origin}/apple-touch-icon.png`, `${origin}/apple-touch-icon-precomposed.png`, `${origin}/favicon.ico`);
  list.push(...faviconServices(hostOf(base)));
  return [...new Set(list)].slice(0, 10);
}

/** Public favicon services — they answer for almost any domain. */
export function faviconServices(domain: string): string[] {
  if (!domain) return [];
  // gstatic + DuckDuckGo answer 404 when they have nothing; Google's s2 answers a grey globe, so it goes last.
  return [
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=256`,
  ];
}

/** A host that belongs to this company: its domain, a subdomain, or e.g. jobs.bayer.de for bayer.com. */
function ownHost(h: string, domain: string): boolean {
  const root = domain.split('.')[0];
  return h === domain || h.endsWith(`.${domain}`) || (root.length >= 3 && h.split('.').some((part) => part === root));
}

export function findCareerLinks(html: string, base: string, domain: string): { ats: string[]; pages: string[] } {
  const ats = new Set<string>();
  // Greenhouse embeds: .../embed/job_board?for=<token>
  for (const m of html.matchAll(/greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/gi)) ats.add(`https://boards.greenhouse.io/${m[1].toLowerCase()}`);
  for (const m of html.matchAll(ATS_RE)) {
    const u = m[0].replace(/[),.;]+$/, '');
    if (/greenhouse\.io\/embed\b/i.test(u) || NOT_A_LISTING_RE.test(u)) continue;
    if (platformOf(u) || ownHost(hostOf(u), domain)) ats.add(u);
  }
  const pages: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const url = absolute(m[1], base);
    if (!url || NOT_A_LISTING_RE.test(url)) continue;
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!CAREER_WORDS.test(url) && !CAREER_WORDS.test(text)) continue;
    const h = hostOf(url);
    if (!ownHost(h, domain) && !platformOf(url)) continue;
    let score = 0;
    if (/^(jobs|careers|karriere)\./.test(h)) score += 5;
    if (/\/(careers?|jobs|karriere|stellenangebote|vacatures|werken-bij)\/?$/i.test(new URL(url).pathname)) score += 4;
    if (/search|openings|stellen|vacatures|positions|job-search|all-jobs/i.test(url)) score += 3;
    if (CAREER_WORDS.test(text)) score += 2;
    pages.push({ url: url.replace(/\/$/, ''), score });
  }
  pages.sort((a, b) => b.score - a.score);
  return { ats: [...ats].slice(0, 5), pages: [...new Set(pages.map((p) => p.url))].slice(0, 3) };
}

/** Workday boards named after the company, e.g. tesco.wd3.myworkdayjobs.com/External. */
async function probeWorkday(name: string, domain: string): Promise<CareerCandidate[]> {
  const tenants = [...new Set(slugGuesses(name, domain).map((t) => t.replace(/-/g, '')))].slice(0, 2);
  const out: CareerCandidate[] = [];
  const tries: Promise<void>[] = [];
  for (const tenant of tenants) {
    const cap = tenant[0].toUpperCase() + tenant.slice(1);
    const sites = [...new Set(['External', 'Careers', `${cap}Careers`, `${cap}_Careers`, `${cap}External`, 'ExternalCareerSite', `${cap}_External_Careers`, 'careers'])];
    for (const wd of [1, 3, 5, 103]) {
      for (const site of sites) {
        tries.push(
          (async () => {
            const origin = `https://${tenant}.wd${wd}.myworkdayjobs.com`;
            const res = await fetchWithTimeout(
              `${origin}/wday/cxs/${tenant}/${site}/jobs`,
              { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': BROWSER_UA }, body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' }) },
              7000
            );
            if (!res?.ok) return;
            const json = await res.json().catch(() => null);
            const n = typeof json?.total === 'number' ? json.total : 0;
            if (n > 0 && !out.some((c) => c.url.startsWith(origin))) {
              out.push({ kind: 'careers_url', url: `${origin}/${site}`, platform: 'Workday', evidence: 'name', jobs: n });
            }
          })()
        );
      }
    }
  }
  await Promise.all(tries);
  return out;
}

const CAREER_PATHS = ['/careers', '/jobs', '/en/careers', '/careers/jobs', '/about-us/careers', '/about/careers', '/work-with-us', '/join-us', '/karriere', '/werken-bij', '/vacatures', '/en/jobs'];

/**
 * Finds career page candidates for one company.
 * deep = second pass for companies the first pass missed: tries www / no-www
 * versions of the site, more careers addresses, careers sites on their own
 * domain name (e.g. tesco-careers.com) and Workday boards named after them.
 */
export async function probe(name: string, website: string, deep = false) {
  const domain = hostOf(website);
  const root = domain.split('.')[0];
  const tld = domain.slice(root.length + 1) || 'com';

  let home = await readPage(website);
  if (!home && deep) {
    for (const alt of [`https://www.${domain}`, `https://${domain}`, `http://www.${domain}`]) {
      if (alt.replace(/\/$/, '') === website.replace(/\/$/, '')) continue;
      home = await readPage(alt);
      if (home) break;
    }
  }
  const boardsP = probeBoards(name, domain);
  const workdayP = deep ? probeWorkday(name, domain) : Promise.resolve([] as CareerCandidate[]);

  const candidates: CareerCandidate[] = [];
  const seen = new Set<string>();
  const add = (c: CareerCandidate) => {
    const k = c.token ? `gh:${c.token}` : c.url.replace(/\/$/, '').toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    candidates.push(c);
  };
  const addAts = (url: string, evidence: CareerCandidate['evidence']) => {
    const gh = /greenhouse\.io\/([a-z0-9_-]+)/i.exec(url);
    if (gh && !['embed', 'job_board'].includes(gh[1].toLowerCase())) add({ kind: 'greenhouse', url, token: gh[1].toLowerCase(), platform: 'Greenhouse', evidence, jobs: null });
    else add({ kind: 'careers_url', url, platform: platformOf(url), evidence, jobs: null });
  };
  let icons: string[] = [`https://www.google.com/s2/favicons?domain=${domain}&sz=256`];

  if (home) {
    icons = findIcons(home.html, home.finalUrl);
    const first = findCareerLinks(home.html, home.finalUrl, domain);
    let ats = first.ats;
    // One hop (two when searching deeper): the careers page usually links to the real job board.
    for (const page of first.pages.slice(0, deep ? 2 : 1)) {
      const careers = await readPage(page);
      if (careers) ats = [...new Set([...ats, ...findCareerLinks(careers.html, careers.finalUrl, domain).ats])];
    }
    for (const url of ats) addAts(url, 'website');
    for (const url of first.pages) add({ kind: 'careers_url', url, platform: platformOf(url), evidence: 'website', jobs: null });
  }

  // Nothing linked (or the homepage blocked us): the usual careers addresses on the company's own domain.
  if (!candidates.length) {
    const origin = (() => {
      try {
        return new URL(home?.finalUrl ?? website).origin;
      } catch {
        return `https://www.${domain}`;
      }
    })();
    const own = [`https://careers.${domain}`, `https://jobs.${domain}`, ...(deep ? CAREER_PATHS : CAREER_PATHS.slice(0, 2)).map((p) => origin + p)];
    if (deep) own.push(`https://karriere.${domain}`, `https://werkenbij.${domain}`);
    // Separate careers sites named after the company: tesco-careers.com, shelljobs.com …
    const roots = [...new Set([coreName(name).replace(/\s+/g, ''), root])].filter((r) => r.length >= 3 && r.length <= 30).slice(0, 2);
    const named = deep
      ? roots.flatMap((r) => [`https://www.${r}-careers.com`, `https://www.${r}careers.com`, `https://www.${r}jobs.com`, `https://careers.${r}.${tld === 'com' ? 'co.uk' : 'com'}`])
      : [];
    const read = await Promise.all([...own, ...named].map((u) => readPage(u)));
    read.forEach((pg, i) => {
      if (!pg) return;
      const isNamed = i >= own.length;
      const h = hostOf(pg.finalUrl);
      if (!isNamed && !ownHost(h, domain) && !platformOf(pg.finalUrl)) return;
      // A careers site on another domain must name the company in its title or link its website.
      if (isNamed) {
        const title = (/<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(pg.html)?.[1] ?? '').toLowerCase();
        const core = coreName(name);
        if (!(core && title.includes(core.split(' ')[0])) && !pg.html.toLowerCase().includes(domain)) return;
      }
      const evidence: CareerCandidate['evidence'] = isNamed ? 'name' : 'website';
      for (const url of findCareerLinks(pg.html, pg.finalUrl, isNamed ? h : domain).ats) addAts(url, evidence);
      add({ kind: 'careers_url', url: pg.finalUrl.replace(/\/$/, ''), platform: platformOf(pg.finalUrl), evidence, jobs: null });
    });
  }

  // Job boards found by name last; ones already found keep their place but get the job count.
  for (const b of [...(await boardsP), ...(await workdayP)]) {
    const k = b.token ? `gh:${b.token}` : b.url.replace(/\/$/, '').toLowerCase();
    const dup = candidates.find((c) => (c.token ? `gh:${c.token}` : c.url.replace(/\/$/, '').toLowerCase()) === k);
    if (dup) dup.jobs = b.jobs;
    else add(b);
  }
  const rank = { website: 0, name: 1, guess: 2 } as const;
  candidates.sort((a, b) => rank[a.evidence] - rank[b.evidence] || (platformOf(b.url) ? 1 : 0) - (platformOf(a.url) ? 1 : 0));
  return { domain, websiteReachable: Boolean(home), candidates: candidates.slice(0, deep ? 8 : 6), icons };
}

// ---------------------------------------------------------------------------
// Logo: square 128×128 PNG in storage
// ---------------------------------------------------------------------------

type Bitmap = { width: number; height: number; data: Uint8Array }; // RGBA

function decodeImage(buf: Uint8Array): Bitmap | null {
  const b = Buffer.from(buf);
  try {
    if (b[0] === 0x89 && b[1] === 0x50) {
      const png = PNG.sync.read(b);
      return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      const img = jpeg.decode(b, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
      return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
    }
    if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return decodeIco(buf);
  } catch {
    return null;
  }
  return null; // SVG / WebP — skipped
}

/** .ico files (what most sites' favicon.ico is): the biggest image inside, PNG or BMP. */
function decodeIco(buf: Uint8Array): Bitmap | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const count = dv.getUint16(4, true);
  let best: { w: number; size: number; offset: number } | null = null;
  for (let i = 0; i < Math.min(count, 32); i++) {
    const e = 6 + i * 16;
    if (e + 16 > buf.length) break;
    const w = buf[e] || 256;
    const size = dv.getUint32(e + 8, true);
    const offset = dv.getUint32(e + 12, true);
    if (offset + size > buf.length || size < 40) continue;
    if (!best || w > best.w) best = { w, size, offset };
  }
  if (!best) return null;
  const part = buf.subarray(best.offset, best.offset + best.size);
  if (part[0] === 0x89 && part[1] === 0x50) {
    const png = PNG.sync.read(Buffer.from(part));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  return decodeDib(part);
}

/** The BMP (DIB) inside an .ico: 32/24/8/4/1 bits, bottom-up, with the 1-bit transparency mask. */
function decodeDib(p: Uint8Array): Bitmap | null {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const header = dv.getUint32(0, true);
  const width = dv.getInt32(4, true);
  const height = Math.abs(dv.getInt32(8, true)) / 2; // XOR image + AND mask
  const bpp = dv.getUint16(14, true);
  const compression = dv.getUint32(16, true);
  if (width <= 0 || height <= 0 || width > 512 || height > 512 || (compression !== 0 && compression !== 3)) return null;
  const colors = bpp <= 8 ? dv.getUint32(32, true) || 1 << bpp : 0;
  const palette = header;
  const pixels = palette + colors * 4;
  const rowBytes = Math.ceil((width * bpp) / 32) * 4;
  const maskRow = Math.ceil(width / 32) * 4;
  const maskStart = pixels + rowBytes * height;
  const out = new Uint8Array(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y++) {
    const row = pixels + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r = 0, g = 0, b = 0, a = 255;
      if (bpp === 32) {
        b = p[row + x * 4]; g = p[row + x * 4 + 1]; r = p[row + x * 4 + 2]; a = p[row + x * 4 + 3];
        if (a) anyAlpha = true;
      } else if (bpp === 24) {
        b = p[row + x * 3]; g = p[row + x * 3 + 1]; r = p[row + x * 3 + 2];
      } else if (bpp === 8 || bpp === 4 || bpp === 1) {
        const bit = x * bpp;
        const byte = p[row + (bit >> 3)];
        const idx = bpp === 8 ? byte : bpp === 4 ? (byte >> (4 - (bit & 7))) & 0x0f : (byte >> (7 - (bit & 7))) & 1;
        const c = palette + idx * 4;
        b = p[c]; g = p[c + 1]; r = p[c + 2];
      } else return null;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }
  // Without real alpha, transparency comes from the AND mask (1 = transparent).
  if (bpp !== 32 || !anyAlpha) {
    for (let y = 0; y < height; y++) {
      const row = maskStart + (height - 1 - y) * maskRow;
      if (row + maskRow > p.length) break;
      for (let x = 0; x < width; x++) {
        const masked = (p[row + (x >> 3)] >> (7 - (x & 7))) & 1;
        out[(y * width + x) * 4 + 3] = masked ? 0 : 255;
      }
    }
  }
  return { width, height, data: out };
}

/** Box-filter downscale into a white size×size square, image centred with padding. */
function toSquare(src: Bitmap, size = 128, pad = 8): Bitmap {
  const out = new Uint8Array(size * size * 4).fill(255);
  const inner = size - pad * 2;
  // Small favicons (16–48 px) are enlarged up to 4× (smoothly) so they don't sit as a dot in the middle.
  const scale = Math.min(inner / src.width, inner / src.height, src.width >= inner || src.height >= inner ? 1 : 4);
  if (scale > 1) return upscaleSquare(src, size, pad, scale);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * src.height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * src.height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * src.width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * src.width) / w));
      let r = 0, g = 0, bl = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const al = src.data[i + 3] / 255;
          r += src.data[i] * al;
          g += src.data[i + 1] * al;
          bl += src.data[i + 2] * al;
          a += al;
          n++;
        }
      }
      // Composite over white.
      const o = ((oy + y) * size + (ox + x)) * 4;
      const cov = a / n;
      out[o] = Math.round((a ? r / a : 255) * cov + 255 * (1 - cov));
      out[o + 1] = Math.round((a ? g / a : 255) * cov + 255 * (1 - cov));
      out[o + 2] = Math.round((a ? bl / a : 255) * cov + 255 * (1 - cov));
      out[o + 3] = 255;
    }
  }
  return { width: size, height: size, data: out };
}

/** Bilinear enlargement onto a white size×size square. */
function upscaleSquare(src: Bitmap, size: number, pad: number, scale: number): Bitmap {
  const out = new Uint8Array(size * size * 4).fill(255);
  const w = Math.min(size - pad * 2, Math.round(src.width * scale));
  const h = Math.min(size - pad * 2, Math.round(src.height * scale));
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  const px = (x: number, y: number, c: number) => src.data[(Math.min(src.height - 1, Math.max(0, y)) * src.width + Math.min(src.width - 1, Math.max(0, x))) * 4 + c];
  for (let y = 0; y < h; y++) {
    const fy = ((y + 0.5) * src.height) / h - 0.5;
    const y0 = Math.floor(fy);
    const dy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) * src.width) / w - 0.5;
      const x0 = Math.floor(fx);
      const dx = fx - x0;
      const mix = (c: number) =>
        px(x0, y0, c) * (1 - dx) * (1 - dy) + px(x0 + 1, y0, c) * dx * (1 - dy) + px(x0, y0 + 1, c) * (1 - dx) * dy + px(x0 + 1, y0 + 1, c) * dx * dy;
      const a = mix(3) / 255;
      const o = ((oy + y) * size + (ox + x)) * 4;
      // Colour weighted by alpha, then over white.
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(a ? (mix(c) * a + 255 * (1 - a)) : 255);
      out[o + 3] = 255;
    }
  }
  return { width: size, height: size, data: out };
}

function encodePng(img: Bitmap): Uint8Array {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return new Uint8Array(PNG.sync.write(png, { colorType: 2, deflateLevel: 9 }));
}

/** True when the picture is (nearly) one flat colour — a blank or placeholder icon, not a logo. */
function isBlank(img: Bitmap): boolean {
  let min = 255, max = 0, opaque = 0;
  const step = Math.max(1, Math.floor((img.width * img.height) / 4096));
  for (let i = 0; i < img.width * img.height; i += step) {
    const o = i * 4;
    if (img.data[o + 3] < 32) continue;
    opaque++;
    const l = (img.data[o] * 3 + img.data[o + 1] * 6 + img.data[o + 2]) / 10;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  return opaque < 8 || max - min < 12;
}

/**
 * Best usable icon → 128×128 PNG in storage → public URL (or null).
 * First pass wants a proper square icon (64 px+); the second takes what
 * there is — a 16/32 px favicon (enlarged smoothly) or a wider logo
 * (Wikipedia logos are often wordmarks), so no company is left without one.
 */
// deno-lint-ignore no-explicit-any
export async function makeLogo(service: any, icons: string[], name: string): Promise<string | null> {
  const list = [...new Set(icons)].slice(0, 14);
  const cache = new Map<string, Bitmap | null>();
  const load = async (url: string): Promise<Bitmap | null> => {
    if (cache.has(url)) return cache.get(url)!;
    let img: Bitmap | null = null;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': /wikimedia|wikipedia/.test(url) ? UA : BROWSER_UA, Accept: 'image/png,image/jpeg,image/x-icon,image/*;q=0.8' } }, 8000);
    if (res && res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length >= 70 && buf.length <= 3_000_000) img = decodeImage(buf);
      if (img && isBlank(img)) img = null;
    }
    cache.set(url, img);
    return img;
  };
  const passes = [
    { min: 64, lo: 0.8, hi: 1.25 },
    { min: 16, lo: 0.4, hi: 3.2 },
  ];
  for (const pass of passes) {
    for (const url of list) {
      const img = await load(url);
      if (!img) continue;
      const ratio = img.width / img.height;
      if (Math.max(img.width, img.height) < pass.min || ratio < pass.lo || ratio > pass.hi) continue;
      const png = encodePng(toSquare(img));
      const slug = coreName(name).replace(/\s+/g, '-').slice(0, 40) || 'company';
      const path = `company-logos/${slug}-${Date.now().toString(36)}.png`;
      const { error } = await service.storage.from('listing-images').upload(path, png, { contentType: 'image/png', upsert: false });
      if (error) throw new Error(`Logo upload failed: ${error.message}`);
      return service.storage.from('listing-images').getPublicUrl(path).data.publicUrl;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Logo for a company that has none: Wikipedia/Wikidata logo → its careers
// page's own icon → its website's icon → public favicon services.
// ---------------------------------------------------------------------------

/** Job-board / ATS hosts: their favicon is the platform's, not the company's. */
const PLATFORM_HOST_RE =
  /(myworkdayjobs|myworkdaysite|workday|greenhouse\.io|lever\.co|ashbyhq|smartrecruiters|oraclecloud|taleo|successfactors|icims|eightfold|avature|jobvite|workable|recruitee|teamtailor|personio|bamboohr|breezy\.hr|jazzhr|applytojob|brassring|phenompeople|radancy|tbcdn|talentbrew|jobs\.sap\.com|hire\.withgoogle|join\.com|softgarden|onlyfy|dvinci|rexx-systems|umantis|haufe|cornerstoneondemand|csod|ukg|ultipro|adp\.com|paylocity|paycom|dayforce|ceridian|zohorecruit|freshteam|pinpointhq|hibob|occupop|eploy|tal\.net|networx|webitrent|engageats|cezanneondemand|indeed|linkedin|glassdoor|google|consent|goo\.gl)/i;

export function isPlatformHost(url: string): boolean {
  return PLATFORM_HOST_RE.test(hostOf(url));
}

/** The company's own logo from Wikidata (P154), as a PNG rendering from Wikimedia Commons. */
export async function wikiLogoUrls(name: string, domain: string): Promise<string[]> {
  const q = name.trim().slice(0, 120);
  if (!q) return [];
  const search = await fetchWithTimeout(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(q)}`,
    { headers: { 'User-Agent': UA } },
    8000
  );
  const ids: string[] = search && search.ok ? ((await search.json().catch(() => null))?.search ?? []).map((s: { id: string }) => s.id) : [];
  if (!ids.length) return [];
  const ent = await fetchWithTimeout(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels&languages=en&ids=${ids.join('|')}`,
    { headers: { 'User-Agent': UA } },
    8000
  );
  const entities = ent && ent.ok ? ((await ent.json().catch(() => null))?.entities ?? {}) : {};
  const core = coreName(name);
  const root = (u: string) => u.split('.').slice(-2).join('.');
  const out: string[] = [];
  for (const id of ids) {
    const e = entities[id];
    if (!e?.claims) continue;
    // deno-lint-ignore no-explicit-any
    const vals = (p: string): string[] => (e.claims[p] ?? []).map((c: any) => c?.mainsnak?.datavalue?.value).filter((v: unknown) => typeof v === 'string');
    const sites = vals('P856').map(hostOf).filter(Boolean);
    const label = String(e.labels?.en?.value ?? '');
    // Same company: its website is this domain — or, when we don't know the domain, the exact same name.
    const same = domain ? sites.some((h) => h === domain || root(h) === root(domain)) : coreName(label) === core;
    if (!same) continue;
    for (const file of [...vals('P154'), ...vals('P8972'), ...vals('P2910')].slice(0, 3)) {
      out.push(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=256`);
    }
    if (out.length) break;
  }
  return out;
}

/**
 * Every icon worth trying for a company, best first: its Wikipedia logo,
 * the careers page's own favicon (when the careers page is on the
 * company's own site, not a job platform), its website's icons, then
 * favicon services for each of its domains.
 */
export async function logoCandidates(opts: { name: string; website?: string | null; pages?: (string | null | undefined)[] }): Promise<string[]> {
  const pages = [...new Set([opts.website, ...(opts.pages ?? [])].filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u))))].filter((u) => !isPlatformHost(u));
  const domains = [...new Set(pages.map(hostOf).filter(Boolean))];
  const websiteDomain = opts.website ? hostOf(opts.website) : domains[0] ?? '';
  const list: string[] = [];
  list.push(...(await wikiLogoUrls(opts.name, websiteDomain).catch(() => [])));
  for (const page of pages.slice(0, 3)) {
    const read = await readPage(page);
    if (read && !isPlatformHost(read.finalUrl)) list.push(...findIcons(read.html, read.finalUrl).filter((u) => !/google\.com\/s2|gstatic|duckduckgo/.test(u)));
    else {
      try {
        list.push(`${new URL(page).origin}/apple-touch-icon.png`, `${new URL(page).origin}/favicon.ico`);
      } catch {
        /* ignore */
      }
    }
  }
  // Root domain too: careers.acme.com → acme.com
  const roots = domains.map((d) => d.split('.').slice(-3).join('.').replace(/^(careers?|jobs?|karriere|work|join)\./, ''));
  for (const d of [...new Set([...domains, ...roots])]) list.push(...faviconServices(d));
  return [...new Set(list)];
}
