import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { isMeaningfulSalary } from '@/lib/listingCategories';
import { companyPath, recordApplication } from '@/lib/companies';
import { DirectListingBadge } from '@/components/common/DirectListingBadge';
import { isNewCompany, NewCompanyBadge } from '@/components/common/NewCompanyBadge';
import { usePersonalization } from '@/lib/personalization';
import { isLocalJobFor } from '@/lib/visaFit';
import { ArrowLeft, ArrowUpRight, Banknote, Briefcase, Building2, Calendar, Check, ChevronDown, FileText, Globe, GraduationCap, Landmark, Loader2, Mail, MapPin, Navigation, Phone, Plane, Share2, UserRound, Users, Zap } from 'lucide-react';
import type { View } from '@/types';
import type { Job } from '@/data/jobs';
import { jobs as curatedJobs } from '@/data/jobs';
import { HiringBriefCallout } from '@/components/briefs/HiringBriefCallout';
import { ApplyNudge } from '@/components/briefs/ApplyNudge';
import { OfferButton } from '@/components/briefs/OfferButton';
import { briefEligibility } from '@/lib/briefs';
import { fetchSponsoredJobById, fetchSponsoredJobByShortId, sponsoredJobToBoardJob, type SponsoredJob } from '@/lib/sponsoredJobs';
import { jobPath, parseJobPath } from '@/lib/jobUrl';
import { getGuestJobViewCount, markJobViewed } from '@/lib/viewedJobs';
import { useAuth } from '@/lib/auth';
import { displayJobCategory, isMeaningfulJobType } from '@/lib/jobCategories';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { useSeo } from '@/lib/seo';
import { purifyJobHtml, sanitizeJobHtml } from '@/lib/atsImport';
import { formatRelativeTime } from '@/lib/dates';
import { MultiCountryBadge } from '@/components/common/MultiCountryBadge';
import { EMPTY_FACTS, fetchJobFacts, isCurrentFacts, type JobContact, type StoredJobFacts } from '@/lib/jobFactsClient';
import { allCountries } from '@/data/allCountries';
import { ReportJobButton } from '@/components/jobs/ReportJobDialog';
import { JobInsights } from '@/components/jobs/JobInsights';
import { JobSignals } from '@/components/jobs/JobSignals';
import { JobProInsights } from '@/components/pro/JobProInsights';

