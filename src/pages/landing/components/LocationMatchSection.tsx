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
  ChevronLeft,
  ChevronRight,
  Globe2,
  Info,
  Megaphone,
  X,
  type LucideIcon,
} from 'lucide-react';
import { allCountries } from '@/data/allCountries';
import { estimateJourneyCostBreakdown, type JourneyCostBreakdown } from '@/lib/costEstimates';
import { fetchPublishedSponsoredJobs, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { fetchSponsoredPrograms } from '@/lib/programs';
import { formatCost } from '@/lib/listingCategories';
import type { Job } from '@/data/jobs';
import { CircleFlag } from '@/components/common/CircleFlag';

export type MatchItem =
  | { kind: 'job'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; remote: boolean; salary?: string; createdAt: string }
  | { kind: 'program'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; funding: string | null; createdAt: string };

const PAGE_SIZE = 10;

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
      createdAt: j.created_at,
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
    createdAt: p.created_at,
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
  const [page, setPage] = useState(0);

  const destinationCountry = allCountries.find((c) => c.code === destinationCode);
  const visibleItems = items?.filter((item) => !destinationCode || item.countryCode === destinationCode) ?? null;
  const totalPages = visibleItems ? Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE)) : 1;
  const pageItems = visibleItems?.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) ?? null;

  return (
    <div className="px-1 py-6 sm:px-2">
      <div className="flex flex-wrap items-center gap-2">
        <FlagSwitcher code={originCode} placeholder="Your country" onSelect={(code) => code && setOriginCountry(code)} />
        <ArrowRight className="h-4 w-4 text-ink-300" />
        <FlagSwitcher code={destinationCode} placeholder="Any destination" onSelect={(c) => { setDestinationCode(c); setPage(0); }} allowAny />
      </div>

      <h2 className="mt-3 text-xl font-bold tracking-tight text-ink-950 sm:text-2xl">
        From {originName ?? 'your country'} to {destinationCountry?.name ?? 'opportunities abroad'}
      </h2>

      {pageItems === null ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded bg-ink-100" />
          ))}
        </div>
      ) : pageItems.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-ink-200 bg-white px-5 py-10 text-center">
          <Briefcase className="h-6 w-6 text-ink-300" />
          <p className="text-sm font-semibold text-ink-500">
            {destinationCountry ? `No sponsored listings for ${destinationCountry.name} yet` : 'Sponsored jobs and programs will appear here'}
          </p>
          <p className="text-xs text-ink-400">Check back soon — new sponsored listings appear here automatically.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
            {pageItems.map((item) => (
              <MatchCard key={`${item.kind}-${item.id}`} item={item} originCode={originCode} originName={originName} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Previous page"
                className="rounded-full border border-ink-200 p-2 text-ink-500 hover:bg-ink-50 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium text-ink-400">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                aria-label="Next page"
                className="rounded-full border border-ink-200 p-2 text-ink-500 hover:bg-ink-50 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
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

function SponsoredBadge({ kind }: { kind: 'job' | 'program' }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-indigo-600 to-brand-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
      <Megaphone className="h-2.5 w-2.5" />
      Sponsored {kind === 'job' ? 'Job' : 'Program'}
    </span>
  );
}

function MatchCard({ item, originCode, originName }: { item: MatchItem; originCode: string | null; originName: string | null }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
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

  return (
    <div className="relative">
      <a href={href} className="block h-full rounded border border-ink-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg">
        <div className="flex items-start gap-4">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded" style={{ backgroundColor: '#2563EB' }}>
            <Icon className="h-9 w-9 text-slate-300" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-slab text-lg font-bold leading-snug text-ink-950">{item.title}</h3>
              <SponsoredBadge kind={item.kind} />
            </div>
            <p className="mt-0.5 truncate text-xs font-medium text-ink-500">{item.org}</p>

            {salaryOrFunding && (
              <span className="mt-2 inline-block rounded bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {item.kind === 'job' ? 'Salary' : 'Stipend'}: {salaryOrFunding}
              </span>
            )}

            <div className="mt-2 flex items-center gap-2 text-xs">
              {originCode && (
                <>
                  <CircleFlag countryCode={originCode} label={originName ?? undefined} size={24} />
                  <ArrowRight className="h-3 w-3 text-ink-300" />
                </>
              )}
              <CircleFlag countryCode={item.countryCode} label={item.countryName} size={24} />
              <span className="font-bold text-ink-900">{item.countryName}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600">{item.category}</span>
          {item.kind === 'job' && item.remote && <span className="rounded bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600">Remote</span>}
        </div>

        {showCostPill && (
          <div className="mt-3 flex items-center gap-1 border-t border-ink-100 pt-3">
            <span className="rounded bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700">
              Est. journey cost: ${est.totalLowUSD.toLocaleString()}–${est.totalHighUSD.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setShowBreakdown((v) => !v); }}
              className="rounded-full p-1 text-ink-400 hover:bg-ink-50 hover:text-brand-600"
              aria-label="What's included"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        )}
      </a>

      {showBreakdown && <CostBreakdownPopover est={est} onClose={() => setShowBreakdown(false)} />}
    </div>
  );
}
