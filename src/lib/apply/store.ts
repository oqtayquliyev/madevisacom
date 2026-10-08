// Auto Apply in the page: what the database knows (allowance, the batch in
// progress, every application), the person's preferences and saved answers,
// and a batch from "Apply to 16 jobs" to "Your applications are out".
//
//   startBatch     queue the jobs, read all their forms, work out the few
//                  answers MadeVisa still needs              → phase 'ready-to-confirm'
//   confirmBatch   save those answers once, prepare every application (CV,
//                  letter, answers) → ready; the application worker submits
//                  them on the employers' sites, in the background
//   (watch)        the page follows the batch from the database until it is done
//
// One store for the whole page, like the CV and the matches. The rules live
// in the database (migrations 20261204090000 and 20261205090000); this file
// asks, shows and prepares — it never decides that an application was submitted.

import { useEffect, useSyncExternalStore } from 'react';
import { track } from '@vercel/analytics';
import { supabase } from '@/lib/supabase';
import { useAuth, type Profile } from '@/lib/auth';
import type { StoredCv } from '@/lib/cv/store';
import type { Planned } from '@/lib/apply/decision';
import { answersFor, conceptAnswers, planBatch, rememberBatch, type BatchContext, type BatchJob, type BatchPlan, type FormInfo } from '@/lib/apply/batch';
import { classifyQuestion, questionId } from '@/lib/apply/concepts';
import { prepareDocs } from '@/lib/apply/prepare';
import { mergeProfile, suggestProfile } from '@/lib/apply/profile';
import { prepareBatch, type Answer, type MoveDetail, type MoveResult } from '@/lib/apply/runner';
import { DEFAULT_PREFS, EMPTY_PROFILE, type AppStatus, type Application, type ApplyPrefs, type ApplyProfile, type Needed, type PauseReason, type QueueState, type ServerFacts } from '@/lib/apply/types';

export type QueueInfo = {
  id: string;
  state: QueueState;
  reason: PauseReason;
  cvAt: string | null;
  createdAt: string;
  plan?: StoredPlan | null;
  email?: string | null;
  confirmedAt?: string | null;
  finishedAt?: string | null;
};
/** What is kept with the batch: the plan the person saw, and their answers (so a refresh loses nothing). */
export type StoredPlan = Pick<BatchPlan, 'ask' | 'extra' | 'coverage' | 'reused' | 'ready'> & { jobs: Pick<BatchPlan['jobs'][number], 'id' | 'outcome' | 'reasonCode'>[]; given?: Record<string, string> };

export type ApplyStatus = {
  signedIn: boolean;
  enabled: boolean;
  pro: boolean;
  /** Applications a month that come with the person's plan, and how many are left. */
  monthly: number;
  used: number;
  left: number;
  freeMonthly: number;
  proMonthly: number;
  /** The most a day: the person's own choice, and the site's ceiling. */
  daily: number;
  dailyMax: number;
  today: number;
  resetsAt: string | null;
  chargeSelfSent?: boolean;
  /** The application worker: online = checked in within 3 minutes (only then can the person leave the page). */
  worker?: { online: boolean; autoSubmit?: boolean };
  queue: QueueInfo | null;
};

/** Where the batch is, as the page shows it. */
export type Phase =
  | { kind: 'idle' }
  | { kind: 'analyzing'; total: number; read: number }
  | { kind: 'confirm'; plan: BatchPlan; jobs: BatchJob[] }
  | { kind: 'preparing'; done: number; total: number };

type State = {
  /** null = not asked yet · false = the database part isn't installed (the page shows nothing new). */
  available: boolean | null;
  status: ApplyStatus | null;
  prefs: ApplyPrefs;
  /** The person has saved preferences before. */
  prefsSaved: boolean;
  profile: ApplyProfile;
  /** The account's email: what applications use unless the person saved another. */
  accountEmail: string | null;
  server: Map<string, ServerFacts>;
  serverFor: string | null;
  queue: QueueInfo | null;
  apps: App[];
  phase: Phase;
  error: string | null;
  loadedFor: string | null;
};

let state: State = {
  available: null,
  status: null,
  prefs: DEFAULT_PREFS,
  prefsSaved: false,
  profile: EMPTY_PROFILE,
  accountEmail: null,
  server: new Map(),
  serverFor: null,
  queue: null,
  apps: [],
  phase: { kind: 'idle' },
  error: null,
  loadedFor: null,
};
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

