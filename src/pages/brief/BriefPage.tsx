import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download, Link2, Loader2, Lock, Paperclip, Unlock } from 'lucide-react';
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
import { type CandidateCover, type VisaGuide, type VisaRoute } from '@/data/visa';
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
  fetchMyBriefForJob,
  findRoute,
  recordBriefView,
  updateBriefStatus,
  withdrawBrief,
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
  pingNotifications,
  recommendedSplit,
  recordOfferDraft,
  recordOfferPdf,
  splitWord,
  type OfferCredits,
  type OfferEmployer,
  type OfferTerms,
  type Payer,
} from '@/lib/sponsorOffer';
import { searchPublishers, type PublisherMatch } from '@/lib/companyExperiences';
import { visaGuideByCode } from '@/data/visa';
import { allCountries } from '@/data/allCountries';
import { nav } from '@/lib/pageLayout';
import { EXPERIENCE_OPTIONS } from '@/lib/plans';
import { usePersonalization } from '@/lib/personalization';

type Props = { shareId: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

/** Everything the document prints, whether it's a draft or saved. */
type DocData = {
  ref: string;
  issuedAt: string;
  shareId: string | null;
  jobTitle: string;
  companyName: string;
  city: string | null;
  candidateName: string;
  headline: string | null;
  linkedin: string | null;
  note: string | null;
};

const VALID_DAYS = 30;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const refFor = (id: string) => `MV-${id.slice(0, 4).toUpperCase()}-${id.slice(4, 8).toUpperCase()}`;

export function BriefPage(props: Props) {
  return props.shareId === 'new' ? <NewOffer {...props} /> : <SavedOffer {...props} />;
}

// ---------------------------------------------------------------------------
// New offer: /brief/new?job=<id>
// Custom offer (any company, no job on MadeVisa):
//   /brief/new?custom=1&company=…&title=…&country=XX&city=…&pub=<publisher id>
// ---------------------------------------------------------------------------

/** Everything the candidate can change on the document. */
type Editable = {
  split: number;
  offset: number;
  salary: number;
  overrides: Partial<Record<CandidateCover, Payer>>;
  employer: OfferEmployer;
};

const termsFrom = (e: Editable, allowed: CandidateCover[], code: string): OfferTerms => ({
  ...buildTerms(e.split, allowed, e.overrides),
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
        job: { id: string; publisherId: string | null; title: string; company: string; fn: string | null; city: string | null; ownCode: string; contact: string | null; closed: boolean };
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
  // Starts on the recommended, balanced terms until the candidate changes them.
  const [useRec, setUseRec] = useState(true);
  const { profile: visitor } = usePersonalization();

  useSeo({ title: 'Prepare your sponsorship document', description: 'Create a sponsorship cost-sharing offer for an employer.', path: '/brief/new', noindex: true });

  useEffect(() => {
    let alive = true;
    if (custom) {
      // A company you picked or typed yourself — nothing to load.
      const company = (params.get('company') ?? '').trim();
      const pub = params.get('pub');
      const code = (params.get('country') ?? '').toUpperCase();
      const job = { id: '', publisherId: pub, title: roleTitle, company, fn: null, city: (params.get('city') ?? '').trim() || null, ownCode: code, contact: null, closed: false };
      setState({ k: 'ready', job, raw: { salary_min: null, salary_max: null, salary_currency: null, salary_period: null } });
      setEd({ split: 50, offset: 0, salary: 0, overrides: {}, employer: { name: company, publisherId: pub, contact: null, logo: null } });
      if (pub) employerFromPublisher(pub, company).then((e) => alive && setEd((d) => (d ? { ...d, employer: e } : d)));
      return () => {
        alive = false;
      };
    }
    if (!jobId) return setState({ k: 'missing' });
    fetchSponsoredJobById(jobId).then(async (raw) => {
      if (!alive) return;
      if (!raw) return setState({ k: 'missing' });
      const board = sponsoredJobToBoardJob(raw);
      const mine = await fetchMyBriefForJob(raw.id);
      if (mine) return nav(briefPath(mine.share_id));
      void recordOfferDraft(raw.id);
      const city = raw.city && !/^(all|any|various|remote)$/i.test(raw.city.trim()) ? raw.city : null;
      const contact = raw.contact_email && !/madevisa/i.test(raw.contact_email) ? raw.contact_email : null;
      const job = { id: raw.id, publisherId: raw.publisher_id ?? null, title: board.title, company: board.company, fn: raw.job_function ?? null, city, ownCode: (raw.country?.iso_code ?? '').toUpperCase(), contact, closed: Boolean(board.closed) };
      const salaryRaw = { salary_min: raw.salary_min, salary_max: raw.salary_max, salary_currency: raw.salary_currency, salary_period: raw.salary_period as string | null };
      setState({ k: 'ready', job, raw: salaryRaw });
      setEd({ split: 50, offset: 0, salary: 0, overrides: {}, employer: { name: board.company, publisherId: job.publisherId, contact, logo: raw.publisher?.logo_url ?? null } });
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
    setEd(d.ed);
    setName(d.name);
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
  const terms = termsFrom(edNow, allowed, el.code);
  const recTerms = termsFrom({ ...ed, split: recSplit, overrides: {} }, allowed, el.code);
  const isRecommended = edNow.split === recSplit && Object.keys(edNow.overrides).length === 0;
  const usesPro = Boolean(credits?.pro && credits.proLeft > 0);
  const canPay = canMakeDocument(credits);

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
  const review = () => {
    if (!session) {
      saveOfferDraft({ ed, name, headline, note, country, routeId, useRec, roleTitle });
      rememberAuthIntent({ reason: 'offer', next: `${window.location.pathname}${window.location.search}` });
      return onAuth?.('register');
    }
    if (!canPay) return nav('/offers#buy');
    if (!name.trim()) return setError('Add the name the employer should see.');
    if (!job.title) return setError('Add the role you are applying for.');
    if (!ed.employer.name.trim()) return setError('Add the company this document is for.');
    setError(null);
    setConfirming(true);
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

  return (
    <Desk
      go={go}
      onAuth={onAuth}
      panelFirstOnMobile
      paper={<OfferDocument doc={doc} terms={terms} guide={guide} route={route} code={el.code} locked />}
      panel={
        <>
          <RecommendedPanel
            company={ed.employer.name || job.company || 'this company'}
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
          <EmployerControl value={ed.employer} onChange={(e) => patch({ employer: e })} />
          {custom && (
            <Panel>
              <p className="text-[15px] font-bold text-ink-950">Custom offer</p>
              <p className="mt-0.5 text-[12px] leading-5 text-ink-500">For a company or role that isn’t on MadeVisa. Change the company name in Company above.</p>
              <label className="mt-2 block">
                <span className="text-[13px] font-semibold text-ink-800">Role you’re applying for</span>
                <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} maxLength={300} placeholder="e.g. Data Engineer" className={INPUT} />
              </label>
            </Panel>
          )}
          <Panel>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-800">Where will you work?</span>
              <CountrySelect
                value={el.code}
                jobCode={job.ownCode}
                onChange={(c) => {
                  setCountry(c);
                  setRouteId('');
                  patch({ offset: 0, salary: salaryFromJob(ready.raw, c), overrides: {} });
                }}
              />
            </label>
            {!el.checked && <p className="mt-2 text-[12px] leading-5 text-ink-500">General work-permit terms. The company confirms the exact route.</p>}
            {routes.length > 1 && (
              <label className="mt-3 block">
                <span className="text-[13px] font-semibold text-ink-800">Visa route</span>
                <select value={route.id} onChange={(e) => setRouteId(e.target.value)} className={INPUT}>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.employer?.licenceNeeded ? '· sponsor licence' : '· no licence'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Panel>

          <EditorPanels ed={edNow} terms={terms} code={el.code} onChange={patch} hideEmployer />

          <Panel>
            <p className="text-[15px] font-bold text-ink-950">About you</p>
            <label className="mt-2 block">
              <span className="text-[13px] font-semibold text-ink-800">Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className="text-[13px] font-semibold text-ink-800">Role and experience</span>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} placeholder="Backend engineer · 5–10 years" className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className="text-[13px] font-semibold text-ink-800">Note to the hiring manager</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} rows={2} placeholder="Optional" className={INPUT} />
            </label>
          </Panel>

          <PayBox
            credits={credits}
            signedIn={Boolean(session)}
            usesPro={usesPro}
            canPay={canPay}
            busy={busy}
            error={error}
            onGo={review}
          />
          {confirming && (
            <ConfirmTerms
              terms={terms}
              code={el.code}
              country={guide.name}
              routeName={route.id === GENERIC_ROUTE_ID ? 'National work permit (to be confirmed)' : route.name}
              candidate={name.trim()}
              headline={headline.trim()}
              company={ed.employer.name}
              role={job.title}
              price={usesPro ? 'Included in Pro' : '1 credit'}
              onBack={() => setConfirming(false)}
              onConfirm={() => void generate()}
            />
          )}
        </>
      }
    />
  );
}

/** Last look before paying: the document can't be changed afterwards. */
function ConfirmTerms(props: {
  terms: OfferTerms;
  code: string;
  country: string;
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
    ['Place of work', `${props.country} · ${props.routeName}`],
    ...t.items.map((i) => [OFFER_ITEM_LABEL[i.key], PAYER_LABEL[i.payer]] as [string, string]),
    ['Annual gross salary', t.salary ? money(t.salary, code) : 'Not stated'],
    ['Salary deduction', t.salaryOffset ? `Up to ${money(t.salaryOffset, code)} in year one` : 'None'],
    ['Repayment window', t.repayMonths ? `${t.repayMonths} months, reducing monthly` : 'None'],
    ['Start after visa', `Within ${t.startWeeks} weeks${t.remoteStart ? ' · remote start offered' : ''}`],
  ];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-[80] grid place-items-center bg-ink-950/60 p-3" onClick={props.onBack}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 id="confirm-title" className="text-[18px] font-bold text-ink-950">
            Are these details correct?
          </h2>
          <p className="mt-1 text-[13px] text-ink-600">Once you approve, the document is final. It can’t be edited later — the company will see exactly this.</p>
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
            I’ve checked these terms and understand they can’t be changed after I approve.
          </label>
          <div className="flex gap-2">
            <button onClick={props.onBack} className="flex-1 rounded-xl border border-ink-200 bg-white py-3 text-[14px] font-semibold text-ink-800 hover:bg-ink-50">
              Go back and edit
            </button>
            <button onClick={props.onConfirm} disabled={!ok} className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] py-3 text-[14px] font-bold text-white hover:bg-brand-800 disabled:opacity-50">
              <Lock className="h-4 w-4" /> Approve & pay · {props.price}
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
    <div className="space-y-3">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-ink-200">
        <dl className="space-y-1.5 text-[14px]">
          <div className="flex justify-between">
            <dt className="text-ink-600">This document</dt>
            <dd className="font-semibold tabular-nums text-ink-950">{usesPro ? 'Included in Pro' : '1 credit'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-600">Your credits</dt>
            <dd className="font-semibold tabular-nums text-ink-950">{signedIn ? (credits ? credits.docs : '…') : '1 free on sign-up'}</dd>
          </div>
          {credits?.pro && (
            <div className="flex justify-between">
              <dt className="text-ink-600">Pro this month</dt>
              <dd className="font-semibold tabular-nums text-ink-950">{credits.proLeft} left</dd>
            </div>
          )}
          {signedIn && credits && !canPay && (
            <div className="flex justify-between border-t border-ink-100 pt-1.5">
              <dt className="font-semibold text-rose-700">Needed</dt>
              <dd className="font-bold tabular-nums text-rose-700">1 credit</dd>
            </div>
          )}
        </dl>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
      <button onClick={onGo} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-3.5 text-[15px] font-bold text-white hover:bg-brand-800 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : canPay ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        {!signedIn
          ? 'Sign up · your first document is free'
          : canPay
            ? `Prepare & download · ${usesPro ? 'Pro' : '1 credit'}`
            : 'Get credits to unlock'}
      </button>
      <div className="flex items-center justify-between text-[12px] text-ink-500">
        <span>You review everything before using a credit. After that it’s final.</span>
        <OfferInfo />
      </div>
    </div>
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
  hideEmployer = false,
}: {
  ed: Editable;
  terms: OfferTerms;
  code: string;
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
      <CostRows terms={terms} salary={ed.salary} code={code} onPick={(key, payer) => both({ overrides: { ...ed.overrides, [key]: payer } })} />
      <SalaryControl code={code} salary={ed.salary} offset={ed.offset} onChange={onChange} onCommit={onCommit} />
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

  useEffect(() => {
    let alive = true;
    let stopView: (() => void) | null = null;
    setBrief(undefined);
    fetchBrief(shareId).then((b) => {
      if (!alive) return;
      setBrief(b);
      if (!b) return;
      setEd({
        split: b.split ?? legacySplit(b),
        offset: b.terms?.salaryOffset ?? 0,
        salary: b.terms?.salary ?? 0,
        overrides: b.terms?.overrides ?? {},
        employer: b.terms?.employer ?? { name: b.company_name, publisherId: b.publisher_id },
      });
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
  // Saved documents are final: everyone sees exactly what was approved.
  const terms: OfferTerms | null = useMemo(() => {
    if (!brief || !ed) return null;
    return brief.terms ?? termsFrom(ed, allowed, code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, ed, allowed.join(), code]);

  useSeo({
    title: brief ? `Sponsorship document — ${brief.candidate_name} for ${brief.job_title} at ${brief.company_name}` : 'Sponsorship document',
    description: 'A sponsorship cost-sharing offer prepared by a candidate on MadeVisa.',
    path: `/brief/${shareId}`,
    noindex: true,
  });

  if (brief === undefined) return <Desk go={go} onAuth={onAuth} loading />;
  if (!brief || !terms || !ed) return <NotFoundPage go={go} onAuth={onAuth} />;

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
    <OfferDocument doc={doc} terms={terms} guide={found.guide} route={found.route} code={brief.country_code} approvedAt={brief.created_at} />
  ) : (
    <div className="rounded-sm bg-white p-10 text-[15px] text-ink-600 shadow-soft-lg">The visa details for this document are being updated.</div>
  );

  if (!brief.is_owner) {
    return <Desk go={go} onAuth={onAuth} paper={paper} panel={<ReaderPanel brief={brief} />} />;
  }

  return (
    <Desk
      go={go}
      onAuth={onAuth}
      paper={paper}
      panel={
        <>
          <OwnerActions brief={brief} onStatus={(status) => setBrief({ ...brief, status })} />
          <div className="flex items-start gap-2 rounded-xl bg-ink-100 px-4 py-3 text-[13px] text-ink-700">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
            <span>
              <strong className="text-ink-900">Terms are final.</strong> You approved them on {fmtDate(brief.created_at)}. They can’t be changed; the company sees exactly this version.
            </span>
          </div>
          {/* Shown for reference, greyed out and not editable. */}
          <fieldset disabled aria-label="Approved terms (read only)" className="pointer-events-none select-none space-y-4 opacity-55 grayscale">
            <EditorPanels ed={ed} terms={terms} code={code} onChange={() => undefined} />
          </fieldset>
        </>
      }
    />
  );
}

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
  loading,
  panelFirstOnMobile = false,
}: {
  go: Props['go'];
  onAuth: Props['onAuth'];
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
    { payer: 'employer', label: 'Employer pays', tone: 'bg-[#1D4ED8] text-white' },
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
      <p className="mt-3 text-[16px] font-bold leading-snug text-ink-950">Recommended conditions for {company}</p>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-600">
        A balanced start most employers can say yes to: you carry about {terms.candidateShare}% of the shareable costs, {company} keeps what the law expects of an
        employer. Adjust anything below.
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
        Start within {terms.startWeeks} weeks of the visa{terms.repayMonths ? ` · repay window ${terms.repayMonths} months` : ''}
        {terms.remoteStart ? ' · remote start offered' : ''} · pay in {currencyFor(code).code}
      </p>
      <div className="mt-3">
        {active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Using the recommended terms
          </span>
        ) : (
          <button onClick={onApply} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-emerald-700">
            Use recommended terms
          </button>
        )}
      </div>
    </Panel>
  );
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
        label="Balance of the offer between you and the company"
        valueText={`${splitWord(split)}; you carry ${terms.candidateShare}% of shareable costs`}
        bubble={`${custom ? 'Custom' : splitWord(split)} · you ${terms.candidateShare}%`}
        left="Better for you"
        right="Better for the company"
      />
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat k="Repay window" v={terms.repayMonths ? `${terms.repayMonths} mo` : 'None'} />
        <Stat k="Start after visa" v={`${terms.startWeeks} wks`} />
        <Stat k="Remote start" v={terms.remoteStart ? 'Yes' : 'No'} />
      </dl>
    </Panel>
  );
}

/** Checked countries first, then every other country ("Choose another country"). */
function CountrySelect({ value, jobCode, onChange }: { value: string; jobCode?: string; onChange: (code: string) => void }) {
  const checked = [...briefCountries].map((c) => ({ code: c, name: visaGuideByCode.get(c)?.name ?? c })).sort((a, b) => a.name.localeCompare(b.name));
  const others = allCountries.filter((c) => !briefCountries.has(c.code));
  const job = jobCode ? allCountries.find((c) => c.code === jobCode) : undefined;
  return (
    <div className="mt-1 flex items-center gap-2">
      <CircleFlag countryCode={value} size={22} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${INPUT} mt-0`}>
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

/** Each cost row, set by hand (overrides the slider until it's dragged again). */
function CostRows({ terms, salary, code, onPick }: { terms: OfferTerms; salary: number; code: string; onPick: (key: CandidateCover, payer: Payer) => void }) {
  const opts: { v: Payer; l: string }[] = [
    { v: 'employer', l: 'Employer' },
    { v: 'shared', l: '50/50' },
    { v: 'candidate', l: 'Me' },
  ];
  return (
    <Panel>
      <p className="text-[15px] font-bold text-ink-950">Each cost</p>
      <ul className="mt-2 space-y-2.5">
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
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 border-t border-ink-100 pt-2.5 text-[13px]">
          <span className="font-medium text-ink-800">Salary and employment conditions</span>
          <span className="shrink-0 text-ink-500">{salary ? `${money(salary, code)} / yr` : 'Set by employer'}</span>
        </li>
      </ul>
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
        <span className="block text-[12px] text-ink-500">As offered or advertised. Correct it if the job ad is wrong.</span>
        <div className="mt-1 flex items-center rounded-lg border border-ink-200 bg-white focus-within:border-[#1D4ED8]">
          <span className="pl-3 text-[14px] text-ink-500">{cur.symbol.trim()}</span>
          <input
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
        <p className="text-[12px] leading-5 text-ink-500">The most you agree the employer may deduct from your gross pay in the first 12 months, only to recover visa costs it paid.</p>
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
  document.title = `Sponsor offer — ${doc.candidate} — ${doc.company}`;
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
            aria-label="Offer status"
            className="rounded-md border border-ink-200 bg-white px-2 py-1 font-semibold text-ink-900"
          >
            {BRIEF_STATUS_CHOICES.map((s) => (
              <option key={s} value={s}>
                {BRIEF_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={async () => {
            if (!window.confirm('Withdraw this offer? The link will stop working. The credit isn’t returned.')) return;
            const res = await withdrawBrief(brief.share_id);
            if (res.ok) nav('/profile');
          }}
          className="mt-3 text-[12px] font-semibold text-ink-400 hover:text-rose-600"
        >
          Withdraw offer
        </button>
      </Panel>
    </>
  );
}

function ReaderPanel({ brief }: { brief: PublicBrief }) {
  return (
    <>
      <EmployerReply
        shareId={brief.share_id}
        candidateName={brief.candidate_name}
        candidateLinkedin={brief.candidate_linkedin}
        onSavePdf={() => savePdf({ candidate: brief.candidate_name, company: brief.company_name, shareId: brief.share_id })}
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

// ---------------------------------------------------------------------------
// The document itself — what prints.
// ---------------------------------------------------------------------------

function OfferDocument({ doc, terms, guide, route, code, locked, approvedAt }: { doc: DocData; terms: OfferTerms; guide: VisaGuide; route: VisaRoute; code: string; locked?: boolean; approvedAt?: string | null }) {
  const employer = route.employer!;
  const place = [doc.city, guide.name].filter(Boolean).join(', ');
  const validUntil = new Date(Date.parse(doc.issuedAt) + VALID_DAYS * 86_400_000).toISOString();
  const employerPays = terms.items.filter((i) => i.payer !== 'candidate');
  let n = 0;
  const clause = () => ++n;

  const L = Boolean(locked);

  return (
    <>
    {L && (
      <div className="offer-paper hidden p-10 font-sans text-[14px] print:block">
        This is a preview. Prepare the document on madevisa.com to download the signed-ready PDF.
      </div>
    )}
    <article
      onContextMenu={L ? (e) => e.preventDefault() : undefined}
      className={`${L ? 'select-none print:hidden' : 'offer-paper'} relative mx-auto max-w-[820px] overflow-hidden rounded-sm bg-white px-6 py-8 font-serif text-[15px] leading-[1.7] text-ink-900 shadow-soft-lg sm:px-14 sm:py-14 print:max-w-none print:rounded-none print:p-0 print:shadow-none`}
    >
      {L && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-around overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="-rotate-12 whitespace-nowrap font-sans text-[56px] font-black tracking-widest text-[#1D4ED8]/[0.06] sm:text-[88px]">
              PREVIEW · PREVIEW
            </span>
          ))}
        </div>
      )}

      {/* Letterhead */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink-900 pb-4 font-sans">
        <div>
          <p className="text-[18px] font-extrabold tracking-tight text-ink-950">
            made<span className="text-[#1D4ED8]">visa</span>
          </p>
          <p className="text-[12px] text-ink-500">Sponsorship agreement</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[12px] leading-5 text-ink-600">
          <dt>Reference</dt>
          <dd className="font-semibold tabular-nums text-ink-900">{doc.ref}</dd>
          <dt>Issued</dt>
          <dd className="text-ink-900">{fmtDate(doc.issuedAt)}</dd>
          <dt>Valid until</dt>
          <dd className="text-ink-900">{fmtDate(validUntil)}</dd>
        </dl>
      </header>

      <h1 className="mt-8 text-[30px] font-semibold leading-[1.15] tracking-tight text-ink-950 sm:text-[38px]" style={{ fontVariationSettings: '"opsz" 144' }}>
        Sponsorship cost-sharing agreement
      </h1>
      <p className="mt-3 font-sans text-[15px] leading-7 text-ink-700">
        Between <strong className="text-ink-950">{doc.candidateName}</strong> (the Candidate) and <strong className="text-ink-950">{doc.companyName}</strong> (the Employer), for the
        role of <strong className="text-ink-950">{doc.jobTitle}</strong> in {guide.name}.
      </p>
      <p className="mt-2 inline-flex flex-wrap items-center gap-2 font-sans text-[13px]">
        {approvedAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 print:bg-transparent print:px-0">
            <Check className="h-3.5 w-3.5" /> Approved by the Candidate on {fmtDate(approvedAt)}
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">Preview · not yet approved</span>
        )}
        <span className="text-ink-500">Binding once signed by both parties</span>
      </p>

      {/* Parties */}
      <dl className="mt-8 grid gap-x-8 gap-y-4 border-y border-ink-200 py-5 font-sans text-[14px] sm:grid-cols-2">
        <Party k="Candidate" v={doc.candidateName} sub={doc.headline} />
        <Party
          k="Employer"
          v={doc.companyName}
          sub={[cleanWebsite(terms.employer?.website), terms.employer?.hq ? `HQ ${terms.employer.hq}` : null, terms.employer?.contact].filter(Boolean).join(' · ') || null}
        />
        <Party k="Position" v={doc.jobTitle} />
        <Party
          k="Place of work"
          v={
            <span className="inline-flex items-center gap-2">
              <CircleFlag countryCode={code} label={guide.name} size={18} /> {place}
            </span>
          }
        />
        <Party
          k="Visa route"
          v={route.id === GENERIC_ROUTE_ID ? 'National work permit (to be confirmed)' : route.name}
          sub={
            route.url ? (
              <a href={route.url} target="_blank" rel="noopener noreferrer" className="break-all text-[12px] text-[#1D4ED8] print:text-ink-700">
                {route.url}
              </a>
            ) : null
          }
        />
        <Party k="Sponsor licence" v={route.id === GENERIC_ROUTE_ID ? 'To be confirmed by the Employer' : employer.licenceNeeded ? 'Required' : 'Not required'} />
        {terms.salary ? <Party k="Annual gross salary (as offered)" v={money(terms.salary, code)} sub="To be confirmed in the employment contract" /> : null}
      </dl>

      {/* The split, at a glance */}
      <div className="mt-6 font-sans">
        <div className="flex justify-between text-[12px] font-semibold text-ink-600">
          <span>Employer {100 - terms.candidateShare}%</span>
          <span>Candidate {terms.candidateShare}%</span>
        </div>
        <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-ink-100 print:border print:border-ink-300">
          <span className="bg-[#1D4ED8] transition-[width] duration-300" style={{ width: `${100 - terms.candidateShare}%` }} />
          <span className="bg-[#1D4ED8]/25 transition-[width] duration-300" style={{ width: `${terms.candidateShare}%` }} />
        </div>
        <p className="mt-1.5 text-[12px] text-ink-500">Share of the costs in clause 4, weighted by their usual size.</p>
      </div>

      <Clause n={clause()} title="Purpose">
        The Candidate proposes these terms so that the Employer can hire them for the position above through the {route.name} in {guide.name}. The offer covers who carries the cost and
        effort of the visa process. It does not change pay or any other term of employment.
      </Clause>

      <Clause n={clause()} title="What the Employer does" locked={L}>
        <ol className="mt-1 space-y-1.5">
          {employer.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-8 shrink-0 font-sans text-[13px] font-semibold tabular-nums text-ink-500">
                {n}.{i + 1}
              </span>
              <span>
                {s.text}
                {s.optional && <span className="font-sans text-[12px] text-ink-500"> (if needed)</span>}
              </span>
            </li>
          ))}
        </ol>
        {employer.licenceNote && <p className="mt-2">{employer.licenceNote}</p>}
        <p className="mt-2">Expected timeline: {employer.timeline}</p>
      </Clause>

      <Clause n={clause()} title="Costs the Employer carries by law" locked={L}>
        {employer.employerCosts ?? 'None beyond the Employer’s own administrative time.'} These costs are outside this offer and will not be recovered from the Candidate, whether through
        salary deductions, repayment or otherwise.
      </Clause>

      <Clause n={clause()} title="Sharing of visa-related costs">
        <table className="mt-2 w-full border-collapse font-sans text-[14px]">
          <thead>
            <tr className="border-b border-ink-900 text-left text-[12px] text-ink-600">
              <th className="py-2 pr-3 font-semibold">Cost</th>
              <th className="py-2 font-semibold">Paid by</th>
            </tr>
          </thead>
          <tbody>
            {terms.items.map((it) => (
              <tr key={it.key} className="border-b border-ink-200">
                <td className="py-2.5 pr-3 text-ink-800">{OFFER_ITEM_LABEL[it.key]}</td>
                <td className="py-2.5">
                  <span key={it.payer} className={`offer-flash inline-flex rounded px-2 py-0.5 text-[13px] font-semibold ${PAYER_TONE[it.payer]}`}>
                    {PAYER_LABEL[it.payer]}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="border-b border-ink-200">
              <td className="py-2.5 pr-3 text-ink-800">Salary and employment conditions</td>
              <td className="py-2.5 text-[13px] font-semibold text-ink-600">{terms.salary ? `${money(terms.salary, code)} a year, per the employment contract` : 'Set by the Employer; not changed by this offer'}</td>
            </tr>
          </tbody>
        </table>
        <p className={`mt-3 ${L ? 'hidden' : ''}`}>
          Where the Employer pays, it pays the provider directly or reimburses the Candidate within 30 days of receiving receipts. Where a cost is shared, each party pays half against
          receipts.
        </p>
      </Clause>

      <Clause n={clause()} title="Repayment" locked={L}>
        {terms.repayMonths && employerPays.length ? (
          <>
            If the Candidate resigns within {terms.repayMonths} months of starting, they repay the costs the Employer actually paid under clause 4, reduced by one {terms.repayMonths === 12 ? 'twelfth' : 'twenty-fourth'} for
            each full month worked. Nothing is repaid if the Employer ends the employment for any reason other than the Candidate’s gross misconduct. Repayment never covers costs in
            clause 3 and may not take pay below the legal minimum or the visa salary threshold.
          </>
        ) : (
          <>Costs the Employer pays under clause 4 are not repayable by the Candidate.</>
        )}
      </Clause>

      {terms.salaryOffset ? (
        <Clause n={clause()} title="Salary deduction" locked={L}>
          Subject to the Candidate’s prior written consent, the Employer may deduct from the Candidate’s gross salary, during the first twelve (12) months of employment, an aggregate
          amount not exceeding {money(terms.salaryOffset, code)}
          {terms.salary ? ` (approximately ${Math.round((terms.salaryOffset / terms.salary) * 1000) / 10}% of the stated annual gross salary)` : ''}, in equal monthly
          instalments and solely to recover costs actually paid by the Employer under clause 4. Deductions shall cease once those costs have been recovered in full; shall not apply to
          any cost referred to in clause 3; and shall not reduce the Candidate’s pay below the applicable statutory minimum wage or the salary required for the {route.name}. Any amount so
          deducted shall be credited against any repayment due under clause 5.
        </Clause>
      ) : null}

      <Clause n={clause()} title="Start" locked={L}>
        The Candidate can start work in {guide.name} within {terms.startWeeks} weeks of the visa being granted.
        {terms.remoteStart && (
          <>
            {' '}
            Until then, the Candidate offers to start remotely from their country of residence, as an independent contractor or through an Employer of Record, where the law there
            allows. That work is not work in {guide.name} and needs no visa.
          </>
        )}
      </Clause>

      <Clause n={clause()} title="Pay and fair recruitment" locked={L}>
        Pay and conditions are set by the Employer and must meet the {route.name} requirements and the law of {guide.name}. Nothing in this offer lowers them. No recruitment fee is
        charged to the Candidate, and the Candidate keeps their own identity and travel documents.
      </Clause>

      {doc.note && (
        <Clause n={clause()} title="Note from the Candidate" locked={L}>
          <span className="whitespace-pre-line italic">{doc.note}</span>
        </Clause>
      )}

      <Clause n={clause()} title="Status of this offer" locked={L}>
        This is a proposal, not a contract. It becomes binding only when both parties sign it, or when its terms are written into the employment contract. It is governed by the law of{' '}
        {guide.name} and is valid for {VALID_DAYS} days from issue. It was prepared with MadeVisa from official government sources and is not legal advice; check the details with the
        official source or a qualified immigration adviser before signing.
      </Clause>

      {/* Printed only: the company replies in one click (links stay clickable in PDFs). */}
      {doc.shareId && !L && (
        <a
          href={`https://madevisa.com${briefPath(doc.shareId)}`}
          className="mt-8 hidden break-inside-avoid items-center justify-between gap-4 rounded-lg border-2 border-[#1D4ED8] px-5 py-4 font-sans no-underline print:flex"
        >
          <span>
            <span className="block text-[14px] font-bold text-ink-950">Reply to {doc.candidateName.split(/\s+/)[0]} in one click</span>
            <span className="block text-[12px] text-ink-600">Interested · Need more information · Not right now — no account needed</span>
          </span>
          <span className="shrink-0 text-[13px] font-bold text-[#1D4ED8]">madevisa.com{briefPath(doc.shareId)}</span>
        </a>
      )}

      {/* Signatures */}
      {L ? (
        <section className="mt-10 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#1D4ED8]/30 bg-[#1D4ED8]/[0.03] px-4 py-8 font-sans text-[14px] font-semibold text-[#1D4ED8]">
          <Lock className="h-4 w-4" /> Full wording and signature lines unlock when you prepare the document
        </section>
      ) : (
        <section className="mt-10 grid gap-10 break-inside-avoid font-sans text-[13px] sm:grid-cols-2">
          <Sign who="Candidate" name={doc.candidateName} />
          <Sign who={`For ${doc.companyName}`} />
        </section>
      )}

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 pt-3 font-sans text-[11px] text-ink-500">
        <span>
          {doc.ref}
          {doc.shareId ? ` · Check the current version at madevisa.com${briefPath(doc.shareId)}` : ''}
        </span>
        {doc.linkedin && <span className="hidden print:inline">{doc.linkedin}</span>}
      </footer>
    </article>
    </>
  );
}

const PAYER_TONE: Record<string, string> = {
  employer: 'bg-[#1D4ED8] text-white print:bg-transparent print:p-0 print:text-ink-900',
  shared: 'bg-[#1D4ED8]/15 text-[#1D4ED8] print:bg-transparent print:p-0 print:text-ink-900',
  candidate: 'bg-ink-100 text-ink-800 print:bg-transparent print:p-0 print:text-ink-900',
};

function Party({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-500">{k}</dt>
      <dd className="mt-0.5 font-semibold text-ink-950">{v}</dd>
      {sub && <dd className="text-[13px] text-ink-600">{sub}</dd>}
    </div>
  );
}

function Clause({ n, title, children, locked }: { n: number; title: string; children: ReactNode; locked?: boolean }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2 className="flex gap-3 font-sans text-[15px] font-bold text-ink-950">
        <span className="w-8 shrink-0 tabular-nums text-[#1D4ED8] print:text-ink-900">{n}.</span>
        {title}
      </h2>
      {locked ? (
        // Preview: the wording isn't in the page at all until it's prepared.
        <div className="mt-2.5 space-y-2 pl-11" aria-label="Unlocks when you prepare the document">
          {[92, 100, 78].map((w, i) => (
            <span key={i} className="block h-2.5 rounded-full bg-ink-100" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        <div className="mt-1.5 pl-11 text-ink-800">{children}</div>
      )}
    </section>
  );
}

function Sign({ who, name }: { who: string; name?: string }) {
  return (
    <div>
      <p className="font-semibold text-ink-950">{who}</p>
      <div className="mt-10 border-b border-ink-900" />
      <p className="mt-1 text-ink-500">Signature</p>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <div className="h-5 border-b border-ink-400 text-ink-900">{name}</div>
          <p className="mt-1 text-ink-500">Name{name ? '' : ' and title'}</p>
        </div>
        <div>
          <div className="h-5 border-b border-ink-400" />
          <p className="mt-1 text-ink-500">Date</p>
        </div>
      </div>
    </div>
  );
}
