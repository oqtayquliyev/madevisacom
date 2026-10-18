// /cv-match for everyone not on a plan yet: a short quiz, one thing per screen, each screen its own link
// (/cv-match?step=…) so the browser's back and forward buttons move between them.
//   1/3  goal         — a sponsored job abroad · a student (Ausbildung / internship)
//   2/3  cv           — upload it · or "I don't have a CV" → job-title (+ close titles as tags) → experience (a simple CV is made)
//        …the search, with its counting loading screen…
//   3/3  country      — which country, with the jobs found there
//        plan         — the best jobs found, and what is still missing, each with a "do it automatically" button
//        email        — confirm the email (the account is made here), with what is waiting for them
//        choose       — Free · Starter · Pro, with the reviews
//   then the full CV match (Free) — or checkout (Starter / Pro), coming back to the full CV match afterwards.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Clock, Compass, Loader2, MailCheck, Rocket, ShieldCheck, Wand2, FileText, Globe2, GraduationCap, Info, Plane, Plus, Search, Sparkles, X, XCircle } from 'lucide-react';
import { BrandMark } from '@/components/layout/Logo';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CvUpload } from '@/components/cv/CvUpload';
import { QuickSignup } from '@/components/cv/QuickSignup';
import { MatchRing } from '@/components/cv/MatchBits';
import { ExampleJourney } from '@/components/cv/ExampleJourney';
import { SearchProgress, freeVisible } from '@/components/cv/TopMatches';
import { Num, useFromCountry } from '@/components/cv/DocReady';
import { AUTO_APPLY_FACTOR, FlagStack, countriesOf } from '@/components/cv/Upsell';
import { nameFromCv } from '@/components/cv/CvInsights';
import { saveCvText } from '@/lib/cv/store';
import { cvFromAnswers } from '@/lib/cv/createCv';
import type { TopMatch, TopState, TopResult } from '@/lib/cv/topMatches';
import type { StoredCv } from '@/lib/cv/store';
import { ALL_TITLES, STUDY_FIELDS, relatedTitles } from '@/lib/cv/relatedTitles';
import { isStudentOrInternJob } from '@/lib/jobCategories';
import { useAuth } from '@/lib/auth';
import { priceLabel } from '@/lib/plans';
import { checkoutHref, trackBilling, useBillingCatalog } from '@/lib/billing';
import { jobPath } from '@/lib/jobUrl';
import { nav } from '@/lib/pageLayout';
import { NEW_TAB } from '@/lib/navLink';
import { countryName } from '@/lib/visaFit';

type Goal = 'job' | 'student';
type Plan = 'free' | 'starter' | 'pro';
type Saved = { goal?: Goal; country?: string | null; plan?: Plan | null };
type Step = 'goal' | 'cv' | 'job-title' | 'experience' | 'country' | 'plan' | 'email' | 'choose';
const ORDER: Step[] = ['goal', 'cv', 'job-title', 'experience', 'country', 'plan', 'email', 'choose'];
const NUMBER: Record<Step, 1 | 2 | 3 | null> = { goal: 1, cv: 2, 'job-title': 2, experience: 2, country: 3, plan: 3, email: 3, choose: null };

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
@keyframes mvSpin { to { transform: rotate(360deg) } }
.mv-spin { animation: mvSpin 1.6s linear infinite }
@media (prefers-reduced-motion: reduce) { .mv-quiz-step, .mv-quiz-tag, .mv-spin { animation: none } }
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

/** Regular prices; the visitor's price (the plan's real price) is shown against them. */
const WAS: Record<'starter' | 'pro', number> = { starter: 4.99, pro: 14.99 };
const usd = (n: number) => `$${n.toFixed(2)}`;
const amountOf = (label: string) => Number(label.replace(/[^0-9.]/g, '').replace(/\.$/, '')) || 0;

