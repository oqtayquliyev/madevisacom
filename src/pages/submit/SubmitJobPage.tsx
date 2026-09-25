import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Briefcase, Building2, Check, CheckCircle2, GraduationCap, Loader2, ShieldCheck, Zap } from 'lucide-react';
import type { View } from '@/types';
import { useAuth } from '@/lib/auth';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CharCount, cleanText } from '@/components/common/LimitedFields';
import { SoonChip } from '@/components/common/SoonChip';
import { fetchMyManagedPublishers, type ManagedPublisher } from '@/lib/companyManager';
import {
  solveProofOfWork,
  submitListingRequest,
  SPONSORED_JOB_DAYS,
  SPONSORED_JOB_PRICE,
  TERMS_PATH,
  type ListingPlan,
  type PowSolution,
} from '@/lib/listingRequests';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const LIMITS = { name: 80, email: 120, company: 120, url: 500 } as const;
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim());
const isUrl = (v: string) => /^https?:\/\/[^\s.]+\.\S+$/i.test(v.trim());

export function SubmitJobPage({ go, onAuth }: Props) {
  useSeo({
    title: 'Post a job on MadeVisa',
    description: 'Post a job for people planning to work abroad. Free listings, or a sponsored job pinned on MadeVisa.',
    path: '/submit-job',
  });
  const { user, profile } = useAuth();
  const [company, setCompany] = useState<ManagedPublisher | null | undefined>(undefined);

  const initialPlan: ListingPlan = new URLSearchParams(window.location.search).get('plan') === 'free' ? 'free_job' : 'sponsored_job';
  const [plan, setPlan] = useState<ListingPlan>(initialPlan);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ duplicate?: boolean } | null>(null);

  // Human check runs in the background while the form is filled in.
  const startedAt = useRef(Date.now());
  const [pow, setPow] = useState<PowSolution | null>(null);
  const [powFailed, setPowFailed] = useState(false);
  const runPow = () => {
    const signal = { cancelled: false };
    setPow(null);
    setPowFailed(false);
    solveProofOfWork(signal).then((s) => {
      if (signal.cancelled) return;
      if (s) setPow(s);
      else setPowFailed(true);
    });
    return () => {
      signal.cancelled = true;
    };
  };
  useEffect(runPow, []);

  // Signed in: fill in what we know. A company manager posts free
  // vacancies from their dashboard, so only the sponsored plan applies here.
  useEffect(() => {
    if (!user) {
      setCompany(null);
      return;
    }
    fetchMyManagedPublishers().then((list) => {
      const mine = list[0] ?? null;
      setCompany(mine);
      if (mine) {
        setCompanyName(mine.name);
        setPlan('sponsored_job');
      }
    });
  }, [user]);
  useEffect(() => {
    if (profile?.email) setEmail((v) => v || profile.email || '');
    if (profile?.full_name) setFullName((v) => v || profile.full_name || '');
  }, [profile?.email, profile?.full_name]);

  const sponsored = plan === 'sponsored_job';
  const problems = [
    fullName.trim().length < 2 && 'Enter your full name.',
    !isEmail(email) && 'Enter a valid work email.',
    companyName.trim().length < 2 && 'Enter your company name.',
    jobUrl.trim() && !isUrl(jobUrl) && 'The job link must start with https://',
    sponsored && !acceptTerms && `Accept the $${SPONSORED_JOB_PRICE} sponsored listing terms.`,
    !acceptPrivacy && 'Accept the privacy notice.',
  ].filter((p): p is string => Boolean(p));

  const submit = async () => {
    setTried(true);
    setError(null);
    if (problems.length || !pow) return;
    setSending(true);
    const res = await submitListingRequest({
      fullName,
      email,
      company: companyName,
      jobUrl,
      plan,
      acceptTerms: sponsored ? acceptTerms : false,
      acceptPrivacy,
      website,
      startedAt: startedAt.current,
      pow,
    });
    setSending(false);
    if (res.ok) {
      setDone({ duplicate: res.duplicate });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setError(res.error ?? 'Something went wrong. Please try again.');
      // A proof of work is single-use; get a fresh one for the next try.
      runPow();
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="bg-brand-700 text-white">
        <div className="mx-auto max-w-3xl px-5 pb-10 pt-10 sm:px-8 sm:pb-14">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">For companies</p>
          <h1 className="mt-2 font-slab text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Post a job on MadeVisa</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/80">
            Put your role in front of people actively planning to move abroad for work. Tell us who you are — we set everything up with you.
          </p>
          <FastReply className="mt-5" dark />
        </div>
      </section>

      <main className="mx-auto -mt-6 max-w-3xl px-4 pb-16 sm:px-8">
        {done ? (
          <SuccessCard duplicate={done.duplicate} sponsored={sponsored} email={email.trim().toLowerCase()} go={go} />
        ) : (
          <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm sm:p-8">
            {company && (
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-brand-200 bg-brand-50 px-4 py-3">
                <Building2 className="h-4 w-4 shrink-0 text-brand-700" />
                <p className="min-w-0 flex-1 text-sm text-ink-700">
                  You manage <strong>{company.name}</strong>. Free vacancies are posted from your company dashboard.
                </p>
                <button onClick={() => go('company')} className="flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
                  Open dashboard <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* PLAN */}
            <p className="text-xs font-semibold text-ink-600">What would you like to post?</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <PlanCard
                selected={plan === 'sponsored_job'}
                onSelect={() => setPlan('sponsored_job')}
                icon={Briefcase}
                title="Sponsored job"
                price={`$${SPONSORED_JOB_PRICE}`}
                note={`${SPONSORED_JOB_DAYS} days, pinned on the homepage and jobs board`}
              />
              <PlanCard
                selected={plan === 'free_job'}
                disabled={Boolean(company)}
                onSelect={() => setPlan('free_job')}
                icon={Briefcase}
                title="Free job"
                price="$0"
                note={company ? 'Use your company dashboard' : 'Listed with all jobs after review'}
              />
              <PlanCard selected={false} disabled soon icon={GraduationCap} title="Sponsored program" price="$99" note="Programs open on MadeVisa soon" />
            </div>

            {/* DETAILS */}
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <TextField
                label="Full name"
                value={fullName}
                max={LIMITS.name}
                autoComplete="name"
                onChange={(v) => setFullName(cleanText(v, LIMITS.name))}
                error={tried && fullName.trim().length < 2 ? 'Enter your full name.' : null}
              />
              <TextField
                label="Work email"
                type="email"
                value={email}
                max={LIMITS.email}
                autoComplete="email"
                onChange={(v) => setEmail(v.replace(/\s/g, ''))}
                error={tried && !isEmail(email) ? 'Enter a valid email.' : null}
              />
              <TextField
                label="Company name"
                value={companyName}
                max={LIMITS.company}
                autoComplete="organization"
                readOnly={Boolean(company)}
                onChange={(v) => setCompanyName(cleanText(v, LIMITS.company))}
                error={tried && companyName.trim().length < 2 ? 'Enter your company name.' : null}
              />
              <TextField
                label="Link to the job"
                hint="Optional"
                type="url"
                value={jobUrl}
                max={LIMITS.url}
                placeholder="https://"
                onChange={(v) => setJobUrl(v.replace(/\s/g, ''))}
                error={tried && jobUrl.trim() && !isUrl(jobUrl) ? 'Start with https://' : null}
              />
              {/* Honeypot: hidden from people, irresistible to form-filling bots. */}
              <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
                </label>
              </div>
            </div>

            {/* CONSENT */}
            <div className="mt-7 space-y-3 border-t border-ink-100 pt-6">
              {sponsored && (
                <Consent checked={acceptTerms} onChange={setAcceptTerms} invalid={tried && !acceptTerms}>
                  I agree to pay <strong>${SPONSORED_JOB_PRICE}</strong> (USD, plus any applicable tax) for this sponsored job, shown for{' '}
                  {SPONSORED_JOB_DAYS} days once MadeVisa approves it. Nothing is charged before approval. I accept the{' '}
                  <a href={TERMS_PATH} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2">
                    Sponsored listing terms
                  </a>
                  .
                </Consent>
              )}
              <Consent checked={acceptPrivacy} onChange={setAcceptPrivacy} invalid={tried && !acceptPrivacy}>
                MadeVisa may use these details to contact me about this request, as described in the{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2">
                  Privacy Policy
                </a>
                . We never sell your details or add you to marketing lists.
              </Consent>
            </div>

            {/* HUMAN CHECK */}
            <div className="mt-6 flex items-center gap-2.5 rounded-md border border-ink-200 bg-ink-50 px-3 py-2.5 text-xs">
              {pow ? (
                <>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="font-semibold text-emerald-700">Verified — you're human</span>
                </>
              ) : powFailed ? (
                <>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-rose-500" />
                  <span className="text-rose-600">Couldn't verify this browser.</span>
                  <button onClick={runPow} className="font-semibold text-brand-700 hover:underline">
                    Try again
                  </button>
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-400" />
                  <span className="text-ink-500">Checking you're human… (no puzzles, takes a second)</span>
                </>
              )}
            </div>

            {tried && problems.length > 0 && (
              <ul className="mt-4 space-y-0.5 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={submit}
                disabled={sending || !pow}
                className="flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                {sponsored ? 'Request sponsored job' : 'Request free listing'}
              </button>
              <FastReply />
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-ink-400">
          Questions? <a href="mailto:hello@madevisa.com" className="font-semibold text-ink-500 hover:text-brand-700">hello@madevisa.com</a>
        </p>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

/** Green speed note: the team answers these fast. */
function FastReply({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  return (
    <p className={`flex items-center gap-2 text-xs font-medium ${dark ? 'text-white/85' : 'text-ink-500'} ${className}`}>
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${dark ? 'bg-emerald-400/20' : 'bg-emerald-50'}`}>
        <Zap className={`h-3.5 w-3.5 ${dark ? 'fill-emerald-300 text-emerald-300' : 'fill-emerald-500 text-emerald-500'}`} />
      </span>
      <span>
        <strong className={dark ? 'text-emerald-300' : 'text-emerald-700'}>Fast reply</strong> — the MadeVisa team usually gets back to you within a few hours.
      </span>
    </p>
  );
}

function PlanCard({
  selected,
  onSelect,
  icon: Icon,
  title,
  price,
  note,
  disabled = false,
  soon = false,
}: {
  selected: boolean;
  onSelect?: () => void;
  icon: typeof Briefcase;
  title: string;
  price: string;
  note: string;
  disabled?: boolean;
  soon?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
      className={`relative flex flex-col rounded-lg border p-4 text-left transition ${
        selected
          ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
          : disabled
            ? 'cursor-not-allowed border-ink-200 bg-ink-50 opacity-70'
            : 'border-ink-200 bg-white hover:border-brand-300'
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <Icon className={`h-4 w-4 ${selected ? 'text-brand-700' : 'text-ink-400'}`} />
        {soon ? <SoonChip /> : selected ? <Check className="h-4 w-4 text-brand-700" /> : null}
      </span>
      <span className={`mt-2 text-sm font-bold ${disabled ? 'text-ink-500' : 'text-ink-950'}`}>{title}</span>
      <span className={`font-slab text-xl font-bold ${disabled ? 'text-ink-400' : 'text-ink-950'}`}>{price}</span>
      <span className="mt-1 text-[11px] leading-4 text-ink-500">{note}</span>
    </button>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange,
  max,
  error,
  type = 'text',
  placeholder,
  autoComplete,
  readOnly,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  error?: string | null;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-ink-600">{label}</span>
        {hint ? <span className="text-[11px] text-ink-400">{hint}</span> : <CharCount value={value} max={max} />}
      </span>
      <input
        type={type}
        value={value}
        maxLength={max}
        readOnly={readOnly}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 w-full rounded-md border px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:ring-2 ${
          error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'
        } ${readOnly ? 'bg-ink-50 text-ink-600' : 'bg-white'}`}
      />
      {error && <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

function Consent({ checked, onChange, invalid, children }: { checked: boolean; onChange: (v: boolean) => void; invalid?: boolean; children: ReactNode }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-md p-2 text-sm leading-6 text-ink-700 ${invalid ? 'bg-rose-50' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-brand-600" />
      <span>{children}</span>
    </label>
  );
}

function SuccessCard({ duplicate, sponsored, email, go }: { duplicate?: boolean; sponsored: boolean; email: string; go: (v: View) => void }) {
  const steps = sponsored
    ? ['We reply by email and confirm the job details with you.', 'We set up your company page and review the job.', `Once approved, you get a payment link for $${SPONSORED_JOB_PRICE} and the job goes live for ${SPONSORED_JOB_DAYS} days.`]
    : ['We reply by email and confirm your company.', 'We set up your company page and dashboard access.', 'You post vacancies yourself — each one is reviewed before going live.'];
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-6 shadow-sm sm:p-8">
      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      <h2 className="mt-3 text-xl font-bold text-ink-950">{duplicate ? 'We already have your request' : 'Request received'}</h2>
      <p className="mt-1 text-sm text-ink-600">
        {duplicate ? "No need to send it again — we're on it." : 'Thanks!'} We'll write to <strong>{email}</strong>.
      </p>
      <FastReply className="mt-4" />
      <ol className="mt-6 space-y-3 border-t border-ink-100 pt-5">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-sm text-ink-700">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <button onClick={() => go('jobs')} className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
        Browse jobs on MadeVisa <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

