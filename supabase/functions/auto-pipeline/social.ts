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

import { SITE, type Service } from './shared.ts';

type Platform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok';
type PlatformRow = { platform: Platform; enabled: boolean; size: 'portrait' | 'square' | 'story'; min_gap_minutes: number; max_per_day: number };
type Campaign = {
  id: string;
  name: string;
  kind: 'fresh' | 'student' | 'category' | 'company';
  platforms: Platform[];
  every_minutes: number;
  format: 'list' | 'carousel' | 'single';
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
};

const DIMS = { portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920] } as const;
const SHORT: Record<Platform, string> = { facebook: 'fb', instagram: 'ig', linkedin: 'li', tiktok: 'tt' };
const IMAGE_VERSION = '1'; // bump when the image template changes, so new posts get fresh images

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const cleanTitle = (t: string) => t.replace(/\s*\((m|f|w|d|x)\/(m|f|w|d|x)(\/(m|f|w|d|x))?\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
const place = (j: Job) => [j.city, j.country].filter(Boolean).join(', ') || (j.work_arrangement === 'remote' || j.remote ? 'Remote' : '');
const isRemote = (j: Job) => j.work_arrangement === 'remote' || (Boolean(j.remote) && !j.work_arrangement);
const pickBy = <T,>(items: T[], seed: number) => items[Math.abs(seed) % items.length];
const hashtag = (s: string) => `#${s.replace(/[^A-Za-z0-9]+/g, '')}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

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
  const allSalary = jobs.every((j) => j.salary);
  const mostlyRemote = jobs.filter(isRemote).length > n / 2;
  const visa = jobs.filter((j) => j.visa).length;
  if (allSalary && seed % 2 === 0) return `${n} new ${plural(n, 'role', 'roles')} — salaries shown`;
  if (mostlyRemote) return `Remote-friendly roles, posted today`;
  if (visa >= 2 && seed % 3 === 0) return `${visa} roles offering visa sponsorship`;
  return pickBy([`${n} fresh ${plural(n, 'role', 'roles')} worth your attention`, `${n} companies hiring today`, `Posted in the last 24 hours`, `New today: ${n} ${plural(n, 'role', 'roles')} to apply for`], seed);
}

function singleHeadline(j: Job): string {
  if (j.student) return 'Student role';
  if (j.visa) return 'Visa sponsorship';
  if (j.salary) return 'Salary shown';
  if (isRemote(j)) return 'Remote role';
  return 'Now hiring';
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
    return j.salary ? `${j.company} is hiring — and says what it pays.` : `${j.company} just posted this on its careers page.`;
  }
  const withSalary = jobs.filter((j) => j.salary).length;
  return pickBy(
    [
      `${n} roles that went live in the last 24 hours${withSalary ? `, ${withSalary === n ? 'all' : withSalary} with the salary shown` : ''}.`,
      `A few roles worth your attention today — straight from company career pages.`,
      `${companies.join(' and ')}${n > 2 ? ` and ${n - 2} more` : ''} ${companies.length === 1 ? 'is' : 'are'} hiring. Posted today.`,
      `Fresh this morning: ${n} openings, no reposts.`,
    ],
    seed
  );
}

function captionFor(c: Campaign, jobs: Job[], p: Platform, seed: number): string {
  const clickable = p === 'linkedin' || p === 'facebook';
  const blocks = jobs.map((j, i) => {
    const where = place(j);
    const mode = j.work_arrangement === 'hybrid' ? 'Hybrid' : isRemote(j) && where !== 'Remote' ? 'Remote' : null;
    const facts = [where, j.salary, mode, j.visa ? 'Visa sponsorship' : null, j.student ? 'Student' : null].filter(Boolean);
    const link = clickable ? `Apply: ${jobLink(j, p)}` : `madevisa.com/j/${j.id.slice(0, 8)}`;
    return `${jobs.length > 1 ? `${i + 1}. ` : ''}${cleanTitle(j.title)} — ${j.company}\n${facts.join(' · ')}\n${link}`;
  });
  const cta = clickable
    ? 'Every link opens the role on MadeVisa, with the details and a direct way to apply on the company’s own page.'
    : p === 'instagram'
      ? `Apply on MadeVisa — link in bio, or type the madevisa.com/j/… address under ${jobs.length === 1 ? 'the role' : 'each role'}.`
      : `Apply on MadeVisa — type the madevisa.com/j/… address under ${jobs.length === 1 ? 'the role' : 'each role'}.`;

  const tags = new Set<string>(['#hiring', '#jobs']);
  if (c.kind === 'student' || jobs.some((j) => j.student)) tags.add('#internships');
  if (jobs.some((j) => j.visa)) tags.add('#visasponsorship');
  if (jobs.filter(isRemote).length) tags.add('#remotejobs');
  const topCountry = jobs.map((j) => j.country).filter(Boolean).sort((a, b) => jobs.filter((x) => x.country === b).length - jobs.filter((x) => x.country === a).length)[0];
  if (topCountry) tags.add(hashtag(`${topCountry}Jobs`).toLowerCase());
  if (c.categories[0]) tags.add(hashtag(`${c.categories[0]}Jobs`).toLowerCase());

  const limit = p === 'linkedin' ? 2900 : 2150;
  let body = [hookFor(c, jobs, seed), ...blocks, cta, [...tags].slice(0, 6).join(' ')].join('\n\n');
  while (body.length > limit && blocks.length > 1) {
    blocks.pop();
    body = [hookFor(c, jobs, seed), ...blocks, cta, [...tags].slice(0, 6).join(' ')].join('\n\n');
  }
  return body.slice(0, limit);
}

function imageUrl(layout: 'list' | 'single', size: string, jobs: Job[], headline: string, date: string, p: Platform) {
  const q = new URLSearchParams({ layout, size, ids: jobs.map((j) => j.id.slice(0, 8)).join(','), h: headline, d: date, s: SHORT[p], v: IMAGE_VERSION });
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

async function planCampaign(service: Service, c: Campaign, platforms: Map<Platform, PlatformRow>, log: string[]) {
  const seed = Math.floor(Date.now() / 3_600_000) + c.name.length;
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
    const want = c.format === 'single' ? 1 : c.format === 'carousel' ? Math.min(3, c.jobs_count) : Math.min(pr.size === 'square' ? 3 : 5, c.jobs_count);
    const { data: picked, error } = await service.rpc('social_pick_jobs', {
      p_platform: p,
      p_count: want,
      p_kind: c.kind === 'student' ? 'student' : 'fresh',
      p_categories: c.categories ?? [],
      p_countries: c.countries ?? [],
      p_salary_only: c.salary_only,
    });
    if (error) {
      log.push(`${c.name} → ${p}: ${error.message}`);
      continue;
    }
    const jobs = (picked ?? []) as Job[];
    if (jobs.length < Math.min(c.min_jobs, want)) {
      log.push(`${c.name} → ${p}: only ${jobs.length} fresh ${plural(jobs.length, 'job', 'jobs')} match — skipped`);
      continue;
    }

    const [w, h] = DIMS[pr.size];
    const headline = c.format === 'list' ? headlineFor(c, jobs, seed) : jobs.length === 1 ? singleHeadline(jobs[0]) : headlineFor(c, jobs, seed);
    const images =
      c.format === 'list'
        ? [{ url: imageUrl('list', pr.size, jobs, headline, date, p), width: w, height: h }]
        : jobs.map((j) => ({ url: imageUrl('single', pr.size, [j], singleHeadline(j), date, p), width: w, height: h }));

    const checks = await Promise.all(images.map((im) => validateImage(im.url, w, h)));
    const ok = checks.every((x) => x.ok);
    const issues = checks.flatMap((x, i) => x.issues.map((m) => (images.length > 1 ? `Image ${i + 1}: ${m}` : m)));
    if (!ok) {
      log.push(`${c.name} → ${p}: image check failed — ${issues.filter((m) => m.startsWith('ERROR')).join('; ')}`);
      continue;
    }

    const caption = captionFor(c, jobs, p, seed);
    const imageKey = `${c.format}:${pr.size}:${jobs.map((j) => j.id).sort().join(',')}`;
    const { data: post, error: insErr } = await service
      .from('social_posts')
      .insert({
        campaign_id: c.id,
        platform: p,
        status: c.require_approval ? 'awaiting_approval' : 'approved',
        format: c.format,
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
    : p === 'instagram' ? Boolean(env('IG_USER_ID') && (env('IG_ACCESS_TOKEN') || env('FB_PAGE_TOKEN')))
      : p === 'linkedin' ? Boolean(env('LINKEDIN_TOKEN') && env('LINKEDIN_AUTHOR'))
        : Boolean(env('TIKTOK_TOKEN'));

async function graph(path: string, params: Record<string, string>, token: string) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${path}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: token }) });
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
    const res = await fetch(`https://graph.facebook.com/v21.0/${container}?fields=status_code&access_token=${token}`);
    const d = await res.json().catch(() => ({}));
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR') throw new Error('Instagram could not process the image');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function publishInstagram(post: Post): Promise<Result> {
  const ig = env('IG_USER_ID');
  const token = env('IG_ACCESS_TOKEN') || env('FB_PAGE_TOKEN');
  let creation: string;
  if (post.images.length === 1) {
    creation = (await graph(`${ig}/media`, { image_url: post.images[0].url, caption: post.caption }, token)).id;
  } else {
    const children: string[] = [];
    for (const im of post.images) children.push((await graph(`${ig}/media`, { image_url: im.url, is_carousel_item: 'true' }, token)).id);
    for (const c of children) await waitReady(c, token);
    creation = (await graph(`${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption }, token)).id;
  }
  await waitReady(creation, token);
  const r = await graph(`${ig}/media_publish`, { creation_id: creation }, token);
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
  const content = urns.length === 1 ? { media: { id: urns[0], altText: post.headline } } : { multiImage: { images: urns.map((id) => ({ id, altText: post.headline })) } };
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

const PUBLISHERS: Record<Platform, (p: Post) => Promise<Result>> = { facebook: publishFacebook, instagram: publishInstagram, linkedin: publishLinkedIn, tiktok: publishTikTok };

async function publishDue(service: Service, platforms: Map<Platform, PlatformRow>, log: string[]) {
  // A run that stopped mid-publish: try again (the network call either happened or didn't).
  await service.from('social_posts').update({ status: 'approved' }).eq('status', 'publishing').lt('updated_at', new Date(Date.now() - 30 * 60_000).toISOString());
  const { data } = await service.from('social_posts').select('id, platform, format, caption, headline, images, job_ids, attempts').eq('status', 'approved').lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(8);
  for (const post of (data ?? []) as Post[]) {
    const pr = platforms.get(post.platform);
    if (!pr?.enabled) continue;
    // Never two posts on one network within its minimum gap.
    const { count } = await service.from('social_posts').select('id', { count: 'exact', head: true }).eq('platform', post.platform).eq('status', 'published').gte('published_at', new Date(Date.now() - pr.min_gap_minutes * 60_000).toISOString());
    if ((count ?? 0) > 0) continue;

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
      const r = await PUBLISHERS[post.platform](post);
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
  } catch (e) {
    ok = false;
    log.push(`Social failed: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
  if (log.length) await service.rpc('pipeline_finished', { p_kind: 'social', p_ok: ok, p_summary: log.join(' · ').slice(0, 1500), p_detail: null });
}