const PLAN_LOOK = {
  free: { tile: 'bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-700 ring-emerald-200', ring: 'ring-1 ring-ink-200', name: 'text-emerald-700', btn: 'bg-white text-ink-900 ring-1 ring-ink-300 hover:bg-ink-50', tick: 'text-emerald-600' },
  starter: { tile: 'bg-gradient-to-br from-brand-50 to-indigo-100 text-brand-700 ring-brand-200', ring: 'ring-2 ring-brand-300', name: 'text-brand-700', btn: 'bg-brand-600 text-white hover:bg-brand-700', tick: 'text-brand-600' },
  pro: { tile: 'bg-gradient-to-br from-amber-50 to-orange-100 text-amber-700 ring-amber-200', ring: 'ring-2 ring-amber-400', name: 'text-amber-700', btn: 'bg-gradient-to-r from-amber-400 to-orange-400 text-ink-950 hover:from-amber-300 hover:to-orange-300', tick: 'text-amber-600' },
} as const;

/** A plan: name, what it does, the price (with the regular one struck through). Open: the details and the button. */
function PlanCard({ plan, icon: Icon, name, title, now, was, points, cta, onClick, open, onToggle, badge, note }: { plan: Plan; icon: typeof Plane; name: string; title: React.ReactNode; now?: number; was?: number; points: React.ReactNode[]; cta: string; onClick: () => void; open: boolean; onToggle: () => void; badge?: string; note?: string }) {
  const look = PLAN_LOOK[plan];
  const off = now && was ? Math.round((1 - now / was) * 100) : 0;
  return (
    <div className={`relative rounded-3xl bg-white shadow-sm transition ${look.ring} ${open ? 'shadow-md' : ''}`}>
      {badge && <span className="absolute -top-2.5 right-5 whitespace-nowrap rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-950 shadow-sm">{badge}</span>}
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3.5 p-4 text-left sm:p-5">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ${look.tile}`}>
          <Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[12px] font-extrabold uppercase tracking-[0.08em] ${look.name}`}>{name}</span>
          <span className="mt-0.5 block text-[17px] font-bold leading-snug text-ink-950">{title}</span>
          <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            {now ? (
              <>
                {was && <s className="text-[15px] font-semibold text-ink-400">{usd(was)}</s>}
                <b className="text-[24px] font-extrabold leading-none tracking-tight text-ink-950">{usd(now)}</b>
                <span className="text-[13px] font-semibold text-ink-600">/ month</span>
                {off > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[12px] font-extrabold text-emerald-800">−{off}%</span>}
              </>
            ) : (
              <b className="text-[24px] font-extrabold leading-none tracking-tight text-ink-950">$0</b>
            )}
          </span>
        </span>
        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-ink-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <ul className="space-y-1.5 border-t border-ink-100 pt-3">
              {points.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-[14.5px] font-semibold text-ink-800">
                  <Check className={`mt-0.5 h-4 w-4 shrink-0 ${look.tick}`} strokeWidth={3} aria-hidden /> <span>{t}</span>
                </li>
              ))}
            </ul>
            <button tabIndex={open ? 0 : -1} onClick={onClick} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15.5px] font-bold shadow-sm transition active:scale-[0.98] ${look.btn}`}>
              {cta} <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            {note && <p className="mt-2 text-center text-[13px] font-semibold text-ink-600">{note}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

type Prep = { state: 'idle' | 'running' | 'done'; n: number };

/** One thing still missing before applying, and the button that does it — with its progress, then the result. */
function Need({ icon: Icon = XCircle, tone = 'missing', children, value, action, onAction, waiting, prep, total, doneText }: { icon?: typeof Plane; tone?: 'missing' | 'hurry'; children: React.ReactNode; value?: React.ReactNode; action?: string; onAction?: () => void; waiting?: boolean; prep?: Prep; total?: number; doneText?: React.ReactNode }) {
  const running = prep?.state === 'running';
  const done = prep?.state === 'done';
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        {done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        ) : running || waiting ? (
          <Loader2 className="mv-spin h-5 w-5 shrink-0 text-brand-500" aria-hidden />
        ) : (
          <Icon className={`h-5 w-5 shrink-0 ${tone === 'hurry' ? 'text-amber-500' : 'text-rose-500'}`} aria-hidden />
        )}
        <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink-900">{children}</span>
        {running && total ? (
          <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-[13px] font-extrabold tabular-nums text-brand-700">
            {prep!.n} / {total}
          </span>
        ) : done && total ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[13px] font-extrabold tabular-nums text-emerald-700">
            {total} / {total}
          </span>
        ) : (
          value != null && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-extrabold tabular-nums ${waiting ? 'bg-brand-50 text-brand-700' : 'bg-rose-50 text-rose-700'}`}>{value}</span>
        )}
      </div>
      {running && total ? (
        <div className="ml-8 mt-2.5">
          <div className="h-2 overflow-hidden rounded-full bg-brand-100">
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-100 ease-linear" style={{ width: `${(prep!.n / total) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-[13px] font-semibold text-brand-700">Preparing…</p>
        </div>
      ) : done && doneText ? (
        <div className="ml-8 mt-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[13.5px] leading-snug text-emerald-900">{doneText}</div>
      ) : (
        action &&
        onAction && (
          <button onClick={onAction} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3 text-[14.5px] font-bold text-white shadow-sm hover:bg-brand-700">
            <Wand2 className="h-4 w-4" aria-hidden /> {action}
          </button>
        )
      )}
    </li>
  );
}

