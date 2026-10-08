// Reading an application form before anything is filled in.
//
// For each job MadeVisa wants to know, before it asks the person anything:
// which hiring system the form is on, whether it needs a sign-in, and —
// where the hiring system publishes it — the list of questions.
//
//   Greenhouse   the public job board API (…/jobs/{id}?questions=true)
//   Lever        the public application page (each question's own definition is in it)
//   Ashby        the public job board's form definition
//   Workday, iCIMS, SuccessFactors, Oracle, Taleo, Amazon …
//                need the candidate's own account: "login"
//   anything else
//                "live": the worker reads the form when it opens it
//
// Only public pages, at addresses built here from a recognised link —
// never a link taken as-is from the page. Read-only.
//
// Plain TypeScript, no Deno or Node APIs: the edge function and the tests
// both use it with their own fetch.

export type Kind = 'text' | 'long' | 'select' | 'multi' | 'file' | 'yesno' | 'checkbox' | 'number' | 'date';
export type FormQuestion = { id: string; label: string; required: boolean; kind: Kind; options?: string[]; file?: 'cv' | 'cover_letter' | 'other' };
export type Platform = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'smartrecruiters' | 'workable' | 'icims' | 'successfactors' | 'oracle' | 'taleo' | 'amazon' | 'other';
export type FormRead = { platform: Platform | 'email' | null; status: 'ok' | 'live' | 'login' | 'none' | 'closed'; questions: FormQuestion[] | null };

const HOSTS: [Platform, RegExp][] = [
  ['greenhouse', /(^|\.)greenhouse\.io$/],
  ['lever', /(^|\.)lever\.co$/],
  ['ashby', /(^|\.)ashbyhq\.com$/],
  ['workday', /\.(myworkdayjobs|myworkdaysite)\.com$/],
  ['smartrecruiters', /(^|\.)smartrecruiters\.com$/],
  ['workable', /(^|\.)workable\.com$/],
  ['icims', /(^|\.)icims\.com$/],
  ['successfactors', /(^|\.)(successfactors\.(com|eu)|jobs\.sap\.com)$/],
  ['oracle', /(^|\.)oraclecloud\.com$/],
  ['taleo', /(^|\.)taleo\.net$/],
  ['amazon', /(^|\.)amazon\.jobs$/],
];

/** These ask the candidate to create an account or sign in before applying. MadeVisa never signs in as anyone. */
export const LOGIN_PLATFORMS: Platform[] = ['workday', 'icims', 'successfactors', 'oracle', 'taleo', 'amazon'];

export function platformOf(url: string | null | undefined): Platform | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    for (const [p, re] of HOSTS) if (re.test(host)) return p;
    if (/[?&]gh_jid=\d+/.test(u.search)) return 'greenhouse';
    return 'other';
  } catch {
    return null;
  }
}

// --- Greenhouse ------------------------------------------------------------------------

export function greenhouseRef(url: string | null | undefined): { board: string; job: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const gh = u.searchParams.get('gh_jid');
    if (!/(^|\.)greenhouse\.io$/.test(u.hostname.toLowerCase())) {
      // A company's own careers page embedding Greenhouse: the board is not in the link.
      return null;
    }
    const embed = u.searchParams.get('for');
    const token = u.searchParams.get('token') ?? gh;
    if (embed && token && /^\d+$/.test(token) && /^[A-Za-z0-9_-]+$/.test(embed)) return { board: embed, job: token };
    const m = u.pathname.match(/^\/(?:embed\/job_app\/)?([A-Za-z0-9_-]+)\/jobs\/(\d+)/);
    return m ? { board: m[1], job: m[2] } : null;
  } catch {
    return null;
  }
}

type GhField = { name?: string; type?: string; values?: { label?: string; value?: unknown }[] };
type GhQuestion = { label?: string; required?: boolean | null; fields?: GhField[]; description?: string | null };

