import { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, Building2, Calendar, Check, Landmark, Loader2, Share2, UserRound, Users } from 'lucide-react';
import type { View } from '@/types';
import type { Job } from '@/data/jobs';
import { jobs as curatedJobs } from '@/data/jobs';
import { fetchSponsoredJobById, fetchSponsoredJobByShortId, sponsoredJobToBoardJob, type SponsoredJob } from '@/lib/sponsoredJobs';
import { jobPath, parseJobPath } from '@/lib/jobUrl';
import { markJobViewed } from '@/lib/viewedJobs';
import { computeEligibility, usePersonalization } from '@/lib/personalization';
import { EligibilityBadge } from '@/components/opportunities/PersonalizationBar';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { useSeo } from '@/lib/seo';
import { sanitizeJobHtml } from '@/lib/atsImport';
import { formatRelativeTime } from '@/lib/dates';
import { MultiCountryBadge } from '@/components/common/MultiCountryBadge';

type JobDetailPageProps = {
  id: string;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

export function JobDetailPage({ id, go, onAuth }: JobDetailPageProps) {
  const { profile } = usePersonalization();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [raw, setRaw] = useState<SponsoredJob | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setJob(undefined);
    setRaw(null);

    const parsed = parseJobPath(id);
    const load: Promise<SponsoredJob | null> | null =
      parsed.kind === 'legacy'
        ? fetchSponsoredJobById(parsed.uuid)
        : parsed.kind === 'slug'
          ? fetchSponsoredJobByShortId(parsed.shortId, parsed.titleSlug)
          : null;

    if (!load) {
      setJob(curatedJobs.find((j) => j.id === (parsed.kind === 'other' ? parsed.id : id)) ?? null);
      return;
    }

    load.then((j) => {
      if (cancelled) return;
      const board = j ? sponsoredJobToBoardJob(j) : null;
      setRaw(j);
      setJob(board);
      // Old /jobs/sponsored-<uuid> links (and links whose title has since
      // been edited) are swapped to the current public URL in place, so
      // shared/bookmarked links keep working without a reload.
      if (board) {
        markJobViewed(board.id, { id: board.id, title: board.title, organization: board.company, country: board.country, countryCode: board.countryCode, url: board.url });
        const canonical = jobPath(board);
        if (window.location.pathname !== canonical) {
          window.history.replaceState(window.history.state, '', canonical + window.location.search + window.location.hash);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const canonicalPath = job ? jobPath(job) : `/jobs/${id}`;
  const location = job ? locationLabel(job) : '';

  useSeo({
    // useSeo appends " | MadeVisa" → "Title at Company, Location | MadeVisa"
    title: job ? `${job.title} at ${job.company}${location ? `, ${location}` : ''}` : 'Job',
    description: job ? jobMetaDescription(job, location) : 'View this job listing on MadeVisa, including requirements and how to apply.',
    path: canonicalPath,
    noindex: job === null,
    ogImage: job?.imageUrl ?? undefined,
  });

  // JobPosting structured data — individual job pages only (never the
  // /jobs list), built strictly from fields the job actually has.
  useEffect(() => {
    if (!job || !raw) return;
    const data = buildJobPostingJsonLd(job, raw, canonicalPath);
    if (!data) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'jobposting-jsonld';
    script.text = JSON.stringify(data).replace(/</g, '\\u003c');
    document.getElementById('jobposting-jsonld')?.remove();
    document.head.appendChild(script);
    return () => script.remove();
  }, [job, raw, canonicalPath]);

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
      <div className="min-h-screen bg-[#f8fafc] dark:bg-ink-950">
        <LandingHeader go={go} onAuth={onAuth} active="jobs" />
        <div className="grid h-96 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-[#f8fafc] dark:bg-ink-950">
        <LandingHeader go={go} onAuth={onAuth} active="jobs" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="text-xl font-bold text-ink-900 dark:text-ink-50">Job not found</h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">It may have been removed or isn't published yet.</p>
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
    <div className="min-h-screen bg-[#f8fafc] dark:bg-ink-950 text-ink-900 dark:text-ink-50">
      <LandingHeader go={go} onAuth={onAuth} active="jobs" />

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <button
          onClick={() => {
            // Real browser back navigation, not go('jobs') — that pushes
            // a bare /jobs with no query string, silently dropping
            // whatever search/filters were active on the list. Back
            // returns to that exact previous /jobs?... URL instead, and
            // JobsPage already reads its filters from the URL on mount,
            // so they come back automatically. Falls back to go('jobs')
            // only when there's nowhere to go back to (e.g. this page
            // was opened directly/in a new tab).
            if (window.history.length > 1) window.history.back();
            else go('jobs');
          }}
          className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 dark:text-ink-400 hover:text-ink-800 dark:hover:text-ink-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All jobs
        </button>

        <div className="mt-5 overflow-hidden border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900">
          <div className="flex items-center gap-4 border-b border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-800/60 px-6 py-6 sm:px-8 sm:py-8">
            {job.imageUrl ? (
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-ink-200 dark:border-ink-700 bg-white p-2.5 shadow-sm sm:h-24 sm:w-24">
                <img src={job.imageUrl} alt={`${job.company} logo`} className="h-full w-full object-contain" />
              </div>
            ) : (
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-ink-200 dark:border-ink-700 bg-gradient-to-br from-brand-50 dark:from-brand-900/30 to-indigo-50 dark:to-indigo-900/30 sm:h-24 sm:w-24">
                {job.publisherOrgType ? <SponsorIcon className="h-8 w-8 text-brand-300" /> : <CompanyLogo name={job.company} size={48} />}
              </div>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-base font-bold text-ink-900 dark:text-ink-50 sm:text-lg">
                {job.publisherOrgType && <SponsorIcon className="h-4 w-4 shrink-0 text-ink-400" />}
                {job.company}
              </p>
              {job.sourceType === 'company_submitted' && <p className="text-xs text-ink-500 dark:text-ink-400">Posted by {job.company}</p>}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              {/* For sponsored/imported jobs, category and type are kept
                  equal (see EditableJobRow / importJobsAsPending) — only
                  show both badges when they actually say something
                  different, or the same word (e.g. "Full time") shows up
                  twice side by side. */}
              {job.category && job.category !== job.type && (
                <span className="rounded-full bg-brand-50 dark:bg-brand-900/30 px-2.5 py-1 text-[11px] font-semibold text-brand-700 dark:text-brand-300">{job.category}</span>
              )}
              <span className="rounded-full bg-ink-100 dark:bg-ink-800 px-2.5 py-1 text-[11px] font-semibold text-ink-600 dark:text-ink-300">{job.type}</span>
              {job.remote && <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Remote</span>}
              {job.visaSponsorship && <span className="rounded-full bg-sky-50 dark:bg-sky-900/30 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300">Visa sponsorship</span>}
              <MultiCountryBadge officeNames={job.additionalLocations} />
              <EligibilityBadge result={eligibility} />
            </div>

            <h1 className="mt-3 font-slab text-2xl font-bold tracking-tight text-ink-950 dark:text-ink-50 sm:text-3xl">{job.title}</h1>

            <div className="mt-3 text-sm text-ink-500 dark:text-ink-400">
              <div className="flex items-center gap-1.5">
                <CircleFlag countryCode={job.countryCode} label={job.country} size={16} />
                {job.city ? `${job.city}, ${job.country}` : job.country}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-400">
                <Calendar className="h-3.5 w-3.5" />
                Posted {formatRelativeTime(job.postedDate)}
              </div>
            </div>

            {job.description && (
              <div
                className="prose-job mt-5 text-sm leading-6 text-ink-600 dark:text-ink-300 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink-950 dark:[&_h2]:text-ink-50 [&_h2]:first:mt-0 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-ink-900 dark:[&_h3]:text-ink-50 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_strong]:font-bold [&_strong]:text-ink-800 dark:[&_strong]:text-ink-100 [&_a]:text-brand-600 dark:[&_a]:text-brand-400 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(job.description) }}
              />
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <InfoRow icon={Briefcase} label="Compensation" value={job.salary || 'Not specified'} />
              <InfoRow icon={Users} label="Remote" value={job.remote ? 'Yes' : 'No'} />
              {job.spotsAvailable != null && <InfoRow icon={Users} label="Positions available" value={String(job.spotsAvailable)} />}
            </div>

            {job.requirements && (
              <div className="mt-6 rounded-lg bg-ink-50 dark:bg-ink-800 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">Requirements &amp; limits</p>
                <p className="mt-1.5 text-sm leading-6 text-ink-700 dark:text-ink-200">{job.requirements}</p>
              </div>
            )}

            {job.benefits && (
              <div className="mt-4 rounded-lg bg-emerald-50/60 dark:bg-emerald-900/30 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Benefits</p>
                <p className="mt-1.5 text-sm leading-6 text-ink-700 dark:text-ink-200">{job.benefits}</p>
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
                className="flex items-center gap-2 rounded-lg border border-ink-200 dark:border-ink-700 px-4 py-3.5 text-sm font-semibold text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Share2 className="h-4 w-4" />}
                {copied ? 'Link copied' : 'Share'}
              </button>
            </div>

            {job.sourceType === 'company_careers' && (
              <p className="mt-4 text-xs leading-5 text-ink-400">
                Added by MadeVisa from the company&apos;s public careers page. Availability may change on the original source.
              </p>
            )}
          </div>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-ink-50 dark:bg-ink-800 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div>
        <p className="text-[11px] text-ink-400">{label}</p>
        <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{value}</p>
      </div>
    </div>
  );
}

/** "City, Country", "Remote · Country" or just the country — only from real job data. */
function locationLabel(job: Job): string {
  const country = job.country && job.country !== 'Various' ? job.country : '';
  if (job.remote) return country ? `Remote, ${country}` : 'Remote';
  if (job.city && job.city !== job.country) return country ? `${job.city}, ${country}` : job.city;
  return country;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Unique per job: title, company, location, type/salary when known, then the start of the real description. */
function jobMetaDescription(job: Job, location: string): string {
  const facts = [job.type, job.salary].filter(Boolean).join(' · ');
  let text = `${job.title} at ${job.company}${location ? ` in ${location}` : ''}.${facts ? ` ${facts}.` : ''}`;
  const body = job.description ? stripHtml(job.description) : '';
  if (body) text += ` ${body}`;
  else text += ' See requirements and apply on MadeVisa.';
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).replace(/\s+\S*$/, '')}…`;
}

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  'full time': 'FULL_TIME',
  'full-time': 'FULL_TIME',
  'part time': 'PART_TIME',
  'part-time': 'PART_TIME',
  internship: 'INTERN',
  'seasonal work': 'TEMPORARY',
  temporary: 'TEMPORARY',
  'contract / freelance': 'CONTRACTOR',
  contract: 'CONTRACTOR',
  volunteer: 'VOLUNTEER',
};

const SALARY_UNIT_MAP: Record<string, string> = { hour: 'HOUR', day: 'DAY', week: 'WEEK', month: 'MONTH', year: 'YEAR' };

/**
 * Google JobPosting markup from the job's real data only. Returns null
 * when the required basics (title, description, company, a date) aren't
 * there, rather than filling gaps with guesses.
 */
function buildJobPostingJsonLd(job: Job, raw: SponsoredJob, path: string): Record<string, unknown> | null {
  const company = raw.publisher?.name;
  const datePosted = raw.source_posted_at ?? raw.approved_at;
  if (!company || !job.description || !datePosted) return null;

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: raw.title,
    description: sanitizeJobHtml(job.description),
    datePosted,
    url: `https://madevisa.com${path}`,
    identifier: { '@type': 'PropertyValue', name: company, value: raw.id },
    hiringOrganization: {
      '@type': 'Organization',
      name: company,
      ...(raw.image_url ? { logo: raw.image_url } : {}),
    },
    directApply: false,
  };

  const validThrough = raw.application_deadline ?? raw.expires_at;
  if (validThrough) data.validThrough = validThrough;

  const employmentType = EMPLOYMENT_TYPE_MAP[(raw.employment_type ?? '').trim().toLowerCase()];
  if (employmentType) data.employmentType = employmentType;

  const iso = raw.country?.iso_code;
  if (raw.remote) {
    data.jobLocationType = 'TELECOMMUTE';
    if (iso) data.applicantLocationRequirements = { '@type': 'Country', name: raw.country?.name };
  }
  if (iso && (!raw.remote || raw.city)) {
    data.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(raw.city ? { addressLocality: raw.city } : {}),
        addressCountry: iso,
      },
    };
  }

  if (raw.salary_status === 'disclosed' && (raw.salary_min != null || raw.salary_max != null)) {
    const value: Record<string, unknown> = { '@type': 'QuantitativeValue', unitText: SALARY_UNIT_MAP[raw.salary_period] ?? 'YEAR' };
    if (raw.salary_min != null && raw.salary_max != null && raw.salary_min !== raw.salary_max) {
      value.minValue = raw.salary_min;
      value.maxValue = raw.salary_max;
    } else {
      value.value = raw.salary_min ?? raw.salary_max;
    }
    data.baseSalary = { '@type': 'MonetaryAmount', currency: raw.salary_currency || 'USD', value };
  }

  return data;
}
