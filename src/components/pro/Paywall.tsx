import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, BadgeCheck, Eye, Loader2, Lock, Mail, MessageCircleReply, ShieldCheck, Sparkles, Wallet, X, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSiteStats } from '@/lib/siteStats';
import { headlineForJob, moreJobsHeadline, readLastSearch } from '@/lib/lastSearch';
import { useJobFacets } from '@/lib/jobFacets';
import { classifyJob } from '@/lib/jobTaxonomy';
import { goToMembershipCheckout } from '@/lib/gumroad';
import { preloadGumroad } from '@/lib/gumroadOverlay';
import { FEATURES, MEMBERSHIP_PLAN, MEMBERSHIP_PRICE, PLANS } from '@/lib/plans';
import { LaunchOfferBox, MissionNote, useLaunchPlaces } from './LaunchOffer';
import { trackBilling } from '@/lib/billing';
import { trackPaywall } from '@/lib/paywallStats';
import { rememberAuthIntent } from '@/lib/authIntent';
import { nav } from '@/lib/pageLayout';
import { closeJobModal, readJobModal } from '@/lib/jobModal';
import { DOWNSELL_CODE, DOWNSELL_PRICE, downsellDue, markDownsellShown } from '@/lib/conversion';
import { Blur } from '@/components/common/Blur';

// The membership paywall. It sits over a job page for anyone who isn't a member (the
// Apply button behind it stays locked), and opens over a list when someone picks a job.
//
// What makes people pay, in order on the card:
//   1. a headline about THEIR search ("1,857 more graphic designer jobs are waiting")
//   2. up to 3 lines about THIS job: live proof, or what's locked (recruiter email masked, …)
//   3. the offer card (LaunchOffer.tsx): Book Only $17 / Book + 1 Year Membership $27.40 (best value),
//      secure checkout · pay once · no subscription, the cards, the refund guarantee
//   4. the five features (plans.ts FEATURES), then the mission line with a small heart
// Leaving (Back / close / mouse to the tab bar) shows the "first month for less" offer
// once a week, when a Gumroad offer code is set. "Subscribe" opens Gumroad's payment
// form over the page (gumroadOverlay.ts) — no trip to another site.

/** What the job page knows that is locked for non-members — shown masked or blurred, never in full. */
export type PaywallTeaser = {
  /** Masked: "u••••••@f•••••.no". */
  contact?: string | null;
  /** "6 hours ago" — when the company published it. */
  postedLabel?: string | null;
  /** "3 hours ago": last seen live on the company's careers page. */
  checkedLabel?: string | null;
  /** Posted on the company's own careers page (imported), not a job board. */
  fromCareers?: boolean;
  /** Real count of page views today; shown from 3 up. */
  viewsToday?: number | null;
  /** How many official sponsor records (UK, NL, US) the company has. */
  sponsorRecords?: number;
  hasMoveMath?: boolean;
  hasOdds?: boolean;
  /** The visitor has a CV, so a match score exists for this job. */
  hasCv?: boolean;
};

/** Which paid feature the visitor reached for (the card's title says so). */
export type PaywallReason = 'match' | 'edge' | 'doc' | 'contact';

const REASON_TITLE: Record<PaywallReason, string> = {
  match: 'See how your CV matches this job.',
  edge: 'Your edge on this job.',
  doc: 'Your sponsorship document.',
  contact: 'Write to HR or the recruiter directly.',
};

type Props = {
  /** Set when a paid feature on a job opened the card. */
  reason?: PaywallReason;
  /** The job behind the card, when there is one. */
  job?: { title: string; company?: string | null; category?: string | null } | null;
  /** Without onClose the card can't be dismissed (a job page); "Back to jobs" is the way out. */
  onClose?: () => void;
  /** Which screen showed it (Admin → Paywall). */
  source: string;
  teaser?: PaywallTeaser;
};