const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const fileKind = (label: string, name = ''): 'cv' | 'cover_letter' | 'other' =>
  /cover|letter|anschreiben|motivation/i.test(`${label} ${name}`) ? 'cover_letter' : /resume|\bcv\b|curriculum|lebenslauf/i.test(`${label} ${name}`) ? 'cv' : 'other';

const yesNo = (options: string[]) => options.length === 2 && options.every((o) => /^(yes|no)$/i.test(o));

/** A Greenhouse job's public question list → questions. Anything not understood is left out rather than guessed at. */
export function parseGreenhouse(json: unknown): FormQuestion[] {
  const j = json as { questions?: GhQuestion[]; data_compliance?: { type?: string; requires_consent?: boolean; requires_processing_consent?: boolean }[] } | null;
  const out: FormQuestion[] = [];
  for (const q of Array.isArray(j?.questions) ? j!.questions : []) {
    const label = clean(q.label);
    // A question can have two fields (a file, or the same thing typed in): the first one is the question.
    const field = q.fields?.find((f) => f.type !== 'textarea' || !q.fields?.some((g) => g.type === 'input_file')) ?? q.fields?.[0];
    if (!field?.name || !label) continue;
    const type = String(field.type ?? '');
    if (type === 'input_hidden') continue;
    const options = (field.values ?? []).map((v) => clean(v.label)).filter(Boolean);
    const kind: Kind =
      type === 'input_file' ? 'file'
      : type === 'textarea' ? 'long'
      : type === 'multi_value_multi_select' ? 'multi'
      : type === 'multi_value_single_select' ? (yesNo(options) ? 'yesno' : 'select')
      : type === 'boolean' ? 'checkbox'
      : 'text';
    out.push({ id: `gh:${field.name}`, label, required: Boolean(q.required), kind, ...(options.length ? { options } : {}), ...(kind === 'file' ? { file: fileKind(label, field.name) } : {}) });
  }
  // GDPR boards add a required consent box to the form.
  const gdpr = (j?.data_compliance ?? []).find((d) => d.type === 'gdpr' && (d.requires_consent || d.requires_processing_consent));
  if (gdpr) out.push({ id: 'gh:gdpr_consent', label: 'I consent to the processing of my data under the employer’s privacy notice', required: true, kind: 'checkbox' });
  return out;
}

// --- Lever -------------------------------------------------------------------------------

export function leverRef(url: string | null | undefined): { host: string; site: string; job: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host !== 'jobs.lever.co' && host !== 'jobs.eu.lever.co') return null;
    const m = u.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([0-9a-f-]{36})/i);
    return m ? { host, site: m[1], job: m[2] } : null;
  } catch {
    return null;
  }
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

type LeverCardField = { type?: string; text?: string; required?: boolean; options?: { text?: string }[] };

/**
 * Lever's application page: the standard fields, plus each custom question card — whose own definition
 * (type, wording, required, choices) sits in the page as `cards[<id>][baseTemplate]`.
 */
