import { JobAgeBadge } from '@/components/common/JobAgeBadge';
import { useEffect, useMemo, useRef, useState } from 'react';
import { jobPath } from '@/lib/jobUrl';
import { isJobViewed } from '@/lib/viewedJobs';
import { moveToBack, recencyBucket, recentlyShownIds, rememberShown, visitShuffle } from '@/lib/feedRotation';
import {
  Briefcase,
  GraduationCap,
  Hammer,
  Landmark,
  ArrowLeftRight,
  TrendingUp,
  Building2,
  Search,
  ChevronRight,
  Info,
  X,
  type LucideIcon,
} from 'lucide-react';
import { estimateJourneyCostBreakdown, type JourneyCostBreakdown } from '@/lib/costEstimates';
import { countJobsPublishedSince, fetchNewestPublishedJobs, fetchPublishedSponsoredJobs, isClosedJob, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { fetchSponsoredPrograms } from '@/lib/programs';
import { formatCost } from '@/lib/listingCategories';
import { stripHtml } from '@/lib/atsImport';
import type { Job } from '@/data/jobs';
import { CircleFlag } from '@/components/common/CircleFlag';

export type MatchItem =
  | { kind: 'job'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; remote: boolean; salary?: string; imageUrl?: string | null; createdAt: string; description?: string | null; postedDate?: string | null }
  | { kind: 'program'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; funding: string | null; imageUrl?: string | null; createdAt: string; description?: string | null; postedDate?: string | null };


/** Fetches every published job + program once. Shared by the landing
 * hero (for the "X new" tab badge) and this section (for the grid) so
 * the two can never disagree — same fetch, same data. */
/**
 * Landing page: just the newest jobs (one small request) — enough for the
 * 5 boxes. The full list is only loaded on /jobs for signed-in visitors.
 */
export async function fetchLandingItems(): Promise<MatchItem[]> {
  const jobs = await fetchNewestPublishedJobs(80);
  return buildMatchItems(jobs, []);
}

export async function fetchMatchItems(onPartial?: (items: MatchItem[]) => void): Promise<MatchItem[]> {
  const programsPromise = fetchSponsoredPrograms();
  let programsSoFar: Awaited<typeof programsPromise> = [];
  programsPromise.then((p) => (programsSoFar = p)).catch(() => {});
  const [jobs, programs] = await Promise.all([
    fetchPublishedSponsoredJobs({ onPartial: onPartial ? (rows) => onPartial(buildMatchItems(rows, programsSoFar)) : undefined }),
    programsPromise,
  ]);
  return buildMatchItems(jobs, programs);
}

function buildMatchItems(
  jobs: Awaited<ReturnType<typeof fetchPublishedSponsoredJobs>>,
  programs: Awaited<ReturnType<typeof fetchSponsoredPrograms>>
): MatchItem[] {
  // Closed jobs (greyed on /jobs for 24 h) don't count as opportunities here.
  const jobItems: MatchItem[] = jobs.filter((j) => !isClosedJob(j)).map((j) => {
    const board: Job = sponsoredJobToBoardJob(j);
    return {
      kind: 'job',
      id: board.id,
      title: board.title,
      org: board.company,
      countryCode: board.countryCode,
      countryName: board.country,
      category: board.category,
      remote: board.remote,
      salary: board.salary,
      imageUrl: board.imageUrl,
      createdAt: j.created_at,
      description: board.description,
      postedDate: board.postedDate,
    };
  });
  const programItems: MatchItem[] = programs.map((p) => ({
    kind: 'program',
    id: p.id,
    title: p.title,
    org: p.publisher?.name ?? 'Verified sponsor',
    countryCode: p.country?.iso_code ?? '',
    countryName: p.country?.name ?? 'Various',
    category: p.category,
    funding: formatCost(p),
    imageUrl: p.image_url,
    createdAt: p.created_at,
    description: p.description,
  }));

  // Interleave so it doesn't read as "all jobs, then all programs".
  const combined: MatchItem[] = [];
  const max = Math.max(jobItems.length, programItems.length);
  for (let i = 0; i < max; i++) {
    if (jobItems[i]) combined.push(jobItems[i]);
    if (programItems[i]) combined.push(programItems[i]);
  }
  return combined;
}

export function countNewWithin24h(items: MatchItem[]): number {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return items.filter((i) => new Date(i.createdAt).getTime() >= since).length;
}

// Category → icon lookup (checked in order, first substring match wins).
const CATEGORY_ICONS: [string[], LucideIcon][] = [
  [['apprentice', 'trade', 'vocational'], Hammer],
  [['exchange', 'cultural'], ArrowLeftRight],
  [['government', 'scholarship', 'public sector'], Landmark],
  [['study', 'education', 'university', 'academic', 'research'], GraduationCap],
  [['business', 'investor', 'startup', 'entrepreneur'], TrendingUp],
];

function iconFor(category: string, kind: 'job' | 'program'): LucideIcon {
  const lower = category.toLowerCase();
  for (const [keywords, Icon] of CATEGORY_ICONS) {
    if (keywords.some((k) => lower.includes(k))) return Icon;
  }
  return kind === 'job' ? Briefcase : Building2;
}


/**
 * Landing preview: the most recently shared jobs that show a salary — one
 * per company first. Topped up with other fresh items if there aren't enough.
 */
function pickRecentWithSalary(items: MatchItem[], count: number, shownBefore: Set<string>): MatchItem[] {
  const when = (i: MatchItem) => new Date(i.kind === 'job' ? i.postedDate ?? i.createdAt : i.createdAt).getTime() || 0;
  const salaried = items
    .filter((i) => i.kind === 'job' && Boolean(i.salary && i.salary.trim()))
    .sort((a, b) => when(b) - when(a));
  const picked: MatchItem[] = [];
  const orgs = new Set<string>();
  for (const i of salaried) {
    if (orgs.has(i.org)) continue;
    orgs.add(i.org);
    picked.push(i);
    if (picked.length >= count) return picked;
  }
  for (const i of salaried) {
    if (picked.length >= count) return picked;
    if (!picked.includes(i)) picked.push(i);
  }
  const rest = pickFreshDiverse(items.filter((i) => !picked.includes(i) && i.kind === 'job'), count - picked.length, shownBefore);
  return [...picked, ...rest].slice(0, count);
}

/**
 * Picks up to `count` items for the landing page's small preview:
 *  - from the freshest items (posted in the last few days, or the newest
 *    60 if there are fewer), in a different random order every visit;
 *  - items shown here on the last visits, and jobs already opened, go
 *    last — so each refresh leads with something new;
 *  - at most one per company/org (a single bulk import would otherwise
 *    fill every slot), topped up regardless of company if needed.
 */
function pickFreshDiverse(items: MatchItem[], count: number, shownBefore: Set<string>): MatchItem[] {
  const byDate = [...items].sort((a, b) => {
    const da = new Date(a.postedDate ?? a.createdAt).getTime();
    const db = new Date(b.postedDate ?? b.createdAt).getTime();
    return db - da;
  });
  const fresh = byDate.filter((i) => recencyBucket(i.postedDate ?? i.createdAt) <= 1);
  const pool = fresh.length >= 60 ? fresh : byDate.slice(0, 60);
  const ordered = moveToBack(
    moveToBack(visitShuffle(pool, 'landing'), (i) => shownBefore.has(i.id)),
    (i) => i.kind === 'job' && isJobViewed(i.id)
  );

  const seenOrgs = new Set<string>();
  const picked: MatchItem[] = [];
  for (const item of ordered) {
    if (seenOrgs.has(item.org)) continue;
    seenOrgs.add(item.org);
    picked.push(item);
    if (picked.length >= count) return picked;
  }
  for (const item of ordered) {
    if (picked.includes(item)) continue;
    picked.push(item);
    if (picked.length >= count) break;
  }
  return picked;
}

/**
 * Animates a number from its previous value up (or down) to `target`
 * with requestAnimationFrame — works the same on desktop and mobile.
 * Returns 0 until `target` is known.
 */
function useCountUp(target: number | null, duration = 1400): number {
  const [value, setValue] = useState(0);
  const currentRef = useRef(0);

  useEffect(() => {
    if (target == null) return;
    const from = currentRef.current;
    if (from === target) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out: fast start, gentle landing
      const next = Math.round(from + (target - from) * eased);
      currentRef.current = next;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

export function LocationMatchSection({
  items,
  originCode,
}: {
  items: MatchItem[] | null;
  /** False while `items` is a cached copy / first page and the full list is still loading. */
  itemsComplete?: boolean;
  originCode: string | null;
  /** No longer used — the landing page has no country pickers. */
  originName?: string | null;
  setOriginCountry?: (code: string) => void;
}) {
  const [query, setQuery] = useState('');
  const visibleItems = items;
  const shownBefore = useMemo(() => recentlyShownIds('landing'), []);
  const shownItems = useMemo(() => (visibleItems ? pickRecentWithSalary(visibleItems, 5, shownBefore) : null), [visibleItems, shownBefore]);
  useEffect(() => {
    if (shownItems?.length) rememberShown('landing', shownItems.map((i) => i.id));
  }, [shownItems]);

  // "N new jobs published today" — a snapshot, not live: counts jobs from
  // midnight up to the last 2-hour mark (00:00, 02:00, 04:00 …), cached
  // per visitor, so the number steps up every 2 hours instead of ticking.
  const [todayCount, setTodayCount] = useState<number | null>(null);
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const TWO_H = 2 * 3_600_000;
    const upTo = midnight.getTime() + Math.floor((Date.now() - midnight.getTime()) / TWO_H) * TWO_H;
    if (upTo <= midnight.getTime()) {
      setTodayCount(0); // before 2 am: nothing to show yet
      return;
    }
    const key = `mv:todayJobs:${upTo}`;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved != null) {
        setTodayCount(Number(saved));
        return;
      }
    } catch {
      /* no storage — just ask */
    }
    let alive = true;
    countJobsPublishedSince(midnight.toISOString(), new Date(upTo).toISOString()).then((n) => {
      if (!alive) return;
      setTodayCount(n);
      try {
        if (n != null) window.localStorage.setItem(key, String(n));
      } catch {
        /* ignore */
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  const animatedCount = useCountUp(todayCount);

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8">
      <h2 className="text-xl font-bold tracking-tight text-ink-950 sm:text-2xl">
        {todayCount === 0 ? (
          // Just after midnight nothing is "today" yet.
          <>Newest jobs, straight from company career pages</>
        ) : (
          <>
            {todayCount != null ? (
              <a href="/jobs" className="tabular-nums text-brand-700 underline decoration-2 underline-offset-4 transition hover:text-brand-800">
                {animatedCount.toLocaleString()}
              </a>
            ) : (
              <span className="skeleton-shimmer inline-block h-[1.1em] w-12 rounded-md align-[-0.2em]" aria-hidden="true" />
            )}{' '}
            new {todayCount === 1 ? 'job' : 'jobs'} published today
          </>
        )}
        <a href="/jobs" aria-label="See all jobs" className="group ml-2 inline-flex items-center align-middle text-brand-600 hover:text-brand-700">
          <GrowingArrow />
        </a>
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams();
          if (query.trim()) params.set('q', query.trim());
          const qs = params.toString();
          // In-app navigation (no reload): App listens for popstate and
          // JobsPage reads q/country from the URL when it opens.
          window.history.pushState({}, '', qs ? `/jobs?${qs}` : '/jobs');
          window.dispatchEvent(new PopStateEvent('popstate'));
          window.scrollTo({ top: 0 });
        }}
        className="mt-4 flex flex-col gap-2 sm:flex-row"
      >
        <div className="flex h-12 flex-1 items-center gap-3 rounded-md border border-ink-300 bg-white px-3.5 focus-within:border-brand-400">
          <Search className="h-4.5 w-4.5 shrink-0 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Job title, skill, company or city"
            className="h-full w-full bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-ink-400 hover:text-ink-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="flex h-12 items-center justify-center gap-2 rounded-md bg-brand-600 px-6 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </form>

      {shownItems === null ? (
        <div className="mt-6 grid grid-cols-1 gap-4 py-2 sm:grid-cols-2 lg:grid-cols-5" aria-busy="true" aria-label="Loading opportunities">
          {[0, 1, 2, 3, 4].map((i) => (
            <MatchCardSkeleton key={i} />
          ))}
        </div>
      ) : shownItems.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-ink-200 bg-white px-5 py-10 text-center">
          <Briefcase className="h-6 w-6 text-ink-300" />
          <p className="text-sm font-semibold text-ink-500">
            New jobs will appear here
          </p>
          <p className="text-xs text-ink-400">Check back soon — new sponsored listings appear here automatically.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 py-2 sm:grid-cols-2 lg:grid-cols-5">
          {shownItems.map((item) => (
            <MatchCard key={`${item.kind}-${item.id}`} item={item} originCode={originCode} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Grey animated placeholder shaped like a real MatchCard. */
function MatchCardSkeleton() {
  return (
    <div className="flex h-[360px] flex-col rounded-lg border border-ink-200 bg-white p-4">
      <div className="skeleton-shimmer h-14 w-14 rounded" />
      <div className="skeleton-shimmer mt-4 h-4 w-11/12 rounded" />
      <div className="skeleton-shimmer mt-2 h-4 w-3/5 rounded" />
      <div className="skeleton-shimmer mt-3 h-3 w-2/5 rounded" />
      <div className="mt-3 flex items-center gap-2">
        <div className="skeleton-shimmer h-4 w-4 rounded-full" />
        <div className="skeleton-shimmer h-3 w-1/3 rounded" />
      </div>
      <div className="mt-3 flex gap-2">
        <div className="skeleton-shimmer h-5 w-20 rounded" />
        <div className="skeleton-shimmer h-5 w-14 rounded" />
      </div>
      <div className="skeleton-shimmer mt-3 h-3 w-1/4 rounded" />
      <div className="skeleton-shimmer mt-auto h-8 w-full rounded-lg" />
    </div>
  );
}

/** Arrow whose shaft grows when its parent `group` is hovered/pressed. */
function GrowingArrow() {
  return (
    <span aria-hidden="true" className="flex items-center">
      <span className="h-[2px] w-2.5 rounded-full bg-current transition-all duration-300 ease-out group-hover:w-6 group-active:w-6" />
      <ChevronRight className="-ml-[10px] h-4 w-4" strokeWidth={2.75} />
    </span>
  );
}

function CostBreakdownPopover({ est, onClose }: { est: JourneyCostBreakdown; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded border border-ink-200 bg-white p-4 text-left shadow-xl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">What's included</p>
        <button onClick={onClose} aria-label="Close" className="text-ink-300 hover:text-ink-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-ink-600">
        <div className="flex justify-between"><span>Flight (est.)</span><span className="font-semibold">${est.flightLowUSD.toLocaleString()}–${est.flightHighUSD.toLocaleString()}</span></div>
        <div className="flex justify-between"><span>Visa fee</span><span className="font-semibold">${est.visaFeeUSD.toLocaleString()}</span></div>
        {est.includeWorkPermit && <div className="flex justify-between"><span>Work permit fee</span><span className="font-semibold">${est.workPermitFeeUSD.toLocaleString()}</span></div>}
        {est.includeProgram && <div className="flex justify-between"><span>Program cost (avg.)</span><span className="font-semibold">${est.programAverageUSD.toLocaleString()}</span></div>}
      </div>
      <p className="mt-3 text-[10px] leading-4 text-ink-400">Rough estimate for planning purposes — actual costs vary by provider and circumstances.</p>
    </div>
  );
}

function MatchCard({ item, originCode }: { item: MatchItem; originCode: string | null }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const Icon = iconFor(item.category, item.kind);
  const viewed = item.kind === 'job' && isJobViewed(item.id);
  const href = item.kind === 'job' ? jobPath({ id: item.id, title: item.title, company: item.org }) : `/programs/${item.id}`;

  const est = estimateJourneyCostBreakdown({
    originCountryCode: originCode,
    destinationCountryCode: item.countryCode || 'XX',
    destinationCountryName: item.countryName,
    journey: item.kind === 'job' ? 'work' : 'programs',
  });

  const showCostPill = item.kind === 'program';
  const salaryOrFunding = item.kind === 'job' ? item.salary : item.funding;
  const hasImage = Boolean(item.imageUrl) && !imgFailed;
  const snippet = item.description ? stripHtml(item.description).slice(0, 140) : null;

  return (
    <div className="relative h-[360px]">
      <a
        href={href}
        className={`group relative flex h-full flex-col rounded-lg border p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg ${
          viewed ? 'border-ink-200 bg-ink-100/70 opacity-75 grayscale-[40%] hover:opacity-100' : 'border-ink-900/20 bg-white'
        }`}
      >
        {viewed && (
          <span className="absolute right-3 top-3 rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-600">
            Viewed
          </span>
        )}
        {hasImage ? (
          <img
            src={item.imageUrl!}
            alt=""
            onError={() => setImgFailed(true)}
            className="h-14 w-14 shrink-0 rounded object-cover"
          />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded" style={{ backgroundColor: '#2563EB' }}>
            <Icon className="h-6 w-6 text-slate-300" />
          </span>
        )}

        <h3 className="mt-3 font-slab text-base font-bold leading-snug text-ink-950 line-clamp-2">{item.title}</h3>

        {salaryOrFunding ? (
          <p className="mt-1 truncate font-slab text-base font-bold leading-snug text-ink-950">{salaryOrFunding}</p>
        ) : (
          <p className="mt-1 truncate text-xs font-medium text-ink-500">{item.org}</p>
        )}

        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <CircleFlag countryCode={item.countryCode} label={item.countryName} size={18} />
          <span className="truncate font-bold text-ink-900">{item.countryName}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="truncate rounded bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-600">{item.category}</span>
          {item.kind === 'job' && item.remote && <span className="shrink-0 rounded bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-600">Remote</span>}
        </div>

        {snippet && <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-500">{snippet}</p>}

        <div className="mt-auto pt-2">
          {item.postedDate && <JobAgeBadge iso={item.postedDate} className="mb-2" />}
          {showCostPill && (
            <div className="flex items-center gap-1 border-t border-ink-100 pt-2">
              <span className="truncate rounded bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                Est: ${est.totalLowUSD.toLocaleString()}–${est.totalHighUSD.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setShowBreakdown((v) => !v); }}
                className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-ink-50 hover:text-brand-600"
                aria-label="What's included"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* Visual only — the whole card is already the clickable <a>, so
              this is a styled span rather than a second nested link. */}
          <span className="mt-2 block rounded-lg border border-ink-200 py-1.5 text-center text-xs font-semibold text-brand-700 transition group-hover:bg-brand-50">
            See more
          </span>
        </div>
      </a>

      {showBreakdown && <CostBreakdownPopover est={est} onClose={() => setShowBreakdown(false)} />}
    </div>
  );
}
