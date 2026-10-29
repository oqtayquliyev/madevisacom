import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { isMeaningfulSalary } from '@/lib/listingCategories';
import { companyPath, recordApplication } from '@/lib/companies';
import { DirectListingBadge } from '@/components/common/DirectListingBadge';
import { NewCompanyBadge } from '@/components/common/NewCompanyBadge';
import { usePersonalization } from '@/lib/personalization';
import { isLocalJobFor } from '@/lib/visaFit';
import { ArrowLeft, ArrowRight, ArrowUpRight, Banknote, Lock, Briefcase, Building2,  Check, ChevronDown, FileText, Globe, GraduationCap, Landmark, Loader2, Mail, MapPin, Navigation, Phone, Plane, Share2, UserRound, Users, Zap } from 'lucide-react';
import type { View } from '@/types';
import type { Job } from '@/data/jobs';
import { jobs as curatedJobs } from '@/data/jobs';
import { MatchButton } from '@/components/cv/MatchButton';
import { JobMatchSheet } from '@/components/jobs/JobEdgeBlock';
import { rememberAuthIntent } from '@/lib/authIntent';
import { SponsorDocPreviewButton } from '@/components/jobs/SponsorDocPreview';
import { maskEmailShort, pingJobView } from '@/lib/conversion';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { Paywall, type PaywallReason } from '@/components/pro/Paywall';
import { fetchApplyLink } from '@/lib/applyLink';
import { jobReality } from '@/lib/jobReality';
import { RealityPill, ScamWarning } from '@/components/jobs/JobReality';
import { peekJobPreview } from '@/lib/jobPreview';
import { useMembership } from '@/lib/plans';
import { MatchPanel } from '@/components/cv/MatchPanel';
import { SaveJobButton } from '@/components/billing/SavedJobs';
import { ApplySheet } from '@/components/cv/ApplySheet';
import { OtherMatchesPopup, RecommendedJobs } from '@/components/cv/TopMatches';
import { useJobMatch } from '@/lib/cv/checks';
import type { JobInput } from '@/lib/cv/jobProfile';
import { SalaryCheck } from '@/components/jobs/SalaryCheck';
import { AlertSignup } from '@/components/jobs/AlertSignup';
import { SponsorRecordPill } from '@/components/companies/SponsorProof';
import { briefEligibility } from '@/lib/briefs';
import { fetchSponsoredJobById, fetchSponsoredJobByShortId, sponsoredJobToBoardJob, type SponsoredJob } from '@/lib/sponsoredJobs';
import { jobPath, parseJobPath } from '@/lib/jobUrl';
import { markJobViewed } from '@/lib/viewedJobs';
import { useAuth } from '@/lib/auth';
import { displayJobCategory, isMeaningfulJobType } from '@/lib/jobCategories';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { useSeo } from '@/lib/seo';
import { jobTitleMeta, titleLocation } from '@/lib/seoMeta';
import { purifyJobHtml, sanitizeJobHtml } from '@/lib/atsImport';
import { formatRelativeTime } from '@/lib/dates';
import { MultiCountryBadge } from '@/components/common/MultiCountryBadge';
import { EMPTY_FACTS, fetchJobFacts, isCurrentFacts, type JobContact, type StoredJobFacts } from '@/lib/jobFactsClient';
import { allCountries } from '@/data/allCountries';
import { ReportJobButton } from '@/components/jobs/ReportJobDialog';
import { JobSignals } from '@/components/jobs/JobSignals';

type JobDetailPageProps = {
  id: string;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  /** Shown inside the job popup over the list (src/components/jobs/JobModal.tsx): no site header or footer, and "All jobs" closes it. */
  embedded?: boolean;
  onClose?: () => void;
  /** In the jobs list's right-hand pane (desktop): no "All jobs" link. */
  pane?: boolean;
  /** Set the page title, canonical and job data for search engines (off for the list's preview pane). */
  seo?: boolean;
};