/** A key word in a heading: blue, with a hand-drawn curved underline. */
function Hl({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap text-brand-600">
      {children}
      <svg aria-hidden viewBox="0 0 200 12" preserveAspectRatio="none" className="pointer-events-none absolute -bottom-2 left-0 h-3 w-full text-brand-400">
        <path d="M3 9 C 50 2, 120 2, 197 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

/** One job: match ring, company, title, country. Open for everyone. */
function JobRow({ m, top, delay }: { m: TopMatch; top?: boolean; delay?: number }) {
  return (
    <a
      href={`${jobPath({ id: `sponsored-${m.id}`, title: m.title, company: m.company })}#cv-match`}
      {...NEW_TAB}
      className={`flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm transition hover:ring-brand-300 ${top ? 'ring-2 ring-brand-200' : 'ring-1 ring-ink-200'} ${delay != null ? 'mv-quiz-tag' : ''}`}
      style={delay != null ? { animationDelay: `${delay}ms` } : undefined}
    >
      <MatchRing score={m.score} size={48} />
      <span className="min-w-0 flex-1">
        {top && <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-700">Most matching</span>}
        <span className="block text-[15.5px] font-bold leading-snug text-ink-950">{m.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-600">
          <span className="font-semibold text-ink-700">{m.company}</span>
          {m.cc && (
            <>
              <span aria-hidden>·</span>
              <CircleFlag countryCode={m.cc} size={14} label={m.country ?? m.cc} /> {m.country}
            </>
          )}
        </span>
      </span>
    </a>
  );
}

/** Study fields first, then every job title and category (the same categories as the jobs page filter). */
const STUDY_OPTIONS = [...new Set([...STUDY_FIELDS, ...ALL_TITLES])];

/** "Prod" → Product designer, Product manager, Production worker… — words that start with it first. */
function suggest(q: string, options: string[], max = 8): string[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const starts: string[] = [];
  const word: string[] = [];
  const inside: string[] = [];
  for (const o of options) {
    const l = o.toLowerCase();
    if (l === t) continue;
    if (l.startsWith(t)) starts.push(o);
    else if (l.split(/[\s/&,()-]+/).some((w) => w.startsWith(t))) word.push(o);
    else if (l.includes(t)) inside.push(o);
  }
  return [...starts, ...word, ...inside].slice(0, max);
}

function Marked({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0 || !q.trim()) return <>{text}</>;
  const n = q.trim().length;
  return (
    <>
      {text.slice(0, i)}
      <b className="font-bold text-ink-950">{text.slice(i, i + n)}</b>
      {text.slice(i + n)}
    </>
  );
}

/** The title box, with its own list of matches as you type (works the same on every phone and browser). */
function TitleSearch({ label, placeholder, value, onChange, options }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const list = useMemo(() => suggest(value, options), [value, options]);
  const show = open && list.length > 0;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div className="relative">
      <label htmlFor="quiz-title" className="text-[14px] font-semibold text-ink-800">
        {label}
      </label>
      <span className="relative mt-1.5 block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          id="quiz-title"
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={show}
          aria-controls="quiz-title-list"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setAt(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!show) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAt((n) => (n + 1) % list.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setAt((n) => (n - 1 + list.length) % list.length);
            } else if (e.key === 'Enter' && list[at]) {
              e.preventDefault();
              pick(list[at]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          className="h-14 w-full rounded-xl border border-ink-200 bg-white pl-11 pr-3.5 text-[16px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </span>
      {show && (
        <ul id="quiz-title-list" role="listbox" className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl bg-white py-1.5 shadow-lg ring-1 ring-ink-200">
          {list.map((o, i) => (
            <li key={o} role="option" aria-selected={i === at}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setAt(i)}
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px] text-ink-700 ${i === at ? 'bg-brand-50' : ''}`}
              >
                <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                <span>
                  <Marked text={o} q={value} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
/** Pro's sponsorship documents a month. */
const DOCS_PRO = 50;
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

export function CvQuiz({ top, searching, cv, onExit }: { top: TopState & { start: () => void }; searching: boolean; cv: StoredCv | null; onExit: () => void }) {
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
    // Students tell us their study field instead of their years of experience.
    if (want === 'experience') return title.trim() && !student ? 'experience' : 'job-title';
    if (!cv) return 'cv';
    if (want === 'country') return 'country';
    if (!s.country) return 'country';
    if (want === 'plan') return 'plan';
    // The plan is chosen after the email is confirmed.
    return session ? 'choose' : 'email';
  })();
  useEffect(() => {
    if (allowed !== view) replace(allowed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, view]);

  const toCheckout = (plan: 'starter' | 'pro') => {
    trackBilling('plan_selected', { plan, source: 'cv_quiz' });
    update({ plan: null });
    // Paid or not, checkout brings them back to the full CV match, not to a quiz step.
    window.history.replaceState({}, '', '/cv-match');
    nav(checkoutHref(plan, 'cv_quiz'));
  };
  const choose = (plan: Plan) => {
    if (plan === 'free') return onExit();
    toCheckout(plan);
  };
  /** "Send all applications" (or "Complete all"): what is not prepared yet first, then confirm the email. */
  const startAuto = async (what: string) => {
    trackBilling('plan_selected', { plan: 'free', source: `cv_quiz_auto_${what}` });
    if (prepRef.current.docs.state === 'idle') await runPrep('docs', items.length);
    if (missingSkills > 0 && prepRef.current.cv.state === 'idle') await runPrep('cv', items.length);
    go('email');
  };

  /** "I don't have a CV": make a simple one from the answers, then on to the countries. */
  const makeCv = async (years: number) => {
    setBusy(true);
    setError(null);
    const res = await saveCvText(cvFromAnswers({ name: '', field: title.trim(), years, skills: '', student, related: tags }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    go('country');
  };
  // "Prepare documents / Add to CV automatically": a short progress over the jobs, then the result (kept for the next screens).
  const PREP_KEY = 'mv:cvQuizPrep';
  const [prep, setPrep] = useState<Record<'docs' | 'cv', Prep>>(() => {
    try {
      const v = JSON.parse(window.sessionStorage.getItem(PREP_KEY) ?? 'null');
      if (v?.docs && v?.cv) return { docs: v.docs.state === 'done' ? v.docs : { state: 'idle', n: 0 }, cv: v.cv.state === 'done' ? v.cv : { state: 'idle', n: 0 } };
    } catch {
      /* ignore */
    }
    return { docs: { state: 'idle', n: 0 }, cv: { state: 'idle', n: 0 } };
  });
  const prepRef = useRef(prep);
  prepRef.current = prep;
  useEffect(() => remember(PREP_KEY, JSON.stringify(prep)), [prep]);
  const runPrep = (key: 'docs' | 'cv', total: number) =>
    new Promise<void>((done) => {
      if (prepRef.current[key].state !== 'idle') return done();
      const steps = Math.max(1, total);
      const every = Math.max(25, Math.min(90, 1800 / steps));
      let n = 0;
      setPrep((p) => ({ ...p, [key]: { state: 'running', n: 0 } }));
      const t = window.setInterval(() => {
        n += 1;
        if (n >= steps) {
          window.clearInterval(t);
          setPrep((p) => ({ ...p, [key]: { state: 'done', n: steps } }));
          window.setTimeout(done, 350);
        } else setPrep((p) => ({ ...p, [key]: { state: 'running', n } }));
      }, every);
    });
  // Which plan is open (one at a time). Starter to begin with.
  const [openAsk, setOpenAsk] = useState<Plan | null>('starter');
  const toggle = (p: Plan) => setOpenAsk((o) => (o === p ? null : p));

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
          Smart <Hl>sponsored job</Hl> search
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
        <Title>
          Your <Hl>CV / Resume</Hl>
        </Title>
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

  // ---- 2/3 · no CV: the job title (students: the study field) ----
  if (allowed === 'job-title') {
    return shell(
      'job-title',
      'cv',
      <>
        <Title>
          {student ? (
            <>
              What do you <Hl>study</Hl>?
            </>
          ) : (
            <>
              What exact <Hl>job title</Hl> are you searching for?
            </>
          )}
        </Title>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length < 2) return setError(student ? 'Write your study field.' : 'Write a job title.');
            remember(TITLE_KEY, title.trim());
            if (student) void makeCv(0);
            else go('experience');
          }}
        >
          <TitleSearch
            label={student ? 'Your study field' : 'Job title or keyword'}
            placeholder={student ? 'Search study fields...' : 'Search job titles...'}
            value={title}
            onChange={setTitle}
            options={student ? STUDY_OPTIONS : ALL_TITLES}
          />
          {tags.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-700">
                <Plus className="h-4 w-4 text-brand-600" aria-hidden /> {student ? 'We’ll also search these trainings' : 'We’ll also search close jobs, for more results'}
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
          <button disabled={busy} className="mt-5 w-full rounded-full bg-brand-700 py-3.5 text-[16px] font-bold text-white hover:bg-brand-800 disabled:opacity-60">
            {busy ? 'Creating your CV…' : 'Continue'}
          </button>
          <p className="mt-4 flex gap-2 text-[13.5px] leading-5 text-ink-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {student ? 'For example “Nursing”, “Mechatronics” or “Hotel management”.' : 'Specific titles get better matches. “Project Manager” works better than “Manager”.'}
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
        <Title>
          How many <Hl>years of experience</Hl> do you have?
        </Title>
        <div className="grid grid-cols-2 gap-3">
          {YEARS.map((y) => (
            <button
              key={y.label}
              disabled={busy}
              onClick={() => void makeCv(y.years)}
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
        <Title>
          {first ? `${first}, which` : 'Which'} <Hl>country</Hl> do you want to work in?
        </Title>
        <button
          onClick={() => {
            update({ country: 'any' });
            go('plan');
          }}
          className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-4 text-left shadow-sm ring-2 ring-brand-300 transition active:scale-[0.98] sm:hover:-translate-y-0.5 sm:hover:ring-brand-500"
        >
          <Globe2 className="h-10 w-10 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-bold text-ink-950">All jobs abroad</span>
            <span className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[13px] font-extrabold text-brand-700">{all.length} jobs for you</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
        </button>
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
        </div>
        <Cheer>Your sponsorship documents are ready for every country.</Cheer>
      </>,
    );
  }

  const docs = Math.min(Math.max(items.length, 1), DOCS_STARTER);
  // Free shows half of the jobs found; Starter and Pro all of them.
  const half = freeVisible(items.length);
  const role = (cv?.profile.titles[0] ?? title.trim()) || null;
  const roleJobs = role ? `${role} jobs` : 'your jobs';
  const missingSkills = new Set(items.flatMap((m) => m.missing ?? []).map((k) => k.toLowerCase())).size;

  const busyPrep = prep.docs.state === 'running' || prep.cv.state === 'running';
  /** What is still missing before they can apply. `act`: each with its "do it automatically" button; otherwise waiting for the email. */
  const needs = (act: boolean) => (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-ink-200 sm:p-5">
      <p className="text-[18px] font-bold leading-snug text-ink-950">{act ? 'To get these jobs, you still need:' : 'Ready to start once you confirm:'}</p>
      <ul className="mt-1 divide-y divide-ink-100">
        {act && (
          <Need icon={Clock} tone="hurry">
            Apply as quickly as possible
          </Need>
        )}
        <Need
          value={`0 / ${items.length}`}
          waiting={!act && prep.docs.state !== 'done'}
          prep={prep.docs}
          total={items.length}
          action={act ? 'Prepare documents automatically' : undefined}
          onAction={busyPrep ? undefined : () => void runPrep('docs', items.length)}
          doneText={
            <>
              <b>{items.length} sponsorship document drafts</b> done for these jobs — they need a few details from you to finish.
            </>
          }
        >
          Sponsorship documents
        </Need>
        {missingSkills > 0 && (
          <Need
            value={missingSkills}
            waiting={!act && prep.cv.state !== 'done'}
            prep={prep.cv}
            total={items.length}
            action={act ? 'Add to CV automatically' : undefined}
            onAction={busyPrep ? undefined : () => void runPrep('cv', items.length)}
            doneText={
              <>
                <b>CV draft done for {items.length} jobs</b> — {missingSkills} skills to confirm. Add only the ones you really have.
              </>
            }
          >
            CV skills these jobs ask for
          </Need>
        )}
        <Need value={`0 / ${items.length}`} waiting={!act} action={act ? 'Send all applications' : undefined} onAction={busyPrep ? undefined : () => void startAuto('apply')}>
          Applications sent
        </Need>
      </ul>
    </section>
  );

  // ---- 3/3 · the best jobs found, and what is still missing (each with its button) ----
  if (allowed === 'plan') {
    const preview = items.slice(0, 3);
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
          <Num className="text-[30px] sm:text-[34px]">{items.length}</Num> {items.length === 1 ? 'job' : 'jobs'} for you <Hl>{pickedName ? `in ${pickedName}` : 'abroad'}</Hl>
        </Title>
        <div className="space-y-2.5">
          {preview.map((m, i) => (
            <JobRow key={m.id} m={m} top={i === 0} delay={120 + i * 140} />
          ))}
        </div>
        {items.length > preview.length && (
          <p className="mt-2.5 text-center text-[14px] font-semibold text-ink-600">
            + <Num className="text-[15px]">{items.length - preview.length}</Num> more
          </p>
        )}
        <div className="mt-6">{needs(true)}</div>
        <button disabled={busyPrep} onClick={() => void startAuto('all')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 py-4 text-[16.5px] font-extrabold text-white shadow-md hover:bg-brand-800 disabled:opacity-70">
          {busyPrep ? <Loader2 className="mv-spin h-5 w-5" aria-hidden /> : <Wand2 className="h-5 w-5" aria-hidden />} {busyPrep ? 'Preparing…' : 'Complete all automatically'}
        </button>
        <Cheer>You’re one step away from your employer abroad.</Cheer>
      </>,
    );
  }

  // ---- 3/3 · confirm the email, with what is waiting for them, and their jobs ----
  if (allowed === 'email') {
    const list = items.slice(0, 5);
    return shell(
      'email',
      'plan',
      <>
        <Title>
          <Hl>Confirm your email</Hl>
        </Title>
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-2 ring-brand-200">
          <QuickSignup cv={cv} sendLabel="Confirm your email" onVerified={() => replace('choose')} />
        </div>
        <div className="mt-5">{needs(false)}</div>
        {list.length > 0 && (
          <>
            <p className="mb-3 mt-7 text-center text-[17px] font-bold text-ink-950">
              Your <Num>{items.length}</Num> {items.length === 1 ? 'job' : 'jobs'} {pickedName ? `in ${pickedName}` : 'abroad'}
            </p>
            <div className="space-y-2.5">
              {list.map((m, i) => (
                <JobRow key={m.id} m={m} top={i === 0} />
              ))}
            </div>
          </>
        )}
      </>,
    );
  }

  // ---- after the email: how to apply — Free · Starter · Pro, then the reviews ----
  const starterNow = amountOf(priceLabel('starter'));
  const proNow = amountOf(priceLabel('pro'));
  const proDocs = Math.min(Math.max(items.length, 1), DOCS_PRO);
  return shell(
    'choose',
    null,
    <>
      <p className="mb-3 flex items-center justify-center gap-1.5 text-[14px] font-bold text-emerald-700">
        <MailCheck className="h-4 w-4" aria-hidden /> Email confirmed
      </p>
      <Title>
        {first ? `${first}, choose` : 'Choose'} <Hl>how to apply</Hl>
      </Title>
      {from && fromName && (
        <p className="mx-auto -mt-2 mb-5 flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[13.5px] font-semibold text-ink-700 ring-1 ring-ink-200">
          <CircleFlag countryCode={from} size={16} label={fromName} /> Prices for people from {fromName}
        </p>
      )}
      <div className="space-y-4">
        <PlanCard
          plan="free"
          icon={Compass}
          name="Free"
          title={
            <>
              Apply to <Num>{half}</Num> {half === 1 ? 'job' : 'jobs'} manually
            </>
          }
          points={[`${half} of your ${items.length} jobs`, '1 sponsorship document a month']}
          cta={`Apply to ${half} ${half === 1 ? 'job' : 'jobs'} for free`}
          open={openAsk === 'free'}
          onToggle={() => toggle('free')}
          onClick={() => choose('free')}
        />
        <PlanCard
          plan="starter"
          icon={ShieldCheck}
          name="Starter"
          title={
            <>
              Apply to <Num>{docs}</Num> jobs with sponsorship documents
            </>
          }
          now={starterNow}
          was={WAS.starter}
          points={[<b key="c">Up to 2× more chances</b>, `${docs} sponsorship document drafts already prepared for ${roleJobs}`, `Your CV already analyzed for ${docs} jobs`, `${DOCS_STARTER} sponsorship documents a month`]}
          cta={`Apply to ${docs} jobs`}
          open={openAsk === 'starter'}
          onToggle={() => toggle('starter')}
          onClick={() => choose('starter')}
        />
        <PlanCard
          plan="pro"
          icon={Rocket}
          name="Pro"
          badge="Most chances"
          title={
            <>
              Auto Apply to{' '}
              <Num tone="amber" className="!text-amber-600">
                {auto.toLocaleString('en-US')}
              </Num>{' '}
              jobs in 30 days
            </>
          }
          now={proNow}
          was={WAS.pro}
          points={[<b key="c">Up to 10× more chances</b>, `${proDocs} sponsorship document drafts already prepared`, `Your CV already analyzed for all ${items.length} jobs`, `Auto Apply to ${auto.toLocaleString('en-US')} jobs in the next 30 days`, `${DOCS_PRO} sponsorship documents a month`]}
          cta={`Apply to ${auto.toLocaleString('en-US')} jobs`}
          open={openAsk === 'pro'}
          onToggle={() => toggle('pro')}
          onClick={() => choose('pro')}
        />
      </div>
      <ExampleJourney rotate wide className="pt-8" />
    </>,
  );
}
