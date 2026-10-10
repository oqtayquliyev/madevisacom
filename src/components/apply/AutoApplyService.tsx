import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Clock, Loader2, Mail, Pause, Pencil, Play, ShieldCheck, Sparkles, Square, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCv } from '@/lib/cv/store';
import type { TopResult } from '@/lib/cv/topMatches';
import { rememberAuthIntent } from '@/lib/authIntent';
import { nav } from '@/lib/pageLayout';
import { jobPath } from '@/lib/jobUrl';
import {
  CONSENT_TEXT,
  daysLeft,
  setAutoApplyStatus,
  startAutoApply,
  syncAutoApply,
  useAutoApplyService,
  type AutoApplyAnswers,
  type AutoApplyItem,
  type AutoApplyRequest,
  type AutoApplyState,
} from '@/lib/autoApplyService';
import { MatchRing } from '@/components/cv/MatchBits';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { PlanCheckoutDialog } from '@/components/pro/PlanCheckoutDialog';
import { Sheet } from '@/components/apply/Sheet';
import { BTN, FIELD } from '@/components/apply/ui';

// /cv-match → Auto Apply (Pro, one month).
//   Off      what it does, the three best matches it would start with, and the button.
//   Set up   one sheet: what to apply for → your answers → agree and turn on.
//   On       live: applied / today / in the queue / days left, what is happening now,
//            and every application with its state. Pause, edit answers, stop.
//   Ended    how many went out, and turn it on again.
// Server side: migration 20261215090000 (auto_apply_me / _start / _set / _sync).

type OnAuth = (page: 'login' | 'register') => void;

const when = (iso: string | null) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const dateLong = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

