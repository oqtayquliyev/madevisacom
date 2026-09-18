import { useEffect, useState } from 'react';
import { Briefcase, GraduationCap, ArrowRight, Megaphone } from 'lucide-react';
import { useOriginCountry } from '@/lib/originCountry';
import { estimateJourneyCostBreakdown } from '@/lib/costEstimates';
import { fetchPublishedSponsoredJobs, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { fetchSponsoredPrograms, type SponsoredProgram } from '@/lib/programs';
import type { Job } from '@/data/jobs';
import { CircleFlag } from '@/components/common/CircleFlag';

export function LocationMatchSection() {
  const { countryCode: originCode, countryName: originName } = useOriginCountry();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [program, setProgram] = useState<SponsoredProgram | null | undefined>(undefined);

  useEffect(() => {
    fetchPublishedSponsoredJobs().then((jobs) => setJob(jobs[0] ? sponsoredJobToBoardJob(jobs[0]) : null));
    fetchSponsoredPrograms().then((programs) => setProgram(programs[0] ?? null));
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Matched to your journey</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950">
        {originName ? `From ${originName} to opportunities abroad` : 'Sponsored opportunities'}
      </h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <JobMatchCard job={job} originCode={originCode} originName={originName} />
        <ProgramMatchCard program={program} originCode={originCode} originName={originName} />
      </div>
    </section>
  );
}

function RouteLine({
  originCode,
  originName,
  destCode,
  destName,
}: {
  originCode: string | null;
  originName: string | null;
  destCode: string;
  destName: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs font-medium text-ink-500">
      {originCode && (
        <>
          <CircleFlag countryCode={originCode} label={originName ?? undefined} size={16} />
          {originName}
          <ArrowRight className="h-3 w-3 text-ink-300" />
        </>
      )}
      <CircleFlag countryCode={destCode} label={destName} size={16} />
      {destName}
    </div>
  );
}

function CostPill({ label, low, high }: { label: string; low: number; high: number }) {
  return (
    <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      {label}: ${low.toLocaleString()}–${high.toLocaleString()}
    </span>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-soft">{children}</div>;
}

function SponsoredBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
      <Megaphone className="h-3 w-3" />
      Sponsored
    </span>
  );
}

function PlaceholderCard({ icon: Icon, label }: { icon: typeof Briefcase; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 bg-white px-5 py-10 text-center">
      <Icon className="h-6 w-6 text-ink-300" />
      <p className="text-sm font-semibold text-ink-500">{label}</p>
      <p className="text-xs text-ink-400">Check back soon — new sponsored listings appear here automatically.</p>
    </div>
  );
}

function JobMatchCard({ job, originCode, originName }: { job: Job | null | undefined; originCode: string | null; originName: string | null }) {
  if (job === undefined) return <CardShell><div className="h-40 animate-pulse rounded-lg bg-ink-50" /></CardShell>;
  if (job === null) return <PlaceholderCard icon={Briefcase} label="Sponsored jobs will appear here" />;

  return (
    <a href={`/jobs/${job.id}`} className="block">
      <CardShell>
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Briefcase className="h-4 w-4" />
          </span>
          <SponsoredBadge />
        </div>
        <h3 className="mt-3 text-sm font-bold text-ink-900">{job.title}</h3>
        <p className="text-xs text-ink-500">{job.company}</p>
        <RouteLine originCode={originCode} originName={originName} destCode={job.countryCode} destName={job.country} />
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-md bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600">{job.category}</span>
          {job.remote && <span className="rounded-md bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600">Remote</span>}
          {(() => {
            const est = estimateJourneyCostBreakdown({
              originCountryCode: originCode,
              destinationCountryCode: job.countryCode,
              destinationCountryName: job.country,
              journey: 'work',
            });
            return <CostPill label="Est. journey cost" low={est.totalLowUSD} high={est.totalHighUSD} />;
          })()}
        </div>
      </CardShell>
    </a>
  );
}

function ProgramMatchCard({ program, originCode, originName }: { program: SponsoredProgram | null | undefined; originCode: string | null; originName: string | null }) {
  if (program === undefined) return <CardShell><div className="h-40 animate-pulse rounded-lg bg-ink-50" /></CardShell>;
  if (program === null) return <PlaceholderCard icon={GraduationCap} label="Sponsored programs will appear here" />;

  const destCode = program.country?.iso_code ?? '';
  const destName = program.country?.name ?? 'Various';

  return (
    <a href={`/programs/${program.id}`} className="block">
      <CardShell>
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <GraduationCap className="h-4 w-4" />
          </span>
          <SponsoredBadge />
        </div>
        <h3 className="mt-3 text-sm font-bold text-ink-900">{program.title}</h3>
        <p className="text-xs text-ink-500">{program.publisher?.name}</p>
        <RouteLine originCode={originCode} originName={originName} destCode={destCode} destName={destName} />
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-md bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600">{program.category}</span>
          {(() => {
            const est = estimateJourneyCostBreakdown({
              originCountryCode: originCode,
              destinationCountryCode: destCode || 'XX',
              destinationCountryName: destName,
              journey: 'programs',
            });
            return <CostPill label="Est. journey cost" low={est.totalLowUSD} high={est.totalHighUSD} />;
          })()}
        </div>
      </CardShell>
    </a>
  );
}
