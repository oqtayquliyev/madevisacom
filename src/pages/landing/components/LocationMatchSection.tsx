import { useState } from 'react';
import {
  Briefcase,
  GraduationCap,
  Hammer,
  Landmark,
  ArrowLeftRight,
  TrendingUp,
  Building2,
  ArrowRight,
  ChevronDown,
  Globe2,
  Info,
  X,
  type LucideIcon,
} from 'lucide-react';
import { allCountries } from '@/data/allCountries';
import { estimateJourneyCostBreakdown, type JourneyCostBreakdown } from '@/lib/costEstimates';
import { fetchPublishedSponsoredJobs, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { fetchSponsoredPrograms } from '@/lib/programs';
import { formatCost } from '@/lib/listingCategories';
import { stripHtml } from '@/lib/atsImport';
import { formatShortDate } from '@/lib/dates';
import type { Job } from '@/data/jobs';
import { CircleFlag } from '@/components/common/CircleFlag';

export type MatchItem =
  | { kind: 'job'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; remote: boolean; salary?: string; imageUrl?: string | null; createdAt: string; description?: string | null; postedDate?: string | null }
  | { kind: 'program'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; funding: string | null; imageUrl?: string | null; createdAt: string; description?: string | null; postedDate?: string | null };

/** Selects up to `count` items favoring variety of `org` — one per
 *  distinct org on the first pass through the list (in its existing
 *  order), a second per org on a second pass, and so on. Only repeats
 *  an org once every other org already shown has had its turn, so a
 *  handful of orgs with hundreds of items each can't crowd out the
 *  rest just because they happen to sort first. */
function pickDiverseByOrg<T extends { org: string }>(items: T[], count: number): T[] {
  const byOrg = new Map<string, T[]>();
  for (const item of items) {
    const list = byOrg.get(item.org);
    if (list) list.push(item);
    else byOrg.set(item.org, [item]);
  }
  const queues = Array.from(byOrg.values());
  const picked: T[] = [];
  let round = 0;
  while (picked.length < count && queues.some((q) => round < q.length)) {
    for (const q of queues) {
      if (picked.length >= count) break;
      if (round < q.length) picked.push(q[round]);
    }
    round++;
  }
  return picked;
}


/** Fetches every published job + program once. Shared by the landing
 * hero (for the "X new" tab badge) and this section (for the grid) so
 * the two can never disagree — same fetch, same data. */
export async function fetchMatchItems(): Promise<MatchItem[]> {
  const [jobs, programs] = await Promise.all([fetchPublishedSponsoredJobs(), fetchSponsoredPrograms()]);

  const jobItems: MatchItem[] = jobs.map((j) => {
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

/** Compact flag button that opens a searchable country dropdown. */
function FlagSwitcher({
  code,
  placeholder,
  onSelect,
  allowAny,
}: {
  code: string | null;
  placeholder: string;
  onSelect: (code: string | null) => void;
  allowAny?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const country = allCountries.find((c) => c.code === code);
  const filtered = allCountries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-800 hover:border-brand-300"
      >
        {country ? (
          <CircleFlag countryCode={country.code} label={country.name} size={28} />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-100 text-ink-400">
            <Globe2 className="h-4 w-4" />
          </span>
        )}
        {country?.name ?? placeholder}
        <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-md border border-ink-200 bg-white p-2 shadow-xl">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search countries…"
              className="mb-1 h-9 w-full rounded-md border border-ink-200 px-2 text-sm outline-none focus:border-brand-500"
            />
            <div className="max-h-64 overflow-auto">
              {allowAny && (
                <button
                  type="button"
                  onClick={() => { onSelect(null); setOpen(false); setSearch(''); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  <Globe2 className="h-5 w-5 text-ink-400" />
                  All destinations
                </button>
              )}
              {filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { onSelect(c.code); setOpen(false); setSearch(''); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  <CircleFlag countryCode={c.code} label={c.name} size={20} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function LocationMatchSection({
  items,
  originCode,
  originName,
  setOriginCountry,
}: {
  items: MatchItem[] | null;
  originCode: string | null;
  originName: string | null;
  setOriginCountry: (code: string) => void;
}) {
  const [destinationCode, setDestinationCode] = useState<string | null>(null);

  const destinationCountry = allCountries.find((c) => c.code === destinationCode);
  const visibleItems = items?.filter((item) => !destinationCode || item.countryCode === destinationCode) ?? null;
  // Pick for variety, not just recency: walk items in their given order,
  // taking at most one per org on the first pass, a second per org on
  // the second pass, and so on — so four different companies show up
  // whenever four are available, rather than whichever single company
  // happened to have the most recent imports dominating all four slots.
  // Falls back naturally to repeats from fewer companies when there
  // simply aren't four distinct ones yet.
  const shownItems = visibleItems ? pickDiverseByOrg(visibleItems, 4) : null;
  const totalJobCount = visibleItems?.filter((item) => item.kind === 'job').length ?? 0;
  const countryParam = destinationCountry ? `?country=${encodeURIComponent(destinationCountry.name)}` : '';

  return (
    <div className="px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <FlagSwitcher code={originCode} placeholder="Your country" onSelect={(code) => code && setOriginCountry(code)} />
        <ArrowRight className="h-4 w-4 text-ink-300" />
        <FlagSwitcher code={destinationCode} placeholder="Any destination" onSelect={setDestinationCode} allowAny />
      </div>

      <h2 className="mt-3 text-xl font-bold tracking-tight text-ink-950 sm:text-2xl">
        From {originName ?? 'your country'} to {destinationCountry?.name ?? 'opportunities abroad'}
      </h2>

      {shownItems === null ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[360px] animate-pulse rounded-lg bg-ink-100" />
          ))}
        </div>
      ) : shownItems.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-ink-200 bg-white px-5 py-10 text-center">
          <Briefcase className="h-6 w-6 text-ink-300" />
          <p className="text-sm font-semibold text-ink-500">
            {destinationCountry ? `No sponsored listings for ${destinationCountry.name} yet` : 'Sponsored jobs and programs will appear here'}
          </p>
          <p className="text-xs text-ink-400">Check back soon — new sponsored listings appear here automatically.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 py-2 sm:grid-cols-2 lg:grid-cols-5">
          {shownItems.map((item) => (
            <MatchCard key={`${item.kind}-${item.id}`} item={item} originCode={originCode} />
          ))}
          <ExploreMoreTile countryParam={countryParam} destinationName={destinationCountry?.name} jobCount={totalJobCount} />
        </div>
      )}
    </div>
  );
}

function ExploreMoreTile({ countryParam, destinationName, jobCount }: { countryParam: string; destinationName?: string; jobCount: number }) {
  const jobLabel = jobCount === 1 ? '1 job' : `${jobCount.toLocaleString()} jobs`;
  return (
    <a
      href={`/jobs${countryParam}`}
      className="group flex h-[360px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-brand-300 bg-gradient-to-b from-brand-50 to-brand-100/60 p-5 text-center transition hover:border-brand-500 hover:shadow-lg"
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white transition group-hover:translate-x-1">
        <ArrowRight className="h-6 w-6" />
      </span>
      <div>
        <p className="text-base font-extrabold text-ink-950">Explore all jobs</p>
        <p className="mt-1 text-sm font-semibold text-brand-700">
          {jobCount > 0 ? `${jobLabel} waiting${destinationName ? ` in ${destinationName}` : ''}` : destinationName ? `All opportunities in ${destinationName}` : 'All sponsored opportunities'}
        </p>
      </div>
      <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition group-hover:bg-brand-700 group-hover:gap-2.5">
        See all jobs
        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </a>
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
  const href = item.kind === 'job' ? `/jobs/${item.id}` : `/programs/${item.id}`;

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
      <a href={href} className="group flex h-full flex-col rounded-lg border border-ink-900/20 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg">
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
          <p className="mt-1 truncate text-sm font-extrabold text-ink-950">{salaryOrFunding}</p>
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

        {item.postedDate && <p className="mt-1.5 text-[11px] text-ink-400">Posted {formatShortDate(item.postedDate)}</p>}

        <div className="mt-auto pt-2">
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
