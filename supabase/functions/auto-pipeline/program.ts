// The social content program — runs inside { cron: "social" } before the
// publish step (social.ts → runSocial → runProgram).
//
// Press Start in Admin → Social media and, from then on, every run:
//  1. PLAN     — keeps the next 3 days filled with slots: for each network,
//                its posts per day, at times of day that differ from the day
//                before, each with a kind of post chosen by the pillar mix
//                (programSchedule.ts). A slot is a row in social_posts with
//                status "planned" — the admin panel shows it with a countdown.
//  2. WRITE    — when a slot is close (job posts 2 hours ahead, so the jobs
//                are fresh; everything else about a day ahead, so there is
//                time to read it), its builder (programFormats.ts) picks a
//                topic that hasn't been used lately, writes the caption,
//                draws the images and checks them. On autopilot the post is
//                approved; otherwise it waits for approval.
//  3. PUBLISH  — the normal queue (social.ts → publishDue) sends approved
//                posts when their time comes.
//  4. REPLY    — Instagram comments on "comment + to get the list" posts get
//                the promised link (needs the comments permission on the token).
//
// REELS: six formats are short vertical videos. Their builders return the
// screens instead of images; the slot is saved as "rendering" with a recipe in
// meta.reel, scripts/render-reels.mjs (GitHub Actions) makes the MP4, and the
// post then joins the queue like any other. Reel formats are only planned
// while that renderer is reporting in (social_program.reels_at).
//
// Never-repeat rules live in three places: the schedule (no format twice in a
// row / twice a day / inside its cooldown), the builders (no topic inside its
// own rest period, and not on two networks the same day), and here (no
// caption that opens like one of the network's last 40 posts).

// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DEFAULT_GAP, DEFAULT_SETTINGS, FORMATS, FORMAT_BY_KEY, JOB_FORMATS, isFormatOn, perDayFor, reelLayers, type Pillar, type Platform, type ProgramSettings, type ReelRecipe } from './programCatalog.ts';
import { hash, localTime, planRange, rankFormats, type Past } from './programSchedule.ts';
import { BUILDERS, type ArticleRow, type CountryReport, type Ctx, type Data, type Draft, type Feedback, type Library, type NewsItem, type ProgramRow, type Snapshot } from './programFormats.ts';
import { SITE, opening, setHost } from './programVoice.ts';
import { loadMedia, runMedia, type MediaLibrary } from './media.ts';
import type { Service } from './shared.ts';
// social.ts imports this file too (a cycle) — fine, these are only called at run time.
import { DIMS, connected, fingerprint, igBase, pickFreshJobs, validateImage, type Job, type PlatformRow } from './social.ts';

const HORIZON_DAYS = 3;
const LEAD_FRESH_MIN = 120;
const LEAD_EVERGREEN_MIN = 20 * 60;
/** A reel with today's jobs: written 4 hours ahead, so there is time to render it. */
const LEAD_FRESH_VIDEO_MIN = 240;
/** The renderer runs at least hourly; silent for this long means it isn't set up (or is broken). */
const RENDERER_ALIVE_HOURS = 8;
const leadFor = (kind: string) => {
  const f = FORMAT_BY_KEY[kind];
  return f?.fresh ? (f.video ? LEAD_FRESH_VIDEO_MIN : LEAD_FRESH_MIN) : LEAD_EVERGREEN_MIN;
};
const MAX_WRITES_PER_RUN = 4;
const HOT_HOURS = 20;

type ProgramRowDb = { running: boolean; timezone: string | null; autopilot: boolean; per_day: any; formats: any; mix: any; handles: any; focus: string[] | null; lock_until: string | null; planned_at: string | null; reels_at?: string | null; host_name?: string | null; look?: string | null; gap_min?: number | null; media_at?: string | null };
type PostRow = { id: string; platform: Platform; status: string; kind: string | null; pillar: Pillar | null; topic_key: string | null; scheduled_at: string; meta: Record<string, any> | null; origin: string };
type HistoryRow = { platform: Platform; kind: string; pillar: Pillar; topic: string | null; opening: string | null; at: string; post_id: string | null };

/** A time zone the runtime knows, or UTC. */
function safeZone(tz: string | null): string {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC' });
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
}

