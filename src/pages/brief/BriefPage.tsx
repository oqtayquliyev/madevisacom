import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BadgeCheck, Check, ChevronDown, Copy, Download, ExternalLink, Link2, Loader2, Lock, Maximize2, Paperclip, X } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/lib/auth';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { CircleFlag } from '@/components/common/CircleFlag';
import { rememberAuthIntent } from '@/lib/authIntent';
import { EmployerReply, OwnerReplies } from '@/components/briefs/EmployerReply';
import { DragSlider } from '@/components/common/DragSlider';
import { OfferInfo } from '@/components/briefs/OfferBits';
import { type CandidateCover, type VisaRoute } from '@/data/visa';
import { fetchSponsoredJobById, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import {
  BRIEF_STATUS_CHOICES,
  BRIEF_STATUS_LABEL,
  briefEligibility,
  GENERIC_ROUTE_ID,
  briefMessage,
  briefPath,
  briefUrl,
  createBrief,
  fetchBrief,
  fetchBriefAcceptance,
  fetchMyBriefForJob,
  findRoute,
  recordBriefView,
  updateBriefDetails,
  updateBriefStatus,
  updateBriefTerms,
  withdrawBrief,
  type BriefAcceptance,
  type BriefStatus,
  type PublicBrief,
} from '@/lib/briefs';
import {
  briefCountries,
  buildTerms,
  cleanWebsite,
  currencyFor,
  employerFromPublisher,
  fetchOfferCredits,
  money,
  OFFER_ITEM_LABEL,
  PAYER_LABEL,
  canMakeDocument,
  docsLabel,
  pingNotifications,
  PRO_MONTHLY_DOCS,
  recommendedSplit,
  recordOfferDraft,
  recordOfferPdf,
  splitWord,
  type OfferCredits,
  type OfferEmployer,
  ARRANGEMENT_LABEL,
  MAX_REPAY_MONTHS,
  type OfferTerms,
  type Payer,
  type ProposalFacts,
  type WorkArrangement,
} from '@/lib/sponsorOffer';
import { searchPublishers, type PublisherMatch } from '@/lib/companyExperiences';
import { visaGuideByCode } from '@/data/visa';
import { allCountries } from '@/data/allCountries';
import { nav } from '@/lib/pageLayout';
import { jobPath } from '@/lib/jobUrl';
import { EXPERIENCE_OPTIONS } from '@/lib/plans';
import { usePersonalization } from '@/lib/personalization';
import { ProPlanCard } from '@/components/pro/ProPlanCard';
import { OfferDocument, type DocData } from '@/pages/brief/OfferDocument';
import { captureFacts, fmtDate, GAP_GROUP_LABEL, hostOf, monthLabel, openQuestions, reviseFacts, verificationRows, withThe, type Gap } from '@/lib/proposal';
import { formatSalary } from '@/lib/listingCategories';

type Props = { shareId: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const refFor = (id: string) => `MV-${id.slice(0, 4).toUpperCase()}-${id.slice(4, 8).toUpperCase()}`;

export function BriefPage(props: Props) {
  return props.shareId === 'new' ? <NewOffer {...props} /> : <SavedOffer {...props} />;
}

// ---------------------------------------------------------------------------
// New offer: /brief/new?job=<id>
// Custom Visa Plan (any company, no job on MadeVisa):
//   /brief/new?custom=1&company=…&title=…&country=XX&city=…&pub=<publisher id>
// ---------------------------------------------------------------------------

/** Everything the candidate can change on the document. */
type Editable = {
  split: number;
  offset: number;
  salary: number;
  overrides: Partial<Record<CandidateCover, Payer>>;
  employer: OfferEmployer;
  /** Months of the repayment term the candidate chooses to propose. 0 = none (the default). */
  repay: number;
};

const termsFrom = (e: Editable, allowed: CandidateCover[], code: string): OfferTerms => ({
  ...buildTerms(e.split, allowed, e.overrides, e.repay),
  salaryOffset: e.offset,
  salary: e.salary || undefined,
  currency: currencyFor(code).code,
  employer: e.employer,
  overrides: Object.keys(e.overrides).length ? e.overrides : undefined,
});

/** Annual gross salary from the job ad, when it's in the country's currency. */
function salaryFromJob(raw: { salary_min: number | null; salary_max: number | null; salary_currency: string | null; salary_period: string | null }, code: string): number {
  const base = raw.salary_min ?? raw.salary_max;
  if (!base || (raw.salary_currency ?? '').toUpperCase() !== currencyFor(code).code) return 0;
  const p = (raw.salary_period ?? 'year').toLowerCase();
  if (p.startsWith('year') || p === 'annual') return Math.round(base);
  if (p.startsWith('month')) return Math.round(base * 12);
  return 0;
}

/** What the job ad itself says, kept with the document as its evidence. Nothing here is worked out or guessed. */
type AdFacts = { arrangement?: WorkArrangement | null; employmentType?: string | null; adPay?: string | null; postedAt?: string | null; sponsorship?: ProposalFacts['sponsorship'] };

const PRINT_ON_OPEN = 'madevisa:printOffer';

// A signed-out visitor fills in the builder, then signs up (often via a
// Google redirect, which reloads the page). Their choices are kept here for
// the tab's lifetime and restored when they land back on the same URL.
type OfferDraft = { ed: Editable; name: string; headline: string; note: string; country: string; routeId: string; useRec: boolean; roleTitle: string };
const draftKey = () => `mv:offerDraft:${window.location.pathname}${window.location.search}`;
function saveOfferDraft(d: OfferDraft) {
  try {
    window.sessionStorage.setItem(draftKey(), JSON.stringify(d));
  } catch {
    /* storage blocked — they'll just start again */
  }
}
function takeOfferDraft(): OfferDraft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey());
    return raw ? (JSON.parse(raw) as OfferDraft) : null;
  } catch {
    return null;
  }
}
function clearOfferDraft() {
  try {
    window.sessionStorage.removeItem(draftKey());
  } catch {
    /* ignore */
  }
}