export function JobDetailPage({ id, go, onAuth, embedded = false, onClose, pane = false, seo = true }: JobDetailPageProps) {
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const seoRef = useRef(seo);
  seoRef.current = seo;
  const [raw, setRaw] = useState<SponsoredJob | null>(null);
  const [copied, setCopied] = useState(false);
  // Set when Apply is clicked — arms the "Your application" sheet; reset for each job.
  const [applied, setApplied] = useState(false);
  useEffect(() => setApplied(false), [id]);
  const { session, loading: authLoading } = useAuth();
  // Every job is open to everyone. Applying needs a free account; CV match, "Your edge",
  // sponsorship documents and the rest are the membership.
  const { member, ready: memberReady } = useMembership();
  // Signed out: any button (Apply, Check your match, Save, …) opens the sign-up popup here, on this
  // job. Once they're in they stay on this job, and what they pressed carries on.
  const [gate, setGate] = useState<'login' | 'register' | null>(null);
  const pending = useRef<PaywallReason | null>(null);
  const authHere = (page: 'login' | 'register' = 'register') => {
    // Google sign-in leaves the site: it comes back to this job (src/components/auth/AfterSignIn.tsx).
    rememberAuthIntent({ next: window.location.pathname + window.location.search });
    setGate(page);
  };
  useEffect(() => {
    if (session) setGate(null);
  }, [session]);
  // Today's views of this job (the counts in Admin and on the membership card).
  useEffect(() => {
    if (raw?.id) void pingJobView(raw.id);
  }, [raw?.id]);
  // Which paid feature they reached for: the membership card says so.
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);
  useEffect(() => setPaywall(null), [id]);
  // Members: "Check your match" opens the match report and "Your edge" in a popup.
  const [matchOpen, setMatchOpen] = useState(false);
  // Opened from a notification ("Offer …"): the sponsorship document preview opens by itself.
  const wantDocPreview = useMemo(() => new URLSearchParams(window.location.search).get('doc') === '1', [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setMatchOpen(false), [id]);
  // Signed in after pressing a paid feature: members get it, everyone else the membership card.
  useEffect(() => {
    if (!session || !memberReady || !pending.current) return;
    const r = pending.current;
    pending.current = null;
    if (!member) setPaywall(r);
    else if (r === 'match' || r === 'edge') setMatchOpen(true);
  }, [session, memberReady, member]);
  // The company's apply address comes from the server, for any signed-in account
  // (src/lib/applyLink.ts); signed-out visitors are asked to sign up first.
  const [applyUrl, setApplyUrl] = useState<string | null>(null);
  useEffect(() => {
    setApplyUrl(null);
    if (!raw?.id || !session) return;
    let alive = true;
    void fetchApplyLink(raw.id).then(async (r) => {
      if (!alive) return;
      if (r.kind === 'open') setApplyUrl(r.url);
      else {
        // Before migration 20261231160000 the server still keeps it to members: signed-in accounts read it directly.
        const full = await fetchSponsoredJobById(raw.id, { private: true });
        if (alive) setApplyUrl(full?.application_url || full?.official_url || null);
      }
    });
    return () => {
      alive = false;
    };
  }, [raw?.id, session]);
  // Opened from the list: its title, company and place show at once while the full ad loads.
  const preview = useMemo(() => peekJobPreview(window.location.pathname), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { profile: visitor } = usePersonalization();

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

  // CV match: the ad as the matcher reads it (title + the cleaned description).
  const matchJob = useMemo<JobInput | null>(() => {
    const description = cleaned?.html ?? '';
    if (!job || !description) return null;
    return { title: job.title, description, department: raw?.job_function ?? job.category ?? null, experienceHint: job.experienceLevel || detectedFacts?.experience || null };
  }, [job, cleaned, raw, detectedFacts]);
  const matchKey = raw?.id ?? job?.id ?? null;
  const match = useJobMatch(matchKey, matchJob);

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
      // Previewed beside the list without being picked: not "viewed", and the list keeps its address.
      if (board && seoRef.current) {
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
    enabled: seo,
    // useSeo appends " | MadeVisa" → "Title at Company, Location | MadeVisa"
    title: job ? jobTitleMeta({ title: job.title, company: job.company, location: titleLocation(location), visa: Boolean(job.visaSponsorship || job.visaStatus === 'offered') }) : 'Job',
    description: job ? jobMetaDescription(job, location, cleaned?.html) : 'View this job listing on MadeVisa, including requirements and how to apply.',
    path: canonicalPath,
    // Closed jobs stay reachable for people who saved the link, but leave the index
    // (the server also answers 410 for them).
    noindex: job === null || Boolean(job?.closed),
    // Generated per job by /api/og/job (see api/og/job.ts); crawlers get it via middleware.ts.
    ogImage: raw?.id ? `${window.location.origin}/api/og/job?id=${raw.id.slice(0, 8)}` : job?.imageUrl ?? undefined,
  });

  // JobPosting structured data — individual job pages only (never the
  // /jobs list), built strictly from fields the job actually has.
  useEffect(() => {
    if (!seo) return;
    if (!job || !raw || job.closed) {
      document.getElementById('jobposting-jsonld')?.remove();
      return;
    }
    const data = buildJobPostingJsonLd(job, raw, canonicalPath);
    if (!data) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'jobposting-jsonld';
    script.text = JSON.stringify(data).replace(/</g, '\\u003c');
    document.getElementById('jobposting-jsonld')?.remove();
    document.head.appendChild(script);
    return () => script.remove();
  }, [job, raw, canonicalPath, seo]);

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
    if (preview) return <JobPreviewShell job={preview} go={go} onAuth={onAuth} embedded={embedded} />;
    return (
      <div className={`${embedded ? '' : 'min-h-screen'} bg-[#f8fafc]`}>
        {!embedded && <LandingHeader go={go} onAuth={onAuth} active="jobs" />}
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
  // Curated jobs (not from the database) carry their link; database jobs get it from the server.
  const sourceUrl = raw ? applyUrl : job.url && job.url !== '#' ? job.url : null;
  const hasSourceUrl = Boolean(session) && Boolean(sourceUrl);
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
  const see = factsPending ? pendingBar : isDirect ? <span className="font-medium text-ink-400">Not mentioned</span> : <SourceLink url={hasSourceUrl ? sourceUrl : null} />;
  // The place as the posting states it ("Chicago, Illinois, United States"), else the listing's own.
  const locationValue = sourcePlace?.label ?? (placeLabel !== 'Location on source' ? placeLabel : null);
  // Stored fields win; anything still missing is read from the
  // description itself ("8–12 years of experience", "$126,000—$136,000
  // CAD", "Work Type: Onsite", "unable to sponsor visas", ...).
  const salary = [job.salary, detected.compensation].find((v) => isMeaningfulSalary(v)) ?? null;
  const arrangement = job.workArrangement ?? detected.workArrangement ?? (job.remote ? 'remote' : null);
  const employmentType = isMeaningfulJobType(job.type) ? job.type : detected.employmentType;
  const visa = job.visaStatus ?? (job.visaSponsorship ? 'offered' : detected.visa);
  // Sponsorship document: offered inside "Your application" (the match
  // panel and the sheet shown at Apply), no longer as its own button. Jobs
  // outside the covered countries start the builder with a country picker.
  const offerEl = raw ? briefEligibility({ countryCode: raw.country?.iso_code ?? (countryOk ? job.countryCode : null), visa: visa ?? null, closed: Boolean(job.closed), fallback: 'DE' }) : null;
  // Already in your country (or free to work there): no visa, so no sponsorship document.
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
  const homeCode = (visitor.citizenship ?? visitor.currentLocation ?? '').toUpperCase() || null;
  const destCode = (raw?.country?.iso_code ?? (countryOk ? job.countryCode : null))?.toUpperCase() || null;
  const docFor = offerOk && raw ? { jobId: raw.id, country: offerCountry, dest: offerEl?.ok && !offerEl.picked ? offerEl.code : null, visaOffered: visa === 'offered' } : null;

  // Is this job real, live and safe? (src/lib/jobReality.ts)
  const reality = jobReality({ sourceType: job.sourceType ?? null, lastSeenAt: job.lastSeenAt, postedAt: postedDate, closed, text: cleaned?.html ?? job.description ?? null, contactEmail: contact.email ?? null, company: job.company });

  // Signed out: Apply and the recruiter's contact ask for a free account first.
  const locked = !closed && !authLoading && !session;
  const askSignup = () => authHere('register');
  // Paid features (CV match, "Your edge", sponsorship documents): signed out → sign up, then the
  // membership card; free account → the membership card.
  const isMember = memberReady && member;
  const needPaid = (reason: PaywallReason) => () => {
    if (session) return setPaywall(reason);
    pending.current = reason;
    authHere('register');
  };
  const pressApply = locked ? askSignup : undefined;
  const openMatch = () => {
    setMatchOpen(true);
    if (match.cv && !match.result && !match.busy) void match.check();
  };
  const matchClick = isMember ? openMatch : needPaid('match');
  const applyButton = (extra = '') =>
    closed ? (
      <span className={`inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full bg-ink-200 px-7 py-3.5 text-sm font-bold text-ink-500 ${extra.includes('flex-1') ? 'flex-1 md:flex-none' : ''}`}>
        Closed
      </span>
    ) : locked ? (
      <button
        type="button"
        onClick={pressApply}
        aria-label="Apply (free account)"
        className={`inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${extra}`}
      >
        Apply
        <ArrowUpRight className="h-4 w-4" />
      </button>
    ) : (
    <a
      href={sourceUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!sourceUrl || undefined}
      onClick={(e) => {
        // The address is still on its way from the server: nothing to open yet.
        if (!sourceUrl) {
          e.preventDefault();
          return;
        }
        // Signed-in users: remember this application so they can report the
        // outcome later — that's what builds company response statistics.
        if (raw?.publisher_id) recordApplication({ publisherId: raw.publisher_id, kind: 'job', listingId: raw.id, title: job.title });
        // When they come back to this tab: what they sent, and what's missing from it.
        setApplied(true);
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${extra}`}
    >
      Apply
      <ArrowUpRight className="h-4 w-4" />
    </a>
    );

  return (
    <div className={`${embedded ? '' : 'min-h-screen'} bg-white text-ink-900`}>
      {!embedded && <LandingHeader go={go} onAuth={onAuth} active="jobs" />}
      <AuthDialog
        open={Boolean(gate) && !session}
        initial={gate ?? 'register'}
        onClose={() => {
          setGate(null);
          pending.current = null;
        }}
      />
      {matchOpen && isMember && (
        <JobMatchSheet
          onClose={() => setMatchOpen(false)}
          title={job.title}
          company={job.company}
          match={matchJob && !closed ? <MatchPanel match={match} jobId={matchKey} jobTitle={job.title} company={job.company} doc={docFor} onAuth={authHere} /> : null}
          input={{
            publisherId: raw?.publisher_id ?? job.publisherId,
            company: job.company,
            dest: raw?.country?.iso_code ?? (countryOk ? job.countryCode : null),
            home: visitor.citizenship ?? visitor.currentLocation,
            needsVisa: !localJob,
            salary: raw?.salary_status === 'disclosed' ? { min: raw.salary_min, max: raw.salary_max, currency: raw.salary_currency, period: raw.salary_period } : { min: null, max: null, currency: null, period: null },
            visaOffered: visa === 'offered',
            ageDays: postedDate ? postedAgeDays : null,
            match: match.result?.score ?? null,
          }}
        />
      )}
      {paywall && (
        <Paywall
          job={{ title: job.title, company: job.company, category: raw?.job_function ?? job.category }}
          reason={paywall}
          source={`job_${paywall}`}
          onClose={() => setPaywall(null)}
        />
      )}
      {matchKey && !closed && member && <ApplySheet jobKey={matchKey} company={job.company} match={match} doc={docFor} armed={applied} onAuth={authHere} />}
      {/* One of your best matches? A small card in the corner lists the others. Not while the apply sheet is up. */}
      {matchKey && !applied && isMember && <OtherMatchesPopup currentId={matchKey} onAuth={authHere} />}

      {/* A quiet, portfolio-style header: logo, the title, the facts in columns, the actions. */}
      <section className="bg-white text-ink-950">
        <div className={`mx-auto max-w-[760px] px-5 pb-8 sm:px-8 ${pane ? 'pt-8 sm:pt-10' : embedded ? 'pt-16 sm:pt-20' : 'pt-8 sm:pt-12'}`}>
          <button
            onClick={() => {
              // Back to the list as it was (filters in the URL); a fresh tab goes to /jobs.
              if (embedded && onClose) return onClose();
              if (window.history.length > 1) window.history.back();
              else go('jobs');
            }}
            className={`${pane || embedded ? 'hidden' : 'flex'} mb-8 items-center gap-1.5 text-[13px] font-medium text-ink-400 hover:text-ink-800`}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All jobs
          </button>

          <HeaderLogo job={job} SponsorIcon={SponsorIcon} />

          {closed && (
            <p className="mt-6 inline-flex items-center rounded-full bg-ink-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink-600">
              Closed{closedAgo ? ` ${closedAgo}` : ''}
            </p>
          )}
          <h1 className={`mt-6 break-words text-[30px] font-normal leading-[1.12] tracking-[-0.02em] sm:text-[42px] ${closed ? 'text-ink-400' : 'text-ink-950'}`}>{job.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[15px] text-ink-500">
            {raw?.publisher_id ? (
              <a
                href={companyPath({ id: raw.publisher_id, name: job.company })}
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', companyPath({ id: raw.publisher_id, name: job.company }));
                  window.dispatchEvent(new PopStateEvent('popstate'));
                  window.scrollTo({ top: 0 });
                }}
                className="font-medium text-ink-800 underline decoration-ink-200 underline-offset-4 hover:decoration-ink-800"
                title={`See ${job.company}'s hiring activity and response rate`}
              >
                {job.company}
              </a>
            ) : (
              <span className="font-medium text-ink-800">{job.company}</span>
            )}
            {job.sourceType === 'company_submitted' && <DirectListingBadge company={job.company} />}
            <NewCompanyBadge addedAt={job.companyAddedAt} />
            <SponsorRecordPill publisherId={raw?.publisher_id} />
            {stillHiring && <span title={stillHiringTitle}>· still hiring</span>}
          </div>

          {/* The facts, in columns (only what the ad states). */}
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
            <Fact label="Location">
              <span className="flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">
                  <CircleFlag countryCode={flagCode} label={placeLabel} size={15} />
                </span>
                <span>
                  {placeLabel}
                  {arrangement && <span className="block text-ink-500">{arrangement === 'remote' ? 'Remote' : arrangement === 'hybrid' ? 'Hybrid' : 'On-site'}</span>}
                </span>
              </span>
            </Fact>
            {postedLabel && (
              <Fact label="Posted">
                {postedLabel}
                {postedDate && !job.closed && postedAgeDays >= 0 && postedAgeDays < 1 && (
                  <span className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-brand-700">
                    <Zap className="h-3 w-3 fill-current" /> Early applicant
                  </span>
                )}
              </Fact>
            )}
            {shownDetails
              .filter((d) => d.label !== 'Location' && d.label !== 'Remote')
              .map((d) => (
                <Fact key={d.label} label={d.label}>
                  {d.value}
                </Fact>
              ))}
          </dl>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            {applyButton('flex-1 bg-[#FFD60A] text-ink-950 hover:bg-[#FFE34D] focus-visible:outline-ink-950 sm:flex-none')}
            {matchJob && !closed && <MatchButton match={match} variant="body" onLocked={matchClick} />}
            {docFor && !closed && (
              <SponsorDocPreviewButton
                light
                defaultOpen={wantDocPreview}
                jobId={docFor.jobId}
                title={job.title}
                company={job.company}
                dest={raw?.country?.iso_code ?? (countryOk ? job.countryCode ?? null : null)}
                country={docFor.country}
                onUnlock={isMember ? undefined : needPaid('doc')}
                onAuth={() => authHere('register')}
              />
            )}
            <span className="relative shrink-0">
              <button
                onClick={share}
                aria-label={shareLabel}
                className="grid h-[52px] w-[52px] place-items-center rounded-full text-ink-700 ring-1 ring-inset ring-ink-200 transition hover:bg-ink-50"
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

          {!closed && (
            <div className="mt-6 space-y-1">
              <JobSignals
                publisherId={raw?.publisher_id ?? job.publisherId}
                company={job.company}
                countryCode={job.countryCode}
                visaOffered={job.visaStatus === 'offered' || job.visaSponsorship}
              />
              <RealityPill reality={reality} />
            </div>
          )}
          <ContactBox
            contact={isMember ? contact : { ...contact, email: maskEmailShort(contact.email) ?? undefined, phone: undefined, website: undefined }}
            locked={!isMember}
            onUnlock={needPaid('contact')}
          />

          {locked && docFor && (
            // Signed out: the sponsorship document for this job, from their country to the job's.
            <div className="mt-6 flex flex-col gap-3 rounded-xl bg-ink-50 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex shrink-0 items-center gap-1.5" aria-label={`From ${homeCode ?? 'your country'} to ${destCode ?? 'the job’s country'}`}>
                  {homeCode ? <CircleFlag countryCode={homeCode} label={homeCode} size={22} /> : <span className="h-[22px] w-[22px] rounded-full bg-ink-200" />}
                  <ArrowRight className="h-4 w-4 text-ink-400" aria-hidden />
                  {destCode ? <CircleFlag countryCode={destCode} label={destCode} size={22} /> : <span className="h-[22px] w-[22px] rounded-full bg-ink-200" />}
                </span>
                <p className="min-w-0 text-[15px] font-semibold text-ink-900">You can create a sponsorship document for this job</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  pending.current = 'doc';
                  authHere('register');
                }}
                className="shrink-0 rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-white hover:bg-ink-800"
              >
                Sign up
              </button>
            </div>
          )}
          <hr className="mt-8 border-ink-100" />
        </div>
      </section>

      <main className="mx-auto flex max-w-[760px] flex-col px-5 pb-10 pt-2 sm:px-8 md:block">
        {!closed && <ScamWarning reality={reality} />}
        {raw && !closed && <SaveJobButton jobId={raw.id} onAuth={authHere} className="mb-5" />}
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
        <div className={`bg-white ${closed ? 'text-ink-500 opacity-70 grayscale' : ''}`}>
          {(category || job.visaSponsorship || (job.additionalLocations?.length ?? 0) > 1) && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {category && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">{category}</span>}
              {job.visaSponsorship && <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">Visa sponsorship</span>}
              <MultiCountryBadge officeNames={job.additionalLocations} />
            </div>
          )}


          {raw && !localJob && (
            <SalaryCheck
              countryCode={raw.country?.iso_code}
              min={raw.salary_min}
              max={raw.salary_max}
              currency={raw.salary_currency}
              period={raw.salary_period}
              disclosed={raw.salary_status === 'disclosed'}
            />
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
              {applyButton('flex-1 bg-[#FFD60A] text-ink-950 shadow-soft-lg hover:bg-[#FFE34D] focus-visible:outline-ink-950 md:flex-none')}
              {matchJob && !closed && <MatchButton match={match} variant="body" onLocked={matchClick} />}
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

          {job.sourceType === 'company_careers' && <p className="mt-4 text-[13px] font-semibold text-ink-500">From {job.company}’s careers page</p>}
        </div>


        {/* Other jobs this CV matches best (shows only once a CV is on file). */}
        <RecommendedJobs currentId={matchKey} onAuth={authHere} className="mt-6" />

        {raw && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-ink-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] font-bold text-ink-900">Something wrong with this job?</p>
            <ReportJobButton jobId={raw.id} className="shrink-0 self-start sm:self-auto" />
          </div>
        )}

        {/* "Email me these jobs": last, under everything. */}
        {raw && (raw.job_function || raw.country?.name) && (
          <AlertSignup className="mt-4" keywords={raw.job_function ?? ''} country={raw.country?.name ?? null} onAuth={authHere} />
        )}
      </main>

      {!embedded && <LandingFooter go={go} onAuth={onAuth} />}
    </div>
  );
}

