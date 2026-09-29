// Social publishing (pg_cron → social_tick → { cron: "social" }).
//
// 1. PLAN   — each enabled campaign that is due, for each of its networks:
//             skip if the network posted within its minimum gap or hit its
//             daily limit; pick fresh jobs (social_pick_jobs: live on
//             MadeVisa in the last 24 h, still open, complete, never posted
//             on this network, one per company, salary first); draw images;
//             write the caption with a direct link to every job; validate;
//             queue it (awaiting approval, or approved). The jobs are
//             reserved at once, so no other campaign can pick them.
// 2. PUBLISH — approved posts whose time has come: re-check every job is
//             still open and every image renders at the right size, then
//             post to the network. No credentials → "manual" (ready to post
//             by hand from the admin panel).
//
// Credentials (Supabase → Edge Functions → Secrets). Leave any out and that
// network works in manual mode:
//   Facebook   FB_PAGE_ID, FB_PAGE_TOKEN          (Page access token)
//   Instagram  IG_USER_ID + FB_PAGE_TOKEN         (IG professional account linked to the Page)
//   LinkedIn   LINKEDIN_TOKEN, LINKEDIN_AUTHOR    (e.g. urn:li:organization:12345)
//   TikTok     TIKTOK_TOKEN                       (Content Posting API, photo posts; madevisa.com verified)

import { PNG } from 'npm:pngjs@7.0.0';
import jpeg from 'npm:jpeg-js@0.4.4';
import { Buffer } from 'node:buffer';
import { SITE, type Service } from './shared.ts';

type Platform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok';
type PlatformRow = { platform: Platform; enabled: boolean; size: 'portrait' | 'square' | 'story'; min_gap_minutes: number; max_per_day: number };
type Campaign = {
  id: string;
  name: string;
  kind: 'fresh' | 'student' | 'category' | 'company';
  platforms: Platform[];
  every_minutes: number;
  format: 'list' | 'carousel' | 'single' | 'company' | 'cards' | 'mix';
  jobs_count: number;
  min_jobs: number;
  categories: string[];
  countries: string[];
  salary_only: boolean;
  require_approval: boolean;
};
type Job = {
  id: string;
  title: string;
  company: string;
  logo: string | null;
  city: string | null;
  country: string | null;
  iso: string | null;
  remote: boolean | null;
  work_arrangement: string | null;
  employment_type: string | null;
  job_function: string | null;
  salary: string | null;
  visa: boolean | null;
  student: boolean | null;
};
type Post = {
  id: string;
  platform: Platform;
  format: string;
  caption: string;
  headline: string;
  images: { url: string; width: number; height: number }[];
  job_ids: string[];
  attempts: number;
  validation?: { publish_now?: boolean } | null;
};

