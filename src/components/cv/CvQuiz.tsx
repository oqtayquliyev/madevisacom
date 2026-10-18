// /cv-match for everyone not on a plan yet: a 3-step quiz, one thing per screen.
//   1/3  What are you looking for?   — a sponsored job abroad · Ausbildung / internship (students)
//   2/3  Your CV                     — upload it · or "create one for me" (name, field, years, skills)
//        …the search, with its counting loading screen…
//   3/3  What would you like?        — see my opportunities (Free) · documents + all matches (Starter) · Auto Apply (Pro)
//        → approve the email (accounts are made here) → Free: the results, with Starter / Pro and reviews;
//          Starter / Pro: checkout, and back to this page afterwards (paid or not).
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Briefcase, Check, Crown, FileCheck2, FileText, GraduationCap, Info, Lock, Plane, Search, Sparkles, Upload, Zap } from 'lucide-react';
import { BrandMark } from '@/components/layout/Logo';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CvUpload } from '@/components/cv/CvUpload';
import { QuickSignup } from '@/components/cv/QuickSignup';
import { MatchRing } from '@/components/cv/MatchBits';
import { ExampleJourney } from '@/components/cv/ExampleJourney';
import { SearchProgress } from '@/components/cv/TopMatches';
import { Num, useFromCountry } from '@/components/cv/DocReady';
import { AUTO_APPLY_FACTOR, FlagStack, countriesOf } from '@/components/cv/Upsell';
import { nameFromCv } from '@/components/cv/CvInsights';
import { saveCvText } from '@/lib/cv/store';
import { cvFromAnswers } from '@/lib/cv/createCv';
import type { TopMatch, TopState, TopResult } from '@/lib/cv/topMatches';
import type { StoredCv } from '@/lib/cv/store';
import { CATEGORIES_BY_GROUP } from '@/lib/jobTaxonomy';
import { isStudentOrInternJob } from '@/lib/jobCategories';
import { useAuth } from '@/lib/auth';
import { priceLabel } from '@/lib/plans';
import { checkoutHref, trackBilling, useBillingCatalog } from '@/lib/billing';
import { jobPath } from '@/lib/jobUrl';
import { nav } from '@/lib/pageLayout';
import { countryName } from '@/lib/visaFit';