function NewOffer({ go, onAuth }: Props) {
  const { session, profile, loading: authLoading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get('job') ?? '';
  const custom = params.get('custom') === '1';
  const [roleTitle, setRoleTitle] = useState(params.get('title') ?? '');
  const [state, setState] = useState<
    | { k: 'loading' }
    | { k: 'missing' }
    | {
        k: 'ready';
        job: { id: string; publisherId: string | null; title: string; company: string; fn: string | null; city: string | null; ownCode: string; contact: string | null; closed: boolean; source?: string | null; logo?: string | null; path?: string | null } & AdFacts;
        raw: { salary_min: number | null; salary_max: number | null; salary_currency: string | null; salary_period: string | null };
      }
  >({ k: 'loading' });
  const [country, setCountry] = useState<string>((params.get('country') ?? '').toUpperCase());
  const [routeId, setRouteId] = useState<string>('');
  const [ed, setEd] = useState<Editable | null>(null);
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [note, setNote] = useState('');
  const [credits, setCredits] = useState<OfferCredits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The plan and its price are shown at the moment someone asks for the download.
  const [planOpen, setPlanOpen] = useState(false);
  // The full name comes first: a document that says "Your name" is worth nothing.
  const [nameOk, setNameOk] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  // One approval for every line of "Check your details". Everything can still be edited after the download.
  const [approved, setApproved] = useState(false);
  // Starts on the recommended, balanced terms until the candidate changes them.
  const [useRec, setUseRec] = useState(true);
  const { profile: visitor } = usePersonalization();

  useSeo({ title: 'Prepare your sponsorship document', description: 'Create a Visa Plan: a sponsorship proposal for an employer.', path: '/brief/new', noindex: true });

  useEffect(() => {
    let alive = true;
    if (custom) {
      // A company you picked or typed yourself — nothing to load.
      const company = (params.get('company') ?? '').trim();
      const pub = params.get('pub');
      const code = (params.get('country') ?? '').toUpperCase();
      const job = { id: '', publisherId: pub, title: roleTitle, company, fn: null, city: (params.get('city') ?? '').trim() || null, ownCode: code, contact: null, closed: false };
      setState({ k: 'ready', job, raw: { salary_min: null, salary_max: null, salary_currency: null, salary_period: null } });
      setEd({ split: 50, offset: 0, salary: 0, overrides: {}, repay: 0, employer: { name: company, publisherId: pub, contact: null, logo: null } });
      if (pub) employerFromPublisher(pub, company).then((e) => alive && setEd((d) => (d ? { ...d, employer: e } : d)));
      return () => {
        alive = false;
      };
    }
    if (!jobId) return setState({ k: 'missing' });
    fetchSponsoredJobById(jobId, { private: true }).then(async (raw) => {
      if (!alive) return;
      if (!raw) return setState({ k: 'missing' });
      const board = sponsoredJobToBoardJob(raw);
      const mine = await fetchMyBriefForJob(raw.id);
      if (mine) return nav(briefPath(mine.share_id));
      void recordOfferDraft(raw.id);
      const city = raw.city && !/^(all|any|various|remote)$/i.test(raw.city.trim()) ? raw.city : null;
      const contact = raw.contact_email && !/madevisa/i.test(raw.contact_email) ? raw.contact_email : null;
      const source = [raw.official_url, raw.application_url].find((u) => typeof u === 'string' && /^https?:\/\//i.test(u)) ?? null;
      const ad: AdFacts = {
        arrangement: raw.work_arrangement ?? (raw.remote ? 'remote' : null),
        employmentType: raw.employment_type?.trim() || null,
        adPay: formatSalary(raw),
        postedAt: raw.source_posted_at ?? null,
        sponsorship: raw.visa_status === 'not_offered' ? 'not_offered' : raw.visa_status === 'offered' || raw.visa_sponsorship ? 'offered' : 'not_stated',
      };
      const job = { id: raw.id, publisherId: raw.publisher_id ?? null, title: board.title, company: board.company, fn: raw.job_function ?? null, city, ownCode: (raw.country?.iso_code ?? '').toUpperCase(), contact, closed: Boolean(board.closed), source, logo: raw.publisher?.logo_url ?? null, path: jobPath({ id: board.id, title: board.title, company: board.company }), ...ad };
      const salaryRaw = { salary_min: raw.salary_min, salary_max: raw.salary_max, salary_currency: raw.salary_currency, salary_period: raw.salary_period as string | null };
      setState({ k: 'ready', job, raw: salaryRaw });
      setEd({ split: 50, offset: 0, salary: 0, overrides: {}, repay: 0, employer: { name: board.company, publisherId: job.publisherId, contact, logo: raw.publisher?.logo_url ?? null } });
      if (job.publisherId) employerFromPublisher(job.publisherId, board.company).then((e) => alive && setEd((d) => (d ? { ...d, employer: { ...e, contact } } : d)));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, custom]);

  // Restore what a visitor chose before signing up (once, after the job loads).
  const restored = useRef(false);
  const readyId = state.k === 'ready' ? state.job.id || 'custom' : null;
  useEffect(() => {
    if (!readyId || restored.current) return;
    restored.current = true;
    const d = takeOfferDraft();
    if (!d) return;
    setEd({ ...d.ed, repay: d.ed.repay ?? 0 });
    setName(d.name);
    if (hasFullName(d.name)) setNameOk(true);
    setHeadline(d.headline);
    setNote(d.note);
    if (d.country) setCountry(d.country);
    if (d.routeId) setRouteId(d.routeId);
    setUseRec(d.useRec);
    if (d.roleTitle) setRoleTitle(d.roleTitle);
  }, [readyId]);

  useEffect(() => {
    if (!profile) return;
    setName((n) => n || profile.full_name || '');
    if (hasFullName(profile.full_name ?? '')) setNameOk(true);
    setHeadline((h) => h || profile.network_headline || headlineFromProfile(profile) || '');
  }, [profile]);

  useEffect(() => {
    if (session) fetchOfferCredits().then(setCredits);
  }, [session]);

  const ready = state.k === 'ready' ? state : null;
  const el = ready ? briefEligibility({ countryCode: ready.job.ownCode, closed: ready.job.closed, override: country || null, fallback: DEFAULT_COUNTRY }) : null;

  // Prefill salary from the job once the country (and its currency) is known.
  const code = el?.ok ? el.code : '';
  useEffect(() => {
    if (ready && code) setEd((d) => (d && !d.salary ? { ...d, salary: salaryFromJob(ready.raw, code) } : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, ready?.job.id]);

  if (state.k === 'missing' || (ready && el && !el.ok)) return <NotFoundPage go={go} onAuth={onAuth} />;
  if (!ready || !el || !el.ok || authLoading || !ed) return <Desk go={go} onAuth={onAuth} loading />;

  const job = custom ? { ...ready.job, title: roleTitle.trim() } : ready.job;
  const { guide, routes, picked: pickedCountry } = el;
  // A custom offer's city belongs to the country it was typed for.
  const picked = custom ? el.code !== ready.job.ownCode : pickedCountry;
  const route = routes.find((r) => r.id === routeId) ?? routes[0];
  const allowed = route.employer!.candidateMayCover;
  const recSplit = recommendedSplit(allowed);
  const edNow: Editable = useRec ? { ...ed, split: recSplit, overrides: {} } : ed;
  const baseTerms = termsFrom(edNow, allowed, el.code);
  const recTerms = termsFrom({ ...ed, split: recSplit, overrides: {} }, allowed, el.code);
  const isRecommended = edNow.split === recSplit && Object.keys(edNow.overrides).length === 0;
  const usesPro = Boolean(credits && credits.proLeft > 0);
  const canPay = canMakeDocument(credits);
  const generic = !el.checked || route.id === GENERIC_ROUTE_ID;
  const adHost = hostOf(job.source);
  const adSalary = custom ? 0 : salaryFromJob(ready.raw, el.code);

  const doc: DocData = {
    ref: 'MV-PREVIEW',
    issuedAt: new Date().toISOString(),
    shareId: null,
    jobTitle: job.title || 'The role you apply for',
    companyName: ed.employer.name || 'Company name',
    city: picked ? null : job.city,
    candidateName: name.trim() || 'Your name',
    headline: headline.trim() || null,
    linkedin: null,
    note: note.trim() || null,
  };

  // Step 1: check, then show the final review. Step 2 (confirmed): pay and create.
  const keepDraft = () => {
    saveOfferDraft({ ed, name, headline, note, country, routeId, useRec, roleTitle });
    rememberAuthIntent({ reason: 'offer', next: `${window.location.pathname}${window.location.search}` });
  };
  const fail = (message: string) => {
    setError(message);
    // The message sits by the button at the end of the side panel; bring it into view.
    window.requestAnimationFrame(() => document.getElementById('offer-pay')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };
  // What must be right before anyone downloads, and what is worth a second look.
  const cityShown = picked ? null : job.city;
  const placeText = [cityShown, guide.name].filter(Boolean).join(', ');
  const routeText = generic ? 'To be confirmed' : route.name;
  const adSrc = custom ? 'You' : adHost ? `Job ad (${adHost})` : 'Job ad as listed on MadeVisa';
  const routeSrc = generic ? 'Not checked by MadeVisa' : [hostOf(route.url) ? `Official source (${hostOf(route.url)})` : 'Official source', monthLabel(guide.reviewed) ? `checked ${monthLabel(guide.reviewed)}` : null].filter(Boolean).join(' · ');
  const salaryIsAds = !custom && adSalary > 0 && edNow.salary === adSalary;
  const workText = [job.employmentType, job.arrangement ? ARRANGEMENT_LABEL[job.arrangement] : null].filter(Boolean).join(' · ');
  const checks: Check_[] = [
    hasFullName(name)
      ? { id: 'name', level: 'look', value: name.trim(), text: `Name: ${name.trim()}`, hint: 'Exactly as in your passport?', source: 'You', field: 'offer-name' }
      : { id: 'name', level: 'stop', value: '', text: name.trim() ? 'Add your full name: first name and family name, as in your passport.' : 'Add your full name. The document says “Your name” until you do.', field: 'offer-name' },
    ed.employer.name.trim()
      ? { id: 'company', level: 'look', fromAd: true, value: ed.employer.name.trim(), text: `Company: ${ed.employer.name.trim()}`, hint: 'The same company as in the ad?', source: adSrc, field: 'offer-company' }
      : { id: 'company', level: 'stop', value: '', text: 'Add the company this document is for.', field: 'offer-company' },
    job.title
      ? { id: 'role', level: 'look', fromAd: true, value: job.title, text: `Role: ${job.title}`, hint: 'The same job title as in the ad?', source: adSrc, field: custom ? 'offer-role' : undefined }
      : { id: 'role', level: 'stop', value: '', text: 'Add the role you are applying for.', field: 'offer-role' },
    {
      id: 'country',
      level: 'look',
      fromAd: true,
      value: el.code,
      text: `Country: ${guide.name}`,
      hint: picked ? `The job ad is in ${countryNameOf(ready.job.ownCode) ?? 'another country'}. Make sure ${guide.name} is where you will work. The document says it differs from the ad.` : 'Is this the country in the ad, and where you will work?',
      source: picked ? 'You' : adSrc,
      field: 'offer-country',
    },
    {
      id: 'place',
      level: 'look',
      fromAd: true,
      value: placeText,
      text: `Place of work: ${placeText}`,
      hint: cityShown ? 'The city where you would work (not the company’s headquarters): the same as in the ad?' : 'No city: the document shows the country only and marks the city as needing confirmation.',
      source: cityShown ? adSrc : 'Not stated',
    },
    ...(custom
      ? []
      : ([
          {
            id: 'work',
            level: 'look',
            fromAd: true,
            value: workText,
            text: `Employment: ${workText || 'type and on-site or remote not stated'}`,
            hint: workText ? 'Full-time or part-time, on site or remote: the same as in the ad?' : 'Our copy of the ad doesn’t say. The document marks it “Not stated”.',
            source: workText ? adSrc : 'Not stated',
          },
          {
            id: 'salary',
            level: 'look',
            fromAd: true,
            value: `${edNow.salary}|${job.adPay ?? ''}`,
            text: edNow.salary ? `Salary: ${money(edNow.salary, el.code)} a year` : job.adPay ? `Pay in the ad: ${job.adPay}` : 'Salary: not stated',
            hint: salaryIsAds
              ? `From the ad${job.adPay ? ` (“${job.adPay}”)` : ''}. The same figure as in the original?`
              : edNow.salary
                ? `Your own figure: the ad shows ${job.adPay ? `“${job.adPay}”` : 'no pay'}. The document says the salary was entered by you.`
                : job.adPay
                  ? 'The ad gives no yearly amount we can use. Add the annual salary if you know it; we never work one out for you.'
                  : 'The ad shows no pay. Add it if you know it; otherwise the document says “Not stated”.',
            source: salaryIsAds ? adSrc : edNow.salary ? 'You' : job.adPay ? adSrc : 'Not stated',
            field: 'offer-salary',
          },
          {
            id: 'sponsor',
            level: 'look',
            fromAd: true,
            value: job.sponsorship ?? 'not_stated',
            text: `Sponsorship in the ad: ${job.sponsorship === 'offered' ? 'offered' : job.sponsorship === 'not_offered' ? 'not offered' : 'not mentioned'}`,
            hint:
              job.sponsorship === 'offered'
                ? 'Does the original ad say the company sponsors visas?'
                : job.sponsorship === 'not_offered'
                  ? 'The ad says the company does not sponsor. The document says so, and asks them to reconsider.'
                  : 'The document says sponsorship needs the employer’s confirmation. It never claims the company sponsors.',
            source: job.sponsorship === 'not_stated' || !job.sponsorship ? 'Not stated' : adSrc,
          },
        ] satisfies Check_[])),
    {
      id: 'route',
      level: 'look',
      value: routeText,
      text: `Potential visa route: ${routeText}`,
      hint: generic ? `We have no checked route for ${guide.name} yet; the document says the route has to be confirmed.` : 'A route that may apply. The document says the company or an adviser has to confirm it.',
      source: routeSrc,
    },
  ];
  // One "I approve all" tick covers every line; nothing forces a visit to the original ad.
  const ticked = (c: Check_) => c.level !== 'stop' && approved;
  const left = approved ? checks.filter((c) => c.level === 'stop').length : checks.length;
  const stop = checks.find((c) => c.level === 'stop') ?? null;
  // The evidence kept with the document: what came from the ad, what the person compared, what they entered.
  const terms: OfferTerms = {
    ...baseTerms,
    rev: 0,
    facts: captureFacts({
      custom,
      sourceUrl: job.source,
      postedAt: job.postedAt,
      checked: checks.filter((c) => c.fromAd && ticked(c)).map((c) => c.id),
      arrangement: job.arrangement,
      employmentType: job.employmentType,
      adPay: job.adPay,
      salary: edNow.salary,
      adSalary,
      sponsorship: job.sponsorship ?? 'not_stated',
      adCountry: picked && !custom ? ready.job.ownCode : null,
    }),
  };
  const adCountryName = picked && !custom ? countryNameOf(ready.job.ownCode) : null;
  const gaps = openQuestions({
    rows: verificationRows({ facts: terms.facts, company: ed.employer.name, website: cleanWebsite(ed.employer.website), role: job.title, code: el.code, countryName: guide.name, adCountryName, city: cityShown, salary: edNow.salary, route, generic, reviewed: generic ? null : guide.reviewed ?? null }),
    terms,
    generic,
    countryName: guide.name,
  });
  const goTo = (field?: string) => {
    const node = field ? document.getElementById(field) : null;
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (node as HTMLElement).focus?.({ preventScroll: true });
  };

  const review = () => {
    // A document with a gap in it is never offered for download.
    if (stop) {
      setFullOpen(false);
      setError(stop.text);
      return goTo(stop.field);
    }
    // One approval for all the details, at the end of the list.
    if (!approved) {
      setFullOpen(false);
      setError('Tick “I approve all these details” first. You can edit the document any time after downloading.');
      return goTo('offer-approve');
    }
    // No plan yet (or no account): this is the moment to show the price and what it covers.
    if (!canPay && !credits?.pro) {
      if (!session) keepDraft();
      return setPlanOpen(true);
    }
    // Pro, all of this month's documents used.
    if (!canPay) return fail(`All ${credits?.quota ?? PRO_MONTHLY_DOCS} documents for this month are used. They renew on the 1st.`);
    setError(null);
    setFullOpen(false);
    // Approved above: straight to the download, no second confirmation.
    void generate();
  };

  const generate = async () => {
    setConfirming(false);
    setBusy(true);
    setError(null);
    const res = await createBrief({
      jobId: job.id || null,
      publisherId: ed.employer.publisherId ?? null,
      jobTitle: job.title,
      companyName: ed.employer.name.trim(),
      jobFunction: job.fn,
      jobCity: picked ? null : job.city,
      countryCode: el.code,
      routeId: route.id,
      candidateName: name.trim(),
      candidateHeadline: headline.trim() || null,
      candidateLinkedin: profile?.linkedin_url ?? null,
      candidateUsername: profile?.username ?? null,
      covers: terms.items.filter((i) => i.payer !== 'employer').map((i) => i.key),
      remoteFirst: terms.remoteStart,
      note,
      split: terms.split,
      terms,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    pingNotifications();
    try {
      clearOfferDraft();
      window.sessionStorage.setItem(PRINT_ON_OPEN, res.shareId);
    } catch {
      /* ignore */
    }
    window.history.replaceState({}, '', briefPath(res.shareId));
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const patch = (p: Partial<Editable>) => {
    const leavesRec = 'split' in p || Boolean(p.overrides && Object.keys(p.overrides).length);
    setEd((d) => (d ? { ...(useRec && leavesRec ? { ...d, split: recSplit, overrides: {} } : d), ...p } : d));
    if (leavesRec) setUseRec(false);
  };
  const from = (visitor.currentLocation ?? visitor.citizenship ?? '').toUpperCase() || null;

  const flags = (
    <span className="flex shrink-0 items-center gap-1.5">
      {from && from !== el.code && (
        <>
          <CircleFlag countryCode={from} size={24} label={countryNameOf(from) ?? from} />
          <ChevronRightIcon />
        </>
      )}
      <CircleFlag countryCode={el.code} size={24} label={guide.name} />
    </span>
  );
  const companyName = ed.employer.name || job.company;

  // Step one, when we don't know the name yet: ask for it before showing anything else.
  if (!nameOk) {
    const good = hasFullName(name);
    return (
      <Builder go={go} onAuth={onAuth}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (good) setNameOk(true);
          }}
          className="mx-auto mt-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink-200 sm:mt-10 sm:p-8"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-600">
            {flags}
            <span className="min-w-0 truncate">Sponsorship document{companyName ? ` for ${companyName}` : ''}</span>
          </p>
          <h1 className="mt-4 text-[24px] font-bold leading-tight tracking-tight text-ink-950">First, your full name</h1>
          <label className="mt-4 block">
            <span className="text-[13px] font-semibold text-ink-800">As in your passport</span>
            <input id="offer-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" placeholder="First name, middle name, family name" className={`${INPUT} py-3 text-[16px]`} />
          </label>
          <p className="mt-2 text-[12.5px] leading-5 text-ink-500">Include your middle name if your passport shows one. The company sees exactly this name on the document.</p>
          {name.trim() && !good && <p className="mt-2 text-[12.5px] font-semibold text-amber-700">Add your family name too.</p>}
          <button type="submit" disabled={!good} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-3.5 text-[15px] font-bold text-white hover:bg-brand-800 disabled:opacity-50">
            Continue
          </button>
        </form>
      </Builder>
    );
  }

  const paper = <OfferDocument doc={doc} terms={terms} guide={guide} route={route} code={el.code} locked={!canPay} draft adCountryName={adCountryName} />;

  return (
    <Builder
      go={go}
      onAuth={onAuth}
      banner={
        <div className={`border-b ${stop || left ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2.5 px-3 py-3 sm:px-6">
            {flags}
            <p className="min-w-0 flex-1 basis-56 text-[14px] leading-5 text-ink-800">
              {stop ? (
                <>
                  <strong className="text-ink-950">One thing is missing.</strong> {stop.text}
                </>
              ) : left ? (
                <>
                  <strong className="text-ink-950">Ready with the recommended settings.</strong> Approve the details below and download. You can edit it any time later.
                </>
              ) : (
                <>
                  <strong className="text-ink-950">Your sponsorship document{companyName ? ` for ${companyName}` : ''} is ready.</strong> Download it now and edit it later from your profile.
                </>
              )}
            </p>
            <button
              onClick={review}
              disabled={busy}
              aria-disabled={Boolean(stop)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#1D4ED8] px-5 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : stop ? null : <Download className="h-4 w-4" />} {stop ? 'Fix it' : 'Download PDF'}
            </button>
          </div>
        </div>
      }
      side={
        <Panel>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-bold text-ink-950">Your document</p>
            <button onClick={() => setFullOpen(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1D4ED8] hover:underline">
              <Maximize2 className="h-3.5 w-3.5" /> See full
            </button>
          </div>
          <DocPreview onOpen={() => setFullOpen(true)}>{paper}</DocPreview>
          <p className="mt-2 text-[12px] leading-5 text-ink-500">
            It updates as you type.{canPay ? '' : ' The wording of each clause appears once you have the plan.'}
          </p>
        </Panel>
      }
    >
      {/* 0. The job this document is for. The original ad is there to look at, never required. */}
      {!custom && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-ink-200">
          {job.logo ? (
            <img src={job.logo} alt="" className="h-12 w-12 shrink-0 rounded-lg object-contain ring-1 ring-ink-100" />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-ink-100 text-[16px] font-bold text-ink-600">{job.company.slice(0, 1)}</span>
          )}
          <div className="min-w-0 flex-1 basis-56">
            <p className="truncate text-[12px] font-semibold text-ink-500">{job.company}</p>
            <p className="break-words text-[16px] font-bold leading-snug text-ink-950">{job.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-600">
              {job.ownCode && <CircleFlag countryCode={job.ownCode} size={15} label={countryNameOf(job.ownCode) ?? job.ownCode} />}
              {[job.city, countryNameOf(job.ownCode)].filter(Boolean).join(', ') || 'Location on the ad'}
            </p>
          </div>
          {(job.source || job.path) && (
            <a href={job.source || job.path || undefined} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[#1D4ED8] hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> {job.source ? 'Original job ad' : 'The job on MadeVisa'}
            </a>
          )}
        </div>
      )}

      {/* 1. What must be right */}
      <Panel>
        <div id="offer-checks" tabIndex={-1} className="scroll-mt-24 outline-none">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[18px] font-bold leading-snug text-ink-950">Check your details</h1>
            <p className={`text-[13px] font-semibold ${approved && !stop ? 'text-emerald-700' : 'text-ink-500'}`}>{approved && !stop ? 'Approved' : 'Recommended settings'}</p>
          </div>
          <p className="mt-0.5 text-[13px] leading-5 text-ink-600">Filled in from the job ad and your profile. Change anything, then approve all at the end.</p>
          <ul className="mt-3 divide-y divide-ink-100 rounded-lg ring-1 ring-ink-200">
            {checks.map((c) => {
              const on = ticked(c);
              return (
                <li key={c.id} className={`flex items-start gap-3 px-3 py-2.5 ${on ? 'bg-emerald-50/60' : ''}`}>
                  {c.level === 'stop' ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
                  ) : (
                    <Check className={`mt-0.5 h-5 w-5 shrink-0 ${on ? 'text-emerald-600' : 'text-ink-300'}`} aria-hidden />
                  )}
                  <div className="min-w-0 flex-1 text-[14px] leading-5">
                    <span className={`block break-words font-semibold ${c.level === 'stop' ? 'text-rose-700' : 'text-ink-950'}`}>{c.text}</span>
                    {c.level !== 'stop' && c.source && <span className="mt-0.5 block text-[11.5px] font-medium text-ink-400">Source: {c.source}</span>}
                  </div>
                  {c.field && (
                    <button onClick={() => goTo(c.field)} className="shrink-0 text-[13px] font-semibold text-[#1D4ED8] hover:underline">
                      {c.level === 'stop' ? 'Fix' : 'Change'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <OpenQuestions gaps={gaps} />
          <label id="offer-approve" tabIndex={-1} className={`mt-3 flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 outline-none ring-2 ${approved && !stop ? 'bg-emerald-50 ring-emerald-300' : 'bg-[#1D4ED8]/5 ring-[#1D4ED8]/30'}`}>
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => {
                setApproved(e.target.checked);
                if (e.target.checked) setError(null);
              }}
              className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
            />
            <span className="min-w-0 text-[14px] leading-5">
              <span className="block font-bold text-ink-950">I approve all these details</span>
              <span className="block text-[12.5px] text-ink-600">You can edit the document any time later, from its link or from your profile, until the company accepts it.</span>
            </span>
          </label>
          {error && !stop && !approved && <p className="mt-2 text-[13px] font-semibold text-rose-700">{error}</p>}
        </div>

        <div className="mt-4 grid gap-3 border-t border-ink-100 pt-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-800">Full name, as in your passport</span>
            <input id="offer-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={`${INPUT} ${hasFullName(name) ? '' : 'border-rose-300'}`} />
            <span className="mt-1 block text-[12px] leading-4 text-ink-500">With your middle name if your passport shows one.</span>
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-800">Role and experience</span>
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} placeholder="Backend engineer · 5–10 years" className={INPUT} />
            <span className="mt-1 block text-[12px] leading-4 text-ink-500">One line under your name. Optional.</span>
          </label>
          {custom && (
            <label className="block sm:col-span-2">
              <span className="text-[13px] font-semibold text-ink-800">Role you’re applying for</span>
              <input id="offer-role" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} maxLength={300} placeholder="e.g. Data Engineer" className={INPUT} />
            </label>
          )}
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-800">Country where you will work</span>
            <CountrySelect
              id="offer-country"
              value={el.code}
              jobCode={job.ownCode}
              onChange={(c) => {
                setCountry(c);
                setRouteId('');
                patch({ offset: 0, salary: salaryFromJob(ready.raw, c), overrides: {} });
              }}
            />
          </label>
          {routes.length > 1 ? (
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-800">Visa route</span>
              <select value={route.id} onChange={(e) => setRouteId(e.target.value)} className={INPUT}>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.employer?.licenceNeeded ? '· sponsor licence' : '· no licence'}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div>
              <span className="text-[13px] font-semibold text-ink-800">Place of work on the document</span>
              <p className="mt-1 rounded-lg bg-ink-50 px-3 py-2 text-[14px] text-ink-900">{[cityShown, guide.name].filter(Boolean).join(', ')}</p>
            </div>
          )}
        </div>
      </Panel>

      {/* 2. Who it is for */}
      <div id="offer-company" tabIndex={-1} className="outline-none">
        <EmployerControl value={ed.employer} onChange={(e) => patch({ employer: e })} />
      </div>

      {/* 3. The terms: open, with what we recommend for this company and country first */}
      <details open className="group rounded-xl bg-white shadow-sm ring-1 ring-ink-200">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[15px] font-bold text-ink-950 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            The terms{companyName ? ` for ${companyName}` : ''} in {guide.name}
            <span className="block text-[12.5px] font-normal text-ink-500">What you propose. A suggested starting point is filled in; change anything.</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-500 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-ink-100 p-4">
          <RecommendedPanel
            company={companyName || 'this company'}
            from={from}
            to={el.code}
            toName={guide.name}
            terms={recTerms}
            code={el.code}
            active={isRecommended}
            onApply={() => {
              setUseRec(true);
              setEd((d) => (d ? { ...d, overrides: {} } : d));
            }}
          />
          <EditorPanels ed={edNow} terms={terms} code={el.code} route={route} onChange={patch} hideEmployer />
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-800">Note to the hiring manager</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} rows={2} placeholder="Optional" className={INPUT} />
          </label>
        </div>
      </details>

      <PayBox credits={credits} signedIn={Boolean(session)} usesPro={usesPro} canPay={canPay} busy={busy} error={error} onGo={review} />

      {fullOpen && (
        <FullDocument onClose={() => setFullOpen(false)} onDownload={review} canDownload={!stop && approved}>
          {paper}
        </FullDocument>
      )}
      {confirming && (
        <ConfirmTerms
          terms={terms}
          code={el.code}
          country={guide.name}
          city={cityShown}
          routeName={generic ? 'To be confirmed' : `${route.name} (potential)`}
          candidate={name.trim()}
          headline={headline.trim()}
          company={ed.employer.name}
          role={job.title}
          price={usesPro ? 'Included in your membership' : '1 document from your balance'}
          onBack={() => setConfirming(false)}
          onConfirm={() => void generate()}
        />
      )}
      {planOpen && (
        <PlanSheet
          company={ed.employer.name}
          signedIn={Boolean(session)}
          onClose={() => setPlanOpen(false)}
          onAuth={(page) => {
            keepDraft();
            onAuth?.(page);
          }}
        />
      )}
    </Builder>
  );
}

/** A full name has at least a first name and a family name. */
const hasFullName = (v: string) => v.trim().split(/\s+/).filter((w) => w.length > 1).length >= 2;
const countryNameOf = (code: string | null | undefined) => (code ? allCountries.find((c) => c.code === code.toUpperCase())?.name ?? null : null);
/** A line of the check list: to be ticked by the person, or to be fixed first. */
type Check_ = { id: string; level: 'look' | 'stop'; /** What the tick stands for: a changed value needs a new tick. */ value: string; text: string; hint?: string; /** Where the value comes from, shown under the line. */ source?: string; field?: string; /** Comes from the job ad. */ fromAd?: boolean };

/**
 * What the document cannot state as known. It never blocks the download:
 * each one is printed on the document as needing confirmation, so the
 * company sees what is still open instead of a guess.
 */
function OpenQuestions({ gaps }: { gaps: Gap[] }) {
  if (!gaps.length) return null;
  const groups = (['recommended', 'employer', 'review'] as Gap['group'][]).map((g) => ({ g, items: gaps.filter((x) => x.group === g) })).filter((x) => x.items.length);
  return (
    <div id="offer-open" className="mt-3 rounded-lg bg-amber-50/70 px-3 py-2.5 ring-1 ring-amber-200">
      <p className="text-[13.5px] font-bold text-ink-950">
        {gaps.length} {gaps.length === 1 ? 'thing is' : 'things are'} still unknown
      </p>
      <p className="text-[12.5px] leading-5 text-ink-600">You can send the document anyway. Each one is marked “needs confirmation” on it, so the company sees exactly what is still open.</p>
      <dl className="mt-2 space-y-1.5">
        {groups.map(({ g, items }) => (
          <div key={g} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <dt className="text-[12px] font-semibold text-ink-700">{GAP_GROUP_LABEL[g]}:</dt>
            <dd className="flex flex-wrap gap-1.5">
              {items.map((x) => (
                <span key={x.id} className="rounded-full bg-white px-2 py-0.5 text-[12px] font-medium text-ink-800 ring-1 ring-amber-200">
                  {x.text}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The builder's frame: what to fill in on the left, a small view of the document on the right. */
function Builder({ go, onAuth, banner, side, children }: { go: Props['go']; onAuth: Props['onAuth']; banner?: ReactNode; side?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#e9edf3] text-ink-900 print:hidden">
      <LandingHeader go={go} onAuth={onAuth} />
      {banner}
      <div className={`mx-auto grid w-full max-w-[1200px] gap-6 px-3 py-6 sm:px-6 sm:py-8 ${side ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
        <div className="min-w-0 space-y-4">{children}</div>
        {side && <aside className="min-w-0 lg:sticky lg:top-[88px] lg:self-start">{side}</aside>}
      </div>
    </div>
  );
}

/** The document at a glance: the real page, scaled down to fit, with a way to open it full size. */
function DocPreview({ children, onOpen }: { children: ReactNode; onOpen: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = () => setScale(node.clientWidth / 820);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative mt-3 h-[400px] overflow-hidden rounded-lg bg-white ring-1 ring-ink-200">
      {/* Shown for looking at only: no focus, no clicks, not read out twice. */}
      <div aria-hidden className="pointer-events-none origin-top-left select-none" style={{ width: 820, transform: `scale(${scale})` }} {...({ inert: '' } as object)}>
        {children}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-white via-white/90 to-transparent pb-3 pt-14">
        <button onClick={onOpen} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-ink-900 shadow-soft ring-1 ring-ink-200 hover:ring-[#1D4ED8]/40">
          <Maximize2 className="h-3.5 w-3.5" /> See full document
        </button>
      </div>
    </div>
  );
}

/** The whole document, full size, over the page. */
function FullDocument({ children, onClose, onDownload, canDownload }: { children: ReactNode; onClose: () => void; onDownload: () => void; canDownload: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = was;
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink-950/60 print:hidden" role="dialog" aria-modal="true" aria-label="Your document" onClick={onClose}>
      <div className="flex shrink-0 items-center justify-between gap-3 bg-white px-4 py-2.5 shadow-sm sm:px-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-[15px] font-bold text-ink-950">Your document</p>
        <div className="flex items-center gap-2">
          <button onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-full bg-[#1D4ED8] px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-800">
            {canDownload ? <Download className="h-3.5 w-3.5" /> : null} {canDownload ? 'Download PDF' : 'Check the details first'}
          </button>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-ink-600 hover:bg-ink-100">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-5 sm:px-6 sm:py-8">
        <div onClick={(e) => e.stopPropagation()}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Last look before the document is saved and counted. */
function ConfirmTerms(props: {
  terms: OfferTerms;
  code: string;
  country: string;
  city: string | null;
  routeName: string;
  candidate: string;
  headline: string;
  company: string;
  role: string;
  price: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [ok, setOk] = useState(false);
  const { terms: t, code } = props;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && props.onBack();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rows: [string, string][] = [
    ['Candidate', [props.candidate, props.headline].filter(Boolean).join(' — ')],
    ['Employer', props.company],
    ['Role', props.role],
    ['Place of work', [props.city, props.country].filter(Boolean).join(', ')],
    ['Potential visa route', props.routeName],
    ...t.items.map((i) => [OFFER_ITEM_LABEL[i.key], PAYER_LABEL[i.payer]] as [string, string]),
    ['Annual gross salary', t.salary ? money(t.salary, code) : 'Not stated'],
    ['Salary deduction', t.salaryOffset ? `Up to ${money(t.salaryOffset, code)} in year one` : 'None'],
    ['Repayment if you resign', t.repayMonths ? `Proposed: ${t.repayMonths} months, reducing monthly` : 'Not included'],
    ['Target start', `About ${t.startWeeks} weeks after the visa${t.remoteStart ? ' · open to a remote start' : ''}`],
  ];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-[80] grid place-items-center bg-ink-950/60 p-3" onClick={props.onBack}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 id="confirm-title" className="text-[18px] font-bold text-ink-950">
            Are these details correct?
          </h2>
          <p className="mt-1 text-[13px] text-ink-600">
            Check the name, the country and the place of work once more. This is your proposal to the company, not a contract; you can still correct it later, until the company accepts it.
          </p>
        </div>
        <dl className="flex-1 divide-y divide-ink-100 overflow-y-auto px-5 text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-500">{k}</dt>
              <dd className="text-right font-semibold text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-3 border-t border-ink-100 bg-ink-50 px-5 py-4">
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-ink-800">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1D4ED8]" />
            I’ve checked my name, the country, the place of work and these terms.
          </label>
          <div className="flex gap-2">
            <button onClick={props.onBack} className="flex-1 rounded-xl border border-ink-200 bg-white py-3 text-[14px] font-semibold text-ink-800 hover:bg-ink-50">
              Go back and edit
            </button>
            <button onClick={props.onConfirm} disabled={!ok} className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] py-3 text-[14px] font-bold text-white hover:bg-brand-800 disabled:opacity-50">
              <Download className="h-4 w-4" /> Save & download · {props.price}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Role · specialization · experience, from the profile. */
function headlineFromProfile(p: { occupation?: string | null; specialization?: string | null; experience?: string | null }): string {
  const role = [p.occupation, p.specialization].filter(Boolean).join(', ');
  // Only a short level ("5–10 years"), never a long written summary.
  const level = p.experience && EXPERIENCE_OPTIONS.includes(p.experience) ? p.experience : null;
  return [role, level].filter(Boolean).join(' · ').slice(0, 140);
}

/** Cost, balance and the one button: unlock + download. */
function PayBox({ credits, signedIn, usesPro, canPay, busy, error, onGo }: { credits: OfferCredits | null; signedIn: boolean; usesPro: boolean; canPay: boolean; busy: boolean; error: string | null; onGo: () => void }) {
  return (
    <div id="offer-pay" className="space-y-3">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-ink-200">
        <dl className="space-y-1.5 text-[14px]">
          <div className="flex justify-between">
            <dt className="text-ink-600">This document</dt>
            <dd className="font-semibold tabular-nums text-ink-950">{usesPro ? (credits?.pro ? 'Included in your plan' : 'Your free document this month') : canPay ? '1 kept document' : 'Membership'}</dd>
          </div>
          {credits && credits.quota > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-600">This month</dt>
              <dd className="font-semibold tabular-nums text-ink-950">
                {credits.proLeft} of {credits.quota} left
              </dd>
            </div>
          )}
          {/* Documents bought or earned before they became part of the plans. */}
          {credits && credits.docs > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-600">Free documents left</dt>
              <dd className="font-semibold tabular-nums text-ink-950">{docsLabel(credits.docs)}</dd>
            </div>
          )}
          {signedIn && credits && !canPay && (
            <div className="flex justify-between border-t border-ink-100 pt-1.5">
              <dt className="font-semibold text-rose-700">Used up this month</dt>
              <dd className="font-bold tabular-nums text-rose-700">{credits.pro ? 'Renews on the 1st' : 'Members: 20 a month'}</dd>
            </div>
          )}
        </dl>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
      <button onClick={onGo} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-3.5 text-[15px] font-bold text-white hover:bg-brand-800 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : canPay ? <Download className="h-4 w-4" /> : credits?.pro ? <Lock className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        {canPay ? 'Download PDF' : credits?.pro ? `All ${credits.quota} used this month` : 'Download PDF'}
      </button>
      <div className="flex items-center justify-between text-[12px] text-ink-500">
        <span>Free accounts get 1 document a month. Edit any of them later from your profile.</span>
        <OfferInfo />
      </div>
    </div>
  );
}

/**
 * Shown when someone without the plan asks for the download: the price for
 * their country and everything the plan covers, right where they are.
 */
function PlanSheet({ company, signedIn, onClose, onAuth }: { company: string; signedIn: boolean; onClose: () => void; onAuth?: Props['onAuth'] }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // On the page's top layer: the side panel it is opened from is sticky, which would keep it under the site header.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-950/50 sm:items-center sm:p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="plan-sheet-title" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ink-50 p-4 shadow-2xl sm:rounded-3xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="plan-sheet-title" className="text-[20px] font-bold leading-snug tracking-tight text-ink-950">
              Download your document{company ? ` for ${company}` : ''}
            </h2>
            <p className="mt-1 text-[13.5px] leading-5 text-ink-600">{signedIn ? 'This month’s free document is used. The membership includes 20 a month.' : 'Sign up free to download: every account gets 1 free document a month.'} Your document stays as you set it.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-6">
          <ProPlanCard plan="starter" source="document_download" onAuth={onAuth} />
        </div>
        {!signedIn && (
          <p className="mt-4 text-center text-[13px] text-ink-600">
            Already have a plan?{' '}
            <button onClick={() => onAuth?.('login')} className="font-semibold text-[#1D4ED8] hover:underline">
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The editable parts, shared by the new and saved document. */
function EditorPanels({
  ed,
  terms,
  code,
  onChange,
  onCommit,
  status,
  route,
  hideEmployer = false,
}: {
  ed: Editable;
  terms: OfferTerms;
  code: string;
  /** The route the document is written for: decides what can be said about each cost. */
  route?: VisaRoute;
  onChange: (p: Partial<Editable>) => void;
  onCommit?: (p: Partial<Editable>) => void;
  status?: string;
  /** The company block is shown separately (first) by the builder. */
  hideEmployer?: boolean;
}) {
  const both = (p: Partial<Editable>) => {
    onChange(p);
    onCommit?.(p);
  };
  return (
    <>
      <SplitControl
        split={ed.split}
        terms={terms}
        custom={Object.keys(ed.overrides).length > 0}
        onChange={(v) => onChange({ split: v, overrides: {} })}
        onCommit={onCommit ? (v) => onCommit({ split: v, overrides: {} }) : undefined}
        status={status}
      />
      <CostRows terms={terms} code={code} route={route} onPick={(key, payer) => both({ overrides: { ...ed.overrides, [key]: payer } })} />
      <SalaryControl code={code} salary={ed.salary} offset={ed.offset} onChange={onChange} onCommit={onCommit} />
      <RepayControl code={code} repay={ed.repay} canApply={terms.items.some((i) => i.payer !== 'candidate')} onChange={(repay) => both({ repay })} />
      {!hideEmployer && <EmployerControl value={ed.employer} onChange={(e) => both({ employer: e })} />}
    </>
  );
}

const DEFAULT_COUNTRY = 'DE';
const INPUT = 'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[14px] text-ink-900 outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15';

// ---------------------------------------------------------------------------
// Saved document: /brief/<share id> — owner edits, everyone else reads.
// ---------------------------------------------------------------------------

function SavedOffer({ shareId, go, onAuth }: Props) {
  const [brief, setBrief] = useState<PublicBrief | null | undefined>(undefined);
  const [ed, setEd] = useState<Editable | null>(null);
  // null = the server can't say (migration 20261130090000 not run): documents are still final there, so no editing and no "Confirmed".
  const [acc, setAcc] = useState<BriefAcceptance | null>(null);
  const [form, setForm] = useState({ name: '', headline: '', note: '' });
  const [dirty, setDirty] = useState(false);
  const [termsDirty, setTermsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const take = (b: PublicBrief) => {
    setBrief(b);
    setEd({
      split: b.split ?? legacySplit(b),
      // Only documents made before the terms were stored get the old slider-based window, so what was sent doesn't change.
      repay: b.terms ? b.terms.repayMonths ?? 0 : legacyRepay(b.split ?? legacySplit(b)),
      offset: b.terms?.salaryOffset ?? 0,
      salary: b.terms?.salary ?? 0,
      overrides: b.terms?.overrides ?? {},
      employer: b.terms?.employer ?? { name: b.company_name, publisherId: b.publisher_id },
    });
    setForm({ name: b.candidate_name, headline: b.candidate_headline ?? '', note: b.note ?? '' });
    setDirty(false);
    setTermsDirty(false);
  };

  useEffect(() => {
    let alive = true;
    let stopView: (() => void) | null = null;
    setBrief(undefined);
    setAcc(null);
    void fetchBriefAcceptance(shareId).then((a) => alive && setAcc(a));
    fetchBrief(shareId).then((b) => {
      if (!alive) return;
      if (!b) return setBrief(b);
      take(b);
      // Everyone, owner included: the server counts only real visitors who aren't the owner.
      stopView = recordBriefView(shareId);
      // Just generated → open the PDF dialog once.
      try {
        if (b.is_owner && window.sessionStorage.getItem(PRINT_ON_OPEN) === shareId) {
          window.sessionStorage.removeItem(PRINT_ON_OPEN);
          window.setTimeout(() => savePdf({ candidate: b.candidate_name, company: b.company_name, shareId }), 700);
        }
      } catch {
        /* ignore */
      }
    });
    return () => {
      alive = false;
      stopView?.();
    };
  }, [shareId]);

  const found = brief ? findRoute(brief.country_code, brief.route_id) : null;
  const allowed: CandidateCover[] = found?.route.employer?.candidateMayCover ?? [];
  const code = brief?.country_code ?? 'DE';
  // What everyone sees is the saved version; the owner's unsaved changes stay in the side panel until saved.
  const terms: OfferTerms | null = useMemo(() => {
    if (!brief || !ed) return null;
    return brief.terms ?? termsFrom(ed, allowed, code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, allowed.join(), code]);

  useSeo({
    title: brief ? `Sponsorship document — ${brief.candidate_name} for ${brief.job_title} at ${brief.company_name}` : 'Sponsorship document',
    description: 'A Visa Plan: a candidate’s sponsorship proposal, prepared on MadeVisa.',
    path: `/brief/${shareId}`,
    noindex: true,
  });

  if (brief === undefined) return <Desk go={go} onAuth={onAuth} loading />;
  if (!brief || !terms || !ed) return <NotFoundPage go={go} onAuth={onAuth} />;

  const confirmed = Boolean(acc?.acceptedAt);
  const doc: DocData = {
    ref: refFor(brief.share_id),
    issuedAt: brief.created_at,
    shareId: brief.share_id,
    jobTitle: brief.job_title,
    companyName: terms.employer?.name ?? brief.company_name,
    city: brief.job_city,
    candidateName: brief.candidate_name,
    headline: brief.candidate_headline,
    linkedin: brief.candidate_linkedin,
    note: brief.note,
  };

  const paper = found ? (
    <OfferDocument
      doc={doc}
      terms={terms}
      guide={found.guide}
      route={found.route}
      code={brief.country_code}
      approvedAt={acc?.editedAt ?? brief.terms_updated_at ?? brief.created_at}
      confirmed={acc}
      adCountryName={countryNameOf(terms.facts?.adCountry)}
    />
  ) : (
    <div className="rounded-sm bg-white p-10 text-[15px] text-ink-600 shadow-soft-lg">The visa details for this document are being updated.</div>
  );

  if (!brief.is_owner) {
    return (
      <Desk
        go={go}
        onAuth={onAuth}
        paper={paper}
        panel={<ReaderPanel brief={brief} acc={acc} onAccepted={() => void fetchBriefAcceptance(shareId).then(setAcc)} />}
      />
    );
  }

  // A saved change is a new version: the evidence stays with it, minus the ticks for anything that was changed.
  const edited = termsFrom(ed, allowed, code);
  const draftTerms: OfferTerms = termsDirty ? { ...edited, facts: reviseFacts(terms.facts, terms, edited), rev: (terms.rev ?? 0) + 1 } : terms;
  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    const a = dirty ? await updateBriefDetails(shareId, form) : { ok: true as const };
    // Changing only the name or the note is a new version too.
    const next: OfferTerms | null = termsDirty ? draftTerms : dirty && brief.terms ? { ...brief.terms, rev: (brief.terms.rev ?? 0) + 1 } : null;
    const t = a.ok && next ? await updateBriefTerms(shareId, next) : { ok: true as const };
    const [fresh, state] = await Promise.all([fetchBrief(shareId), fetchBriefAcceptance(shareId)]);
    setSaving(false);
    setAcc(state);
    if (!a.ok || !t.ok) return setSaveMsg({ ok: false, text: ('error' in a && a.error) || ('error' in t && t.error) || 'Couldn’t save. Try again.' });
    const kept = Boolean(fresh) && (!dirty || fresh!.candidate_name === form.name.trim().replace(/\s+/g, ' '));
    if (fresh) take(fresh);
    // The company may have accepted while this page was open: then nothing was changed.
    if (state?.acceptedAt) return setSaveMsg({ ok: false, text: 'The company has just accepted this document, so it can’t be changed any more.' });
    if (!kept) return setSaveMsg({ ok: false, text: 'The change wasn’t saved. Reload the page and try again.' });
    setSaveMsg({ ok: true, text: 'Saved. The company sees this version from now on.' });
  };

  return (
    <Desk
      go={go}
      onAuth={onAuth}
      paper={paper}
      panel={
        <>
          {confirmed && (
            <div className="rounded-xl bg-emerald-600 px-4 py-3.5 text-white">
              <p className="flex items-center gap-2 text-[15px] font-bold">
                <BadgeCheck className="h-5 w-5" /> Accepted in principle by {brief.company_name}
              </p>
              <p className="mt-1 text-[13px] leading-5 text-white/90">
                {acc?.acceptedBy ? `${acc.acceptedBy} accepted` : 'Accepted'} your proposal on {fmtDate(acc!.acceptedAt!)}
                {acc?.verified ? ', from a company email address.' : '. Their email isn’t on the company’s own domain — check who you are dealing with.'} This is not a job offer or a
                contract yet: the terms count once they are in your employment contract or a signed agreement.
              </p>
            </div>
          )}
          <OwnerActions brief={brief} onStatus={(status) => setBrief({ ...brief, status })} />
          {confirmed || acc === null ? (
            <>
              <div className="flex items-start gap-2 rounded-xl bg-ink-100 px-4 py-3 text-[13px] text-ink-700">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
                <span>
                  <strong className="text-ink-900">This proposal is fixed.</strong> {confirmed ? 'The company accepted it in principle, so it can’t be changed.' : `You approved it on ${fmtDate(brief.created_at)}; the company sees exactly this version.`}
                </span>
              </div>
              <fieldset disabled aria-label="Confirmed terms (read only)" className="pointer-events-none select-none space-y-4 opacity-55 grayscale">
                <EditorPanels ed={ed} terms={terms} code={code} route={found?.route} onChange={() => undefined} />
              </fieldset>
            </>
          ) : (
            <>
              <Panel>
                <p className="text-[15px] font-bold text-ink-950">Edit your document</p>
                <p className="mt-0.5 text-[12.5px] leading-5 text-ink-600">
                  This page is your edit link, and the document is also listed under Profile → Your sponsorship documents. Correct anything until the company accepts it: the link stays the same, nothing extra is counted, and each saved change gets a new version number (now v1.{terms.rev ?? 0}).
                </p>
                <label className="mt-3 block">
                  <span className="text-[13px] font-semibold text-ink-800">Full name, as in your passport</span>
                  <input
                    value={form.name}
                    maxLength={120}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      setDirty(true);
                    }}
                    className={INPUT}
                  />
                </label>
                <label className="mt-3 block">
                  <span className="text-[13px] font-semibold text-ink-800">Role and experience</span>
                  <input
                    value={form.headline}
                    maxLength={140}
                    onChange={(e) => {
                      setForm({ ...form, headline: e.target.value });
                      setDirty(true);
                    }}
                    className={INPUT}
                  />
                </label>
                <label className="mt-3 block">
                  <span className="text-[13px] font-semibold text-ink-800">Note to the hiring manager</span>
                  <textarea
                    value={form.note}
                    maxLength={600}
                    rows={2}
                    onChange={(e) => {
                      setForm({ ...form, note: e.target.value });
                      setDirty(true);
                    }}
                    className={INPUT}
                  />
                </label>
              </Panel>
              <EditorPanels
                ed={ed}
                terms={draftTerms}
                code={code}
                route={found?.route}
                onChange={(p) => {
                  setEd({ ...ed, ...p });
                  setTermsDirty(true);
                }}
              />
              <div className="sticky bottom-3 space-y-2">
                {saveMsg && <p className={`rounded-lg px-3 py-2 text-[13px] ${saveMsg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{saveMsg.text}</p>}
                {(dirty || termsDirty) && (
                  <button onClick={() => void save()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-950 px-4 py-3.5 text-[15px] font-bold text-white shadow-lg hover:bg-ink-800 disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes
                  </button>
                )}
              </div>
            </>
          )}
        </>
      }
    />
  );
}

/** Documents made before October 2026 took the repayment window from the slider. Kept only so those read as they were sent. */
const legacyRepay = (split: number) => (split < 30 ? 0 : split < 65 ? 12 : 24);

/** Briefs made before the slider: place them from what the candidate covered. */
function legacySplit(b: PublicBrief): number {
  return Math.min(95, 20 + b.covers.length * 15 + (b.remote_first ? 10 : 0));
}

// ---------------------------------------------------------------------------
// Layout: a desk with the paper on it, controls to the side.
// ---------------------------------------------------------------------------

function Desk({
  go,
  onAuth,
  paper,
  panel,
  banner,
  loading,
  panelFirstOnMobile = false,
}: {
  go: Props['go'];
  onAuth: Props['onAuth'];
  /** A full-width line under the site header (not printed). */
  banner?: ReactNode;
  paper?: ReactNode;
  panel?: ReactNode;
  loading?: boolean;
  /** Builder on phones: settings first (company, terms), the full document preview at the end. */
  panelFirstOnMobile?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#e9edf3] text-ink-900 print:bg-white">
      <div className="print:hidden">
        <LandingHeader go={go} onAuth={onAuth} />
        {!loading && banner}
      </div>
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-3 py-6 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_340px] print:block print:max-w-none print:p-0">
        <div className={`min-w-0 ${panelFirstOnMobile ? 'order-last lg:order-none' : ''}`}>
          {panelFirstOnMobile && !loading && (
            <div className="mb-3 flex items-baseline justify-between gap-2 px-1 lg:hidden print:hidden">
              <p className="text-[17px] font-bold text-ink-950">Document preview</p>
              <p className="text-[12px] text-ink-500">Updates as you change the terms</p>
            </div>
          )}
          {loading ? (
            <div className="grid min-h-[70vh] place-items-center rounded-sm bg-white shadow-soft-lg">
              <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
            </div>
          ) : (
            paper
          )}
        </div>
        {!loading && <aside className="space-y-4 lg:sticky lg:top-[88px] lg:self-start print:hidden">{panel}</aside>}
      </div>
    </div>
  );
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-ink-200 ${className}`}>{children}</div>;
}

/**
 * Top of the builder: where you're moving (your flag › the job's country)
 * and the recommended, balanced conditions for this company — the
 * default, so nobody starts from a blank page.
 */
function RecommendedPanel({
  company,
  from,
  to,
  toName,
  terms,
  code,
  active,
  onApply,
}: {
  company: string;
  from: string | null;
  to: string;
  toName: string;
  terms: OfferTerms;
  code: string;
  active: boolean;
  onApply: () => void;
}) {
  const fromName = from ? allCountries.find((c) => c.code === from)?.name ?? from : null;
  const groups: { payer: Payer; label: string; tone: string }[] = [
    { payer: 'employer', label: 'Proposed for the employer', tone: 'bg-[#1D4ED8] text-white' },
    { payer: 'shared', label: 'Shared 50/50', tone: 'bg-[#1D4ED8]/10 text-[#1D4ED8]' },
    { payer: 'candidate', label: 'You cover', tone: 'bg-ink-100 text-ink-700' },
  ];
  return (
    <Panel className="ring-2 ring-emerald-300">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-700">
        {from && from !== to ? (
          <>
            <CircleFlag countryCode={from} size={22} label={fromName ?? from} />
            <span className="truncate">{fromName}</span>
            <ChevronRightIcon />
          </>
        ) : null}
        <CircleFlag countryCode={to} size={22} label={toName} />
        <span className="truncate">{toName}</span>
      </div>
      <p className="mt-3 text-[16px] font-bold leading-snug text-ink-950">Suggested starting point for {company}</p>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-600">
        A balanced proposal: you offer to take the smaller costs, and propose that {company} takes the larger ones. Costs the law puts on the employer always stay with the employer.
        It is a suggestion from MadeVisa, not a rule. Change anything below.
      </p>
      <ul className="mt-3 space-y-2">
        {groups.map((g) => {
          const items = terms.items.filter((i) => i.payer === g.payer);
          if (!items.length) return null;
          return (
            <li key={g.payer} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] leading-5 text-ink-800">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${g.tone}`}>{g.label}</span>
              <span>{items.map((i) => OFFER_ITEM_LABEL[i.key]).join(', ')}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-ink-500">
        Target start about {terms.startWeeks} weeks after the visa{terms.repayMonths ? ` · repayment proposed over ${terms.repayMonths} months` : ' · no repayment term'}
        {terms.remoteStart ? ' · open to a remote start' : ''} · pay in {currencyFor(code).code}
      </p>
      <div className="mt-3">
        {active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Using the suggested terms
          </span>
        ) : (
          <button onClick={onApply} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-emerald-700">
            Use the suggested terms
          </button>
        )}
      </div>
    </Panel>
  );
}

/** "2 for the employer · 1 shared · 2 for you": counts of cost lines, not a share of money. */
function payCount(terms: OfferTerms): string {
  const n = (p: Payer) => terms.items.filter((i) => i.payer === p).length;
  return [n('employer') ? `${n('employer')} for the employer` : null, n('shared') ? `${n('shared')} shared` : null, n('candidate') ? `${n('candidate')} for you` : null].filter(Boolean).join(' · ') || 'No shareable costs on this route';
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink-400" aria-label="to" role="img">
      <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The drag bar: left favours the candidate, right the company. */
function SplitControl({ split, terms, custom, onChange, onCommit, status }: { split: number; terms: OfferTerms; custom?: boolean; onChange: (v: number) => void; onCommit?: (v: number) => void; status?: string }) {
  return (
    <Panel className="ring-[#1D4ED8]/30">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-bold text-ink-950">Who pays what</p>
        {status && status !== 'idle' && (
          <span className={`text-[12px] font-semibold ${status === 'saved' ? 'text-emerald-600' : status === 'saving' ? 'text-ink-400' : 'text-rose-600'}`}>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status}
          </span>
        )}
      </div>
      <DragSlider
        value={split}
        onChange={onChange}
        onCommit={onCommit}
        label="Balance of the plan between you and the company"
        valueText={`${splitWord(split)}; ${payCount(terms)}`}
        bubble={custom ? 'Custom' : splitWord(split)}
        left="Better for you"
        right="Better for the company"
      />
      <p className="mt-3 text-center text-[12.5px] font-semibold text-ink-700">{payCount(terms)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-center">
        <Stat k="Target start after visa" v={`about ${terms.startWeeks} wks`} />
        <Stat k="Open to a remote start" v={terms.remoteStart ? 'Yes' : 'No'} />
      </dl>
      <p className="mt-2 text-[12px] leading-5 text-ink-500">The slider moves costs one at a time between the company and you. The document lists each cost on its own line, with the basis for it.</p>
    </Panel>
  );
}

/** Checked countries first, then every other country ("Choose another country"). */
function CountrySelect({ value, jobCode, onChange, id }: { value: string; jobCode?: string; onChange: (code: string) => void; id?: string }) {
  const checked = [...briefCountries].map((c) => ({ code: c, name: visaGuideByCode.get(c)?.name ?? c })).sort((a, b) => a.name.localeCompare(b.name));
  const others = allCountries.filter((c) => !briefCountries.has(c.code));
  const job = jobCode ? allCountries.find((c) => c.code === jobCode) : undefined;
  return (
    <div className="mt-1 flex items-center gap-2">
      <CircleFlag countryCode={value} size={22} />
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${INPUT} mt-0`}>
        {job && !briefCountries.has(job.code) && (
          <optgroup label="This job’s country">
            <option value={job.code}>{job.name}</option>
          </optgroup>
        )}
        <optgroup label="Checked visa routes">
          {checked.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Choose another country">
          {others
            .filter((c) => c.code !== job?.code)
            .map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
        </optgroup>
      </select>
    </div>
  );
}

/** Each cost row, set by hand (overrides the slider until it's dragged again), with the basis for it. */
function CostRows({ terms, code, route, onPick }: { terms: OfferTerms; code: string; route?: VisaRoute; onPick: (key: CandidateCover, payer: Payer) => void }) {
  const opts: { v: Payer; l: string }[] = [
    { v: 'employer', l: 'Employer' },
    { v: 'shared', l: '50/50' },
    { v: 'candidate', l: 'Me' },
  ];
  const generic = !route || route.id === GENERIC_ROUTE_ID;
  const country = withThe(countryNameOf(code) ?? 'this country');
  const byLaw = generic ? null : route.employer?.employerCosts ?? null;
  return (
    <Panel>
      <p className="text-[15px] font-bold text-ink-950">Cost responsibility</p>
      <p className="mt-0.5 text-[12px] leading-5 text-ink-500">
        {generic
          ? `We have not checked which costs a candidate may pay in ${country}. The document says so on every cost you offer to pay or share.`
          : 'Our check of this route lists these as costs a candidate may pay or share. Each one is your proposal; the company can answer differently.'}
      </p>
      <ul className="mt-3 space-y-2.5">
        <li className="rounded-lg bg-ink-50 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
            <Lock className="h-3.5 w-3.5 shrink-0 text-ink-500" /> Employer only
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-ink-600">
            {byLaw ?? `Any fee or charge the law of ${country} puts on the employer.`} Anything the law puts on the employer can’t be moved to you, and the document never asks you to repay it.
          </p>
        </li>
        {terms.items.map((it) => (
          <li key={it.key}>
            <p className="text-[13px] font-medium text-ink-800">{OFFER_ITEM_LABEL[it.key]}</p>
            <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-ink-100 p-0.5" role="radiogroup" aria-label={`Who pays: ${OFFER_ITEM_LABEL[it.key]}`}>
              {opts.map((o) => (
                <button
                  key={o.v}
                  role="radio"
                  aria-checked={it.payer === o.v}
                  onClick={() => it.payer !== o.v && onPick(it.key, o.v)}
                  className={`rounded-md py-1.5 text-[12px] font-bold ${it.payer === o.v ? 'bg-white text-[#1D4ED8] shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {generic && it.payer !== 'employer' && (
              <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-4 text-amber-800">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> Not checked for {country}: this may not be allowed there. Confirm before you agree to it.
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Repayment if the candidate resigns. Never added by itself: whether such a
 * term is allowed depends on the country, the route and the cost, and we
 * have not checked that anywhere. The candidate may still propose one.
 */
function RepayControl({ code, repay, canApply, onChange }: { code: string; repay: number; canApply: boolean; onChange: (months: number) => void }) {
  const country = withThe(countryNameOf(code) ?? 'this country');
  const choices = [0, 6, 12, 18, 24, 36].filter((m) => m <= MAX_REPAY_MONTHS);
  const options = choices.includes(repay) ? choices : [...choices, repay].sort((a, b) => a - b);
  return (
    <Panel>
      <label className="block">
        <span className="text-[15px] font-bold text-ink-950">Repayment if you resign (optional)</span>
        <span className="block text-[12px] leading-5 text-ink-500">Some candidates offer to repay part of what the company paid if they leave early. Leave it out unless you want to offer it.</span>
        <select id="offer-repay" value={canApply ? repay : 0} disabled={!canApply} onChange={(e) => onChange(Number(e.target.value))} className={INPUT}>
          {options.map((m) => (
            <option key={m} value={m}>
              {m === 0 ? 'Not included' : `I offer to repay, reducing each month, if I resign within ${m} months`}
            </option>
          ))}
        </select>
      </label>
      {!canApply ? (
        <p className="mt-2 text-[12px] leading-5 text-ink-500">You offer to pay every shareable cost yourself, so there is nothing to repay.</p>
      ) : repay ? (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            MadeVisa can’t tell whether a repayment term is allowed in {country}. The document prints it as your proposal and marks it “Professional review recommended”.
          </span>
        </p>
      ) : null}
    </Panel>
  );
}

/** Stated salary (editable — job ads can be wrong) and the optional deduction. */
function SalaryControl({ code, salary, offset, onChange, onCommit }: { code: string; salary: number; offset: number; onChange: (p: Partial<Editable>) => void; onCommit?: (p: Partial<Editable>) => void }) {
  const cur = currencyFor(code);
  const toPct = (amount: number) => Math.min(100, Math.round((amount / cur.max) * 100));
  const toAmount = (pct: number) => Math.round(((pct / 100) * cur.max) / cur.step) * cur.step;
  const pctOfSalary = salary && offset ? Math.round((offset / salary) * 1000) / 10 : null;
  const num = (v: string) => Math.max(0, Math.min(10_000_000, Math.round(Number(v.replace(/[^\d.]/g, '')) || 0)));
  return (
    <Panel>
      <label className="block">
        <span className="text-[15px] font-bold text-ink-950">Annual gross salary</span>
        <span className="block text-[12px] leading-5 text-ink-500">As offered or advertised. Leave it empty if you don’t know it: the document then says “Not stated”. We never work a salary out for you.</span>
        <div className="mt-1 flex items-center rounded-lg border border-ink-200 bg-white focus-within:border-[#1D4ED8]">
          <span className="pl-3 text-[14px] text-ink-500">{cur.symbol.trim()}</span>
          <input
            id="offer-salary"
            inputMode="numeric"
            value={salary ? salary.toLocaleString('en-GB') : ''}
            placeholder="Not stated"
            onChange={(e) => onChange({ salary: num(e.target.value) })}
            onBlur={(e) => onCommit?.({ salary: num(e.target.value) })}
            className="w-full bg-transparent px-2 py-2 text-[14px] text-ink-900 outline-none"
          />
        </div>
      </label>

      <div className="mt-4 border-t border-ink-100 pt-3">
        <p className="text-[15px] font-bold text-ink-950">Salary deduction (optional)</p>
        <p className="text-[12px] leading-5 text-ink-500">
          The most you would agree the employer may deduct from your gross pay in the first 12 months, only to recover visa costs it paid. Whether pay deductions are allowed depends on the
          country; the document marks this “Professional review recommended”.
        </p>
        <DragSlider
          size="sm"
          tone={offset ? 'green' : 'grey'}
          value={toPct(offset)}
          step={(cur.step / cur.max) * 100}
          onChange={(p) => onChange({ offset: toAmount(p) })}
          onCommit={onCommit ? (p) => onCommit({ offset: toAmount(p) }) : undefined}
          label="Maximum salary deduction in the first year"
          valueText={offset ? `Up to ${money(offset, code)}` : 'No deduction'}
          bubble={offset ? `Up to ${money(offset, code)}` : 'None'}
          left="None"
          right={money(cur.max, code)}
        />
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-lg border border-ink-200 bg-white focus-within:border-[#1D4ED8]">
            <span className="pl-3 text-[13px] text-ink-500">{cur.symbol.trim()}</span>
            <input
              inputMode="numeric"
              aria-label="Exact deduction amount"
              value={offset ? offset.toLocaleString('en-GB') : ''}
              placeholder="0"
              onChange={(e) => onChange({ offset: Math.min(num(e.target.value), 1_000_000) })}
              onBlur={(e) => onCommit?.({ offset: Math.min(num(e.target.value), 1_000_000) })}
              className="w-full bg-transparent px-2 py-1.5 text-[13px] text-ink-900 outline-none"
            />
          </div>
          {pctOfSalary != null && <span className="shrink-0 text-[12px] font-semibold text-ink-600">{pctOfSalary}% of salary</span>}
        </div>
      </div>
    </Panel>
  );
}

/** Who the offer is for: prefilled from the job, searchable across MadeVisa companies. */
function EmployerControl({ value, onChange }: { value: OfferEmployer; onChange: (e: OfferEmployer) => void }) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PublisherMatch[]>([]);
  useEffect(() => {
    if (!editing || q.trim().length < 2) return setHits([]);
    const t = window.setTimeout(() => searchPublishers(q).then(setHits), 200);
    return () => window.clearTimeout(t);
  }, [q, editing]);

  const pick = async (m: PublisherMatch) => {
    const e = await employerFromPublisher(m.id, m.name);
    onChange({ ...e, contact: value.publisherId === m.id ? value.contact : null });
    setEditing(false);
    setQ('');
  };

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-bold text-ink-950">Company</p>
        <button onClick={() => setEditing((v) => !v)} className="text-[13px] font-semibold text-[#1D4ED8] hover:underline">
          {editing ? 'Cancel' : 'Change'}
        </button>
      </div>
      {!editing ? (
        <div className="mt-2 flex items-center gap-3">
          {value.logo ? (
            <img src={value.logo} alt="" className="h-9 w-9 rounded-md object-contain ring-1 ring-ink-100" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-md bg-ink-100 text-[14px] font-bold text-ink-600">{value.name.slice(0, 1)}</span>
          )}
          <div className="min-w-0 text-[13px]">
            <p className="truncate font-semibold text-ink-900">{value.name}</p>
            <p className="truncate text-ink-500">{[cleanWebsite(value.website), value.hq].filter(Boolean).join(' · ') || 'Details added from MadeVisa when available'}</p>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search MadeVisa companies" className={INPUT} />
          <ul className="mt-1 max-h-56 overflow-y-auto">
            {hits.map((m) => (
              <li key={m.id}>
                <button onClick={() => void pick(m)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-[13px] hover:bg-[#1D4ED8]/5">
                  <span className="truncate font-semibold text-ink-900">{m.name}</span>
                  <span className="shrink-0 text-ink-400">{m.country?.name ?? ''}</span>
                </button>
              </li>
            ))}
            {q.trim().length >= 2 && (
              <li>
                <button
                  onClick={() => {
                    onChange({ name: q.trim().slice(0, 200), publisherId: null });
                    setEditing(false);
                    setQ('');
                  }}
                  className="w-full rounded-md px-2 py-2 text-left text-[13px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/5"
                >
                  + Add “{q.trim()}”
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
      <label className="mt-3 block">
        <span className="text-[12px] font-semibold text-ink-600">HR contact (optional)</span>
        <input
          defaultValue={value.contact ?? ''}
          key={value.name}
          onBlur={(e) => e.target.value.trim() !== (value.contact ?? '') && onChange({ ...value, contact: e.target.value.trim().slice(0, 160) || null })}
          placeholder="name@company.com"
          className={INPUT}
        />
      </label>
    </Panel>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-[#1D4ED8]/[0.06] px-2 py-2">
      <dd className="text-[15px] font-bold tabular-nums text-ink-950">{v}</dd>
      <dt className="text-[11px] text-ink-500">{k}</dt>
    </div>
  );
}

function savePdf(doc: { candidate: string; company: string; shareId: string }) {
  void recordOfferPdf(doc.shareId);
  const before = document.title;
  document.title = `Visa Plan — ${doc.candidate} — ${doc.company}`;
  window.print();
  window.setTimeout(() => (document.title = before), 500);
}

function OwnerActions({ brief, onStatus }: { brief: PublicBrief; onStatus: (s: BriefStatus) => void }) {
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);
  const url = briefUrl(brief.share_id);
  const markSent = () => {
    if (brief.status === 'created') {
      onStatus('sent');
      void updateBriefStatus(brief.share_id, 'sent');
    }
  };
  const copy = async (what: 'link' | 'message') => {
    await navigator.clipboard.writeText(what === 'link' ? url : briefMessage(brief, url));
    setCopied(what);
    window.setTimeout(() => setCopied(null), 2000);
    markSent();
  };
  const btn = 'flex items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-ink-800 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]';

  return (
    <>
      <button
        onClick={() => {
          savePdf({ candidate: brief.candidate_name, company: brief.company_name, shareId: brief.share_id });
          markSent();
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-3.5 text-[15px] font-bold text-white hover:bg-brand-800"
      >
        <Download className="h-4 w-4" /> Save as PDF
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => copy('link')} className={btn}>
          {copied === 'link' ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />} {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
        <button onClick={() => copy('message')} className={btn}>
          {copied === 'message' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied === 'message' ? 'Copied' : 'Copy message'}
        </button>
      </div>

      <OwnerReplies shareId={brief.share_id} />

      <Panel>
        <p className="flex items-center gap-2 text-[13px] font-bold text-ink-950">
          <Paperclip className="h-4 w-4 text-[#1D4ED8]" /> Attach it when you apply
        </p>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-600">Upload the PDF as “Other document” or next to your CV. No upload field? Paste the link in your cover letter.</p>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="font-semibold text-ink-700">Status</span>
          <select
            value={brief.status ?? 'created'}
            onChange={async (e) => {
              const s = e.target.value as BriefStatus;
              const res = await updateBriefStatus(brief.share_id, s);
              if (res.ok) onStatus(s);
            }}
            aria-label="Visa Plan status"
            className="rounded-md border border-ink-200 bg-white px-2 py-1 font-semibold text-ink-900"
          >
            {BRIEF_STATUS_CHOICES.map((s) => (
              <option key={s} value={s}>
                {BRIEF_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-ink-500">Once it’s marked Sent, {brief.company_name} can also see it in its free MadeVisa employer inbox.</p>
        <button
          onClick={async () => {
            if (!window.confirm('Withdraw this proposal? The link will stop working. It still counts towards your allowance.')) return;
            const res = await withdrawBrief(brief.share_id);
            if (res.ok) nav('/profile');
          }}
          className="mt-3 text-[12px] font-semibold text-ink-400 hover:text-rose-600"
        >
          Withdraw proposal
        </button>
      </Panel>
    </>
  );
}

function ReaderPanel({ brief, acc, onAccepted }: { brief: PublicBrief; acc: BriefAcceptance | null; onAccepted: () => void }) {
  return (
    <>
      {acc?.acceptedAt && (
        <div className="rounded-xl bg-emerald-600 px-4 py-3.5 text-white">
          <p className="flex items-center gap-2 text-[15px] font-bold">
            <BadgeCheck className="h-5 w-5" /> Accepted in principle
          </p>
          <p className="mt-1 text-[13px] leading-5 text-white/90">
            {acc.acceptedBy ? `${acc.acceptedBy} accepted` : 'The Employer accepted'} this proposal on {fmtDate(acc.acceptedAt)}. It can no longer be changed. It is not an employment contract.
          </p>
        </div>
      )}
      <EmployerReply
        shareId={brief.share_id}
        candidateName={brief.candidate_name}
        candidateLinkedin={brief.candidate_linkedin}
        onSavePdf={() => savePdf({ candidate: brief.candidate_name, company: brief.company_name, shareId: brief.share_id })}
        canAccept={acc !== null && !acc.acceptedAt}
        onAccepted={onAccepted}
      />
      <p className="px-1 text-[12px] leading-5 text-ink-500">
        Need help with the paperwork? Find a verified immigration adviser in the{' '}
        <a href="/network?tab=experts" onClick={(e) => (e.preventDefault(), nav('/network?tab=experts'))} className="font-semibold text-[#1D4ED8]">
          MadeVisa Network
        </a>
        .
      </p>
    </>
  );
}