function settingsOf(row: ProgramRowDb): ProgramSettings {
  return {
    ...DEFAULT_SETTINGS,
    timezone: safeZone(row.timezone),
    autopilot: row.autopilot !== false,
    per_day: row.per_day ?? {},
    formats: row.formats ?? {},
    mix: row.mix ?? {},
    handles: row.handles ?? {},
    focus: row.focus ?? [],
    reels: Boolean(row.reels_at && Date.now() - Date.parse(row.reels_at) < RENDERER_ALIVE_HOURS * 3_600_000),
    // Columns from migration 20261127090000; before it runs: 30 minutes, photo first, no signature.
    gap: Number(row.gap_min) > 0 ? Number(row.gap_min) : DEFAULT_GAP,
    look: row.look === 'graphic' ? 'graphic' : 'photo',
    host: (row.host_name ?? '').trim(),
  };
}

/** A reel text layer: the layout maths only (the renderer downloads the PNG itself). */
async function checkLayer(url: string): Promise<{ ok: boolean; issues: string[] }> {
  try {
    const res = await fetch(`${url}&check=1`, { signal: AbortSignal.timeout(20_000) });
    const r = res.ok ? await res.json() : null;
    if (!r) return { ok: false, issues: [`ERROR: layout check failed (${res.status})`] };
    return { ok: r.ok !== false, issues: ((r.issues ?? []) as { level: string; message: string }[]).map((i) => `${i.level === 'error' ? 'ERROR' : 'note'}: ${i.message}`) };
  } catch (e) {
    return { ok: false, issues: [`ERROR: ${e instanceof Error ? e.message : 'layout check failed'}`] };
  }
}

// --- Data: each source is read once per run, on first use -----------------------

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn().catch(() => null as unknown as T));
}