function HeaderLogo({ job, SponsorIcon }: { job: Job; SponsorIcon: typeof Building2 }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-ink-100 sm:h-[72px] sm:w-[72px]">
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
function ContactBox({ contact, locked = false, onUnlock }: { contact: JobContact; locked?: boolean; onUnlock?: () => void }) {
  const rows = [
    contact.email && { icon: Mail, text: contact.email, href: `mailto:${contact.email}` },
    contact.phone && { icon: Phone, text: contact.phone, href: `tel:${contact.phone.replace(/[^\d+]/g, '')}` },
    contact.website && { icon: Globe, text: contact.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), href: contact.website },
  ].filter(Boolean) as { icon: typeof Mail; text: string; href: string }[];
  if (!rows.length) return null;
  // Not a member: the email shown as as***@mail.com; pressing it opens the membership card.
  if (locked) {
    return (
      <button type="button" onClick={onUnlock} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-ink-50 px-4 py-3 text-left text-sm hover:bg-ink-100">
        <span className="text-[13px] text-ink-500">{contact.name ? `Recruiter: ${contact.name}` : 'Recruiter email'}</span>
        <span className="flex items-center gap-1.5 font-semibold text-ink-900">
          <Mail className="h-4 w-4 shrink-0 text-ink-400" />
          {rows[0].text}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-ink-950 px-2 py-0.5 text-[11px] font-bold text-white">
          <Lock className="h-3 w-3" /> Members
        </span>
      </button>
    );
  }
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl bg-ink-50 px-4 py-3 text-sm sm:inline-flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
      <span className="text-[13px] text-ink-500">{contact.name ? `Recruiter: ${contact.name}` : 'Contact'}</span>
      {rows.map(({ icon: Icon, text, href }) => (
        <a
          key={href}
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="flex min-w-0 items-center gap-1.5 font-semibold text-ink-900 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-900"
        >
          <Icon className="h-4 w-4 shrink-0 text-ink-400" />
          <span className="break-all">{text}</span>
        </a>
      ))}
    </div>
  );
}

