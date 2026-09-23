import { useState } from 'react';
import { jobPath } from '@/lib/jobUrl';
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
import { formatRelativeTime } from '@/lib/dates';
import type { Job } from '@/data/jobs';
import { CircleFlag } from '@/components/common/CircleFlag';

export type MatchItem =
  | { kind: 'job'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; remote: boolean; salary?: string; imageUrl?: string | null; createdAt: string; description?: string | null; postedDate?: string | null }
  | { kind: 'program'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; funding: string | null; imageUrl?: string | null; createdAt: string; description?: string | null; postedDate?: string | null };


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

/**
 * Picks up to `count` items for the landing page's small preview
 * section, sorted by recency but with at most one per company/org —
 * otherwise a single company's bulk import (Roche, Booking.com, etc.,
 * all landing with nearly the same timestamp) fills every slot with
 * itself, which defeats the point of a "here's what's out there"
 * preview. Tops up with the next-most-recent items regardless of
 * company only if there aren't enough distinct ones to fill `count`.
 */
function pickDiverseByCompany(items: MatchItem[], count: number): MatchItem[] {
  const sorted = [...items].sort((a, b) => {
    const da = new Date(a.postedDate ?? a.createdAt).getTime();
    const db = new Date(b.postedDate ?? b.createdAt).getTime();
    return db - da;
  });

  const seenOrgs = new Set<string>();
  const picked: MatchItem[] = [];
  for (const item of sorted) {
    if (seenOrgs.has(item.org)) continue;
    seenOrgs.add(item.org);
    picked.push(item);
    if (picked.length >= count) return picked;
  }

  for (const item of sorted) {
    if (picked.includes(item)) continue;
    picked.push(item);
    if (picked.length >= count) break;
  }
  return picked;
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
  const shownItems = visibleItems ? pickDiverseByCompany(visibleItems, 4) : null;
  const countryParam = destinationCountry ? `?country=${encodeURIComponent(destinationCountry.name)}` : '';

  return (
    <div className="px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <FlagSwitcher code={originCode} placeholder="Your country" onSelect={(code) => code && setOriginCountry(code)} />
        <ArrowRight className="h-4 w-4 text-ink-300" />
        <FlagSwitcher code={destinationCode} placeholder="Any destination" onSelect={setDestinationCode} allowAny />
      </div>

      <h2 className="mt-3 text-xl font-bold tracking-tight text-ink-950 sm:text-2xl">
        From <span className="text-brand-600">{originName ?? 'your country'}</span> to{' '}
        {destinationCountry ? (
          <>
            opportunities in <span className="text-brand-600">{destinationCountry.name}</span>
          </>
        ) : (
          'opportunities worldwide'
        )}
      </h2>
      {visibleItems && visibleItems.length > 0 && (
        <p className="mt-1 text-sm text-ink-500">
          <a href={`/jobs${countryParam}`} className="font-bold text-ink-900 underline decoration-2 underline-offset-2 hover:text-brand-700">
            {visibleItems.length.toLocaleString()}
          </a>{' '}
          opportunities {destinationCountry ? <>in <span className="font-bold text-brand-600">{destinationCountry.name}</span> and abroad</> : 'worldwide'}
        </p>
      )}

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
          <ExploreMoreTile countryParam={countryParam} destinationName={destinationCountry?.name} />
        </div>
      )}
    </div>
  );
}

function ExploreMoreTile({ countryParam, destinationName }: { countryParam: string; destinationName?: string }) {
  return (
    <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-brand-200 bg-brand-50/40 p-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-brand-600">
        <ArrowRight className="h-6 w-6" />
      </span>
      <div>
        <p className="text-sm font-bold text-ink-900">Explore more</p>
        <p className="mt-0.5 text-xs text-ink-500">
          {destinationName ? `All opportunities in ${destinationName}` : 'All sponsored opportunities'}
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full">
        <a
          href={`/jobs${countryParam}`}
          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Explore Jobs
        </a>
        <a
          href={`/programs${countryParam}`}
          className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
        >
          Explore Programs
        </a>
      </div>
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

function MatchCard({ item, originCode }: { item: MatchItem; originCode: string | null }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const Icon = iconFor(item.category, item.kind);
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

        {item.postedDate && <p className="mt-1.5 text-[11px] text-ink-400">Posted {formatRelativeTime(item.postedDate)}</p>}

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