const missing = (message: string) => /function|schema cache|does not exist|not find|relation/i.test(message);

// --- Events ----------------------------------------------------------------------

type PageEvent = 'cv_uploaded' | 'matches_loaded' | 'auto_apply_opened' | 'auto_apply_preferences_saved' | 'auto_apply_review_opened' | 'auto_apply_analyzed' | 'auto_apply_answers_saved';
const DB_EVENTS = new Set<string>(['cv_uploaded', 'matches_loaded', 'auto_apply_opened', 'auto_apply_preferences_saved', 'auto_apply_review_opened', 'auto_apply_analyzed', 'auto_apply_answers_saved']);
/** A product event from the page. Everything about an application itself is logged by the database where it happens. */
export function logEvent(name: PageEvent | 'auto_apply_started' | 'auto_apply_paused' | 'auto_apply_completed', props?: Record<string, string | number | boolean | null>): void {
  try {
    track(name, props);
  } catch {
    /* analytics blocked: fine */
  }
  if (state.available && state.status?.signedIn && DB_EVENTS.has(name)) {
    void supabase.rpc('apply_event', { p_name: name, p_props: props ?? null, p_queue: state.queue?.id ?? null });
  }
}

// --- Loading -----------------------------------------------------------------------

const cleanPrefs = (raw: unknown): ApplyPrefs => {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<ApplyPrefs>;
  const list = <T extends string>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as T[]) : []);
  return {
    minScore: Math.min(95, Math.max(55, Number(p.minScore) || DEFAULT_PREFS.minScore)),
    roles: list(p.roles),
    countries: list<string>(p.countries).map((c) => c.toUpperCase()),
    arrangements: list(p.arrangements),
    salaryMin: typeof p.salaryMin === 'number' && p.salaryMin > 0 ? p.salaryMin : null,
    salaryCurrency: typeof p.salaryCurrency === 'string' && p.salaryCurrency ? p.salaryCurrency : DEFAULT_PREFS.salaryCurrency,
    sponsorship: p.sponsorship === 'need' || p.sponsorship === 'no_need' ? p.sponsorship : 'auto',
    relocate: p.relocate !== false,
    maxPerDay: Math.min(40, Math.max(1, Number(p.maxPerDay) || DEFAULT_PREFS.maxPerDay)),
    alwaysAsk: Array.isArray(p.alwaysAsk) ? list(p.alwaysAsk) : DEFAULT_PREFS.alwaysAsk,
  };
};

async function readStatus(): Promise<ApplyStatus | null> {
  const { data, error } = await supabase.rpc('apply_status');
  if (error) {
    if (missing(error.message)) set({ available: false });
    return null;
  }
  const s = data as ApplyStatus;
  set({ available: true, status: s, queue: s.queue ?? null });
  return s;
}

const COLS = 'id, job_id, queue_id, title, company, cc, country, score, status, priority, rank, channel, sponsorship, url, reason, reason_code, needs, verified, confirmation, cv_name, cover_letter, submitted_at, updated_at, created_at, platform, email_used, progress, evidence';
async function readApps(): Promise<void> {
  const { data, error } = await supabase.from('job_applications').select(COLS).order('created_at', { ascending: false }).limit(300);
  if (error) return;
  set({ apps: ((data ?? []) as Row[]).map(fromRow) });
}

type Row = {
  id: string; job_id: string; queue_id: string | null; title: string; company: string; cc: string | null; country: string | null; score: number; status: AppStatus;
  priority: Application['priority']; rank: number; channel: Application['channel']; sponsorship: Application['sponsorship']; url: string | null; reason: string | null; reason_code: string | null;
  needs: Needed[] | null; verified: boolean; confirmation: Application['confirmation']; cv_name: string | null; cover_letter: boolean; submitted_at: string | null; updated_at: string; created_at: string;
  platform: string | null; email_used: string | null; progress: string | null; evidence: Application['evidence'];
};
export type App = Application & { queueId: string | null; createdAt: string };
const fromRow = (r: Row): App => ({
  id: r.id, jobId: r.job_id, queueId: r.queue_id, title: r.title, company: r.company, cc: r.cc, country: r.country, score: r.score, status: r.status, priority: r.priority, rank: r.rank,
  channel: r.channel, sponsorship: r.sponsorship, url: r.url, reason: r.reason, reasonCode: r.reason_code, needs: r.needs ?? [], verified: r.verified, confirmation: r.confirmation,
  cvName: r.cv_name, coverLetter: r.cover_letter, submittedAt: r.submitted_at, updatedAt: r.updated_at, createdAt: r.created_at,
  platform: r.platform, emailUsed: r.email_used, progress: r.progress, evidence: r.evidence,
});