type JobDetailPageProps = {
  id: string;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

export function JobDetailPage({ id, go, onAuth }: JobDetailPageProps) {
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [raw, setRaw] = useState<SponsoredJob | null>(null);
  const [copied, setCopied] = useState(false);
  // Set when Apply is clicked on a job without sponsorship; reset for each job.
  const [nudgeArmed, setNudgeArmed] = useState(false);
  useEffect(() => setNudgeArmed(false), [id]);
  const { session } = useAuth();
  const { profile: visitor } = usePersonalization();
  // Signed-out visitors: after 3 job views, invite them to create an account.
  const [guestViews, setGuestViews] = useState(0);
  useEffect(() => {
    if (!session) setGuestViews(getGuestJobViewCount());
  }, [id, session]);
  const showSignupInvite = !session && guestViews >= 3;

  // Description with the facts block, repeated copies, apply CTAs and
  // trailing contact lines stripped out (contact shown in its own box),
  // plus the structured facts read from the same text.
  // Both come from MadeVisa's detector on the server (job-facts function):
  // saved with the job, or computed on first view. Until they arrive the
  // description is shown as-is and the detail boxes show placeholders.
  const [stored, setStored] = useState<StoredJobFacts | null>(null);
  const [factsPending, setFactsPending] = useState(false);
  useEffect(() => {
    setStored(null);
    setFactsPending(false);
    if (!raw) return;
    if (isCurrentFacts(raw.facts)) {
      setStored(raw.facts);
      return;
    }
    // Older results (from a previous detector version) are shown right away
    // while the up-to-date ones are computed.
    if (raw.facts && (raw.facts as StoredJobFacts).facts) setStored(raw.facts as StoredJobFacts);
    let cancelled = false;
    setFactsPending(true);
    fetchJobFacts(raw.id).then((f) => {
      if (cancelled) return;
      if (f) setStored(f);
      setFactsPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [raw]);
  const cleaned = useMemo<{ html: string; contact: JobContact } | null>(() => {
    if (!job?.description) return null;
    if (stored) return { html: purifyJobHtml(stored.html), contact: stored.contact ?? {} };
    return { html: sanitizeJobHtml(job.description), contact: {} };
  }, [job, stored]);
  const detectedFacts = stored?.facts ?? null;

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
        setGuestViews(getGuestJobViewCount());
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
    description: job ? jobMetaDescription(job, location, cleaned?.html) : 'View this job listing on MadeVisa, including requirements and how to apply.',
    path: canonicalPath,
    noindex: job === null,
    // Generated per job by /api/og/job (see api/og/job.ts); crawlers get it via middleware.ts.
    ogImage: raw?.id ? `${window.location.origin}/api/og/job?id=${raw.id.slice(0, 8)}` : job?.imageUrl ?? undefined,
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
    // Always copy first, so the "Link copied" note is always true…
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked — the native share sheet below still works */
    }
    // …and on phones also open the native share sheet.
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: job?.title, url });
      } catch {
        /* user cancelled */
      }
    }
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
    // Removed, closed or mistyped link → friendly 404 with a way back to jobs.
    const companySlug = id.includes('/') ? id.split('/')[0] : null;
    return <NotFoundPage kind="job" go={go} onAuth={onAuth} companySlug={companySlug} />;
  }

  const SponsorIcon = job.publisherOrgType === 'government' ? Landmark : job.publisherOrgType === 'expert' ? UserRound : Building2;
  const detected = detectedFacts ?? EMPTY_FACTS;
  // Importers sometimes store placeholder values ("All", "Various") —
  // the source's own labeled fields are more accurate then.
  const rawCategory = isPlaceholder(job.category) || isCodeLike(job.category) ? detected.department : job.category;
  const category = isCodeLike(rawCategory) ? null : displayJobCategory({ title: job.title, category: rawCategory });
  const postedDate = pickPostedDate(job.postedDate, detected.postedAt);
  const postedLabel = postedDate ? formatRelativeTime(postedDate, '') : '';
  const sourcePlace = parseSourceLocation(detected.location);
  const cityOk = !isPlaceholder(job.city) && job.city !== 'Remote';
  const countryOk = !isPlaceholder(job.country);
  const placeLabel =
    (!cityOk || !countryOk) && sourcePlace
      ? sourcePlace.label
      : cityOk && countryOk && job.city !== job.country
        ? `${job.city}, ${job.country}`
        : cityOk
          ? job.city
          : countryOk
            ? job.country
            : 'Location on source';
  const flagCode = !countryOk && sourcePlace?.code ? sourcePlace.code : job.countryCode;
  const contact = cleaned?.contact ?? {};
  const hasSourceUrl = Boolean(job.url && job.url !== '#');
  const shareLabel = copied ? 'Link copied' : 'Share';

  // Every fact in the details box is either real data from the listing
  // or a link back to the original posting — never a guessed value or
  // a vague "Not specified".
  // Direct listings have no separate source page — their apply link is
  // the company's own form, so "See on source" would be misleading.
  const isDirect = job.sourceType === 'company_submitted';
  // While the server is still reading the description (first view only),
  // show a placeholder bar instead of a premature "See on source".
  const pendingBar = <span className="inline-block h-4 w-20 animate-pulse rounded bg-ink-100 align-middle" aria-label="Loading" />;
  const see = factsPending ? pendingBar : isDirect ? <span className="font-medium text-ink-400">Not mentioned</span> : <SourceLink url={hasSourceUrl ? job.url : null} />;
  // The place as the posting states it ("Chicago, Illinois, United States"), else the listing's own.
  const locationValue = sourcePlace?.label ?? (placeLabel !== 'Location on source' ? placeLabel : null);
  // Stored fields win; anything still missing is read from the
  // description itself ("8–12 years of experience", "$126,000—$136,000
  // CAD", "Work Type: Onsite", "unable to sponsor visas", ...).
  const salary = [job.salary, detected.compensation].find((v) => isMeaningfulSalary(v)) ?? null;
  const arrangement = job.workArrangement ?? detected.workArrangement ?? (job.remote ? 'remote' : null);
  const employmentType = isMeaningfulJobType(job.type) ? job.type : detected.employmentType;
  const visa = job.visaStatus ?? (job.visaSponsorship ? 'offered' : detected.visa);
  // Sponsorship offer next to Apply, on every open job. Jobs outside the
  // covered countries start the builder with a country picker.
  const offerEl = raw ? briefEligibility({ countryCode: raw.country?.iso_code ?? (countryOk ? job.countryCode : null), visa: visa ?? null, closed: Boolean(job.closed), fallback: 'DE' }) : null;
  // Already in your country (or free to work there): no visa, so no sponsorship offer.
  const localJob = isLocalJobFor(raw?.country?.iso_code ?? (countryOk ? job.countryCode : null), visitor);
  const offerOk = Boolean(offerEl?.ok) && !localJob;
  const offerCountry = offerEl?.ok && offerEl.picked ? offerEl.code : null;
  const details: { icon: typeof Briefcase; label: string; value: ReactNode }[] = [
    { icon: Banknote, label: 'Compensation', value: salary ? <span className="font-bold text-ink-950">{salary}</span> : see },
    {
      icon: MapPin,
      label: 'Remote',
      value:
        arrangement === 'remote' ? (
          'Yes'
        ) : arrangement === 'hybrid' ? (
          <WithDetail main="Hybrid" detail={detected.remoteDetail} />
        ) : arrangement === 'onsite' ? (
          'No — on-site'
        ) : (
          see
        ),
    },
    {
      icon: Briefcase,
      label: 'Employment type',
      value: employmentType ? (
        <WithDetail main={employmentType} detail={employmentDetail(employmentType, detected.schedule, null)} />
      ) : (
        // The Remote box already covers on-site/hybrid/remote.
        see
      ),
    },
    { icon: GraduationCap, label: 'Experience level', value: job.experienceLevel || detected.experience || see },
    {
      icon: Plane,
      label: 'Visa sponsorship',
      value: visa === 'offered' ? 'Offered' : visa === 'not_offered' ? 'Not offered' : see,
    },
    {
      icon: Navigation,
      label: 'Location',
      value: locationValue ? <span className="font-semibold text-ink-800">{locationValue}</span> : see,
    },
    {
      icon: FileText,
      label: 'Contract type',
      value: detected.contractTerm ? detected.contractTerm : see,
    },
  ];

  // Imported postings carry the date the company first published them.
  // Evergreen roles can be a year old and still open — say so, rather
  // than letting "Posted 1 year ago" read like a dead listing.
  const isImported = job.sourceType === 'company_careers';
  const postedAgeDays = postedDate ? (Date.now() - new Date(postedDate).getTime()) / 86_400_000 : 0;
  const stillHiring = isImported && postedAgeDays > 30;
  const stillHiringTitle = `Still listed on ${job.company}'s careers page${job.lastSeenAt ? ` (checked ${formatRelativeTime(job.lastSeenAt, '')})` : ''} — they're still looking.`;
  if (job.spotsAvailable != null) details.push({ icon: Users, label: 'Positions available', value: String(job.spotsAvailable) });
  // Only what the listing actually says — boxes it doesn't mention are left out
  // (while the description is still being read, placeholders show instead).
  const shownDetails = factsPending ? details : details.filter((d) => d.value !== see);

  // Taken down from the company's careers page: shown greyed for 24 h, no applying.
  const closed = Boolean(job.closed);
  const closedAgo = job.closedAt ? formatRelativeTime(job.closedAt, '').toLowerCase() : null;

  const applyButton = (extra = '') =>
    closed ? (
      <span className={`inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full bg-ink-200 px-7 py-3.5 text-sm font-bold text-ink-500 ${extra.includes('flex-1') ? 'flex-1 md:flex-none' : ''}`}>
        Closed
      </span>
    ) : (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // Signed-in users: remember this application so they can report the
        // outcome later — that's what builds company response statistics.
        if (raw?.publisher_id) recordApplication({ publisherId: raw.publisher_id, kind: 'job', listingId: raw.id, title: job.title });
        // No visa in the ad → offer the sponsorship document when they come back.
        if (offerOk && raw && visa !== 'offered') setNudgeArmed(true);
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${extra}`}
    >
      Apply
      <ArrowUpRight className="h-4 w-4" />
    </a>
    );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="jobs" />
      {offerOk && raw && <ApplyNudge jobId={raw.id} company={job.company} country={offerCountry} armed={nudgeArmed} />}

      <section className={`${closed ? 'bg-ink-500' : 'bg-brand-700'} text-white transition-colors`}>
        <div className="mx-auto max-w-4xl px-5 pb-10 pt-6 sm:px-8 sm:pb-14 sm:pt-8">
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
            className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All jobs
          </button>

          <div className="mt-8 flex items-center gap-3 sm:mt-10">
            <HeaderLogo job={job} SponsorIcon={SponsorIcon} />
            <div className="min-w-0">
              {raw?.publisher_id ? (
                <a
                  href={companyPath({ id: raw.publisher_id, name: job.company })}
                  onClick={(e) => {
                    e.preventDefault();
                    window.history.pushState({}, '', companyPath({ id: raw.publisher_id, name: job.company }));
                    window.dispatchEvent(new PopStateEvent('popstate'));
                    window.scrollTo({ top: 0 });
                  }}
                  className="block truncate text-base font-bold underline decoration-white/30 underline-offset-4 hover:decoration-white sm:text-lg"
                  title={`See ${job.company}'s hiring activity and response rate`}
                >
                  {job.company}
                </a>
              ) : (
                <p className="truncate text-base font-bold sm:text-lg">{job.company}</p>
              )}
              {(job.sourceType === 'company_submitted' || isNewCompany(job.companyAddedAt)) && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {job.sourceType === 'company_submitted' && <DirectListingBadge company={job.company} />}
                  <NewCompanyBadge addedAt={job.companyAddedAt} variant="hero" />
                </div>
              )}
            </div>
          </div>

          {/* Title and details full width; actions on their own row below, so a
              long button row never squeezes the title into one word per line. */}
          <div className="mt-6 flex flex-col gap-6">
            <div className="min-w-0 max-w-full">
              {closed && (
                <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider ring-1 ring-white/30">
                  Closed{closedAgo ? ` ${closedAgo}` : ''}
                </p>
              )}
              <h1 className={`break-words font-title text-3xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-[1.1] ${closed ? 'text-white/70' : ''}`}>{job.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
                {arrangement && (
                  <span className="flex items-center gap-1.5 font-semibold text-white">
                    <MapPin className="h-4 w-4" />
                    {arrangement === 'remote' ? 'Remote' : arrangement === 'hybrid' ? 'Hybrid' : 'On-site'}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <CircleFlag countryCode={flagCode} label={placeLabel} size={16} />
                  {placeLabel}
                </span>
                {postedLabel && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    Posted {postedLabel}
                    {isImported && (
                      <>
                        {' '}on <strong className="font-bold text-white">{job.company}</strong>
                      </>
                    )}
                  </span>
                )}
                {postedDate && !job.closed && postedAgeDays >= 0 && postedAgeDays < 1 && (
                  <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
                    <Zap className="h-3 w-3 fill-current" />
                    Be an early applicant
                  </span>
                )}
                {stillHiring && (
                  <span title={stillHiringTitle} className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/30">
                    {job.company} is still hiring
                  </span>
                )}
              </div>
              {!closed && (
                <JobSignals
                  variant="hero"
                  publisherId={raw?.publisher_id ?? job.publisherId}
                  company={job.company}
                  countryCode={job.countryCode}
                  visaOffered={job.visaStatus === 'offered' || job.visaSponsorship}
                />
              )}
              <ContactBox contact={contact} />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {applyButton('flex-1 bg-white text-brand-700 shadow-sm hover:bg-brand-50 focus-visible:outline-white md:flex-none')}
              {offerOk && raw && <OfferButton jobId={raw.id} variant="hero" country={offerCountry} onAuth={onAuth} />}
              <span className="relative shrink-0">
                <button
                  onClick={share}
                  aria-label={shareLabel}
                  className="grid h-[52px] w-[52px] place-items-center rounded-full border border-white/40 text-white transition hover:bg-white/10"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                </button>
                {copied && (
                  <span role="status" className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-700 shadow-sm">
                    Link copied
                  </span>
                )}
              </span>
            </div>
          </div>

          {showSignupInvite && (
            <div className="mt-6 flex flex-col gap-3 rounded-xl bg-white/10 p-4 ring-1 ring-white/25 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">Keep track of your job search</p>
                <p className="mt-0.5 text-xs leading-5 text-white/80">
                  You've looked at {guestViews} jobs. Create a free account to track the jobs you apply to and see how
                  fast companies respond.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => onAuth?.('register')} className="rounded-full bg-white px-4 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50">
                  Create free account
                </button>
                <button onClick={() => onAuth?.('login')} className="rounded-full px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
                  Sign in
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto flex max-w-4xl flex-col px-5 py-8 sm:px-8 sm:py-10 md:block">
        {raw && !localJob && !closed && (
          // Mobile: the full section is long, so it sits at the end of the page and this link jumps there.
          <a
            href="#get-sponsored"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('get-sponsored')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="-mt-2 mb-4 inline-flex items-center gap-1.5 self-start text-[15px] font-bold text-brand-700 underline decoration-brand-300 decoration-2 underline-offset-4 md:hidden"
          >
            <Plane className="h-4 w-4" /> Get sponsored for this job
          </a>
        )}
        {raw && !localJob && (
          <div id="get-sponsored" className="order-last mt-6 scroll-mt-24 md:order-none md:-mt-4 md:mb-6">
          <HiringBriefCallout
            jobId={raw.id}
            publisherId={raw.publisher_id ?? null}
            jobTitle={job.title}
            companyName={job.company}
            jobFunction={raw.job_function ?? null}
            jobCity={cityOk ? job.city : null}
            countryCode={raw.country?.iso_code ?? (countryOk ? job.countryCode : null)}
            visa={visa ?? null}
            closed={closed}
            onAuth={onAuth}
          />
          </div>
        )}
        {closed && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-ink-200 bg-white p-4 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm leading-6 text-ink-700">
              <strong className="text-ink-950">This job is closed.</strong> {job.company} took it down from their careers page, so it can’t be applied for any more. It will
              disappear from MadeVisa within a day.
            </p>
            <a
              href={`/jobs?q=${encodeURIComponent(job.company)}`}
              className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-bold text-white hover:bg-brand-700"
            >
              Open jobs at {job.company}
            </a>
          </div>
        )}
        <div className={`border border-ink-200 bg-white p-6 sm:p-8 ${closed ? 'text-ink-500 opacity-70 grayscale' : ''}`}>
          {(category || job.visaSponsorship || (job.additionalLocations?.length ?? 0) > 1) && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {category && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">{category}</span>}
              {job.visaSponsorship && <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">Visa sponsorship</span>}
              <MultiCountryBadge officeNames={job.additionalLocations} />
            </div>
          )}

          {shownDetails.length > 0 && (
            <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 sm:grid-cols-3">
              {shownDetails.map((d) => (
                <InfoRow key={d.label} icon={d.icon} label={d.label} value={d.value} />
              ))}
            </div>
          )}

          {cleaned?.html && <CollapsibleDescription html={cleaned.html} />}

          {job.requirements && (
            <div className="mt-6 rounded-lg bg-ink-50 p-4">
              <p className="text-xs font-bold text-ink-500">Requirements &amp; limits</p>
              <p className="mt-1.5 text-sm leading-6 text-ink-700">{job.requirements}</p>
            </div>
          )}

          {job.benefits && (
            <div className="mt-4 rounded-lg bg-emerald-50/60 p-4">
              <p className="text-xs font-bold text-emerald-700">Benefits</p>
              <p className="mt-1.5 text-sm leading-6 text-ink-700">{job.benefits}</p>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-4 border-t border-ink-100 pt-6 md:flex-row md:items-center md:justify-between md:gap-8">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-500">{job.company}</p>
              <p className="mt-0.5 font-title text-lg font-bold leading-snug text-ink-950">{job.title}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {applyButton('flex-1 bg-brand-600 text-white shadow-soft-lg hover:bg-brand-700 focus-visible:outline-brand-600 md:flex-none')}
              {offerOk && raw && <OfferButton jobId={raw.id} variant="body" country={offerCountry} onAuth={onAuth} />}
              <span className="relative shrink-0">
                <button
                  onClick={share}
                  aria-label={shareLabel}
                  className="grid h-[52px] w-[52px] place-items-center rounded-full border border-ink-200 text-ink-700 transition hover:bg-ink-50"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
                </button>
                {copied && (
                  <span role="status" className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Link copied
                  </span>
                )}
              </span>
            </div>
          </div>

          {job.sourceType === 'company_careers' && (
            <p className="mt-4 text-xs leading-5 text-ink-400">
              Added by MadeVisa from the company&apos;s public careers page. Availability may change on the original source.
            </p>
          )}
        </div>


        {raw?.publisher_id && (
          <JobInsights
            publisherId={raw.publisher_id}
            company={job.company}
            listing={{ id: raw.id, title: job.title, kind: 'job' }}
            onOpenTracking={() => {
              window.history.pushState({}, '', `/profile?track=${raw.id}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
              window.scrollTo({ top: 0 });
            }}
            onSignUp={() => onAuth?.('register')}
          />
        )}

        {raw && !closed && (
          <JobProInsights
            publisherId={raw.publisher_id}
            company={job.company}
            title={job.title}
            department={raw.job_function}
            countryCode={raw.country?.iso_code ?? job.countryCode}
            countryName={raw.country?.name ?? job.country}
          />
        )}

        {raw && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-ink-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-ink-500">
              <strong className="text-ink-700">We’re a new platform</strong> — still improving how job descriptions read and adding more details. Something wrong or missing? Let us know.
            </p>
            <ReportJobButton jobId={raw.id} className="shrink-0 self-start sm:self-auto" />
          </div>
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function HeaderLogo({ job, SponsorIcon }: { job: Job; SponsorIcon: typeof Building2 }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-2 shadow-sm sm:h-16 sm:w-16">
      {job.imageUrl && !failed ? (
        <img src={job.imageUrl} alt={`${job.company} logo`} onError={() => setFailed(true)} className="h-full w-full object-contain" />
      ) : job.publisherOrgType && job.publisherOrgType !== 'company' ? (
        <SponsorIcon className="h-7 w-7 text-brand-400" />
      ) : (
        <CompanyLogo name={job.company} size={44} />
      )}
    </div>
  );
}

/** "Not mentioned · Source ↗" — the detail isn't in the posting we have; the original may say more. */
function SourceLink({ url }: { url: string | null }) {
  if (!url) return <span className="font-medium text-ink-400">Not mentioned</span>;
  return (
    <span className="font-medium text-ink-400">
      Not mentioned ·{' '}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700"
      >
        Source
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}

/** Internal codes used as a category ("SW Eng - Applications-674"). */
function isCodeLike(v: string | null | undefined): boolean {
  return Boolean(v && (/[-_ ]\d{2,}$|^\d+$|\b[A-Z]{1,4}\d{2,}\b|\d{3,}/.test(v.trim())));
}

const COLLAPSED_HEIGHT = 360;

/** Long descriptions start clipped with a fade and a "Read more" toggle; short ones show in full. */
function CollapsibleDescription({ html }: { html: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isLong, setIsLong] = useState(false);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // Only collapse when there's a meaningful amount hidden — clipping
    // off two lines behind a button is more annoying than helpful.
    const measure = () => setIsLong(el.scrollHeight > COLLAPSED_HEIGHT + 120);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html]);

  const collapsed = isLong && !expanded;

  return (
    <div ref={wrapRef} className="mt-7 scroll-mt-24">
      <h2 className="text-base font-bold text-ink-950">About the role</h2>
      <div className="relative mt-2">
        <div
          ref={contentRef}
          id="job-description"
          style={collapsed ? { maxHeight: COLLAPSED_HEIGHT, overflow: 'hidden' } : undefined}
          className="prose-job text-sm leading-6 text-ink-600 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink-950 [&_h2]:first:mt-0 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-ink-900 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_strong]:font-bold [&_strong]:text-ink-800 [&_a]:break-words [&_a]:text-brand-600 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {collapsed && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-white/0 via-white/80 to-white" />}
      </div>
      {isLong && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="job-description"
          onClick={() => {
            if (expanded) wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setExpanded((v) => !v);
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition hover:border-brand-300 hover:text-brand-700"
        >
          {expanded ? 'Show less' : 'Read more'}
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}

/** Main value with a smaller qualifier under it ("Hybrid" / "Up to 20% remote"). */
function WithDetail({ main, detail }: { main: string; detail: string | null }) {
  return (
    <>
      {main}
      {detail && <span className="mt-0.5 block text-xs font-medium text-ink-500">{detail}</span>}
    </>
  );
}

/** "Full-time · Fixed-term" under the employment type, skipping whatever the type already says. */
function employmentDetail(type: string, schedule: string | null, term: string | null): string | null {
  const t = type.toLowerCase().replace(/[^a-z]/g, '');
  const parts = [schedule, term].filter((p): p is string => Boolean(p) && !t.includes(p!.toLowerCase().replace(/[^a-z]/g, '')));
  return parts.length ? parts.join(' · ') : null;
}

/** Contact details the company printed in the description (moved out of the text). */
function ContactBox({ contact }: { contact: JobContact }) {
  const rows = [
    contact.email && { icon: Mail, text: contact.email, href: `mailto:${contact.email}` },
    contact.phone && { icon: Phone, text: contact.phone, href: `tel:${contact.phone.replace(/[^\d+]/g, '')}` },
    contact.website && { icon: Globe, text: contact.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), href: contact.website },
  ].filter(Boolean) as { icon: typeof Mail; text: string; href: string }[];
  if (!rows.length) return null;
  return (
    <div className="mt-5 flex flex-col gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm ring-1 ring-inset ring-white/20 sm:inline-flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
      <span className="text-xs font-semibold text-white/70">{contact.name ? `Contact: ${contact.name}` : 'Contact'}</span>
      {rows.map(({ icon: Icon, text, href }) => (
        <a
          key={href}
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="flex min-w-0 items-center gap-1.5 font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
        >
          <Icon className="h-4 w-4 shrink-0 text-white/80" />
          <span className="break-all">{text}</span>
        </a>
      ))}
    </div>
  );
}

const PLACEHOLDER_RE =
  /^(?:all|any|various|multiple(?: locations)?|n\/?a|none|other|-|–|tbd|tbc|location on source|(?:more |advanced )?search(?: options)?|more search options|filters?|select(?: a)? location|view all|see all|show more|loading\.*)$/i;

function isPlaceholder(value: string | null | undefined): boolean {
  return !value || PLACEHOLDER_RE.test(value.trim());
}

/** "Osnabrück, DE" → { label: "Osnabrück, Germany", code: "DE" }. */
function parseSourceLocation(raw: string | null | undefined): { label: string; code: string | null } | null {
  if (!raw || isPlaceholder(raw)) return null;
  const parts = raw.split(',').map((p) => p.trim()).filter((p) => p && !/^[\d\s-]{3,10}$/.test(p));
  const last = parts[parts.length - 1] ?? '';
  const country = allCountries.find((c) => c.code === last.toUpperCase() && last.length === 2) ?? allCountries.find((c) => c.name.toLowerCase() === last.toLowerCase());
  if (country && parts.length > 1) return { label: [...parts.slice(0, -1), country.name].join(', '), code: country.code };
  return { label: raw.trim(), code: country?.code ?? null };
}

/** The date printed on the company's page wins when the stored one is missing or clearly different (e.g. the import date). */
function pickPostedDate(stored: string | null | undefined, printed: string | null): string | null {
  if (!stored) return printed;
  if (!printed) return stored;
  const diffDays = Math.abs(new Date(stored).getTime() - new Date(printed).getTime()) / 86_400_000;
  return diffDays > 2 ? printed : stored;
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-ink-50 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div className="min-w-0">
        <p className="text-[11px] text-ink-400">{label}</p>
        <div className="break-words text-sm font-semibold text-ink-800">{value}</div>
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
function jobMetaDescription(job: Job, location: string, cleanedHtml?: string | null): string {
  const facts = [job.type, job.salary].filter(Boolean).join(' · ');
  let text = `${job.title} at ${job.company}${location ? ` in ${location}` : ''}.${facts ? ` ${facts}.` : ''}`;
  const body = cleanedHtml ? stripHtml(cleanedHtml) : job.description ? stripHtml(job.description) : '';
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
