import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CircleFlag } from '@/components/common/CircleFlag';

// Admin → Quiz funnel: how far visitors get in the /cv-match quiz, and what they answer — to see which step loses people.
// Data: cv_quiz_events (migration 20261230090000), written by src/lib/quizTrack.ts. Anonymous visitor ids; no emails, no CV text.

type Ev = { visitor: string; step: string; detail: Record<string, unknown>; from_country: string | null; source: string | null; created_at: string; user_id: string | null };

/** The funnel, in order. A visitor counts for a stage when any of its events happened. */
const STAGES: { key: string; label: string; steps: string[] }[] = [
  { key: 'open', label: 'Opened the quiz', steps: ['*'] },
  { key: 'goal', label: 'Chose job / student', steps: ['goal'] },
  { key: 'cv', label: 'Has a CV (uploaded or made)', steps: ['cv_upload', 'cv_existing', 'cv_made'] },
  { key: 'results', label: 'Saw their job count', steps: ['view:results'] },
  { key: 'country', label: 'Chose a country', steps: ['country'] },
  { key: 'plan', label: 'Saw jobs + what’s missing', steps: ['view:plan'] },
  { key: 'auto', label: 'Clicked an “automatically” button', steps: ['auto', 'prepare'] },
  { key: 'email', label: 'Reached the email screen', steps: ['view:email'] },
  { key: 'sent', label: 'Sent their email', steps: ['email_sent'] },
  { key: 'verified', label: 'Confirmed the code', steps: ['verified'] },
  { key: 'choose', label: 'Saw the plans', steps: ['view:choose'] },
  { key: 'chose', label: 'Chose a plan', steps: ['plan'] },
];

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
];

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