async function load(userId: string, account: Profile | null, email: string | null, cvText: string | null): Promise<void> {
  if (state.loadedFor === userId) return;
  set({ loadedFor: userId, accountEmail: account?.email ?? email });
  const s = await readStatus();
  if (!s) return;
  const [prefs, profile] = await Promise.all([
    supabase.from('application_preferences').select('prefs').eq('user_id', userId).maybeSingle(),
    supabase.from('application_profiles').select('answers, custom, by_country').eq('user_id', userId).maybeSingle(),
  ]);
  const row = profile.data as { answers?: ApplyProfile['answers']; custom?: ApplyProfile['custom']; by_country?: ApplyProfile['byCountry'] } | null;
  const saved: ApplyProfile = row ? { answers: row.answers ?? {}, custom: row.custom ?? {}, byCountry: row.by_country ?? {} } : EMPTY_PROFILE;
  const merged = mergeProfile(saved, suggestProfile({ fullName: account?.full_name, email: account?.email ?? email, phone: account?.phone, linkedin: account?.linkedin_url }, cvText));
  set({
    prefs: cleanPrefs((prefs.data as { prefs?: unknown } | null)?.prefs),
    prefsSaved: Boolean(prefs.data),
    profile: { ...merged, byCountry: saved.byCountry ?? {} },
  });
  await readApps();
  if (s.queue && (s.queue.state === 'running' || s.queue.state === 'paused')) watch();
}

function reset(): void {
  if (!state.loadedFor && !state.apps.length) return;
  control = 'stop';
  unwatch();
  set({ loadedFor: null, status: state.status ? { ...state.status, signedIn: false } : null, apps: [], queue: null, server: new Map(), serverFor: null, profile: EMPTY_PROFILE, prefs: DEFAULT_PREFS, prefsSaved: false, phase: { kind: 'idle' } });
}

/** For a list of matched jobs: how each can be sent, and which must be left out. One request per result. */
export async function loadServerFacts(key: string, jobIds: string[]): Promise<void> {
  if (!state.available || !state.status?.signedIn || state.serverFor === key || !jobIds.length) return;
  set({ serverFor: key });
  const { data, error } = await supabase.rpc('apply_preview', { p_jobs: jobIds.slice(0, 80) });
  if (error) return set({ serverFor: null });
  const m = new Map<string, ServerFacts>();
  for (const x of (data ?? []) as (ServerFacts & { id: string })[]) m.set(x.id, { channel: x.channel, applied: x.applied, twin: x.twin, closed: x.closed, url: x.url, knownSponsor: x.knownSponsor });
  set({ server: m });
}

// --- Preferences and saved answers ---------------------------------------------------

export async function savePrefs(prefs: ApplyPrefs): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { ok: false, error: 'Sign in first.' };
  const clean = cleanPrefs(prefs);
  const { error } = await supabase.from('application_preferences').upsert({ user_id: userId, prefs: clean }, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  set({ prefs: clean, prefsSaved: true });
  logEvent('auto_apply_preferences_saved', { minScore: clean.minScore, maxPerDay: clean.maxPerDay });
  void readStatus();
  return { ok: true };
}

export async function saveProfile(profile: ApplyProfile): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { ok: false, error: 'Sign in first.' };
  // Empty answers aren't kept.
  const answers = Object.fromEntries(Object.entries(profile.answers).filter(([, a]) => a && (a.value.trim() || a.askEachTime)));
  const next: ApplyProfile = { answers, custom: profile.custom, byCountry: profile.byCountry ?? {} };
  const { error } = await supabase.from('application_profiles').upsert({ user_id: userId, answers: next.answers, custom: next.custom, by_country: next.byCountry }, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  set({ profile: next });
  return { ok: true };
}

