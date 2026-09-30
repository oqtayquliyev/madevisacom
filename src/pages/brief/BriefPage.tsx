import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, Download, ExternalLink, Eye, Link2, Loader2, Paperclip } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/lib/auth';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { CircleFlag } from '@/components/common/CircleFlag';
import { LinkedInLogo } from '@/components/common/LinkedInLogo';
import { DragSlider } from '@/components/common/DragSlider';
import { CreditMeter, OfferInfo } from '@/components/briefs/OfferBits';
import { type CandidateCover, type VisaGuide, type VisaRoute } from '@/data/visa';
import { fetchSponsoredJobById, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import {
  BRIEF_STATUS_CHOICES,
  BRIEF_STATUS_LABEL,
  briefEligibility,
  briefMessage,
  briefPath,
  briefUrl,
  createBrief,
  fetchBrief,
  fetchMyBriefForJob,
  findRoute,
  recordBriefView,
  updateBriefStatus,
  updateBriefTerms,
  withdrawBrief,
  type BriefStatus,
  type PublicBrief,
} from '@/lib/briefs';
import { buildTerms, fetchOfferCredits, OFFER_ITEM_LABEL, PAYER_LABEL, pingNotifications, splitWord, type OfferCredits, type OfferTerms } from '@/lib/sponsorOffer';
import { nav } from '@/lib/pageLayout';

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
// ---------------------------------------------------------------------------

function NewOffer({ go, onAuth }: Props) {
  const { session, profile, loading: authLoading } = useAuth();
  const jobId = new URLSearchParams(window.location.search).get('job') ?? '';
  const [state, setState] = useState<
    | { k: 'loading' }
    | { k: 'missing' }
    | { k: 'ready'; job: { id: string; publisherId: string | null; title: string; company: string; fn: string | null; city: string | null; code: string }; guide: VisaGuide; routes: VisaRoute[] }
  >({ k: 'loading' });
  const [routeId, setRouteId] = useState<string>('');
  const [split, setSplit] = useState(50);
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [note, setNote] = useState('');
  const [credits, setCredits] = useState<OfferCredits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSeo({ title: 'Prepare your sponsor offer', description: 'Create a sponsorship cost-sharing offer for an employer.', path: '/brief/new', noindex: true });

  useEffect(() => {
    let alive = true;
    if (!jobId) return setState({ k: 'missing' });
    fetchSponsoredJobById(jobId).then(async (raw) => {
      if (!alive) return;
      if (!raw) return setState({ k: 'missing' });
      const board = sponsoredJobToBoardJob(raw);
      const code = (raw.country?.iso_code ?? '').toUpperCase();
      const el = briefEligibility({ countryCode: code, visa: raw.visa_status ?? (raw.visa_sponsorship ? 'offered' : null), closed: Boolean(board.closed) });
      if (!el.ok) return setState({ k: 'missing' });
      // Already made one for this job → open it instead of spending a credit.
      const mine = await fetchMyBriefForJob(raw.id);
      if (mine) return nav(briefPath(mine.share_id));
      setRouteId(el.routes[0].id);
      const city = raw.city && !/^(all|any|various|remote)$/i.test(raw.city.trim()) ? raw.city : null;
      setState({ k: 'ready', job: { id: raw.id, publisherId: raw.publisher_id ?? null, title: board.title, company: board.company, fn: raw.job_function ?? null, city, code }, guide: el.guide, routes: el.routes });
    });
    return () => {
      alive = false;
    };
  }, [jobId]);

  useEffect(() => {
    if (!profile) return;
    setName((n) => n || profile.full_name || '');
    setHeadline((h) => h || profile.network_headline || profile.occupation || '');
  }, [profile]);

  useEffect(() => {
    if (session) fetchOfferCredits().then(setCredits);
  }, [session]);

  if (state.k === 'missing') return <NotFoundPage go={go} onAuth={onAuth} />;
  if (state.k === 'loading' || authLoading) return <Desk go={go} onAuth={onAuth} loading />;

  const { job, guide, routes } = state;
  const route = routes.find((r) => r.id === routeId) ?? routes[0];
  const allowed = route.employer!.candidateMayCover;
  const terms = buildTerms(split, allowed);
  const noCredits = credits && !credits.unlimited && credits.left === 0;

  const doc: DocData = {
    ref: 'MV-DRAFT',
    issuedAt: new Date().toISOString(),
    shareId: null,
    jobTitle: job.title,
    companyName: job.company,
    city: job.city,
    candidateName: name.trim() || 'Your name',
    headline: headline.trim() || null,
    linkedin: null,
    note: note.trim() || null,
  };

  const generate = async () => {
    if (!session) return onAuth?.('register');
    if (!name.trim()) return setError('Add the name the employer should see.');
    setBusy(true);
    setError(null);
    const res = await createBrief({
      jobId: job.id,
      publisherId: job.publisherId,
      jobTitle: job.title,
      companyName: job.company,
      jobFunction: job.fn,
      jobCity: job.city,
      countryCode: job.code,
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
    window.history.replaceState({}, '', briefPath(res.shareId));
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const input = 'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[14px] text-ink-900 outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15';

  return (
    <Desk
      go={go}
      onAuth={onAuth}
      paper={<OfferDocument doc={doc} terms={terms} guide={guide} route={route} code={job.code} draft />}
      panel={
        <>
          <SplitControl split={split} terms={terms} onChange={setSplit} />

          <Panel>
            {routes.length > 1 && (
              <label className="block">
                <span className="text-[13px] font-semibold text-ink-800">Visa route</span>
                <select value={route.id} onChange={(e) => setRouteId(e.target.value)} className={input}>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.employer?.licenceNeeded ? '· sponsor licence' : '· no licence'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="mt-3 block first:mt-0">
              <span className="text-[13px] font-semibold text-ink-800">Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={input} />
            </label>
            <label className="mt-3 block">
              <span className="text-[13px] font-semibold text-ink-800">Headline</span>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} placeholder="Backend engineer, 6 years in fintech" className={input} />
            </label>
            <label className="mt-3 block">
              <span className="text-[13px] font-semibold text-ink-800">Note to the hiring manager</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} rows={2} placeholder="Optional" className={input} />
            </label>
          </Panel>

          <div className="space-y-3">
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
            {noCredits ? (
              <a href="/pricing#offers" onClick={(e) => (e.preventDefault(), nav('/pricing#offers'))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-3.5 text-[15px] font-bold text-white hover:bg-brand-800">
                Get more offers
              </a>
            ) : (
              <button onClick={generate} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-3.5 text-[15px] font-bold text-white hover:bg-brand-800 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {session ? (credits?.unlimited ? 'Generate offer' : 'Generate offer · 1 credit') : 'Sign up to generate — 5 free'}
              </button>
            )}
            <div className="flex items-center justify-between">
              {credits ? <CreditMeter credits={credits} /> : <span />}
              <OfferInfo />
            </div>
          </div>
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Saved offer: /brief/<share id> — owner edits, everyone else reads.
// ---------------------------------------------------------------------------

function SavedOffer({ shareId, go, onAuth }: Props) {
  const [brief, setBrief] = useState<PublicBrief | null | undefined>(undefined);
  const [split, setSplit] = useState(50);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | string>('idle');

  useEffect(() => {
    let alive = true;
    setBrief(undefined);
    fetchBrief(shareId).then((b) => {
      if (!alive) return;
      setBrief(b);
      if (!b) return;
      setSplit(b.split ?? legacySplit(b));
      if (!b.is_owner) recordBriefView(shareId);
    });
    return () => {
      alive = false;
    };
  }, [shareId]);

  const found = brief ? findRoute(brief.country_code, brief.route_id) : null;
  const allowed: CandidateCover[] = found?.route.employer?.candidateMayCover ?? [];
  // Owners see live terms; everyone else sees exactly what was saved.
  const terms: OfferTerms | null = useMemo(() => {
    if (!brief) return null;
    if (brief.is_owner) return buildTerms(split, allowed);
    return brief.terms ?? buildTerms(brief.split ?? legacySplit(brief), allowed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, split, allowed.join()]);

  useSeo({
    title: brief ? `Sponsor offer — ${brief.candidate_name} for ${brief.job_title} at ${brief.company_name}` : 'Sponsor offer',
    description: 'A sponsorship cost-sharing offer prepared by a candidate on MadeVisa.',
    path: `/brief/${shareId}`,
    noindex: true,
  });

  if (brief === undefined) return <Desk go={go} onAuth={onAuth} loading />;
  if (!brief || !terms) return <NotFoundPage go={go} onAuth={onAuth} />;

  const doc: DocData = {
    ref: refFor(brief.share_id),
    issuedAt: brief.created_at,
    shareId: brief.share_id,
    jobTitle: brief.job_title,
    companyName: brief.company_name,
    city: brief.job_city,
    candidateName: brief.candidate_name,
    headline: brief.candidate_headline,
    linkedin: brief.candidate_linkedin,
    note: brief.note,
  };

  const commit = async (v: number) => {
    setSaved('saving');
    const res = await updateBriefTerms(brief.share_id, v, allowed);
    if (res.ok) {
      setBrief({ ...brief, split: v, terms: res.terms });
      setSaved('saved');
      window.setTimeout(() => setSaved((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } else setSaved(res.error ?? 'Could not save');
  };

  const paper = found ? (
    <OfferDocument doc={doc} terms={terms} guide={found.guide} route={found.route} code={brief.country_code} />
  ) : (
    <div className="rounded-sm bg-white p-10 text-[15px] text-ink-600 shadow-soft-lg">The visa details for this offer are being updated.</div>
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
          <SplitControl split={split} terms={terms} onChange={setSplit} onCommit={commit} status={saved} />
          <OwnerActions brief={brief} onStatus={(status) => setBrief({ ...brief, status })} />
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

function Desk({ go, onAuth, paper, panel, loading }: { go: Props['go']; onAuth: Props['onAuth']; paper?: ReactNode; panel?: ReactNode; loading?: boolean }) {
  return (
    <div className="min-h-screen bg-[#e9edf3] text-ink-900 print:bg-white">
      <div className="print:hidden">
        <LandingHeader go={go} onAuth={onAuth} />
      </div>
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-3 py-6 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_340px] print:block print:max-w-none print:p-0">
        <div className="min-w-0">
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

/** The drag bar: left favours the candidate, right the company. */
function SplitControl({ split, terms, onChange, onCommit, status }: { split: number; terms: OfferTerms; onChange: (v: number) => void; onCommit?: (v: number) => void; status?: string }) {
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
        bubble={`${splitWord(split)} · you ${terms.candidateShare}%`}
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

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-[#1D4ED8]/[0.06] px-2 py-2">
      <dd className="text-[15px] font-bold tabular-nums text-ink-950">{v}</dd>
      <dt className="text-[11px] text-ink-500">{k}</dt>
    </div>
  );
}

function savePdf(doc: { candidate: string; company: string }) {
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
          savePdf({ candidate: brief.candidate_name, company: brief.company_name });
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

      <Panel>
        <p className="flex items-center gap-2 text-[13px] font-bold text-ink-950">
          <Paperclip className="h-4 w-4 text-[#1D4ED8]" /> Attach it when you apply
        </p>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-600">Upload the PDF as “Other document” or next to your CV. No upload field? Paste the link in your cover letter.</p>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="inline-flex items-center gap-1.5 text-ink-600">
            <Eye className="h-4 w-4 text-ink-400" /> {brief.view_count ?? 0} {brief.view_count === 1 ? 'open' : 'opens'} by others
          </span>
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
  const first = brief.candidate_name.split(/\s+/)[0];
  return (
    <>
      <Panel>
        <p className="text-[15px] font-bold text-ink-950">Interested?</p>
        <p className="mt-1 text-[13px] leading-5 text-ink-600">Sign the PDF and send it back to {first}, or reply with changes. Nothing is binding until both sides sign.</p>
        <button onClick={() => savePdf({ candidate: brief.candidate_name, company: brief.company_name })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-3 text-[14px] font-bold text-white hover:bg-brand-800">
          <Download className="h-4 w-4" /> Save as PDF
        </button>
        {brief.candidate_linkedin && (
          <a href={brief.candidate_linkedin} target="_blank" rel="noopener noreferrer" className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 px-4 py-2.5 text-[14px] font-semibold text-ink-800 hover:border-[#1D4ED8]/40">
            <LinkedInLogo size={16} /> Message {first}
          </a>
        )}
      </Panel>
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

function OfferDocument({ doc, terms, guide, route, code, draft }: { doc: DocData; terms: OfferTerms; guide: VisaGuide; route: VisaRoute; code: string; draft?: boolean }) {
  const employer = route.employer!;
  const place = [doc.city, guide.name].filter(Boolean).join(', ');
  const validUntil = new Date(Date.parse(doc.issuedAt) + VALID_DAYS * 86_400_000).toISOString();
  const employerPays = terms.items.filter((i) => i.payer !== 'candidate');
  let n = 0;
  const clause = () => ++n;

  return (
    <article className="offer-paper relative mx-auto max-w-[820px] rounded-sm bg-white px-6 py-8 font-serif text-[15px] leading-[1.7] text-ink-900 shadow-soft-lg sm:px-14 sm:py-14 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
      {draft && (
        <span aria-hidden="true" className="pointer-events-none absolute right-6 top-6 rotate-6 rounded border-2 border-[#1D4ED8]/30 px-2 py-0.5 font-sans text-[11px] font-bold tracking-wide text-[#1D4ED8]/50 sm:right-10 sm:top-10">
          Draft
        </span>
      )}

      {/* Letterhead */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink-900 pb-4 font-sans">
        <div>
          <p className="text-[18px] font-extrabold tracking-tight text-ink-950">
            made<span className="text-[#1D4ED8]">visa</span>
          </p>
          <p className="text-[12px] text-ink-500">Sponsor offer</p>
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
        Sponsorship cost-sharing offer
      </h1>
      <p className="mt-2 font-sans text-[15px] text-ink-600">
        {doc.jobTitle} at {doc.companyName}
      </p>

      {/* Parties */}
      <dl className="mt-8 grid gap-x-8 gap-y-4 border-y border-ink-200 py-5 font-sans text-[14px] sm:grid-cols-2">
        <Party k="Candidate" v={doc.candidateName} sub={doc.headline} />
        <Party k="Employer" v={doc.companyName} />
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
          v={route.name}
          sub={
            <a href={route.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#1D4ED8] print:text-ink-600">
              Official source <ExternalLink className="h-3 w-3 print:hidden" />
            </a>
          }
        />
        <Party k="Sponsor licence" v={employer.licenceNeeded ? 'Required' : 'Not required'} />
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

      <Clause n={clause()} title="What the Employer does">
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

      <Clause n={clause()} title="Costs the Employer carries by law">
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
              <td className="py-2.5 text-[13px] font-semibold text-ink-600">Not part of this offer</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3">
          Where the Employer pays, it pays the provider directly or reimburses the Candidate within 30 days of receiving receipts. Where a cost is shared, each party pays half against
          receipts.
        </p>
      </Clause>

      <Clause n={clause()} title="Repayment">
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

      <Clause n={clause()} title="Start">
        The Candidate can start work in {guide.name} within {terms.startWeeks} weeks of the visa being granted.
        {terms.remoteStart && (
          <>
            {' '}
            Until then, the Candidate offers to start remotely from their country of residence, as an independent contractor or through an Employer of Record, where the law there
            allows. That work is not work in {guide.name} and needs no visa.
          </>
        )}
      </Clause>

      <Clause n={clause()} title="Pay and fair recruitment">
        Pay and conditions are set by the Employer and must meet the {route.name} requirements and the law of {guide.name}. Nothing in this offer lowers them. No recruitment fee is
        charged to the Candidate, and the Candidate keeps their own identity and travel documents.
      </Clause>

      {doc.note && (
        <Clause n={clause()} title="Note from the Candidate">
          <span className="whitespace-pre-line italic">{doc.note}</span>
        </Clause>
      )}

      <Clause n={clause()} title="Status of this offer">
        This is a proposal, not a contract. It becomes binding only when both parties sign it, or when its terms are written into the employment contract. It is governed by the law of{' '}
        {guide.name} and is valid for {VALID_DAYS} days from issue. It was prepared with MadeVisa from official government sources and is not legal advice; check the details with the
        official source or a qualified immigration adviser before signing.
      </Clause>

      {/* Signatures */}
      <section className="mt-10 grid gap-10 break-inside-avoid font-sans text-[13px] sm:grid-cols-2">
        <Sign who="Candidate" name={doc.candidateName} />
        <Sign who={`For ${doc.companyName}`} />
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 pt-3 font-sans text-[11px] text-ink-500">
        <span>
          {doc.ref}
          {doc.shareId ? ` · Check the current version at madevisa.com${briefPath(doc.shareId)}` : ''}
        </span>
        {doc.linkedin && <span className="hidden print:inline">{doc.linkedin}</span>}
      </footer>
    </article>
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

function Clause({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2 className="flex gap-3 font-sans text-[15px] font-bold text-ink-950">
        <span className="w-8 shrink-0 tabular-nums text-[#1D4ED8] print:text-ink-900">{n}.</span>
        {title}
      </h2>
      <div className="mt-1.5 pl-11 text-ink-800">{children}</div>
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