function count<T extends string>(list: T[]): [T, number][] {
  const m = new Map<T, number>();
  for (const x of list) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Top({ title, rows, empty = 'Nothing yet', flag = false }: { title: string; rows: [string, number][]; empty?: string; flag?: boolean }) {
  const max = rows[0]?.[1] ?? 1;
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <p className="text-[13px] font-bold text-ink-900">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-ink-500">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.slice(0, 12).map(([k, n]) => (
            <li key={k} className="relative overflow-hidden rounded-md bg-ink-50 px-2 py-1 text-[12.5px]">
              <span className="absolute inset-y-0 left-0 bg-brand-100" style={{ width: `${(n / max) * 100}%` }} aria-hidden />
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-ink-800">
                  {flag && k.length === 2 && <CircleFlag countryCode={k} size={13} label={k} />}
                  {k}
                </span>
                <b className="tabular-nums text-ink-900">{n}</b>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuizFunnelSection() {
  const [days, setDays] = useState(7);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideMine, setHideMine] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const all: Ev[] = [];
    // 1,000 rows a request; up to 30,000.
    for (let from = 0; from < 30_000; from += 1000) {
      const { data, error: err } = await supabase
        .from('cv_quiz_events')
        .select('visitor, step, detail, from_country, source, created_at, user_id')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .range(from, from + 999);
      if (err) {
        setError(err.message.includes('cv_quiz_events') ? 'Run the migration 20261230090000_cv_quiz_events.sql in Supabase first.' : err.message);
        break;
      }
      all.push(...((data ?? []) as Ev[]));
      if (!data || data.length < 1000) break;
    }
    setEvents(all);
    setLoading(false);
  }, [days]);
  useEffect(() => {
    void load();
  }, [load]);

  const mine = useMemo(() => {
    try {
      return window.localStorage.getItem('mv:vid');
    } catch {
      return null;
    }
  }, []);
  const evs = useMemo(() => (hideMine && mine ? events.filter((e) => e.visitor !== mine) : events), [events, hideMine, mine]);

  const byVisitor = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of evs) {
      const list = m.get(e.visitor) ?? [];
      list.push(e);
      m.set(e.visitor, list);
    }
    return m;
  }, [evs]);

  const funnel = useMemo(() => {
    const total = byVisitor.size;
    return STAGES.map((st) => {
      let n = 0;
      for (const list of byVisitor.values()) if (st.steps[0] === '*' || list.some((e) => st.steps.includes(e.step))) n += 1;
      return { ...st, n, pct: total ? (n / total) * 100 : 0 };
    });
  }, [byVisitor]);

  const last = (list: Ev[], step: string) => [...list].reverse().find((e) => e.step === step)?.detail ?? null;
  const pick = (step: string, keyName: string) => evs.filter((e) => e.step === step).map((e) => str(e.detail?.[keyName]));
  const firstOf = (fn: (e: Ev) => string) => [...byVisitor.values()].map((l) => fn(l[0]));

  const sessions = useMemo(
    () =>
      [...byVisitor.entries()]
        .map(([visitor, list]) => {
          const reached = [...funnel].reverse().find((st) => st.steps[0] === '*' || list.some((e) => st.steps.includes(e.step)));
          return { visitor, list, start: list[0].created_at, end: list[list.length - 1].created_at, reached: reached?.label ?? '', from: list[0].from_country, source: list.find((e) => e.source)?.source ?? null, signedIn: list.some((e) => e.user_id) };
        })
        .sort((a, b) => b.end.localeCompare(a.end)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byVisitor],
  );

  return (
    <section className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-950">Quiz funnel</h2>
          <p className="text-sm text-ink-500">How far visitors get in /cv-match, and what they answer. Anonymous; no emails or CV text.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs font-semibold">
            {RANGES.map((r) => (
              <button key={r.days} onClick={() => setDays(r.days)} className={`rounded-md px-3 py-1.5 ${days === r.days ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-50'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={() => void load()} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 hover:bg-ink-50" aria-label="Refresh">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-600">
        <input type="checkbox" checked={hideMine} onChange={(e) => setHideMine(e.target.checked)} /> Hide my own visits from this browser
      </label>

      {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}

      {/* The funnel */}
      <div className="rounded-xl border border-ink-200 bg-white p-4">
        <p className="text-[13px] font-bold text-ink-900">
          {byVisitor.size} visitors · {evs.length} events
        </p>
        <ol className="mt-3 space-y-1.5">
          {funnel.map((st, i) => {
            const prev = i ? funnel[i - 1].n : st.n;
            const lost = prev ? Math.round(((prev - st.n) / prev) * 100) : 0;
            return (
              <li key={st.key} className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[220px_1fr_auto]">
                <span className="text-[12.5px] font-semibold text-ink-800">
                  {i + 1}. {st.label}
                </span>
                <span className="relative hidden h-6 overflow-hidden rounded-md bg-ink-50 sm:block">
                  <span className="absolute inset-y-0 left-0 rounded-md bg-brand-500" style={{ width: `${st.pct}%` }} />
                </span>
                <span className="flex items-center gap-2 text-right text-[12.5px] tabular-nums">
                  <b className="text-ink-950">{st.n}</b>
                  <span className="w-12 text-ink-500">{st.pct.toFixed(0)}%</span>
                  {i > 0 && <span className={`w-14 rounded px-1.5 py-0.5 text-center text-[11px] font-bold ${lost >= 50 ? 'bg-rose-100 text-rose-700' : lost >= 25 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>−{lost}%</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[12px] text-ink-500">The red / amber “−%” is how many of the people on the step before stopped there — the step to look at first.</p>
      </div>

      {/* What they answer */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Top title="Job / student" rows={count(pick('goal', 'goal'))} />
        <Top title="CV: how they got one" rows={count(evs.filter((e) => ['cv_upload', 'cv_existing', 'no_cv'].includes(e.step)).map((e) => ({ cv_upload: 'Uploaded a CV', cv_existing: 'Had one already', no_cv: 'No CV → made one' })[e.step as 'cv_upload'] ?? e.step))} />
        <Top title="Job titles typed (no CV)" rows={count(pick('job_title', 'title').map((t) => t.toLowerCase()))} />
        <Top title="Study fields typed" rows={count(pick('study_field', 'title').map((t) => t.toLowerCase()))} />
        <Top title="Years of experience" rows={count(pick('cv_made', 'years').map((y) => (y === '' ? '' : `${y} years`)))} />
        <Top title="Close titles removed" rows={count(pick('tag_removed', 'tag'))} />
        <Top title="Country chosen" rows={count(pick('country', 'country'))} flag />
        <Top title="“Automatically” clicked" rows={count([...pick('auto', 'what'), ...pick('prepare', 'what')])} />
        <Top title="Plan chosen" rows={count(pick('plan', 'plan'))} />
        <Top title="Plan opened (looked at)" rows={count(pick('plan_open', 'plan'))} />
        <Top title="Visitors from" rows={count(firstOf((e) => e.from_country ?? ''))} flag />
        <Top title="Came from" rows={count(firstOf((e) => e.source ?? 'direct'))} />
        <Top title="Search errors" rows={count(pick('search_error', 'error'))} empty="None" />
        <Top title="CV making errors" rows={count(pick('cv_made_error', 'error'))} empty="None" />
        <Top title="Jobs found (per visitor)" rows={count(pick('view:results', 'jobs').map((n) => (n === '' ? '' : Number(n) === 0 ? '0 jobs' : Number(n) < 10 ? '1–9 jobs' : Number(n) < 30 ? '10–29 jobs' : '30+ jobs')))} />
      </div>

      {/* Each visitor */}
      <div className="rounded-xl border border-ink-200 bg-white">
        <p className="border-b border-ink-100 px-4 py-3 text-[13px] font-bold text-ink-900">Visitors, latest first</p>
        <ul className="divide-y divide-ink-100">
          {sessions.slice(0, shown).map((v) => {
            const goal = str(last(v.list, 'goal')?.goal);
            const typed = str(last(v.list, 'job_title')?.title) || str(last(v.list, 'study_field')?.title);
            const years = str(last(v.list, 'cv_made')?.years);
            const country = str(last(v.list, 'country')?.country);
            const plan = str(last(v.list, 'plan')?.plan);
            const jobs = str(last(v.list, 'view:results')?.jobs);
            const isOpen = open === v.visitor;
            const t0 = new Date(v.start).getTime();
            return (
              <li key={v.visitor}>
                <button onClick={() => setOpen(isOpen ? null : v.visitor)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-[12.5px] hover:bg-ink-50">
                  <span className="w-28 shrink-0 tabular-nums text-ink-500">{new Date(v.end).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {v.from && <CircleFlag countryCode={v.from} size={14} label={v.from} />}
                  <span className="font-semibold text-ink-900">{v.reached}</span>
                  {goal && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700">{goal}</span>}
                  {typed && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-800">“{typed}”</span>}
                  {years && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700">{years} yrs</span>}
                  {jobs && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700">{jobs} jobs</span>}
                  {country && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700">→ {country}</span>}
                  {plan && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">{plan}</span>}
                  {v.signedIn && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">signed in</span>}
                  {v.source && <span className="truncate text-ink-400">{v.source}</span>}
                  <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-ink-400 transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <ol className="space-y-0.5 bg-ink-50/60 px-4 py-2.5 font-mono text-[11.5px] text-ink-700">
                    {v.list.map((e, i) => {
                      const s = Math.round((new Date(e.created_at).getTime() - t0) / 1000);
                      const d = Object.entries(e.detail ?? {})
                        .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join(', ') : String(val)}`)
                        .join(' · ');
                      return (
                        <li key={i}>
                          <span className="inline-block w-16 text-ink-400">+{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
                          <b className="text-ink-900">{e.step}</b>
                          {d && <span className="text-ink-500"> — {d}</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
        {sessions.length > shown && (
          <button onClick={() => setShown((n) => n + 50)} className="w-full border-t border-ink-100 py-2.5 text-[12.5px] font-semibold text-brand-700 hover:bg-ink-50">
            Show more ({sessions.length - shown} left)
          </button>
        )}
        {!loading && sessions.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-500">No quiz visits in this period yet.</p>}
      </div>
    </section>
  );
}