/** The email the applications go out with: the one saved in the application profile, else the account's. */
export const applyEmail = (s: Pick<State, 'profile' | 'accountEmail'> = state): string | null => s.profile.answers.email?.value?.trim() || s.accountEmail || null;

// --- Moving applications --------------------------------------------------------------

const put = (app: App) => set({ apps: state.apps.some((a) => a.id === app.id) ? state.apps.map((a) => (a.id === app.id ? { ...a, ...app } : a)) : [app, ...state.apps] });
type RpcMove = { ok: boolean; code?: string; message?: string; app?: Omit<App, 'needs'> & { needs: Needed[] | null } };

async function move(id: string, to: AppStatus, detail?: MoveDetail): Promise<MoveResult> {
  const { data, error } = await supabase.rpc('apply_move', { p_id: id, p_to: to, p_detail: detail ?? null });
  if (error) return { ok: false, code: 'error', message: error.message };
  const r = data as RpcMove;
  const app = r.app ? ({ ...r.app, needs: r.app.needs ?? [] } as App) : undefined;
  if (app) put(app);
  if (r.ok && app) return { ok: true, app };
  return { ok: false, code: (r.code as Exclude<MoveResult, { ok: true }>['code']) ?? 'error', message: r.message ?? 'That didn’t work.', app };
}

async function setQueue(s: Exclude<QueueState, 'analyzing' | 'done'>, opts: { reason?: PauseReason; plan?: StoredPlan; email?: string } = {}): Promise<{ ok: boolean; error?: string }> {
  if (!state.queue) return { ok: false, error: 'No batch.' };
  const { data, error } = await supabase.rpc('apply_queue_set', { p_queue: state.queue.id, p_state: s, p_reason: opts.reason ?? null, p_plan: opts.plan ?? null, p_email: opts.email ?? null });
  if (error) return { ok: false, error: error.message };
  set({ queue: data as QueueInfo });
  return { ok: true };
}

// --- Reading the forms ---------------------------------------------------------------------

type FormRow = { application_id: string; platform: string | null; status: FormInfo['status']; questions: FormInfo['questions'] };

/** Read every application's form through the apply function; anything it couldn't read is read live by the worker. */
async function readForms(apps: App[]): Promise<Map<string, FormInfo>> {
  const out = new Map<string, FormInfo>();
  const ids = apps.map((a) => a.id);
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const { data, error } = await supabase.functions.invoke('apply', { body: { action: 'analyze', application_ids: chunk } });
    const forms = (data as { forms?: Record<string, FormInfo> } | null)?.forms;
    if (!error && forms) for (const [id, f] of Object.entries(forms)) out.set(id, f);
    set({ phase: { kind: 'analyzing', total: ids.length, read: Math.min(ids.length, i + chunk.length) } });
  }
  // The function not deployed yet, or offline: every form is read when the worker opens it.
  for (const a of apps) if (!out.has(a.id)) out.set(a.id, { platform: a.channel === 'madevisa' ? 'email' : null, status: a.url || a.channel === 'madevisa' ? 'live' : 'none', questions: null });
  return out;
}

/** What was read of each form, from the database (after a refresh). */
async function storedForms(apps: App[]): Promise<Map<string, FormInfo>> {
  const { data } = await supabase.from('application_forms').select('application_id, platform, status, questions').in('application_id', apps.map((a) => a.id));
  const out = new Map<string, FormInfo>();
  for (const r of (data ?? []) as FormRow[]) out.set(r.application_id, { platform: r.platform as FormInfo['platform'], status: r.status, questions: r.questions });
  return out;
}

const batchJob = (a: App, form: FormInfo): BatchJob => ({ id: a.id, title: a.title, company: a.company, cc: a.cc, country: a.country, sponsorship: a.sponsorship, letter: a.coverLetter, form });

let runCv: StoredCv | null = null;
const ctxFor = (cv: StoredCv, given: Record<string, string>): BatchContext => ({ profile: state.profile, prefs: state.prefs, prefsSaved: state.prefsSaved, cv: cv.profile, cvText: cv.text, given });