export function Paywall({ job, onClose, source, teaser, reason }: Props) {
  const { user } = useAuth();
  const stats = useSiteStats();
  const [busy, setBusy] = useState(false);
  const [already, setAlready] = useState<string | null>(null);
  const [offer, setOffer] = useState(false);
  const leaveAfterOffer = useRef<(() => void) | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const facets = useJobFacets();
  // About THIS job's field when there is a job ("2,431 more engineering jobs"); the last search only when the job fits it.
  const headline = useMemo(() => {
    if (!job?.title) return moreJobsHeadline(readLastSearch(), stats?.publishedJobs);
    const cat = classifyJob(job.title, job.category ?? null);
    const n = cat ? facets?.categories?.[cat.label] : undefined;
    return headlineForJob(job, cat && n ? { label: cat.label, n } : null, readLastSearch(), facets?.total ?? stats?.publishedJobs);
  }, [job, facets, stats?.publishedJobs]);

  useEffect(() => {
    trackBilling('upgrade_prompt_shown', { source });
    trackPaywall('shown', source);
    // Gumroad's payment form loads while they read, so "Subscribe" opens it at once.
    void preloadGumroad();
    dialog.current?.focus({ preventScroll: true });
    // The page behind doesn't scroll while the card is up.
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = before;
    };
  }, [source]);

  /** Leaving: the "first month for less" offer first (once a week, only with a code), then really leave. */
  const leave = (go: () => void) => {
    if (!offer && downsellDue()) {
      markDownsellShown();
      trackPaywall('downsell_shown', source);
      leaveAfterOffer.current = go;
      setOffer(true);
      return;
    }
    go();
  };

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && leave(onClose);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, offer]);

  // Desktop: the mouse heads for the tab bar or the address bar → the offer (once).
  useEffect(() => {
    if (!DOWNSELL_CODE || offer) return;
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget === null && e.clientY <= 4 && downsellDue()) {
        markDownsellShown();
        trackPaywall('downsell_shown', source);
        leaveAfterOffer.current = null;
        setOffer(true);
      }
    };
    document.addEventListener('mouseout', onOut);
    return () => document.removeEventListener('mouseout', onOut);
  }, [offer, source]);

  // Back from Gumroad with the browser's Back button: the button works again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && setBusy(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const subscribe = async (offerCode: string | null = null) => {
    if (busy) return;
    setBusy(true);
    trackBilling('upgrade_prompt_clicked', { source, offer: Boolean(offerCode) });
    trackPaywall(offerCode ? 'downsell_click' : 'click', source);
    const r = await goToMembershipCheckout({ signedIn: Boolean(user), email: user?.email ?? null, source, offerCode });
    if (r.kind === 'already') {
      setBusy(false);
      setAlready(r.manageUrl);
      return;
    }
    trackPaywall('checkout_open', source);
    // The form is over the page now (or the browser is leaving): the button works again when it closes.
    window.setTimeout(() => setBusy(false), 1500);
  };

  const signIn = () => {
    rememberAuthIntent({ next: window.location.pathname + window.location.search });
    nav('/login');
  };

  const company = job?.company ?? null;

  // What's behind this job: up to 3 rows (one phone screen). Live proof first, then locked answers.
  const rows: { icon: ReactNode; label: ReactNode; locked?: ReactNode }[] = [];
  if (teaser) {
    if (teaser.postedLabel) rows.push({ icon: <Zap className="h-3.5 w-3.5" />, label: <>Posted {teaser.postedLabel}{teaser.fromCareers && company ? <> on {company}’s careers page</> : null}</> });
    if (teaser.checkedLabel && company) rows.push({ icon: <BadgeCheck className="h-3.5 w-3.5" />, label: <>Checked live on {company}’s site {teaser.checkedLabel}</> });
    if (teaser.viewsToday != null && teaser.viewsToday >= 3) rows.push({ icon: <Eye className="h-3.5 w-3.5" />, label: <>{teaser.viewsToday} people looked at this job today</> });
    if (teaser.contact) rows.push({ icon: <Mail className="h-3.5 w-3.5" />, label: 'Recruiter email', locked: <span className="font-mono text-[12.5px] text-ink-700">{teaser.contact}</span> });
    if (teaser.sponsorRecords) rows.push({ icon: <ShieldCheck className="h-3.5 w-3.5" />, label: 'Official visa-sponsor record', locked: <Blur w={64} /> });
    if (teaser.hasMoveMath) rows.push({ icon: <Wallet className="h-3.5 w-3.5" />, label: 'Left each month after tax & rent', locked: <Blur w={56} /> });
    if (teaser.hasCv) rows.push({ icon: <Sparkles className="h-3.5 w-3.5" />, label: 'Your CV match', locked: <Blur w={36} /> });
    if (teaser.hasOdds) rows.push({ icon: <MessageCircleReply className="h-3.5 w-3.5" />, label: 'Chance they reply', locked: <Blur w={44} /> });
  }
  const shown = rows.slice(0, 3);

  // Over a job popup: back to the list as it was (filters, scroll); on a job page: the jobs list.
  const backOut = onClose ? () => leave(onClose) : () => leave(() => (readJobModal() ? closeJobModal() : nav('/jobs')));

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/55 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose ? (e) => e.target === e.currentTarget && leave(onClose) : undefined}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        className="relative max-h-[94dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 text-ink-950 shadow-2xl outline-none sm:max-w-[440px] sm:rounded-2xl sm:px-7 sm:pb-6 sm:pt-7"
      >
        {onClose && (
          <button type="button" onClick={() => leave(onClose)} aria-label="Close" className="absolute right-3 top-3 rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-800">
            <X className="h-4 w-4" />
          </button>
        )}

        {offer ? (
          <DownsellView
            busy={busy}
            onTake={() => void subscribe(DOWNSELL_CODE)}
            onNo={() => {
              setOffer(false);
              const go = leaveAfterOffer.current;
              leaveAfterOffer.current = null;
              go?.();
            }}
          />
        ) : (
          <>
            <h2 id="paywall-title" className="text-center font-title text-[26px] font-bold leading-[1.15] tracking-tight sm:text-[30px]">
              {reason ? (
                REASON_TITLE[reason]
              ) : headline ? (
                <>
                  {headline}
                  <span className="block">are waiting.</span>
                </>
              ) : (
                'Unlock every job.'
              )}
            </h2>
            {job?.title && (
              <p className="mx-auto mt-2.5 w-fit max-w-full truncate rounded-full bg-ink-100 px-3.5 py-1 text-center text-[14px] font-bold text-ink-900">
                {job.title}
                {company ? <span className="font-semibold text-ink-500"> · {company}</span> : null}
              </p>
            )}

            {shown.length > 0 && (
              <ul className="mt-4 divide-y divide-ink-100 rounded-xl bg-ink-50 px-3.5 py-1" aria-label="What's behind this job">
                {shown.map((r, i) => (
                  <li key={i} className="flex items-center gap-2.5 py-2 text-[13px] leading-5 text-ink-800">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-brand-700 ring-1 ring-ink-200">{r.icon}</span>
                    <span className="min-w-0 flex-1">{r.label}</span>
                    {r.locked && (
                      <span className="inline-flex shrink-0 items-center gap-1.5">
                        {r.locked}
                        <Lock className="h-3 w-3 text-ink-400" aria-label="Locked" />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <LaunchOfferBox className="mt-4" busy={busy} source={source} onBuy={() => void subscribe()}>
              {already ? (
                <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-center text-[13px] font-semibold text-emerald-800">
                  Your membership is already active.{' '}
                  <button type="button" onClick={() => window.location.reload()} className="underline">
                    Reload the page
                  </button>
                </p>
              ) : undefined}
            </LaunchOfferBox>
            {/* The five things it unlocks, then why it matters beyond you. */}
            <ol className="mt-5 space-y-2.5 px-1" aria-label="What you get">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-3 text-[13.5px] leading-5 text-ink-800">
                  <span className="w-5 shrink-0 text-center text-[16px] leading-5" aria-hidden>
                    {f.icon}
                  </span>
                  <span>
                    <strong className="font-semibold text-ink-950">{f.title}</strong> <span className="text-ink-500">{f.sub}</span>
                  </span>
                </li>
              ))}
            </ol>
            <MissionNote className="mt-5 border-t border-ink-100 pt-4" />

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px]">
              {!user && (
                <button type="button" onClick={signIn} className="font-semibold text-ink-700 underline underline-offset-2 hover:text-ink-950">
                  Already a member? Sign in
                </button>
              )}
              {onClose ? (
                <button type="button" onClick={backOut} className="font-semibold text-ink-500 hover:text-ink-800">
                  Not now
                </button>
              ) : (
                <button type="button" onClick={backOut} className="inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-ink-800">
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to jobs
                </button>
              )}
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
              <Lock className="h-3 w-3" aria-hidden /> Secure checkout · Gumroad
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** "95% off before you go": shown once a week when someone leaves the popup (needs a Gumroad offer code). */
function DownsellView({ busy, onTake, onNo }: { busy: boolean; onTake: () => void; onNo: () => void }) {
  const left = useLaunchPlaces();
  const cents = Math.round(Number(DOWNSELL_PRICE.replace(/[^0-9.]/g, '')) * 100);
  const off = cents > 0 && cents < PLANS[MEMBERSHIP_PLAN].priceCents ? Math.round((1 - cents / PLANS[MEMBERSHIP_PLAN].priceCents) * 100) : null;
  return (
    <div className="py-2 text-center">
      <h2 id="paywall-title" className="font-title text-[56px] font-extrabold leading-none tracking-tight">
        {off ? `${off}% off` : 'Before you go'}
      </h2>
      <p className="mt-2 text-[15px] text-ink-600">
        before you go{left != null && left > 0 ? ` · only ${left} ${left === 1 ? 'spot' : 'spots'} left` : ''}
      </p>
      <p className="mx-auto mt-4 max-w-[340px] text-[15px] leading-6 text-ink-900">
        The book + 1 year membership for {DOWNSELL_PRICE} instead of <s>{MEMBERSHIP_PRICE}</s>. One-time payment, no subscription.
      </p>
      <button
        type="button"
        onClick={onTake}
        disabled={busy}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink-950 text-[15px] font-bold text-white hover:bg-ink-800 disabled:opacity-80"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <>Get it for {DOWNSELL_PRICE} →</>}
      </button>
      <button type="button" onClick={onNo} className="mt-3 text-[13.5px] font-medium text-ink-500 hover:text-ink-800">
        No thanks, I’ll pay full price
      </button>
    </div>
  );
}

