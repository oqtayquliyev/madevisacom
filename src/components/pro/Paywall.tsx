import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, Loader2, Lock, Star, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSiteStats } from '@/lib/siteStats';
import { moreJobsHeadline, readLastSearch } from '@/lib/lastSearch';
import { goToMembershipCheckout } from '@/lib/gumroad';
import { MEMBERSHIP_PRICE } from '@/lib/plans';
import { trackBilling } from '@/lib/billing';
import { trackPaywall } from '@/lib/paywallStats';
import { rememberAuthIntent } from '@/lib/authIntent';
import { nav } from '@/lib/pageLayout';
import { CircleFlag } from '@/components/common/CircleFlag';
import { TESTIMONIALS } from '@/data/testimonials';

// The membership paywall: one short, New York Times-style card. It sits over a
// job page for anyone who isn't a member (the Apply button behind it stays
// locked), and opens over a list when someone picks a job there. "Subscribe"
// goes straight to Gumroad's payment page, with or without an account.

/** What's included — short, so the card stays one screen tall on a phone. **words** are drawn bold. */
const INCLUDED = [
  'Apply to **this job** and **every job** on MadeVisa',
  'Jobs straight from **company career pages**, beyond **LinkedIn**',
  '**Remote** and **online** job listings',
  '**CV match** and **CV suggestions** on every job',
  'Companies that **sponsor work visas**',
];

/** "a **b** c" → a <strong>b</strong> c */
function Bolded({ text }: { text: string }) {
  return (
    <span>
      {text.split('**').map((part, i) => (i % 2 ? <strong key={i} className="font-bold text-ink-950">{part}</strong> : <span key={i}>{part}</span>))}
    </span>
  );
}

/** Members' own headlines that don't name the retired Pro plan. */
const QUOTES = TESTIMONIALS.filter((t) => !/\bpro\b|\$/i.test(t.headline) && !/member$/i.test(t.name) && /^[\x20-\x7E’‘“”—–…]+$/.test(t.headline));

type Props = {
  /** The job behind the card, when there is one. */
  job?: { title: string; company?: string | null } | null;
  /** Without onClose the card can't be dismissed (a job page); "Back to jobs" is the way out. */
  onClose?: () => void;
  /** Which screen showed it (Admin → Paywall). */
  source: string;
};

export function Paywall({ job, onClose, source }: Props) {
  const { user } = useAuth();
  const stats = useSiteStats();
  const [busy, setBusy] = useState(false);
  const [already, setAlready] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const headline = useMemo(() => moreJobsHeadline(readLastSearch(), stats?.publishedJobs), [stats?.publishedJobs]);
  const [quote, setQuote] = useState(() => Math.floor(Math.random() * Math.max(1, QUOTES.length)));

  useEffect(() => {
    trackBilling('upgrade_prompt_shown', { source });
    trackPaywall('shown', source);
    dialog.current?.focus({ preventScroll: true });
    // The page behind doesn't scroll while the card is up.
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = before;
    };
  }, [source]);

  useEffect(() => {
    if (QUOTES.length < 2) return;
    const t = window.setInterval(() => setQuote((i) => (i + 1) % QUOTES.length), 6000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Back from Gumroad with the browser's Back button: the button works again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && setBusy(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const subscribe = async () => {
    if (busy) return;
    setBusy(true);
    trackBilling('upgrade_prompt_clicked', { source });
    trackPaywall('click', source);
    const r = await goToMembershipCheckout({ signedIn: Boolean(user), email: user?.email ?? null, source });
    if (r.kind === 'already') {
      setBusy(false);
      setAlready(r.manageUrl);
    }
  };

  const signIn = () => {
    rememberAuthIntent({ next: window.location.pathname + window.location.search });
    nav('/login');
  };

  const q = QUOTES[quote % Math.max(1, QUOTES.length)];

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/55 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        className="relative max-h-[94dvh] outline-none w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 text-ink-950 shadow-2xl sm:max-w-[440px] sm:rounded-2xl sm:px-7 sm:pb-6 sm:pt-7"
      >
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-800">
            <X className="h-4 w-4" />
          </button>
        )}

        <h2 id="paywall-title" className="text-center font-title text-[26px] font-bold leading-[1.15] tracking-tight sm:text-[30px]">
          {headline ? (
            <>
              {headline}
              <span className="block">are waiting.</span>
            </>
          ) : (
            'Unlock every job.'
          )}
        </h2>
        <p className="mx-auto mt-2 max-w-[320px] text-center text-[14px] leading-5 text-ink-600">
          {job?.title ? (
            <>
              Subscribe to apply to <strong className="font-semibold text-ink-900">{job.title}</strong>
              {job.company ? <> at {job.company}</> : null}.
            </>
          ) : (
            'Subscribe today to apply to any job on MadeVisa.'
          )}
        </p>

        <div className="mt-5 rounded-xl border border-ink-900 px-4 pb-4 pt-4 sm:px-5">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">MadeVisa Membership</p>
          <p className="mt-1 text-center text-[30px] font-bold leading-none tracking-tight">
            {MEMBERSHIP_PRICE}
            <span className="text-[17px] font-semibold">/month</span>
          </p>
          <p className="mt-1.5 text-center text-[12.5px] text-ink-500">Billed monthly. Cancel anytime.</p>

          {already ? (
            <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-center text-[13px] font-semibold text-emerald-800">
              Your membership is already running.{' '}
              <button type="button" onClick={() => window.location.reload()} className="underline">
                Reload the page
              </button>
            </p>
          ) : (
            <button
              ref={button}
              type="button"
              onClick={subscribe}
              disabled={busy}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-ink-950 text-[15px] font-bold text-white transition hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950 focus-visible:ring-offset-2 disabled:opacity-80"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Opening secure payment…
                </>
              ) : (
                'Subscribe now'
              )}
            </button>
          )}

          <ul className="mt-4 space-y-1.5">
            {INCLUDED.map((t) => (
              <li key={t} className="flex gap-2.5 text-[13.5px] leading-5 text-ink-800">
                <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={3} aria-hidden />
                <Bolded text={t} />
              </li>
            ))}
          </ul>
        </div>

        {q && (
          <figure className="mt-4 rounded-xl bg-ink-50 px-4 py-3" aria-live="polite">
            <span className="flex items-center gap-0.5" role="img" aria-label="Rated 5 out of 5">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} aria-hidden className="h-3 w-3 fill-amber-400 text-amber-400" />
              ))}
            </span>
            <blockquote className="mt-1 text-[14px] font-semibold leading-snug text-ink-900">“{q.headline}”</blockquote>
            <figcaption className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-500">
              <span className="font-semibold text-ink-700">{q.name}</span>
              {q.role && <span>· {q.role}</span>}
              <span className="inline-flex items-center gap-1">
                · <CircleFlag countryCode={q.from.code} label={q.from.name} size={12} />→<CircleFlag countryCode={q.to.code} label={q.to.name} size={12} />
              </span>
            </figcaption>
          </figure>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px]">
          {!user && (
            <button type="button" onClick={signIn} className="font-semibold text-ink-700 underline underline-offset-2 hover:text-ink-950">
              Already a member? Sign in
            </button>
          )}
          {onClose ? (
            <button type="button" onClick={onClose} className="font-semibold text-ink-500 hover:text-ink-800">
              Not now
            </button>
          ) : (
            <button type="button" onClick={() => nav('/jobs')} className="inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-ink-800">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to jobs
            </button>
          )}
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
          <Lock className="h-3 w-3" aria-hidden /> Secure payment by Gumroad
        </p>
      </div>
    </div>,
    document.body,
  );
}
