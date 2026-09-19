import { useEffect, useState } from 'react';
import {
  Briefcase,
  GraduationCap,
  Hammer,
  Landmark,
  ArrowLeftRight,
  TrendingUp,
  Building2,
  ArrowRight,
  Info,
  Megaphone,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useOriginCountry } from '@/lib/originCountry';
import { estimateJourneyCostBreakdown, type JourneyCostBreakdown } from '@/lib/costEstimates';
import { fetchPublishedSponsoredJobs, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { fetchSponsoredPrograms } from '@/lib/programs';
import type { Job } from '@/data/jobs';
import { CircleFlag } from '@/components/common/CircleFlag';

type Item =
  | { kind: 'job'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; remote: boolean; salary?: string }
  | { kind: 'program'; id: string; title: string; org: string; countryCode: string; countryName: string; category: string; funding: string | null };

// Category → icon lookup (checked in order, first substring match wins).
// Falls back to a sensible default per listing kind.
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

export function LocationMatchSection() {
  const { countryCode: originCode, countryName: originName } = useOriginCountry();
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    Promise.all([fetchPublishedSponsoredJobs(), fetchSponsoredPrograms()]).then(([jobs, programs]) => {
      const jobItems: Item[] = jobs.map((j) => {
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
        };
      });
      const programItems: Item[] = programs.map((p) => ({
        kind: 'program',
        id: p.id,
        title: p.title,
        org: p.publisher?.name ?? 'Verified sponsor',
        countryCode: p.country?.iso_code ?? '',
        countryName: p.country?.name ?? 'Various',
        category: p.category,
        funding: p.funding_text,
      }));
      const combined: Item[] = [];
      const max = Math.max(jobItems.length, programItems.length);
      for (let i = 0; i < max; i++) {
        if (jobItems[i]) combined.push(jobItems[i]);
        if (programItems[i]) combined.push(programItems[i]);
      }
      setItems(combined);
    });
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Matched to your journey</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950">
        {originName ? `From ${originName} to opportunities abroad` : 'Sponsored opportunities'}
      </h2>

      {items === null ? (
        <div className="mt-6 flex gap-4 overflow-hidden py-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 w-[380px] shrink-0 animate-pulse rounded bg-ink-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-ink-200 bg-white px-5 py-10 text-center">
          <Briefcase className="h-6 w-6 text-ink-300" />
          <p className="text-sm font-semibold text-ink-500">Sponsored jobs and programs will appear here</p>
          <p className="text-xs text-ink-400">Check back soon — new sponsored listings appear here automatically.</p>
        </div>
      ) : (
        <div className="mt-6 flex gap-4 overflow-x-auto overflow-y-visible px-1 py-4">
          {items.map((item) => (
            <MatchCard key={`${item.kind}-${item.id}`} item={item} originCode={originCode} originName={originName} />
          ))}
        </div>
      )}
    </section>
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

function MatchCard({ item, originCode, originName }: { item: Item; originCode: string | null; originName: string | null }) {
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
    <div className="relative w-[380px] shrink-0">
      <a href={href} className="block rounded border border-ink-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg">
        <div className="flex items-start gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded" style={{ backgroundColor: '#2563EB' }}>
            <Icon className="h-7 w-7 text-slate-300" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-bold leading-snug text-ink-950">{item.title}</h3>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                <Megaphone className="h-2.5 w-2.5" />
                Sponsored
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs font-medium text-ink-500">{item.org}</p>

            <div className="mt-2 flex items-center gap-1.5 text-xs">
              {originCode && (
                <>
                  <CircleFlag countryCode={originCode} label={originName ?? undefined} size={16} />
                  <ArrowRight className="h-3 w-3 text-ink-300" />
                </>
              )}
              <CircleFlag countryCode={item.countryCode} label={item.countryName} size={16} />
              <span className="font-bold text-ink-900">{item.countryName}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600">{item.category}</span>
          {item.kind === 'job' && item.remote && <span className="rounded bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600">Remote</span>}
        </div>

        {(salaryOrFunding || showCostPill) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
            {salaryOrFunding && (
              <span className="rounded bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                {item.kind === 'job' ? 'Salary' : 'Stipend'}: {salaryOrFunding}
              </span>
            )}
            {showCostPill && (
              <div className="flex items-center gap-1">
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
          </div>
        )}
      </a>

      {showBreakdown && <CostBreakdownPopover est={est} onClose={() => setShowBreakdown(false)} />}
    </div>
  );
}