const DIMS = { portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920] } as const;
const SHORT: Record<Platform, string> = { facebook: 'fb', instagram: 'ig', linkedin: 'li', tiktok: 'tt' };
const IMAGE_VERSION = '3'; // bump when the image template changes, so new posts get fresh images

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const cleanTitle = (t: string) => t.replace(/\s*\((m|f|w|d|x)\/(m|f|w|d|x)(\/(m|f|w|d|x))?\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
const place = (j: Job) => [j.city, j.country].filter(Boolean).join(', ') || (j.work_arrangement === 'remote' || j.remote ? 'Remote' : '');
const isRemote = (j: Job) => j.work_arrangement === 'remote' || (Boolean(j.remote) && !j.work_arrangement);
const pickBy = <T,>(items: T[], seed: number) => items[Math.abs(seed) % items.length];
const hashtag = (s: string) => `#${s.replace(/[^A-Za-z0-9]+/g, '')}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** Keep only this many finished posts (published / rejected / expired / failed). */
const KEEP_HISTORY = 3;

// ---------------------------------------------------------------------------
// Hashtags people actually search: company, role word, industry, city,
// country — e.g. #eaton #manager #advisor #banking #bedford #hiring #usjobs
// ---------------------------------------------------------------------------

const tagWord = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const COMPANY_NOISE = /^(the|group|inc|ltd|limited|plc|llc|gmbh|ag|sa|corp|corporation|company|co|holding|holdings)$/i;
// Role words worth a hashtag (the last one in the title wins: "Senior Team Lead, Purchasing" → #lead, #purchasing).
const ROLES = ['manager', 'director', 'engineer', 'developer', 'designer', 'analyst', 'advisor', 'adviser', 'consultant', 'accountant', 'operator', 'driver', 'nurse', 'teacher', 'assistant', 'coordinator', 'specialist', 'technician', 'cook', 'chef', 'waiter', 'cashier', 'lead', 'supervisor', 'administrator', 'scientist', 'architect', 'recruiter', 'intern', 'officer', 'associate', 'representative', 'agent', 'electrician', 'mechanic', 'welder', 'warehouse', 'courier', 'cleaner', 'receptionist', 'pharmacist', 'doctor', 'lawyer', 'auditor', 'buyer', 'writer', 'editor', 'marketer', 'producer'];
// Industry / field words found in titles or job functions.
const FIELDS: [RegExp, string][] = [
  [/bank/i, 'banking'], [/financ|accounts? (payable|receivable)|accounting/i, 'finance'], [/retail|store|shop/i, 'retail'],
  [/logistic|warehouse|forklift|supply chain|purchasing|procurement/i, 'logistics'], [/software|developer|devops|frontend|backend|full.?stack/i, 'tech'],
  [/engineer/i, 'engineering'], [/design|ux|ui\b/i, 'design'], [/market/i, 'marketing'], [/sales|account executive|business development/i, 'sales'],
  [/nurs|health|medical|clinic|pharma|care\b/i, 'healthcare'], [/hotel|hospitality|restaurant|cook|chef|kitchen|barista/i, 'hospitality'],
  [/manufactur|production|produktion|operator|factory|assembly|clutch/i, 'manufacturing'], [/customer (service|experience|support)/i, 'customerservice'],
  [/talent|recruit|\bhr\b|human resources|people/i, 'hr'], [/data|analytics/i, 'data'], [/teach|educat|school|tutor/i, 'education'],
  [/legal|lawyer|compliance/i, 'legal'], [/driver|transport|delivery|courier/i, 'transport'], [/construct|electric|mechanic|welder/i, 'trades'],
];
const COUNTRY_TAG: Record<string, string> = { US: 'us', GB: 'uk', AE: 'uae', DE: 'germany', NL: 'netherlands', IE: 'ireland', CA: 'canada', AU: 'australia', FR: 'france', ES: 'spain', IT: 'italy', PL: 'poland', SK: 'slovakia', CZ: 'czechia', BE: 'belgium', CH: 'switzerland', AT: 'austria', SE: 'sweden', DK: 'denmark', NO: 'norway', FI: 'finland', PT: 'portugal', HU: 'hungary', AZ: 'azerbaijan', TR: 'turkey', SG: 'singapore', JP: 'japan', IN: 'india' };

function tagsFor(c: Campaign, jobs: Job[]): string[] {
  const company = new Set<string>(), role = new Set<string>(), field = new Set<string>(), city = new Set<string>(), country = new Set<string>();
  for (const j of jobs) {
    const name = j.company.split(/[\s,.&()-]+/).find((w) => w && !COMPANY_NOISE.test(w));
    if (name && tagWord(name).length >= 2) company.add(tagWord(name));
    const words = cleanTitle(j.title).toLowerCase().split(/[^a-z]+/);
    const r = [...words].reverse().find((w) => ROLES.includes(w.replace(/s$/, '')));
    if (r) role.add(r.replace(/s$/, '').replace('adviser', 'advisor'));
    const text = `${j.title} ${j.job_function ?? ''}`;
    for (const [re, t] of FIELDS) if (re.test(text)) field.add(t);
    if (j.city && tagWord(j.city).length >= 3 && tagWord(j.city).length <= 20) city.add(tagWord(j.city));
    const cc = (j.iso ?? '').toUpperCase();
    if (COUNTRY_TAG[cc]) country.add(`${COUNTRY_TAG[cc]}jobs`);
    else if (j.country) country.add(`${tagWord(j.country)}jobs`);
  }
  for (const cat of c.categories ?? []) if (tagWord(cat)) field.add(tagWord(cat));
  const extra: string[] = [];
  if (c.kind === 'student' || jobs.some((j) => j.student)) extra.push('internships');
  if (jobs.some((j) => j.visa)) extra.push('visasponsorship');
  if (jobs.some(isRemote)) extra.push('remotejobs');
  const all = [...company, ...role, ...field, ...city, 'hiring', ...country, ...extra, 'jobs'];
  return [...new Set(all)].filter(Boolean).slice(0, 15).map((t) => `#${t}`);
}

function jobLink(j: Job, p: Platform): string {
  return `${SITE}/j/${j.id.slice(0, 8)}?s=${SHORT[p]}`;
}

/** Short headline for the image — what these jobs have in common. */
function headlineFor(c: Campaign, jobs: Job[], seed: number): string {
  const n = jobs.length;
  if (c.kind === 'student') return pickBy([`${n} student & internship ${plural(n, 'role', 'roles')}, fresh today`, `Students: ${n} new ${plural(n, 'role', 'roles')} to apply for`, `Internships and first jobs, posted today`], seed);
  if ((c.kind === 'category' || c.categories.length) && c.categories[0]) {
    const cat = c.categories[0].replace(/\b\w/g, (m) => m.toUpperCase());
    return pickBy([`${cat} roles hiring now`, `${n} fresh ${cat.toLowerCase()} ${plural(n, 'opening', 'openings')}`, `${cat}: ${n} new ${plural(n, 'role', 'roles')} today`], seed);
  }
  const mostlyRemote = jobs.filter(isRemote).length > n / 2;
  const visa = jobs.filter((j) => j.visa).length;
  if (seed % 2 === 0) return `${n} new ${plural(n, 'job', 'jobs')}`;
  if (mostlyRemote) return `Remote-friendly roles, posted today`;
  if (visa >= 2 && seed % 3 === 0) return `${visa} roles offering visa sponsorship`;
  return pickBy([`${n} fresh ${plural(n, 'role', 'roles')} worth your attention`, `${n} companies hiring today`, `Posted in the last 24 hours`, `New today: ${n} ${plural(n, 'role', 'roles')} to apply for`], seed);
}

/** Single-job images carry no headline — only the job details. */
function singleHeadline(_j: Job): string {
  return '';
}

function hookFor(c: Campaign, jobs: Job[], seed: number): string {
  const n = jobs.length;
  const companies = jobs.slice(0, 2).map((j) => j.company);
  if (c.kind === 'student')
    return pickBy(
      [
        `Looking for an internship or your first job? ${n === 1 ? 'This one' : `These ${n}`} went live in the last 24 hours.`,
        `New today for students and graduates — ${companies.join(' and ')}${n > 2 ? ' and more' : ''} ${companies.length === 1 ? 'is' : 'are'} hiring.`,
        `${n} ${plural(n, 'role', 'roles')} for students and graduates, fresh from company career pages.`,
      ],
      seed
    );
  if (c.categories[0]) {
    const cat = c.categories[0].toLowerCase();
    return pickBy([`Working in ${cat}? ${n} new ${plural(n, 'role', 'roles')} went live today.`, `Fresh ${cat} roles from ${companies.join(', ')}${n > 2 ? ' and others' : ''}.`], seed);
  }
  if (n === 1) {
    const j = jobs[0];
    return `${j.company} just posted this on its careers page.`;
  }
  return pickBy(
    [
      `${n} roles that went live in the last 24 hours.`,
      `A few roles worth your attention today — straight from company career pages.`,
      `${companies.join(' and ')}${n > 2 ? ` and ${n - 2} more` : ''} ${companies.length === 1 ? 'is' : 'are'} hiring. Posted today.`,
      `Fresh this morning: ${n} openings, no reposts.`,
    ],
    seed
  );
}

/** 🇩🇪 from "DE". */
const flag = (iso: string | null | undefined) =>
  iso && /^[A-Z]{2}$/i.test(iso) ? String.fromCodePoint(...[...iso.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '📍';
const HOOK_EMOJI = ['🚀', '✨', '🔥', '💼', '⚡', '🌍'];

function captionFor(c: Campaign, jobs: Job[], p: Platform, seed: number): string {
  const clickable = p === 'linkedin' || p === 'facebook';
  const blocks = jobs.map((j, i) => {
    const where = place(j);
    const mode = j.work_arrangement === 'hybrid' ? '🏠 Hybrid' : isRemote(j) && where !== 'Remote' ? '🌐 Remote' : null;
    const facts = [where ? `${flag(j.iso)} ${where}` : null, j.salary ? `💰 ${j.salary}` : null, mode, j.visa ? '🛂 Visa sponsorship' : null, j.student ? '🎓 Student' : null].filter(Boolean);
    const link = clickable ? `👉 ${jobLink(j, p)}` : `👉 madevisa.com/j/${j.id.slice(0, 8)}`;
    return `${jobs.length > 1 ? `${i + 1}. ` : ''}${cleanTitle(j.title)} — ${j.company}\n${facts.join(' · ')}\n${link}`;
  });
  const cta = clickable
    ? '🔎 Check visa sponsorship for your passport and apply on madevisa.com/jobs'
    : p === 'instagram'
      ? '🔎 Check visa sponsorship for your passport on madevisa.com/jobs — link in bio.'
      : '🔎 Check visa sponsorship for your passport on madevisa.com/jobs';

  const tags = new Set<string>(tagsFor(c, jobs));

  const limit = p === 'linkedin' ? 2900 : 2150;
  const hook = `${pickBy(HOOK_EMOJI, seed)} ${hookFor(c, jobs, seed)}`;
  let body = [hook, ...blocks, cta, [...tags].join(' ')].join('\n\n');
  while (body.length > limit && blocks.length > 1) {
    blocks.pop();
    body = [hook, ...blocks, cta, [...tags].join(' ')].join('\n\n');
  }
  return body.slice(0, limit);
}

// Every text on the image is a URL parameter (see api/og/social.ts), so the
// admin panel can edit them before the post goes out.
function imageUrl(layout: 'list' | 'single' | 'company' | 'cards', size: string, jobs: Job[], headline: string, date: string, p: Platform) {
  const q = new URLSearchParams({ layout, size, ids: jobs.map((j) => j.id.slice(0, 8)).join(','), h: headline, d: date, s: SHORT[p], hi: 'zap', v: IMAGE_VERSION });
  return `${SITE}/api/og/social?${q.toString()}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Width/height from a PNG header (IHDR). */
function pngSize(buf: Uint8Array): [number, number] | null {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  const v = new DataView(buf.buffer, buf.byteOffset);
  return [v.getUint32(16), v.getUint32(20)];
}

async function validateImage(url: string, w: number, h: number): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];
  try {
    const check = await fetch(`${url}&check=1`, { signal: AbortSignal.timeout(20_000) });
    const r = check.ok ? await check.json() : null;
    if (!r) issues.push(`Layout check failed (${check.status})`);
    else for (const i of r.issues ?? []) issues.push(`${i.level === 'error' ? 'ERROR' : 'note'}: ${i.message}`);
    if (r && r.ok === false) return { ok: false, issues };
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('image/png')) return { ok: false, issues: [...issues, `ERROR: image didn’t render (${res.status})`] };
    const buf = new Uint8Array(await res.arrayBuffer());
    const dims = pngSize(buf);
    if (!dims || dims[0] !== w || dims[1] !== h) return { ok: false, issues: [...issues, `ERROR: image is ${dims ? dims.join('×') : 'unreadable'}, expected ${w}×${h}`] };
    if (buf.length < 15_000) return { ok: false, issues: [...issues, 'ERROR: image looks empty'] };
    return { ok: true, issues };
  } catch (e) {
    return { ok: false, issues: [...issues, `ERROR: ${e instanceof Error ? e.message : 'image check failed'}`] };
  }
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

async function recentPosts(service: Service, p: Platform, minutes: number): Promise<number> {
  const { count } = await service
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('platform', p)
    .in('status', ['awaiting_approval', 'approved', 'publishing', 'published', 'manual'])
    .gte('scheduled_at', new Date(Date.now() - minutes * 60_000).toISOString());
  return count ?? 0;
}

/** The companies (and format) of the last few posts on a network — so the next post doesn't repeat them. */
async function recentOnPlatform(service: Service, p: Platform, n = 3): Promise<{ companies: Set<string>; lastFormat: string | null }> {
  const { data } = await service
    .from('social_posts')
    .select('format, links')
    .eq('platform', p)
    .not('status', 'in', '(rejected,expired)')
    .order('created_at', { ascending: false })
    .limit(n);
  const rows = (data ?? []) as { format: string; links: { company?: string }[] }[];
  const companies = new Set<string>();
  for (const r of rows) for (const l of r.links ?? []) if (l.company) companies.add(l.company.trim().toLowerCase());
  return { companies, lastFormat: rows[0]?.format ?? null };
}

const MIX: Campaign['format'][] = ['cards', 'list', 'company'];

async function planCampaign(service: Service, c: Campaign, platforms: Map<Platform, PlatformRow>, log: string[]) {
  // A different seed every run → different hook, headline and emoji each post.
  const seed = Math.floor(Math.random() * 1_000_000);
  const date = `Fresh · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  for (const p of c.platforms) {
    const pr = platforms.get(p);
    if (!pr?.enabled) continue;
    if ((await recentPosts(service, p, pr.min_gap_minutes)) > 0) {
      log.push(`${c.name} → ${p}: waiting (posted less than ${pr.min_gap_minutes} min ago)`);
      continue;
    }
    if ((await recentPosts(service, p, 24 * 60)) >= pr.max_per_day) {
      log.push(`${c.name} → ${p}: daily limit reached`);
      continue;
    }
    // Never repeat a company from the last 3 posts on this network; "mix"
    // campaigns also switch to a different design than the last post.
    const recent = await recentOnPlatform(service, p, 3);
    const lastIdx = MIX.indexOf((recent.lastFormat ?? '') as Campaign['format']);
    const format: Campaign['format'] = c.format === 'mix' ? MIX[(lastIdx + 1) % MIX.length] : c.format;
    const want =
      format === 'single' ? 1
        : format === 'carousel' || format === 'company' ? Math.min(3, c.jobs_count)
          : format === 'cards' ? Math.min(pr.size === 'square' ? 3 : pr.size === 'story' ? 5 : 4, c.jobs_count)
            : Math.min(pr.size === 'square' ? 3 : 5, c.jobs_count);
    const pick = (cats: string[]) =>
      service.rpc('social_pick_jobs', {
        p_platform: p,
        p_count: Math.min(want * 3, 15),
        p_kind: c.kind === 'student' ? 'student' : 'fresh',
        p_categories: cats,
        p_countries: c.countries ?? [],
        p_salary_only: c.salary_only,
      });
    const cats = (c.categories ?? []).filter(Boolean);
    let jobs: Job[] = [];
    if (cats.length > 1) {
      // Several categories chosen: take turns, one job from each category, so
      // every category gets its share instead of the first one filling the post.
      const lists = await Promise.all(cats.map((x) => pick([x])));
      const bad = lists.find((r) => r.error);
      if (bad?.error) {
        log.push(`${c.name} → ${p}: ${bad.error.message}`);
        continue;
      }
      const pools = lists.map((r) => [...((r.data ?? []) as Job[])]);
      const seenJob = new Set<string>(), seenCompany = new Set<string>();
      const start = seed % cats.length; // rotate which category leads
      for (let round = 0; jobs.length < want && pools.some((x) => x.length); round++) {
        for (let k = 0; k < pools.length && jobs.length < want; k++) {
          const pool = pools[(start + k) % pools.length];
          while (pool.length) {
            const j = pool.shift()!;
            if (seenJob.has(j.id) || seenCompany.has(j.company)) continue;
            seenJob.add(j.id);
            seenCompany.add(j.company);
            jobs.push(j);
            break;
          }
        }
      }
    } else {
      const { data: picked, error } = await pick(cats);
      if (error) {
        log.push(`${c.name} → ${p}: ${error.message}`);
        continue;
      }
      jobs = (picked ?? []) as Job[];
    }
    // Drop companies used in the last 3 posts, then one job per company, then trim to size.
    const usedCo = new Set<string>();
    jobs = jobs.filter((j) => {
      const k = j.company.trim().toLowerCase();
      if (recent.companies.has(k) || usedCo.has(k)) return false;
      usedCo.add(k);
      return true;
    }).slice(0, want);
    if (jobs.length < Math.min(c.min_jobs, want)) {
      log.push(`${c.name} → ${p}: only ${jobs.length} fresh ${plural(jobs.length, 'job', 'jobs')} match — skipped`);
      continue;
    }

    const [w, h] = DIMS[pr.size];
    const CARD_PILLS = ['New jobs this week', 'Fresh roles today', 'Hiring now', 'Just posted', 'Worth a look today'];
    const headline = format === 'list' ? headlineFor(c, jobs, seed) : format === 'cards' ? pickBy(CARD_PILLS, seed) : '';
    const images =
      format === 'list'
        ? [{ url: imageUrl('list', pr.size, jobs, headline, date, p), width: w, height: h }]
        : format === 'cards'
          ? [{ url: imageUrl('cards', pr.size, jobs, headline, date, p), width: w, height: h }]
        : format === 'company'
          ? jobs.map((j) => ({ url: imageUrl('company', pr.size, [j], '', date, p), width: w, height: h }))
          : jobs.map((j) => ({ url: imageUrl('single', pr.size, [j], singleHeadline(j), date, p), width: w, height: h }));

    const checks = await Promise.all(images.map((im) => validateImage(im.url, w, h)));
    const ok = checks.every((x) => x.ok);
    const issues = checks.flatMap((x, i) => x.issues.map((m) => (images.length > 1 ? `Image ${i + 1}: ${m}` : m)));
    if (!ok) {
      log.push(`${c.name} → ${p}: image check failed — ${issues.filter((m) => m.startsWith('ERROR')).join('; ')}`);
      continue;
    }

    const caption = captionFor(c, jobs, p, seed);
    const imageKey = `${format}:${pr.size}:${jobs.map((j) => j.id).sort().join(',')}`;
    const { data: post, error: insErr } = await service
      .from('social_posts')
      .insert({
        campaign_id: c.id,
        platform: p,
        status: c.require_approval ? 'awaiting_approval' : 'approved',
        format,
        headline,
        caption,
        images,
        image_key: imageKey,
        job_ids: jobs.map((j) => j.id),
        links: jobs.map((j) => ({ job_id: j.id, title: cleanTitle(j.title), company: j.company, url: jobLink(j, p) })),
        validation: { ok, issues, checked_at: new Date().toISOString() },
        scheduled_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insErr || !post) {
      log.push(`${c.name} → ${p}: ${insErr?.message ?? 'could not queue'}`);
      continue;
    }
    const { error: claimErr } = await service.from('social_post_jobs').insert(jobs.map((j) => ({ platform: p, job_id: j.id, post_id: post.id })));
    if (claimErr) {
      // Another run took one of these jobs a moment ago — drop this post, try next time.
      await service.from('social_posts').delete().eq('id', post.id);
      log.push(`${c.name} → ${p}: jobs taken by another post — retrying next run`);
      continue;
    }
    log.push(`${c.name} → ${p}: queued ${jobs.length} ${plural(jobs.length, 'job', 'jobs')}${c.require_approval ? ' (awaiting approval)' : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

type Result = { id: string; url?: string };
const env = (k: string) => Deno.env.get(k) ?? '';
export const connected = (p: Platform): boolean =>
  p === 'facebook' ? Boolean(env('FB_PAGE_ID') && env('FB_PAGE_TOKEN'))
    : p === 'instagram' ? Boolean(igDirect() ? env('IG_ACCESS_TOKEN') : env('IG_USER_ID') && (env('IG_ACCESS_TOKEN') || env('FB_PAGE_TOKEN')))
      : p === 'linkedin' ? Boolean(env('LINKEDIN_TOKEN') && env('LINKEDIN_AUTHOR'))
        : Boolean(env('TIKTOK_TOKEN'));

// Instagram works two ways:
//  - through the Facebook Page: IG_USER_ID + FB_PAGE_TOKEN (graph.facebook.com)
//  - on its own, "Instagram API with Instagram Login": IG_ACCESS_TOKEN (starts
//    with "IG…", graph.instagram.com) — no Facebook Page link needed; IG_USER_ID
//    is optional there ("me" is used).
const igDirect = () => env('IG_ACCESS_TOKEN').startsWith('IG') || env('IG_API_HOST') === 'instagram';
const igBase = () => (igDirect() ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0');

async function graph(path: string, params: Record<string, string>, token: string, base = 'https://graph.facebook.com/v21.0') {
  const res = await fetch(`${base}/${path}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: token }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Meta: ${data.error?.message ?? res.status}`);
  return data;
}

async function publishFacebook(post: Post): Promise<Result> {
  const page = env('FB_PAGE_ID');
  const token = env('FB_PAGE_TOKEN');
  if (post.images.length === 1) {
    const r = await graph(`${page}/photos`, { url: post.images[0].url, caption: post.caption }, token);
    return { id: r.post_id ?? r.id, url: `https://www.facebook.com/${r.post_id ?? r.id}` };
  }
  const ids: string[] = [];
  for (const im of post.images) ids.push((await graph(`${page}/photos`, { url: im.url, published: 'false' }, token)).id);
  const params: Record<string, string> = { message: post.caption };
  ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  const r = await graph(`${page}/feed`, params, token);
  return { id: r.id, url: `https://www.facebook.com/${r.id}` };
}

async function waitReady(container: string, token: string) {
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${igBase()}/${container}?fields=status_code&access_token=${token}`);
    const d = await res.json().catch(() => ({}));
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR') throw new Error('Instagram could not process the image');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * Instagram's publishing API accepts JPEG only. Converts the PNG once and
 * keeps it in the public "social-images" bucket (reused on retries — a run
 * stopped halfway continues where it left off).
 */
async function asJpeg(service: Service, pngUrl: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pngUrl)));
  const key = `ig/${[...digest].map((b) => b.toString(16).padStart(2, '0')).join('')}.jpg`;
  const publicUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/social-images/${key}`;
  const exists = await fetch(publicUrl, { method: 'HEAD' }).catch(() => null);
  if (exists?.ok) return publicUrl;
  const res = await fetch(pngUrl);
  if (!res.ok) throw new Error(`Image didn’t load (${res.status})`);
  const png = PNG.sync.read(Buffer.from(new Uint8Array(await res.arrayBuffer())));
  const out = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 90);
  const { error } = await service.storage.from('social-images').upload(key, out.data, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Saving the JPEG failed: ${error.message} (did you run 20261104090000_social_images_bucket.sql?)`);
  return publicUrl;
}

async function publishInstagram(post: Post, service: Service): Promise<Result> {
  const ig = env('IG_USER_ID') || (igDirect() ? 'me' : '');
  const token = env('IG_ACCESS_TOKEN') || env('FB_PAGE_TOKEN');
  const base = igBase();
  const urls: string[] = [];
  for (const im of post.images) urls.push(await asJpeg(service, im.url));
  let creation: string;
  if (urls.length === 1) {
    creation = (await graph(`${ig}/media`, { image_url: urls[0], caption: post.caption }, token, base)).id;
  } else {
    const children: string[] = [];
    for (const u of urls) children.push((await graph(`${ig}/media`, { image_url: u, is_carousel_item: 'true' }, token, base)).id);
    for (const c of children) await waitReady(c, token);
    creation = (await graph(`${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption }, token, base)).id;
  }
  await waitReady(creation, token);
  const r = await graph(`${ig}/media_publish`, { creation_id: creation }, token, base);
  return { id: r.id };
}

const linkedInVersion = () => {
  if (env('LINKEDIN_VERSION')) return env('LINKEDIN_VERSION');
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 2); // versions are supported for about a year
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
/** LinkedIn's post text format reserves these characters. */
const liEscape = (s: string) => s.replace(/[\\|{}@\[\]()<>#*_~]/g, (m) => (m === '#' ? m : `\\${m}`));

async function publishLinkedIn(post: Post): Promise<Result> {
  const token = env('LINKEDIN_TOKEN');
  const author = env('LINKEDIN_AUTHOR');
  const headers = { Authorization: `Bearer ${token}`, 'LinkedIn-Version': linkedInVersion(), 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' };
  const urns: string[] = [];
  for (const im of post.images) {
    const init = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', { method: 'POST', headers, body: JSON.stringify({ initializeUploadRequest: { owner: author } }) });
    const d = await init.json().catch(() => ({}));
    if (!init.ok) throw new Error(`LinkedIn upload: ${d.message ?? init.status}`);
    const bytes = await (await fetch(im.url)).arrayBuffer();
    const put = await fetch(d.value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: bytes });
    if (!put.ok) throw new Error(`LinkedIn upload: ${put.status}`);
    urns.push(d.value.image);
  }
  const content = urns.length === 1 ? { media: { id: urns[0], altText: post.headline || 'New jobs on MadeVisa' } } : { multiImage: { images: urns.map((id) => ({ id, altText: post.headline || 'New jobs on MadeVisa' })) } };
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      author,
      commentary: liEscape(post.caption),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content,
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn: ${(await res.json().catch(() => ({}))).message ?? res.status}`);
  const id = res.headers.get('x-restli-id') ?? '';
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
}

async function publishTikTok(post: Post): Promise<Result> {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('TIKTOK_TOKEN')}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: { title: post.headline.slice(0, 90), description: post.caption.slice(0, 4000), privacy_level: env('TIKTOK_PRIVACY') || 'PUBLIC_TO_EVERYONE', disable_comment: false, auto_add_music: true },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: post.images.map((i) => i.url) },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || (d.error && d.error.code !== 'ok')) throw new Error(`TikTok: ${d.error?.message ?? res.status}`);
  return { id: d.data?.publish_id ?? '' };
}

const PUBLISHERS: Record<Platform, (p: Post, service: Service) => Promise<Result>> = { facebook: publishFacebook, instagram: publishInstagram, linkedin: publishLinkedIn, tiktok: publishTikTok };

async function publishDue(service: Service, platforms: Map<Platform, PlatformRow>, log: string[]) {
  // A run that stopped mid-publish: try again (the network call either happened or didn't).
  await service.from('social_posts').update({ status: 'approved' }).eq('status', 'publishing').lt('updated_at', new Date(Date.now() - 30 * 60_000).toISOString());
  const { data } = await service.from('social_posts').select('id, platform, format, caption, headline, images, job_ids, attempts, validation').eq('status', 'approved').lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(8);
  for (const post of (data ?? []) as Post[]) {
    const pr = platforms.get(post.platform);
    if (!pr?.enabled) continue;
    // Never two posts on one network within its minimum gap.
    const { count } = await service.from('social_posts').select('id', { count: 'exact', head: true }).eq('platform', post.platform).eq('status', 'published').gte('published_at', new Date(Date.now() - pr.min_gap_minutes * 60_000).toISOString());
    // "Publish now" from the admin panel skips the minimum gap.
    if ((count ?? 0) > 0 && !post.validation?.publish_now) continue;

    // Jobs still open?
    const { data: live } = await service.rpc('social_jobs_still_live', { p_ids: post.job_ids });
    const gone = post.job_ids.filter((id) => !((live ?? []) as string[]).includes(id));
    if (gone.length) {
      await service.from('social_posts').update({ status: 'expired', error: `${gone.length} ${plural(gone.length, 'job has', 'jobs have')} closed since this post was prepared` }).eq('id', post.id);
      log.push(`${post.platform}: post expired (jobs closed)`);
      continue;
    }
    // Images still render at the right size?
    const checks = await Promise.all(post.images.map((im) => validateImage(im.url, im.width, im.height)));
    if (!checks.every((c) => c.ok)) {
      await service.from('social_posts').update({ status: 'failed', error: checks.flatMap((c) => c.issues).filter((m) => m.startsWith('ERROR')).join('; '), attempts: post.attempts + 1 }).eq('id', post.id);
      continue;
    }

    if (!connected(post.platform)) {
      await service.from('social_posts').update({ status: 'manual', error: `${post.platform} isn’t connected — download the images and copy the caption to post by hand` }).eq('id', post.id);
      log.push(`${post.platform}: ready to post by hand`);
      continue;
    }

    await service.from('social_posts').update({ status: 'publishing', attempts: post.attempts + 1 }).eq('id', post.id);
    try {
      const r = await PUBLISHERS[post.platform](post, service);
      await service.from('social_posts').update({ status: 'published', published_at: new Date().toISOString(), external_id: r.id, external_url: r.url ?? null, error: null }).eq('id', post.id);
      log.push(`${post.platform}: published`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publishing failed';
      // Retry up to 3 times (next runs), then give up.
      await service.from('social_posts').update({ status: post.attempts + 1 >= 3 ? 'failed' : 'approved', error: msg, scheduled_at: new Date(Date.now() + 15 * 60_000).toISOString() }).eq('id', post.id);
      log.push(`${post.platform}: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Housekeeping: keep only the last few finished posts, so the admin panel and
// the database stay small. Jobs stay marked as posted (social_post_jobs keeps
// its row, post_id just becomes null), so nothing is ever posted twice.
// ---------------------------------------------------------------------------

async function pruneHistory(service: Service, log: string[]) {
  const { data } = await service
    .from('social_posts')
    .select('id')
    .in('status', ['published', 'rejected', 'expired', 'failed'])
    .order('created_at', { ascending: false })
    .range(KEEP_HISTORY, KEEP_HISTORY + 500);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length) {
    const { error } = await service.from('social_posts').delete().in('id', ids);
    if (!error) log.push(`history: removed ${ids.length} old ${plural(ids.length, 'post', 'posts')}`);
  }
  // Instagram JPEG copies are only needed while Instagram fetches them.
  const { data: files } = await service.storage.from('social-images').list('ig', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });
  const cutoff = Date.now() - 2 * 24 * 3_600_000;
  const old = ((files ?? []) as { name: string; created_at?: string }[]).filter((f) => f.created_at && Date.parse(f.created_at) < cutoff).map((f) => `ig/${f.name}`);
  if (old.length) await service.storage.from('social-images').remove(old);
}

export async function runSocial(service: Service, force = false): Promise<void> {
  const log: string[] = [];
  let ok = true;
  try {
    const { data: prows } = await service.from('social_platforms').select('platform, enabled, size, min_gap_minutes, max_per_day');
    const platforms = new Map<Platform, PlatformRow>(((prows ?? []) as PlatformRow[]).map((r) => [r.platform, r]));
    // Keep "connected" in the admin panel accurate.
    for (const p of platforms.keys()) await service.from('social_platforms').update({ connected: connected(p), last_check_at: new Date().toISOString() }).eq('platform', p);

    let q = service.from('social_campaigns').select('*').eq('enabled', true);
    if (!force) q = q.lte('next_at', new Date().toISOString());
    const { data: due } = await q;
    for (const c of (due ?? []) as Campaign[]) {
      const before = log.length;
      await planCampaign(service, c, platforms, log);
      await service
        .from('social_campaigns')
        .update({ next_at: new Date(Date.now() + c.every_minutes * 60_000).toISOString(), last_run_at: new Date().toISOString(), last_result: log.slice(before).join(' · ') || 'Nothing to post' })
        .eq('id', c.id);
    }
    await publishDue(service, platforms, log);
    await pruneHistory(service, log);
  } catch (e) {
    ok = false;
    log.push(`Social failed: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
  if (log.length) await service.rpc('pipeline_finished', { p_kind: 'social', p_ok: ok, p_summary: log.join(' · ').slice(0, 1500), p_detail: null });
}