const storedPlan = (plan: BatchPlan, given?: Record<string, string>): StoredPlan => ({
  ask: plan.ask, extra: plan.extra, coverage: plan.coverage, reused: plan.reused.slice(0, 30), ready: plan.ready,
  jobs: plan.jobs.map((j) => ({ id: j.id, outcome: j.outcome, reasonCode: j.reasonCode })),
  ...(given ? { given } : {}),
});

const batchApps = () => (state.queue ? state.apps.filter((a) => a.queueId === state.queue!.id) : []);

/** Read the forms of a batch being set up, and work out what MadeVisa still needs. */
async function analyze(cv: StoredCv, fresh: boolean): Promise<{ ok: boolean; error?: string }> {
  const apps = batchApps().filter((a) => a.status === 'queued' || a.status === 'analyzing');
  set({ phase: { kind: 'analyzing', total: apps.length, read: 0 } });
  const forms = fresh ? await readForms(apps) : await storedForms(apps).then(async (m) => (m.size >= apps.length ? m : readForms(apps)));
  const jobs = apps.map((a) => batchJob(a, forms.get(a.id)!));
  const plan = planBatch(jobs, ctxFor(cv, {}));
  logEvent('auto_apply_analyzed', { jobs: jobs.length, asked: plan.ask.length, extra: plan.extra.length, coverage: plan.coverage.pct, blocked: plan.jobs.filter((j) => j.outcome === 'blocked').length });
  const saved = await setQueue('awaiting_answers', { plan: storedPlan(plan) });
  if (!saved.ok) {
    set({ phase: { kind: 'idle' }, error: saved.error ?? null });
    return saved;
  }
  set({ phase: { kind: 'confirm', plan, jobs } });
  return { ok: true };
}

// --- The batch -----------------------------------------------------------------------------

let control: 'run' | 'pause' | 'stop' = 'run';
let preparing = false;

/** "Apply to N jobs": queue them, read every form, and work out the few answers still needed. */
export async function startBatch(planned: Planned[], cv: StoredCv): Promise<{ ok: boolean; error?: string }> {
  if (!planned.length) return { ok: false, error: 'Nothing to apply to.' };
  set({ error: null, phase: { kind: 'analyzing', total: planned.length, read: 0 } });
  const items = planned.map((p) => ({ jobId: p.job.id, score: p.job.score, quality: p.a.quality, decision: p.a.decision, priority: p.a.priority, rank: Math.round(p.a.rank), sponsorship: p.a.sponsorship.state }));
  const { data, error } = await supabase.rpc('apply_enqueue', { p_items: items, p_cv_at: cv.at });
  if (error) {
    set({ phase: { kind: 'idle' } });
    return { ok: false, error: error.message };
  }
  const r = data as { queue: QueueInfo; applications: (Omit<App, 'needs'> & { needs: Needed[] | null })[] };
  const fresh = r.applications.map((a) => ({ ...a, needs: a.needs ?? [] }) as App);
  const ids = new Set(fresh.map((a) => a.id));
  set({ queue: r.queue, apps: [...fresh, ...state.apps.filter((a) => !ids.has(a.id))], serverFor: null });
  logEvent('auto_apply_started', { asked: planned.length });
  runCv = cv;
  return analyze(cv, true);
}

/** A batch the person left while it was being set up: pick it up where it was. */
export async function reopenBatch(cv: StoredCv): Promise<void> {
  if (!state.queue || !['analyzing', 'awaiting_answers'].includes(state.queue.state) || state.phase.kind !== 'idle') return;
  runCv = cv;
  await analyze(cv, state.queue.state === 'analyzing');
}

/** Back out of the questions without applying: the batch is dropped, nothing was sent. */
export async function cancelBatch(): Promise<void> {
  set({ phase: { kind: 'idle' } });
  await setQueue('stopped');
  await readApps();
}

/**
 * "Save answers & apply to 16 jobs". The answers are saved to the application profile (so the
 * same thing is never asked again), every application is prepared, and the worker takes them
 * from there — whether or not this page stays open.
 */