export function AutoApplyService({ result, onAuth }: { result: TopResult | null; onAuth?: OnAuth }) {
  const { state } = useAutoApplyService();
  const [setup, setSetup] = useState(false);
  const [pay, setPay] = useState(false);

  // While it runs, every fresh set of matches tops up the queue.
  const req = state?.request ?? null;
  const synced = useRef<string>('');
  useEffect(() => {
    if (!req || req.status !== 'active' || !result?.items.length) return;
    const key = `${req.id}:${result.at}:${req.min_score}`;
    if (synced.current === key) return;
    synced.current = key;
    void syncAutoApply(result.items.filter((m) => m.score >= req.min_score).map((m) => ({ id: m.id, score: m.score })));
  }, [req, result]);

  // From the "Auto Apply is on" email or a bell notification: bring it into view.
  useEffect(() => {
    if (state && window.location.hash === '#auto-apply') window.setTimeout(() => document.getElementById('auto-apply')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  }, [state]);

  if (state === undefined || state === null) return null; // loading, or the migration isn't run yet
  const running = req && (req.status === 'active' || req.status === 'paused');

  const turnOn = () => {
    if (!state.signed_in) {
      rememberAuthIntent({ reason: 'match', next: '/cv-match#auto-apply' });
      return onAuth?.('register');
    }
    if (!state.pro) return setPay(true);
    setSetup(true);
  };

  return (
    <section id="auto-apply" aria-labelledby="auto-apply-title" className="scroll-mt-24">
      {running ? (
        <Running state={state} req={req} onEdit={() => setSetup(true)} />
      ) : (
        <Offer state={state} result={result} onTurnOn={turnOn} />
      )}
      {setup && <SetupSheet state={state} result={result} onClose={() => setSetup(false)} />}
      {pay && <PlanCheckoutDialog billing="monthly" onClose={() => setPay(false)} onAuth={onAuth} onUnavailable={() => nav('/pricing#pro')} />}
    </section>
  );
}

/* ---------------------------------------------------------------- Off --- */

function Offer({ state, result, onTurnOn }: { state: AutoApplyState; result: TopResult | null; onTurnOn: () => void }) {
  const last = state.request;
  const ended = last && (last.status === 'ended' || last.status === 'stopped');
  const top = (result?.items ?? []).filter((m) => m.score >= 60).slice(0, 3);
  const cta = !state.signed_in ? 'Sign up to turn on Auto Apply' : state.pro ? (ended ? 'Turn on Auto Apply again' : 'Turn on Auto Apply') : 'Get Pro to turn on Auto Apply';

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink-200">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="p-5 sm:p-7">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-bold text-brand-700">
            <Zap className="h-3.5 w-3.5 fill-current" /> Auto Apply <span className="text-brand-400">·</span> Pro
          </span>
          <h2 id="auto-apply-title" className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[26px]">
            {ended ? 'Your month of Auto Apply has ended' : 'Let MadeVisa apply for you'}
          </h2>
          <p className="mt-2 max-w-xl text-[14.5px] leading-6 text-ink-600">
            {ended
              ? `${state.stats?.applied ?? 0} ${state.stats?.applied === 1 ? 'application was' : 'applications were'} sent for you. Turn it on again for another month of applications to your best matches.`
              : 'For one month, MadeVisa applies to the jobs your CV matches best — every day, with your CV and your answers. You get an email the moment each application is sent.'}
          </p>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-3">
            {[
              { icon: Sparkles, t: 'Your best matches', s: 'Only jobs your CV matches well' },
              { icon: Zap, t: 'Up to 10 a day', s: 'Every day for a month' },
              { icon: Mail, t: 'An email each time', s: 'Replies come straight to you' },
            ].map((b) => (
              <li key={b.t} className="flex items-start gap-2.5 rounded-2xl bg-ink-50 p-3">
                <b.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-bold text-ink-950">{b.t}</span>
                  <span className="block text-[12.5px] leading-5 text-ink-500">{b.s}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={onTurnOn} className={BTN.primary}>
              <Zap className="h-4 w-4 fill-current" /> {cta}
            </button>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Pause or stop any time
            </span>
          </div>
        </div>

        <div className="border-t border-ink-100 bg-gradient-to-b from-brand-50/70 to-white p-5 sm:p-7 lg:border-l lg:border-t-0">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-500">{top.length ? 'It would start with' : 'How it works'}</p>
          {top.length ? (
            <ul className="mt-3 space-y-2">
              {top.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-white p-2.5 ring-1 ring-ink-200">
                  <MatchRing score={m.score} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink-950">{m.title}</span>
                    <span className="block truncate text-[12px] text-ink-500">{m.company}</span>
                  </span>
                  <Clock className="h-4 w-4 shrink-0 text-ink-300" />
                </li>
              ))}
            </ul>
          ) : (
            <ol className="mt-3 space-y-2.5 text-[13.5px] leading-5 text-ink-700">
              <li><b>1.</b> Tell us what to apply for and answer a few questions once.</li>
              <li><b>2.</b> Your best matches go in the queue.</li>
              <li><b>3.</b> MadeVisa applies, and emails you for each one.</li>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- On --- */

function Running({ state, req, onEdit }: { state: AutoApplyState; req: AutoApplyRequest; onEdit: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const s = state.stats ?? { applied: 0, queued: 0, applying: 0, applied_today: 0, last_applied_at: null };
  const left = daysLeft(req.ends_at);
  const total = Math.max(1, Math.round((Date.parse(req.ends_at) - Date.parse(req.started_at)) / 86_400_000));
  const share = Math.min(100, Math.max(3, Math.round((100 * (total - left)) / total)));
  const paused = req.status === 'paused';
  const now = state.items.find((i) => i.status === 'applying');
  const items = state.items;
  const shown = all ? items : items.slice(0, 6);

  const act = async (status: 'active' | 'paused' | 'stopped') => {
    setBusy(status);
    setErr(null);
    const e = await setAutoApplyStatus(status);
    setBusy(null);
    setConfirmStop(false);
    if (e) setErr(e);
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink-200">
      {/* Header band */}
      <div className="bg-brand-700 px-5 py-5 text-white sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
              {paused ? (
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              ) : (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
              )}
              Auto Apply · {paused ? 'Paused' : 'On'}
            </p>
            <h2 id="auto-apply-title" className="mt-1.5 text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">
              {paused ? 'Auto Apply is paused' : 'MadeVisa is applying for you'}
            </h2>
            <p className="mt-1 text-[13.5px] text-white/80">
              Until {dateLong(req.ends_at)} · up to {req.per_day} a day · matches from {req.min_score}%
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {paused ? (
              <button onClick={() => void act('active')} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60">
                {busy === 'active' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Resume
              </button>
            ) : (
              <button onClick={() => void act('paused')} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-[13px] font-bold text-white ring-1 ring-white/30 hover:bg-white/25 disabled:opacity-60">
                {busy === 'paused' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Pause
              </button>
            )}
            <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-[13px] font-bold text-white ring-1 ring-white/30 hover:bg-white/25">
              <Pencil className="h-4 w-4" /> Edit answers
            </button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: 'Applied', v: s.applied },
            { k: 'Today', v: s.applied_today },
            { k: 'In the queue', v: s.queued + s.applying },
            { k: 'Days left', v: left },
          ].map((x) => (
            <div key={x.k} className="rounded-2xl bg-white/10 px-3.5 py-3 ring-1 ring-white/15">
              <dt className="text-[12px] font-medium text-white/70">{x.k}</dt>
              <dd className="mt-0.5 text-[24px] font-bold tabular-nums leading-none">{x.v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <div className="h-full rounded-full bg-white" style={{ width: `${share}%` }} />
        </div>
      </div>

      {/* What is happening now */}
      <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-3.5 sm:px-7">
        {paused ? (
          <Pause className="h-4 w-4 shrink-0 text-amber-600" />
        ) : now ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" />
        ) : (
          <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
        )}
        <p className="min-w-0 text-[13.5px] text-ink-700">
          {paused ? (
            'Nothing is sent while it’s paused. Your queue is kept.'
          ) : now ? (
            <>
              Applying to <b className="text-ink-950">{now.title}</b> at {now.company}…
            </>
          ) : s.queued > 0 ? (
            <>
              <b className="text-ink-950">{s.queued}</b> {s.queued === 1 ? 'match is' : 'matches are'} in the queue — applications go out through the day.
            </>
          ) : (
            'Looking for new jobs that match your CV. New matches join the queue as they’re posted.'
          )}
          {s.last_applied_at && !now && !paused && <span className="text-ink-500"> Last application {when(s.last_applied_at)}.</span>}
        </p>
      </div>

      {/* Every application */}
      <div className="px-5 py-4 sm:px-7">
        {items.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-ink-500">Your queue fills from your matches above. The first applications go out shortly.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {shown.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </ul>
        )}
        {items.length > 6 && (
          <button onClick={() => setAll((v) => !v)} className="mt-2 text-[13px] font-semibold text-brand-700 hover:underline">
            {all ? 'Show less' : `Show all ${items.length}`}
          </button>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 text-[12.5px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <Mail className="h-4 w-4" /> Employers reply to {req.contact_email ?? state.email ?? 'your email'}. You get an email for each application.
          </span>
          {confirmStop ? (
            <span className="inline-flex items-center gap-2">
              Stop for good?
              <button onClick={() => void act('stopped')} disabled={Boolean(busy)} className="font-bold text-rose-700 hover:underline">
                {busy === 'stopped' ? 'Stopping…' : 'Yes, stop'}
              </button>
              <button onClick={() => setConfirmStop(false)} className="font-semibold text-ink-600 hover:underline">
                Keep it on
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmStop(true)} className="inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-rose-700">
              <Square className="h-3.5 w-3.5" /> Stop Auto Apply
            </button>
          )}
        </div>
        {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{err}</p>}
      </div>
    </div>
  );
}

function Row({ item }: { item: AutoApplyItem }) {
  const href = item.job_id ? jobPath({ id: `sponsored-${item.job_id}`, title: item.title, company: item.company }) : undefined;
  return (
    <li className="flex items-center gap-3 py-3">
      {item.logo ? (
        <img src={item.logo} alt="" className="h-10 w-10 shrink-0 rounded-full bg-white object-contain ring-1 ring-ink-200" loading="lazy" />
      ) : (
        <CompanyLogo name={item.company} size={40} />
      )}
      <span className="min-w-0 flex-1">
        {href ? (
          <a href={href} className="block truncate text-[14px] font-semibold text-ink-950 hover:text-brand-700">
            {item.title}
          </a>
        ) : (
          <span className="block truncate text-[14px] font-semibold text-ink-950">{item.title}</span>
        )}
        <span className="block truncate text-[12.5px] text-ink-500">
          {item.company}
          {item.location ? ` · ${item.location}` : ''}
          {item.score != null ? ` · ${item.score}% match` : ''}
        </span>
      </span>
      {item.status === 'applied' ? (
        <span className="flex shrink-0 flex-col items-end">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">
            <Check className="h-3.5 w-3.5" /> Applied
          </span>
          <span className="mt-0.5 text-[11.5px] text-ink-400">{when(item.applied_at)}</span>
        </span>
      ) : item.status === 'applying' ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-bold text-brand-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-[12px] font-semibold text-ink-600">
          <Clock className="h-3.5 w-3.5" /> In queue
        </span>
      )}
    </li>
  );
}

/* ------------------------------------------------------------- Set up --- */

const PER_DAY = [3, 5, 10];
const MIN_SCORE = [60, 70, 80];

function Chips({ values, onChange, placeholder, max }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; max: number }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase()) && values.length < max) onChange([...values, v]);
    setText('');
  };
  return (
    <div className={`${FIELD} flex flex-wrap items-center gap-1.5 py-2`}>
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1.5 text-[13px] font-semibold text-brand-800">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="grid h-4 w-4 place-items-center rounded-full text-brand-600 hover:bg-brand-100">
            ×
          </button>
        </span>
      ))}
      {values.length < max && (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={add}
          placeholder={values.length ? 'Add another' : placeholder}
          className="min-w-[120px] flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-400"
        />
      )}
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; t: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-ink-100 p-1">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-lg px-2 py-2 text-[13px] font-semibold transition ${value === o.v ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-500">{hint}</span>}
    </label>
  );
}

