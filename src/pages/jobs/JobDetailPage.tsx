import { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, Building2, Check, Landmark, Loader2, MapPin, Share2, UserRound, Users } from 'lucide-react';
import type { View } from '@/types';
import type { Job } from '@/data/jobs';
import { jobs as curatedJobs } from '@/data/jobs';
import { fetchSponsoredJobById, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { computeEligibility, usePersonalization } from '@/lib/personalization';
import { EligibilityBadge } from '@/components/opportunities/PersonalizationBar';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { useSeo } from '@/lib/seo';

type JobDetailPageProps = {
  id: string;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

export function JobDetailPage({ id, go, onAuth }: JobDetailPageProps) {
  const { profile } = usePersonalization();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (id.startsWith('sponsored-')) {
      const realId = id.replace('sponsored-', '');
      fetchSponsoredJobById(realId).then((j) => setJob(j ? sponsoredJobToBoardJob(j) : null));
    } else {
      setJob(curatedJobs.find((j) => j.id === id) ?? null);
    }
  }, [id]);

  useSeo({
    title: job ? `${job.title} at ${job.company}` : 'Job',
    description: job
      ? `${job.title} at ${job.company} in ${job.country}${job.remote ? ' (remote-friendly)' : ''}. View requirements and apply.`
      : 'View this job listing on MadeVisa, including requirements and how to apply.',
    path: `/jobs/${id}`,
    noindex: job === null,
  });

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: job?.title, url });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (job === undefined) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <LandingHeader go={go} onAuth={onAuth} active="jobs" />
        <div className="grid h-96 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <LandingHeader go={go} onAuth={onAuth} active="jobs" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="text-xl font-bold text-ink-900">Job not found</h1>
          <p className="mt-2 text-sm text-ink-500">It may have been removed or isn't published yet.</p>
          <button onClick={() => go('jobs')} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Browse jobs
          </button>
        </div>
      </div>
    );
  }

  const eligibility = computeEligibility(job.eligibility, profile, job.countryCode);
  const SponsorIcon = job.publisherOrgType === 'government' ? Landmark : job.publisherOrgType === 'expert' ? UserRound : Building2;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="jobs" />

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <button onClick={() => go('jobs')} className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-3.5 w-3.5" />
          All jobs
        </button>

        <div className="mt-5 overflow-hidden border border-ink-200 bg-white">
          {job.imageUrl ? (
            <img src={job.imageUrl} alt="" className="h-56 w-full object-cover" />
          ) : (
            <div className="grid h-40 w-full place-items-center bg-gradient-to-br from-brand-50 to-indigo-50">
              {job.publisherOrgType ? <SponsorIcon className="h-10 w-10 text-brand-300" /> : <CompanyLogo name={job.company} size={64} />}
            </div>
          )}

          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">{job.category}</span>
              <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600">{job.type}</span>
              {job.remote && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Remote</span>}
              <EligibilityBadge result={eligibility} />
            </div>

            <h1 className="mt-3 font-slab text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{job.title}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-500">
              <span className="flex items-center gap-1.5">
                {job.publisherOrgType ? <SponsorIcon className="h-4 w-4 text-ink-400" /> : <Briefcase className="h-4 w-4 text-ink-400" />}
                {job.company}
              </span>
              <span className="flex items-center gap-1.5">
                <CircleFlag countryCode={job.countryCode} label={job.country} size={16} />
                {job.city ? `${job.city}, ${job.country}` : job.country}
              </span>
            </div>

            {job.description && <p className="mt-5 text-sm leading-6 text-ink-600">{job.description}</p>}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {job.salary && <InfoRow icon={Briefcase} label="Compensation" value={job.salary} />}
              {job.spotsAvailable != null && <InfoRow icon={Users} label="Positions available" value={String(job.spotsAvailable)} />}
              <InfoRow icon={MapPin} label="Location" value={job.city ? `${job.city}, ${job.country}` : job.country} />
            </div>

            {job.requirements && (
              <div className="mt-6 rounded-lg bg-ink-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Requirements &amp; limits</p>
                <p className="mt-1.5 text-sm leading-6 text-ink-700">{job.requirements}</p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-brand-600 px-8 py-3.5 text-sm font-bold text-white shadow-soft-lg transition hover:-translate-y-0.5 hover:bg-brand-700"
              >
                Apply now
              </a>
              <button
                onClick={share}
                className="flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-3.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
                {copied ? 'Link copied' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-ink-50 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div>
        <p className="text-[11px] text-ink-400">{label}</p>
        <p className="text-sm font-semibold text-ink-800">{value}</p>
      </div>
    </div>
  );
}