export function parseLever(html: string): FormQuestion[] {
  const out: FormQuestion[] = [];
  const has = (name: string) => new RegExp(`name=["']${name.replace(/[[\]]/g, '\\$&')}["']`).test(html);
  const req = (name: string) => new RegExp(`name=["']${name.replace(/[[\]]/g, '\\$&')}["'][^>]*\\brequired\\b|\\brequired\\b[^>]*name=["']${name.replace(/[[\]]/g, '\\$&')}["']`).test(html);
  if (has('resume')) out.push({ id: 'lever:resume', label: 'Resume/CV', required: true, kind: 'file', file: 'cv' });
  if (has('name')) out.push({ id: 'lever:name', label: 'Full name', required: true, kind: 'text' });
  if (has('email')) out.push({ id: 'lever:email', label: 'Email', required: true, kind: 'text' });
  if (has('phone')) out.push({ id: 'lever:phone', label: 'Phone', required: req('phone'), kind: 'text' });
  if (has('location')) out.push({ id: 'lever:location', label: 'Current location', required: req('location'), kind: 'text' });
  if (has('org')) out.push({ id: 'lever:org', label: 'Current company', required: req('org'), kind: 'text' });
  for (const m of html.matchAll(/name=["']urls\[([^\]"']+)\]["']/g)) {
    out.push({ id: `lever:urls[${m[1]}]`, label: decode(m[1]), required: req(`urls[${m[1]}]`), kind: 'text' });
  }
  for (const m of html.matchAll(/name=["']cards\[([0-9a-f-]{36})\]\[baseTemplate\]["'][^>]*value=["']([^"']*)["']|value=["']([^"']*)["'][^>]*name=["']cards\[([0-9a-f-]{36})\]\[baseTemplate\]["']/gi)) {
    const card = m[1] ?? m[4];
    const raw = m[2] ?? m[3];
    let tpl: { fields?: LeverCardField[] } | null = null;
    try {
      tpl = JSON.parse(decode(raw));
    } catch {
      continue;
    }
    (tpl?.fields ?? []).forEach((f, i) => {
      const label = clean(f.text);
      if (!label) return;
      const options = (f.options ?? []).map((o) => clean(o.text)).filter(Boolean);
      const t = String(f.type ?? '');
      const kind: Kind = t === 'textarea' ? 'long' : t === 'multiple-select' ? 'multi' : t === 'multiple-choice' || t === 'dropdown' ? (yesNo(options) ? 'yesno' : 'select') : t === 'file-upload' ? 'file' : 'text';
      out.push({ id: `lever:cards[${card}][field${i}]`, label, required: Boolean(f.required), kind, ...(options.length ? { options } : {}), ...(kind === 'file' ? { file: fileKind(label) } : {}) });
    });
  }
  // Consents Lever adds: a required one is a question; optional ones are never ticked.
  for (const m of html.matchAll(/<input[^>]*name=["'](consent\[[^\]"']+\])["'][^>]*>/g)) {
    const required = /\brequired\b/.test(m[0]);
    if (required) out.push({ id: `lever:${m[1]}`, label: 'I consent to the processing of my data under the employer’s privacy notice', required: true, kind: 'checkbox' });
  }
  return out;
}

// --- Ashby ---------------------------------------------------------------------------------

export function ashbyRef(url: string | null | undefined): { org: string; job: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() !== 'jobs.ashbyhq.com') return null;
    const m = u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})/i);
    return m ? { org: decodeURIComponent(m[1]), job: m[2] } : null;
  } catch {
    return null;
  }
}

