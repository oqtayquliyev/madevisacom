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
  const res = await fetchWithTimeout(
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
    { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } },
    40000
  );
  if (!res || !res.ok) throw new Error(`Wikidata didn't answer (${res?.status ?? 'timeout'}). Try again in a minute.`);
  const json = await res.json();
  return json?.results?.bindings ?? [];
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
    const name = wikiTitle ?? r.officialName?.value ?? r.label?.value ?? '';
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
    if (!url || /\.svg(\?|$)/i.test(url) || /\.ico(\?|$)/i.test(url)) continue;
    const size = Number(/sizes=["'](\d+)x\d+/i.exec(tag)?.[1] ?? 0);
    const score = (rel.includes('apple-touch') ? 1000 : 0) + (size || 100);
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
  const list = icons.map((i) => i.url);
  if (origin) list.push(`${origin}/apple-touch-icon.png`);
  list.push(`https://www.google.com/s2/favicons?domain=${hostOf(base)}&sz=256`);
  return [...new Set(list)].slice(0, 6);
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
    if (/greenhouse\.io\/embed\b/i.test(u)) continue;
    if (platformOf(u) || ownHost(hostOf(u), domain)) ats.add(u);
  }
  const pages: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const url = absolute(m[1], base);
    if (!url) continue;
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

export async function probe(name: string, website: string) {
  const domain = hostOf(website);
  const [boards, home] = await Promise.all([probeBoards(name, domain), readPage(website)]);
  const candidates: CareerCandidate[] = [];
  let icons: string[] = [`https://www.google.com/s2/favicons?domain=${domain}&sz=256`];

  if (home) {
    icons = findIcons(home.html, home.finalUrl);
    const first = findCareerLinks(home.html, home.finalUrl, domain);
    let ats = first.ats;
    const pages = first.pages;
    // One hop: the careers page usually links to the real job board.
    if (pages[0]) {
      const careers = await readPage(pages[0]);
      if (careers) ats = [...new Set([...ats, ...findCareerLinks(careers.html, careers.finalUrl, domain).ats])];
    }
    for (const url of ats) {
      const gh = /greenhouse\.io\/([a-z0-9_-]+)/i.exec(url);
      if (gh && !['embed', 'job_board'].includes(gh[1].toLowerCase())) {
        candidates.push({ kind: 'greenhouse', url, token: gh[1].toLowerCase(), platform: 'Greenhouse', evidence: 'website', jobs: null });
      } else candidates.push({ kind: 'careers_url', url, platform: platformOf(url), evidence: 'website', jobs: null });
    }
    for (const url of pages) candidates.push({ kind: 'careers_url', url, platform: platformOf(url), evidence: 'website', jobs: null });
  }

  // Board guesses last; drop ones already found via the website.
  for (const b of boards) {
    const dup = candidates.find((c) => (b.token && c.token === b.token) || hostOf(c.url) + new URL(c.url).pathname.toLowerCase() === hostOf(b.url) + new URL(b.url).pathname.toLowerCase());
    if (dup) {
      dup.jobs = b.jobs;
      continue;
    }
    candidates.push(b);
  }
  const rank = { website: 0, name: 1, guess: 2 } as const;
  candidates.sort((a, b) => rank[a.evidence] - rank[b.evidence] || (platformOf(b.url) ? 1 : 0) - (platformOf(a.url) ? 1 : 0));
  return { domain, websiteReachable: Boolean(home), candidates: candidates.slice(0, 6), icons };
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
  } catch {
    return null;
  }
  return null; // SVG / ICO / WebP — skipped
}

/** Box-filter downscale into a white size×size square, image centred with padding. */
function toSquare(src: Bitmap, size = 128, pad = 8): Bitmap {
  const out = new Uint8Array(size * size * 4).fill(255);
  const inner = size - pad * 2;
  const scale = Math.min(inner / src.width, inner / src.height, 1);
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

function encodePng(img: Bitmap): Uint8Array {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return new Uint8Array(PNG.sync.write(png, { colorType: 2, deflateLevel: 9 }));
}

/** First usable square-ish icon → 128×128 PNG in storage → public URL (or null). */
// deno-lint-ignore no-explicit-any
export async function makeLogo(service: any, icons: string[], name: string): Promise<string | null> {
  for (const url of icons.slice(0, 6)) {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, 8000);
    if (!res || !res.ok) continue;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 200 || buf.length > 2_000_000) continue;
    const img = decodeImage(buf);
    if (!img) continue;
    const ratio = img.width / img.height;
    if (img.width < 64 || img.height < 64 || ratio < 0.8 || ratio > 1.25) continue;
    const png = encodePng(toSquare(img));
    const slug = coreName(name).replace(/\s+/g, '-').slice(0, 40) || 'company';
    const path = `company-logos/${slug}-${Date.now().toString(36)}.png`;
    const { error } = await service.storage.from('listing-images').upload(path, png, { contentType: 'image/png', upsert: false });
    if (error) throw new Error(`Logo upload failed: ${error.message}`);
    return service.storage.from('listing-images').getPublicUrl(path).data.publicUrl;
  }
  return null;
}