export async function confirmBatch(given: Record<string, string>, email: string, cv: StoredCv): Promise<{ ok: boolean; error?: string }> {
  if (state.phase.kind !== 'confirm') return { ok: false, error: 'Nothing to confirm.' };
  const { plan, jobs } = state.phase;
  const clean = Object.fromEntries(Object.entries(given).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  // The email is part of the profile: employers reply there.
  let profile = rememberBatch(state.profile, [...plan.ask, ...plan.extra], clean);
  if (email.trim() && email.trim() !== state.profile.answers.email?.value) profile = { ...profile, answers: { ...profile.answers, email: { value: email.trim(), askEachTime: false, source: 'you', updatedAt: new Date().toISOString() } } };
  const saved = await saveProfile(profile);
  if (!saved.ok) return saved;
  const started = await setQueue('running', { email: email.trim(), plan: storedPlan(plan, clean) });
  if (!started.ok) return started;
  logEvent('auto_apply_answers_saved', { answers: Object.keys(clean).length, jobs: jobs.length });
  runCv = cv;
  void prepare(jobs, clean, cv);
  watch();
  return { ok: true };
}

/** Prepare the batch's applications that aren't ready yet. */
async function prepare(jobs: BatchJob[] | null, given: Record<string, string>, cv: StoredCv): Promise<void> {
  if (preparing) return;
  preparing = true;
  control = 'run';
  try {
    const todo = batchApps().filter((a) => a.status === 'queued' || a.status === 'analyzing' || a.status === 'preparing');
    if (!todo.length) return;
    const forms = jobs ? new Map(jobs.map((j) => [j.id, j.form])) : await storedForms(todo);
    const items = todo.map((app) => ({ app, job: batchJob(app, forms.get(app.id) ?? { platform: null, status: app.url ? 'live' : 'none', questions: null }) }));
    let done = 0;
    set({ phase: { kind: 'preparing', done, total: items.length } });
    await prepareBatch(items, ctxFor(cv, given), {
      move,
      docs: (app) => prepareDocs(app, { cv, profile: state.profile }),
      save: async (app, kept, answers, concepts) => {
        await supabase.rpc('apply_save', { p_id: app.id, p_cv: kept.cv, p_letter: kept.letter, p_answers: answers, p_concepts: concepts });
      },
      control: () => control,
      onUpdate: (app) => {
        put(app as App);
        if (['ready', 'needs_attention', 'blocked', 'expired', 'failed', 'already_applied'].includes(app.status)) set({ phase: { kind: 'preparing', done: ++done, total: items.length } });
      },
    });
  } catch (e) {
    set({ error: e instanceof Error ? e.message : 'Something interrupted the preparation. Nothing was lost.' });
  } finally {
    preparing = false;
    set({ phase: { kind: 'idle' } });
    void refresh();
  }
}

// --- Following the batch ------------------------------------------------------------------

let timer: number | null = null;
let ticks = 0;
async function refresh(): Promise<void> {
  await Promise.all([readApps(), ticks % 4 === 0 ? readStatus() : Promise.resolve(null)]);
  ticks += 1;
}
/** While a batch runs, follow it from the database: the worker moves the applications, not this page. */
function watch(): void {
  if (timer != null) return;
  const tick = async () => {
    await refresh();
    const q = state.queue;
    const busy = batchApps().some((a) => ['queued', 'analyzing', 'preparing', 'ready', 'submitting'].includes(a.status));
    if (!q || q.state === 'done' || q.state === 'stopped' || (!busy && !preparing)) {
      await readStatus();
      unwatch();
      if (q?.state === 'done') logEvent('auto_apply_completed', {});
      return;
    }
    // Somebody left it half prepared (a closed tab): carry on preparing here.
    if (!preparing && runCv && q.state === 'running' && batchApps().some((a) => a.status === 'queued' || a.status === 'analyzing' || a.status === 'preparing')) {
      void prepare(null, q.plan?.given ?? {}, runCv);
    }
    timer = window.setTimeout(tick, document.visibilityState === 'hidden' ? 15000 : 3500);
  };
  timer = window.setTimeout(tick, 1500);
}
function unwatch(): void {
  if (timer != null) window.clearTimeout(timer);
  timer = null;
}

export async function pause(): Promise<void> {
  control = 'pause';
  logEvent('auto_apply_paused');
  await setQueue('paused', { reason: 'you' });
}
export async function resume(cv: StoredCv): Promise<void> {
  runCv = cv;
  control = 'run';
  await setQueue('running');
  watch();
}
export async function stop(): Promise<void> {
  control = 'stop';
  await setQueue('stopped');
  await readApps();
}

// --- One application that needs the person ----------------------------------------------------

/**
 * The person answered what one application was waiting on. Saved to the profile for next time,
 * the application's answers are worked out again, and it goes back to the worker.
 */
export async function answerAttention(app: App, values: Record<string, string>, cv: StoredCv | null): Promise<{ ok: boolean; error?: string }> {
  const filled = Object.entries(values).filter(([, v]) => v.trim());
  if (!filled.length) return { ok: false, error: 'Answer the question first.' };
  // Save: a concept to the profile, a country concept for its country, an employer's own question by its words.
  const profile: ApplyProfile = { answers: { ...state.profile.answers }, custom: { ...state.profile.custom }, byCountry: { ...(state.profile.byCountry ?? {}) } };
  const now = new Date().toISOString();
  const extra: Answer[] = [];
  for (const [id, raw] of filled) {
    const value = raw.trim();
    const need = app.needs.find((n) => n.id === id);
    if (!need) continue;
    const key = need.key ?? classifyQuestion(need.label);
    const ans = { value, askEachTime: false, source: 'you' as const, question: need.label, updatedAt: now };
    const [base, scope] = id.split('@');
    if ((key === 'sponsorship' || key === 'work_authorization') && (scope || app.cc)) {
      const cc = (scope?.split('#')[0] || app.cc || '').toUpperCase();
      profile.byCountry![cc] = { ...(profile.byCountry![cc] ?? {}), [key]: ans };
    } else if (key && key !== 'demographic' && key !== 'consent' && key !== 'previously_employed' && !id.includes('#')) {
      profile.answers[key] = { ...ans, askEachTime: Boolean(state.profile.answers[key]?.askEachTime) };
    } else if (!key) {
      profile.custom[base.startsWith('custom:') ? base.slice(7) : questionId(need.label)] = ans;
    }
    // Exactly this question on this form, as the person answered it.
    extra.push({ id, label: need.label, value, source: 'you', key });
  }
  const saved = await saveProfile(profile);
  if (!saved.ok) return saved;

  // Answer once: every other application in this batch waiting on the same question goes too.
  const sameQuestion = (n: Needed, m: Needed) => (n.key && n.key === m.key && !n.id.includes('#')) || questionId(n.label) === questionId(m.label);
  const answered = app.needs.filter((n) => values[n.id]?.trim());
  const others = state.apps.filter((a) => a.id !== app.id && a.queueId === app.queueId && a.status === 'needs_attention' && a.needs.length > 0 && a.needs.every((m) => answered.some((n) => sameQuestion(n, m))));
  const given: Record<string, string> = { ...(state.queue?.plan?.given ?? {}), ...Object.fromEntries(filled.map(([k, v]) => [k, v.trim()])) };
  for (const target of [app, ...others]) {
    const mine = target === app ? extra : target.needs.map((m) => ({ id: m.id, label: m.label, value: values[answered.find((n) => sameQuestion(n, m))!.id].trim(), source: 'you', key: m.key ?? classifyQuestion(m.label) }));
    if (cv) await reanswer(target, given, mine, cv);
    const r = await move(target.id, 'ready');
    if (!r.ok && target === app) return { ok: false, error: r.message };
  }
  if (state.queue && state.queue.state !== 'running') await setQueue('running');
  watch();
  return { ok: true };
}

/** Work an application's answers out again (after the person answered something), and keep them with it. */
async function reanswer(app: App, given: Record<string, string>, extra: Answer[], cv: StoredCv): Promise<void> {
  const forms = await storedForms([app]);
  const job = batchJob(app, forms.get(app.id) ?? { platform: app.platform ?? null, status: 'live', questions: null });
  const ctx = ctxFor(cv, given);
  const answers = [...answersFor(job, ctx)];
  for (const e of extra) if (!answers.some((a) => a.id === e.id || a.label === e.label)) answers.push(e);
  await supabase.rpc('apply_save', { p_id: app.id, p_cv: null, p_letter: null, p_answers: answers, p_concepts: conceptAnswers(job, ctx) });
}

/** "Let MadeVisa try again" — one that failed, was blocked, or stopped at a CAPTCHA. */
export async function retry(app: App): Promise<{ ok: boolean; error?: string }> {
  const r = await move(app.id, 'ready');
  if (!r.ok) return { ok: false, error: r.message };
  if (state.queue && state.queue.id === app.queueId && state.queue.state !== 'running') await setQueue('running');
  watch();
  return { ok: true };
}

/** "I submitted it myself" — on the employer's site, by the person. Submitted, never verified. */
export async function markSent(app: App): Promise<MoveResult> {
  const r = await move(app.id, 'submitted', { confirmation: { kind: 'self' } });
  void readStatus();
  return r;
}
export const skip = (app: App) => move(app.id, 'skipped', { reason: 'You chose to skip this one.', code: 'you' });

// --- What was used (the receipt) ----------------------------------------------------------

export type Receipt = {
  cv: { name: string; content: string; lines: { kind: 'name' | 'contact' | 'headline' | 'heading' | 'text' | 'bullet'; text: string }[]; changes: string[] } | null;
  letter: { name: string; content: string } | null;
  answers: { label: string; value: string; source: string }[];
  outcomes: { stage: string; at: string; source: string }[];
  /** The exact file the worker attached, and its fingerprint. */
  file: { path: string; sha256: string | null } | null;
};
export async function fetchReceipt(appId: string): Promise<Receipt> {
  const [docs, answers, outcomes, file] = await Promise.all([
    supabase.from('application_documents').select('kind, name, content, meta').eq('application_id', appId),
    supabase.from('application_answers').select('label, value, source').eq('application_id', appId).order('id'),
    supabase.from('application_outcomes').select('stage, at, source').eq('application_id', appId).order('at'),
    supabase.from('job_applications').select('cv_path, cv_sha256').eq('id', appId).maybeSingle(),
  ]);
  const rows = (docs.data ?? []) as { kind: string; name: string; content: string; meta: { lines?: Receipt['cv'] extends null ? never : NonNullable<Receipt['cv']>['lines']; changes?: string[] } | null }[];
  const cv = rows.find((d) => d.kind === 'cv');
  const letter = rows.find((d) => d.kind === 'cover_letter');
  const f = file.data as { cv_path: string | null; cv_sha256: string | null } | null;
  return {
    cv: cv ? { name: cv.name, content: cv.content, lines: cv.meta?.lines ?? [], changes: cv.meta?.changes ?? [] } : null,
    letter: letter ? { name: letter.name, content: letter.content } : null,
    answers: (answers.data ?? []) as Receipt['answers'],
    outcomes: (outcomes.data ?? []) as Receipt['outcomes'],
    file: f?.cv_path ? { path: f.cv_path, sha256: f.cv_sha256 } : null,
  };
}

/** A short-lived link to a file the worker kept (the CV it attached, the confirmation screenshot). */
export async function fileLink(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('application-files').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export const STAGES = ['viewed', 'response', 'interview', 'assessment', 'final_round', 'offer', 'rejected', 'withdrawn'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage | 'applied', string> = { applied: 'Applied', viewed: 'Viewed', response: 'Recruiter response', interview: 'Interview', assessment: 'Assessment', final_round: 'Final round', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn' };

export async function recordOutcome(appId: string, stage: Stage, on: boolean): Promise<Receipt['outcomes'] | null> {
  const { data, error } = await supabase.rpc('apply_outcome', { p_id: appId, p_stage: stage, p_on: on });
  return error ? null : ((data ?? []) as Receipt['outcomes']);
}

/** Every outcome on the person's applications, for the funnel line. */
export async function fetchOutcomes(): Promise<{ application_id: string; stage: string }[]> {
  const { data } = await supabase.from('application_outcomes').select('application_id, stage').limit(2000);
  return (data ?? []) as { application_id: string; stage: string }[];
}

// --- The hook -------------------------------------------------------------------------

export function useAutoApply(cv: StoredCv | null): State & { refresh: () => Promise<void> } {
  const { user, profile, loading } = useAuth();
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (loading) return;
    if (user) void load(user.id, profile, user.email ?? null, cv?.text ?? null);
    else {
      reset();
      // Guests: is the feature there at all, and what comes with each plan.
      if (state.available == null) void readStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading]);
  useEffect(() => {
    if (cv) runCv = cv;
  }, [cv]);
  return { ...s, refresh: async () => void (await Promise.all([readStatus(), readApps()])) };
}
