// /cv-match for everyone not on a plan yet: a 3-step quiz, one thing per screen.
//   1/3  What are you looking for?   — a sponsored job abroad · Ausbildung / internship (students)
//   2/3  Your CV                     — upload it · or "create one for me" (name, field, years, skills)
//        …the search, with its counting loading screen…
//   3/3  What would you like?        — see my opportunities (Free) · documents + all matches (Starter) · Auto Apply (Pro)
//        → approve the email (accounts are made here) → Free: the results, with Starter / Pro and reviews;
//          Starter / Pro: checkout, and back to this page afterwards (paid or not).
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Briefcase, Check, Crown, FileCheck2, FileText, GraduationCap, Lock, Plane, Sparkles, Upload, User, Zap } from 'lucide-react';
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

function Option({ icon: Icon, title, sub, onClick, tone = 'plain', badge }: { icon: typeof Plane; title: string; sub?: React.ReactNode; onClick: () => void; tone?: 'plain' | 'brand' | 'premium'; badge?: string }) {
  const cls =
    tone === 'premium'
      ? 'bg-gradient-to-br from-ink-950 to-brand-900 text-white ring-2 ring-amber-300'
      : tone === 'brand'
        ? 'bg-white ring-2 ring-brand-300 hover:ring-brand-500'
        : 'bg-white ring-1 ring-ink-200 hover:ring-brand-400';
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3.5 rounded-2xl px-4 py-4 text-left transition ${cls}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone === 'premium' ? 'bg-amber-300 text-ink-950' : 'bg-brand-50 text-brand-700'}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        {badge && <span className="mb-1 inline-block rounded-full bg-amber-300 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-950">{badge}</span>}
        <span className={`block text-[16px] font-bold leading-snug ${tone === 'premium' ? 'text-white' : 'text-ink-950'}`}>{title}</span>
        {sub && <span className={`mt-0.5 block text-[13.5px] ${tone === 'premium' ? 'text-white/75' : 'text-ink-600'}`}>{sub}</span>}
      </span>
      <ArrowRight className={`h-5 w-5 shrink-0 ${tone === 'premium' ? 'text-amber-300' : 'text-ink-400'}`} aria-hidden />
    </button>
  );
}

function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[30px]">{children}</h1>
      {sub && <div className="mt-2 text-[15px] text-ink-600">{sub}</div>}
    </div>
  );
}

/** "No CV? Create one for me": four answers, one screen. */
function CreateCv({ student, onDone }: { student: boolean; onDone: (cv: StoredCv) => void }) {
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [years, setYears] = useState(student ? 0 : 3);
  const [skills, setSkills] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = 'h-12 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-[15px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim().split(/\s+/).length < 2) return setError('Write your name and surname.');
        if (!field) return setError('Choose your field.');
        setBusy(true);
        setError(null);
        const res = await saveCvText(cvFromAnswers({ name: name.trim(), field, years, skills, student }));
        setBusy(false);
        if (!res.ok) return setError(res.error);
        onDone(res.cv);
      }}
    >
      <label className="block">
        <span className="text-[13px] font-semibold text-ink-700">Name and surname</span>
        <span className="relative mt-1.5 block">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your full name" className={`${input} pl-9`} />
        </span>
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink-700">Your field</span>
        <span className="relative mt-1.5 block">
          <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <select value={field} onChange={(e) => setField(e.target.value)} className={`${input} appearance-none pl-9`}>
            <option value="">Choose…</option>
            {CATEGORIES_BY_GROUP.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {[...new Set(g.labels.map(cleanLabel))].map((l) => (
                  <option key={`${g.group}:${l}`} value={l}>
                    {l}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </span>
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink-700">Years of experience</span>
        <select value={years} onChange={(e) => setYears(Number(e.target.value))} className={`${input} mt-1.5 appearance-none`}>
          {[0, 1, 2, 3, 5, 7, 10, 15].map((y) => (
            <option key={y} value={y}>
              {y === 0 ? 'None yet' : y === 15 ? '15+' : `${y}+`}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink-700">Main skills</span>
        <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. Excel, customer service, forklift" className={`${input} mt-1.5`} />
      </label>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
      <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-[16px] font-bold text-white hover:bg-brand-700 disabled:opacity-60">
        <Sparkles className="h-4 w-4" aria-hidden /> {busy ? 'Creating…' : 'Create my CV and find jobs'}
      </button>
    </form>
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
        <p className="mb-3 text-center text-[17px] font-bold text-ink-900">What are you looking for?</p>
        <div className="space-y-3">
          <Option icon={Plane} title="A sponsored job abroad" sub="Full-time work with visa sponsorship" onClick={() => update({ goal: 'job' })} />
          <Option icon={GraduationCap} title="I’m a student" sub="Ausbildung, internship or traineeship abroad" onClick={() => update({ goal: 'student' })} />
        </div>
      </Shell>
    );
  }

  // ---- 2/3 · CV ----
  if (!cv) {
    return (
      <Shell step={2} onBack={cvMode === 'create' ? () => setCvMode('choose') : () => update({ goal: undefined })}>
        <Title>{cvMode === 'create' ? 'Let’s create your CV' : 'Your CV / Resume'}</Title>
        {cvMode === 'create' ? (
          <CreateCv student={student} onDone={() => window.scrollTo({ top: 0 })} />
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl bg-white p-4 ring-2 ring-brand-300">
              <CvUpload onDone={() => window.scrollTo({ top: 0 })} />
            </div>
            <Option icon={FileText} title="I don’t have a CV" sub="Create one for me in 1 minute" onClick={() => setCvMode('create')} />
          </div>
        )}
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
            <p className="mb-3 text-center text-[17px] font-bold text-ink-900">What would you like?</p>
            <div className="space-y-3">
              <Option icon={Zap} tone="premium" badge="Pro · most chances" title={`Auto Apply to ${auto.toLocaleString('en-US')} jobs this month`} sub={<>With my tailored CV and sponsorship documents · only {priceLabel('pro')}</>} onClick={() => update({ plan: 'pro' })} />
              <Option icon={FileCheck2} tone="brand" title="Sponsorship documents + all my matches" sub={<>Starter · only {priceLabel('starter')}</>} onClick={() => update({ plan: 'starter' })} />
              <Option icon={Briefcase} title="See my job opportunities" sub="Free" onClick={() => update({ plan: 'free' })} />
            </div>
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
        <div className="rounded-3xl bg-gradient-to-br from-ink-950 to-brand-900 p-5 text-white ring-2 ring-amber-300">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-950">
            <Crown className="h-3.5 w-3.5" aria-hidden /> Pro
          </p>
          <p className="mt-2 text-[18px] font-bold">
            Auto Apply to <span className="text-amber-300">{auto.toLocaleString('en-US')}</span> jobs this month
          </p>
          <p className="mt-1 text-[14.5px] text-white/80">More applications, more chances to move{topCountry ? ` to ${topCountry}` : ' abroad'}.</p>
          <button onClick={() => toCheckout('pro')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 py-3.5 text-[15px] font-extrabold text-ink-950 hover:bg-amber-200">
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
