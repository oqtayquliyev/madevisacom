// /cv-match for everyone not on a plan yet: a short quiz, one thing per screen, each screen its own link
// (/cv-match?step=…) so the browser's back and forward buttons move between them.
//   1/3  goal         — a sponsored job abroad · a student (Ausbildung / internship)
//   2/3  cv           — upload it · or "I don't have a CV" → job-title (+ close titles as tags) → experience (a simple CV is made)
//        …the search, with its counting loading screen…
//   3/3  country      — which country, with the jobs found there
//        plan         — the best jobs found, then "Do you want to…?": explore (Free) · apply with documents (Starter) · Auto Apply (Pro)
//        email        — approve the email (the account is made here)
//   then results (Free) — or checkout (Starter / Pro), coming back here afterwards, paid or not.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Crown, FileCheck2, FileText, Globe2, GraduationCap, Info, Lock, Plane, Plus, Search, Sparkles, X, Zap } from 'lucide-react';
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
import { ALL_TITLES, relatedTitles } from '@/lib/cv/relatedTitles';
import { isStudentOrInternJob } from '@/lib/jobCategories';
import { useAuth } from '@/lib/auth';
import { priceLabel } from '@/lib/plans';
import { checkoutHref, trackBilling, useBillingCatalog } from '@/lib/billing';
import { jobPath } from '@/lib/jobUrl';
import { nav } from '@/lib/pageLayout';
import { countryName } from '@/lib/visaFit';

type Goal = 'job' | 'student';
type Plan = 'free' | 'starter' | 'pro';
type Saved = { goal?: Goal; country?: string | null; plan?: Plan | null };
type Step = 'goal' | 'cv' | 'job-title' | 'experience' | 'country' | 'plan' | 'email' | 'results';
const ORDER: Step[] = ['goal', 'cv', 'job-title', 'experience', 'country', 'plan', 'email', 'results'];
const NUMBER: Record<Step, 1 | 2 | 3 | null> = { goal: 1, cv: 2, 'job-title': 2, experience: 2, country: 3, plan: 3, email: 3, results: null };

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
const urlStep = (): Step | null => {
  const s = new URLSearchParams(window.location.search).get('step') as Step | null;
  return s && ORDER.includes(s) ? s : null;
};
const hrefFor = (step: Step) => `/cv-match?step=${step}`;
/** Steps pushed in this visit — Back goes back through them, otherwise to the step before. */
let pushed = 0;

const STYLE = `
@keyframes mvQuizIn { from { opacity: 0; transform: translate3d(28px,0,0) } to { opacity: 1; transform: none } }
@keyframes mvQuizBack { from { opacity: 0; transform: translate3d(-28px,0,0) } to { opacity: 1; transform: none } }
.mv-quiz-step { animation: mvQuizIn .34s cubic-bezier(.2,.8,.2,1) both; will-change: transform, opacity }
.mv-quiz-step.back { animation-name: mvQuizBack }
@keyframes mvTagIn { from { opacity: 0; transform: scale(.6) translate3d(0,6px,0) } 60% { opacity: 1; transform: scale(1.06) } to { opacity: 1; transform: none } }
.mv-quiz-tag { animation: mvTagIn .42s cubic-bezier(.2,.8,.2,1) both }
@media (prefers-reduced-motion: reduce) { .mv-quiz-step, .mv-quiz-tag { animation: none } }
`;