/** One fact in the header's columns: a grey label over the value. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[14px] text-ink-400">{label}</dt>
      <dd className="mt-1.5 break-words text-[15px] leading-snug text-ink-900">{children}</dd>
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
  const loc = titleLocation(location);
  const visa = job.visaSponsorship || job.visaStatus === 'offered' ? ' Visa sponsorship offered.' : '';
  let text = `${job.title} at ${job.company}${loc === 'Remote' ? ', remote' : loc ? ` in ${loc}` : ''}.${facts ? ` ${facts}.` : ''}${visa}`;
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

  // Google needs either a place or, for remote jobs, the countries applicants may live in.
  if (!data.jobLocation && !data.applicantLocationRequirements) return null;

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


/** The job as the list knew it, while the full ad loads (opened from /jobs). */
function JobPreviewShell({ job, go, onAuth, embedded = false }: { job: Job; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void; embedded?: boolean }) {
  const place = [job.city, job.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', ');
  return (
    <div className={`${embedded ? '' : 'min-h-screen'} bg-white text-ink-900`} aria-busy="true">
      {!embedded && <LandingHeader go={go} onAuth={onAuth} active="jobs" />}
      <section className="bg-white">
        <div className={`mx-auto max-w-[760px] px-5 pb-8 sm:px-8 ${embedded ? 'pt-16 sm:pt-20' : 'pt-8 sm:pt-12'}`}>
          <div className="h-16 w-16 rounded-2xl skeleton-shimmer sm:h-[72px] sm:w-[72px]" />
          <h1 className="mt-6 break-words text-[30px] font-normal leading-[1.12] tracking-[-0.02em] text-ink-950 sm:text-[42px]">{job.title}</h1>
          <p className="mt-3 text-[15px] font-medium text-ink-800">{job.company}</p>
          {place && (
            <p className="mt-8 flex items-center gap-1.5 text-[15px] text-ink-900">
              <CircleFlag countryCode={job.countryCode} label={job.country} size={15} /> {place}
            </p>
          )}
          <hr className="mt-8 border-ink-100" />
        </div>
      </section>
      <main className="mx-auto max-w-[760px] space-y-3 px-5 pb-10 pt-2 sm:px-8">
        {[92, 100, 84, 97, 70, 88, 60].map((w, i) => (
          <div key={i} className="h-3.5 rounded skeleton-shimmer" style={{ width: `${w}%` }} />
        ))}
      </main>
    </div>
  );
}