function dataFor(service: Service): Data {
  const reports = new Map<string, Promise<CountryReport | null>>();
  return {
    snapshot: once(async () => {
      const { data } = await service.from('insights_snapshot').select('data').eq('id', true).maybeSingle();
      const d = data?.data as Snapshot | undefined;
      return d && Array.isArray(d.by_country) ? d : null;
    }),
    report: (iso) => {
      if (!reports.has(iso))
        reports.set(
          iso,
          (async () => {
            const { data, error } = await service.rpc('insights_country_report', { p_iso: iso });
            return error || !data?.live_jobs ? null : (data as CountryReport);
          })().catch(() => null)
        );
      return reports.get(iso)!;
    },
    library: once(async () => {
      const res = await fetch(`${SITE}/api/social/content`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      const j = (await res.json()) as Library;
      return Array.isArray(j?.countries) && j.countries.length ? j : null;
    }),
    feedback: once(async () => {
      const { data, error } = await service.rpc('hiring_feedback_overview');
      return error || !data ? null : (data as Feedback);
    }),
    network: once(async () => {
      const { data, error } = await service.rpc('network_counts');
      return error || !data ? null : data;
    }),
    articles: once(async () => {
      const now = new Date();
      const { data } = await service
        .from('articles')
        .select('id, slug, title, excerpt, category, country_code, publish_at')
        .eq('status', 'published')
        .lte('publish_at', now.toISOString())
        .gte('publish_at', new Date(now.getTime() - 10 * 86_400_000).toISOString())
        .order('publish_at', { ascending: false })
        .limit(20);
      return ((data ?? []) as ArticleRow[]).filter((a) => a.title && a.slug);
    }),
    programs: once(async () => {
      const { data } = await service
        .from('programs')
        .select('id, title, description, category, funding_text, official_url, applications_close_at, program_publishers(name), countries(name, iso_code)')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(40);
      const today = new Date().toISOString().slice(0, 10);
      return ((data ?? []) as any[])
        // Not a program whose window has closed.
        .filter((p) => p.title && (!p.applications_close_at || p.applications_close_at >= today))
        .map((p): ProgramRow => ({ id: p.id, title: p.title, description: p.description, category: p.category, funding_text: p.funding_text, official_url: p.official_url, applications_close_at: p.applications_close_at, publisher: p.program_publishers?.name ?? null, country: p.countries?.name ?? null, iso: p.countries?.iso_code ?? null }));
    }),
    news: once(async () => {
      const now = new Date().toISOString();
      const { data } = await service.from('social_news').select('id, headline, summary, points, country_code, source_name, source_url, link_path, kicker, use_after, expires_at').eq('status', 'ready').order('created_at', { ascending: false }).limit(30);
      return ((data ?? []) as any[]).filter((n) => (!n.use_after || n.use_after <= now) && (!n.expires_at || n.expires_at > now)).map((n): NewsItem => ({ ...n, points: Array.isArray(n.points) ? n.points.filter(Boolean) : [] }));
    }),
  };
}

/** Formats with nothing to say right now — the planner leaves them out, so a slot isn't wasted. */
async function unavailable(data: Data): Promise<Set<string>> {
  const out = new Set<string>();
  const [snap, fb, lib, news, articles, programs] = await Promise.all([data.snapshot(), data.feedback(), data.library(), data.news(), data.articles(), data.programs()]);
  if (!snap) for (const k of ['country_hiring', 'country_ranking', 'sponsor_ranking', 'top_companies', 'roles_in_demand', 'market_pulse', 'remote_share', 'milestone', 'jobs_country', 'reel_country', 'reel_city', 'job_alert']) out.add(k);
  else {
    if (snap.by_country.filter((c) => c.jobs >= 40).length < 1) for (const k of ['country_hiring', 'reel_country']) out.add(k);
    if (snap.by_country.filter((c) => c.new_7d >= 15).length < 1) out.add('reel_city');
    if (snap.by_country.filter((c) => c.new_7d > 0).length < 4) out.add('country_ranking');
    if (snap.by_country.filter((c) => c.jobs >= 60 && c.visa > 0).length < 4) out.add('sponsor_ranking');
    if ((snap.top_companies_7d ?? []).filter((c) => c.new_7d > 0).length < 4) out.add('top_companies');
    if ((snap.functions ?? []).length < 4) out.add('roles_in_demand');
    if (snap.new_7d < 50) out.add('market_pulse');
    if (!snap.work || snap.work.known < 200) out.add('remote_share');
    if (snap.live_jobs < 500) out.add('milestone');
  }
  if (!fb || fb.total < 30) for (const k of ['feedback_stats', 'ghosting_stat']) out.add(k);
  if ((fb?.most_responsive ?? []).length < 3) out.add('responsive_companies');
  if (!lib) for (const k of ['visa_route', 'visa_jobsearch', 'visa_nomad', 'visa_pr', 'visa_salary', 'visa_compare', 'visa_myth', 'visa_checklist', 'plan_employer', 'plan_costs', 'this_or_that', 'reel_route', 'reel_myth']) out.add(k);
  if (!news.length) for (const k of ['news', 'reel_news']) out.add(k);
  if (!articles.length) out.add('article');
  if (!programs.length) out.add('program');
  return out;
}

// --- The run ----------------------------------------------------------------------

export async function runProgram(service: Service, platforms: Map<Platform, PlatformRow>, log: string[], force: boolean): Promise<Set<Platform>> {
  const covered = new Set<Platform>();
  const { data: row, error } = await service.from('social_program').select('*').eq('id', true).maybeSingle();
  if (error || !row) return covered; // the migration hasn't been run
  const running = (row as ProgramRowDb).running;
  const settings = settingsOf(row as ProgramRowDb);
  const now = Date.now();
  // Captions are signed with the host's name when one is set (programVoice.ts).
  setHost(settings.host);

  // Stopped: nothing is planned and campaigns run as usual — but a "Try it" post
  // from the admin panel (a slot marked test) is still written, for approval.
  const active = running ? [...platforms.values()].filter((p) => p.enabled && perDayFor(p.platform, settings, false) > 0).map((p) => p.platform) : [];
  for (const p of active) covered.add(p);
  if (running && !active.length) {
    log.push('Program: no network is switched on');
    return covered;
  }

  // One run at a time (a second run that overlaps just publishes).
  const { data: claimed } = await service.rpc('social_program_claim', { p_minutes: 6 });
  if (claimed === false && !force) return covered;

  try {
    // Slots whose time to be written has come (job posts 2 h ahead, the rest 20 h ahead, "write now" at once).
    const { data: dueRows } = await service
      .from('social_posts')
      .select('id, platform, status, kind, pillar, topic_key, scheduled_at, meta, origin')
      .eq('origin', 'program')
      .eq('status', 'planned')
      .lte('write_at', new Date(now + 60_000).toISOString())
      .order('scheduled_at')
      .limit(40);
    const due = (dueRows ?? []) as PostRow[];
    // Planning is repeated hourly (and on Start / Run now); writing happens whenever a slot is due.
    const plannedAt = (row as ProgramRowDb).planned_at;
    const needPlan = running && (force || !plannedAt || now - Date.parse(plannedAt) > 55 * 60_000);
    if (!needPlan && !due.length) {
      await replyToComments(service, log);
      await service.from('social_program').update({ lock_until: null, last_run_at: new Date().toISOString() }).eq('id', true);
      return covered;
    }

    const data = dataFor(service);
    const off = await unavailable(data);

    // What is already planned or done.
    const since = new Date(now - 45 * 86_400_000).toISOString();
    const [{ data: postRows }, { data: histRows }, { data: photoRows }] = await Promise.all([
      service.from('social_posts').select('id, platform, status, kind, pillar, topic_key, scheduled_at, meta, origin').eq('origin', 'program').gte('scheduled_at', new Date(now - 2 * 86_400_000).toISOString()).limit(1000),
      service.from('social_history').select('platform, kind, pillar, topic, opening, at, post_id').gte('at', since).order('at', { ascending: false }).limit(3000),
      service.from('social_country_photos').select('code, url, credit'),
    ]);
    const posts = (postRows ?? []) as PostRow[];
    const history = (histRows ?? []) as HistoryRow[];
    const single = new Map<string, { url: string; credit: string | null }>(((photoRows ?? []) as any[]).filter((r) => r.url).map((r) => [String(r.code).toUpperCase(), { url: r.url, credit: r.credit ?? null }]));
    // The library of real photos and clips (media.ts); the one-photo-per-country table is the fallback.
    const photos = await loadMedia(service, single);

    const inPosts = new Set(posts.map((p) => p.id));
    const existing: (Past & { platform: Platform })[] = [
      ...posts.filter((p) => p.kind && FORMAT_BY_KEY[p.kind]).map((p) => ({ platform: p.platform, kind: p.kind!, pillar: FORMAT_BY_KEY[p.kind!].pillar, at: Date.parse(p.scheduled_at) })),
      ...history.filter((h) => !h.post_id || !inPosts.has(h.post_id)).map((h) => ({ platform: h.platform, kind: h.kind, pillar: h.pillar, at: Date.parse(h.at) })),
    ];

    // 1. PLAN
    if (needPlan) {
      const slots = planRange({ platforms: active, settings, now, days: HORIZON_DAYS, existing, unavailable: off });
      let planned = 0;
      for (const s of slots) {
        const at = new Date(s.at).toISOString();
        const lead = leadFor(s.kind);
        const { data: ins, error: insErr } = await service
          .from('social_posts')
          .insert({ origin: 'program', platform: s.platform, status: 'planned', format: 'slot', kind: s.kind, pillar: s.pillar, headline: '', caption: '', images: [], image_key: `slot:${at}`, scheduled_at: at, write_at: new Date(s.at - lead * 60_000).toISOString(), meta: { part: s.part } })
          .select('id, platform, status, kind, pillar, topic_key, scheduled_at, meta, origin')
          .single();
        // A duplicate (two runs at once) is refused by the unique index — that's the point.
        if (insErr || !ins) continue;
        planned++;
        existing.push({ platform: s.platform, kind: s.kind, pillar: s.pillar, at: s.at });
        if (s.at - lead * 60_000 <= now) due.push(ins as PostRow);
      }
      if (planned) log.push(`Program: planned ${planned} ${planned === 1 ? 'post' : 'posts'} for the next ${HORIZON_DAYS} days`);
      await service.from('social_program').update({ planned_at: new Date().toISOString() }).eq('id', true);
    }

    // 2. WRITE the slots that are close — soonest first.
    due.sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
    let written = 0;
    for (const slot of due) {
      const at = Date.parse(slot.scheduled_at);
      if (!covered.has(slot.platform) && !(slot.meta?.test && platforms.get(slot.platform))) continue;
      // A slot the pipeline never got to (function down, network off for hours): don't post it late.
      if (at < now - 3 * 3_600_000) {
        await service.from('social_posts').update({ status: 'expired', error: 'This slot passed before it could be written' }).eq('id', slot.id).eq('status', 'planned');
        continue;
      }
      if (written >= MAX_WRITES_PER_RUN) break;
      written++;
      const pr = platforms.get(slot.platform)!;
      const result = await writeSlot(service, slot, pr, settings, data, off, history, photos, existing.filter((e) => e.platform === slot.platform));
      log.push(`Program → ${slot.platform}: ${result}`);
    }
    // More slots are waiting than one run writes: come back soon rather than at the next hour.
    if (due.length > written) log.push(`Program: ${due.length - written} more to write on the next run`);

    // 3. News items past their date leave the desk.
    await service.from('social_news').update({ status: 'archived' }).eq('status', 'ready').lt('expires_at', new Date().toISOString());

    // 4. REPLY to "comment +" posts.
    await replyToComments(service, log);

    // 5. Keep the photo and clip library topped up (once a day while the program runs).
    const mediaAt = (row as ProgramRowDb).media_at;
    if (running && (!mediaAt || now - Date.parse(mediaAt) > 24 * 3_600_000)) {
      try {
        const note = await runMedia(service, false);
        if (note) log.push(`Program: ${note}`);
      } catch (e) {
        log.push(`Program: media library not updated (${e instanceof Error ? e.message : 'error'})`);
      }
    }

    await service.from('social_program').update({ last_run_at: new Date().toISOString(), last_result: log.filter((l) => l.startsWith('Program')).slice(-6).join(' · ') || 'Up to date', lock_until: null }).eq('id', true);
  } catch (e) {
    log.push(`Program failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    await service.from('social_program').update({ lock_until: null, last_result: `Failed: ${e instanceof Error ? e.message : 'unknown error'}` }).eq('id', true);
  }
  return covered;
}

async function writeSlot(
  service: Service,
  slot: PostRow,
  pr: PlatformRow,
  settings: ProgramSettings,
  data: Data,
  off: Set<string>,
  history: HistoryRow[],
  photos: MediaLibrary,
  past: Past[]
): Promise<string> {
  const p = slot.platform;
  const at = Date.parse(slot.scheduled_at);
  const tz = settings.timezone;
  const lt = localTime(at, tz);
  const now = Date.now();

  // Topics: when each was last used here, and what went out anywhere in the last 20 hours.
  const lastHere = new Map<string, number>();
  const hotSet = new Set<string>();
  const openings = new Set<string>();
  let n = 0;
  for (const h of history) {
    const t = Date.parse(h.at);
    if (h.topic) {
      if (h.platform === p && !lastHere.has(h.topic)) lastHere.set(h.topic, t);
      if (Math.abs(at - t) < HOT_HOURS * 3_600_000) hotSet.add(h.topic);
    }
    if (h.platform === p && h.opening && n++ < 40) openings.add(h.opening);
  }

  // News is timely: an item from the News desk that this network hasn't posted yet takes the next
  // slot being written (at most one news post per network per day).
  const pendingNews = FORMAT_BY_KEY.news.platforms.includes(p) && !off.has('news') && (await data.news()).some((n) => !lastHere.has(`news:${n.id}`));
  const newsToday = history.some((h) => h.platform === p && h.kind === 'news' && localTime(Date.parse(h.at), tz).key === lt.key);
  // The monthly Visa Hiring Report (monthly.ts) is the same kind of moment: once a month, every network
  // that posts articles shares it — on different days, since a topic isn't used on two networks within 20 hours.
  const pendingReport =
    FORMAT_BY_KEY.article.platforms.includes(p) &&
    !off.has('article') &&
    isFormatOn(FORMAT_BY_KEY.article, settings) &&
    (await data.articles()).some((a) => /^visa-hiring-report-/.test(a.slug) && !lastHere.has(`article:${a.id}`) && !hotSet.has(`article:${a.id}`));
  const articleToday = history.some((h) => h.platform === p && h.kind === 'article' && localTime(Date.parse(h.at), tz).key === lt.key);
  // The slot's own format first; if it has nothing to say, the next best for this time.
  const tried = new Set<string>(off);
  // A slot someone asked for by name ("Try it", "Change") is written as that format or not at all.
  const exact = slot.meta?.force === true;
  const order = exact ? [slot.kind!] : [...(pendingNews && !newsToday ? ['news'] : []), ...(pendingReport && !articleToday ? ['article'] : []), slot.kind!, ...rankFormats({ platform: p, at, part: (slot.meta?.part as any) ?? lt.part ?? 'morning', weekday: lt.weekday, dayKey: lt.key }, past.filter((x) => x.at !== at), settings, off, tz).map((f) => f.key)].filter((k, i, a) => k && a.indexOf(k) === i);
  const [w, h] = DIMS[pr.size];
  const jobCache = new Map<string, Promise<Job[]>>();

  for (const kind of order.slice(0, 6)) {
    if (tried.has(kind) && kind !== slot.kind && kind !== 'news' && kind !== 'article') continue;
    if (kind === 'news' && kind !== slot.kind && off.has('news')) continue;
    tried.add(kind);
    const build = BUILDERS[kind];
    const def = FORMAT_BY_KEY[kind];
    if (!build || !def || !def.platforms.includes(p)) continue;
    const seed = hash(`${slot.id}:${kind}`);
    const ctx = (wseed: number): Ctx => ({
      p,
      size: pr.size,
      seed,
      w: wseed,
      now: new Date(at),
      settings,
      data,
      age: (topic) => (lastHere.has(topic) ? (at - lastHere.get(topic)!) / 3_600_000 : Infinity),
      hot: (topic) => !topic.startsWith('news:') && hotSet.has(topic),
      handle: settings.handles?.[p] ? `@${String(settings.handles[p]).replace(/^@/, '')}` : '',
      photo: (code) => photos.photo(code, seed),
      want: typeof slot.meta?.want === 'string' ? slot.meta.want : null,
      jobs: (o) => {
        const key = JSON.stringify(o);
        if (!jobCache.has(key)) jobCache.set(key, pickFreshJobs(service, p, o));
        return jobCache.get(key)!;
      },
    });

    let draft: Draft | null = null;
    try {
      draft = await build(ctx(seed));
      // Opens like a recent post on this network? Say it another way.
      for (let k = 1; draft && k <= 5 && openings.has(opening(draft.caption)); k++) draft = await build(ctx(seed + k * 7919));
    } catch (e) {
      draft = null;
      console.error(`builder ${kind} failed`, e);
    }
    if (!draft || !draft.caption.trim() || (!draft.images.length && !draft.reel)) continue;

    // A "Try it" post never goes out by itself.
    const ready = settings.autopilot && !slot.meta?.test ? 'approved' : 'awaiting_approval';
    let images: { url: string; width: number; height: number }[] = [];
    let issues: string[] = [];
    let reel: ReelRecipe | null = null;
    const usedMedia: number[] = [];
    if (draft.reel) {
      // A reel: every screen is checked with all of its lines on (the fullest state).
      const scenes = draft.reel.scenes;
      const checks = await Promise.all(scenes.map((s) => checkLayer(s.url)));
      issues = checks.flatMap((x, i) => x.issues.map((m) => `Screen ${i + 1}: ${m}`));
      if (!checks.every((x) => x.ok)) continue;
      const cc = draft.reel.bg.cc;
      const photo = photos.photo(cc, seed);
      reel = {
        v: 1,
        bg: { queries: draft.reel.bg.queries.slice(0, 6), cc, photo: photo?.url ?? null, credit: photo?.credit ?? null, fallback: `${SITE}/api/og/post?t=reel&sc=bg${cc ? `&cc=${cc}` : ''}&v=1`, salt: 0, clips: photos.clips(cc, seed) },
        frame: `${SITE}/api/og/post?t=reel&sc=frame&v=1`,
        scenes,
        ...reelLayers(scenes),
        after: ready,
      };
    } else {
      images = draft.images.slice(0, 6).map((url) => ({ url, width: w, height: h }));
      // Photo first: a real photo with the post's one line opens it, the card follows. Posts that already
      // carry a photo keep theirs; on Telegram (one image) a list of jobs stays a list of jobs.
      if (settings.look !== 'graphic' && !images.some((im) => /[?&]img=/.test(im.url)) && !(p === 'telegram' && JOB_FORMATS.has(kind))) {
        const cc = typeof draft.meta?.cc === 'string' ? draft.meta.cc : /^[A-Za-z]{2}$/.test(draft.topic) ? draft.topic : null;
        const shot = photos.photo(cc, seed, true);
        if (shot) {
          const sp = new URLSearchParams({ t: 'photo', size: pr.size, h: draft.headline.slice(0, 200), img: shot.url, v: '1' });
          if (shot.credit) sp.set('cr', shot.credit);
          const cover = `${SITE}/api/og/post?${sp.toString()}`;
          // Only if the photo really loads; otherwise the post goes out as it was.
          if ((await validateImage(cover, w, h)).ok) {
            images = p === 'telegram' ? [{ url: cover, width: w, height: h }] : [{ url: cover, width: w, height: h }, ...images].slice(0, 6);
            if (shot.id) usedMedia.push(shot.id);
          }
        }
      }
      const checks = await Promise.all(images.map((im) => validateImage(im.url, w, h)));
      issues = checks.flatMap((x, i) => x.issues.map((m) => (images.length > 1 ? `Image ${i + 1}: ${m}` : m)));
      if (!checks.every((x) => x.ok)) continue;
    }

    const topic = `${kind}:${draft.topic}`;
    const jobs = draft.jobs ?? [];
    // A reel waits for its video first; the renderer then hands it on as `ready`.
    const status = reel ? 'rendering' : ready;
    // Claim the slot (only if it is still "planned": two runs can't both write it).
    const { data: got, error: upErr } = await service
      .from('social_posts')
      .update({
        status,
        kind,
        pillar: def.pillar,
        format: !reel && images.length > 1 && draft.format === 'image' ? 'carousel' : draft.format,
        headline: draft.headline.slice(0, 200),
        caption: draft.caption,
        images,
        image_key: `${topic}:${lt.key}`,
        job_ids: jobs.map((j) => j.id),
        links: draft.links,
        topic_key: topic,
        validation: { ok: true, issues, checked_at: new Date().toISOString() },
        video_url: reel ? null : undefined,
        meta: { ...(slot.meta ?? {}), ...(draft.meta ?? {}), ...(reel ? { reel } : { reel: undefined }), force: undefined, want: undefined, written_at: new Date(now).toISOString(), planned_kind: slot.kind },
        error: null,
      })
      .eq('id', slot.id)
      .eq('status', 'planned')
      .select('id');
    if (upErr || !got?.length) continue; // same topic already queued for this network today, or another run took the slot
    if (usedMedia.length) await service.rpc('social_media_used', { p_ids: usedMedia });

    if (jobs.length) {
      const { error: claimErr } = await service.from('social_post_jobs').insert(jobs.map((j) => ({ platform: p, job_id: j.id, post_id: slot.id, fingerprint: fingerprint(j) })));
      if (claimErr) {
        // Another post took one of these jobs a moment ago — put the slot back and try the next format.
        await service.from('social_posts').update({ status: 'planned', format: 'slot', caption: '', images: [], image_key: `slot:${slot.scheduled_at}`, job_ids: [], links: [], topic_key: null }).eq('id', slot.id);
        continue;
      }
    }
    const row: HistoryRow = { platform: p, kind, pillar: def.pillar, topic, opening: opening(draft.caption), at: slot.scheduled_at, post_id: slot.id };
    await service.from('social_history').insert(row);
    history.unshift(row);
    if (draft.meta?.news_id) await service.from('social_news').update({ used_at: new Date().toISOString() }).eq('id', draft.meta.news_id).is('used_at', null);
    return `${def.name}${kind !== slot.kind ? ` (instead of ${FORMAT_BY_KEY[slot.kind!]?.name ?? slot.kind})` : ''} written for ${new Date(at).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' })}${reel ? ' — the video is being rendered' : ''}${ready === 'approved' ? '' : ' — waiting for approval'}`;
  }

  await service
    .from('social_posts')
    .update({ status: 'expired', error: exact ? `“${FORMAT_BY_KEY[slot.kind!]?.name ?? slot.kind}” has nothing to post right now (not enough data yet, or every topic was used recently). Pick another kind of post.` : 'Nothing passed the checks for this slot (not enough fresh data, or every topic was used recently)' })
    .eq('id', slot.id)
    .eq('status', 'planned');
  return `nothing to post for the ${new Date(at).toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' })} slot — skipped`;
}

// --- Replies to "comment + and we'll send you the list" ----------------------------
// Instagram only (the format runs on Instagram and TikTok; TikTok has no reply API).
// Needs instagram_manage_comments (or instagram_business_manage_comments) on the
// token. Without it the API refuses, the reason is saved, and the admin panel
// says "reply by hand".

const REPLIES = [(text: string) => text, (text: string) => text.replace('Here you go:', 'As promised:'), (text: string) => text.replace('Here you go:', 'Sent! Here it is:')];

async function replyToComments(service: Service, log: string[]) {
  if (!connected('instagram')) return;
  const { data } = await service
    .from('social_posts')
    .select('id, external_id, meta, published_at')
    .eq('platform', 'instagram')
    .eq('status', 'published')
    .not('external_id', 'is', null)
    .gte('published_at', new Date(Date.now() - 4 * 86_400_000).toISOString())
    .limit(20);
  const posts = ((data ?? []) as { id: string; external_id: string; meta: any }[]).filter((p) => p.meta?.reply?.text);
  if (!posts.length) return;
  const token = Deno.env.get('IG_ACCESS_TOKEN') || Deno.env.get('FB_PAGE_TOKEN') || '';
  let sent = 0;
  let problem: string | null = null;
  for (const post of posts) {
    try {
      const res = await fetch(`${igBase()}/${post.external_id}/comments?fields=id,text,username&limit=50&access_token=${token}`, { signal: AbortSignal.timeout(15_000) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) throw new Error(d.error?.message ?? `HTTP ${res.status}`);
      // "+" or a word ("GERMANY") — in any case, with or without quotes around it.
      const keyword = String(post.meta.reply.keyword ?? '+').toLowerCase();
      const wanted = ((d.data ?? []) as { id: string; text?: string }[]).filter((c) => (c.text ?? '').toLowerCase().includes(keyword));
      if (!wanted.length) continue;
      const { data: done } = await service.from('social_replies').select('comment_id').in('comment_id', wanted.map((c) => c.id));
      const seen = new Set(((done ?? []) as { comment_id: string }[]).map((r) => r.comment_id));
      for (const c of wanted.filter((x) => !seen.has(x.id)).slice(0, 15)) {
        // Record first: a comment is answered at most once, even if the call below times out.
        const { error: insErr } = await service.from('social_replies').insert({ comment_id: c.id, post_id: post.id });
        if (insErr) continue;
        const message = REPLIES[hash(c.id) % REPLIES.length](String(post.meta.reply.text));
        const r = await fetch(`${igBase()}/${c.id}/replies`, { method: 'POST', body: new URLSearchParams({ message, access_token: token }), signal: AbortSignal.timeout(15_000) });
        const rd = await r.json().catch(() => ({}));
        if (!r.ok || rd.error) {
          await service.from('social_replies').delete().eq('comment_id', c.id);
          throw new Error(rd.error?.message ?? `HTTP ${r.status}`);
        }
        sent++;
      }
    } catch (e) {
      problem = e instanceof Error ? e.message : 'failed';
      break;
    }
  }
  if (sent) log.push(`Program: replied to ${sent} Instagram ${sent === 1 ? 'comment' : 'comments'}`);
  await service.from('social_program').update({ replies_ok: !problem, replies_note: problem ? `Instagram wouldn’t let us reply: ${problem}. Answer “+” comments by hand, or add the comments permission to the token.` : sent ? `Replied to ${sent} ${sent === 1 ? 'comment' : 'comments'}` : null, replies_at: new Date().toISOString() }).eq('id', true);
}

export { FORMATS };