function Shell({ step, stepKey, back, onBack, children }: { step: 1 | 2 | 3 | null; stepKey: string; back: boolean; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-ink-900">
      <style>{STYLE}</style>
      <header className="sticky top-0 z-10 border-b border-ink-100 bg-white/95 backdrop-blur">
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
          <div className="h-full bg-brand-600 transition-[width] duration-500 ease-out" style={{ width: `${((step ?? 3) / 3) * 100}%` }} />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:pt-12">
        <div key={stepKey} className={`mv-quiz-step ${back ? 'back' : ''}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

/** One answer as a card: icon on top, title, one short line, and the price when there is one. */
function Option({ icon: Icon, title, sub, price, onClick, tone = 'plain', badge, disabled }: { icon: typeof Plane; title: string; sub?: React.ReactNode; price?: string; onClick: () => void; tone?: 'plain' | 'brand' | 'premium'; badge?: string; disabled?: boolean }) {
  const ring = tone === 'premium' ? 'ring-2 ring-amber-400 hover:ring-amber-500' : tone === 'brand' ? 'ring-2 ring-brand-300 hover:ring-brand-500' : 'ring-1 ring-ink-200 hover:ring-brand-400';
  const iconBg = tone === 'premium' ? 'bg-amber-100 text-amber-700' : tone === 'brand' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700';
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`relative flex w-full flex-col items-center gap-2 rounded-2xl bg-white px-4 pb-5 pt-6 text-center shadow-sm transition active:scale-[0.98] disabled:opacity-60 sm:hover:-translate-y-0.5 sm:hover:shadow-md ${ring}`}
    >
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

/** A plan as a question: what will happen, and a "Yes" with the price. */
function Ask({ icon: Icon, question, how, cta, onClick, tone = 'plain', badge }: { icon: typeof Plane; question: React.ReactNode; how: string; cta: string; onClick: () => void; tone?: 'plain' | 'brand' | 'premium'; badge?: string }) {
  const ring = tone === 'premium' ? 'ring-2 ring-amber-400' : tone === 'brand' ? 'ring-2 ring-brand-300' : 'ring-1 ring-ink-200';
  const iconBg = tone === 'premium' ? 'bg-amber-100 text-amber-700' : tone === 'brand' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700';
  const btn = tone === 'premium' ? 'bg-amber-400 text-ink-950 hover:bg-amber-300' : tone === 'brand' ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-white text-brand-700 ring-1 ring-brand-300 hover:bg-brand-50';
  return (
    <div className={`relative rounded-2xl bg-white p-4 pt-5 text-center shadow-sm sm:p-5 ${ring}`}>
      {badge && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-950">{badge}</span>}
      <span className={`mx-auto grid h-11 w-11 place-items-center rounded-2xl ${iconBg}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-2.5 text-[17px] font-bold leading-snug text-ink-950">{question}</p>
      <p className="mt-1 text-[14px] leading-5 text-ink-600">{how}</p>
      <button onClick={onClick} className={`mt-3.5 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15.5px] font-bold transition active:scale-[0.98] ${btn}`}>
        {cta} <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** A short, warm line under each question. */
function Cheer({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[13.5px] font-medium text-emerald-700">
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden /> {children}
    </p>
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

const YEARS: { label: string; years: number }[] = [
  { label: 'None yet', years: 0 },
  { label: '1–2 years', years: 2 },
  { label: '3–5 years', years: 4 },
  { label: '6–10 years', years: 8 },
  { label: '10+ years', years: 12 },
];
/** Starter's sponsorship documents a month. */
const DOCS_STARTER = 20;
const TITLE_KEY = 'mv:cvQuizTitle';
const TAGS_KEY = 'mv:cvQuizTags';
const readTags = (): string[] | null => {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(TAGS_KEY) ?? 'null');
    return Array.isArray(v) ? (v as string[]) : null;
  } catch {
    return null;
  }
};
const remember = (key: string, v: string) => {
  try {
    window.sessionStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
};

export function CvQuiz({ top, searching, cv }: { top: TopState & { start: () => void }; searching: boolean; cv: StoredCv | null }) {
  const { session } = useAuth();
  const [s, setS] = useState<Saved>(() => load());
  const [view, setView] = useState<Step>(() => urlStep() ?? 'goal');
  const viewRef = useRef(view);
  viewRef.current = view;
  const [back, setBack] = useState(false);
  const [title, setTitle] = useState(() => {
    try {
      return window.sessionStorage.getItem(TITLE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  // Close titles, searched too. Suggested from the title; the person can remove any of them.
  const [tags, setTags] = useState<string[]>(() => readTags() ?? []);
  const [dropped, setDropped] = useState<string[]>([]);
  useEffect(() => {
    const t = title.trim();
    if (t.length < 3) return setTags([]);
    const id = window.setTimeout(() => setTags(relatedTitles(t).filter((r) => !dropped.includes(r))), 350);
    return () => window.clearTimeout(id);
  }, [title, dropped]);
  useEffect(() => remember(TAGS_KEY, JSON.stringify(tags)), [tags]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const from = useFromCountry();
  const fromName = from ? countryName(from) ?? from : null;
  const catalog = useBillingCatalog();

  const update = (next: Saved) =>
    setS((cur) => {
      const v = { ...cur, ...next };
      save(v);
      return v;
    });
  const go = (step: Step) => {
    setError(null);
    setBack(ORDER.indexOf(step) < ORDER.indexOf(view));
    window.history.pushState({}, '', hrefFor(step));
    pushed += 1;
    setView(step);
    window.scrollTo({ top: 0 });
  };
  const replace = (step: Step) => {
    window.history.replaceState({}, '', hrefFor(step));
    setView(step);
  };
  const goBack = (fallback: Step) => {
    if (pushed > 0) {
      pushed -= 1;
      window.history.back();
    } else {
      setBack(true);
      replace(fallback);
      window.scrollTo({ top: 0 });
    }
  };

  // The browser's back / forward buttons.
  useEffect(() => {
    if (!urlStep()) window.history.replaceState({}, '', hrefFor(view));
    const onPop = () => {
      const next = urlStep() ?? 'goal';
      setBack(ORDER.indexOf(next) < ORDER.indexOf(viewRef.current));
      setView(next);
      setS(load());
      setError(null);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result: TopResult | null = top.result;
  const student = s.goal === 'student';
  const all = useMemo(() => {
    const list = result?.items ?? [];
    // Students: Ausbildung, internships and trainee roles first.
    return student ? [...list].sort((a, b) => Number(isStudentOrInternJob({ title: b.title })) - Number(isStudentOrInternJob({ title: a.title }))) : list;
  }, [result, student]);
  const countries = countriesOf(all, from);
  const picked = s.country && s.country !== 'any' ? s.country : null;
  const items = picked ? all.filter((m) => m.cc?.toUpperCase() === picked) : all;
  const pickedName = picked ? countries.find((c) => c.cc === picked)?.name ?? countryName(picked) : null;
  const cap = catalog?.auto_apply?.pro_monthly ?? null;
  const auto = cap ? Math.min(Math.max(items.length, 1) * AUTO_APPLY_FACTOR, cap) : Math.max(items.length, 1) * AUTO_APPLY_FACTOR;
  const first = (cv ? nameFromCv(cv.text) ?? '' : '').split(' ')[0] ?? '';

  // Where they may be: never past a step whose answer is missing.
  const allowed: Step = (() => {
    const want = view;
    if (!s.goal) return 'goal';
    if (want === 'goal' || want === 'cv' || want === 'job-title') return want;
    if (want === 'experience') return title.trim() ? 'experience' : 'job-title';
    if (!cv) return 'cv';
    if (want === 'country') return 'country';
    if (!s.country) return 'country';
    if (want === 'plan') return 'plan';
    if (!s.plan) return 'plan';
    if (want === 'email') return session && s.plan === 'free' ? 'results' : 'email';
    return session ? 'results' : 'email';
  })();
  useEffect(() => {
    if (allowed !== view) replace(allowed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, view]);

  const toCheckout = (plan: 'starter' | 'pro') => {
    trackBilling('plan_selected', { plan, source: 'cv_quiz' });
    update({ plan: null });
    nav(checkoutHref(plan, 'cv_quiz'));
  };
  const choose = (plan: Plan) => {
    update({ plan });
    if (!session) return go('email');
    if (plan === 'free') return go('results');
    toCheckout(plan);
  };

  const stepKey = allowed;
  const shell = (step: Step, prev: Step | null, children: React.ReactNode) => (
    <Shell step={NUMBER[step]} stepKey={stepKey} back={back} onBack={prev ? () => goBack(prev) : undefined}>
      {children}
    </Shell>
  );

  // ---- 1/3 · goal ----
  if (allowed === 'goal') {
    return shell(
      'goal',
      null,
      <>
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
          <Option
            icon={Plane}
            title="A sponsored job abroad"
            sub="Full-time work"
            onClick={() => {
              update({ goal: 'job' });
              go('cv');
            }}
          />
          <Option
            icon={GraduationCap}
            title="I’m a student"
            sub="Ausbildung / practice abroad"
            onClick={() => {
              update({ goal: 'student' });
              go('cv');
            }}
          />
        </div>
        <Cheer>Takes less than a minute. Find your employer abroad.</Cheer>
      </>,
    );
  }

  // ---- 2/3 · CV ----
  if (allowed === 'cv') {
    return shell(
      'cv',
      'goal',
      <>
        <Title>Your CV / Resume</Title>
        <div className="space-y-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-2 ring-brand-300">
            <CvUpload allowRemove onDone={() => go('country')} />
          </div>
          {cv ? (
            <button onClick={() => go('country')} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3.5 text-[16px] font-bold text-white hover:bg-brand-700">
              Continue with this CV <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <Option icon={FileText} title="I don’t have a CV" sub="We’ll create one for you" onClick={() => go('job-title')} />
          )}
        </div>
        <Cheer>You’re doing great — one more step to your matches.</Cheer>
      </>,
    );
  }

  // ---- 2/3 · no CV: the job title ----
  if (allowed === 'job-title') {
    return shell(
      'job-title',
      'cv',
      <>
        <Title>What exact job title are you searching for?</Title>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length < 2) return setError('Write a job title.');
            remember(TITLE_KEY, title.trim());
            go('experience');
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
          {tags.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-700">
                <Plus className="h-4 w-4 text-brand-600" aria-hidden /> We’ll also search close jobs, for more results
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((t, i) => (
                  <span key={t} className="mv-quiz-tag inline-flex items-center gap-1 rounded-full bg-brand-50 py-1.5 pl-3 pr-1.5 text-[14px] font-semibold text-brand-800 ring-1 ring-brand-200" style={{ animationDelay: `${i * 90}ms` }}>
                    {t}
                    <button type="button" onClick={() => setDropped((d) => [...d, t])} aria-label={`Remove ${t}`} className="grid h-6 w-6 place-items-center rounded-full hover:bg-brand-100">
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
          <button className="mt-5 w-full rounded-full bg-brand-700 py-3.5 text-[16px] font-bold text-white hover:bg-brand-800">Continue</button>
          <p className="mt-4 flex gap-2 text-[13.5px] leading-5 text-ink-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Specific titles get better matches. “Project Manager” works better than “Manager”.
          </p>
        </form>
      </>,
    );
  }

  // ---- 2/3 · no CV: years of experience → the CV is made ----
  if (allowed === 'experience') {
    return shell(
      'experience',
      'job-title',
      <>
        <Title>How many years of experience do you have?</Title>
        <div className="grid grid-cols-2 gap-3">
          {YEARS.map((y) => (
            <button
              key={y.label}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const res = await saveCvText(cvFromAnswers({ name: '', field: title.trim(), years: y.years, skills: '', student, related: tags }));
                setBusy(false);
                if (!res.ok) return setError(res.error);
                go('country');
              }}
              className="rounded-2xl bg-white px-3 py-5 text-[16px] font-bold text-ink-950 shadow-sm ring-1 ring-ink-200 transition active:scale-[0.98] disabled:opacity-60 sm:hover:-translate-y-0.5 sm:hover:ring-brand-400 [&:last-child]:col-span-2"
            >
              {y.label}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
        <Cheer>{busy ? 'Creating your CV…' : 'Almost there — every year of experience counts.'}</Cheer>
      </>,
    );
  }

  // ---- the search (between 2/3 and 3/3) ----
  if (searching || !result) {
    return shell(
      'country',
      'cv',
      top.status === 'error' ? (
        <div className="text-center">
          <Title sub={top.error ?? 'Something went wrong.'}>The search didn’t finish</Title>
          <button onClick={top.start} className="rounded-xl bg-brand-600 px-6 py-3.5 text-[15px] font-bold text-white">
            Try again
          </button>
        </div>
      ) : (
        <SearchProgress state={top.status === 'running' ? top : { stage: 'scoring', progress: 1, live: top.live }} cv={cv} />
      ),
    );
  }

  // ---- 3/3 · which country? ----
  if (allowed === 'country') {
    const shown = countries.slice(0, 6);
    return shell(
      'country',
      'cv',
      <>
        <Title>{first ? `${first}, which` : 'Which'} country do you want to work in?</Title>
        <div className="grid grid-cols-2 gap-3">
          {shown.map((c) => {
            const sponsors = all.filter((m) => m.cc?.toUpperCase() === c.cc && m.visa === 'offered').length;
            return (
              <button
                key={c.cc}
                onClick={() => {
                  update({ country: c.cc });
                  go('plan');
                }}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-3 pb-4 pt-5 text-center shadow-sm ring-1 ring-ink-200 transition active:scale-[0.98] sm:hover:-translate-y-0.5 sm:hover:ring-brand-400"
              >
                <CircleFlag countryCode={c.cc} size={40} label={c.name} />
                <span className="text-[16px] font-bold leading-tight text-ink-950">{c.name}</span>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[13px] font-extrabold text-brand-700">
                  {c.n} {c.n === 1 ? 'job' : 'jobs'} for you
                </span>
                {sponsors > 0 && <span className="text-[12.5px] font-semibold text-emerald-700">{sponsors} offer sponsorship</span>}
              </button>
            );
          })}
          <button
            onClick={() => {
              update({ country: 'any' });
              go('plan');
            }}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white px-3 pb-4 pt-5 text-center shadow-sm ring-1 ring-ink-200 transition active:scale-[0.98] sm:hover:ring-brand-400 ${shown.length % 2 === 0 ? 'col-span-2' : ''}`}
          >
            <Globe2 className="h-10 w-10 text-brand-600" aria-hidden />
            <span className="text-[16px] font-bold text-ink-950">Anywhere abroad</span>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[13px] font-extrabold text-brand-700">{all.length} jobs for you</span>
          </button>
        </div>
        <Cheer>Your sponsorship documents are ready for every country.</Cheer>
      </>,
    );
  }

  // ---- 3/3 · the best jobs found, then what they want to do with them ----
  if (allowed === 'plan') {
    const preview = items.slice(0, 3);
    const docs = Math.min(Math.max(items.length, 1), DOCS_STARTER);
    return shell(
      'plan',
      'country',
      <>
        <Title
          sub={
            <span className="inline-flex flex-nowrap items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 ring-1 ring-emerald-100">
              {from && <CircleFlag countryCode={from} size={20} label={fromName ?? from} />}
              {from && <span aria-hidden>→</span>}
              {picked ? <CircleFlag countryCode={picked} size={20} label={pickedName ?? picked} /> : <FlagStack countries={countries} max={5} size={20} />}
            </span>
          }
        >
          <Num className="text-[30px] sm:text-[34px]">{items.length}</Num> {items.length === 1 ? 'job' : 'jobs'} for you {pickedName ? `in ${pickedName}` : 'abroad'}
        </Title>

        <ol className="space-y-2.5">
          {preview.map((m, i) => (
            <li key={m.id} className="mv-quiz-tag flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-ink-200" style={{ animationDelay: `${120 + i * 140}ms` }}>
              <MatchRing score={m.score} size={48} />
              <span className="min-w-0 flex-1">
                {i === 0 && <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-700">Most matching</span>}
                <span className="block truncate text-[15.5px] font-bold leading-snug text-ink-950">{m.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-600">
                  {m.cc && <CircleFlag countryCode={m.cc} size={14} label={m.country ?? m.cc} />}
                  <span className="truncate">{m.country}</span>
                  <span aria-hidden>·</span>
                  <span aria-hidden className="inline-block h-3 w-20 rounded bg-ink-200 blur-[3px]" />
                  <span className="sr-only">Company shown after you choose</span>
                </span>
              </span>
            </li>
          ))}
        </ol>
        {items.length > preview.length && (
          <p className="mt-2.5 text-center text-[14px] font-semibold text-ink-600">
            + <Num className="text-[15px]">{items.length - preview.length}</Num> more
          </p>
        )}

        <p className="mb-3 mt-7 text-center text-[18px] font-bold text-ink-900">Do you want to…</p>
        <div className="space-y-3">
          <Ask
            icon={Search}
            question={<>Explore <Num>{items.length}</Num> {items.length === 1 ? 'job' : 'jobs'}?</>}
            how="You see the jobs. Your best match stays hidden."
            cta="Yes, explore for free"
            onClick={() => choose('free')}
          />
          <Ask
            icon={FileCheck2}
            tone="brand"
            question={<>Apply to <Num>{docs}</Num> {docs === 1 ? 'job' : 'jobs'} with a sponsorship document for each?</>}
            how="Today’s jobs, your best matches unlocked. You send each application with its document."
            cta={`Yes · ${priceLabel('starter')}`}
            onClick={() => choose('starter')}
          />
          <Ask
            icon={Zap}
            tone="premium"
            badge="Most chances"
            question={<>Apply to <Num tone="amber" className="!text-amber-600">{auto.toLocaleString('en-US')}</Num> jobs in one month, automatically?</>}
            how="Today’s jobs and every new one in the next 30 days. Smart Tool applies with your CV and sponsorship document."
            cta={`Yes · ${priceLabel('pro')}`}
            onClick={() => choose('pro')}
          />
        </div>
        <Cheer>You’re one step away from your employer abroad.</Cheer>
      </>,
    );
  }

  // ---- 3/3 · approve the email ----
  if (allowed === 'email') {
    return shell(
      'email',
      'plan',
      <>
        <Title>Approve your email to continue</Title>
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-2 ring-brand-200">
          <QuickSignup
            cv={cv}
            sendLabel="Approve your email"
            onVerified={() => {
              if (s.plan === 'starter' || s.plan === 'pro') toCheckout(s.plan);
              else replace('results');
            }}
          />
        </div>
        <Cheer>Free account, no password. Your results are saved.</Cheer>
      </>,
    );
  }

  // ---- Free: the results, with the next step up ----
  const best = items[0] as TopMatch | undefined;
  const open = items[1] as TopMatch | undefined;
  const more = Math.max(0, items.length - 2);
  return shell(
    'results',
    'plan',
    <>
      <Title>{first ? `${first}, here` : 'Here'} are your opportunities</Title>
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

        <Ask
          icon={FileCheck2}
          tone="brand"
          question={<>Apply to <Num>{Math.min(Math.max(items.length, 1), DOCS_STARTER)}</Num> jobs with a sponsorship document for each?</>}
          how="Your best match and all your jobs unlocked."
          cta={`Yes · ${priceLabel('starter')}`}
          onClick={() => toCheckout('starter')}
        />

        <Ask
          icon={Crown}
          tone="premium"
          badge="Most chances"
          question={<>Apply to <Num tone="amber" className="!text-amber-600">{auto.toLocaleString('en-US')}</Num> jobs in one month, automatically?</>}
          how={`Today’s jobs and every new one in the next 30 days — more chances to move ${pickedName ? `to ${pickedName}` : 'abroad'}.`}
          cta={`Yes · ${priceLabel('pro')}`}
          onClick={() => toCheckout('pro')}
        />

        <ExampleJourney rotate className="pt-2" />
      </div>
    </>,
  );
}