function SetupSheet({ state, result, onClose }: { state: AutoApplyState; result: TopResult | null; onClose: () => void }) {
  const { profile, user } = useAuth();
  const { cv } = useCv();
  const prev = state.request;
  const editing = Boolean(prev && (prev.status === 'active' || prev.status === 'paused'));

  const defaults = useMemo(() => {
    const roles = prev?.roles?.length ? prev.roles : [...new Set([...(cv?.profile.titles ?? []).slice(0, 3), ...(profile?.specialization ? [profile.specialization] : [])])].slice(0, 4);
    const countries = prev?.countries?.length ? prev.countries : [...new Set((result?.items ?? []).map((m) => m.country).filter((c): c is string => Boolean(c)))].slice(0, 4);
    return { roles, countries };
  }, [prev, cv, profile, result]);

  const [step, setStep] = useState(0);
  const [roles, setRoles] = useState<string[]>(defaults.roles);
  const [countries, setCountries] = useState<string[]>(defaults.countries);
  const [perDay, setPerDay] = useState<number>(prev?.per_day && PER_DAY.includes(prev.per_day) ? prev.per_day : 5);
  const [minScore, setMinScore] = useState<number>(prev?.min_score && MIN_SCORE.includes(prev.min_score) ? prev.min_score : 70);
  const [email, setEmail] = useState(prev?.contact_email ?? user?.email ?? '');
  const [a, setA] = useState<AutoApplyAnswers>(() => ({
    phone: profile?.phone ?? '',
    linkedin: profile?.linkedin_url ?? '',
    sponsorship: '',
    workRights: '',
    relocate: 'yes',
    remote: 'any',
    notice: '',
    salary: '',
    startDate: '',
    languages: (profile?.languages ?? []).join(', '),
    note: '',
    ...(prev?.answers ?? {}),
  }));
  const [agree, setAgree] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof AutoApplyAnswers>(k: K, v: AutoApplyAnswers[K]) => setA((x) => ({ ...x, [k]: v }));

  const emailOk = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim());
  const step0ok = roles.length > 0;
  const step1ok = emailOk && Boolean(a.phone?.trim()) && Boolean(a.sponsorship);
  const STEPS = ['What to apply for', 'Your answers', 'Agree and turn on'];

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const clean = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'string' ? v.trim().slice(0, 600) : v])) as AutoApplyAnswers;
    const e = await startAutoApply({ roles, countries, per_day: perDay, min_score: minScore, contact_email: email.trim(), answers: clean, consent_text: CONSENT_TEXT });
    setBusy(false);
    if (e) return setErr(e);
    onClose();
    window.setTimeout(() => document.getElementById('auto-apply')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const footer = (
    <div className="flex items-center justify-between gap-3">
      {step > 0 ? (
        <button onClick={() => setStep((s) => s - 1)} className={BTN.secondary}>
          Back
        </button>
      ) : (
        <span className="text-[12.5px] text-ink-500">Step 1 of 3</span>
      )}
      {step < 2 ? (
        <button onClick={() => setStep((s) => s + 1)} disabled={step === 0 ? !step0ok : !step1ok} className={BTN.primary}>
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <button onClick={() => void submit()} disabled={!agree || busy} className={BTN.primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 fill-current" />}
          {editing ? 'Save' : 'Turn on Auto Apply'}
        </button>
      )}
    </div>
  );

  return (
    <Sheet
      id="auto-apply-setup"
      wide
      title={editing ? 'Your Auto Apply' : 'Turn on Auto Apply'}
      sub={editing ? 'Change what MadeVisa applies for and the answers it uses.' : 'One month of applications to your best matches. Takes two minutes, once.'}
      onClose={onClose}
      footer={footer}
    >
      <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Steps">
        {STEPS.map((t, i) => (
          <li key={t} className="min-w-0">
            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-ink-100'}`} />
            <p className={`mt-1.5 truncate text-[12px] font-semibold ${i === step ? 'text-ink-950' : 'text-ink-400'}`}>{t}</p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-5">
          <Field label="Job titles to apply for" hint="From your CV. Press Enter after each one.">
            <Chips values={roles} onChange={setRoles} placeholder="e.g. Data Analyst" max={8} />
          </Field>
          <Field label="Countries" hint="Leave empty for any country.">
            <Chips values={countries} onChange={setCountries} placeholder="e.g. Germany" max={12} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-800">Only jobs you match at least</p>
              <Seg label="Minimum match" value={minScore} onChange={setMinScore} options={MIN_SCORE.map((v) => ({ v, t: `${v}%` }))} />
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-800">Applications a day, at most</p>
              <Seg label="Applications a day" value={perDay} onChange={setPerDay} options={PER_DAY.map((v) => ({ v, t: String(v) }))} />
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="rounded-xl bg-ink-50 px-3.5 py-3 text-[13px] leading-5 text-ink-600">Application forms ask these. Answer once — MadeVisa uses them on every application, together with your CV.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email employers reply to">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} autoComplete="email" />
            </Field>
            <Field label="Phone">
              <input type="tel" value={a.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+49 151 2345 6789" className={FIELD} autoComplete="tel" />
            </Field>
          </div>
          <Field label="LinkedIn (optional)">
            <input value={a.linkedin ?? ''} onChange={(e) => set('linkedin', e.target.value)} placeholder="https://linkedin.com/in/…" className={FIELD} />
          </Field>
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink-800">Will you need visa sponsorship to work there?</p>
            <Seg label="Visa sponsorship" value={a.sponsorship ?? ''} onChange={(v) => set('sponsorship', v)} options={[{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }]} />
          </div>
          <Field label="Where are you allowed to work today? (optional)">
            <input value={a.workRights ?? ''} onChange={(e) => set('workRights', e.target.value)} placeholder="e.g. EU citizen, UK Graduate visa until 2027" className={FIELD} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-800">Willing to relocate?</p>
              <Seg label="Relocate" value={a.relocate ?? ''} onChange={(v) => set('relocate', v)} options={[{ v: 'yes', t: 'Yes' }, { v: 'depends', t: 'Depends' }, { v: 'no', t: 'No' }]} />
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-800">Work setup</p>
              <Seg label="Work setup" value={a.remote ?? ''} onChange={(v) => set('remote', v)} options={[{ v: 'any', t: 'Any' }, { v: 'onsite', t: 'Office' }, { v: 'hybrid', t: 'Hybrid' }, { v: 'remote', t: 'Remote' }]} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Notice period">
              <input value={a.notice ?? ''} onChange={(e) => set('notice', e.target.value)} placeholder="e.g. 1 month" className={FIELD} />
            </Field>
            <Field label="Salary expectation">
              <input value={a.salary ?? ''} onChange={(e) => set('salary', e.target.value)} placeholder="e.g. €55,000 a year" className={FIELD} />
            </Field>
            <Field label="Earliest start">
              <input value={a.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} placeholder="e.g. January 2027" className={FIELD} />
            </Field>
          </div>
          <Field label="Languages and level (optional)">
            <input value={a.languages ?? ''} onChange={(e) => set('languages', e.target.value)} placeholder="e.g. English C1, German B1" className={FIELD} />
          </Field>
          <Field label="Anything employers should know? (optional)" hint="Used in cover letters where a form asks for one.">
            <textarea value={a.note ?? ''} onChange={(e) => set('note', e.target.value.slice(0, 600))} rows={3} className={FIELD} placeholder="e.g. Available for interviews any weekday; open to contract roles." />
          </Field>
          {!step1ok && <p className="text-[12.5px] text-ink-500">Email, phone and the sponsorship answer are needed to continue.</p>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <dl className="divide-y divide-ink-100 rounded-2xl ring-1 ring-ink-200">
            {[
              ['Applies for', roles.join(', ') || '—'],
              ['Countries', countries.join(', ') || 'Any'],
              ['Matches', `${minScore}% and above · up to ${perDay} a day`],
              ['Runs', editing && prev ? `Until ${dateLong(prev.ends_at)}` : 'One month from today'],
              ['Replies go to', email.trim()],
              ['Visa sponsorship', a.sponsorship === 'yes' ? 'Needed' : 'Not needed'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 px-4 py-2.5 text-[13.5px]">
                <dt className="w-32 shrink-0 text-ink-500">{k}</dt>
                <dd className="min-w-0 break-words font-medium text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-brand-50/60 p-4 ring-1 ring-brand-100">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#2563EB]" />
            <span className="text-[13.5px] leading-5 text-ink-800">{CONSENT_TEXT}</span>
          </label>
          <p className="flex items-start gap-2 text-[12.5px] leading-5 text-ink-500">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Your CV and answers are used only for these applications. You get an email for every application, and you can pause or stop at any time.
          </p>
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{err}</p>}
        </div>
      )}
    </Sheet>
  );
}