type Goal = 'job' | 'student';
type Plan = 'free' | 'starter' | 'pro';
type Saved = { goal?: Goal; plan?: Plan | null };
const KEY = 'mv:cvQuiz';
const load = (): Saved => {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
};
const save = (s: Saved) => {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

const cleanLabel = (l: string) => l.replace(/\s*\(other\)/i, '').trim();

function Shell({ step, onBack, children }: { step: 1 | 2 | 3 | null; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-16 max-w-xl items-center justify-between px-4">
          <span className="w-16">
            {onBack && (
              <button onClick={onBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink-100">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
          </span>
          <BrandMark />
          <span className="w-16 text-right">{step && <span className="rounded-full border border-ink-200 px-2.5 py-1 text-[12px] font-bold tabular-nums text-ink-700">{step}/3</span>}</span>
        </div>
        <div className="h-1 bg-ink-100">
          <div className="h-full bg-brand-600 transition-[width] duration-500" style={{ width: `${((step ?? 3) / 3) * 100}%` }} />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:pt-12">{children}</main>
    </div>
  );
}

/** One answer as a card: icon on top, title, one short line, and the price when there is one. */
function Option({ icon: Icon, title, sub, price, onClick, tone = 'plain', badge }: { icon: typeof Plane; title: string; sub?: React.ReactNode; price?: string; onClick: () => void; tone?: 'plain' | 'brand' | 'premium'; badge?: string }) {
  const ring = tone === 'premium' ? 'ring-2 ring-amber-400 hover:ring-amber-500' : tone === 'brand' ? 'ring-2 ring-brand-300 hover:ring-brand-500' : 'ring-1 ring-ink-200 hover:ring-brand-400';
  const iconBg = tone === 'premium' ? 'bg-amber-100 text-amber-700' : tone === 'brand' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700';
  return (
    <button onClick={onClick} className={`relative flex w-full flex-col items-center gap-2 rounded-2xl bg-white px-4 pb-5 pt-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${ring}`}>
      {badge && <span className="absolute -top-2.5 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-950">{badge}</span>}
      <span className={`grid h-12 w-12 place-items-center rounded-2xl ${iconBg}`}>
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <span className="text-[17px] font-bold leading-snug text-ink-950">{title}</span>
      {sub && <span className="text-[14px] leading-5 text-ink-600">{sub}</span>}
      {price && <span className={`mt-1 rounded-full px-3 py-1 text-[13px] font-extrabold ${tone === 'premium' ? 'bg-amber-100 text-amber-800' : tone === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-emerald-50 text-emerald-700'}`}>{price}</span>}
    </button>
  );
}

/** A short, warm line under each question. */
function Cheer({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[13.5px] font-medium text-emerald-700">{children}</p>;
}

function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[30px]">{children}</h1>
      {sub && <div className="mt-2 text-[15px] text-ink-600">{sub}</div>}
    </div>
  );
}

const ALL_TITLES = [...new Set(CATEGORIES_BY_GROUP.flatMap((g) => g.labels.map(cleanLabel)))].sort((a, b) => a.localeCompare(b));
const YEARS: { label: string; years: number }[] = [
  { label: 'None yet', years: 0 },
  { label: '1–2 years', years: 2 },
  { label: '3–5 years', years: 4 },
  { label: '6–10 years', years: 8 },
  { label: '10+ years', years: 12 },
];

/** "I don't have a CV": the job title, then the years — and a simple CV is made from those two answers. */
function CreateCv({ student, onBack }: { student: boolean; onBack: () => void }) {
  const [title, setTitle] = useState('');
  const [part, setPart] = useState<'title' | 'years'>('title');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (years: number) => {
    setBusy(true);
    setError(null);
    const res = await saveCvText(cvFromAnswers({ name: '', field: title.trim(), years, skills: '', student }));
    setBusy(false);
    if (!res.ok) setError(res.error);
    window.scrollTo({ top: 0 });
  };

  if (part === 'years') {
    return (
      <Shell step={2} onBack={() => setPart('title')}>
        <Title>How many years of experience do you have?</Title>
        <div className="grid grid-cols-2 gap-3">
          {YEARS.map((y) => (
            <button
              key={y.label}
              disabled={busy}
              onClick={() => void create(y.years)}
              className="rounded-2xl bg-white px-3 py-5 text-[16px] font-bold text-ink-950 shadow-sm ring-1 ring-ink-200 transition hover:-translate-y-0.5 hover:ring-brand-400 disabled:opacity-60 [&:last-child]:col-span-2"
            >
              {y.label}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
        <Cheer>
          <Sparkles className="h-4 w-4" aria-hidden /> {busy ? 'Creating your CV…' : 'Almost there — every year of experience counts.'}
        </Cheer>
      </Shell>
    );
  }

  return (
    <Shell step={2} onBack={onBack}>
      <Title>What exact job title are you searching for?</Title>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim().length < 2) return setError('Write a job title.');
          setError(null);
          setPart('years');
          window.scrollTo({ top: 0 });
        }}
      >
        <label className="block">
          <span className="text-[14px] font-semibold text-ink-800">Job title or keyword</span>
          <span className="relative mt-1.5 block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              list="quiz-titles"
              autoFocus
              placeholder="Search job titles..."
              className="h-14 w-full rounded-xl border border-ink-200 bg-white pl-11 pr-3.5 text-[16px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <datalist id="quiz-titles">
              {ALL_TITLES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </span>
        </label>
        {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
        <button className="mt-4 w-full rounded-full bg-brand-700 py-3.5 text-[16px] font-bold text-white hover:bg-brand-800">Continue</button>
        <p className="mt-4 flex gap-2 text-[13.5px] leading-5 text-ink-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Specific titles get better matches. “Project Manager” works better than “Manager”.
        </p>
      </form>
    </Shell>
  );
}

export function CvQuiz({ top, searching, cv }: { top: TopState & { start: () => void }; searching: boolean; cv: StoredCv | null }) {
  const { session } = useAuth();
  const [s, setS] = useState<Saved>(() => load());
  const [cvMode, setCvMode] = useState<'choose' | 'create'>('choose');
  const from = useFromCountry();
  const fromName = from ? countryName(from) ?? from : null;
  const catalog = useBillingCatalog();
  const update = (next: Saved) => {
    const v = { ...s, ...next };
    setS(v);
    save(v);
    window.scrollTo({ top: 0 });
  };

  const result: TopResult | null = top.result;
  const student = s.goal === 'student';
  const items = useMemo(() => {
    const list = result?.items ?? [];
    // Students: Ausbildung, internships and trainee roles first.
    return student ? [...list].sort((a, b) => Number(isStudentOrInternJob({ title: b.title })) - Number(isStudentOrInternJob({ title: a.title }))) : list;
  }, [result, student]);
  const countries = countriesOf(items, from);
  const topCountry = countries[0]?.name ?? null;
  const cap = catalog?.auto_apply?.pro_monthly ?? null;
  const auto = cap ? Math.min(Math.max(items.length, 1) * AUTO_APPLY_FACTOR, cap) : Math.max(items.length, 1) * AUTO_APPLY_FACTOR;
  const first = (cv ? nameFromCv(cv.text) ?? '' : '').split(' ')[0] ?? '';

  // Back from checkout without paying: the choice comes again.
  useEffect(() => {
    if (session && (s.plan === 'starter' || s.plan === 'pro')) update({ plan: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toCheckout = (plan: 'starter' | 'pro') => {
    trackBilling('plan_selected', { plan, source: 'cv_quiz' });
    save({ ...s, plan: null });
    nav(checkoutHref(plan, 'cv_quiz'));
  };

  // ---- 1/3 · goal ----
  if (!s.goal) {
    return (
      <Shell step={1}>
        <Title
          sub={
            from ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[14px] font-semibold text-ink-700 ring-1 ring-ink-200">
                <CircleFlag countryCode={from} size={18} label={fromName ?? from} /> {fromName}
              </span>
            ) : undefined
          }
        >
          Smart sponsored job search
        </Title>
        <p className="mb-4 text-center text-[17px] font-bold text-ink-900">What are you looking for?</p>
        <div className="grid grid-cols-2 gap-3">
          <Option icon={Plane} title="A sponsored job abroad" sub="Full-time work" onClick={() => update({ goal: 'job' })} />
          <Option icon={GraduationCap} title="I’m a student" sub="Ausbildung or internship" onClick={() => update({ goal: 'student' })} />
        </div>
        <Cheer>
          <Sparkles className="h-4 w-4" aria-hidden /> Takes less than a minute. Your next job abroad starts here.
        </Cheer>
      </Shell>
    );
  }

  // ---- 2/3 · CV ----
  if (!cv) {
    if (cvMode === 'create') return <CreateCv student={student} onBack={() => setCvMode('choose')} />;
    return (
      <Shell step={2} onBack={() => update({ goal: undefined })}>
        <Title>Your CV / Resume</Title>
        <div className="space-y-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-2 ring-brand-300">
            <CvUpload onDone={() => window.scrollTo({ top: 0 })} />
          </div>
          <Option icon={FileText} title="I don’t have a CV" sub="We’ll create one for you" onClick={() => setCvMode('create')} />
        </div>
        <Cheer>
          <Sparkles className="h-4 w-4" aria-hidden /> You’re doing great — one more step to your matches.
        </Cheer>
      </Shell>
    );
  }

  // ---- the search ----
  if (searching || !result) {
    return (
      <Shell step={2}>
        {top.status === 'error' ? (
          <div className="text-center">
            <Title sub={top.error ?? 'Something went wrong.'}>The search didn’t finish</Title>
            <button onClick={top.start} className="rounded-xl bg-brand-600 px-6 py-3.5 text-[15px] font-bold text-white">
              Try again
            </button>
          </div>
        ) : (
          <SearchProgress state={top.status === 'running' ? top : { stage: 'scoring', progress: 1, live: top.live }} cv={cv} />
        )}
      </Shell>
    );
  }

  // ---- 3/3 · what would you like? ----
  if (!s.plan || (!session && s.plan)) {
    return (
      <Shell step={3} onBack={s.plan ? () => update({ plan: null }) : undefined}>
        <Title
          sub={
            countries.length > 0 ? (
              <span className="inline-flex flex-nowrap items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 ring-1 ring-emerald-100">
                {from && <CircleFlag countryCode={from} size={20} label={fromName ?? from} />}
                {from && <span aria-hidden>→</span>}
                <FlagStack countries={countries} max={5} size={20} />
              </span>
            ) : undefined
          }
        >
          {first ? `${first}, ` : ''}
          <Num className="text-[30px] sm:text-[34px]">{items.length}</Num> {items.length === 1 ? 'opportunity' : 'opportunities'} found
          {countries.length > 1 && (
            <>
              {' '}
              in <Num className="text-[30px] sm:text-[34px]">{countries.length}</Num> countries
            </>
          )}
        </Title>

        {!s.plan ? (
          <>
            <p className="mb-4 text-center text-[17px] font-bold text-ink-900">What would you like?</p>
            <div className="space-y-4">
              <Option icon={Briefcase} title="See my job opportunities" sub="Your best matches" price="Free" onClick={() => update({ plan: 'free' })} />
              <Option icon={FileCheck2} tone="brand" title="Sponsorship documents + all my matches" sub="20 documents a month, every job" price={`Starter · only ${priceLabel('starter')}`} onClick={() => update({ plan: 'starter' })} />
              <Option icon={Zap} tone="premium" badge="Most chances" title={`Auto Apply to ${auto.toLocaleString('en-US')} jobs this month`} sub="With my tailored CV and sponsorship documents" price={`Pro · only ${priceLabel('pro')}`} onClick={() => update({ plan: 'pro' })} />
            </div>
            <Cheer>
              <Sparkles className="h-4 w-4" aria-hidden /> You’re one step away from your next job abroad.
            </Cheer>
          </>
        ) : (
          <div className="rounded-3xl bg-white p-5 ring-2 ring-brand-200">
            <p className="text-center text-[17px] font-bold text-ink-950">Approve your email to continue</p>
            <QuickSignup
              cv={cv}
              sendLabel="Approve your email"
              onVerified={() => {
                if (s.plan === 'starter' || s.plan === 'pro') toCheckout(s.plan);
              }}
            />
          </div>
        )}
      </Shell>
    );
  }

  // ---- Free: the results, with the next step up ----
  const best = items[0] as TopMatch | undefined;
  const open = items[1] as TopMatch | undefined;
  const more = Math.max(0, items.length - 2);
  return (
    <Shell step={null}>
      <Title>
        {first ? `${first}, here` : 'Here'} are your opportunities
      </Title>

      <div className="space-y-3">
        {best && (
          <div className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-2 ring-brand-200">
            <MatchRing score={best.score} size={56} />
            <div className="min-w-0 flex-1">
              <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">
                <Lock className="h-3 w-3" aria-hidden /> Your best match
              </p>
              <span aria-hidden className="mt-1 block h-4 w-3/4 rounded bg-ink-200 blur-[4px]" />
              {best.cc && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-700">
                  <CircleFlag countryCode={best.cc} size={15} label={best.country ?? best.cc} /> {best.country}
                </p>
              )}
            </div>
          </div>
        )}
        {open && (
          <a href={`${jobPath({ id: `sponsored-${open.id}`, title: open.title, company: open.company })}#cv-match`} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-ink-200 hover:ring-brand-300">
            <MatchRing score={open.score} size={56} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-ink-500">{open.company}</span>
              <span className="block text-[16px] font-bold leading-snug text-ink-950">{open.title}</span>
              {open.cc && (
                <span className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-600">
                  <CircleFlag countryCode={open.cc} size={14} label={open.country ?? open.cc} /> {open.country}
                </span>
              )}
            </span>
          </a>
        )}
        {more > 0 && (
          <p className="px-1 text-center text-[14.5px] font-semibold text-ink-600">
            + <Num className="text-[16px]">{more}</Num> more {more === 1 ? 'opportunity' : 'opportunities'} waiting
          </p>
        )}

        {/* Starter */}
        <div className="rounded-3xl bg-white p-5 ring-2 ring-brand-300">
          <p className="text-[18px] font-bold text-ink-950">Unlock your next 20 opportunities</p>
          <ul className="mt-2 space-y-1.5 text-[14.5px] text-ink-800">
            <li className="flex gap-2">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden /> <b>20 sponsorship documents</b>&nbsp;a month
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={3} aria-hidden /> Your best match and <b>&nbsp;all {items.length}</b>&nbsp;jobs
            </li>
          </ul>
          <button onClick={() => toCheckout('starter')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-[15px] font-bold text-white hover:bg-brand-700">
            Starter · only {priceLabel('starter')} <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Pro */}
        <div className="rounded-3xl bg-white p-5 ring-2 ring-amber-400">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-950">
            <Crown className="h-3.5 w-3.5" aria-hidden /> Pro
          </p>
          <p className="mt-2 text-[18px] font-bold text-ink-950">
            Auto Apply to <span className="text-amber-600">{auto.toLocaleString('en-US')}</span> jobs this month
          </p>
          <p className="mt-1 text-[14.5px] text-ink-600">More applications, more chances to move{topCountry ? ` to ${topCountry}` : ' abroad'}.</p>
          <button onClick={() => toCheckout('pro')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3.5 text-[15px] font-extrabold text-ink-950 hover:bg-amber-300">
            <Zap className="h-4 w-4" fill="currentColor" aria-hidden /> Pro · only {priceLabel('pro')}
          </button>
        </div>

        <ExampleJourney rotate className="pt-2" />

        <p className="pt-2 text-center">
          <button onClick={() => nav('/jobs')} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-500 hover:text-ink-800">
            <Upload className="h-4 w-4 rotate-90" aria-hidden /> Browse all jobs
          </button>
        </p>
      </div>
    </Shell>
  );
}