export const ASHBY_QUERY = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    id
    applicationForm { sections { fieldEntries { ... on FormFieldEntry { id field isRequired } } } }
  }
}`;

type AshbyField = { path?: string; title?: string; type?: string; selectableValues?: { label?: string; value?: string }[] };

export function parseAshby(json: unknown): FormQuestion[] | null {
  const form = (json as { data?: { jobPosting?: { applicationForm?: { sections?: { fieldEntries?: { field?: AshbyField; isRequired?: boolean }[] }[] } } | null } } | null)?.data?.jobPosting?.applicationForm;
  if (!form?.sections) return null;
  const out: FormQuestion[] = [];
  for (const s of form.sections) {
    for (const e of s.fieldEntries ?? []) {
      const f = e.field;
      const label = clean(f?.title);
      if (!f?.path || !label) continue;
      const options = (f.selectableValues ?? []).map((v) => clean(v.label)).filter(Boolean);
      const t = String(f.type ?? '');
      const kind: Kind =
        t === 'File' ? 'file'
        : t === 'LongText' ? 'long'
        : t === 'Boolean' ? 'yesno'
        : t === 'MultiValueSelect' ? 'multi'
        : t === 'ValueSelect' ? (yesNo(options) ? 'yesno' : 'select')
        : t === 'Number' ? 'number'
        : t === 'Date' ? 'date'
        : 'text';
      out.push({ id: `ashby:${f.path}`, label, required: Boolean(e.isRequired), kind, ...(options.length ? { options } : {}), ...(kind === 'file' ? { file: f.path === '_systemfield_resume' ? 'cv' : fileKind(label) } : {}) });
    }
  }
  return out;
}

// --- Reading one form ----------------------------------------------------------------------

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function timed(fetcher: Fetch, url: string, init: RequestInit = {}, ms = 8000): Promise<Response | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetcher(url, { ...init, signal: ctl.signal, headers: { 'User-Agent': 'MadeVisa/1.0 (+https://madevisa.com)', ...(init.headers ?? {}) } });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Read one job's application form. Never throws: anything that can't be read is "live" (the worker reads it when it opens it). */
export async function readForm(fetcher: Fetch, url: string | null, opts: { email?: boolean } = {}): Promise<FormRead> {
  if (opts.email) return { platform: 'email', status: 'ok', questions: null };
  if (!url) return { platform: null, status: 'none', questions: null };
  const platform = platformOf(url);
  if (!platform) return { platform: null, status: 'none', questions: null };
  if (LOGIN_PLATFORMS.includes(platform)) return { platform, status: 'login', questions: null };

  if (platform === 'greenhouse') {
    const ref = greenhouseRef(url);
    if (!ref) return { platform, status: 'live', questions: null };
    const res = await timed(fetcher, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.board)}/jobs/${encodeURIComponent(ref.job)}?questions=true`, { headers: { Accept: 'application/json' } });
    if (res?.status === 404) return { platform, status: 'closed', questions: null };
    if (!res?.ok) return { platform, status: 'live', questions: null };
    const qs = parseGreenhouse(await res.json().catch(() => null));
    return qs.length ? { platform, status: 'ok', questions: qs } : { platform, status: 'live', questions: null };
  }

  if (platform === 'lever') {
    const ref = leverRef(url);
    if (!ref) return { platform, status: 'live', questions: null };
    const res = await timed(fetcher, `https://${ref.host}/${encodeURIComponent(ref.site)}/${ref.job}/apply`, { headers: { Accept: 'text/html' } });
    if (res?.status === 404) return { platform, status: 'closed', questions: null };
    if (!res?.ok) return { platform, status: 'live', questions: null };
    const qs = parseLever(await res.text().catch(() => ''));
    return qs.length ? { platform, status: 'ok', questions: qs } : { platform, status: 'live', questions: null };
  }

  if (platform === 'ashby') {
    const ref = ashbyRef(url);
    if (!ref) return { platform, status: 'live', questions: null };
    const res = await timed(fetcher, 'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ operationName: 'ApiJobPosting', variables: { organizationHostedJobsPageName: ref.org, jobPostingId: ref.job }, query: ASHBY_QUERY }),
    });
    if (!res?.ok) return { platform, status: 'live', questions: null };
    const body = await res.json().catch(() => null);
    if ((body as { data?: { jobPosting?: unknown } } | null)?.data && !(body as { data: { jobPosting?: unknown } }).data.jobPosting) return { platform, status: 'closed', questions: null };
    const qs = parseAshby(body);
    return qs?.length ? { platform, status: 'ok', questions: qs } : { platform, status: 'live', questions: null };
  }

  return { platform, status: 'live', questions: null };
}

/** Read many, a few at a time, within a time budget. Ones not reached in time are "live". */
export async function readForms(fetcher: Fetch, items: { id: string; url: string | null; email?: boolean }[], budgetMs = 25_000, parallel = 6): Promise<Record<string, FormRead>> {
  const out: Record<string, FormRead> = {};
  const start = Date.now();
  let i = 0;
  const work = async () => {
    while (i < items.length) {
      const it = items[i++];
      if (Date.now() - start > budgetMs) {
        out[it.id] = { platform: it.email ? 'email' : platformOf(it.url), status: it.url || it.email ? 'live' : 'none', questions: null };
        continue;
      }
      out[it.id] = await readForm(fetcher, it.url, { email: it.email });
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, work));
  return out;
}
